"""Bulk actions on items, with a preview first and one undo (D-039, ALY-104).

The owner picks items and an action: mark them sold out (or back in stock), change their
prices by a percentage, move them to a category, or archive them. `plan` works out exactly
what would change, and for each item that cannot take the action, why not. Nothing is
written until `apply`, which must be given the plan's `hash`: if an item changed between
looking and applying, the hash no longer matches and nothing is written, so the owner
never applies something other than what they saw.

An applied action is stored whole, each item as it was and as it became, in
`item_bulk_changes`. `undo` puts the items back, for the newest action only and only
once; an item someone has edited since is left as it is and named. Every item's own
change is on the activity record, with the person who made it, like any single edit.

Every function takes a tenant-scoped connection.
"""

import hashlib
import json
from dataclasses import dataclass, field
from uuid import UUID

import asyncpg

from alyr.core.normalise import fmt_qar
from alyr.core.team import Actor
from alyr.modules.items import service
from alyr.modules.items.clock import ShopClock

ACTIONS = ("sold_out", "back", "price_percent", "move_category", "archive")
# Marking things sold out or back is the counter's job, so an agent may do these two.
AVAILABILITY = ("sold_out", "back")
MAX_ITEMS = 500
MIN_PERCENT, MAX_PERCENT = -90, 300
MAX_PRICE = 100_000_000

# Why an item was left out: code -> (English, Arabic). The Arabic awaits review (ALY-66).
SKIPS: dict[str, tuple[str, str]] = {
    "not_on_sale": ("It is not on sale.", "غير معروض للبيع."),
    "no_switch": (
        "It is always available, so it has no switch.", "متاح دائماً وليس له مفتاح."
    ),
    "already": ("It is already like that.", "هو كذلك بالفعل."),
    "no_price": ("It has no price yet.", "ليس له سعر بعد."),
    "no_change": ("Its price would not change.", "لن يتغير سعره."),
    "bad_price": ("The new price would not be allowed.", "السعر الجديد غير مسموح."),
    "bad_sale": (
        "Its sale price would no longer be below its price.", "لن يبقى سعر العرض أقل من السعر."
    ),
    "unfinished": (
        "It is a draft and needs a name and a price first.", "مسودة وتحتاج إلى اسم وسعر أولاً."
    ),
    "changed_since": (
        "It was changed after the action, so it was left as it is now.",
        "تغيّر بعد الإجراء، لذلك تُرك كما هو الآن.",
    ),
    "gone": ("It no longer exists.", "لم يعد موجوداً."),
    "failed": ("It could not be changed.", "تعذّر تغييره."),
}


class BulkError(Exception):
    """A bulk request that cannot be carried out. `code` is stable; the message is safe to
    show."""

    def __init__(self, code: str, en: str, ar: str, status: int = 422) -> None:
        super().__init__(en)
        self.code, self.en, self.ar, self.status = code, en, ar, status


@dataclass
class Plan:
    action: str
    params: dict
    changes: list[dict] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)

    @property
    def hash(self) -> str:
        """Names exactly this action on exactly these items with exactly these results."""
        body = json.dumps(
            [self.action, self.params,
             sorted([c["id"], c["before"], c["after"]] for c in self.changes)],
            sort_keys=True, separators=(",", ":"),
        )
        return hashlib.sha256(body.encode()).hexdigest()[:16]

    def view(self) -> dict:
        return {
            "action": self.action, "params": self.params, "hash": self.hash,
            "changes": self.changes, "skipped": self.skipped,
        }


def _scaled(value: int, percent: int) -> int:
    """`value` changed by `percent`, to the nearest whole unit, halves rounding up."""
    return (value * (100 + percent) + 50) // 100


def _skip(item: dict, code: str) -> dict:
    en, ar = SKIPS[code]
    return {
        "id": item["id"], "name": item["name"], "name_ar": item["name_ar"], "code": code,
        "message": en, "message_ar": ar,
    }


def _change(item: dict, before: dict, after: dict) -> dict:
    return {
        "id": item["id"], "name": item["name"], "name_ar": item["name_ar"],
        "before": before, "after": after,
    }


