# Panel Migration Importer

Self-contained CLI that imports an existing fleet from a competing panel into
ReFx Hosting. It is **not** a Nest module — it instantiates its own
`PrismaClient`, so no module registration is required. See the design doc at
[`docs/11-migration.md`](../../../../docs/11-migration.md).

Currently shipping: **Pterodactyl** (via the Application API).
Stubs (interface-complete, throw `NotImplementedError`): **AMP**, **TCAdmin**.

## Architecture

```
sources/source.interface.ts   MigrationSource: fetchUsers/Nodes/Servers/Eggs
sources/pterodactyl.source.ts PterodactylSource implements MigrationSource
sources/amp.source.ts         AmpSource (stub)
sources/tcadmin.source.ts     TcAdminSource (stub)
types.ts                      Normalized IR DTOs + MigrationReport
importer.service.ts           ImporterService: idempotent upsert loader
cli.ts                        runnable CLI entrypoint
```

Each source maps its native model into a **source-agnostic normalized IR**
(`types.ts`). The `ImporterService` consumes only the IR, so the loader has no
knowledge of which panel the data came from. Adding AMP/TCAdmin means filling in
one source class — the pluggable design is real.

## Usage

```bash
cd apps/panel-api

# Dry run — plan only, writes nothing, prints the report.
ts-node src/migration/cli.ts \
  --source pterodactyl \
  --url https://panel.example.com \
  --key ptla_xxxxxxxxxxxxxxxxxxxx \
  --dry-run

# Execute — idempotent load into Postgres.
ts-node src/migration/cli.ts \
  --source pterodactyl \
  --url https://panel.example.com \
  --key ptla_xxxxxxxxxxxxxxxxxxxx

# Limit to a subset of stages.
ts-node src/migration/cli.ts --source pterodactyl --url ... --key ... \
  --only nodes,users
```

Required env:

- `DATABASE_URL` — target ReFx Postgres (consumed by `PrismaClient`).
- `SECRETS_ENC_KEY` — 32-byte AES-256-GCM key as 64 hex chars. Used to encrypt
  newly minted per-server SFTP passwords and per-node bootstrap tokens. If it is
  missing the importer stores a clearly-marked unencrypted placeholder (only
  reachable in misconfigured non-prod runs); real secrets are always re-minted
  on node enrollment / SFTP rotation, so no source secret is ever trusted.

### Flags

| Flag | Meaning |
|------|---------|
| `--source` | `pterodactyl` \| `amp` \| `tcadmin` (required) |
| `--url` / `--api-url` | Source panel base URL (Pterodactyl) |
| `--key` / `--api-key` | Source Application API key (Pterodactyl `ptla_...`) |
| `--dry-run` | Plan only; write nothing |
| `--only` | Comma list limiting stages: `nodes,templates,users,servers` |

Exit code is non-zero when any per-entity error is recorded, or on a fatal error
(connection failure, unknown source, missing flags).

## Pterodactyl Application API key scopes

Generate an **Application API key** (Admin → Application API) with at least
**Read** on:

- Users
- Locations
- Nodes (and node Allocations)
- Servers
- Nests & Eggs

The importer issues only `GET` requests with
`Authorization: Bearer <key>` + `Accept: application/json`. It never writes to
the source. All list endpoints are paginated and every page is followed.

Endpoints used:

```
GET /api/application/users
GET /api/application/locations
GET /api/application/nodes
GET /api/application/nodes/{id}/allocations
GET /api/application/servers?include=allocations,variables
GET /api/application/nests
GET /api/application/nests/{id}/eggs?include=variables
```

## What gets mapped

| Source (Pterodactyl) | ReFx target |
|----------------------|-------------|
| Location | `Region` (`code` = slug of `short`, `country` = `XX` placeholder) |
| Node | `Node` (`fqdn` key, `os = LINUX`, `memoryMb`/`diskMb`, overcommit) |
| Node allocations | `Allocation` (`ip`/`port`, server-linked + `isPrimary` on server import) |
| Nest | `GameCategory` (`slug` key) |
| Egg | `GameTemplate` (`startup`→`startupCommand`, `docker_images`→`dockerImages`, `script_install`+container/entrypoint→`installScript`, `config.startup.done`→`startupDetect`, `config.stop`→`stopCommand`, `config.files`→`configFiles`) |
| Egg variable | `TemplateVariable` (`env_variable`→`envName`, Laravel `rules` parsed into `{min,max,regex,options,required}` + inferred `type`) |
| User | `User` (`root_admin`→`ADMIN`, else `CUSTOMER`; `state = PENDING_VERIFICATION`) |
| Server | `Server` (limits `memory`/`disk`→`memoryMb`/`diskMb`, `cpu%`→`cpuCores`, `swap`→`swapMb`, `io`→`ioWeight`; `suspended`→`state=SUSPENDED`) |
| Server `environment` / variables | resolved `Server.environment` + `ServerVariable[]` overrides |

Deploy method is always `DOCKER` (Pterodactyl is Docker/Linux only).

### Best-effort / imperfect mappings (recorded as report warnings)

- **CPU cores** — Pterodactyl tracks no node-level core count, only oversell. We
  default `Node.cpuCores = 1` and warn; the agent re-advertises real capacity.
- **Region country** — Pterodactyl locations have no country, set to `XX`.
- **Install script container/entrypoint** — defaulted when the egg omits them.
- **Subusers** — not exposed on the Application server endpoint; left empty and
  warned. Backfill later via the client API or a DB source.
- **Primary allocation** — first allocation in the include is treated as primary.

## Idempotency & dry-run

- Every write is an **upsert on a deterministic natural key**: `Region.code`,
  `Node.fqdn`, `Allocation[nodeId,ip,port]`, `GameCategory.slug`,
  `GameTemplate.slug`, `TemplateVariable[templateId,envName]`, `User.email`,
  `Server` (re-run by id, first run by `[ownerId,name]`),
  `ServerVariable[serverId,envName]`, `SubUser[serverId,userId]`.
- An in-memory **`externalRef` → ReFx uuid map** resolves cross-entity links
  (server → owner/node/template/allocation/subuser) and is returned in the
  report's `idMap`.
- Existing `User` rows are **never** silently overwritten (credentials/role are
  preserved; only missing names are filled) — conflicts surface as warnings.
- Re-running the import reconciles in place instead of duplicating.
- `--dry-run` performs **no** database writes; it logs each planned action and
  returns a fully populated count/warning report.

Related writes for a server (server + allocation links + variables + subusers)
are wrapped in a single Prisma transaction.

## Credentials & state

- Source password hashes (bcrypt/etc.) are **not** migrated. Users are created
  `PENDING_VERIFICATION` and must reset via the normal flow. TOTP/WebAuthn are
  re-enrolled.
- Imported servers land in `OFFLINE` (or `SUSPENDED` if suspended at source)
  pending agent reconciliation / optional file move.

## Next: AMP & TCAdmin

`amp.source.ts` and `tcadmin.source.ts` are interface-complete stubs that throw
`NotImplementedError` with `// TODO(impl)` markers describing their data source
(AMP: ADS instance manager + per-instance HTTP API; TCAdmin: read-only MSSQL /
MySQL database). Implement those four methods and the loader works unchanged.
