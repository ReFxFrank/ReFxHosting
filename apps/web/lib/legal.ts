/**
 * Centralised values for the legal/policy pages.
 *
 * Every field has a sensible default and can be overridden via a NEXT_PUBLIC_*
 * env var (baked at web BUILD time) without editing this file. NOTE: Next.js only
 * inlines `process.env.NEXT_PUBLIC_*` when referenced as a literal member access
 * (as below) — don't refactor these into a dynamic `process.env[key]` lookup or
 * the values won't be baked in.
 *
 * ⚠️  The policy text under app/(public)/{terms,privacy,acceptable-use,refunds}
 *     is a DRAFT starting point, not legal advice. Have it reviewed by a
 *     qualified lawyer for your jurisdiction before you rely on it. In
 *     particular confirm the governing-law jurisdiction, registered address and
 *     transactional-email sub-processor below.
 */
export const LEGAL = {
  brand: process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting",
  domain: process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "refx.gg",
  /** The legal entity that operates the service. */
  entity: process.env.NEXT_PUBLIC_LEGAL_ENTITY ?? "ReFx Hosting",
  registeredAddress:
    process.env.NEXT_PUBLIC_LEGAL_ADDRESS ??
    "Available on request — contact legal@refx.gg",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "support@refx.gg",
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL ?? "privacy@refx.gg",
  legalEmail: process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? "legal@refx.gg",
  /** Governing law + courts. */
  jurisdiction:
    process.env.NEXT_PUBLIC_LEGAL_JURISDICTION ?? "the Province of Quebec, Canada",
  /** Shown as "Last updated" on every policy page. */
  effectiveDate: process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE ?? "June 26, 2026",
  /** New-order money-back window, rendered on the Refund Policy. */
  refundWindow: process.env.NEXT_PUBLIC_REFUND_WINDOW ?? "72 hours",
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL ?? "#",
} as const;

/**
 * Third parties that process customer data on our behalf — keep this list
 * accurate; the Privacy Policy renders it, and several privacy laws require it.
 * The infrastructure + email providers can be overridden via env.
 */
export const SUBPROCESSORS: { name: string; purpose: string }[] = [
  { name: "Stripe", purpose: "Card payment processing and billing" },
  { name: "PayPal", purpose: "PayPal payment processing and billing" },
  {
    name: process.env.NEXT_PUBLIC_INFRA_PROVIDER ?? "OVHcloud",
    purpose: "Server/node hosting and data-centre infrastructure",
  },
  { name: "Apple (APNs)", purpose: "iOS push-notification delivery" },
  {
    name: process.env.NEXT_PUBLIC_EMAIL_PROVIDER ?? "Email delivery provider",
    purpose: "Transactional email (verification, receipts, alerts)",
  },
];
