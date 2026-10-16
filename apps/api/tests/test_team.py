"""Who is handling what, what each person did, and the team's numbers (D-028)."""

import asyncio

import asyncpg
import pytest

from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID, OWNER_EMAIL
from conftest import APP_DSN
from test_bookings import book
from test_consent import ahmed, owner_sql, say
from test_inbox_team import user_id
from test_orders import place, product
from test_sign_in import other_shop_with_owner, sign_in

INBOX = "/api/inbox/conversations"
BILAL_PHONE = "97455500002"


def thread(client, contact_id):
    return client.get(f"{INBOX}/{contact_id}").json()


def actions(client, contact_id):
    return [
        (a["subject"], a["action"], a["actor_name"]) for a in thread(client, contact_id)["activity"]
    ]


def contact_of(client, phone):
    rows = client.get(f"{INBOX}?status=all").json()["conversations"]
    return next(r["id"] for r in rows if r["phone"] == phone)


def backdate_last_customer_message(contact_id, minutes):
    owner_sql(
        "update messages set created_at = now() - make_interval(mins => $2) "
        "where id = (select id from messages where contact_id = $1 and direction = 'in' "
        "            order by created_at desc limit 1)",
        contact_id,
        minutes,
    )


def performance(client, days=1):
    response = client.get("/api/team/performance", params={"days": days})
    assert response.status_code == 200
    return response.json()


def person(report, name):
    return next(p for p in report["people"] if p["name"] == name)


def an_order(client, contact_id):
    response = place(client, contact_id, [(product(client, "Cable 2.5 mm"), 2)], "link")
    assert response.status_code == 200
    return response.json()


