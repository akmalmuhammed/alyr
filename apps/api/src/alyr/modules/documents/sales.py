"""Documents from ALYR's own sales (ALY-139, spec 013).

The engine (`service.py`) can issue any document; this module is where ALYR's orders, bookings
and credit accounts ask it to. Every hook here follows the same four rules.

* **Only for a shop that has the `documents` module on.** The first thing every hook does is
  look; a shop without the module behaves exactly as it did before this package (one extra
  `select`, no row written).
* **Once, however often the event fires.** Each document is issued with an idempotency key made
  of what it is for (`receipt:order:<order id>`), so a payment that is reported twice, two
  requests at the same moment, or a retried job find the document that is already there. The
  engine takes an advisory lock on the key, so even concurrent callers take turns.
* **It never breaks the sale.** A hook runs inside the sale's own transaction (an order is paid
  and its receipt is made together), but behind a savepoint: if the document cannot be issued
  (an invoice for a shop with no CR number, a customer with no name) the sale goes ahead, the
  reason is written to the activity record as `document_skipped`, and nothing is half done.
* **Sending is a separate step.** Issuing queues the delivery rows the shop's settings ask for
  (`delivery.py`); the job queue sends them. A document is never sent twice by the shop's
  automatic settings (a database index), and staff can always send again on purpose.

The documents are made by the shop's engine under the shop's own settings, as the shop: the
issuer on the paper is "ALYR" for an automatic one, or the person who recorded the payment.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.documents import delivery, money, service
from alyr.modules.documents import settings as doc_settings
from alyr.modules.documents.errors import DocumentError
from alyr.modules.ledger.ageing import age

log = logging.getLogger("alyr.documents.sales")

# Who issues a document nobody asked for by hand: the shop's own automatic bookkeeping.
AUTOMATIC = team.Actor(None, "ALYR")

# The ways staff can say money arrived, and the word the paper uses for each.
MANUAL_METHODS = ("cash", "bank_transfer", "cheque", "card_terminal")
PAPER_METHOD = {"card_terminal": "card"}


# ── who and whether ───────────────────────────────────────────────────────────────────────


async def enabled(conn: asyncpg.Connection) -> bool:
    """Whether the current shop has Documents switched on."""
    return bool(await conn.fetchval(
        "select enabled from tenant_modules where module_key = 'documents'"
    ))


def staff_for(tenant_id: UUID, actor: team.Actor) -> Staff:
    """The shop acting as itself. A sale made at the counter is the shop's, whatever the role of
    the person who pressed the button: an agent who is allowed to record a payment is allowed
    the receipt that goes with it. The paper still names the person (`issued_by`)."""
    return Staff(actor.id, actor.name, "", "owner", tenant_id)


class Issued:
    """What an attempt to issue a document came to."""

    def __init__(self, document: dict | None, replayed: bool = False,
                 error: str | None = None) -> None:
        self.document, self.replayed, self.error = document, replayed, error


async def queue_delivery(conn: asyncpg.Connection, document: dict, contact_id: UUID | None,
                         send: bool | None, actor: team.Actor) -> None:
    """Queue what the shop's settings send, behind a savepoint of its own: a failure here
    leaves the document issued and the sale untouched (the owner sees it was not sent)."""
    try:
        async with conn.transaction():
            await delivery.queue_auto(conn, document, contact_id, send=send, actor=actor)
    except Exception:  # noqa: BLE001 - sending is never worth losing a sale for
        log.exception("a document could not be queued for sending")


async def issue(
    conn: asyncpg.Connection, actor: team.Actor, body: dict, key: str, *, subject: str,
    subject_id: UUID, contact_id: UUID | None, send: bool | None = None,
) -> Issued:
    """Issue one document, once, behind a savepoint, then queue its delivery.

    Never raises for a document that cannot be made: it returns `Issued(error=code)` and writes
    `document_skipped` on the activity record of `subject` (`order`, `booking`, `account`).
    `send` is None to follow the shop's settings, False to send nothing, True to send even if
    the shop sends by hand."""
    tenant_id = await doc_settings.shop_id(conn)
    try:
        async with conn.transaction():
            document, replayed = await service.create_and_issue(
                conn, staff_for(tenant_id, actor), body, key=key
            )
    except DocumentError as error:
        code = error.code
    except Exception:  # noqa: BLE001 - a document must never take the sale down with it
        log.exception("a document could not be issued (%s)", body.get("kind"))
        code = "error"
    else:
        if not replayed:
            await queue_delivery(conn, document, contact_id, send, actor)
        return Issued(document, replayed)
    await team.record(
        conn, subject, subject_id, "document_skipped", actor, contact_id,
        {"kind": body.get("kind"), "reason": code},
    )
    return Issued(None, error=code)


# ── reading a sale into a document ────────────────────────────────────────────────────────


def _customer(contact: asyncpg.Record) -> dict:
    phone = (contact["phone"] or "").strip()
    out = {"name": contact["name"]}
    if phone:
        out["phone"] = phone if phone.startswith("+") else f"+{phone}"
    if contact["email"]:
        out["email"] = contact["email"]
    return out


def _note(cfg: dict, kind: str, en: str, ar: str) -> dict:
    """The sale's own reference first, then the shop's standing note for that kind of
    document, so a note the shop wrote is not lost."""
    base = (cfg["notes"] or {}).get(kind, {})
    return {
        "en": " ".join(p for p in (en, base.get("en", "")) if p)[:600],
        "ar": " ".join(p for p in (ar, base.get("ar", "")) if p)[:600],
    }


def _order_line(item: asyncpg.Record) -> dict:
    extra = ([item["variant_name"]] if item["variant_name"] else [])
    extra_ar = ([item["variant_name_ar"] or item["variant_name"]] if item["variant_name"] else [])
    for option in item["options"] or []:
        extra.append(option["name"])
        extra_ar.append(option.get("name_ar") or option["name"])
    name_ar = item["name_ar"] or ""
    return {
        "description": item["name"] + (f" ({', '.join(extra)})" if extra else ""),
        "description_ar": (name_ar + (f" ({', '.join(extra_ar)})" if extra_ar else ""))
        if name_ar else "",
        # (the unit the line was ordered in: a weight or a volume keeps it; ALY-149)
        "sku": item["sku"] or "", "quantity": item["quantity"], "unit": item["unit"],
        "unit_price_minor": item["price"],
        # What a discount took off this line (ALY-150): the paper shows it and still adds up to
        # what the customer was charged.
        **({"discount_minor": item["discount"]} if item["discount"] else {}),
    }


def _delivery_line(order: asyncpg.Record) -> dict:
    """The delivery fee of an order (ALY-150), as a line of its own, so the paper's total is
    the order's."""
    zone, zone_ar = order["delivery_zone_name"], order["delivery_zone_name_ar"] or order[
        "delivery_zone_name"]
    return {
        "description": f"Delivery ({zone})" if zone else "Delivery",
        "description_ar": f"التوصيل ({zone_ar})" if zone_ar else "التوصيل",
        "quantity": 1, "unit": "service", "unit_price_minor": order["delivery_fee"],
    }


