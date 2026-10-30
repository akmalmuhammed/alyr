"""The customer's pay page, opened by a signed link (SEC-8's second part, D-080).

Until then it opened by the shop's ID and the payment's ID in the address, for good. Now the link
is `/pay/<shop>?t=<token>`: signed for the pay page and one payment, and it runs out."""

from urllib.parse import urlparse
from uuid import UUID, uuid4

from alyr.core import links
from alyr.seed import AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID
from order_links import booking_token
from order_links import token as order_token
from pay_links import pay, pay_link, pay_page
from test_consent import ahmed, owner_sql, say
from test_sign_in import other_shop_with_owner
from test_track import an_order, token_of, track


def payment_of(link: str) -> UUID:
    """The payment a link is signed for."""
    _, token = pay_link(link)
    return links.read(token, DEMO_TENANT_ID, purpose=links.PAY).subject_id


def mint(payment_id, tenant_id=DEMO_TENANT_ID, **more) -> str:
    return links.mint(UUID(str(tenant_id)), UUID(str(payment_id)), purpose=links.PAY, **more)


def page(client, token, slug=DEMO_SLUG):
    return client.get(f"/api/pay/{slug}", headers={"x-order-link": token})


def test_every_payment_link_is_signed_for_its_payment_and_names_no_id(client):
    order = an_order(client)
    chat = say(client, AHMED_PHONE, reply_id="pay")[-1]["body"]
    for link, order_id in ((order["pay_url"], UUID(order["order_id"])), (chat, None)):
        assert f"http://web.test/pay/{DEMO_SLUG}?t=" in link
        payment = payment_of(link)
        assert str(payment) not in link and str(DEMO_TENANT_ID) not in link
        made = owner_sql("select order_id, status from payment_requests where id = $1", payment)
        assert (made[0]["order_id"], made[0]["status"]) == (order_id, "pending")
    # The order's message says the same link the order page was given.
    assert order["pay_url"] in owner_sql(
        "select body from messages where tenant_id = $1 and body like $2",
        DEMO_TENANT_ID, f"%{order['pay_url']}%",
    )[0]["body"]


def test_the_pay_page_shows_the_payment_and_a_signed_way_to_its_order(client):
    order = an_order(client)
    shown = pay_page(client, order["pay_url"])
    seen = shown.json()
    assert seen["link"] == {"state": "ok", "message": "", "message_ar": ""}
    assert (seen["status"], seen["order_number"], seen["amount_text"]) == (
        "pending", order["number"], "QAR 450"
    )
    # Its order's tracking page, by a link of that page's own, which opens it.
    assert seen["track_path"].startswith(f"/t/{DEMO_SLUG}?t=")
    assert order["order_id"] not in seen["track_path"]
    tracked = track(client, token_of(f"http://web.test{seen['track_path']}")).json()
    assert tracked["order"]["number"] == order["number"]
    # Nobody else's cache keeps it, nothing indexes it, and it varies by the link.
    assert shown.headers["cache-control"] == "private, no-store"
    assert shown.headers["vary"] == "X-Order-Link"
    assert shown.headers["x-robots-tag"] == "noindex, nofollow"


def test_a_payment_on_account_has_no_order_to_track(client):
    chat = say(client, AHMED_PHONE, reply_id="pay")[-1]["body"]
    seen = pay_page(client, chat).json()
    assert (seen["order_number"], seen["track_path"], seen["amount_text"]) == (
        None, None, "QAR 1,850"
    )


def test_the_token_is_read_from_the_address_too_for_a_tool(client):
    order = an_order(client)
    _, token = pay_link(order["pay_url"])
    seen = client.get(f"/api/pay/{DEMO_SLUG}", params={"t": token}).json()
    assert seen["link"]["state"] == "ok" and seen["order_number"] == order["number"]


