# refx.gg — Security Audit & Hardening Register

Full application-security audit ahead of taking paying customers and operating
as a public storefront. Method: **static code review + configuration review +
local dependency scanning only** — no active/intrusive testing against
production (that is gated on Frank's explicit approval; see §Active-testing
proposal). Secrets are masked throughout; any real secret discovered is filed
Critical with "rotate immediately" and never printed.

- **Scope:** `apps/panel-api` (NestJS/Prisma/Postgres/Redis/BullMQ), `apps/web`
  (Next.js 14), `apps/node-agent` (Go), `database/`, `infra/` — all owned by
  Frank. Third-party services (Stripe, PayPal, Cloudflare, R2) are **out of
  scope** except how we integrate with them.
- **Stack confirmed:** monorepo; panel-api REST+GraphQL; web SSR/RSC; Go agent
  over HMAC-signed HTTPS `:8443` + embedded SFTP; single VPS + Docker Compose +
  Caddy + Cloudflare edge/DNS; payments Stripe + PayPal (hosted/redirect); prod
  is the only environment (no staging).

## Summary (by severity) — updated as findings land

| Severity | Open | Fixed | Needs-Frank | Won't-fix | Total |
|----------|------|-------|-------------|-----------|-------|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High     | 0 | 4 | 2 | 0 | 6 |
| Medium   | 8 | 3 | 3 | 0 | 14 |
| Low/Info | 12 | 1 | 0 | 0 | 13 |

_All six dimension reviews complete and verified against code. **No committed
secrets** in the working tree or across 656 commits of git history (every hit
was a placeholder/test fixture — nothing to rotate). **No Critical** findings.
The four app-layer Highs are **fixed** (commit `40fd855`); the two remaining
Highs are node-runtime hardening that is **conditional on native (non-Docker)
deployments** and flagged Needs-Frank. See `GO_NOGO.md` for the verdict._

---

## Phase 1 — Architecture, attack surface & threat model

### 1.1 Components & trust boundaries

```
                      Internet (customers, attackers)
                               │
                     ┌─────────▼─────────┐   Cloudflare (edge TLS, DDoS, WAF)
                     │   Cloudflare       │
                     └─────────┬─────────┘
                               │  (origin should accept only CF / be un-leaked)
                   ┌───────────▼───────────┐   VPS — Caddy reverse proxy (TLS)
                   │  refx.gg / api.refx.gg │   loopback-bound backends
                   └───┬───────────────┬────┘
          :3000 (web)  │               │  :4000 (panel-api)
              ┌────────▼──────┐  ┌─────▼─────────────────────────────┐
              │ Next.js (web) │  │ NestJS panel-api                  │
              │ SSR + client  │  │ REST /api/v1 + GraphQL + webhooks │
              └───────────────┘  └──┬───────────┬──────────┬─────────┘
                                    │           │          │
                          ┌─────────▼──┐  ┌─────▼────┐  ┌──▼─────────────┐
                          │ Postgres    │  │ Redis    │  │ BullMQ workers │
                          │ (loopback)  │  │(loopback)│  │ (provision…)   │
                          └─────────────┘  └──────────┘  └──┬─────────────┘
                                                            │ HMAC-signed HTTPS
   ══════════════ TRUST BOUNDARY: nodes may be on hosts ReFx doesn't fully own ══
                                                            │
                                   ┌────────────────────────▼───────────────┐
                                   │ Game node(s): Go agent :8443 + SFTP     │
                                   │  DockerRuntime / NativeRuntime          │
                                   │  ┌────────┐ ┌────────┐ ┌────────┐       │
                                   │  │ server │ │ server │ │ server │ …     │  ← tenant workloads
                                   │  │  (A)   │ │  (B)   │ │  (C)   │       │    (untrusted game code)
                                   │  └────────┘ └────────┘ └────────┘       │
                                   └─────────────────────────────────────────┘
```

**Key trust boundaries:**
1. **Internet → edge/proxy** — all public traffic; Cloudflare + Caddy terminate TLS.
2. **Web/panel-api → data stores** — Postgres/Redis must be loopback-only.
3. **panel-api → node agent** — the cardinal boundary: agents run on hosts ReFx
   may not fully control, get a *scoped denormalized spec*, **never** DB access,
   and every call is HMAC-signed. A customer must not be able to call an agent directly.
4. **Node agent → tenant workload** — untrusted game code runs here; must be
   sandboxed (container / low-priv UID), quota-enforced, and unable to escape to
   host, the panel network, or other tenants.

### 1.2 Externally-reachable surfaces (each assigned to a review phase)

