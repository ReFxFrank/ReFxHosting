// Country + US-state reference data for billing-address dropdowns.
// Countries are ISO 3166-1 alpha-2; US states/territories are USPS codes.

export interface Option {
  code: string;
  name: string;
}

/** Common billing countries (ISO 3166-1 alpha-2), alphabetical by name. */
export const COUNTRIES: Option[] = [
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "BG", name: "Bulgaria" },
  { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MY", name: "Malaysia" },
  { code: "MT", name: "Malta" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NO", name: "Norway" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Türkiye" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "VN", name: "Vietnam" },
];

/** US states + DC (USPS codes), used when country = US. */
export const US_STATES: Option[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

// ---------------------------------------------------------------------------
// Status-map coordinates: plot a region/datacenter on the world panel.
// Resolved by region `code` first (most specific), then by `country`. Region ≈
// datacenter location — no DB columns required. Extend as you add regions.
// ---------------------------------------------------------------------------

type LatLng = [number, number];

const CODE_COORDS: { match: string; coords: LatLng }[] = [
  { match: "ca-east", coords: [45.31, -73.87] }, // Beauharnois / Montréal
  { match: "bhs", coords: [45.31, -73.87] },
  { match: "ca-west", coords: [49.28, -123.12] }, // Vancouver
  { match: "us-east", coords: [39.04, -77.49] }, // Ashburn, VA
  { match: "us-central", coords: [41.26, -95.94] }, // Omaha
  { match: "us-west", coords: [45.6, -121.18] }, // Oregon
  { match: "eu-west", coords: [50.11, 8.68] }, // Frankfurt
  { match: "eu-central", coords: [50.11, 8.68] },
  { match: "fra", coords: [50.11, 8.68] },
  { match: "lon", coords: [51.51, -0.13] },
  { match: "uk", coords: [51.51, -0.13] },
  { match: "ams", coords: [52.37, 4.9] },
  { match: "sg", coords: [1.35, 103.82] },
  { match: "syd", coords: [-33.87, 151.21] },
  { match: "tok", coords: [35.68, 139.69] },
];

const COUNTRY_COORDS: Record<string, LatLng> = {
  CA: [56.13, -106.35], CANADA: [56.13, -106.35],
  US: [39.83, -98.58], USA: [39.83, -98.58], "UNITED STATES": [39.83, -98.58],
  GB: [54.0, -2.0], UK: [54.0, -2.0], "UNITED KINGDOM": [54.0, -2.0],
  DE: [51.16, 10.45], GERMANY: [51.16, 10.45],
  FR: [46.6, 2.2], FRANCE: [46.6, 2.2],
  NL: [52.13, 5.29], NETHERLANDS: [52.13, 5.29],
  PL: [51.92, 19.15], POLAND: [51.92, 19.15],
  SG: [1.35, 103.82], SINGAPORE: [1.35, 103.82],
  AU: [-25.27, 133.78], AUSTRALIA: [-25.27, 133.78],
  JP: [36.2, 138.25], JAPAN: [36.2, 138.25],
  BR: [-14.24, -51.93], BRAZIL: [-14.24, -51.93],
  IN: [20.59, 78.96], INDIA: [20.59, 78.96],
  ZA: [-30.56, 22.94], "SOUTH AFRICA": [-30.56, 22.94],
};

export function regionCoords(code: string, country: string): LatLng | null {
  const c = (code ?? "").toLowerCase();
  for (const e of CODE_COORDS) if (c.includes(e.match)) return e.coords;
  const k = (country ?? "").trim().toUpperCase();
  return COUNTRY_COORDS[k] ?? null;
}

/** Equirectangular projection → percentage position within a 2:1 world panel. */
export function project(lat: number, lng: number): { x: number; y: number } {
  return { x: ((lng + 180) / 360) * 100, y: ((90 - lat) / 180) * 100 };
}

/** ISO-3166 alpha-2 country code → flag emoji ("" if not a 2-letter code). */
export function flagEmoji(country: string): string {
  const cc = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(
    ...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}
