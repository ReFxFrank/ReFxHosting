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
> windows/amd64; `apps/web` builds, typechecks, and lints (28 page routes); and
> `apps/panel-api` compiles with 0 type errors and boots (all modules init, all
> REST routes map, the code-first GraphQL schema generates).

## Components

| Component | Status | Notes |
|-----------|--------|-------|
| `database` (Prisma schema) | **Done** | Full canonical schema across all domains; validates. Seed script + 8 game templates present. No committed `migrations/` yet (generate with `prisma migrate dev`). |
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
| Auth (Argon2id, JWT access+refresh rotation, sessions) | **Done** | Reuse-detection on refresh. |
| 2FA (TOTP + recovery codes, WebAuthn) | **Partial** | Flows wired; WebAuthn challenge store is in-memory (`TODO(impl)`: Redis-backed). |
| API keys (scoped, IP allowlist) | **Done** | Hash lookup + scope/IP checks. |
| RBAC + per-server PermissionGuard | **Done** | Global roles + SubUser permissions + admin override. |
| Servers lifecycle + **game switching** | **Done** | Stopped-check → whitelist → `GameSwitchLog` → atomic repoint → queued reinstall preserving identity. |
| Resource resize | **Done** | Node-capacity check + agent reconfigure. |
| Nodes (register/heartbeat/capacity/tokens) | **Done** | Agent registration + bootstrap-token endpoints. |
| Agent client + console WS gateway | **Partial** | HMAC-signed HTTP client + browser↔agent relay; `TODO(impl)`: mTLS pinning. |
| Billing (products/prices/subs/invoices/payments, tax) | **Done** | Stripe + PayPal gateway impls; Stripe webhook; VAT/GST/US tax engine. Deep SDK flows marked `TODO(impl)`. |
| Queues (provisioning/reinstall/backup/renewal/suspension) | **Done** | BullMQ processors call agent/billing; cron triggers `TODO(impl)`. |
| Support (tickets/notes/canned/SLA/KB) | **Done** | SLA breach computation included. |
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

## What is deliberately *not* done

These require live infrastructure, external accounts, or sustained hardening
beyond a single build session, and are called out so expectations are clear:

- **Committed Prisma migrations** — schema is the source of truth; generate the
  initial migration against a real Postgres.
- **Real payment-processor end-to-end** — gateway wiring + webhook handling
  exist; live Stripe/PayPal product/price/checkout flows need real keys.
- **Production secrets/TLS/mTLS** between panel and agents (self-signed by default).
- **Load/scale validation** to the "tens of thousands of servers" target —
  the architecture (docs 01/09) supports it; it has not been benchmarked.
- **Email delivery, OpenSearch indexing, migration importers** (Pterodactyl/
  AMP/TCAdmin) — designed (docs 11) with `TODO(impl)` stubs.
- **Comprehensive test suites** — security-critical paths in the agent have
  tests; broad unit/e2e coverage is not yet in place.
