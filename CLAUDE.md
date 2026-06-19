# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is

ReFx Hosting — a multi-OS, multi-game **server hosting platform** (Pterodactyl /
AMP / GPortal alternative) with GPortal-style game switching, integrated billing,
and a custom cross-platform node agent. Monorepo, AGPL-3.0.

## Architecture in one screen

```
apps/panel-api   NestJS + Prisma + Redis/BullMQ — central brain (REST + GraphQL)   :4000
apps/web         Next.js 14 + Tailwind + shadcn/ui — customer & admin panel        :3000
apps/node-agent  Go single binary — runs game servers on Linux/Windows nodes       :8443 / :2022
packages/shared  TS contract: enums, panel↔agent WS protocol, permissions, DTOs
database/prisma  schema.prisma = canonical data model (+ migrations/, seed/)
infra/           docker (compose + observability), k8s (Helm chart), scripts
docs/            complete architecture + ops documentation (start at docs/00-index.md)
```

The **canonical source of truth for data** is `database/prisma/schema.prisma`.
Keep `packages/shared/src/enums.ts` in lock-step with it.

The signature feature is **game switching**: a `Server` keeps its identity
(`shortId`, SFTP, backups, subscription) while its `GameTemplate` is swapped.
The orchestration lives in `apps/panel-api/src/servers/` (look for `switch-game`).

The node agent's design centers on a single `Runtime` interface
(`apps/node-agent/internal/runtime/runtime.go`) with `DockerRuntime` and
`NativeRuntime` (native process hosting) behind it — this is the deliberate
differentiator vs. Wings. Do NOT couple agent logic to Docker specifically.

## Build / test / run

```bash
# Whole stack (lean default profile):
docker compose -f infra/docker/docker-compose.yml up -d
# everything incl. observability + opensearch:  --profile full

# panel-api
cd apps/panel-api && npm install && npm run prisma:generate
npm run start:dev          # needs Postgres + Redis
npm test                   # unit (Jest)
npm run test:e2e           # integration (supertest, mocked I/O)

# web
cd apps/web && npm install && npm run dev    # next dev
npm run build && npm run typecheck && npm run lint

# node-agent
cd apps/node-agent && go build ./... && go vet ./... && go test ./...
# cross-compile: GOOS=windows GOARCH=amd64 go build ./cmd/refx-agent

# shared
cd packages/shared && npm run typecheck

# schema
npx prisma validate --schema database/prisma/schema.prisma
```

## Conventions

- **Money**: integer minor units (cents) + ISO currency code. Never floats.
- **IDs**: UUID v7 (time-sortable), generated app-side.
- **Secrets at rest** (TOTP seeds, SFTP/DB passwords): AES-256-GCM via
  `apps/panel-api/src/common/crypto`. Key = `SECRETS_ENC_KEY` (64-hex).
- **Auth**: Argon2id passwords; JWT access+refresh with refresh rotation;
  TOTP + WebAuthn; scoped API keys.
- **AuthZ**: global roles (CUSTOMER/SUPPORT/ADMIN/OWNER) + per-server `SubUser`
  permissions (see `packages/shared/src/permissions.ts`). Wildcards like `files.*`
  are honored. Per-server access (the `PermissionGuard`) is owner / active
  sub-user, PLUS a staff support override gated on the admin `servers.manage`
  capability (ADMIN/OWNER) — read-only staff (`servers.read` only) do NOT get it.
  A customer's servers never appear in a staff member's OWN client dashboard/list
  (`ServersService.list` + dashboard are scoped); staff reach them via the admin
  Servers list ("Manage" → the standard server screens).
- **Every mutating action** should be mirrored into `AuditLog`.
- **Health/metrics** are mounted at the ROOT (`/health`, `/metrics`), excluded
  from the `/api/v1` prefix — don't probe them under the prefix.
- `// TODO(impl):` marks genuine external-integration extension points. The
  honest implemented-vs-stubbed matrix is `docs/16-status.md` — update it when
  you change what's real.

## Gotchas

- `NEXT_PUBLIC_API_URL` is baked into the web bundle at **build** time — set it
  before building the web image, not just at runtime.
- The web Docker build context is `apps/web` (self-contained); panel-api's is the
  repo root (it needs `database/prisma`).
- OpenSearch may need `vm.max_map_count=262144` on the host.
- The node agent is NOT deployed by Kubernetes — it's installed on bare nodes via
  `infra/scripts/install-node.{sh,ps1}`.

## Releases

Releases are how nodes update: the panel's **"update node"** button calls the
agent's `/api/v1/system/update`, which self-updates to the **latest GitHub
release** binary (`refx-agent-<os>-<arch>` + `.sha256`).

- **Cut a release by pushing a semver tag** `vX.Y.Z` to `origin` (or run the
  `Release` workflow via `workflow_dispatch`). `.github/workflows/release.yml`
  cross-compiles the agent binaries, publishes the GitHub Release with those
  assets, and pushes the Docker images to ghcr. Don't hand-build/upload assets —
  the asset names must match exactly what `resolveAgentAsset` expects.
- **Standing policy:** whenever a change to the node/agent system lands on `main`
  (anything under `apps/node-agent`, or panel↔agent protocol/behavior nodes pull
  via self-update), **cut a new release** so operators can update from the panel.
  Bump the patch for fixes, the minor for features; tag `main` HEAD.

## Don't

- Don't hand-edit `database/prisma/migrations/*/migration.sql` — generate via Prisma.
- Don't put model identifiers / internal-only notes into committed artifacts.
- Don't break the green builds: run the relevant test/build command before committing.
