"""second_order (number 31, plan row C2): of the customers whose first order or visit was 31
to 90 days ago, how many came back within 30 days of it.

A customer is the one `_quiet_regulars` counts: a contact whose role is `customer` and whose
WhatsApp ID does not start with `TEST.`. An order counts when it is not a test order and not
cancelled (as `_orders` counts it); a visit counts when it is completed, at its start time.
"First" means there is no earlier order or completed visit at all, in any module the shop has
on. "Came back" means another order or visit on a later day (shop time) and within 30 days
after the first, so an order and its add-on minutes later are one visit to the shop.

The window ends 30 days ago, so every customer counted has had their whole 30 days. One query
over 90 days of orders and visits; whether a customer had an earlier one is answered, per
person counted, from the `(tenant_id, contact_id)` indexes of `orders` and `bookings`.
Information only: writing to them needs marketing consent, which ALYR does not collect yet.
"""

from datetime import timedelta

import asyncpg

from alyr.catalog import Text
from alyr.core.words import CUSTOMERS, PATIENTS, Noun
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.model import Finding, Insight
from alyr.modules.agent.words import B, agree, count, rich

KEY = "second_order"
MIN_FIRST_TIMERS = 20
# Same words as `insights.INFO_ONLY`; `insights` imports this folder, so it cannot import it.
INFO_ONLY = Text("Information only.", "للعلم فقط.")


async def gather(conn: asyncpg.Connection, f: Facts) -> None:
    orders = (
        "select o.contact_id, o.created_at as at from orders o "
        "where not o.is_test and o.status <> 'cancelled' and o.created_at >= $1 "
        "and o.created_at < $3"
    )
    visits = (
        "select b.contact_id, b.starts_at as at from bookings b "
        "where b.status = 'completed' and b.starts_at >= $1 and b.starts_at < $3"
    )
    earlier = []
    parts = []
    if "orders" in f.modules:
        parts.append(orders)
        earlier.append(
            "not exists (select 1 from orders o where o.contact_id = t.contact_id "
            "and not o.is_test and o.status <> 'cancelled' and o.created_at < $1)"
        )
    if "bookings" in f.modules:
        parts.append(visits)
        earlier.append(
            "not exists (select 1 from bookings b where b.contact_id = t.contact_id "
            "and b.status = 'completed' and b.starts_at < $1)"
        )
    if not parts:
        return
    # Per customer, in one pass: the first moment, and the first moment on a later day (shop
    # time). They came back when that is within 30 days of the first. (A subquery or join per
    # customer for this scans the window again for each person: 0.8 to 1.5 s for 3,000.)
    row = await conn.fetchrow(
        f"with win as ({' union all '.join(parts)}), "
        "days as (select contact_id, at, (at at time zone $4::text)::date as d, "
        "         min(at) over (partition by contact_id) as a0, "
        "         min((at at time zone $4::text)::date) over (partition by contact_id) as d0 "
        "         from win), "
        "t as (select contact_id, min(a0) as first_at, min(at) filter (where d > d0) as next_at "
        "      from days group by contact_id having min(a0) < $2) "
        "select count(*)::int as firsts, "
        "count(*) filter (where t.next_at <= t.first_at + interval '30 days')::int as back "
        "from t join contacts c on c.id = t.contact_id "
        "where c.role = 'customer' and coalesce(c.wa_user_id, '') not like 'TEST.%' "
        f"and {' and '.join(earlier)}",
        f.now - timedelta(days=90), f.now - timedelta(days=30), f.now, f.tz,
    )
    f.extra[KEY] = {"firsts": row["firsts"], "back": row["back"]}


def _who(f: Facts) -> Noun:
    return PATIENTS if f.business_type == "clinic" else CUSTOMERS


def percent(part: int, whole: int) -> int:
    """A whole percentage, half rounded up, rounded once."""
    return (200 * part + whole) // (2 * whole)


def _find(f: Facts) -> Finding | None:
    data = f.extra.get(KEY)
    if not data or data["firsts"] < MIN_FIRST_TIMERS:
        return None
    pct = percent(data["back"], data["firsts"])
    return Finding([], _who(f), {"back": data["back"], "pct": pct}, total=data["firsts"])


def _say(x: Finding, f: Facts, lang: str):
    back, rate = str(x.numbers["back"]), B(f"{x.numbers['pct']}%")
    if lang == "ar":
        verb = agree(x.n, "جاء لأول مرة", "جاءا لأول مرة", "جاؤوا لأول مرة")
        return (
            rich("{n} " + verb + "، عاد منهم {back} ({p})", n=count(x.n, _who(f), lang),
                 back=B(back), p=rate),
            rich("أول طلب أو زيارة لهم كانت قبل 31 إلى 90 يوماً. "
                 "العودة طلب أو زيارة في يوم لاحق خلال 30 يوماً من الأولى."),
        )
    noun = "first-time patients" if _who(f) is PATIENTS else "first-time customers"
    return (
        rich("{back} of {m} {noun} came back ({p})", back=B(back), m=B(str(x.n)), noun=noun,
             p=rate),
        rich("Their first order or visit was 31 to 90 days ago. Back means another order or "
             "visit on a later day, within 30 days of the first."),
    )


INSIGHT = Insight(
    KEY, 31, "knowledge", "orders|bookings",
    Text("first order or visit 31 to 90 days ago, back within 30 days; 20 or more first-timers",
         "أول طلب أو زيارة قبل 31 إلى 90 يوماً، والعودة خلال 30 يوماً؛ "
         "20 من القادمين لأول مرة أو أكثر"),
    _find, _say, status=INFO_ONLY,
)
