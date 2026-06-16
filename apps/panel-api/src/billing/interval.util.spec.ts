import { addInterval, intervalMonths } from './interval.util';

describe('interval.util', () => {
  describe('intervalMonths', () => {
    it('maps each interval to its month span', () => {
      expect(intervalMonths('MONTHLY')).toBe(1);
      expect(intervalMonths('QUARTERLY')).toBe(3);
      expect(intervalMonths('SEMIANNUAL')).toBe(6);
      expect(intervalMonths('ANNUAL')).toBe(12);
      // Day-based terms report a fractional month span (n days / 30).
      expect(intervalMonths('WEEKLY')).toBeCloseTo(7 / 30);
      expect(intervalMonths('BIWEEKLY')).toBeCloseTo(14 / 30);
    });
  });

  describe('addInterval', () => {
    it('adds one month for MONTHLY', () => {
      const d = new Date(Date.UTC(2026, 0, 15)); // 2026-01-15
      expect(addInterval(d, 'MONTHLY').toISOString()).toBe('2026-02-15T00:00:00.000Z');
    });

    it('adds 7 days for WEEKLY (crossing the month boundary)', () => {
      const d = new Date(Date.UTC(2026, 0, 28));
      expect(addInterval(d, 'WEEKLY').toISOString()).toBe('2026-02-04T00:00:00.000Z');
    });

    it('adds 14 days for BIWEEKLY', () => {
      const d = new Date(Date.UTC(2026, 0, 10));
      expect(addInterval(d, 'BIWEEKLY').toISOString()).toBe('2026-01-24T00:00:00.000Z');
    });

    it('adds three months for QUARTERLY', () => {
      const d = new Date(Date.UTC(2026, 0, 10));
      expect(addInterval(d, 'QUARTERLY').toISOString()).toBe('2026-04-10T00:00:00.000Z');
    });

    it('adds twelve months for ANNUAL, crossing the year boundary', () => {
      const d = new Date(Date.UTC(2026, 5, 30));
      expect(addInterval(d, 'ANNUAL').toISOString()).toBe('2027-06-30T00:00:00.000Z');
    });

    it('clamps Jan 31 + 1 month to Feb 28 in a non-leap year', () => {
      const d = new Date(Date.UTC(2026, 0, 31)); // 2026 not a leap year
      expect(addInterval(d, 'MONTHLY').toISOString()).toBe('2026-02-28T00:00:00.000Z');
    });

    it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
      const d = new Date(Date.UTC(2024, 0, 31)); // 2024 is a leap year
      expect(addInterval(d, 'MONTHLY').toISOString()).toBe('2024-02-29T00:00:00.000Z');
    });

    it('does not mutate the input date', () => {
      const d = new Date(Date.UTC(2026, 0, 15));
      const before = d.getTime();
      addInterval(d, 'ANNUAL');
      expect(d.getTime()).toBe(before);
    });

    it('throws on an unknown interval', () => {
      expect(() => addInterval(new Date(), 'FORTNIGHTLY' as any)).toThrow(/Unknown billing interval/);
    });
  });
});
