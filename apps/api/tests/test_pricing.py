"""Pricing under ALYR's control: the price list, each client's quote, and the switches
for which businesses may sign up on their own (D-032)."""

import asyncio

import asyncpg
import pytest

from alyr.db import Database
from alyr.seed import OWNER_EMAIL
from conftest import APP_DSN
from test_consent import owner_sql
from test_onboarding import BASE, new_business
from test_sign_in import sign_in

ADMIN = "/api/admin"


@pytest.fixture(autouse=True)
def pricing_restored():
    """The price list and switches are global; put them back after every test."""
    items = owner_sql("select * from price_items")
    types = owner_sql("select * from business_type_settings")
    settings = owner_sql("select key, value::text as value, updated_by from platform_settings")
    yield
    owner_sql("delete from price_items")
    for r in items:
        owner_sql(
            "insert into price_items (key, name, name_ar, kind, price, applies, active, sort, "
            "updated_by, price_usd) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            r["key"], r["name"], r["name_ar"], r["kind"], r["price"], r["applies"],
            r["active"], r["sort"], r["updated_by"], r["price_usd"],
        )
    owner_sql("delete from business_type_settings")
    for r in types:
        owner_sql(
            "insert into business_type_settings (key, availability, price_mode) "
            "values ($1, $2, $3)", r["key"], r["availability"], r["price_mode"],
        )
    owner_sql("delete from platform_settings")
    for r in settings:
        owner_sql(
            "insert into platform_settings (key, value, updated_by) values ($1, $2::jsonb, $3)",
            r["key"], r["value"], r["updated_by"],
        )


@pytest.fixture
def office(client_factory):
    """The back office. On a local machine the unsigned demo user counts as ALYR staff."""
    return client_factory()


def client_of(office, business_name):
    clients = office.get(f"{ADMIN}/clients").json()["clients"]
    match = [c for c in clients if any(b["name"] == business_name for b in c["businesses"])]
    assert len(match) == 1, business_name
    return office.get(f"{ADMIN}/clients/{match[0]['id']}").json()


def open_quote(detail):
    return next(q for q in detail["quotes"] if q["status"] in ("draft", "published"))


def editable(quote, **changes):
    lines = [
        {k: x[k] for k in ("business_id", "item_key", "name", "name_ar", "kind", "quantity",
                           "unit_price")}
        for x in quote["lines"]
    ]
    return {"period_months": quote["period_months"], "discount_pct": quote["discount_pct"],
            "show_promise": quote["show_promise"], "note": quote["note"], "lines": lines} | changes


def test_a_new_business_gets_its_own_client_and_a_draft_from_the_price_list(client, office):
    _, _, name = new_business(client)
    # The owner sees that ALYR is preparing their price: drafts are not theirs to see.
    assert client.get(f"{BASE}/quote").json() == {"status": "preparing"}
    assert client.get(f"{BASE}/state").json()["quote"] == {"status": "preparing"}

    detail = client_of(office, name)
    assert detail["contact_name"] == "Hamad" and detail["contact_email"].endswith("@shop.example")
    quote = open_quote(detail)
    assert quote["status"] == "draft" and quote["number"] == 1
    # A salon uses ALYR Bookings, not ALYR Chat as well, and not ALYR Accounts. ALYR Agent
    # is included, so it shows at QAR 0. The setup fee is per business.
    assert [(x["item_key"], x["kind"], x["unit_price"]) for x in quote["lines"]] == [
        ("bookings", "monthly", 44900), ("agent", "monthly", 0), ("setup", "one_time", 250000),
    ]
    assert quote["lines"][0]["name"] == "ALYR Bookings"
    assert quote["totals"]["monthly_total_text"] == "QAR 449"
    assert quote["totals"]["one_time_total_text"] == "QAR 2,500"


