#!/usr/bin/env bash
# Recover the ALYR database on Google Cloud in Doha (ALY-277). Steps and the reasons for
# them are in docs/runbooks/restore-rehearsal.md; when to use them is in
# docs/runbooks/incident-response.md. Run on the founder's machine, signed in with
# `gcloud auth login` as an owner of the project (infra/gcp/README.md).
#
#   infra/gcp/restore.sh rehearse                 clone, check, delete: the rehearsal, with timings
#   infra/gcp/restore.sh backup-drill [<backup>]  the other way back (ALY-34): restore a NIGHTLY BACKUP (default: the
#                                                 newest automatic one in Doha) into a new smallest-tier instance
#                                                 alyr-restore-drill, count its rows and production's, delete it
#   infra/gcp/restore.sh clone <name> [<time>]    point-in-time clone of alyr-db (time in UTC,
#                                                 for example 2026-10-30T09:15:00Z; default: the latest)
#   infra/gcp/restore.sh check <name>             from inside the private network, count rows in the
#                                                 clone (counts only, no data is shown or copied out)
#   infra/gcp/restore.sh repoint <name>           write the clone's new private address into BOTH
#                                                 database secrets, then restart the API and the worker
#   infra/gcp/restore.sh drop <name>              delete a clone (never alyr-db)
#
# Only `repoint` changes anything the apps use. `rehearse` and `backup-drill` never read or write a
# secret value and never touch alyr-db: each makes one extra instance and deletes it before it ends.
set -euo pipefail

PROJECT="${ALYR_GCP_PROJECT:-alyr-prod}"
REGION="me-central1"
SQL="${ALYR_SQL_INSTANCE:-alyr-db}"
REPO="alyr"

# shellcheck source=infra/gcp/gcloud.sh
. "$(dirname "$0")/gcloud.sh"
g() { gcloud_run --project "$PROJECT" --quiet "$@"; }
value() { g "$@" | tr -d '\r'; }
exists() { "$@" >/dev/null 2>&1; }
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }
now() { date +%s; }
epoch() { date -u -d "$1" +%s; }
private_net=(--network=alyr-net --subnet=alyr-run --vpc-egress=private-ranges-only)

# Replace the address in a database URL and nothing else (user, password, database, options).
# Reads one URL on stdin, writes one on stdout.
rewrite_host() { sed -E "s#(@)[^:/@]+(:[0-9]+/)#\1$1\2#"; }

instance_ip() { value sql instances describe "$1" --format='value(ipAddresses[0].ipAddress)'; }

# A clone takes 8 to 10 minutes. gcloud gives up waiting after about ten and exits with an
# error while the clone carries on, so this starts it and waits by itself.
wait_ready() { until [ "$(value sql instances describe "$1" --format='value(state)')" = RUNNABLE ]; do sleep 15; done; }
# A new instance takes its first backup right after it is usable, and refuses a delete until it ends.
wait_idle() { while [ -n "$(value sql operations list --instance="$1" --filter='NOT status=DONE' --format='value(name)')" ]; do sleep 15; done; }
# One operation (a restore) by its name; gcloud's own wait gives up after about ten minutes.
wait_op() { until [ "$(value sql operations describe "$1" --format='value(status)')" = DONE ]; do sleep 10; done; }

clone() {
  local name="$1" at="${2:-}"
  exists g sql instances describe "$name" && { echo "restore: $name already exists" >&2; exit 1; }
  local args=(sql instances clone "$SQL" "$name" --async)
  [ -n "$at" ] && args+=(--point-in-time="$at")
  echo "Cloning $SQL to $name${at:+ at $at} (about 10 minutes; the clone gets a NEW private address)..."
  g "${args[@]}" >/dev/null
  wait_ready "$name"
  echo "  $name is $(value sql instances describe "$name" --format='value(state)') at $(instance_ip "$name")"
}

drop() {
  local name="$1"
  [ "$name" != "$SQL" ] || { echo "restore: refusing to delete $SQL" >&2; exit 1; }
  exists g sql instances describe "$name" || { echo "restore: no instance called $name"; return 0; }
  wait_idle "$name"
  # A clone copies the source's deletion protection.
  g sql instances patch "$name" --no-deletion-protection >/dev/null 2>&1 || true
  g sql instances delete "$name" >/dev/null
  exists g sql instances describe "$name" && echo "STILL EXISTS: $name" || echo "$name is gone."
}

