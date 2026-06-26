/**
 * Centralised values for the legal/policy pages.
 *
 * Every field can be supplied via a NEXT_PUBLIC_* env var (baked at web BUILD
 * time). When a var is unset, the {{PLACEHOLDER}} renders verbatim on the public
 * page — an intentional, visible reminder to fill it in before launch.
 *
 * Prefer setting these in your production `.env` (see `.env.production.example`)
 * over editing this file. NOTE: Next.js only inlines `process.env.NEXT_PUBLIC_*`
 * when referenced as a literal member access (as below) — don't refactor these
 * into a dynamic `process.env[key]` lookup or the values won't be baked in.
 *
 * ⚠️  The policy text under app/(public)/{terms,privacy,acceptable-use,refunds}
 *     is a DRAFT starting point, not legal advice. Have it reviewed by a
 *     qualified lawyer for your jurisdiction before you rely on it.
 */
export const LEGAL = {
  brand: process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting",
  domain: process.env.NEXT_PUBLIC_SITE_DOMAIN ?? "refx.gg",
  /** The legal entity that operates the service. */
  entity: process.env.NEXT_PUBLIC_LEGAL_ENTITY ?? "ReFx Hosting",
  registeredAddress:
    process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "{{REGISTERED BUSINESS ADDRESS}}",
  contactEmail:
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ??
    "{{CONTACT EMAIL — e.g. support@refx.gg}}",
  privacyEmail:
    process.env.NEXT_PUBLIC_PRIVACY_EMAIL ??
    "{{PRIVACY/DPO EMAIL — e.g. privacy@refx.gg}}",
  legalEmail:
    process.env.NEXT_PUBLIC_LEGAL_EMAIL ??
    "{{LEGAL/ABUSE EMAIL — e.g. legal@refx.gg}}",
  /** Governing law + courts. */
  jurisdiction:
    process.env.NEXT_PUBLIC_LEGAL_JURISDICTION ??
    "{{GOVERNING LAW & VENUE — e.g. the State of Delaware, USA}}",
  /** Shown as "Last updated" on every policy page. */
  effectiveDate:
    process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE ??
    "{{EFFECTIVE DATE — e.g. 1 July 2026}}",
  /** New-order money-back window, rendered on the Refund Policy. */
  refundWindow:
    process.env.NEXT_PUBLIC_REFUND_WINDOW ?? "{{REFUND WINDOW — e.g. 72 hours}}",
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL ?? "#",
} as const;

/**
 * Third parties that process customer data on our behalf — keep this list
 * accurate; the Privacy Policy renders it, and several privacy laws require it.
 * The infrastructure + email providers come from env so you don't edit source.
 */
export const SUBPROCESSORS: { name: string; purpose: string }[] = [
  { name: "Stripe", purpose: "Card payment processing and billing" },
  { name: "PayPal", purpose: "PayPal payment processing and billing" },
  {
    name:
      process.env.NEXT_PUBLIC_INFRA_PROVIDER ??
      "{{INFRASTRUCTURE PROVIDER — e.g. OVHcloud}}",
    purpose: "Server/node hosting and data-centre infrastructure",
  },
  { name: "Apple (APNs)", purpose: "iOS push-notification delivery" },
  {
    name:
      process.env.NEXT_PUBLIC_EMAIL_PROVIDER ??
      "{{EMAIL PROVIDER — e.g. your SMTP/email service}}",
    purpose: "Transactional email (verification, receipts, alerts)",
  },
];
