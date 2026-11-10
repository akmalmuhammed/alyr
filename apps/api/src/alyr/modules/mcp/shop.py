"""A business's switches for the connector (spec 067): the opt-in, the kill switch and the caps.

Off until an owner opts in and confirms where the data goes; pausable at once by an owner or an
admin. Every change is on the activity record. Every function takes a connection scoped to the
business.
"""

from datetime import UTC, datetime
from uuid import UUID

import asyncpg

from alyr.config import Settings
from alyr.core.team import Actor
from alyr.modules.mcp import audit

# The wording the owner confirmed. Change it when the wording changes, so the record says which
# words were agreed to.
OPT_IN_VERSION = "2026-11-09"
_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"


class ShopError(Exception):
    """A change to the switches that is refused; `code` is stable and `message` is safe to show."""

    def __init__(self, code: str, message: str, status: int = 403) -> None:
        super().__init__(message)
        self.code, self.status = code, status


def _when(value) -> str | None:
    return value.isoformat() if value else None


async def current(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow("select * from mcp_settings")
    if row is None:
        return {
            "enabled": False, "enabled_by": None, "enabled_at": None, "opt_in_version": None,
            "paused": False, "paused_by": None, "paused_at": None, "cap_hit_at": None,
            "writes_per_day": None, "sends_per_day": None,
        }
    return {
        "enabled": row["enabled"], "enabled_by": row["enabled_by"],
        "enabled_at": _when(row["enabled_at"]), "opt_in_version": row["opt_in_version"],
        "paused": row["paused_at"] is not None, "paused_by": row["paused_by"],
        "paused_at": _when(row["paused_at"]), "cap_hit_at": _when(row["cap_hit_at"]),
        "writes_per_day": row["writes_per_day"], "sends_per_day": row["sends_per_day"],
    }


async def answers(conn: asyncpg.Connection) -> bool:
    """Whether calls are answered for this business: opted in, and not paused."""
    return bool(await conn.fetchval("select enabled and paused_at is null from mcp_settings"))


async def opt_in(conn: asyncpg.Connection, role: str, actor: Actor, channel: str) -> None:
    """The owner's confirmation. Only an owner can give it: an admin or an agent is told that an
    owner must."""
    if role != "owner":
        raise ShopError("owner_must_switch_on", "an owner must switch this on first")
    tenant = await conn.fetchval(f"select {_TENANT}")
    await conn.execute(
        "insert into mcp_settings (enabled, enabled_by, enabled_by_user, enabled_at, "
        "opt_in_version) values (true, $1, $2, now(), $3) "
        "on conflict (tenant_id) do update set enabled = true, enabled_by = excluded.enabled_by, "
        "enabled_by_user = excluded.enabled_by_user, enabled_at = now(), "
        "opt_in_version = excluded.opt_in_version, updated_at = now()",
        actor.name, actor.id, OPT_IN_VERSION,
    )
    await audit.event(conn, tenant, "opted_in", actor, {"version": OPT_IN_VERSION}, channel)


async def switch_off(conn: asyncpg.Connection, role: str, actor: Actor, channel: str) -> None:
    if role not in ("owner", "admin"):
        raise ShopError("not_allowed", "only an owner or an admin can switch this off")
    tenant = await conn.fetchval(f"select {_TENANT}")
    await conn.execute("update mcp_settings set enabled = false, updated_at = now()")
    await audit.event(conn, tenant, "switched_off", actor, None, channel)


async def pause(conn: asyncpg.Connection, role: str, actor: Actor, channel: str) -> None:
    """The kill switch: every call of the business is refused at once, nothing is revoked."""
    if role not in ("owner", "admin"):
        raise ShopError("not_allowed", "only an owner or an admin can pause this")
    tenant = await conn.fetchval(f"select {_TENANT}")
    await conn.execute(
        "insert into mcp_settings (paused_at, paused_by) values (now(), $1) "
        "on conflict (tenant_id) do update set "
        "paused_at = coalesce(mcp_settings.paused_at, now()), "
        "paused_by = coalesce(mcp_settings.paused_by, excluded.paused_by), updated_at = now()",
        actor.name,
    )
    await audit.event(conn, tenant, "paused", actor, None, channel)


async def resume(conn: asyncpg.Connection, role: str, actor: Actor, channel: str) -> None:
    if role not in ("owner", "admin"):
        raise ShopError("not_allowed", "only an owner or an admin can resume this")
    tenant = await conn.fetchval(f"select {_TENANT}")
    await conn.execute(
        "update mcp_settings set paused_at = null, paused_by = null, updated_at = now()"
    )
    await audit.event(conn, tenant, "resumed", actor, None, channel)


async def caps(conn: asyncpg.Connection, settings: Settings) -> tuple[int, int]:
    """(changes a day, customer sends a day): the business's own, else the defaults."""
    row = await conn.fetchrow("select writes_per_day, sends_per_day from mcp_settings")
    writes = (
        row["writes_per_day"] if row and row["writes_per_day"] is not None
        else settings.mcp_writes_per_day
    )
    sends = (
        row["sends_per_day"] if row and row["sends_per_day"] is not None
        else settings.mcp_sends_per_day
    )
    return writes, sends


async def note_cap_hit(conn: asyncpg.Connection, grant_id: UUID, which: str, actor: Actor) -> None:
    """A cap was reached: say so on the record, and set the time the workspace will show."""
    await conn.execute(
        "insert into mcp_settings (cap_hit_at) values ($1) "
        "on conflict (tenant_id) do update set cap_hit_at = excluded.cap_hit_at",
        datetime.now(UTC),
    )
    await audit.event(conn, grant_id, "cap_reached", actor, {"cap": which})
