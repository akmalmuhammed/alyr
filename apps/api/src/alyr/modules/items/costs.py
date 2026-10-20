"""Cost price and margin (ALY-150 part 3, D-039 "As built (pricing pack)",
`specs/014-pricing-pack/spec.md`).

A shop that has switched on "Cost price and margin" can say what an item, and each size or colour of
it, costs. Owners and admins see the cost and the margin it leaves; **agents and customers never
do**. That is kept by where the cost lives: in `item_costs`, `item_cost_history` and
`order_item_costs` (migration 0042), not in the tables of items, sizes and order lines, whose rows
are listed, copied and sent to staff and customers in many places. Only this module and the
owner-only routes (`routes/costs.py`) read those three, so a new reader of an item can never show
a cost by accident. `tests/test_cost_leaks.py` goes through every route a staff member and a
customer can reach with a cost in the shop and looks for it.

* **Cost is per unit, in dirhams**, for the item (`variant_id` null) and, where a size or colour
  costs something else, for it. A size with no cost of its own costs what the item costs.
* **History**: every change is kept with who made it, like the price's.
* **Margin** of one unit = the price the customer pays now (the sale price while a sale is on, the
  size's difference included) minus the cost; as a percentage of that price, rounded half up to one
  decimal. Priced extras ("cheese") are not counted: their cost is not kept, so a line's margin
  counts them at nothing, and the screens say "extras not included".
* **Below cost is a warning, never a block**: saving a price under the cost works, and the answer
  carries a `warnings` list the screen shows.
* **An order keeps what each unit cost when it was placed** (`order_item_costs`), so the margin of
  an order stays right when the cost or the price changes later. An order placed while the feature
  was off has no cost and is left out of every margin, and said to be.
* **Stock valuation** = stock on hand x cost, over the items whose stock is counted.

Every function takes a tenant-scoped connection.
"""

from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

import asyncpg

from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.core.team import Actor
from alyr.modules.items import availability
from alyr.modules.items.clock import ShopClock
from alyr.modules.items.service import BilingualError

MAX_COST = 100_000_000
# A margin under this share of the price is "low" in the report, in percent.
LOW_MARGIN_PCT = Decimal(10)


class CostError(BilingualError):
    """A cost that cannot be saved. `code` is stable; the message is safe to show."""


def pct(amount: int, price: int) -> Decimal | None:
    """`amount` as a share of `price`, in percent, to one decimal, halves going up; None for a
    price of zero."""
    if price <= 0:
        return None
    return (Decimal(amount) * 100 / Decimal(price)).quantize(Decimal("0.1"), ROUND_HALF_UP)


def margin(price: int, cost: int | None) -> dict | None:
    """One unit's margin, or None when no cost is kept."""
    if cost is None:
        return None
    amount = price - cost
    share = pct(amount, price)
    return {"price": price, "cost": cost, "amount": amount,
            "pct": str(share) if share is not None else None}


# ── reading what is kept ────────────────────────────────────────────────────────────────


async def kept(conn: asyncpg.Connection, item_ids: list[UUID] | None = None) -> dict:
    """Every cost kept, as `{(item_id, variant_id or None): cost}`."""
    rows = await conn.fetch(
        "select item_id, variant_id, cost from item_costs"
        + (" where item_id = any($1)" if item_ids is not None else ""),
        *([item_ids] if item_ids is not None else []),
    )
    return {(r["item_id"], r["variant_id"]): r["cost"] for r in rows}


def effective(costs: dict, item_id: UUID, variant_id: UUID | None) -> int | None:
    """What one unit of a size costs: its own cost, else the item's."""
    if variant_id is not None and (item_id, variant_id) in costs:
        return costs[(item_id, variant_id)]
    return costs.get((item_id, None))


async def view(conn: asyncpg.Connection, shop_clock: ShopClock, item_id: UUID) -> dict | None:
    """The cost of one item for its owner: the item's, each size's, the margin each leaves at
    today's price, and the history."""
    item = await conn.fetchrow(
        "select id, price, sale_price, sale_starts_at, sale_ends_at from items where id = $1",
        item_id,
    )
    if item is None:
        return None
    variants = await conn.fetch(
        "select id, name, name_ar, price_delta, is_default, active from item_variants "
        "where item_id = $1 order by is_default desc, sort, created_at", item_id,
    )
    costs = await kept(conn, [item_id])
    now_price = availability.item_price(item, shop_clock.now)
    out_variants = []
    for v in variants:
        if v["is_default"] or not v["active"]:
            continue
        own = costs.get((item_id, v["id"]))
        eff = effective(costs, item_id, v["id"])
        out_variants.append({
            "id": str(v["id"]), "name": v["name"], "name_ar": v["name_ar"],
            "price": now_price + v["price_delta"], "cost": own, "effective": eff,
            "margin": margin(now_price + v["price_delta"], eff),
        })
    base = costs.get((item_id, None))
    history = await conn.fetch(
        "select variant_name, cost, changed_by_name, reason, created_at from item_cost_history "
        "where item_id = $1 order by created_at desc, id limit 50", item_id,
    )
    return {
        "item_id": str(item_id), "cost": base, "price": now_price,
        "margin": margin(now_price, base), "variants": out_variants,
        "history": [
            {"variant": h["variant_name"], "cost": h["cost"], "by": h["changed_by_name"],
             "reason": h["reason"], "at": h["created_at"].isoformat()}
            for h in history
        ],
    }


