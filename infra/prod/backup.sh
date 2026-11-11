#!/usr/bin/env bash
# Nightly database backup (ADR-001). Run from /srv/kpi-nexus by cron:
#   pg_dump (custom format, as the superuser so RLS hides nothing)
#   → AES-256 with BACKUP_PASSPHRASE (openssl, PBKDF2)
#   → Object Storage via a pinned rclone image
#   → objects older than BACKUP_KEEP_DAYS (default 14) are deleted.
# Settings come from the BACKUP_* lines of .env. Restore with restore.sh.
set -euo pipefail

cd "$(dirname "$0")"

RCLONE_IMAGE=rclone/rclone:1.75.2@sha256:2687085f718d3c628f7fdfb77c52a1d344332aed543110bb88088f2c70d43eb5

# Read only the BACKUP_* settings from .env; nothing in it is executed.
load_backup_env() {
  local key value
  while IFS='=' read -r key value; do
    case "$key" in
      BACKUP_*) export "$key=$value" ;;
    esac
  done < .env
}

load_backup_env
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set in .env}"
: "${BACKUP_S3_ENDPOINT:?}" "${BACKUP_S3_BUCKET:?}" "${BACKUP_S3_ACCESS_KEY:?}" "${BACKUP_S3_SECRET_KEY:?}"
keep_days="${BACKUP_KEEP_DAYS:-14}"

# rclone takes its remote ("store") from the environment; values never appear
# on a command line.
export RCLONE_CONFIG_STORE_TYPE=s3
export RCLONE_CONFIG_STORE_PROVIDER=Other
export RCLONE_CONFIG_STORE_ENDPOINT="$BACKUP_S3_ENDPOINT"
export RCLONE_CONFIG_STORE_REGION="${BACKUP_S3_REGION:-us-east-1}"
export RCLONE_CONFIG_STORE_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY"
export RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY"
export RCLONE_CONFIG_STORE_FORCE_PATH_STYLE=true

rclone() {
  docker run --rm --network host \
    -e RCLONE_CONFIG_STORE_TYPE -e RCLONE_CONFIG_STORE_PROVIDER -e RCLONE_CONFIG_STORE_ENDPOINT \
    -e RCLONE_CONFIG_STORE_REGION -e RCLONE_CONFIG_STORE_ACCESS_KEY_ID \
    -e RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY -e RCLONE_CONFIG_STORE_FORCE_PATH_STYLE \
    "$@"
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
name="kpi_nexus-$(date -u +%Y%m%dT%H%M%SZ).dump.enc"

docker compose exec -T postgres pg_dump -U postgres -d kpi_nexus --format=custom \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$work/$name"

if [ ! -s "$work/$name" ]; then
  echo "backup: empty dump, nothing uploaded" >&2
  exit 1
fi

rclone -v "$work:/backup:ro" "$RCLONE_IMAGE" copy "/backup/$name" "store:$BACKUP_S3_BUCKET/db/"
rclone "$RCLONE_IMAGE" delete "store:$BACKUP_S3_BUCKET/db/" --min-age "${keep_days}d"

echo "backup: uploaded db/$name ($(du -h "$work/$name" | cut -f1)), kept the last $keep_days days"
