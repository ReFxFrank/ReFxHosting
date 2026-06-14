# Implementation Status

This is an **honest** implemented-vs-scaffolded matrix for the ReFx Hosting
codebase as it exists in this repository. The architecture and documentation set
are complete and authoritative; the code is a **working foundation** with
clearly-marked extension points (`// TODO(impl)`), not a finished commercial SaaS.
This document records, component by component, what the foundation actually
provides on disk and what remains to be implemented.

Legend:

- **Done** — implemented and wired.
- **Partial** — skeleton/interface present; core path stubbed or incomplete (often
  marked `TODO(impl)`).
- **Scaffold** — directory/contract exists but body is a stub or seed-only.
- **Planned** — designed in docs, no code yet.

> Source of truth for "Done": the files under `apps/`, `database/`, and `infra/`.
> The canonical schema (`database/prisma/schema.prisma`) is complete and is the
> reference for every doc; see [02 — Database](02-database.md).

## Summary by deployable

| Deployable | State | Notes |
|------------|-------|-------|
| `database` (Prisma schema) | **Done** | Full canonical schema across all domains. Seed + 8 game templates present. No committed `migrations/` yet. |
| `panel-api` (NestJS) | **Partial** | Auth, users, crypto, guards/interceptors/filters, agent gateway, billing gateway interfaces, queue constants present. Several domain modules (servers/nodes/templates/backups/schedules/support) not yet broken out. |
| `node-agent` (Go) | **Partial** | `Runtime` interface + Docker/native/Windows/sandbox skeletons, files, panel client, OS abstraction, ring buffer. No `cmd/` entrypoint committed; native/Windows runtimes stubbed. |
| `web` (Next.js) | **Partial** | Design system (shadcn/ui), auth + dashboard layouts, API/WS/auth libs, stores. Most concrete routes not yet built. |
| `shared` | **Planned/Scaffold** | Package referenced in README; no source files present in this tree. |
| `infra/docker` | **Done** | Compose stack + Prometheus/Grafana/Loki config + migrate Dockerfile. |
| `infra/k8s/helm/refx` | **Scaffold** | Chart directory exists but is empty; documented in [19](19-production-deployment.md). |
| `infra/scripts` | **Scaffold/Planned** | Directory exists; `install-node.sh` / `install-node.ps1` not yet committed (designed in [18](18-installation.md)). |
| `.github/workflows` | **Planned** | Directory exists, no workflow files yet; design in [12 — CI/CD](12-cicd.md). |

## panel-api (NestJS) detail

| Area | State | Evidence / notes |
|------|-------|------------------|
| Prisma integration | **Done** | `src/prisma/prisma.{module,service}.ts`. |
| Config | **Done** | `src/config/configuration.ts`, `main.ts` (Swagger `/docs`, GraphQL bootstrap). |
| Auth — login/JWT | **Partial** | `auth.service.ts`, `jwt.strategy.ts`, `jwt-auth.guard.ts`; some `TODO(impl)`. |
| Auth — WebAuthn | **Partial** | `webauthn.service.ts` present, registration/assertion `TODO(impl)`. |
| Auth — TOTP / recovery codes | **Partial** | Crypto present; enrollment/verify paths to complete. |
| Auth — API keys | **Partial** | `api-key.service.ts` present. |
| RBAC + permission guards | **Done** | `roles.guard.ts`, `permission.guard.ts`, decorators (`roles`, `permissions`, `public`, `current-user`). |
| Crypto (AES-256-GCM, hashing) | **Done** | `common/crypto/` (`crypto.service.ts`, `crypto.util.ts`). |
| Exception filter / error envelope | **Done** | `common/filters/all-exceptions.filter.ts`. |
| Interceptors (logging, audit, transform) | **Done** | `common/interceptors/*`. |
| Pagination DTO | **Done** | `common/dto/pagination.dto.ts`. |
| UUID v7 generation | **Done** | `common/util/uuid.ts`. |
| Users + SubUsers | **Partial** | `users.{service,controller,resolver}.ts`, DTOs; `TODO(impl)` in service. |
| Agent gateway / console WS | **Partial** | `agent/console.gateway.ts`, `agent/agent.client.ts`; `TODO(impl)` for live forwarding. |
| Billing gateways | **Partial** | `billing/gateways/{payment-gateway.interface,stripe.gateway,paypal.gateway}.ts`; charge/refund/webhook bodies `TODO(impl)`. |
| Queues | **Scaffold** | `queues/queue.constants.ts` defines queue/job names; processors not yet implemented. |
| Servers module | **Planned** | No `servers/` module yet; lifecycle/provisioning designed in [05](05-backend.md). |
| Nodes module | **Planned** | No dedicated `nodes/` module yet. |
| Templates module | **Planned** | No `templates/` module yet ([10](10-game-templates.md)). |
| Backups / Schedules modules | **Planned** | Not yet present. |
| Support / Tickets module | **Planned** | Not yet present. |
| Audit module (read API) | **Partial** | Audit *interceptor* exists; query API not yet exposed. |
| GraphQL resolvers | **Partial** | Users resolver present; broader GraphQL surface pending. |

## node-agent (Go) detail

