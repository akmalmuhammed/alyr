"""Payments staff record by hand (ALY-139, spec 013).

A customer pays the shop in cash, by bank transfer, by cheque or on a card terminal, outside any
payment link. Staff write that down here: which order, booking, invoice or customer balance it
was for, how much, how, a reference (a cheque number, a transfer reference), and the receipt
follows. ALYR never holds the money (hard rule 3): this is the shop's record that it took it.

Every payment is a row in `manual_payments` (append-only: who recorded it and when, with the
request's idempotency key, so a retried request finds the payment it made), a line on the
activity record of what it paid, and, unless the shop has switched that receipt off or the
caller asks for none, a receipt:

* **order** (an unpaid pay-link order): the order becomes paid, its stock is sold, and the
  receipt is for the order's lines;
* **booking**: a receipt for the service when it is paid in full, or a deposit receipt
  saying how much has been received and how much is left, when it is paid in part;
* **invoice** (an issued invoice): a receipt for the payment, pointing at the invoice; for an
  invoice that came from a credit sale the customer's credit account is paid down too;
* **credit** (a customer's balance on their credit account): the ledger takes the payment and
  the receipt says what is left.

Who may do it: owners and admins; an agent only when the shop's setting allows it
(`agents_may_record_payments`).
"""

from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.auth import Staff
from alyr.core.normalise import fmt_qar
from alyr.modules.documents import access, money, sales, service
from alyr.modules.documents import settings as doc_settings
from alyr.modules.documents.errors import DocumentError
from alyr.modules.items import holds as stock_holds
from alyr.modules.ledger import service as ledger

SUBJECTS = ("order", "booking", "invoice", "credit")


async def require_may_record(conn: asyncpg.Connection, staff: Staff) -> None:
    if access.is_manager(staff):
        return
    if not (await doc_settings.get(conn))["agents_may_record_payments"]:
        raise DocumentError("payment_not_allowed", 403)


def _present(row: asyncpg.Record) -> dict:
    return {
        "id": str(row["id"]), "subject": row["subject"], "subject_id": str(row["subject_id"]),
        "amount_minor": row["amount_minor"], "method": row["method"],
        "reference": row["reference"], "recorded_by": row["recorded_by"],
        "recorded_at": row["recorded_at"].isoformat(),
        "receipt_document_id": str(row["receipt_document_id"])
        if row["receipt_document_id"] else None,
    }


async def _receipt_for(conn: asyncpg.Connection, staff: Staff, row: asyncpg.Record) -> dict:
    """The receipt of a recorded payment, if it has one (the document, not a copy)."""
    if row["receipt_document_id"] is None:
        return {"document": None, "replayed": False}
    return {"document": await service.get(conn, staff, row["receipt_document_id"]),
            "replayed": True}


# ── what each kind of payment does and which receipt it earns ────────────────────────────


async def _order(conn, staff, subject_id: UUID, amount: int | None, method: str, cfg: dict):
    order = await conn.fetchrow(
        "select id, number, status, payment, total, contact_id from orders "
        "where id = $1 for update", subject_id)
    if order is None:
        raise DocumentError("source_not_found", 404)
    if order["status"] == "cancelled":
        raise DocumentError("order_cancelled", 409)
    if order["payment"] == "paid":
        raise DocumentError("already_paid", 409)
    if order["payment"] == "on_account":
        raise DocumentError("order_on_account", 409)
    # Cash is rounded as the shop's setting says; any other way pays the exact total.
    expected = order["total"] + (
        money.round_to_step(order["total"], cfg["cash_rounding_minor"]) if method == "cash"
        else 0)
    if amount is not None and amount != expected:
        raise DocumentError("amount_must_match", 422)
    return order, expected


async def _settle_order(conn, staff, order, amount: int, method: str, reference: str) -> None:
    await conn.execute("update orders set payment = 'paid' where id = $1", order["id"])
    # A payment link nobody needs any more now shows as paid, and the stock the order held is
    # sold, exactly as when a gateway reports the payment.
    await conn.execute(
        "update payment_requests set status = 'paid', paid_at = now(), provider = 'manual' "
        "where order_id = $1 and status = 'pending'", order["id"])
    await stock_holds.commit(conn, order["id"])
    await team.record(
        conn, "order", order["id"], "paid", team.actor_of(staff), order["contact_id"],
        {"number": order["number"], "amount": fmt_qar(amount), "method": method,
         "recorded_by_hand": True},
    )


