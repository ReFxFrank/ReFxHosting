/**
 * Tax calculation helpers for ReFx invoicing.
 *
 * Scope note: this is a pragmatic, self-contained engine covering the common
 * cases (EU VAT with B2B reverse-charge, GST for AU/NZ/IN, a small US state
 * sales-tax table). It is NOT a substitute for a full tax provider (Avalara /
 * Stripe Tax) and intentionally keeps the rate tables small and editable.
 *
 * All money is integer minor units (cents). Tax is computed on the subtotal and
 * rounded half-up to the nearest minor unit.
 */

export type TaxType = 'VAT' | 'GST' | 'US_SALES_TAX';

export interface TaxOptions {
  /**
   * Region the customer is taxed in. For VAT/GST this is the ISO 3166-1 alpha-2
   * country code (e.g. "DE"). For US sales tax this is the two-letter state code
   * (e.g. "CA"), optionally with a country of "US".
   */
  region: string;
  /** Force a tax regime; otherwise it is inferred from the region/country. */
  taxType?: TaxType;
  /** ISO country code, used to disambiguate (e.g. US states vs EU countries). */
  country?: string;
  /**
   * Customer-supplied tax id (VAT/GST number). When present and valid-looking
   * for a different EU member state, the B2B cross-border reverse-charge applies
   * and no VAT is added.
   */
  customerTaxId?: string;
  /**
   * Merchant's own country of establishment. Used to decide whether a B2B
   * transaction is "cross-border" for reverse-charge. Defaults to "IE".
   */
  merchantCountry?: string;
}

export interface TaxResult {
  /** Tax amount in integer minor units. */
  taxMinor: number;
  /** Effective rate applied, as a percentage (e.g. 19 for 19%). */
  taxRatePct: number;
  /** Regime applied, or null when no tax was charged. */
  taxType: TaxType | null;
  /** True when the liability shifts to the customer (B2B intra-EU). */
  reverseCharge: boolean;
}

/** EU VAT standard rates (subset). Keyed by ISO 3166-1 alpha-2. */
const EU_VAT_RATES: Record<string, number> = {
  AT: 20,
  BE: 21,
  DE: 19,
  DK: 25,
  ES: 21,
  FI: 24,
  FR: 20,
  IE: 23,
  IT: 22,
  LU: 17,
  NL: 21,
  PL: 23,
  PT: 23,
  SE: 25,
};

/** GST standard rates (subset). */
const GST_RATES: Record<string, number> = {
  AU: 10,
  NZ: 15,
  IN: 18,
};

/** US state sales-tax base rates (subset; local surtaxes are not modeled). */
const US_SALES_TAX_RATES: Record<string, number> = {
  CA: 7.25,
  NY: 4.0,
  TX: 6.25,
  FL: 6.0,
  WA: 6.5,
  IL: 6.25,
  // No statewide sales tax:
  OR: 0,
  MT: 0,
  NH: 0,
  DE: 0, // Delaware (note: overlaps EU "DE"; disambiguate via country = "US").
  AK: 0,
};

/** Round half-up to an integer minor unit. */
function roundMinor(value: number): number {
  return Math.round(value);
}

const ZERO_RESULT: Omit<TaxResult, 'taxType'> = {
  taxMinor: 0,
  taxRatePct: 0,
  reverseCharge: false,
};

/**
 * Loose structural validation of a VAT identification number: a 2-letter country
 * prefix followed by 2-12 alphanumeric chars. This is a format check only, not a
 * VIES existence check.
 */
function parseVatId(
  vatId: string,
): { country: string; valid: boolean } {
  const cleaned = vatId.replace(/[\s-]/g, '').toUpperCase();
  const m = /^([A-Z]{2})([A-Z0-9]{2,12})$/.exec(cleaned);
  if (!m) return { country: '', valid: false };
  // "EL" is the VAT prefix Greece uses instead of "GR".
  const country = m[1] === 'EL' ? 'GR' : m[1];
  return { country, valid: true };
}

/**
 * Calculate tax for an invoice subtotal.
 *
 * Resolution order:
 *  1. Determine the regime (explicit `taxType`, else inferred from country/region).
 *  2. For EU VAT: if a valid VAT id from a *different* EU member state is given,
 *     apply the reverse charge (0% added, liability shifts to the customer).
 *  3. Otherwise look up the rate table and compute `round(subtotal * rate/100)`.
 */
export function calculateTax(
  subtotalMinor: number,
  opts: TaxOptions,
): TaxResult {
  const region = (opts.region ?? '').trim().toUpperCase();
  const country = (opts.country ?? '').trim().toUpperCase();
  const merchantCountry = (opts.merchantCountry ?? 'IE').trim().toUpperCase();

  if (!Number.isFinite(subtotalMinor) || subtotalMinor <= 0) {
    return { ...ZERO_RESULT, taxType: null };
  }

  const regime = resolveTaxType(opts.taxType, region, country);

  switch (regime) {
    case 'VAT':
      return calculateVat(subtotalMinor, region, merchantCountry, opts.customerTaxId);
    case 'GST': {
      const rate = GST_RATES[region] ?? GST_RATES[country] ?? 0;
      return buildResult(subtotalMinor, rate, 'GST');
    }
    case 'US_SALES_TAX': {
      const rate = US_SALES_TAX_RATES[region] ?? 0;
      return buildResult(subtotalMinor, rate, 'US_SALES_TAX');
    }
    default:
      return { ...ZERO_RESULT, taxType: null };
  }
}

/** Infer the regime from explicit option, then country, then region. */
function resolveTaxType(
  explicit: TaxType | undefined,
  region: string,
  country: string,
): TaxType | null {
  if (explicit) return explicit;

  if (country === 'US' || (region.length === 2 && region in US_SALES_TAX_RATES && country !== '' && country === 'US')) {
    return 'US_SALES_TAX';
  }
  if (region in GST_RATES || country in GST_RATES) return 'GST';
  if (region in EU_VAT_RATES || country in EU_VAT_RATES) return 'VAT';

  // Ambiguous bare US state code (e.g. "CA" could be California or Canada-ish):
  // fall back to US sales tax only when the region is a known US state.
  if (region in US_SALES_TAX_RATES && !(region in EU_VAT_RATES)) {
    return 'US_SALES_TAX';
  }

  return null;
}

/** VAT path with intra-EU B2B reverse-charge handling. */
function calculateVat(
  subtotalMinor: number,
  region: string,
  merchantCountry: string,
  customerTaxId?: string,
): TaxResult {
  const baseRate = EU_VAT_RATES[region] ?? 0;

  if (customerTaxId) {
    const { country: vatCountry, valid } = parseVatId(customerTaxId);
    // Reverse charge applies for valid B2B numbers from a *different* EU state.
    const crossBorder =
      valid &&
      vatCountry in EU_VAT_RATES &&
      vatCountry !== merchantCountry;
    if (crossBorder) {
      return {
        taxMinor: 0,
        taxRatePct: 0,
        taxType: 'VAT',
        reverseCharge: true,
      };
    }
  }

  return buildResult(subtotalMinor, baseRate, 'VAT');
}

/** Compute and round a straightforward percentage-based tax. */
function buildResult(
  subtotalMinor: number,
  ratePct: number,
  taxType: TaxType,
): TaxResult {
  if (!ratePct || ratePct <= 0) {
    return { taxMinor: 0, taxRatePct: 0, taxType, reverseCharge: false };
  }
  const taxMinor = roundMinor((subtotalMinor * ratePct) / 100);
  return { taxMinor, taxRatePct: ratePct, taxType, reverseCharge: false };
}
