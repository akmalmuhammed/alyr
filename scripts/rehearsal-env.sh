#!/usr/bin/env bash
# Make .env.prod for the production rehearsal (docker-compose.prod.yml), with random
# passwords, if it does not exist yet. git ignores it. Nothing secret is printed.
#
#   scripts/rehearsal-env.sh
#   docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
#
# On a real single server, write .env.prod by hand instead, with the real Meta values.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
file="$root/.env.prod"
if [ -f "$file" ]; then
  echo "rehearsal-env: $file already exists; leaving it alone"
  exit 0
fi
rand() { openssl rand -hex 24; }
umask 077
cat > "$file" <<ENV
# Made by scripts/rehearsal-env.sh for the production rehearsal. Random, local only.
ALYR_OWNER_DB_PASSWORD=$(rand)
ALYR_APP_DB_PASSWORD=$(rand)
ALYR_BACKUP_DB_PASSWORD=$(rand)
ALYR_META_APP_SECRET=$(rand)
ALYR_META_VERIFY_TOKEN=$(rand)
ALYR_LINK_SECRET=$(rand)$(rand)
ENV
echo "rehearsal-env: wrote $file"