| Surface | Exposure | Auth | Review phase |
|---------|----------|------|--------------|
| Web storefront + customer/admin panel (Next.js) | Public | Session (JWT) | 2, 3, 5 |
| panel-api REST `/api/v1/*` | Public (via proxy) | JWT / API key / `@Public` | 3, 4, 5 |
| GraphQL (read mirror) | Restricted at proxy | JWT | 4 (proxy: 8) |
| Payment webhooks `/billing/webhooks/{stripe,paypal}` | Public (must be) | Signature verify | 6 |
| WebSocket console relay | Public (via proxy) | JWT + per-server perm | 4 |
| Public tools API `/tools/minecraft-status` | Public, unauth | Throttle + SSRF guard | 5 |
| Public catalog/status/KB reads | Public, unauth | `@Public`, cached | 5 |
| Node agent control API `:8443` | Public (nodes are remote) | HMAC + replay window (+ optional TLS pin) | 4, 8 |
| Node agent SFTP | Public | Per-server creds, jailed | 4, 8 |
| File upload (mods/configs/world/web) | Auth | Per-server perm + jail | 5 |
| `/metrics` `/docs` `/graphql` | Should be restricted | Proxy 404 + preflight | 8 |

### 1.3 Assets & top threats (threat model)

| Asset | Top threats | Primary controls to verify |
|-------|-------------|----------------------------|
| **Customer accounts** | Credential stuffing, account takeover, reset-flow abuse, enumeration | Argon2id, throttle, MFA (TOTP/WebAuthn), refresh rotation+reuse detection, hashed single-use reset tokens (Phase 3) |
| **Payments / revenue** | Price tampering, forged/replayed webhooks, provision-without-pay, card testing, coupon/referral abuse | Server-side amount authority, webhook signature verify + idempotency, provision-on-confirmed-only, fraud limits (Phase 6) |
| **Customer data** (files, worlds, DB creds, SFTP, TOTP seeds) | IDOR/BOLA cross-tenant read/write, secret decryption if key leaks | Server-side ownership checks, AES-256-GCM `*Enc` columns, jailed file/SFTP (Phase 4, 7) |
| **Tenant isolation** | Customer A → B via app IDs; container escape; flat node network | PermissionGuard, HMAC agent API, DockerRuntime/UID isolation + quotas + egress (Phase 4, 8) |
| **Host / node fleet** | Command injection via egg/startup vars, workload escape, outbound abuse | Allowlisted/parameterized exec, sandbox, egress limits (Phase 5, 8) |
| **Secrets** | Committed keys, key in client bundle, logs leaking tokens | git-history scan, `NEXT_PUBLIC_*` audit, log hygiene, preflight (Phase 7) |
| **Admin plane** | Vertical privesc, exposed metrics/docs/graphql | `AdminPermissionGuard` + `@RequirePerm`, proxy restriction (Phase 4, 8) |

### 1.4 Pre-existing security posture (baseline — to be verified, not assumed)

Documented in `docs/08-security.md` and built across prior work: Argon2id;
JWT access+refresh with rotation & reuse-detection; TOTP + WebAuthn; scoped
API keys with IP allowlist; `GlobalRole` RBAC + per-server `SubUser`
permissions with `PermissionGuard`/`AdminPermissionGuard`; AES-256-GCM secret
envelope keyed by `SECRETS_ENC_KEY`; `AuditLog` on mutating actions;
Redis-backed throttler; production boot **preflight validator** (blocks weak
secrets, wildcard CORS, http public URL, `NODE_TLS_REJECT_UNAUTHORIZED=0`,
missing SMTP, placeholder DB password); HMAC-signed panel↔agent API with
replay window + opt-in TLS cert pinning; jailed file manager & SFTP; opt-in
per-server UID isolation; SSRF guard on the public tools ping. This audit
**verifies** each of these against code rather than trusting the docs, and
hunts for gaps around and between them.

---

## Findings register

Severity, location, and status per finding. IDs `SEC-0x` were fixed in commit
`40fd855`. `HARDENING_CHANGELOG.md` has the diffs; `GO_NOGO.md` the verdict.

### HIGH

**SEC-01 — Provision-without-payment (Fixed).** `POST /billing/subscriptions`
(`billing.service.ts:453`) minted an `ACTIVE` subscription with no invoice, and
`POST /servers` (`servers.service.ts:236`) then provisioned immediately, gated
only on "subscription owned + ACTIVE". An authenticated customer could chain
these for free compute, repeatedly, also bypassing email/billing-address checks.
Independently flagged by the payments and authz reviews; verified by hand.
*Fix:* immediate (non-deferred) provisioning now requires a `PAID` invoice on the
subscription, plus one-server-per-subscription. Order flow (`deferProvision`)
unaffected. OWASP A04.

