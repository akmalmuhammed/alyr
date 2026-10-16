"""The customer's tracking page for an order (ALY-73)."""

import re

from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID
from test_consent import ahmed, conversation, owner_sql, say
from test_inbox_team import user_id
from test_orders import place, product
from test_sign_in import sign_in

TRACK = re.compile(r"http://web\.test/t/([0-9a-f-]+)/([0-9a-f-]+)")


def an_order(client, payment="link"):
    response = place(client, ahmed(client)["id"], [(product(client, "Cable 2.5 mm"), 2)], payment)
    assert response.status_code == 200
    return response.json()


def track(client, order_id, tenant=DEMO_TENANT_ID):
    return client.get(f"/api/track/{tenant}/{order_id}")


def test_the_order_message_carries_a_link_to_the_customers_tracking_page(client):
    say(client, AHMED_PHONE, "hello")
    order = an_order(client)
    link = TRACK.search(conversation(client)[-1]["body"])
    assert link and link.group(2) == order["order_id"]
    assert order["track_url"].endswith(f"/t/{DEMO_TENANT_ID}/{order['order_id']}")


def test_the_tracking_page_shows_what_was_bought_and_where_it_has_got_to(client):
    order = an_order(client)
    page = track(client, order["order_id"]).json()
    assert page["shop"]["name"] == "Al Noor Electricals"
    seen = page["order"]
    assert seen["number"] == order["number"] and seen["status"] == "new"
    assert seen["items"][0]["quantity"] == 2 and seen["total_text"] == "QAR 450"
    assert [s["key"] for s in seen["steps"]] == ["placed", "confirmed", "ready", "done"]
    assert seen["steps"][0]["at"] and seen["steps"][1]["at"] is None
    # Not paid yet, so the page can offer the payment link.
    assert seen["payment_id"]
    assert seen["handler"] is None


def test_moving_the_order_shows_on_the_page_with_who_is_handling_it(client):
    say(client, AHMED_PHONE, "hello")
    order = an_order(client)
    order_id = order["order_id"]
    owner_sql("update orders set assigned_to = $1 where id = $2", user_id(AGENT_EMAIL), order_id)
    sign_in(client, AGENT_EMAIL)
    client.post(f"/api/orders/{order_id}/status", json={"status": "confirmed"})
    seen = track(client, order_id).json()["order"]
    assert seen["status"] == "confirmed" and seen["steps"][1]["at"]
    assert seen["handler"] == "Yusuf"
    # The status message links to the same page.
    assert TRACK.search(conversation(client)[-1]["body"]).group(2) == order_id


def test_paying_closes_the_payment_offer(client):
    order = an_order(client)
    payment = track(client, order["order_id"]).json()["order"]["payment_id"]
    assert client.post(f"/api/pay/{DEMO_TENANT_ID}/{payment}/complete").status_code == 200
    seen = track(client, order["order_id"]).json()["order"]
    assert seen["payment"] == "paid" and seen["payment_id"] is None and seen["paid_at"]


def test_an_unknown_order_or_the_wrong_shop_finds_nothing(client):
    order = an_order(client)
    missing = "00000000-0000-4000-8000-000000000000"
    assert track(client, missing).status_code == 404
    assert track(client, order["order_id"], tenant=missing).status_code == 404


def test_a_shop_without_orders_switched_on_has_no_tracking_page(client):
    order = an_order(client)
    owner_sql(
        "update tenant_modules set enabled = false where tenant_id = $1 and module_key = 'orders'",
        DEMO_TENANT_ID,
    )
    assert track(client, order["order_id"]).status_code == 404


def test_after_the_24_hour_window_the_approved_template_goes_without_the_link(client):
    an_order(client)
    last = conversation(client)[-1]
    assert last["kind"] == "template" and not TRACK.search(last["body"])
