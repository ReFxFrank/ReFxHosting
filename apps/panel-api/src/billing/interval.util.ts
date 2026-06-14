import { BillingInterval } from '@prisma/client';

/**
 * Number of whole months each billing interval spans. Period arithmetic is done
 * by month-stepping (rather than fixed day counts) so renewals land on the same
 * day-of-month and naturally handle 28/29/30/31-day months.
 */
const INTERVAL_MONTHS: Record<BillingInterval, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

/**
 * Add a billing interval to a date, returning a new Date. Clamps the day-of-month
 * when the target month is shorter (e.g. Jan 31 + 1 month => Feb 28/29).
 */
export function addInterval(date: Date, interval: BillingInterval): Date {
  const months = INTERVAL_MONTHS[interval];
  if (months === undefined) {
    throw new Error(`Unknown billing interval: ${interval}`);
  }

  const result = new Date(date.getTime());
  const day = result.getUTCDate();

  // Move to the first of the month before shifting to avoid overflow, then clamp.
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, daysInTargetMonth));

  return result;
}

/** Convenience: months spanned by an interval (used for proration, reporting). */
export function intervalMonths(interval: BillingInterval): number {
  return INTERVAL_MONTHS[interval];
}
