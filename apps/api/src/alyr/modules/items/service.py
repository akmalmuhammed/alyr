"""The shop's items: what it sells, how each is priced, and whether it can be ordered.

An item has English and Arabic names, a price (with a sale price and a history of every
price), a unit, tags, and a status: draft, live, hidden or archived. It has one or more
variants (a size, a colour), each with its own stock and price difference, and for
restaurants option groups (a required choice, priced extras). An availability rule says how
it can run out (always, a switch, a count, a daily limit), and a schedule says when it can
be ordered. An item that has been ordered is archived, never deleted.

Every function takes a tenant-scoped connection.
"""

from dataclasses import dataclass, field
from datetime import date, time
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.normalise import fmt_qar
from alyr.core.team import Actor
from alyr.modules.items import availability, events, stock
from alyr.modules.items.clock import ShopClock

UNITS = ("piece", "kg", "box", "pack", "portion", "hour")
STATUSES = ("draft", "live", "hidden", "archived")
# What the item form may set directly. The rest is derived or has its own call.
FIELDS = (
    "name", "name_ar", "description", "description_ar", "category", "price", "sale_price",
    "sale_starts_at", "sale_ends_at", "unit", "pack_size", "min_order", "tags", "stock_rule",
    "available", "status", "sort", "sku", "low_stock_at",
)
MAX_QUANTITY = 999
MAX_SKU = 40


class ItemError(Exception):
    """A change to the catalog that cannot be made. `code` is stable; the message is safe
    to show."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class Loaded:
    """An item with everything that belongs to it, as read from the database."""

    item: dict
    variants: list[dict] = field(default_factory=list)
    groups: list[dict] = field(default_factory=list)
    schedule: list[dict] = field(default_factory=list)
    deltas: dict = field(default_factory=dict)
    # What each price group pays: {(group_id, variant_id or None): price}.
    group_prices: dict = field(default_factory=dict)

    @property
    def windows(self):
        return availability.windows_of(self.schedule)

    @property
    def active_variants(self) -> list[dict]:
        return [v for v in self.variants if v["active"]]

    def state(self, clock: ShopClock, for_date: date | None = None) -> availability.State:
        return availability.evaluate(
            self.item, self.variants, self.windows, self.deltas, clock, for_date
        )


# ---------------------------------------------------------------------- reading

async def count_active(conn: asyncpg.Connection) -> int:
    """How many items the shop has that are not archived: the number the photo meters and
    the shop's item cap read (core/media.py, ALY-103)."""
    return await conn.fetchval("select count(*) from items where status <> 'archived'")


async def load(
    conn: asyncpg.Connection, clock: ShopClock, where: str = "true", args: tuple = ()
) -> list[Loaded]:
    """Items matching `where` (SQL on the alias `i`), in menu order, with their variants,
    options, schedule and the daily-limit totals the rules need."""
    rows = await conn.fetch(
        "select i.*, exists (select 1 from order_items o where o.item_id = i.id) as has_orders "
        f"from items i where {where} order by i.category, i.sort, i.name, i.created_at",
        *args,
    )
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    loaded = {r["id"]: Loaded(dict(r)) for r in rows}
    variants = await conn.fetch(
        "select * from item_variants where item_id = any($1) order by sort, created_at, name", ids
    )
    for v in variants:
        loaded[v["item_id"]].variants.append(dict(v))
    options = await conn.fetch(
        "select o.* from item_options o join item_option_groups g on g.id = o.group_id "
        "where g.item_id = any($1) order by o.sort, o.name",
        ids,
    )
    by_group: dict[UUID, list[dict]] = {}
    for o in options:
        by_group.setdefault(o["group_id"], []).append(dict(o))
    for g in await conn.fetch(
        "select * from item_option_groups where item_id = any($1) order by sort, name", ids
    ):
        loaded[g["item_id"]].groups.append({**dict(g), "options": by_group.get(g["id"], [])})
    for s in await conn.fetch(
        "select * from item_schedules where item_id = any($1) "
        "order by valid_from nulls first, opens nulls first",
        ids,
    ):
        loaded[s["item_id"]].schedule.append(dict(s))
    deltas = {
        (d["variant_id"], d["day"]): d["delta"]
        for d in await conn.fetch(
            "select variant_id, day, delta from variant_day_stock "
            "where variant_id = any($1) and day >= $2",
            [v["id"] for v in variants], clock.shop_day,
        )
    }
    for entry in loaded.values():
        entry.deltas = deltas
    for p in await conn.fetch(
        "select p.item_id, p.group_id, p.variant_id, p.price from item_group_prices p "
        "join price_groups g on g.id = p.group_id and g.archived_at is null "
        "where p.item_id = any($1)",
        ids,
    ):
        loaded[p["item_id"]].group_prices[(p["group_id"], p["variant_id"])] = p["price"]
    return [loaded[r["id"]] for r in rows]


async def get(conn: asyncpg.Connection, clock: ShopClock, item_id: UUID) -> Loaded | None:
    found = await load(conn, clock, "i.id = $1", (item_id,))
    return found[0] if found else None


def _iso(value) -> str | None:
    return value.isoformat() if value is not None else None


def _money(value: int | None) -> str | None:
    return fmt_qar(value) if value is not None else None


