#!/usr/bin/env bash
#
# update-panel.sh — pull the latest code and rebuild the ReFx panel.
#
# Rebuilds + recreates only the app containers (web + panel-api); the data
# stores (postgres/redis/minio) keep running untouched. Always applies any new
# Prisma migrations via the one-shot `migrate` service.
#
# Run as the user that owns the repo (the one that runs docker compose).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose -f infra/docker/docker-compose.yml --env-file .env)

echo "==> Pulling latest (git)"
git pull origin main

# Apply migrations FIRST, and crucially REBUILD the migrate image — it bakes in
# database/prisma (migrations) + database/seed at build time, so without --build
# a stale image would silently skip new migrations. Runs to completion before
# panel-api starts (panel-api depends_on migrate: service_completed_successfully).
echo "==> Rebuilding migrate image + applying migrations/seed"
"${COMPOSE[@]}" build migrate
"${COMPOSE[@]}" run --rm migrate || echo "WARNING: migrate/seed reported an error — check the output above"

echo "==> Rebuilding web + panel-api"
"${COMPOSE[@]}" up -d --build panel-api web

echo "==> Current status"
"${COMPOSE[@]}" ps

echo "==> Done. Hard-refresh the browser (Ctrl/Cmd-Shift-R) to load the new web bundle."
