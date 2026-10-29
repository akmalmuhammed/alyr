"""The pay page and the tracking page (ALY-133): why an ID in their link may stay.

Both pages open by two IDs in the address, the shop's and one payment's or one order's, and
no token. That is safe only because the second one is an unguessable value of its own: made
at random, not derived from the customer's ID or from anything a link or a chat shows, and
good for exactly one payment or order. These tests pin what holding that ID can and cannot
do. The customer's contact ID, which is what the booking page used to take, opens neither."""

import re
from uuid import UUID, uuid4

from alyr.seed import AHMED_PHONE, DEMO_TENANT_ID
from order_links import booking_token
from order_links import token as order_token
from test_consent import ahmed, owner_sql
from test_sign_in import other_shop_with_owner
from test_track import an_order, track

PAY_KEYS = {
    "amount", "status", "provider", "customer", "lang", "shop", "shop_ar", "slug",
    "order_number", "order_id", "amount_text",
    # A booking's deposit (D-072): which visit and the shop's rule; null for an order's payment.
    "booking",
}


def a_payment(client):
    """An order paid by link: (the order's answer, the payment's ID)."""
    order = an_order(client)
    payment = re.search(r"/pay/[0-9a-f-]+/([0-9a-f-]+)", order["pay_url"]).group(1)
    return order, payment


def pay_page(client, payment, tenant=DEMO_TENANT_ID):
    return client.get(f"/api/pay/{tenant}/{payment}")


def test_holding_a_payment_id_shows_that_payment_and_nothing_about_the_customer_beyond_a_name(
    client,
):
    customer = ahmed(client)
    order, payment = a_payment(client)
    shown = pay_page(client, payment)
    assert shown.status_code == 200 and set(shown.json()) == PAY_KEYS
    # The payer's first name, as the tracking page names its staff member: the minimum that
    # tells someone paying on a customer's behalf whose bill it is.
    assert shown.json()["customer"] == "Ahmed" and shown.json()["amount"] == 45000
    # Nothing that identifies the customer to another page: no contact ID, no phone number, no
    # balance or credit, no other payment or order.
    text = shown.text
    assert customer["id"] not in text and AHMED_PHONE not in text and "Al-Kuwari" not in text
    assert "balance" not in text and "credit" not in text
    assert text.count(order["order_id"]) == 1  # its own order, once, for the way to /t
    assert shown.headers["cache-control"] == "private, no-store"


def test_holding_an_order_id_shows_that_order_and_not_who_ordered_it(client):
    customer = ahmed(client)
    order, _ = a_payment(client)
    shown = track(client, order["order_id"])
    assert shown.status_code == 200
    text = shown.text
    assert customer["id"] not in text and AHMED_PHONE not in text
    assert "Ahmed" not in text and "Al-Kuwari" not in text
    assert set(shown.json()["order"]) >= {"number", "status", "items", "steps", "total"}
    assert shown.headers["cache-control"] == "private, no-store"


def test_a_contact_id_opens_neither_page(client):
    """The customer's ID is readable by anyone who holds one of their order links, and the
    booking page used to take it. Here it is just a number that is nobody's payment."""
    customer = ahmed(client)
    order, payment = a_payment(client)
    for wrong in (customer["id"], str(uuid4())):
        assert pay_page(client, wrong).status_code == 404
        assert track(client, wrong).status_code == 404
        assert client.post(f"/api/pay/{DEMO_TENANT_ID}/{wrong}/complete").status_code == 404
    # One kind of ID is not another: an order's is not a payment's, nor the reverse.
    assert pay_page(client, order["order_id"]).status_code == 404
    assert track(client, payment).status_code == 404


def test_a_link_token_opens_neither_page(client):
    customer = ahmed(client)
    for token in (order_token(customer["id"]), booking_token(customer["id"])):
        assert pay_page(client, token).status_code == 422
        assert track(client, token).status_code == 422


def test_a_payment_or_order_of_one_shop_opens_nothing_under_another_shop(client):
    order, payment = a_payment(client)
    other = other_shop_with_owner("pay-and-track@other.example")
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'orders')", other)
    assert pay_page(client, payment, tenant=other).status_code == 404
    assert track(client, order["order_id"], tenant=other).status_code == 404
    assert client.post(f"/api/pay/{other}/{payment}/complete").status_code == 404
    # Under its own shop they still open, so the 404s above are the other shop's, not a typo.
    assert pay_page(client, payment).status_code == 200
    assert track(client, order["order_id"]).status_code == 200


def test_the_ids_are_random_and_not_made_from_the_customer(client):
    customer = ahmed(client)
    seen = set()
    for _ in range(3):
        order, payment = a_payment(client)
        for value in (order["order_id"], payment):
            assert UUID(value).version == 4  # random: nothing in it is a time, a number or a name
            assert value not in seen and value != customer["id"]
            assert customer["id"].replace("-", "")[:12] not in value.replace("-", "")
            seen.add(value)
