"""Apply SQL migrations in order. Run with: uv run python -m alyr.migrate"""

import asyncio
from pathlib import Path
from urllib.parse import urlparse

import asyncpg

from alyr.config import get_settings

MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"


async def ensure_app_role(conn: asyncpg.Connection, app_dsn: str) -> None:
    """Create the application role if it is missing, using the credentials the app will use."""
    parsed = urlparse(app_dsn)
    role, password = parsed.username, parsed.password
    if not role or not role.replace("_", "").isalnum():
        raise ValueError("database_url must name a simple role")
    exists = await conn.fetchval("select 1 from pg_roles where rolname = $1", role)
    if not exists:
        # Role names and passwords cannot be bound as parameters in CREATE ROLE.
        quoted = (password or "").replace("'", "''")
        await conn.execute(f"create role {role} login password '{quoted}'")


async def ensure_backup_role(conn: asyncpg.Connection, backup_dsn: str) -> None:
    """Create the role the nightly backup signs in as, if it is missing.

    Every tenant table forces row-level security, so even the owner sees no rows without
    a tenant set, and pg_dump refuses to run. The backup role is the one role allowed to
    read past it: BYPASSRLS plus read-only access to everything. It can change nothing,
    and only the backup job holds its password. The application role still cannot bypass
    row-level security (hard rule 1). PostgreSQL 16 or later lets a non-superuser admin,
    such as Azure's, grant BYPASSRLS.
    """
    parsed = urlparse(backup_dsn)
    role, password = parsed.username, parsed.password
    if not role or not role.replace("_", "").isalnum():
        raise ValueError("backup_url must name a simple role")
    exists = await conn.fetchval("select 1 from pg_roles where rolname = $1", role)
    try:
        if not exists:
            quoted = (password or "").replace("'", "''")
            await conn.execute(f"create role {role} login bypassrls password '{quoted}'")
        await conn.execute(f"grant pg_read_all_data to {role}")
    except asyncpg.InsufficientPrivilegeError as error:
        # A host that does not allow this must not block a deploy: the backup job then
        # fails loudly on its own, which is where the problem belongs.
        print(f"warning: backup role {role} not fully set up ({error}); backups will fail")


async def ensure_owner_bypasses_rls(conn: asyncpg.Connection) -> None:
    """Let the owner role, which runs the migrations and owns the SECURITY DEFINER
    functions (sign-up, the back office, quotes), act past row-level security.

    On a developer machine and in tests the owner is a superuser and does so already. A
    managed database's admin is not: on Cloud SQL `postgres` is subject to the forced
    policies, so sign-up and the back office would fail with "new row violates row-level
    security policy" (found on the first Google deploy, 28 Oct 2026). Cloud SQL lets its
    admin give itself BYPASSRLS. The application role never has it (hard rule 1).
    """
    row = await conn.fetchrow(
        "select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user"
    )
    if row["rolsuper"] or row["rolbypassrls"]:
        return
    try:
        await conn.execute(f'alter role "{row["rolname"]}" bypassrls')
    except asyncpg.InsufficientPrivilegeError as error:
        print(
            f"warning: the owner role {row['rolname']} cannot bypass row-level security "
            f"({error}); sign-up and back-office functions will fail on this host"
        )


# Any two processes that start a migration at once (two API replicas, or a deploy and a
# person) take turns on this lock instead of applying the same file twice.
_MIGRATION_LOCK = 7_301_202_610


async def migrate(owner_dsn: str, app_dsn: str, backup_dsn: str = "") -> list[str]:
    conn = await asyncpg.connect(owner_dsn)
    try:
        await conn.execute("select pg_advisory_lock($1)", _MIGRATION_LOCK)
        await ensure_owner_bypasses_rls(conn)
        await ensure_app_role(conn, app_dsn)
        if backup_dsn:
            await ensure_backup_role(conn, backup_dsn)
        await conn.execute(
            "create table if not exists schema_migrations "
            "(name text primary key, applied_at timestamptz not null default now())"
        )
        done = {r["name"] for r in await conn.fetch("select name from schema_migrations")}
        applied = []
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if path.name in done:
                continue
            async with conn.transaction():
                await conn.execute(path.read_text(encoding="utf-8"))
                await conn.execute("insert into schema_migrations (name) values ($1)", path.name)
            applied.append(path.name)
        return applied
    finally:
        await conn.close()


if __name__ == "__main__":
    settings = get_settings()
    names = asyncio.run(
        migrate(settings.migration_url, settings.database_url, settings.backup_url)
    )
    print("applied:", ", ".join(names) if names else "nothing new")
