# 18 — Launch: legal pages & app listing

Public policy pages and the iOS app listing are wired into the web storefront.
**The policy text is a drafting starting point, not legal advice — have a
qualified lawyer review it for your jurisdiction before launch.**

## Pages (served by the `web` app, `(public)` group)

| Route | File | Purpose |
|---|---|---|
| `/terms` | `app/(public)/terms/page.tsx` | Terms of Service |
| `/privacy` | `app/(public)/privacy/page.tsx` | Privacy Policy (App Store requires this URL) |
| `/acceptable-use` | `app/(public)/acceptable-use/page.tsx` | Acceptable Use Policy |
| `/refunds` | `app/(public)/refunds/page.tsx` | Refund & Cancellation Policy |

All link from the site **footer** (a "Legal" column + a bottom bar) and
cross-link each other. The footer also shows a **"Download on the App Store"**
badge, and the home page has an **app showcase** band (`/#app`).

## Before you go live — fill these in (via env, no source edit)

Every legal value is sourced from a `NEXT_PUBLIC_*` env var, with the
`{{PLACEHOLDER}}` as the fallback that renders verbatim until you set it. Set them
in your production `.env` (see **`.env.production.example`**) and rebuild `web`:

| Env var | Fills |
|---|---|
| `NEXT_PUBLIC_LEGAL_ENTITY` | Operating legal entity name |
| `NEXT_PUBLIC_LEGAL_ADDRESS` | Registered business address |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Support/contact inbox |
| `NEXT_PUBLIC_PRIVACY_EMAIL` | Privacy/DPO inbox |
| `NEXT_PUBLIC_LEGAL_EMAIL` | Legal/abuse inbox |
| `NEXT_PUBLIC_LEGAL_JURISDICTION` | Governing law & venue |
| `NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE` | "Last updated" date on each policy |
| `NEXT_PUBLIC_REFUND_WINDOW` | New-order money-back window (Refund Policy) |
| `NEXT_PUBLIC_INFRA_PROVIDER` | Sub-processor: hosting/infrastructure |
| `NEXT_PUBLIC_EMAIL_PROVIDER` | Sub-processor: transactional email |
| `NEXT_PUBLIC_SITE_DOMAIN` | Your bare domain (e.g. `refx.gg`) |
| `NEXT_PUBLIC_BRAND_NAME` | Brand shown across the pages |
| `NEXT_PUBLIC_APP_STORE_URL` | App Store/TestFlight link (else "Coming soon") |

Stripe, PayPal and Apple (APNs) are pre-filled in the sub-processor list. The
entity name + address typically wait until the legal entity is formed.

> `NEXT_PUBLIC_*` values are baked in at **web build time** — set them before
> building the web image, then rebuild (`docker compose build web`).

## App Store submission checklist (iOS)

- **Privacy Policy URL:** `https://<domain>/privacy` (App Store Connect requires it).
- **EULA:** Apple's standard EULA is fine, or link your Terms (`/terms`). If you
  use a custom EULA, add its URL in App Store Connect.
- **App Privacy "nutrition label":** declare what the app collects. For this
  product that's typically: Contact Info (email), Identifiers (account/user id),
  Purchases (billing/subscription), and Diagnostics/Usage — and note that the
  push token is used for notifications. Confirm against the actual app build.
- **Account deletion:** Apple requires in-app account deletion. The panel already
  exposes self-service **data export** and **account deletion** in Account
  settings — make sure the app surfaces the delete path.