async def order_parts(conn: asyncpg.Connection, order_id: UUID):
    """The order, its customer and its lines as a document's lines; None if there is no such
    order in this shop."""
    order = await conn.fetchrow(
        "select o.id, o.number, o.status, o.payment, o.total, o.contact_id, c.name, c.phone, "
        "c.lang, c.email, o.delivery_fee, o.delivery_zone_name, o.delivery_zone_name_ar, o.is_test "
        "from orders o join contacts c on c.id = o.contact_id where o.id = $1",
        order_id,
    )
    if order is None:
        return None
    items = await conn.fetch(
        "select o.name, coalesce(nullif(o.name_ar, ''), p.name_ar, '') as name_ar, o.price, "
        "o.quantity, o.unit, o.variant_name, o.variant_name_ar, o.options, o.sku, o.discount "
        "from order_items o left join items p on p.id = o.item_id "
        "where o.order_id = $1 order by o.name, o.id",
        order_id,
    )
    lines = [_order_line(i) for i in items]
    if order["delivery_fee"]:
        lines.append(_delivery_line(order))
    return order, lines


async def order_payment(conn: asyncpg.Connection, order_id: UUID, total: int) -> list[dict]:
    """How a paid order was paid, for the receipt: what staff recorded, else the payment link
    (the stand-in gateway says nothing about itself; a real one names itself)."""
    recorded = await conn.fetchrow(
        "select method, reference, amount_minor from manual_payments "
        "where subject = 'order' and subject_id = $1 order by recorded_at limit 1", order_id,
    )
    if recorded:
        return [{"method": PAPER_METHOD.get(recorded["method"], recorded["method"]),
                 "amount_minor": recorded["amount_minor"], "reference": recorded["reference"]}]
    gateway = await conn.fetchval(
        "select provider from payment_requests where order_id = $1 and status = 'paid' "
        "order by paid_at desc limit 1", order_id,
    )
    return [{"method": "link", "amount_minor": total,
             "reference": "" if gateway in (None, "standin", "manual") else gateway}]


