# 25 — Database Migrations & Recovery

How schema changes reach production, and the **explicit** operator procedure for
recovering from a failed or drifted migration. The migration runner
(`infra/docker/Dockerfile.migrate`) is **fail-closed**: it never rewrites a
production database automatically.

## How migrations are applied

The one-shot `migrate` container runs `prisma migrate deploy`, which applies any
committed migrations under `database/prisma/migrations/` in order, then runs the
idempotent seed (`database/seed/seed.ts`). Compose runs it before `panel-api`
starts; the Helm chart runs it as a pre-upgrade Job.

Authoring a migration (never hand-edit `migration.sql` — generate it):

```bash
cd apps/panel-api
# edit database/prisma/schema.prisma, then:
npx prisma migrate dev --name <short_description>   # creates + applies locally
npx prisma validate
```

Commit the generated `database/prisma/migrations/<timestamp>_<name>/` directory.

## Fail-closed guarantees

The runner **will not**, under any circumstances in a production build:

- run `prisma db push --accept-data-loss` to "reconcile" a drifted schema;
- run `prisma migrate resolve --applied` to mark a migration applied without an
  operator deciding to;
- continue (exit 0) after `prisma migrate deploy` fails.

A failed `migrate deploy` prints a diagnostic and exits **non-zero**, which stops
the deployment (the API container waits on the migrate job succeeding). A seed
failure in production is likewise fatal, because the seed loads **required** data
(game templates, owner bootstrap) — booting the panel without it is worse than
stopping.

Rationale: automatic `db push --accept-data-loss` can silently drop columns/tables
to force the live schema to match `schema.prisma`, and auto-`resolve` can mark a
*broken* migration as done, hiding the failure. Both trade a red deploy for
silent data loss or corruption. We choose the red deploy.

## Recovery runbook (P3009 / drift / failed migration)

When the migrate job exits non-zero, **do not** re-run it blindly and **do not**
reach for `db push`. Work through this on a maintenance window with a fresh
backup in hand (see [23 — Backups & DR](23-backups-dr.md)).

1. **Take/verify a backup first.**
   ```bash
   infra/scripts/backup-panel-db.sh    # encrypted dump → object storage
   ```

2. **Identify the failure.** Run against the production `DATABASE_URL`:
   ```bash
   cd apps/panel-api && npx prisma migrate status
   ```
   Prisma reports either a *failed* migration (P3009 — a migration started but
   errored, leaving a `finished_at IS NULL` row in `_prisma_migrations`) or
   *drift* (the DB doesn't match the migration history).

3. **Read the actual error.** The failed migration's SQL is in
   `database/prisma/migrations/<name>/migration.sql`. Reproduce it against a
   **restored copy** of the backup (never production) to see exactly why it
   failed (e.g. a NOT NULL added to a column with existing NULLs, a unique index
   that collides with existing duplicate rows).

4. **Fix the root cause**, choosing the right path:

   - **The migration is wrong / incomplete.** Fix it forward: write a *new*
     migration that first cleans the data (e.g. de-duplicates, backfills), then
     applies the constraint. Never edit an already-shipped `migration.sql`.

   - **The migration partially applied and must be retried.** After manually
     completing/rolling back the partial change on the restored copy and
     confirming the fix, mark the specific failed migration resolved **by name,
     after review**, then deploy:
     ```bash
     npx prisma migrate resolve --rolled-back <migration_name>   # or --applied
     npx prisma migrate deploy
     ```
     `resolve` is an explicit, per-migration operator action here — the runner
     never does it for you.

5. **Re-run the deploy** (re-trigger the migrate job / re-run compose). It should
   now be a clean no-op-then-apply.

6. **Verify** no drift remains:
   ```bash
   npx prisma migrate status         # "Database schema is up to date!"
   ```

## Data-cleaning migrations for new invariants

Some invariants added for production hardening (unique payment references,
one-active-server-per-subscription, etc.) are enforced with **partial unique
indexes**. If production already contains rows that violate the new invariant,
the `CREATE UNIQUE INDEX` will fail on deploy — that is the fail-closed behavior
working as intended. The recovery is to ship a **preceding** data-cleaning
migration (dedupe/backfill) in the same PR, so the chain is: clean data → add
constraint. The migration tests in CI apply the whole chain from an empty
database, which proves the chain is internally consistent but **not** that it is
safe against your current production data — always dry-run the chain against a
restored backup before a production deploy.

## CI coverage

`.github/workflows/ci.yml` runs a `migrations` job that:

- starts an ephemeral PostgreSQL;
- applies the **entire** committed migration chain from an empty database
  (`prisma migrate deploy`);
- checks for schema drift between the migration history and `schema.prisma`
  (`prisma migrate diff --exit-code`), failing if they diverge;
- asserts the migrate entrypoint is fail-closed (no `--accept-data-loss`, no
  auto-`resolve`, non-zero exit on deploy failure).

This guarantees a broken or drifted migration chain cannot merge to `main`.
