"""The Documents list: search, filters, totals, a cursor, and the numbers on the home screen
(ALY-146, spec 014).

One function builds the `where` of every question the screens ask, so a number on the home
screen ("Unpaid invoices: 7") and the list it opens (`?show=unpaid_invoices`) are the same
query and cannot drift apart. A test compares them.

Paging is by cursor, not by offset: the cursor is the sort key and the id of the last row seen
(`documents_newest`, migration 0039), so the first page of a shop with fifty thousand documents
costs the same as a shop with fifty.

Who sees what: owners and admins see the shop's documents; an agent sees the ones they made
(the same rule as everywhere in this package, `access.py`).
"""

import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

import asyncpg

from alyr.core.auth import Staff
from alyr.modules.documents import access, delivery, kinds
from alyr.modules.documents.errors import DocumentError

STATUSES = {"draft": "draft", "issued": "issued", "cancelled": "void", "void": "void"}
PAYMENTS = ("paid", "part", "unpaid")
DELIVERIES = ("none", "queued", "sent", "delivered", "not_delivered")
# The kinds a customer pays for: "paid", "part paid" and "unpaid" mean something only on these.
PAYABLE = ("receipt", "invoice", "deposit_receipt", "statement")
# Which kinds a total of money can be taken over (a credit note is the other way, and a quote,
# a delivery note and a proforma are not sales).
SALE_KINDS = ("receipt", "invoice", "deposit_receipt")
PAGE = 40
MAX_PAGE = 100

# What the home screen's two numbers count, and what the list does when it is opened from them.
PRESETS: dict[str, dict] = {
    "unpaid_invoices": {"kind": "invoice", "status": "issued", "payment": ["unpaid", "part"]},
    "not_delivered": {"status": "issued", "delivery": "not_delivered"},
}

# What an invoice has been paid, now: what its paper says (it never changes) plus the payments
# staff recorded against it by hand afterwards (`manual_payments`, append-only). For every
# other kind it is the paper's. A payment into a customer's credit account by link or chat is
# not allocated to an invoice (the ledger keeps one balance per customer): spec 014.
PAID = (
    "(d.paid_minor + case when d.kind = 'invoice' then coalesce((select sum(m.amount_minor) "
    "from manual_payments m where m.subject = 'invoice' and m.subject_id = d.id), 0)::bigint "
    "else 0 end)"
)
OWING = f"greatest(d.total_minor - {PAID}, 0)"

# One delivery's state as a person reads it: a read WhatsApp message is delivered. This is
# `delivery.state_of` in SQL, and a test compares the two.
_DELIVERY_CTE = (
    "with ds as ("
    " select x.document_id, case"
    "   when bool_or(x.st = 'delivered') then 'delivered'"
    "   when bool_or(x.st = 'sent') then 'sent'"
    "   when bool_or(x.st = 'queued') then 'queued'"
    "   else 'not_delivered' end as state"
    " from (select d.document_id, case"
    "         when d.channel = 'whatsapp' and d.message_id is not null"
    "           then (case m.status when 'read' then 'delivered' else m.status end)"
    "         else d.status end as st"
    "       from document_deliveries d left join messages m on m.id = d.message_id) x"
    " group by x.document_id) "
)
# Arabic is searched with its common spellings folded (alef forms, ya, ta marbuta).
_FOLD = "translate(lower({}), 'أإآىة', 'اااية')"


@dataclass
class Filters:
    kind: str | None = None
    status: str | None = None
    payment: list[str] = field(default_factory=list)
    delivery: str | None = None
    branch: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    q: str = ""

    @staticmethod
    def preset(name: str) -> "Filters":
        return Filters(**PRESETS[name])


def checked(filters: Filters) -> Filters:
    """Refuse a filter value nobody can mean, in words (a 422 with the field)."""
    if filters.kind and filters.kind not in kinds.KINDS:
        raise DocumentError("kind_unknown", field="kind")
    if filters.status:
        if filters.status not in STATUSES:
            raise DocumentError("filter_invalid", field="status")
        filters.status = STATUSES[filters.status]
    if any(p not in PAYMENTS for p in filters.payment):
        raise DocumentError("filter_invalid", field="payment")
    if filters.delivery and filters.delivery not in DELIVERIES:
        raise DocumentError("filter_invalid", field="delivery")
    if filters.date_from and filters.date_to and filters.date_from > filters.date_to:
        raise DocumentError("date_range_invalid", field="date_to")
    return filters


