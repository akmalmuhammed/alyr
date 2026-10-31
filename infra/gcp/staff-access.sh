#!/usr/bin/env bash
# The break-glass for ALYR's own staff accounts on Google Cloud in Doha (ALY-125, D-135, D-136).
# APPLIED 31 Oct 2026: the job exists on the production project (image = the commit the API runs).
# Run it on the founder's machine, signed in with `gcloud auth login` as an owner of the project.
#
#   infra/gcp/staff-access.sh plan <tag>             print what `deploy` would do, calling nothing (the default)
#   infra/gcp/staff-access.sh deploy <tag>           make the Cloud Run job `alyr-staff-access`
#   infra/gcp/staff-access.sh status <email>         where the account stands (reads only; writes nothing)
#   infra/gcp/staff-access.sh clear-lock <email> <reason>
#                                                    forget the account's wrong codes of the last day and void its
#                                                    unused codes, so a locked account can sign in again
#   infra/gcp/staff-access.sh logs                   the last answers the job printed
#
# Read docs/runbooks/staff-sign-in.md first. What it makes, and why it is built this way:
#  - One Cloud Run job, `alyr-staff-access`, running `python -m alyr.staff_breakglass` from the same
#    image as the API. It runs as the account `alyr-migrate`, the only account that may read the
#    database owner's address (ALY-268). The application cannot become the database owner, so
#    nothing a stolen staff sign-in can reach can run this. No new account, no new secret.
#  - It reads `migration-url` and `database-url` and nothing else.
#  - It knows a short list of commands and nothing else. Every change is written to the audit log
#    (`staff.breakglass`, with the reason) in the same transaction as the change, and Google logs the
#    execution, who started it and its arguments. A reason is therefore 80 characters at most, a
#    reference and never a story or a name.
#  - The job is never scheduled. It runs only when someone starts it here.
# No secret is printed, written to a file or passed anywhere by this script.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"
NETWORK="alyr-net"
SUBNET="alyr-run"
REPO="alyr"
JOB="alyr-staff-access"
RUNS_AS="alyr-migrate"
DRY_RUN=""

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"
# shellcheck source=infra/gcp/gcloud.sh
. ./gcloud.sh
g() { gcloud_run --project "$PROJECT" --quiet "$@"; }
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }
private_net=(--network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only)

change() { # what it does (shown), then the gcloud arguments
  local what="$1"; shift
  if [ -n "$DRY_RUN" ]; then echo "  would $what"; else echo "  $what"; g "$@" >/dev/null; fi
}

deploy_job() { # tag
  local tag="$1" images="$REGION-docker.pkg.dev/$PROJECT/$REPO"
  change "make or update the job $JOB (image alyr-api:$tag, runs as $RUNS_AS, never scheduled)" \
    run jobs deploy "$JOB" --region="$REGION" --image="$images/alyr-api:$tag" \
    --args=python,-m,alyr.staff_breakglass,status,nobody@example.invalid \
    --service-account="$(sa "$RUNS_AS")" "${private_net[@]}" \
    --set-env-vars=ALYR_ENV=production \
    --set-secrets=ALYR_MIGRATION_URL=migration-url:latest,ALYR_DATABASE_URL=database-url:latest \
    --cpu=1 --memory=512Mi --max-retries=0 --task-timeout=5m
}

run_job() { # the job's arguments, after python -m alyr.staff_breakglass
  local args="python|-m|alyr.staff_breakglass" a
  for a in "$@"; do
    case "$a" in *"|"*) echo "staff-access: '|' cannot be used in an argument" >&2; exit 1 ;; esac
    args="$args|$a"
  done
  # `^|^` makes | the list separator, because a reason may have commas in it and an email has an @.
  g run jobs execute "$JOB" --region="$REGION" --args="^|^$args" --wait
}

show_answer() { # everything the last execution printed (its JSON is logged a line at a time)
  local exec out try
  exec="$(g run jobs executions list --job="$JOB" --region="$REGION" --limit=1 --format='value(name)' | tr -d '\r')"
  for try in 1 2 3 4 5; do
    out="$(g logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND labels.\"run.googleapis.com/execution_name\"=\"$exec\"" \
      --order=asc --freshness=1d --format='value(textPayload)' | tr -d '\r' | grep -v '^$' || true)"
    case "$out" in *"Container called exit"*) break ;; esac
    sleep 5 # Google's log lags the execution by a few seconds
  done
  echo "$out"
}

show_logs() {
  g logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND textPayload:\"{\"" \
    --limit="${1:-5}" --freshness=7d --format='value(timestamp,textPayload)'
}

case "${1:-plan}" in
  plan)
    DRY_RUN=1
    tag="${2:-<tag>}"
    echo "Plan only: nothing is called. This is what 'deploy $tag' would do:"
    deploy_job "$tag"
    echo "Then: 'status <email>' reads where an account stands; 'clear-lock <email> <reason>' lifts a lock."
    ;;

  deploy)
    tag="${2:?usage: staff-access.sh deploy <image tag>}"
    echo "Making the job (no schedule)..."
    deploy_job "$tag"
    echo "Done. Next: infra/gcp/staff-access.sh status <email>"
    ;;

  status)
    run_job status "${2:?usage: staff-access.sh status <email>}"
    show_answer
    ;;

  clear-lock)
    email="${2:?usage: staff-access.sh clear-lock <email> <reason>}"; shift 2
    [ "$#" -gt 0 ] || { echo "usage: staff-access.sh clear-lock <email> <reason>" >&2; exit 1; }
    reason="$*"
    [ "${#reason}" -le 80 ] || { echo "staff-access: 80 characters at most, a reference and not a story" >&2; exit 1; }
    run_job clear-lock "$email" "$reason"
    show_answer
    ;;

  logs) show_logs "${2:-5}" ;;

  *)
    sed -n '2,/^[^#]/p' "$SELF" | sed '$d' | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
