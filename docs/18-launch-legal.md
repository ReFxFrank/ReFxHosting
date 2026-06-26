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

## Before you go live — fill these in

Edit **`apps/web/lib/legal.ts`** and replace every `{{PLACEHOLDER}}`:

- `entity` — the legal company/entity name that operates the service
- `registeredAddress` — registered business address
- `contactEmail` / `privacyEmail` / `legalEmail` — real inboxes
- `jurisdiction` — governing law & venue
- `effectiveDate` — the date the policies take effect
- `SUBPROCESSORS[]` — confirm the infrastructure + email providers (Stripe,
  PayPal, Apple/APNs are pre-filled)

In **`apps/web/.env`** (or the build environment):

- `NEXT_PUBLIC_SITE_DOMAIN` — your bare domain (e.g. `refx.gg`)
- `NEXT_PUBLIC_APP_STORE_URL` — the App Store / TestFlight link. Until set, the
  badge renders "Coming soon" and is inert.

In **`app/(public)/refunds/page.tsx`** tune the `{{REFUND WINDOW}}` and any
amounts to your actual commercial policy.

> `NEXT_PUBLIC_*` values are baked in at **web build time** — set them before
> building the web image, then rebuild.

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
