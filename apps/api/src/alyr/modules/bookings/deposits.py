"""Deposits on bookings (ALY-27, D-084, spec 033).

A service may ask a deposit: a fixed amount or a share of its price. The booking is made at
once and holds its time for the shop's pay-link hold (`shop_settings.hold_minutes`, 30
minutes unless the shop changes it: the Catalog's hold), while the customer pays by link.

* **Paid in time:** the booking is confirmed, the reminder is queued, a deposit receipt is
  made for a shop with Documents on, and the deposit counts against the final bill.
* **Not paid:** at the end of the hold a job releases the time, cancels the booking, expires
  the link and tells the customer. The worker's sweep (`sweep_all`) catches a job that was
  lost, as for orders (`modules/orders/holds.py`).
* **Later:** a no-show or a late cancel keeps or refunds a paid deposit by the shop's own
  rule, copied onto the booking when it was made (`deposit_terms`) and shown to the customer
  before paying. ALYR never moves money: "refund due" is the shop's to pay back from its own
  account, and it marks it refunded.

A payment and a release cannot both win: both claim the pay link first (`payment_requests`,
only while it is still pending), then the booking, so whichever claims the link decides.

The payment link opens ALYR's stand-in payment page until the shop's own payment provider is
connected (hard rule 3, D-044).
"""

import logging
from datetime import datetime
from uuid import UUID

import asyncpg

from alyr.core import jobs, team, templates
from alyr.core.normalise import fmt_qar
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules.bookings import service, words

log = logging.getLogger("alyr.bookings")

EXPIRE_JOB = "booking_deposit_expiry"


async def shop_terms(conn: asyncpg.Connection) -> dict:
    """The shop's current rule for a paid deposit, and its hold."""
    row = await conn.fetchrow(
        "select deposit_no_show, deposit_late_cancel, deposit_cancel_hours, hold_minutes "
        "from shop_settings"
    )
    if row is None:
        return {"no_show": "keep", "late_cancel": "keep", "cancel_hours": 24, "hold_minutes": 30}
    return {"no_show": row["deposit_no_show"], "late_cancel": row["deposit_late_cancel"],
            "cancel_hours": row["deposit_cancel_hours"], "hold_minutes": row["hold_minutes"]}


async def hold_end(conn: asyncpg.Connection) -> datetime:
    minutes = (await shop_terms(conn))["hold_minutes"]
    return await conn.fetchval("select now() + make_interval(mins => $1)", minutes)


def pay_path(tenant_id: UUID, payment_id: UUID) -> str:
    return f"/pay/{tenant_id}/{payment_id}"


async def ask(
    conn: asyncpg.Connection, tenant_id: UUID, outbound: Outbound, booking_id: UUID,
    number: int, contact: asyncpg.Record, starts_at: datetime, amount: int, terms: dict,
    hold_until: datetime, web_url: str,
) -> dict:
    """Make the deposit's pay link, queue the release at the end of the hold, and send the
    customer the link with the shop's rule. Returns what the booking page shows."""
    payment_id = await conn.fetchval(
        "insert into payment_requests (contact_id, amount, booking_id) values ($1, $2, $3) "
        "returning id",
        contact["id"], amount, booking_id,
    )
    await jobs.enqueue(conn, EXPIRE_JOB, {"booking_id": str(booking_id)}, hold_until)
    path = pay_path(tenant_id, payment_id)
    url = f"{web_url}{path}"
    arabic = contact["lang"] == "ar"
    when = await service.when_text(conn, starts_at, arabic)
    shop = await service.shop_name(conn, arabic)
    what = await service.service_words(conn, booking_id, arabic)
    body = words.deposit_due(
        number, shop, what, when, amount, terms["hold_minutes"], url, terms, arabic
    )
    await outbound.send(conn, templates.notice(
        contact["id"], "booking_deposit_due", contact["lang"], body,
        number, shop, f"{what}, {when}" if not arabic else f"{what}، {when}",
        words.money(amount, arabic), terms["hold_minutes"], url,
    ))
    return {"amount": amount, "amount_text": fmt_qar(amount), "pay_path": path,
            "hold_until": hold_until.isoformat(), "terms": terms}


