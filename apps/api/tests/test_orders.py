"""Order link (D-016): a customer orders from the shop's page and pays or puts it on account."""

import re

from alyr.seed import AHMED_PHONE, DEMO_SLUG
from order_links import token

STORE = f"/api/store/{DEMO_SLUG}"


def say(client, phone, text="", reply_id=""):
    response = client.post(
        "/sim/messages", json={"from_number": phone, "text": text, "reply_id": reply_id}
    )
    assert response.status_code == 200
    return response.json()["messages"]


def customer(client, phone=AHMED_PHONE):
    people = client.get("/api/ledger/summary").json()["customers"]
    return next(c for c in people if c["phone"] == phone)


def product(client, name):
    products = client.get(STORE).json()["products"]
    return next(p for p in products if p["name"].startswith(name))


def place(client, contact_id, lines, payment):
    return client.post(
        f"{STORE}/orders",
        json={
            "token": token(contact_id),
            "items": [{"product_id": p["id"], "quantity": q} for p, q in lines],
            "payment": payment,
        },
    )


def test_order_page_shows_the_shop_and_its_products(client):
    page = client.get(STORE).json()
    assert page["shop"]["name"] == "Al Noor Electricals"
    assert len(page["products"]) == 12
    assert page["customer"] is None
    assert product(client, "Cable 2.5 mm")["price_text"] == "QAR 225"


def test_unknown_shop_is_not_found(client):
    assert client.get("/api/store/no-such-shop").status_code == 404


def test_customer_who_asks_to_order_gets_their_own_link(client):
    reply = say(client, AHMED_PHONE, "I want to order")[-1]
    link = re.search(r"http://web\.test/s/al-noor\?t=(\S+)", reply["body"])
    # The link carries a signed token, never the contact's ID.
    assert customer(client)["id"] not in reply["body"]
    page = client.get(STORE, params={"t": link.group(1)}).json()
    assert page["customer"]["name"] == "Ahmed Al-Kuwari"
    assert page["customer"]["can_use_account"] is True
    assert page["link"]["state"] == "ok"


def test_arabic_request_gets_an_arabic_reply(client):
    assert "اختر طلبك" in say(client, AHMED_PHONE, "أبي أطلب")[-1]["body"]


def test_order_paid_by_link_is_marked_paid_and_leaves_the_ledger_alone(client):
    ahmed = customer(client)
    cable, breaker = product(client, "Cable 2.5 mm"), product(client, "Breaker 16 A")
    order = place(client, ahmed["id"], [(cable, 2), (breaker, 10)], "link").json()
    assert order["total_text"] == "QAR 630"
    assert order["number"] == 1001

    summary = client.get(f"/sim/conversations/{AHMED_PHONE}").json()["messages"][-1]
    # The customer has not written, so this is the approved template: items on one line.
    assert "Order 1001 received: 2 x Cable 2.5 mm, 100 m roll, 10 x Breaker" in summary["body"]
    assert "The total is QAR 630." in summary["body"]
    assert order["pay_url"] in summary["body"]

    tenant_id, payment_id = re.search(r"/pay/(\S+)/(\S+)", order["pay_url"]).groups()
    assert client.get(f"/api/pay/{tenant_id}/{payment_id}").json()["order_number"] == 1001
    assert client.post(f"/api/pay/{tenant_id}/{payment_id}/complete").json() == {"status": "paid"}

    listed = client.get("/api/orders").json()["orders"][0]
    assert (listed["number"], listed["payment"], listed["customer"]) == (
        1001, "paid", "Ahmed Al-Kuwari",
    )
    confirmation = client.get(f"/sim/conversations/{AHMED_PHONE}").json()["messages"][-1]
    assert "received QAR 630 for order 1001" in confirmation["body"]
    assert customer(client)["balance_text"] == "QAR 1,850"
    assert client.get("/api/ledger/summary").json()["collected_by_link"] == 0


