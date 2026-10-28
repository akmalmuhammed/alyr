"""Self-serve onboarding: sign-up, the business and its starting setup, the test line (D-031)."""

import asyncio
from datetime import date, timedelta
from uuid import uuid4

import asyncpg
import pytest

from alyr.seed import AGENT_EMAIL, OWNER_EMAIL
from conftest import APP_DSN
from test_consent import owner_sql

BASE = "/api/onboarding"


def code(client, email):
    answer = client.post(f"{BASE}/code", json={"email": email})
    assert answer.status_code == 200, answer.text
    return answer.json()["dev_code"]


def signup_token(client, email):
    answer = client.post(f"{BASE}/verify", json={"email": email, "code": code(client, email)})
    assert answer.status_code == 200, answer.text
    assert answer.json()["status"] == "new"
    return answer.json()["signup_token"]


def new_business(client, name=None, kind="salon", paid=True):
    """Each test makes its own business; the database is shared by the whole run. Its
    payment is settled, as once the client has paid (D-053); `paid=False` leaves it owing,
    as for a client who has just signed up. The workspace is open either way."""
    email = f"owner-{uuid4().hex[:8]}@shop.example"
    name = name or f"Barbers {uuid4().hex[:6]}"
    body = {"signup_token": signup_token(client, email), "owner_name": "Hamad", "name": name,
            "name_ar": "حلاق السد", "type": kind, "area": "Al Sadd"}
    answer = client.post(f"{BASE}/business", json=body)
    assert answer.status_code == 200, answer.text
    slug = client.get(f"{BASE}/state").json()["business"]["slug"]
    if paid:
        owner_sql(
            "update clients set payment_waived_at = now(), access_note = 'Test: paid' "
            "where id = (select client_id from tenants where id = $1)",
            answer.json()["created"],
        )
    return answer.json()["created"], slug, name


def book_from_test_line(client, slug, days_ahead=2):
    """Ask for the booking link on the test line, then book through the public page."""
    answer = client.post(f"{BASE}/test-chat", json={"reply_id": "book"}).json()
    link = answer["messages"][-1]["body"]
    token = link.split("?t=")[1].strip()
    page = client.get(f"/api/book/{slug}", headers={"x-order-link": token}).json()
    assert page["customer"] is not None and page["link"]["state"] == "ok"
    service_id = page["services"][0]["id"]
    day = date.today() + timedelta(days=days_ahead)
    if day.weekday() == 4:
        day += timedelta(days=1)
    times = client.get(
        f"/api/book/{slug}/times", params={"service_id": service_id, "day": day.isoformat()}
    ).json()["times"]
    return client.post(
        f"/api/book/{slug}",
        json={"token": token, "service_id": service_id, "starts_at": times[0]},
    )


def reminder_jobs(tenant):
    rows = owner_sql(
        "select count(*) as n from jobs where kind = 'booking_reminder' and tenant_id = $1",
        tenant,
    )
    return rows[0]["n"]


def test_the_types_list_offers_every_trade_with_its_way_of_working(client):
    types = {t["key"]: t for t in client.get(f"{BASE}/types").json()["types"]}
    assert types["salon"]["way"] == "appointments"
    assert types["restaurant"]["way"] == "assisted"
    assert types["salon"]["name"]["ar"] == "صالون وحلاقة"


def test_a_new_owner_creates_a_salon_with_its_starting_setup(client):
    _, slug, _ = new_business(client, name="Al Sadd Barbers")
    state = client.get(f"{BASE}/state").json()
    assert state["business"]["name"] == "Al Sadd Barbers"
    assert slug.startswith("al-sadd-barbers")
    assert state["owner"]["name"] == "Hamad"
    assert (state["way"], state["step"], state["finished"]) == ("appointments", "services", False)
    assert [s["name"] for s in state["services"]][:2] == ["Haircut", "Beard trim & shape"]
    assert state["services"][0]["price_text"] == "QAR 60"
    assert {"weekday": 5, "opens": "14:00", "closes": "22:00"} in state["hours"]
    me = client.get("/api/auth/me").json()
    assert (me["signed_in"], me["role"]) == (True, "owner")
    # The Catalog is on for new shops (ALY-113): an appointment business gets it as an optional
    # extra beside its bookings.
    assert set(client.get("/api/workspace").json()["modules"]) == {
        "inbox", "bookings", "payments", "catalog",
    }


def test_the_same_name_twice_gets_its_own_address(client):
    _, first, _ = new_business(client, name="Twin Cuts")
    _, second, _ = new_business(client, name="Twin Cuts")
    assert (first, second) == ("twin-cuts", "twin-cuts-2")


def test_an_arabic_only_name_still_gets_an_address(client):
    _, slug, _ = new_business(client, name="صالون الدوحة")
    assert slug.startswith("shop")


