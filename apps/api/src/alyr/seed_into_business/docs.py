"""The documents the ten weeks would have made: receipts, invoices, a quote accepted into an
invoice, credit notes and statements of account (spec 063).

Every document is made by the Documents engine itself (`modules/documents/service.py`): its
numbers come off the series under the row lock, its totals and hash are worked out by the
engine, its PDF is drawn in Arabic and English and stored. Only the moment is borrowed: the
engine reads its clock through one function (`service._clock`, there so a test can set the
date), and each document is made with that function set to the moment it belongs to, in time
order, so the numbers rise with the dates and have no gaps.

Nothing is sent. The delivery records say "sent" for most (and "failed" for a few, which is
what the Documents screen's "not delivered" count is for), written directly as the engine's
own record of a send; no job is queued and no message leaves.
"""

from datetime import date, timedelta
from uuid import UUID

from alyr.core import team
from alyr.core.auth import Staff
from alyr.modules.documents import delivery, payments, sales, service
from alyr.modules.documents import settings as doc_settings
from alyr.modules.ledger import service as ledger
from alyr.seed_into_business import persona
from alyr.seed_into_business.context import Run

CR = "CR 000000"  # unmistakably not a real registration number


async def configure(run: Run, conn, actor: team.Actor) -> None:
    """The seller on every paper is the story's brand, in both languages, and what happens on
    its own is what the story needs (sales make papers; nothing is sent by the engine)."""
    await doc_settings.ensure(conn)
    await doc_settings.update(conn, actor, {
        "business_name": persona.BRAND_LONG, "business_name_ar": persona.BRAND_LONG_AR,
        "commercial_registration": CR, "address": persona.ADDRESS,
        "address_ar": persona.ADDRESS_AR, "phone": persona.BRAND_PHONE,
        "languages": "ar_en", "layout": "a4", "currency": "QAR", "tax_enabled": False,
        "auto_receipt_on_payment": True, "auto_invoice_credit_sales": True,
        "footer_en": "Thank you for choosing Zaman Bakehouse.",
        "footer_ar": "شكراً لاختياركم مخبز زمان.",
    })


class Clock:
    """The engine's clock, set to the moment of the paper being made."""

    def __init__(self) -> None:
        self.saved = service._clock

    def at(self, moment):
        service._clock = lambda: moment

    def restore(self) -> None:
        service._clock = self.saved


async def issue(conn, staff: Staff, clock: Clock, at, body: dict, key: str) -> dict | None:
    """Make one paper at `at`, through the engine: a draft, dated, then issued."""
    clock.at(at)
    draft = await service.create_draft(conn, staff, body)
    doc_id = UUID(draft["id"])
    await conn.execute(
        "update documents set created_at = $2, updated_at = $2 where id = $1 and status = 'draft'",
        doc_id, at - timedelta(seconds=40),
    )
    document, _ = await service.issue(conn, staff, doc_id, key=key)
    return document


async def sent(conn, document: dict, contact_id, language: str, at, actor, *, ok: bool,
               reason: str = "") -> None:
    """The engine's record of a WhatsApp send. Nothing is queued: the row is written finished."""
    row = await delivery._insert(
        conn, UUID(document["id"]), "whatsapp", "auto", contact_id, "", language, actor,
        status="sent" if ok else "failed", error=reason,
    )
    if row is not None:
        await conn.execute(
            "update document_deliveries set created_at = $2, updated_at = $2 where id = $1",
            row, at + timedelta(seconds=20),
        )


def due(at) -> date:
    return (at + timedelta(days=30)).date()


