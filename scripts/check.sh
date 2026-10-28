#!/usr/bin/env bash
# Everything CI runs, in one command. Run before opening a pull request.
# Needs PostgreSQL on localhost:5432: `docker compose up -d`, or `scripts/cloud-setup.sh`
# where there is no Docker.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

# Make sure this clone uses the repository's secret-blocking hook.
git -C "$root" config core.hooksPath scripts/hooks

echo "== design: tokens and drift"
node "$root/scripts/design-check.mjs"
echo "== api: lint"
(cd "$root/apps/api" && uv run ruff check .)
echo "== api: tests"
(cd "$root/apps/api" && ALYR_ENV=local uv run pytest -q)
echo "== api: known vulnerabilities"
(cd "$root/apps/api" \
  && uv export --frozen --no-emit-project --no-hashes > "${TMPDIR:-/tmp}/alyr-locked.txt" \
  && uvx pip-audit -r "${TMPDIR:-/tmp}/alyr-locked.txt" --no-deps --disable-pip --progress-spinner off)
echo "== web: lint"
(cd "$root/apps/web" && pnpm lint)
echo "== web: tests (search folding, prices, cart, QR codes)"
(cd "$root/apps/web" && pnpm test)
echo "== web: types"
(cd "$root/apps/web" && pnpm exec tsc --noEmit)
echo "== web: known vulnerabilities"
(cd "$root/apps/web" && pnpm audit --prod --audit-level high)
echo "== web: build"
(cd "$root/apps/web" && pnpm build)
echo "== site: the published build, copy parity, banned words, links"
(cd "$root/apps/web" && pnpm site:check)
echo "All checks passed."