**SEC-02 — Vertical privilege escalation via coarse `@Roles(ADMIN)` (Fixed).**
`deriveGlobalRole()` elevates any custom role holding a `*.manage` permission to
the ADMIN tier, so `@Roles(ADMIN)` on `/nodes/*` (`nodes.controller.ts`), billing
product/price, `/platform/audit-logs`, and `/platform/alerts` let a scoped staff
role reach node create/delete + **bootstrap-token minting** (rogue-node
onboarding). The codebase had already fixed this for `users.controller` but
missed these four. *Fix:* swapped to `AdminPermissionGuard` + `@RequirePerm`
(nodes.manage/read, catalog.manage, audit.read, content.manage). OWASP A01.

**SEC-05 — Stored XSS via unescaped JSON-LD (Fixed).** `JSON.stringify` doesn't
escape `</script>`; modpack `title`/`description` (public `/modpacks/[slug]`) come
from Modrinth, which anyone can publish to → unauthenticated stored XSS in the
panel origin, where bearer + refresh tokens live in `localStorage`. *Fix:* new
`lib/json-ld.ts serializeJsonLd()` escapes `<>&`/U+2028-9, applied to all six
JSON-LD sinks. OWASP A03.

**DEP-01 — `ws` < 8.21.0 memory-exhaustion DoS (Fixed, applies on rebuild).**
Runtime-reachable via the socket.io **console gateway** (`console.gateway.ts`).
*Fix:* root `overrides: { ws: ">=8.21.0" }` — takes effect on the next
`docker compose build`.

**DEP-02 — `multer` ≤ 2.1.1 DoS (Needs-Frank / redeploy).** Multipart DoS via
crafted field names / aborted uploads (ticket attachments, avatars). *Action:*
`cd apps/panel-api && npm audit fix` during deploy (non-breaking, bumps
`@nestjs/platform-express`).

**INF-H1 — Native game process runs as the docker-group agent user → host root
(Needs-Frank; conditional).** On `NATIVE_PROCESS` deploys the game runs as the
agent user `refx`, which the installer puts in the `docker` group (root-
equivalent via the socket); per-server UID isolation is opt-in and blocked by the
shipped `NoNewPrivileges=true` unit. **Not exploitable on Docker-runtime nodes**
(contained, no socket). *Action (before hosting untrusted workloads on native
nodes):* default per-server UID isolation, remove `refx` from `docker` group on
native/mixed nodes, ship a root-capable unit when isolation is on. Requires a
node-agent release + host reconfig.

### MEDIUM

- **SEC-03 — Recovery codes unusable (Fixed).** Verify uppercased a mixed-case
  code → the recovery-code MFA factor was dead (users could lock themselves out).
- **SEC-04 — Reset token leaked to logs (Fixed).** `GET /auth/reset-password/valid?token=`
  logged the query string (live, redeemable token) to app + proxy logs. Logger
  now strips query strings globally.
- **SEC-06 — No CSP / security headers (Fixed, partial).** Added CSP +
  X-Frame-Options DENY + nosniff + Referrer-Policy + Permissions-Policy to the
  web app. `script-src` stays `'unsafe-inline'` (Next App Router hydration);
  nonce/`strict-dynamic` hardening is a follow-up (needs live testing).
- **PAY-02 — Refund/chargeback doesn't revoke entitlement (Open, Needs-Frank).**
  A customer can pay, get provisioned, then refund/chargeback and keep the server
  until the next renewal fails (up to a full period). No Stripe
  `charge.refunded`/`dispute` handler. *Action:* on refund/reversal/dispute,
  enqueue suspension; add the Stripe dispute handlers. Policy decision for Frank.
- **INJ-03 — Webhook SSRF: no delivery-time re-validation (Open).** `assertPublicUrl`
  checks only at create/update; the delivery worker follows redirects and doesn't
  re-resolve → DNS-rebind / redirect to `169.254.169.254`. Reachable by a
  `content.manage` staffer. *Action:* re-validate at delivery (reuse
  `isPublicAddress`), pin the vetted IP, `redirect:'manual'`.
- **INF-M2/M3/M4/M5 — Node runtime isolation gaps (Open, Needs-Frank).** Native
  isolation uses one shared node UID (no tenant-to-tenant separation); all
  containers share one Docker bridge (no inter-tenant network segmentation); no
  egress controls (DDoS-reflection/spam/mining risk); containers lack
  `CapDrop`/`no-new-privileges`/disk-quota. All require a node-agent release +
  per-node reconfig; prioritize before scaling multi-tenant density.