async def write(run: Run, conn, story, owner_actor: team.Actor) -> dict:
    """All of it, in time order. Returns counts of what was made."""
    staff = sales.staff_for(run.id, owner_actor)
    clock = Clock()
    counts = {"receipts": 0, "invoices": 0, "credit_notes": 0, "quotes": 0, "statements": 0,
              "payments_by_hand": 0, "deliveries": 0, "not_delivered": 0}
    rng = story.rng
    events: list[tuple] = []
    for o in story.placed:
        if o.status == "cancelled" and not (o.refund or o.reversed):
            continue
        if o.on_account:
            events.append((o.at + timedelta(seconds=5), 1, "invoice", o))
            if o.reversed:
                events.append((o.cancelled_at + timedelta(minutes=2), 3, "void", o))
        elif o.cash:
            events.append((o.paid_at, 2, "cash", o))
        elif o.request == "paid" and o.paid_at:
            events.append((o.paid_at + timedelta(seconds=8), 2, "receipt", o))
            if o.status == "cancelled" and o.refund:
                events.append((o.cancelled_at + timedelta(minutes=5), 3, "refund", o))
    for o, at, amount, method in story.invoice_payments:
        events.append((at, 4, "pay_invoice", (o, amount, method)))
    events += catering_jobs(run, story)
    invoices: dict = {}
    receipts: dict = {}
    failures = 0
    try:
        for at, _, kind, data in sorted(events, key=lambda e: (e[0], e[1])):
            if at > run.now - timedelta(seconds=60):
                continue
            if kind == "invoice":
                made = await sales.order_body(conn, data.id, "invoice", paid=False)
                body, _ = made
                body["due_date"] = due(at)
                doc = await issue(conn, staff, clock, at, body, f"invoice:order:{data.id}")
                invoices[data.id] = doc
                counts["invoices"] += 1
                failures += await maybe_send(conn, doc, data.person.id, data.person.customer.lang,
                                             at, owner_actor, rng, counts)
            elif kind in ("receipt", "refund-receipt"):
                made = await sales.order_body(conn, data.id, "receipt", paid=True)
                doc = await issue(conn, staff, clock, at, made[0], f"receipt:order:{data.id}")
                receipts[data.id] = doc
                counts["receipts"] += 1
                await maybe_send(conn, doc, data.person.id, data.person.customer.lang, at,
                                 owner_actor, rng, counts)
            elif kind == "cash":
                doc = await record_cash(conn, staff, clock, at, data, story)
                receipts[data.id] = doc
                counts["receipts"] += 1
                counts["payments_by_hand"] += 1
                await maybe_send(conn, doc, data.person.id, data.person.customer.lang, at,
                                 owner_actor, rng, counts)
            elif kind in ("void", "refund"):
                target = (invoices if kind == "void" else receipts).get(data.id)
                if target is None:
                    continue
                clock.at(at)
                reason = ("Order cancelled, sale taken off the account" if kind == "void"
                          else "Order cancelled after payment; refund due")
                note, _ = await service.credit_note(
                    conn, staff, UUID(target["id"]), reason=reason,
                    key=f"credit:order:{data.id}")
                counts["credit_notes"] += 1
                await maybe_send(conn, note, data.person.id, data.person.customer.lang, at,
                                 owner_actor, rng, counts)
            elif kind == "pay_invoice":
                o, amount, method = data
                doc = invoices.get(o.id)
                if doc is None:
                    continue
                receipt = await pay_invoice(conn, staff, clock, at, doc, o, amount, method,
                                            story)
                counts["payments_by_hand"] += 1
                counts["receipts"] += 1
                await maybe_send(conn, receipt, o.person.id, o.person.customer.lang, at,
                                 owner_actor, rng, counts)
            elif kind == "quote":
                counts["quotes"] += await catering_quote(conn, staff, clock, at, data, run,
                                                         story, counts)
    finally:
        clock.restore()
    return counts


async def maybe_send(conn, doc, contact_id, lang, at, actor, rng, counts) -> int:
    """Most papers went to the customer on WhatsApp; a few did not get through."""
    roll = rng.random()
    if roll < 0.04:
        await sent(conn, doc, contact_id, lang, at, actor, ok=False,
                   reason="The number is not on WhatsApp.")
        counts["not_delivered"] += 1
        return 1
    if roll < 0.90:
        await sent(conn, doc, contact_id, lang, at, actor, ok=True)
        counts["deliveries"] += 1
    return 0


