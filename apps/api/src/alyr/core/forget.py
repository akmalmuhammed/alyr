"""Forget a customer, or give the business a copy of what it holds about them (go-live
checklist item 19, ALY-119, specs/038).

The privacy notice promises that a business's customer can ask to see their data or to be
deleted, and that the business decides. An owner or admin does both from the customer's
conversation, and each is put on the customer's record with who did it. Forgetting is the
database function `forget_contact` (migration 0067): it deletes who the customer is and what
they said, and keeps the business's sales records with no name or number on them. An issued
receipt or invoice is never changed (D-042).

`TABLES` says what happens to every table that points at a customer.
`tests/test_forget.py` reads the database's own foreign keys and fails if a table is missing,
so a new table cannot be added without deciding.

Every function takes a tenant-scoped connection.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.team import Actor

# What forgetting does to each table that points at a customer.
TABLES = {
    "messages": "deleted, with their pictures; one that carried a receipt or invoice is emptied",
    "message_media": "deleted with the message",
    "inbox_notes": "deleted",
    "consents": "deleted",
    "chat_carts": "deleted",
    "stock_watches": "deleted",
    "sold_out_asks": "deleted",
    "staff_pending": "only staff have these; a team member cannot be forgotten here",
    "staff_changes": "only staff have these",
    "orders": "kept, without the delivery address and note",
    "bookings": "kept, without the note",
    "ledger_entries": "kept: the credit account's record",
    "ledger_accounts": "kept: the credit account",
    "payment_requests": "kept: references and statuses only",
    "activity": "kept: who did what and when (D-028), now about a forgotten customer",
    "contact_merges": "kept: IDs only",
}
# Tables that keep a customer's ID with no foreign key, because their records are locked once
# issued. They are kept as they are: the law requires the business to keep its invoices. A
# document still in draft is deleted.
FROZEN = ("documents", "manual_payments", "document_deliveries", "connect_sales")

OPEN_ORDERS = ("new", "confirmed", "ready")


class Refused(Exception):
    """This customer cannot be forgotten now. `why` is `open_work`."""

    def __init__(self, why: str) -> None:
        super().__init__(why)
        self.why = why


async def preview(conn: asyncpg.Connection, contact_id: UUID) -> dict | None:
    """What forgetting this customer would delete and keep, and what stands in the way. None
    if there is no such customer (or it is a team member, or already forgotten)."""
    row = await conn.fetchrow(
        "select name from contacts where id = $1 and role = 'customer' and forgotten_at is null",
        contact_id,
    )
    if row is None:
        return None
    counts = await conn.fetchrow(
        "select "
        "  (select count(*) from messages where contact_id = $1) as messages, "
        "  (select count(*) from inbox_notes where contact_id = $1) as notes, "
        "  (select count(*) from orders where contact_id = $1) as orders, "
        "  (select count(*) from orders where contact_id = $1 and status = any($2)) "
        "    as open_orders, "
        "  (select count(*) from bookings where contact_id = $1) as bookings, "
        "  (select count(*) from bookings where contact_id = $1 and status = 'booked' "
        "    and starts_at > now()) as upcoming, "
        "  (select count(*) from documents where contact_id = $1 and status <> 'draft') "
        "    as documents, "
        "  (select coalesce(sum(case kind when 'payment' then -amount else amount end), 0) "
        "    from ledger_entries where contact_id = $1) as owes",
        contact_id, list(OPEN_ORDERS),
    )
    return {"name": row["name"], **dict(counts)}


async def forget(conn: asyncpg.Connection, contact_id: UUID, actor: Actor) -> dict:
    """Forget the customer. Raises LookupError if there is no such customer, and Refused if
    they still have an open order or an upcoming booking. Answers what was deleted."""
    try:
        done = await conn.fetchval("select forget_contact($1)", contact_id)
    except asyncpg.NoDataFoundError as error:
        raise LookupError("no such customer") from error
    except asyncpg.ObjectNotInPrerequisiteStateError as error:
        raise Refused("open_work") from error
    # On the activity record with who did it; the record is about a nameless customer now.
    await team.record(
        conn, "conversation", contact_id, "customer_forgotten", actor, contact_id, done
    )
    return done


async def export(conn: asyncpg.Connection, contact_id: UUID, actor: Actor) -> dict | None:
    """Everything the business holds about this customer, for the business to check and send
    them. None if there is no such customer. Amounts are in dirhams (100 to the riyal)."""
    person = await conn.fetchrow(
        "select name, phone, wa_user_id, username, email, lang, created_at, consent_service, "
        "consent_marketing, consent_back_in_stock from contacts "
        "where id = $1 and role = 'customer' and forgotten_at is null",
        contact_id,
    )
    if person is None:
        return None

    async def rows(sql: str) -> list[dict]:
        return [_plain(dict(r)) for r in await conn.fetch(sql, contact_id)]

    orders = await rows(
        "select id, number, status, payment, total, fulfilment, delivery_address, delivery_note, "
        "delivery_on, created_at from orders where contact_id = $1 and not is_test "
        "order by created_at"
    )
    items = await rows(
        "select i.order_id, i.name, i.variant_name, "
        "trim_scale(i.quantity)::text as quantity, i.price, i.discount "
        "from order_items i join orders o on o.id = i.order_id "
        "where o.contact_id = $1 and not o.is_test order by i.order_id, i.id"
    )
    for order in orders:
        order["items"] = [
            {k: v for k, v in i.items() if k != "order_id"} for i in items
            if i["order_id"] == order["id"]
        ]
        del order["id"]
    shop = await conn.fetchval(
        "select name from tenants where id = nullif(current_setting('app.tenant_id', true), '')"
        "::uuid"
    )
    copy = {
        "business": shop,
        "made_at": datetime.now(UTC).isoformat(),
        "amounts_in": "dirhams, 100 to the riyal",
        "customer": _plain(dict(person)),
        "messages": await rows(
            "select direction, kind, body, status, created_at from messages "
            "where contact_id = $1 order by created_at"
        ),
        "notes": await rows(
            "select body, author_name, created_at from inbox_notes "
            "where contact_id = $1 order by created_at"
        ),
        "consents": await rows(
            "select purpose, status, source, wording, created_at from consents "
            "where contact_id = $1 order by created_at"
        ),
        "orders": orders,
        "bookings": await rows(
            "select number, service_name, starts_at, ends_at, status, note, created_at "
            "from bookings where contact_id = $1 order by starts_at"
        ),
        "credit_account": await rows(
            "select kind, amount, note, created_at from ledger_entries "
            "where contact_id = $1 order by created_at"
        ),
        "payment_requests": await rows(
            "select amount, status, provider, created_at, paid_at from payment_requests "
            "where contact_id = $1 order by created_at"
        ),
        "receipts_and_invoices": await rows(
            "select kind, number, status, issue_date, total_minor as total, currency "
            "from documents where contact_id = $1 and status <> 'draft' order by issued_at"
        ),
    }
    # Who gave out a copy, and when: the record of the request.
    await team.record(conn, "conversation", contact_id, "data_exported", actor, contact_id)
    return copy


def _plain(row: dict) -> dict:
    """A row as JSON can carry it: times as ISO text, quantities as exact text."""
    out = {}
    for key, value in row.items():
        if isinstance(value, datetime | date):
            value = value.isoformat()
        elif isinstance(value, Decimal):
            value = format(value.normalize(), "f")
        elif isinstance(value, UUID):
            value = str(value)
        out[key] = value
    return out
