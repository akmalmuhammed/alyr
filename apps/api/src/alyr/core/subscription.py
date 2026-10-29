"""A client's subscription after go-live: paid up, past due, paused or cancelled (ALY-218,
go-live item 39, spec 040, decision D-082).

The plan's clock starts the day the client's first business goes live. Each period is paid in
advance: the first with the setup fee at go-live (D-053), every later one by card through
Paddle, which renews by itself (D-074), or by transfer, cash or cheque recorded in `/ops`.
What has been paid, less the setup fee, buys whole periods from the go-live day; the day after
the last one is when the next is due.

A client whose next period is not paid is past due. Everything keeps working for the grace
period (`ALYR_BILLING_GRACE_DAYS`, 14), and the owner is emailed the day after the due date and
three days before the pause. After the grace period ALYR pauses what it sends for the client's
businesses on WhatsApp: automatic replies and templates. A reply someone types in the inbox
still goes, inside the customer's 24-hour window. The owner can still sign in, see everything
and pay; nothing is deleted and the workspace never closes (D-033, D-053). Recording the
payment lifts the pause at once.

A client can also cancel with seven days' notice (D-034). From that day sending pauses the same
way, and a card subscription at Paddle is cancelled so it charges nothing more.

`state` is a pure function of the accepted price, the payments and the dates; `refresh` writes
its answer onto the client, where the outbound layer reads in one row whether a business may
send. The worker's hourly `sweep` refreshes every client and sends the emails.
"""

import calendar
import logging
from datetime import date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.config import Settings, get_settings
from alyr.core import access, jobs, mail, pricing
from alyr.core.normalise import fmt_qar
from alyr.db import Database

log = logging.getLogger("alyr.subscription")

QATAR = ZoneInfo("Asia/Qatar")
# The owner is warned this many days before sending pauses.
WARN_DAYS = 3
# What a client gives before a cancellation takes effect (D-034).
NOTICE_DAYS = 7
CANCEL_JOB = "billing.card_cancel"
STATES = ("no_price", "awaiting_payment", "active", "past_due", "suspended", "cancelled")


class CancelError(Exception):
    """A cancellation the back office cannot make; the message is safe to show."""


def today() -> date:
    return datetime.now(QATAR).date()


def add_months(day: date, months: int) -> date:
    """The same day `months` later, or the month's last day when it has no such day
    (31 January plus one month is 28 or 29 February)."""
    total = day.month - 1 + months
    year, month = day.year + total // 12, total % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def state(
    *, waived: bool, price: dict | None, paid: int, live_on: date | None,
    cancels_on: date | None, on: date, grace_days: int, pause: bool,
) -> dict:
    """Where a client stands on day `on`. `price` is the accepted quote's setup, period and
    months (in dirhams), or None without an accepted price.

    Answers the state, the day the paid periods run to (`paid_through`: the next period is due
    that day), how many days it is overdue, what is owed to be paid up, the day sending pauses
    while past due, and whether ALYR's sending is paused and why."""
    out = {
        "state": "active", "paid_through": None, "overdue_days": 0, "owed": 0,
        "pause_on": None, "cancels_on": cancels_on, "paused": "",
    }
    if cancels_on is not None and on >= cancels_on:
        return out | {"state": "cancelled", "paused": "cancelled"}
    if waived:
        return out
    if price is None:
        return out | {"state": "no_price"}
    setup, period, months = price["setup"], price["period"], max(price["months"], 1)
    first = setup + period
    if live_on is None:
        # The clock has not started: what is due is the first payment, asked at go-live.
        return out | {
            "state": "active" if paid >= first else "awaiting_payment",
            "owed": max(first - paid, 0),
        }
    if period <= 0:
        return out  # a plan with nothing to pay each period never falls due
    periods = max(paid - setup, 0) // period
    paid_through = add_months(live_on, periods * months)
    out["paid_through"] = paid_through
    if on < paid_through:
        return out
    # Whole periods needed so the paid time runs past today, and what pays for them.
    needed = periods + 1
    while add_months(live_on, needed * months) <= on:
        needed += 1
    overdue = (on - paid_through).days
    pause_on = paid_through + timedelta(days=grace_days)
    out |= {
        "overdue_days": overdue, "owed": setup + needed * period - paid,
        "pause_on": pause_on if pause else None,
    }
    if pause and on >= pause_on:
        return out | {"state": "suspended", "paused": "overdue"}
    return out | {"state": "past_due"}


