# ReFx Hosting — Database Seed

This directory contains the idempotent database seed for ReFx Hosting:

```
database/seed/
├── seed.ts            # Prisma seed script (TypeScript, run via ts-node)
├── templates/*.json   # Game template ("egg") definitions, one file per game
└── README.md          # this file
```

The seed is **idempotent** — it uses `upsert` on natural unique keys (user
email, region code, node FQDN, category/product/template slug, the
`(productId, interval, currency)` and `(templateId, envName)` composite keys,
etc.), so you can re-run it safely against an existing database.

## What gets seeded

- **1 OWNER user** — `owner@refx.example`, `globalRole = OWNER`, `state = ACTIVE`,
  email verified, with an argon2id-hashed password.
- **1 Region** (`eu-central` / "EU Central" / `DE`) and **1 Node**
  (`node-fra-01.refx.example`, `LINUX`, `ONLINE`, ports 8443/2022) plus a small
  block of **Allocations**.
- **Ticket categories** — Billing, Technical, Abuse, General (each with SLA
  targets in minutes).
- **Game categories** — Survival, Sandbox, Shooter.
- **Products** — three `GAME_SERVER` tiers with `Price` rows for MONTHLY /
  QUARTERLY / ANNUAL in USD (and MONTHLY in EUR for two of them). Amounts are
  integer minor units (cents).
- **Game templates** — every `templates/*.json` file is parsed and upserted into
  `GameTemplate` + its `TemplateVariable` rows, linked to a `GameCategory` by the
  JSON `category` slug.

## Prerequisites

- Node.js >= 20
- A reachable PostgreSQL instance
- `DATABASE_URL` exported (the same var `schema.prisma` reads), e.g.

  ```bash
  export DATABASE_URL="postgresql://refx:refx@localhost:5432/refx?schema=public"
  ```

The seed depends on `@prisma/client`, `argon2`, and `ts-node` — all already
present in `apps/panel-api`'s dependencies. Run the commands below from the
`apps/panel-api` workspace (so those node_modules resolve), or from the repo
root if your tooling hoists them.

## Environment variables

| Variable               | Default        | Purpose                                              |
| ---------------------- | -------------- | ---------------------------------------------------- |
| `DATABASE_URL`         | _(required)_   | PostgreSQL connection string used by Prisma.         |
| `SEED_OWNER_PASSWORD`  | `ChangeMe!123` | Plaintext password hashed (argon2id) for the OWNER.  |
| `SEED_NODE_TOKEN`      | `refx_node_sample_bootstrap_token` | Sample node bootstrap token; its argon2 hash is stored. |

> Change `SEED_OWNER_PASSWORD` (and the node token) before seeding anything that
> is not a throwaway local database.

## Running the seed

1. Generate the Prisma client and apply migrations:

   ```bash
   # from apps/panel-api
   npm run prisma:generate
   npm run prisma:migrate
   ```

2. Run the seed, either through Prisma's hook or directly:

   ```bash
   # Option A — via Prisma (uses the package.json "prisma.seed" config, below)
   npx prisma db seed --schema ../../database/prisma/schema.prisma

   # Option B — directly with ts-node
   npx ts-node ../../database/seed/seed.ts
   ```

### package.json `prisma.seed` config

To let `npx prisma db seed` find the script, add this block to the package.json
that owns the Prisma toolchain (e.g. `apps/panel-api/package.json`):

```jsonc
{
  "prisma": {
    "seed": "ts-node database/seed/seed.ts"
  }
}
```

Adjust the relative path to point at this file from wherever you run
`prisma db seed` (from the repo root it is `database/seed/seed.ts`; from
`apps/panel-api` it is `../../database/seed/seed.ts`).

## Adding a new game template

1. Drop a new `your-game.json` file into `templates/`. Copy an existing file
   (e.g. `minecraft-paper.json`) as a starting point.
2. Fill in the fields. The JSON shape maps 1:1 onto Prisma:

   | JSON key          | Prisma field (`GameTemplate`)        | Notes |
   | ----------------- | ------------------------------------ | ----- |
   | `name`            | `name`                               | |
   | `slug`            | `slug` (unique)                      | upsert key |
   | `author`          | `author`                             | |
   | `description`     | `description`                        | optional |
   | `category`        | linked `GameCategory.slug`           | must exist (survival / sandbox / shooter) |
   | `deployMethods`   | `deployMethods` (`DeployMethod[]`)   | `DOCKER`, `NATIVE_PROCESS`, `WINDOWS_CONTAINER`, `SANDBOX` |
   | `supportsLinux`   | `supportsLinux`                      | |
   | `supportsWindows` | `supportsWindows`                    | |
   | `dockerImages`    | `dockerImages` (JSON map)            | label → image ref |
   | `steamAppId`      | `steamAppId`                         | number or `null` |
   | `startupCommand`  | `startupCommand`                     | `{{VAR}}` interpolation |
   | `startupDetect`   | `startupDetect`                      | regex/string watched on stdout |
   | `stopCommand`     | `stopCommand`                        | RCON command / `^C` / signal |
   | `installScript`   | `installScript` (JSON)               | `{container, entrypoint, script}` |
   | `configFiles`     | `configFiles` (JSON array)           | file specs |
   | `recCpuCores`     | `recCpuCores`                        | |
   | `recMemoryMb`     | `recMemoryMb`                        | |
   | `recDiskMb`       | `recDiskMb`                          | |
   | `variables[]`     | `TemplateVariable[]`                 | see below |

   Each entry in `variables[]` maps to a `TemplateVariable`:
   `envName`, `displayName`, `description`, `type`
   (`STRING` / `NUMBER` / `BOOLEAN` / `ENUM` / `SECRET`), `defaultValue`,
   `rules` (JSON validation object), `userEditable`, `userViewable`, `sortOrder`.

3. If you introduce a new `category` slug, add it to `seedGameCategories()` in
   `seed.ts` first (otherwise the template is left uncategorized and a warning
   is printed).
4. Re-run the seed. New templates are inserted; existing ones (matched by `slug`)
   are updated in place, as are their variables (matched by `envName`).

## Notes

- Primary keys are UUID v7, generated app-side by the inline `uuidv7()` helper in
  `seed.ts`. The panel-api currently pins `uuid` ^9 (which lacks `v7`); once it
  moves to `uuid` >= 10 the helper can be swapped for `import { v7 } from 'uuid'`.
- Money is stored as integer minor units (cents) plus an ISO 4217 currency code.
- Secrets (owner password, node bootstrap token) are stored only as argon2id PHC
  hashes — the plaintext never lands in the database.
