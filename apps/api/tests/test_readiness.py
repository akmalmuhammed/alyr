"""The onboarding engine (ALY-165, D-049): one readiness check for /start, the workspace and
the back office; who owns each step; the stages; and the record behind the funnel."""

import asyncio

import asyncpg
import pytest

from alyr.db import Database
from alyr.seed import AGENT_EMAIL
from conftest import APP_DSN
from test_consent import owner_sql
from test_onboarding import BASE, book_from_test_line, new_business
from test_pricing import ADMIN, client_of, open_quote
from test_sign_in import sign_in


@pytest.fixture
def office(client_factory):
    return client_factory()


def check(client):
    answer = client.get(f"{BASE}/readiness")
    assert answer.status_code == 200, answer.text
    return answer.json()


def line(state, key):
    return next(c for c in state["checks"] if c["key"] == key)


def step(client, key, **body):
    return client.patch(f"{BASE}/steps/{key}", json=body)


def events(tenant, step_key=None):
    rows = owner_sql(
        "select step_key, event, by_alyr from onboarding_events where tenant_id = $1 "
        "and ($2::text is null or step_key = $2) order by id",
        tenant, step_key,
    )
    return [(r["step_key"], r["event"], r["by_alyr"]) for r in rows]


def accept_price(client, office, name):
    quote = open_quote(client_of(office, name))
    assert office.post(f"{ADMIN}/quotes/{quote['id']}/publish").status_code == 200
    assert client.post(f"{BASE}/quote/accept", json={"quote_id": quote["id"]}).status_code == 200


def connect_whatsapp(tenant, slug):
    owner_sql(
        "insert into channel_numbers (number_id, tenant_id, channel) values ($1, $2, 'meta')",
        f"meta-{slug}", tenant,
    )


def board(office):
    answer = office.get(f"{ADMIN}/onboarding")
    assert answer.status_code == 200, answer.text
    return answer.json()


def on_board(office, tenant):
    return next(b for b in board(office)["businesses"] if b["id"] == tenant)


def test_a_new_salon_starts_setting_up_with_what_is_left_in_plain_words(client):
    tenant, _, _ = new_business(client)
    state = check(client)
    assert state["stage"] == "setting_up" and state["live_at"] is None
    assert [c["key"] for c in state["checks"]] == [
        "content", "hours", "test", "price", "payments", "whatsapp",
    ]
    # The salon's starting services and hours count; the rest is the owner's to do.
    assert {c["key"]: c["status"] for c in state["checks"]} == {
        "content": "done", "hours": "done", "test": "todo", "price": "todo",
        "payments": "todo", "whatsapp": "todo",
    }
    assert state["left"] == ["test", "price", "payments", "whatsapp"]
    assert line(state, "whatsapp")["choices"] == [
        "alyr_number", "new_number", "move_number", "own_account",
    ]
    assert line(state, "test")["todo"]["ar"]
    # Seen done once, recorded once, however often the check runs.
    check(client)
    assert events(tenant) == [("content", "done", False), ("hours", "done", False)]


def test_a_business_without_bookings_or_orders_skips_what_does_not_apply(client):
    new_business(client, kind="travel")
    keys = [c["key"] for c in check(client)["checks"]]
    assert "hours" not in keys and "test" not in keys
    assert {"price", "payments", "whatsapp"} <= set(keys)


def test_ready_when_only_whatsapp_is_left_then_live_once_it_is_connected(client, office):
    tenant, slug, name = new_business(client)
    assert book_from_test_line(client, slug).status_code == 200
    accept_price(client, office, name)
    assert step(client, "payments", choice="cash_transfer").status_code == 200

    # The owner chose a new number; it waits on ALYR and Meta, and the business is ready.
    state = step(client, "whatsapp", choice="new_number").json()
    assert line(state, "whatsapp")["status"] == "waiting"
    assert (state["stage"], state["left"]) == ("ready", ["whatsapp"])
    assert state["ready_at"] and not state["live_at"]
    assert on_board(office, tenant)["stage"] == "ready"

    connect_whatsapp(tenant, slug)
    live = check(client)
    assert live["stage"] == "live" and live["live_at"] and live["left"] == []
    assert [e for e in events(tenant) if e[1] in ("ready", "live")] == [
        ("", "ready", False), ("", "live", False),
    ]

    # Live starts the money-back clock, so it is kept even if something comes undone.
    owner_sql("update services set active = false where tenant_id = $1", tenant)
    later = check(client)
    assert later["stage"] == "live" and later["live_at"] == live["live_at"]
    assert line(later, "content")["status"] == "todo"
    assert ("content", "undone", False) in events(tenant, "content")


