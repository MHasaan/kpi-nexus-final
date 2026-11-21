#!/usr/bin/env bash
# Bring the Azure VM to a commit of the repository: fetch it, rebuild the images
# on the VM, run the database release, start the new containers and check that
# the site answers with the new commit. About 15 minutes; the site is down for
# the last minute or so. Run on the VM:
#
#   bash /srv/kpi-nexus/src/infra/azure/update.sh [ref]
#
# ref: a branch (origin/main, the default), a tag (v1.1.0) or a commit.
set -euo pipefail
REF=${1:-origin/main}
cd /srv/kpi-nexus
REPO=/srv/kpi-nexus/src
set -a
# shellcheck disable=SC1091
. ./.env
set +a
if docker info >/dev/null 2>&1; then D=docker; else D="sudo docker"; fi
log() { echo "[$(date +%T)] $*"; }

log "fetching $REF"
git -C src fetch -q --tags origin
git -C src checkout -q --detach "$REF"
SHA=$(git -C src rev-parse --short HEAD)
OLD=$(cat current-sha 2>/dev/null || true)
log "at $SHA (running: ${OLD:-unknown})"

# The VM runs the repository's compose files, Caddyfile and web Dockerfile.
cp src/infra/prod/docker-compose.yml docker-compose.yml
if [ -d src/infra/azure ]; then
  cp src/infra/azure/docker-compose.override.yml src/infra/azure/Caddyfile src/infra/azure/web.Dockerfile .
fi

# True when the paths changed since the running commit, or when that is unknown.
# (An absolute path: the build runs inside src.)
changed() { [ -z "$OLD" ] || ! git -C "$REPO" diff --quiet "$OLD" "$SHA" -- "$@" 2>/dev/null; }

log "building images (the web app takes longest)"
(
  cd src
  $D build -q --target build -f apps/api/Dockerfile -t local/kpi-nexus-tools:demo .
  $D build -q --build-arg APP_VERSION="$SHA" -f apps/api/Dockerfile -t local/kpi-nexus-api:demo .
  if changed apps/ml; then log "apps/ml changed: rebuilding the ML image"; $D build -q -t local/kpi-nexus-ml:demo apps/ml; fi
  if changed infra/prod/postgres; then log "infra/prod/postgres changed: rebuilding the database image"; $D build -q -t local/kpi-nexus-db:demo infra/prod/postgres; fi
  $D build -q --build-arg NEXT_PUBLIC_API_URL="https://$API_DOMAIN/api" -f ../web.Dockerfile -t local/kpi-nexus-web:demo .
)

log "database release (migrations, then the SQL files)"
$D compose --profile release run --rm release

log "starting"
$D compose up -d --remove-orphans

log "waiting for https://$API_DOMAIN/api/health to answer with $SHA"
v=""
for _ in $(seq 1 36); do
  v=$(curl -fs --max-time 5 "https://$API_DOMAIN/api/health" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)
  [ "$v" = "$SHA" ] && break
  sleep 5
done
if [ "$v" != "$SHA" ]; then
  log "the site did not answer with $SHA (got '${v:-nothing}'); look at: $D compose logs api"
  exit 1
fi
echo "$SHA" > current-sha

# Old image layers and build cache no build uses any more; the latest build's cache stays, so the next update is quick.
$D image prune -f >/dev/null
$D builder prune -f >/dev/null
log "UPDATE DONE: $SHA at https://$API_DOMAIN"