# ── saving ──────────────────────────────────────────────────────────────────────────────


def _cost(value) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= MAX_COST:
        raise CostError("bad_cost", "A cost is an amount of zero or more.",
                        "التكلفة مبلغ صفر أو أكثر.")
    return value


async def save(
    conn: asyncpg.Connection, actor: Actor, item_id: UUID, cost, variants: dict | None,
    reason: str = "",
) -> bool:
    """Set the item's cost (`cost`; None takes it away) and, for the sizes named in `variants`
    ({size ID: cost or None}), theirs. Only what changed is written, with the history. Returns
    False if there is no such item."""
    if await conn.fetchval("select id from items where id = $1", item_id) is None:
        return False
    sizes = {
        r["id"]: r["name"] for r in await conn.fetch(
            "select id, name from item_variants where item_id = $1 and not is_default", item_id
        )
    }
    wanted: list[tuple[UUID | None, int | None, str]] = []
    if cost is not _UNSET:
        wanted.append((None, _cost(cost), ""))
    for key, value in (variants or {}).items():
        try:
            variant_id = UUID(str(key))
        except ValueError:
            variant_id = None
        if variant_id not in sizes:
            raise CostError("unknown_size", "That size does not belong to this item.",
                            "هذا المقاس لا يخص هذا الصنف.")
        wanted.append((variant_id, _cost(value), sizes[variant_id]))
    have = await kept(conn, [item_id])
    for variant_id, new, name in wanted:
        old = have.get((item_id, variant_id))
        if old == new:
            continue
        if new is None:
            await conn.execute(
                "delete from item_costs where item_id = $1 and variant_id is not distinct from $2",
                item_id, variant_id,
            )
        else:
            await conn.execute(
                "insert into item_costs (item_id, variant_id, cost, updated_by) "
                "values ($1, $2, $3, $4) "
                "on conflict (tenant_id, item_id, "
                "coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) "
                "do update set cost = excluded.cost, updated_by = excluded.updated_by, "
                "updated_at = now()",
                item_id, variant_id, new, actor.name,
            )
        await conn.execute(
            "insert into item_cost_history (item_id, variant_id, variant_name, cost, "
            "changed_by_name, reason) values ($1, $2, $3, $4, $5, $6)",
            item_id, variant_id, name, new, actor.name, reason[:200],
        )
    return True


_UNSET = object()
UNSET = _UNSET


# ── a warning when the price is under the cost ──────────────────────────────────────────


def _money(amount: int, lang: str) -> str:
    return fmt_qar_ar(amount) if lang == "ar" else fmt_qar(amount)


async def warnings(
    conn: asyncpg.Connection, shop_clock: ShopClock, item_id: UUID
) -> list[dict]:
    """Where an item sells for less than it costs: its price, its sale price, each size. A
    warning, never a block: the owner may well mean it."""
    item = await conn.fetchrow(
        "select price, sale_price, sale_starts_at, sale_ends_at from items where id = $1", item_id
    )
    if item is None:
        return []
    costs = await kept(conn, [item_id])
    if not costs:
        return []
    variants = await conn.fetch(
        "select id, name, name_ar, price_delta, is_default from item_variants "
        "where item_id = $1 and active order by is_default desc, sort", item_id
    )
    out = []
    for v in variants:
        eff = effective(costs, item_id, None if v["is_default"] else v["id"])
        if eff is None:
            continue
        for which, base in (("price", item["price"]), ("sale_price", item["sale_price"])):
            if base is None:
                continue
            price = base + v["price_delta"]
            if price < eff:
                what = {"en": "The sale price" if which == "sale_price" else "The price",
                        "ar": "سعر العرض" if which == "sale_price" else "السعر"}
                size = f" ({v['name']})" if v["name"] else ""
                size_ar = f" ({v['name_ar'] or v['name']})" if v["name"] else ""
                out.append({
                    "code": "below_cost" if which == "price" else "sale_below_cost",
                    "variant_id": None if v["is_default"] else str(v["id"]),
                    "price": price, "cost": eff,
                    "message": f"{what['en']}{size} {_money(price, 'en')} is below what it "
                               f"costs you ({_money(eff, 'en')}). You can still save it.",
                    "message_ar": f"{what['ar']}{size_ar} {_money(price, 'ar')} أقل من تكلفته "
                                  f"عليك ({_money(eff, 'ar')}). يمكنك حفظه مع ذلك.",
                })
    return out


