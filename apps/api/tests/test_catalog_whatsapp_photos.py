"""The shop's staff numbers (who may change the Catalog by WhatsApp) and photos that staff send
(ALY-106, D-039): registered in the workspace by the owner, a photo with a caption becomes a
draft item through the same photo pipeline as an upload, and an owner puts it on sale.
The "download" is the simulator's own: nothing reaches Meta."""

from uuid import uuid4

import pytest

from alyr.channels import meta
from alyr.channels.base import Choice, OutboundMessage
from alyr.config import get_settings
from alyr.modules.items import wa_photo
from alyr.modules.items.wa_photo import Caption, parse_caption
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID, OWNER_PHONE, STAFF_PHONE
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    ARABIC,
    STRANGER,
    YUSUF,
    catalog_module_on,
    choices,
    contact_id,
    sent,
    talk,
    undo_id,
)
from photo_files import photo
from test_consent import conversation, owner_sql
from test_items import fresh, mk
from test_sign_in import other_shop_with_owner, sign_in

NEWCOMER = "97455500777"


def send_photo(client, phone, caption="", data=None, content_type="image/jpeg") -> list[dict]:
    """A phone sends a photo with a caption; returns what the shop sent back."""
    before = len(conversation(client, phone))
    answer = client.post(
        "/sim/photos", params={"from_number": phone, "caption": caption},
        content=photo(640, 480, 3) if data is None else data,
        headers={"content-type": content_type},
    )
    assert answer.status_code == 200, answer.text
    return [m for m in answer.json()["messages"][before:] if m["direction"] == "out"]


def drafts(client) -> list[dict]:
    return [i for i in client.get("/api/items", params={"filter": "draft"}).json()["items"]]


# ── registering staff numbers ────────────────────────────────────────────────────────


def test_the_owner_registers_changes_and_removes_a_staff_number(client):
    start = {n["name"] for n in client.get("/api/staff-numbers").json()["numbers"]}
    assert start == {YUSUF, "Fatima (owner)"}

    made = client.post("/api/staff-numbers", json={
        "name": "  Layla  ", "phone": "+974 5550 0777", "lang": "ar", "manager": True,
    })
    assert made.status_code == 200, made.text
    number = made.json()
    assert (number["name"], number["phone"], number["lang"], number["manager"]) == (
        "Layla", NEWCOMER, "ar", True)
    # Registering is the agreement to be told about the shop's own stock and money.
    assert owner_sql("select consent_service from contacts where phone = $1", NEWCOMER)[0][0] == (
        "granted")

    changed = client.put(
        f"/api/staff-numbers/{number['id']}", json={"manager": False, "lang": "en"}
    )
    assert changed.json()["manager"] is False and changed.json()["lang"] == "en"

    assert client.delete(f"/api/staff-numbers/{number['id']}").json() == {"removed": True}
    assert NEWCOMER not in [n["phone"] for n in client.get("/api/staff-numbers").json()["numbers"]]
    # It is an ordinary customer from then on, and the history stays.
    row = owner_sql("select role, catalog_manager from contacts where phone = $1", NEWCOMER)[0]
    assert (row["role"], row["catalog_manager"]) == ("customer", False)
    assert client.delete(f"/api/staff-numbers/{number['id']}").status_code == 404


def test_phone_numbers_are_read_in_the_forms_people_write_them(client):
    for written in ("00974 5550 0777", "974-5550-0777", "(974) 55500777", "٩٧٤٥٥٥٠٠٧٧٧"):
        made = client.post("/api/staff-numbers", json={"name": "Layla", "phone": written})
        assert made.json()["phone"] == NEWCOMER, written
    # Four spellings, one contact.
    assert owner_sql("select count(*) from contacts where phone = $1", NEWCOMER)[0][0] == 1
    for bad in ("hello", "123", "5550", "5" * 20):
        refused = client.post("/api/staff-numbers", json={"name": "Layla", "phone": bad})
        assert refused.status_code == 422 and refused.json()["detail"]["code"] == "bad_phone", bad


def test_registering_a_customers_number_makes_it_staff_and_keeps_the_history(client):
    from test_consent import ahmed

    before = ahmed(client)
    made = client.post("/api/staff-numbers", json={"name": "Ahmed", "phone": before["phone"]})
    assert made.status_code == 200
    assert owner_sql("select role from contacts where phone = $1", before["phone"])[0][0] == "staff"
    assert owner_sql(
        "select count(*) from ledger_entries e join contacts c on c.id = e.contact_id "
        "where c.phone = $1", before["phone"],
    )[0][0] > 0


