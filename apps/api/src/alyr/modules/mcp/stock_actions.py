"""The connector's stock actions (ALY-291, spec 067): sold out, back in stock, set the count, and
undo, for an owner's own app.

**None of the stock logic is new.** An item is found by the Catalog's own matching (`match.find`,
the same as a staff member's WhatsApp message, and `items.code` for a code), the switch is
`service.set_available`, a count is `service.record_stock`, and the stock log, the activity record
and the order page all read what those write. The rules are those of the workspace and the WhatsApp
commands: an item that is not on sale, or always available, has no sold-out switch; a size that is
counted needs a number; a count of the shelf needs no reason when it agrees and needs one when it
does not, so here it is always "Set through a connected app".

Each change is **small and reversible**: it is remembered in `mcp_stock_changes` (migration 0131)
and `mcp.undo_stock_change` puts it back, but only while the thing has not been changed again.

Every action here is what runs on the *second* call of a changing tool, after the owner said yes to
the preview. The previews in `tools/stock.py` use the same `plan_*` functions, so what the owner
agreed to is what is done: the plan is made again at the moment of the change, and if the catalog
has moved since the preview (another item now fits the name, the item went off sale) the change is
refused rather than made on a guess.
"""

from dataclasses import dataclass
from datetime import date
from uuid import UUID

import asyncpg

from alyr import catalog
from alyr.core import team
from alyr.core.actions import ALL_ROLES, ActionError, Caller, register
from alyr.core.team import Actor
from alyr.modules.items import availability, match, qty, service, stock
from alyr.modules.items import clock as shop_clock
from alyr.modules.items.wa_text import shown
from alyr.modules.mcp import safety

MODULE = "catalog"
VIA = "mcp"
REASON = "Set through a connected app"
MAX_OPTIONS = 5
STOCKED = availability.STOCKED
UNDO_NOTE = (
    "undo_stock_change puts it back, as long as it has not been changed again since."
)


def actor_of(caller: Caller) -> Actor:
    """The person, and the door, as the stock log and the item's history write them."""
    return Actor(caller.user_id, caller.name, via=VIA)


def _name(item: dict, variant: dict | None = None) -> str:
    text = safety.clean(shown(item, "en"))
    if variant is not None and (variant["name"] or variant["name_ar"]):
        text += f" - {safety.clean(shown(variant, 'en'))}"
    return text


def _with_code(item: dict, variant: dict | None = None) -> str:
    code = f" (code {item['code']})" if item["code"] else ""
    return _name(item, variant) + code


# ── finding the item ──────────────────────────────────────────────────────────────────────


async def find(
    conn: asyncpg.Connection, clock: shop_clock.ShopClock, text: str, with_variants: bool = True
) -> tuple[match.Target, service.Loaded]:
    """The one item (or size or colour) a name or a code points at. When two fit, or none does,
    an `ActionError` says so, with the choices, and nothing is changed."""
    wanted = safety.clean(text).lstrip("#").strip()
    if wanted.isdigit():
        entries = await service.load(
            conn, clock, "i.code = $1 and i.status <> 'archived' and not i.is_sample",
            (int(wanted),),
        )
        if entries:
            return match.Target(entries[0].item), entries[0]
    words = match.tokens(wanted)
    if not words:
        raise ActionError("Say which item: its name, or its code.")
    entries = await service.load(conn, clock, "i.status <> 'archived' and not i.is_sample")
    found = match.find(words, entries, with_variants=with_variants)
    if found.one is None and not found.many:
        raise ActionError(
            f"No item fits '{wanted[:60]}'. Check the name, or use the item's code "
            "(low_stock lists names and codes)."
        )
    if found.one is None:
        options = [
            _with_code(t.item, t.variant) for t in found.many[:MAX_OPTIONS]
        ]
        more = len(found.many) - len(options) + (1 if found.more else 0)
        extra = f" and {more} more" if more > 0 else ""
        raise ActionError(
            f"'{wanted[:60]}' fits more than one item. Did you mean: " + "; ".join(options)
            + f"{extra}? Ask again with the code, or more of the name. Nothing was changed."
        )
    entry = next(e for e in entries if e.item["id"] == found.one.item["id"])
    return found.one, entry


# ── plans: what would be done, from the catalog as it is now ──────────────────────────────


