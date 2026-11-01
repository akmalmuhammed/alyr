#!/usr/bin/env bash
# A local copy of production's shape for load tests (docs/runbooks/capacity.md).
#
#   scripts/loadtest/stack.sh up [pg-cpus]       Postgres + migrations      (pg-cpus 0.5 = db-g1-small, 2 = a 2-vCPU tier)
#   scripts/loadtest/stack.sh apps IMAGE [N]     N API containers (default 1) and one worker, from IMAGE
#   scripts/loadtest/stack.sh stop-apps          stop and remove the API and worker containers
#   scripts/loadtest/stack.sh fresh IMAGE        an empty database with every migration applied
#   scripts/loadtest/stack.sh snapshot           keep the database as it is, as the template every run starts from
#   scripts/loadtest/stack.sh restore            put the database back to the snapshot (apps must be stopped)
#   scripts/loadtest/stack.sh run SCRIPT ARGS..  run /loadtest/SCRIPT (python) in a container on the stack's network
#   scripts/loadtest/stack.sh test PYTEST-ARGS.. the API's own tests (pytest) against a Postgres of their own, never the throttled one
#   scripts/loadtest/stack.sh psql [ARGS..]      psql as the database owner
#   scripts/loadtest/stack.sh down               remove everything this script made, volumes included
#
# Everything it makes is named ${LT_PREFIX:-alyrscale}-*: containers, network, volume. It never
# touches a container, network or volume that does not carry that prefix, so it is safe beside
# other local stacks. Nothing here talks to the internet: the network is internal and every
# WhatsApp number is the simulator (the channel that records a message and sends nothing).
#
# The shape (docs/hosting.md, infra/gcp/setup.sh):
#   Cloud SQL db-g1-small   Postgres 16, 0.5 CPU sustained, 1.7 GB, max_connections 50
#   Cloud Run alyr-api      1 vCPU, 1 GiB, up to 3 instances, 40 requests at a time each
#   worker pool alyr-worker 1 vCPU, 512 MiB, 1 instance
# The load container has 4 CPUs of its own so the generator is never the limit.
set -euo pipefail

P="${LT_PREFIX:-alyrscale}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="${LT_STATE:-$ROOT/.loadtest-state}"
NET="$P-net"
PG="$P-pg"
VOL="$P-pgdata"
LOAD_CPUS="${LT_LOAD_CPUS:-4}"
TEMPLATE="${LT_TEMPLATE:-alyr_template}"   # the snapshot a run starts from; one per code version when migrations differ
SIM_SEND_MS="${LT_SIM_SEND_MS:-300}"   # how long a send takes: Meta answers in about 300 ms

win() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
d() { MSYS_NO_PATHCONV=1 docker "$@"; }
own() { [[ "$1" == "$P-"* ]]; }

env_file() {
  mkdir -p "$STATE"
  if [ ! -f "$STATE/env" ]; then
    # Throw-away values for a local test stack; the file is ignored by git.
    {
      echo "ALYR_LINK_SECRET=$(openssl rand -hex 24)"
      echo "ALYR_META_APP_SECRET=$(openssl rand -hex 16)"
    } > "$STATE/env"
  fi
  echo "$STATE/env"
}

app_env() {
  cat <<EOF
ALYR_ENV=production
ALYR_JOBS_INLINE=false
ALYR_DATABASE_URL=postgresql://alyr_app:alyr_app_local@$PG:5432/alyr
ALYR_MIGRATION_URL=postgresql://alyr:alyr_local@$PG:5432/alyr
ALYR_PUBLIC_WEB_URL=http://web.loadtest.invalid
ALYR_MEDIA_ALLOW_LOCAL=true
ALYR_MEDIA_LOCAL_DIR=/tmp/media
ALYR_META_VERIFY_TOKEN=loadtest
EOF
}

