/**
 * Build a human-readable, year-scoped invoice number, e.g. `INV-2026-000123`.
 * The numeric sequence is zero-padded to 6 digits.
 *
 * @param prefix   Configured prefix (config.billing.invoiceNumberPrefix), e.g. "INV".
 * @param year     Four-digit calendar year the invoice belongs to.
 * @param sequence 1-based sequence within that year.
 */
export function generateInvoiceNumber(
  prefix: string,
  year: number,
  sequence: number,
): string {
  const safePrefix = (prefix || 'INV').trim();
  const seq = Math.max(1, Math.floor(sequence));
  return `${safePrefix}-${year}-${String(seq).padStart(6, '0')}`;
}