def test_an_existing_owner_is_signed_in_instead(client):
    answer = client.post(
        f"{BASE}/verify", json={"email": OWNER_EMAIL, "code": code(client, OWNER_EMAIL)}
    )
    assert answer.json() == {"status": "signed_in"}
    assert client.get("/api/auth/me").json()["email"] == OWNER_EMAIL


def test_a_sign_up_token_works_once(client):
    token = signup_token(client, f"once-{uuid4().hex[:6]}@shop.example")
    body = {"signup_token": token, "owner_name": "A", "name": "Once", "type": "salon"}
    assert client.post(f"{BASE}/business", json=body).status_code == 200
    assert client.post(f"{BASE}/business", json={**body, "name": "Twice"}).status_code == 401


def test_an_invented_token_creates_nothing(client):
    before = owner_sql("select count(*) as n from tenants")[0]["n"]
    body = {"signup_token": "x" * 40, "owner_name": "A", "name": "Fake", "type": "salon"}
    assert client.post(f"{BASE}/business", json=body).status_code == 401
    assert owner_sql("select count(*) as n from tenants")[0]["n"] == before


def test_a_wrong_code_is_refused(client):
    code(client, "wrong@shop.example")
    answer = client.post(f"{BASE}/verify", json={"email": "wrong@shop.example", "code": "000000"})
    assert answer.status_code == 401


