"""The customers an invoice is written for (ALY-141, spec 016).

A shop that only invoices has no chat to learn its customers from, so they are written here, once:
a name (in either language), a company with its registration and tax numbers and an address, a
phone number, an email. They are the shop's `contacts` (role `customer`), the same rows the chat
and the credit accounts use, so a customer who also writes to the shop's WhatsApp number is one
person and not two (the unique key is the shop and the phone number).

* **A saved customer has a phone number.** It is how they are found again, how a document
  reaches them and how a WhatsApp command ("invoice Ahmed 500") knows which Ahmed. A customer
  without one is typed on the document and not saved.
* **Balance** is what the customer still owes on issued invoices, read the way every screen reads
  it (`listing.OWING`): the paper's payments plus the payments recorded since. Owners and admins
  see it, and the customer's documents; an agent sees only who the customers are (spec 015: the
  shop's takings are the owner's).
* **Nothing is deleted.** A customer has history. They can be changed, never removed.
"""

import re
from dataclasses import dataclass
from uuid import UUID

import asyncpg

from alyr.core import consent, mail, team
from alyr.core.auth import Staff
from alyr.core.normalise import has_arabic, western_digits
from alyr.modules.documents import access, listing
from alyr.modules.documents.errors import DocumentError
from alyr.modules.documents.prepare import CUSTOMER_LIMITS
from alyr.modules.items import match
from alyr.modules.items.text import fold

FIELDS = tuple(CUSTOMER_LIMITS)  # name, name_ar, company, phone, email, registration_number, ...
PAGE = 40
MAX_PAGE = 100
_FOLD = "translate(lower({}), 'أإآىة', 'اااية')"


def clean_phone(raw: str) -> str:
    """A phone number as the contacts table keeps it: digits with the country code. A Qatar number
    typed without its code (eight digits) gets 974, as everywhere else in ALYR."""
    digits = re.sub(r"\D", "", western_digits(raw or ""))
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 8:
        digits = "974" + digits
    if not 10 <= len(digits) <= 15:
        raise DocumentError("phone_invalid", field="phone")
    return digits


def _clean(fields: dict) -> dict:
    out = {}
    for name, limit in CUSTOMER_LIMITS.items():
        value = " ".join(str(fields.get(name) or "").split()) if name not in (
            "address", "address_ar") else str(fields.get(name) or "").strip()
        if len(value) > limit:
            raise DocumentError("text_too_long", field=name)
        out[name] = value
    if out["email"] and not mail.deliverable(out["email"]):
        raise DocumentError("email_invalid", field="email")
    if not (out["name"] or out["name_ar"] or out["company"]):
        raise DocumentError("customer_needs_name", field="name")
    return out


def _shown_name(fields: dict) -> str:
    """What the contacts table calls the customer (its one `name` column): the name, else the
    Arabic name, else the company."""
    return fields["name"] or fields["name_ar"] or fields["company"]


def _lang(fields: dict) -> str:
    text = _shown_name(fields)
    return "ar" if has_arabic(text) and not re.search("[A-Za-z]", text) else "en"


_SELECT = (
    "select c.id, c.name, c.name_ar, c.company, c.phone, c.email, c.lang, c.registration_number, "
    "c.tax_id, c.address, c.address_ar, c.created_at"
)


def _present(row: asyncpg.Record, *, money: bool) -> dict:
    out = {
        "id": str(row["id"]), "name": row["name"], "name_ar": row["name_ar"],
        "company": row["company"], "phone": row["phone"] or "", "email": row["email"] or "",
        "lang": row["lang"], "registration_number": row["registration_number"],
        "tax_id": row["tax_id"], "address": row["address"], "address_ar": row["address_ar"],
    }
    if money:
        out |= {"documents": row["documents"], "owing_minor": int(row["owing_minor"]),
                "last_at": row["last_at"].isoformat() if row["last_at"] else None}
    return out


async def _by_id(conn: asyncpg.Connection, contact_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        f"{_SELECT}, {_AGGREGATES} from contacts c where c.id = $1 and c.role = 'customer'",
        contact_id)


# How many documents a customer has, what they still owe on issued invoices (read as every
# screen reads it) and when their last document was made.
_AGGREGATES = (
    "(select count(*) from documents d where d.contact_id = c.id "
    "and d.status in ('issued', 'void')) as documents, "
    f"(select coalesce(sum({listing.OWING}), 0) from documents d where d.contact_id = c.id "
    "and d.kind = 'invoice' and d.status = 'issued') as owing_minor, "
    "(select max(coalesce(d.issued_at, d.created_at)) from documents d "
    "where d.contact_id = c.id and d.status in ('issued', 'void')) as last_at"
)