def _variant_view(item: dict, v: dict, state: availability.State, deltas: dict) -> dict:
    return {
        "id": str(v["id"]), "name": v["name"], "name_ar": v["name_ar"], "sku": v["sku"],
        "is_default": v["is_default"], "active": v["active"],
        "price_delta": v["price_delta"], "daily_limit": v["daily_limit"],
        "on_hand": v["on_hand"],
        "left": availability.variant_left(item, v, deltas, state.day),
        "photo_id": str(v["photo_id"]) if v["photo_id"] else None,
    }


def view(entry: Loaded, clock: ShopClock) -> dict:
    """An item as the workspace sees it: everything, in plain types."""
    i = entry.item
    state = entry.state(clock)
    sale_on = availability.sale_active(i, clock.now)
    return {
        "id": str(i["id"]), "name": i["name"], "name_ar": i["name_ar"], "sku": i["sku"],
        "description": i["description"], "description_ar": i["description_ar"],
        "category": i["category"], "status": i["status"], "stock_rule": i["stock_rule"],
        "available": i["available"], "unit": i["unit"], "pack_size": i["pack_size"],
        "min_order": i["min_order"], "tags": list(i["tags"]), "sort": i["sort"],
        "low_stock_at": i["low_stock_at"],
        "price": i["price"], "price_text": fmt_qar(i["price"]),
        "sale_price": i["sale_price"], "sale_price_text": _money(i["sale_price"]),
        "sale_starts_at": _iso(i["sale_starts_at"]), "sale_ends_at": _iso(i["sale_ends_at"]),
        "sale_active": sale_on,
        "current_price": availability.item_price(i, clock.now),
        "current_price_text": fmt_qar(availability.item_price(i, clock.now)),
        "photo_id": str(i["photo_id"]) if i["photo_id"] else None,
        "has_orders": i["has_orders"], "updated_at": _iso(i["updated_at"]),
        "variants": [_variant_view(i, v, state, entry.deltas) for v in entry.variants],
        # What each group pays instead of the normal price: [{group_id, variant_id, price}].
        "group_prices": [
            {"group_id": str(g), "variant_id": str(v) if v else None, "price": price,
             "price_text": fmt_qar(price)}
            for (g, v), price in sorted(
                entry.group_prices.items(), key=lambda kv: (str(kv[0][0]), str(kv[0][1] or ""))
            )
        ],
        "option_groups": [
            {
                "id": str(g["id"]), "name": g["name"], "name_ar": g["name_ar"],
                "required": g["required"], "max_choices": g["max_choices"],
                "options": [
                    {"id": str(o["id"]), "name": o["name"], "name_ar": o["name_ar"],
                     "price_delta": o["price_delta"], "active": o["active"]}
                    for o in g["options"]
                ],
            }
            for g in entry.groups
        ],
        "schedule": [
            {
                "weekdays": sorted(s["weekdays"]), "opens": _iso(s["opens"]),
                "closes": _iso(s["closes"]), "lead_days": s["lead_days"],
                "cutoff": _iso(s["cutoff"]), "valid_from": _iso(s["valid_from"]),
                "valid_to": _iso(s["valid_to"]), "closed": s["closed"],
            }
            for s in entry.schedule
        ],
        "availability": {
            "orderable": state.orderable, "reason": state.reason, "left": state.left,
            "next_at": _iso(state.next_at), "next_date": _iso(state.next_date),
        },
    }


# The list the workspace shows (search, filters, counts, pages) is `listing.page`.

# ---------------------------------------------------------------------- writing

def _clean_tags(tags) -> list[str]:
    seen, out = set(), []
    for tag in tags or []:
        tag = " ".join(str(tag).split())
        if tag and tag.lower() not in seen:
            seen.add(tag.lower())
            out.append(tag)
    return out


def _check_fields(values: dict, variants: list[dict]) -> None:
    """The rules every item obeys, on the values it would have after the change. A draft (a
    photo waiting to be described) and an archived item may still lack a name or a price;
    anything else needs both."""
    unfinished = values["status"] in ("draft", "archived")
    if not values["name"].strip() and not unfinished:
        raise ItemError("name_needed", "Give the item a name.")
    if values["price"] < 0 or (values["price"] == 0 and not unfinished):
        raise ItemError("bad_price", "The price must be more than zero.")
    if values["stock_rule"] not in availability.RULES:
        raise ItemError("bad_rule", "Choose how this item runs out.")
    if values["unit"] not in UNITS:
        raise ItemError("bad_unit", "Choose a unit from the list.")
    if values["status"] not in STATUSES:
        raise ItemError("bad_status", "Choose draft, live, hidden or archived.")
    if values["min_order"] < 1 or values["min_order"] > MAX_QUANTITY:
        raise ItemError("bad_minimum", "The minimum order must be between 1 and 999.")
    low = values["low_stock_at"]
    if low is not None and not 0 <= low <= 100_000:
        raise ItemError("bad_low_stock", "Choose a low-stock number between 0 and 100,000.")
    sale, starts, ends = values["sale_price"], values["sale_starts_at"], values["sale_ends_at"]
    if sale is not None and not 0 < sale < values["price"]:
        raise ItemError("bad_sale", "The sale price must be below the usual price.")
    if sale is None and (starts or ends):
        raise ItemError("bad_sale", "Give the sale a price, or clear its dates.")
    if starts and ends and ends <= starts:
        raise ItemError("bad_sale", "The sale must end after it starts.")
    lowest = min(values["price"], sale if sale is not None else values["price"])
    for v in variants:
        if v["active"] and values["price"] > 0 and lowest + v["price_delta"] <= 0:
            raise ItemError("bad_price", "A price difference cannot bring a price to zero.")
        if v["active"] and values["stock_rule"] == "daily_limit" and v["daily_limit"] is None:
            raise ItemError("limit_needed", "Set how many can be sold each day.")
    if values["status"] == "live" and not any(v["active"] for v in variants):
        raise ItemError("variant_needed", "An item needs at least one choice that can be sold.")


