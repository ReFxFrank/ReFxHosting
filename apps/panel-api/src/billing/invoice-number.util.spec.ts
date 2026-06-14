import { generateInvoiceNumber } from './invoice-number.util';

describe('generateInvoiceNumber', () => {
  it('zero-pads the sequence to 6 digits and scopes by year', () => {
    expect(generateInvoiceNumber('INV', 2026, 123)).toBe('INV-2026-000123');
  });

  it('uses the provided prefix', () => {
    expect(generateInvoiceNumber('REFX', 2025, 1)).toBe('REFX-2025-000001');
  });

  it('falls back to "INV" when the prefix is empty', () => {
    expect(generateInvoiceNumber('', 2026, 7)).toBe('INV-2026-000007');
  });

  it('trims whitespace from the prefix', () => {
    expect(generateInvoiceNumber('  AB  ', 2026, 9)).toBe('AB-2026-000009');
  });

  it('clamps a sequence below 1 up to 1', () => {
    expect(generateInvoiceNumber('INV', 2026, 0)).toBe('INV-2026-000001');
    expect(generateInvoiceNumber('INV', 2026, -5)).toBe('INV-2026-000001');
  });

  it('floors fractional sequences', () => {
    expect(generateInvoiceNumber('INV', 2026, 42.9)).toBe('INV-2026-000042');
  });

  it('does not truncate sequences longer than 6 digits', () => {
    expect(generateInvoiceNumber('INV', 2026, 1234567)).toBe('INV-2026-1234567');
  });
});