async def order_body(
    conn: asyncpg.Connection, order_id: UUID, kind: str, *, paid: bool,
) -> tuple[dict, asyncpg.Record] | None:
    """The request body for a receipt (paid) or invoice (paid or not) for an order."""
    parts = await order_parts(conn, order_id)
    if parts is None:
        return None
    order, lines = parts
    if order["is_test"]:
        # The owner's own test order gets no document: a number in the shop's sequence is
        # never spent on it (ALY-168).
        return None
    cfg = await doc_settings.get(conn)
    body = {
        "kind": kind, "customer": _customer(order), "contact_id": order["contact_id"],
        "lines": lines, "source": "order", "source_ref": str(order_id),
        "notes": _note(cfg, kind, f"Order {order['number']}.", f"الطلب رقم {order['number']}."),
        "payments": [], "round_cash": False,
    }
    if paid:
        payments = await order_payment(conn, order_id, order["total"])
        body["payments"] = payments
        # Cash rounding is for notes and coins: a cash payment recorded by hand is for the
        # rounded total, and the document rounds it too.
        body["round_cash"] = payments[0]["method"] == "cash"
    return body, order


# ── the hooks the sales call ──────────────────────────────────────────────────────────────


async def order_paid(conn: asyncpg.Connection, order_id: UUID, *, actor: team.Actor = AUTOMATIC,
                     force: bool = False, send: bool | None = None) -> Issued | None:
    """An order has just been paid: its receipt. Called where the payment is recorded, in the
    payment's transaction. `force` (a payment staff recorded by hand) makes the receipt even if
    the shop has switched automatic receipts off."""
    if not await enabled(conn):
        return None
    if not force and not (await doc_settings.get(conn))["auto_receipt_on_payment"]:
        return None
    made = await order_body(conn, order_id, "receipt", paid=True)
    if made is None:
        return None
    body, order = made
    return await issue(conn, actor, body, f"receipt:order:{order_id}", subject="order",
                       subject_id=order_id, contact_id=order["contact_id"], send=send)


async def credit_sale(conn: asyncpg.Connection, order_id: UUID) -> Issued | None:
    """An order was put on the customer's credit account: an invoice for it."""
    if not await enabled(conn):
        return None
    if not (await doc_settings.get(conn))["auto_invoice_credit_sales"]:
        return None
    made = await order_body(conn, order_id, "invoice", paid=False)
    if made is None:
        return None
    body, order = made
    return await issue(conn, AUTOMATIC, body, f"invoice:order:{order_id}", subject="order",
                       subject_id=order_id, contact_id=order["contact_id"])


async def balance_at(conn: asyncpg.Connection, contact_id: UUID,
                     upto: datetime | None = None) -> int:
    """What the customer owes on their credit account, counting entries made up to `upto`
    (the moment of a payment, for the receipt that mentions what is left)."""
    rows = await conn.fetch(
        "select kind, amount, created_at, order_id from ledger_entries "
        "where contact_id = $1 and ($2::timestamptz is null or created_at <= $2)",
        contact_id, upto,
    )
    return age([(r["kind"], r["amount"], r["created_at"], r["order_id"]) for r in rows],
               datetime.now(UTC)).balance


