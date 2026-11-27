#!/bin/sh
set -eu

echo "[entrypoint] Ensuring additive annual namespace compatibility..."
node scripts/annual-additive-schema.mjs

echo "[entrypoint] Ensuring additive canonical team-access tables..."
TEAM_ACCESS_BOOTSTRAP_PRODUCTION=true node scripts/team-access-additive-schema.mjs

if [ "${RUN_DB_PUSH_ON_STARTUP:-true}" = "true" ]; then
  echo "[entrypoint] Preparing legacy schema (non-interactive)..."
  node scripts/pre-push-schema-compat.mjs
  echo "[entrypoint] Running database migrations (drizzle-kit push)..."
  pnpm exec drizzle-kit push --force
fi

echo "[entrypoint] Backfilling file sizes from S3..."
node scripts/backfill-file-sizes.mjs || echo "[entrypoint] Backfill warning (non-fatal): check logs"

echo "[entrypoint] Ensuring strategic timeline historical baseline..."
node scripts/backfill-strategic-timeline.mjs || echo "[entrypoint] Strategic timeline backfill warning (non-fatal): check logs"

echo "[entrypoint] Starting ISGE 360 server..."
exec node dist/index.js