async def _booking(conn, subject_id: UUID, amount: int | None):
    booking = await conn.fetchrow(
        "select b.id, b.number, b.status, b.contact_id, b.service_id from bookings b "
        "where b.id = $1 for update", subject_id)
    if booking is None:
        raise DocumentError("source_not_found", 404)
    if booking["status"] == "cancelled":
        raise DocumentError("booking_cancelled", 409)
    parts = await sales.booking_parts(conn, subject_id)
    paid = sum(p["amount_minor"] for p in await sales.booking_payments(conn, subject_id))
    price = parts["price"]
    if price:
        owed = price - paid
        if owed <= 0:
            raise DocumentError("already_paid", 409)
        amount = owed if amount is None else amount
        if amount > owed:
            raise DocumentError("amount_exceeds", 422)
    elif amount is None:
        raise DocumentError("amount_needed", 422)
    return parts, paid, amount


async def _invoice(conn, subject_id: UUID, amount: int | None):
    invoice = await conn.fetchrow(
        "select id, number, kind, status, source, source_ref, contact_id, customer, total_minor, "
        "paid_minor, currency, currency_exponent, languages from documents where id = $1 "
        "for update", subject_id)
    if invoice is None:
        raise DocumentError("source_not_found", 404)
    if invoice["kind"] != "invoice" or invoice["status"] != "issued":
        raise DocumentError("invoice_not_payable", 409)
    recorded = await conn.fetchval(
        "select coalesce(sum(amount_minor), 0) from manual_payments "
        "where subject = 'invoice' and subject_id = $1", subject_id)
    owed = invoice["total_minor"] - invoice["paid_minor"] - recorded
    if owed <= 0:
        raise DocumentError("already_paid", 409)
    amount = owed if amount is None else amount
    if amount > owed:
        raise DocumentError("amount_exceeds", 422)
    return invoice, amount


async def _credit(conn, subject_id: UUID, amount: int | None):
    contact = await conn.fetchrow(
        "select id, name, phone, lang, email from contacts where id = $1 and role = 'customer'",
        subject_id)
    if contact is None:
        raise DocumentError("source_not_found", 404)
    balance = await sales.balance_at(conn, subject_id)
    if balance <= 0:
        raise DocumentError("nothing_owed", 409)
    amount = balance if amount is None else amount
    if amount > balance:
        raise DocumentError("amount_exceeds", 422)
    return contact, amount, balance


# ── recording ────────────────────────────────────────────────────────────────────────────


async def record(
    conn: asyncpg.Connection, staff: Staff, *, subject: str, subject_id: UUID,
    amount_minor: int | None, method: str, reference: str, key: str,
    receipt: bool | None = None, send: bool | None = None,
) -> dict:
    """Record a payment and (by the shop's settings, or as `receipt` says) its receipt.

    Returns {"payment", "document", "replayed", "receipt_error"}. A retried request with the
    same key returns the payment it already recorded and its receipt, and changes nothing."""
    service.check_key(key)
    if subject not in SUBJECTS or method not in sales.MANUAL_METHODS:
        raise DocumentError("kind_unknown", field="subject" if subject not in SUBJECTS
                            else "method")
    await require_may_record(conn, staff)
    await service.lock_key(conn, f"payment:{key}")
    earlier = await conn.fetchrow("select * from manual_payments where idempotency_key = $1", key)
    if earlier is not None:
        if earlier["subject"] != subject or earlier["subject_id"] != subject_id:
            raise DocumentError("key_reused", 409)
        return {"payment": _present(earlier), "replayed": True, "receipt_error": None,
                **await _receipt_for(conn, staff, earlier)}

    reference = (reference or "").strip()
    if len(reference) > 80:
        raise DocumentError("text_too_long", field="reference")
    cfg = await doc_settings.get(conn)
    actor = team.actor_of(staff)
    contact_id = None
    flag = "auto_receipt_on_payment"

    if subject == "order":
        order, amount = await _order(conn, staff, subject_id, amount_minor, method, cfg)
        contact_id = order["contact_id"]
        await _settle_order(conn, staff, order, amount, method, reference)
    elif subject == "booking":
        booking, prior, amount = await _booking(conn, subject_id, amount_minor)
        contact_id = booking["contact_id"]
        so_far = prior + amount
        kind = sales.kind_for_payment(booking["price"], so_far)
        flag = "auto_deposit_receipt" if kind == "deposit_receipt" else flag
        await team.record(
            conn, "booking", subject_id, "paid", actor, contact_id,
            {"number": booking["number"], "amount": fmt_qar(amount), "method": method,
             "recorded_by_hand": True},
        )
    elif subject == "invoice":
        invoice, amount = await _invoice(conn, subject_id, amount_minor)
        contact_id = invoice["contact_id"]
        if invoice["source"] == "order" and contact_id:
            # A credit sale's invoice is a debt on the customer's account: the payment comes
            # off it. No receipt of the ledger's own: this one names the invoice.
            await ledger.add_entry(
                conn, contact_id, "payment", amount, note=f"Invoice {invoice['number']}",
                created_by=staff.name, documents=False)
    else:
        contact, amount, balance = await _credit(conn, subject_id, amount_minor)
        contact_id = contact["id"]
        await ledger.add_entry(
            conn, contact_id, "payment", amount, note=f"Recorded by hand ({method})",
            created_by=staff.name, documents=False)
        await team.record(
            conn, "account", contact_id, "paid", actor, contact_id,
            {"amount": fmt_qar(amount), "method": method, "recorded_by_hand": True},
        )

    row = await conn.fetchrow(
        "insert into manual_payments (subject, subject_id, contact_id, amount_minor, method, "
        "reference, idempotency_key, recorded_by, recorded_by_user) "
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *",
        subject, subject_id, contact_id, amount, method, reference, key, staff.name,
        staff.user_id,
    )
    out = {"payment": _present(row), "document": None, "replayed": False, "receipt_error": None}
    if not await sales.enabled(conn):
        return out
    if receipt is False or (receipt is None and not cfg[flag]):
        return out
    return await _issue_receipt(conn, staff, row, send, out)


