"""Reading a POS's sales export into connected sales (ALY-142, spec 015).

A shop whose till can export a CSV (or Excel) uploads it instead of connecting an API. This
module is the pure half of that: it takes the rows of a sheet and a mapping of columns, groups
the rows into sales (one row per line, rows with the same sale ID are one sale) and turns each
into the same `SaleIn` the open API takes, or into a list of plain problems with row numbers, in
English and Arabic. It touches no database; `sale_imports.py` adds what needs one (a number
already taken, a sale already received) and does the applying.

* **Columns are found by name**, in English or Arabic, and the shop can say which column is which.
  A mapping is by the header text of the file, so a saved mapping works on the next export from
  the same till.
* **Money** is written in the currency's major units (`12.50`), read by the Catalog import's
  reader (Eastern Arabic digits, `QAR` or «ر.ق» beside a price, thousands separators; a number
  that could be read two ways is refused, not guessed) and turned into minor units. Only
  currencies with two decimals are read here.
* **Nothing is guessed that could be wrong.** A blank quantity or price is a problem, not a 1 or a
  0. A sale whose rows disagree about its customer or its number is a problem. A receipt with no
  payment is a problem unless the shop chose a default way of paying.
* **Spreadsheet formulas** are never calculated (the reader only gives saved values), and text
  that starts like one is only text.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, time
from decimal import Decimal
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from alyr.catalog import Text
from alyr.modules.connect.schemas import MAX_LINES, SaleIn
from alyr.modules.items import values
from alyr.modules.items.values import CellError

MAX_SALES = 200
MAX_ROWS = 2000


@dataclass(frozen=True)
class Column:
    key: str
    label: Text
    names: tuple[str, ...]
    needed: bool = False


COLUMNS: tuple[Column, ...] = (
    Column("sale_id", Text("Sale ID", "رقم العملية"),
           ("sale id", "saleid", "sale no", "sale number", "order id", "order no", "order number",
            "transaction id", "transaction", "receipt id", "bill no", "invoice id", "ticket",
            "رقم العملية", "رقم البيع", "رقم الطلب", "رقم المعاملة", "رقم الفاتورة الداخلي"),
           needed=True),
    Column("document_number", Text("Document number", "رقم المستند"),
           ("document number", "document no", "doc no", "invoice number", "invoice no",
            "receipt number", "receipt no", "number", "رقم المستند", "رقم الفاتورة",
            "رقم الإيصال")),
    Column("kind", Text("Kind", "النوع"),
           ("kind", "type", "document type", "نوع المستند", "النوع")),
    Column("date", Text("Date", "التاريخ"),
           ("date", "sold at", "sale date", "datetime", "time", "التاريخ", "تاريخ البيع")),
    Column("phone", Text("Customer phone", "هاتف العميل"),
           ("customer phone", "phone", "phone number", "mobile", "mobile no", "mobile number",
            "customer mobile", "whatsapp", "tel", "tel no", "telephone", "هاتف العميل",
            "الهاتف", "رقم الهاتف", "الجوال", "واتساب"),
           needed=True),
    Column("name", Text("Customer name", "اسم العميل"),
           ("customer name", "customer", "name", "client", "اسم العميل", "العميل", "الاسم")),
    Column("name_ar", Text("Customer name in Arabic", "اسم العميل بالعربية"),
           ("customer name ar", "name ar", "arabic name", "اسم العميل بالعربية")),
    Column("company", Text("Company", "الشركة"),
           ("company", "company name", "الشركة", "اسم الشركة")),
    Column("tax_id", Text("Customer tax ID", "الرقم الضريبي للعميل"),
           ("customer tax id", "tax id", "vat number", "tax number", "الرقم الضريبي")),
    Column("email", Text("Customer email", "بريد العميل"),
           ("customer email", "email", "e-mail", "mail", "البريد الإلكتروني", "بريد العميل")),
    Column("description", Text("Item", "الصنف"),
           ("item", "item name", "description", "product", "product name", "الصنف", "الوصف",
            "المنتج", "اسم الصنف"),
           needed=True),
    Column("description_ar", Text("Item in Arabic", "الصنف بالعربية"),
           ("item ar", "description ar", "arabic description", "product ar", "الصنف بالعربية",
            "الوصف بالعربية")),
    Column("sku", Text("SKU", "رمز الصنف"),
           ("sku", "item code", "code", "barcode", "رمز الصنف", "الباركود", "رمز")),
    Column("quantity", Text("Quantity", "الكمية"),
           ("quantity", "qty", "units", "how many", "pieces", "الكمية"), needed=True),
    Column("unit_price", Text("Unit price", "سعر الوحدة"),
           ("unit price", "price", "price each", "each", "unit cost", "rate", "سعر الوحدة",
            "السعر"), needed=True),
    Column("discount", Text("Line discount", "خصم البند"),
           ("line discount", "discount", "discount amount", "خصم البند", "الخصم")),
    Column("tax_rate", Text("Tax rate %", "نسبة الضريبة %"),
           ("tax rate", "tax %", "vat %", "vat rate", "tax", "نسبة الضريبة")),
    Column("payment_method", Text("Payment method", "طريقة الدفع"),
           ("payment method", "payment", "paid by", "paid with", "pay by", "tender", "method",
            "طريقة الدفع", "الدفع")),
    Column("payment_amount", Text("Amount paid", "المبلغ المدفوع"),
           ("amount paid", "paid", "payment amount", "المبلغ المدفوع", "المدفوع")),
    Column("payment_reference", Text("Payment reference", "مرجع الدفع"),
           ("payment reference", "reference", "ref", "مرجع الدفع", "المرجع")),
    Column("total", Text("Sale total", "إجمالي العملية"),
           ("sale total", "total", "grand total", "bill total", "net total", "إجمالي العملية",
            "الإجمالي", "المجموع")),
    Column("rounding", Text("Rounding", "التقريب"),
           ("rounding", "round off", "التقريب")),
    Column("currency", Text("Currency", "العملة"), ("currency", "العملة")),
    Column("branch", Text("Branch", "الفرع"), ("branch", "الفرع")),
    Column("language", Text("Customer language", "لغة العميل"),
           ("language", "lang", "customer language", "اللغة", "لغة العميل")),
    Column("credits_sale_id", Text("Credits sale ID", "العملية المُلغاة"),
           ("credits sale id", "original sale id", "original sale", "returns", "refund of",
            "العملية الأصلية", "العملية المُلغاة")),
    Column("reason", Text("Reason", "السبب"), ("reason", "return reason", "السبب")),
)
BY_KEY = {c.key: c for c in COLUMNS}
# What the sale-level columns must agree on across a sale's rows (the first non-blank wins and a
# different later one is a problem).
SALE_LEVEL = ("document_number", "kind", "date", "phone", "name", "name_ar", "company", "tax_id",
              "email", "payment_method", "payment_amount", "payment_reference", "total",
              "rounding", "currency", "branch", "language", "credits_sale_id", "reason")

KIND_WORDS = {
    "receipt": ("receipt", "sale", "sales", "إيصال", "ايصال", "بيع"),
    "invoice": ("invoice", "tax invoice", "فاتورة"),
    "credit_note": ("credit note", "credit", "return", "refund", "إشعار دائن", "اشعار دائن",
                    "مرتجع", "مرتجعات"),
    "quote": ("quote", "quotation", "عرض سعر"),
    "proforma": ("proforma", "proforma invoice", "فاتورة أولية", "فاتورة اولية"),
    "delivery_note": ("delivery note", "إشعار تسليم", "اشعار تسليم"),
    "deposit_receipt": ("deposit receipt", "deposit", "إيصال عربون", "عربون"),
}
METHOD_WORDS = {
    "cash": ("cash", "نقد", "نقدا", "نقدًا", "كاش"),
    "card": ("card", "visa", "mastercard", "mada", "pos", "بطاقة", "كرت", "فيزا", "مدى"),
    "bank_transfer": ("bank transfer", "transfer", "bank", "تحويل", "تحويل مصرفي", "تحويل بنكي"),
    "link": ("link", "payment link", "online", "رابط", "رابط دفع"),
    "credit": ("credit", "on account", "account", "آجل", "على الحساب"),
    "cheque": ("cheque", "check", "شيك"),
    "other": ("other", "أخرى", "اخرى"),
}
UNPAID_WORDS = ("unpaid", "none", "no", "pending", "due", "غير مدفوع", "لم يدفع", "غير مسدد")


# ── problems, in both languages ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Problem:
    """Something wrong with a row (or a sale), in words a shop owner can act on. `row` is the
    row's number in the file as a spreadsheet shows it (the header is row 1)."""

    row: int
    code: str
    en: str
    ar: str
    sale: str = ""
    field: str = ""

    def as_dict(self) -> dict:
        return {"row": self.row, "sale": self.sale, "field": self.field, "code": self.code,
                "message": self.en, "message_ar": self.ar}


