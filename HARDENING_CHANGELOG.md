# Hardening Changelog — Security Audit Remediation

Every security change made during the audit, with file references and rationale.
Commit `40fd855` unless noted. See `SECURITY_AUDIT.md` for the findings and
`GO_NOGO.md` for the verdict + outstanding items.

## Code / config changes applied

| ID | Change | Files |
|----|--------|-------|
| SEC-01 | Immediate provisioning now requires a `PAID` invoice on the subscription + one-server-per-subscription; closes free-compute chain. Order flow (`deferProvision`) unaffected. | `apps/panel-api/src/servers/servers.service.ts` |
| SEC-02 | Replaced coarse `@Roles(ADMIN)` with `AdminPermissionGuard` + `@RequirePerm` on nodes, billing product/price, audit-logs, alerts (capability, not tier). | `apps/panel-api/src/nodes/nodes.controller.ts`, `billing/billing.controller.ts`, `platform/audit.controller.ts`, `platform/alerts.controller.ts` |
| SEC-03 | Recovery-code verify no longer case-folds (was uppercasing a mixed-case code → factor dead). | `apps/panel-api/src/auth/auth.service.ts` |
| SEC-04 | Request logger strips query strings (was logging live reset tokens). | `apps/panel-api/src/common/interceptors/logging.interceptor.ts` |
| SEC-05 | `serializeJsonLd()` escapes `<>&`/U+2028-9; applied to all 6 JSON-LD sinks. | `apps/web/lib/json-ld.ts` + 6 pages/components |
| SEC-06 | CSP + X-Frame-Options DENY + nosniff + Referrer-Policy + Permissions-Policy. | `apps/web/next.config.mjs` |
| SEC-07 | KB markdown link-scheme allowlist (blocks `javascript:`/`data:`, protocol-relative). | `apps/web/components/shared/markdown.tsx` |
| DEP-01 | `overrides: { ws: ">=8.21.0" }` (console-gateway DoS). Applies on next `docker compose build`. | root `package.json` |

**Verification:** panel-api 569 unit + e2e tests pass; web typecheck, lint, and
production build clean; JSON-LD escaper confirmed to neutralize a `</script>`
breakout payload.

## Config Frank must apply outside the repo

- **Deploy:** `docker compose -f infra/docker/docker-compose.yml up -d --build panel-api web`.
- **`apps/panel-api` → `npm audit fix`** (DEP-02 multer) during deploy.
- **Edge/host (see `GO_NOGO.md`):** firewall agent `:8443`/`:2022` to the panel
  IP; lock the origin firewall to Cloudflare ranges; Caddy `trusted_proxies` +
  `CF-Connecting-IP`.
- **Node-agent release** (if running native nodes): default per-server UID
  isolation, drop the agent user from `docker` group, egress limits, `CapDrop`,
  per-server disk quota.
- **Secrets:** none to rotate — the git-history + tree scan found no real
  credentials (only placeholders/fixtures).

## Deliberately NOT changed (would need a release/host reconfig or a product
decision — tracked in GO_NOGO)

Node-runtime isolation (INF-H1/M2–M5), refund/chargeback revocation (PAY-02),
webhook delivery-time SSRF re-validation (INJ-03), per-account login throttle
and staff-MFA enforcement (AUTH-01/02), access-token revocation (AUTH-04), CSP
`script-src` nonce hardening, and the Low/Info defense-in-depth items.
