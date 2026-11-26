"""Where a business's pack is kept: `discovery_settings.pack_family` and `pack_trade` (migration
0171). Until an owner or admin picks one, the pack comes from the business's type (D-196: a salon
starts as a salon). The values are checked by the registry, not by the database, so a new family
needs no migration."""

import asyncpg

from alyr.modules.discovery.packs.registry import PackError, Registry, Selection

_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"


async def business_type(conn: asyncpg.Connection) -> str:
    return await conn.fetchval(f"select business_type from tenants where id = {_TENANT}") or ""


async def choice(
    conn: asyncpg.Connection, registry: Registry
) -> tuple[str | None, str | None, bool]:
    """(family, trade, chosen): what the owner picked, else what the business type gives."""
    row = await conn.fetchrow("select pack_family, pack_trade from discovery_settings")
    if row is not None and row["pack_family"]:
        return row["pack_family"], row["pack_trade"], True
    family, trade = registry.for_business_type(await business_type(conn))
    return family, trade, False


async def selection(conn: asyncpg.Connection, registry: Registry) -> Selection:
    """What this business is checked against. A stored family or trade the registry no longer has
    falls back to the type's, then to the core: a check-up never fails on it."""
    family, trade, _ = await choice(conn, registry)
    try:
        return registry.select(family, trade)
    except PackError:
        try:
            return registry.select(*registry.for_business_type(await business_type(conn)))
        except PackError:
            return registry.select(None)


async def save(conn: asyncpg.Connection, family: str, trade: str | None) -> None:
    await conn.execute(
        "insert into discovery_settings (pack_family, pack_trade) values ($1, $2) "
        "on conflict (tenant_id) do update set pack_family = excluded.pack_family, "
        "pack_trade = excluded.pack_trade, updated_at = now()",
        family, trade,
    )