def _q(text: object) -> str:
    return "«" + str(text)[:60] + "»"


def problem(row: int, code: str, sale: str = "", field_: str = "", **v: object) -> Problem:
    en, ar = WORDS[code]
    shown = {k: _q(x) for k, x in v.items() if k in ("value", "other", "a", "b")}
    plain = {k: x for k, x in v.items() if k not in shown}
    label = BY_KEY[field_].label if field_ in BY_KEY else Text(field_, field_)
    args = {**shown, **plain, "field_en": label.en, "field_ar": label.ar, "sale": _q(sale)}
    return Problem(row, code, en.format(**args), ar.format(**args), sale, field_)


WORDS: dict[str, tuple[str, str]] = {
    "missing_column": (
        "The file has no column for {field_en}. Choose which column it is.",
        "لا يوجد في الملف عمود لـ {field_ar}. اختر العمود المناسب.",
    ),
    "blank": (
        "{field_en} is empty.", "حقل {field_ar} فارغ.",
    ),
    "bad_money": (
        "{field_en} {value} is not an amount.", "{field_ar} {value} ليس مبلغاً.",
    ),
    "bad_quantity": (
        "{field_en} {value} is not a quantity (more than zero, up to three decimals).",
        "{field_ar} {value} ليست كمية (أكبر من صفر وبثلاث منازل عشرية على الأكثر).",
    ),
    "bad_rate": (
        "{field_en} {value} is not a percentage between 0 and 100.",
        "{field_ar} {value} ليست نسبة بين 0 و100.",
    ),
    "bad_date": (
        "{field_en} {value} is not a date. Write it as 2026-10-31 or 31/10/2026.",
        "{field_ar} {value} ليس تاريخاً. اكتبه هكذا 2026-10-31 أو 31/10/2026.",
    ),
    "bad_kind": (
        "{field_en} {value} is not a kind of document (receipt, invoice, credit note...).",
        "{field_ar} {value} ليس نوع مستند (إيصال أو فاتورة أو إشعار دائن...).",
    ),
    "bad_method": (
        "{field_en} {value} is not a way of paying (cash, card, bank transfer, cheque...).",
        "{field_ar} {value} ليست طريقة دفع (نقد أو بطاقة أو تحويل أو شيك...).",
    ),
    "bad_language": (
        "{field_en} {value} should be ar or en.", "{field_ar} {value} يجب أن تكون ar أو en.",
    ),
    "currency_two_decimals": (
        "Only currencies with two decimals can be read from a file for now ({value}).",
        "لا تُقرأ من الملف حالياً إلا العملات ذات المنزلتين العشريتين ({value}).",
    ),
    "rows_disagree": (
        "The rows of sale {sale} give different values for {field_en}: {a} and {b}.",
        "تعطي صفوف العملية {sale} قيماً مختلفة لـ {field_ar}: {a} و{b}.",
    ),
    "sale_id_blank": (
        "This row has no sale ID, so it cannot be put with a sale.",
        "لا يحتوي هذا الصف على رقم عملية، فلا يمكن ضمّه إلى عملية بيع.",
    ),
    "too_many_lines": (
        "Sale {sale} has more than " + str(MAX_LINES) + " lines.",
        "في العملية {sale} أكثر من " + str(MAX_LINES) + " بند.",
    ),
    "no_payment": (
        "Sale {sale} has no payment. A receipt is for money already paid: add a payment "
        "column, choose a default way of paying, or import it as an invoice.",
        "لا توجد دفعة للعملية {sale}. الإيصال عن مبلغ مدفوع: أضف عمود الدفع، أو اختر طريقة دفع "
        "افتراضية، أو استورده كفاتورة.",
    ),
    "duplicate_in_file": (
        "Sale {sale} appears twice in this file with different rows in between. Put a sale's "
        "rows together.",
        "العملية {sale} ظاهرة مرتين في الملف تتخللها صفوف أخرى. ضع صفوف العملية معاً.",
    ),
    "duplicate_number_in_file": (
        "Document number {value} is used by two sales in this file.",
        "رقم المستند {value} مستخدم لعمليتين في هذا الملف.",
    ),
    "too_many_sales": (
        "The file has more than " + str(MAX_SALES) + " sales. Split it into smaller files.",
        "في الملف أكثر من " + str(MAX_SALES) + " عملية. قسّمه إلى ملفات أصغر.",
    ),
    "too_many_rows": (
        "The file has more than " + str(MAX_ROWS) + " rows. Split it into smaller files.",
        "في الملف أكثر من " + str(MAX_ROWS) + " صف. قسّمه إلى ملفات أصغر.",
    ),
}