async def find(conn: asyncpg.Connection, staff: Staff, contact_id: UUID) -> dict:
    """One customer, with their balance and their last documents (managers)."""
    manager = access.is_manager(staff)
    row = await _by_id(conn, contact_id)
    if row is None:
        raise DocumentError("customer_not_found", 404)
    out = _present(row, money=manager)
    if manager:
        docs = await conn.fetch(
            f"select d.id, d.kind, d.number, d.status, d.total_minor, d.currency, "
            f"d.currency_exponent, d.issue_date, {listing.OWING} as owing_minor "
            "from documents d where d.contact_id = $1 and d.status in ('issued', 'void') "
            "order by coalesce(d.issued_at, d.created_at) desc, d.id desc limit 30", contact_id)
        out["recent"] = [
            {"id": str(d["id"]), "kind": d["kind"], "number": d["number"], "status": d["status"],
             "total_minor": d["total_minor"], "currency": d["currency"],
             "currency_exponent": d["currency_exponent"],
             "issue_date": d["issue_date"].isoformat() if d["issue_date"] else None,
             "owing_minor": int(d["owing_minor"]) if d["kind"] == "invoice"
             and d["status"] == "issued" else 0}
            for d in docs
        ]
    return out


async def listing_of(
    conn: asyncpg.Connection, staff: Staff, q: str = "", limit: int = PAGE, offset: int = 0,
    owing: bool = False,
) -> dict:
    """The shop's customers, by name, with how many documents each has and what they owe (for
    owners and admins). `owing` keeps only those who owe something."""
    manager = access.is_manager(staff)
    limit = max(1, min(limit, MAX_PAGE))
    args: list = []
    where = ["c.role = 'customer'", NOT_THE_TEST_LINE]
    q = (q or "").strip()
    if q:
        args.append(q)
        haystack = _FOLD.format("c.name || ' ' || c.name_ar || ' ' || c.company || ' ' || "
                                "coalesce(c.email, '')")
        clause = f"position({_FOLD.format('$1')} in {haystack}) > 0"
        digits = re.sub(r"\D", "", western_digits(q))
        if len(digits) >= 3:
            args.append(digits)
            clause += (" or position($2 in regexp_replace(coalesce(c.phone, ''), "
                       "'\\D', '', 'g')) > 0")
        where.append(f"({clause})")
    if owing and manager:
        where.append(
            f"exists (select 1 from documents d where d.contact_id = c.id and d.kind = 'invoice' "
            f"and d.status = 'issued' and {listing.OWING} > 0)")
    condition = " and ".join(where)
    total = await conn.fetchval(f"select count(*) from contacts c where {condition}", *args)
    rows = await conn.fetch(
        f"{_SELECT}, {_AGGREGATES} from contacts c where {condition} "
        f"order by lower(coalesce(nullif(c.name, ''), nullif(c.name_ar, ''), c.company)), c.id "
        f"limit ${len(args) + 1} offset ${len(args) + 2}",
        *args, limit, max(0, offset))
    return {"customers": [_present(r, money=manager) for r in rows], "total": total,
            "has_more": offset + len(rows) < total}


