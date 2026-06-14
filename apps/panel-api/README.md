# ReFx Hosting — panel-api

The central panel API for ReFx Hosting. NestJS (Node 20, TypeScript) exposing a
versioned REST API (`/api/v1`), a code-first GraphQL endpoint (`/graphql`),
Swagger docs (`/docs`), and a WebSocket console gateway. It is the platform's
brain: auth + RBAC, server/node lifecycle, the GPortal-style **game switching**
orchestration, billing, helpdesk, queues, and observability.

## Stack

- **NestJS 10** (Express adapter)
- **Prisma** → `../../database/prisma/schema.prisma` (canonical schema)
- **PostgreSQL** + **Redis** (cache, rate-limit, BullMQ queues)
- **BullMQ** workers: provisioning, reinstall, backups, billing-renewal, suspension
- **JWT** access/refresh with refresh rotation, **TOTP** (otplib), **WebAuthn**
  (@simplewebauthn/server), **API keys** (hashed + scoped + IP-allowlisted)
- **Stripe** / **PayPal** payment gateways
- **@nestjs/swagger** + **@nestjs/graphql** (code-first)

## Prerequisites

- Node 20+
- PostgreSQL 14+ and Redis 6+ reachable (see `.env`)

## Setup

```bash
cd apps/panel-api
cp .env.example .env          # fill in secrets (DATABASE_URL, JWT secrets, SECRETS_ENC_KEY, ...)
npm install
npm run prisma:generate       # generates Prisma Client from ../../database/prisma/schema.prisma

# Apply the schema to a fresh database (run from repo root or here):
npm run prisma:migrate

npm run start:dev
```

The API boots on `http://localhost:4000`:

- REST base path: `http://localhost:4000/api/v1`
- Swagger UI: `http://localhost:4000/docs`
- GraphQL playground: `http://localhost:4000/graphql`
- Health: `http://localhost:4000/health`
- Prometheus metrics: `http://localhost:4000/metrics`

## Generating a secrets key

```bash
openssl rand -hex 32   # paste into SECRETS_ENC_KEY
```

## Project layout

```
src/
  main.ts                 bootstrap (helmet, CORS, pipes, Swagger, GraphQL)
  app.module.ts           root wiring
  config/                 typed configuration
  prisma/                 PrismaModule + PrismaService
  common/                 filters, interceptors, decorators, crypto, pagination
  auth/                   register/login, JWT, TOTP, WebAuthn, API keys, guards
  users/                  profile, admin user management, sub-users
  nodes/                  node registration, heartbeats, capacity, bootstrap tokens
  servers/                CRUD, power, reinstall, GAME SWITCHING, sub-resources
  agent/                  NodeAgentClient (HTTPS) + console WebSocket gateway
  billing/                products, subscriptions, invoices, gateways, webhooks
  support/                tickets, messages, SLA, canned responses, KB
  platform/               audit query, notifications, alerts, health, metrics
  queues/                 BullMQ queue definitions + processors
  graphql/                GraphQL aggregation (scalars)
```

## Notes

Extension points that require real external SDK calls or out-of-scope wiring are
marked with `// TODO(impl): ...`. The core orchestration logic (auth flows,
game-switch sequencing, billing state machine, queue processors) is implemented.
