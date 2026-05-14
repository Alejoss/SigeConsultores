#!/usr/bin/env bash
# Cron-triggered database backup: mysqldump → gzip → S3 (streaming, no temp files)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_DIR}/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] $ENV_FILE not found" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

TIMESTAMP=$(date -u +%Y-%m-%dT%H%MZ)
FILENAME="sige-backup-${TIMESTAMP}.sql.gz"
BUCKET="${AWS_S3_BUCKET:-sige-backups}"
REGION="${AWS_S3_REGION:-${AWS_REGION:-us-east-2}}"
S3_PATH="s3://${BUCKET}/backups/${FILENAME}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID not set}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY not set}"
export AWS_DEFAULT_REGION="${REGION}"

echo "[$(date -u)] Starting backup → ${S3_PATH}"

docker compose -f "${PROJECT_DIR}/docker-compose.prod.yml" exec -T mysql \
  mysqldump -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" \
    --single-transaction --quick --lock-tables=false --set-gtid-purged=OFF \
  | gzip -9 \
  | aws s3 cp - "${S3_PATH}" \
      --content-type "application/gzip" \
      --region "${REGION}"

echo "[$(date -u)] Backup complete: ${S3_PATH}"
