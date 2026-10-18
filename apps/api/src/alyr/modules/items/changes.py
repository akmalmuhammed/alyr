"""Changes to the Catalog's settings, on the activity record with who made them (D-039,
ALY-113 checklist item 6).

A change to an item is already on the record (`subject = 'item'`). The settings around the
items are changed by an owner or an admin and decide what customers see and who is told, so
they are written the same way: nobody can edit the record, and each line names the person
(or, for a change made by ALYR's own staff in the back office, that audit trail instead).

* `subject = 'catalog'`, and `subject_id` is the shop itself for a setting, the staff
  member's contact for a staff number, the group for a price group.
* Actions: `settings` (hold time, day start, agents may edit items, low-stock number, the
  wholesale table, the WhatsApp number, sold-out look, how a new item runs out, the two
  alerts, the categories), `staff_added`, `staff_changed`, `staff_removed`, `group_added`,
  `group_renamed`, `group_removed`.
* `detail` says what changed: `{"changes": [{"field": "agents_edit_items", "from": false,
  "to": true}]}`; a staff line has the person's name and whether they are a manager, never
  the phone number.
* A save that changes nothing writes nothing.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.team import Actor

SUBJECT = "catalog"

# The shop's settings, as `service.settings` and `template.hints` give them.
SETTING_FIELDS = (
    "hold_minutes", "day_starts", "agents_edit_items", "low_stock_at",
    "wholesale_layout", "whatsapp_number",
)


def flat_setup(hints: dict) -> dict:
    """The part of `template.hints` an owner can change, as flat fields."""
    return {
        "sold_out_display": hints["sold_out"],
        "new_item_rule": hints["new_item"]["rule"],
        "alert_low_stock": hints["alerts"]["low_stock"],
        "alert_sold_out": hints["alerts"]["sold_out"],
    }


def differences(before: dict, after: dict) -> list[dict]:
    """The fields whose value is not the same in `after`, in the order `after` has them."""
    return [
        {"field": field, "from": before.get(field), "to": value}
        for field, value in after.items()
        if before.get(field) != value
    ]


async def shop_id(conn: asyncpg.Connection) -> UUID:
    return await conn.fetchval("select nullif(current_setting('app.tenant_id', true), '')::uuid")


async def settings_changed(
    conn: asyncpg.Connection, actor: Actor, before: dict, after: dict
) -> int:
    """Put the settings that differ on the record, one line for the save. Returns how many
    settings changed."""
    changes = differences(before, after)
    if changes:
        await team.record(
            conn, SUBJECT, await shop_id(conn), "settings", actor, None, {"changes": changes}
        )
    return len(changes)


async def staff_changed(
    conn: asyncpg.Connection, actor: Actor, action: str, person: dict, before: dict | None = None
) -> None:
    """A staff number was added, changed or taken off. `person` is the number as the screens
    show it (`staff.get`). The line has the name and whether the person is a manager, and, for
    a change, what changed. The phone number is not copied onto the record."""
    detail: dict = {"name": person["name"], "manager": person["manager"]}
    if before is not None:
        kept = ("name", "lang", "manager")
        detail["changes"] = differences(
            {k: before[k] for k in kept}, {k: person[k] for k in kept}
        )
        if not detail["changes"]:
            return  # saved again as it was
    await team.record(conn, SUBJECT, UUID(str(person["id"])), action, actor, None, detail)


async def group_changed(
    conn: asyncpg.Connection, actor: Actor, action: str, group: dict, was: str | None = None
) -> None:
    """A price group was added, renamed or taken away (with its customers moved back)."""
    await team.record(
        conn, SUBJECT, UUID(str(group["id"])), action, actor, None,
        {"name": group.get("name"), "name_ar": group.get("name_ar") or None, "was": was},
    )


async def listing(conn: asyncpg.Connection, limit: int = 50) -> list[dict]:
    """The latest changes to the Catalog's settings, newest first."""
    rows = await conn.fetch(
        "select id, subject_id, action, detail, actor_id, actor_name, created_at from activity "
        "where subject = $1 order by created_at desc, id limit $2",
        SUBJECT, limit,
    )
    return [
        {
            "id": str(r["id"]), "action": r["action"], "subject_id": str(r["subject_id"]),
            "detail": r["detail"],
            "actor": {"id": str(r["actor_id"]) if r["actor_id"] else None,
                      "name": r["actor_name"]},
            "at": r["created_at"].isoformat(),
        }
        for r in rows
    ]