# ── headers and mapping ──────────────────────────────────────────────────────────────────

_STRIP = re.compile(r"[\s_\-./\\:()%#]+")
_MARKS = re.compile("[ً-ٰٟـ]")


def norm(text: object) -> str:
    """A header, compared loosely: case, spaces, dashes, Arabic marks and the many spellings of
    alef and ya do not matter."""
    s = values.as_text(text).strip().lower()
    s = _MARKS.sub("", s)
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ة", "ه")
    return _STRIP.sub("", s)


_NAME_INDEX = {norm(n): c.key for c in COLUMNS for n in (*c.names, c.label.en, c.label.ar)}


def headers_of(rows: list[list[object]]) -> list[str]:
    return [values.as_text(c).strip() for c in (rows[0] if rows else [])]


def auto_mapping(headers: list[str]) -> dict[str, str]:
    """{field key: header text}: the first header that names each field. A header is taken by
    one field only."""
    found: dict[str, str] = {}
    used: set[int] = set()
    for index, header in enumerate(headers):
        key = _NAME_INDEX.get(norm(header))
        if key and key not in found and header:
            found[key] = header
            used.add(index)
    return found


def mapping_fits(mapping: dict[str, str], headers: list[str]) -> bool:
    """Whether every header a saved mapping names is in this file."""
    have = {norm(h) for h in headers}
    return bool(mapping) and all(norm(h) in have for h in mapping.values())