async def record_cash(conn, staff: Staff, clock: Clock, at, o, story) -> dict:
    """Cash at the counter, recorded by hand the way the screen records it, with its receipt."""
    row = await conn.fetchrow(
        "insert into manual_payments (subject, subject_id, contact_id, amount_minor, method, "
        "reference, idempotency_key, recorded_by, recorded_by_user, recorded_at) "
        "values ('order', $1, $2, $3, 'cash', '', $4, $5, $6, $7) returning *",
        o.id, o.person.id, o.total, f"demo-cash-{o.number}", staff.name, staff.user_id, at,
    )
    clock.at(at)
    out = {"payment": None, "document": None, "replayed": False, "receipt_error": None}
    done = await payments._issue_receipt(conn, staff, row, False, out)
    story.activity.append((
        "order", o.id, o.person.id, "paid",
        {"number": o.number, "amount": f"QAR {o.total / 100:,.2f}", "method": "cash",
         "recorded_by_hand": True},
        staff.user_id, staff.name, at,
    ))
    return done["document"]


async def pay_invoice(conn, staff: Staff, clock: Clock, at, invoice: dict, o, amount: int,
                      method: str, story) -> dict:
    """A payment recorded against an invoice: the same three things `payments.record` does for
    an invoice that came from a credit sale: the payment, the customer's account, the receipt."""
    row = await conn.fetchrow(
        "insert into manual_payments (subject, subject_id, contact_id, amount_minor, method, "
        "reference, idempotency_key, recorded_by, recorded_by_user, recorded_at) "
        "values ('invoice', $1, $2, $3, $4, $5, $6, $7, $8, $9) returning *",
        UUID(invoice["id"]), o.person.id, amount, method,
        ("CHQ" if method == "cheque" else "TRF") + f"{o.number:06d}",
        f"demo-invoice-{o.number}", staff.name, staff.user_id, at,
    )
    await ledger.add_entry(conn, o.person.id, "payment", amount,
                           note=f"Invoice {invoice['number']}", created_by=staff.name,
                           at=at, documents=False)
    clock.at(at)
    out = {"payment": None, "document": None, "replayed": False, "receipt_error": None}
    done = await payments._issue_receipt(conn, staff, row, False, out)
    story.activity.append((
        "account", o.person.id, o.person.id, "paid",
        {"amount": f"QAR {amount / 100:,.2f}", "method": method, "recorded_by_hand": True},
        staff.user_id, staff.name, at,
    ))
    return done["document"]


def catering_jobs(run: Run, story) -> list[tuple]:
    """Two events caterers asked a quote for, and the quote became an invoice. The quote is a
    paper of its own; the invoice names it. Planned here, made in `catering_quote`."""
    out = []
    people = [p for p in story.made.people if p.customer.kind != "account"]
    if len(people) < 3:
        return out
    jobs = (
        (24, "Wedding favours: 80 boxes of date maamoul", "هدايا حفل زفاف: 80 علبة معمول بالتمر",
         80, 3_400, "bank_transfer"),
        (47, "Office opening: breakfast trays and coffee station",
         "افتتاح مكتب: صواني فطور وركن قهوة", 1, 168_000, "bank_transfer"),
        (58, "Graduation party: sweets for 60 guests", "حفل تخرّج: حلويات لـ 60 ضيفاً",
         3, 26_000, "cash"),
    )
    for index, (days_ago, en, ar, quantity, price, method) in enumerate(jobs):
        person = people[(index * 5 + 2) % len(people)]
        at = run.now - timedelta(days=days_ago, hours=3)
        out.append((at, 5, "quote", (person, en, ar, quantity, price, method, index)))
    return out


