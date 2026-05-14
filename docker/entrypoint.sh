#!/bin/sh
set -eu

if [ "${RUN_DB_PUSH_ON_STARTUP:-true}" = "true" ]; then
  echo "[entrypoint] Running database migrations (drizzle-kit push)..."
  pnpm db:push
fi

echo "[entrypoint] Starting SIGE server..."
exec node dist/index.js
