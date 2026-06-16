# Implementation Status

This is an **honest** implemented-vs-scaffolded matrix for the ReFx Hosting
codebase as it exists in this repository. The architecture and documentation set
are complete and authoritative; the code is a **working foundation** built and
verified end-to-end, with clearly-marked extension points (`// TODO(impl)`) at
genuine external-integration boundaries. It is **not** a finished, load-tested
commercial SaaS — see "What is deliberately not done" at the end.

Legend:

- **Done** — implemented, wired, and verified to build/compile/validate.
- **Partial** — core path implemented; meaningful `TODO(impl)` extension points remain.
- **Planned** — designed in docs, not yet coded.

> Verification performed in this repo: `prisma validate` passes; `packages/shared`
> typechecks; the node-agent builds/vets/tests on linux/amd64, linux/arm64,
> windows/amd64; `apps/web` builds, typechecks, and lints; and `apps/panel-api`
> compiles with 0 type errors, boots (all modules init, all REST routes map, the
> code-first GraphQL schema generates), and passes **150 unit + 47 e2e tests**.

## Components

| Component | Status | Notes |
|-----------|--------|-------|
| `database` (Prisma schema) | **Done** | Full canonical schema across all domains; validates. **Committed migration chain** (`0_init` → auth-hardening, storefront, node port-range, user contact/address, RBAC roles, platform settings). Seed script + ~24 game templates that **auto-load create-only on every deploy** (new eggs appear without `SEED_DEMO`); other demo content is gated behind `SEED_DEMO` (first-run only) so deleted data isn't resurrected. |
| `packages/shared` | **Done** | Enums mirroring the schema, panel↔agent WS protocol, per-server permission strings + `hasPermission`, common DTOs. Typechecks clean. (Apps still carry local copies pending migration onto it.) |
| `panel-api` (NestJS) | **Done (foundation)** | 118 TS files across auth, users, servers, nodes, billing, support, platform, agent, queues, common, prisma. Compiles clean and boots. |
| `node-agent` (Go) | **Done (foundation)** | 43 Go files. `Runtime` interface with real Docker + native-process backends, build-tagged limits, WS hub, signed control API, file jail, backups, SFTP, stats. Cross-compiles + tests pass. |
| `web` (Next.js) | **Done (foundation)** | shadcn/ui design system, 28 routes incl. live console, file manager, billing, support, admin, storefront, and the game-switch flow. Builds/typechecks/lints. |
| `infra/docker` | **Done** | Full Compose stack (postgres, redis, opensearch, minio, rabbitmq, prometheus, grafana, loki, panel-api, web) + observability provisioning + migrate service. |
| `infra/k8s/helm/refx` | **Done** | Helm chart: Deployments/Services for panel-api+web, HPAs, Ingress (WS timeouts), ConfigMap/Secret, ServiceAccount, NetworkPolicy, pre-upgrade migrate Job, NOTES. |
| `infra/scripts` | **Done** | `install-node.sh` (Ubuntu/Debian/Alma/Rocky), `install-node.ps1` (Windows Server), `refx-agent.service`, `bootstrap.sh`. |
| `.github/workflows` | **Done** | `ci.yml`, `release.yml`, `security.yml` (CodeQL/Trivy/npm-audit), `dependabot.yml`. |
| `docs` | **Done** | Complete architecture + operations set (this directory). |

## panel-api (module detail)

