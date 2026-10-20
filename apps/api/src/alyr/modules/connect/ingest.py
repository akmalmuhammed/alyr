"""One sale in, one document out, once (ALY-142, spec 015).

`accept` is the single door for a sale that another system reports: the open API calls it for a
till's sale and the CSV import calls it for each sale in a file, so a row from a file is held to
exactly what a call from a POS is. In the caller's transaction (so everything below commits or
rolls back together) it:

1. **Makes the request idempotent.** The `Idempotency-Key` and the other system's own sale ID are
   both locked, then looked up. The same key with the same body returns the first answer
   (`replayed: true`); the same key with a different body is refused (409); the same sale (its
   kind and ID) under another key returns the first answer if the body is the same and is refused
   if it is not. A sale is on paper once, whatever the network does.
2. **Checks what was sent.** The lines are priced by the engine's one rounding rule and the total
   is worked out; the total the other system sent must agree within a minor unit a line (the
   difference goes on the paper as the document's rounding line, so the total ALYR prints is the
   total the till printed), or the sale is refused with both numbers.
3. **Asks who owns the numbers.** If the shop gave this kind of document to its other system,
   the paper carries that system's own number (`external_document_number`, required), ALYR takes
   none and its counters are not touched. If ALYR numbers the kind, it numbers it as always.
4. **Finds or makes the customer** by phone number, and, when delivery is asked for, records the
   shop's assertion of permission as a `service` consent with source `connected_sale`
   (`terms.py`), unless the customer has said stop, which no shop's assertion overrides.
5. **Links the lines to the Catalog** by SKU where they match. A link only: the other system owns
   its stock, and ALYR moves none.
6. **Issues** the paper, **writes the sale** (key, hash, request, links) and **asks for delivery**
   (`delivery.queue_connected`), which the job queue carries out and which tells the shop what
   became of it.

A credit note names the earlier sale it credits (`credits_sale_id`); the original must be a
receipt, invoice or deposit receipt ALYR has already been sent.
"""

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.config import get_settings
from alyr.core import consent, identity, links, mail, team
from alyr.modules.connect import terms
from alyr.modules.connect.schemas import PaymentIn, SaleIn
from alyr.modules.connect.words import ConnectError
from alyr.modules.documents import authority, delivery, kinds, money, prepare, sales, service
from alyr.modules.documents import settings as doc_settings

KEY_PATTERN = re.compile(r"[A-Za-z0-9_.:-]{8,120}")
NUMBER_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9 ._/#:\-]{0,79}")
CONTROL = re.compile(r"[\x00-\x1f\x7f]")
OLDEST_SALE = timedelta(days=730)


class Sender:
    """Who is sending: a key (the open API) or a person applying a CSV import. Only what the
    record needs to say who."""

    def __init__(self, actor: team.Actor, *, via: str, api_key_id: UUID | None = None,
                 key_prefix: str = "", import_id: UUID | None = None) -> None:
        self.actor, self.via, self.api_key_id = actor, via, api_key_id
        self.key_prefix, self.import_id = key_prefix, import_id


# ── small pieces ─────────────────────────────────────────────────────────────────────────


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def phone_digits(text: str) -> str:
    """A phone number in international format as digits: `+974 5555 0123` or `00974...` to
    `97455550123`. A number with no country code is refused rather than guessed."""
    raw = re.sub(r"[\s\-().]", "", text or "")
    if raw.startswith("00"):
        raw = "+" + raw[2:]
    if not raw.startswith("+") or not raw[1:].isdigit() or not 8 <= len(raw) - 1 <= 15 \
            or raw[1] == "0":
        raise ConnectError("phone_invalid", field="customer.phone")
    return raw[1:]


def document_key(kind: str, external_sale_id: str, generation: int = 0) -> str:
    """The engine's idempotency key for this sale: fixed by what the sale is, not by the
    request, so a sale can only ever make one document. `generation` counts the times the sale
    was taken before: a document that was withdrawn (an import undone) still holds its key, so
    the same sale sent again, to be on paper properly this time, needs a new one."""
    text = f"{kind}:{external_sale_id}" + (f":{generation}" if generation else "")
    return "connect:" + hashlib.sha256(text.encode()).hexdigest()[:40]