def test_a_trader_is_quoted_alyr_accounts_and_asks_alyr_under_it(client, office):
    tenant, _, name = new_business(client, kind="wholesale")
    lines = open_quote(client_of(office, name))["lines"]
    # The inbox and payment links of a trader count for ALYR Chat, as before the split;
    # ALYR Accounts is the product it adds, at the extra-product price.
    assert [(x["item_key"], x["name"], x["unit_price"]) for x in lines] == [
        ("chat", "ALYR Chat", 44900), ("credit", "ALYR Accounts, added product", 5000),
        ("agent", "ALYR Agent, included", 0),
        ("setup", "Setup: number connection, data and training", 250000),
    ]
    asked = owner_sql(
        "select product_key, step_key from setup_requests where tenant_id = $1", tenant
    )
    assert [(r["product_key"], r["step_key"]) for r in asked] == [("accounts", "onboarding")]
    business = client_of(office, name)["businesses"][0]
    assert business["products"] == ["ALYR Chat", "ALYR Agent", "ALYR Accounts"]


def test_each_product_a_business_adds_costs_the_extra_price(office):
    """The founder's combination pricing (D-035, price changed by D-053): QAR 449 for the
    first product, QAR 50 for each one added, ALYR Agent included at QAR 0."""

    def monthly(products, slug):
        created = office.post(f"{ADMIN}/businesses", json={
            "name": f"Combo {slug}", "slug": f"combo-{slug}",
            "owner_email": f"{slug}@combo.example",
            "owner_name": "Noor", "products": products,
        })
        assert created.status_code == 200, created.text
        detail = client_of(office, f"Combo {slug}")
        fresh = office.post(
            f"{ADMIN}/clients/{detail['id']}/quotes", json={"start_from": "price_list"}
        )
        quote = open_quote(fresh.json())
        return quote["totals"]["monthly_total"], [
            (x["item_key"], x["unit_price"]) for x in quote["lines"] if x["kind"] == "monthly"
        ]

    assert monthly(["chat"], "one") == (44900, [("chat", 44900), ("agent", 0)])
    assert monthly(["chat", "bookings"], "two") == (
        49900, [("chat", 44900), ("bookings", 5000), ("agent", 0)],
    )
    assert monthly(["chat", "bookings", "accounts"], "three") == (
        54900, [("chat", 44900), ("bookings", 5000), ("credit", 5000), ("agent", 0)],
    )
    # ALYR changes the extra price in the back office; new drafts follow it.
    item = {k: v for k, v in next(
        i for i in office.get(f"{ADMIN}/pricing").json()["items"] if i["key"] == "extra_product"
    ).items() if k in ("name", "name_ar", "kind", "applies", "active", "sort")}
    assert item["applies"] == "extra_product"
    assert office.put(f"{ADMIN}/pricing/items/extra_product",
                      json=item | {"price": 20000}).status_code == 200
    assert monthly(["chat", "bookings"], "four")[0] == 64900


def test_alyr_prices_the_client_and_the_owner_sees_each_change_live(client, office):
    _, _, name = new_business(client)
    quote = open_quote(client_of(office, name))
    lines = editable(quote)["lines"]
    lines[0]["unit_price"] = 39900
    lines.append({"business_id": None, "item_key": None, "name": "Launch discount",
                  "name_ar": "خصم الإطلاق", "kind": "monthly", "quantity": 1,
                  "unit_price": -5000})
    saved = office.put(
        f"{ADMIN}/quotes/{quote['id']}",
        json=editable(quote, lines=lines, period_months=12, discount_pct=10,
                      note="Paid yearly, as agreed at the shop"),
    )
    assert saved.status_code == 200, saved.text
    assert client.get(f"{BASE}/quote").json() == {"status": "preparing"}

    assert office.post(f"{ADMIN}/quotes/{quote['id']}/publish").status_code == 200
    seen = client.get(f"{BASE}/quote").json()
    assert seen["status"] == "published" and seen["note"] == "Paid yearly, as agreed at the shop"
    totals = seen["totals"]
    # 399 - 50 = 349 a month; 10% off is 34.90; 314.10 a month; twelve months at once.
    assert (totals["monthly_subtotal"], totals["discount"], totals["monthly_total"]) == (
        34900, 3490, 31410,
    )
    assert totals["period_total"] == 31410 * 12 and totals["one_time_total"] == 250000
    assert "updated_by" not in seen

    # A change to a published quote reaches the owner's screen at once.
    office.put(f"{ADMIN}/quotes/{quote['id']}", json=editable(quote, discount_pct=0))
    assert client.get(f"{BASE}/quote").json()["totals"]["monthly_total"] == 44900


