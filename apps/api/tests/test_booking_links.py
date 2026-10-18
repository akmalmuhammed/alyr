"""The booking page's signed links (ALY-133, D-039 "As built (ALY-133)").

The booking page used to take the customer's bare contact ID (`?c=`, `contact_id`), which is
readable inside an order link's token. Now the customer's own booking link carries a token
made for booking (`core/links.py`) and nothing else identifies them. For every public route
that can identify a customer these tests cover a missing, tampered, expired, wrong-shop and
wrong-purpose token and the bare contact ID being refused; that a forwarded order link
cannot act on the booking page, nor a booking link on the order page; and that the public
booking link stays person-free."""

import base64
from uuid import UUID, uuid4

import pytest

from alyr.core import links
from alyr.seed import AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID
from order_links import booking_token
from order_links import token as order_token
from test_bookings import PAGE, service_id, times
from test_consent import ahmed, conversation, owner_sql, say
from test_items import STORE, detail, line, mk, people
from test_links import tamper
from test_onboarding import new_business
from test_price_groups import make_group, put_in, set_price

ASK ="can I book an appointment?"


def asking(client, token, **more):
    """The booking page's answer to a request with this token in the header."""
    return client.get(PAGE, headers={"x-order-link": token} if token else None, **more)


def booking_for(client, token, contact_id=None, *, sid=None, starts_at=None, **more):
    """Try to book. `token` and `contact_id` go in the body only when given."""
    sid = sid or service_id(client)
    body = {"service_id": sid, "starts_at": starts_at or times(client, sid)[0], **more}
    if token is not None:
        body["token"] = token
    if contact_id is not None:
        body["contact_id"] = contact_id
    return client.post(PAGE, json=body)


def made(tenant=DEMO_TENANT_ID) -> int:
    return owner_sql("select count(*) as n from bookings where tenant_id = $1", tenant)[0]["n"]


def contact_in(token: str) -> UUID:
    """What anyone holding a link can read out of it: the signature stops an edit, not a
    reading. This is how a forwarded order link shows a contact ID."""
    body = token.split(".")[0]
    return UUID(bytes=base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))[2:18])


def refused(response, code):
    assert (response.status_code, detail(response)["code"]) == (403, code), response.text
    assert detail(response)["message"] and detail(response)["message_ar"]


# ── the link the chat sends ──────────────────────────────


def test_the_chat_sends_a_booking_token_not_the_contact_id(client):
    customer = ahmed(client)
    reply = say(client, AHMED_PHONE, ASK)[-1]["body"]
    assert f"/b/{DEMO_SLUG}?t=" in reply
    assert customer["id"] not in reply and "?c=" not in reply
    token = reply.split("?t=")[1].split()[0]
    link = links.read(token, DEMO_TENANT_ID, purpose=links.BOOKING)
    assert str(link.contact_id) == customer["id"] and link.table == ""
    # It was made for booking: the order page would not take it.
    with pytest.raises(links.LinkError) as wrong:
        links.read(token, DEMO_TENANT_ID, purpose=links.ORDER)
    assert wrong.value.code == "wrong_purpose"
    # And the link works: the page greets the customer by name.
    assert asking(client, token).json()["customer"]["name"] == "Ahmed Al-Kuwari"


def test_the_arabic_booking_link_is_signed_too(client):
    customer = ahmed(client)
    reply = say(client, AHMED_PHONE, "أريد حجز موعد")[-1]["body"]
    assert "اختر الخدمة" in reply and customer["id"] not in reply
    token = reply.split("?t=")[1].split()[0]
    assert links.read(token, DEMO_TENANT_ID, purpose=links.BOOKING).contact_id == UUID(
        customer["id"]
    )


def test_the_booking_button_in_the_menu_gives_the_signed_link_too(client):
    reply = say(client, AHMED_PHONE, reply_id="book")[-1]["body"]
    assert f"/b/{DEMO_SLUG}?t=" in reply and "?c=" not in reply


