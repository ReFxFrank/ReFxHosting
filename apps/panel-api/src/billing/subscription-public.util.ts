import { Prisma } from "@prisma/client";

/**
 * Owner-safe Subscription projection for customer routes that return the row
 * itself (POST /billing/subscriptions, cancel/resume, the dashboard summary).
 * Mirrors what BillingService.listSubscriptions hand-picks and deliberately
 * excludes the processor linkage (`gatewaySubId` — `gateway` is just the
 * processor NAME, already shown to the owner on the billing page), the
 * `attribution` acquisition JSON, the admin comp flag and internal reminder
 * bookkeeping.
 */
export const SUBSCRIPTION_PUBLIC_SELECT = {
  id: true,
  productId: true,
  priceId: true,
  hardwareTierId: true,
  interval: true,
  slots: true,
  expressBackups: true,
  state: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  autoRenew: true,
  gateway: true,
  createdAt: true,
} as const satisfies Prisma.SubscriptionSelect;

/** The subscription shape customer-facing subscription routes return. */
export type PublicSubscription = Prisma.SubscriptionGetPayload<{
  select: typeof SUBSCRIPTION_PUBLIC_SELECT;
}>;
