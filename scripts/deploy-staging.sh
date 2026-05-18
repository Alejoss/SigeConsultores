#!/usr/bin/env sh
set -eu

if [ -z "${APP_IMAGE:-}" ]; then
  echo "APP_IMAGE is required"
  exit 1
fi

if [ -z "${GHCR_USERNAME:-}" ] || [ -z "${GHCR_TOKEN:-}" ]; then
  echo "GHCR_USERNAME and GHCR_TOKEN are required"
  exit 1
fi

if [ ! -f ".env.staging" ]; then
  echo ".env.staging not found"
  exit 1
fi

echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

docker compose -f docker-compose.staging.yml pull app
sh scripts/staging-db-migrate.sh
docker compose -f docker-compose.staging.yml up -d app
docker image prune -f

echo "Staging deployment finished"
