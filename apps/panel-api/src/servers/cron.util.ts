import parser from 'cron-parser';

/** True if `expr` is a parseable 5-field cron expression. */
export function isValidCron(expr: string): boolean {
  try {
    parser.parseExpression(expr, { tz: 'UTC' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Next UTC run time for a cron expression strictly after `from` (default now).
 * Returns null when the expression is invalid.
 */
export function nextCronRun(expr: string, from: Date = new Date()): Date | null {
  try {
    return parser
      .parseExpression(expr, { currentDate: from, tz: 'UTC' })
      .next()
      .toDate();
  } catch {
    return null;
  }
}
