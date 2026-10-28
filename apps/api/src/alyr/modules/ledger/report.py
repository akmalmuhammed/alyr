"""Credit accounts in the weekly report: money collected, reminders sent, and what is
still owed. For a trader this is the number that matters most."""

from datetime import datetime

import asyncpg

from alyr.core.normalise import fmt_qar
from alyr.core.words import CUSTOMERS, counted
from alyr.modules.ledger import service

TITLE = {"en": "Credit accounts", "ar": "الحسابات الآجلة"}
REMINDERS = ("payment_reminder", "payment_reminder_overdue", "payment_reminder_final")
LATE_BUCKETS = ("d61_90", "d90_plus")


async def numbers(conn: asyncpg.Connection, start: datetime, end: datetime, tz: str,
                  current: bool) -> dict:
    # Credit given leaves out a sale that was reversed: a cancelled order is not credit.
    row = await conn.fetchrow(
        "select coalesce(sum(amount) filter (where kind = 'payment'), 0)::bigint as collected, "
        "count(distinct contact_id) filter (where kind = 'payment') as payers, "
        f"coalesce(sum(amount) filter (where {service.STANDING_SALE}), 0)::bigint "
        "as credit_given "
        "from ledger_entries where created_at >= $1 and created_at < $2",
        start, end,
    )
    out = dict(row)
    if not current:
        return out
    out["by_link"] = await conn.fetchval(
        "select coalesce(sum(amount), 0)::bigint from payment_requests "
        "where status = 'paid' and order_id is null and booking_id is null "
        "and paid_at >= $1 and paid_at < $2",
        start, end,
    )
    out["reminders"] = await conn.fetchval(
        "select count(*) from messages where direction = 'out' "
        "and status not in ('blocked', 'failed') and payload->>'template' = any($3) "
        "and created_at >= $1 and created_at < $2",
        start, end, list(REMINDERS),
    )
    out["promised"] = await conn.fetchval(
        "select count(distinct contact_id) from messages where direction = 'in' "
        "and payload->>'reply_id' = 'promise' and created_at >= $1 and created_at < $2",
        start, end,
    )
    # What is owed is today's figure, not the week's: it is what the owner acts on.
    owing = [c for c in (await service.summary(conn))["customers"] if c["balance"] > 0]
    late = [c for c in owing if any(c["buckets"][b] for b in LATE_BUCKETS)]
    out["owed"] = sum(c["balance"] for c in owing)
    out["owing"] = len(owing)
    out["late"] = sum(c["buckets"][b] for c in late for b in LATE_BUCKETS)
    out["late_customers"] = len(late)
    return out


def active(n: dict) -> bool:
    return bool(n["collected"] or n["credit_given"] or n["owed"])


def headline(n: dict, lang: str) -> str:
    money = fmt_qar(n["collected"])
    return f"تم تحصيل {money}" if lang == "ar" else f"{money} collected"


def lines(n: dict, before: dict | None, lang: str) -> list[str]:
    ar = lang == "ar"
    people = counted(n["payers"], CUSTOMERS, lang)
    first = (
        f"تم تحصيل {fmt_qar(n['collected'])} من {people}" if ar
        else f"Collected: {fmt_qar(n['collected'])} from {people}"
    )
    if before is not None:
        first += (
            f" (الأسبوع الماضي {fmt_qar(before['collected'])})" if ar
            else f" (last week {fmt_qar(before['collected'])})"
        )
    out = [first]
    if n["by_link"]:
        out.append(
            f"عبر روابط الدفع من ALYR: {fmt_qar(n['by_link'])}" if ar
            else f"Paid through ALYR payment links: {fmt_qar(n['by_link'])}"
        )
    if n["credit_given"]:
        out.append(
            f"آجل جديد: {fmt_qar(n['credit_given'])}" if ar
            else f"New credit given: {fmt_qar(n['credit_given'])}"
        )
    if n["reminders"]:
        out.append(
            f"تذكيرات دفع أرسلتها ALYR نيابة عنك: {n['reminders']}" if ar
            else f"Payment reminders ALYR sent for you: {n['reminders']}"
        )
    if n["promised"]:
        promised = counted(n["promised"], CUSTOMERS, lang)
        out.append(f"وعدوا بالسداد: {promised}" if ar else f"Promised to pay: {promised}")
    owing = counted(n["owing"], CUSTOMERS, lang)
    out.append(
        f"المستحق لك اليوم: {fmt_qar(n['owed'])} على {owing}" if ar
        else f"Still owed to you today: {fmt_qar(n['owed'])} from {owing}"
    )
    if n["late"]:
        late = counted(n["late_customers"], CUSTOMERS, lang)
        out.append(
            f"متأخر أكثر من 60 يوماً: {fmt_qar(n['late'])} على {late}" if ar
            else f"Overdue more than 60 days: {fmt_qar(n['late'])} from {late}"
        )
        if not n["reminders"]:
            out.append(
                "الخطوة التالية: أرسل التذكيرات من الحسابات الآجلة." if ar
                else "Next step: send reminders from Credit accounts."
            )
    return out
