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
import { SubscriptionState } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { BillingService } from '../billing.service';
import { PayPalGateway } from '../gateways/paypal.gateway';

/**
 * Receives PayPal webhook callbacks (refunds/disputes/async capture results).
 * The route is mounted with `express.raw` (see main.ts); authenticity is checked
 * against the configured webhook id via PayPal's verify-webhook-signature API.
 * @Public (verified by signature, not JWT) and @RawResponse (no envelope).
 */
@ApiExcludeController()
@Controller('billing/webhooks')
export class PayPalWebhookController {
  private readonly logger = new Logger(PayPalWebhookController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly paypal: PayPalGateway,
  ) {}

  @Post('paypal')
  @Public()
  @RawResponse()
  @HttpCode(200)
  async handle(
    @Req() req: Request,
    @Headers() headers: Record<string, string | undefined>,
  ): Promise<{ received: boolean }> {
    let event: { event_type: string; resource: Record<string, any> };
    try {
      event = await this.paypal.verifyWebhook(headers, req.body as Buffer);
    } catch (err) {
      this.logger.warn(`PayPal webhook verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Webhook verification failed');
    }

    try {
      await this.dispatch(event);
    } catch (err) {
      // Log and still 200 so PayPal doesn't retry-storm on our own bugs.
      this.logger.error(
        `Error handling PayPal event ${event.event_type}: ${(err as Error).message}`,
      );
    }
    return { received: true };
  }

  private async dispatch(event: {
    event_type: string;
    resource: Record<string, any>;
  }): Promise<void> {
    const r = event.resource ?? {};
    const invoiceId: string | undefined = r.custom_id;
    const captureId: string | undefined = r.id;
    const amountMinor = r.amount?.value
      ? Math.round(parseFloat(r.amount.value) * 100)
      : undefined;
    const currency: string | undefined = r.amount?.currency_code;

    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        if (!invoiceId) return;
        await this.billing.settleExternalPayment(invoiceId, {
          gateway: 'paypal',
          gatewayRef: captureId ?? '',
          amountMinor,
          currency,
        });
        break;
      }
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED': {
        if (!invoiceId) return;
        await this.billing.failExternalPayment(
          invoiceId,
          `PayPal ${event.event_type}`,
          { gateway: 'paypal', gatewayRef: captureId ?? '' },
        );
        break;
      }
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        if (!invoiceId) return;
        await this.billing.refundExternalPayment(invoiceId, {
          gateway: 'paypal',
          gatewayRef: captureId ?? '',
          amountMinor,
          currency,
        });
        break;
      }

      // Recurring subscription payment: PayPal auto-billed a cycle. The SALE
      // resource carries the subscription id in `billing_agreement_id` and the
      // amount under `amount.total` (different shape from captures).
      case 'PAYMENT.SALE.COMPLETED': {
        const paypalSubId: string | undefined = r.billing_agreement_id;
        if (!paypalSubId) return; // not a subscription sale
        await this.billing.settlePayPalRecurringPayment(paypalSubId, {
          saleId: r.id ?? '',
          amountMinor: r.amount?.total
            ? Math.round(parseFloat(r.amount.total) * 100)
            : undefined,
          currency: r.amount?.currency,
        });
        break;
      }

      // Subscription lifecycle → mirror onto our subscription.
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        if (r.id) await this.billing.applyPayPalSubscriptionState(r.id, SubscriptionState.CANCELED);
        break;
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        if (r.id) await this.billing.applyPayPalSubscriptionState(r.id, SubscriptionState.SUSPENDED);
        break;
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        if (r.id) await this.billing.applyPayPalSubscriptionState(r.id, SubscriptionState.EXPIRED);
        break;

      default:
        this.logger.debug(`Unhandled PayPal event: ${event.event_type}`);
    }
  }
}
