import { CronExpressionParser } from 'cron-parser';

/** True if `expr` is a parseable 5-field cron expression (or an @-alias). */
export function isValidCron(expr: string): boolean {
  if (typeof expr !== 'string') return false;
  const trimmed = expr.trim();
  // cron-parser v5 is lenient about shape: it accepts an empty string and odd
  // field counts, treating missing fields as wildcards. Enforce the documented
  // contract — exactly 5 fields, or an @-alias like @daily — up front.
  if (!/^@\w+$/.test(trimmed) && trimmed.split(/\s+/).length !== 5) return false;
  try {
    // parse() is also LAZY in v5 — it doesn't validate field RANGES until the
    // expression is iterated, so force one iteration to reject out-of-range
    // fields (e.g. "99 99 * * *") rather than storing a schedule that can never
    // advance.
    CronExpressionParser.parse(trimmed, { tz: 'UTC' }).next();
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