def clean_mapping(mapping: object, headers: list[str]) -> dict[str, str]:
    """A mapping from a client: only known fields, only headers the file has."""
    if not isinstance(mapping, dict):
        return {}
    by_norm = {norm(h): h for h in headers if h}
    out = {}
    for key, header in mapping.items():
        if key in BY_KEY and header and norm(header) in by_norm:
            out[key] = by_norm[norm(header)]
    return out


def missing_required(mapping: dict[str, str], options: dict) -> list[str]:
    need = [c.key for c in COLUMNS if c.needed]
    return [k for k in need if k not in mapping]


# ── cells ────────────────────────────────────────────────────────────────────────────────


def _text(value: object) -> str:
    return " ".join(values.as_text(value).split())


def _amount(value: object) -> int:
    return values.parse_money(value, zero_ok=True)


def _quantity(value: object) -> Decimal:
    shown = _text(value)
    plain = values._plain_number(shown)
    number = values._decimal_of(plain, shown) if not isinstance(value, Decimal) else value
    if number <= 0 or number != number.quantize(Decimal("0.001")) or number > Decimal("999999999"):
        raise CellError("bad_quantity", value=shown)
    return number


def _rate_bp(value: object) -> int:
    shown = _text(value)
    plain = values._plain_number(shown).rstrip("%")
    if not plain:
        return 0
    rate = values._decimal_of(plain, shown) if not isinstance(value, Decimal) else value
    if rate < 0 or rate > 100:
        raise CellError("bad_rate", value=shown)
    return int((rate * 100).quantize(Decimal(1)))