def test_an_accepted_price_is_locked_and_a_new_one_supersedes_it(client, office):
    _, _, name = new_business(client)
    quote = open_quote(client_of(office, name))
    office.post(f"{ADMIN}/quotes/{quote['id']}/publish")
    accepted = client.post(f"{BASE}/quote/accept", json={"quote_id": quote["id"]}).json()
    assert accepted["status"] == "accepted" and accepted["accepted_by"] == "Hamad"

    assert office.put(f"{ADMIN}/quotes/{quote['id']}", json=editable(quote)).status_code == 409
    assert office.post(f"{ADMIN}/quotes/{quote['id']}/withdraw").status_code == 409
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        owner_sql("update quote_lines set unit_price = 1 where quote_id = $1::uuid", quote["id"])

    detail = office.post(
        f"{ADMIN}/clients/{client_of(office, name)['id']}/quotes", json={"start_from": "copy"}
    ).json()
    second = open_quote(detail)
    assert second["number"] == 2 and len(second["lines"]) == len(quote["lines"])
    # Until the new price is published the owner still sees the one they accepted.
    assert client.get(f"{BASE}/quote").json()["number"] == 1
    office.post(f"{ADMIN}/quotes/{second['id']}/publish")
    assert client.get(f"{BASE}/quote").json()["number"] == 2
    client.post(f"{BASE}/quote/accept", json={"quote_id": second["id"]})
    statuses = {q["number"]: q["status"] for q in client_of(office, name)["quotes"]}
    assert statuses == {1: "superseded", 2: "accepted"}


def test_a_price_that_changed_cannot_be_accepted(client, office):
    _, _, name = new_business(client)
    quote = open_quote(client_of(office, name))
    # Not published yet: nothing to accept.
    refused = client.post(f"{BASE}/quote/accept", json={"quote_id": quote["id"]})
    assert refused.status_code == 409
    office.post(f"{ADMIN}/quotes/{quote['id']}/publish")
    office.post(f"{ADMIN}/quotes/{quote['id']}/withdraw")
    assert client.post(f"{BASE}/quote/accept", json={"quote_id": quote["id"]}).status_code == 409
    assert client.get(f"{BASE}/quote").json() == {"status": "preparing"}


def test_one_client_never_sees_another_clients_quote(client, client_factory, office):
    _, _, name_a = new_business(client)
    quote_a = open_quote(client_of(office, name_a))
    office.post(f"{ADMIN}/quotes/{quote_a['id']}/publish")
    other = client_factory()
    tenant_b, _, _ = new_business(other)
    assert other.get(f"{BASE}/quote").json() == {"status": "preparing"}
    assert other.post(f"{BASE}/quote/accept", json={"quote_id": quote_a["id"]}).status_code == 409

    async def look():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(tenant_b) as conn:
                return (
                    await conn.fetchval("select count(*) from quotes"),
                    await conn.fetchval("select count(*) from quote_lines"),
                    await conn.fetchval("select count(*) from clients"),
                )
        finally:
            await db.close()

    # Business B sees its own client and nothing of A's; its own draft stays hidden too.
    assert asyncio.run(look()) == (0, 0, 1)


def test_without_the_back_office_the_app_cannot_change_prices():
    async def attempt():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.unscoped() as conn:
                updated = await conn.execute("update price_items set price = 1")
                await conn.execute(
                    "insert into price_items (key, name, kind, price, applies) "
                    "values ('rogue', 'Rogue', 'monthly', 1, 'manual')"
                )
            return updated
        finally:
            await db.close()

    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        asyncio.run(attempt())
    assert owner_sql("select price from price_items where key = 'chat'")[0]["price"] == 44900


def test_automatic_price_mode_shows_the_price_at_once(client, office):
    office.put(f"{ADMIN}/pricing/types/salon",
               json={"availability": "self_serve", "price_mode": "automatic"})
    new_business(client)
    seen = client.get(f"{BASE}/quote").json()
    assert seen["status"] == "published" and seen["totals"]["monthly_total_text"] == "QAR 449"
    assert seen["promise"]["en"].startswith("If no customer books")


