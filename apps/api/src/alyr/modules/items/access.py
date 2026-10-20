"""Who may change what in the Catalog (D-039, ALY-104).

Owners and admins change everything. Anyone on the team flips an item's switch, records
stock received or wasted, and counts the shelf, since that is what the counter does all
day. An agent may also add and edit items and photos when the owner has allowed it (a shop
setting, off to start). The settings, the categories and the usage figures stay with
owners and admins whatever the setting says.

The API enforces this; the screens hide what the signed-in person cannot use.
"""

import asyncpg
from fastapi import HTTPException

from alyr import catalog
from alyr.core.auth import Staff

NOT_ALLOWED = "Only the owner or an admin can change this."


def is_manager(staff: Staff) -> bool:
    return staff.role in catalog.MANAGERS


async def agents_may_edit(conn: asyncpg.Connection) -> bool:
    return bool(await conn.fetchval("select agents_edit_items from shop_settings"))


async def can_edit(conn: asyncpg.Connection, staff: Staff) -> bool:
    """May this person add, change and archive items and manage their photos?"""
    return is_manager(staff) or await agents_may_edit(conn)


async def require_edit(conn: asyncpg.Connection, staff: Staff) -> None:
    if not await can_edit(conn, staff):
        raise HTTPException(status_code=403, detail=NOT_ALLOWED)


def require_manager(staff: Staff) -> None:
    if not is_manager(staff):
        raise HTTPException(status_code=403, detail=NOT_ALLOWED)


async def view(conn: asyncpg.Connection, staff: Staff) -> dict:
    """What the screens need to know about the person: which controls to show."""
    manager = is_manager(staff)
    return {
        "role": staff.role,
        "can_manage": manager,
        "can_edit": manager or await agents_may_edit(conn),
        "can_stock": True,
    }
