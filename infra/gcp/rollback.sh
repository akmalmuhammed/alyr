#!/usr/bin/env bash
# Go back on Google Cloud by splitting traffic, with no rebuild and no new image (ALY-269).
# Run on the founder's machine, signed in with `gcloud auth login`. Steps and the rehearsal:
# docs/runbooks/rollback.md.
#
#   infra/gcp/rollback.sh status                    what serves now: each service's traffic, the worker pool's split
#   infra/gcp/rollback.sh revisions <name>          the last 8 revisions of alyr-api, alyr-web or alyr-worker, newest first
#   infra/gcp/rollback.sh to <name> <revision>      send all of that service's traffic to one revision (asks "yes")
#   infra/gcp/rollback.sh forward [<name>]          back to "latest", for one or for all three (asks "yes")
#   infra/gcp/rollback.sh check                     the health checks deploy-gcp runs
#
# <name> is alyr-api, alyr-web (Cloud Run services) or alyr-worker (the worker pool). Only `to`
# and `forward` change anything; both print what they will run and wait for you to type yes
# (ALYR_ASSUME_YES=1 skips the question, for a rehearsal you script).
#
# After `to`, the service stays on that revision: the next deploy-gcp run sends traffic to
# "latest" again by itself, and `forward` does the same by hand. A migration is never undone by
# any of this: see "Going back across a migration" in the runbook before you go back past one.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"

# shellcheck source=infra/gcp/gcloud.sh
. "$(dirname "$0")/gcloud.sh"
g() { gcloud_run --project "$PROJECT" --quiet "$@"; }
die() { echo "rollback: $*" >&2; exit 1; }

# Checked in the main shell: a `die` inside $(kind ...) would only end the subshell.
valid() {
  case "${1:-}" in
    alyr-api | alyr-web | alyr-worker) ;;
    *) die "'${1:-}' is not alyr-api, alyr-web or alyr-worker" ;;
  esac
}
kind() { if [ "$1" = alyr-worker ]; then echo pool; else echo service; fi; }

sure() {
  echo "About to run:"
  printf '  gcloud %s\n' "$*"
  [ "${ALYR_ASSUME_YES:-}" = "1" ] && return 0
  read -r -p "Type yes to go on: " answer
  [ "$answer" = "yes" ] || die "nothing changed"
}

# Traffic (a service) or instances (the worker pool) to one revision, or back to latest.
split() { # <name> <revision|latest>
  local name="$1" to="$2"
  valid "$name"
  if [ "$(kind "$name")" = service ]; then
    if [ "$to" = latest ]; then
      sure run services update-traffic "$name" --region "$REGION" --to-latest
      g run services update-traffic "$name" --region "$REGION" --to-latest
    else
      sure run services update-traffic "$name" --region "$REGION" --to-revisions "$to=100"
      g run services update-traffic "$name" --region "$REGION" --to-revisions "$to=100"
    fi
  else
    if [ "$to" = latest ]; then
      sure run worker-pools update-instance-split "$name" --region "$REGION" --to-latest
      g run worker-pools update-instance-split "$name" --region "$REGION" --to-latest
    else
      sure run worker-pools update-instance-split "$name" --region "$REGION" --to-revisions "$to=100"
      g run worker-pools update-instance-split "$name" --region "$REGION" --to-revisions "$to=100"
    fi
  fi
}

case "${1:-}" in
  status)
    for name in alyr-api alyr-web; do
      echo "== $name (traffic)"
      g run services describe "$name" --region "$REGION" --format='yaml(status.traffic)' | tr -d '\r'
    done
    echo "== alyr-worker (instance split)"
    g run worker-pools describe alyr-worker --region "$REGION" \
      --format='yaml(instanceSplits, instanceSplitStatuses, latestReadyRevision)' | tr -d '\r'
    ;;

  revisions)
    name="${2:-}"
    valid "$name"
    if [ "$(kind "$name")" = service ]; then
      g run revisions list --service "$name" --region "$REGION" --sort-by='~metadata.creationTimestamp' \
        --limit 8 --format='table(metadata.name, metadata.creationTimestamp.date("%d %b %H:%M"), spec.containers[0].image.basename())' | tr -d '\r'
    else
      g run worker-pools revisions list --worker-pool "$name" --region "$REGION" --limit 8 | tr -d '\r'
    fi
    ;;

  to)
    [ -n "${3:-}" ] || die "usage: rollback.sh to <name> <revision>  (revision names: rollback.sh revisions <name>)"
    split "$2" "$3"
    ;;

  forward)
    if [ -n "${2:-}" ]; then
      split "$2" latest
    else
      for name in alyr-api alyr-web alyr-worker; do split "$name" latest; done
    fi
    ;;

  check)
    api="https://alyr-api-$(g projects describe "$PROJECT" --format='value(projectNumber)' | tr -d '\r').$REGION.run.app"
    curl -fsS "$api/health/ready" && echo
    curl -fsS "$api/health/worker" && echo
    curl -fsS -o /dev/null -w 'app.alyr.qa/login: %{http_code}\n' "https://app.alyr.qa/login"
    ;;

  *)
    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
    exit 2
    ;;
esac
