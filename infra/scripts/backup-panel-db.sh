#!/usr/bin/env bash
# =============================================================================
# ReFx Hosting — panel Postgres backup (encrypted -> S3)
# -----------------------------------------------------------------------------
# The panel's Postgres holds the crown jewels: users, billing, subscriptions,
# encrypted secrets. Game-server *volumes* already back up to S3 via the agent;
# THIS backs up the panel DB itself.
#
# What it does:
#   1. pg_dump (custom format, compressed) of the panel DB via the compose
#      `postgres` service (no pg client needed on the host).
#   2. Encrypts the dump at rest with AES-256-CBC (PANEL_BACKUP_PASSPHRASE).
#   3. Uploads to s3://$PANEL_BACKUP_BUCKET/$PANEL_BACKUP_PREFIX/.
#   4. Prunes to the newest $PANEL_BACKUP_RETENTION copies.
#
# Requires: docker compose (via infra/scripts/dc), openssl, and the AWS CLI
# (`aws`) for the S3 upload. Reads the repo-root .env.
#
# Schedule it (e.g. daily 03:15) with cron:
#   15 3 * * *  /home/<you>/refxhosting/infra/scripts/backup-panel-db.sh >> /var/log/refx-db-backup.log 2>&1
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DC="$ROOT/infra/scripts/dc"

# shellcheck disable=SC1091
set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a

PG_USER="${POSTGRES_USER:-refx}"
PG_DB="${POSTGRES_DB:-refx}"
BUCKET="${PANEL_BACKUP_BUCKET:-${S3_BUCKET:-refx-db-backups}}"
PREFIX="${PANEL_BACKUP_PREFIX:-panel-postgres}"
RETENTION="${PANEL_BACKUP_RETENTION:-14}"
ENDPOINT="${S3_ENDPOINT:-}"

die() { echo "backup-panel-db: $*" >&2; exit 1; }

[ -n "${PANEL_BACKUP_PASSPHRASE:-}" ] || die \
  "PANEL_BACKUP_PASSPHRASE is not set — refusing to write an UNENCRYPTED backup of customer data. Generate one: openssl rand -hex 32 (store it OFF this host)."
command -v openssl >/dev/null || die "openssl not found."
command -v aws >/dev/null || die "aws CLI not found — install it (or adapt the upload step to your tooling)."

STAMP="$(date -u +%Y%m%d-%H%M%S)"
NAME="${PREFIX}-${STAMP}.dump.enc"
TMP="$(mktemp -t refx-pgbackup.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

echo "[$(date -u +%FT%TZ)] dumping ${PG_DB} (custom format) -> encrypting…"
# -Fc: custom format (compressed, restored with pg_restore). -T: no terminal.
"$DC" exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:PANEL_BACKUP_PASSPHRASE -out "$TMP"

SIZE="$(wc -c < "$TMP" | tr -d ' ')"
[ "$SIZE" -gt 0 ] || die "produced an empty backup — aborting (DB unreachable?)."
echo "  encrypted dump: ${SIZE} bytes"

export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY:-${AWS_ACCESS_KEY_ID:-}}"
export AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-${AWS_SECRET_ACCESS_KEY:-}}"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"
EP_ARG=(); [ -n "$ENDPOINT" ] && EP_ARG=(--endpoint-url "$ENDPOINT")

echo "[$(date -u +%FT%TZ)] uploading -> s3://${BUCKET}/${PREFIX}/${NAME}"
aws "${EP_ARG[@]}" s3 cp "$TMP" "s3://${BUCKET}/${PREFIX}/${NAME}"

# --- retention: keep the newest $RETENTION objects under the prefix ----------
echo "[$(date -u +%FT%TZ)] pruning to newest ${RETENTION}…"
mapfile -t OLD < <(
  aws "${EP_ARG[@]}" s3 ls "s3://${BUCKET}/${PREFIX}/" \
    | awk '{print $4}' | grep -E '\.dump\.enc$' | sort | head -n -"${RETENTION}"
) || true
for key in "${OLD[@]:-}"; do
  [ -n "$key" ] || continue
  echo "  removing old backup: ${key}"
  aws "${EP_ARG[@]}" s3 rm "s3://${BUCKET}/${PREFIX}/${key}"
done

echo "[$(date -u +%FT%TZ)] done. Latest: s3://${BUCKET}/${PREFIX}/${NAME}"