def test_online_payments_wait_until_the_shops_own_account_is_connected(client):
    new_business(client)
    state = step(client, "payments", choice="online").json()
    assert line(state, "payments")["status"] == "waiting"
    state = step(client, "payments", choice="cash_transfer").json()
    assert line(state, "payments")["status"] == "done"


def test_the_owner_hands_a_step_to_alyr_and_alyr_sees_what_it_owes(client, office):
    tenant, _, name = new_business(client)
    state = step(client, "whatsapp", owner="alyr").json()
    assert line(state, "whatsapp")["owner"] == "alyr" and line(state, "whatsapp")["asked"]

    row = on_board(office, tenant)
    assert row["alyr_owes"] == ["whatsapp"] and row["stage"] == "setting_up"
    owed = [i for i in office.get(f"{ADMIN}/today").json()["items"] if i["kind"] == "owe"]
    assert any(i["business_id"] == tenant and "whatsapp" in i["title"] for i in owed)

    # ALYR writes what holds it up; the owner sees it on their own list.
    answer = office.patch(
        f"{ADMIN}/businesses/{tenant}/steps/whatsapp",
        json={"blocker": "Waiting for Meta to approve ALYR as a Tech Provider"},
    )
    assert answer.status_code == 200, answer.text
    assert line(check(client), "whatsapp")["blocker"].startswith("Waiting for Meta")
    assert on_board(office, tenant)["blockers"] == {
        "whatsapp": "Waiting for Meta to approve ALYR as a Tech Provider",
    }
    assert ("whatsapp", "blocked", True) in events(tenant, "whatsapp")
    audit = office.get(f"{ADMIN}/audit").json()["entries"][0]
    assert (audit["action"], audit["business_id"]) == ("onboarding.step", tenant)
    assert audit["detail"]["step"] == "whatsapp"

    # And hands it back; the record keeps both.
    office.patch(f"{ADMIN}/businesses/{tenant}/steps/whatsapp", json={"owner": "client"})
    assert line(check(client), "whatsapp")["owner"] == "client"
    owners = [e for e in events(tenant, "whatsapp") if e[1] == "owner"]
    assert owners == [("whatsapp", "owner", False), ("whatsapp", "owner", True)]
    assert client_of(office, name)  # the client is still listed with its business


def test_asking_alyr_from_the_workspace_hands_the_step_over(client):
    new_business(client)
    answer = client.post(
        "/api/workspace/setup-requests", json={"product": "bookings", "step": "whatsapp"}
    )
    assert answer.status_code == 200, answer.text
    assert line(check(client), "whatsapp")["owner"] == "alyr"


def test_alyr_can_check_one_business_as_its_owner_would_see_it(client, office):
    tenant, _, _ = new_business(client)
    state = office.get(f"{ADMIN}/businesses/{tenant}/readiness").json()
    assert state["stage"] == "setting_up" and state["left"]
    assert office.get(
        f"{ADMIN}/businesses/00000000-0000-0000-0000-000000000000/readiness"
    ).status_code == 404


def test_wrong_steps_and_choices_are_refused(client):
    new_business(client)
    assert step(client, "nonsense", owner="alyr").status_code == 404
    assert step(client, "whatsapp", choice="whatsapp_web").status_code == 422
    assert step(client, "whatsapp", owner="someone").status_code == 422
    assert step(client, "hours", choice="anything").status_code == 422


def test_only_the_owner_changes_steps(client_factory):
    agent = client_factory()
    sign_in(agent, AGENT_EMAIL)
    assert step(agent, "whatsapp", owner="alyr").status_code == 403
    assert agent.get(f"{BASE}/readiness").status_code == 200


def test_only_alyr_staff_see_the_board(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    stranger = client_factory()
    assert stranger.get(f"{ADMIN}/onboarding").status_code == 401


def test_the_record_is_append_only_and_kept_per_business(client):
    tenant, _, _ = new_business(client)
    check(client)

    async def tamper():
        db = Database(APP_DSN)
        await db.connect()
        try:
            for sql in ("update onboarding_events set event = 'live'",
                        "delete from onboarding_events"):
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    async with db.tenant(tenant) as conn:
                        await conn.execute(sql)
            async with db.unscoped() as conn:
                assert await conn.fetchval("select count(*) from onboarding_events") == 0
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await conn.execute("select * from admin_onboarding()")
                # Stages are written for the business in scope only, never another.
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await conn.fetchval("select record_own_stage('live')")
        finally:
            await db.close()

    asyncio.run(tamper())
