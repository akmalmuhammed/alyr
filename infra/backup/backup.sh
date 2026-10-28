#!/usr/bin/env bash
# Dump the database, encrypt the dump, copy it to every destination, delete old copies.
#
# Settings (environment):
#   BACKUP_DATABASE_URL   the read-only backup role (ALYR_BACKUP_URL in the API's settings)
#   BACKUP_AGE_RECIPIENT  the public key dumps are encrypted to ("age1..."); the private
#                         key never reaches the server
#   BACKUP_DESTINATIONS   space-separated rclone destinations, e.g. "gcs:alyr-db-doha r2:alyr-db-eu".
#                         Each remote is configured by RCLONE_CONFIG_<NAME>_* variables.
#   BACKUP_KEEP_DAYS      delete copies older than this (default 35)
#
# Exits non-zero if the dump fails or any destination fails, so the scheduler reports it.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT}"
: "${BACKUP_DESTINATIONS:?set BACKUP_DESTINATIONS}"
keep_days="${BACKUP_KEEP_DAYS:-35}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="alyr-${stamp}.dump.age"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Custom format: compressed, and restorable table by table. Azure's own scheduling
# schema (cron) is not ours and is left out. Ownership is not kept: whoever restores
# owns the objects; grants to the app role are kept.
pg_dump --format=custom --no-owner --exclude-schema=cron \
  --dbname="$BACKUP_DATABASE_URL" --file="$work/db.dump"

# A dump that cannot be listed would not restore: fail now, not on the day it is needed.
tables="$(pg_restore --list "$work/db.dump" | grep -c ' TABLE DATA ' || true)"
if [ "$tables" -lt 1 ]; then
  echo "backup: the dump contains no table data; refusing to keep it" >&2
  exit 1
fi

age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$work/$name" "$work/db.dump"
rm -f "$work/db.dump"
size="$(du -h "$work/$name" | cut -f1)"

failed=0
for dest in $BACKUP_DESTINATIONS; do
  if rclone copyto --quiet "$work/$name" "$dest/$name"; then
    # Only our own files, and only old ones: tonight's copy is never touched.
    rclone delete --quiet --min-age "${keep_days}d" --include "alyr-*.dump.age" "$dest" || true
    echo "backup: $name ($size, $tables tables) -> $dest"
  else
    echo "backup: copying to $dest FAILED" >&2
    failed=1
  fi
done
exit "$failed"