def _check_text(value: str, field: str) -> str:
    if CONTROL.search(value):
        raise ConnectError("external_number_invalid", field=field)
    return value


async def _tenant_row(conn: asyncpg.Connection) -> asyncpg.Record:
    return await conn.fetchrow(
        "select id, slug, name, name_ar, timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid")


def _sold_on(sale: SaleIn, tz: str):
    """The day the other system made the sale, for the paper's date. Not in the future (an hour
    of clock difference is allowed) and not older than two years."""
    given = sale.payment if isinstance(sale.payment, PaymentIn) else None
    moment = sale.sold_at or (given.paid_at if given else None)
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=ZoneInfo(tz))
    now = datetime.now(UTC)
    if moment > now + timedelta(hours=1) or moment < now - OLDEST_SALE:
        raise ConnectError("sold_at_invalid", field="sold_at")
    return moment.astimezone(ZoneInfo(tz)).date()


def _lines_of(sale: SaleIn) -> list[dict]:
    return [
        {"description": line.description, "description_ar": line.description_ar,
         "sku": line.sku, "quantity": line.quantity, "unit": line.unit,
         "unit_price_minor": line.unit_price_minor, "discount_minor": line.discount_minor,
         "tax_rate_bp": line.tax_rate_bp}
        for line in sale.lines
    ]


def check_totals(sale: SaleIn) -> int:
    """Work the total out from the lines and compare it with what the other system sent.
    Returns the rounding line the paper needs so that its total is the one sent (the other
    system's own rounding plus whatever small difference per-line rounding left). Raises
    `totals_mismatch`, saying both numbers, when the difference is more than a minor unit a
    line."""
    cleaned = [prepare.clean_line(raw, i, tax_enabled=True)
               for i, raw in enumerate(_lines_of(sale), start=1)]
    worked = prepare.totals_of(cleaned)
    declared = sale.totals
    rounding = declared.rounding_minor or 0
    tolerance = max(1, len(cleaned))
    expected = worked["total_minor"] + rounding
    difference = declared.total_minor - expected
    problems = {}
    if abs(difference) > tolerance:
        problems = {"field": "totals.total_minor", "expected_total_minor": expected,
                    "sent_total_minor": declared.total_minor}
    elif declared.tax_minor is not None and abs(declared.tax_minor - worked["tax_minor"]) \
            > tolerance:
        problems = {"field": "totals.tax_minor", "expected_tax_minor": worked["tax_minor"],
                    "sent_tax_minor": declared.tax_minor}
    elif declared.discount_minor is not None \
            and declared.discount_minor != worked["discount_minor"]:
        problems = {"field": "totals.discount_minor",
                    "expected_discount_minor": worked["discount_minor"],
                    "sent_discount_minor": declared.discount_minor}
    if problems:
        raise ConnectError("totals_mismatch", tolerance_minor=tolerance, **problems)
    paper_rounding = rounding + difference
    if abs(paper_rounding) > 1000:
        raise ConnectError("rounding_invalid", field="totals.rounding_minor")
    return paper_rounding


def _payments_of(sale: SaleIn, total: int) -> list[dict]:
    kind = kinds.KINDS[sale.kind]
    given = sale.payment if isinstance(sale.payment, PaymentIn) else None
    if given is None:
        if kind.payments == kinds.FULL:
            raise ConnectError("receipt_needs_payment", field="payment")
        if kind.payments == kinds.DEPOSIT:
            raise ConnectError("receipt_needs_payment", field="payment")
        return []
    if kind.payments == kinds.NONE:
        raise ConnectError("payment_not_for_kind", field="payment")
    if given.amount_minor > total:
        raise ConnectError("payment_too_big", field="payment.amount_minor")
    if kind.payments == kinds.FULL and given.amount_minor != total:
        raise ConnectError("receipt_needs_payment", field="payment.amount_minor")
    return [{"method": given.method, "amount_minor": given.amount_minor,
             "reference": given.reference}]


