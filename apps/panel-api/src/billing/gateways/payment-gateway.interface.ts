import { Invoice } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';

/**
 * DI token for the active payment gateway. Bound to StripeGateway by default in
 * billing.module.ts; PayPalGateway is available for per-call routing.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Result of attempting to charge a payment method against an invoice. */
export interface ChargeResult {
  /** Processor reference for the charge (e.g. PaymentIntent / capture id). */
  gatewayRef: string;
  success: boolean;
  /** Human-readable reason when success === false. */
  failureReason?: string;
}

/** Minimal user shape needed to create/lookup a processor customer. */
export interface GatewayUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface CheckoutSessionParams {
  invoice: Invoice;
  /** URL to redirect to on success / cancel. */
  successUrl: string;
  cancelUrl: string;
  /** Optional processor customer reference. */
  customerRef?: string;
}

export interface CheckoutSessionResult {
  /** Processor session id. */
  sessionId: string;
  /** Hosted checkout URL the client should be redirected to. */
  url: string;
}

/**
 * Common surface every payment processor implements so BillingService can stay
 * gateway-agnostic. `user` is intentionally loose (AuthUser | GatewayUser).
 */
export interface PaymentGateway {
  /** Stable identifier persisted on rows: "stripe" | "paypal". */
  readonly name: string;

  /** Create (or fetch) the processor-side customer; returns its reference. */
  createCustomer(user: GatewayUser | AuthUser): Promise<string>;

  /** Attempt to charge an invoice against a stored payment-method reference. */
  charge(invoice: Invoice, paymentMethodRef: string): Promise<ChargeResult>;

  /** Build a hosted checkout session for an invoice. */
  createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult>;
}
