#!/usr/bin/env bash
# Start, check and reset everything a live WhatsApp demo needs, on the founder's laptop.
#
#   scripts/demo.sh up       start what is not running, then check
#   scripts/demo.sh check    is everything ready? (database, Meta, templates, tunnel, pages)
#   scripts/demo.sh reset    put the demo shop back to its starting state (asks first)
#   scripts/demo.sh down     stop the tunnel, the API and the worker
#
# Pieces: PostgreSQL (docker compose), the API and the worker (containers alyr-api-dev
# and alyr-worker-dev), the web app on port 3100 (pnpm dev), and the Cloudflare tunnel
# alyr-dev that lets WhatsApp and customers' phones reach this laptop. Logs for the web
# app and the tunnel go to .demo/ in the repository.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
logs="$root/.demo"
mkdir -p "$logs"

say() { printf '%s\n' "$*"; }
running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; }
listening() { curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/" ; }

container() {
  local name="$1"; shift
  if running "$name"; then say "  ok  $name is running"; return; fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  ALYR_DOCKER_FLAGS="-d --name $name $*" bash "$root/scripts/api-in-docker.sh" "${CMD[@]}" >/dev/null
  say "  ->  started $name"
}

up() {
  say "Starting the demo"
  (cd "$root" && docker compose up -d postgres redis >/dev/null)
  say "  ok  database"
  bash "$root/scripts/api-in-docker.sh" uv run python -m alyr.migrate | sed 's/^/      /'
  CMD=(uv run uvicorn alyr.main:app --host 0.0.0.0 --port 8000) container alyr-api-dev "-p 8000:8000"
  CMD=(uv run python -m alyr.worker) container alyr-worker-dev
  if listening 3100; then
    say "  ok  web app on port 3100"
  else
    (cd "$root/apps/web" && nohup pnpm dev > "$logs/web.log" 2>&1 &)
    say "  ->  started the web app (log: .demo/web.log)"
  fi
  if pgrep -f "cloudflared.*alyr-dev" >/dev/null 2>&1 || tasklist 2>/dev/null | grep -qi cloudflared; then
    say "  ok  tunnel alyr-dev"
  else
    (nohup cloudflared tunnel run alyr-dev > "$logs/tunnel.log" 2>&1 &)
    say "  ->  started the tunnel (log: .demo/tunnel.log)"
  fi
  say "  ..  waiting for everything to answer"
  for _ in $(seq 1 45); do
    curl -sf --max-time 2 http://127.0.0.1:8000/health >/dev/null && listening 3100 && break
    sleep 2
  done
  echo
  check
}

check() {
  if ! running alyr-api-dev; then say "The API is not running. Run: scripts/demo.sh up"; exit 1; fi
  docker exec alyr-api-dev uv run python -m alyr.doctor
}

reset() {
  if [ "${1:-}" != "--yes" ]; then
    read -r -p "This wipes the demo shop's chats, orders and bookings and loads the starting data. Continue? [y/N] " answer
    [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { say "Nothing changed."; exit 0; }
  fi
  curl -sf -X POST http://127.0.0.1:8000/sim/reset >/dev/null && say "Demo shop reset."
}

down() {
  docker stop alyr-api-dev alyr-worker-dev >/dev/null 2>&1 || true
  if command -v taskkill >/dev/null 2>&1; then taskkill //IM cloudflared.exe //F >/dev/null 2>&1 || true
  else pkill -f "cloudflared.*alyr-dev" || true; fi
  say "Stopped the API, the worker and the tunnel. The database and the web app are left running."
}

case "${1:-}" in
  up) up ;;
  check) check ;;
  reset) shift; reset "${1:-}" ;;
  down) down ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