async def expire_link(conn: asyncpg.Connection, booking_id: UUID) -> bool:
    """A booking cancelled or finished before its deposit was paid: its pay link stops
    working. Claimed first, like a payment, so the two cannot wait on each other."""
    claimed = await conn.fetchval(
        "update payment_requests set status = 'expired' "
        "where booking_id = $1 and status = 'pending' returning id",
        booking_id,
    )
    return claimed is not None


def on_cancel(row: asyncpg.Record, refund: bool | None) -> str:
    """What becomes of a booking's deposit when it is cancelled. A waiting one is no longer
    asked; a paid one is refunded unless the cancel is late and the rule keeps it, or staff
    say otherwise (`refund`)."""
    state = row["deposit_state"]
    if state == "due":
        return "expired"
    if state != "paid":
        return state
    if refund is None:
        terms = row["deposit_terms"] or {}
        hours = terms.get("cancel_hours", 24)
        late = (row["starts_at"] - datetime.now(row["starts_at"].tzinfo)).total_seconds() \
            < hours * 3600
        refund = not late or terms.get("late_cancel", "keep") == "refund"
    return "refund_due" if refund else "kept"


def on_outcome(row: asyncpg.Record, status: str) -> str:
    """What becomes of a booking's deposit when staff mark came or didn't come."""
    state = row["deposit_state"]
    if state == "due":
        return "expired"  # never paid: the visit is settled at the counter
    if state == "paid" and status == "no_show":
        keep = (row["deposit_terms"] or {}).get("no_show", "keep") == "keep"
        return "kept" if keep else "refund_due"
    return state


async def paid(
    conn: asyncpg.Connection, outbound: Outbound, payment: asyncpg.Record
) -> None:
    """The deposit's link was paid (called by `ledger.complete_payment`, which has already
    claimed the link). The booking is confirmed, the receipt is made, and the customer told."""
    from alyr.modules.documents import sales as documents_sales

    booking = await conn.fetchrow(
        "update bookings set deposit_state = 'paid', hold_until = null "
        "where id = $1 and deposit_state = 'due' and status = 'booked' "
        "returning id, number, contact_id, starts_at, deposit",
        payment["booking_id"],
    )
    if booking is None:
        # Released a moment ago by a cancel that claimed the link first cannot happen (the
        # link would not have been pending), so this is a booking changed by hand.
        log.warning("a deposit was paid for booking %s, which was not waiting for it",
                    payment["booking_id"])
        return
    await team.record(
        conn, "booking", booking["id"], "deposit_paid", team.CUSTOMER, booking["contact_id"],
        {"number": booking["number"], "amount": fmt_qar(booking["deposit"])},
    )
    await documents_sales.booking_deposit_paid(conn, booking["id"])
    lang = await conn.fetchval("select lang from contacts where id = $1", booking["contact_id"])
    arabic = lang == "ar"
    when = await service.when_text(conn, booking["starts_at"], arabic)
    what = await service.service_words(conn, booking["id"], arabic)
    body = words.deposit_paid(booking["number"], booking["deposit"], what, when, arabic)
    await outbound.send(conn, templates.notice(
        booking["contact_id"], "booking_deposit_paid", lang, body,
        words.money(booking["deposit"], arabic), booking["number"],
        f"{what}, {when}" if not arabic else f"{what}، {when}",
    ))
    await service.schedule_reminder(conn, booking["id"], booking["starts_at"])


async def late_payment(conn: asyncpg.Connection, payment: asyncpg.Record) -> None:
    """A real gateway took a deposit after its booking was released. The shop owes it back;
    the record says so. (The stand-in gateway moves no money, so it never lands here.)"""
    number = await conn.fetchval(
        "select number from bookings where id = $1", payment["booking_id"]
    )
    await team.record(
        conn, "booking", payment["booking_id"], "deposit_late", team.CUSTOMER,
        payment["contact_id"], {"number": number, "amount": fmt_qar(payment["amount"])},
    )


