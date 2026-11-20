#!/usr/bin/env bash
# What GitHub's Deploy workflow runs on the Azure VM (ADR-004). It is the
# forced command of the deploy key in ~ubuntu/.ssh/authorized_keys:
#
#   command="/srv/kpi-nexus/ci-deploy.sh",restrict ssh-ed25519 AAAA… kpi-nexus-azure-deploy
#
# so that key can do one thing: bring the VM to a commit that is on main. The
# workflow runs `ssh ubuntu@<vm> <full commit sha>`; sshd hands the argument
# over as SSH_ORIGINAL_COMMAND. Then:
#
#   1. the argument must be a full 40-character commit SHA, nothing else
#   2. fetch; the commit must be on origin/main (a leaked key deploys nothing
#      that did not pass review, CI and Security)
#   3. check that commit out and run its own infra/azure/update.sh, which
#      rebuilds the images, runs the database release (migrations only add;
#      the data volumes are never touched), starts the containers and waits
#      for /api/health to answer with the commit
#
# update.sh runs in its own session with its output in update.log, which is
# streamed back over SSH: if the connection drops, the deploy finishes anyway
# and the workflow's own health check still sees the result.
#
# update.sh keeps the copy at /srv/kpi-nexus/ci-deploy.sh fresh on every run.
# Test: ci-deploy.test.sh.
set -euo pipefail
ROOT=${KPI_NEXUS_ROOT:-/srv/kpi-nexus}

sha=${SSH_ORIGINAL_COMMAND-}
if ! [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ci-deploy: expected a full commit SHA, got '${sha}'" >&2
  exit 2
fi

cd "$ROOT"
git -C src fetch -q --tags origin
if ! git -C src merge-base --is-ancestor "$sha" origin/main; then
  echo "ci-deploy: $sha is not on main" >&2
  exit 3
fi
git -C src checkout -q --detach "$sha"

echo "ci-deploy: $sha, running its update.sh (log: $ROOT/update.log)"
setsid bash src/infra/azure/update.sh "$sha" > update.log 2>&1 < /dev/null &
pid=$!
tail --pid="$pid" -n +1 -f update.log
wait "$pid"