- **AUTH-01 — No per-account login throttle (Open).** Login is per-IP only
  (10/min); a distributed attack has no per-account ceiling. Docs claim
  per-account backoff that isn't implemented. *Action:* add an email-keyed
  limiter + failed-attempt backoff.
- **AUTH-02 — MFA not enforceable for admins (Open).** MFA fires only if the user
  personally enabled it; no policy to require it for ADMIN/OWNER. *Action:* add a
  `requireMfaForStaff` policy checked at login.
- **AUTH-03 — Refresh-reuse detection defeated in the 60s grace window (Open).**
  A replayed rotated token within 60s mints a new independent session instead of
  revoking the family. *Action:* make rotation idempotent (return the successor
  tokens), shrink the window, alarm on post-rotation reuse.
- **AUTH-04 — Access tokens not revocable until expiry (Open).** Logout /
  revoke-all / password-change kill only the refresh session; access tokens work
  up to 1h. (Role/ban changes DO take effect immediately — the strategy reloads
  the user.) *Action:* per-user `tokenVersion` (or `sid` + session check).

### LOW / INFO (Open unless noted)

- **SEC-07 — KB markdown allowed `javascript:` hrefs (Fixed).** Scheme allowlist
  (same-origin path or http(s)/mailto), protocol-relative `//` rejected.
- **INF-L2 — CORS `||` fallback reflects any origin with credentials** when
  `CORS_ORIGINS` is unset (dev / `ALLOW_INSECURE_CONFIG`); prod preflight blocks
  it. Fix `|| []` → `.length` test.
- **INF-L1 — Unauthenticated `/metrics` on the public agent port `:8443`**;
  agent/SFTP ports opened to `0.0.0.0` (no panel-IP allowlist). Firewall to the
  panel IP; require HMAC on `/metrics`.
- **INF-L3 — Agent self-update checksum is fail-open** and same-origin (no
  signature). Fail closed + sign releases (cosign/minisign).
- **INF-L4 — Real client IP not restored behind Cloudflare** → throttle/audit
  bucket by CF PoP IP; origin not locked to CF ranges. Configure Caddy
  `trusted_proxies` + `CF-Connecting-IP`.
- **AUTH — non-constant-time hash compares** (api-key/refresh/recovery — low risk,
  indexed lookups); **MFA challenge + TOTP replayable within TTL/skew**;
  **forgot-password/resend timing enumeration**; **register 409 membership
  oracle** (rate-limited); **API-key empty-scope + ADMIN-scope-not-enforced**;
  **rehash-on-login not implemented**; **JWT algorithms unpinned**; **MFA secret
  not covered by preflight**.
- **PAY — referral reward not bounded by first-payment amount**;
  **coupon/gift-card currency not matched to invoice**; **coupon reservation not
  released on failed order**; **no payment-specific velocity limits**;
  **markInvoicePaid doesn't assert captured amount / dup-ref edge case**.
- **INJ — native `LD_PRELOAD`/loader env not stripped** (overlaps INF-H1);
  **modpack/agent host-allowlist bypassable via redirect**; **`isBlockedIp`
  narrower than the ping guard** (metadata still blocked).

### Already handled well (verified, do not re-fix)

Argon2id + login timing-equalizer; JWT strategy reloads user each request
(immediate role/ban revocation); reset/verify tokens 256-bit, hashed, single-use,
expiring; **parameterized SQL only** (no `queryRawUnsafe`); **no-shell command
exec** (execve/argv; egg values passed as env, not interpolated); **file/SFTP
jail** with zip-slip containment; **exemplary SSRF guard** on the tools ping
(resolve-then-vet-then-connect-to-IP); panel↔agent **HMAC + replay window +
constant-time**; agent **secret-env scrubbing**; **cgroups/Docker resource
limits**; **mass-assignment blocked** (global `whitelist:true`
`forbidNonWhitelisted`); **API-key WRITE-scope ceiling** interceptor; **admin
surface** uniformly `AdminPermissionGuard` + `@RequirePerm`; **webhook signature
verification** (Stripe raw-body `constructEvent`; PayPal `verify-webhook-signature`)
+ **idempotent OPEN→PAID settlement**; **server-side amount authority** (client
never dictates price); **no card data on the server** (hosted/redirect, no PCI
scope); **loopback-bound data services**; production **preflight validator**;
GraphQL introspection + Swagger off in prod.
