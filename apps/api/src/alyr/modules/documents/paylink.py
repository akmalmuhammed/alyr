"""A payment link on an invoice made by hand (ALY-141, spec 016).

A shop that invoices for AC repair wants its customer to be able to pay the invoice from the
phone in their hand. When it can be done, the invoice carries a payment link: the QR code in the
corner of the paper and a Pay button on the hosted page are one and the same link, a
`payment_requests` row that belongs to the document.

* **When.** Only for an invoice made by hand (source `manual`: an invoice from a credit sale is a
  debt on the customer's account and is paid there), with a customer who is a contact of the shop,
  and something still owing. And only where a payment link can work: the shop has the `payments`
  module, and either a payment provider is connected (none can be yet: ALY-17) or this is a
  developer machine, where the stand-in pay page stands for the gateway. On a real server today no
  invoice gets a link, and the paper says nothing about paying online: it never claims what is
  not true.
* **Paid.** The payment page reports the payment (`ledger.complete_payment`), which calls
  `on_paid` here: the payment is written as a recorded payment against the invoice (method
  `link`, once, however often the gateway reports it) and its receipt follows by the shop's
  settings, exactly as for a payment taken by hand. The invoice's paper does not change; "paid
  now" is its paper plus the payments recorded since.
* **Moved on.** A payment taken by hand changes what is owed, so the link asks for the new
  amount (or closes when nothing is owed); cancelling the invoice with a credit note closes it.
  A customer is never asked for more than is owed.

ALYR never holds the money (hard rule 3): the link goes to the shop's own gateway account.
"""

import logging
from uuid import UUID

import asyncpg

from alyr import catalog
from alyr.config import get_settings
from alyr.core import team
from alyr.core.normalise import fmt_qar
from alyr.modules.connect import webhooks

log = logging.getLogger("alyr.documents.paylink")

LINK_METHOD = "link"


async def available(conn: asyncpg.Connection) -> bool:
    """Can an invoice of this shop carry a payment link today?"""
    if not await conn.fetchval(
        "select enabled from tenant_modules where module_key = 'payments'"
    ):
        return False
    if get_settings().env == "local":
        return True  # the stand-in pay page, on a developer machine only
    connection = catalog.CONNECTION_BY_KEY["payments"]
    if not connection.connected:
        return False
    return bool(await conn.fetchval(f"select {connection.connected}"))


def url(tenant_id: UUID, payment_id: UUID) -> str:
    return f"{get_settings().public_web_url}/pay/{tenant_id}/{payment_id}"


def wanted(row: dict) -> bool:
    """Does this invoice (the draft row about to be issued) call for a link, given the shop can
    make one? Never a document another system numbered (ALY-142): it is that system's invoice,
    ALYR only delivers it, and its payment is that system's business."""
    return (
        row["kind"] == "invoice" and row["source"] == "manual" and row["contact_id"] is not None
        and row.get("number_authority") != "external"
        and row["total_minor"] - row["paid_minor"] > 0
    )


async def ensure(conn: asyncpg.Connection, row: dict) -> str:
    """The link of an invoice about to be issued, made if there is none: its URL, or "" when this
    invoice gets none. Runs inside the issuing transaction, so a failed issue leaves no link
    behind."""
    if not wanted(row) or not await available(conn):
        return ""
    tenant_id = await conn.fetchval(
        "select nullif(current_setting('app.tenant_id', true), '')::uuid")
    payment_id = await conn.fetchval(
        "insert into payment_requests (contact_id, amount, document_id) values ($1, $2, $3) "
        "on conflict (document_id) where document_id is not null do update "
        "set amount = excluded.amount returning id",
        row["contact_id"], row["total_minor"] - row["paid_minor"], row["id"],
    )
    return url(tenant_id, payment_id)


async def of_document(conn: asyncpg.Connection, doc_id: UUID) -> dict | None:
    """The link of a document as the hosted page and the workspace show it, or None."""
    found = await conn.fetchrow(
        "select id, amount, status, tenant_id from payment_requests where document_id = $1", doc_id)
    if found is None:
        return None
    return {
        "url": url(found["tenant_id"], found["id"]), "amount_minor": found["amount"],
        "status": found["status"],
    }


async def expire(conn: asyncpg.Connection, doc_id: UUID) -> None:
    """The invoice was cancelled: its link must not take money for it."""
    await conn.execute(
        "update payment_requests set status = 'expired' "
        "where document_id = $1 and status = 'pending'", doc_id)


async def retarget(conn: asyncpg.Connection, doc_id: UUID) -> None:
    """After a payment by hand: ask for what is owed now, or close the link when nothing is."""
    owing = await conn.fetchval(
        "select d.total_minor - d.paid_minor - coalesce((select sum(m.amount_minor) "
        "from manual_payments m where m.subject = 'invoice' and m.subject_id = d.id), 0) "
        "from documents d where d.id = $1", doc_id)
    if owing is None:
        return
    if owing <= 0:
        await conn.execute(
            "update payment_requests set status = 'expired' "
            "where document_id = $1 and status = 'pending'", doc_id)
    else:
        await conn.execute(
            "update payment_requests set amount = $2 where document_id = $1 and status = 'pending'",
            doc_id, owing)


async def on_paid(conn: asyncpg.Connection, payment_id: UUID, request: asyncpg.Record) -> None:
    """The customer paid an invoice's link. Writes the payment against the invoice, once, and
    makes the receipt the shop's settings ask for. The caller (`ledger.complete_payment`) has
    already marked the request paid, in this transaction."""
    # (imported here: payments builds on the ledger, and the ledger calls this)
    from alyr.modules.documents import payments, sales

    doc_id: UUID = request["document_id"]
    shop = await conn.fetchval("select nullif(current_setting('app.tenant_id', true), '')::uuid")
    actor = team.Actor(None, "Payment link")
    row = await conn.fetchrow(
        "insert into manual_payments (subject, subject_id, contact_id, amount_minor, method, "
        "reference, idempotency_key, recorded_by) values ('invoice', $1, $2, $3, $4, $5, $6, $7) "
        "on conflict (tenant_id, idempotency_key) do nothing returning *",
        doc_id, request["contact_id"], request["amount"], LINK_METHOD, str(payment_id)[:8],
        f"paylink:{payment_id}", actor.name)
    if row is None:
        return  # the same report again: written already
    number = await conn.fetchval("select number from documents where id = $1", doc_id)
    # Like any payment recorded against an invoice, it is told to the shop's own system.
    await webhooks.emit(conn, "payment.recorded", {
        "payment_id": str(row["id"]), "subject": "invoice", "subject_id": str(doc_id),
        "amount_minor": request["amount"], "method": LINK_METHOD, "reference": str(payment_id)[:8],
    })
    await team.record(
        conn, "document", doc_id, "paid_by_link", actor, request["contact_id"],
        {"number": number, "amount": fmt_qar(request["amount"])},
    )
    cfg = await conn.fetchrow("select auto_receipt_on_payment from document_settings")
    if cfg is None or not cfg["auto_receipt_on_payment"]:
        return
    try:
        # A savepoint: a receipt that cannot be made never loses the payment.
        async with conn.transaction():
            await payments.receipt_of_payment(
                conn, sales.staff_for(shop, sales.AUTOMATIC), row["id"], None)
    except Exception:  # noqa: BLE001 - the payment is recorded; the receipt can be made again
        log.exception("the receipt of a payment by link could not be made")
        await team.record(conn, "document", doc_id, "document_skipped", actor,
                          request["contact_id"], {"kind": "receipt", "reason": "error"})
