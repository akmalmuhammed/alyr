"""stock_cover (insights plan S1): an item counted in stock whose stock lasts 3 days or fewer
at the shop's own pace of the last 14 days. Arithmetic on the stock log, nothing more.

**The numbers, exactly**

* *On hand* is `item_variants.on_hand` of an **active** size or colour of a **live** item sold
  by the `count` rule: the number the Catalog's Stock tab shows on that row, and the number the
  customer's order page sells from. Units a pay-link customer is holding (`stock_holds`,
  status `held`) are already out of it, taken in the same statement as the sale, and come back
  through a `cancelled_restocked` row if the hold runs out. Nothing is added back and nothing
  is taken off a second time.
* *Units sold* are the net of two kinds of row in `stock_movements`, in the window, for count
  stock (`day is null`): a sale (`kind = 'sold'`, a negative `delta`, written when an order is
  placed) and a give-back (`kind = 'cancelled_restocked'`, positive, written when a cancelled
  order returns its units). Units sold = minus the sum of their `delta`. A received delivery,
  a count of the shelf, waste and adjustments are not sales and are left out. An order marked
  as a test (`orders.is_test`) is left out: it takes stock but is not customers wanting it.
* *The window* is the 14 shop days ending today (today included, as far as it has got). A
  shop day starts when the shop's day starts (`shop_settings.day_starts`, midnight unless a
  bakery moved it) in the shop's time zone, the same day the Catalog's daily limits use.
* *Days sold* are the shop days of the window on which an item's net units were above zero.
* *Pace* is units sold ÷ 14. *Cover* is on hand ÷ pace, that is on hand × 14 ÷ units sold.

The card speaks for an item when on hand is above zero, it sold on 5 or more of the 14 days,
and its cover is 3 days or fewer. Shown: the 3 with the least cover.

The query starts from the sizes that have stock, so the `stock_movements (tenant_id,
variant_id, created_at)` index answers each one's last 14 days; nothing scans the whole log.
"""

from decimal import ROUND_HALF_UP, Decimal

import asyncpg

from alyr.catalog import Text
from alyr.core.words import ITEMS
from alyr.modules.agent.facts import Facts, Row
from alyr.modules.agent.model import Action, Finding, Insight
from alyr.modules.agent.words import B, agree, count, rich
from alyr.modules.items import qty

KEY = "stock_cover"
WINDOW_DAYS = 14
MIN_DAYS_SOLD = 5
COVER_DAYS = 3
SHOWN = 3
# More than the card shows, so the rule can say how many more there are, and bounded.
KEPT = 20

# One round trip. The shop day of a movement is its local time moved back by the day's start;
# the window begins WINDOW_DAYS - 1 shop days before today's, at the day's start.
_SQL = """
with clock as (
    select ds, ds - time '00:00' as shift,
           (($1::timestamptz at time zone $2) - (ds - time '00:00'))::date as today
    from (select coalesce((select day_starts from shop_settings limit 1), time '00:00') as ds) s
), per_day as (
    select v.id as variant_id, d.units
    from item_variants v
    join items i on i.id = v.item_id
    cross join clock c
    cross join lateral (
        select - sum(m.delta) as units
        from stock_movements m
        left join orders o on o.id = m.order_id
        where m.variant_id = v.id and m.day is null
          and m.kind in ('sold', 'cancelled_restocked')
          -- (the next line only lets the index narrow the range; the one after is exact)
          and m.created_at >= $1 - ($3::int + 1) * interval '1 day'
          and m.created_at >= ((c.today - $3::int + 1) + c.ds) at time zone $2
          and m.created_at < $1
          and coalesce(not o.is_test, true)
        group by ((m.created_at at time zone $2) - c.shift)::date
    ) d
    where i.stock_rule = 'count' and i.status = 'live' and not i.is_sample
      and v.active and v.on_hand > 0
), per_variant as (
    select variant_id, greatest(sum(units), 0) as sold,
           count(*) filter (where units > 0) as days_sold
    from per_day group by variant_id
), flagged as (
    select p.variant_id, p.sold, p.days_sold, v.on_hand, v.name as variant,
           v.name_ar as variant_ar, v.is_default, i.name, i.name_ar, i.unit,
           v.on_hand / p.sold as cover
    from per_variant p
    join item_variants v on v.id = p.variant_id
    join items i on i.id = v.item_id
    where p.sold > 0 and p.days_sold >= $4 and v.on_hand * $3 <= $5 * p.sold
)
select *, count(*) over () as total from flagged
order by cover, name, variant limit $6
"""


