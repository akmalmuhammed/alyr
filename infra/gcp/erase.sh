#!/usr/bin/env bash
# The daily erasure of stopped clients' data on Google Cloud in Doha (spec 042, decision D-116).
# NOT APPLIED: nothing here has been run against the production project. Run it on the founder's
# machine, signed in with `gcloud auth login` as an owner of the project, when the founder says go.
#
#   infra/gcp/erase.sh plan <tag>       print what `deploy` would do, calling nothing (the default)
#   infra/gcp/erase.sh deploy <tag>     the Cloud Run job `alyr-erase` with the switch OFF, and its
#                                       Cloud Scheduler schedule, made and then PAUSED
#   infra/gcp/erase.sh dry-run          run the job once now, report only; then `logs` shows the report
#   infra/gcp/erase.sh logs             the last reports the job printed (IDs, dates and counts only)
#   infra/gcp/erase.sh status           what has been erased, what is held, what is still in the photo store
#   infra/gcp/erase.sh hold <client id> <reference>   keep one client from being erased until released
#                                       (80 characters at most: a reference, never a name; Google logs the arguments)
#   infra/gcp/erase.sh release <client id>
#   infra/gcp/erase.sh enable           turn the real deletion ON and resume the schedule (asks you to type ERASE)
#   infra/gcp/erase.sh disable          turn it OFF again and pause the schedule (nothing deleted is brought back)
#
# What it makes, and why it is built this way (docs/runbooks/erasing-a-client.md):
#  - One Cloud Run job, `alyr-erase`, running `python -m alyr.erase_job` from the same image as the
#    API. It runs as the account `alyr-migrate`, the only account that may read the database owner's
#    address (ALY-268), because the application's role cannot delete a business and the always-on
#    API and worker must never hold the owner's address. No new account, no new secret.
#  - It reads `migration-url` and `database-url` and nothing else. It holds no photo-store keys:
#    the worker, which has them, empties the photos from a list the job leaves in the database.
#  - It is made with ALYR_ERASE_STOPPED_CLIENTS=false. With the switch off it only reports what it
#    would delete and changes nothing. `enable` is the one command that turns deletion on.
#  - The schedule is created PAUSED. It runs at 03:30 Doha time, after the 02:00 export and backup.
#  - No retries: a failed run is a signal, not something to repeat in the night. The next day's run
#    picks up where it stopped.
# No secret is printed, written to a file or passed anywhere by this script.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"
NETWORK="alyr-net"
SUBNET="alyr-run"
REPO="alyr"
JOB="alyr-erase"
SCHEDULE="alyr-erase-daily"
RUNS_AS="alyr-migrate"
DRY_RUN=""

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"
# shellcheck source=infra/gcp/gcloud.sh
. ./gcloud.sh
g() { gcloud_run --project "$PROJECT" --quiet "$@"; }
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }
exists() { "$@" >/dev/null 2>&1; }
private_net=(--network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only)
run_url="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/$JOB:run"

change() { # what it does (shown), then the gcloud arguments
  local what="$1"; shift
  if [ -n "$DRY_RUN" ]; then echo "  would $what"; else echo "  $what"; g "$@" >/dev/null; fi
}

deploy_job() { # tag
  local tag="$1" images="$REGION-docker.pkg.dev/$PROJECT/$REPO" verb=create
  change "make or update the job $JOB (image alyr-api:$tag, runs as $RUNS_AS, ALYR_ERASE_STOPPED_CLIENTS=false)" \
    run jobs deploy "$JOB" --region="$REGION" --image="$images/alyr-api:$tag" \
    --args=python,-m,alyr.erase_job --service-account="$(sa "$RUNS_AS")" "${private_net[@]}" \
    --set-env-vars=ALYR_ENV=production,ALYR_ERASE_STOPPED_CLIENTS=false \
    --set-secrets=ALYR_MIGRATION_URL=migration-url:latest,ALYR_DATABASE_URL=database-url:latest \
    --cpu=1 --memory=512Mi --max-retries=0 --task-timeout=30m
  # Cloud Scheduler calls the Cloud Run API as the same account, which may start this job only.
  change "let $RUNS_AS start the job (and nothing else)" \
    run jobs add-iam-policy-binding "$JOB" --region="$REGION" \
    --member="serviceAccount:$(sa "$RUNS_AS")" --role=roles/run.invoker
  if [ -z "$DRY_RUN" ] && exists g scheduler jobs describe "$SCHEDULE" --location="$REGION"; then verb=update; fi
  change "$verb the schedule $SCHEDULE: every day at 03:30 Doha time" \
    scheduler jobs "$verb" http "$SCHEDULE" --location="$REGION" \
    --schedule="30 3 * * *" --time-zone="Asia/Qatar" --uri="$run_url" --http-method=POST \
    --oauth-service-account-email="$(sa "$RUNS_AS")" \
    --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform
  # A new schedule starts running at once; this one waits until the founder resumes it.
  change "pause the schedule $SCHEDULE until 'enable'" scheduler jobs pause "$SCHEDULE" --location="$REGION"
}