def clean_sku(value) -> str:
    """A SKU as it is stored: one line, no spaces at the ends, up to 40 characters. Blank
    means the item has none."""
    sku = " ".join(str(value or "").split())
    if len(sku) > MAX_SKU:
        raise ItemError("bad_sku", f"A SKU can be up to {MAX_SKU} characters.")
    return sku


async def _check_skus(
    conn: asyncpg.Connection, item_id: UUID | None, item_sku: str,
    variants: list[tuple[str, str]],
) -> None:
    """A SKU is used once in a shop, across items and their sizes and colours. The two
    tables each have a unique index (case does not matter); this is the check across them,
    and it names what already uses the code. `variants` is (sku, name) for every size or
    colour the item will have, including those switched off, which keep their code. It
    runs under a lock per shop, so two saves at once cannot both take a code."""
    codes = [(item_sku, "")] + variants
    wanted = [(sku, name) for sku, name in codes if sku]
    if not wanted:
        return
    lowered = [sku.lower() for sku, _ in wanted]
    if len(set(lowered)) != len(lowered):
        raise ItemError("sku_repeated", "The same SKU is on two choices of this item.")
    await conn.execute(
        "select pg_advisory_xact_lock(hashtext('sku:' || current_setting('app.tenant_id', true)))"
    )
    rows = await conn.fetch(
        "select i.name, '' as variant, lower(i.sku) as sku from items i "
        "where lower(i.sku) = any($1) and ($2::uuid is null or i.id <> $2) "
        "union all select i.name, v.name, lower(v.sku) from item_variants v "
        "join items i on i.id = v.item_id "
        "where lower(v.sku) = any($1) and ($2::uuid is null or v.item_id <> $2)",
        lowered, item_id,
    )
    if rows:
        used = rows[0]
        who = f"{used['name']} ({used['variant']})" if used["variant"] else used["name"]
        shown = next(sku for sku, _ in wanted if sku.lower() == used["sku"])
        raise ItemError("sku_taken", f"The SKU “{shown}” is already used by {who}.")


async def _duplicates(
    conn: asyncpg.Connection, name: str, name_ar: str, skip: UUID | None = None
) -> list[dict]:
    rows = await conn.fetch(
        "select id, name, name_ar, status from items "
        "where status <> 'archived' and ($1::uuid is null or id <> $1) "
        "and ((btrim($2) <> '' and lower(btrim(name)) = lower(btrim($2))) "
        "     or (btrim($3) <> '' and btrim(name_ar) = btrim($3)))",
        skip, name, name_ar,
    )
    return [
        {"code": "duplicate_name", "item_id": str(r["id"]), "name": r["name"],
         "name_ar": r["name_ar"],
         "message": f"Another item is already called “{r['name']}”. Give them different "
                    "variants if they are one product, or different names."}
        for r in rows
    ]


