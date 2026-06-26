# 23 — Backups & Disaster Recovery

What gets backed up, how to restore it, and the drill that proves it works.
Part of the **[go-live checklist](22-go-live-checklist.md)** (Track E).

## What is backed up

| Data | Mechanism | Where |
|------|-----------|-------|
| **Game-server volumes** (world saves, configs) | node-agent `tar.gz → S3`, on a schedule or on demand | `S3_BUCKET` (object storage) |
| **Panel Postgres** (users, billing, subscriptions, encrypted secrets) | `infra/scripts/backup-panel-db.sh` (`pg_dump` → AES-256 → S3) | `PANEL_BACKUP_BUCKET` |
| **`SECRETS_ENC_KEY` / `.env`** | **manual** — store in a secret manager OFF the host | your secret store |

> ⚠️ The panel DB backup is encrypted with `PANEL_BACKUP_PASSPHRASE`, and every
> *value* inside it that's "encrypted at rest" (gateway keys, TOTP seeds,
> SFTP/DB passwords) is encrypted with `SECRETS_ENC_KEY`. **Lose `SECRETS_ENC_KEY`
> and those columns are unrecoverable even from a perfect DB backup.** Back up the
> key separately, and never rotate it once real data exists.

## Configure

In production `.env` (see `.env.production.example`):

```bash
PANEL_BACKUP_BUCKET=refx-db-backups       # S3 bucket for DB dumps
PANEL_BACKUP_PREFIX=panel-postgres        # key prefix within the bucket
PANEL_BACKUP_RETENTION=14                  # keep the newest N dumps
PANEL_BACKUP_PASSPHRASE=<openssl rand -hex 32>   # KEEP THIS OFF THE HOST
# Reuses S3_ENDPOINT / S3_REGION / S3_ACCESS_KEY / S3_SECRET_KEY for upload.
```

Requirements on the host: `docker compose`, `openssl`, and the AWS CLI (`aws`).

## Back up

```bash
infra/scripts/backup-panel-db.sh
```

It dumps the panel DB (custom format) via the compose `postgres` service,
encrypts the stream, uploads `panel-postgres-YYYYMMDD-HHMMSS.dump.enc`, and prunes
to the newest `PANEL_BACKUP_RETENTION` copies. Refuses to run without a passphrase
(no unencrypted customer data).

**Schedule it** (daily, off-peak) with cron:

```cron
15 3 * * *  /home/<you>/refxhosting/infra/scripts/backup-panel-db.sh >> /var/log/refx-db-backup.log 2>&1
```

## Restore

```bash
# Disaster recovery — restore the latest backup over the live DB:
infra/scripts/restore-panel-db.sh --latest

# A specific backup:
infra/scripts/restore-panel-db.sh --key panel-postgres-20260626-031500.dump.enc

# From a local file (no S3):
infra/scripts/restore-panel-db.sh --file ./panel-postgres-….dump.enc
```

Restore is **destructive** (`pg_restore --clean --if-exists`) and prompts for the
database name to confirm (skip with `--yes` in automation).

## The restore drill (do this BEFORE launch, then quarterly)

A backup you've never restored is a hope, not a backup. Restore into a scratch DB
and verify — without touching the live one:

```bash
# 1. Create a scratch database
infra/scripts/dc exec -T postgres createdb -U refx refx_restore_test

# 2. Restore the latest backup INTO the scratch DB (not the live one)
infra/scripts/restore-panel-db.sh --latest --db refx_restore_test --yes

# 3. Sanity-check a couple of tables
infra/scripts/dc exec -T postgres psql -U refx -d refx_restore_test \
  -c 'select count(*) from "User"; select count(*) from "Invoice";'

# 4. Drop the scratch DB
infra/scripts/dc exec -T postgres dropdb -U refx refx_restore_test
```

If step 3 shows sane counts, your backup + passphrase + tooling all work. Record
the date on the go-live checklist.

## Recovery objectives (suggested starting points)

| Objective | Target | Driver |
|-----------|--------|--------|
| **RPO** (max data loss) | ≤ 24 h | daily DB backup — tighten with more frequent runs |
| **RTO** (time to restore) | ≤ 1 h | download + decrypt + `pg_restore` on a fresh host |

Tighten RPO by running the backup more often (e.g. hourly) or adding Postgres WAL
archiving / a managed Postgres with PITR for the lowest RPO.