| Area | State | Evidence / notes |
|------|-------|------------------|
| `Runtime` interface | **Done** | `internal/runtime/runtime.go`. |
| DockerRuntime | **Partial** | `internal/runtime/docker.go` — primary path, fleshed out furthest. |
| NativeProcessRuntime | **Partial** | `internal/runtime/native.go`, `TODO(impl)`. |
| WindowsContainerRuntime | **Partial** | `internal/runtime/windows_container.go`, `TODO(impl)`. |
| SandboxRuntime | **Planned** | Deploy method defined; dedicated impl pending. |
| Resource limits (cgroups / job objects) | **Partial** | `limits_linux.go`, `limits_windows.go` (`TODO(impl)`), `limits_other.go`, `limits_noop.go`. |
| Runtime manager | **Done** | `internal/runtime/manager.go`. |
| Console ring buffer | **Done** | `internal/runtime/ringbuffer.go`. |
| Server spec model | **Done** | `internal/server/spec.go` (denormalized scoped spec). |
| Panel client + request signing | **Partial** | `internal/panel/client.go`, `internal/panel/signing.go`. |
| File manager | **Partial** | `internal/files/files.go` (jailed ops). |
| OS abstraction layer | **Done** | `internal/osabstraction/*` (Linux/Windows splits). |
| Config + persisted state | **Done** | `internal/config/{config,state}.go`. |
| Bootstrap/registration handshake | **Partial** | Client/config present; full handshake to complete ([06](06-node-agent.md)). |
| WebSocket protocol server | **Partial** | Protocol designed; message dispatch to complete. |
| SFTP server | **Planned** | Designed in [06](06-node-agent.md); not yet committed. |
| Backups (tar → S3) | **Planned** | Designed; not yet committed. |
| `cmd/` entrypoint | **Scaffold** | `cmd/` directory exists; main entrypoint not yet present. |

## web (Next.js) detail

| Area | State | Evidence / notes |
|------|-------|------------------|
| App Router root | **Done** | `app/layout.tsx`, `app/page.tsx`, `globals.css`. |
| Auth route group | **Partial** | `app/(auth)/login/page.tsx`, `(auth)/layout.tsx`. |
| Dashboard route group | **Partial** | `app/(dashboard)/layout.tsx`; child routes (servers/admin/billing) not yet built. |
| Design system (shadcn/ui) | **Done** | `components/ui/*` (button, card, table, dialog, tabs, …), `theme-provider`, dark mode. |
| Layout (sidebar/topnav/nav) | **Done** | `components/layout/*`. |
| API client lib | **Partial** | `lib/api.ts` (`TODO(impl)` endpoints). |
| Auth lib | **Partial** | `lib/auth.ts`, `hooks/use-require-auth.ts`. |
| WebSocket console lib | **Partial** | `lib/ws.ts`; xterm wiring to complete. |
| Types | **Partial** | `lib/types.ts` (`TODO(impl)`); intended to be replaced by `shared` generated client. |
| State stores | **Done** | `store/auth.ts`, `store/ui.ts`. |
| Customer panel routes (servers/console/files) | **Planned** | Structure designed in [04](04-frontend.md). |
| Admin routes (nodes/templates/users) | **Planned** | Designed in [04](04-frontend.md). |
| Billing routes (invoices/subscriptions) | **Planned** | Designed in [04](04-frontend.md). |

## database detail

| Area | State | Evidence / notes |
|------|-------|------------------|
| Canonical schema | **Done** | `database/prisma/schema.prisma` — all domains. |
| Seed script | **Done** | `database/seed/seed.ts`. |
| Game templates ("eggs") | **Done** | 8 JSONs: minecraft-paper, rust, valheim, terraria, cs2, project-zomboid, satisfactory, palworld. |
| Prisma migrations | **Planned** | No `migrations/` committed yet; generated via `prisma migrate` ([20](20-upgrade-migration.md)). |

## infra detail

| Area | State | Evidence / notes |
|------|-------|------------------|
| Docker Compose stack | **Done** | `infra/docker/docker-compose.yml`, `Dockerfile.migrate`, README. |
| Prometheus config | **Done** | `infra/docker/prometheus/prometheus.yml`. |
| Grafana provisioning + dashboard | **Done** | `infra/docker/grafana/...` incl. `refx-overview.json`. |
| Loki config | **Done** | `infra/docker/loki/loki-config.yml`. |
| Helm chart | **Scaffold** | `infra/k8s/helm/refx/` exists but empty; layout/values designed in [19](19-production-deployment.md). |
| Node installers | **Planned** | `install-node.sh` / `install-node.ps1` designed in [18](18-installation.md); not yet committed. |
| CI/CD workflows | **Planned** | `.github/workflows/` empty; design in [12](12-cicd.md). |

## What "foundation" means here

The repository proves the **end-to-end shape** of the system: the data model is
complete, the NestJS app boots with auth/guards/crypto/agent-gateway wiring, the
Go agent has a real `Runtime` abstraction with a working Docker path, the web app
has the design system and shell, and the observability/compose stack runs. The
`TODO(impl)` markers sit on the business-logic bodies (gateway charges, agent
message dispatch, native/Windows runtimes, the per-domain panel modules and
matching frontend routes) rather than on the architecture. Closing them does not
require redesigning anything in this docs set.

## Related documents

- [01 — Architecture](01-architecture.md) — the target system shape.
- [05 — Backend](05-backend.md) — modules/queues to be completed.
- [06 — Node Agent](06-node-agent.md) — agent paths to be completed.
- [12 — CI/CD](12-cicd.md) / [18 — Installation](18-installation.md) /
  [19 — Production Deployment](19-production-deployment.md) — infra to be added.
