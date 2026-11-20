#!/usr/bin/env bash
# Tests for ci-deploy.sh, the deploy key's forced command on the Azure VM.
# Runs anywhere with bash and git (CI's shellcheck job runs it):
#
#   bash infra/azure/ci-deploy.test.sh
#
# It builds a throwaway "origin" repository whose main branch carries a stub
# update.sh that only records the commit it was asked for, clones it as the
# VM's src, and runs ci-deploy.sh against that root.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

git_() { git -c user.name=test -c user.email=test@example.com -c init.defaultBranch=main "$@"; }

# origin: main has the stub update.sh; a side branch has one more commit.
origin="$tmp/origin"
git_ init -q "$origin"
mkdir -p "$origin/infra/azure"
cat > "$origin/infra/azure/update.sh" <<'EOF'
#!/usr/bin/env bash
echo "stub update.sh ran with: $1"
echo "$1" > "$(dirname "$0")/../../../ran-with"
[ -z "${FAIL_UPDATE:-}" ]
EOF
git_ -C "$origin" add -A
git_ -C "$origin" commit -q -m "main with update.sh"
main_sha=$(git -C "$origin" rev-parse HEAD)
git_ -C "$origin" checkout -q -b side
echo side > "$origin/side.txt"
git_ -C "$origin" add -A
git_ -C "$origin" commit -q -m "side commit"
side_sha=$(git -C "$origin" rev-parse HEAD)
git_ -C "$origin" checkout -q main

# The VM's root: src is a clone, like provision.sh makes it.
root="$tmp/root"
mkdir -p "$root"
git_ clone -q "$origin" "$root/src"

failures=0
check() { # description, expected exit code, expected output substring (or ""), then the command
  local what=$1 want_code=$2 want_out=$3; shift 3
  local out code=0
  out=$("$@" 2>&1) || code=$?
  if [ "$code" != "$want_code" ]; then
    echo "FAIL: $what: exit $code, expected $want_code; output: $out"; failures=$((failures + 1)); return
  fi
  if [ -n "$want_out" ] && [[ "$out" != *"$want_out"* ]]; then
    echo "FAIL: $what: output lacks '$want_out': $out"; failures=$((failures + 1)); return
  fi
  echo "ok: $what"
}
expect() { # description, got, wanted
  if [ "$2" = "$3" ]; then echo "ok: $1"; else echo "FAIL: $1: got '$2', wanted '$3'"; failures=$((failures + 1)); fi
}
ran_with() { cat "$root/ran-with" 2>/dev/null || echo none; }
run() { KPI_NEXUS_ROOT="$root" SSH_ORIGINAL_COMMAND="${1-}" bash "$here/ci-deploy.sh"; }

rm -f "$root/ran-with"
check "no commit given is refused" 2 "full commit SHA" run ""
check "a short SHA is refused" 2 "full commit SHA" run "${main_sha:0:8}"
check "a command in place of a SHA is refused" 2 "full commit SHA" run "rm -rf /"
check "a SHA with a trailing command is refused" 2 "full commit SHA" run "$main_sha; id"
check "a commit that is not on main is refused" 3 "not on main" run "$side_sha"
expect "nothing was deployed by the refused calls" "$(ran_with)" none

check "a commit on main runs its update.sh and streams the log" 0 "stub update.sh ran with: $main_sha" run "$main_sha"
expect "update.sh got the full SHA" "$(ran_with)" "$main_sha"
expect "src is at the commit" "$(git -C "$root/src" rev-parse HEAD)" "$main_sha"
expect "the run is kept in update.log" "$(test -s "$root/update.log" && echo kept)" kept

# A new commit on origin's main is found by the fetch.
echo more > "$origin/more.txt"
git_ -C "$origin" add -A
git_ -C "$origin" commit -q -m "newer main"
new_sha=$(git -C "$origin" rev-parse HEAD)
check "a commit pushed to main after the clone deploys" 0 "ran with: $new_sha" run "$new_sha"

check "update.sh failing fails the deploy" 1 "" env FAIL_UPDATE=1 KPI_NEXUS_ROOT="$root" SSH_ORIGINAL_COMMAND="$new_sha" bash "$here/ci-deploy.sh"

if [ "$failures" != 0 ]; then echo "$failures failure(s)"; exit 1; fi
echo "all ci-deploy.sh tests passed"