async def save(
    conn: asyncpg.Connection, staff: Staff, fields: dict, contact_id: UUID | None = None,
    whatsapp_ok: bool = False,
) -> dict:
    """Add a customer, or change one. Adding a phone number the shop already has (a customer
    who wrote to its chat) fills that person in rather than making a second one; adding the
    number of a member of the team is refused.

    `whatsapp_ok` is the owner or an admin saying that this customer asked to be sent their
    documents on WhatsApp. ALYR never starts a chat with someone who has not agreed (hard rule
    5), and a customer the shop wrote down has not messaged it, so without this their documents
    go by link and email and the person shares them from their own phone. It is written to the
    consent record with who said so, and nothing here ever sets it by itself."""
    clean = _clean(fields)
    name = _shown_name(clean)
    actor = team.actor_of(staff)
    if contact_id is not None:
        existing = await conn.fetchrow(
            "select id, phone from contacts where id = $1 and role = 'customer' for update",
            contact_id)
        if existing is None:
            raise DocumentError("customer_not_found", 404)
        phone = clean_phone(clean["phone"]) if clean["phone"] else existing["phone"]
        if not phone:
            raise DocumentError("customer_needs_phone", field="phone")
        taken = await conn.fetchrow(
            "select id, role from contacts where phone = $1 and id <> $2", phone, contact_id)
        if taken is not None:
            raise DocumentError("phone_taken", 409, field="phone")
        action = "customer_changed"
    else:
        if not clean["phone"]:
            raise DocumentError("customer_needs_phone", field="phone")
        phone = clean_phone(clean["phone"])
        existing = await conn.fetchrow(
            "select id, role from contacts where phone = $1 for update", phone)
        if existing is not None and existing["role"] != "customer":
            raise DocumentError("phone_is_staff", 409, field="phone")
        action = "customer_changed" if existing is not None else "customer_added"
        contact_id = existing["id"] if existing is not None else None
    values = (name, clean["name_ar"], clean["company"], phone, clean["email"] or None,
              clean["registration_number"], clean["tax_id"], clean["address"],
              clean["address_ar"], _lang(clean))
    if contact_id is None:
        contact_id = await conn.fetchval(
            "insert into contacts (name, name_ar, company, phone, email, registration_number, "
            "tax_id, address, address_ar, lang, role) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'customer') returning id", *values)
    else:
        await conn.execute(
            "update contacts set name = $1, name_ar = $2, company = $3, phone = $4, email = $5, "
            "registration_number = $6, tax_id = $7, address = $8, address_ar = $9, lang = $10 "
            "where id = $11 and role = 'customer'", *values, contact_id)
    await team.record(conn, "conversation", contact_id, action, actor, contact_id,
                      {"source": "documents"})
    if whatsapp_ok and access.is_manager(staff) \
            and await consent.current(conn, contact_id, "service") != "granted":
        await consent.record(conn, contact_id, "service", "granted", "shop_attested",
                             f"{staff.name} says this customer asked to get documents on WhatsApp")
    return await find(conn, staff, contact_id)


# ── finding a customer from how somebody typed them ──────────────────────────────────────


@dataclass
class _Entry:
    """A customer shaped like what `items.match` ranks: names to compare, no sizes."""

    item: dict
    variants: tuple = ()


def variants(name: str) -> list[str]:
    """The name as typed and, for an Arabic name with the preposition «ل» stuck to it
    («لأحمد»), without it."""
    out = [name]
    if len(name) > 3 and name.startswith("ل") and not name.startswith("لل"):
        out.append(name[1:])
    return out


# Real names that begin with ل: a name like these is not the preposition «ل» stuck to a name.
_L_NAMES = frozenset(fold(n) for n in (
    "ليلى", "لينا", "لمى", "لبنى", "لجين", "لؤي", "لارا", "لطيفة", "لطفي", "لبيد", "ليث", "لبيب",
    "لقمان", "لولوة", "لمياء", "لميس", "ليان", "لانا", "لجين"))


def bare_name(name: str) -> str:
    """The name of a person who is not in the book yet, without the preposition «ل» that people
    stick to it when they write «فاتورة لأحمد» (to Ahmed): «لأحمد» is saved as «أحمد». The
    names that really begin with ل are left alone. Only for a name to be saved: matching an
    existing customer tries both (`variants`)."""
    words = name.split()
    if not words or fold(words[0]) in _L_NAMES:
        return name
    first = variants(words[0])
    return " ".join([first[-1], *words[1:]])


_MATCH_COLUMNS = "id, role, name, name_ar, phone, lang, email, company"
# The owner's own test customer on the private test line (onboarding) is not one of their customers.
NOT_THE_TEST_LINE = "coalesce(c.wa_user_id, '') not like 'TEST.%'"


async def by_phone(conn: asyncpg.Connection, number: str) -> asyncpg.Record | None:
    """Whoever has this phone number (a customer, or a member of the team)."""
    return await conn.fetchrow(f"select {_MATCH_COLUMNS} from contacts where phone = $1", number)


async def match_name(
    conn: asyncpg.Connection, typed: str, limit: int = 5
) -> tuple[str, list[asyncpg.Record]]:
    """('one' | 'many' | 'none', the customers) for a name somebody typed, by the Catalog's
    matching (`items/match.py`): a name that fits one customer is that customer, one that fits
    several is all of them, and a spelling mistake is forgiven only where there is little
    doubt. The company counts as part of the name."""
    rows = await conn.fetch(
        f"select {_MATCH_COLUMNS} from contacts c "
        f"where c.role = 'customer' and {NOT_THE_TEST_LINE} order by c.id limit 4000")
    entries = [
        _Entry({"name": f"{r['name']} {r['company']}".strip(),
                "name_ar": f"{r['name_ar']} {r['company']}".strip(), "row": r})
        for r in rows
    ]
    for candidate in variants(typed):
        words_ = match.tokens(candidate)
        if not words_:
            continue
        found = match.find(words_, entries, with_variants=False)
        if found.one is not None:
            return "one", [found.one.item["row"]]
        if found.many:
            return "many", [t.item["row"] for t in found.many[:limit]]
    return "none", []
