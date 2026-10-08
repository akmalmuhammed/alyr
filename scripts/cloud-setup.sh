#!/usr/bin/env bash
# Prepare a machine that has no Docker (a Claude Code cloud session, a plain Linux box)
# to run Alyr: start the PostgreSQL that is already installed, create the same owner
# role and database that docker-compose.yml creates, install dependencies, migrate and
# load the demo shop. Safe to run again. On a laptop with Docker, use
# `docker compose up -d` instead.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

as_postgres() {
  if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else sudo -u postgres bash -c "$1"; fi
}

if ! command -v psql >/dev/null 2>&1; then
  echo "cloud-setup: PostgreSQL is not installed here. Install PostgreSQL 16, or set"
  echo "ALYR_DATABASE_URL and ALYR_MIGRATION_URL to a hosted database, then run again."
  exit 0
fi

if ! pg_isready -q -h localhost -p 5432; then
  echo "== starting PostgreSQL"
  service postgresql start >/dev/null 2>&1 || sudo service postgresql start >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do pg_isready -q -h localhost -p 5432 && break; sleep 1; done
fi
if ! pg_isready -q -h localhost -p 5432; then
  echo "cloud-setup: PostgreSQL did not start on localhost:5432. Tests cannot run yet."
  exit 0
fi

echo "== database owner role and database (same names as docker-compose.yml)"
as_postgres "psql -qtc \"select 1 from pg_roles where rolname = 'alyr'\" | grep -q 1 \
  || psql -qc \"create role alyr login superuser password 'alyr_local'\""
as_postgres "psql -qtc \"select 1 from pg_database where datname = 'alyr'\" | grep -q 1 \
  || psql -qc \"create database alyr owner alyr\""

echo "== api dependencies, tables and demo shop"
command -v uv >/dev/null 2>&1 || pip install -q uv
(cd "$root/apps/api" && uv sync -q && uv run python -m alyr.migrate && uv run python -m alyr.seed)

echo "== web dependencies"
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm >/dev/null 2>&1
(cd "$root/apps/web" && pnpm install --frozen-lockfile --silent)

git -C "$root" config core.hooksPath scripts/hooks
echo "Ready. Run scripts/check.sh to confirm."