# ── a good link ──────────────────────────────────────────


def test_a_valid_token_makes_the_page_the_customers_and_books_for_them(client):
    customer = ahmed(client)
    token = booking_token(customer["id"])
    shown = asking(client, token).json()
    assert shown["customer"] == {"name": "Ahmed Al-Kuwari", "lang": "en"}
    assert (shown["link"]["state"], shown["link"]["message"]) == ("ok", "")
    # `?t=` is still read, for a tool or a test; the page itself uses the header.
    assert client.get(PAGE, params={"t": token}).json()["customer"]["name"] == "Ahmed Al-Kuwari"
    done = booking_for(client, token)
    assert done.status_code == 200
    listed = client.get("/api/bookings").json()["bookings"]
    assert [b["customer"] for b in listed] == ["Ahmed Al-Kuwari"]
    assert "Booking 101 is confirmed" in conversation(client)[-1]["body"]


def test_the_booking_is_made_for_the_customer_the_token_names_and_for_nobody_else(client):
    first, second = people(client, 2)
    token = booking_token(first["id"])
    before = len(conversation(client, second["phone"]))
    # A contact ID in the body beside a good token changes nothing.
    done = booking_for(client, token, contact_id=second["id"])
    assert done.status_code == 200
    owner = owner_sql(
        "select c.phone from bookings b join contacts c on c.id = b.contact_id "
        "where b.tenant_id = $1", DEMO_TENANT_ID,
    )
    assert [r["phone"] for r in owner] == [first["phone"]]
    assert len(conversation(client, second["phone"])) == before


def test_a_booking_page_is_never_kept_by_a_shared_cache(client):
    answer = client.get(PAGE)
    assert answer.headers["cache-control"] == "private, no-store"
    assert "x-order-link" in answer.headers["vary"].lower()


def test_the_page_tells_a_customer_who_cannot_book_where_to_ask(client):
    assert client.get(PAGE).json()["shop"]["whatsapp"] == ""
    owner_sql(
        "insert into shop_settings (tenant_id, whatsapp_number) values ($1, '97455550100') "
        "on conflict (tenant_id) do update set whatsapp_number = '97455550100'",
        DEMO_TENANT_ID,
    )
    assert client.get(PAGE).json()["shop"]["whatsapp"] == "97455550100"


# ── the public link is a place, not a person ─────────────


def test_the_public_booking_link_shows_the_services_and_cannot_book(client):
    shown = client.get(PAGE).json()
    assert shown["customer"] is None and shown["link"]["state"] == "none"
    assert [s["name"] for s in shown["services"]][0] == "Electrician site visit"
    # The free times are the shop's, not a person's.
    assert times(client, service_id(client))
    before = (made(), len(conversation(client)))
    refused(booking_for(client, None), "bad_link")
    assert (made(), len(conversation(client))) == before


# ── a bare contact ID identifies nobody ──────────────────


def test_a_bare_contact_id_in_the_address_grants_nothing(client):
    customer = ahmed(client)
    for query in ({"c": customer["id"]}, {"contact_id": customer["id"]},
                  {"c": customer["id"], "t": ""}):
        shown = client.get(PAGE, params=query).json()
        assert shown["customer"] is None and shown["link"]["state"] == "none"
        assert "Ahmed" not in str(shown)


def test_a_bare_contact_id_in_the_body_books_nothing(client):
    customer = ahmed(client)
    before = (made(), len(conversation(client)))
    # The old request, exactly as the page used to send it.
    refused(booking_for(client, None, contact_id=customer["id"]), "bad_link")
    # With a junk token beside it, or the ID where the token goes.
    refused(booking_for(client, "nonsense", contact_id=customer["id"]), "bad_link")
    refused(booking_for(client, customer["id"]), "bad_link")
    assert (made(), len(conversation(client))) == before


# ── missing, tampered, expired, wrong-shop, wrong-purpose ─


