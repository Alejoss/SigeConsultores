#!/usr/bin/env bash
# Database backup: mysqldump (MySQL container) → gzip → S3 (host AWS CLI).
# MySQL credentials come from the container env (docker-compose env_file), not from sourcing .env on the host.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# shellcheck source=scripts/load-env-file.sh
. "${SCRIPT_DIR}/load-env-file.sh"

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

# Only AWS keys on the host (for `aws s3 cp`). MySQL vars stay inside the mysql service.
load_env_file_keys "$ENV_FILE" \
  AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_S3_REGION AWS_S3_BUCKET AWS_REGION

TIMESTAMP=$(date -u +%Y-%m-%dT%H%MZ)
BACKUP_PREFIX="sige-backup-"
if [[ "$COMPOSE_FILE" == *staging* ]]; then
  BACKUP_PREFIX="sige-backup-staging-"
fi
FILENAME="${BACKUP_PREFIX}${TIMESTAMP}.sql.gz"
BUCKET="${AWS_S3_BUCKET:-sige-backups}"
REGION="${AWS_S3_REGION:-${AWS_REGION:-us-east-2}}"
S3_PATH="s3://${BUCKET}/backups/${FILENAME}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID not set in $ENV_FILE}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY not set in $ENV_FILE}"
export AWS_DEFAULT_REGION="${REGION}"

COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

echo "[$(date -u)] Starting backup → ${S3_PATH}"
echo "[$(date -u)] Compose: ${COMPOSE_FILE}"

if ! "${COMPOSE_CMD[@]}" ps --status running mysql 2>/dev/null | grep -q mysql; then
  echo "[$(date -u)] MySQL container not running; starting mysql service..."
  "${COMPOSE_CMD[@]}" up -d mysql
  "${COMPOSE_CMD[@]}" exec mysql sh -c \
    'until mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; do sleep 2; done'
fi

# Credentials: MYSQL_ROOT_PASSWORD and MYSQL_DATABASE are already in the mysql container (env_file in compose).
"${COMPOSE_CMD[@]}" exec -T mysql sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
    --single-transaction --quick --lock-tables=false --set-gtid-purged=OFF' \
  | gzip -9 \
  | aws s3 cp - "${S3_PATH}" \
      --content-type "application/gzip" \
      --region "${REGION}"

echo "[$(date -u)] Backup complete: ${S3_PATH}"
