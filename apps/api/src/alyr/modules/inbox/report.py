"""The team inbox in the weekly report: who wrote, who was new, and how much of the
answering ALYR did."""

from datetime import datetime

import asyncpg

from alyr.core.words import CUSTOMERS, counted

TITLE = {"en": "Team inbox", "ar": "صندوق الفريق"}


async def numbers(conn: asyncpg.Connection, start: datetime, end: datetime, tz: str,
                  current: bool) -> dict:
    out = {
        "wrote": await conn.fetchval(
            "select count(distinct m.contact_id) from messages m "
            "join contacts c on c.id = m.contact_id "
            "where c.role = 'customer' and m.direction = 'in' "
            "and m.created_at >= $1 and m.created_at < $2",
            start, end,
        )
    }
    if not current:
        return out
    out["new"] = await conn.fetchval(
        "select count(*) from contacts where role = 'customer' "
        "and created_at >= $1 and created_at < $2",
        start, end,
    )
    replies = await conn.fetchrow(
        "select count(*) filter (where m.sent_by <> '') as by_team, "
        "count(*) filter (where m.sent_by = '') as automatic "
        "from messages m join contacts c on c.id = m.contact_id "
        "where c.role = 'customer' and m.direction = 'out' "
        "and m.status in ('sent', 'delivered', 'read') "
        "and m.created_at >= $1 and m.created_at < $2",
        start, end,
    )
    out.update(dict(replies))
    return out


def active(n: dict) -> bool:
    return bool(n["wrote"] or n["by_team"] or n["automatic"])


def headline(n: dict, lang: str) -> str:
    if not n["wrote"]:
        return "لا رسائل من العملاء" if lang == "ar" else "no customer messages"
    people = counted(n["wrote"], CUSTOMERS, lang)
    return f"راسلك {people}" if lang == "ar" else f"{people} wrote to you"


def lines(n: dict, before: dict | None, lang: str) -> list[str]:
    ar = lang == "ar"
    if not active(n):
        return ["لم يراسلك أي عميل هذا الأسبوع." if ar else "No customer messages this week."]
    first = f"عملاء راسلوك: {n['wrote']}" if ar else f"Customers who wrote: {n['wrote']}"
    if before is not None:
        first += f" (الأسبوع الماضي {before['wrote']})" if ar else f" (last week {before['wrote']})"
    return [
        first,
        f"عملاء جدد: {n['new']}" if ar else f"New customers: {n['new']}",
        f"ردود فريقك: {n['by_team']}" if ar else f"Replies by your team: {n['by_team']}",
        f"رسائل أرسلتها ALYR نيابة عنك: {n['automatic']}" if ar
        else f"Messages ALYR sent for you: {n['automatic']}",
    ]
