#!/usr/bin/env bash
# One-time setup: installs awscli and registers the daily backup cron job.
# Run on the droplet:  sudo bash scripts/setup-backup-cron.sh /opt/sige-app
set -euo pipefail

DEPLOY_PATH="${1:?Usage: $0 <deploy-path>  (e.g. /opt/sige-app)}"
BACKUP_SCRIPT="${DEPLOY_PATH}/scripts/backup-cron.sh"
CRON_FILE="/etc/cron.d/sige-backup"
LOG_FILE="/var/log/sige-backup.log"

if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "[ERROR] Backup script not found at $BACKUP_SCRIPT" >&2
  exit 1
fi

chmod +x "$BACKUP_SCRIPT"

# --- Install AWS CLI v2 if missing -----------------------------------------
if ! command -v aws &>/dev/null; then
  echo "[Setup] Installing AWS CLI v2..."
  apt-get update -qq && apt-get install -y -qq curl unzip
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip
  unzip -qo /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install --update
  rm -rf /tmp/awscliv2.zip /tmp/aws
  echo "[Setup] AWS CLI installed: $(aws --version)"
else
  echo "[Setup] AWS CLI already installed: $(aws --version)"
fi

# --- Verify docker compose is available -----------------------------------
if ! docker compose version &>/dev/null; then
  echo "[ERROR] 'docker compose' not available. Is Docker installed?" >&2
  exit 1
fi

# --- Create log file ------------------------------------------------------
touch "$LOG_FILE"

# --- Install cron job (daily at 2:00 AM UTC) ------------------------------
cat > "$CRON_FILE" <<EOF
# SIGE Platform — automated database backup to S3
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 2 * * * root ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1
EOF

chmod 644 "$CRON_FILE"

echo "[Setup] Cron job installed at $CRON_FILE"
echo "[Setup] Schedule: daily at 2:00 AM UTC"
echo "[Setup] Logs: $LOG_FILE"
echo ""
echo "To test now:  bash ${BACKUP_SCRIPT}"
echo "To view logs: tail -f ${LOG_FILE}"
