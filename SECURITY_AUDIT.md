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
| High     | 0 | 0 | 0 | 0 | 0 |
| Medium   | 0 | 0 | 0 | 0 | 0 |
| Low      | 0 | 0 | 0 | 0 | 0 |
| Info     | 0 | 0 | 0 | 0 | 0 |

_Findings are being synthesized from six parallel dimension reviews (auth,
authz/tenant-isolation, injection/command-exec, payments, secrets/deps, infra).
This table and the register below fill in as each review is verified._

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

_(Populated as the six dimension reviews are verified. Template per §3 of the brief.)_