def _customer_snapshot(sale: SaleIn, digits: str) -> dict:
    c = sale.customer
    fields = {"name": c.name, "name_ar": c.name_ar, "company": c.company, "tax_id": c.tax_id,
              "email": c.email, "address": c.address, "address_ar": c.address_ar}
    out = {"phone": "+" + digits, **{k: v for k, v in fields.items() if v}}
    named = out.get("name") or out.get("name_ar") or out.get("company")
    if not named and kinds.KINDS[sale.kind].needs_customer:
        raise ConnectError("customer_name_needed", field="customer.name")
    if not named:
        out["name"] = out["phone"]  # a receipt may be for "a customer": the number says who
    return out


# ── the customer ─────────────────────────────────────────────────────────────────────────


async def find_or_make_contact(
    conn: asyncpg.Connection, sale: SaleIn, digits: str, lead_language: str,
) -> tuple[asyncpg.Record, bool]:
    """The shop's contact for this phone number, made if there is none. An existing contact
    keeps its name and language; a new one takes the sale's. Returns (contact, created)."""
    # Two sales for one new customer at the same moment (two tills, or a till and a retry of
    # another sale) must take turns, or both would make the contact and one would fail.
    await service.lock_key(conn, f"connect-contact:{digits}")
    found = await conn.fetchrow(
        "select id from contacts where phone in ($1, '+' || $1) limit 1", digits)
    contact_id = (found["id"] if found
                  else (await identity.resolve_contact(conn, phone=digits))["id"])
    created = found is None
    c = sale.customer
    if created:
        name = c.name or c.name_ar or c.company
        await conn.execute(
            "update contacts set name = coalesce(nullif($2, ''), name), lang = $3 where id = $1",
            contact_id, name, sale.language or lead_language)
    if c.email and mail.deliverable(c.email) \
            and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", c.email):
        await conn.execute("update contacts set email = $2 where id = $1 and email is null",
                           contact_id, c.email)
    return await conn.fetchrow(
        "select id, name, lang, email, consent_service from contacts where id = $1",
        contact_id), created


async def record_assertion(conn: asyncpg.Connection, contact: asyncpg.Record, sender: Sender,
                           version: int) -> str:
    """The shop's assertion as a service consent, once, when the customer has not decided
    anything yet. Returns where the customer stands now: granted, unknown or revoked. A customer
    who said stop stays stopped."""
    state = contact["consent_service"]
    if state == "unknown":
        await consent.record(conn, contact["id"], "service", "granted", "connected_sale",
                             terms.wording(sender.key_prefix, version))
        return "granted"
    return state


# ── the Catalog link ─────────────────────────────────────────────────────────────────────


async def match_skus(conn: asyncpg.Connection, sale: SaleIn) -> list[dict]:
    """Where a line's SKU is an item's (or one of its sizes') in the shop's Catalog: a record
    that they are the same thing. Nothing about stock changes."""
    wanted = {line.sku.lower(): line.sku for line in sale.lines if line.sku}
    if not wanted:
        return []
    rows = await conn.fetch(
        "select lower(i.sku) as sku, i.id as item_id, null::uuid as variant_id from items i "
        "where i.status = 'live' and not i.is_sample and i.sku <> '' and lower(i.sku) = any($1) "
        "union all select lower(v.sku), v.item_id, v.id from item_variants v "
        "join items i on i.id = v.item_id where i.status = 'live' and not i.is_sample "
        "and v.active and v.sku <> '' and lower(v.sku) = any($1)", list(wanted))
    by_sku = {r["sku"]: r for r in rows}
    out = []
    for position, line in enumerate(sale.lines, start=1):
        hit = by_sku.get(line.sku.lower()) if line.sku else None
        if hit:
            out.append({"position": position, "sku": line.sku, "item_id": str(hit["item_id"]),
                        "variant_id": str(hit["variant_id"]) if hit["variant_id"] else None})
    return out


