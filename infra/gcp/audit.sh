#!/usr/bin/env bash
# Is the production database protected the way the docs say, and are the secrets tidy (ALY-34)?
# Read-only: it lists settings and metadata and changes nothing. No secret value is read or
# printed (it lists names, versions and dates, never `versions access`). Run it on the founder's
# machine, signed in with `gcloud auth login`, before go-live, after any change to the backups,
# the database or a secret, and every quarter (docs/hygiene.md, section 8).
#
#   infra/gcp/audit.sh [database|secrets|all]     default: all (about 3 minutes: one gcloud call per setting)
#
# Every line starts with ok, FAIL or note. FAIL makes the exit status 1. A note is a fact to
# know (a choice already made, or something to do soon), not a breakage.
set -uo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"
SQL="${ALYR_SQL_INSTANCE:-alyr-db}"
EXPORTS="${ALYR_EXPORT_BUCKET:-$PROJECT-db-exports}"
KEEP_DAYS=35 # the privacy notice: backups are gone within 35 days (apps/web/app/_site/copyPrivacy.ts)

# shellcheck source=infra/gcp/gcloud.sh
. "$(dirname "$0")/gcloud.sh"
g() { gcloud_run --project "$PROJECT" --quiet "$@" 2>/dev/null; }
value() { g "$@" | tr -d '\r'; }
now() { date +%s; }
epoch() { date -u -d "$1" +%s; }
fails=0
ok() { echo "ok    $*"; }
note() { echo "note  $*"; }
fail() { echo "FAIL  $*"; fails=$((fails + 1)); }
expect() { # label, actual, wanted
  if [ "$2" = "$3" ]; then ok "$1: $2"; else fail "$1: $2 (wanted $3)"; fi
}
hours_since() { echo $(( ($(now) - $(epoch "$1")) / 3600 )); }

