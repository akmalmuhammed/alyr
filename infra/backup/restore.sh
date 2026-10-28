#!/usr/bin/env bash
# Restore an encrypted backup into an EMPTY database.
#
#   restore.sh <backup> <target database URL>
#
# <backup> is a local file or an rclone path such as "gcs:alyr-db-doha/alyr-20261017T230000Z.dump.age".
# The target URL is the owner (admin) role of the new database server.
#
# Settings (environment):
#   BACKUP_AGE_IDENTITY   path to the private key file (the founder's; never stored on a server)
#   ALYR_APP_PASSWORD     password for the application role on the new server; the role is
#                         created if missing, because the dump's grants refer to it
#   ALYR_APP_ROLE         application role name (default alyr_app)
set -euo pipefail

backup="${1:?usage: restore.sh <backup> <target database URL>}"
target="${2:?usage: restore.sh <backup> <target database URL>}"
: "${BACKUP_AGE_IDENTITY:?set BACKUP_AGE_IDENTITY to the private key file}"
if [ -z "${ALYR_APP_PASSWORD:-}" ]; then echo "restore: set ALYR_APP_PASSWORD" >&2; exit 1; fi
app_role="${ALYR_APP_ROLE:-alyr_app}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ -f "$backup" ]; then
  cp "$backup" "$work/backup.age"
else
  rclone copyto --quiet "$backup" "$work/backup.age"
fi
age --decrypt --identity "$BACKUP_AGE_IDENTITY" --output "$work/db.dump" "$work/backup.age"

existing="$(psql "$target" -tAc "select count(*) from pg_tables where schemaname = 'public'")"
if [ "$existing" != "0" ]; then
  echo "restore: the target database already has $existing tables; restore only into an empty one" >&2
  exit 1
fi

# The app role, so the dump's grants to it apply. Role names cannot be bound as
# parameters; the name is checked to be a plain identifier first.
case "$app_role" in *[!a-z0-9_]*|"") echo "restore: bad role name" >&2; exit 1;; esac
psql "$target" -v ON_ERROR_STOP=1 -q -v pw="$ALYR_APP_PASSWORD" <<SQL
select format('create role %I login password %L', '$app_role', :'pw')
where not exists (select 1 from pg_roles where rolname = '$app_role') \gexec
SQL

pg_restore --no-owner --exit-on-error --dbname="$target" "$work/db.dump"

# Shop tables force row-level security, so even the owner sees no rows in them without a
# tenant set; count only what it can see, plus how many tables came back.
echo "restore: done."
psql "$target" -tA -F ' ' -c "select 'tables', count(*) from pg_tables where schemaname = 'public'
  union all select 'shops', count(*) from tenants
  union all select 'migrations', count(*) from schema_migrations"