async def create_item(
    conn: asyncpg.Connection, data: dict, actor: Actor, clock: ShopClock,
    require_arabic: bool = True,
) -> dict:
    """Add an item. `data` holds the fields of FIELDS and, if wanted, `variants`,
    `option_groups`, `schedule`, and for an item without variants `opening_stock` and
    `daily_limit`. Returns the item and any warnings (a name already in use)."""
    values = {
        "name": "", "name_ar": "", "description": "", "description_ar": "", "category": "",
        "price": 0, "sale_price": None, "sale_starts_at": None, "sale_ends_at": None,
        "unit": "piece", "pack_size": None, "min_order": 1, "tags": [],
        "stock_rule": "switch", "available": True, "status": "draft", "sort": 0, "sku": "",
        "low_stock_at": None,
        **{k: data[k] for k in FIELDS if k in data},
    }
    values["name"] = values["name"].strip()
    values["name_ar"] = values["name_ar"].strip()
    values["tags"] = _clean_tags(values["tags"])
    values["sku"] = clean_sku(values["sku"])
    planned = _plan_variants(data.get("variants"), data)
    _check_fields(values, planned)
    if values["status"] == "live" and require_arabic and not values["name_ar"]:
        raise ItemError("arabic_needed", "Add the Arabic name before the item goes live.")
    opening = [data.get("opening_stock")]
    opening += [v.get("opening_stock") for v in data.get("variants") or []]
    if any(opening) and values["stock_rule"] != "count":
        raise ItemError("bad_kind", "An opening count is for items counted in stock.")
    warnings = await _duplicates(conn, values["name"], values["name_ar"])
    await _check_skus(
        conn, None, values["sku"],
        [(clean_sku(v.get("sku")), v.get("name", "")) for v in data.get("variants") or []],
    )
    try:
        item_id = await conn.fetchval(
            "insert into items (name, name_ar, description, description_ar, category, price, "
            "sale_price, sale_starts_at, sale_ends_at, unit, pack_size, min_order, tags, "
            "stock_rule, available, status, sort, sku, low_stock_at) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, "
            "$17, $18, $19) returning id",
            *(values[k] for k in FIELDS),
        )
    except asyncpg.UniqueViolationError as error:  # the index under the check above
        raise ItemError("sku_taken", f"The SKU “{values['sku']}” is already in use.") from error
    await _sync_variants(conn, item_id, data.get("variants"), data, actor, clock, creating=True)
    if data.get("group_prices"):
        # (imported here: groups.py builds on this module)
        from alyr.modules.items import groups

        await groups.save_prices(conn, item_id, data["group_prices"], actor, "First price")
    if data.get("option_groups"):
        await _sync_groups(conn, item_id, data["option_groups"])
    if data.get("schedule"):
        await _sync_schedule(conn, item_id, data["schedule"])
    if values["price"] > 0:  # a draft made from a photo has no price to remember yet
        await _price_row(conn, item_id, values, actor, "First price")
    await team.record(
        conn, "item", item_id, "created", actor, None,
        {"name": values["name"], "status": values["status"]},
    )
    entry = await get(conn, clock, item_id)
    return {"item": view(entry, clock), "warnings": warnings}


async def update_item(
    conn: asyncpg.Connection, item_id: UUID, changes: dict, actor: Actor, clock: ShopClock,
    require_arabic: bool = True, reason: str = "",
) -> dict | None:
    """Save changes to an item. Only the keys in `changes` are touched; a `variants`,
    `option_groups` or `schedule` list replaces the whole set. Returns None if there is no
    such item."""
    # `no key update`: a checkout writing an order line for this item takes a lighter lock
    # on it, and saving the item must not make that checkout wait for a lock it needs.
    row = await conn.fetchrow("select * from items where id = $1 for no key update", item_id)
    if row is None:
        return None
    if changes.get("variants") == []:
        raise ItemError("variant_needed", "An item needs at least one choice that can be sold.")
    before = dict(row)
    values = {**before, **{k: changes[k] for k in FIELDS if k in changes}}
    touched = set(changes)
    if "sale_price" in changes and changes["sale_price"] is None:
        # Taking the sale off takes its dates with it.
        for key in ("sale_starts_at", "sale_ends_at"):
            if key not in changes:
                values[key] = None
                touched.add(key)
    if "name" in changes:
        values["name"] = values["name"].strip()
    if "name_ar" in changes:
        values["name_ar"] = values["name_ar"].strip()
    if "tags" in changes:
        values["tags"] = _clean_tags(values["tags"])
    if "sku" in changes:
        values["sku"] = clean_sku(values["sku"])
    current_variants = await conn.fetch("select * from item_variants where item_id = $1", item_id)
    planned = (
        _plan_variants(changes["variants"], changes)
        if changes.get("variants") else [dict(v) for v in current_variants]
    )
    if "daily_limit" in changes and not changes.get("variants"):
        planned = [{**v, "daily_limit": changes["daily_limit"]} if v["is_default"] else v
                   for v in planned]
    _check_fields(values, planned)
    if (
        values["status"] == "live" and require_arabic and not values["name_ar"]
        and (before["status"] != "live" or before["name_ar"])
    ):
        raise ItemError("arabic_needed", "Add the Arabic name before the item goes live.")
    warnings = []
    if "name" in changes or "name_ar" in changes:
        warnings = await _duplicates(conn, values["name"], values["name_ar"], item_id)
    if "sku" in changes or changes.get("variants"):
        await _check_skus(
            conn, item_id, values["sku"], _variant_codes(current_variants, changes.get("variants"))
        )
    changed = [k for k in FIELDS if k in touched and values[k] != before[k]]
    if changed:
        sets = ", ".join(f"{k} = ${n}" for n, k in enumerate(changed, start=2))
        try:
            await conn.execute(
                f"update items set {sets}, updated_at = now() where id = $1",
                item_id, *(values[k] for k in changed),
            )
        except asyncpg.UniqueViolationError as error:  # the index under the check above
            raise ItemError(
                "sku_taken", f"The SKU “{values['sku']}” is already in use."
            ) from error
    if any(k in changed for k in ("price", "sale_price", "sale_starts_at", "sale_ends_at")):
        await _price_row(
            conn, item_id, values, actor, "First price" if before["price"] == 0 else reason
        )
    structure = []
    if changes.get("variants") or "daily_limit" in changes:
        await _sync_variants(conn, item_id, changes.get("variants"), changes, actor, clock)
        structure.append("variants")
    if "option_groups" in changes and changes["option_groups"] is not None:
        await _sync_groups(conn, item_id, changes["option_groups"])
        structure.append("options")
    if "schedule" in changes and changes["schedule"] is not None:
        await _sync_schedule(conn, item_id, changes["schedule"])
        structure.append("schedule")
    if changes.get("group_prices"):
        # (imported here: groups.py builds on this module)
        from alyr.modules.items import groups

        await groups.save_prices(conn, item_id, changes["group_prices"], actor, reason)
    if changed or structure:
        await conn.execute("update items set updated_at = now() where id = $1", item_id)
        await events.item_changed(conn, item_id)
        detail = {"fields": changed + structure}
        if "status" in changed:
            detail |= {"from": before["status"], "to": values["status"]}
        if "price" in changed:
            detail |= {"price_from": fmt_qar(before["price"]), "price_to": fmt_qar(values["price"])}
        await team.record(conn, "item", item_id, "updated", actor, None, detail)
        if "available" in changed:
            # The switch has the same record whether it is flipped or saved with the item:
            # the weekly report works out how long an item was sold out from these rows.
            await team.record(
                conn, "item", item_id,
                "switched_on" if values["available"] else "switched_off", actor,
            )
    entry = await get(conn, clock, item_id)
    return {"item": view(entry, clock), "warnings": warnings}


