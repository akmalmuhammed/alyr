"""Bookings in the weekly report: who came, who did not, and what is booked next. For
a salon, a clinic or a home-service business."""

from datetime import datetime, timedelta

import asyncpg

from alyr.core.words import VISITS, counted
from alyr.modules.agent.words import data_from, plain
from alyr.modules.history import imports as history_imports

TITLE = {"en": "Bookings", "ar": "الحجوزات"}
DAYS = {
    "en": ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"),
    "ar": ("الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"),
}


async def numbers(conn: asyncpg.Connection, start: datetime, end: datetime, tz: str,
                  current: bool) -> dict:
    row = await conn.fetchrow(
        "select count(*) filter (where status = 'completed') as came, "
        "count(*) filter (where status = 'no_show') as no_shows, "
        "count(*) filter (where status = 'cancelled') as cancelled, "
        # Visits that have passed but nobody has marked as came or no-show.
        "count(*) filter (where status = 'booked' and starts_at < now()) as unmarked "
        "from bookings where starts_at >= $1 and starts_at < $2",
        start, end,
    )
    out = dict(row)
    out["made"] = await conn.fetchval(
        "select count(*) from bookings where created_at >= $1 and created_at < $2", start, end
    )
    if not current:
        return out
    # Where the visits come from when a file was imported, and whether anything was booked in
    # ALYR itself: without it "booked for next week" and "reminders sent" would be a 0 that
    # is not ALYR's to count (spec 070, task I5).
    out["from"] = await history_imports.data_from(conn)
    out["live"] = bool(await conn.fetchval(
        "select exists (select 1 from bookings where history_import_id is null)"))
    out["reminders"] = await conn.fetchval(
        "select count(*) from bookings where reminded_at >= $1 and reminded_at < $2",
        start, end,
    )
    out["next_week"] = await conn.fetchval(
        "select count(*) from bookings where status = 'booked' "
        "and starts_at >= $1 and starts_at < $2",
        end, end + timedelta(days=7),
    )
    busiest = await conn.fetchrow(
        "select extract(isodow from starts_at at time zone $3)::int as day, count(*) as n "
        "from bookings where starts_at >= $1 and starts_at < $2 "
        "and status in ('booked', 'completed') group by 1 order by n desc, 1 limit 1",
        start, end, tz,
    )
    out["busiest"] = busiest["day"] if busiest else None
    return out


def active(n: dict) -> bool:
    return bool(n["came"] or n["no_shows"] or n["cancelled"] or n["unmarked"] or n["made"])


def headline(n: dict, lang: str) -> str:
    if not active(n):
        return "لا زيارات" if lang == "ar" else "no visits"
    came = counted(n["came"], VISITS, lang)
    if lang == "ar":
        return f"{came}، وغياب {n['no_shows']}"
    return f"{came}, {n['no_shows']} no-shows"


def _imported_only(n: dict) -> bool:
    return bool(n.get("from")) and not n.get("live", True)


def lines(n: dict, before: dict | None, lang: str) -> list[str]:
    out = _lines(n, before, lang)
    if n.get("from"):  # what the numbers are made of, and how far they go
        out.append(plain(data_from(n["from"], lang)))
    return out


def _lines(n: dict, before: dict | None, lang: str) -> list[str]:
    ar = lang == "ar"
    imported = _imported_only(n)  # a file's visits: nothing booked or reminded by ALYR to count
    if not active(n):
        return [
            "لا زيارات هذا الأسبوع." if imported and ar
            else "No visits this week." if imported
            else "لا زيارات ولا حجوزات جديدة هذا الأسبوع." if ar
            else "No visits and no new bookings this week.",
            *([] if imported else [
                f"محجوز للأسبوع القادم: {n['next_week']}" if ar
                else f"Booked for next week: {n['next_week']}"]),
        ]
    first = f"حضروا: {n['came']}" if ar else f"Customers who came: {n['came']}"
    if before is not None:
        first += f" (الأسبوع الماضي {before['came']})" if ar else f" (last week {before['came']})"
    out = [first, f"لم يحضروا: {n['no_shows']}" if ar else f"No-shows: {n['no_shows']}"]
    if n["cancelled"]:
        out.append(f"ملغاة: {n['cancelled']}" if ar else f"Cancelled: {n['cancelled']}")
    if n["unmarked"]:
        out.append(
            f"لم تُسجَّل بعد: {n['unmarked']} (سجّلها في تبويب الحجوزات)" if ar
            else f"Not marked yet: {n['unmarked']} (mark them in the Bookings tab)"
        )
    if not imported:
        out.append(f"حجوزات جديدة: {n['made']}" if ar else f"New bookings made: {n['made']}")
        out.append(
            f"تذكيرات أرسلتها ALYR نيابة عنك: {n['reminders']}" if ar
            else f"Reminders ALYR sent for you: {n['reminders']}"
        )
        out.append(
            f"محجوز للأسبوع القادم: {n['next_week']}" if ar
            else f"Booked for next week: {n['next_week']}"
        )
    if n["busiest"]:
        day = DAYS[lang if ar else "en"][n["busiest"] - 1]
        out.append(f"أكثر الأيام ازدحاماً: {day}" if ar else f"Busiest day: {day}")
    return out
