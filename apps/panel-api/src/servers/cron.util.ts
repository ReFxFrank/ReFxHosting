import { CronExpressionParser } from 'cron-parser';

/** True if `expr` is a parseable 5-field cron expression. */
export function isValidCron(expr: string): boolean {
  try {
    CronExpressionParser.parse(expr, { tz: 'UTC' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Next run time (as a UTC instant) for a cron expression strictly after `from`,
 * interpreting the cron fields in `tz` (an IANA timezone, default UTC) so a
 * "0 4 * * *" schedule fires at 4am in the owner's local time. Returns null when
 * the expression — or timezone — is invalid.
 */
export function nextCronRun(
  expr: string,
  from: Date = new Date(),
  tz = 'UTC',
): Date | null {
  try {
    return CronExpressionParser.parse(expr, { currentDate: from, tz: tz || 'UTC' })
      .next()
      .toDate();
  } catch {
    // Bad timezone? retry in UTC so a schedule still advances rather than stalls.
    try {
      return CronExpressionParser.parse(expr, { currentDate: from, tz: 'UTC' })
        .next()
        .toDate();
    } catch {
      return null;
    }
  }
}