def test_a_client_can_be_switched_to_prepared_whatever_their_type(client, office):
    office.put(f"{ADMIN}/pricing/types/salon",
               json={"availability": "self_serve", "price_mode": "automatic"})
    _, _, name = new_business(client)
    detail = client_of(office, name)
    assert detail["effective_price_mode"] == "automatic"
    changed = office.patch(
        f"{ADMIN}/clients/{detail['id']}",
        json={"name": detail["name"], "contact_name": "Hamad Al-Kuwari",
              "contact_phone": "+974 5000 0000", "price_mode": "prepared"},
    ).json()
    assert changed["effective_price_mode"] == "prepared"
    assert changed["contact_name"] == "Hamad Al-Kuwari"


def test_alyr_decides_which_types_may_sign_up_alone(client, client_factory, office):
    office.put(f"{ADMIN}/pricing/types/spa",
               json={"availability": "hidden", "price_mode": "prepared"})
    office.put(f"{ADMIN}/pricing/types/salon",
               json={"availability": "with_alyr", "price_mode": "prepared"})
    types = {t["key"]: t for t in client.get(f"{BASE}/types").json()["types"]}
    assert "spa" not in types and types["salon"]["way"] == "assisted"

    tenant, _, _ = new_business(client)
    state = client.get(f"{BASE}/state").json()
    assert (state["way"], state["steps"]) == ("assisted", ["assisted", "plan", "golive"])
    asked = owner_sql("select step_key from setup_requests where tenant_id = $1", tenant)
    assert [r["step_key"] for r in asked] == ["onboarding"]

    # A business that started on the full flow keeps it when the switch changes later.
    office.put(f"{ADMIN}/pricing/types/salon",
               json={"availability": "self_serve", "price_mode": "prepared"})
    first = client_factory()
    new_business(first)
    office.put(f"{ADMIN}/pricing/types/salon",
               json={"availability": "with_alyr", "price_mode": "prepared"})
    assert first.get(f"{BASE}/state").json()["way"] == "appointments"

    with pytest.raises(AssertionError):
        new_business(client_factory(), kind="spa")


def test_a_type_without_screens_cannot_be_made_self_serve(office):
    """Wholesale (credit, price groups) and travel (requests) have no self-serve way."""
    for key in ("wholesale", "travel"):
        refused = office.put(f"{ADMIN}/pricing/types/{key}",
                             json={"availability": "self_serve", "price_mode": "prepared"})
        assert refused.status_code == 422 and "set up with ALYR" in refused.json()["detail"]


def test_price_list_changes_reach_new_quotes_only(client, client_factory, office):
    _, _, before = new_business(client)
    items = {i["key"]: i for i in office.get(f"{ADMIN}/pricing").json()["items"]}
    bookings = items["bookings"] | {"price": 59900}
    bookings.pop("key")
    saved = office.put(f"{ADMIN}/pricing/items/bookings", json=bookings)
    assert saved.status_code == 200 and saved.json()["price_text"] == "QAR 599"
    added = office.put(f"{ADMIN}/pricing/items/deposits", json={
        "name": "Deposits and pay links", "kind": "monthly", "price": 10000,
        "applies": "module:payments", "sort": 15,
    })
    assert added.status_code == 200, added.text

    assert open_quote(client_of(office, before))["totals"]["monthly_total"] == 44900
    _, _, after = new_business(client_factory())
    lines = open_quote(client_of(office, after))["lines"]
    assert [(x["item_key"], x["unit_price"]) for x in lines] == [
        ("bookings", 59900), ("deposits", 10000), ("agent", 0), ("setup", 250000),
    ]

    bad = office.put(f"{ADMIN}/pricing/items/x1", json={
        "name": "X", "kind": "monthly", "price": 1, "applies": "module:nothing"})
    assert bad.status_code == 422


