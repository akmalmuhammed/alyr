"""The workspace shell, product switching, setup checklist, and ALYR's back office
(ALY-18, decision D-027)."""

import asyncpg
import pytest

from alyr import catalog
from alyr.seed import AGENT_EMAIL, AHMED_PHONE, ALYR_STAFF_EMAIL, DEMO_SLUG, OWNER_EMAIL
from test_consent import owner_sql, say
from test_sign_in import code_for, sign_in


def shell(client):
    response = client.get("/api/workspace")
    assert response.status_code == 200
    return response.json()


def product(state, key):
    return next(p for p in state["products"] if p["key"] == key)


def nav_keys(state):
    return [s["key"] for group in ("core", "products", "account") for s in state["nav"][group]]


def test_the_shell_shows_what_the_demo_shop_has(client):
    state = shell(client)
    assert state["business"]["slug"] == DEMO_SLUG
    # The line-up of 17 Oct 2026, in its order (D-035).
    assert [p["key"] for p in state["products"]] == [
        "chat", "bookings", "agent", "accounts", "payroll",
    ]
    assert product(state, "chat")["status"] == "active"
    assert product(state, "bookings")["status"] == "active"
    assert product(state, "agent")["status"] == "included"
    assert product(state, "accounts")["status"] == "active"
    assert product(state, "payroll")["status"] == "coming"
    accounts = product(state, "accounts")
    assert accounts["name"] == {"en": "ALYR Accounts", "ar": "ALYR Accounts"}
    assert accounts["descriptor"]["ar"] == "الحسابات الآجلة"
    assert [i["label"]["en"] for i in product(state, "agent")["includes"]] == [
        "Home dashboard", "Sunday report",
    ]
    assert nav_keys(state) == [
        "home",
        "inbox",
        "bookings",
        "orders",
        "ledger",
        "products",
        "connections",
        "team",
    ]


def test_agents_do_not_see_the_owner_sections(client):
    sign_in(client, AGENT_EMAIL)
    state = shell(client)
    assert "products" not in nav_keys(state) and "connections" not in nav_keys(state)
    assert state["can_manage"] is False
    assert client.post("/api/workspace/products/accounts/disable").status_code == 403


def test_switching_a_product_off_hides_it_everywhere_and_back_on_restores_it(client):
    sign_in(client, OWNER_EMAIL)
    assert client.post("/api/workspace/products/accounts/disable").json() == {
        "disabled": ["ledger"]
    }
    state = shell(client)
    assert product(state, "accounts")["status"] == "available"
    assert "ledger" not in nav_keys(state)
    # Its routes refuse, and the chat no longer offers it: the shop still takes
    # bookings, so a greeting gets the booking menu, with no balance or pay buttons.
    assert client.get("/api/ledger/summary").status_code == 403
    reply = say(client, AHMED_PHONE, "hello")[-1]
    assert reply["body"] == "Welcome to Al Noor Electricals. How can we help?"
    assert [c["id"] for c in reply["payload"]["choices"]] == ["book", "my_booking", "prices"]

    assert client.post("/api/workspace/products/accounts/enable").json() == {"enabled": ["ledger"]}
    summary = client.get("/api/ledger/summary").json()
    assert summary["outstanding"] > 0  # the data was kept while it was off


def test_turning_off_bookings_closes_the_public_booking_page(client):
    sign_in(client, OWNER_EMAIL)
    # The inbox and payment links stay on: ALYR Chat still uses them.
    off = client.post("/api/workspace/products/bookings/disable").json()
    assert off == {"disabled": ["bookings"]}
    assert client.get(f"/api/book/{DEMO_SLUG}").status_code == 404
    assert client.get(f"/api/store/{DEMO_SLUG}").status_code == 200
    assert client.get("/api/inbox/conversations").status_code == 200
    client.post("/api/workspace/products/bookings/enable")
    assert client.get(f"/api/book/{DEMO_SLUG}").status_code == 200