def _word(text: str, table: dict[str, tuple[str, ...]]) -> str | None:
    wanted = norm(text)
    for key, words in table.items():
        if wanted == norm(key) or wanted in {norm(w) for w in words}:
            return key
    return None


# ── rows to sales ────────────────────────────────────────────────────────────────────────


@dataclass
class Built:
    sales: list[tuple[str, int, SaleIn]] = field(default_factory=list)  # (sale id, first row, sale)
    problems: list[Problem] = field(default_factory=list)
    rows: int = 0
    sale_count: int = 0  # sales in the file, including those with problems


def build(
    rows: list[list[object]], mapping: dict[str, str], options: dict, *, tz: str,
    shop_currency: str, truncated: bool = False,
) -> Built:
    """Group the rows of a file into sales and check each the way the API would (the checks
    that need the database are `sale_imports.preview`'s). `rows[0]` is the header row."""
    out = Built()
    headers = headers_of(rows)
    index = {key: headers.index(header) for key, header in mapping.items() if header in headers}
    data = rows[1:]
    out.rows = len(data)
    if truncated or len(data) > MAX_ROWS:
        out.problems.append(problem(1, "too_many_rows"))
        return out
    for key in missing_required(mapping, options):
        out.problems.append(problem(1, "missing_column", field_=key))
    if out.problems:
        return out

    def cell(row: list[object], key: str) -> object:
        i = index.get(key)
        return row[i] if i is not None and i < len(row) else None

    groups: dict[str, list[tuple[int, list[object]]]] = {}
    last = None
    for offset, row in enumerate(data):
        number = offset + 2
        if not any(_text(c) for c in row):
            continue
        sale_id = _text(cell(row, "sale_id"))
        if not sale_id:
            out.problems.append(problem(number, "sale_id_blank"))
            continue
        if sale_id in groups and last != sale_id:
            out.problems.append(problem(number, "duplicate_in_file", sale_id))
            continue
        groups.setdefault(sale_id, []).append((number, row))
        last = sale_id
    out.sale_count = len(groups)
    if len(groups) > MAX_SALES:
        out.problems.append(problem(1, "too_many_sales"))
        return out

    seen_numbers: dict[str, str] = {}
    for sale_id, members in groups.items():
        built = _sale(sale_id, members, cell, options, tz, shop_currency)
        if isinstance(built, list):
            out.problems.extend(built)
            continue
        number = built.external_document_number
        if number:
            if number in seen_numbers and seen_numbers[number] != sale_id:
                out.problems.append(problem(members[0][0], "duplicate_number_in_file", sale_id,
                                            "document_number", value=number))
                continue
            seen_numbers[number] = sale_id
        out.sales.append((sale_id, members[0][0], built))
    return out