def _amount(q: str) -> Decimal | None:
    """A search that reads as an amount ("127", "127.5", "1,270.00", "١٢٧"), else None."""
    text = q.strip().translate(str.maketrans("٠١٢٣٤٥٦٧٨٩٫٬", "0123456789.,"))
    if not re.fullmatch(r"\d{1,9}([.,]\d{1,3})?", text.replace(" ", "")):
        return None
    try:
        return Decimal(text.replace(",", "").replace(" ", ""))
    except InvalidOperation:
        return None


class _Query:
    """The `where` of a question, with its arguments numbered as they are added."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.args: list = []

    def add(self, sql: str, *values) -> None:
        numbers = []
        for value in values:
            self.args.append(value)
            numbers.append(f"${len(self.args)}")
        for n, placeholder in enumerate(numbers, start=1):
            sql = sql.replace(f"{{{n}}}", placeholder)
        self.parts.append(sql)

    @property
    def where(self) -> str:
        return (" where " + " and ".join(self.parts)) if self.parts else ""


def _search(query: _Query, q: str) -> None:
    q = q.strip()
    if not q:
        return
    clauses = []
    n = len(query.args)
    query.args.append(q)
    text_arg = f"${n + 1}"
    for column in ("d.number", "d.customer ->> 'name'", "d.customer ->> 'name_ar'",
                   "d.customer ->> 'company'", "d.customer ->> 'email'"):
        haystack = _FOLD.format(f"coalesce({column}, '')")
        clauses.append(f"position({_FOLD.format(text_arg)} in {haystack}) > 0")
    digits = re.sub(r"\D", "", q.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")))
    if len(digits) >= 3:
        query.args.append(digits)
        phone = "regexp_replace(coalesce(d.customer ->> 'phone', ''), '\\D', '', 'g')"
        clauses.append(f"position(${n + 2} in {phone}) > 0")
    amount = _amount(q)
    if amount is not None:
        query.args.append(amount)
        minor = f"round(${len(query.args)}::numeric * power(10::numeric, d.currency_exponent))"
        clauses.append(f"(d.total_minor = {minor} or {OWING} = {minor})")
    query.parts.append("(" + " or ".join(clauses) + ")")


def _where(filters: Filters, staff: Staff | None, tz: str) -> _Query:
    query = _Query()
    if filters.kind:
        query.add("d.kind = {1}", filters.kind)
    if filters.status:
        query.add("d.status = {1}", filters.status)
    if filters.payment:
        # Owed or paid means something only on an issued paper that takes payment; a cancelled
        # invoice owes nothing, and a draft is not a debt.
        query.add("d.status = 'issued' and d.kind = any({1})", list(PAYABLE))
        shapes = {
            "paid": f"(d.total_minor > 0 and {PAID} >= d.total_minor)",
            "part": f"({PAID} > 0 and {PAID} < d.total_minor)",
            "unpaid": f"(d.total_minor > 0 and {PAID} = 0)",
        }
        query.parts.append("(" + " or ".join(shapes[p] for p in filters.payment) + ")")
    if filters.delivery == "none":
        query.parts.append(
            "d.status <> 'draft' and not exists (select 1 from ds where ds.document_id = d.id)")
    elif filters.delivery:
        query.add("exists (select 1 from ds where ds.document_id = d.id and ds.state = {1})",
                  filters.delivery)
    if filters.branch:
        query.add("d.branch_key = {1}", filters.branch)
    day = "coalesce(d.issue_date, (d.created_at at time zone {1})::date)"
    if filters.date_from:
        query.add(f"{day} >= {{2}}", tz, filters.date_from)
    if filters.date_to:
        query.add(f"{day} <= {{2}}", tz, filters.date_to)
    _search(query, filters.q)
    if staff is not None and not access.is_manager(staff):
        query.add("d.created_by_user = {1}", staff.user_id)
    return query


def _prefix(filters: Filters) -> str:
    return _DELIVERY_CTE if filters.delivery else ""


async def _tz(conn: asyncpg.Connection) -> str:
    return await conn.fetchval(
        "select timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )


def _iso(value):
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    return value


def _cursor(sort_at: datetime, doc_id: UUID) -> str:
    return f"{_iso(sort_at)}~{doc_id}"


def _read_cursor(text: str) -> tuple[datetime, UUID]:
    try:
        stamp, _, ident = text.partition("~")
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")), UUID(ident)
    except ValueError as error:
        raise DocumentError("cursor_invalid", field="cursor") from error


async def totals(conn: asyncpg.Connection, staff: Staff, filters: Filters) -> dict:
    """How many documents match, and the money in them. Money is added up only where adding
    is honest: `total_minor` over issued receipts, invoices and deposit receipts (never a quote,
    a credit note or a draft), `credited_minor` over issued credit notes, and `owing_minor`
    over what issued invoices and statements still owe. One line per currency."""
    tz = await _tz(conn)
    query = _where(filters, staff, tz)
    count = await conn.fetchval(
        f"{_prefix(filters)}select count(*) from documents d{query.where}", *query.args)
    rows = await conn.fetch(
        f"{_prefix(filters)}select d.currency, max(d.currency_exponent) as exponent, "
        "coalesce(sum(d.total_minor) filter (where d.status = 'issued' "
        "  and d.kind = any(" + f"${len(query.args) + 1}" + ")), 0)::bigint as total_minor, "
        "coalesce(sum(d.total_minor) filter (where d.status = 'issued' "
        "  and d.kind = 'credit_note'), 0)::bigint as credited_minor, "
        f"coalesce(sum({OWING}) filter (where d.status = 'issued' "
        "  and d.kind in ('invoice', 'statement')), 0)::bigint as owing_minor "
        f"from documents d{query.where} group by d.currency order by 2 desc, 1",
        *query.args, list(SALE_KINDS))
    return {
        "count": count,
        "money": [
            {"currency": r["currency"], "exponent": r["exponent"],
             "total_minor": r["total_minor"], "credited_minor": r["credited_minor"],
             "owing_minor": r["owing_minor"]}
            for r in rows if r["total_minor"] or r["credited_minor"] or r["owing_minor"]
        ],
    }


async def page(
    conn: asyncpg.Connection, staff: Staff, filters: Filters, *, limit: int = PAGE,
    cursor: str | None = None, offset: int = 0, with_totals: bool = True,
) -> dict:
    """One page of the list, newest first, with the delivery state beside each row."""
    filters = checked(filters)
    limit = max(1, min(limit, MAX_PAGE))
    tz = await _tz(conn)
    query = _where(filters, staff, tz)
    if cursor:
        at, ident = _read_cursor(cursor)
        query.add("(coalesce(d.issued_at, d.created_at), d.id) < ({1}, {2})", at, ident)
    args = [*query.args, limit + 1, 0 if cursor else offset]
    rows = await conn.fetch(
        f"{_prefix(filters)}select d.id, d.kind, d.status, d.number, d.issue_date, d.due_date, "
        f"d.currency, d.currency_exponent, d.total_minor, {PAID} as paid_now, "
        f"{OWING} as owing_now, "
        "d.customer, d.created_at, d.created_by, d.branch_key, d.source, d.source_ref, "
        "d.languages, d.layout, "
        "coalesce(d.issued_at, d.created_at) as sort_at, r.number as related_number "
        "from documents d left join documents r on r.id = d.related_document_id"
        f"{query.where} order by coalesce(d.issued_at, d.created_at) desc, d.id desc "
        f"limit ${len(args) - 1} offset ${len(args)}",
        *args)
    more = len(rows) > limit
    rows = rows[:limit]
    sent = await delivery.summaries(conn, [r["id"] for r in rows])
    documents = []
    for r in rows:
        customer = r["customer"] or {}
        documents.append({
            "id": str(r["id"]), "kind": r["kind"], "status": r["status"], "number": r["number"],
            "issue_date": _iso(r["issue_date"]), "due_date": _iso(r["due_date"]),
            "currency": r["currency"], "currency_exponent": r["currency_exponent"],
            # What is paid and owed NOW: what the paper says plus the payments staff recorded
            # against an invoice afterwards (the invoice itself never changes).
            "total_minor": r["total_minor"], "paid_minor": r["paid_now"],
            "balance_minor": 0 if r["status"] != "issued" else r["owing_now"],
            "customer_name": customer.get("name") or customer.get("name_ar", ""),
            "customer_name_ar": customer.get("name_ar", ""),
            "created_at": _iso(r["created_at"]), "created_by": r["created_by"],
            "branch": r["branch_key"], "source": r["source"],
            "related_number": r["related_number"],
            "delivery": delivery.summary_of(sent.get(str(r["id"]))),
        })
    answer: dict = {
        "documents": documents,
        "next_cursor": _cursor(rows[-1]["sort_at"], rows[-1]["id"]) if more and rows else None,
        "has_more": more,
    }
    if with_totals:
        answer["totals"] = await totals(conn, staff, filters)
        answer["total"] = answer["totals"]["count"]
    return answer


async def counts(conn: asyncpg.Connection, staff: Staff | None) -> dict[str, int]:
    """The numbers on the home screen: each is the list the card opens, counted by the same
    query (`PRESETS`). Agents see only their own documents, so their numbers are theirs."""
    tz = await _tz(conn)
    found = {}
    for name, preset in PRESETS.items():
        filters = checked(Filters(**preset))
        query = _where(filters, staff, tz)
        found[name] = await conn.fetchval(
            f"{_prefix(filters)}select count(*) from documents d{query.where}", *query.args)
    return found
