"""What a client owes ALYR, and whether it is settled (ALY-242, decision D-053).

The workspace is open from sign-up: nobody pays before they can use it. The payment is asked
at go-live, when the setup is done and the owner has tried it (the readiness check `paid`).
What is due is the setup fee and the first period of the price the client accepted.

Payments are recorded by ALYR's staff from the back office while there is no online
payment for clients (ALY-5, ALY-188). Staff can also waive a payment, with a reason (a
pilot, a demo). Nothing here ever closes a workspace: what happens when a client stops
paying is billing (ALY-85), never a deletion.

A business with no client (made before clients existed, or in a test) owes nothing.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.config import Settings, get_settings
from alyr.core import paddle, pricing
from alyr.core.normalise import fmt_qar
from alyr.db import Database

# What ALYR's staff record by hand. A card payment ("card") is only ever written by the card
# provider's webhook (core/card_billing.py, ALY-180).
METHODS = ("bank_transfer", "cash", "cheque", "link")


@asynccontextmanager
async def office(db: Database) -> AsyncIterator[asyncpg.Connection]:
    """One transaction on which the API declares it is ALYR itself, as `routes/admin.py`
    does for its staff: a client's billing is ALYR's own data, not a shop's."""
    async with db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.platform_admin', 'on', true)")
        yield conn


class AccessError(Exception):
    """A payment the back office cannot record; the message is safe to show."""


