import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Invoice } from '@prisma/client';

/**
 * Stripe v22 ships its rich namespace types (Event, Invoice, errors, …) only
 * through the ESM type-condition of its `exports` map. Under CommonJS
 * resolution the default import resolves to the bare constructor, so the
 * `Stripe.Event`-style namespace access no longer type-checks. We derive the
 * shapes we need from the client instance type / static members, which is
 * resolution-independent and tracks the SDK without internal path imports.
 */
type StripeClient = InstanceType<typeof Stripe>;
export type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;
export type StripeInvoice = Awaited<
  ReturnType<StripeClient['invoices']['retrieve']>
>;
export type StripeCharge = Awaited<
  ReturnType<StripeClient['charges']['retrieve']>
>;
export type StripeMetadata = StripeInvoice['metadata'];
export type StripeError = InstanceType<typeof Stripe.errors.StripeError> & {
  payment_intent?: { id?: string };
};
import { AppConfig } from '../../config/configuration';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  ChargeResult,
  CheckoutSessionParams,
  CheckoutSessionResult,
  GatewayUser,
  PaymentGateway,
} from './payment-gateway.interface';

/**
 * Stripe implementation of the PaymentGateway contract. Wraps the Stripe Node
 * SDK (v14). Customer/checkout/charge flows are wired; the deeper SDK shapes
 * that depend on account configuration are marked with TODO(impl).
 */
@Injectable()
export class StripeGateway implements PaymentGateway {
  readonly name = 'stripe';
  private readonly logger = new Logger(StripeGateway.name);
  private readonly stripe: StripeClient;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const cfg = this.config.get<AppConfig['stripe']>('stripe')!;
    this.webhookSecret = cfg.webhookSecret;
    this.stripe = new Stripe(cfg.secretKey, {
      // Pin the API version the SDK major targets; bump deliberately when
      // upgrading the SDK (stripe-node v22 → 2026-05-27.dahlia).
      apiVersion: '2026-05-27.dahlia',
      typescript: true,
    });
  }

  /** Create (or look up) a Stripe Customer for the user and return its id. */
  async createCustomer(user: GatewayUser | AuthUser): Promise<string> {
    const name = [
      (user as GatewayUser).firstName,
      (user as GatewayUser).lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    // TODO(impl): de-duplicate by searching existing customers (metadata.userId)
    // before creating, to avoid orphaned customers on retries.
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: name || undefined,
      metadata: { userId: user.id },
    });
    return customer.id;
  }

  /**
   * Charge an invoice off-session against a saved PaymentMethod. Returns a
   * normalized result rather than throwing, so the caller can record a FAILED
   * Payment + drive dunning.
   */
  async charge(
    invoice: Invoice,
    paymentMethodRef: string,
  ): Promise<ChargeResult> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: invoice.totalMinor,
        currency: invoice.currency.toLowerCase(),
        payment_method: paymentMethodRef,
        confirm: true,
        off_session: true,
        // TODO(impl): attach `customer` once we persist the Stripe customer id
        // on User/PaymentMethod, required for off_session reuse.
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number },
        description: `Invoice ${invoice.number}`,
      });

      const success = intent.status === 'succeeded';
      return {
        gatewayRef: intent.id,
        success,
        failureReason: success
          ? undefined
          : `PaymentIntent status: ${intent.status}`,
      };
    } catch (err) {
      // Stripe surfaces declines as StripeCardError (an exception in confirm).
      const e = err as StripeError;
      this.logger.warn(
        `Stripe charge failed for invoice ${invoice.id}: ${e.message}`,
      );
      return {
        gatewayRef: e.payment_intent?.id ?? '',
        success: false,
        failureReason: e.message ?? 'Unknown Stripe error',
      };
    }
  }

  /** Create a hosted Checkout Session for the invoice total. */
  async createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const { invoice, successUrl, cancelUrl, customerRef } = params;

    // TODO(impl): prefer line-item mode mapping each InvoiceLineItem to a
    // Stripe price/price_data entry; this single line collapses to the total.
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerRef,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: invoice.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: invoice.currency.toLowerCase(),
            unit_amount: invoice.totalMinor,
            product_data: { name: `Invoice ${invoice.number}` },
          },
        },
      ],
      metadata: { invoiceId: invoice.id },
    });

    return { sessionId: session.id, url: session.url ?? '' };
  }

  /**
   * Verify and decode a Stripe webhook using the raw request body and the
   * `stripe-signature` header. Throws on invalid signatures.
   */
  verifyWebhook(rawBody: Buffer, signature: string): StripeEvent {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }
}