up() {
  local cpus="${1:-0.5}" mem="${LT_PG_MEM:-1700m}" shared="${LT_PG_SHARED:-512MB}"
  d network inspect "$NET" >/dev/null 2>&1 || d network create --internal "$NET" >/dev/null
  if ! d inspect "$PG" >/dev/null 2>&1; then
    d volume create "$VOL" >/dev/null
    d run -d --name "$PG" --network "$NET" --cpus "$cpus" --memory "$mem" \
      -e POSTGRES_USER=alyr -e POSTGRES_PASSWORD=alyr_local -e POSTGRES_DB=alyr \
      -v "$VOL:/var/lib/postgresql/data" postgres:16 \
      -c max_connections="${LT_PG_CONNECTIONS:-50}" -c shared_buffers="$shared" \
      -c effective_cache_size=1GB -c shared_preload_libraries=pg_stat_statements \
      -c pg_stat_statements.track=all -c track_io_timing=on -c log_lock_waits=on >/dev/null
  else
    d update --cpus "$cpus" --memory "$mem" --memory-swap "$mem" "$PG" >/dev/null
    d start "$PG" >/dev/null 2>&1 || true
  fi
  until d exec "$PG" pg_isready -U alyr -d alyr >/dev/null 2>&1; do sleep 1; done
  d exec "$PG" psql -U alyr -d alyr -qc "create extension if not exists pg_stat_statements" >/dev/null
  echo "$PG is up with $cpus CPU, $mem, max_connections ${LT_PG_CONNECTIONS:-50}"
}

# A one-off container from the API image (python, the code and its dependencies), with the
# load scripts mounted at /loadtest. Used for migrations, seeding and the load itself.
runner() {
  local image="$1"; shift
  d run --rm --name "$P-load-$$" --network "$NET" --cpus "$LOAD_CPUS" \
    --env-file "$(win "$(env_file)")" $(app_env | sed 's/^/-e /') \
    -v "$(win "$ROOT/scripts/loadtest"):/loadtest:ro" \
    -v "$(win "$STATE"):/state" \
    -e LT_STATE=/state -e LT_BASE="${LT_BASE:-}" "$@"
}

apps() {
  local image="$1" count="${2:-1}"
  stop_apps
  [ -n "$image" ] || { echo "apps: name the image" >&2; exit 2; }
  local envs; envs=$(app_env | sed 's/^/-e /' | tr '\n' ' ')
  # LT_APP_ENV="ALYR_DB_POOL_MAX=8 ALYR_POLL_CACHE_SECONDS=5": settings to try on the apps
  local extra=""; for kv in ${LT_APP_ENV:-}; do extra="$extra -e $kv"; done
  for i in $(seq 1 "$count"); do
    # shellcheck disable=SC2086
    d run -d --name "$P-api$i" --network "$NET" --cpus 1 --memory 1g --env-file "$(win "$(env_file)")" $envs \
      $extra "$image" api >/dev/null
  done
  # The worker's sends take SIM_SEND_MS, as Meta's do, through a test-only wrapper that is
  # outside the product's code (patch/sitecustomize.py).
  # shellcheck disable=SC2086
  d run -d --name "$P-worker" --network "$NET" --cpus 1 --memory 512m --env-file "$(win "$(env_file)")" $envs \
    -v "$(win "$ROOT/scripts/loadtest/patch"):/patch:ro" -e PYTHONPATH=/patch \
    -e LT_SIM_SEND_MS="$SIM_SEND_MS" $extra "$image" worker >/dev/null
  for i in $(seq 1 "$count"); do
    until d exec "$P-api$i" python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8080/health/ready', timeout=3)" >/dev/null 2>&1; do sleep 1; done
  done
  echo "$count API container(s) and the worker are up from $image"
}

stop_apps() {
  for name in $(d ps -a --format '{{.Names}}' | grep -E "^$P-(api[0-9]+|worker)$" || true); do
    own "$name" && d rm -f "$name" >/dev/null
  done
}

snapshot() {
  d exec "$PG" psql -U alyr -d postgres -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('alyr','$TEMPLATE') and pid <> pg_backend_pid()" >/dev/null
  d exec "$PG" psql -U alyr -d postgres -qc "drop database if exists $TEMPLATE" -c "create database $TEMPLATE template alyr"
  echo "snapshot taken"
}