async def facts(conn: asyncpg.Connection, client_id: UUID) -> dict:
    """What `state` is worked out from, for one client. Readable on the owner's connection
    (their own client, by row-level security) or a back-office one."""
    client = await conn.fetchrow(
        "select payment_waived_at, cancels_on from clients where id = $1", client_id
    )
    quote_row = await access.accepted(conn, client_id)
    price = None
    if quote_row is not None:
        view = await pricing.quote_view(conn, quote_row)
        price = {
            "setup": view["totals"]["one_time_total"], "period": view["totals"]["period_total"],
            "months": quote_row["period_months"],
        }
    paid = await conn.fetchval(
        "select coalesce(sum(amount), 0) from client_payments where client_id = $1", client_id
    )
    # The day the first of the client's businesses went live, in Qatar.
    live_at = await conn.fetchval(
        "select min(live_at) from tenants where client_id = $1", client_id
    )
    return {
        "waived": client is not None and client["payment_waived_at"] is not None,
        "price": price, "paid": paid,
        "live_on": live_at.astimezone(QATAR).date() if live_at else None,
        "cancels_on": client["cancels_on"] if client else None,
    }


async def current(
    conn: asyncpg.Connection, client_id: UUID, settings: Settings | None = None,
    on: date | None = None,
) -> dict:
    settings = settings or get_settings()
    return state(
        **await facts(conn, client_id), on=on or today(),
        grace_days=settings.billing_grace_days, pause=settings.billing_pause_sending,
    )


def view(now: dict) -> dict:
    """The state as the owner's banner and the back office read it."""
    return {
        "state": now["state"],
        "paid_through": now["paid_through"].isoformat() if now["paid_through"] else None,
        "overdue_days": now["overdue_days"],
        "owed": now["owed"], "owed_text": fmt_qar(now["owed"]),
        "pause_on": now["pause_on"].isoformat() if now["pause_on"] else None,
        "cancels_on": now["cancels_on"].isoformat() if now["cancels_on"] else None,
        "paused": now["paused"],
    }


async def refresh(
    conn: asyncpg.Connection, client_id: UUID, settings: Settings | None = None,
    on: date | None = None,
) -> dict:
    """Work out the client's state and write it onto the client, pausing or resuming what
    ALYR sends for its businesses. Back-office connection only. Answers the state."""
    now = await current(conn, client_id, settings, on)
    await conn.execute(
        "update clients set billing_state = $2, billing_checked_at = now(), "
        "sending_paused_reason = $3, "
        "sending_paused_at = case when $3 = '' then null "
        "    else coalesce(sending_paused_at, now()) end "
        "where id = $1",
        client_id, now["state"], now["paused"],
    )
    return now


