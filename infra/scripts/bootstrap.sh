#!/usr/bin/env bash
# =============================================================================
# ReFx Hosting — one-shot local panel bootstrap (Docker Compose).
# Brings up the full stack, runs DB migrations, and seeds initial data.
#
#   ./infra/scripts/bootstrap.sh
#
# Idempotent: safe to re-run. Requires Docker + Docker Compose v2.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="docker compose -f ${ROOT}/infra/docker/docker-compose.yml --env-file ${ROOT}/.env"

log() { printf '\033[1;32m[bootstrap]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "Docker is required."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required."

# ---- .env -------------------------------------------------------------------
if [[ ! -f "${ROOT}/.env" ]]; then
  log "Creating .env from .env.example (EDIT IT for production secrets!)"
  cp "${ROOT}/.env.example" "${ROOT}/.env"
  # Generate real secrets where we can.
  if command -v openssl >/dev/null; then
    sed -i.bak \
      -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 48)|" \
      -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 48)|" \
      -e "s|^SECRETS_ENC_KEY=.*|SECRETS_ENC_KEY=$(openssl rand -hex 32)|" \
      "${ROOT}/.env" && rm -f "${ROOT}/.env.bak"
    log "Generated JWT + encryption secrets."
  fi
fi

# ---- bring up infra services first ------------------------------------------
# Core datastores only (observability + opensearch are opt-in profiles to keep
# the default footprint small — see infra/docker/README.md).
log "Starting core datastores (postgres, redis, minio)..."
$COMPOSE up -d postgres redis minio createbuckets

log "Waiting for Postgres to be healthy..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T postgres pg_isready -U "${POSTGRES_USER:-refx}" >/dev/null 2>&1; then break; fi
  sleep 2
  [[ $i -eq 30 ]] && die "Postgres did not become ready."
done

# ---- migrate + seed ---------------------------------------------------------
log "Running database migrations..."
$COMPOSE run --rm migrate || die "Migrations failed."

log "Seeding initial data (owner user, region, node, products, templates)..."
$COMPOSE run --rm migrate sh -lc "npm run db:seed" || \
  log "Seed step skipped/failed (non-fatal) — run 'npm run db:seed' manually if needed."

# ---- app tier ---------------------------------------------------------------
log "Starting application tier (panel-api, web)..."
$COMPOSE up -d
# For metrics/logs UI and search add the optional profiles:
#   $COMPOSE --profile full up -d

log "Done."
log "  Panel:   http://localhost:${WEB_PORT:-3000}"
log "  API:     http://localhost:${PANEL_API_PORT:-4000}  (Swagger /docs, GraphQL /graphql)"
log "  Grafana: http://localhost:${GRAFANA_PORT:-3001}"
log "Default owner login is printed in the seed output (default: owner@refx.example)."
