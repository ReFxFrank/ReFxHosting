# ReFx Hosting

> A modern, multi-OS, multi-game **server hosting platform** — a production-grade
> alternative to Pterodactyl, AMP, and GPortal with a GPortal-style game-switching
> model, integrated billing, helpdesk, and a custom cross-platform node agent.

[![CI](https://github.com/refxfrank/refxhosting/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

---

## What this is

ReFx Hosting lets customers **buy a server slot once and change the installed
game without redeploying**. A server has a stable identity (URL, SFTP user,
backups, billing plan) while the game software underneath can be swapped between
Minecraft, Rust, ARK, Valheim, Palworld, CS2, FiveM, and more.

It is built as a **monorepo** with four deployables:

| Component   | Tech                                   | Role |
|-------------|----------------------------------------|------|
| `panel-api` | NestJS · Prisma · PostgreSQL · Redis   | Central brain: auth, billing, RBAC, REST + GraphQL, queues |
| `web`       | Next.js 14 · TypeScript · Tailwind · shadcn/ui | Customer + admin web panel |
| `node-agent`| Go (single static binary)              | Runs on every Linux/Windows node: containers, native processes, console, files, backups, SFTP |
| `shared`    | TypeScript types + OpenAPI client      | Contract shared between `web` and `panel-api` |

> ### Honest status
> This repository is a **complete architecture + working foundation**, not a
> finished commercial SaaS. The design docs (`/docs`) are complete and
> authoritative. The code implements the core skeleton end-to-end (schema,
> auth, server/node lifecycle, agent protocol, billing models, infra) with
> clearly-marked `// TODO(impl)` extension points. See
> [`docs/16-status.md`](docs/16-status.md) for the exact implemented-vs-stubbed
> matrix.

---

## Why these technologies

- **NestJS (panel-api)** — chosen over ASP.NET Core and Go Fiber because the
  panel is dominated by *I/O-bound orchestration and business logic*, not raw
  compute. NestJS gives us a batteries-included modular architecture (DI,
  guards, interceptors, validation), first-class **REST + GraphQL** in one app,
  BullMQ queue integration, and — critically — **shared TypeScript types with
  the Next.js frontend**, eliminating an entire class of contract drift. Raw
  throughput lives in the node agent instead.
- **Go (node-agent)** — single static binary, trivial cross-compilation to
  Linux and Windows, excellent concurrency for log streaming / file transfer,
  and a first-party Docker SDK. No runtime to install on customer nodes.
- **PostgreSQL + Prisma** — relational integrity for billing, type-safe access.
- **Redis + BullMQ** — cache, rate-limit buckets, and durable job queues
  (provisioning, backups, renewals). RabbitMQ/NATS is the documented scale-out
  path for cross-region fan-out (see `docs/09-infrastructure.md`).

---

## Repository layout

```
refxhosting/
├── apps/
│   ├── panel-api/        # NestJS central panel API (REST + GraphQL)
│   ├── web/              # Next.js customer & admin panel
│   └── node-agent/       # Go cross-platform node daemon
├── packages/
│   └── shared/           # Shared TS types / generated API client
├── database/
│   ├── prisma/           # schema.prisma (canonical data model)
│   └── seed/             # seed data + sample game templates ("eggs")
├── infra/
│   ├── docker/           # Dockerfiles + docker-compose stack
│   ├── k8s/helm/refx/    # Helm chart for Kubernetes deployment
│   └── scripts/          # install-node.sh / install-node.ps1, bootstrap
├── docs/                 # Full architecture & operations documentation
└── .github/workflows/    # CI/CD pipelines
```

## Quick start (local, Docker Compose)

```bash
git clone https://github.com/refxfrank/refxhosting.git
cd refxhosting
cp .env.example .env            # fill in secrets
docker compose -f infra/docker/docker-compose.yml up -d
# panel:  http://localhost:3000
# api:    http://localhost:4000  (Swagger at /docs, GraphQL at /graphql)
```

See [`docs/18-installation.md`](docs/18-installation.md) for full setup,
[`docs/19-production-deployment.md`](docs/19-production-deployment.md) for
production, and [`docs/00-index.md`](docs/00-index.md) for the documentation map.

## Documentation

| # | Doc | Covers deliverable |
|---|-----|--------------------|
| 01 | [System Architecture](docs/01-architecture.md) | 1 |
| 02 | [Database Schema & ER](docs/02-database.md) | 2, 3 |
| 03 | [API Specification](docs/03-api.md) | 4 |
| 04 | [Frontend Architecture](docs/04-frontend.md) | 5 |
| 05 | [Backend Architecture](docs/05-backend.md) | 6 |
| 06 | [Node Daemon Architecture](docs/06-node-agent.md) | 7 |
| 07 | [Billing Architecture](docs/07-billing.md) | 8 |
| 08 | [Security Architecture](docs/08-security.md) | 10 |
| 09 | [Infrastructure & Scaling](docs/09-infrastructure.md) | 9, 11, 12 |
| 10 | [Game Templates ("Eggs")](docs/10-game-templates.md) | — |
| 11 | [Migration Tooling](docs/11-migration.md) | 20 |
| 12 | [CI/CD](docs/12-cicd.md) | 13 |
| 18 | [Installation](docs/18-installation.md) | 17 |
| 19 | [Production Deployment](docs/19-production-deployment.md) | 19 |

## License

AGPL-3.0 — see [LICENSE](LICENSE).