def test_the_shared_inbox_goes_off_only_with_the_last_product_using_it(client):
    sign_in(client, OWNER_EMAIL)
    # Chat off: its order page closes, but Bookings keeps the inbox and payment links.
    assert client.post("/api/workspace/products/chat/disable").json() == {"disabled": ["orders"]}
    assert client.get(f"/api/store/{DEMO_SLUG}").status_code == 404
    assert client.get("/api/inbox/conversations").status_code == 200
    state = shell(client)
    assert product(state, "chat")["status"] == "available"
    # The WhatsApp and payment steps move to the product still using them.
    assert {s["key"] for s in product(state, "bookings")["steps"]} == {
        "whatsapp", "services", "hours", "provider",
    }
    # Bookings off as well: nothing uses the inbox any more.
    off = client.post("/api/workspace/products/bookings/disable").json()
    assert off == {"disabled": ["inbox", "bookings", "payments"]}
    assert client.get("/api/inbox/conversations").status_code == 403
    assert product(shell(client), "agent")["status"] == "included"
    client.post("/api/workspace/products/chat/enable")
    client.post("/api/workspace/products/bookings/enable")
    assert client.get("/api/inbox/conversations").status_code == 200


def test_alyr_agent_is_included_and_cannot_be_switched(client):
    sign_in(client, OWNER_EMAIL)
    assert client.post("/api/workspace/products/agent/disable").status_code == 422
    assert client.post("/api/workspace/products/agent/enable").status_code == 422
    assert product(shell(client), "agent")["status"] == "included"


def test_which_products_a_set_of_modules_means():
    using = catalog.products_for
    # A salon: the inbox and payment links count for Bookings, not for Chat as well.
    assert using({"inbox", "bookings", "payments"}) == ["bookings", "agent"]
    # A restaurant, and a bakery that takes orders and books tastings.
    assert using({"inbox", "orders", "payments"}) == ["chat", "agent"]
    assert using({"inbox", "orders", "bookings", "payments"}) == ["chat", "bookings", "agent"]
    # A travel office has only the shared modules: that is ALYR Chat.
    assert using({"inbox", "payments"}) == ["chat", "agent"]
    # A trader.
    assert using({"inbox", "ledger", "payments"}) == ["chat", "agent", "accounts"]
    assert using({"ledger"}) == ["agent", "accounts"]
    # Every business has ALYR Agent, even with nothing switched on.
    assert using(set()) == ["agent"]
    assert catalog.SHARED_MODULES == {"inbox", "payments"}


def test_a_coming_product_cannot_be_switched_on(client):
    assert client.post("/api/workspace/products/payroll/enable").status_code == 422
    assert client.post("/api/workspace/products/nothing/enable").status_code == 404


def test_the_setup_checklist_reflects_what_the_shop_has_done(client):
    state = shell(client)
    chat = {s["key"]: s for s in product(state, "chat")["steps"]}
    bookings = {s["key"]: s for s in product(state, "bookings")["steps"]}
    # Shared steps (WhatsApp, the payment provider) show once, under ALYR Chat.
    assert set(chat) == {"whatsapp", "products", "provider"}
    assert set(bookings) == {"services", "hours"}
    assert bookings["services"]["done"] and bookings["hours"]["done"] and chat["products"]["done"]
    assert chat["provider"]["done"] is False  # no payment provider can be connected yet
    owner_sql("update services set active = false")
    steps = {s["key"]: s for s in product(shell(client), "bookings")["steps"]}
    assert steps["services"]["done"] is False


def test_the_home_dashboard_has_one_card_per_number_each_module_offers(client):
    say(client, AHMED_PHONE, "hello")
    cards = {c["key"]: c for c in client.get("/api/workspace/home").json()["cards"]}
    # The Catalog is off for every shop until go-live, so its cards are not on the demo shop's
    # home (tests/test_catalog_cards.py switches it on).
    expected = {card.key for m in catalog.MODULES if m.key != "catalog" for card in m.cards}
    assert set(cards) == expected
    assert cards["unanswered"]["value"] == 1
    assert cards["outstanding"]["text"].startswith("QAR ")


