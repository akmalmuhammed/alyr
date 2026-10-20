"""The Catalog in the weekly report (D-039, ALY-109, `specs/007-catalog-reports/spec.md`).

For a shop whose `catalog` module is on, the report gains a section about its items, between
the orders and the bookings: what sold out and for how long, how many customers asked for
something that was sold out, what is low on stock now, the best sellers by units and by
money, and what did not sell. Each line is left out when there is nothing to say, so a quiet
week is a short section, or none at all (the report leaves out a section with no lines).

A sale is a line of an order that was not cancelled, the same orders the Orders section counts,
so a cancelled order (and, since ALY-128, one taken off the ledger) is not a sale. The lists
are capped at `LIST_MAX`; a longer one ends with "and 4 more". Low stock is the figure today,
as "still owed" is in the credit section: it is what the owner acts on. The Arabic is a draft
until a native review (ALY-66); every word of this section is in this file.

Every function takes a tenant-scoped connection.
"""

from datetime import datetime
from decimal import Decimal

import asyncpg

from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.core.words import DAYS, HOURS, ITEMS, ORDERS, PICKUPS, counted
from alyr.modules.items import clock as shop_clock
from alyr.modules.items import costs, features, listing, spells

TITLE = {"en": "Catalog", "ar": "الكتالوج"}
LINES = ("sold_out", "asked", "low", "best", "idle", "discounts", "delivery", "margin")
LIST_MAX = 3  # names in a line, before "and 4 more"
ASKED_MAX = 2  # items named beside the number of customers who asked


def shown_lines(feats: features.Features) -> list[str]:
    """Which lines the section may have, by the shop's features (ALY-148): what sold out, and
    who asked for it, only where items can run out; the low-stock line only where stock is
    counted. What sold best and what did not sell are every shop's."""
    out = ["best", "idle"]
    if feats.can_run_out():
        out += ["sold_out", "asked"]
    if feats.counts_stock():
        out.append("low")
    if feats.on("discounts"):
        out.append("discounts")  # (ALY-150) a line only for a shop that gives discounts
    if feats.on("delivery_fees"):
        out.append("delivery")
    if feats.on("cost_margin"):
        out.append("margin")  # (owner and admin only: the report goes to them)
    return [k for k in LINES if k in out]


async def numbers(conn: asyncpg.Connection, start: datetime, end: datetime, tz: str,
                  current: bool) -> dict:
    """The week's numbers. The week before has none: the lines are lists, not one figure to
    compare, so it is not read."""
    if not current:
        return {}
    clock = await shop_clock.load(conn)
    out: dict = {"show": shown_lines(await features.load(conn))}

    lasted = await spells.sold_out(conn, clock, start, end)
    out["sold_out"] = {
        "count": len(lasted),
        "items": [
            {"name": s.name, "name_ar": s.name_ar, "minutes": s.minutes, "still": s.still}
            for s in lasted[:LIST_MAX]
        ],
    }

    asked = await conn.fetch(
        "select i.name, i.name_ar, count(distinct a.contact_id)::int as customers "
        "from sold_out_asks a join items i on i.id = a.item_id "
        "where a.created_at >= $1 and a.created_at < $2 "
        "group by i.id, i.name, i.name_ar order by customers desc, i.name limit $3",
        start, end, ASKED_MAX,
    )
    out["asked"] = {
        "customers": await conn.fetchval(
            "select count(distinct contact_id)::int from sold_out_asks "
            "where created_at >= $1 and created_at < $2", start, end,
        ),
        "items": [dict(r) for r in asked],
    }

    low = await listing.low_items(conn, clock)
    out["low"] = {"count": len(low), "items": low[:LIST_MAX]}

    # What sold: the lines of orders that were not cancelled, by item.
    sold = [dict(r) for r in await conn.fetch(
        "select max(coalesce(i.name, l.name)) as name, "
        "max(coalesce(nullif(i.name_ar, ''), nullif(l.name_ar, ''), i.name, l.name)) as name_ar, "
        "sum(l.quantity)::int as units, sum(l.price * l.quantity)::bigint as value "
        "from order_items l join orders o on o.id = l.order_id "
        "left join items i on i.id = l.item_id "
        "where o.created_at >= $1 and o.created_at < $2 and o.status <> 'cancelled' "
        "group by coalesce(l.item_id::text, l.name)",
        start, end,
    )]
    by_units = sorted(sold, key=lambda r: (-r["units"], -r["value"], r["name"]))[:LIST_MAX]
    by_value = sorted(sold, key=lambda r: (-r["value"], -r["units"], r["name"]))[:LIST_MAX]
    out["top_units"], out["top_value"] = by_units, by_value

    # What did not sell: items on sale that no order of the week held, leaving out those that
    # were sold out (they could not sell), and only in a week in which something sold.
    idle = []
    if sold:
        out_of_stock = {s.item_id for s in lasted}
        idle = [
            r for r in await conn.fetch(
                "select i.id, i.name, i.name_ar from items i "
                "where i.status = 'live' and i.created_at < $2 "
                "and not exists (select 1 from order_items l join orders o on o.id = l.order_id "
                "                where l.item_id = i.id and o.created_at >= $1 "
                "                and o.created_at < $2 and o.status <> 'cancelled') "
                "order by i.category, i.sort, i.name",
                start, end,
            )
            if r["id"] not in out_of_stock
        ]
    out["idle"] = {
        "count": len(idle),
        "items": [{"name": r["name"], "name_ar": r["name_ar"]} for r in idle[:LIST_MAX]],
    }
    if "discounts" in out["show"]:
        out["discounts"] = await _discounts(conn, start, end)
    if "delivery" in out["show"]:
        out["delivery"] = await _delivery(conn, start, end)
    if "margin" in out["show"]:
        out["margin"] = await _margin(conn, start, end)
    return out


