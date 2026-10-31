#!/usr/bin/env bash
# The break-glass for ALYR's own staff accounts on Google Cloud in Doha (ALY-125, D-135, D-136).
# NOT APPLIED: nothing here has been run against the production project. Run it on the founder's
# machine, signed in with `gcloud auth login` as an owner of the project, when the founder says go.
#
#   infra/gcp/staff-access.sh plan <tag>             print what `deploy` would do, calling nothing (the default)
#   infra/gcp/staff-access.sh deploy <tag>           make the Cloud Run job `alyr-staff-access`
#   infra/gcp/staff-access.sh status <email>         where the account stands (reads only; writes nothing)
#   infra/gcp/staff-access.sh ready                  whether the second factor can be required without locking
#                                                    anybody out (reads only; fails when someone has no
#                                                    authenticator or no recovery code left)
#   infra/gcp/staff-access.sh require                require the second factor for the whole back office: runs
#                                                    `ready`, asks you to type REQUIRE, then sets ALYR_STAFF_2FA
#                                                    on the API (a new revision, no downtime)
#   infra/gcp/staff-access.sh unrequire              stop requiring it (removes the setting; nothing else changes)
#   infra/gcp/staff-access.sh clear-lock <email> <reason>
#                                                    forget the account's wrong codes of the last day and void its
#                                                    unused codes, so a locked account can sign in again
#   infra/gcp/staff-access.sh reset-factor <email> <reason>
#                                                    remove the authenticator and the recovery codes and sign the
#                                                    person out everywhere (a lost phone and no recovery code)
#   infra/gcp/staff-access.sh open-enrolment <email> <reason>
#                                                    let the person set up an authenticator for 30 minutes while
#                                                    the second factor is required
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
#  - `require` and `unrequire` change one setting of the API, ALYR_STAFF_2FA. A full deploy from the
#    laptop (`setup.sh apps`) keeps it. The release workflow does not touch it.
# No secret is printed, written to a file or passed anywhere by this script.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"
NETWORK="alyr-net"
SUBNET="alyr-run"
REPO="alyr"
JOB="alyr-staff-access"
API="alyr-api"
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
    --args=python,-m,alyr.staff_breakglass,ready \
    --service-account="$(sa "$RUNS_AS")" "${private_net[@]}" \
    --set-env-vars=ALYR_ENV=production \
    --set-secrets=ALYR_MIGRATION_URL=migration-url:latest,ALYR_DATABASE_URL=database-url:latest \
    --cpu=1 --memory=512Mi --max-retries=0 --task-timeout=5m
}

run_job() { # the job's arguments, after python -m alyr.staff_breakglass
  local args="python@-m@alyr.staff_breakglass" a
  for a in "$@"; do
    case "$a" in *@*) echo "staff-access: '@' cannot be used in an argument" >&2; exit 1 ;; esac
    args="$args@$a"
  done
  # `^@^` makes @ the list separator, because a reason may have commas in it.
  g run jobs execute "$JOB" --region="$REGION" --args="^@^$args" --wait
}

show_logs() {
  g logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND textPayload:\"{\"" \
    --limit="${1:-5}" --freshness=7d --format='value(timestamp,textPayload)'
}

reason_of() { # the words after the email, at most 80 characters
  local reason="$*"
  [ -n "$reason" ] || { echo "staff-access: a reason is needed (a short reference, not a story or a name)" >&2; exit 1; }
  [ "${#reason}" -le 80 ] || { echo "staff-access: 80 characters at most, a reference and not a story" >&2; exit 1; }
  echo "$reason"
}

case "${1:-plan}" in
  plan)
    DRY_RUN=1
    tag="${2:-<tag>}"
    echo "Plan only: nothing is called. This is what 'deploy $tag' would do:"
    deploy_job "$tag"
    echo "Then: 'status <email>' reads where an account stands; 'ready' says whether 'require' is safe."
    echo "'require' would run 'ready', then set ALYR_STAFF_2FA=true on $API (a new revision)."
    ;;

  deploy)
    tag="${2:?usage: staff-access.sh deploy <image tag>}"
    echo "Making the job (no schedule)..."
    deploy_job "$tag"
    echo "Done. Next: infra/gcp/staff-access.sh status <email>"
    ;;

  status)
    run_job status "${2:?usage: staff-access.sh status <email>}"
    show_logs 1
    ;;

  ready)
    run_job ready
    show_logs 1
    ;;

  require)
    echo "Checking that nobody on the staff list would be locked out..."
    run_job ready
    show_logs 1
    cat <<'TEXT'
This makes the second factor REQUIRED for the whole back office (/ops and /api/admin): every ALYR
staff sign-in must then pass its authenticator code or a recovery code, and a member of staff with
none cannot set one up by themselves. It takes effect with the next revision of the API (a minute,
no downtime). Undo it at any time with `staff-access.sh unrequire`.
Before you do this: docs/runbooks/staff-sign-in.md, "Switching it on".
TEXT
    read -r -p "Type REQUIRE to turn it on: " answer
    [ "$answer" = "REQUIRE" ] || { echo "Not turned on."; exit 1; }
    change "require the second factor on $API" run services update "$API" --region="$REGION" \
      --update-env-vars=ALYR_STAFF_2FA=true
    echo "On. Sign out and in again to see the prompt; keep this window open until you have."
    ;;

  unrequire)
    change "stop requiring the second factor on $API" run services update "$API" --region="$REGION" \
      --remove-env-vars=ALYR_STAFF_2FA
    echo "Off. Authenticators stay as they are; nothing asks for them."
    ;;

  clear-lock)
    email="${2:?usage: staff-access.sh clear-lock <email> <reason>}"; shift 2
    run_job clear-lock "$email" "$(reason_of "$@")"
    show_logs 1
    ;;

  reset-factor)
    email="${2:?usage: staff-access.sh reset-factor <email> <reason>}"; shift 2
    run_job reset-factor "$email" "$(reason_of "$@")"
    show_logs 1
    ;;

  open-enrolment)
    email="${2:?usage: staff-access.sh open-enrolment <email> <reason>}"; shift 2
    run_job open-enrolment "$email" "$(reason_of "$@")"
    show_logs 1
    ;;

  logs) show_logs "${2:-5}" ;;

  *)
    sed -n '2,/^[^#]/p' "$SELF" | sed '$d' | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