def credit_payment_body(
    cfg: dict, contact: asyncpg.Record, amount: int, remaining: int, *, method: str,
    reference: str, source: str, source_ref: str, currency: str, exponent: int,
) -> dict:
    """A receipt for money received on a customer's credit account, saying what is left."""
    if remaining > 0:
        note_en = ("Remaining balance on your account: "
                   f"{money.written(remaining, currency, exponent, 'en')}.")
        note_ar = ("الرصيد المتبقي على حسابك: "
                   f"{money.written(remaining, currency, exponent, 'ar')}.")
    else:
        note_en, note_ar = "Nothing is owed on your account.", "لا يوجد مبلغ مستحق على حسابك."
    return {
        "kind": "receipt", "customer": _customer(contact), "contact_id": contact["id"],
        "lines": [{"description": "Payment on account", "description_ar": "دفعة على الحساب",
                   "quantity": 1, "unit": "piece", "unit_price_minor": amount}],
        "payments": [{"method": method, "amount_minor": amount, "reference": reference}],
        "source": source, "source_ref": source_ref, "round_cash": False,
        "notes": _note(cfg, "receipt", note_en, note_ar),
    }


async def credit_payment(
    conn: asyncpg.Connection, contact_id: UUID, entry_id: UUID, amount: int, *,
    via_link: bool, actor: team.Actor = AUTOMATIC,
) -> Issued | None:
    """A payment was written on a customer's credit account (by their payment link, or by staff
    in the chat): a receipt that says what is left. Called by `ledger.add_entry`."""
    if not await enabled(conn):
        return None
    cfg = await doc_settings.get(conn)
    if not cfg["auto_receipt_on_payment"]:
        return None
    contact = await conn.fetchrow(
        "select id, name, phone, lang, email from contacts where id = $1", contact_id)
    if contact is None:
        return None
    remaining = await balance_at(conn, contact_id)
    body = credit_payment_body(
        cfg, contact, amount, remaining, method="link" if via_link else "other", reference="",
        source="ledger_payment", source_ref=str(entry_id), currency=cfg["currency"],
        exponent=money.CURRENCIES[cfg["currency"]].exponent,
    )
    return await issue(conn, actor, body, f"receipt:payment:{entry_id}", subject="account",
                       subject_id=contact_id, contact_id=contact_id)


async def order_cancelled(conn: asyncpg.Connection, order_id: UUID, number: int,
                          actor: team.Actor) -> list[dict]:
    """An order was cancelled: every receipt or invoice issued for it gets its credit note, once.

    Called from `orders.service.cancel_order`, in the cancellation's own transaction, after the
    order row is locked and its status changed. A credit note is the engine's: numbered,
    immutable and linked to the document it cancels; the original becomes void. The key is made
    of the original's ID, so a second call (or a second cancel racing the first) finds the credit
    note that is already there."""
    if not await enabled(conn):
        return []
    originals = await conn.fetch(
        "select id, contact_id, kind from documents where source = 'order' and source_ref = $1 "
        "and kind in ('receipt', 'invoice') and status = 'issued' order by seq",
        str(order_id),
    )
    made = []
    tenant_id = await doc_settings.shop_id(conn)
    for original in originals:
        key = f"credit-note:{original['id']}"
        try:
            async with conn.transaction():
                note, replayed = await service.credit_note(
                    conn, staff_for(tenant_id, actor), original["id"],
                    reason=f"Order {number} cancelled", key=key,
                )
        except Exception as error:  # noqa: BLE001 - the cancellation goes ahead regardless
            code = error.code if isinstance(error, DocumentError) else "error"
            if code == "error":
                log.exception("a credit note could not be issued")
            await team.record(conn, "order", order_id, "document_skipped", actor,
                              original["contact_id"], {"kind": "credit_note", "reason": code})
            continue
        if not replayed:
            await queue_delivery(conn, note, original["contact_id"], None, actor)
        made.append(note)
    return made


# ── on request: an invoice or a receipt for any order or booking ──────────────────────────


