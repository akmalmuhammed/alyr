"""Turning what a client sent into what a document row holds, and the rules a kind of document
asks before it can be issued.

Two levels of checking, on purpose:

* `prepare` is what a **draft** needs: the shape is right, every amount is a whole number of
  minor units, the lines add up, the language rule for consumers is kept. A draft may be
  incomplete (no lines yet, no customer yet): a person builds it over several saves.
* `check_issuable` is what a **kind** needs before it gets a number: a customer where one is
  needed, the money recorded the way the kind records it, a registration number where the
  law of invoices needs one, and so on.

Nothing here talks to the database. Everything is exact: amounts are ints, quantities are
`Decimal`, rounding is `money.line_amounts` (and the database checks it again).
"""

from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation

from alyr.modules.documents import kinds, money, settings
from alyr.modules.documents.errors import DocumentError
from alyr.modules.documents.render.pen import has_arabic

MAX_LINES = 200
CUSTOMER_LIMITS = {
    "name": 120, "name_ar": 120, "company": 120, "phone": 40, "email": 120,
    "registration_number": 40, "tax_id": 40, "address": 300, "address_ar": 300,
}
NOTE_LIMIT = 600
MAX_QUANTITY = Decimal("999999999.999")


def clean_customer(raw: Mapping | None) -> dict:
    out = {}
    for field, limit in CUSTOMER_LIMITS.items():
        value = ((raw or {}).get(field) or "").strip()
        if len(value) > limit:
            raise DocumentError("text_too_long", field=f"customer.{field}")
        if value:
            out[field] = value
    return out


def clean_pair(raw: Mapping | None, field: str) -> dict:
    out = {}
    for lang in ("en", "ar"):
        value = ((raw or {}).get(lang) or "").strip()
        if len(value) > NOTE_LIMIT:
            raise DocumentError("text_too_long", field=f"{field}.{lang}")
        if value:
            out[lang] = value
    return out


def clean_line(raw: Mapping, position: int, *, tax_enabled: bool) -> dict:
    """One line, with its amounts worked out by the rounding rule."""
    description = (raw.get("description") or "").strip()
    description_ar = (raw.get("description_ar") or "").strip()
    if not description and not description_ar:
        raise DocumentError("line_needs_text", line=position)
    if len(description) > 300 or len(description_ar) > 300:
        raise DocumentError("text_too_long", line=position)
    sku = (raw.get("sku") or "").strip()
    if len(sku) > 40:
        raise DocumentError("text_too_long", line=position)
    try:
        quantity = Decimal(str(raw["quantity"]))
    except (InvalidOperation, KeyError, ValueError) as error:
        raise DocumentError("quantity_invalid", line=position) from error
    if not quantity.is_finite() or quantity <= 0 or quantity > MAX_QUANTITY \
            or quantity != quantity.quantize(Decimal("0.001")):
        raise DocumentError("quantity_invalid", line=position)
    unit = raw.get("unit") or "piece"
    if unit not in kinds.UNITS:
        raise DocumentError("quantity_invalid", line=position)
    price = raw["unit_price_minor"]
    discount = raw.get("discount_minor") or 0
    rate = raw.get("tax_rate_bp") or 0
    for amount in (price, discount, rate):
        if isinstance(amount, bool) or not isinstance(amount, int):
            raise DocumentError("amount_too_big", line=position)
    if not 0 <= price <= money.MAX_MINOR or not 0 <= discount <= money.MAX_MINOR:
        raise DocumentError("amount_too_big", line=position)
    if rate and not tax_enabled:
        raise DocumentError("tax_off", line=position)
    if not 0 <= rate <= 10000:
        raise DocumentError("amount_too_big", line=position)
    try:
        net, tax, total = money.line_amounts(quantity, price, discount, rate)
    except money.MoneyError as error:
        raise DocumentError("discount_too_big", line=position) from error
    if total > money.MAX_MINOR:
        raise DocumentError("amount_too_big", line=position)
    return {
        "position": position, "description": description, "description_ar": description_ar,
        "sku": sku, "quantity": quantity, "unit": unit, "unit_price_minor": price,
        "discount_minor": discount, "tax_rate_bp": rate, "line_net_minor": net,
        "tax_minor": tax, "line_total_minor": total,
    }


def totals_of(lines: Sequence[Mapping]) -> dict:
    gross = sum(line["line_net_minor"] + line["discount_minor"] for line in lines)
    discount = sum(line["discount_minor"] for line in lines)
    tax = sum(line["tax_minor"] for line in lines)
    return {
        "gross_minor": gross, "discount_minor": discount, "tax_minor": tax,
        "total_minor": gross - discount + tax,
    }


def clean_payments(raw: Sequence[Mapping] | None) -> list[dict]:
    out = []
    for item in raw or []:
        method, amount = item.get("method"), item.get("amount_minor")
        if method not in kinds.PAYMENT_METHODS:
            raise DocumentError("kind_unknown", field="payments.method")
        if isinstance(amount, bool) or not isinstance(amount, int) \
                or not 0 < amount <= money.MAX_MINOR:
            raise DocumentError("amount_too_big", field="payments.amount_minor")
        reference = (item.get("reference") or "").strip()
        if len(reference) > 80:
            raise DocumentError("text_too_long", field="payments.reference")
        out.append({"method": method, "amount_minor": amount, "reference": reference})
    if len(out) > 10:
        raise DocumentError("text_too_long", field="payments")
    return out