async def receipt_of_payment(
    conn: asyncpg.Connection, staff: Staff, payment_id: UUID, send: bool | None = None,
) -> dict:
    """The receipt of a payment that was recorded without one (the shop had receipts off, or
    the person asked for none). Asking again returns the same receipt."""
    await require_may_record(conn, staff)
    row = await conn.fetchrow("select * from manual_payments where id = $1", payment_id)
    if row is None:
        raise DocumentError("source_not_found", 404)
    out = {"payment": _present(row), "document": None, "replayed": False, "receipt_error": None}
    if row["receipt_document_id"] is not None:
        return {**out, **await _receipt_for(conn, staff, row)}
    result = await _issue_receipt(conn, staff, row, send, out)
    if result["document"] is None:
        raise DocumentError(result["receipt_error"] or "error", 422)
    return result


async def _issue_receipt(conn, staff: Staff, row: asyncpg.Record, send: bool | None,
                         out: dict) -> dict:
    """Build and issue the receipt for a recorded payment, then link it back to the payment."""
    actor = team.actor_of(staff)
    cfg = await doc_settings.get(conn)
    subject, subject_id = row["subject"], row["subject_id"]
    paper = sales.PAPER_METHOD.get(row["method"], row["method"])
    pay = {"method": paper, "amount_minor": row["amount_minor"], "reference": row["reference"]}
    key = f"receipt:payment:{row['id']}"
    contact_id = row["contact_id"]
    if subject == "order":
        made = await sales.order_body(conn, subject_id, "receipt", paid=True)
        body = made[0] if made else None
        scope, scope_id = "order", subject_id
    elif subject == "booking":
        booking = await sales.booking_parts(conn, subject_id)
        payments = await sales.booking_payments(conn, subject_id, upto=row["recorded_at"])
        paid = sum(p["amount_minor"] for p in payments)
        kind = sales.kind_for_payment(booking["price"], paid)
        total = booking["price"] or row["amount_minor"]
        body = sales.booking_body(cfg, booking, kind, payments, total, str(subject_id))
        scope, scope_id = "booking", subject_id
    elif subject == "invoice":
        invoice = await conn.fetchrow(
            "select id, number, contact_id, customer from documents where id = $1", subject_id)
        body = {
            "kind": "receipt", "customer": dict(invoice["customer"] or {}),
            "contact_id": invoice["contact_id"], "related_document_id": invoice["id"],
            "lines": [{"description": f"Payment against invoice {invoice['number']}",
                       "description_ar": f"دفعة عن الفاتورة {invoice['number']}", "quantity": 1,
                       "unit": "piece", "unit_price_minor": row["amount_minor"]}],
            "payments": [pay], "source": "manual", "source_ref": str(row["id"]),
            "round_cash": False,
        }
        scope, scope_id = "document", subject_id
    else:
        contact = await conn.fetchrow(
            "select id, name, phone, lang, email from contacts where id = $1", subject_id)
        remaining = await sales.balance_at(conn, subject_id, upto=row["recorded_at"])
        body = sales.credit_payment_body(
            cfg, contact, row["amount_minor"], remaining, method=paper,
            reference=row["reference"], source="ledger_payment", source_ref=str(row["id"]),
            currency=cfg["currency"], exponent=money.CURRENCIES[cfg["currency"]].exponent,
        )
        scope, scope_id = "account", subject_id
    if body is None:
        out["receipt_error"] = "source_not_found"
        return out
    if subject in ("order", "credit"):
        body["payments"] = [pay]
        body["round_cash"] = subject == "order" and paper == "cash"
    done = await sales.issue(conn, actor, body, key, subject=scope, subject_id=scope_id,
                             contact_id=contact_id, send=send)
    if done.document is None:
        out["receipt_error"] = done.error
        return out
    await conn.execute(
        "update manual_payments set receipt_document_id = $2 where id = $1 "
        "and receipt_document_id is null", row["id"], UUID(done.document["id"]))
    out["document"], out["replayed"] = done.document, done.replayed
    out["payment"]["receipt_document_id"] = done.document["id"]
    return out
