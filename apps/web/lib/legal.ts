/**
 * Centralised values for the legal/policy pages. Replace every {{PLACEHOLDER}}
 * with your real details before launch — they render verbatim on the public
 * pages until you do, which is intentional (a visible reminder to fill them in).
 *
 * ⚠️  The policy text under app/(public)/{terms,privacy,acceptable-use,refunds}
 *     is a DRAFT starting point, not legal advice. Have it reviewed by a
 *     qualified lawyer for your jurisdiction before you rely on it.
 */
export const LEGAL = {
  brand: process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting",
  domain: process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "refx.gg",
  /** The legal entity that operates the service. */
  entity: "{{LEGAL ENTITY NAME — e.g. ReFx Hosting LLC}}",
  registeredAddress: "{{REGISTERED BUSINESS ADDRESS}}",
  contactEmail: "{{CONTACT EMAIL — e.g. support@refx.gg}}",
  privacyEmail: "{{PRIVACY/DPO EMAIL — e.g. privacy@refx.gg}}",
  legalEmail: "{{LEGAL/ABUSE EMAIL — e.g. legal@refx.gg}}",
  /** Governing law + courts. */
  jurisdiction: "{{GOVERNING LAW & VENUE — e.g. the State of Delaware, USA}}",
  /** Shown as "Last updated" on every policy page. */
  effectiveDate: "{{EFFECTIVE DATE — e.g. 1 July 2026}}",
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL ?? "#",
} as const;

/**
 * Third parties that process customer data on our behalf — keep this list
 * accurate; the Privacy Policy renders it, and several privacy laws require it.
 */
export const SUBPROCESSORS: { name: string; purpose: string }[] = [
  { name: "Stripe", purpose: "Card payment processing and billing" },
  { name: "PayPal", purpose: "PayPal payment processing and billing" },
  {
    name: "{{INFRASTRUCTURE PROVIDER — e.g. OVHcloud}}",
    purpose: "Server/node hosting and data-centre infrastructure",
  },
  { name: "Apple (APNs)", purpose: "iOS push-notification delivery" },
  {
    name: "{{EMAIL PROVIDER — e.g. your SMTP/email service}}",
    purpose: "Transactional email (verification, receipts, alerts)",
  },
];