# Row counts from inside the network. The job runs the API image as the API's own account,
# so the database secrets are read by Cloud Run, never by this script, and only counts reach
# the log. The address in the secrets is swapped for the clone's inside the job.
CHECK_PY='
import asyncio, os, re, asyncpg
host = os.environ["CLONE_HOST"]
swap = lambda url: re.sub(r"@[^:/@]+:", "@" + host + ":", url, count=1)
async def main():
    owner = await asyncpg.connect(swap(os.environ["ALYR_MIGRATION_URL"]), timeout=30)
    print("CHECK server", await owner.fetchval("show server_version"))
    print("CHECK in_recovery", await owner.fetchval("select pg_is_in_recovery()"))
    tables = [r[0] for r in await owner.fetch("select tablename from pg_tables where schemaname = $1 order by 1", "public")]
    rows = filled = 0
    for t in tables:
        n = await owner.fetchval("select count(*) from \"" + t + "\"")
        rows += n
        filled += n > 0
    print("CHECK tables", len(tables), "with_rows", filled, "rows", rows)
    print("CHECK policies", await owner.fetchval("select count(*) from pg_policies where schemaname = $1", "public"))
    print("CHECK migrations", await owner.fetchval("select count(*) from schema_migrations"), await owner.fetchval("select max(name) from schema_migrations"))
    print("CHECK last_worker_beat", await owner.fetchval("select max(beat_at) from worker_heartbeats"))
    app = await asyncpg.connect(swap(os.environ["ALYR_DATABASE_URL"]), timeout=30)
    print("CHECK app_role", await app.fetchval("select current_user"))
    print("CHECK done")
asyncio.run(main())
'

check() {
  local name="$1" job=alyr-restore-check
  local image ip started account
  # The account the migrations run as holds both database secrets (the API's account holds
  # only database-url since ALY-268), so a check follows whatever the migrate job uses.
  account="$(value run jobs describe alyr-migrate --region="$REGION" --format='value(spec.template.spec.template.spec.serviceAccountName)')"
  image="$(value run services describe alyr-api --region="$REGION" --format='value(spec.template.spec.containers[0].image)')"
  ip="$(instance_ip "$name")"
  echo "Counting rows in $name from inside the network (image ${image##*:})..."
  # `^~^` makes ~ the list separator: the script has commas and @ in it.
  g run jobs deploy "$job" --region="$REGION" --image="$image" \
    --args="^~^python~-c~$CHECK_PY" --service-account="$account" "${private_net[@]}" \
    --set-env-vars="CLONE_HOST=$ip" \
    --set-secrets="ALYR_MIGRATION_URL=migration-url:latest,ALYR_DATABASE_URL=database-url:latest" \
    --cpu=1 --memory=512Mi --max-retries=0 --task-timeout=5m >/dev/null
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  g run jobs execute "$job" --region="$REGION" --wait >/dev/null || echo "  the check job failed; its log follows"
  sleep 20 # logs reach the Doha bucket a few seconds late
  g logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$job\" AND textPayload:\"CHECK\" AND timestamp>=\"$started\"" \
    --bucket=alyr-doha --location="$REGION" --view=_AllLogs --order=asc --format='value(textPayload)' | tr -d '\r'
  g run jobs delete "$job" --region="$REGION" >/dev/null
}

repoint() {
  local name="$1" ip stamp s new
  ip="$(instance_ip "$name")"
  [ -n "$ip" ] || { echo "restore: $name has no private address" >&2; exit 1; }
  for s in database-url migration-url; do
    # The new value is built in this shell and goes straight into Secret Manager.
    old="$(value secrets versions access latest --secret="$s")"
    new="$(printf '%s' "$old" | rewrite_host "$ip")"
    [ "$new" != "$old" ] || { echo "restore: $s already points at $ip, or has an unexpected shape; stopping" >&2; exit 1; }
    printf '%s' "$new" | g secrets versions add "$s" --data-file=- >/dev/null
    echo "  $s now points at $name ($ip)"
  done
  unset old new
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  g run services update alyr-api --region="$REGION" --update-env-vars="ALYR_SECRETS_AT=$stamp" >/dev/null
  g run worker-pools update alyr-worker --region="$REGION" --update-env-vars="ALYR_SECRETS_AT=$stamp" >/dev/null
  echo "The API and the worker restarted on $name. Check /health/ready and /health/worker."
}

rehearse() {
  REHEARSAL="alyr-db-rehearsal-$(date -u +%Y%m%d)"
  local t0 t1 t2 t3 t4 t5 latest lag
  exists g sql instances describe "$REHEARSAL" && { echo "restore: $REHEARSAL already exists; run 'restore.sh drop $REHEARSAL' first" >&2; exit 1; }
  # What the rewrite does to an address, shown on a made-up URL (no secret is read).
  echo "rewrite_host: $(printf 'postgresql://u:p@10.30.0.3:5432/alyr?sslmode=require' | rewrite_host 10.30.0.9)"

  latest="$(value sql instances get-latest-recovery-time "$SQL" --format='value(latestRecoveryTime)')"
  lag=$(( $(now) - $(epoch "$latest") ))
  echo "Newest recoverable moment: $latest ($lag s behind now). That lag is the data a disaster right now would lose (RPO)."

  trap 'drop "$REHEARSAL"' EXIT
  t0=$(now); clone "$REHEARSAL" "$latest"; t1=$(now)
  wait_idle "$REHEARSAL"; t2=$(now)
  check "$REHEARSAL"; t3=$(now)
  echo "TIMINGS usable=$((t1 - t0))s first_backup_done=$((t2 - t0))s check_job=$((t3 - t2))s"
  t4=$(now); drop "$REHEARSAL"; trap - EXIT; t5=$(now)
  echo "TIMINGS delete=$((t5 - t4))s total=$((t5 - t0))s rpo_lag=${lag}s"
}

