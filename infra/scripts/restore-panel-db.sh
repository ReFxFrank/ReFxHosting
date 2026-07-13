#!/usr/bin/env bash
# =============================================================================
# ReFx Hosting — panel Postgres RESTORE (from an encrypted S3 backup)
# -----------------------------------------------------------------------------
# DESTRUCTIVE: overwrites the target database with the backup contents. Use for
# disaster recovery and for the periodic restore DRILL (restore into a scratch
# DB and verify) the go-live checklist requires.
#
# Usage:
#   infra/scripts/restore-panel-db.sh --latest                 # newest in S3
#   infra/scripts/restore-panel-db.sh --key panel-postgres-20260626-031500.dump.enc
#   infra/scripts/restore-panel-db.sh --file ./local-backup.dump.enc
#   infra/scripts/restore-panel-db.sh --latest --db refx_restore_test   # DRILL
#   infra/scripts/restore-panel-db.sh --latest --yes           # skip the prompt
#
# Requires: docker compose (infra/scripts/dc), openssl, aws (unless --file).
# Reads the repo-root .env (incl. PANEL_BACKUP_PASSPHRASE used to decrypt).
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DC="$ROOT/infra/scripts/dc"
# shellcheck disable=SC1091
set -a; [ -f "$ROOT/.env" ] && . "$ROOT/.env"; set +a

PG_USER="${POSTGRES_USER:-refx}"
TARGET_DB="${POSTGRES_DB:-refx}"
BUCKET="${PANEL_BACKUP_BUCKET:-${S3_BUCKET:-refx-db-backups}}"
PREFIX="${PANEL_BACKUP_PREFIX:-panel-postgres}"
ENDPOINT="${S3_ENDPOINT:-}"
SRC_KEY=""; SRC_FILE=""; USE_LATEST=""; ASSUME_YES=""

die() { echo "restore-panel-db: $*" >&2; exit 1; }
while [ $# -gt 0 ]; do
  case "$1" in
    --latest) USE_LATEST=1; shift;;
    --key) SRC_KEY="${2:-}"; shift 2;;
    --file) SRC_FILE="${2:-}"; shift 2;;
    --db) TARGET_DB="${2:-}"; shift 2;;
    --yes|-y) ASSUME_YES=1; shift;;
    *) die "unknown arg: $1";;
  esac
done

[ -n "${PANEL_BACKUP_PASSPHRASE:-}" ] || die "PANEL_BACKUP_PASSPHRASE not set — cannot decrypt."
command -v openssl >/dev/null || die "openssl not found."

export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY:-${AWS_ACCESS_KEY_ID:-}}"
export AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-${AWS_SECRET_ACCESS_KEY:-}}"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"
EP_ARG=(); [ -n "$ENDPOINT" ] && EP_ARG=(--endpoint-url "$ENDPOINT")

TMP_ENC="$(mktemp -t refx-restore.XXXXXX)"
TMP_DUMP="$(mktemp -t refx-restore-dump.XXXXXX)"
trap 'rm -f "$TMP_ENC" "$TMP_DUMP"' EXIT

if [ -n "$SRC_FILE" ]; then
  cp "$SRC_FILE" "$TMP_ENC"
  echo "using local file: $SRC_FILE"
else
  command -v aws >/dev/null || die "aws CLI not found (needed unless --file)."
  if [ -n "$USE_LATEST" ]; then
    # s3api (not `s3 ls`): reliable against R2's ListObjectsV2 implementation.
    SRC_KEY="$(aws "${EP_ARG[@]}" s3api list-objects-v2 --bucket "$BUCKET" --prefix "${PREFIX}/" \
      --query 'Contents[].Key' --output text 2>/dev/null \
      | tr '\t' '\n' | grep -E '\.dump\.enc$' | sed "s|^${PREFIX}/||" | sort | tail -n 1)"
    [ -n "$SRC_KEY" ] || die "no backups found under s3://${BUCKET}/${PREFIX}/ (or listing failed — pass --key <name> from the backup log)"
  fi
  [ -n "$SRC_KEY" ] || die "specify --latest, --key <name>, or --file <path>."
  echo "downloading s3://${BUCKET}/${PREFIX}/${SRC_KEY}"
  aws "${EP_ARG[@]}" s3 cp "s3://${BUCKET}/${PREFIX}/${SRC_KEY}" "$TMP_ENC"
fi

echo "decrypting…"
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:PANEL_BACKUP_PASSPHRASE -in "$TMP_ENC" -out "$TMP_DUMP"
[ -s "$TMP_DUMP" ] || die "decryption produced an empty file — wrong passphrase?"

echo
echo "  *** ABOUT TO RESTORE INTO DATABASE: ${TARGET_DB} ***"
echo "  This drops & recreates objects from the backup (pg_restore --clean --if-exists)."
if [ -z "$ASSUME_YES" ]; then
  printf "  Type the database name to confirm: "
  read -r CONFIRM
  [ "$CONFIRM" = "$TARGET_DB" ] || die "confirmation did not match — aborted."
fi

echo "restoring into ${TARGET_DB}…"
# Stream the dump into pg_restore running inside the postgres container.
"$DC" exec -T postgres pg_restore --clean --if-exists --no-owner \
  -U "$PG_USER" -d "$TARGET_DB" < "$TMP_DUMP"

echo "done. Restored ${TARGET_DB}. (If this was a drill, drop the scratch DB when finished.)"
