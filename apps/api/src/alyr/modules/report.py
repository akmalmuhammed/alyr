"""The weekly result report (ALY-75, decision D-030).

Every Sunday at 9 in the morning, shop time, the owner hears in numbers what ALYR did
for the shop in the seven days before. Each product the shop uses adds its own section,
so a trader reads about money collected and still owed, a restaurant about orders, and
a salon about visits and no-shows. An owner who sees the result every week renews
without being asked.

It goes on WhatsApp to the shop's own numbers marked to receive it, and by email to the
shop's owners when email is set up. Outside WhatsApp's 24-hour window only an approved
template may be sent, so the owner then gets a one-line summary and sends REPORT to read
the whole report. Inside the window the whole report arrives at once.

What was sent is kept in `weekly_reports`, so a week is never reported twice.
"""

import logging
from datetime import UTC, date, datetime, time, timedelta
from html import escape
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.channels.base import InboundMessage, OutboundMessage
from alyr.core import consent, jobs, mail, templates
from alyr.core.normalise import has_arabic
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules.bookings import report as bookings_report
from alyr.modules.inbox import report as inbox_report
from alyr.modules.ledger import report as ledger_report
from alyr.modules.orders import report as orders_report

log = logging.getLogger("alyr.report")

JOB = "weekly_report"
# Sunday, the first day of the working week in Qatar.
SEND_WEEKDAY = 6
SEND_HOUR = 9
REPORT_WORDS = {"report", "weekly report", "تقرير", "التقرير"}

# In the order they appear: money first, then orders, visits and chats.
SECTIONS = (
    ("ledger", ledger_report),
    ("orders", orders_report),
    ("bookings", bookings_report),
    ("inbox", inbox_report),
)
PARTS = dict(SECTIONS)

_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"


# ----------------------------------------------------------------- the calendar

def _sunday(day: date) -> date:
    return day - timedelta(days=(day.weekday() - SEND_WEEKDAY) % 7)


def bounds(week_start: date, tz: str) -> tuple[datetime, datetime]:
    """The reported week, Sunday 00:00 to the next Sunday 00:00, in the shop's zone."""
    start = datetime.combine(week_start, time(0), ZoneInfo(tz))
    return start, start + timedelta(days=7)


def last_full_week(now: datetime, tz: str) -> date:
    """The Sunday that began the last complete week."""
    return _sunday(now.astimezone(ZoneInfo(tz)).date()) - timedelta(days=7)


def next_send(now: datetime, tz: str) -> tuple[date, datetime]:
    """The week whose report goes out next, and when it goes."""
    local = now.astimezone(ZoneInfo(tz))
    at = datetime.combine(_sunday(local.date()), time(SEND_HOUR), ZoneInfo(tz))
    if at <= now:
        at += timedelta(days=7)
    return at.date() - timedelta(days=7), at


def label(week_start: date, lang: str) -> str:
    end = week_start + timedelta(days=6)
    if lang == "ar":
        return f"من {week_start.day}/{week_start.month} إلى {end.day}/{end.month}"
    if week_start.month == end.month:
        return f"{week_start.day} to {end.day} {end:%b}"
    return f"{week_start.day} {week_start:%b} to {end.day} {end:%b}"


# --------------------------------------------------------- building the report

async def _timezone(conn: asyncpg.Connection) -> str:
    return await conn.fetchval(f"select timezone from tenants where id = {_TENANT}") or "Asia/Qatar"


