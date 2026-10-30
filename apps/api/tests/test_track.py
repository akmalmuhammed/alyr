"""The customer's tracking page for an order (ALY-73), opened by a signed link (SEC-8, D-080)."""

import re
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

from alyr.core import links
from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID
from order_links import booking_token
from order_links import token as order_token
from pay_links import pay, pay_page
from test_consent import ahmed, conversation, owner_sql, say
from test_inbox_team import user_id
from test_orders import place, product
from test_sign_in import other_shop_with_owner, sign_in

TRACK = re.compile(r"http://web\.test/t/([a-z0-9-]+)\?t=([\w.-]+)")


def an_order(client, payment="link"):
    response = place(client, ahmed(client)["id"], [(product(client, "Cable 2.5 mm"), 2)], payment)
    assert response.status_code == 200
    return response.json()


def token_of(url: str) -> str:
    """The token in a tracking link."""
    return parse_qs(urlparse(url).query)["t"][0]


def track(client, token, slug=DEMO_SLUG):
    """The tracking page's answer for a token, sent in the header as the page sends it."""
    return client.get(f"/api/track/{slug}", headers={"x-order-link": token})


def tracked(client, placed: dict) -> dict:
    """The order as its customer sees it, by the link the order came back with (at whatever
    shop it was placed)."""
    url = placed["track_url"]
    shown = track(client, token_of(url), slug=urlparse(url).path.rsplit("/", 1)[1])
    assert shown.status_code == 200, shown.text
    assert shown.json()["link"]["state"] == "ok", shown.json()["link"]
    return shown.json()["order"]


def mint(order_id, tenant_id=DEMO_TENANT_ID, **more) -> str:
    return links.mint(UUID(str(tenant_id)), UUID(str(order_id)), purpose=links.TRACK, **more)


def test_the_order_message_carries_a_link_to_the_customers_tracking_page(client):
    say(client, AHMED_PHONE, "hello")
    order = an_order(client)
    link = TRACK.search(conversation(client)[-1]["body"])
    assert link and link.group(1) == DEMO_SLUG
    assert order["track_url"].startswith(f"http://web.test/t/{DEMO_SLUG}?t=")
    # The link names no order and no shop by ID: the token does, signed.
    for url in (link.group(0), order["track_url"]):
        assert order["order_id"] not in url and str(DEMO_TENANT_ID) not in url
    assert links.read(link.group(2), DEMO_TENANT_ID, purpose=links.TRACK).subject_id == UUID(
        order["order_id"])


def test_the_tracking_page_shows_what_was_bought_and_where_it_has_got_to(client):
    order = an_order(client)
    shown = track(client, token_of(order["track_url"]))
    page = shown.json()
    assert page["shop"] == {"name": "Al Noor Electricals", "name_ar": page["shop"]["name_ar"]}
    assert page["link"] == {"state": "ok", "message": "", "message_ar": ""}
    seen = page["order"]
    assert seen["number"] == order["number"] and seen["status"] == "new"
    assert seen["items"][0]["quantity"] == 2 and seen["total_text"] == "QAR 450"
    assert [s["key"] for s in seen["steps"]] == ["placed", "confirmed", "ready", "done"]
    assert seen["steps"][0]["at"] and seen["steps"][1]["at"] is None
    # Not paid yet, so the page offers the payment's own signed link (D-080), which opens it.
    assert seen["payment_id"]
    assert page["pay_path"].startswith(f"/pay/{DEMO_SLUG}?t=")
    assert seen["payment_id"] not in page["pay_path"]
    assert pay_page(client, page["pay_path"]).json()["order_number"] == order["number"]
    assert seen["handler"] is None
    # Nobody else's cache keeps it, nothing indexes it, and it varies by the link.
    assert shown.headers["cache-control"] == "private, no-store"
    assert shown.headers["vary"] == "X-Order-Link"
    assert shown.headers["x-robots-tag"] == "noindex, nofollow"


def test_the_token_is_read_from_the_address_too_for_a_tool(client):
    order = an_order(client)
    shown = client.get(f"/api/track/{DEMO_SLUG}", params={"t": token_of(order["track_url"])})
    assert shown.json()["order"]["number"] == order["number"]


