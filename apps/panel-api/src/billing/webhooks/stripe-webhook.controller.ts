import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { RawResponse } from "../../common/decorators/raw-response.decorator";
import { BillingService } from "../billing.service";
import {
  StripeGateway,
  StripeEvent,
  StripeInvoice,
  StripeCharge,
  StripeCheckoutSession,
  StripePaymentIntent,
  StripeMetadata,
} from "../gateways/stripe.gateway";

/**
 * Receives Stripe webhook callbacks. The route is mounted with `express.raw`
 * (see main.ts) so `req.body` is the raw Buffer needed for signature
 * verification. The endpoint is @Public (authenticated by signature, not JWT)
 * and @RawResponse (no `{ success, data }` envelope).
 */
@ApiExcludeController()
@Controller("billing/webhooks")
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly stripe: StripeGateway,
  ) {}

  @Post("stripe")
  @Public()
  @RawResponse()
  @HttpCode(200)
  async handle(
    @Req() req: Request,
    @Headers("stripe-signature") signature: string,
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new BadRequestException("Missing stripe-signature header");
    }

    let event: StripeEvent;
    try {
      // req.body is a Buffer because main.ts mounts express.raw on this path.
      event = await this.stripe.verifyWebhook(req.body as Buffer, signature);
    } catch (err) {
      const e = err as Error;
      this.logger.warn(
        `Stripe webhook signature verification failed: ${e.message}`,
      );
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
      // Stripe emits BOTH invoice.paid and invoice.payment_succeeded for a paid
      // invoice; handle them identically (markInvoicePaid is idempotent).
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        // The Stripe Invoice object carries our linkage via metadata.invoiceId
        // (set in createCheckoutSession/charge) or the `id`. We resolve our
        // invoice by metadata first, then by gatewayInvoiceId.
        const obj = event.data.object as StripeInvoice & {
          payment_intent?: string;
        };
        const invoice = await this.resolveInvoice(obj);
        if (!invoice) return;
        await this.billing.markInvoicePaid(invoice.id, {
          gateway: "stripe",
          gatewayRef:
            (typeof obj.payment_intent === "string"
              ? obj.payment_intent
              : undefined) ??
            obj.id ??
            "",
          amountMinor: obj.amount_paid ?? undefined,
          currency: obj.currency?.toUpperCase(),
          gatewayInvoiceId: obj.id,
        });
        break;
      }

      // The primary signal for a one-off order checkout. The session carries our
      // metadata.invoiceId and the resulting payment_intent id.
      case "checkout.session.completed": {
        const obj = event.data.object as StripeCheckoutSession;
        if (obj.payment_status && obj.payment_status === "unpaid") return;
        const invoice = await this.resolveInvoice({
          id: obj.id,
          metadata: obj.metadata,
        });
        if (!invoice) return;
        await this.billing.markInvoicePaid(invoice.id, {
          gateway: "stripe",
          gatewayRef:
            (typeof obj.payment_intent === "string"
              ? obj.payment_intent
              : undefined) ??
            obj.id ??
            "",
          amountMinor: obj.amount_total ?? undefined,
          currency: obj.currency?.toUpperCase(),
        });
        break;
      }

      // Belt-and-braces: only acts when the intent carries our metadata.invoiceId
      // (otherwise the invoice.*/checkout events already settled it). Idempotent.
      case "payment_intent.succeeded": {
        const obj = event.data.object as StripePaymentIntent;
        if (!obj.metadata?.invoiceId) return;
        const invoice = await this.resolveInvoice({ metadata: obj.metadata });
        if (!invoice) return;
        await this.billing.markInvoicePaid(invoice.id, {
          gateway: "stripe",
          gatewayRef: obj.id ?? "",
          amountMinor: obj.amount_received ?? undefined,
          currency: obj.currency?.toUpperCase(),
        });
        break;
      }

      case "invoice.payment_failed":
      case "charge.failed": {
        // invoice.payment_failed's object is a Stripe Invoice (id = in_…);
        // charge.failed's is a Charge (id = ch_…) that carries our
        // metadata.invoiceId (copied from the PaymentIntent) and/or a Stripe
        // `invoice` id. resolveInvoice prefers metadata, then the Stripe invoice
        // id — it deliberately does NOT treat a charge id as an invoice lookup.
        const obj = event.data.object as
          StripeInvoice | (StripeCharge & { invoice?: string });
        const invoice = await this.resolveInvoice(obj);
        if (!invoice) {
          this.logger.warn(
            `Stripe ${event.type} could not be mapped to an invoice (id=${obj.id ?? "n/a"}); ignoring`,
          );
          return;
        }
        const reason =
          ("failure_message" in obj && obj.failure_message) ||
          ("last_finalization_error" in obj &&
            obj.last_finalization_error?.message) ||
          `Stripe ${event.type}`;
        await this.billing.handlePaymentFailure(invoice.id, String(reason), {
          gateway: "stripe",
          gatewayRef: obj.id ?? "",
        });
        break;
      }

      // A refund issued in the Stripe dashboard (or a dispute/chargeback) must
      // revoke entitlement (P0-G). These objects carry only the gateway payment
      // ref, so resolve our invoice via metadata first, then by the stored
      // PaymentIntent/charge ref. refundExternalPayment is idempotent (state +
      // gatewayRef guarded), so a webhook echo of our own admin refund is a
      // no-op.
      case "charge.refunded":
      case "charge.dispute.created": {
        const obj = event.data.object as StripeCharge & {
          invoice?: string;
          payment_intent?: string;
          charge?: string;
        };
        let invoice = await this.resolveInvoice(obj);
        if (!invoice) {
          const ref =
            (typeof obj.payment_intent === "string" && obj.payment_intent) ||
            (typeof obj.charge === "string" && obj.charge) ||
            obj.id ||
            "";
          const invoiceId = await this.billing
            .findInvoiceIdByPaymentRef(ref)
            .catch(() => null);
          if (invoiceId) invoice = { id: invoiceId };
        }
        if (!invoice) {
          this.logger.warn(
            `Stripe ${event.type} could not be mapped to an invoice (id=${obj.id ?? "n/a"}); ignoring`,
          );
          return;
        }
        await this.billing.refundExternalPayment(invoice.id, {
          gateway: "stripe",
          gatewayRef:
            (typeof obj.payment_intent === "string" && obj.payment_intent) ||
            obj.id ||
            "",
        });
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  /**
   * Resolve our internal Invoice from a Stripe object. Resolution order:
   *   1. our explicit metadata.invoiceId (our internal id) — most reliable,
   *   2. the persisted gatewayInvoiceId: a Stripe INVOICE (`in_…`) or checkout
   *      SESSION (`cs_…`) id.
   * A charge id (`ch_…`) is never a gatewayInvoiceId, so it is NOT used as a
   * lookup key — charge.* events must carry metadata.invoiceId to be actionable.
   * All ids are trimmed and blanks are ignored.
   */
  private async resolveInvoice(obj: {
    id?: string;
    invoice?: string;
    metadata?: StripeMetadata | null;
  }): Promise<{ id: string } | null> {
    const metadataInvoiceId = obj.metadata?.invoiceId?.trim();
    if (metadataInvoiceId) {
      return this.billing
        .getInvoiceByGatewayId(metadataInvoiceId, { byInternalId: true })
        .catch(() => null);
    }

    // Prefer an attached Stripe invoice id (`obj.invoice`) over `obj.id`, so a
    // Charge tied to a Stripe invoice still resolves; skip charge ids.
    const gatewayInvoiceId = (obj.invoice ?? obj.id ?? "").trim();
    if (!gatewayInvoiceId || gatewayInvoiceId.startsWith("ch_")) return null;
    return this.billing
      .getInvoiceByGatewayId(gatewayInvoiceId)
      .catch(() => null);
  }
}
