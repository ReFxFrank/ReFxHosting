import { isValidCron, nextCronRun } from './cron.util';

// Vets cron-parser v5 (CronExpressionParser API) and locks in the timezone
// behavior that backup scheduling relies on. All `from` dates are fixed — no
// Date.now() — so the assertions are deterministic.

describe('isValidCron', () => {
  it('accepts well-formed 5-field expressions and @-aliases', () => {
    expect(isValidCron('0 4 * * *')).toBe(true);
    expect(isValidCron('*/15 * * * *')).toBe(true);
    expect(isValidCron('0 0 1 * *')).toBe(true);
    expect(isValidCron('@daily')).toBe(true);
  });

  it('rejects out-of-range fields (v5 parse() is lazy — would otherwise pass)', () => {
    expect(isValidCron('99 99 * * *')).toBe(false);
    expect(isValidCron('60 24 * * *')).toBe(false);
    expect(isValidCron('0 4 * * 9')).toBe(false);
  });

  it('rejects empty and wrong-field-count input (v5 treats these as wildcards)', () => {
    expect(isValidCron('')).toBe(false);
    expect(isValidCron('   ')).toBe(false);
    expect(isValidCron('not a cron')).toBe(false);
    expect(isValidCron('0 4 * *')).toBe(false); // 4 fields
    expect(isValidCron('0 4 * * * *')).toBe(false); // 6 fields
  });
});

describe('nextCronRun', () => {
  const from = new Date('2026-06-24T00:00:00Z');

  it('computes the next run in UTC by default', () => {
    const next = nextCronRun('0 4 * * *', from);
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe('2026-06-24T04:00:00.000Z');
  });

  it('interprets cron fields in the given IANA timezone', () => {
    // 4am in New York (EDT = UTC-4 on this June date) is 08:00 UTC.
    const next = nextCronRun('0 4 * * *', from, 'America/New_York');
    expect(next!.getUTCHours()).toBe(8);
    expect(next!.toISOString()).toBe('2026-06-24T08:00:00.000Z');
  });

  it('falls back to UTC when the timezone is invalid (schedule still advances)', () => {
    const next = nextCronRun('0 4 * * *', from, 'Not/ARealZone');
    expect(next!.toISOString()).toBe('2026-06-24T04:00:00.000Z');
  });

  it('returns null for an unparseable expression', () => {
    expect(nextCronRun('nope', from)).toBeNull();
  });
});
