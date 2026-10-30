"""Helpers for the tests of documents made from sales and sent to customers (ALY-139): a shop
of its own that sells, takes bookings and keeps credit accounts, with customers who can be
messaged or not, and ways to read what the sales left behind.

Every test makes its own shop (and so its own numbering); documents cannot be deleted, so
nothing is shared. Everything goes through the real path: PostgreSQL, the HTTP API, the
simulator channel and the job queue (which the test app drains after each commit).
"""

import asyncio
import json
from dataclasses import dataclass, field
from uuid import UUID, uuid4

from documents_support import SELLER, configured_shop
from order_links import token
from pay_links import pay
from test_consent import owner_sql

PHONES = iter(range(97455550200, 97455559999))


@dataclass
class Customer:
    id: str
    name: str
    phone: str
    lang: str
    token: str


@dataclass
class SalesShop:
    base: object  # documents_support.Shop
    slug: str
    items: dict = field(default_factory=dict)

    @property
    def tenant_id(self) -> UUID:
        return self.base.tenant_id

    @property
    def owner(self):
        return self.base.owner

    @property
    def admin(self):
        return self.base.admin

    @property
    def agent(self):
        return self.base.agent


def sales_shop(client_factory, monkeypatch, *, documents: bool = True, cr: bool = True,
               **settings) -> SalesShop:
    """A shop that sells, with the documents module on (unless said otherwise), its seller
    details written, a slug, a simulator line and the modules that make sales."""
    seller = SELLER if cr else {**SELLER, "commercial_registration": ""}
    base = configured_shop(client_factory, monkeypatch, documents=documents, seller=seller,
                           **settings)
    slug = f"docs-{uuid4().hex[:8]}"
    owner_sql("update tenants set slug = $2 where id = $1", base.tenant_id, slug)
    for module in ("orders", "ledger", "bookings", "inbox"):
        owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, $2) "
                  "on conflict do nothing", base.tenant_id, module)
    owner_sql("insert into channel_numbers (number_id, tenant_id, channel) "
              "values ($1, $2, 'simulator')", f"sim-{slug}", base.tenant_id)
    return SalesShop(base, slug)


def customer(shop: SalesShop, name: str = "Huda Al-Naimi", *, lang: str = "en",
             window: bool = True, consent: str = "granted", credit_limit: int = 0,
             email: str | None = None, phone: str | None = None) -> Customer:
    """A customer of the shop. `window` is whether they wrote within the last 24 hours;
    `consent` is where they stand on service messages (granted, unknown, revoked)."""
    phone = phone or str(next(PHONES))
    row = owner_sql(
        "insert into contacts (tenant_id, phone, name, lang, credit_limit, consent_service, "
        "last_inbound_at, email) values ($1, $2, $3, $4, $5, $6, "
        "case when $7 then now() end, $8) returning id",
        shop.tenant_id, phone, name, lang, credit_limit, consent, window, email,
    )[0]["id"]
    return Customer(str(row), name, phone, lang, token(row, shop.tenant_id))


def close_window(shop: SalesShop, who: Customer) -> None:
    owner_sql("update contacts set last_inbound_at = now() - interval '2 days' where id = $1",
              UUID(who.id))


def item(shop: SalesShop, name: str = "Fresh Arabic bread", name_ar: str = "خبز عربي طازج",
         price: int = 350) -> dict:
    found = shop.owner.post("/api/items", json={
        "name": name, "name_ar": name_ar, "price": price, "status": "live"})
    assert found.status_code == 200, found.text
    shop.items[name] = found.json()["item"]
    return found.json()["item"]


def place(shop: SalesShop, who: Customer, items: list[tuple[dict, int]], payment: str = "link"):
    """An order placed from the customer's own link, as the order page does."""
    return shop.owner.post(f"/api/store/{shop.slug}/orders", json={
        "token": who.token, "payment": payment,
        "items": [{"product_id": i["id"], "quantity": q} for i, q in items],
    })


def placed(shop: SalesShop, who: Customer, items=None, payment: str = "link") -> dict:
    items = items or [(item(shop), 12)]
    response = place(shop, who, items, payment)
    assert response.status_code == 200, response.text
    return response.json()


def pay_by_link(shop: SalesShop, order: dict):
    return pay(shop.owner, order["pay_url"])


def documents(shop: SalesShop, **where) -> list[dict]:
    """Every document of the shop (any status), oldest first, straight from the database."""
    rows = owner_sql(
        "select id, kind, status, number, source, source_ref, total_minor, paid_minor, "
        "related_document_id, contact_id, languages, issue_key, issued_by from documents "
        "where tenant_id = $1 order by created_at, id", shop.tenant_id)
    return [dict(r) for r in rows if all(r[k] == v for k, v in where.items())]


def numbers(shop: SalesShop, kind: str) -> list[str]:
    rows = owner_sql("select number from documents where tenant_id = $1 and kind = $2 "
                     "and number is not null order by seq", shop.tenant_id, kind)
    return [r["number"] for r in rows]


def activity(shop: SalesShop, subject: str, subject_id: str | UUID, action: str | None = None):
    rows = owner_sql(
        "select action, detail, actor_name from activity where tenant_id = $1 and subject = $2 "
        "and subject_id = $3 order by created_at, id", shop.tenant_id, subject, UUID(str(subject_id)))
    return [{**r, "detail": js(r["detail"])} for r in rows if action is None or r["action"] == action]


def js(value):
    """A jsonb column read over a plain connection arrives as text."""
    return json.loads(value) if isinstance(value, str) else value


def messages(who: Customer, direction: str = "out") -> list[dict]:
    rows = owner_sql(
        "select id, wa_message_id, kind, body, payload, status, error from messages where contact_id = $1 "
        "and direction = $2 order by created_at, id", UUID(who.id), direction)
    return [{**r, "payload": js(r["payload"])} for r in rows]


def document_messages(who: Customer) -> list[dict]:
    """The messages that carried a document: a document message, or a document template."""
    return [m for m in messages(who) if m["kind"] == "document"
            or str((m["payload"] or {}).get("template", "")).startswith("document_")]


def deliveries(shop: SalesShop, doc_id: str) -> list[dict]:
    found = shop.owner.get(f"/api/documents/{doc_id}/deliveries")
    assert found.status_code == 200, found.text
    return found.json()["deliveries"]


def concurrently(client, tenant_id: UUID, *works):
    """Run these at the same moment, each in a transaction of its own, in the app's loop.
    Returns what each returned (or the exception it raised)."""
    async def one(work):
        async with client.app.state.db.tenant(tenant_id) as conn:
            return await work(conn)

    async def go():
        return await asyncio.gather(*(one(w) for w in works), return_exceptions=True)

    return client.portal.call(go)


def run_in_app(client, tenant_id: UUID, work):
    """Run `work(conn)` inside the app's own event loop, in the shop's scope, committing
    (and so running any jobs it queued) when it returns."""
    async def go():
        async with client.app.state.db.tenant(tenant_id) as conn:
            return await work(conn)

    return client.portal.call(go)