# ── the sale ─────────────────────────────────────────────────────────────────────────────


@dataclass
class Plan:
    """A sale that has passed every check that needs no writing, and what the writing needs."""

    sale: SaleIn
    key: str
    digest: str
    shop: dict
    tenant: asyncpg.Record
    version: int
    currency: str
    external: bool
    number: str | None
    sold_on: date | None
    rounding: int
    digits: str
    body: dict
    payments: list[dict]
    doc_key: str


async def _replay(conn: asyncpg.Connection, sale: SaleIn, key: str) -> dict | None:
    """The answer for a sale ALYR already has (same key and body, or the same sale and body), or
    a refusal for a key or a sale reused with something different. None for a new sale. Takes
    the locks that make two requests at the same moment take turns."""
    if not KEY_PATTERN.fullmatch(key or ""):
        raise ConnectError("idempotency_key_needed", 400)
    digest = hashlib.sha256(canonical(sale.model_dump(mode="json"))).hexdigest()
    await service.lock_key(conn, f"connect:{key}")
    prior = await conn.fetchrow("select * from connect_sales where idempotency_key = $1", key)
    if prior is not None:
        if prior["request_hash"] != digest:
            raise ConnectError("idempotency_key_reused", 409,
                               document_id=str(prior["document_id"]))
        return await answer(conn, prior, replayed=True)
    await service.lock_key(conn, f"connect-sale:{sale.kind}:{sale.external_sale_id}")
    same = await conn.fetchrow(
        "select * from connect_sales where kind = $1 and external_sale_id = $2 "
        "and released_at is null", sale.kind, sale.external_sale_id)
    if same is not None:
        if same["request_hash"] == digest:
            return await answer(conn, same, replayed=True)
        raise ConnectError("sale_exists", 409, document_id=str(same["document_id"]))
    return None


async def _plan(conn: asyncpg.Connection, sender: Sender, sale: SaleIn, key: str) -> Plan:
    """Everything that can be checked without writing: the terms, the currency, who numbers the
    kind and whether the number is free, the day, the totals, the phone, the payment."""
    digest = hashlib.sha256(canonical(sale.model_dump(mode="json"))).hexdigest()
    version = await terms.require(conn, current=False)
    shop = await doc_settings.get(conn)
    tenant = await _tenant_row(conn)
    _check_text(sale.external_sale_id, "external_sale_id")
    currency = sale.currency or shop["currency"]
    if currency not in money.CURRENCIES:
        raise ConnectError("currency_not_supported", field="currency")
    external = await authority.is_external(conn, sale.kind)
    number = (sale.external_document_number or "").strip() or None
    if external:
        if number is None:
            raise ConnectError("external_number_needed", field="external_document_number")
        await _check_number(conn, number)
    elif number is not None and not NUMBER_PATTERN.fullmatch(number):
        raise ConnectError("external_number_invalid", field="external_document_number")
    sold_on = _sold_on(sale, tenant["timezone"])
    rounding = check_totals(sale)
    digits = phone_digits(sale.customer.phone)
    body = {
        "kind": sale.kind, "customer": _customer_snapshot(sale, digits),
        "lines": _lines_of(sale), "currency": currency, "branch": sale.branch,
        "payments": [], "source": "external", "source_ref": sale.external_sale_id,
        "rounding_minor": rounding, "due_date": sale.due_date,
    }
    generation = await conn.fetchval(
        "select count(*) from connect_sales where kind = $1 and external_sale_id = $2",
        sale.kind, sale.external_sale_id)
    payments: list[dict] = []
    if sale.kind != "credit_note":
        # The paper's total is the total the other system sent: the rounding line made it so.
        payments = _payments_of(sale, sale.totals.total_minor)
        body["payments"] = payments
    return Plan(sale, key, digest, shop, tenant, version, currency, external, number, sold_on,
                rounding, digits, body, payments,
                document_key(sale.kind, sale.external_sale_id, generation))