@dataclass
class Plan:
    verb: str  # sold_out | back | stock
    entry: service.Loaded
    variant: dict | None
    clock: shop_clock.ShopClock
    what: str
    count: object = None  # the number a count sets, as a quantity
    before: object = None  # what it was
    increases: bool = False  # may it bring something back to sale (customers may be told)
    low_alert: bool = False  # may it raise the catalog's own alert to the managers

    @property
    def item(self) -> dict:
        return self.entry.item

    @property
    def label(self) -> str:
        return _name(self.item, self.variant)


async def waiting(conn: asyncpg.Connection, item_id: UUID) -> int:
    """How many customers asked to be told when this item is back (and agreed to it)."""
    return await conn.fetchval(
        "select count(*) from stock_watches where item_id = $1 and status = 'waiting' "
        "and expires_at > now()", item_id,
    )


def _live_with_switch(item: dict, label: str) -> None:
    if item["status"] != "live":
        raise ActionError(
            f"{label} is not on sale (it is {item['status']}), so it has no sold-out switch."
        )
    if item["stock_rule"] == "always":
        raise ActionError(
            f"{label} is always available: it has no sold-out switch. Its rule for running out "
            "can be changed in the catalog."
        )


async def plan_sold_out(conn: asyncpg.Connection, args: dict) -> Plan:
    clock = await shop_clock.load(conn)
    target, entry = await find(conn, clock, args["item"])
    item, variant = entry.item, target.variant
    label = _name(item, variant)
    _live_with_switch(item, label)
    if variant is not None and item["stock_rule"] in STOCKED:
        left = availability.variant_left(item, variant, entry.deltas, clock.shop_day)
        if not left:
            raise ActionError(f"{label} is already sold out. Nothing to change.")
        return Plan("sold_out", entry, variant, clock, (
            f"Set the count of {label} to 0 (it is {qty.fmt(left)} now), so customers cannot "
            "order that choice."), count=0, before=left, low_alert=True)
    if not item["available"]:
        raise ActionError(f"{label} is already sold out. Nothing to change.")
    return Plan("sold_out", entry, None, clock, (
        f"Switch {label} off, so customers cannot order it until it is switched back on."))


async def plan_back(conn: asyncpg.Connection, args: dict) -> Plan:
    clock = await shop_clock.load(conn)
    target, entry = await find(conn, clock, args["item"])
    item, variant = entry.item, target.variant
    label = _name(item, variant)
    _live_with_switch(item, label)
    if variant is not None and item["stock_rule"] in STOCKED:
        raise ActionError(
            f"{label} is counted, so bringing it back means saying how many there are. "
            "Use set_stock with the number."
        )
    if item["available"]:
        raise ActionError(f"{label} is already on sale. Nothing to change.")
    empty = item["stock_rule"] in STOCKED and entry.state(clock).left == 0
    note = (
        " None is counted in stock, so customers still cannot order it: use set_stock to add "
        "stock." if empty else " Customers can order it again."
    )
    return Plan("back", entry, None, clock, f"Switch {label} back on.{note}", increases=not empty)


def _count_of(args: dict):
    try:
        return qty.parse(args["count"], allow_zero=True)
    except qty.QtyError as error:
        raise ActionError(f"The count is not usable: {error}") from error


async def plan_set_stock(conn: asyncpg.Connection, args: dict) -> Plan:
    clock = await shop_clock.load(conn)
    target, entry = await find(conn, clock, args["item"])
    item, variant = entry.item, target.variant
    label = _name(item)
    if item["stock_rule"] not in STOCKED:
        raise ActionError(
            f"{label} is not counted, so it has no stock number. Its rule for running out can "
            "be changed in the catalog."
        )
    count = _count_of(args)
    if count != int(count) and not qty.is_measure(item["unit"]):
        raise ActionError(f"{label} is counted in whole numbers.")
    if variant is None:
        active = [v for v in entry.variants if v["active"]]
        if len(active) > 1:
            names = "; ".join(_name(item, v) for v in active[:MAX_OPTIONS])
            raise ActionError(
                f"{label} has several sizes or colours: {names}. Say which, like "
                f"'{_name(item, active[0])}'. Nothing was changed."
            )
        variant = active[0]
    label = _name(item, variant)
    before = availability.variant_left(item, variant, entry.deltas, clock.shop_day)
    unit = qty.shown(item["unit"], item["pack_size"], item["min_order"])
    if before is not None and qty.norm(count) == qty.norm(before):
        raise ActionError(f"{label} already has {qty.label(count, item['unit'], unit)}. "
                          "Nothing to change.")
    now = qty.label(before, item["unit"], unit) if before is not None else "unknown"
    return Plan(
        "stock", entry, variant, clock,
        f"Set the stock of {label} to {qty.label(count, item['unit'], unit)} (it is {now} now).",
        count=count, before=before,
        increases=before is not None and count > before,
        low_alert=before is not None and count < before,
    )


