"""Discounts given (rule 35, `docs/work/insights-plan/plan.md` row M2).

"You gave away QAR 1,120 in discounts in 30 days." What the shop's orders were given in the
last 30 days by discounts, how many orders had one, and how much of the total came from the one
rule that gave the most.

* **Stored, never recomputed.** An order keeps what it was given in `order_discounts`
  (`amount_off`, a snapshot of the rule in words; migration 0040). This reads those rows. It does
  not price anything: `orders/totals.py` is the one pricing function. An order cancelled since
  (`status = 'cancelled'`, or its discount row `returned_at`) and the test line's orders
  (`is_test`) are not counted.
* **Only while Discounts is switched on.** The feature is off for every shop until switched on
  (`items/features.py`), and that is asked of `features.py`, never the business type. The count
  comes first, from one query on indexes that start with `tenant_id`; the switch is asked only
  when there are enough discounted orders to speak, so a shop with none pays for one query.
* **No claim about what the discount did.** There is no control group, so nothing here says the
  discounts made orders larger or more frequent. It says what was given and where it came from.
* **A manager's number.** It is the shop's own money, so `money=True`: the view shows it to
  owners and admins only, and nothing is gathered for anyone else.
"""

from datetime import timedelta

from alyr.catalog import Text
from alyr.core.words import ORDERS
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.model import Action, Finding, Insight
from alyr.modules.agent.words import B, agree, count, money, rich
from alyr.modules.items import features

KEY = "discounts"
DAYS = 30
MIN_ORDERS = 10  # orders with a discount, in the 30 days

_GIVEN = """
with given as (
    select od.order_id,
           coalesce(od.rule_id::text,
                    od.kind || '|' || od.code || '|' || od.name || '|' || od.rule_text) as rule_key,
           od.amount_off,
           od.created_at,
           coalesce(nullif(od.name, ''), nullif(od.code, ''), od.rule_text) as label,
           coalesce(nullif(od.name_ar, ''), nullif(od.name, ''), nullif(od.code, ''),
                    od.rule_text_ar) as label_ar
      from orders o
      join order_discounts od on od.tenant_id = o.tenant_id and od.order_id = o.id
     where o.created_at >= $1 and o.created_at < $2
       and not o.is_test and o.status <> 'cancelled' and o.discount_total > 0
       and od.returned_at is null
)
select rule_key,
       grouping(rule_key)::int as whole,
       coalesce(sum(amount_off), 0)::bigint as amount,
       count(distinct order_id)::int as orders,
       (array_agg(label order by created_at desc))[1] as label,
       (array_agg(label_ar order by created_at desc))[1] as label_ar
  from given
 group by grouping sets ((rule_key), ())
"""


async def gather(conn, f: Facts) -> None:
    since = f.now - timedelta(days=DAYS)
    rows = await conn.fetch(_GIVEN, since, f.now)
    whole = next((r for r in rows if r["whole"]), None)
    if whole is None or whole["orders"] < MIN_ORDERS:
        return
    if not (await features.load(conn)).on("discounts"):
        return
    top = max(
        (r for r in rows if not r["whole"]),
        key=lambda r: (r["amount"], r["orders"], r["label"] or ""),
    )
    f.extra[KEY] = {
        "total": whole["amount"],
        "orders": whole["orders"],
        "top_amount": top["amount"],
        "top_label": top["label"] or "",
        "top_label_ar": top["label_ar"] or "",
    }


def _share(top: int, total: int) -> int:
    """Whole percent. Never "100%" unless the one rule gave all of it."""
    share = round(100 * top / total)
    return 99 if share >= 100 and top < total else share


def _find(f: Facts) -> Finding | None:
    data = f.extra.get(KEY)
    if not f.money or not data or data["orders"] < MIN_ORDERS or data["total"] <= 0:
        return None
    # Only the rule's name goes into the fingerprint: a card set aside with "Not now" comes back
    # when another rule gives the most, not with every new discounted order.
    return Finding([], ORDERS, {"top": data["top_label"]}, total=data["orders"])


def _say(x: Finding, f: Facts, lang: str):
    data = f.extra[KEY]
    share = _share(data["top_amount"], data["total"])
    amount = B(money(data["total"], lang))
    all_of_it = share == 100
    orders = count(x.n, ORDERS, lang)
    if lang == "ar":
        name = B(data["top_label_ar"] or data["top_label"] or "قاعدة خصم")
        has = agree(x.n, "عليه خصم", "عليهما خصم", "عليها خصم")
        if all_of_it:
            tail = rich("{o} {has}، والمبلغ كله من «{name}».", o=orders, has=has, name=name)
        else:
            tail = rich("{o} {has}، و{share} من المبلغ جاء من «{name}».",
                        o=orders, has=has, share=B(f"{share}%"), name=name)
        return rich("بلغت الخصومات التي منحتها {m} خلال 30 يوماً", m=amount), tail
    name = B(data["top_label"] or "a discount rule")
    if all_of_it:
        tail = rich("{o} had a discount, all of it from “{name}”.", o=orders, name=name)
    else:
        tail = rich("{o} had a discount; {share} of the amount came from “{name}”.",
                    o=orders, share=B(f"{share}%"), name=name)
    return rich("You gave away {m} in discounts in 30 days", m=amount), tail


INSIGHT = Insight(
    KEY, 35, "knowledge", "orders",
    Text(
        "discounts taken off orders in 30 days (not cancelled, not test), with 10 or more "
        "orders that had one; only while Discounts is switched on",
        "الخصومات المحسومة من الطلبات خلال 30 يوماً (دون الملغاة ودون التجريبية)، مع 10 طلبات "
        "أو أكثر عليها خصم؛ وفقط ما دامت الخصومات مفعّلة",
    ),
    _find, _say,
    action=Action(Text("Open the Catalog, then Discounts", "افتح الكتالوج ثم الخصومات"),
                  "/app/catalog"),
    money=True,
)
