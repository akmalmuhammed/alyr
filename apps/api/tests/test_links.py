"""Signed order links (ALY-112, D-039): a link for ONE customer carries a token, never the
contact's ID. Tampered, malformed, expired, wrong-shop and missing tokens are refused; the
old bare `?c=<contact id>` grants nothing; a public link carries neither; and a server with
no secret does not start outside a developer machine."""

from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from alyr.config import Settings, get_settings
from alyr.core import links
from alyr.seed import AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID
from order_links import token as mint
from test_consent import say
from test_items import STORE, detail, line, mk, people
from test_orders import customer
from test_price_groups import make_group, page, put_in, set_price

CONTACT = UUID("0a1f0000-0000-4000-8000-00000000cafe")
OTHER_SHOP = UUID("0a1f0000-0000-4000-8000-0000000b0b0b")
NOW = 1_800_000_000.0
SECRET = "x" * 40


def settings(**more) -> Settings:
    return Settings(_env_file=None, env="local", link_secret=SECRET, **more)


# ── the token itself ─────────────────────────────────────


def test_a_token_names_the_customer_and_the_shop_it_was_made_for():
    token = links.mint(DEMO_TENANT_ID, CONTACT, now=NOW, settings=settings())
    link = links.read(token, DEMO_TENANT_ID, now=NOW + 60, settings=settings())
    assert (link.contact_id, link.table) == (CONTACT, "")
    # Nothing in it is the contact's ID in the clear.
    assert str(CONTACT) not in token and CONTACT.hex not in token
    plain = token.replace(".", "").replace("-", "").replace("_", "")
    assert token.count(".") == 1 and plain.isalnum()


def test_a_table_label_is_signed_with_the_token():
    token = links.mint(DEMO_TENANT_ID, CONTACT, table="  A 7 ", now=NOW, settings=settings())
    assert links.read(token, DEMO_TENANT_ID, now=NOW, settings=settings()).table == "A 7"
    # Arabic labels survive, and a long one is cut at twenty characters.
    arabic = links.mint(DEMO_TENANT_ID, CONTACT, table="الطاولة ٧", now=NOW, settings=settings())
    assert links.read(arabic, DEMO_TENANT_ID, now=NOW, settings=settings()).table == "الطاولة ٧"
    long = links.mint(DEMO_TENANT_ID, CONTACT, table="9" * 50, now=NOW, settings=settings())
    assert links.read(long, DEMO_TENANT_ID, now=NOW, settings=settings()).table == "9" * 20


def test_a_tampered_token_is_refused():
    token = links.mint(DEMO_TENANT_ID, CONTACT, table="7", now=NOW, settings=settings())
    body, mac = token.split(".")
    flipped = ("B" if body[10] == "A" else "A")
    forged = [
        body[:10] + flipped + body[11:] + "." + mac,   # the payload changed
        tamper(token),                                  # the signature changed
        mac + "." + body,                               # the parts swapped
        body + "." + mac + mac,                         # a longer signature
        body,                                           # no signature
    ]
    for bad in forged:
        with pytest.raises(links.LinkError) as refused:
            links.read(bad, DEMO_TENANT_ID, now=NOW, settings=settings())
        assert refused.value.code in ("malformed", "bad_signature"), bad
    # Editing the table in the payload is exactly what the signature stops.
    other_table = links.mint(DEMO_TENANT_ID, CONTACT, table="3", now=NOW, settings=settings())
    swapped = other_table.split(".")[0] + "." + mac
    with pytest.raises(links.LinkError):
        links.read(swapped, DEMO_TENANT_ID, now=NOW, settings=settings())


@pytest.mark.parametrize("junk", ["", ".", "abc", "a.b", "###.###", "💥", "x" * 400, str(CONTACT)])
def test_nonsense_is_malformed_not_a_crash(junk):
    with pytest.raises(links.LinkError) as refused:
        links.read(junk, DEMO_TENANT_ID, now=NOW, settings=settings())
    assert refused.value.code in ("malformed", "bad_signature")


def test_a_token_is_worthless_at_another_shop():
    token = links.mint(DEMO_TENANT_ID, CONTACT, now=NOW, settings=settings())
    with pytest.raises(links.LinkError) as refused:
        links.read(token, OTHER_SHOP, now=NOW, settings=settings())
    assert refused.value.code == "bad_signature"