async def paused(conn: asyncpg.Connection) -> bool:
    """Has ALYR paused what the business in scope sends? One row, read by the outbound layer
    on the business's own connection."""
    return bool(await conn.fetchval(
        "select c.sending_paused_at is not null from tenants t "
        "join clients c on c.id = t.client_id "
        "where t.id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    ))


# ── cancelling, with seven days' notice ──────────────────


async def cancel(
    conn: asyncpg.Connection, client_id: UUID, note: str, on: date | None = None
) -> date:
    """The client asked to cancel: it takes effect in seven days. Back office only. Answers
    the day. Asking again keeps the first day."""
    note = note.strip()[:500]
    if not note:
        raise CancelError("say how the client asked to cancel")
    day = (on or today()) + timedelta(days=NOTICE_DAYS)
    cancels_on = await conn.fetchval(
        "update clients set cancel_requested_at = coalesce(cancel_requested_at, now()), "
        "cancels_on = coalesce(cancels_on, $2), cancel_note = $3 "
        "where id = $1 returning cancels_on",
        client_id, day, note,
    )
    if cancels_on is None:
        raise LookupError("no such client")
    await refresh(conn, client_id, on=on)
    return cancels_on


async def undo_cancel(conn: asyncpg.Connection, client_id: UUID) -> bool:
    """The client stays after all. Answers whether a cancellation was undone. A card
    subscription Paddle has already cancelled cannot be restarted: the client then pays the
    next period by transfer."""
    undone = await conn.fetchval(
        "update clients set cancel_requested_at = null, cancels_on = null, cancel_note = '' "
        "where id = $1 and cancels_on is not null returning true",
        client_id,
    )
    if undone is None and not await conn.fetchval(
        "select true from clients where id = $1", client_id
    ):
        raise LookupError("no such client")
    await refresh(conn, client_id)
    return bool(undone)


# ── the hourly sweep ─────────────────────────────────────


async def sweep(db: Database, settings: Settings | None = None, on: date | None = None) -> int:
    """Refresh every client that has gone live or has an accepted price, cancel the card
    subscription of a client whose cancellation took effect, and email the owners what is
    due. Answers how many emails went out."""
    settings = settings or get_settings()
    on = on or today()
    async with access.office(db) as conn:
        clients = await conn.fetch(
            "select c.id from clients c where exists (select 1 from quotes q "
            "where q.client_id = c.id and q.status = 'accepted') or c.cancels_on is not null"
        )
    sent = 0
    for client in clients:
        try:
            sent += await check(db, client["id"], settings, on)
        except Exception:  # one client's trouble never stops the others
            log.exception("could not check the subscription of a client")
    return sent


async def check(db: Database, client_id: UUID, settings: Settings, on: date) -> int:
    """Refresh one client, cancel its card subscription once its cancellation took effect,
    and send the email it is due, if any. Answers 1 when an email went out."""
    claimed = who = None
    async with access.office(db) as conn:
        now = await refresh(conn, client_id, settings, on)
        to_cancel = await conn.fetch(
            "select id, business_id from card_checkouts where client_id = $1 "
            "and subscription_ref is not null "
            "and coalesce(subscription_status, '') not in ('canceled', 'canceling')",
            client_id,
        ) if now["state"] == "cancelled" else []
        notice = _notice(now, on)
        if notice is not None:
            claimed, who = await _claim(conn, client_id, *notice)
    for row in to_cancel:
        await _cancel_at_provider(db, row["id"], row["business_id"])
    if notice is None or claimed is None:
        return 0
    web_url = settings.public_web_url.rstrip("/")
    subject, text, html = mail.billing_message(
        who["lang"] or "en", notice[0], who["contact_name"], who["name"], view(now),
        f"{web_url}/app",
    )
    try:
        await mail.send(who["contact_email"], subject, text, html)
    except mail.MailError as error:
        log.warning("billing email %s to a client not sent: %s", notice[0], error)
        return 0
    return 1


def _notice(now: dict, on: date) -> tuple[str, date] | None:
    """Which email the owner is due now, and the date it is about (one of each per date)."""
    if now["state"] == "cancelled":
        return None
    if now["cancels_on"] is not None:
        return "cancel_scheduled", now["cancels_on"]
    if now["state"] == "suspended":
        return "paused", now["paid_through"]
    if now["state"] != "past_due":
        return None
    if now["pause_on"] is not None and on >= now["pause_on"] - timedelta(days=WARN_DAYS):
        return "pause_soon", now["paid_through"]
    # The day after the due date: a card renewal Paddle takes on the day is recorded first.
    if now["overdue_days"] >= 1:
        return "due", now["paid_through"]
    return None


async def _claim(
    conn: asyncpg.Connection, client_id: UUID, kind: str, due_on: date
) -> tuple[UUID | None, asyncpg.Record | None]:
    """Record the email before it is sent, so a second worker or a restart never sends it
    twice. Nothing is recorded for a client nobody can be emailed at."""
    who = await conn.fetchrow(
        "select c.name, c.contact_name, c.contact_email, "
        "  (select t.owner_lang from tenants t where t.client_id = c.id "
        "   order by t.live_at nulls last, t.created_at limit 1) as lang "
        "from clients c where c.id = $1",
        client_id,
    )
    if who is None or not mail.configured() or not mail.deliverable(who["contact_email"]):
        return None, None
    claimed = await conn.fetchval(
        "insert into billing_notices (client_id, kind, due_on) values ($1, $2, $3) "
        "on conflict (client_id, kind, due_on) do nothing returning id",
        client_id, kind, due_on,
    )
    return claimed, who


async def _cancel_at_provider(db: Database, checkout_id: UUID, business_id: UUID) -> None:
    """Queue the cancelling of a card subscription at Paddle, once: the job is queued for the
    business the checkout was made from, in the same transaction that marks it."""
    async with db.tenant(business_id) as conn:
        await conn.execute("select set_config('app.platform_admin', 'on', true)")
        marked = await conn.fetchval(
            "update card_checkouts set subscription_status = 'canceling', updated_at = now() "
            "where id = $1 and coalesce(subscription_status, '') not in ('canceled', 'canceling') "
            "returning true",
            checkout_id,
        )
        if marked:
            await jobs.enqueue(conn, CANCEL_JOB, {"checkout_id": str(checkout_id)})
