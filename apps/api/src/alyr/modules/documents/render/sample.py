"""A fictional document to draw: for the preview with no draft, for the layout tests and for
looking at the pages. A made-up bakery, made-up numbers, made-up people; nothing here is
anyone's. The registration, tax and licence numbers are visibly not real, and the phone numbers
are the 5555 ones the demo shops use.
"""

from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from alyr.modules.documents import kinds, money, words
from alyr.modules.documents.render.context import (
    Bi,
    Brand,
    Doc,
    Line,
    Party,
    Payment,
)

SELLER = Party(
    name=Bi(ar="مخبز قرفة", en="Qirfa Bakery"),
    phone="+974 5555 0100",
    email="orders@qirfa.example",
    address=Bi(ar="شارع المطار القديم، الدوحة، قطر", en="Old Airport Road, Doha, Qatar"),
    registration="100200", licence="ML-4455",
)
CUSTOMER = Party(
    name=Bi(ar="فاطمة الكواري", en="Fatima Al-Kuwari"),
    phone="+974 5555 0199",
    address=Bi(ar="اللؤلؤة، الدوحة", en="The Pearl, Doha"),
)

# description (Arabic, English), quantity, unit, unit price in dirhams, discount in dirhams
LINES = (
    (("خبز عربي طازج", "Fresh Arabic bread"), "12", "piece", 350, 0),
    (("كعكة التمر الكبيرة", "Large date cake"), "2", "piece", 4500, 500),
    (("قهوة عربية 250 غرام", "Arabic coffee 250 g"), "1", "piece", 3200, 0),
    (("توصيل داخل الدوحة", "Delivery within Doha"), "1", "service", 1000, 0),
)


def make_lines(spec=LINES, tax_rate_bp: int = 0) -> tuple[Line, ...]:
    out = []
    for (ar, en), qty, unit, price, discount in spec:
        q = Decimal(qty)
        net, tax, total = money.line_amounts(q, price, discount, tax_rate_bp)
        out.append(Line(Bi(ar=ar, en=en), "", q, unit, price, discount, tax_rate_bp, net, tax,
                        total))
    return tuple(out)


def totals(lines: tuple[Line, ...]) -> dict:
    gross = sum(line.net + line.discount for line in lines)
    discount = sum(line.discount for line in lines)
    tax = sum(line.tax for line in lines)
    return {"gross": gross, "discount": discount, "tax": tax, "total": gross - discount + tax}


def sample_doc(
    kind: str = "invoice", languages: tuple[str, ...] = ("ar", "en"), layout: str = "a4",
    *, registered: bool = True, preview: bool = False, number: str | None = "INV-2026-0042",
    lines: tuple[Line, ...] | None = None, brand: Brand | None = None, rounding: int = 0,
    **changes,
) -> Doc:
    lines = lines or make_lines()
    sums = totals(lines)
    sums["rounding"] = rounding
    sums["total"] += rounding
    k = kinds.KINDS[kind]
    paid = 0
    payments: tuple[Payment, ...] = ()
    if k.payments == kinds.FULL:
        paid, payments = sums["total"], (Payment("cash", sums["total"]),)
    elif k.payments == kinds.OPTIONAL and kind == "invoice":
        paid = 5000
        payments = (Payment("bank_transfer", 5000, "TRX-20261019-7781"),)
    seller = SELLER if registered else replace(SELLER, registration="")
    title = words.KIND_TITLES[kind]
    doc = Doc(
        kind=kind, title=Bi(ar=title.ar, en=title.en), languages=languages, layout=layout,
        currency="QAR", exponent=2, seller=seller, customer=CUSTOMER, lines=lines, paid=paid,
        balance=sums["total"] - paid, payments=payments, number=number,
        issue_date=date(2026, 10, 19),
        second_date=date(2026, 11, 18) if k.second_date else None,
        second_date_label=k.second_date,
        notes=Bi(ar="شكرًا لتسوّقكم من مخبز قرفة.", en="Thank you for shopping at Qirfa Bakery."),
        terms=Bi(ar="تُقبل المرتجعات خلال سبعة أيام من تاريخ الاستلام بوجود هذا المستند.",
                 en="Returns are accepted within seven days of receipt with this document."),
        unregistered=not registered, preview=preview,
        code="9f3a7c21d0b411e8", brand=brand or Brand(),
        created=datetime(2026, 10, 19, 12, 0, tzinfo=UTC), **sums,
    )
    return replace(doc, **changes) if changes else doc


# ── the same sale as a request body, for the preview with no draft ────────────────────────

SAMPLE_INVOICE_NUMBER = "INV-0001"


def sample_body(kind: str) -> dict:
    """What a client would send to make this kind of document: a made-up sale to a made-up
    customer. The seller is the shop's own settings, so the owner sees their name and logo on
    a sale that is not theirs."""
    body: dict = {
        "kind": kind,
        "customer": {
            "name": "Fatima Al-Kuwari", "name_ar": "فاطمة الكواري", "phone": "+974 5555 0199",
            "address": "The Pearl, Doha", "address_ar": "اللؤلؤة، الدوحة",
        },
        "lines": [
            {"description": en, "description_ar": ar, "quantity": Decimal(qty), "unit": unit,
             "unit_price_minor": price, "discount_minor": discount}
            for (ar, en), qty, unit, price, discount in LINES
        ],
        "notes": {"en": "Thank you for your order.", "ar": "شكرًا لطلبكم."},
    }
    total = totals(make_lines())["total"]
    k = kinds.KINDS[kind]
    if k.second_date:
        body["due_date"] = (datetime.now(UTC) + timedelta(days=30)).date()
    if k.payments == kinds.FULL:
        body["payments"] = [{"method": "cash", "amount_minor": total, "reference": ""}]
    elif kind == "invoice":
        body["payments"] = [{"method": "bank_transfer", "amount_minor": 5000,
                             "reference": "TRX-20261019-7781"}]
    elif kind == "deposit_receipt":
        body["lines"] = [{"description": "Deposit for order 1042",
                          "description_ar": "عربون عن الطلب 1042", "quantity": Decimal(1),
                          "unit": "service", "unit_price_minor": 5000}]
        body["payments"] = [{"method": "cash", "amount_minor": 5000, "reference": ""}]
    elif kind == "credit_note":
        body["lines"] = body["lines"][1:2]
        body["reason"] = "Goods returned"
    return body