def test_a_token_expires_after_the_days_the_shop_platform_sets():
    token = links.mint(DEMO_TENANT_ID, CONTACT, now=NOW, settings=settings(link_days=30))
    day = 86400
    assert links.read(token, DEMO_TENANT_ID, now=NOW + 29 * day, settings=settings()).contact_id
    with pytest.raises(links.LinkError) as refused:
        links.read(token, DEMO_TENANT_ID, now=NOW + 30 * day, settings=settings())
    assert refused.value.code == "expired"


def test_a_token_made_with_another_secret_is_refused():
    token = links.mint(DEMO_TENANT_ID, CONTACT, now=NOW, settings=settings())
    other = Settings(_env_file=None, env="local", link_secret="y" * 40)
    with pytest.raises(links.LinkError) as refused:
        links.read(token, DEMO_TENANT_ID, now=NOW, settings=other)
    assert refused.value.code == "bad_signature"


# ── the secret ───────────────────────────────────────────


def test_a_developer_machine_may_use_the_built_in_secret_and_nothing_else_may():
    local = Settings(_env_file=None, env="local", link_secret="")
    assert links.secret(local) == links.DEV_SECRET.encode()
    for env in ("production", "staging", "", "Local"):
        with pytest.raises(links.LinkSecretMissing):
            links.secret(Settings(_env_file=None, env=env, link_secret=""))
        with pytest.raises(links.LinkSecretMissing):
            links.mint(DEMO_TENANT_ID, CONTACT, settings=Settings(_env_file=None, env=env))
    # A short secret is as good as none, even on a developer machine.
    with pytest.raises(links.LinkSecretMissing):
        links.secret(Settings(_env_file=None, env="local", link_secret="short"))
    assert links.secret(Settings(_env_file=None, env="production", link_secret=SECRET))


def test_the_server_does_not_start_without_a_secret_outside_local(client_factory, monkeypatch):
    from alyr.main import create_app

    monkeypatch.setenv("ALYR_ENV", "production")
    monkeypatch.setenv("ALYR_LINK_SECRET", "")
    get_settings.cache_clear()
    with pytest.raises(links.LinkSecretMissing), TestClient(create_app()):
        pass
    monkeypatch.setenv("ALYR_LINK_SECRET", SECRET)
    get_settings.cache_clear()
    with TestClient(create_app()) as started:
        assert started.get("/health").json()["env"] == "production"
    get_settings.cache_clear()


# ── through the order page's API ──────────────────────────


def as_customer(client, contact=None):
    contact = contact or people(client, 1)[0]
    return contact, mint(contact["id"])


def tamper(token: str) -> str:
    """The same token with one character of its signature changed."""
    body, mac = token.split(".")
    return f"{body}.{mac[:3]}{'B' if mac[3] != 'B' else 'C'}{mac[4:]}"


def test_a_valid_token_makes_the_page_the_customers(client):
    contact, token = as_customer(client)
    shown = client.get(STORE, params={"t": token}).json()
    assert shown["link"]["state"] == "ok"
    assert shown["customer"]["name"] == contact["name"]
    assert shown["customer"]["first_name"] == contact["name"].split(" ")[0]


def test_the_page_sends_the_token_in_a_header_so_the_apis_log_holds_none(client):
    contact, token = as_customer(client)
    item = mk(client, name="Cable", name_ar="كابل", price=1000)
    group = make_group(client)
    set_price(client, item, group, 800)
    put_in(client, contact, group)
    shown = client.get(STORE, headers={"x-order-link": token}).json()
    assert shown["customer"]["name"] == contact["name"] and shown["link"]["state"] == "ok"
    assert next(p for p in shown["products"] if p["id"] == item["id"])["price"] == 800
    one = client.get(f"{STORE}/items/{item['id']}", headers={"x-order-link": token}).json()
    assert one["item"]["price"] == 800
    # A wrong one in the header is the same as a wrong one anywhere.
    bad = client.get(STORE, headers={"x-order-link": tamper(token)}).json()
    assert (bad["customer"], bad["link"]["state"]) == (None, "invalid")


def test_a_tampered_or_foreign_token_opens_the_public_page_and_says_so(client):
    contact, token = as_customer(client)
    for bad in (tamper(token), mint(contact["id"], uuid4()), "nonsense"):
        shown = client.get(STORE, params={"t": bad}).json()
        assert shown["customer"] is None
        assert shown["link"]["state"] == "invalid"
        assert "WhatsApp" in shown["link"]["message"] and shown["link"]["message_ar"]