database() {
  echo "== Database $SQL"
  local cfg
  cfg="$(value sql instances describe "$SQL" --format='csv[no-heading,separator="|"](state,databaseVersion,settings.tier,settings.availabilityType,settings.backupConfiguration.enabled,settings.backupConfiguration.pointInTimeRecoveryEnabled,settings.backupConfiguration.transactionLogRetentionDays,settings.backupConfiguration.backupRetentionSettings.retainedBackups,settings.backupConfiguration.location,settings.ipConfiguration.ipv4Enabled,settings.ipConfiguration.sslMode,settings.deletionProtectionEnabled)')"
  [ -n "$cfg" ] || { fail "no instance called $SQL (or not signed in)"; return; }
  IFS='|' read -r state version tier avail backups pitr logdays kept loc ipv4 ssl protect <<<"$cfg"
  expect "state" "$state" RUNNABLE
  ok "version $version, tier $tier"
  [ "$avail" = ZONAL ] && note "one zone, no standby (CLD-5, accepted until a client pays for a response time)" || ok "availability $avail"
  expect "automatic backups on" "$backups" True
  expect "point-in-time recovery on" "$pitr" True
  [ "${logdays:-0}" -ge 7 ] && ok "transaction logs kept $logdays days" || fail "transaction logs kept ${logdays:-0} days (wanted 7 or more)"
  [ "${kept:-0}" -ge 14 ] && ok "$kept nightly backups kept" || fail "$kept nightly backups kept (wanted 14 or more)"
  expect "backups stored in" "$loc" "$REGION"
  [ "$ipv4" = False ] || [ -z "$ipv4" ] && ok "no public address" || fail "the instance has a public address"
  expect "connections" "$ssl" ENCRYPTED_ONLY
  expect "deletion protection" "$protect" True

  local last lag
  last="$(value sql backups list --instance="$SQL" --filter='type=AUTOMATED' --sort-by=~windowStartTime --limit=1 --format='value(status,endTime)')"
  if [ -z "$last" ]; then fail "no automatic backup yet"; else
    local bstatus bend; bstatus="${last%%$'\t'*}"; bend="${last##*$'\t'}"
    local age; age="$(hours_since "$bend")"
    if [ "$bstatus" = SUCCESSFUL ] && [ "$age" -le 30 ]; then ok "newest automatic backup $bstatus, $age h ago (the alert fires at 30 h)"; else fail "newest automatic backup $bstatus, $age h ago"; fi
  fi
  lag="$(value sql instances get-latest-recovery-time "$SQL" --format='value(latestRecoveryTime)')"
  if [ -n "$lag" ] && [ $(( $(now) - $(epoch "$lag") )) -le 900 ]; then
    ok "newest recoverable moment is $(( $(now) - $(epoch "$lag") )) s behind now"
  else fail "point-in-time recovery is not following the clock (newest moment: ${lag:-none})"; fi

  # The window starts at the oldest backup that still exists: deleting old backups shortens it.
  local earliest hours count
  earliest="$(value sql instances get-latest-recovery-time "$SQL" --format='value(earliestRecoveryTime)')"
  count="$(value sql backups list --instance="$SQL" --filter='type=AUTOMATED AND status=SUCCESSFUL' --format='value(id)' | wc -l)"
  if [ -n "$earliest" ]; then
    hours=$(( ($(now) - $(epoch "$earliest")) / 3600 ))
    if [ "$hours" -ge 168 ]; then ok "point-in-time window reaches back $((hours / 24)) days"
    else note "point-in-time window reaches back only $hours h (earliest moment $earliest); it grows by a day a day up to 7 days, and an incident now can only be restored to a moment after that"; fi
  fi
  if [ "$count" -ge "${kept:-14}" ]; then ok "$count automatic backups exist"; else note "$count of $kept automatic backups exist so far; a restore reaches back that many nights"; fi

  local outside
  outside="$(value sql backups list --instance="$SQL" --filter="location!=$REGION" --format='value(id,location)')"
  [ -z "$outside" ] && ok "no backup stored outside $REGION" || { fail "backups stored outside $REGION (hard rule 2; delete with: gcloud sql backups delete <id> --instance $SQL):"; echo "$outside" | sed 's/^/        /'; }
  local old
  old="$(value sql backups list --instance="$SQL" --filter='type=ON_DEMAND' --format='value(id,endTime)' | while IFS=$'\t' read -r id end; do
    [ -n "$id" ] && [ $(( ($(now) - $(epoch "$end")) / 86400 )) -gt "$KEEP_DAYS" ] && echo "$id"; done)"
  if [ -z "$old" ]; then ok "no on-demand backup older than $KEEP_DAYS days (they never expire by themselves)"; else
    fail "on-demand backups older than $KEEP_DAYS days; they do not expire. Delete each: gcloud sql backups delete <id> --instance $SQL"; echo "$old" | sed 's/^/        /'; fi

  echo "-- Nightly export"
  local b; b="$(value storage buckets describe "gs://$EXPORTS" --format='csv[no-heading,separator="|"](location,retention_policy.retentionPeriod,retention_policy.isLocked,public_access_prevention)')"
  if [ -z "$b" ]; then fail "no bucket gs://$EXPORTS"; else
    local bloc bret block bpap; IFS='|' read -r bloc bret block bpap <<<"$b"
    expect "bucket location" "$bloc" ME-CENTRAL1
    [ "${bret:-0}" -ge $((KEEP_DAYS * 86400)) ] && ok "retention $((bret / 86400)) days" || fail "retention ${bret:-0} s (wanted $KEEP_DAYS days)"
    [ "$block" = True ] && ok "retention locked" || note "retention not locked: an owner can still shorten it (setup.sh lock-backups, once a restore from an export is tested)"
    expect "public access prevention" "$bpap" enforced
  fi
  local newest; newest="$(value storage objects list "gs://$EXPORTS/" --format='value(updateTime)' | sort | tail -1)"
  if [ -n "$newest" ] && [ "$(hours_since "$newest")" -le 26 ]; then ok "newest export $(hours_since "$newest") h old (the alert fires at 26 h)"; else fail "newest export: ${newest:-none}"; fi
  expect "export schedule" "$(value scheduler jobs describe alyr-db-export-nightly --location="$REGION" --format='value(state)')" ENABLED
  local sink; sink="$(value logging sinks describe _Default --format='value(destination)')"
  case "$sink" in *"/locations/$REGION/"*) ok "logs go to the bucket in $REGION";; *) fail "the _Default log sink points at: $sink";; esac
}

