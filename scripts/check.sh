#!/usr/bin/env bash
# Everything CI runs, in one command. Run before opening a pull request.
# Needs PostgreSQL on localhost:5432: `docker compose up -d`, or `scripts/cloud-setup.sh`
# where there is no Docker.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

echo "== api: lint"
(cd "$root/apps/api" && uv run ruff check .)
echo "== api: tests"
(cd "$root/apps/api" && uv run pytest -q)
echo "== web: lint"
(cd "$root/apps/web" && pnpm lint)
echo "== web: types"
(cd "$root/apps/web" && pnpm exec tsc --noEmit)
echo "All checks passed."
