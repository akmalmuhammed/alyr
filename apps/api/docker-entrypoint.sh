#!/usr/bin/env bash
# What the API image runs (see the Dockerfile):
#   (none)   the API and the job runner side by side, stopping both when either stops, so the
#            platform restarts the container instead of leaving a half-alive one (D-052)
#   api      the API only
#   worker   the job runner only
#   other    run as given, e.g. `python -m alyr.migrate`
# ALYR_JOBS_INLINE is "false" in production: the API only queues jobs and the runner runs them.
set -euo pipefail

api() {
  exec uvicorn alyr.main:app --host 0.0.0.0 --port "${PORT:-8080}" \
    --proxy-headers --forwarded-allow-ips '*' --no-server-header
}

case "${1:-}" in
  api) api ;;
  worker) exec python -m alyr.worker ;;
  "") ;;
  *) exec "$@" ;;
esac

python -m alyr.worker &
worker=$!
uvicorn alyr.main:app --host 0.0.0.0 --port "${PORT:-8080}" \
  --proxy-headers --forwarded-allow-ips '*' --no-server-header &
api=$!

stop() {
  kill -TERM "$api" "$worker" 2>/dev/null || true
  wait "$api" "$worker" 2>/dev/null || true
}
trap 'stop; exit 0' TERM INT

# Returns as soon as one of the two exits, whatever its status.
wait -n "$api" "$worker" || true
echo "docker-entrypoint: the API or the job runner stopped; stopping the container" >&2
stop
exit 1
