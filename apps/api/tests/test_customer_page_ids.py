"""The pay page and the tracking page (ALY-133): what holding their link can and cannot do.

Until SEC-8 (D-080) both opened by IDs in the address, the shop's and one payment's or one
order's, and no token, for good. Both now take a link signed for that page and that payment or
order, which runs out (`test_track.py`, `test_pay_link.py`), and an ID alone opens nothing. The
customer's contact ID, which is what the booking page used to take, opens neither."""

from uuid import UUID, uuid4

from alyr.core import links
from alyr.seed import AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID
from order_links import booking_token
from order_links import token as order_token
from pay_links import pay_link
from test_consent import ahmed, owner_sql
from test_sign_in import other_shop_with_owner
from test_track import an_order, mint, token_of, track

PAY_KEYS = {
    "amount", "status", "provider", "customer", "lang", "shop", "shop_ar", "slug",
    "order_number", "order_id", "amount_text",
    # A booking's deposit (D-084): which visit and the shop's rule; null for an order's payment.
    "booking",
    # Where the Pay button goes (ALY-17): the stand-in, or the provider's page for this payment
    # on the shop's own account, and whether that page is still being made or no longer works.
    "stand_in", "preparing", "unavailable", "checkout_url",
    # The link's state (D-080), and the order's own tracking page by a signed link of its own.
    "link", "track_path",
}


def a_payment(client):
    """An order paid by link: (the order's answer, the payment's ID)."""
    order = an_order(client)
    _, token = pay_link(order["pay_url"])
    return order, str(links.read(token, DEMO_TENANT_ID, purpose=links.PAY).subject_id)


def pay_mint(payment_id, tenant_id=DEMO_TENANT_ID) -> str:
    return links.mint(UUID(str(tenant_id)), UUID(str(payment_id)), purpose=links.PAY)


def pay_page(client, token, slug=DEMO_SLUG):
    return client.get(f"/api/pay/{slug}", headers={"x-order-link": token})


def pay_now(client, token, slug=DEMO_SLUG):
    return client.post(f"/api/pay/{slug}/complete", headers={"x-order-link": token})


def test_holding_a_payment_id_shows_that_payment_and_nothing_about_the_customer_beyond_a_name(
    client,
):
    customer = ahmed(client)
    order, payment = a_payment(client)
    shown = pay_page(client, pay_mint(payment))
    assert shown.status_code == 200 and set(shown.json()) == PAY_KEYS
    # The payer's first name, as the tracking page names its staff member: the minimum that
    # tells someone paying on a customer's behalf whose bill it is.
    assert shown.json()["customer"] == "Ahmed" and shown.json()["amount"] == 45000
    # Nothing that identifies the customer to another page: no contact ID, no phone number, no
    # balance or credit, no other payment or order.
    text = shown.text
    assert customer["id"] not in text and AHMED_PHONE not in text and "Al-Kuwari" not in text
    assert "balance" not in text and "credit" not in text
    assert text.count(order["order_id"]) == 1  # its own order, once; the way to /t is signed
    assert shown.headers["cache-control"] == "private, no-store"


def test_holding_the_tracking_link_shows_that_order_and_not_who_ordered_it(client):
    customer = ahmed(client)
    order, _ = a_payment(client)
    shown = track(client, token_of(order["track_url"]))
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
        assert "status" not in pay_page(client, pay_mint(wrong)).json()
        assert track(client, mint(wrong)).json()["order"] is None
        assert pay_now(client, pay_mint(wrong)).status_code == 404
        # As the address or as the token, a bare ID is not a link.
        assert client.get(f"/api/pay/{DEMO_TENANT_ID}/{wrong}").status_code == 404
        assert pay_page(client, wrong).json()["link"]["state"] == "invalid"
    # One kind of ID is not another: an order's is not a payment's, nor the reverse.
    assert "status" not in pay_page(client, pay_mint(order["order_id"])).json()
    assert track(client, mint(payment)).json()["order"] is None


def test_a_link_token_opens_neither_page(client):
    customer = ahmed(client)
    for token in (order_token(customer["id"]), booking_token(customer["id"])):
        assert pay_page(client, token).json()["link"]["state"] == "invalid"
        assert track(client, token).json()["link"]["state"] == "invalid"


def test_a_payment_or_order_of_one_shop_opens_nothing_under_another_shop(client):
    order, payment = a_payment(client)
    other = other_shop_with_owner("pay-and-track@other.example")
    owner_sql("update tenants set slug = 'pay-and-track' where id = $1", other)
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'orders')", other)
    elsewhere = pay_page(client, pay_mint(payment), slug="pay-and-track").json()
    assert "status" not in elsewhere and elsewhere["link"]["state"] == "invalid"
    assert "status" not in pay_page(client, pay_mint(payment, tenant_id=other)).json()
    elsewhere = track(client, token_of(order["track_url"]), slug="pay-and-track").json()
    assert elsewhere["order"] is None and elsewhere["link"]["state"] == "invalid"
    assert pay_now(client, pay_mint(payment), slug="pay-and-track").status_code == 403
    # Under its own shop they still open, so the refusals above are the other shop's.
    assert pay_page(client, pay_mint(payment)).json()["status"] == "pending"
    assert track(client, token_of(order["track_url"])).json()["order"] is not None


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
