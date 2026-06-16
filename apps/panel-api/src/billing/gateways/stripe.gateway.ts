import { Injectable, Logger } from '@nestjs/common';
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
type CheckoutSessionCreateParams = Parameters<
  StripeClient['checkout']['sessions']['create']
>[0];
type CheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['create']>
>;
export type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;
export type StripeInvoice = Awaited<
  ReturnType<StripeClient['invoices']['retrieve']>
>;
export type StripeCharge = Awaited<
  ReturnType<StripeClient['charges']['retrieve']>
>;
export type StripeCheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['retrieve']>
>;
export type StripePaymentIntent = Awaited<
  ReturnType<StripeClient['paymentIntents']['retrieve']>
>;
type StripeSetupIntent = Awaited<
  ReturnType<StripeClient['setupIntents']['create']>
>;
type StripePaymentMethod = Awaited<
  ReturnType<StripeClient['paymentMethods']['retrieve']>
>;
export type StripeMetadata = StripeInvoice['metadata'];
export type StripeError = InstanceType<typeof Stripe.errors.StripeError> & {
  payment_intent?: { id?: string };
};
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { SettingsService } from '../../platform/settings.service';
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
  private cachedKey = '';
  private cachedClient: StripeClient | null = null;

  constructor(private readonly settings: SettingsService) {}

  /**
   * Build (and cache) a Stripe client from the current effective secret key
   * (owner-edited DB setting → env fallback), so key changes take effect without
   * a restart. A placeholder is used when unconfigured so the app stays inert
   * rather than crashing.
   */
  private async client(): Promise<StripeClient> {
    const { secretKey } = await this.settings.stripeConfig();
    const key = secretKey || 'sk_test_unconfigured';
    if (!this.cachedClient || key !== this.cachedKey) {
      if (!secretKey) {
        this.logger.warn(
          'Stripe secret key is not set — inert mode (no live charges). ' +
            'Configure it under Payments or set STRIPE_SECRET_KEY.',
        );
      }
      this.cachedClient = new Stripe(key, {
        // Pin the API version the SDK major targets; bump deliberately when
        // upgrading the SDK (stripe-node v22 → 2026-05-27.dahlia).
        apiVersion: '2026-05-27.dahlia',
        typescript: true,
      });
      this.cachedKey = key;
    }
    return this.cachedClient;
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
    const stripe = await this.client();
    const customer = await stripe.customers.create({
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
    customerRef?: string,
  ): Promise<ChargeResult> {
    try {
      const stripe = await this.client();
      const intent = await stripe.paymentIntents.create({
        // Charge the outstanding balance (total minus any credit already applied,
        // e.g. a gift card).
        amount: Math.max(0, invoice.totalMinor - (invoice.amountPaidMinor ?? 0)),
        currency: invoice.currency.toLowerCase(),
        payment_method: paymentMethodRef,
        confirm: true,
        off_session: true,
        // The saved PaymentMethod belongs to the customer; off-session reuse at
        // renewal requires the owning customer to be attached.
        ...(customerRef ? { customer: customerRef } : {}),
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

  /**
   * Create a SetupIntent to collect + save a card for future off-session
   * charges. The browser confirms it with the returned client_secret; the saved
   * PaymentMethod is attached to `customerRef`.
   */
  async createSetupIntent(
    customerRef: string,
  ): Promise<{ clientSecret: string; setupIntentId: string }> {
    const stripe = await this.client();
    const intent: StripeSetupIntent = await stripe.setupIntents.create({
      customer: customerRef,
      usage: 'off_session',
      payment_method_types: ['card'],
    });
    return { clientSecret: intent.client_secret ?? '', setupIntentId: intent.id };
  }

  /**
   * Resolve a confirmed SetupIntent into the saved PaymentMethod's details, so
   * the caller can persist it. Returns null when not yet succeeded.
   */
  async getSavedPaymentMethod(setupIntentId: string): Promise<{
    customerId: string;
    paymentMethodId: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  } | null> {
    const stripe = await this.client();
    const si = await stripe.setupIntents.retrieve(setupIntentId);
    if (si.status !== 'succeeded' || !si.payment_method) return null;
    const pmId =
      typeof si.payment_method === 'string'
        ? si.payment_method
        : si.payment_method.id;
    const customerId =
      typeof si.customer === 'string' ? si.customer : (si.customer?.id ?? '');
    const pm: StripePaymentMethod = await stripe.paymentMethods.retrieve(pmId);
    return {
      customerId,
      paymentMethodId: pmId,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
    };
  }

  /** Detach a saved PaymentMethod from the customer (on removal). Best-effort. */
  async detachPaymentMethod(paymentMethodRef: string): Promise<void> {
    try {
      const stripe = await this.client();
      await stripe.paymentMethods.detach(paymentMethodRef);
    } catch (err) {
      this.logger.warn(
        `Stripe detach failed for ${paymentMethodRef}: ${(err as Error).message}`,
      );
    }
  }

  /** Create a hosted Checkout Session for the invoice total. */
  async createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const { invoice, successUrl, cancelUrl, customerRef } = params;

    // TODO(impl): prefer line-item mode mapping each InvoiceLineItem to a
    // Stripe price/price_data entry; this single line collapses to the total.
    const stripe = await this.client();
    const { statementDescriptor } = await this.settings.stripeConfig();
    const base: CheckoutSessionCreateParams = {
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
            // Outstanding balance (total minus any applied credit, e.g. gift card).
            unit_amount: Math.max(0, invoice.totalMinor - (invoice.amountPaidMinor ?? 0)),
            product_data: { name: `Invoice ${invoice.number}` },
          },
        },
      ],
      metadata: { invoiceId: invoice.id },
    };

    // Brand the customer's bank/card statement. Card Checkout requires
    // `statement_descriptor_suffix` (the plain `statement_descriptor` is rejected
    // for cards in current API versions). If Stripe still rejects it for any
    // reason, retry WITHOUT it so checkout never breaks over branding.
    let session: CheckoutSession;
    if (statementDescriptor) {
      try {
        session = await stripe.checkout.sessions.create({
          ...base,
          payment_intent_data: { statement_descriptor_suffix: statementDescriptor },
        });
      } catch (err) {
        this.logger.warn(
          `Stripe rejected statement descriptor; retrying without it: ${(err as Error).message}`,
        );
        session = await stripe.checkout.sessions.create(base);
      }
    } else {
      session = await stripe.checkout.sessions.create(base);
    }

    return { sessionId: session.id, url: session.url ?? '' };
  }

  /**
   * Verify and decode a Stripe webhook using the raw request body and the
   * `stripe-signature` header. Throws on invalid signatures.
   */
  async verifyWebhook(rawBody: Buffer, signature: string): Promise<StripeEvent> {
    const { webhookSecret } = await this.settings.stripeConfig();
    const stripe = await this.client();
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
