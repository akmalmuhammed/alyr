"""Shared helpers for the documents tests (ALY-138): a shop of its own with an owner, an admin
and an agent signed in, a sale to issue, and a way to run SQL as the application's own role
(the one the immutability tests must be proved against).

Each test makes its own shop, so numbering always starts from the beginning and one test's
documents (which nothing can delete) are never in another's way.
"""

import asyncio
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID, uuid4

from alyr.db import Database
from conftest import APP_DSN
from test_consent import owner_sql
from test_sign_in import sign_in

SELLER = {
    "business_name": "Qirfa Bakery", "business_name_ar": "مخبز قرفة",
    "commercial_registration": "100200", "licence_number": "ML-4455",
    "address": "Old Airport Road, Doha", "address_ar": "شارع المطار القديم، الدوحة",
    "phone": "+974 5555 0100",
}
LINES = [
    {"description": "Fresh Arabic bread", "description_ar": "خبز عربي طازج", "quantity": "12",
     "unit": "piece", "unit_price_minor": 350},
    {"description": "Large date cake", "description_ar": "كعكة التمر الكبيرة", "quantity": "2",
     "unit": "piece", "unit_price_minor": 4500, "discount_minor": 500},
]
LINES_TOTAL = 12 * 350 + 2 * 4500 - 500  # 12,700 dirhams: QAR 127.00
CUSTOMER = {"name": "Fatima Al-Kuwari", "name_ar": "فاطمة الكواري", "phone": "+974 5555 0199"}


@dataclass
class Shop:
    tenant_id: UUID
    emails: dict
    owner: object = None
    admin: object = None
    agent: object = None


def make_shop(*, documents: bool = True) -> Shop:
    """A new shop with its three kinds of staff. Documents are on unless said otherwise."""
    tenant = owner_sql(
        "insert into tenants (name, name_ar) values ('Qirfa Bakery', 'مخبز قرفة') returning id"
    )[0]["id"]
    emails = {}
    for role in ("owner", "admin", "agent"):
        email = f"{role}-{uuid4().hex[:10]}@docs.example"
        user = owner_sql(
            "insert into users (email, name) values ($1, $2) returning id", email, role.title()
        )[0]["id"]
        owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)",
                  tenant, user, role)
        emails[role] = email
    if documents:
        owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'documents')",
                  tenant)
    return Shop(tenant, emails)


def sign_in_all(client_factory, shop: Shop) -> Shop:
    """One signed-in client for each role. (`ALYR_DEMO_OPEN` must be false, or the open demo
    would answer for everyone.)"""
    for role in ("owner", "admin", "agent"):
        client = client_factory()
        sign_in(client, shop.emails[role])
        setattr(shop, role, client)
    return shop


def configured_shop(client_factory, monkeypatch, *, documents: bool = True, seller: dict | None = None,
                    **settings) -> Shop:
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    # These tests put twenty issues through the routes at once to prove the numbering holds; the
    # gate that turns a long queue of draws away (core/admission.py, D-132) has tests of its own.
    from alyr.core import admission

    monkeypatch.setattr(admission, "renders", admission.Admission(running=50, waiting=50))
    # Twenty issues of one shop's series wait their turn at its counter, and each holds a connection
    # while it waits: the limits that answer "busy" after 3 seconds (core/db.py) would end the
    # queue's tail. They have tests of their own (test_db_budget.py).
    monkeypatch.setenv("ALYR_DB_ACQUIRE_TIMEOUT_SECONDS", "60")
    monkeypatch.setenv("ALYR_DB_MAX_WAITING", "100")
    shop = sign_in_all(client_factory, make_shop(documents=documents))
    if documents:
        done = shop.owner.put("/api/documents/settings", json={**(SELLER if seller is None else seller), **settings})
        assert done.status_code == 200, done.text
    return shop


def draft_body(kind: str = "receipt", **more) -> dict:
    """A sale a counter might make: bread and a cake, paid in cash when it is a receipt."""
    body = {"kind": kind, "customer": CUSTOMER, "lines": LINES}
    if kind == "receipt":
        body["payments"] = [{"method": "cash", "amount_minor": LINES_TOTAL}]
    return {**body, **more}


def make_draft(client, kind: str = "receipt", **more) -> dict:
    answer = client.post("/api/documents", json=draft_body(kind, **more))
    assert answer.status_code == 201, answer.text
    return answer.json()["document"]


def issue(client, doc_id: str, key: str | None = None):
    return client.post(f"/api/documents/{doc_id}/issue",
                       headers={"Idempotency-Key": key} if key else {})


def issued(client, kind: str = "receipt", **more) -> dict:
    """A draft made and issued; returns the issued document."""
    draft = make_draft(client, kind, **more)
    answer = issue(client, draft["id"], key=f"key-{uuid4().hex}")
    assert answer.status_code == 200, answer.text
    return answer.json()["document"]


def as_app(tenant_id: UUID, work):
    """Run `work(conn)` against the database as the application's own role, in the shop's
    scope, in a transaction that ends when `work` returns. For the tests that prove what the
    database refuses."""

    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(tenant_id) as conn:
                return await work(conn)
        finally:
            await db.close()

    return asyncio.run(go())


def refused_by_database(tenant_id: UUID, sql: str, *args):
    """Run one statement as the app role and return the error it was refused with (or None
    if it was allowed)."""

    async def work(conn):
        try:
            async with conn.transaction():  # a savepoint: a refusal leaves the outer one healthy
                await conn.execute(sql, *args)
        except Exception as error:  # noqa: BLE001 - the type is what the caller checks
            return error
        return None

    return as_app(tenant_id, work)


def money_of(value) -> Decimal:
    return Decimal(str(value))
