#!/usr/bin/env bash
# What the uptime checks of `setup.sh monitoring` cannot see (ALY-277): the database, its
# backups, the nightly export and the cost. Run on the founder's machine, signed in with
# `gcloud auth login` as an owner of the project. Safe to run again: each alert is matched by
# its name and replaced, each budget by its name.
#
#   infra/gcp/monitoring.sh apply      make or refresh the log metrics, the alert policies (alerts/*.json)
#                                      and the gross-cost budget; send every alert and every budget
#                                      notice to every notification channel that can deliver
#   infra/gcp/monitoring.sh status     channels, policies and the alerts that are open now
#   infra/gcp/monitoring.sh test-fire  open a throwaway alert, wait for Google to raise it, delete it
#
# A phone channel is added by hand (the steps `apply` prints); run `apply` again afterwards and
# every alert reaches it. After `setup.sh monitoring` makes a new policy, run `apply` again too.
# No secret is read or printed. The access token lives in this script's environment only.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
SQL="${ALYR_SQL_INSTANCE:-alyr-db}"
BILLING="${ALYR_BILLING_ACCOUNT:-0140A6-0D3762-57B25D}"
# Gross cost: what Google would bill with no credits. USD per month; change it to move the line.
GROSS_BUDGET="${ALYR_GROSS_BUDGET:-150}"

cd "$(dirname "$0")"
# shellcheck source=infra/gcp/gcloud.sh
. ./gcloud.sh
g() { gcloud_run --project "$PROJECT" --quiet "$@"; }
value() { g "$@" | tr -d '\r'; }
exists() { "$@" >/dev/null 2>&1; }
need() { command -v "$1" >/dev/null || { echo "monitoring: $1 is not installed" >&2; exit 1; }; }
need python

ALYR_GCP_TOKEN="$(value auth print-access-token)"
export ALYR_GCP_TOKEN ALYR_GCP_PROJECT="$PROJECT"
# Windows Python cannot read Git Bash's /d/... paths; every file here is relative to this folder.
alerts() { python alerts.py "$@"; }

channels_csv() { alerts channels | cut -f1 | paste -sd, -; }

# A counter of log lines, so an alert can watch something the platform only logs.
metric() { # name description filter
  if exists g logging metrics describe "$1"; then
    g logging metrics update "$1" --description="$2" --log-filter="$3" >/dev/null
  else
    g logging metrics create "$1" --description="$2" --log-filter="$3" >/dev/null
  fi
  echo "  metric   $1"
}

budget() { # display name, amount, credit treatment, channels
  local name="$1" amount="$2" treatment="$3" channels="$4" id flags
  flags=(--credit-types-treatment="$treatment" --notifications-rule-monitoring-notification-channels="$channels")
  id="$(value billing budgets list --billing-account="$BILLING" --format='value(name,displayName)' |
        awk -F'\t' -v n="$name" '$2 == n { print $1 }')"
  if [ -z "$id" ]; then
    g billing budgets create --billing-account="$BILLING" --display-name="$name" \
      --budget-amount="${amount}USD" --filter-projects="projects/$PROJECT" \
      --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 \
      --threshold-rule=percent=1.0,basis=forecasted-spend "${flags[@]}" >/dev/null
    echo "  budget   $name (created, USD $amount)"
  else
    g billing budgets update "$id" --billing-account="$BILLING" "${flags[@]}" >/dev/null
    echo "  budget   $name (channels set)"
  fi
}

phone_steps() {
  cat <<'EOF'

NO PHONE CHANNEL YET. Every alert goes to the email channel only. To get alerts on the phone
(about five minutes, once):
  1. On your phone, install the "Google Cloud" app (App Store or Google Play) and sign in as
     akmal@alyr.qa. Open the project alyr-prod once.
  2. After a few minutes a channel appears at console.cloud.google.com/monitoring/alerting >
     Edit notification channels > Mobile devices. (If you prefer text messages: the same page >
     SMS > Add new > your own number > Send verification code > type the code. Google does not
     publish which countries get SMS, so the app is the safer choice for a Qatar number.)
  3. On this machine run:   infra/gcp/monitoring.sh apply
     That puts the phone on every alert and on both budgets.
  4. Prove it:              infra/gcp/monitoring.sh test-fire
     A throwaway alert opens, a notice should arrive on the phone and in the inbox within a few
     minutes, and the alert is deleted. Tell Claude whether the phone buzzed.
EOF
}

case "${1:-}" in
  apply)
    CH="$(channels_csv)"
    [ -n "$CH" ] || { echo "monitoring: no notification channel exists; run infra/gcp/setup.sh monitoring first" >&2; exit 1; }
    echo "Sending to: $(alerts channels | cut -f2,3 | paste -sd';' -)"

    echo "Log metrics..."
    metric alyr-backup-failed "ALYR: an automatic Cloud SQL backup failed" \
      "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"$PROJECT:$SQL\" AND protoPayload.methodName=\"cloudsql.instances.automatedBackup\" AND (severity>=WARNING OR protoPayload.status.code>0)"
    metric alyr-backup-succeeded "ALYR: an automatic Cloud SQL backup finished" \
      "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"$PROJECT:$SQL\" AND protoPayload.methodName=\"cloudsql.instances.automatedBackup\" AND severity<WARNING AND protoPayload.status.message=\"OK\""
    metric alyr-scheduler-failed "ALYR: Cloud Scheduler could not start the nightly export" \
      'resource.type="cloud_scheduler_job" AND resource.labels.job_id="alyr-db-export-nightly" AND severity>=ERROR'
    metric alyr-export-succeeded "ALYR: the nightly export wrote a file" \
      'resource.type="cloud_run_job" AND resource.labels.job_name="alyr-db-export" AND textPayload:"exported gs://"'
    # Google's audit log of who changed what (ALY-34). The export account's own nightly export is not
    # listed on purpose; a clone, a restore onto the instance, a delete of it or of a backup is.
    metric alyr-db-protected-actions "ALYR: the production database was deleted, cloned, restored over, or a backup of it was deleted" \
      "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"$PROJECT:$SQL\" AND logName:\"cloudaudit.googleapis.com%2Factivity\" AND protoPayload.methodName=(\"cloudsql.instances.delete\" OR \"cloudsql.instances.clone\" OR \"cloudsql.instances.restoreBackup\" OR \"cloudsql.backupRuns.delete\")"

    echo "Alert policies..."
    alerts apply alerts/*.json --db "$PROJECT:$SQL" --channels "$CH"
    echo "Channels on the older policies (setup.sh monitoring)..."
    alerts attach --channels "$CH"

    echo "Budgets (channels are monitoring channels; billing admins still get their emails)..."
    budget "ALYR gross cost" "$GROSS_BUDGET" exclude-all-credits "$CH"
    budget "ALYR monthly" 150 include-all-credits "$CH"

    types="$(alerts channels | cut -f2)"
    printf '%s
' "$types" | grep -v '^email$' >/dev/null || phone_steps
    ;;

  status)
    alerts status
    ;;

  test-fire)
    CH="$(channels_csv)"
    [ -n "$CH" ] || { echo "monitoring: no notification channel exists" >&2; exit 1; }
    echo "Sending a test alert to: $(alerts channels | cut -f2,3 | paste -sd';' -)"
    alerts test-fire --channels "$CH"
    ;;

  *)
    sed -n '2,15p' "$0"
    exit 1
    ;;
esac