def test_a_tampered_token_opens_the_public_page_and_books_nothing(client):
    customer = ahmed(client)
    good = booking_token(customer["id"])
    before = (made(), len(conversation(client)))
    for bad in (tamper(good), good[:-2], good + good, "nonsense", ".", "💥"):
        if bad.isascii():
            shown = asking(client, bad).json()
            assert shown["customer"] is None and shown["link"]["state"] == "invalid"
            assert "booking link is not valid" in shown["link"]["message"]
            assert shown["link"]["message_ar"]
        refused(booking_for(client, bad), "bad_link")
    assert (made(), len(conversation(client))) == before


def test_a_token_that_was_edited_to_name_someone_else_is_refused(client):
    first, second = people(client, 2)
    token = booking_token(first["id"])
    body, mac = token.split(".")
    other = booking_token(second["id"]).split(".")[0]
    for forged in (f"{other}.{mac}", f"{body}.{mac[::-1]}"):
        assert asking(client, forged).json()["customer"] is None
        refused(booking_for(client, forged), "bad_link")
    assert made() == 0


def test_an_expired_token_says_the_link_has_expired_and_how_to_get_a_new_one(client):
    customer = ahmed(client)
    old = booking_token(customer["id"], now=1_000_000.0)
    shown = asking(client, old).json()
    assert (shown["customer"], shown["link"]["state"]) == (None, "expired")
    assert "expired" in shown["link"]["message"] and "WhatsApp" in shown["link"]["message"]
    assert "انتهت" in shown["link"]["message_ar"]
    before = (made(), len(conversation(client)))
    refused(booking_for(client, old), "expired_link")
    assert (made(), len(conversation(client))) == before


def test_a_token_for_another_shop_is_refused_here_and_there(client):
    customer = ahmed(client)
    sid = service_id(client)
    start = times(client, sid)[0]
    mine = booking_token(customer["id"])
    # A shop that does not exist: a token made for it is worthless at this one.
    foreign = booking_token(customer["id"], tenant_id=uuid4())
    assert asking(client, foreign).json()["link"]["state"] == "invalid"
    refused(booking_for(client, foreign, sid=sid, starts_at=start), "bad_link")
    # A real second shop that takes bookings: this shop's token books nothing there.
    other_tenant, other_slug, _ = new_business(client)
    other = f"/api/book/{other_slug}"
    seen = client.get(other, headers={"x-order-link": mine}).json()
    assert seen["customer"] is None and seen["link"]["state"] == "invalid"
    other_service = seen["services"][0]["id"]
    response = client.post(other, json={
        "token": mine, "service_id": other_service, "starts_at": start,
    })
    refused(response, "bad_link")
    assert made(other_tenant) == 0


def test_a_token_whose_customer_is_gone_books_nothing(client):
    customer = ahmed(client)
    token = booking_token(customer["id"])
    owner_sql("update contacts set role = 'staff' where id = $1", UUID(customer["id"]))
    shown = asking(client, token).json()
    assert shown["customer"] is None and shown["link"]["state"] == "invalid"
    response = booking_for(client, token)
    assert response.status_code == 404 and detail(response)["code"] == "unknown_customer"
    stranger = booking_token(uuid4())
    assert booking_for(client, stranger).status_code == 404
    assert made() == 0


def test_a_header_longer_than_a_token_is_refused_not_trusted(client):
    assert asking(client, "a" * 500).status_code == 422
    sid = service_id(client)
    start = times(client, sid)[0]
    too_long = client.post(PAGE, json={"token": "a" * 500, "service_id": sid, "starts_at": start})
    assert too_long.status_code == 422 and made() == 0


# ── an order link and a booking link are not the same key ─