def prepare(body: Mapping, shop: Mapping) -> dict:
    """A draft's columns and lines from a request body and the shop's settings.

    Returns {"columns": {...}, "lines": [...]}. Anything the body leaves out takes the shop's
    setting (language, layout, audience, currency)."""
    kind = body.get("kind")
    if kind not in kinds.KINDS:
        raise DocumentError("kind_unknown", field="kind")
    if kind == "credit_note":
        raise DocumentError("credit_note_route")
    audience = body.get("audience") or shop["default_audience"]
    languages = body.get("languages") or shop["languages"]
    layout = body.get("layout") or shop["layout"]
    if layout not in kinds.LAYOUTS:
        raise DocumentError("layout_unknown", field="layout")
    currency = body.get("currency") or shop["currency"]
    if currency not in money.CURRENCIES:
        raise DocumentError("currency_unknown", field="currency")
    settings.check_audience_language(audience, languages)

    raw_lines = list(body.get("lines") or [])
    if len(raw_lines) > MAX_LINES:
        raise DocumentError("too_many_lines")
    lines = [
        clean_line(raw, position, tax_enabled=shop["tax_enabled"])
        for position, raw in enumerate(raw_lines, start=1)
    ]
    totals = totals_of(lines)
    # Cash rounding, if the shop has it and this kind is paid in cash: its own line.
    rounding = (money.round_to_step(totals["total_minor"], shop["cash_rounding_minor"])
                if kinds.KINDS[kind].rounds else 0)
    totals["rounding_minor"] = rounding
    totals["total_minor"] += rounding
    if totals["total_minor"] > money.MAX_MINOR:
        raise DocumentError("amount_too_big")
    payments = clean_payments(body.get("payments"))
    paid = sum(p["amount_minor"] for p in payments)
    if paid > totals["total_minor"]:
        raise DocumentError("overpaid")
    source = body.get("source") or "manual"
    if source not in kinds.SOURCES:
        raise DocumentError("kind_unknown", field="source")
    reason = (body.get("reason") or "").strip()
    if len(reason) > 300:
        raise DocumentError("text_too_long", field="reason")
    columns = {
        "kind": kind, "audience": audience, "languages": languages, "layout": layout,
        "currency": currency, "currency_exponent": money.CURRENCIES[currency].exponent,
        "due_date": body.get("due_date"), "customer": clean_customer(body.get("customer")),
        "contact_id": body.get("contact_id"), "branch_key": body.get("branch") or "main",
        **totals, "paid_minor": paid,
        "payments": payments, "notes": clean_pair(body.get("notes"), "notes"),
        "terms": clean_pair(body.get("terms"), "terms"), "reason": reason, "source": source,
        "source_ref": (body.get("source_ref") or "").strip()[:120],
    }
    return {"columns": columns, "lines": lines}


# ── what a kind needs before it is issued ─────────────────────────────────────────────────


def check_issuable(columns: Mapping, lines: Sequence[Mapping], seller: Mapping,
                   shop: Mapping) -> None:
    """Raise a `DocumentError` saying what is missing or not allowed. `columns` is the
    document row (or the prepared columns), `seller` the copy about to be written."""
    kind = kinds.KINDS[columns["kind"]]
    if not (seller.get("name") or seller.get("name_ar")):
        raise DocumentError("seller_needed")
    if kind.needs_registration and not seller.get("registered"):
        raise DocumentError("registration_needed")
    settings.check_audience_language(columns["audience"], columns["languages"])
    if not lines:
        raise DocumentError("no_lines")
    # A credit note cancels what was charged, tax included, even if tax has been switched
    # off since.
    if columns["tax_minor"] and not shop["tax_enabled"] and columns["kind"] != "credit_note":
        raise DocumentError("tax_off")
    if columns["total_minor"] <= 0 and not kind.allows_zero_total:
        raise DocumentError("total_zero")
    customer = columns["customer"] or {}
    if kind.needs_customer and not (customer.get("name") or customer.get("name_ar")
                                    or customer.get("company")):
        raise DocumentError("customer_needed", field="customer.name")
    paid, total = columns["paid_minor"], columns["total_minor"]
    if kind.payments == kinds.FULL and paid != total:
        raise DocumentError("payment_needed")
    if kind.payments == kinds.DEPOSIT and paid <= 0:
        raise DocumentError("deposit_needed")
    if kind.payments == kinds.NONE and columns["payments"]:
        raise DocumentError("no_payments_here")
    if kind.needs_reason and len((columns["reason"] or "").strip()) < 3:
        raise DocumentError("credit_needs_reason")


def warnings_for(columns: Mapping, lines: Sequence[Mapping], seller: Mapping) -> list[str]:
    """Things worth fixing that do not stop a document being issued."""
    if "ar" not in kinds.languages_of(columns["languages"]):
        return []
    found = []
    # The ministry's circular is reported as asking for Arabic as the main language of a
    # consumer invoice (spec 010, open question); Arabic first is the safe choice.
    if columns["audience"] == "consumer" and columns["languages"] == "en_ar":
        found.append("arabic_not_main")
    if any(not (line["description_ar"] or has_arabic(line["description"])) for line in lines):
        found.append("line_missing_arabic")
    if not (seller.get("name_ar") or has_arabic(seller.get("name", ""))):
        found.append("seller_missing_arabic")
    for field in ("notes", "terms"):
        value = columns[field] or {}
        if value.get("en") and not value.get("ar"):
            found.append("terms_missing_arabic")
            break
    return found


def default_texts(columns: Mapping, shop: Mapping) -> tuple[dict, dict]:
    """The notes and terms a document carries: its own, or the shop's for that kind."""
    kind = columns["kind"]
    notes = columns["notes"] or (shop["notes"] or {}).get(kind, {})
    terms = columns["terms"] or (shop["terms"] or {}).get(kind, {})
    return dict(notes), dict(terms)

