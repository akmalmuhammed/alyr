"""Pay before access (ALY-212, decision D-051, spec 020).

A client pays ALYR the setup fee and the first period of the price they accepted before
their products open. Until then the owner can sign in, finish the guided setup at
`/start` and see what to pay; every product screen and its API stay locked (`402`).

Payments are recorded by ALYR's staff from the back office while there is no online
payment for clients (ALY-5, ALY-188). Recording enough to cover what is due opens the
workspace for every business of the client, once. Staff can also open it without a
payment, with a reason. Nothing here ever closes a workspace again: what happens when a
client stops paying is billing (ALY-85), never a deletion.

A business with no client (made before clients existed, or in a test) is open.
"""

from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.config import get_settings
from alyr.core import pricing
from alyr.core.normalise import fmt_qar
from alyr.db import Database

METHODS = ("bank_transfer", "cash", "cheque", "link")


class AccessError(Exception):
    """A payment the back office cannot record; the message is safe to show."""


async def is_open(conn: asyncpg.Connection) -> bool:
    """Is the workspace of the business in scope open? Row-level security shows the owner
    only their own client."""
    row = await conn.fetchrow(
        "select t.client_id, c.access_from from tenants t "
        "left join clients c on c.id = t.client_id "
        "where t.id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    return row is None or row["client_id"] is None or row["access_from"] is not None


async def open_for(db: Database, tenant_id: UUID) -> bool:
    """For a request's guard, outside its own transaction."""
    async with db.tenant(tenant_id) as conn:
        return await is_open(conn)


def due(quote: dict | None) -> int:
    """What opens the workspace: the setup fee and the first period of the accepted price,
    in dirhams. Nothing is due without an accepted price."""
    if not quote or quote.get("status") != "accepted":
        return 0
    totals = quote["totals"]
    return totals["one_time_total"] + totals["period_total"]


def _payment(row: asyncpg.Record) -> dict:
    return {
        "id": str(row["id"]), "amount": row["amount"], "amount_text": fmt_qar(row["amount"]),
        "method": row["method"], "reference": row["reference"],
        "received_on": row["received_on"].isoformat(), "note": row["note"],
    }


async def _accepted(
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
    """What the client owes to open their workspace, what they paid, and how to pay. For the
    owner (`client_id` None: their own client, by row-level security) or the back office."""
    if client_id is None:
        client = await conn.fetchrow(
            "select c.id, c.access_from, c.access_note from tenants t "
            "join clients c on c.id = t.client_id "
            "where t.id = nullif(current_setting('app.tenant_id', true), '')::uuid"
        )
    else:
        client = await conn.fetchrow(
            "select id, access_from, access_note from clients where id = $1", client_id
        )
    if client is None:
        return {"open": True, "status": "open", "due": 0, "paid": 0, "payments": []}
    quote_row = await _accepted(conn, client["id"])
    quote = await pricing.quote_view(conn, quote_row) if quote_row else None
    payments = await conn.fetch(
        "select * from client_payments where client_id = $1 order by received_on, recorded_at",
        client["id"],
    )
    amount_due = due(quote)
    paid = sum(p["amount"] for p in payments)
    if client["access_from"] is not None:
        status = "open"
    elif quote is None:
        # The price comes first: ALYR prepares it, or the owner has not accepted it yet.
        status = "no_price"
    else:
        status = "unpaid"
    settings = get_settings()
    return {
        "open": client["access_from"] is not None,
        "status": status,
        "opened_at": client["access_from"].isoformat() if client["access_from"] else None,
        "due": amount_due, "due_text": fmt_qar(amount_due),
        "paid": paid, "paid_text": fmt_qar(paid),
        "left": max(amount_due - paid, 0), "left_text": fmt_qar(max(amount_due - paid, 0)),
        "setup_text": quote["totals"]["one_time_total_text"] if quote else "",
        "period_text": quote["totals"]["period_total_text"] if quote else "",
        "period_months": quote["period_months"] if quote else 1,
        "quote_number": quote["number"] if quote else None,
        # The reference the client writes on the transfer, so ALYR can match it.
        "reference": f"ALYR-{str(client['id'])[:8].upper()}",
        "bank": settings.bank_transfer_details,
        "payments": [_payment(p) for p in payments],
    }


async def record(
    conn: asyncpg.Connection, client_id: UUID, *, amount: int, method: str, reference: str,
    received_on: date, note: str, by: str,
) -> bool:
    """ALYR records a payment the client made. Answers whether it opened the workspace.
    Back office connection only."""
    if method not in METHODS:
        raise AccessError(f"the method is one of: {', '.join(METHODS)}")
    if amount <= 0:
        raise AccessError("the amount is more than zero")
    if received_on > datetime.now(ZoneInfo("Asia/Qatar")).date():
        raise AccessError("a payment cannot be received in the future")
    client = await conn.fetchrow(
        "select id, access_from from clients where id = $1 for update", client_id
    )
    if client is None:
        raise LookupError("no such client")
    quote = await _accepted(conn, client_id)
    if quote is None:
        raise AccessError("the client has not accepted a price yet: nothing is due")
    await conn.execute(
        "insert into client_payments (client_id, quote_id, amount, method, reference, "
        "received_on, note, recorded_by) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        client_id, quote["id"], amount, method, reference.strip()[:120], received_on,
        note.strip()[:500], by,
    )
    if client["access_from"] is not None:
        return False
    view = await pricing.quote_view(conn, quote)
    paid = await conn.fetchval(
        "select coalesce(sum(amount), 0) from client_payments where client_id = $1", client_id
    )
    if paid < due(view):
        return False
    await conn.execute("update clients set access_from = now() where id = $1", client_id)
    return True


async def open_without_payment(
    conn: asyncpg.Connection, client_id: UUID, reason: str
) -> bool:
    """ALYR opens a client's workspace with no payment, and says why. Back office only."""
    reason = reason.strip()[:500]
    if not reason:
        raise AccessError("say why it opens without a payment")
    opened = await conn.fetchval(
        "update clients set access_from = now(), access_note = $2 "
        "where id = $1 and access_from is null returning true",
        client_id, reason,
    )
    if opened is None and not await conn.fetchval(
        "select true from clients where id = $1", client_id
    ):
        raise LookupError("no such client")
    return bool(opened)
