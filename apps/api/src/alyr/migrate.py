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


async def migrate(owner_dsn: str, app_dsn: str) -> list[str]:
    conn = await asyncpg.connect(owner_dsn)
    try:
        await ensure_app_role(conn, app_dsn)
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
    names = asyncio.run(migrate(settings.migration_url, settings.database_url))
    print("applied:", ", ".join(names) if names else "nothing new")
