#!/usr/bin/env bash
# Separate database logins for the back office and the worker, on Google Cloud in Doha (ALY-125
# part 3, SEC-2 and SEC-5, decision D-137). NOT APPLIED: nothing here has been run against the
# production project. Run it on the founder's machine, signed in with `gcloud auth login` as an
# owner of the project, when the founder says go, one step at a time, in this order.
#
#   infra/gcp/roles.sh plan                 print every step below, calling nothing (the default)
#   infra/gcp/roles.sh create               make the two logins' addresses in Secret Manager, let the
#                                           accounts read them, and run the migration job so the roles
#                                           exist WITH a login. Nothing uses them yet: nothing changes.
#   infra/gcp/roles.sh deploy <tag>         make the Cloud Run job `alyr-db-roles` (never scheduled)
#   infra/gcp/roles.sh status               the roles, the guard, and who is connected right now
#   infra/gcp/roles.sh move                 point the API's back-office work at `alyr_admin` and the worker at
#                                           `alyr_worker` (two new revisions). The guard is still not
#                                           enforced, so everything works as before on the new logins.
#   infra/gcp/roles.sh enforce              turn the guard ON (asks you to type ENFORCE). Refuses unless
#                                           both new logins are connected right now.
#   infra/gcp/roles.sh relax                turn the guard OFF again, at once (always allowed)
#   infra/gcp/roles.sh back                 point the API and the worker back at the application login
#                                           (run `relax` first if the guard is on)
#
# Read docs/runbooks/database-roles.md first. What it does and why:
#  - Today the guards that keep the back office's powers (every client's data, the staff list, the
#    audit log) and every business's jobs to ALYR trust a session setting, which any code running as
#    the application's database role can write. After `enforce`, a guard also asks which LOGIN made
#    the connection: `alyr_admin` (the API, for work that declares the back office), `alyr_worker`
#    (the worker) or the database's owner (migrations and the jobs of `alyr-migrate`). The
#    application's role, which runs everything a shop's staff or customer asks for, cannot make
#    itself any of them.
#  - Each new login is a member of the application's role, so it can do what that role can and
#    nothing more is granted. The migration job makes the roles; this script makes their addresses.
#  - Nothing happens to production until `create`; nothing is used until `move`; nothing is
#    enforced until `enforce`. Each step can be undone by the next one down: `relax`, then `back`.
#  - The passwords are made here and go straight into Secret Manager (Doha). They are never
#    printed or written to a file. Both the API and the worker run as the one account `alyr-run`, so
#    the separation is by which address each process is given, not by who may read the secrets.
# What it does not fix, said plainly: `users`, `sessions` and `login_codes` are still readable and
# writable by the application's role, so someone who runs SQL as the application can still mint a
# session; the second factor (D-136) is a rule the application keeps until that is narrowed.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"
NETWORK="alyr-net"
SUBNET="alyr-run"
REPO="alyr"
JOB="alyr-db-roles"
MIGRATE_JOB="alyr-migrate"
API="alyr-api"
WORKER="alyr-worker"
ADMIN_SECRET="admin-database-url"
WORKER_SECRET="worker-database-url"
ACCESSOR=roles/secretmanager.secretAccessor
DRY_RUN=""

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"
# shellcheck source=infra/gcp/gcloud.sh
. ./gcloud.sh
g() { gcloud_run --project "$PROJECT" --quiet "$@"; }
value() { g "$@" | tr -d '\r'; }
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }
exists() { "$@" >/dev/null 2>&1; }
secret_exists() { exists g secrets describe "$1"; }
private_net=(--network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only)

change() { # what it does (shown), then the gcloud arguments
  local what="$1"; shift
  if [ -n "$DRY_RUN" ]; then echo "  would $what"; else echo "  $what"; g "$@" >/dev/null; fi
}

# A new login's address: the application's address (host, database, options) with the role and a
# new password. Neither the password nor the address is printed.
make_address() { # role secret
  local role="$1" secret="$2" url rest password
  if [ -n "$DRY_RUN" ]; then echo "  would make the secret $secret (a new password for $role, on the application's host), unless it exists"; return 0; fi
  if secret_exists "$secret"; then echo "  $secret exists; left as it is"; return 0; fi
  url="$(value secrets versions access latest --secret=database-url)"
  case "$url" in postgresql://alyr_app:*@*) ;; *) echo "roles: database-url is not in the expected form" >&2; exit 1 ;; esac
  rest="${url#*@}"
  password="$(openssl rand -hex 24)"
  g secrets create "$secret" --replication-policy=user-managed --locations="$REGION" >/dev/null
  printf '%s' "postgresql://$role:$password@$rest" | g secrets versions add "$secret" --data-file=- >/dev/null
  echo "  made $secret"
}

grant_read() { # secret account
  local member="serviceAccount:$(sa "$2")" policy
  if [ -n "$DRY_RUN" ]; then echo "  would let $2 read $1, unless it can"; return 0; fi
  policy="$(value secrets get-iam-policy "$1" --format=json)"
  case "$policy" in *"$member"*) return 0 ;; esac
  change "let $2 read $1" secrets add-iam-policy-binding "$1" --member="$member" --role="$ACCESSOR"
}

deploy_job() { # tag
  local tag="$1" images="$REGION-docker.pkg.dev/$PROJECT/$REPO"
  change "make or update the job $JOB (image alyr-api:$tag, runs as alyr-migrate, never scheduled)" \
    run jobs deploy "$JOB" --region="$REGION" --image="$images/alyr-api:$tag" \
    --args=python,-m,alyr.db_roles,status --service-account="$(sa alyr-migrate)" "${private_net[@]}" \
    --set-env-vars=ALYR_ENV=production \
    --set-secrets=ALYR_MIGRATION_URL=migration-url:latest,ALYR_DATABASE_URL=database-url:latest \
    --cpu=1 --memory=512Mi --max-retries=0 --task-timeout=5m
}