async def _shop(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow(f"select name, name_ar from tenants where id = {_TENANT}")
    return {"en": row["name"], "ar": row["name_ar"] or row["name"]}


async def last_week(conn: asyncpg.Connection) -> date:
    """The Sunday that began this shop's last complete week."""
    return last_full_week(datetime.now(UTC), await _timezone(conn))


async def build(conn: asyncpg.Connection, week_start: date) -> dict:
    """The numbers for one week, one section for each product the shop has switched on.
    Each section carries the week before too, so the report can say which way it went."""
    tz = await _timezone(conn)
    start, end = bounds(week_start, tz)
    rows = await conn.fetch("select module_key from tenant_modules where enabled")
    modules = {r["module_key"] for r in rows}
    sections = []
    for key, part in SECTIONS:
        if key not in modules:
            continue
        sections.append({
            "key": key,
            "numbers": await part.numbers(conn, start, end, tz, current=True),
            "before": await part.numbers(conn, start - timedelta(days=7), start, tz, current=False),
        })
    return {"week_start": week_start.isoformat(), "sections": sections}


def render(report: dict, shop: dict, lang: str) -> dict:
    """The report as one reader sees it: a section per product, the whole message, and
    the one-line summary the WhatsApp template carries."""
    lang = "ar" if lang == "ar" else "en"
    week = date.fromisoformat(report["week_start"])
    when = label(week, lang)
    sections = []
    for section in report["sections"]:
        part = PARTS[section["key"]]
        sections.append({
            "key": section["key"],
            "title": part.TITLE[lang],
            "headline": part.headline(section["numbers"], lang),
            "lines": part.lines(section["numbers"], section["before"], lang),
        })
    heading = (
        f"تقرير ALYR الأسبوعي: {shop[lang]}" if lang == "ar"
        else f"ALYR weekly report: {shop[lang]}"
    )
    blocks = [f"{heading}\n{when}"]
    blocks += ["\n".join([s["title"], *s["lines"]]) for s in sections]
    busy = [
        view for view, section in zip(sections, report["sections"], strict=True)
        if PARTS[section["key"]].active(section["numbers"])
    ]
    summary = ("؛ " if lang == "ar" else "; ").join(s["headline"] for s in busy or sections)
    return {
        "label": when, "title": heading, "sections": sections,
        "text": "\n\n".join(blocks), "summary": summary,
    }


async def preview(conn: asyncpg.Connection, weeks_ago: int = 1) -> dict:
    """The report for the workspace: last week by default, 0 for the week so far."""
    week = await last_week(conn) + timedelta(days=7 * (1 - weeks_ago))
    report = await build(conn, week)
    shop = await _shop(conn)
    views = {lang: render(report, shop, lang) for lang in ("en", "ar")}
    sent_at = await conn.fetchval("select sent_at from weekly_reports where week_start = $1", week)
    return {
        "week_start": week.isoformat(),
        "label": {lang: views[lang]["label"] for lang in views},
        "sections": [
            {
                "key": en["key"],
                "title": {"en": en["title"], "ar": ar["title"]},
                "headline": {"en": en["headline"], "ar": ar["headline"]},
                "lines": {"en": en["lines"], "ar": ar["lines"]},
            }
            for en, ar in zip(views["en"]["sections"], views["ar"]["sections"], strict=True)
        ],
        "text": {lang: views[lang]["text"] for lang in views},
        "sent_at": sent_at.isoformat() if sent_at else None,
    }


# ------------------------------------------------------------------ who gets it

async def enabled(conn: asyncpg.Connection) -> bool:
    return bool(await conn.fetchval(
        "select coalesce((select weekly_report from shop_settings), true)"
    ))


async def recipients(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return await conn.fetch(
        "select id, name, lang from contacts where role = 'staff' and weekly_report order by name"
    )


async def settings(conn: asyncpg.Connection) -> dict:
    staff = await conn.fetch(
        "select id, name, phone, weekly_report from contacts where role = 'staff' order by name"
    )
    return {
        "enabled": await enabled(conn),
        "recipients": [
            {"id": str(s["id"]), "name": s["name"], "phone": s["phone"],
             "receives": s["weekly_report"]}
            for s in staff
        ],
    }


async def update_settings(
    conn: asyncpg.Connection, on: bool | None, receivers: list[UUID] | None
) -> dict:
    if on is not None:
        await conn.execute(
            "insert into shop_settings (weekly_report) values ($1) "
            "on conflict (tenant_id) do update set weekly_report = excluded.weekly_report",
            on,
        )
    if receivers is not None:
        known = {
            r["id"] for r in await conn.fetch(
                "select id from contacts where role = 'staff' and id = any($1)", receivers
            )
        }
        if known != set(receivers):
            raise LookupError("only the shop's own staff numbers can receive the report")
        newly = await conn.fetch(
            "select id from contacts where role = 'staff' and id = any($1) and not weekly_report",
            receivers,
        )
        await conn.execute(
            "update contacts set weekly_report = (id = any($1)) where role = 'staff'", receivers
        )
        # The shop asking for its own report is the agreement to receive it.
        for row in newly:
            await consent.record(conn, row["id"], "service", "granted", "weekly_report_setting")
    return await settings(conn)


# Domains reserved for examples and tests (RFC 2606). The demo shops' people use them,
# and nothing should ever be emailed there.
RESERVED_DOMAINS = (".example", ".test", ".invalid", ".localhost")


def _deliverable(address: str) -> bool:
    local, at, domain = address.rpartition("@")
    domain = domain.lower()
    if not (local and at and "." in domain):
        return False
    return not domain.endswith(RESERVED_DOMAINS)


async def _owner_emails(conn: asyncpg.Connection) -> list[str]:
    rows = await conn.fetch(
        "select u.email from memberships m join users u on u.id = m.user_id where m.role = 'owner'"
    )
    return [r["email"] for r in rows if _deliverable(r["email"])]


# ------------------------------------------------------------------ sending it

async def deliver(conn: asyncpg.Connection, outbound: Outbound, report: dict) -> int:
    """Send the report to every staff number marked to receive it. `conn` is
    tenant-scoped. Returns how many messages were queued."""
    shop = await _shop(conn)
    sent = 0
    for person in await recipients(conn):
        view = render(report, shop, person["lang"])
        result = await outbound.send(conn, templates.notice(
            person["id"], "weekly_report", person["lang"], view["text"],
            shop[person["lang"] if person["lang"] == "ar" else "en"], view["label"],
            view["summary"],
        ))
        sent += result.blocked is None
    return sent


def email(report: dict, shop: dict) -> tuple[str, str, str]:
    """Subject, plain text and HTML, English then Arabic: the owner's language is not
    known from an email address."""
    en, ar = render(report, shop, "en"), render(report, shop, "ar")
    subject = f"{en['title']}, {en['label']}"
    text = f"{en['text']}\n\n---\n\n{ar['text']}"

    def block(view: dict, rtl: bool) -> str:
        direction = ' dir="rtl" style="text-align:right"' if rtl else ""
        parts = [f"<h2 style=\"font-size:17px;margin:0 0 4px\">{escape(view['title'])}</h2>"
                 f"<p style=\"margin:0 0 16px;color:#5f666d\">{escape(view['label'])}</p>"]
        for section in view["sections"]:
            items = "".join(f"<li>{escape(line)}</li>" for line in section["lines"])
            parts.append(
                f"<h3 style=\"font-size:15px;margin:16px 0 6px\">{escape(section['title'])}</h3>"
                f"<ul style=\"margin:0;padding-inline-start:18px\">{items}</ul>"
            )
        return f"<div{direction}>{''.join(parts)}</div>"

    html = (
        "<!doctype html><html><body style=\"margin:0;background:#f6f7f3;font-family:Arial,"
        "sans-serif;color:#15171a\"><div style=\"max-width:520px;margin:0 auto;padding:24px 16px\">"
        "<div style=\"background:#fff;border-radius:16px;padding:24px\">"
        f"{block(en, False)}<hr style=\"border:0;border-top:1px solid #e3e6e1;margin:24px 0\">"
        f"{block(ar, True)}</div></div></body></html>"
    )
    return subject, text, html


async def schedule(conn: asyncpg.Connection, week_start: date, tz: str) -> None:
    """Queue the report for this week, unless it is queued already."""
    queued = await conn.fetchval(
        "select 1 from jobs where kind = $1 and status in ('queued', 'running') "
        "and payload->>'week_start' = $2",
        JOB, week_start.isoformat(),
    )
    if not queued:
        run_at = datetime.combine(week_start + timedelta(days=7), time(SEND_HOUR), ZoneInfo(tz))
        await jobs.enqueue(conn, JOB, {"week_start": week_start.isoformat()}, run_at)


async def ensure_scheduled(db: Database, now: datetime | None = None) -> int:
    """Make sure every shop has its next report queued. The worker calls this when it
    starts and every hour, so a new shop is picked up without anyone remembering."""
    now = now or datetime.now(UTC)
    async with db.unscoped() as conn:
        tenant_ids = [r["id"] for r in await conn.fetch("select id from tenants")]
    added = 0
    for tenant_id in tenant_ids:
        async with db.tenant(tenant_id) as conn:
            if await conn.fetchval(
                "select 1 from jobs where kind = $1 and status in ('queued', 'running')", JOB
            ):
                continue
            tz = await _timezone(conn)
            week, _ = next_send(now, tz)
            await schedule(conn, week, tz)
            added += 1
    return added


class WeeklyReports:
    """Job handler: make and send one shop's report for one week."""

    def __init__(self, db: Database, outbound: Outbound) -> None:
        self._db = db
        self._outbound = outbound

    async def send(self, tenant_id: UUID, payload: dict) -> None:
        week_start = date.fromisoformat(payload["week_start"])
        letter = None
        async with self._db.tenant(tenant_id) as conn:
            tz = await _timezone(conn)
            # Next week first: a shop keeps getting reports even when this one is skipped.
            await schedule(conn, week_start + timedelta(days=7), tz)
            done = await conn.fetchval(
                "select sent_at from weekly_reports where week_start = $1", week_start
            )
            if done is not None or not await enabled(conn):
                return
            report = await build(conn, week_start)
            if not report["sections"]:
                return
            await conn.execute(
                "insert into weekly_reports (week_start, sections, sent_at) values ($1, $2, now()) "
                "on conflict (tenant_id, week_start) do update "
                "set sections = excluded.sections, sent_at = excluded.sent_at",
                week_start, report["sections"],
            )
            await deliver(conn, self._outbound, report)
            if mail.configured():
                letter = (await _owner_emails(conn), email(report, await _shop(conn)))
        if letter:
            # After the commit, and never retried: a failed email must not resend WhatsApp.
            addresses, (subject, text, html) = letter
            for address in addresses:
                try:
                    await mail.send(address, subject, text, html)
                except mail.MailError as error:
                    log.warning("weekly report email not sent: %s", error)


# --------------------------------------------------------- REPORT in the chat

async def on_staff_message(
    conn: asyncpg.Connection, staff: asyncpg.Record, message: InboundMessage
) -> list[OutboundMessage] | None:
    """A staff number sent REPORT: answer with last week's whole report. Anything else
    is left for the modules."""
    word = message.text.strip().strip("«»\"'.!؟?").lower()
    if message.reply_id != "report" and word not in REPORT_WORDS:
        return None
    arabic = staff["lang"] == "ar" or has_arabic(message.text)
    lang = "ar" if arabic else "en"
    receives = await conn.fetchval("select weekly_report from contacts where id = $1", staff["id"])
    if not receives:
        body = (
            "التقرير الأسبوعي يصل إلى الأرقام التي يختارها صاحب المحل في مساحة العمل." if arabic
            else "The weekly report goes to the numbers the owner chooses in the workspace."
        )
        return [OutboundMessage(to=staff["id"], body=body)]
    report = await build(conn, await last_week(conn))
    if not report["sections"]:
        body = (
            "لا توجد منتجات مفعّلة بعد، فلا يوجد ما نرسله في التقرير." if arabic
            else "No products are switched on yet, so there is nothing to report."
        )
        return [OutboundMessage(to=staff["id"], body=body)]
    view = render(report, await _shop(conn), lang)
    return [OutboundMessage(to=staff["id"], body=view["text"])]
