#!/usr/bin/env bash
# The server side of automatic deploys (.github/workflows/deploy.yml). The deploy key in GitHub is
# locked to this script in ~/.ssh/authorized_keys (command="…"), so whoever holds that key can only
# deploy what is on origin/main — never run anything else, forward ports or open a shell.
#
#   SSH_ORIGINAL_COMMAND (what the workflow asked for): "deploy <40-hex sha>" or "status".
#   Deploys origin/main when it is, or contains, that commit; anything else is refused.
#
# The body is one function called on the last line: `git merge` below can replace this file while it
# runs, and bash reads a script as it goes, but a function is read whole before it starts.
set -euo pipefail

free_kb() { df -Pk "$1" | awk 'NR==2 {print $4}'; }
free_h() { df -Ph "$1" | awk 'NR==2 {print $4 " free of " $2}'; }

main() {
  local repo="${CADENCE_DIR:-$HOME/cadence}" req="${SSH_ORIGINAL_COMMAND:-status}"
  cd "$repo"
  case "$req" in
    status) echo "deployed $(git rev-parse HEAD)"; return 0 ;;
    deploy\ *) ;;
    *) echo "refused: expected 'deploy <sha>' or 'status'" >&2; return 2 ;;
  esac
  local want="${req#deploy }"
  [[ "$want" =~ ^[0-9a-f]{40}$ ]] || { echo "refused: '$want' is not a commit id" >&2; return 2; }

  # One deploy at a time: a second waits up to 15 minutes for the first.
  exec 9>"${TMPDIR:-/tmp}/cadence-deploy.lock"
  flock -w 900 9 || { echo "another deploy is still running" >&2; return 3; }

  git fetch --quiet origin main
  if ! git merge-base --is-ancestor "$want" origin/main 2>/dev/null; then
    echo "refused: $want is not on origin/main" >&2; return 2
  fi
  local before; before="$(git rev-parse HEAD)"
  git merge --ff-only --quiet origin/main
  echo "from $before to $(git rev-parse HEAD) (asked for $want)"

  # The build needs a few GB free. Below 5 GB, clear the whole build cache first: that build is slower,
  # not broken. A full disk fails the build before anything restarts, so the site keeps the old version.
  local root; root="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /)"
  if [ "$(free_kb "$root")" -lt 5242880 ]; then
    echo "low disk: $(free_h "$root"); clearing the build cache first"
    docker builder prune -af >/dev/null
    docker image prune -f >/dev/null
  fi

  # deploy/deploy.sh runs this too: settings check (stops on a setting that would break sign-in),
  # rebuild, migrate (the compose migrate service), restart, then tidy old images and week-old cache.
  sh deploy/check-env.sh deploy/.env
  docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build --remove-orphans
  docker image prune -f >/dev/null
  docker builder prune -f --filter until=168h >/dev/null
  echo "deployed $(git rev-parse HEAD); disk: $(free_h "$root")"
}

main "$@"; exit $?
