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

if [ ! -f ".env.production" ]; then
  echo ".env.production not found"
  exit 1
fi

COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"

echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

$COMPOSE pull app
$COMPOSE up -d mysql
$COMPOSE up -d app
docker image prune -f

echo "Deployment finished"