# ── doing it ──────────────────────────────────────────────────────────────────────────────


def _day_of(plan: Plan) -> date | None:
    return plan.clock.shop_day if plan.item["stock_rule"] == "daily_limit" else None


async def _remember(
    conn: asyncpg.Connection, caller: Caller, item_id: UUID, action: str, before: dict,
    after: dict,
) -> UUID:
    return await conn.fetchval(
        "insert into mcp_stock_changes (user_id, user_name, item_id, action, before, after) "
        "values ($1, $2, $3, $4, $5, $6) returning id",
        caller.user_id, caller.name, item_id, action, before, after,
    )


async def _count(conn: asyncpg.Connection, caller: Caller, plan: Plan) -> dict:
    """Set one size's count through the Catalog's own call and say what happened."""
    try:
        result = await service.record_stock(
            conn, plan.clock, plan.item["id"], "counted", plan.count, REASON, actor_of(caller),
            plan.variant["id"],
        )
    except (service.ItemError, stock.StockError, LookupError) as error:
        raise ActionError(str(error)) from error
    await team.record(
        conn, "item", plan.item["id"], "stock_counted", actor_of(caller), None,
        {"count": qty.fmt(result["counted"]), "was": qty.fmt(result["before"]),
         "size": plan.variant["name"] or None}, channel=caller.channel,
    )
    return result


async def _answer(
    conn: asyncpg.Connection, plan: Plan, change: UUID, says: str
) -> dict:
    """What was done, and how the item reads now: read again from the catalog, not assumed."""
    entry = await service.get(conn, plan.clock, plan.item["id"])
    state = entry.state(plan.clock)
    return {
        "changed": True,
        "what_happened": says,
        "item": {
            "name": safety.clean(entry.item["name"]),
            "name_ar": safety.clean(entry.item["name_ar"]), "code": entry.item["code"],
        },
        "customers_can_order_it_now": state.orderable,
        "why_not": state.reason or None,
        "left_in_stock": state.left,
        "undo": {"tool": "undo_stock_change", "change_id": str(change)},
    }