async def _margin(conn: asyncpg.Connection, start: datetime, end: datetime) -> dict:
    """The estimated gross margin of the week's orders, from the cost each unit had when it was
    ordered; and the items sold at a loss or for very little. Only lines with a cost kept count
    (and the revenue counted is theirs), delivery fees are left out, a cancelled order is not a
    sale. `unknown` is how many orders had a line with no cost kept."""
    row = await conn.fetchrow(
        "select count(distinct o.id) filter (where c.unit_cost is not null)::int as orders, "
        "count(distinct o.id) filter (where c.unit_cost is null)::int as unknown, "
        "coalesce(sum(l.price * l.quantity - l.discount) filter (where c.unit_cost is not null), "
        "0)::bigint as revenue, "
        "coalesce(sum(round(c.unit_cost * l.quantity)), 0)::bigint as cost "
        "from orders o join order_items l on l.order_id = o.id "
        "left join order_item_costs c on c.order_item_id = l.id "
        "where o.created_at >= $1 and o.created_at < $2 and o.status <> 'cancelled'",
        start, end,
    )
    by_item = await conn.fetch(
        "select max(coalesce(i.name, l.name)) as name, "
        "max(coalesce(nullif(i.name_ar, ''), nullif(l.name_ar, ''), i.name, l.name)) as name_ar, "
        "sum(l.price * l.quantity - l.discount)::bigint as revenue, "
        "sum(round(c.unit_cost * l.quantity))::bigint as cost "
        "from order_items l join orders o on o.id = l.order_id "
        "join order_item_costs c on c.order_item_id = l.id left join items i on i.id = l.item_id "
        "where o.created_at >= $1 and o.created_at < $2 and o.status <> 'cancelled' "
        "group by coalesce(l.item_id::text, l.name)",
        start, end,
    )
    loss, low = [], []
    for r in by_item:
        amount = r["revenue"] - r["cost"]
        share = costs.pct(amount, r["revenue"])
        entry = {"name": r["name"], "name_ar": r["name_ar"], "amount": amount,
                 "pct": str(share) if share is not None else None}
        if amount < 0:
            loss.append(entry)
        elif share is not None and share < costs.LOW_MARGIN_PCT:
            low.append(entry)
    loss.sort(key=lambda x: (x["amount"], x["name"]))
    low.sort(key=lambda x: (Decimal(x["pct"]), x["name"]))
    amount = row["revenue"] - row["cost"]
    share = costs.pct(amount, row["revenue"])
    return {
        "orders": row["orders"], "unknown": row["unknown"], "revenue": row["revenue"],
        "cost": row["cost"], "amount": amount, "pct": str(share) if share is not None else None,
        "loss": {"count": len(loss), "items": loss[:LIST_MAX]},
        "low": {"count": len(low), "items": low[:LIST_MAX]},
    }


async def _delivery(conn: asyncpg.Connection, start: datetime, end: datetime) -> dict:
    """How the week's orders reached their customers: deliveries and the fees on them, and the
    pickups. A cancelled order is not counted."""
    row = await conn.fetchrow(
        "select count(*) filter (where fulfilment = 'delivery')::int as deliveries, "
        "coalesce(sum(delivery_fee) filter (where fulfilment = 'delivery'), 0)::bigint as fees, "
        "count(*) filter (where fulfilment = 'pickup')::int as pickups "
        "from orders where created_at >= $1 and created_at < $2 and status <> 'cancelled'",
        start, end,
    )
    return dict(row)