async def settled(conn: asyncpg.Connection) -> bool:
    """Has the business in scope's client paid what is due, or had it waived? Row-level
    security shows the owner only their own client. A business with no client owes nothing."""
    client = await conn.fetchrow(
        "select c.id, c.payment_waived_at from tenants t "
        "join clients c on c.id = t.client_id "
        "where t.id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    if client is None or client["payment_waived_at"] is not None:
        return True
    return await _covered(conn, client["id"])


async def _covered(conn: asyncpg.Connection, client_id: UUID) -> bool:
    """Do the payments cover the accepted price? Without an accepted price nothing is due,
    and nothing is covered either: the price comes first."""
    quote_row = await accepted(conn, client_id)
    if quote_row is None:
        return False
    view = await pricing.quote_view(conn, quote_row)
    paid = await conn.fetchval(
        "select coalesce(sum(amount), 0) from client_payments where client_id = $1", client_id
    )
    return paid >= due(view)


def due(quote: dict | None) -> int:
    """What opens the workspace: the setup fee and the first period of the accepted price,
    in dirhams. Nothing is due without an accepted price."""
    if not quote or quote.get("status") != "accepted":
        return 0
    totals = quote["totals"]
    return totals["one_time_total"] + totals["period_total"]


async def first_payment(conn: asyncpg.Connection, client_id: UUID) -> dict | None:
    """What the first payment is made of, for a card checkout (ALY-180, D-074): the accepted
    quote, its setup fee and its first period in dirhams, and the same two in US cents as
    Paddle charges them. None without an accepted price."""
    quote_row = await accepted(conn, client_id)
    if quote_row is None:
        return None
    return await _parts(conn, quote_row, await pricing.quote_view(conn, quote_row))


async def _parts(conn: asyncpg.Connection, quote_row: asyncpg.Record, view: dict) -> dict:
    dollars = pricing.usd_totals(
        view["lines"], await pricing.items(conn), quote_row["period_months"],
        quote_row["discount_pct"],
    )
    return {
        "quote_id": quote_row["id"], "setup": view["totals"]["one_time_total"],
        "period": view["totals"]["period_total"], "months": quote_row["period_months"],
        "setup_usd": dollars["one_time"], "period_usd": dollars["period"],
    }


def _payment(row: asyncpg.Record) -> dict:
    return {
        "id": str(row["id"]), "amount": row["amount"], "amount_text": fmt_qar(row["amount"]),
        "method": row["method"], "reference": row["reference"],
        "received_on": row["received_on"].isoformat(), "note": row["note"],
        "provider": row["provider"],
        # What a card provider took, in its own currency (US dollars for Paddle).
        "paid_text": paddle.usd_text(row["paid_amount"])
        if row["paid_amount"] and row["paid_currency"] == "USD" else "",
    }


async def accepted(
    conn: asyncpg.Connection, client_id: UUID | None = None
) -> asyncpg.Record | None:
    if client_id is None:
        return await conn.fetchrow(
            "select * from quotes where status = 'accepted' order by number desc limit 1"
        )
    return await conn.fetchrow(
        "select * from quotes where client_id = $1 and status = 'accepted' "
        "order by number desc limit 1",
        client_id,
    )


async def summary(conn: asyncpg.Connection, client_id: UUID | None = None) -> dict:
    """What the client owes ALYR, what they paid, and how to pay. For the
    owner (`client_id` None: their own client, by row-level security) or the back office."""
    if client_id is None:
        client = await conn.fetchrow(
            "select c.id, c.payment_waived_at, c.access_note, c.card_billing from tenants t "
            "join clients c on c.id = t.client_id "
            "where t.id = nullif(current_setting('app.tenant_id', true), '')::uuid"
        )
    else:
        client = await conn.fetchrow(
            "select id, payment_waived_at, access_note, card_billing from clients where id = $1",
            client_id,
        )
    if client is None:
        return {"status": "paid", "due": 0, "paid": 0, "payments": [], "card": None}
    quote_row = await accepted(conn, client["id"])
    quote = await pricing.quote_view(conn, quote_row) if quote_row else None
    payments = await conn.fetch(
        "select * from client_payments where client_id = $1 order by received_on, recorded_at",
        client["id"],
    )
    amount_due = due(quote)
    paid = sum(p["amount"] for p in payments)
    if client["payment_waived_at"] is not None or (quote is not None and paid >= amount_due):
        status = "paid"
    elif quote is None:
        # The price comes first: ALYR prepares it, or the owner has not accepted it yet.
        status = "no_price"
    else:
        status = "unpaid"
    settings = get_settings()
    provider = card_provider(settings, client["card_billing"])
    card = None
    # A card pays the whole first payment at once and starts the plan's renewals, so it is
    # offered only while nothing has been paid by hand (ALY-180).
    if provider and status == "unpaid" and paid == 0:
        parts = await _parts(conn, quote_row, quote)
        card = {
            "provider": provider,
            "amount_text": paddle.usd_text(parts["setup_usd"] + parts["period_usd"]),
            "period_text": paddle.usd_text(parts["period_usd"]),
        }
    return {
        "status": status,
        "waived": client["payment_waived_at"] is not None,
        "waived_note": client["access_note"] if client["payment_waived_at"] else "",
        "due": amount_due, "due_text": fmt_qar(amount_due),
        "paid": paid, "paid_text": fmt_qar(paid),
        "left": max(amount_due - paid, 0), "left_text": fmt_qar(max(amount_due - paid, 0)),
        # The setup part of what is due; 0 when the accepted price has none (D-092).
        "setup": quote["totals"]["one_time_total"] if quote else 0,
        "setup_text": quote["totals"]["one_time_total_text"] if quote else "",
        "period_text": quote["totals"]["period_total_text"] if quote else "",
        "period_months": quote["period_months"] if quote else 1,
        "quote_number": quote["number"] if quote else None,
        # The reference the client writes on the transfer, so ALYR can match it.
        "reference": f"ALYR-{str(client['id'])[:8].upper()}",
        "bank": settings.bank_transfer_details,
        "card": card,
        # What the back office set for this client: null follows the platform's setting.
        "card_billing": client["card_billing"],
        "payments": [_payment(p) for p in payments],
    }


def card_provider(settings: Settings, card_billing: str | None) -> str:
    """The card provider a client is offered (ALY-180, D-074), or "" for none: the platform's
    setting, unless the back office switched it off for this client, and only while the
    provider is fully set up."""
    if card_billing == "off" or settings.card_billing != "paddle":
        return ""
    return "paddle" if paddle.ready(settings) else ""


async def record(
    conn: asyncpg.Connection, client_id: UUID, *, amount: int, method: str, reference: str,
    received_on: date, note: str, by: str,
) -> bool:
    """ALYR records a payment the client made. Answers whether what is due is now covered.
    Back office connection only."""
    if method not in METHODS:
        raise AccessError(f"the method is one of: {', '.join(METHODS)}")
    if amount <= 0:
        raise AccessError("the amount is more than zero")
    if received_on > datetime.now(ZoneInfo("Asia/Qatar")).date():
        raise AccessError("a payment cannot be received in the future")
    client = await conn.fetchrow("select id from clients where id = $1 for update", client_id)
    if client is None:
        raise LookupError("no such client")
    quote = await accepted(conn, client_id)
    if quote is None:
        raise AccessError("the client has not accepted a price yet: nothing is due")
    await conn.execute(
        "insert into client_payments (client_id, quote_id, amount, method, reference, "
        "received_on, note, recorded_by) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        client_id, quote["id"], amount, method, reference.strip()[:120], received_on,
        note.strip()[:500], by,
    )
    return await _covered(conn, client_id)


async def waive(conn: asyncpg.Connection, client_id: UUID, reason: str) -> bool:
    """ALYR waives a client's payment, and says why (a pilot, a demo). Answers whether it
    changed anything. Back office only."""
    reason = reason.strip()[:500]
    if not reason:
        raise AccessError("say why the payment is waived")
    waived = await conn.fetchval(
        "update clients set payment_waived_at = now(), access_note = $2 "
        "where id = $1 and payment_waived_at is null returning true",
        client_id, reason,
    )
    if waived is None and not await conn.fetchval(
        "select true from clients where id = $1", client_id
    ):
        raise LookupError("no such client")
    return bool(waived)
