#!/usr/bin/env bash
# =============================================================================
# Guards that infra/docker/Dockerfile.migrate stays FAIL-CLOSED.
#
# A failed production migration must never silently continue: no automatic
# `db push --accept-data-loss`, no automatic `migrate resolve --applied`, and a
# non-zero exit when `prisma migrate deploy` fails. This script is a cheap CI
# backstop against a regression that reintroduces the "self-heal" behavior.
#
# Run from the repo root:  bash infra/scripts/assert-migrate-fail-closed.sh
# =============================================================================
set -euo pipefail

FILE="infra/docker/Dockerfile.migrate"
fail=0

note() { printf '  ✗ %s\n' "$1" >&2; fail=1; }
ok()   { printf '  ✓ %s\n' "$1"; }

echo "[assert] checking $FILE is fail-closed"

if [ ! -f "$FILE" ]; then
  echo "[assert] FATAL: $FILE not found" >&2
  exit 1
fi

# Only real command invocations matter — comments and echo diagnostics that
# mention these strings are fine. Strip comment lines and shell echo lines first.
CODE="$(grep -vE '^[[:space:]]*#' "$FILE" | grep -vE '^[[:space:]]*echo ')"

# 1. No production self-heal via destructive db push. The only permitted db push
#    is the dev-only fallback, which must NOT carry --accept-data-loss.
if printf '%s\n' "$CODE" | grep -qE 'npx[[:space:]]+prisma[[:space:]]+db[[:space:]]+push.*--accept-data-loss'; then
  note "found 'db push --accept-data-loss' invocation — destructive auto-reconcile is forbidden"
else
  ok "no 'db push --accept-data-loss' invocation"
fi

# 2. No automatic marking of migrations as applied (hides broken migrations).
if printf '%s\n' "$CODE" | grep -qE 'npx[[:space:]]+prisma[[:space:]]+migrate[[:space:]]+resolve.*--applied'; then
  note "found 'migrate resolve --applied' invocation — auto-resolving migrations is forbidden"
else
  ok "no auto 'migrate resolve --applied' invocation"
fi

# 3. A deploy failure must exit non-zero, not fall through to a reconcile.
if grep -qE 'migrate deploy[[:space:]]*\|\|[[:space:]]*reconcile' "$FILE"; then
  note "found 'migrate deploy || reconcile' — deploy failure must fail closed, not self-heal"
else
  ok "deploy failure does not route to a self-heal function"
fi

# 4. The deploy-failure branch must contain an explicit 'exit 1'.
if grep -q "prisma migrate deploy'" "$FILE" && grep -qE 'FATAL.*migrate deploy' "$FILE" && grep -qE '^[[:space:]]*exit 1' "$FILE"; then
  ok "deploy failure exits non-zero"
else
  note "could not confirm a non-zero exit on 'migrate deploy' failure"
fi

if [ "$fail" -ne 0 ]; then
  echo "[assert] FAILED — the migration runner is not fail-closed" >&2
  exit 1
fi
echo "[assert] OK — migration runner is fail-closed"