async def set_available(
    conn: asyncpg.Connection, item_id: UUID, available: bool, actor: Actor
) -> bool | None:
    """Flip an item's switch. Returns None if there is no such item; refuses an item whose
    rule has no switch."""
    row = await conn.fetchrow("select stock_rule, available from items where id = $1", item_id)
    if row is None:
        return None
    if row["stock_rule"] == "always":
        raise ItemError(
            "no_switch", "This item is always available. Change how it runs out to use a switch."
        )
    if row["available"] != available:
        await conn.execute(
            "update items set available = $2, updated_at = now() where id = $1",
            item_id, available,
        )
        await team.record(
            conn, "item", item_id, "switched_on" if available else "switched_off", actor
        )
        if available:
            await events.item_changed(conn, item_id)
    return available


async def remove(conn: asyncpg.Connection, item_id: UUID, actor: Actor) -> str | None:
    """Delete an item that has no history, or archive one that has (orders, stock movements,
    price changes), so that nothing on the record is lost. Returns "deleted", "archived", or
    None if there is no such item."""
    row = await conn.fetchrow(
        "select name, status, "
        "exists (select 1 from order_items o where o.item_id = items.id) as has_orders, "
        # Deleting an item would take its stock log and price history with it, so an item
        # that has either (beyond the first price) is archived like one that was ordered.
        "(exists (select 1 from stock_movements m join item_variants v on v.id = m.variant_id "
        "         where v.item_id = items.id) "
        " or exists (select 1 from item_group_price_history g where g.item_id = items.id)"
        " or (select count(*) from item_price_history h where h.item_id = items.id) > 1) "
        "as has_history from items where id = $1 for update",
        item_id,
    )
    if row is None:
        return None
    if row["has_orders"] or row["has_history"]:
        if row["status"] != "archived":
            await conn.execute(
                "update items set status = 'archived', updated_at = now() where id = $1", item_id
            )
            await team.record(
                conn, "item", item_id, "archived", actor, None,
                {"name": row["name"],
                 "because": "it has orders" if row["has_orders"] else "it has a history"},
            )
        return "archived"
    await conn.execute("delete from items where id = $1", item_id)
    await team.record(conn, "item", item_id, "deleted", actor, None, {"name": row["name"]})
    return "deleted"


# ----------------------------------------------------------------- price history

async def _price_row(
    conn: asyncpg.Connection, item_id: UUID, values: dict, actor: Actor, reason: str
) -> None:
    await conn.execute(
        "insert into item_price_history (item_id, price, sale_price, sale_ends_at, changed_by, "
        "changed_by_name, reason, via) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        item_id, values["price"], values["sale_price"], values["sale_ends_at"],
        actor.id, actor.name, reason, actor.via,
    )