def test_a_registered_number_can_use_the_commands_at_once_and_a_manager_gets_alerts(client):
    item = mk(client, name="Shawarma", name_ar="شاورما")
    before = talk(client, NEWCOMER, "sold out shawarma")
    assert "sold out" not in " ".join(m["body"] for m in before)
    assert fresh(client, item)["available"] is True

    client.post("/api/staff-numbers", json={"name": "Layla", "phone": NEWCOMER})
    assert "now sold out" in talk(client, NEWCOMER, "sold out shawarma")[-1]["body"]
    assert fresh(client, item)["available"] is False
    # The record names her, not the number.
    log = client.get(f"/api/items/{item['id']}/activity").json()["activity"]
    assert log[0]["actor"]["name"] == "Layla" and log[0]["detail"]["via"] == "whatsapp"


def test_only_owners_and_admins_manage_the_staff_numbers(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    assert client.get("/api/staff-numbers").status_code == 401
    sign_in(client, AGENT_EMAIL)
    assert client.get("/api/staff-numbers").status_code == 403
    assert client.post(
        "/api/staff-numbers", json={"name": "Layla", "phone": NEWCOMER}
    ).status_code == 403
    sign_in(client)
    assert client.get("/api/staff-numbers").status_code == 200


def test_one_shop_cannot_see_or_change_anothers_staff_numbers(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    # A person of their own, so earlier tests' other shops do not share the sign-in.
    email = f"omar-{uuid4().hex[:8]}@other.example"
    other = other_shop_with_owner(email)
    owner_sql(
        "insert into contacts (tenant_id, phone, name, role) values ($1, '97455500888', "
        "'Their Yusuf', 'staff')", other,
    )
    # Building a client puts the demo shop back to its start, so both are built first.
    mine_client, theirs = client_factory(), client_factory()
    sign_in(mine_client)
    sign_in(theirs, email)
    mine = mine_client.get("/api/staff-numbers").json()["numbers"]
    assert "Their Yusuf" not in [n["name"] for n in mine]
    assert [n["name"] for n in theirs.get("/api/staff-numbers").json()["numbers"]] == [
        "Their Yusuf"]
    for number in mine:
        assert theirs.put(
            f"/api/staff-numbers/{number['id']}", json={"name": "x"}
        ).status_code == 404
        assert theirs.delete(f"/api/staff-numbers/{number['id']}").status_code == 404
    assert owner_sql("select count(*) from contacts where role = 'staff' and tenant_id = $1",
                     DEMO_TENANT_ID)[0][0] == len(mine)
    # A number registered in the other shop does not make a staff member here.
    theirs.post("/api/staff-numbers", json={"name": "Omar's cousin", "phone": NEWCOMER})
    after = mine_client.get("/api/staff-numbers").json()["numbers"]
    assert NEWCOMER not in [n["phone"] for n in after]


# ── a photo and its caption ──────────────────────────────────────────────────────────


def test_parse_caption_reads_the_name_in_each_language_and_the_price():
    assert parse_caption("Mixed grill 35") == Caption("Mixed grill", "", 3500)
    assert parse_caption("Mixed grill QAR 35.5") == Caption("Mixed grill", "", 3550)
    assert parse_caption("Mixed grill 35 QAR") == Caption("Mixed grill", "", 3500)
    assert parse_caption("Mixed grill | مشاوي مشكلة 35") == Caption(
        "Mixed grill", "مشاوي مشكلة", 3500)
    # Arabic only: kept as both names, as the workspace does; Eastern digits are read.
    assert parse_caption("شاورما دجاج ١٢ ريال") == Caption("شاورما دجاج", "شاورما دجاج", 1200)
    # A number that is part of the name is not the price unless it is last.
    assert parse_caption("Cable 2.5 mm roll 225") == Caption("Cable 2.5 mm roll", "", 22500)
    assert parse_caption("Cable 2.5 mm roll") == Caption("Cable 2.5 mm roll", "", None)
    assert parse_caption("Fresh dates") == Caption("Fresh dates", "", None)
    assert parse_caption("") == Caption("", "", None)
    assert parse_caption("12") == Caption("", "", 1200)


def test_a_photo_with_a_caption_becomes_a_draft_with_the_name_and_price(client):
    reply = send_photo(client, STAFF_PHONE, "Mixed grill 35")[-1]
    [draft] = drafts(client)
    assert (draft["name"], draft["price"], draft["status"]) == ("Mixed grill", 3500, "draft")
    assert draft["cover"]["state"] in ("ready", "pending") and len(draft["photos"]) == 1
    # Never for sale until an owner says so.
    assert client.get("/api/store/al-noor").json()["products"][-1]["name"] != "Mixed grill"
    assert "Saved as a draft: Mixed grill, QAR 35" in reply["body"]
    assert "until an owner confirms" in reply["body"] and choices(reply)[0]["title"] == "Undo"
    # The photo went through the pipeline: three sizes, stored under the shop's folder.
    assert owner_sql("select count(*) from media_assets")[0][0] == 1
    # The record says who and how.
    log = client.get(f"/api/items/{draft['id']}/activity").json()["activity"]
    assert log[-1]["actor"]["name"] == YUSUF and log[-1]["detail"]["via"] == "whatsapp"


def test_a_photo_with_an_arabic_caption(client):
    reply = send_photo(client, STAFF_PHONE, "شاورما دجاج ١٢")[-1]
    [draft] = drafts(client)
    assert (draft["name"], draft["name_ar"], draft["price"]) == ("شاورما دجاج", "شاورما دجاج", 1200)
    assert ARABIC.search(reply["body"]) and "حُفظت كمسودة" in reply["body"]


def test_a_photo_without_a_full_caption_is_still_a_draft(client):
    plain = send_photo(client, STAFF_PHONE, "")[-1]
    assert "no name and no price yet" in plain["body"]
    only_name = send_photo(client, STAFF_PHONE, "Fresh dates", photo(640, 480, 5))[-1]
    assert "no price yet" in only_name["body"]
    names = sorted(d["name"] for d in drafts(client))
    assert names == ["", "Fresh dates"]


def test_the_same_photo_twice_is_one_draft(client):
    send_photo(client, STAFF_PHONE, "Mixed grill 35")
    again = send_photo(client, STAFF_PHONE, "Mixed grill 35")[-1]
    assert "already on Mixed grill" in again["body"]
    assert len(drafts(client)) == 1


def test_a_manager_is_asked_to_put_it_on_sale_and_only_with_an_arabic_name(client):
    reply = send_photo(client, OWNER_PHONE, "Mixed grill | مشاوي مشكلة 35")[-1]
    assert "Put it on sale?" in reply["body"]
    on_sale = next(c for c in choices(reply) if c["id"].startswith("on_sale:"))
    assert on_sale["title"] == "Put on sale"
    done = talk(client, OWNER_PHONE, reply_id=on_sale["id"])[-1]
    assert "Mixed grill is on sale at QAR 35" in done["body"]
    [item] = [i for i in client.get("/api/items").json()["items"] if i["name"] == "Mixed grill"]
    assert item["status"] == "live"
    # Undo takes it back to a draft.
    back = talk(client, OWNER_PHONE, reply_id=undo_id(done))[-1]
    assert "draft again" in back["body"] and fresh(client, item)["status"] == "draft"


def test_an_item_without_an_arabic_name_cannot_go_on_sale_by_message(client):
    reply = send_photo(client, OWNER_PHONE, "Mixed grill 35", photo(640, 480, 8))[-1]
    on_sale = next(c for c in choices(reply) if c["id"].startswith("on_sale:"))
    refused = talk(client, OWNER_PHONE, reply_id=on_sale["id"])[-1]
    assert "needs its Arabic name" in refused["body"]
    [draft] = drafts(client)
    assert draft["status"] == "draft"


def test_only_a_manager_can_put_a_draft_on_sale_and_managers_are_told_of_it(client):
    talk(client, OWNER_PHONE, "hello")  # Fatima has written today: her window is open
    reply = send_photo(client, STAFF_PHONE, "Mixed grill | مشاوي 35")[-1]
    assert not any(c["id"].startswith("on_sale:") for c in choices(reply))
    [draft] = drafts(client)
    told = sent(client, OWNER_PHONE)[-1]
    assert told["kind"] == "text"
    assert "Yusuf (counter) sent a photo for a new item: Mixed grill, QAR 35" in told["body"]
    # Yusuf cannot do it himself, even by sending the button's answer.
    refused = talk(client, STAFF_PHONE, reply_id=f"on_sale:{draft['id']}")[-1]
    assert "Only an owner can put an item on sale" in refused["body"]
    assert fresh(client, draft)["status"] == "draft"


def test_a_manager_whose_window_is_closed_is_told_by_template(client):
    send_photo(client, STAFF_PHONE, "Mixed grill 35")
    told = sent(client, OWNER_PHONE)[-1]
    assert told["kind"] == "text" or told["payload"].get("template") == "draft_added"
    assert told["payload"]["template"] == "draft_added" and told["payload"]["category"] == "utility"
    assert told["payload"]["params"] == ["Al Noor Electricals", "Yusuf (counter)",
                                         "Mixed grill, QAR 35"]
    assert "New item draft at Al Noor Electricals" in told["body"]
    # Yusuf made it himself: the sender is not told about their own draft.
    assert all("sent a photo" not in m["body"] for m in sent(client, STAFF_PHONE))


def test_the_undo_of_a_photo_removes_the_draft_and_keeps_the_photo(client):
    reply = send_photo(client, STAFF_PHONE, "Mixed grill 35")[-1]
    undone = talk(client, STAFF_PHONE, reply_id=undo_id(reply))[-1]
    assert "the draft is removed" in undone["body"] and drafts(client) == []
    assert owner_sql("select count(*) from media_assets where state <> 'removed'")[0][0] == 1
    assert owner_sql("select count(*) from media_links")[0][0] == 0


def test_a_photo_that_cannot_be_used_is_refused_in_the_staff_member_language(client):
    refused = send_photo(client, STAFF_PHONE, "Mixed grill 35", b"not a picture")[-1]
    assert drafts(client) == [] and refused["body"]
    arabic = send_photo(client, STAFF_PHONE, "شاورما ١٢", b"not a picture either")[-1]
    assert ARABIC.search(arabic["body"]) and drafts(client) == []


def test_a_photo_from_a_number_that_is_not_registered_is_ignored(client):
    answer = send_photo(client, STRANGER, "Mixed grill 35")
    assert drafts(client) == [] and owner_sql("select count(*) from media_assets")[0][0] == 0
    # The stranger is answered like any customer: no draft, no mention of one.
    assert all("draft" not in m["body"].lower() for m in answer)
    # A customer's photo with a question in the caption is just a message to the shop.
    assert owner_sql("select count(*) from staff_changes")[0][0] == 0


def test_the_photo_cap_stops_a_draft_and_says_so(client):
    client.app.state.media.settings.catalog_max_items = 1
    # The demo shop already has more than one item, so it is over a limit of one.
    reply = send_photo(client, STAFF_PHONE, "Mixed grill 35")[-1]
    assert "cannot hold more items or photos" in reply["body"] and drafts(client) == []


def test_a_download_that_keeps_failing_tells_the_staff_member_to_send_it_again(client):
    handler = wa_photo.PhotoDrafts(
        client.app.state.db, client.app.state.outbound, client.app.state.media, get_settings()
    )
    payload = {"contact_id": contact_id(STAFF_PHONE), "channel": "simulator",
               "media_id": "sim-in-gone", "mime_type": "image/jpeg", "caption": "x",
               "message_id": "m1", "lang": "en"}
    with pytest.raises(LookupError):  # the job fails, and is tried again later
        client.portal.call(handler.run, DEMO_TENANT_ID, payload)
    client.portal.call(handler.gave_up, DEMO_TENANT_ID, payload)  # after the last try
    last = sent(client, STAFF_PHONE)[-1]
    assert "could not get that photo" in last["body"]
    client.portal.call(handler.gave_up, DEMO_TENANT_ID, {**payload, "lang": "ar"})
    assert ARABIC.search(sent(client, STAFF_PHONE)[-1]["body"])


def test_a_number_removed_from_staff_before_its_photo_is_fetched_makes_no_draft(client):
    handler = wa_photo.PhotoDrafts(
        client.app.state.db, client.app.state.outbound, client.app.state.media, get_settings()
    )
    channel = client.app.state.outbound.channels["simulator"]
    channel.keep("sim-in-late", photo(640, 480, 9), "image/jpeg")
    payload = {"contact_id": contact_id(STAFF_PHONE), "channel": "simulator",
               "media_id": "sim-in-late", "mime_type": "image/jpeg", "caption": "Soup 8",
               "message_id": "m2", "lang": "en"}
    client.delete(f"/api/staff-numbers/{contact_id(STAFF_PHONE)}")
    client.portal.call(handler.run, DEMO_TENANT_ID, payload)
    assert drafts(client) == []


# ── the channel: what Meta sends and what we send ────────────────────────────────────


def test_meta_image_messages_are_read_with_their_caption_and_file_id():
    payload = {"entry": [{"changes": [{"value": {
        "metadata": {"phone_number_id": "100200300"},
        "contacts": [{"wa_id": "97455500100", "profile": {"name": "Yusuf"}}],
        "messages": [{
            "from": "97455500100", "id": "wamid.1", "timestamp": "1744344496", "type": "image",
            "image": {"caption": "Mixed grill 35", "mime_type": "image/jpeg",
                      "sha256": "abc", "id": "1003383421387256"},
        }],
    }}]}]}
    [message] = meta.parse_webhook(payload)
    assert (message.kind, message.text, message.media_id, message.mime_type) == (
        "image", "Mixed grill 35", "1003383421387256", "image/jpeg")


def test_buttons_can_carry_a_picture_and_lists_describe_their_rows_in_either_language():
    address = meta.Address(phone="97455500001")
    shown = meta.to_graph_payload(OutboundMessage(
        to=uuid4(), kind="buttons", body="*Shawarma*\nQAR 12", media_id="MEDIA1",
        choices=(Choice("order", "Order"),),
    ), address)
    assert shown["interactive"]["header"] == {"type": "image", "image": {"id": "MEDIA1"}}
    first = shown["interactive"]["action"]["buttons"][0]["reply"]
    assert first == {"id": "order", "title": "Order"}
    plain = meta.to_graph_payload(OutboundMessage(
        to=uuid4(), kind="buttons", body="x", choices=(Choice("a", "A"),)), address)
    assert "header" not in plain["interactive"]

    rows = (Choice("item:1", "Shawarma", "QAR 12"), Choice("item:2", "Falafel"))
    english = meta.to_graph_payload(
        OutboundMessage(to=uuid4(), kind="list", body="Menu", choices=rows), address)
    action = english["interactive"]["action"]
    assert action["button"] == "Choose"
    assert action["sections"][0]["rows"] == [
        {"id": "item:1", "title": "Shawarma", "description": "QAR 12"},
        {"id": "item:2", "title": "Falafel"},
    ]
    arabic = meta.to_graph_payload(
        OutboundMessage(to=uuid4(), kind="list", body="القائمة", choices=rows, lang="ar"), address)
    assert arabic["interactive"]["action"]["button"] == "اختر"


def test_a_message_can_only_carry_a_png_or_a_jpeg():
    with pytest.raises(ValueError):
        OutboundMessage(to=uuid4(), kind="image", image=b"x", image_type="image/webp")


def test_meta_downloads_a_file_in_two_steps_with_the_token_and_a_size_limit(monkeypatch):
    import asyncio

    import httpx

    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.path, request.headers.get("authorization")))
        if request.url.host == "graph.facebook.com":
            return httpx.Response(200, json={
                "url": "https://lookaside.example/file", "mime_type": "image/jpeg",
                "file_size": 11, "id": "42",
            })
        return httpx.Response(200, content=b"hello world")

    real = httpx.AsyncClient
    monkeypatch.setattr(
        meta.httpx, "AsyncClient",
        lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs),
    )
    channel = meta.MetaChannel("TOKEN", "v21.0")
    data, kind = asyncio.run(channel.download_media("42", 100))
    assert (data, kind) == (b"hello world", "image/jpeg")
    assert seen == [("/v21.0/42", "Bearer TOKEN"), ("/file", "Bearer TOKEN")]
    with pytest.raises(ValueError):
        asyncio.run(channel.download_media("42", 5))


def test_inbound_messages_keep_the_file_id_for_a_photo(client):
    send_photo(client, STAFF_PHONE, "Mixed grill 35")
    row = owner_sql(
        "select body, payload->>'media_id' as media_id from messages "
        "where direction = 'in' and kind = 'image'"
    )[-1]
    assert row["body"] == "Mixed grill 35" and row["media_id"].startswith("sim-in-")