async def mark_refunded(conn: asyncpg.Connection, booking_id: UUID, actor: team.Actor) -> bool:
    """The shop says it has paid a deposit back, from its own account."""
    row = await conn.fetchrow(
        "update bookings set deposit_state = 'refunded' "
        "where id = $1 and deposit_state = 'refund_due' returning number, contact_id, deposit",
        booking_id,
    )
    if row is None:
        return False
    await team.record(
        conn, "booking", booking_id, "deposit_refunded", actor, row["contact_id"],
        {"number": row["number"], "amount": fmt_qar(row["deposit"])},
    )
    return True


# ── the hold ─────────────────────────────────────────────────────────────────────────────


async def due_bookings(conn: asyncpg.Connection) -> list[UUID]:
    rows = await conn.fetch(
        "select id from bookings where deposit_state = 'due' and status = 'booked' "
        "and hold_until <= now() order by hold_until"
    )
    return [r["id"] for r in rows]


async def release(conn: asyncpg.Connection, outbound: Outbound, booking_id: UUID) -> bool:
    """Release one booking whose deposit was not paid in time. Returns True if it was
    released. The link is claimed first; if there is nothing to claim, the deposit was paid
    or the booking was cancelled a moment ago, and nothing is done."""
    if not await conn.fetchval(
        "update payment_requests p set status = 'expired' from bookings b "
        "where p.booking_id = $1 and p.status = 'pending' and b.id = p.booking_id "
        "and b.deposit_state = 'due' and b.status = 'booked' and b.hold_until <= now() "
        "returning p.id",
        booking_id,
    ):
        return False
    row = await conn.fetchrow(
        "update bookings set status = 'cancelled', deposit_state = 'expired', hold_until = null "
        "where id = $1 and status = 'booked' and deposit_state = 'due' "
        "returning number, contact_id, starts_at, deposit",
        booking_id,
    )
    if row is None:
        return False
    minutes = (await shop_terms(conn))["hold_minutes"]
    await team.record(
        conn, "booking", booking_id, "released", team.ASSISTANT, row["contact_id"],
        {"number": row["number"], "reason": "deposit_not_paid", "minutes": minutes,
         "amount": fmt_qar(row["deposit"])},
    )
    lang = await conn.fetchval("select lang from contacts where id = $1", row["contact_id"])
    when = await service.when_text(conn, row["starts_at"], lang == "ar")
    await outbound.send(conn, templates.notice(
        row["contact_id"], "booking_released", lang,
        words.released(row["number"], when, lang == "ar"), row["number"], when,
    ))
    return True


async def release_shop(db: Database, outbound: Outbound, tenant_id: UUID) -> int:
    """Release every booking in one shop whose hold has run out. Safe to run any number of
    times, from several workers at once. Each booking in its own transaction."""
    async with db.tenant(tenant_id) as conn:
        due = await due_bookings(conn)
    released = 0
    for booking_id in due:
        try:
            async with db.tenant(tenant_id) as conn:
                released += await release(conn, outbound, booking_id)
        except Exception:  # noqa: BLE001 - the next booking, and the next sweep, still go on
            log.exception("could not release booking %s", booking_id)
    return released


class DepositExpiry:
    """Job handler for `booking_deposit_expiry`."""

    def __init__(self, db: Database, outbound: Outbound) -> None:
        self._db = db
        self._outbound = outbound

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        await release_shop(self._db, self._outbound, tenant_id)


async def sweep_all(db: Database, outbound: Outbound) -> int:
    """Look at every shop for deposits whose hold ran out (the worker, every few minutes)."""
    # Bookings are behind row-level security, so each shop is looked at in its own scope.
    async with db.unscoped() as conn:
        shops = [r["id"] for r in await conn.fetch("select id from tenants")]
    total = 0
    for tenant_id in shops:
        try:
            total += await release_shop(db, outbound, tenant_id)
        except Exception:  # noqa: BLE001 - one shop must not stop the sweep of the others
            log.exception("could not sweep the deposits of shop %s", tenant_id)
    return total