def test_moving_the_order_shows_on_the_page_with_who_is_handling_it(client):
    say(client, AHMED_PHONE, "hello")
    order = an_order(client)
    order_id = order["order_id"]
    owner_sql("update orders set assigned_to = $1 where id = $2", user_id(AGENT_EMAIL), order_id)
    sign_in(client, AGENT_EMAIL)
    client.post(f"/api/orders/{order_id}/status", json={"status": "confirmed"})
    seen = tracked(client, order)
    assert seen["status"] == "confirmed" and seen["steps"][1]["at"]
    assert seen["handler"] == "Yusuf"
    # The status message carries a link of its own to the same order, which opens it too.
    fresh = TRACK.search(conversation(client)[-1]["body"]).group(2)
    assert links.read(fresh, DEMO_TENANT_ID, purpose=links.TRACK).subject_id == UUID(order_id)
    assert track(client, fresh).json()["order"]["status"] == "confirmed"


def test_paying_closes_the_payment_offer(client):
    order = an_order(client)
    offered = track(client, token_of(order["track_url"])).json()["pay_path"]
    assert pay(client, offered).status_code == 200
    page = track(client, token_of(order["track_url"])).json()
    seen = page["order"]
    assert seen["payment"] == "paid" and seen["payment_id"] is None and seen["paid_at"]
    assert page["pay_path"] is None


def test_the_orders_id_alone_opens_nothing(client):
    """SEC-8: the order's ID is seen in the workspace and in a shop's own system; until D-080
    it opened this page for good. Now neither the old address nor the ID as a token does."""
    order = an_order(client)
    assert client.get(f"/api/track/{DEMO_TENANT_ID}/{order['order_id']}").status_code == 404
    for wrong in (order["order_id"], f"{order['order_id']}.x", ""):
        page = client.get(f"/api/track/{DEMO_SLUG}", params={"t": wrong}).json()
        assert page["order"] is None and page["pay_path"] is None
        assert page["link"]["state"] in ("invalid", "none")
        assert order["order_id"] not in str(page)


def test_a_tampered_expired_or_foreign_link_shows_no_order_and_says_what_to_do(client):
    order = an_order(client)
    good = token_of(order["track_url"])
    body, mac = good.split(".")
    tampered = f"{body}.{mac[:3]}{'B' if mac[3] != 'B' else 'C'}{mac[4:]}"
    customer = ahmed(client)["id"]
    for bad in (
        tampered,
        mint(order["order_id"], tenant_id=uuid4()),  # signed for another shop
        mint(uuid4()),  # an order that is not there
        order_token(customer), booking_token(customer),  # made for another page
        links.mint(DEMO_TENANT_ID, UUID(order["order_id"]), purpose=links.DOCUMENT),
    ):
        page = track(client, bad).json()
        assert page["order"] is None and page["link"]["state"] == "invalid", bad
        assert "newest link" in page["link"]["message"] and page["link"]["message_ar"]
    old = mint(order["order_id"], now=1_000_000.0)
    page = track(client, old).json()
    assert (page["order"], page["link"]["state"]) == (None, "expired")
    assert "expired" in page["link"]["message"] and "WhatsApp" in page["link"]["message"]


def test_a_tracking_link_opens_no_other_page(client):
    order = an_order(client)
    good = token_of(order["track_url"])
    shop = client.get(f"/api/store/{DEMO_SLUG}", params={"t": good}).json()
    assert shop["customer"] is None and shop["link"]["state"] == "invalid"
    for purpose in (links.ORDER, links.BOOKING, links.DOCUMENT, links.RESUME):
        try:
            links.read(good, DEMO_TENANT_ID, purpose=purpose)
        except links.LinkError as error:
            assert error.code == "wrong_purpose"
        else:
            raise AssertionError(f"a tracking link was read as {purpose}")


def test_an_unknown_shop_or_one_without_orders_has_no_tracking_page(client):
    order = an_order(client)
    good = token_of(order["track_url"])
    assert track(client, good, slug="no-such-shop").status_code == 404
    other = other_shop_with_owner("track@other.example")
    owner_sql("update tenants set slug = 'other-track' where id = $1", other)
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'orders')", other)
    # Under another shop's address the link is not good: it was signed for this shop.
    page = track(client, good, slug="other-track").json()
    assert page["order"] is None and page["link"]["state"] == "invalid"
    owner_sql(
        "update tenant_modules set enabled = false where tenant_id = $1 and module_key = 'orders'",
        DEMO_TENANT_ID,
    )
    assert track(client, good).status_code == 404


def test_after_the_24_hour_window_the_approved_template_goes_without_the_link(client):
    an_order(client)
    last = conversation(client)[-1]
    assert last["kind"] == "template" and not TRACK.search(last["body"])
