#!/usr/bin/env sh
# Single entrypoint for staging deploy on the droplet.
# - Syncs repo to origin/main (discards accidental local edits to tracked files)
# - Runs DB migrate, rebuilds image, starts compose
#
# Usage (on server, from repo root):
#   ./scripts/deploy-staging-droplet.sh
#   SKIP_MIGRATE=1 ./scripts/deploy-staging-droplet.sh   # code-only deploy
#   SKIP_BUILD=1 ./scripts/deploy-staging-droplet.sh     # restart without rebuild
#
# Do NOT edit tracked files on the server. Only .env.staging (gitignored) is local config.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${DEPLOY_BRANCH:-main}"
COMPOSE="docker compose --env-file .env.staging -f docker-compose.staging.yml"
IMAGE="${APP_IMAGE:-sige-staging:local}"

echo "[deploy] Syncing repository to origin/${BRANCH} (hard reset)..."
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -B "$BRANCH" "origin/${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "[deploy] Repository at $(git rev-parse --short HEAD) — $(git log -1 --oneline)"

if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  sh "$ROOT/scripts/staging-db-migrate.sh"
else
  echo "[deploy] SKIP_MIGRATE=1 — skipping database migrate"
  $COMPOSE up -d mysql
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "[deploy] Building image ${IMAGE}..."
  docker build -t "$IMAGE" .
else
  echo "[deploy] SKIP_BUILD=1 — skipping docker build"
fi

echo "[deploy] Starting stack..."
$COMPOSE up -d

echo "[deploy] Done. Status:"
$COMPOSE ps
