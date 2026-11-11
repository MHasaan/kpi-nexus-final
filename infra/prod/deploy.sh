#!/usr/bin/env bash
# Deploy one build on the VM (ADR-001). Run from /srv/kpi-nexus by
# .github/workflows/deploy.yml over SSH:
#
#   ./deploy.sh <commit-sha> <db-image-tag>
#
#   1. pull the API, ML and database images for those tags
#   2. run the database release (migrate deploy + SQL); if it fails, stop here
#      and leave the running version alone
#   3. start the new images
#   4. wait until https://$API_DOMAIN/health reports db and redis ok and this
#      commit as its version
#   5. if it never does, start the previous tags again and exit non-zero
#
# The tags that last passed step 4 are kept in ./current-tag. Migrations are
# append-only and backward compatible (spec §10.3), so the previous build runs
# against the new schema. Rolling back by hand: run the workflow with an older
# commit, or `./deploy.sh <older-sha> <its-db-tag>` here.
set -euo pipefail

cd "$(dirname "$0")"

tag="${1:-}"
db_tag="${2:-}"
if ! [[ "$tag" =~ ^[0-9a-f]{40}$ ]] || [ -z "$db_tag" ]; then
  echo "usage: deploy.sh <40-character commit sha> <db image tag>" >&2
  exit 2
fi

attempts="${HEALTH_ATTEMPTS:-30}"
interval="${HEALTH_INTERVAL:-5}"
api_domain="$(grep -E '^API_DOMAIN=' .env | head -n 1 | cut -d= -f2-)"
health_url="${HEALTH_URL:-https://$api_domain/health}"
# The check goes through Caddy and its real certificate, but to this machine
# (127.0.0.1) rather than out to the public address and back. The rehearsal
# replaces these arguments (its own CA and port).
read -r -a health_args <<< "${HEALTH_CURL_ARGS:---resolve $api_domain:443:127.0.0.1}"

previous=""
previous_db=""
if [ -f current-tag ]; then
  read -r previous previous_db < current-tag || true
fi

compose() {
  local image_tag="$1" image_db_tag="$2"
  shift 2
  IMAGE_TAG="$image_tag" DB_IMAGE_TAG="$image_db_tag" docker compose "$@"
}

healthy() {
  local want="$1" body
  for _ in $(seq 1 "$attempts"); do
    if body="$(curl -fsS --max-time 5 "${health_args[@]}" "$health_url" 2>/dev/null)" \
      && [[ "$body" == *'"db":"ok"'* && "$body" == *'"redis":"ok"'* && "$body" == *"\"version\":\"$want\""* ]]; then
      return 0
    fi
    sleep "$interval"
  done
  echo "deploy: $health_url never reported $want healthy (last: ${body:-no answer})" >&2
  return 1
}

echo "deploy: $tag (database image $db_tag), previous ${previous:-none}"

compose "$tag" "$db_tag" --profile release pull
if ! compose "$tag" "$db_tag" --profile release run --rm release; then
  echo "deploy: database release failed; ${previous:-nothing} is still running" >&2
  exit 1
fi
compose "$tag" "$db_tag" up -d --remove-orphans

if healthy "$tag"; then
  echo "$tag $db_tag" > current-tag
  # Images unused for a week go; a rollback past that pulls them again.
  docker image prune -af --filter "until=168h" >/dev/null || true
  echo "deploy: $tag is live"
  exit 0
fi

if [ -z "$previous" ]; then
  echo "deploy: no previous tag to roll back to" >&2
  exit 1
fi
echo "deploy: rolling back to $previous" >&2
compose "$previous" "$previous_db" up -d --remove-orphans
if healthy "$previous"; then
  echo "deploy: failed; rolled back to $previous" >&2
else
  echo "deploy: failed, and the rollback to $previous is not healthy either" >&2
fi
exit 1
