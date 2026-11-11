#!/usr/bin/env bash
# Fetch and decrypt a backup made by backup.sh, and optionally prove it
# restores (ADR-001). Run from /srv/kpi-nexus (or wherever .env is):
#
#   ./restore.sh fetch [OBJECT|latest] OUT.dump
#       download db/OBJECT (default: the newest) and decrypt it to OUT.dump
#   ./restore.sh drill [OBJECT|latest]
#       restore it into a throwaway container from the database image
#       (DB_IMAGE_TAG) and print row counts; the container is removed after
#
# To recover production onto a new VM: bootstrap it, start only `postgres`
# (first boot creates the roles), then run the steps in restore_into() against
# it, start the stack, and deploy the last good tag. docs/deploy.md has the
# full procedure.
set -euo pipefail

cd "$(dirname "$0")"

RCLONE_IMAGE=rclone/rclone:1.75.2@sha256:2687085f718d3c628f7fdfb77c52a1d344332aed543110bb88088f2c70d43eb5

load_env() {
  local key value
  while IFS='=' read -r key value; do
    case "$key" in
      BACKUP_* | DB_IMAGE_TAG | REGISTRY) export "$key=$value" ;;
    esac
  done < .env
}

load_env
: "${BACKUP_PASSPHRASE:?}" "${BACKUP_S3_ENDPOINT:?}" "${BACKUP_S3_BUCKET:?}" "${BACKUP_S3_ACCESS_KEY:?}" "${BACKUP_S3_SECRET_KEY:?}"

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

# fetch OBJECT|latest OUT
fetch() {
  local object="${1:-latest}" out="$2" dir
  if [ "$object" = latest ]; then
    object="$(rclone "$RCLONE_IMAGE" lsf "store:$BACKUP_S3_BUCKET/db/" | sort | tail -n 1)"
    [ -n "$object" ] || { echo "restore: no backups in $BACKUP_S3_BUCKET/db/" >&2; exit 1; }
  fi
  dir="$(mktemp -d)"
  rclone -v "$dir:/backup" "$RCLONE_IMAGE" copy "store:$BACKUP_S3_BUCKET/db/$object" /backup/
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$dir/$object" -out "$out"
  rm -rf "$dir"
  echo "restore: $object decrypted to $out" >&2
}

# restore_into CONTAINER DUMP: the TimescaleDB-safe restore into a database
# whose roles and extensions already exist (the database image's first boot).
restore_into() {
  local container="$1" dump="$2"
  docker cp "$dump" "$container:/tmp/restore.dump"
  docker exec "$container" psql -v ON_ERROR_STOP=1 -U postgres -d kpi_nexus -c 'SELECT timescaledb_pre_restore();'
  # The extensions already exist, so their CREATE EXTENSION entries are left out.
  docker exec "$container" sh -c "pg_restore -l /tmp/restore.dump | grep -v ' EXTENSION ' > /tmp/restore.list"
  docker exec "$container" pg_restore -U postgres -d kpi_nexus --exit-on-error -L /tmp/restore.list /tmp/restore.dump
  docker exec "$container" psql -v ON_ERROR_STOP=1 -U postgres -d kpi_nexus -c 'SELECT timescaledb_post_restore();'
  docker exec "$container" rm -f /tmp/restore.dump /tmp/restore.list
}

# Global, so the EXIT trap can still see them after drill() returns.
drill_work=""
drill_container=""
cleanup_drill() {
  [ -n "$drill_container" ] && docker rm -f "$drill_container" >/dev/null 2>&1
  [ -n "$drill_work" ] && rm -rf "$drill_work"
  return 0
}

drill() {
  local object="${1:-latest}" work container
  : "${DB_IMAGE_TAG:?DB_IMAGE_TAG is not set in .env}"
  work="$(mktemp -d)"
  container="kpi-restore-drill-$$"
  drill_work="$work"
  drill_container="$container"
  trap cleanup_drill EXIT
  fetch "$object" "$work/restore.dump"
  docker run -d --name "$container" \
    -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e KPI_OWNER_DB_PASSWORD="$(openssl rand -hex 16)" \
    "${REGISTRY:-ghcr.io/mhasaan}/kpi-nexus-db:$DB_IMAGE_TAG" >/dev/null
  for _ in $(seq 1 90); do
    docker exec "$container" pg_isready -U postgres -d kpi_nexus >/dev/null 2>&1 && break
    sleep 2
  done
  # pg_isready can pass during first-boot init; wait for the init's own roles.
  for _ in $(seq 1 30); do
    [ "$(docker exec "$container" psql -U postgres -d kpi_nexus -tAc "SELECT count(*) FROM pg_roles WHERE rolname IN ('kpi_app','kpi_system')" 2>/dev/null)" = 2 ] && break
    sleep 2
  done
  restore_into "$container" "$work/restore.dump"
  docker exec "$container" psql -U postgres -d kpi_nexus -c \
    'SELECT (SELECT count(*) FROM "Organization") AS organizations, (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "KPI") AS kpis, (SELECT count(*) FROM "KPIDataPoint") AS data_points;'
  echo "restore: drill passed"
}

case "${1:-}" in
  fetch) fetch "${2:-latest}" "${3:?usage: restore.sh fetch [OBJECT|latest] OUT.dump}" ;;
  drill) drill "${2:-latest}" ;;
  *) echo "usage: restore.sh fetch [OBJECT|latest] OUT.dump | drill [OBJECT|latest]" >&2; exit 2 ;;
esac
