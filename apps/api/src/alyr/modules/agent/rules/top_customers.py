"""top_customers (number 32, plan row C3): the shop's ten biggest spenders of the last 90 days,
said only when none of them has had a message from the shop in the last 30.

A customer is the one `_quiet_regulars` counts (role `customer`, WhatsApp ID not `TEST.`).
Spend is the total of their orders that are not test orders and not cancelled (as `_orders`
counts them) plus the price of their completed visits. A visit's price is the one copied onto
the booking when it was made (`bookings.price`, migration 0100), the same figure the
"booked for the next 7 days" card reads, so a later change of a service's price does not move
it. A visit to a service with no price adds nothing. Ties for tenth place go to the lower ID.

"Has had a message" is an outgoing message that was sent, delivered or read: a confirmation,
a reminder or a reply all count, because the owner's question is whether the shop has been in
touch. One query over 90 days of orders and visits; the message check is one probe per top-ten
customer on `messages (tenant_id, contact_id, created_at)`.
Information only: writing to them needs marketing consent, which ALYR does not collect yet.
Money: the card shows the shop's takings, so managers only.
"""

from datetime import timedelta

import asyncpg

from alyr.catalog import Text
from alyr.core.words import CUSTOMERS, PATIENTS, Noun
from alyr.modules.agent.facts import Facts, Row
from alyr.modules.agent.model import Finding, Insight
from alyr.modules.agent.words import B, count, money, rich

KEY = "top_customers"
TOP = 10
MIN_CUSTOMERS = 30
# Same words as `insights.INFO_ONLY`; `insights` imports this folder, so it cannot import it.
INFO_ONLY = Text("Information only.", "للعلم فقط.")


async def gather(conn: asyncpg.Connection, f: Facts) -> None:
    parts = []
    if "orders" in f.modules:
        parts.append(
            "select o.contact_id, sum(o.total)::bigint as v from orders o "
            "where not o.is_test and o.status <> 'cancelled' and o.created_at >= $1 "
            "and o.created_at < $2 group by o.contact_id"
        )
    if "bookings" in f.modules:
        parts.append(
            "select b.contact_id, sum(b.price)::bigint as v from bookings b "
            "where b.status = 'completed' and b.starts_at >= $1 and b.starts_at < $2 "
            "group by b.contact_id"
        )
    if not parts:
        return
    rows = await conn.fetch(
        f"with spend as ({' union all '.join(parts)}), "
        "per as (select s.contact_id, sum(s.v)::bigint as v from spend s "
        "        join contacts c on c.id = s.contact_id "
        "        where c.role = 'customer' and coalesce(c.wa_user_id, '') not like 'TEST.%' "
        "        group by s.contact_id having sum(s.v) > 0), "
        "ranked as (select contact_id, v, row_number() over (order by v desc, contact_id) as rn "
        "           from per) "
        "select r.rn, r.contact_id, c.name, r.v, "
        "  (select count(*) from per)::int as customers, "
        "  (select coalesce(sum(v), 0) from per)::bigint as total, "
        "  exists (select 1 from messages m where m.contact_id = r.contact_id "
        "    and m.direction = 'out' and m.sent_by_user is not null "
        "    and m.status in ('sent', 'delivered', 'read') "
        "    and m.created_at >= $3 and m.created_at < $2) as heard "
        "from ranked r join contacts c on c.id = r.contact_id where r.rn <= $4 order by r.rn",
        f.now - timedelta(days=90), f.now, f.now - timedelta(days=30), TOP,
    )
    if not rows:
        f.extra[KEY] = {"customers": 0, "total": 0, "top": [], "heard": 0}
        return
    f.extra[KEY] = {
        "customers": rows[0]["customers"],
        "total": rows[0]["total"],
        "top": [(str(r["contact_id"]), r["name"], r["v"]) for r in rows],
        "heard": sum(1 for r in rows if r["heard"]),
    }


def _who(f: Facts) -> Noun:
    return PATIENTS if f.business_type == "clinic" else CUSTOMERS


def percent(part: int, whole: int) -> int:
    """A whole percentage, half rounded up, rounded once."""
    return (200 * part + whole) // (2 * whole)


def _find(f: Facts) -> Finding | None:
    data = f.extra.get(KEY)
    if not data or data["customers"] < MIN_CUSTOMERS or len(data["top"]) < TOP or data["heard"]:
        return None
    spent = sum(v for _, _, v in data["top"])
    if spent <= 0 or data["total"] <= 0:
        return None
    return Finding(
        [Row(i, name, {"spent": v}) for i, name, v in data["top"]], _who(f),
        {"spent": spent, "total": data["total"], "customers": data["customers"],
         "pct": percent(spent, data["total"])},
        total=TOP,
    )


def _say(x: Finding, f: Facts, lang: str):
    n = x.numbers
    spent, total = B(money(n["spent"], lang)), B(money(n["total"], lang))
    patients = _who(f) is PATIENTS
    if lang == "ar":
        who = "مراجعيك" if patients else "عملائك"
        return (
            rich("أنفق أفضل 10 من " + who + " {v} خلال 90 يوماً، ولم تصلهم منك رسالة منذ شهر",
                 v=spent),
            rich("أنفق {c} ما مجموعه {t} في المدة نفسها، وحصتهم منه {p}.",
                 c=count(n["customers"], _who(f), lang), t=total, p=B(f"{n['pct']}%")),
        )
    who = "highest-spending patients" if patients else "best customers"
    return (
        rich("Your 10 " + who + " spent {v} in 90 days; none has heard from you in a month",
             v=spent),
        rich("That is {p} of the {t} that {c} spent in the same 90 days.", p=B(f"{n['pct']}%"),
             t=total, c=count(n["customers"], _who(f), lang)),
    )


INSIGHT = Insight(
    KEY, 32, "knowledge", "orders|bookings",
    Text("the 10 who spent most in 90 days, none sent a message in the last 30; "
         "30 or more who spent",
         "أكثر 10 أنفقوا خلال 90 يوماً، ولم تُرسل لأي منهم رسالة خلال آخر 30 يوماً؛ "
         "30 ممن أنفقوا أو أكثر"),
    _find, _say, status=INFO_ONLY, money=True,
)