# ── the list's margins, stock valuation ─────────────────────────────────────────────────


async def margins(conn: asyncpg.Connection, shop_clock: ShopClock) -> dict:
    """For the items list: the margin each item with a cost leaves at today's price (the worst
    of its sizes), by item ID. Items with no cost kept are absent."""
    rows = await conn.fetch(
        "select i.id, i.price, i.sale_price, i.sale_starts_at, i.sale_ends_at, "
        "v.id as vid, v.price_delta, v.is_default "
        "from items i join item_variants v on v.item_id = i.id and v.active "
        "where i.status <> 'archived' "
        "and exists (select 1 from item_costs c where c.item_id = i.id)"
    )
    costs = await kept(conn)
    worst: dict[UUID, dict] = {}
    for r in rows:
        eff = effective(costs, r["id"], None if r["is_default"] else r["vid"])
        if eff is None:
            continue
        price = availability.item_price(r, shop_clock.now) + r["price_delta"]
        m = margin(price, eff)
        # (named sizes only count when the item has some: the default row is the item itself)
        current = worst.get(r["id"])
        if current is None or m["amount"] < current["amount"]:
            worst[r["id"]] = m
    return {str(k): {**v, "below_cost": v["amount"] < 0} for k, v in worst.items()}


async def valuation(conn: asyncpg.Connection) -> dict:
    """What the counted stock cost: stock on hand x cost, over the items whose stock is counted.
    `missing` is how many of them have stock and no cost kept (not in the value)."""
    row = await conn.fetchrow(
        "select coalesce(sum(v.on_hand * c.cost) filter (where c.cost is not null), 0)::bigint "
        "as value, count(distinct i.id) filter (where c.cost is not null and v.on_hand > 0) "
        "as items, count(distinct i.id) filter (where c.cost is null and v.on_hand > 0) "
        "as missing "
        "from items i join item_variants v on v.item_id = i.id and v.active "
        "left join lateral (select cost from item_costs "
        "  where item_id = i.id and (variant_id = v.id or variant_id is null) "
        "  order by variant_id is null limit 1) c on true "
        "where i.status <> 'archived' and not i.is_sample and i.stock_rule = 'count'"
    )
    return {"value": row["value"], "value_text": fmt_qar(row["value"]),
            "items": row["items"], "missing": row["missing"]}


# ── on an order ─────────────────────────────────────────────────────────────────────────


async def snapshot(
    conn: asyncpg.Connection, order_item_id: UUID, item_id: UUID, variant_id: UUID | None
) -> None:
    """Keep what one unit costs now beside the order line, if a cost is kept."""
    costs = await kept(conn, [item_id])
    found = effective(costs, item_id, variant_id)
    if found is not None:
        await conn.execute(
            "insert into order_item_costs (order_item_id, unit_cost) values ($1, $2) "
            "on conflict (order_item_id) do nothing", order_item_id, found,
        )


async def order_margins(conn: asyncpg.Connection) -> dict:
    """The estimated gross margin of every order that has a cost, by order ID: what the goods
    brought in after discounts less what they cost then. Delivery fees are left out. `complete`
    is false when some line had no cost kept (the margin is then of the lines that had)."""
    rows = await conn.fetch(
        "select o.id, "
        "coalesce(sum(l.price * l.quantity - l.discount) filter (where c.unit_cost is not null), 0)"
        "::bigint as revenue, "
        "coalesce(sum(round(c.unit_cost * l.quantity)), 0)::bigint as cost, "
        "count(*) filter (where c.unit_cost is null)::int as missing, "
        "count(*) filter (where c.unit_cost is not null)::int as known "
        "from orders o join order_items l on l.order_id = o.id "
        "left join order_item_costs c on c.order_item_id = l.id group by o.id"
    )
    out = {}
    for r in rows:
        if not r["known"]:
            continue
        amount = r["revenue"] - r["cost"]
        share = pct(amount, r["revenue"])
        out[str(r["id"])] = {
            "revenue": r["revenue"], "cost": r["cost"], "amount": amount,
            "pct": str(share) if share is not None else None,
            "complete": r["missing"] == 0,
        }
    return out