async def _check_engine_rules(conn: asyncpg.Connection, plan: Plan) -> None:
    """The engine's own rules for this paper (a receipt paid in full, an invoice needing the
    shop's CR number unless the other system owns invoices, a customer's name), asked without
    drawing or numbering anything. The preview of a CSV import uses it."""
    if plan.sale.kind == "credit_note":
        await _original(conn, plan.sale, plan.currency)
        return
    prepared = prepare.prepare(
        {**plan.body, "number_authority": "external" if plan.external else "alyr"}, plan.shop)
    branch = await doc_settings.branch_for(conn, prepared["columns"]["branch_key"],
                                           must_be_active=True)
    seller = doc_settings.seller_snapshot(plan.shop, plan.tenant["name"], plan.tenant["name_ar"],
                                          branch)
    prepare.check_issuable({**prepared["columns"], "notes": {}, "terms": {}}, prepared["lines"],
                           seller, plan.shop, external=plan.external)
    if not plan.external:
        await authority.require_alyr(conn, plan.sale.kind)


async def accept(conn: asyncpg.Connection, sender: Sender, sale: SaleIn, key: str, *,
                 dry: bool = False) -> dict | None:
    """Take one sale, once. Returns the answer the API gives (see `answer`).

    With `dry=True` nothing is written: no contact, no consent, no paper, no row. Every check
    runs (including the engine's rules for the paper), so a CSV preview says what applying the
    file would do. A dry call returns None for a new sale and the existing answer for a sale
    ALYR already has."""
    replay = await _replay(conn, sale, key)
    if replay is not None:
        return replay
    plan = await _plan(conn, sender, sale, key)
    if dry:
        await _check_engine_rules(conn, plan)
        return None
    return await _execute(conn, sender, plan)


async def _execute(conn: asyncpg.Connection, sender: Sender, plan: Plan) -> dict:
    sale = plan.sale
    staff = sales.staff_for(plan.tenant["id"], sender.actor)
    lead = kinds.languages_of(plan.shop["languages"])[0]
    # Who gets it and in what language: decided before the paper exists, written after it.
    contact, created = await find_or_make_contact(conn, sale, plan.digits, lead)
    body = {**plan.body, "contact_id": contact["id"]}

    if sale.kind == "credit_note":
        document = await _credit_note(conn, staff, sale, body, plan.external, plan.number,
                                      plan.doc_key, plan.sold_on, plan.rounding)
    elif plan.external:
        document, _ = await service.create_and_issue_external(
            conn, staff, body, number=plan.number, key=plan.doc_key, sold_on=plan.sold_on)
    else:
        document, _ = await service.create_and_issue(conn, staff, body, key=plan.doc_key)

    consent_state = contact["consent_service"]
    if delivery.wants_whatsapp(plan.shop, sale.send):
        consent_state = await record_assertion(conn, contact, sender, plan.version)
    matches = await match_skus(conn, sale)
    asked = {"send": sale.send, "language": sale.language,
             "customer_created": created, "consent": consent_state}
    row = await conn.fetchrow(
        "insert into connect_sales (api_key_id, via, import_id, idempotency_key, request_hash, "
        "external_sale_id, kind, external_number, document_id, contact_id, request, matches, "
        "delivery) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning *",
        sender.api_key_id, sender.via, sender.import_id, plan.key, plan.digest,
        sale.external_sale_id, sale.kind, plan.number, UUID(document["id"]), contact["id"],
        sale.model_dump(mode="json"), matches, asked)
    await delivery.queue_connected(conn, document, contact["id"], send=sale.send,
                                   language=sale.language, actor=sender.actor)
    await team.record(
        conn, doc_settings.SUBJECT, UUID(document["id"]), "sale_received", sender.actor,
        contact["id"], {"via": sender.via, "key": sender.key_prefix or None,
                        "external_sale_id": sale.external_sale_id, "kind": sale.kind,
                        "number_by": "other system" if plan.external else "ALYR"})
    return await answer(conn, row, replayed=False)


