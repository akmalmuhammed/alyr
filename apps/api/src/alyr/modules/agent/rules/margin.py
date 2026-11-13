"""M1, "your best sellers earn you the least per sale" (docs/work/insights-plan/plan.md).

By rule: over 30 days, take the items whose sales have a cost recorded on at least 80% of
the units sold. Rank them by units sold. If one of the 3 best sellers is among the lowest
third of those items by margin per unit, and under the average, say so.

**The cost is the shop's secret** (specs/014-pricing-pack, `modules/items/costs.py`): an owner
or an admin may see it, nobody else, and only while "Cost price and margin" is switched on.
So this rule is kept out of reach three times over:

* `Insight.money` is True: the view drops it for anyone who may not see money;
* `rules.gather_all` does not call `gather` for such a reader (`f.money` is False);
* `gather` and `find` each check `f.money` again, so a change in either caller cannot
  let a cost into `Facts` or onto a card.

Cost is read only from `order_item_costs`, the unit cost an order kept when it was placed
(the same table `costs.order_margins` reads), never from the item. A line placed while the
feature was off, or before a cost was kept, has no row and counts as not costed.

One query over the last 30 days, answered from `orders_created (tenant_id, created_at)` and
the order's lines; the feature switch is asked only when the shop has a kept cost at all.
"""

from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

import asyncpg

from alyr.catalog import Text
from alyr.core.words import ITEMS
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.model import Action, Finding, Insight
from alyr.modules.agent.words import B, count, money, rich
from alyr.modules.items import features

KEY = "margin"
WINDOW_DAYS = 30
MIN_UNITS = 30  # units sold, of the items the card rests on
MIN_ITEMS = 5  # items with a cost recorded
BEST = 3  # the best sellers looked at
# A cost on at least this share of an item's units sold: 4 in 5.
COVERED_NUM, COVERED_DEN = 4, 5

SHOW_ITEMS = Text("Show the items", "اعرض الأصناف")


# Items sold in the window (params: from, to), with the kept cost beside each line.
SOLD = (
    "select coalesce(l.item_id::text, l.name) as k, "
    "min(coalesce(i.name, l.name)) as name, min(coalesce(i.name_ar, '')) as name_ar, "
    "sum(l.quantity) as units, "
    "coalesce(sum(l.quantity) filter (where c.order_item_id is not null), 0) as costed, "
    # A line is its price times its quantity, rounded once, less its discount; the same as
    # `costs.order_margins`. Delivery fees are not in it.
    "coalesce(sum(round(l.price * l.quantity) - l.discount) "
    "  filter (where c.order_item_id is not null), 0) as revenue, "
    "coalesce(sum(round(c.unit_cost * l.quantity)), 0) as cost "
    "from orders o join order_items l on l.order_id = o.id "
    "left join order_item_costs c on c.order_item_id = l.id "
    "left join items i on i.id = l.item_id "
    "where not o.is_test and o.status <> 'cancelled' "
    "and o.created_at >= $1 and o.created_at < $2 "
    "group by 1"
)


async def gather(conn: asyncpg.Connection, f: Facts) -> None:
    """Every item sold in the last 30 days, with its units, the units that kept a cost, and
    what those earned (price after discount, less cost). The deciding is in `find`."""
    if not f.money:
        return  # a reader who may not see money is never given a cost
    if not await conn.fetchval("select exists (select 1 from order_item_costs)"):
        return  # no cost was ever kept: nothing to say, and nothing more to ask
    if not await features.enabled(conn, "cost_margin"):
        return  # switched off: hides and stops (spec 014)
    rows = await conn.fetch(SOLD, f.now - timedelta(days=WINDOW_DAYS), f.now)
    f.extra[KEY] = {
        "items": [
            {"key": r["k"], "name": r["name"], "name_ar": r["name_ar"],
             "units": Decimal(r["units"]), "costed": Decimal(r["costed"]),
             "profit": int(r["revenue"]) - int(r["cost"])}
            for r in rows
        ],
    }