| Area | Status | Notes |
|------|--------|-------|
| Auth (Argon2id, JWT access+refresh rotation, sessions) | **Done** | Refresh-token rotation with reuse-detection (revokes the session family), plus a **60s concurrent-refresh grace window** so two tabs refreshing at once aren't logged out; login runs a constant-time Argon2 verify (no user-enumeration timing); registration handles the duplicate-email race as a clean 409. |
| Password reset + email verification (token email, hashed at rest) | **Done** | `/auth/forgot-password`, `/reset-password`, `/verify-email`, `/resend-verification`; SHA-256-hashed single-use tokens, real SMTP transport (jsonTransport fallback in dev/test). |
| 2FA (TOTP + recovery codes, WebAuthn) | **Done** | End-to-end: TOTP enrol with a **scannable QR** (Authy / Google Authenticator / 1Password) + manual key, one-time recovery codes, and a login challenge. **Passkeys (WebAuthn)** register/list/remove in account security and act as a second factor at sign-in; login requires MFA when the user has TOTP **or** any passkey. Login MFA uses a signed, short-lived (`mfa`-type) challenge JWT. WebAuthn challenge store is in-memory (`TODO(impl)`: Redis-backed for multi-instance); production must set `PANEL_RP_ID` + `PANEL_URL` to the web origin. |
| API keys (scoped, IP allowlist) | **Done** | Hash lookup + scope/IP checks. |
| RBAC — custom roles + per-server PermissionGuard | **Done** | Global roles **plus a `Role` model + granular admin-permission catalog** (`AdminPermissionGuard`/`@RequirePerm`); owner-only Roles management (built-in roles editable except Owner); SubUser permissions + admin override. The whole admin surface is permission-gated server-side. |
| Servers lifecycle + **game switching** | **Done** | Stopped-check → whitelist → `GameSwitchLog` → atomic repoint → queued reinstall preserving identity. |
| Mods + modpacks (Modrinth) | **Done** | Per-server mod/plugin search+install (loader/version-aware); **modpack installer** (`ModpackProcessor`): parse `.mrpack`, auto-switch MC version + loader, reinstall (worlds preserved), provision mods + config. Modrinth-host-locked downloads; per-file size cap. |
| Steam Workshop | **Done (panel)** | Per-server **Workshop tab** for Steam games (`supportsWorkshop` templates: Garry's Mod, Arma 3, Project Zomboid, DayZ, CS2): add items/collections by ID or URL, enable/reorder/remove, and **Apply** (writes `WORKSHOP_*` server vars + reinstalls so the egg's startup/steamcmd consumes them). **Per-customer Steam login** (each owner connects their own account on the server's Workshop tab, encrypted) is used for that server's downloads, with an optional **central admin login** (Admin → Settings → Steam) as fallback; injected into the install env. Collection/name resolution via Steam's public Web API (best-effort). Per-game steamcmd download + mod-load wiring lives in the eggs (GMod runtime collection works as-is; Arma 3 egg downloads items). **Steam Guard:** a one-time code can be entered at Apply (passed as steamcmd's 3rd login arg); the egg persists steamcmd's machine auth (sentry) on the volume so it's typically only needed once. Email Guard codes work best; mobile-authenticator (30s) codes can expire before the queued install runs. |
| Resource resize | **Done** | Node-capacity check + agent reconfigure. |
| Nodes (register/heartbeat/capacity/tokens, per-node port range) | **Done** | Agent registration + bootstrap-token endpoints; configurable allocation port range. |
| Agent client + console WS gateway | **Done (foundation)** | HMAC-signed HTTP client + browser↔agent relay. **Opt-in TLS certificate pinning** (`AGENT_TLS_PINNING`): pin a node's agent cert (admin "Pin certificate", trust-on-first-use) and the panel verifies against it via an undici dispatcher; off by default so self-signed setups are unaffected until pinned. |
| Billing (products/prices/subs/invoices/payments, tax) | **Done** | **Editable + deletable products + per-interval prices**; **two billing models per product** — **hardware tiers** (game servers: Low/Mid/High `HardwareTier` packages, fixed RAM/CPU/disk, priced per tier) and **per-slot** (voice servers, e.g. **TeamSpeak 3**, priced per slot). The order page renders **tier cards** for game products and a **slot selector** for voice; the backend recomputes + validates every total (tier belongs to product, tier/slot active, slot min/max/step) and never trusts client prices. **weekly → annual** terms; **owner-only gateway/key editor** (`SettingsService`, AES-256-GCM, env fallback); Stripe + PayPal gateways; **Stripe _and_ PayPal verified webhooks** (capture/refund, idempotent); **coupons** (%/fixed, caps, expiry), **gift cards**, and per-user **account/store credit** — stackable, gateway charges only the remainder; free/fully-covered invoices settle without a gateway round-trip; **VAT/GST/US tax computed from the customer's billing address** (required at registration + before any order). Deep SDK flows (saved-card off-session vaulting, SCA) marked `TODO(impl)`. |
| Queues (provisioning/reinstall/backup/renewal/suspension/modpack) | **Done** | BullMQ processors call agent/billing; **hourly renewal/dunning cron** (`BillingScheduler`, `@nestjs/schedule`) enqueues RENEW for due subs + DUNNING for past-due (deterministic jobIds = multi-instance safe; toggle `BILLING_SCHEDULER`). |
| Support (admin queue/notes/canned/SLA/KB) | **Done** | Admin ticket queue (reply, status/priority, categorise, assign, internal notes); **ticket archive (storage) + permanent delete**; **category (SLA) + canned-response CRUD**; SLA breach computation; `support.*` permissions. |
| Platform (audit query, notifications, alerts, health, metrics) | **Done** | Prometheus `/metrics`, `/health`. |
| REST + GraphQL + Swagger | **Done** | REST primary; code-first GraphQL mirrors key reads; Swagger at `/docs`. |

