#!/usr/bin/env sh
# Apply DB schema on staging after MySQL is up. Run from repo root on the droplet.
set -eu

COMPOSE="docker compose --env-file .env.staging -f docker-compose.staging.yml"

echo "[staging-db-migrate] Waiting for MySQL to be healthy..."
$COMPOSE up -d mysql
$COMPOSE exec mysql sh -c 'until mysqladmin ping -h localhost -uroot -p"$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; do sleep 2; done'

echo "[staging-db-migrate] Legacy schema compat + drizzle push (one-off container)..."
$COMPOSE run --rm --no-deps \
  -e RUN_DB_PUSH_ON_STARTUP=false \
  app sh -c 'node scripts/pre-push-schema-compat.mjs && pnpm exec drizzle-kit push --force'

echo "[staging-db-migrate] Done."
