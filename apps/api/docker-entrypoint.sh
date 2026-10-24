#!/usr/bin/env bash
# Starts the API and the job runner side by side in one container and stops both when either
# one stops, so the platform restarts the container instead of leaving a half-alive one.
# ALYR_JOBS_INLINE is "false" in production: the API only queues jobs and the runner runs them.
set -euo pipefail

python -m alyr.worker &
worker=$!
uvicorn alyr.main:app --host 0.0.0.0 --port "${PORT:-8080}" \
  --proxy-headers --forwarded-allow-ips '*' &
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