async def _check_number(conn: asyncpg.Connection, number: str) -> None:
    if not NUMBER_PATTERN.fullmatch(number):
        raise ConnectError("external_number_invalid", field="external_document_number")
    await service.lock_key(conn, f"connect-number:{number}")
    taken = await conn.fetchval(
        "select id from documents where number = $1 and withdrawn_at is null", number)
    if taken is not None:
        raise ConnectError("number_taken", 409, document_id=str(taken))


async def _original(conn: asyncpg.Connection, sale: SaleIn, currency: str) -> asyncpg.Record:
    """The sale a credit note credits: one ALYR was sent earlier, still on paper, in the same
    currency."""
    if not sale.credits_sale_id or len((sale.reason or "").strip()) < 3:
        raise ConnectError("credits_sale_needed", field="credits_sale_id")
    if sale.payment is not None and sale.payment != "unpaid":
        raise ConnectError("payment_not_for_kind", field="payment")
    original = await conn.fetchrow(
        "select cs.document_id, d.currency, d.status, d.kind from connect_sales cs "
        "join documents d on d.id = cs.document_id where cs.external_sale_id = $1 "
        "and cs.kind in ('receipt', 'invoice', 'deposit_receipt') and cs.released_at is null",
        sale.credits_sale_id)
    if original is None:
        raise ConnectError("credited_sale_unknown", 404, field="credits_sale_id")
    if original["status"] != "issued":
        raise ConnectError("credited_sale_not_creditable", 409, field="credits_sale_id")
    if original["currency"] != currency:
        raise ConnectError("credit_not_in_this_currency", field="currency")
    return original


async def _credit_note(conn, staff, sale: SaleIn, body: dict, external: bool, number: str | None,
                       doc_key: str, sold_on, rounding: int) -> dict:
    original = await _original(conn, sale, body["currency"])
    lines = body["lines"]
    if external:
        document, _ = await service.credit_note_external(
            conn, staff, original["document_id"], reason=sale.reason, lines=lines,
            rounding_minor=rounding, number=number, key=doc_key, sold_on=sold_on,
            source_ref=sale.external_sale_id)
    else:
        document, _ = await service.credit_note(
            conn, staff, original["document_id"], reason=sale.reason, lines=lines, key=doc_key)
    return document


# ── the answer ───────────────────────────────────────────────────────────────────────────


async def answer(conn: asyncpg.Connection, row: asyncpg.Record, *, replayed: bool) -> dict:
    """What the API says about a sale: the document, who it is for, what became of delivery."""
    tenant = await _tenant_row(conn)
    staff = sales.staff_for(tenant["id"], team.Actor(None, "API"))
    document = await service.get(conn, staff, row["document_id"])
    summary = delivery.summary_of(
        (await delivery.summaries(conn, [row["document_id"]])).get(str(row["document_id"])))
    asked = row["delivery"] or {}
    url = None
    if tenant["slug"]:
        url = links.document_url(get_settings().public_web_url, tenant["slug"], tenant["id"],
                                 row["document_id"])
    return {
        "replayed": replayed,
        "sale": {"external_sale_id": row["external_sale_id"], "kind": row["kind"],
                 "external_document_number": row["external_number"],
                 "received_at": row["created_at"].isoformat()},
        "document": {
            "id": document["id"], "kind": document["kind"], "status": document["status"],
            "number": document["number"], "number_authority": document["number_authority"],
            "issue_date": document["issue_date"], "currency": document["currency"],
            "totals": document["totals"], "hosted_url": url,
            "related_document_id": (document["related"] or {}).get("id"),
        },
        "customer": {"contact_id": str(row["contact_id"]),
                     "created": bool(asked.get("customer_created"))},
        "consent": asked.get("consent"),
        "delivery": {"asked": asked.get("send"), "state": summary["state"],
                     "last": summary["last"]},
        "matched_items": row["matches"],
    }