@register("mcp.mark_sold_out", ALL_ROLES, MODULE)
async def mark_sold_out(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    plan = await plan_sold_out(conn, args)
    item = plan.item
    if plan.variant is not None:
        plan.count = 0
        result = await _count(conn, caller, plan)
        before = {"variant_id": str(plan.variant["id"]), "counted": qty.fmt(result["before"])}
        after = {
            "variant_id": str(plan.variant["id"]), "delta": qty.fmt(result["difference"]),
            "day": _day_of(plan).isoformat() if _day_of(plan) else None,
        }
    else:
        try:
            await service.set_available(conn, item["id"], False, actor_of(caller), caller.channel)
        except service.ItemError as error:
            raise ActionError(str(error)) from error
        before, after = {"available": True}, {"available": False}
    change = await _remember(conn, caller, item["id"], "sold_out", before, after)
    return await _answer(conn, plan, change, f"{plan.label} is now sold out.")


@register("mcp.mark_back_in_stock", ALL_ROLES, MODULE)
async def mark_back_in_stock(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    plan = await plan_back(conn, args)
    try:
        await service.set_available(conn, plan.item["id"], True, actor_of(caller), caller.channel)
    except service.ItemError as error:
        raise ActionError(str(error)) from error
    change = await _remember(
        conn, caller, plan.item["id"], "back", {"available": False}, {"available": True}
    )
    return await _answer(conn, plan, change, f"{plan.label} is switched back on.")


@register("mcp.set_stock", ALL_ROLES, MODULE)
async def set_stock(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    plan = await plan_set_stock(conn, args)
    result = await _count(conn, caller, plan)
    change = await _remember(
        conn, caller, plan.item["id"], "stock",
        {"variant_id": str(plan.variant["id"]), "counted": qty.fmt(result["before"])},
        {"variant_id": str(plan.variant["id"]), "delta": qty.fmt(result["difference"]),
         "counted": qty.fmt(result["counted"]),
         "day": _day_of(plan).isoformat() if _day_of(plan) else None},
    )
    return await _answer(
        conn, plan, change,
        f"The stock of {plan.label} is now {qty.fmt(result['counted'])} "
        f"(it was {qty.fmt(result['before'])}).",
    )


# ── undo ──────────────────────────────────────────────────────────────────────────────────


@dataclass
class UndoPlan:
    row: asyncpg.Record
    entry: service.Loaded
    clock: shop_clock.ShopClock
    what: str


async def plan_undo(conn: asyncpg.Connection, caller: Caller, args: dict) -> UndoPlan:
    try:
        wanted = UUID(str(args["change_id"]))
    except ValueError:
        raise ActionError("That is not a change number from an earlier answer.") from None
    row = await conn.fetchrow(
        "select * from mcp_stock_changes where id = $1 for update", wanted
    )
    if row is None:
        raise ActionError("There is no such change in this business.")
    if row["user_id"] != caller.user_id and caller.role not in catalog.MANAGERS:
        raise ActionError("Only the person who made a change, or an owner or admin, can undo it.")
    if row["undone_at"] is not None:
        raise ActionError("That change was already undone.")
    clock = await shop_clock.load(conn)
    entry = await service.get(conn, clock, row["item_id"])
    if entry is None:
        raise ActionError("That item no longer exists, so the change cannot be undone.")
    item, before, after = entry.item, row["before"], row["after"]
    label = _name(item)
    if "available" in after:
        if item["available"] != after["available"]:
            raise ActionError(
                f"{label} was changed again after that, so it was left as it is. "
                "Nothing was changed."
            )
        what = (f"Switch {label} back on, as it was before." if before["available"]
                else f"Switch {label} off again, as it was before.")
        return UndoPlan(row, entry, clock, what)
    variant = next((v for v in entry.variants if str(v["id"]) == after["variant_id"]), None)
    if variant is None:
        raise ActionError("That size or colour no longer exists, so it cannot be undone.")
    delta = qty.parse(after["delta"], allow_zero=True, allow_negative=True)
    day = date.fromisoformat(after["day"]) if after.get("day") else None
    have = availability.variant_left(item, variant, entry.deltas, day or clock.shop_day)
    sized = _name(item, variant)
    unit = qty.shown(item["unit"], item["pack_size"], item["min_order"])
    if have is not None and have + (-delta) < 0:
        raise ActionError(
            f"Only {qty.label(have, item['unit'], unit)} of {sized} is left, so that count "
            "cannot be taken back."
        )
    return UndoPlan(row, entry, clock, (
        f"Take back the change to the count of {sized}: put it back "
        f"{'up' if delta < 0 else 'down'} by {qty.label(abs(delta), item['unit'], unit)}."))


@register("mcp.undo_stock_change", ALL_ROLES, MODULE)
async def undo_stock_change(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    plan = await plan_undo(conn, caller, args)
    item, row = plan.entry.item, plan.row
    before, after = row["before"], row["after"]
    actor = actor_of(caller)
    try:
        if "available" in after:
            await service.set_available(
                conn, item["id"], before["available"], actor, caller.channel
            )
        else:
            variant_id = UUID(after["variant_id"])
            day = date.fromisoformat(after["day"]) if after.get("day") else None
            delta = qty.parse(after["delta"], allow_zero=True, allow_negative=True)
            balance = await stock.move(
                conn, variant_id, "adjusted", -delta, actor,
                "Undo of a change made through a connected app", day,
            )
            if balance is None:
                raise ActionError("There is not enough left to take that count back.")
            await team.record(
                conn, "item", item["id"], "stock_undone", actor, None,
                {"change": str(row["id"])}, channel=caller.channel,
            )
    except (service.ItemError, stock.StockError) as error:
        raise ActionError(str(error)) from error
    await conn.execute(
        "update mcp_stock_changes set undone_at = now(), undone_by = $2 where id = $1",
        row["id"], caller.name,
    )
    entry = await service.get(conn, plan.clock, item["id"])
    state = entry.state(plan.clock)
    return {
        "changed": True,
        "what_happened": "The change was undone.",
        "item": {"name": safety.clean(item["name"]), "name_ar": safety.clean(item["name_ar"]),
                 "code": item["code"]},
        "customers_can_order_it_now": state.orderable,
        "why_not": state.reason or None,
        "left_in_stock": state.left,
    }
