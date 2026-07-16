# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is

ReFx Hosting — a multi-OS, multi-game **server hosting platform** (Pterodactyl /
AMP / GPortal alternative) with GPortal-style game switching, integrated billing,
and a custom cross-platform node agent. Monorepo, AGPL-3.0. A native **iOS app**
and a Windows companion ("ReFx Remote") consume the same panel-api.

## Architecture in one screen

```
apps/panel-api   NestJS + Prisma 7 + Redis/BullMQ — central brain (REST + GraphQL)  :4000
apps/web         Next.js 16 + Tailwind + shadcn/ui — customer & admin panel         :3000
apps/node-agent  Go single binary — runs game servers on Linux/Windows nodes        :8443 / :2022
packages/shared  TS contract: enums, panel↔agent WS protocol, permissions, DTOs
database/prisma  schema.prisma = canonical data model (+ migrations/, seed/)
database/seed    idempotent seed: game templates (eggs), products/tiers, roles, KB
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
npm test                   # unit (Jest) — ~630+ tests, keep them green
npm run test:e2e           # integration (supertest, mocked I/O)
npx tsc --noEmit -p tsconfig.build.json   # typecheck

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
- **IDs**: UUID v7 (time-sortable), generated app-side (`common/util/uuid`).
- **Secrets at rest** (TOTP seeds, SFTP/DB passwords, gateway/S3 keys): AES-256-GCM
  via `apps/panel-api/src/common/crypto`. Key = `SECRETS_ENC_KEY` (64-hex).
- **Auth**: Argon2id passwords; JWT access+refresh with refresh rotation;
  TOTP + WebAuthn (passkeys); scoped API keys. Mobile registers APNs device
  tokens via `POST /account/push-tokens`.
- **AuthZ**: global roles (CUSTOMER/SUPPORT/ADMIN/OWNER) + per-server `SubUser`
  permissions (see `packages/shared/src/permissions.ts`). Wildcards like `files.*`
  are honored. Per-server access (the `PermissionGuard`) is owner / active
  sub-user, PLUS a staff support override gated on the admin `servers.manage`
  capability (ADMIN/OWNER) — read-only staff (`servers.read` only) do NOT get it.
  A customer's servers never appear in a staff member's OWN client dashboard/list
  (`ServersService.list` + dashboard are scoped); staff reach them via the admin
  Servers list ("Manage" → the standard server screens). Admin capabilities are a
  fine-grained catalog in `apps/panel-api/src/common/permissions.ts`
  (`@RequirePerm` + `AdminPermissionGuard`); `area.manage` implies `area.read`.
  Mirror any new capability in seed.ts SYSTEM_ROLES + the web roles page.
- **API envelope**: authenticated responses are wrapped `{ success, data }`
  (`common/interceptors/transform.interceptor.ts`); a payload with a `meta` key is
  spread → paginated lists are `{ success, data:[...], meta }`. `@RawResponse()`
  opts a route out (the whole `/agent/*` surface does). **BigInt serializes as a
  JSON number** (`main.ts` patches `BigInt.toJSON`). `204` sends no body/envelope.
- **Every mutating action** should be mirrored into `AuditLog` (`@Audit(...)`).
- **Health/metrics** are mounted at the ROOT (`/health`, `/metrics`), excluded
  from the `/api/v1` prefix — don't probe them under the prefix.
- `// TODO(impl):` marks genuine external-integration extension points. The
  honest implemented-vs-stubbed matrix is `docs/16-status.md` — update it when
  you change what's real.

## Subsystems worth knowing

- **Live console** (`apps/panel-api/src/agent/console.gateway.ts`): Socket.IO
  namespace **`/ws/console`**, path `/socket.io/`, auth = access token in
  `handshake.auth.token`. Client emits `subscribe {serverId}` then `command
  {command}`; server emits `subscribed`, `console` (`{type,seq,line,stream,at}`),
  `console_history` (batched backlog replayed on subscribe), `stats`, `power`,
  `error`. Lines flow agent → `agent-callbacks.controller.ts` → gateway. Backlog
  is a Redis ring buffer (`ConsoleHistoryService`, `CONSOLE_HISTORY_MAX`/`_TTL`);
  every line carries a monotonic per-server `seq` for client dedup.
- **Backups**: local (node disk) or offsite **S3/R2** ("Express Backups" add-on).
  Admins can comp R2 per-server; agent confirms the storage it actually used.
- **Schedules**: cron in the **owner's `User.timezone`**; changing the timezone
  recomputes every active schedule's `nextRunAt`. Tasks are multi-step
  (COMMAND/POWER/BACKUP with offsets). Runner = `schedule.runner.ts`.
- **Notifications**: durable in-app feed (`/account/notifications`, read by web +
  desktop) AND APNs push (mobile). Server-state transitions (online/offline/crash/
  suspend) fan out to both via `agent-callbacks.controller.ts applyServerState`,
  throttled per server+state.
- **Bug reports** (`src/bugs`): customer submission + native admin triage board.
- **Server "Update" vs "Reinstall"**: `POST /servers/:id/update` is a reinstall
  with **data preserved** (the safe, first-class "pull latest build" action);
  `POST /servers/:id/reinstall` is the danger-zone variant. Both re-run the egg's
  install script; reinstall reads `installScript` **live from the GameTemplate**,
  so egg edits reach existing servers on the next (re)install.

## Eggs / game templates (SteamCMD safety)

Game templates ("eggs") live in `database/seed/templates/*.json` and are **upserted
by the seed on every `update-panel.sh`** (see Deploy). Editing an egg's
`installScript` there is how you change install/update behavior fleet-wide — no
agent release needed.

- SteamCMD eggs must **never silently claim success**. Each carries injected
  `refx_steam_heal` (drops a stale/partial `appmanifest_<appid>.acf` before the
  update so a stuck app self-heals) and `refx_steam_verify` (HARD-FAILS with
  diagnostics if the app isn't `StateFlags "4"` fully-installed, and clears the
  manifest so the next update recovers). Preserve these when touching steam eggs.
- Pterodactyl-style `configFiles` with empty content are skipped (agent
  `renderConfigFiles`) — writing them used to truncate live configs to 0 bytes.

## Deploy (production)

The operator's host is **Docker-only** (no npm/node/go on the box). Everything
ships by rebuilding containers:

```bash
./infra/scripts/update-panel.sh   # git pull; rebuild `migrate` image (bakes prisma
                                  # migrations + database/seed); run it (applies
                                  # migrations + RE-SEEDS templates/products/roles);
                                  # rebuild + recreate panel-api + web. Data stores
                                  # (postgres/redis/minio) keep running untouched.
```

So panel/web code, schema migrations, and egg/template/seed edits all reach prod
via `update-panel.sh`. Node agents update separately (see Releases).

## Releases (node agents)

Releases are how nodes update: the panel's **"update node"** button (single) and
**"update all agents"** (fleet) call the agent's `/api/v1/system/update`, which
self-updates to the **latest GitHub release** binary (`refx-agent-<os>-<arch>` +
`.sha256`).

- **Cut a release** by pushing a semver tag `vX.Y.Z` to `origin`, or run the
  `Release` workflow via **`workflow_dispatch`** (input `version` = `vX.Y.Z`).
  `.github/workflows/release.yml` cross-compiles the agent binaries, publishes the
  GitHub Release with those assets, and pushes Docker images to ghcr. Don't
  hand-build/upload assets — asset names must match what `resolveAgentAsset` expects.
- **Standing policy:** whenever a change to the node/agent system lands on `main`
  (anything under `apps/node-agent`, or panel↔agent protocol/behavior nodes pull
  via self-update), **cut a new release** so operators can update from the panel.
  Bump the patch for fixes, the minor for features; tag `main` HEAD. Pure
  template/panel/web changes do NOT need a release.

## Schema & migrations (Prisma 7)

- Config is `apps/panel-api/prisma.config.ts` (Prisma 7 dropped the `schema`
  block from package.json). Generate: `npm run prisma:generate`; create a
  migration: `npm run prisma:migrate` (`prisma migrate dev`).
- CI (`.github/workflows/ci.yml`) applies the full migration chain with
  `prisma migrate deploy`, then **fails on drift** via
  `prisma migrate diff … --to-config-datasource --exit-code` (note: the Prisma 7
  flag is `--to-config-datasource`, NOT the removed `--to-schema-datamodel`).
  A green schema means migrations and `schema.prisma` agree — keep it that way.

## Gotchas

- `NEXT_PUBLIC_API_URL` is baked into the web bundle at **build** time — set it
  before building the web image, not just at runtime. It is the bare origin
  (e.g. `https://api.refx.gg`); REST lives under `/api/v1`, but Socket.IO
  (`/ws/console`) and `/health`+`/metrics` do NOT.
- The web Docker build context is `apps/web` (self-contained); panel-api's is the
  repo root (it needs `database/prisma`).
- OpenSearch may need `vm.max_map_count=262144` on the host.
- The node agent is NOT deployed by Kubernetes — it's installed on bare nodes via
  `infra/scripts/install-node.{sh,ps1}`.
- Install containers run as **root**; the runtime chowns the data dir to the game
  uid on start. SteamCMD's "Missing file permissions" is almost always a stale
  appmanifest or low disk, NOT a real perms wall (see egg safety above).

## Don't

- Don't hand-edit `database/prisma/migrations/*/migration.sql` — generate via Prisma.
- Don't put model identifiers / internal-only notes into committed artifacts
  (commit messages, code comments, PR bodies).
- Don't break the green builds: run the relevant test/build/typecheck command
  before committing.
- Don't strip the `refx_steam_*` safety helpers or re-add empty `configFiles`
  when editing eggs.