def test_when_sign_up_is_closed_new_addresses_get_nothing(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_SIGNUP_OPEN", "false")
    client = client_factory()
    answer = client.post(f"{BASE}/code", json={"email": "closed@shop.example"}).json()
    assert answer["dev_code"] is None
    # Existing staff can still use it to sign in.
    assert code(client, AGENT_EMAIL)
    body = {"signup_token": "y" * 40, "owner_name": "A", "name": "Closed", "type": "salon"}
    assert client.post(f"{BASE}/business", json=body).status_code == 403


def test_sign_up_is_closed_outside_a_local_machine_unless_switched_on(monkeypatch):
    from alyr.config import get_settings
    from alyr.routes.onboarding import signup_open

    monkeypatch.setenv("ALYR_ENV", "staging")
    monkeypatch.delenv("ALYR_SIGNUP_OPEN", raising=False)
    get_settings.cache_clear()
    assert signup_open() is False
    monkeypatch.setenv("ALYR_SIGNUP_OPEN", "true")
    get_settings.cache_clear()
    assert signup_open() is True
    get_settings.cache_clear()


def test_an_unknown_type_is_refused(client):
    body = {"signup_token": signup_token(client, f"odd-{uuid4().hex[:6]}@shop.example"),
            "owner_name": "A", "name": "Odd", "type": "zoo"}
    assert client.post(f"{BASE}/business", json=body).status_code == 422


def test_the_owner_edits_services_and_moves_through_the_steps(client):
    new_business(client)
    first = client.get(f"{BASE}/state").json()["services"][0]
    changed = client.patch(
        f"/api/services/{first['id']}", json={"price": 7000, "name": "Classic cut"}
    )
    assert changed.status_code == 200
    state = client.get(f"{BASE}/state").json()
    assert (state["services"][0]["name"], state["services"][0]["price_text"]) == (
        "Classic cut", "QAR 70",
    )
    moved = client.patch(f"{BASE}/state", json={"step": "hours", "area": "West Bay"}).json()
    assert (moved["step"], moved["business"]["area"]) == ("hours", "West Bay")
    assert client.patch(f"{BASE}/state", json={"step": "nowhere"}).status_code == 422


def test_finishing_marks_the_business_onboarded(client):
    new_business(client)
    assert client.post(f"{BASE}/finish").status_code == 200
    state = client.get(f"{BASE}/state").json()
    assert (state["finished"], state["step"]) == (True, "")


def test_an_agent_cannot_change_the_setup(client):
    signed_in = client.post(
        "/api/auth/verify", json={"email": AGENT_EMAIL, "code": code(client, AGENT_EMAIL)}
    )
    assert signed_in.status_code == 200
    assert client.patch(f"{BASE}/state", json={"step": "hours"}).status_code == 403


def test_the_test_line_answers_like_a_customer_would_see_it(client):
    _, slug, name = new_business(client)
    hello = client.post(f"{BASE}/test-chat", json={"text": "hello"}).json()["messages"]
    assert hello[0]["direction"] == "in"
    menu = hello[-1]
    assert menu["body"] == f"Welcome to {name}. How can we help?"
    assert [c["title"] for c in menu["payload"]["choices"]] == [
        "Book a visit", "My booking", "Prices",
    ]
    prices = client.post(f"{BASE}/test-chat", json={"reply_id": "prices"}).json()["messages"][-1]
    assert "Haircut: QAR 60 (45 min)" in prices["body"]
    link = client.post(f"{BASE}/test-chat", json={"reply_id": "book"}).json()["messages"][-1]
    assert f"/b/{slug}?t=" in link["body"] and "?c=" not in link["body"]


def test_a_test_booking_goes_through_the_real_booking_page(client):
    tenant, slug, name = new_business(client)
    assert book_from_test_line(client, slug).status_code == 200
    last = client.get(f"{BASE}/test-chat").json()["messages"][-1]
    assert f"confirmed at {name}" in last["body"]
    assert reminder_jobs(tenant) == 1


def test_a_customer_who_writes_in_arabic_gets_the_confirmation_in_arabic(client):
    _, slug, _ = new_business(client)
    greeting = client.post(f"{BASE}/test-chat", json={"text": "مرحبا"}).json()["messages"][-1]
    assert greeting["body"].startswith("أهلاً بك في حلاق السد")
    assert book_from_test_line(client, slug).status_code == 200
    last = client.get(f"{BASE}/test-chat").json()["messages"][-1]
    assert last["body"].startswith("تم تأكيد حجزك") and "قص شعر" in last["body"]


def test_finishing_clears_the_test_so_the_workspace_starts_clean(client):
    tenant, slug, _ = new_business(client)
    client.post(f"{BASE}/test-chat", json={"text": "hello"})
    assert book_from_test_line(client, slug).status_code == 200
    unanswered = {c["key"]: c for c in client.get("/api/workspace/home").json()["cards"]}
    assert unanswered["unanswered"]["value"] == 1

    assert client.post(f"{BASE}/finish").json() == {"finished": True, "test_bookings_cancelled": 1}
    cards = {c["key"]: c for c in client.get("/api/workspace/home").json()["cards"]}
    assert cards["unanswered"]["value"] == 0
    statuses = owner_sql("select status from bookings where tenant_id = $1", tenant)
    assert [r["status"] for r in statuses] == ["cancelled"]
    # The history is kept: the test chat is still there to look back at.
    assert client.get(f"{BASE}/test-chat").json()["messages"]


def test_reminders_can_be_switched_off(client):
    tenant, slug, _ = new_business(client)
    client.patch(f"{BASE}/state", json={"reminders": False})
    assert client.get(f"{BASE}/state").json()["business"]["reminders"] is False
    assert book_from_test_line(client, slug, days_ahead=3).status_code == 200
    assert reminder_jobs(tenant) == 0


def test_a_business_whose_screens_are_not_built_gets_a_person_to_help(client):
    tenant, _, _ = new_business(client, kind="restaurant")
    state = client.get(f"{BASE}/state").json()
    assert (state["way"], state["steps"][0], state["services"]) == ("assisted", "assisted", [])
    assert set(client.get("/api/workspace").json()["modules"]) == {
        "inbox", "orders", "payments", "catalog",
    }
    asked = owner_sql(
        "select product_key, step_key from setup_requests where tenant_id = $1", tenant
    )
    assert [(r["product_key"], r["step_key"]) for r in asked] == [("chat", "onboarding")]


def test_a_new_business_sees_none_of_another_businesss_data(client):
    new_business(client)
    # A salon has no credit accounts switched on, so that screen is refused outright.
    assert client.get("/api/ledger/summary").status_code == 403
    assert client.get("/api/bookings").json()["bookings"] == []
    assert client.get("/api/inbox/conversations").json()["conversations"] == []
    assert [m["name"] for m in client.get("/api/team").json()["members"]] == ["Hamad"]


def test_the_app_role_still_cannot_create_or_rename_businesses_directly():
    async def attempt():
        conn = await asyncpg.connect(APP_DSN)
        try:
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await conn.execute("insert into tenants (name) values ('Rogue')")
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await conn.execute("update tenants set name = 'Renamed'")
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await conn.execute("select update_own_business('x', null, null, null, null, false)")
        finally:
            await conn.close()

    asyncio.run(attempt())


def test_with_the_catalog_switched_off_for_new_shops_a_business_is_made_as_it_was_before(
    client_factory, monkeypatch
):
    """`ALYR_CATALOG_FOR_NEW_SHOPS=false` is still honoured (ALY-113): the setting stays so the
    Catalog can be turned off for new businesses without a change of code."""
    monkeypatch.setenv("ALYR_CATALOG_FOR_NEW_SHOPS", "false")
    off = client_factory()
    new_business(off, kind="salon")
    assert set(off.get("/api/workspace").json()["modules"]) == {"inbox", "bookings", "payments"}
    assert off.get(f"{BASE}/state").json()["catalog"] is None
    new_business(off, kind="restaurant")
    assert set(off.get("/api/workspace").json()["modules"]) == {"inbox", "orders", "payments"}
    assert off.get(f"{BASE}/state").json()["catalog"] is None
