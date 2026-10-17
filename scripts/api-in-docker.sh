#!/usr/bin/env bash
# Run a command for the API inside a Linux container on the same Docker network as the
# local PostgreSQL. Use it on machines where Windows refuses to load Python's compiled
# database driver (Smart App Control), which makes `uv run pytest` fail natively.
#
#   scripts/api-in-docker.sh uv run pytest -q
#   scripts/api-in-docker.sh uv run ruff check .
#
# Needs `docker compose up -d` first. Keeps its own virtual environment in a Docker
# volume, so the Windows `.venv` is left alone.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then root="$(cygpath -w "$root")"; fi
network="$(docker network ls --format '{{.Name}}' | grep -m1 -E '^alyr.*_default$')"
MSYS_NO_PATHCONV=1 docker run --rm ${ALYR_DOCKER_FLAGS:-} \
  --network "$network" \
  -v "$root:/src" -v alyr_uv_cache:/root/.cache/uv -v alyr_api_venv:/venv \
  -e UV_PROJECT_ENVIRONMENT=/venv -e UV_LINK_MODE=copy \
  -e ALYR_TEST_DB_HOST=postgres:5432 \
  -e ALYR_ENV="${ALYR_ENV:-local}" \
  -e ALYR_DATABASE_URL=postgresql://alyr_app:alyr_app_local@postgres:5432/alyr \
  -e ALYR_MIGRATION_URL=postgresql://alyr:alyr_local@postgres:5432/alyr \
  -w /src/apps/api \
  ghcr.io/astral-sh/uv:python3.13-bookworm-slim "$@"