def test_the_old_address_and_the_payments_id_alone_open_nothing(client):
    order = an_order(client)
    payment = str(payment_of(order["pay_url"]))
    assert client.get(f"/api/pay/{DEMO_TENANT_ID}/{payment}").status_code == 404
    assert client.post(f"/api/pay/{DEMO_TENANT_ID}/{payment}/complete").status_code == 404
    for wrong in (payment, f"{payment}.x", ""):
        seen = client.get(f"/api/pay/{DEMO_SLUG}", params={"t": wrong}).json()
        assert "status" not in seen and seen["link"]["state"] in ("invalid", "none")
        assert payment not in str(seen)
    assert owner_sql(
        "select status from payment_requests where id = $1", UUID(payment)
    )[0]["status"] == "pending"


def test_a_tampered_expired_or_foreign_link_shows_no_payment_and_says_what_to_do(client):
    order = an_order(client)
    payment = payment_of(order["pay_url"])
    _, good = pay_link(order["pay_url"])
    body, mac = good.split(".")
    tampered = f"{body}.{mac[:3]}{'B' if mac[3] != 'B' else 'C'}{mac[4:]}"
    customer = ahmed(client)["id"]
    for bad in (
        tampered,
        mint(payment, tenant_id=uuid4()),  # signed for another shop
        mint(uuid4()),  # a payment that is not there
        order_token(customer), booking_token(customer),  # made for another page
        token_of(order["track_url"]),
        links.mint(DEMO_TENANT_ID, payment, purpose=links.DOCUMENT),
    ):
        seen = page(client, bad).json()
        assert set(seen) == {"shop", "shop_ar", "slug", "link"}, bad
        assert seen["link"]["state"] == "invalid", bad
        assert "newest link" in seen["link"]["message"] and seen["link"]["message_ar"]
    seen = page(client, mint(payment, now=1_000_000.0)).json()
    assert ("status" in seen, seen["link"]["state"]) == (False, "expired")
    assert "expired" in seen["link"]["message"] and "WhatsApp" in seen["link"]["message"]
    assert seen["shop"] == "Al Noor Electricals"


def test_paying_needs_a_good_link(client):
    order = an_order(client)
    payment = payment_of(order["pay_url"])
    refused = client.post(f"/api/pay/{DEMO_SLUG}/complete")
    assert refused.status_code == 403 and refused.json()["detail"]["code"] == "bad_link"
    old = client.post(
        f"/api/pay/{DEMO_SLUG}/complete", headers={"x-order-link": mint(payment, now=1_000_000.0)}
    )
    assert old.status_code == 403 and old.json()["detail"]["code"] == "expired_link"
    assert old.json()["detail"]["message_ar"]
    assert pay_page(client, order["pay_url"]).json()["status"] == "pending"
    assert pay(client, order["pay_url"]).json() == {"status": "paid"}
    assert pay_page(client, order["pay_url"]).json()["status"] == "paid"


def test_a_pay_link_opens_no_other_page(client):
    order = an_order(client)
    _, good = pay_link(order["pay_url"])
    shop = client.get(f"/api/store/{DEMO_SLUG}", params={"t": good}).json()
    assert shop["customer"] is None and shop["link"]["state"] == "invalid"
    assert track(client, good).json()["order"] is None
    for purpose in (links.ORDER, links.BOOKING, links.DOCUMENT, links.RESUME, links.TRACK):
        try:
            links.read(good, DEMO_TENANT_ID, purpose=purpose)
        except links.LinkError as error:
            assert error.code == "wrong_purpose"
        else:
            raise AssertionError(f"a pay link was read as {purpose}")


def test_a_pay_link_opens_nothing_under_another_shop(client):
    order = an_order(client)
    _, good = pay_link(order["pay_url"])
    assert page(client, good, slug="no-such-shop").status_code == 404
    other = other_shop_with_owner("pay@other.example")
    owner_sql("update tenants set slug = 'other-pay' where id = $1", other)
    seen = page(client, good, slug="other-pay").json()
    assert "status" not in seen and seen["link"]["state"] == "invalid"
    paid = client.post("/api/pay/other-pay/complete", headers={"x-order-link": good})
    assert paid.status_code == 403
    assert urlparse(order["pay_url"]).path == f"/pay/{DEMO_SLUG}"