run_job() { # the job's arguments, after python -m alyr.erase_job
  local args="python@-m@alyr.erase_job" a
  for a in "$@"; do
    case "$a" in *@*) echo "erase: '@' cannot be used in an argument" >&2; exit 1 ;; esac
    args="$args@$a"
  done
  # `^@^` makes @ the list separator, because a reason may have commas in it.
  g run jobs execute "$JOB" --region="$REGION" --args="^@^$args" --wait
}

show_logs() {
  g logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND textPayload:\"{\"" \
    --limit="${1:-10}" --freshness=7d --format='value(timestamp,textPayload)'
}

case "${1:-plan}" in
  plan)
    DRY_RUN=1
    tag="${2:-<tag>}"
    echo "Plan only: nothing is called. This is what 'deploy $tag' would do:"
    deploy_job "$tag"
    echo "Then: 'dry-run' to see a first report, 'status' for the record, 'enable' when the founder says go."
    ;;

  deploy)
    tag="${2:?usage: erase.sh deploy <image tag>}"
    echo "Making the job and the schedule (switch OFF, schedule PAUSED)..."
    deploy_job "$tag"
    echo "Done. Nothing is deleted while the switch is off. Next: infra/gcp/erase.sh dry-run"
    ;;

  dry-run)
    echo "Running the job once, report only..."
    run_job --dry-run
    show_logs 3
    ;;

  logs) show_logs "${2:-10}" ;;

  status)
    run_job status
    show_logs 1
    ;;

  hold)
    id="${2:?usage: erase.sh hold <client id> <reference>}"; shift 2
    [ "$#" -gt 0 ] || { echo "usage: erase.sh hold <client id> <reference>" >&2; exit 1; }
    reason="$*"
    # The reason travels in the job's arguments, which Google logs: a reference, not a story.
    [ "${#reason}" -le 80 ] || { echo "erase: 80 characters at most, a reference and not a name" >&2; exit 1; }
    run_job hold "$id" "$@"
    ;;

  release)
    run_job release "${2:?usage: erase.sh release <client id>}"
    ;;

  enable)
    cat <<'TEXT'
This turns the real deletion ON. From the next run, every client whose cancellation took effect
60 or more days ago has its businesses' data deleted for good (a client in a hold, or with a card
subscription still running, is skipped). Copies in backups follow within 35 days; this cannot
bring anything back.
Before you do this: docs/runbooks/erasing-a-client.md, "Before the switch goes on".
TEXT
    read -r -p "Type ERASE to turn it on: " answer
    [ "$answer" = "ERASE" ] || { echo "Not turned on."; exit 1; }
    change "turn the switch ON for the job" run jobs update "$JOB" --region="$REGION" \
      --update-env-vars=ALYR_ERASE_STOPPED_CLIENTS=true
    change "resume the schedule $SCHEDULE" scheduler jobs resume "$SCHEDULE" --location="$REGION"
    echo "On. The first run is at the next 03:30 Doha time."
    ;;

  disable)
    change "pause the schedule $SCHEDULE" scheduler jobs pause "$SCHEDULE" --location="$REGION"
    change "turn the switch OFF for the job" run jobs update "$JOB" --region="$REGION" \
      --update-env-vars=ALYR_ERASE_STOPPED_CLIENTS=false
    echo "Off. What was deleted stays deleted."
    ;;

  *)
    sed -n '2,/^[^#]/p' "$SELF" | sed '$d' | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