restore() {
  d exec "$PG" psql -U alyr -d postgres -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'alyr' and pid <> pg_backend_pid()" >/dev/null
  d exec "$PG" psql -U alyr -d postgres -qc "drop database if exists alyr" -c "create database alyr template $TEMPLATE"
  d exec "$PG" psql -U alyr -d alyr -qc "create extension if not exists pg_stat_statements" >/dev/null
  d exec "$PG" psql -U alyr -d alyr -qc "select pg_stat_statements_reset()" >/dev/null
  echo "database restored from the snapshot"
}

fresh() {
  d exec "$PG" psql -U alyr -d postgres -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'alyr' and pid <> pg_backend_pid()" >/dev/null
  d exec "$PG" psql -U alyr -d postgres -qc "drop database if exists alyr" -c "create database alyr"
  d exec "$PG" psql -U alyr -d alyr -qc "create extension if not exists pg_stat_statements" >/dev/null
  runner "$1" "$1" python -m alyr.migrate | tail -c 200
}

# The API's own tests need a Postgres with no CPU limit and (to fetch dependencies the first time)
# a network with internet. Both are named $P-test*, separate from the measured database.
tests() {
  # LT_TESTPG=2 uses a Postgres of its own ($P-testpg2), so several test runs can go side by side.
  local tpg="$P-testpg${LT_TESTPG:-}"
  d network inspect "$P-test" >/dev/null 2>&1 || d network create "$P-test" >/dev/null
  if ! d inspect "$tpg" >/dev/null 2>&1; then
    d run -d --name "$tpg" --network "$P-test"       -e POSTGRES_USER=alyr -e POSTGRES_PASSWORD=alyr_local -e POSTGRES_DB=alyr postgres:16       -c max_connections=200 -c fsync=off -c synchronous_commit=off >/dev/null
  else
    d start "$tpg" >/dev/null 2>&1 || true
  fi
  until d exec "$tpg" pg_isready -U alyr -d alyr >/dev/null 2>&1; do sleep 1; done
  d run --rm --network "$P-test"     -v "$(win "$ROOT"):/src" -v "$P-uv-cache:/root/.cache/uv" -v "$P-venv:/venv"     -e UV_PROJECT_ENVIRONMENT=/venv -e UV_LINK_MODE=copy -e ALYR_TEST_DB_HOST="$tpg:5432"     -e ALYR_ENV=local -e ALYR_DATABASE_URL="postgresql://alyr_app:alyr_app_local@$tpg:5432/alyr"     -e ALYR_MIGRATION_URL="postgresql://alyr:alyr_local@$tpg:5432/alyr"     -w /src/apps/api ghcr.io/astral-sh/uv:python3.13-bookworm-slim uv run "$@"
}

down() {
  stop_apps
  for name in $(d ps -a --format '{{.Names}}' | grep -E "^$P-" || true); do d rm -f "$name" >/dev/null; done
  d volume rm "$VOL" "$P-uv-cache" "$P-venv" >/dev/null 2>&1 || true
  d network rm "$P-test" >/dev/null 2>&1 || true
  d network rm "$NET" >/dev/null 2>&1 || true
  echo "removed everything named $P-*"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  up) up "$@" ;;
  apps) apps "$@" ;;
  stop-apps) stop_apps ;;
  test) tests "$@" ;;
  fresh) fresh "$1" ;;
  snapshot) snapshot ;;
  restore) restore ;;
  run) image="${LT_IMAGE:?set LT_IMAGE to the API image}"; script="$1"; shift
       runner "$image" "$image" python "/loadtest/$script" "$@" ;;
  migrate) image="$1"; runner "$image" "$image" python -m alyr.migrate ;;
  psql) d exec -i "$PG" psql -U alyr -d alyr "$@" ;;
  down) down ;;
  *) sed -n '2,22p' "$0"; exit 2 ;;
esac
