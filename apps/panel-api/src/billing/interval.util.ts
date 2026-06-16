import { BillingInterval } from '@prisma/client';

/**
 * Day-based terms (shorter than a month) are stepped by exact days; month-based
 * terms below are month-stepped so renewals keep their day-of-month.
 */
const INTERVAL_DAYS: Partial<Record<BillingInterval, number>> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
};

/**
 * Number of whole months each month-based billing interval spans. Period
 * arithmetic is month-stepped (rather than fixed day counts) so renewals land on
 * the same day-of-month and naturally handle 28/29/30/31-day months. Day-based
 * terms (weekly/biweekly) use INTERVAL_DAYS instead.
 */
const INTERVAL_MONTHS: Record<BillingInterval, number> = {
  WEEKLY: 0,
  BIWEEKLY: 0,
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
  const days = INTERVAL_DAYS[interval];
  if (days) {
    const r = new Date(date.getTime());
    r.setUTCDate(r.getUTCDate() + days);
    return r;
  }

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
  const days = INTERVAL_DAYS[interval];
  if (days) return days / 30;
  return INTERVAL_MONTHS[interval];
}
