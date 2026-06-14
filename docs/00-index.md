# ReFx Hosting — Documentation

ReFx Hosting is a production-grade, multi-OS, multi-game server hosting platform
with a GPortal-style game-switching model: a customer buys a server slot once and
swaps the installed game underneath a stable server identity (URL, SFTP user,
backups, billing subscription).

This documentation set is the authoritative description of the system. It is kept
consistent with the canonical data model in
[`database/prisma/schema.prisma`](../database/prisma/schema.prisma) and the root
[`README.md`](../README.md). Where code is incomplete, the
[status matrix](16-status.md) records what is implemented versus scaffolded.

## Deployables at a glance

| Component   | Tech                                            | Ports / endpoints                          |
|-------------|-------------------------------------------------|--------------------------------------------|
| `panel-api` | NestJS, Prisma, PostgreSQL, Redis/BullMQ        | `:4000` — REST `/api/v1`, GraphQL `/graphql`, Swagger `/docs` |
| `web`       | Next.js 14, TypeScript, Tailwind, shadcn/ui     | `:3000`                                     |
| `node-agent`| Go single static binary (Linux + Windows)       | `:8443` TLS + WebSocket, SFTP `:2022`      |
| `shared`    | TypeScript types + generated OpenAPI client     | library (consumed by `web`)                |

## Documentation map

### Architecture & data
- [01 — System Architecture](01-architecture.md) — component diagram, request/data flows, panel↔agent protocol, multi-region topology, scaling model.
- [02 — Database Schema](02-database.md) — schema by domain, ER diagram, design decisions (UUID v7, money minor units, soft deletes, game-switch identity).
- [03 — API Specification](03-api.md) — REST + GraphQL: auth, versioning, pagination, errors, rate limits, webhooks, endpoint tables, examples.
- [17 — Integration Map](17-integration-map.md) — authoritative web↔panel-api route mapping and the frontend/backend convergence plan.

### Application tiers
- [04 — Frontend Architecture](04-frontend.md) — Next.js App Router, route groups, data fetching, design system, websocket console.
- [05 — Backend Architecture](05-backend.md) — NestJS modules, request lifecycle, BullMQ workers, technology rationale.
- [06 — Node Agent Architecture](06-node-agent.md) — Go agent, bootstrap handshake, protocol, `Runtime` abstraction, console/files/backups/SFTP/stats.

### Domain subsystems
- [07 — Billing Architecture](07-billing.md) — product/price/subscription/invoice/payment model, gateway abstraction, dunning, tax, suspension lifecycle.
- [08 — Security Architecture](08-security.md) — authN/authZ, encryption, API security, OWASP, audit trails, node trust model.
- [10 — Game Templates ("Eggs")](10-game-templates.md) — template JSON schema, variables, install scripts, config rendering, game switching, Minecraft/Rust walkthroughs.

### Platform & operations
- [09 — Infrastructure & Scaling](09-infrastructure.md) — horizontal scaling, HA, queues, observability, Compose vs Kubernetes, multi-DC, backup/DR.
- [11 — Migration Tooling](11-migration.md) — importing from Pterodactyl, AMP, TCAdmin; mapping tables.
- [12 — CI/CD](12-cicd.md) — GitHub Actions pipelines, image publishing, agent cross-compilation, promotion.

### Status & runbooks
- [16 — Implementation Status](16-status.md) — honest implemented-vs-scaffolded matrix.
- [18 — Installation Guide](18-installation.md) — local Docker Compose, env vars, node agent install (Linux/Windows), node registration.
- [19 — Production Deployment](19-production-deployment.md) — Kubernetes via Helm, secrets, scaling, observability, backups, upgrades.
- [20 — Upgrade & Data Migration](20-upgrade-migration.md) — Prisma migrations, zero-downtime rollouts, agent compatibility, rollback.

### Project & governance (repo root)
- [CLAUDE.md](../CLAUDE.md) — fast orientation for assistants/humans: architecture, build/test commands, conventions, gotchas.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — setup, the per-component green-build bar, DB-change and game-template workflows.
- [SECURITY.md](../SECURITY.md) — private vulnerability disclosure, scope, security model summary, operator hardening checklist.

## Conventions used throughout

- **Identifiers** — all primary keys are UUID v7 (time-sortable, generated app-side).
- **Money** — stored as integer minor units (cents) plus an ISO 4217 currency code; never floats.
- **Soft deletes** — `deletedAt` timestamps; hard deletes are reserved for GDPR erasure.
- **Auditing** — every mutating action is mirrored into `AuditLog`.
- **Terminology** — entity and enum names match `schema.prisma` exactly (e.g. `Server`, `GameTemplate`, `Subscription`, `ServerState`, `DeployMethod`).

## Glossary

| Term | Meaning |
|------|---------|
| **Server** | A persistent, billable game-server slot with stable identity (`shortId`, SFTP user, backups, subscription). |
| **GameTemplate** | A versioned, JSON-driven game definition ("egg" superset): startup command, variables, images, install script. |
| **Game switch** | Replacing the `GameTemplate` under a `Server` while preserving its identity and (optionally) data. |
| **Node** | A physical/virtual host (Linux or Windows) running the `node-agent`. |
| **Allocation** | An `IP:port` binding assignable to a `Server`. |
| **DeployMethod** | How a server runs: `DOCKER`, `NATIVE_PROCESS`, `WINDOWS_CONTAINER`, `SANDBOX`. |
| **SubUser** | A user granted scoped, per-server permissions by the owner. |