def _check_params(action: str, params: dict) -> None:
    if action not in ACTIONS:
        raise BulkError("bad_action", "Choose what to do with these items.", "اختر ما تريد فعله.")
    if action == "price_percent":
        percent = params.get("percent")
        if not isinstance(percent, int) or isinstance(percent, bool) or percent == 0 or not (
            MIN_PERCENT <= percent <= MAX_PERCENT
        ):
            raise BulkError(
                "bad_percent",
                f"Enter a percentage between {MIN_PERCENT} and {MAX_PERCENT}, not zero.",
                f"أدخل نسبة بين {MIN_PERCENT} و{MAX_PERCENT}، وليست صفراً.",
            )
    if action == "move_category":
        category = params.get("category")
        if not isinstance(category, str) or len(category.strip()) > 60:
            raise BulkError(
                "bad_category", "Choose a category, or none.", "اختر فئة أو بدون فئة."
            )


async def plan(
    conn: asyncpg.Connection, clock: ShopClock, action: str, item_ids: list[UUID],
    params: dict,
) -> Plan:
    """What the action would do to these items, and which it cannot touch. Writes nothing."""
    _check_params(action, params)
    ids = list(dict.fromkeys(item_ids))
    if not ids:
        raise BulkError("nothing_chosen", "Choose some items first.", "اختر بعض الأصناف أولاً.")
    if len(ids) > MAX_ITEMS:
        raise BulkError(
            "too_many", f"Choose up to {MAX_ITEMS} items at a time.",
            f"اختر حتى {MAX_ITEMS} صنف في المرة الواحدة.",
        )
    clean = dict(params)
    if action == "move_category":
        clean["category"] = clean["category"].strip()
    result = Plan(action, clean)
    entries = await service.load(conn, clock, "i.id = any($1)", (ids,))
    for entry in entries:
        item = service.view(entry, clock)
        i = entry.item
        if action in AVAILABILITY:
            wanted = action == "back"
            if i["status"] != "live":
                result.skipped.append(_skip(item, "not_on_sale"))
            elif i["stock_rule"] == "always":
                result.skipped.append(_skip(item, "no_switch"))
            elif i["available"] == wanted:
                result.skipped.append(_skip(item, "already"))
            else:
                result.changes.append(
                    _change(item, {"available": i["available"]}, {"available": wanted})
                )
        elif action == "price_percent":
            percent = clean["percent"]
            if i["price"] <= 0:
                result.skipped.append(_skip(item, "no_price"))
                continue
            price = _scaled(i["price"], percent)
            sale = _scaled(i["sale_price"], percent) if i["sale_price"] is not None else None
            if not 0 < price <= MAX_PRICE:
                result.skipped.append(_skip(item, "bad_price"))
            elif price == i["price"]:
                result.skipped.append(_skip(item, "no_change"))
            elif sale is not None and not 0 < sale < price:
                result.skipped.append(_skip(item, "bad_sale"))
            elif any(
                min(price, sale or price) + v["price_delta"] <= 0 for v in entry.active_variants
            ):
                result.skipped.append(_skip(item, "bad_price"))
            else:
                before = {"price": i["price"], "sale_price": i["sale_price"]}
                after = {"price": price, "sale_price": sale}
                moved = _change(item, before, after)
                moved["before_text"], moved["after_text"] = fmt_qar(i["price"]), fmt_qar(price)
                result.changes.append(moved)
        elif action == "move_category":
            if i["category"] == clean["category"]:
                result.skipped.append(_skip(item, "already"))
            else:
                result.changes.append(
                    _change(item, {"category": i["category"]}, {"category": clean["category"]})
                )
        else:  # archive
            if i["status"] == "archived":
                result.skipped.append(_skip(item, "already"))
            else:
                result.changes.append(
                    _change(item, {"status": i["status"]}, {"status": "archived"})
                )
    found = {e.item["id"] for e in entries}
    for missing in ids:
        if missing not in found:
            result.skipped.append(
                {"id": str(missing), "name": "", "name_ar": "", "code": "gone",
                 "message": SKIPS["gone"][0], "message_ar": SKIPS["gone"][1]}
            )
    return result


async def _write(
    conn: asyncpg.Connection, clock: ShopClock, actor: Actor, action: str, item_id: UUID,
    values: dict, reason: str,
) -> None:
    """Make one item have `values` (the fields the action touches), as an edit would."""
    if action in AVAILABILITY or "available" in values:
        await service.set_available(conn, item_id, values["available"], actor)
        return
    changes = {k: v for k, v in values.items() if not (k == "sale_price" and v is None)}
    await service.update_item(conn, item_id, changes, actor, clock, reason=reason)