## node-agent (detail)

| Area | Status | Notes |
|------|--------|-------|
| `Runtime` interface + Manager | **Done** | Routes by `DeployMethod`. |
| DockerRuntime | **Done** | SDK: image pull, install container, limited create, log demux, live stats, update. |
| NativeRuntime | **Done** | os/exec, ring-buffer console fan-out, startup detect, graceful stop. |
| Resource limits (cgroups v2 / Job Objects) | **Done** | Build-tagged `limits_linux.go` / `limits_windows.go` (+ noop). |
| WindowsContainerRuntime | **Partial** | Interface-complete skeleton; HCS mechanics `TODO(impl)`. |
| SandboxRuntime | **Planned** | Deploy method defined; dedicated impl pending. |
| Control API (signed) + WS hub | **Done** | HMAC verify + replay window; `{type,payload}` protocol. |
| File manager (jailed) | **Done** | Path-traversal-safe; tests cover containment. |
| Backups (tar.gz → S3/local) | **Done** | Checksum + progress; completion callback `TODO(impl)`. |
| Embedded SFTP | **Done** | Per-server creds, jailed sessions. |
| Stats reporter | **Done** | Per-server + node heartbeat. |

## Frontend ↔ backend integration

The `web` panel and `panel-api` are now wired across the full UI surface. Beyond
the core (auth, server list/detail/power/reinstall/**game-switch**/variables/
sub-users/schedules, tickets, billing, WebSocket console), the backend now also
serves the server sub-resources (`files`, `backups`, `databases`, `stats`,
`sftp`, command/startup/upgrade) and the `account`, `admin` (incl. the
GameTemplate "egg editor"), `catalog`, `orders`, and `dashboard` surfaces. The
authoritative route-by-route map is **[17 — Integration Map](17-integration-map.md)**.
Remaining `// TODO(impl)` on these paths is external wiring (live payment
capture, real DB-host provisioning, SFTP credential push), not missing routes.

## What is deliberately *not* done

These require live infrastructure, external accounts, or sustained hardening
beyond a single build session, and are called out so expectations are clear:

- **Real payment-processor end-to-end** — gateways are now editable in-panel
  (encrypted keys) and the Stripe webhook settles invoices/checkouts idempotently;
  live Stripe/PayPal still needs real keys + a registered webhook endpoint, and
  deep SDK flows (e.g. SCA edge cases) remain `TODO(impl)`.
  **PayPal recurring** uses the Subscriptions API: a fixed-price order paid with
  PayPal lazily creates a PayPal catalog product + billing plan (persisted on
  Product/Price) and a subscription, then auto-bills each cycle; the
  `PAYMENT.SALE.COMPLETED` webhook settles each period invoice + provisions, and
  `BILLING.SUBSCRIPTION.*` events mirror cancel/suspend/expire. Enable those
  webhook events in the PayPal app, and verify the flow in PayPal **sandbox**
  before going live. PayPal subscriptions are billed at the plan (tax-free) price
  and don't combine with coupons/gift cards/credit or per-slot (voice) orders —
  those fall back to the existing one-time PayPal checkout.
- **Production secrets/TLS** between panel and agents (self-signed by default).
  Panel→agent **certificate pinning is available** (`AGENT_TLS_PINNING` + pin per
  node); full mutual-TLS with panel client certs is the remaining `TODO(impl)`.
  Host ports bind to loopback by default (`BIND_HOST`); a reverse proxy terminates
  TLS. Panel↔agent mTLS pinning is still `TODO(impl)`.
- **TeamSpeak 3 slot-cap enforcement** — voice orders provision the official
  `teamspeak` Docker image, and the purchased slot count is injected into the
  container env (`TS3SERVER_MAX_CLIENTS` / `SLOTS`) and the voice port is the
  assigned allocation. TeamSpeak applies the per-virtual-server slot limit via
  **ServerQuery**, so wiring the env value to `virtualserver_maxclients` (and
  surfacing the first-boot ServerQuery admin token / privilege key) is the
  remaining `TODO(impl)`; beyond 32 slots also needs a TeamSpeak license.
- **Load/scale validation** to the "tens of thousands of servers" target —
  the architecture (docs 01/09) supports it; it has not been benchmarked.
- **OpenSearch indexing, migration importers** (Pterodactyl/AMP/TCAdmin) —
  designed (docs 11) with `TODO(impl)` stubs. (Transactional email delivery for
  password reset / verification is implemented via nodemailer/SMTP.)
- **Test coverage** — 150 unit + 47 e2e (panel-api) and security-critical agent
  paths are covered; broader coverage (esp. the modpack installer and web E2E) is
  still growing.