run_job() { # the job's arguments, after python -m alyr.db_roles
  local args="python@-m@alyr.db_roles" a
  for a in "$@"; do
    case "$a" in *@*) echo "roles: '@' cannot be used in an argument" >&2; exit 1 ;; esac
    args="$args@$a"
  done
  g run jobs execute "$JOB" --region="$REGION" --args="^@^$args" --wait
}

show_logs() {
  g logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND textPayload:\"{\"" \
    --limit="${1:-1}" --freshness=7d --format='value(timestamp,textPayload)'
}

steps() {
  echo "1. create: make $ADMIN_SECRET and $WORKER_SECRET, let alyr-run and alyr-migrate read them, give the"
  echo "   migration job both, and run it: the roles alyr_admin and alyr_worker now exist with a login."
  echo "2. deploy <tag>: make the job $JOB. Then status shows the roles and who is connected."
  echo "3. move: the API gets ALYR_ADMIN_DATABASE_URL=$ADMIN_SECRET; the worker's ALYR_DATABASE_URL becomes"
  echo "   $WORKER_SECRET. Two new revisions. The guard is not enforced, so nothing changes in behaviour."
  echo "4. Check: sign in to /ops, open Clients and Today; send a test message so the worker has run a job."
  echo "5. enforce: the guard turns on. Refuses unless alyr_admin and alyr_worker are both connected."
  echo "6. Check again, and run infra/gcp/audit.sh. To undo: relax (instant), then back."
}

case "${1:-plan}" in
  plan)
    DRY_RUN=1
    echo "Plan only: nothing is called. The steps, in order:"
    steps
    echo
    echo "What 'create' would do:"
    make_address alyr_admin "$ADMIN_SECRET"
    make_address alyr_worker "$WORKER_SECRET"
    grant_read "$ADMIN_SECRET" alyr-run; grant_read "$WORKER_SECRET" alyr-run
    grant_read "$ADMIN_SECRET" alyr-migrate; grant_read "$WORKER_SECRET" alyr-migrate
    change "give the migration job both addresses, then run it" run jobs update "$MIGRATE_JOB" --region="$REGION" \
      --update-secrets="ALYR_ADMIN_DATABASE_URL=$ADMIN_SECRET:latest,ALYR_WORKER_DATABASE_URL=$WORKER_SECRET:latest"
    ;;

  create)
    echo "Making the addresses and letting the accounts read them..."
    make_address alyr_admin "$ADMIN_SECRET"
    make_address alyr_worker "$WORKER_SECRET"
    for s in "$ADMIN_SECRET" "$WORKER_SECRET"; do grant_read "$s" alyr-run; grant_read "$s" alyr-migrate; done
    change "give the migration job both addresses" run jobs update "$MIGRATE_JOB" --region="$REGION" \
      --update-secrets="ALYR_ADMIN_DATABASE_URL=$ADMIN_SECRET:latest,ALYR_WORKER_DATABASE_URL=$WORKER_SECRET:latest"
    echo "Running the migration job (nothing new to apply; it makes the logins)..."
    g run jobs execute "$MIGRATE_JOB" --region="$REGION" --wait
    echo "Done. Nothing uses the new logins yet. Next: infra/gcp/roles.sh deploy <tag>, then status."
    ;;

  deploy)
    tag="${2:?usage: roles.sh deploy <image tag>}"
    deploy_job "$tag"
    echo "Done. Next: infra/gcp/roles.sh status"
    ;;

  status)
    run_job status
    show_logs 1
    ;;

  move)
    secret_exists "$ADMIN_SECRET" && secret_exists "$WORKER_SECRET" || { echo "roles: run 'create' first" >&2; exit 1; }
    change "give the API its back-office login" run services update "$API" --region="$REGION" \
      --update-secrets="ALYR_ADMIN_DATABASE_URL=$ADMIN_SECRET:latest"
    change "move the worker to its own login" run worker-pools update "$WORKER" --region="$REGION" \
      --update-secrets="ALYR_DATABASE_URL=$WORKER_SECRET:latest"
    echo "Two new revisions are starting (the worker restarts: jobs wait a minute). Then: infra/gcp/roles.sh status"
    ;;

  enforce)
    run_job status
    show_logs 1
    cat <<'TEXT'
This turns the guard ON. From now on the back office's tables and functions, and every business's jobs,
open only to the logins alyr_admin, alyr_worker and the database owner, whatever a session setting says.
The refusal below stops it unless both new logins are connected right now.
Before you do this: docs/runbooks/database-roles.md, "Switching it on".
TEXT
    read -r -p "Type ENFORCE to turn it on: " answer
    [ "$answer" = "ENFORCE" ] || { echo "Not turned on."; exit 1; }
    run_job enforce "checked in the runbook"
    show_logs 1
    echo "On. Check /ops now. If anything is wrong: infra/gcp/roles.sh relax"
    ;;

  relax)
    run_job relax "undoing the guard"
    show_logs 1
    echo "Off. Everything reads the setting only, as before."
    ;;

  back)
    change "point the API's back-office work at the application login" run services update "$API" \
      --region="$REGION" --remove-secrets=ALYR_ADMIN_DATABASE_URL
    change "point the worker at the application login" run worker-pools update "$WORKER" --region="$REGION" \
      --update-secrets="ALYR_DATABASE_URL=database-url:latest"
    echo "Two new revisions are starting."
    ;;

  *)
    sed -n '2,/^[^#]/p' "$SELF" | sed '$d' | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
