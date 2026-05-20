#!/usr/bin/env sh
# Deploy on the droplet without GHCR: sync git, build image locally, start prod compose.
#
# Usage (from repo root on server):
#   sh scripts/deploy-droplet-local.sh
#   DOWN_FIRST=1 sh scripts/deploy-droplet-local.sh   # stop stack before build (low RAM)
#   SKIP_BUILD=1 sh scripts/deploy-droplet-local.sh     # reuse existing image
#
# Requires .env.production (copy from .env.staging once if needed).
# Do NOT edit tracked files on the server except gitignored env files.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${DEPLOY_BRANCH:-main}"
COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
IMAGE="${APP_IMAGE:-sige-prod:local}"

if [ ! -f ".env.production" ]; then
  if [ -f ".env.staging" ]; then
    echo "[deploy] .env.production missing — copy .env.staging first:"
    echo "  cp .env.staging .env.production"
    exit 1
  fi
  echo "[deploy] .env.production not found in $ROOT"
  exit 1
fi

echo "[deploy] Syncing repository to origin/${BRANCH} (hard reset)..."
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -B "$BRANCH" "origin/${BRANCH}"
git reset --hard "origin/${BRANCH}"

chmod +x scripts/*.sh 2>/dev/null || true

echo "[deploy] Repository at $(git rev-parse --short HEAD) — $(git log -1 --oneline)"

if [ "${DOWN_FIRST:-0}" = "1" ]; then
  echo "[deploy] Stopping stack (DOWN_FIRST=1)..."
  $COMPOSE down
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "[deploy] Building image ${IMAGE}..."
  docker build -t "$IMAGE" .
else
  echo "[deploy] SKIP_BUILD=1 — skipping docker build"
fi

export APP_IMAGE="$IMAGE"

echo "[deploy] Starting stack..."
$COMPOSE up -d mysql
$COMPOSE up -d app

docker image prune -f

echo "[deploy] Done. Status:"
$COMPOSE ps