def test_asking_alyr_for_help_reaches_the_back_office_once(client):
    first = client.post(
        "/api/workspace/setup-requests",
        json={"product": "chat", "step": "provider", "note": "We use SkipCash"},
    )
    again = client.post(
        "/api/workspace/setup-requests", json={"product": "chat", "step": "provider"}
    )
    assert first.json()["id"] == again.json()["id"]
    step = next(s for s in product(shell(client), "chat")["steps"] if s["key"] == "provider")
    assert step["asked"] is True

    queue = client.get("/api/admin/setup-requests").json()["requests"]
    mine = [r for r in queue if r["id"] == first.json()["id"]]
    assert (
        mine
        and mine[0]["business"] == "Al Noor Electricals"
        and mine[0]["note"] == "We use SkipCash"
    )
    assert client.post(f"/api/admin/setup-requests/{mine[0]['id']}/done").status_code == 200
    assert client.post(f"/api/admin/setup-requests/{mine[0]['id']}/done").status_code == 404


def test_the_back_office_creates_a_shop_whose_owner_can_sign_in(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    sign_in(client, ALYR_STAFF_EMAIL)
    created = client.post(
        "/api/admin/businesses",
        json={
            "name": "Zaitoon Grill",
            "name_ar": "مشاوي زيتون",
            "slug": "zaitoon-grill-test",
            "owner_email": "Owner@Zaitoon.example",
            "owner_name": "Reem",
            "products": ["chat"],
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["modules"] == ["inbox", "orders", "payments"]
    assert (
        client.post(
            "/api/admin/businesses",
            json={
                "name": "Again",
                "slug": "zaitoon-grill-test",
                "owner_email": "x@x.example",
                "owner_name": "X",
            },
        ).status_code
        == 409
    )
    listed = {b["slug"]: b for b in client.get("/api/admin/businesses").json()["businesses"]}
    assert listed["zaitoon-grill-test"]["products"] == ["chat", "agent"]

    owner = client_factory()
    owner.post(
        "/api/auth/verify",
        json={"email": "owner@zaitoon.example", "code": code_for(owner, "owner@zaitoon.example")},
    )
    state = shell(owner)
    assert state["business"]["name"] == "Zaitoon Grill" and state["me"]["role"] == "owner"
    assert product(state, "chat")["status"] == "active"
    assert product(state, "bookings")["status"] == "available"
    assert product(state, "accounts")["status"] == "available"
    # A new shop has nothing set up yet, so its checklist is all to do.
    assert not any(s["done"] for s in product(state, "chat")["steps"])


def test_only_alyr_staff_can_use_the_back_office(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    assert client.get("/api/admin/businesses").status_code == 401
    sign_in(client, OWNER_EMAIL)
    assert client.get("/api/admin/businesses").status_code == 403
    bad = client.post(
        "/api/admin/businesses",
        json={
            "name": "X",
            "slug": "x-shop",
            "owner_email": "a@b.example",
            "owner_name": "A",
        },
    )
    assert bad.status_code == 403


def test_the_database_refuses_back_office_calls_the_api_did_not_vouch_for(client):
    async def sneak():
        async with client.app.state.db.unscoped() as conn:
            await conn.fetch("select * from admin_businesses()")

    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        client.portal.call(sneak)


def test_bad_back_office_input_is_refused(client):
    base = {"name": "X", "owner_email": "a@b.example", "owner_name": "A"}
    assert (
        client.post("/api/admin/businesses", json={**base, "slug": "Bad Slug!"}).status_code == 422
    )
    assert (
        client.post(
            "/api/admin/businesses", json={**base, "slug": "ok-slug", "products": ["payroll"]}
        ).status_code
        == 422
    )


def test_one_shop_cannot_see_another_shops_setup_requests(client):
    client.post("/api/workspace/setup-requests", json={"product": "chat", "step": "provider"})
    other = owner_sql("insert into tenants (name) values ('Other') returning id")[0]["id"]

    async def look():
        async with client.app.state.db.tenant(other) as conn:
            return await conn.fetchval("select count(*) from setup_requests")

    assert client.portal.call(look) == 0
