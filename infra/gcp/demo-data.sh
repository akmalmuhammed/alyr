#!/usr/bin/env bash
# Made-up demo data in ONE test business on Google Cloud in Doha (spec 064, decision D-151).
# NOT APPLIED: nothing here has been run against the production project. Run it on the founder's
# machine, signed in with `gcloud auth login` as an owner of the project, when the founder says go.
#
#   infra/gcp/demo-data.sh plan <tag>            print what `deploy` would do, calling nothing (the default)
#   infra/gcp/demo-data.sh deploy <tag>          make or update the Cloud Run job `alyr-demo-data` (no schedule)
#   infra/gcp/demo-data.sh dry-run <email>       rehearse the load for the business whose owner signs in as <email>
#   infra/gcp/demo-data.sh load <email>          load it (refused without a dry run made in the last day)
#   infra/gcp/demo-data.sh replace <email>       remove the previous load and load again (a dry run first, too)
#   infra/gcp/demo-data.sh remove <email>        take out exactly what the last load made
#   infra/gcp/demo-data.sh logs [n]              the last lines the job printed (names and counts only)
#
# What it makes, and why it is built this way (docs/runbooks/demo-data.md):
#  - One Cloud Run job, `alyr-demo-data`, running `python -m alyr.seed_into_business` from the same
#    image as the API. It runs as `alyr-migrate`, the only account that may read the database owner's
#    address, because the command removes rows the application's role may not delete and moves dates
#    of rows it made. The always-on API and worker never hold that address. No new account, no secret.
#  - It reads `migration-url` and `database-url` and nothing else: no WhatsApp token, no email key,
#    no payment key, no photo-store key. It could not send anything if it tried; the command also
#    refuses to leave a job or a webhook behind. Photos are stored by the worker, which has the keys.
#  - It acts on one business, named by its owner's email, and only if ALYR staff marked that business
#    as a test business in the back office (/ops). It refuses every other business.
#  - The email is passed as a job argument, which Google logs. It is the founder's own sign-in
#    address, never a customer's.
#  - There is no schedule. A person starts it, each time.
# No secret is printed, written to a file or passed anywhere by this script.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"
NETWORK="alyr-net"
SUBNET="alyr-run"
REPO="alyr"
JOB="alyr-demo-data"
RUNS_AS="alyr-migrate"
YES="--yes-this-business-is-a-test"
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
  change "make or update the job $JOB (image alyr-api:$tag, runs as $RUNS_AS, no schedule)" \
    run jobs deploy "$JOB" --region="$REGION" --image="$images/alyr-api:$tag" \
    --args=python,-m,alyr.seed_into_business --service-account="$(sa "$RUNS_AS")" "${private_net[@]}" \
    --set-env-vars=ALYR_ENV=production \
    --set-secrets=ALYR_MIGRATION_URL=migration-url:latest,ALYR_DATABASE_URL=database-url:latest \
    --cpu=1 --memory=1Gi --max-retries=0 --task-timeout=30m
}

run_job() { # the command's arguments, after python -m alyr.seed_into_business
  # `^#^` makes # the list separator, because an email address has an @ and a comma may follow.
  local args="python#-m#alyr.seed_into_business" a
  for a in "$@"; do
    case "$a" in *"#"*) echo "demo-data: '#' cannot be used in an argument" >&2; exit 1 ;; esac
    args="$args#$a"
  done
  g run jobs execute "$JOB" --region="$REGION" --args="^#^$args" --wait
}

show_logs() {
  g logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\"" \
    --limit="${1:-60}" --freshness=7d --format='value(timestamp,textPayload)'
}

need_email() { EMAIL="${1:?usage: demo-data.sh $2 <owner sign-in email>}"; }

case "${1:-plan}" in
  plan)
    DRY_RUN=1
    tag="${2:-<tag>}"
    echo "Plan only: nothing is called. This is what 'deploy $tag' would do:"
    deploy_job "$tag"
    echo "Then: 'dry-run <email>', read the summary, 'load <email>'. Mark the business as a test business in /ops first."
    ;;

  deploy)
    tag="${2:?usage: demo-data.sh deploy <image tag>}"
    deploy_job "$tag"
    echo "Done. Nothing was loaded. Next: mark the business as a test business in /ops, then 'dry-run <email>'."
    ;;

  dry-run)
    need_email "${2:-}" dry-run
    echo "Rehearsing the load for $EMAIL (nothing is written)..."
    run_job --owner-email "$EMAIL" "$YES" --dry-run
    show_logs 80
    ;;

  load)
    need_email "${2:-}" load
    echo "Loading made-up data into the test business of $EMAIL..."
    run_job --owner-email "$EMAIL" "$YES"
    show_logs 80
    ;;

  replace)
    need_email "${2:-}" replace
    echo "Press 'Download all data' in the workspace first: the copy this command takes is written inside a"
    echo "short-lived container and is gone when the job ends."
    read -r -p "Type REPLACE to go on: " answer
    [ "$answer" = "REPLACE" ] || { echo "Not done."; exit 1; }
    run_job --owner-email "$EMAIL" "$YES" --replace
    show_logs 80
    ;;

  remove)
    need_email "${2:-}" remove
    run_job --owner-email "$EMAIL" "$YES" --remove
    show_logs 20
    ;;

  logs) show_logs "${2:-60}" ;;

  *)
    sed -n '2,/^[^#]/p' "$SELF" | sed '$d' | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