async def from_order(conn: asyncpg.Connection, staff: Staff, order_id: UUID, kind: str,
                     send: bool | None) -> tuple[dict, bool]:
    """An invoice for any order (paid or not), or a receipt for a paid one, made on request.
    The same document as the automatic one if it exists: the key is shared, so asking twice
    returns it."""
    if kind not in ("invoice", "receipt"):
        raise DocumentError("kind_not_for_sale")
    parts = await order_parts(conn, order_id)
    if parts is None:
        raise DocumentError("source_not_found", 404)
    order, _ = parts
    if order["is_test"]:
        raise DocumentError("order_is_test", 409)
    if order["status"] == "cancelled":
        raise DocumentError("order_cancelled", 409)
    paid = order["payment"] == "paid"
    if kind == "receipt" and not paid:
        raise DocumentError("receipt_unpaid", 409)
    made = await order_body(conn, order_id, kind, paid=paid)
    assert made is not None
    body, _ = made
    return await _on_request(conn, staff, body, f"{kind}:order:{order_id}", send,
                             order["contact_id"])


async def booking_payments(conn: asyncpg.Connection, booking_id: UUID,
                           upto: datetime | None = None) -> list[dict]:
    rows = await conn.fetch(
        "select method, reference, amount_minor from manual_payments "
        "where subject = 'booking' and subject_id = $1 and ($2::timestamptz is null "
        "or recorded_at <= $2) order by recorded_at, id", booking_id, upto,
    )
    return [{"method": PAPER_METHOD.get(r["method"], r["method"]),
             "amount_minor": r["amount_minor"], "reference": r["reference"]} for r in rows]


async def booking_parts(conn: asyncpg.Connection, booking_id: UUID):
    return await conn.fetchrow(
        "select b.id, b.number, b.status, b.contact_id, b.service_name, "
        "s.name_ar as service_name_ar, s.price, c.name, c.phone, c.lang, c.email "
        "from bookings b join services s on s.id = b.service_id "
        "join contacts c on c.id = b.contact_id where b.id = $1", booking_id,
    )


def booking_body(cfg: dict, booking: asyncpg.Record, kind: str, payments: list[dict],
                 total: int, source_ref: str) -> dict:
    """A document for a booking: the service as one line, at the price the shop charges (or,
    when the service has no price, at what was paid), with the payments received so far."""
    return {
        "kind": kind, "customer": _customer(booking), "contact_id": booking["contact_id"],
        "lines": [{"description": booking["service_name"],
                   "description_ar": booking["service_name_ar"] or "", "quantity": 1,
                   "unit": "service", "unit_price_minor": total}],
        "payments": payments, "source": "booking", "source_ref": source_ref,
        "round_cash": False,
        "notes": _note(cfg, kind, f"Booking {booking['number']}.",
                       f"الحجز رقم {booking['number']}."),
    }


async def from_booking(conn: asyncpg.Connection, staff: Staff, booking_id: UUID, kind: str,
                       send: bool | None) -> tuple[dict, bool]:
    """An invoice for a booking, made on request, at the service's price with whatever staff
    have recorded as paid so far."""
    if kind != "invoice":
        raise DocumentError("kind_not_for_sale")
    booking = await booking_parts(conn, booking_id)
    if booking is None:
        raise DocumentError("source_not_found", 404)
    if booking["status"] == "cancelled":
        raise DocumentError("booking_cancelled", 409)
    if not booking["price"]:
        raise DocumentError("amount_needed", field="price")
    cfg = await doc_settings.get(conn)
    payments = await booking_payments(conn, booking_id)
    body = booking_body(cfg, booking, "invoice", payments, booking["price"], str(booking_id))
    return await _on_request(conn, staff, body, f"invoice:booking:{booking_id}", send,
                             booking["contact_id"])


async def _on_request(conn: asyncpg.Connection, staff: Staff, body: dict, key: str,
                      send: bool | None, contact_id: UUID) -> tuple[dict, bool]:
    """Issue what a person asked for. Unlike the hooks, a refusal reaches the person (an
    invoice for a shop with no CR number says so, with the words for it)."""
    document, replayed = await service.create_and_issue(conn, staff, body, key=key)
    if not replayed:
        await queue_delivery(conn, document, contact_id, send, team.actor_of(staff))
    return document, replayed


def kind_for_payment(booking_total: int, paid_so_far: int) -> str:
    """A booking paid in full gets a receipt; paid in part, a deposit receipt."""
    if booking_total and paid_so_far < booking_total:
        return "deposit_receipt"
    return "receipt"
