import { Invoice } from "@prisma/client";
import { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * DI token for the active payment gateway. Bound to StripeGateway by default in
 * billing.module.ts; PayPalGateway is available for per-call routing.
 */
export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");

/** Result of attempting to charge a payment method against an invoice. */
export interface ChargeResult {
  /** Processor reference for the charge (e.g. PaymentIntent / capture id). */
  gatewayRef: string;
  success: boolean;
  /** Human-readable reason when success === false. */
  failureReason?: string;
}

/** Result of refunding a prior charge. */
export interface RefundResult {
  /** Processor reference for the refund. */
  refundRef: string;
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

  /**
   * Refund a prior charge back to the original payment method. `amountMinor`
   * omitted = full refund; a smaller value is a partial refund. `chargeRef` is
   * the reference persisted on the SUCCEEDED Payment (a PaymentIntent id for
   * Stripe, a capture id for PayPal).
   */
  refund(
    chargeRef: string,
    amountMinor?: number,
    currency?: string,
  ): Promise<RefundResult>;

  /** Build a hosted checkout session for an invoice. */
  createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult>;
}