# The other way back (ALY-34): a nightly backup into a new, smallest-tier instance. `rehearse` proves
# point-in-time recovery; this proves the backups Cloud SQL keeps for 14 nights, which is what
# remains when the instance or its disk is lost. The drill instance is not a clone: it is made empty
# (private address only, no backups of its own, no deletion protection) and the backup is restored
# over it, so it also shows what a restore into a fresh instance needs. A restore into a smaller
# tier is allowed as long as the disk is not smaller than the source's.
DRILL="alyr-restore-drill"
backup_drill() {
  local id="${1:-}" version size t0 t1 t2 t3 t4 t5 ended age op failure
  [ "$DRILL" != "$SQL" ] || { echo "restore: the drill instance must not be $SQL" >&2; exit 1; }
  exists g sql instances describe "$DRILL" && { echo "restore: $DRILL already exists; run 'restore.sh drop $DRILL' first" >&2; exit 1; }
  if [ -z "$id" ]; then
    id="$(value sql backups list --instance="$SQL" --filter='type=AUTOMATED AND status=SUCCESSFUL AND location='"$REGION" \
      --sort-by=~windowStartTime --limit=1 --format='value(id)')"
  fi
  [ -n "$id" ] || { echo "restore: no automatic backup in $REGION to restore" >&2; exit 1; }
  ended="$(value sql backups describe "$id" --instance="$SQL" --format='value(endTime)')"
  age=$(( $(now) - $(epoch "$ended") ))
  version="$(value sql instances describe "$SQL" --format='value(databaseVersion)')"
  size="$(value sql instances describe "$SQL" --format='value(settings.dataDiskSizeGb)')"
  echo "Backup $id finished $ended ($age s ago). That age is the data a restore from it would lose."
  echo "Making $DRILL ($version, db-f1-micro, ${size} GB, private address only)..."

  trap 'drop "$DRILL"' EXIT
  t0=$(now)
  # The root password is random and thrown away: the restore brings the backup's own users with it.
  g sql instances create "$DRILL" --database-version="$version" --edition=ENTERPRISE --tier=db-f1-micro \
    --region="$REGION" --network="projects/$PROJECT/global/networks/alyr-net" --no-assign-ip \
    --ssl-mode=ENCRYPTED_ONLY --storage-type=SSD --storage-size="$size" --no-storage-auto-increase \
    --availability-type=ZONAL --no-backup --no-deletion-protection \
    --root-password="$(openssl rand -hex 24)" --async >/dev/null
  wait_ready "$DRILL"; t1=$(now)
  echo "  $DRILL is usable at $(instance_ip "$DRILL") (empty); restoring backup $id over it..."

  op="$(value sql backups restore "$id" --backup-instance="$SQL" --restore-instance="$DRILL" --async --format='value(name)')"
  wait_op "$op"
  failure="$(value sql operations describe "$op" --format='value(error.errors[0].message)')"
  [ -z "$failure" ] || { echo "restore: the restore failed: $failure" >&2; exit 1; }
  wait_ready "$DRILL"; t2=$(now)
  echo "  restored; counting rows in the restored copy..."
  check "$DRILL"; t3=$(now)
  echo "  production for comparison (it has moved on since the backup, so small differences are expected)..."
  check "$SQL"
  t4=$(now); drop "$DRILL"; trap - EXIT; t5=$(now)
  echo "TIMINGS create=$((t1 - t0))s restore=$((t2 - t1))s check=$((t3 - t2))s delete=$((t5 - t4))s total=$((t5 - t0))s backup_age=${age}s"
}

case "${1:-}" in
  rehearse) rehearse ;;
  backup-drill) backup_drill "${2:-}" ;;
  clone) clone "${2:?usage: restore.sh clone <new instance name> [<time in UTC>]}" "${3:-}" ;;
  check) check "${2:?usage: restore.sh check <instance name>}" ;;
  repoint) repoint "${2:?usage: restore.sh repoint <instance name>}" ;;
  drop) drop "${2:?usage: restore.sh drop <instance name>}" ;;
  *) sed -n '2,${/^#/!q;p}' "$0"; exit 1 ;;
esac