def _per_unit(profit: int, units: Decimal) -> int:
    """Dirhams earned on one unit, to the whole dirham, halves away from zero."""
    return int((Decimal(profit) / units).quantize(Decimal(1), ROUND_HALF_UP))


def find(f: Facts) -> Finding | None:
    data = f.extra.get(KEY)
    if not f.money or not data:
        return None
    sold = data["items"]
    # Items whose units have a cost kept on at least 4 in 5 of them, with the margin of one
    # unit (not written back into the gathered data).
    known = [
        {**i, "margin": _per_unit(i["profit"], i["costed"])} for i in sold
        if i["costed"] > 0 and i["costed"] * COVERED_DEN >= i["units"] * COVERED_NUM
    ]
    if len(known) < MIN_ITEMS or sum(i["units"] for i in known) < MIN_UNITS:
        return None
    average = _per_unit(sum(i["profit"] for i in known), sum(i["costed"] for i in known))
    best = sorted(known, key=lambda i: (-i["units"], i["name"]))[:BEST]
    # The lowest third by margin per unit; ties fall to the name so the same shop reads the
    # same card twice.
    by_margin = sorted(known, key=lambda i: (i["margin"], i["name"]))
    lowest = {i["key"] for i in by_margin[: len(known) // 3]}
    hits = [i for i in best if i["key"] in lowest and i["margin"] < average]
    if not hits:
        return None
    first = hits[0]  # the one that sells the most
    return Finding(
        [], ITEMS,
        {"name": first["name"], "name_ar": first["name_ar"], "margin": first["margin"],
         "average": average, "costed": len(known), "sold": len(sold)},
        total=len(hits),
    )


def say(x: Finding, f: Facts, lang: str):
    n = x.numbers
    values = {
        "m": B(money(n["margin"], lang)), "avg": B(money(n["average"], lang)),
        "costed": B(str(n["costed"])),
    }
    if lang == "ar":
        name = B(n["name_ar"] or n["name"])
        coverage = "الأصناف المباعة خلال 30 يوماً: {sold}، وتكلفة {costed} منها مسجلة."
        if x.n == 1:
            return (
                rich("{name} من أكثر أصنافك مبيعاً، وهامشه {m} للبيعة", name=name, **values),
                rich("متوسط الهامش في أصنافك {avg} للبيعة. " + coverage,
                     sold=B(str(n["sold"])), **values),
            )
        return (
            rich("{n} من أصنافك الثلاثة الأكثر مبيعاً من الأقل هامشاً للبيعة", n=B(str(x.n))),
            rich("{name}: {m} للبيعة، والمتوسط {avg}. " + coverage, name=name,
                 sold=B(str(n["sold"])), **values),
        )
    coverage = "Costs are kept for {costed} of your {sold} sold in 30 days."
    sold = B(count(n["sold"], ITEMS, lang))
    if x.n == 1:
        return (
            rich("{name} is a best seller and earns {m} a sale", name=B(n["name"]), **values),
            rich("Your average is {avg} a sale. " + coverage, sold=sold, **values),
        )
    return (
        rich("{n} of your 3 best sellers are among your lowest earners per sale",
             n=B(str(x.n))),
        rich("{name} earns {m} a sale, against {avg} on average. " + coverage,
             name=B(n["name"]), sold=sold, **values),
    )


INSIGHT = Insight(
    KEY, 30, "knowledge", "orders",
    Text("a top-3 seller among the lowest third by margin per sale, 30 days, costs kept on "
         "5 items and 30 units sold",
         "أحد أكثر 3 أصناف مبيعاً ضمن الثلث الأدنى هامشاً للبيعة خلال 30 يوماً، مع تكلفة "
         "مسجلة لـ5 أصناف و30 وحدة مباعة"),
    find, say, Action(SHOW_ITEMS, "/app/catalog"), money=True,
)