def test_closing_records_how_it_ended_and_who_closed_it(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    sign_in(client, AGENT_EMAIL)
    client.post(f"{INBOX}/{contact_id}/reply", json={"text": "Which size do you need?"})
    closed = client.post(
        f"{INBOX}/{contact_id}/status",
        json={"status": "closed", "outcome": "lost", "reason": "price"},
    )
    assert closed.status_code == 200
    client.post(f"{INBOX}/{contact_id}/status", json={"status": "open"})

    activity = thread(client, contact_id)["activity"]
    assert [(a["action"], a["actor_name"]) for a in activity] == [
        ("took", "Yusuf Rahman"),
        ("closed", "Yusuf Rahman"),
        ("reopened", "Yusuf Rahman"),
    ]
    assert activity[1]["detail"] == {"outcome": "lost", "reason": "price"}


def test_an_outcome_must_come_from_the_list_and_a_reason_only_for_lost(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    for body in (
        {"status": "closed", "outcome": "maybe"},
        {"status": "closed", "outcome": "sold", "reason": "price"},
        {"status": "closed", "outcome": "lost", "reason": "bad mood"},
    ):
        assert client.post(f"{INBOX}/{contact_id}/status", json=body).status_code == 422
    # Closing without saying how it ended still works, for the assistant and old screens.
    assert client.post(f"{INBOX}/{contact_id}/status", json={"status": "closed"}).status_code == 200


def test_an_order_goes_to_whoever_looks_after_the_customer(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    yusuf = user_id(AGENT_EMAIL)
    client.post(f"{INBOX}/{contact_id}/assign", json={"user_id": yusuf})
    an_order(client, contact_id)
    order = client.get("/api/orders").json()["orders"][0]
    assert order["assigned"] == {"id": yusuf, "name": "Yusuf Rahman"}
    assert ("order", "placed", "Customer") in actions(client, contact_id)


def test_moving_an_order_nobody_has_makes_you_responsible(client):
    contact_id = ahmed(client)["id"]
    an_order(client, contact_id)
    order = client.get("/api/orders").json()["orders"][0]
    assert order["assigned"] is None
    me = sign_in(client, AGENT_EMAIL)
    client.post(f"/api/orders/{order['id']}/status", json={"status": "confirmed"})
    order = client.get("/api/orders").json()["orders"][0]
    assert order["assigned"]["id"] == me["id"]
    assert actions(client, contact_id)[-2:] == [
        ("order", "took", "Yusuf Rahman"),
        ("order", "confirmed", "Yusuf Rahman"),
    ]


def test_a_booking_follows_the_customer_and_marking_it_is_recorded(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    fatima = user_id(OWNER_EMAIL)
    client.post(f"{INBOX}/{contact_id}/assign", json={"user_id": fatima})
    booked = book(client)
    assert booked.status_code == 200
    row = client.get("/api/bookings").json()["bookings"][0]
    assert row["assigned"]["name"] == "Fatima Al-Noor"
    sign_in(client, AGENT_EMAIL)
    client.post(f"/api/bookings/{row['id']}/cancel")
    assert actions(client, contact_id)[-2:] == [
        ("booking", "booked", "Customer"),
        ("booking", "cancelled", "Yusuf Rahman"),
    ]


def test_orders_bookings_and_accounts_can_be_given_to_someone_on_the_team(client):
    contact_id = ahmed(client)["id"]
    an_order(client, contact_id)
    order_id = client.get("/api/orders").json()["orders"][0]["id"]
    booking_id = book(client).json()["id"]
    yusuf = user_id(AGENT_EMAIL)

    assert client.post(f"/api/orders/{order_id}/assign", json={"user_id": yusuf}).status_code == 200
    assert (
        client.post(f"/api/bookings/{booking_id}/assign", json={"user_id": yusuf}).status_code
        == 200
    )
    given = client.post(f"/api/ledger/customers/{contact_id}/assign", json={"user_id": yusuf})
    assert given.status_code == 200
    assert ahmed(client)["assigned"]["name"] == "Yusuf Rahman"
    assert client.get("/api/bookings").json()["bookings"][0]["assigned"]["id"] == yusuf

    assigned = [a for a in thread(client, contact_id)["activity"] if a["action"] == "assigned"]
    assert {a["subject"] for a in assigned} == {"order", "booking", "account"}
    assert assigned[0]["detail"] == {"to": "Yusuf Rahman"}

    # Taking it back from someone records who had it.
    client.post(f"/api/orders/{order_id}/assign", json={"user_id": None})
    last = thread(client, contact_id)["activity"][-1]
    assert last["detail"] == {"from": "Yusuf Rahman"}


def test_nothing_can_be_given_to_someone_outside_the_shop_or_to_a_missing_item(client):
    contact_id = ahmed(client)["id"]
    an_order(client, contact_id)
    order_id = client.get("/api/orders").json()["orders"][0]["id"]
    other_shop_with_owner("someone@elsewhere.example")
    outsider = str(
        owner_sql("select id from users where email = 'someone@elsewhere.example'")[0]["id"]
    )
    assert (
        client.post(f"/api/orders/{order_id}/assign", json={"user_id": outsider}).status_code == 422
    )
    missing = "00000000-0000-4000-8000-000000000000"
    assert client.post(f"/api/orders/{missing}/assign", json={"user_id": None}).status_code == 404
    assert (
        client.post(f"/api/ledger/customers/{missing}/assign", json={"user_id": None}).status_code
        == 404
    )


def test_the_team_report_counts_each_persons_work(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    sign_in(client, AGENT_EMAIL)
    client.post(f"{INBOX}/{contact_id}/reply", json={"text": "Hello, how can I help?"})
    # Ten minutes later (the assistant is quiet now) the customer asks again and waits
    # five minutes for the answer.
    owner_sql(
        "update messages set created_at = created_at - interval '10 minutes' where contact_id = $1",
        contact_id,
    )
    say(client, AHMED_PHONE, "Do you have 2.5 mm cable?")
    backdate_last_customer_message(contact_id, 5)
    client.post(f"{INBOX}/{contact_id}/reply", json={"text": "Yes, 100 m rolls."})
    an_order(client, contact_id)
    client.post(f"{INBOX}/{contact_id}/status", json={"status": "closed", "outcome": "sold"})

    # Someone nobody has answered for twenty minutes.
    say(client, BILAL_PHONE, "hello")
    bilal = contact_of(client, BILAL_PHONE)
    client.post(f"{INBOX}/{bilal}/assistant", json={"paused": True})
    say(client, BILAL_PHONE, "Is anyone there?")
    owner_sql(
        "update messages set created_at = created_at - interval '20 minutes' where contact_id = $1",
        bilal,
    )

    sign_in(client, OWNER_EMAIL)
    report = performance(client)
    yusuf = person(report, "Yusuf Rahman")
    assert yusuf["replies"] == 2
    assert 290 <= yusuf["median_reply_seconds"] <= 320
    assert yusuf["closed"] == {"sold": 1}
    assert yusuf["orders"] == 1 and yusuf["sales_text"] == "QAR 450"
    assert yusuf["open"] == 0

    assert report["unassigned"]["waiting"] == 1
    assert report["unassigned"]["oldest_wait_minutes"] >= 19
    assert report["totals"]["waiting"] == 1
    assert report["totals"]["sold"] == 1
    assert report["can_see_everyone"] is True
    assert person(report, "Fatima Al-Noor")["replies"] == 0


def test_an_agent_sees_only_their_own_numbers(client):
    me = sign_in(client, AGENT_EMAIL)
    report = performance(client, days=7)
    assert report["can_see_everyone"] is False
    assert [p["id"] for p in report["people"]] == [me["id"]]


def test_the_report_period_is_today_a_week_or_a_month(client):
    assert client.get("/api/team/performance", params={"days": 3}).status_code == 422
    assert performance(client, 30)["days"] == 30


def test_a_shop_can_sign_replies_with_the_senders_first_name(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    sign_in(client, AGENT_EMAIL)
    refused = client.put("/api/team/settings", json={"sign_replies": True})
    assert refused.status_code == 403

    sign_in(client, OWNER_EMAIL)
    assert client.put("/api/team/settings", json={"sign_replies": True}).status_code == 200
    assert client.get("/api/team/settings").json() == {"sign_replies": True}
    sign_in(client, AGENT_EMAIL)
    client.post(f"{INBOX}/{contact_id}/reply", json={"text": "Your order is ready."})
    sent = [m for m in thread(client, contact_id)["messages"] if m["direction"] == "out"][-1]
    assert sent["body"] == "Your order is ready.\n\n— Yusuf"


def test_the_record_cannot_be_rewritten_by_the_app(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    client.post(f"{INBOX}/{contact_id}/status", json={"status": "closed", "outcome": "answered"})

    async def tamper(sql):
        conn = await asyncpg.connect(APP_DSN)
        try:
            async with conn.transaction():
                await conn.execute(
                    "select set_config('app.tenant_id', $1, true)", str(DEMO_TENANT_ID)
                )
                await conn.execute(sql)
        finally:
            await conn.close()

    for sql in ("update activity set actor_name = 'Someone else'", "delete from activity"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            asyncio.run(tamper(sql))


def test_a_customer_writing_again_reopens_the_conversation_on_the_record(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    client.post(f"{INBOX}/{contact_id}/status", json={"status": "closed", "outcome": "sold"})
    say(client, AHMED_PHONE, "One more thing")
    assert thread(client, contact_id)["customer"]["status"] == "open"
    assert actions(client, contact_id)[-1] == ("conversation", "reopened", "Customer")
