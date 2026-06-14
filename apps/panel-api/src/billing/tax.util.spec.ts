import { calculateTax } from './tax.util';

describe('calculateTax (billing tax engine)', () => {
  describe('EU VAT', () => {
    it('applies the German standard rate (19%) on a B2C sale', () => {
      const r = calculateTax(10000, { region: 'DE' });
      expect(r.taxType).toBe('VAT');
      expect(r.taxRatePct).toBe(19);
      expect(r.taxMinor).toBe(1900);
      expect(r.reverseCharge).toBe(false);
    });

    it('applies the Irish rate (23%) and rounds half-up to minor units', () => {
      // 1.0% of 9999 cents is fractional: 9999 * 0.23 = 2299.77 -> 2300
      const r = calculateTax(9999, { region: 'IE' });
      expect(r.taxRatePct).toBe(23);
      expect(r.taxMinor).toBe(Math.round((9999 * 23) / 100));
      expect(r.taxMinor).toBe(2300);
    });

    it('infers the VAT regime from a known EU country code', () => {
      // The regime is inferred from `country`, but the rate table is keyed by
      // `region`; with an empty region the resolved rate is 0 (no rate found).
      // The customer-facing path always supplies `region`, so this documents the
      // regime-inference behaviour rather than a populated rate.
      const r = calculateTax(5000, { region: '', country: 'FR' });
      expect(r.taxType).toBe('VAT');
      expect(r.taxRatePct).toBe(0);
      expect(r.taxMinor).toBe(0);
    });

    it('applies the French standard rate (20%) when region is supplied', () => {
      const r = calculateTax(5000, { region: 'FR' });
      expect(r.taxType).toBe('VAT');
      expect(r.taxRatePct).toBe(20);
      expect(r.taxMinor).toBe(1000);
    });

    it('applies reverse charge for a valid cross-border B2B VAT id', () => {
      // Merchant defaults to IE; a German VAT id is a different EU state.
      const r = calculateTax(10000, { region: 'DE', customerTaxId: 'DE123456789' });
      expect(r.reverseCharge).toBe(true);
      expect(r.taxMinor).toBe(0);
      expect(r.taxRatePct).toBe(0);
      expect(r.taxType).toBe('VAT');
    });

    it('does NOT reverse-charge a domestic VAT id (same country as merchant)', () => {
      const r = calculateTax(10000, {
        region: 'IE',
        merchantCountry: 'IE',
        customerTaxId: 'IE1234567X',
      });
      expect(r.reverseCharge).toBe(false);
      expect(r.taxMinor).toBe(2300);
    });

    it('treats the Greek "EL" VAT prefix as GR for cross-border detection', () => {
      // GR is not in our rate subset, so this should NOT trigger reverse charge
      // (vatCountry must be a known EU member in the table).
      const r = calculateTax(10000, { region: 'DE', customerTaxId: 'EL123456789' });
      expect(r.reverseCharge).toBe(false);
      expect(r.taxMinor).toBe(1900);
    });

    it('ignores a malformed VAT id and charges normally', () => {
      const r = calculateTax(10000, { region: 'DE', customerTaxId: '!!' });
      expect(r.reverseCharge).toBe(false);
      expect(r.taxMinor).toBe(1900);
    });
  });

  describe('GST', () => {
    it('applies Australian GST (10%)', () => {
      const r = calculateTax(20000, { region: 'AU' });
      expect(r.taxType).toBe('GST');
      expect(r.taxRatePct).toBe(10);
      expect(r.taxMinor).toBe(2000);
    });

    it('applies New Zealand GST (15%)', () => {
      const r = calculateTax(10000, { region: 'NZ' });
      expect(r.taxMinor).toBe(1500);
      expect(r.taxType).toBe('GST');
    });
  });

  describe('US sales tax', () => {
    it('applies California rate (7.25%) with rounding', () => {
      const r = calculateTax(10000, { region: 'CA', country: 'US' });
      expect(r.taxType).toBe('US_SALES_TAX');
      expect(r.taxRatePct).toBe(7.25);
      expect(r.taxMinor).toBe(725);
    });

    it('charges zero for a no-sales-tax state (Oregon)', () => {
      const r = calculateTax(10000, { region: 'OR', country: 'US' });
      expect(r.taxType).toBe('US_SALES_TAX');
      expect(r.taxRatePct).toBe(0);
      expect(r.taxMinor).toBe(0);
    });

    it('disambiguates Delaware (DE) as a US state when country=US (0% sales tax)', () => {
      const r = calculateTax(10000, { region: 'DE', country: 'US' });
      expect(r.taxType).toBe('US_SALES_TAX');
      expect(r.taxMinor).toBe(0);
    });

    it('treats a bare US state code (no country) as US sales tax when unambiguous', () => {
      const r = calculateTax(10000, { region: 'TX' });
      expect(r.taxType).toBe('US_SALES_TAX');
      expect(r.taxMinor).toBe(625);
    });
  });

  describe('edge cases', () => {
    it('returns null/zero for a zero subtotal', () => {
      const r = calculateTax(0, { region: 'DE' });
      expect(r.taxType).toBeNull();
      expect(r.taxMinor).toBe(0);
    });

    it('returns null/zero for a negative subtotal', () => {
      const r = calculateTax(-500, { region: 'DE' });
      expect(r.taxType).toBeNull();
      expect(r.taxMinor).toBe(0);
    });

    it('returns null/zero for a non-finite subtotal', () => {
      const r = calculateTax(NaN, { region: 'DE' });
      expect(r.taxType).toBeNull();
      expect(r.taxMinor).toBe(0);
    });

    it('returns null for an unknown / missing region', () => {
      const r = calculateTax(10000, { region: 'ZZ' });
      expect(r.taxType).toBeNull();
      expect(r.taxMinor).toBe(0);
      expect(r.reverseCharge).toBe(false);
    });

    it('honours an explicit taxType override', () => {
      const r = calculateTax(10000, { region: 'CA', taxType: 'US_SALES_TAX' });
      expect(r.taxType).toBe('US_SALES_TAX');
      expect(r.taxMinor).toBe(725);
    });

    it('is case- and whitespace-insensitive for the region', () => {
      const r = calculateTax(10000, { region: '  de  ' });
      expect(r.taxRatePct).toBe(19);
      expect(r.taxMinor).toBe(1900);
    });
  });
});