async def _discounts(conn: asyncpg.Connection, start: datetime, end: datetime) -> dict:
    """What the shop gave away this week: the orders that had a discount, the money, and the
    discounts that gave most. A cancelled order gave nothing (its use went back)."""
    row = await conn.fetchrow(
        "select count(distinct d.order_id)::int as orders, "
        "coalesce(sum(d.amount_off), 0)::bigint as given "
        "from order_discounts d join orders o on o.id = d.order_id "
        "where o.created_at >= $1 and o.created_at < $2 and o.status <> 'cancelled' "
        "and d.returned_at is null",
        start, end,
    )
    top = await conn.fetch(
        "select coalesce(nullif(d.code, ''), nullif(d.name, ''), d.rule_text) as label, "
        "coalesce(nullif(d.code, ''), nullif(d.name_ar, ''), d.rule_text_ar) as label_ar, "
        "count(*)::int as orders, sum(d.amount_off)::bigint as given "
        "from order_discounts d join orders o on o.id = d.order_id "
        "where o.created_at >= $1 and o.created_at < $2 and o.status <> 'cancelled' "
        "and d.returned_at is null group by 1, 2 order by given desc, label limit $3",
        start, end, LIST_MAX,
    )
    return {"orders": row["orders"], "given": row["given"], "top": [dict(r) for r in top]}


def active(n: dict) -> bool:
    return bool(lines(n, None, "en"))


def _show(n: dict) -> list[str]:
    """The lines this report may have; an older report, stored before features, has them all."""
    return n.get("show", list(LINES))


def headline(n: dict, lang: str) -> str:
    ar = lang == "ar"
    show = _show(n)
    if "sold_out" in show and n["sold_out"]["count"]:
        things = counted(n["sold_out"]["count"], ITEMS, lang)
        return f"نفد {things}" if ar else f"{things} sold out"
    if "low" in show and n["low"]["count"]:
        things = counted(n["low"]["count"], ITEMS, lang)
        return f"{things} بمخزون قليل" if ar else f"{things} low on stock"
    if "best" in show and n["top_units"]:
        name = _name(n["top_units"][0], lang)
        return f"الأكثر مبيعاً: {name}" if ar else f"{name} sold most"
    return "لا أصناف نافدة" if ar else "no items sold out"