async def price_history(conn: asyncpg.Connection, item_id: UUID) -> list[dict]:
    rows = await conn.fetch(
        "select price, sale_price, sale_ends_at, changed_by, changed_by_name, reason, via, "
        "created_at from item_price_history where item_id = $1 order by created_at desc, id",
        item_id,
    )
    return [
        {
            "price": r["price"], "price_text": fmt_qar(r["price"]),
            "sale_price": r["sale_price"], "sale_price_text": _money(r["sale_price"]),
            "sale_ends_at": _iso(r["sale_ends_at"]), "reason": r["reason"], "via": r["via"],
            "changed_by": {"id": str(r["changed_by"]) if r["changed_by"] else None,
                           "name": r["changed_by_name"]},
            "at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


# ------------------------------------------------------------------ nested sets

def _plan_variants(inputs: list[dict] | None, data: dict) -> list[dict]:
    """The variants an item will have, as far as the checks need them: what the form asks
    for, or the one variant an item without sizes has."""
    if not inputs:
        return [{"active": True, "price_delta": 0, "daily_limit": data.get("daily_limit"),
                 "is_default": True}]
    if len(inputs) > 1 and any(not v.get("name", "").strip() for v in inputs):
        raise ItemError("variant_name_needed", "Give every size or colour a name.")
    names = [v.get("name", "").strip().lower() for v in inputs]
    if len(set(names)) != len(names):
        raise ItemError("duplicate_variant", "Two choices have the same name.")
    return [
        {"active": v.get("active", True), "price_delta": v.get("price_delta", 0),
         "daily_limit": v.get("daily_limit"), "is_default": False}
        for v in inputs
    ]


def _variant_codes(existing, inputs: list[dict] | None) -> list[tuple[str, str]]:
    """(SKU, name) of every size or colour an item will have after a save of `inputs`. A
    form that leaves the code out keeps the one it has, and a size left out of the form is
    only switched off, so it keeps its code too."""
    kept = {v["id"]: (v["sku"], v["name"]) for v in existing}
    if not inputs:
        return list(kept.values())
    adopt = len(existing) == 1 and existing[0]["is_default"] and not any(
        v.get("id") for v in inputs
    )
    out, listed = [], set()
    for n, v in enumerate(inputs):
        variant_id = UUID(str(v["id"])) if v.get("id") else (
            existing[0]["id"] if adopt and n == 0 else None
        )
        old = kept.get(variant_id)
        out.append((clean_sku(v["sku"]) if "sku" in v else (old[0] if old else ""),
                    v.get("name", "")))
        if variant_id is not None:
            listed.add(variant_id)
    return out + [code for variant_id, code in kept.items() if variant_id not in listed]


async def _sync_variants(
    conn: asyncpg.Connection, item_id: UUID, inputs: list[dict] | None, data: dict,
    actor: Actor, clock: ShopClock, creating: bool = False,
) -> None:
    """Make the item's variants match the form. Variants left out are switched off, never
    deleted, so orders and the stock log keep what they point at. An item that has only its
    unnamed default variant hands that variant (and its stock) to the first one added."""
    existing = [dict(v) for v in await conn.fetch(
        "select * from item_variants where item_id = $1 order by created_at", item_id
    )]
    if not inputs:
        default = next((v for v in existing if v["is_default"]), None)
        if default is not None:
            if "daily_limit" in data:
                await conn.execute(
                    "update item_variants set daily_limit = $2 where id = $1",
                    default["id"], data["daily_limit"],
                )
            if creating and data.get("opening_stock"):
                await _opening(conn, default["id"], data["opening_stock"], actor)
        return
    by_id = {v["id"]: v for v in existing}
    adopt = len(existing) == 1 and existing[0]["is_default"] and not any(
        v.get("id") for v in inputs
    )
    kept = set()
    for sort, v in enumerate(inputs):
        name = v.get("name", "").strip()
        # A form that does not send the code leaves the one the size already has.
        old = by_id.get(UUID(str(v["id"]))) if v.get("id") else (
            existing[0] if adopt and sort == 0 else None
        )
        sku = clean_sku(v["sku"]) if "sku" in v else (old["sku"] if old else "")
        fields = (
            name, v.get("name_ar", "").strip(), v.get("price_delta", 0),
            v.get("daily_limit"), v.get("active", True), sort, sku,
        )
        try:
            if v.get("id"):
                if UUID(str(v["id"])) not in by_id:
                    raise ItemError("unknown_variant", "One of the choices is not on this item.")
                variant_id = UUID(str(v["id"]))
                await conn.execute(
                    "update item_variants set name = $2, name_ar = $3, price_delta = $4, "
                    "daily_limit = $5, active = $6, sort = $7, sku = $8, is_default = ($2 = '' "
                    "and $9) where id = $1",
                    variant_id, *fields, len(inputs) == 1,
                )
            elif adopt and sort == 0:
                variant_id = existing[0]["id"]
                await conn.execute(
                    "update item_variants set name = $2, name_ar = $3, price_delta = $4, "
                    "daily_limit = $5, active = $6, sort = $7, sku = $8, is_default = ($2 = '' "
                    "and $9) where id = $1",
                    variant_id, *fields, len(inputs) == 1,
                )
                if v.get("opening_stock"):
                    await _opening(conn, variant_id, v["opening_stock"], actor)
            else:
                variant_id = await conn.fetchval(
                    "insert into item_variants (item_id, name, name_ar, price_delta, "
                    "daily_limit, active, sort, sku) values ($1, $2, $3, $4, $5, $6, $7, $8) "
                    "returning id",
                    item_id, *fields,
                )
                if v.get("opening_stock"):
                    await _opening(conn, variant_id, v["opening_stock"], actor)
        except asyncpg.UniqueViolationError as error:
            if "sku" in (error.constraint_name or ""):
                raise ItemError("sku_taken", f"The SKU “{sku}” is already in use.") from error
            raise ItemError("duplicate_variant", "Two choices have the same name.") from error
        kept.add(variant_id)
    gone = [vid for vid in by_id if vid not in kept]
    if gone:
        await conn.execute("update item_variants set active = false where id = any($1)", gone)


async def _opening(conn: asyncpg.Connection, variant_id: UUID, quantity: int, actor: Actor):
    if quantity < 0:
        raise ItemError("bad_quantity", "A stock count cannot be below zero.")
    if quantity:
        await stock.move(conn, variant_id, "opening", quantity, actor, "Opening count")


def _time(value) -> time | None:
    if value is None or isinstance(value, time):
        return value
    return time.fromisoformat(value)


async def _sync_groups(conn: asyncpg.Connection, item_id: UUID, groups: list[dict]) -> None:
    """Make the item's option groups match the form, keeping the ids of those that stay."""
    old_groups = {r["id"] for r in await conn.fetch(
        "select id from item_option_groups where item_id = $1", item_id)}
    kept_groups = set()
    for g_sort, g in enumerate(groups):
        name = g.get("name", "").strip()
        options = g.get("options", [])
        if not name:
            raise ItemError("group_name_needed", "Give every group of choices a name.")
        if g.get("required") and not any(o.get("active", True) for o in options):
            raise ItemError("options_needed", f"Add the choices for “{name}”.")
        if g.get("max_choices", 1) < 1:
            raise ItemError("bad_max", "A group must allow at least one choice.")
        if g.get("id") and UUID(str(g["id"])) in old_groups:
            group_id = UUID(str(g["id"]))
            await conn.execute(
                "update item_option_groups set name = $2, name_ar = $3, required = $4, "
                "max_choices = $5, sort = $6 where id = $1",
                group_id, name, g.get("name_ar", "").strip(), g.get("required", False),
                g.get("max_choices", 1), g_sort,
            )
        else:
            group_id = await conn.fetchval(
                "insert into item_option_groups (item_id, name, name_ar, required, max_choices, "
                "sort) values ($1, $2, $3, $4, $5, $6) returning id",
                item_id, name, g.get("name_ar", "").strip(), g.get("required", False),
                g.get("max_choices", 1), g_sort,
            )
        kept_groups.add(group_id)
        old_options = {r["id"] for r in await conn.fetch(
            "select id from item_options where group_id = $1", group_id)}
        kept_options = set()
        for o_sort, o in enumerate(options):
            if not o.get("name", "").strip():
                raise ItemError("option_name_needed", "Give every choice a name.")
            fields = (
                o["name"].strip(), o.get("name_ar", "").strip(), o.get("price_delta", 0),
                o.get("active", True), o_sort,
            )
            if o.get("id") and UUID(str(o["id"])) in old_options:
                option_id = UUID(str(o["id"]))
                await conn.execute(
                    "update item_options set name = $2, name_ar = $3, price_delta = $4, "
                    "active = $5, sort = $6 where id = $1",
                    option_id, *fields,
                )
            else:
                option_id = await conn.fetchval(
                    "insert into item_options (group_id, name, name_ar, price_delta, active, "
                    "sort) values ($1, $2, $3, $4, $5, $6) returning id",
                    group_id, *fields,
                )
            kept_options.add(option_id)
        await conn.execute(
            "delete from item_options where group_id = $1 and not (id = any($2))",
            group_id, list(kept_options),
        )
    await conn.execute(
        "delete from item_option_groups where item_id = $1 and not (id = any($2))",
        item_id, list(kept_groups),
    )


async def _sync_schedule(conn: asyncpg.Connection, item_id: UUID, windows: list[dict]) -> None:
    """Replace the item's schedule with the form's windows."""
    rows = []
    for w in windows:
        opens, closes = _time(w.get("opens")), _time(w.get("closes"))
        cutoff = _time(w.get("cutoff"))
        days = sorted(set(w.get("weekdays", range(7))))
        if not days or days[0] < 0 or days[-1] > 6:
            raise ItemError("bad_schedule", "Choose the days of the week, Sunday to Saturday.")
        if opens and closes and closes <= opens:
            raise ItemError("bad_schedule", "A window must close after it opens.")
        valid_from, valid_to = w.get("valid_from"), w.get("valid_to")
        if valid_from and valid_to and valid_to < valid_from:
            raise ItemError("bad_schedule", "A date range must end after it starts.")
        rows.append((
            days, opens, closes, w.get("lead_days", 0), cutoff, valid_from, valid_to,
            w.get("closed", False),
        ))
    await conn.execute("delete from item_schedules where item_id = $1", item_id)
    await conn.executemany(
        "insert into item_schedules (item_id, weekdays, opens, closes, lead_days, cutoff, "
        "valid_from, valid_to, closed) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [(item_id, *row) for row in rows],
    )


# ------------------------------------------------------------------------ stock

async def _variant_for(
    conn: asyncpg.Connection, item_id: UUID, variant_id: UUID | None
) -> tuple[asyncpg.Record, asyncpg.Record]:
    item = await conn.fetchrow("select id, stock_rule from items where id = $1", item_id)
    if item is None:
        raise LookupError("no such item")
    variants = await conn.fetch(
        "select * from item_variants where item_id = $1 and active order by sort, created_at",
        item_id,
    )
    if variant_id is None:
        if len(variants) != 1:
            raise ItemError("variant_needed", "Choose which size or colour.")
        return item, variants[0]
    chosen = next((v for v in variants if v["id"] == variant_id), None)
    if chosen is None:
        raise ItemError("unknown_variant", "That choice is not on this item.")
    return item, chosen


async def record_stock(
    conn: asyncpg.Connection, clock: ShopClock, item_id: UUID, kind: str, quantity: int,
    reason: str, actor: Actor, variant_id: UUID | None = None, day: date | None = None,
) -> dict:
    """Staff record a stock change by hand: an opening count, stock received, waste, a count
    of the shelf, or a correction. `quantity` is a positive number, except for "adjusted"
    (signed) and "counted" (what was counted). Raises LookupError for an unknown item."""
    if kind not in stock.BY_HAND:
        raise ItemError("bad_kind", "Choose opening, received, wasted, counted or adjusted.")
    item, variant = await _variant_for(conn, item_id, variant_id)
    rule = item["stock_rule"]
    if rule not in availability.STOCKED:
        raise ItemError(
            "not_counted",
            "This item is not counted. Change how it runs out to count or daily limit first.",
        )
    if kind == "opening" and rule != "count":
        raise ItemError("bad_kind", "An opening count is for items counted in stock.")
    stock_day = (day or clock.shop_day) if rule == "daily_limit" else None
    reason = reason.strip()
    if kind in ("wasted", "adjusted") and not reason:
        raise ItemError("reason_needed", "Say why, so the log makes sense later.")
    if kind == "counted":
        try:
            result = await stock.count(conn, variant["id"], quantity, actor, reason, stock_day)
        except stock.StockError as error:
            raise ItemError(error.code, str(error)) from error
        return {"kind": kind, "balance": quantity, **result}
    if kind == "adjusted":
        delta = quantity
        if delta == 0:
            raise ItemError("bad_quantity", "An adjustment cannot be zero.")
    else:
        if quantity <= 0:
            raise ItemError("bad_quantity", "Enter a number above zero.")
        delta = -quantity if kind == "wasted" else quantity
    balance = await stock.move(
        conn, variant["id"], kind, delta, actor,
        reason or ("Opening count" if kind == "opening" else "Stock received"),
        stock_day, limit=variant["daily_limit"],
    )
    if balance is None:
        have = await stock.left(conn, variant["id"], stock_day)
        raise ItemError("below_zero", f"There are only {have} in stock, so that cannot come out.")
    return {"kind": kind, "balance": balance, "delta": delta}


# -------------------------------------------------------------------- categories

async def categories(conn: asyncpg.Connection) -> list[dict]:
    """The shop's categories in the owner's order: those with a row first, then any an
    item uses that has none."""
    rows = await conn.fetch(
        "select name, name_ar, sort, true as listed from item_categories "
        "union all select category, '', 1000000, false from items "
        "where category <> '' and status <> 'archived' "
        "and category not in (select name from item_categories) group by category "
        "order by 3, 1"
    )
    return [
        {"name": r["name"], "name_ar": r["name_ar"], "sort": n}
        for n, r in enumerate(rows)
    ]


async def save_categories(conn: asyncpg.Connection, rows: list[dict]) -> list[dict]:
    """Set the order, and the Arabic names, of the shop's categories."""
    seen = set()
    for sort, row in enumerate(rows):
        name = row["name"].strip()
        if not name or name.lower() in seen:
            raise ItemError("bad_category", "Every category needs its own name.")
        seen.add(name.lower())
        await conn.execute(
            "insert into item_categories (name, name_ar, sort) values ($1, $2, $3) "
            "on conflict (tenant_id, name) do update set name_ar = excluded.name_ar, "
            "sort = excluded.sort",
            name, row.get("name_ar", "").strip(), sort,
        )
    return await categories(conn)


# ---------------------------------------------------------------------- settings

async def settings(conn: asyncpg.Connection) -> dict:
    """What the shop chooses about its catalog: how long an unpaid pay-link order holds its
    stock, when its day begins (which is when daily limits start again), whether agents may
    edit items, and the number at which counted stock is called low."""
    row = await conn.fetchrow(
        "select hold_minutes, day_starts, agents_edit_items, low_stock_at from shop_settings"
    )
    return {
        "hold_minutes": row["hold_minutes"] if row else 30,
        "day_starts": (row["day_starts"] if row else time(0)).strftime("%H:%M"),
        "agents_edit_items": row["agents_edit_items"] if row else False,
        "low_stock_at": row["low_stock_at"] if row else 5,
    }


async def save_settings(
    conn: asyncpg.Connection, hold_minutes: int | None, day_starts: time | None,
    agents_edit_items: bool | None = None, low_stock_at: int | None = None,
) -> dict:
    if hold_minutes is not None and not 5 <= hold_minutes <= 1440:
        raise ItemError("bad_hold", "A hold lasts between 5 minutes and 24 hours.")
    if low_stock_at is not None and not 0 <= low_stock_at <= 100_000:
        raise ItemError("bad_low_stock", "Choose a low-stock number between 0 and 100,000.")
    await conn.execute(
        "insert into shop_settings (hold_minutes, day_starts, agents_edit_items, low_stock_at) "
        "values (coalesce($1::int, 30), coalesce($2::time, '00:00'), "
        "coalesce($3::boolean, false), coalesce($4::int, 5)) "
        "on conflict (tenant_id) do update set "
        "hold_minutes = coalesce($1::int, shop_settings.hold_minutes), "
        "day_starts = coalesce($2::time, shop_settings.day_starts), "
        "agents_edit_items = coalesce($3::boolean, shop_settings.agents_edit_items), "
        "low_stock_at = coalesce($4::int, shop_settings.low_stock_at)",
        hold_minutes, day_starts, agents_edit_items, low_stock_at,
    )
    return await settings(conn)