async def apply(
    conn: asyncpg.Connection, clock: ShopClock, actor: Actor, action: str,
    item_ids: list[UUID], params: dict, expected: str,
) -> dict:
    """Carry out a plan the owner has seen. `expected` is that plan's hash."""
    work = await plan(conn, clock, action, item_ids, params)
    if work.hash != expected:
        raise BulkError(
            "changed_since_preview",
            "Some items changed since you looked. Review the preview again.",
            "تغيّرت بعض الأصناف منذ المعاينة. راجع المعاينة مرة أخرى.", 409,
        )
    reason = f"Bulk change {work.params['percent']:+d}%" if action == "price_percent" else ""
    done, failed = [], []
    for change in work.changes:
        try:
            async with conn.transaction():  # a savepoint: one failure leaves the others alone
                await _write(
                    conn, clock, actor, action, UUID(change["id"]), change["after"], reason
                )
        except (service.ItemError, LookupError):
            failed.append(_skip(change, "failed"))
        else:
            done.append(change)
    bulk_id = None
    if done:
        bulk_id = await conn.fetchval(
            "insert into item_bulk_changes (action, params, changes, skipped, actor_id, "
            "actor_name) values ($1, $2, $3, $4, $5, $6) returning id",
            action, work.params, done, len(work.skipped) + len(failed), actor.id, actor.name,
        )
    return {
        "id": str(bulk_id) if bulk_id else None, "action": action, "params": work.params,
        "changed": len(done), "skipped": work.skipped + failed,
    }


def _summary(row: asyncpg.Record) -> dict:
    return {
        "id": str(row["id"]), "action": row["action"], "params": row["params"],
        "changed": len(row["changes"]), "skipped": row["skipped"],
        "by": {"id": str(row["actor_id"]) if row["actor_id"] else None, "name": row["actor_name"]},
        "at": row["created_at"].isoformat(),
    }


async def last(conn: asyncpg.Connection) -> dict | None:
    """The newest bulk action if it can still be undone, else None."""
    row = await conn.fetchrow(
        "select * from item_bulk_changes order by created_at desc, id desc limit 1"
    )
    if row is None or row["undone_at"] is not None:
        return None
    return _summary(row)


_NOW = "select id, available, price, sale_price, category, status from items where id = $1"


async def undo(
    conn: asyncpg.Connection, clock: ShopClock, actor: Actor, allow: tuple[str, ...] = ACTIONS
) -> dict:
    """Put the newest bulk action back. Raises `BulkError` when there is nothing to undo, or
    when `allow` does not include this action (an agent may undo only a sold-out change)."""
    row = await conn.fetchrow(
        "select * from item_bulk_changes order by created_at desc, id desc limit 1 for update"
    )
    if row is None or row["undone_at"] is not None:
        raise BulkError(
            "nothing_to_undo", "There is no bulk change to undo.",
            "لا يوجد تغيير جماعي للتراجع عنه.", 404,
        )
    if row["action"] not in allow:
        raise BulkError(
            "not_allowed", "Only the owner or an admin can undo this change.",
            "التراجع عن هذا التغيير للمالك أو المدير فقط.", 403,
        )
    restored, left = [], []
    for change in row["changes"]:
        item = {"id": change["id"], "name": change["name"], "name_ar": change["name_ar"]}
        now = await conn.fetchrow(_NOW, UUID(item["id"]))
        if now is None:
            left.append(_skip(item, "gone"))
            continue
        if any(now[field_] != value for field_, value in change["after"].items()):
            left.append(_skip(item, "changed_since"))
            continue
        try:
            async with conn.transaction():
                await _write(
                    conn, clock, actor, row["action"], UUID(item["id"]), change["before"],
                    "Undo of a bulk change",
                )
        except (service.ItemError, LookupError):
            left.append(_skip(item, "failed"))
        else:
            restored.append(item["id"])
    await conn.execute(
        "update item_bulk_changes set undone_at = now(), undone_by = $2 where id = $1",
        row["id"], actor.name,
    )
    return {"action": row["action"], "restored": len(restored), "left": left}