def test_order_on_account_raises_the_ledger_balance(client):
    ahmed = customer(client)
    order = place(client, ahmed["id"], [(product(client, "LED panel"), 4)], "account").json()
    assert order["pay_url"] is None
    assert customer(client)["balance_text"] == "QAR 2,030"
    message = client.get(f"/sim/conversations/{AHMED_PHONE}").json()["messages"][-1]
    assert "is on your account, and your balance is now QAR 2,030." in message["body"]
    assert client.get("/api/orders").json()["orders"][0]["payment"] == "on_account"


def test_order_on_account_is_refused_over_the_credit_limit(client):
    ahmed = customer(client)
    response = place(client, ahmed["id"], [(product(client, "Cable 4 mm"), 10)], "account")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "over_limit"
    assert customer(client)["balance_text"] == "QAR 1,850"
    assert client.get("/api/orders").json()["orders"] == []


def test_customer_without_a_credit_account_cannot_order_on_account(client):
    say(client, "97455577777", "hello")
    stranger = customer(client, "97455577777")
    page = client.get(STORE, params={"t": token(stranger["id"])}).json()
    assert page["customer"]["can_use_account"] is False
    response = place(client, stranger["id"], [(product(client, "Switch"), 1)], "account")
    assert response.status_code == 403
    by_link = place(client, stranger["id"], [(product(client, "Switch"), 1)], "link")
    assert by_link.status_code == 200


def test_prices_come_from_the_shop_not_from_the_request(client):
    ahmed = customer(client)
    switch = product(client, "Switch")
    response = client.post(
        f"{STORE}/orders",
        json={
            "token": token(ahmed["id"]), "payment": "link",
            "items": [{"product_id": switch["id"], "quantity": 3, "price": 1}],
        },
    )
    assert response.json()["total_text"] == "QAR 27"


def test_bad_orders_are_refused(client):
    ahmed = customer(client)
    switch = product(client, "Switch")
    empty = client.post(
        f"{STORE}/orders", json={"token": token(ahmed["id"]), "items": [], "payment": "link"}
    )
    assert empty.status_code == 422
    assert place(client, ahmed["id"], [(switch, 0)], "link").status_code == 422
    assert place(client, ahmed["id"], [(switch, 1)], "cash").status_code == 422
    nobody = "00000000-0000-4000-8000-000000000000"
    assert place(client, nobody, [(switch, 1)], "link").status_code == 404


def test_unavailable_product_cannot_be_ordered_and_leaves_the_page(client):
    ahmed = customer(client)
    switch = product(client, "Switch")
    off = client.post(f"/api/products/{switch['id']}/availability", json={"available": False})
    assert off.status_code == 200
    assert len(client.get(STORE).json()["products"]) == 11
    assert place(client, ahmed["id"], [(switch, 1)], "link").status_code == 422


def test_shop_moves_an_order_along_and_the_customer_is_told(client):
    ahmed = customer(client)
    order = place(client, ahmed["id"], [(product(client, "Switch"), 2)], "link").json()
    for status, words in (("confirmed", "is confirmed"), ("ready", "ready for collection"),
                          ("done", "is complete")):
        change = client.post(f"/api/orders/{order['order_id']}/status", json={"status": status})
        assert change.status_code == 200
        last = client.get(f"/sim/conversations/{AHMED_PHONE}").json()["messages"][-1]
        assert words in last["body"]
    assert client.get("/api/orders").json()["orders"][0]["status"] == "done"
    bad = client.post(f"/api/orders/{order['order_id']}/status", json={"status": "shipped"})
    assert bad.status_code == 422


def test_order_numbers_count_up(client):
    ahmed = customer(client)
    switch = product(client, "Switch")
    numbers = [place(client, ahmed["id"], [(switch, 1)], "link").json()["number"] for _ in range(3)]
    assert numbers == [1001, 1002, 1003]


def test_shop_can_add_a_product(client):
    added = client.post(
        "/api/products", json={"name": "Junction box", "category": "Fittings", "price": 1250}
    )
    assert added.json()["price_text"] == "QAR 12.50"
    assert len(client.get(STORE).json()["products"]) == 13
