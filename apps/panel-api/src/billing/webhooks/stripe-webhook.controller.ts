import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { BillingService } from '../billing.service';
import {
  StripeGateway,
  StripeEvent,
  StripeInvoice,
  StripeCharge,
  StripeMetadata,
} from '../gateways/stripe.gateway';

/**
 * Receives Stripe webhook callbacks. The route is mounted with `express.raw`
 * (see main.ts) so `req.body` is the raw Buffer needed for signature
 * verification. The endpoint is @Public (authenticated by signature, not JWT)
 * and @RawResponse (no `{ success, data }` envelope).
 */
@ApiExcludeController()
@Controller('billing/webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly stripe: StripeGateway,
  ) {}

  @Post('stripe')
  @Public()
  @RawResponse()
  @HttpCode(200)
  async handle(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: StripeEvent;
    try {
      // req.body is a Buffer because main.ts mounts express.raw on this path.
      event = await this.stripe.verifyWebhook(req.body as Buffer, signature);
    } catch (err) {
      const e = err as Error;
      this.logger.warn(`Stripe webhook signature verification failed: ${e.message}`);
      throw new BadRequestException(`Webhook Error: ${e.message}`);
    }

    try {
      await this.dispatch(event);
    } catch (err) {
      // Log and still 200 to avoid Stripe retry storms on our own bugs; the
      // event is recorded and can be replayed from the dashboard if needed.
      this.logger.error(
        `Error handling Stripe event ${event.type} (${event.id}): ${(err as Error).message}`,
      );
    }

    return { received: true };
  }

  /** Route a verified event to the appropriate billing action. */
  private async dispatch(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        // TODO(impl): the Stripe Invoice object shape carries our linkage via
        // metadata.invoiceId (set in createCheckoutSession/charge) or the
        // `number`/`id`. Here we resolve our invoice by gatewayInvoiceId.
        const obj = event.data.object as StripeInvoice & {
          payment_intent?: string;
        };
        const invoice = await this.resolveInvoice(obj);
        if (!invoice) return;
        await this.billing.markInvoicePaid(invoice.id, {
          gateway: 'stripe',
          gatewayRef:
            (typeof obj.payment_intent === 'string'
              ? obj.payment_intent
              : undefined) ?? obj.id ?? '',
          amountMinor: obj.amount_paid ?? undefined,
          currency: obj.currency?.toUpperCase(),
          gatewayInvoiceId: obj.id,
        });
        break;
      }

      case 'invoice.payment_failed':
      case 'charge.failed': {
        // TODO(impl): for charge.failed the object is a Charge, not an Invoice;
        // map via charge.invoice / metadata. Both branches resolve our invoice.
        const obj = event.data.object as
          | StripeInvoice
          | (StripeCharge & { invoice?: string });
        const invoice = await this.resolveInvoice(obj);
        if (!invoice) return;
        const reason =
          ('failure_message' in obj && obj.failure_message) ||
          ('last_finalization_error' in obj &&
            obj.last_finalization_error?.message) ||
          `Stripe ${event.type}`;
        await this.billing.handlePaymentFailure(invoice.id, String(reason), {
          gateway: 'stripe',
          gatewayRef: obj.id ?? '',
        });
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  /**
   * Resolve our internal Invoice from a Stripe object. Prefers the explicit
   * metadata.invoiceId we attach; falls back to gatewayInvoiceId (the Stripe id).
   * TODO(impl): index/lookup is intentionally minimal; harden against missing ids.
   */
  private async resolveInvoice(obj: {
    id?: string;
    invoice?: string;
    metadata?: StripeMetadata | null;
  }): Promise<{ id: string } | null> {
    const metadataInvoiceId = obj.metadata?.invoiceId;
    if (metadataInvoiceId) {
      return this.billing
        .getInvoiceByGatewayId(metadataInvoiceId, { byInternalId: true })
        .catch(() => null);
    }

    const gatewayInvoiceId = obj.id ?? obj.invoice;
    if (!gatewayInvoiceId) return null;
    return this.billing
      .getInvoiceByGatewayId(gatewayInvoiceId)
      .catch(() => null);
  }
}