async def gather(conn: asyncpg.Connection, f: Facts) -> None:
    rows = await conn.fetch(
        _SQL, f.now, f.tz, WINDOW_DAYS, MIN_DAYS_SOLD, COVER_DAYS, KEPT
    )
    f.extra[KEY] = {
        "total": rows[0]["total"] if rows else 0,
        "items": [
            {
                "id": str(r["variant_id"]), "name": r["name"], "name_ar": r["name_ar"],
                "variant": "" if r["is_default"] else r["variant"],
                "variant_ar": "" if r["is_default"] else r["variant_ar"],
                "unit": r["unit"], "on_hand": r["on_hand"], "sold": r["sold"],
                "days_sold": r["days_sold"],
            }
            for r in rows
        ],
    }


def _cover(item: dict) -> Decimal:
    """Days of stock at the 14-day pace: on hand × 14 ÷ units sold. Exact, never a float."""
    return Decimal(item["on_hand"]) * WINDOW_DAYS / Decimal(item["sold"])


def _runs_short(item: dict) -> bool:
    on_hand, sold = Decimal(item["on_hand"]), Decimal(item["sold"])
    return (
        on_hand > 0 and sold > 0 and item["days_sold"] >= MIN_DAYS_SOLD
        and on_hand * WINDOW_DAYS <= COVER_DAYS * sold
    )


def _find(f: Facts) -> Finding | None:
    found = f.extra.get(KEY) or {}
    short = sorted(
        (i for i in found.get("items", []) if _runs_short(i)),
        key=lambda i: (_cover(i), i["name"], i["variant"]),
    )
    if not short:
        return None
    rows = [
        Row(i["id"], i["name"], dict(i, cover=_cover(i))) for i in short[:SHOWN]
    ]
    total = max(found.get("total", 0), len(short))
    return Finding(rows, ITEMS, {"window": WINDOW_DAYS, "n": total}, total=total)


# Days of cover, 1 to 3 after rounding, as Arabic says them after «نحو».
_AR_DAYS = {1: "يوم واحد", 2: "يومين", 3: "3 أيام"}


def _cover_text(cover: Decimal, lang: str) -> str:
    if cover < 1:
        return "أقل من يوم" if lang == "ar" else "under a day"
    days = int(cover.quantize(Decimal(1), rounding=ROUND_HALF_UP))
    if lang == "ar":
        return f"نحو {_AR_DAYS[days]}"
    return f"about {days} day" + ("" if days == 1 else "s")


def _name(row: Row, lang: str) -> str:
    d = row.detail
    base = (d["name_ar"] if lang == "ar" and d["name_ar"] else d["name"])
    size = (d["variant_ar"] if lang == "ar" and d["variant_ar"] else d["variant"])
    return f"{base} · {size}" if size else base


def _say(x: Finding, f: Facts, lang: str):
    # One placeholder set per row, so each name and figure stays whole on screen.
    parts, values = [], {}
    for i, r in enumerate(x.rows):
        values[f"n{i}"] = B(_name(r, lang))
        values[f"l{i}"] = B(qty.with_unit(r.detail["on_hand"], r.detail["unit"], lang))
        values[f"c{i}"] = _cover_text(r.detail["cover"], lang)
        parts.append(
            f"{{n{i}}}: بقي {{l{i}}}، يكفي {{c{i}}}" if lang == "ar"
            else f"{{n{i}}}: {{l{i}}} left, {{c{i}}}"
        )
    more = x.n - len(x.rows)
    if lang == "ar":
        second = "؛ ".join(parts) + "." + (f" و{more} أخرى." if more > 0 else "")
        verb = agree(x.n, "قد ينفد", "قد ينفدان", "قد تنفد")
        first = rich("{n} {verb} خلال 3 أيام بوتيرة آخر 14 يوماً",
                     n=count(x.n, ITEMS, lang), verb=verb)
    else:
        second = "; ".join(parts) + "." + (f" {more} more." if more > 0 else "")
        first = rich("{n} could run out within 3 days at the pace of the last 14 days",
                     n=count(x.n, ITEMS, lang))
    return first, rich(second, **values)


INSIGHT = Insight(
    KEY, 28, "knowledge", "orders",
    Text(
        "counted in stock, sold on 5 or more of the last 14 days, and the stock lasts 3 days "
        "or less at the average of those 14 days",
        "مخزون محسوب، بيع في 5 أيام أو أكثر من آخر 14 يوماً، ويكفي 3 أيام أو أقل "
        "بمتوسط هذه الأيام الـ14",
    ),
    _find, _say,
    action=Action(Text("Show the stock", "اعرض المخزون"), "/app/catalog"),
)