async def catering_quote(conn, staff, clock, at, data, run, story, counts) -> int:
    """A quote, accepted two days later into an invoice that was then paid."""
    person, en, ar, quantity, price, method, index = data
    customer = {"name": person.customer.name, "phone": f"+{persona.PHONE_BASE + 1}"}
    line = {"description": en, "description_ar": ar, "quantity": quantity, "unit": "piece",
            "unit_price_minor": price}
    quote = await issue(conn, staff, clock, at, {
        "kind": "quote", "customer": customer, "contact_id": person.id, "lines": [line],
        "due_date": (at + timedelta(days=14)).date(), "source": "manual",
        "notes": {"en": "Valid for 14 days.", "ar": "صالح لمدة 14 يوماً."},
    }, f"quote:demo:{index}")
    accepted = at + timedelta(days=2, hours=1)
    invoice = await issue(conn, staff, clock, accepted, {
        "kind": "invoice", "customer": customer, "contact_id": person.id, "lines": [line],
        "due_date": due(accepted), "source": "manual", "source_ref": quote["number"],
        "related_document_id": UUID(quote["id"]),
        "notes": {"en": f"From quote {quote['number']}.", "ar": f"من عرض السعر {quote['number']}."},
    }, f"invoice:demo:{index}")
    paid_at = accepted + timedelta(days=3)
    amount = quantity * price
    row = await conn.fetchrow(
        "insert into manual_payments (subject, subject_id, contact_id, amount_minor, method, "
        "reference, idempotency_key, recorded_by, recorded_by_user, recorded_at) "
        "values ('invoice', $1, $2, $3, $4, '', $5, $6, $7, $8) returning *",
        UUID(invoice["id"]), person.id, amount, method, f"demo-job-{index}", staff.name,
        staff.user_id, paid_at,
    )
    clock.at(paid_at)
    out = {"payment": None, "document": None, "replayed": False, "receipt_error": None}
    done = await payments._issue_receipt(conn, staff, row, False, out)
    counts["invoices"] += 1
    counts["receipts"] += 1
    counts["payments_by_hand"] += 1
    story.activity.append((
        "document", UUID(invoice["id"]), person.id, "quote_accepted",
        {"quote": quote["number"], "invoice": invoice["number"]}, staff.user_id, staff.name,
        accepted,
    ))
    return 1


async def statements(run: Run, conn, story, owner_actor: team.Actor, accounts: list) -> int:
    """A statement of account for two credit customers, as of a few minutes ago: one line for
    each age band, adding up to what the customer's account says they owe."""
    staff = sales.staff_for(run.id, owner_actor)
    clock = Clock()
    made = 0
    try:
        for person in accounts:
            aged = await ledger.aged(conn, person.id)
            if aged.balance <= 0:
                continue
            labels = {
                "d0_30": ("Current (up to 30 days)", "الحالي (حتى 30 يوماً)"),
                "d31_60": ("31 to 60 days", "من 31 إلى 60 يوماً"),
                "d61_90": ("61 to 90 days", "من 61 إلى 90 يوماً"),
                "d90_plus": ("Over 90 days", "أكثر من 90 يوماً"),
            }
            lines = [
                {"description": labels[b][0], "description_ar": labels[b][1], "quantity": 1,
                 "unit": "piece", "unit_price_minor": amount}
                for b, amount in aged.buckets.items() if amount > 0
            ]
            at = run.now - timedelta(days=1, hours=2 + made)
            await issue(conn, staff, clock, at, {
                "kind": "statement", "customer": {"name": person.customer.name},
                "contact_id": person.id, "lines": lines, "source": "manual",
                "notes": {"en": "Balance of your account with Zaman Bakehouse.",
                          "ar": "رصيد حسابكم لدى مخبز زمان."},
            }, f"statement:demo:{person.id}")
            made += 1
            if made == 2:
                break
    finally:
        clock.restore()
    return made