def _sale(sale_id: str, members, cell, options: dict, tz: str, shop_currency: str):
    """One sale from its rows, or a list of problems."""
    problems: list[Problem] = []
    first = members[0][0]

    seen: dict[str, str | None] = {}

    def sale_level(key: str):
        """The first non-blank value of a sale-level column; a later different one is a problem.
        Read once: asking again returns the same answer and does not report it twice."""
        if key in seen:
            return seen[key]
        chosen = None
        for number, row in members:
            value = _text(cell(row, key))
            if not value:
                continue
            if chosen is None:
                chosen = value
            elif value != chosen:
                problems.append(problem(number, "rows_disagree", sale_id, key, a=chosen, b=value))
                break
        seen[key] = chosen
        return chosen

    # Every sale-level column is read first, so a disagreement between the rows is found
    # whether or not the rest of the sale is any good.
    for key in SALE_LEVEL:
        sale_level(key)

    def guarded(number: int, field_: str, work):
        try:
            return work()
        except CellError as error:
            code = {"bad_money": "bad_money", "money_decimals": "bad_money",
                    "negative_money": "bad_money", "money_too_big": "bad_money",
                    "ambiguous_number": "bad_money", "bad_number": "bad_money"}.get(
                        error.code, error.code)
            if code not in WORDS:
                code = "bad_money"
            problems.append(problem(number, code, sale_id, field_, **{
                k: v for k, v in error.args_.items() if k == "value"}))
            return None

    kind_text = sale_level("kind")
    kind = options.get("kind") or "receipt"
    if kind_text:
        kind = _word(kind_text, KIND_WORDS)
        if kind is None:
            problems.append(problem(first, "bad_kind", sale_id, "kind", value=kind_text))
            kind = options.get("kind") or "receipt"
    currency_text = sale_level("currency")
    currency = (currency_text or shop_currency).upper()
    if currency not in ("QAR", "SAR", "AED", "USD"):
        problems.append(problem(first, "currency_two_decimals", sale_id, "currency",
                                value=currency))
    language = sale_level("language")
    if language:
        language = language.lower()[:2]
        if language not in ("ar", "en"):
            problems.append(problem(first, "bad_language", sale_id, "language", value=language))
            language = None

    lines = []
    for number, row in members:
        description = _text(cell(row, "description"))
        description_ar = _text(cell(row, "description_ar"))
        if not description and not description_ar:
            problems.append(problem(number, "blank", sale_id, "description"))
            continue
        quantity = None
        if _text(cell(row, "quantity")) == "":
            problems.append(problem(number, "blank", sale_id, "quantity"))
        else:
            quantity = guarded(number, "quantity", lambda r=row: _quantity(cell(r, "quantity")))
        price_cell = cell(row, "unit_price")
        price = None
        if _text(price_cell) == "":
            problems.append(problem(number, "blank", sale_id, "unit_price"))
        else:
            price = guarded(number, "unit_price", lambda c=price_cell: _amount(c))
        discount = 0
        if _text(cell(row, "discount")):
            discount = guarded(number, "discount", lambda r=row: _amount(cell(r, "discount")))
        rate = 0
        if _text(cell(row, "tax_rate")):
            rate = guarded(number, "tax_rate", lambda r=row: _rate_bp(cell(r, "tax_rate")))
        if quantity is None or price is None or discount is None or rate is None:
            continue
        lines.append({
            "description": description, "description_ar": description_ar,
            "sku": _text(cell(row, "sku"))[:40], "quantity": quantity,
            "unit_price_minor": price, "discount_minor": discount, "tax_rate_bp": rate})
    if len(members) > MAX_LINES:
        problems.append(problem(first, "too_many_lines", sale_id))

    total_text = sale_level("total")
    total = guarded(first, "total", lambda: _amount(total_text)) if total_text else None
    rounding_text = sale_level("rounding")
    rounding = None
    if rounding_text:
        rounding = guarded(first, "rounding", lambda: values.parse_money(rounding_text,
                                                                         signed=True))

    def declared_total() -> int:
        """The sale total the file gives, or, when it gives none, the lines' own total: a file
        with no total column is taken as the till's own working."""
        return total if total is not None else _computed_total(lines) + (rounding or 0)

    payment = None
    method_text = sale_level("payment_method") or options.get("default_payment_method")
    if method_text and norm(method_text) in {norm(w) for w in UNPAID_WORDS}:
        payment = "unpaid"
    elif method_text:
        method = _word(method_text, METHOD_WORDS)
        if method is None:
            problems.append(problem(first, "bad_method", sale_id, "payment_method",
                                    value=method_text))
        else:
            amount_text = sale_level("payment_amount")
            amount = guarded(first, "payment_amount", lambda: _amount(amount_text)) \
                if amount_text else declared_total()
            payment = {"method": method, "amount_minor": amount,
                       "reference": (sale_level("payment_reference") or "")[:80]}
    if payment is None and kind in ("receipt", "deposit_receipt"):
        problems.append(problem(first, "no_payment", sale_id, "payment_method"))

    date_text = sale_level("date")
    sold_at = None
    if date_text:
        day = guarded(first, "date", lambda: values.parse_date(date_text))
        if day is not None:
            sold_at = datetime.combine(day, time(12, 0), tzinfo=ZoneInfo(tz)).isoformat()

    if problems:
        return problems

    declared = declared_total()
    body = {
        "external_sale_id": sale_id, "kind": kind,
        "external_document_number": sale_level("document_number"),
        "credits_sale_id": sale_level("credits_sale_id"), "reason": sale_level("reason") or "",
        "customer": {
            "phone": sale_level("phone") or "", "name": sale_level("name") or "",
            "name_ar": sale_level("name_ar") or "", "company": sale_level("company") or "",
            "tax_id": sale_level("tax_id") or "", "email": sale_level("email") or ""},
        "lines": lines,
        "totals": {"total_minor": declared, **({"rounding_minor": rounding} if rounding else {})},
        "payment": payment, "currency": currency, "branch": sale_level("branch") or "main",
        "language": language, "sold_at": sold_at,
        # A wrong file must not message hundreds of customers: an import sends only when the
        # shop ticks "send", never because the shop's settings send on their own.
        "send": bool(options.get("send", False)),
    }
    try:
        return SaleIn.model_validate({k: v for k, v in body.items() if v is not None})
    except ValidationError as error:
        return [_pydantic_problem(first, sale_id, e) for e in error.errors(
            include_url=False, include_context=False)]