def test_one_client_with_two_businesses_gets_one_quote_for_both(client, office):
    _, _, name = new_business(client)
    detail = client_of(office, name)
    created = office.post(f"{ADMIN}/businesses", json={
        "name": "Second Branch", "slug": f"second-{detail['id'][:8]}",
        "owner_email": detail["contact_email"], "owner_name": "Hamad",
        "products": ["chat"], "client_id": detail["id"],
    })
    assert created.status_code == 200, created.text
    detail = office.get(f"{ADMIN}/clients/{detail['id']}").json()
    assert sorted(b["name"] for b in detail["businesses"]) == sorted([name, "Second Branch"])

    office.post(f"{ADMIN}/quotes/{open_quote(detail)['id']}/withdraw")
    fresh = open_quote(office.post(
        f"{ADMIN}/clients/{detail['id']}/quotes", json={"start_from": "price_list"}
    ).json())
    per_business = {}
    for x in fresh["lines"]:
        per_business.setdefault(x["business"], []).append(x["item_key"])
    # The salon uses ALYR Bookings; the second branch was created with ALYR Chat.
    assert per_business == {
        name: ["bookings", "agent", "setup"], "Second Branch": ["chat", "agent", "setup"],
    }
    assert fresh["totals"]["monthly_total"] == 2 * 44900

    # A line for a business of another client is refused.
    stranger = editable(fresh)
    stranger["lines"][0]["business_id"] = owner_sql(
        "select id::text from tenants where client_id <> $1::uuid limit 1", detail["id"]
    )[0]["id"]
    assert office.put(f"{ADMIN}/quotes/{fresh['id']}", json=stranger).status_code == 409


def test_the_promise_is_written_in_the_back_office(client, office):
    office.put(f"{ADMIN}/pricing/promise", json={"en": "Results in 30 days or a free month.",
                                                 "ar": "نتائج خلال 30 يوماً أو شهر مجاني."})
    _, _, name = new_business(client)
    quote = open_quote(client_of(office, name))
    office.post(f"{ADMIN}/quotes/{quote['id']}/publish")
    assert client.get(f"{BASE}/quote").json()["promise"]["ar"] == "نتائج خلال 30 يوماً أو شهر مجاني."
    office.put(f"{ADMIN}/quotes/{quote['id']}", json=editable(quote, show_promise=False))
    assert client.get(f"{BASE}/quote").json()["promise"] is None


def test_only_alyr_staff_reach_prices_and_clients(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner = client_factory()
    assert owner.get(f"{ADMIN}/pricing").status_code == 401
    sign_in(owner, OWNER_EMAIL)
    assert owner.get(f"{ADMIN}/pricing").status_code == 403
    assert owner.get(f"{ADMIN}/clients").status_code == 403
    assert owner.put(f"{ADMIN}/pricing/promise", json={"en": "x"}).status_code == 403


def test_the_workspace_tells_the_owner_when_a_price_waits_for_them(client, office):
    _, _, name = new_business(client)
    assert client.get("/api/workspace").json()["plan"] == {"status": "preparing"}
    quote = open_quote(client_of(office, name))
    office.post(f"{ADMIN}/quotes/{quote['id']}/publish")
    plan = client.get("/api/workspace").json()["plan"]
    assert plan == {"status": "published", "monthly_total_text": "QAR 449", "number": 1}


def test_what_a_client_saves_by_combining_is_only_a_real_price():
    """D-053: the saving shown on the plan is the products' own list prices against what is
    charged. Three products are QAR 549 against QAR 1,347 one by one: 59% off. A single
    product shows nothing, and a line charged at or above its list price adds no saving."""
    from alyr.core import pricing

    listed = {"chat": 44900, "bookings": 44900, "credit": 44900, "agent": 0}

    def line(key, price):
        return {"item_key": key, "kind": "monthly", "quantity": 1, "unit_price": price}

    three = [line("chat", 44900), line("bookings", 5000), line("credit", 5000), line("agent", 0)]
    saved = pricing.together(three, listed)
    assert (saved["alone"], saved["price"], saved["saving"], saved["saving_pct"]) == (
        134700, 54900, 79800, 59,
    )
    assert saved["saving_text"] == "QAR 798"
    assert pricing.together([line("chat", 44900), line("agent", 0)], listed) is None
    # A line ALYR priced above its list price (an edited quote) never makes up a saving.
    assert pricing.together([line("chat", 60000)], listed) is None
