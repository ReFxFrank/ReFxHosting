# 27 — Companion Apps (iOS + ReFx Remote for Windows)

ReFx Hosting ships two first-party **companion clients** so customers can manage
their servers without opening the web panel. Both sign in with the customer's
normal refx.gg account and speak the same public panel API (`/api/v1`) as the
web app — there is no separate "app API", and no extra server-side integration
is required to support them.

| App | Platform | Source | Distribution |
|-----|----------|--------|--------------|
| **ReFx Server Manager** | iOS | External repo (Swift; outside this monorepo) | [App Store](https://apps.apple.com/us/app/refx-server-manager/id6783853821) |
| **ReFx Remote** | Windows | [`ReFxFrank/ReFx-Remote`](https://github.com/ReFxFrank/ReFx-Remote) | Ready-to-run `.exe` from [GitHub Releases](https://github.com/ReFxFrank/ReFx-Remote/releases/latest) |

## What this monorepo provides for them

- **The API.** Both apps consume the standard authenticated REST surface —
  login/JWT refresh, server list/detail/power, billing, support. Anything the
  panel can do over `/api/v1` an app can do; per-account permissions are
  enforced server-side exactly as for the web panel.
- **Push (iOS).** First-party token-based APNs lives in `panel-api`
  (`PushService`, `POST/DELETE /api/v1/account/push-tokens`) — see the README's
  companion-apps section for the full push behavior. There is no push channel
  for Windows today; ReFx Remote polls/queries the API on the user's session.
- **Universal links (iOS).** `apple-app-site-association` is served from the
  web app's `/.well-known`.
- **Storefront promotion.** The homepage **companion apps** band and the footer
  **"Get the apps"** column carry both download badges
  (`apps/web/components/public/app-promo.tsx`, `windows-badge.tsx`,
  `app-store-badge.tsx`).

## Download-link configuration (web)

Set at web **build** time (like all `NEXT_PUBLIC_*` vars):

| Env var | Default | Purpose |
|---------|---------|---------|
| `NEXT_PUBLIC_APP_STORE_URL` | the published App Store listing | iOS badge target |
| `NEXT_PUBLIC_REMOTE_DOWNLOAD_URL` | `https://github.com/ReFxFrank/ReFx-Remote/releases/latest` | Windows badge target |

The Windows default deliberately points at the **latest-release page** rather
than a specific asset, so the site never links a stale or renamed `.exe`. If
the release asset name is stable, you can pin a one-click direct download, e.g.
`https://github.com/ReFxFrank/ReFx-Remote/releases/latest/download/<asset>.exe`.

## Releasing a new ReFx Remote build

Releases are cut in the [`ReFx-Remote`](https://github.com/ReFxFrank/ReFx-Remote)
repository (its own build/release process — it is **not** built by this
monorepo's CI). Because the storefront links the *latest* release, publishing a
new GitHub Release there updates the site's download with no panel deploy.

## Status-page note

The public status page's component list includes **iOS App** (admin-declared
via incidents — it has no automatic health signal). ReFx Remote has no
dedicated status component; if a Remote-specific incident ever matters to
customers, post it against the Control Panel API component or add a component
then.
