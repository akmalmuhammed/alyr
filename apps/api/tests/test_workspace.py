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
    assert product(state, "chat")["status"] == "active"
    assert product(state, "credit")["status"] == "active"
    assert product(state, "payroll")["status"] == "coming"
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
    assert client.post("/api/workspace/products/credit/disable").status_code == 403


def test_switching_a_product_off_hides_it_everywhere_and_back_on_restores_it(client):
    sign_in(client, OWNER_EMAIL)
    assert client.post("/api/workspace/products/credit/disable").json() == {"disabled": ["ledger"]}
    state = shell(client)
    assert product(state, "credit")["status"] == "available"
    assert "ledger" not in nav_keys(state)
    # Its routes refuse, and the chat no longer offers it.
    assert client.get("/api/ledger/summary").status_code == 403
    reply = say(client, AHMED_PHONE, "hello")[-1]
    assert reply["body"] == "Thanks for your message. We will reply shortly."

    assert client.post("/api/workspace/products/credit/enable").json() == {"enabled": ["ledger"]}
    summary = client.get("/api/ledger/summary").json()
    assert summary["outstanding"] > 0  # the data was kept while it was off


def test_turning_off_bookings_closes_the_public_booking_page(client):
    sign_in(client, OWNER_EMAIL)
    client.post("/api/workspace/products/chat/disable")
    assert client.get(f"/api/book/{DEMO_SLUG}").status_code == 404
    assert client.get(f"/api/store/{DEMO_SLUG}").status_code == 404
    assert client.get("/api/inbox/conversations").status_code == 403
    client.post("/api/workspace/products/chat/enable")
    assert client.get(f"/api/book/{DEMO_SLUG}").status_code == 200


def test_a_coming_product_cannot_be_switched_on(client):
    assert client.post("/api/workspace/products/payroll/enable").status_code == 422
    assert client.post("/api/workspace/products/nothing/enable").status_code == 404


def test_the_setup_checklist_reflects_what_the_shop_has_done(client):
    steps = {s["key"]: s for s in product(shell(client), "chat")["steps"]}
    assert steps["services"]["done"] and steps["hours"]["done"] and steps["products"]["done"]
    assert steps["provider"]["done"] is False  # no payment provider can be connected yet
    owner_sql("update services set active = false")
    steps = {s["key"]: s for s in product(shell(client), "chat")["steps"]}
    assert steps["services"]["done"] is False


def test_the_home_dashboard_has_one_card_per_number_each_module_offers(client):
    say(client, AHMED_PHONE, "hello")
    cards = {c["key"]: c for c in client.get("/api/workspace/home").json()["cards"]}
    expected = {card.key for m in catalog.MODULES for card in m.cards}
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
    assert created.json()["modules"] == ["inbox", "bookings", "orders", "payments"]
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
    assert listed["zaitoon-grill-test"]["products"] == ["chat"]

    owner = client_factory()
    owner.post(
        "/api/auth/verify",
        json={"email": "owner@zaitoon.example", "code": code_for(owner, "owner@zaitoon.example")},
    )
    state = shell(owner)
    assert state["business"]["name"] == "Zaitoon Grill" and state["me"]["role"] == "owner"
    assert product(state, "chat")["status"] == "active"
    assert product(state, "credit")["status"] == "available"
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