def _computed_total(lines: list[dict]) -> int:
    from alyr.modules.documents import money

    total = 0
    for line in lines:
        try:
            _net, _tax, whole = money.line_amounts(
                line["quantity"], line["unit_price_minor"], line["discount_minor"],
                line["tax_rate_bp"])
        except money.MoneyError:
            return 0  # the engine's own check says so, with the row, when the sale is checked
        total += whole
    return total


def _pydantic_problem(row: int, sale_id: str, error: dict) -> Problem:
    place = ".".join(str(p) for p in error["loc"])
    return Problem(row, "invalid", f"{place}: {error['msg']}", f"{place}: {error['msg']}",
                   sale_id, str(error["loc"][-1]) if error["loc"] else "")


# ── the template file ────────────────────────────────────────────────────────────────────


def template_rows(lang: str) -> list[list[object]]:
    """A header row and two made-up sales for a made-up bakery, to show the shape. Delete the
    example rows before uploading your own."""
    head = [c.label.get(lang) for c in COLUMNS]
    keys = [c.key for c in COLUMNS]
    sample = [
        {"sale_id": "DEMO-1001", "document_number": "R-1001", "kind": "receipt",
         "date": "2026-10-19", "phone": "+97455550123", "name": "Fatima Al-Kuwari",
         "name_ar": "فاطمة الكواري", "description": "Fresh Arabic bread",
         "description_ar": "خبز عربي طازج", "sku": "BR-01", "quantity": "12",
         "unit_price": "3.50", "payment_method": "cash", "total": "82.00", "currency": "QAR"},
        {"sale_id": "DEMO-1001", "description": "Date cake", "description_ar": "كعكة التمر",
         "sku": "CK-02", "quantity": "1", "unit_price": "45.00", "discount": "5.00"},
        {"sale_id": "DEMO-1002", "document_number": "INV-2001", "kind": "invoice",
         "date": "2026-10-19", "phone": "+97455550188", "name": "Hotel Lusail Kitchen",
         "company": "Hotel Lusail", "description": "Catering tray", "quantity": "3",
         "unit_price": "120.00", "payment_method": "unpaid", "total": "360.00"},
    ]
    return [head, *([r.get(k, "") for k in keys] for r in sample)]