def test_an_expired_token_says_how_to_get_a_new_link(client):
    contact = people(client, 1)[0]
    old = links.mint(DEMO_TENANT_ID, UUID(contact["id"]), now=1_000_000.0)
    shown = client.get(STORE, params={"t": old}).json()
    assert (shown["customer"], shown["link"]["state"]) == (None, "expired")
    assert "expired" in shown["link"]["message"] and "WhatsApp" in shown["link"]["message"]
    refused = client.post(f"{STORE}/orders", json={
        "token": old, "payment": "link", "items": [{"product_id": str(uuid4()), "quantity": 1}],
    })
    assert (refused.status_code, detail(refused)["code"]) == (403, "expired_link")
    assert detail(refused)["message_ar"]


def test_a_bare_contact_id_grants_nothing(client):
    contact = people(client, 1)[0]
    item = mk(client, name="Cable", name_ar="كابل", price=1000)
    group = make_group(client)
    set_price(client, item, group, 800)
    put_in(client, contact, group)
    # The old link, the old checks: no customer, no group price, no ordering.
    shown = client.get(STORE, params={"c": contact["id"]}).json()
    assert shown["customer"] is None and shown["group"]["is_default"] is True
    assert next(p for p in shown["products"] if p["id"] == item["id"])["price"] == 1000
    assert page(client, contact)["group"]["is_default"] is False  # with the token it is theirs
    body = {"contact_id": contact["id"], "payment": "link", "items": [line(item)]}
    assert client.post(f"{STORE}/orders", json=body).status_code == 422
    assert client.post(f"{STORE}/orders/repeat",
                       json={"contact_id": contact["id"], "payment": "link"}).status_code == 422
    checked = client.post(f"{STORE}/cart/check",
                          json={"items": [line(item)], "contact_id": contact["id"]}).json()
    assert checked["group"]["is_default"] is True and checked["lines"][0]["unit_price"] == 1000


def test_a_forged_token_cannot_order_or_see_group_prices(client):
    contact = people(client, 1)[0]
    item = mk(client, name="Cable", name_ar="كابل", price=1000)
    forged = tamper(mint(contact["id"]))
    refused = client.post(f"{STORE}/orders", json={
        "token": forged, "payment": "link", "items": [line(item)],
    })
    assert (refused.status_code, detail(refused)["code"]) == (403, "bad_link")
    assert detail(refused)["message_ar"] and "WhatsApp" in detail(refused)["message"]
    repeat = client.post(f"{STORE}/orders/repeat", json={"token": forged, "payment": "link"})
    assert (repeat.status_code, detail(repeat)["code"]) == (403, "bad_link")
    checked = client.post(f"{STORE}/cart/check", json={"items": [line(item)], "token": forged})
    assert checked.status_code == 403
    assert client.get("/api/orders").json()["orders"] == []


def test_an_order_without_a_token_is_refused(client):
    item = mk(client)
    assert client.post(f"{STORE}/orders", json={
        "payment": "link", "items": [line(item)]}).status_code == 422


def test_a_token_for_another_shop_orders_nothing_here(client):
    contact = people(client, 1)[0]
    item = mk(client)
    foreign = mint(contact["id"], tenant_id=uuid4())
    refused = client.post(f"{STORE}/orders", json={
        "token": foreign, "payment": "link", "items": [line(item)]})
    assert (refused.status_code, detail(refused)["code"]) == (403, "bad_link")


def test_the_chat_sends_a_token_and_the_link_it_sends_works(client):
    reply = say(client, AHMED_PHONE, "order")[-1]["body"]
    token = reply.split("?t=")[1].split()[0]
    link = links.read(token, DEMO_TENANT_ID)
    ahmed = customer(client)
    assert str(link.contact_id) == ahmed["id"] and link.table == ""
    assert ahmed["id"] not in reply and f"/s/{DEMO_SLUG}?t=" in reply


def test_a_public_item_or_category_link_never_carries_a_customer(client):
    """The preview address the API builds for sharing has the item, the category or the
    table and nothing about a person."""
    item = mk(client, name="Karak", name_ar="كرك", price=300, category="Drinks")
    for query in ({"item": item["id"]}, {"category": "Drinks"}, {}):
        shared = client.get(f"{STORE}/share", params=query).json()
        assert "?t=" not in shared["url"] and "?c=" not in shared["url"]
        assert "&t=" not in shared["url"] and "contact" not in shared["url"]
