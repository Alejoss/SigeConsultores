#!/bin/sh
set -eu

if [ "${RUN_DB_PUSH_ON_STARTUP:-true}" = "true" ]; then
  echo "[entrypoint] Preparing legacy schema (non-interactive)..."
  node scripts/pre-push-schema-compat.mjs
  echo "[entrypoint] Running database migrations (drizzle-kit push)..."
  pnpm exec drizzle-kit push --force
fi

echo "[entrypoint] Starting SIGE server..."
exec node dist/index.js
