#!/usr/bin/env bash
# Cron-triggered database backup: mysqldump → gzip → S3 (streaming, no temp files)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Optional overrides (e.g. in /etc/cron.d/sige-backup):
#   SIGE_ENV_FILE=/opt/sige-app-staging/.env.staging
#   SIGE_COMPOSE_FILE=/opt/sige-app-staging/docker-compose.staging.yml
if [ -n "${SIGE_ENV_FILE:-}" ]; then
  ENV_FILE="$SIGE_ENV_FILE"
  COMPOSE_FILE="${SIGE_COMPOSE_FILE:?Set SIGE_COMPOSE_FILE when using SIGE_ENV_FILE}"
elif [ -f "${PROJECT_DIR}/.env.production" ]; then
  ENV_FILE="${PROJECT_DIR}/.env.production"
  COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
elif [ -f "${PROJECT_DIR}/.env.staging" ]; then
  ENV_FILE="${PROJECT_DIR}/.env.staging"
  COMPOSE_FILE="${PROJECT_DIR}/docker-compose.staging.yml"
else
  echo "[ERROR] No .env.production or .env.staging in ${PROJECT_DIR}" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck source=scripts/load-env-file.sh
. "${SCRIPT_DIR}/load-env-file.sh"
load_env_file "$ENV_FILE"

TIMESTAMP=$(date -u +%Y-%m-%dT%H%MZ)
BACKUP_PREFIX="sige-backup-"
if [[ "$COMPOSE_FILE" == *staging* ]]; then
  BACKUP_PREFIX="sige-backup-staging-"
fi
FILENAME="${BACKUP_PREFIX}${TIMESTAMP}.sql.gz"
BUCKET="${AWS_S3_BUCKET:-sige-backups}"
REGION="${AWS_S3_REGION:-${AWS_REGION:-us-east-2}}"
S3_PATH="s3://${BUCKET}/backups/${FILENAME}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID not set}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY not set}"
export AWS_DEFAULT_REGION="${REGION}"

COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE")
if [[ "$ENV_FILE" == *".env.staging"* ]]; then
  COMPOSE_CMD+=(--env-file "$ENV_FILE")
fi

echo "[$(date -u)] Starting backup → ${S3_PATH}"
echo "[$(date -u)] Using compose: ${COMPOSE_FILE}"

"${COMPOSE_CMD[@]}" exec -T mysql \
  mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" \
    --single-transaction --quick --lock-tables=false --set-gtid-purged=OFF \
  | gzip -9 \
  | aws s3 cp - "${S3_PATH}" \
      --content-type "application/gzip" \
      --region "${REGION}"

echo "[$(date -u)] Backup complete: ${S3_PATH}"