def test_a_forwarded_order_link_cannot_act_on_the_booking_page(client):
    customer = ahmed(client)
    order_link = order_token(customer["id"])
    # The order link works where it was made for.
    assert client.get(STORE, headers={"x-order-link": order_link}).json()["customer"]["name"]
    # Whoever holds it can read the contact ID out of it, and neither the link nor the ID
    # opens anything on the booking page.
    leaked = contact_in(order_link)
    assert str(leaked) == customer["id"]
    shown = asking(client, order_link).json()
    assert shown["customer"] is None and shown["link"]["state"] == "invalid"
    assert client.get(PAGE, params={"t": order_link}).json()["customer"] is None
    assert client.get(PAGE, params={"c": str(leaked)}).json()["customer"] is None
    before = (made(), len(conversation(client)))
    refused(booking_for(client, order_link), "bad_link")
    refused(booking_for(client, None, contact_id=str(leaked)), "bad_link")
    refused(booking_for(client, str(leaked)), "bad_link")
    assert (made(), len(conversation(client))) == before


def test_a_booking_link_cannot_act_on_the_order_page(client):
    contact = people(client, 1)[0]
    item = mk(client, name="Cable", name_ar="كابل", price=1000)
    wrong = booking_token(contact["id"])
    shown = client.get(STORE, headers={"x-order-link": wrong}).json()
    assert shown["customer"] is None and shown["link"]["state"] == "invalid"
    for path, body in (
        ("orders", {"token": wrong, "payment": "link", "items": [line(item)]}),
        ("orders/repeat", {"token": wrong, "payment": "link"}),
        ("cart/check", {"token": wrong, "items": [line(item)]}),
    ):
        refused(client.post(f"{STORE}/{path}", json=body), "bad_link")
    assert client.get("/api/orders").json()["orders"] == []


def test_a_booking_link_shows_no_customers_prices_on_the_order_pages_item_and_refresh(client):
    contact = people(client, 1)[0]
    item = mk(client, name="Cable", name_ar="كابل", price=1000)
    group = make_group(client)
    set_price(client, item, group, 800)
    put_in(client, contact, group)
    # The order link shows the group's price; the booking link, on the same routes, shows none.
    right = {"x-order-link": order_token(contact["id"])}
    wrong = {"x-order-link": booking_token(contact["id"])}
    assert client.get(f"{STORE}/items/{item['id']}", headers=right).json()["item"]["price"] == 800
    assert client.get(f"{STORE}/items/{item['id']}", headers=wrong).json()["item"]["price"] == 1000
    # (The refresh takes the token in its body.)
    ids = {"ids": [item["id"]]}
    mine = client.post(f"{STORE}/live", json={**ids, "token": order_token(contact["id"])})
    other = client.post(f"{STORE}/live", json={**ids, "token": booking_token(contact["id"])})
    assert mine.json()["group"]["is_default"] is False
    assert other.json()["group"]["is_default"] is True


def test_the_two_kinds_of_token_are_the_same_customer_but_not_the_same_token(client):
    contact = people(client, 1)[0]
    one, two = order_token(contact["id"], now=2_000_000_000.0), booking_token(
        contact["id"], now=2_000_000_000.0
    )
    assert one != two
    assert contact_in(one) == contact_in(two) == UUID(contact["id"])


# ── the unattended paths: reminders and confirmations carry no link ──


def test_confirmations_and_reminders_carry_no_customer_link(client):
    """They are plain notices; nothing in them identifies a customer to a page. If one ever
    carries a link, it must be minted with `links.booking_url`."""
    customer = ahmed(client)
    assert booking_for(client, booking_token(customer["id"])).status_code == 200
    owner_sql("update jobs set run_at = now() where kind = 'booking_reminder'")
    client.get("/api/services")  # any request lets the in-process job runner work
    bodies = [m["body"] for m in conversation(client) if m["direction"] == "out"]
    assert any("Reminder: booking" in b for b in bodies)
    for body in bodies:
        if "confirmed" in body or "Reminder: booking" in body:
            assert "/b/" not in body and "?c=" not in body and customer["id"] not in body
