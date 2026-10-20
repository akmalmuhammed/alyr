"""What a shop that only invoices needs, beyond the engine (ALY-141, spec 016).

* **The one-line box.** `read_quick` reads "invoice for AC repair, QAR 500, to Ahmed 5551 2345"
  (English or Arabic, `quick.py`) and says which of the shop's customers it names, so the form
  can be filled in a single step. The WhatsApp command reads the same sentence the same way.
* **The private test customer.** At onboarding the owner sends their first invoice to a test
  customer on their business's private test line, to see what a customer receives. The test line
  is inside ALYR: nothing leaves it (D-031).
* **The first document**, which the onboarding screens ask about.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.core import consent
from alyr.core.auth import Staff
from alyr.modules.documents import customers, quick

TEST_PREFIX = "TEST."


def _customer_hit(row: asyncpg.Record) -> dict:
    return {"id": str(row["id"]), "name": row["name"], "name_ar": row["name_ar"],
            "company": row["company"], "phone": row["phone"] or "", "email": row["email"] or "",
            "lang": row["lang"]}


async def read_quick(conn: asyncpg.Connection, typed: str) -> dict:
    """The invoice (or receipt) a line of text asks for, and which customers it names.

    The workspace box takes a sentence without the word "invoice" too ("AC repair 500 for
    Ahmed"): it is always an invoice then. Nothing is made; the answer fills the form."""
    parsed = quick.parse(typed) or quick.parse("invoice " + (typed or ""))
    if parsed is None:
        return {"recognised": False}
    out = {
        "recognised": True, "kind": parsed.kind, "amount_minor": parsed.amount_minor,
        "description": parsed.description, "name": parsed.name, "method": parsed.method,
        "phone": parsed.phone, "problems": parsed.problems, "numbers": parsed.numbers,
        "customer": None, "candidates": [],
    }
    if parsed.phone:
        try:
            found = await customers.by_phone(conn, customers.clean_phone(parsed.phone))
        except Exception:  # noqa: BLE001 - a number that is not valid is just not a match
            found = None
        if found is not None and found["role"] == "customer":
            out["customer"] = _customer_hit(found)
        out["name"] = customers.bare_name(parsed.name or parsed.lone)
        return out
    # Which words name a customer? The person's name where it is clear, else each way round.
    tries = {"lone": [("lone", parsed.lone)],
             "swap": [("name", parsed.name), ("swap", parsed.description)]}.get(
        parsed.ambiguous, [("name", parsed.name)] if parsed.name else [])
    for role, candidate in tries:
        state, rows = await customers.match_name(conn, candidate)
        if state == "none":
            continue
        if role == "swap":
            out["name"], out["description"] = candidate, parsed.name
        elif role == "lone":
            out["name"], out["description"] = candidate, ""
        if state == "one":
            out["customer"] = _customer_hit(rows[0])
        else:
            out["candidates"] = [_customer_hit(r) for r in rows]
        return out
    if parsed.ambiguous == "lone":
        # Nobody by that name: it is what the invoice is for.
        out["description"] = parsed.lone
    out["name"] = customers.bare_name(out["name"])
    return out


# ── the owner's private test customer (onboarding) ───────────────────────────────────────


def test_key(staff: Staff) -> str:
    return f"{TEST_PREFIX}{staff.user_id or 'demo'}"


async def test_customer(conn: asyncpg.Connection, staff: Staff, lang: str) -> UUID:
    """The owner's private test customer on the business's test line, made if there is none,
    with its 24-hour window open and its agreement to be sent documents on the record (the
    owner is both sides of this chat). A contact in the inbox sense only: it never leaves ALYR."""
    number = await conn.fetchval(
        "select number_id from channel_numbers where channel = 'simulator' and tenant_id = "
        "nullif(current_setting('app.tenant_id', true), '')::uuid order by number_id limit 1")
    if number is None:
        raise LookupError("this business has no test line")
    contact_id = await conn.fetchval(
        "insert into contacts (wa_user_id, name, role, lang, number_id, last_inbound_at) "
        "values ($1, $2, 'customer', $3, $4, now()) "
        "on conflict (tenant_id, wa_user_id) where wa_user_id is not null "
        "do update set last_inbound_at = now(), number_id = excluded.number_id returning id",
        test_key(staff), f"{staff.name} (test)", "ar" if lang == "ar" else "en", number)
    if await consent.current(conn, contact_id, "service") != "granted":
        await consent.record(conn, contact_id, "service", "granted", "onboarding_test",
                             "The owner's own test customer on the private test line")
    return contact_id


async def first_document(conn: asyncpg.Connection) -> dict | None:
    """The first document the shop issued, or None: the onboarding step is done when there is
    one."""
    row = await conn.fetchrow(
        "select id, kind, number from documents where status in ('issued', 'void') "
        "and kind in ('invoice', 'receipt') order by issued_at, id limit 1")
    return None if row is None else {"id": str(row["id"]), "kind": row["kind"],
                                     "number": row["number"]}
