"""The connector's own actions on `core/actions.py` (spec 067).

Only what the foundation needs: `mcp.hello`, which tells the owner's app which business and which
person it is speaking for, and two actions that exist to prove the safety layer end to end
(`mcp.test_customer_name`, `mcp.test_write_note`); the tools on them are `test_only` and are not
offered anywhere but a developer's machine.

Every action returns its whole answer; what the model may see of it is decided by the tool's
`present` (the data minimum, D-170). A change records itself with the channel of its caller, so the
workspace's history says it came through the connector.
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import asyncpg

from alyr.core import team
from alyr.core.actions import ADMIN, ALL_ROLES, OWNER, Caller, register

_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"


@register("mcp.hello", ALL_ROLES)
async def hello(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    shop = await conn.fetchrow(
        f"select name, name_ar, timezone from tenants where id = {_TENANT}"
    )
    modules = await conn.fetch(
        "select module_key from tenant_modules where enabled order by module_key"
    )
    zone = ZoneInfo(shop["timezone"] or "Asia/Qatar")
    return {
        "business": {"name": shop["name"], "name_ar": shop["name_ar"]},
        "you": {"first_name": (caller.name or "").split(" ")[0], "role": caller.role},
        "modules_on": [m["module_key"] for m in modules],
        "time_zone": str(zone),
        "now": datetime.now(UTC).astimezone(zone).isoformat(timespec="seconds"),
    }


@register("mcp.test_customer_name", ALL_ROLES)
async def test_customer_name(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """The newest customer's name and number, whole. The tool shows only a first name, marked
    as a customer's own words, and three digits."""
    row = await conn.fetchrow(
        "select name, phone from contacts where role = 'customer' "
        "order by created_at desc, id desc limit 1"
    )
    return {"customer": dict(row) if row else None}


@register("mcp.test_write_note", frozenset({OWNER, ADMIN}))
async def test_write_note(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Put a note on the activity record. It exists only to show that a change happens when, and
    only when, the confirm step has been passed."""
    tenant = await conn.fetchval(f"select {_TENANT}")
    await team.record(
        conn, "mcp", tenant, "test_note", caller.actor, None, {"note": args.get("note", "")},
        channel=caller.channel,
    )
    return {"written": True}
