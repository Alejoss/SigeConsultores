#!/usr/bin/env bash
# Pull app image from GHCR and restart production compose.
# Reads APP_IMAGE, GHCR_USERNAME, GHCR_TOKEN from the shell or from .env.production.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ROOT}/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo ".env.production not found at $ENV_FILE" >&2
  exit 1
fi

# shellcheck source=scripts/load-env-file.sh
. "${ROOT}/scripts/load-env-file.sh"

# Workflow/CD may export APP_IMAGE (commit sha) before this script runs.
_SAVED_APP_IMAGE="${APP_IMAGE:-}"
load_env_file_keys "$ENV_FILE" APP_IMAGE GHCR_USERNAME GHCR_TOKEN
if [ -n "$_SAVED_APP_IMAGE" ]; then
  export APP_IMAGE="$_SAVED_APP_IMAGE"
fi

if [ -z "${APP_IMAGE:-}" ]; then
  echo "APP_IMAGE is required (set in .env.production or export before running)" >&2
  exit 1
fi

if [ -z "${GHCR_USERNAME:-}" ] || [ -z "${GHCR_TOKEN:-}" ]; then
  echo "GHCR_USERNAME and GHCR_TOKEN are required in .env.production or in the environment" >&2
  exit 1
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)

echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

"${COMPOSE[@]}" pull app
"${COMPOSE[@]}" up -d mysql

# Respaldo transaccional obligatorio antes de cambiar la versión de la aplicación.
# Se conserva en el servidor de producción y se valida antes de continuar.
BACKUP_DIR="${ROOT}/backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="${BACKUP_DIR}/isge360-predeploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
echo "Creating pre-deployment database backup: ${BACKUP_FILE}"
"${COMPOSE[@]}" exec -T mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --lock-tables=false "$MYSQL_DATABASE"' \
  | gzip -c > "$BACKUP_FILE"
if [ ! -s "$BACKUP_FILE" ]; then
  echo "Database backup failed or is empty; deployment aborted." >&2
  exit 1
fi
sha256sum "$BACKUP_FILE" | tee "${BACKUP_FILE}.sha256"
echo "Pre-deployment backup verified."

"${COMPOSE[@]}" up -d app
docker image prune -f

echo "Deployment finished (image: ${APP_IMAGE})"