def lines(n: dict, before: dict | None, lang: str) -> list[str]:
    """The section's lines, each only when it has something to say."""
    ar = lang == "ar"
    out = []
    show = _show(n)
    sold_out = n["sold_out"]
    if "sold_out" in show and sold_out["count"]:
        named = [_lasted(i, lang) for i in sold_out["items"]]
        head = "نفدت هذا الأسبوع" if ar else "Sold out this week"
        out.append(f"{head}: {_join(named, sold_out['count'], lang)}")
    asked = n["asked"]
    if "asked" in show and asked["customers"]:
        head = "عملاء طلبوا صنفاً نافداً" if ar else "Customers who asked for something sold out"
        comma = "، " if ar else ", "
        named = comma.join(f"{_name(i, lang)} {i['customers']}" for i in asked["items"])
        out.append(f"{head}: {asked['customers']} ({named})")
    low = n["low"]
    if "low" in show and low["count"]:
        left = "المتبقي {}" if ar else "{} left"
        named = [f"{_name(i, lang)} ({left.format(i['left'])})" for i in low["items"]]
        head = "مخزون قليل الآن" if ar else "Low on stock now"
        out.append(f"{head}: {_join(named, low['count'], lang)}")
    if "best" in show:
        out += _best(n, lang)
    given = n.get("discounts")
    if "discounts" in show and given and given["given"]:
        comma = "، " if ar else ", "
        named = comma.join(
            f"{i['label_ar'] if ar else i['label']} {i['orders']}" for i in given["top"]
        )
        if ar:
            out.append(
                f"خصومات منحتها هذا الأسبوع: {fmt_qar_ar(given['given'])} "
                f"على {counted(given['orders'], ORDERS, lang)} ({named})"
            )
        else:
            out.append(
                f"Discounts given this week: {fmt_qar(given['given'])} on "
                f"{counted(given['orders'], ORDERS, lang)} ({named})"
            )
    earned = n.get("margin")
    if "margin" in show and earned and earned["orders"]:
        orders = counted(earned["orders"], ORDERS, lang)
        money = fmt_qar_ar if ar else fmt_qar
        if ar:
            out.append(
                f"هامش الربح الإجمالي التقديري: {money(earned['amount'])} ({earned['pct']}%) "
                f"على {orders}"
            )
        else:
            out.append(
                f"Estimated gross margin: {money(earned['amount'])} ({earned['pct']}%) "
                f"on {orders}"
            )
        if earned["unknown"]:
            many = counted(earned["unknown"], ORDERS, lang)
            out.append(
                f"{many} فيها أصناف بلا تكلفة محفوظة، وهي خارج الهامش" if ar
                else f"{many} had items with no cost kept, so those items are not in the margin"
            )
        if earned["loss"]["count"]:
            named = [_name(i, lang) for i in earned["loss"]["items"]]
            out.append(
                f"بيعت بأقل من تكلفتها: {_join(named, earned['loss']['count'], lang)}" if ar
                else f"Sold for less than they cost: "
                     f"{_join(named, earned['loss']['count'], lang)}"
            )
        if earned["low"]["count"]:
            named = [f"{_name(i, lang)} ({i['pct']}%)" for i in earned["low"]["items"]]
            out.append(
                f"هامش منخفض (أقل من 10%): {_join(named, earned['low']['count'], lang)}" if ar
                else f"Low margin (under 10%): {_join(named, earned['low']['count'], lang)}"
            )
    sent = n.get("delivery")
    if "delivery" in show and sent and sent["deliveries"]:
        pickups = f" ({counted(sent['pickups'], PICKUPS, lang)})" if sent["pickups"] else ""
        orders = counted(sent["deliveries"], ORDERS, lang)
        if ar:
            out.append(
                f"التوصيل هذا الأسبوع: {orders}، {fmt_qar_ar(sent['fees'])} رسوم توصيل{pickups}"
            )
        else:
            out.append(
                f"Deliveries this week: {orders}, {fmt_qar(sent['fees'])} in delivery fees{pickups}"
            )
    idle = n["idle"]
    if "idle" in show and idle["count"]:
        head = "لم تُبَع هذا الأسبوع" if ar else "Did not sell this week"
        out.append(f"{head}: {_join([_name(i, lang) for i in idle['items']], idle['count'], lang)}")
    return out


def _best(n: dict, lang: str) -> list[str]:
    """The best sellers: one line when the same items lead by units and by money, else a line
    for each."""
    ar = lang == "ar"
    units, value = n["top_units"], n["top_value"]
    if not units:
        return []
    comma = "، " if ar else ", "
    if [i["name"] for i in units] == [i["name"] for i in value]:
        both = comma.join(
            f"{_name(i, lang)} ({i['units']}{comma}{fmt_qar(i['value'])})" for i in units
        )
        return [f"{'الأكثر مبيعاً' if ar else 'Most sold'}: {both}"]
    by_units = comma.join(f"{_name(i, lang)} ({i['units']})" for i in units)
    by_value = comma.join(f"{_name(i, lang)} {fmt_qar(i['value'])}" for i in value)
    return [
        f"{'الأكثر مبيعاً' if ar else 'Most sold'}: {by_units}",
        f"{'الأكثر إيراداً' if ar else 'Biggest earners'}: {by_value}",
    ]


def _name(row: dict, lang: str) -> str:
    return (row["name_ar"] or row["name"]) if lang == "ar" else row["name"]


def _join(names: list[str], total: int, lang: str) -> str:
    """The names, then how many more there are: "A, B, C and 4 more". The lists here are lists
    of items, so the Arabic "more" agrees with the item: one, two, a few, many."""
    more = total - len(names)
    if lang == "ar":
        rest = ""
        if more == 1:
            rest = " وصنف واحد آخر"
        elif more == 2:
            rest = " وصنفان آخران"
        elif 3 <= more <= 10:
            rest = f" و{more} أصناف أخرى"
        elif more > 10:
            rest = f" و{more} صنفاً آخر"
        return "، ".join(names) + rest
    return ", ".join(names) + (f" and {more} more" if more > 0 else "")


def _lasted(row: dict, lang: str) -> str:
    """"Shawarma (2 days)": the item and how long it was out, to the nearest hour under a day
    and the nearest day after; "still out" when it has not come back."""
    hours = max((row["minutes"] + 30) // 60, 1)
    if hours < 24:
        length = counted(hours, HOURS, lang)
    else:
        length = counted(max((hours + 12) // 24, 1), DAYS, lang)
    if row["still"]:
        length += "، لا يزال نافداً" if lang == "ar" else ", still out"
    return f"{_name(row, lang)} ({length})"