secrets() {
  echo "== Secrets and access"
  local s n bad=0
  for s in $(value secrets list --format='value(name.basename())'); do
    n="$(value secrets describe "$s" --format='csv[no-heading,separator="|"](replication.userManaged.replicas[0].location,replication.userManaged.replicas[1].location)')"
    [ "$n" = "$REGION|" ] || { fail "secret $s is not stored in $REGION only ($n)"; bad=1; }
  done
  [ "$bad" = 0 ] && ok "every secret is stored in $REGION only"

  local plain=""
  for r in "services alyr-api" "services alyr-web" "worker-pools alyr-worker" "jobs alyr-migrate" "jobs alyr-db-export"; do
    # Name and secret reference only; a plain value is never requested.
    # shellcheck disable=SC2086
    plain+="$(value run $(echo "$r" | cut -d' ' -f1) describe "$(echo "$r" | cut -d' ' -f2)" --region="$REGION" \
      --flatten='spec.template.spec.containers[0].env[]' \
      --format='value(spec.template.spec.containers[0].env.name,spec.template.spec.containers[0].env.valueFrom.secretKeyRef.key)' \
      | awk -F'\t' -v svc="$(echo "$r" | cut -d' ' -f2)" '$2 == "" && $1 ~ /(PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL|MIGRATION_URL)/ && $1 != "ALYR_SECRETS_AT" { print svc ": " $1 }')"$'\n'
  done
  plain="$(echo "$plain" | sed '/^$/d')"
  [ -z "$plain" ] && ok "no secret-looking setting is a plain value in any service or job" || { fail "secret-looking settings kept as plain values:"; echo "$plain" | sed 's/^/        /'; }

  local keys=0 sa
  for sa in $(value iam service-accounts list --format='value(email)'); do
    keys=$((keys + $(value iam service-accounts keys list --iam-account="$sa" --managed-by=user --format='value(name)' | wc -l)))
  done
  [ "$keys" = 0 ] && ok "no service-account key files exist (GitHub signs in without a stored key)" || fail "$keys service-account key file(s) exist"
  local wide; wide="$(value projects get-iam-policy "$PROJECT" --flatten='bindings[].members' --filter='bindings.role:roles/secretmanager' --format='value(bindings.role,bindings.members)')"
  [ -z "$wide" ] && ok "no project-wide Secret Manager role (each secret has its own readers)" || { fail "project-wide Secret Manager role:"; echo "$wide" | sed 's/^/        /'; }

  echo "-- Superseded versions still enabled (each could still be read by anyone with access to the secret)"
  local any=0 vs latest older v
  for s in $(value secrets list --format='value(name.basename())'); do
    vs="$(value secrets versions list "$s" --filter='state=ENABLED' --sort-by=~createTime --format='value(name.basename())')"
    older="$(echo "$vs" | sed 1d | sed '/^$/d')"
    if [ -n "$older" ]; then
      any=1
      for v in $older; do note "$s version $v is superseded but enabled. Once the newest works: gcloud secrets versions disable $v --secret=$s --project=$PROJECT"; done
    fi
    latest="$(value secrets versions list "$s" --sort-by=~createTime --limit=1 --format='value(createTime)')"
    [ -n "$latest" ] && [ $(( $(now) - $(epoch "$latest") )) -gt $((365 * 86400)) ] && note "$s has not changed for over a year (docs/runbooks/secret-rotation.md)"
  done
  [ "$any" = 0 ] && ok "every secret has exactly one enabled version"
}

case "${1:-all}" in
  database) database ;;
  secrets) secrets ;;
  all) database; secrets ;;
  *) sed -n '2,${/^#/!q;p}' "$0"; exit 1 ;;
esac
echo
[ "$fails" = 0 ] && echo "No FAIL." || echo "$fails FAIL line(s)."
exit $(( fails > 0 ))
