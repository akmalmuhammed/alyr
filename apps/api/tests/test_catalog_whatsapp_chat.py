"""The Catalog in a customer's chat (ALY-106, D-039): an item's photo with its price and an
Order button, the menu, and "tell me when it is back" (plan scenario 13: told once when stock
returns, and only if the customer agreed). English and Arabic. Nothing reaches Meta."""

import re
from uuid import uuid4

from alyr.seed import AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID, STAFF_PHONE
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    ARABIC,
    catalog_module_on,
    choices,
    sent,
    talk,
    window_closed,
)
from photo_files import photo
from test_consent import owner_sql, say
from test_items import counted, fresh, line, mk, on_shop, order, people
from test_media import upload

BILAL_PHONE = "97455500002"


def with_photo(client, item: dict, seed: int = 1) -> dict:
    """Give an item a stored photo (the store is local disk, so it is ready at once)."""
    asset = upload(client, photo(640, 480, seed)).json()["photo"]["id"]
    attached = client.post(f"/api/items/{item['id']}/photos", json={"asset_id": asset})
    assert attached.status_code == 200
    return item


def picture_sent_with(phone: str) -> list[tuple]:
    """(content type, size) of each picture the shop has sent to a phone."""
    return [
        (r["content_type"], len(r["data"])) for r in owner_sql(
            "select mm.content_type, mm.data from message_media mm "
            "join messages m on m.id = mm.message_id join contacts c on c.id = m.contact_id "
            "where c.phone = $1 order by m.created_at", phone,
        )
    ]


def stock_of(client, item):
    """Running stock of the item's only size."""
    return fresh(client, item)["variants"][0]["on_hand"]


# ── an item in the chat ──────────────────────────────────────────────────────────────


def test_an_item_name_brings_its_photo_with_the_price_and_an_order_button(client):
    item = with_photo(client, mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج",
                                 price=1200, description="Wrapped in warm bread"))
    card = talk(client, AHMED_PHONE, "shawarma")[-1]
    assert card["kind"] == "buttons"
    assert card["body"].startswith("*Chicken Shawarma*\nWrapped in warm bread\nQAR 12")
    assert choices(card) == [{"id": "order", "title": "Order"}]
    # The picture travels with it, as a JPEG (WhatsApp takes no WebP).
    [(kind, size)] = picture_sent_with(AHMED_PHONE)
    assert kind == "image/jpeg" and size > 1000
    # Tapping Order gives the order link, as it always did.
    link = talk(client, AHMED_PHONE, reply_id="order")[-1]
    assert f"/s/{DEMO_SLUG}?c=" in link["body"]
    assert fresh(client, item)["status"] == "live"


def test_the_same_in_arabic_with_arabic_spellings_and_small_talk(client):
    with_photo(client, mk(client, name="Rice", name_ar="أرز", price=800))
    card = talk(client, AHMED_PHONE, "عندكم ارز؟")[-1]  # no hamza, and "do you have"
    assert card["body"].startswith("*أرز*\nQAR 8") and choices(card) == [
        {"id": "order", "title": "اطلب"}]
    assert picture_sent_with(AHMED_PHONE)


def test_small_talk_around_the_name_is_ignored_but_other_words_are_not(client):
    mk(client, name="Falafel", name_ar="فلافل", price=500)
    assert "*Falafel*" in talk(client, AHMED_PHONE, "Do you have falafel please?")[-1]["body"]
    assert "*Falafel*" in talk(client, AHMED_PHONE, "how much is the falafl")[-1]["body"]
    ordinary = talk(client, AHMED_PHONE, "blah blah")[-1]
    # A sentence that merely contains the name is not a request for the item.
    other = talk(client, AHMED_PHONE, "I will collect the falafel tomorrow morning at nine")[-1]
    assert other["body"] == ordinary["body"]


def test_an_item_without_a_photo_is_sent_without_one(client):
    mk(client, name="Falafel", name_ar="فلافل", price=500)
    card = talk(client, AHMED_PHONE, "falafel")[-1]
    assert card["kind"] == "buttons" and "QAR 5" in card["body"]
    assert picture_sent_with(AHMED_PHONE) == []


def test_an_item_whose_photo_is_not_stored_yet_is_sent_without_it(client):
    item = with_photo(client, mk(client, name="Falafel", name_ar="فلافل"))
    owner_sql("update media_assets set state = 'pending'")
    card = talk(client, AHMED_PHONE, "falafel")[-1]
    assert card["kind"] == "buttons" and picture_sent_with(AHMED_PHONE) == []
    assert fresh(client, item)["cover"]["state"] == "pending"


def test_the_card_shows_a_sale_a_choice_of_sizes_and_a_nearly_gone_item(client):
    mk(client, name="Abaya", name_ar="عباية", price=15000, sale_price=12000,
       stock_rule="count", variants=[
           {"name": "S", "name_ar": "S", "opening_stock": 2, "price_delta": 0},
           {"name": "L", "name_ar": "L", "opening_stock": 1, "price_delta": 1000}])
    card = talk(client, AHMED_PHONE, "abaya")[-1]
    assert "from QAR 120 (was QAR 150)" in card["body"]
    assert "Choices: S, L" in card["body"] and "Only 3 left" in card["body"]


def test_an_item_that_is_not_for_sale_is_never_shown(client):
    mk(client, name="Hummus", name_ar="حمص", status="draft")
    mk(client, name="Tahini", name_ar="طحينة", status="hidden")
    ordinary = talk(client, AHMED_PHONE, "blah blah")[-1]
    assert talk(client, AHMED_PHONE, "hummus")[-1]["body"] == ordinary["body"]
    assert talk(client, AHMED_PHONE, "tahini")[-1]["body"] == ordinary["body"]


def test_several_items_fit_so_the_customer_picks_one(client):
    chicken = mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج", price=1200)
    mk(client, name="Beef Shawarma", name_ar="شاورما لحم", price=1500)
    mk(client, name="Falafel", name_ar="فلافل")
    asked = talk(client, AHMED_PHONE, "shawarma")[-1]
    assert asked["kind"] == "list"
    rows = choices(asked)
    assert [r["title"] for r in rows] == ["Beef Shawarma", "Chicken Shawarma"]
    assert [r["description"] for r in rows] == ["QAR 15", "QAR 12"]
    picked = talk(client, AHMED_PHONE, reply_id=f"item:{chicken['id']}")[-1]
    assert picked["body"].startswith("*Chicken Shawarma*")


def only_my_items():
    """The demo shop sells twelve electrical items too; put them away so a menu is just mine."""
    owner_sql("update items set status = 'archived' where category <> ''")


def test_menu_lists_what_can_be_ordered_with_the_order_link(client):
    only_my_items()
    mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج", price=1200)
    mk(client, name="Falafel", name_ar="فلافل", price=500)
    off = mk(client, name="Hummus", name_ar="حمص", price=600)
    client.post(f"/api/items/{off['id']}/switch", json={"available": False})
    menu = talk(client, AHMED_PHONE, "menu")[-1]
    assert menu["kind"] == "list" and re.search(rf"/s/{DEMO_SLUG}\?c=\S+", menu["body"])
    assert menu["body"].startswith("Here is our menu from Al Noor Electricals")
    titles = [r["title"] for r in choices(menu)]
    assert titles == ["Chicken Shawarma", "Falafel"]  # what can be ordered now, in menu order
    assert all(r["id"].startswith("item:") for r in choices(menu))
    assert [r["description"] for r in choices(menu)] == ["QAR 12", "QAR 5"]
    # Tapping a row shows the item.
    first = choices(menu)[0]["id"]
    assert talk(client, AHMED_PHONE, reply_id=first)[-1]["body"].startswith("*Chicken Shawarma*")
    # The same word with small talk around it, and in Arabic.
    assert talk(client, AHMED_PHONE, "show me the menu")[-1]["kind"] == "list"
    arabic = talk(client, AHMED_PHONE, "القائمة")[-1]
    assert arabic["kind"] == "list" and arabic["body"].startswith("هذه قائمة النور للكهربائيات")
    assert [r["title"] for r in choices(arabic)] == ["شاورما دجاج", "فلافل"]


def test_menu_is_ten_rows_at_most_and_says_where_the_rest_is(client):
    only_my_items()
    for n in range(12):
        mk(client, name=f"Dish {n:02d}", name_ar=f"طبق {n}", price=500 + n)
    menu = talk(client, AHMED_PHONE, "menu")[-1]
    assert len(choices(menu)) == 10 and "Here are some items from" in menu["body"]
    assert "/s/" in menu["body"]


def test_a_menu_with_nothing_to_order_gives_the_order_link_as_before(client):
    owner_sql("update items set status = 'archived'")
    assert "/s/" in talk(client, AHMED_PHONE, "menu")[-1]["body"]


def test_everything_else_in_the_chat_works_as_before(client):
    mk(client, name="Falafel", name_ar="فلافل")
    assert "/s/" in talk(client, AHMED_PHONE, "I want to order")[-1]["body"]
    assert "QAR 1,850" in talk(client, AHMED_PHONE, "balance")[-1]["body"]
    assert "Welcome" in talk(client, AHMED_PHONE, "hello")[-1]["body"]
    # With the module off nothing about items is offered, and "menu" is the order link again.
    owner_sql("update tenant_modules set enabled = false where module_key = 'catalog'")
    assert "Falafel" not in talk(client, AHMED_PHONE, "falafel")[-1]["body"]
    assert "/s/" in talk(client, AHMED_PHONE, "menu")[-1]["body"]


# ── tell me when it is back (scenario 13) ────────────────────────────────────────────


def sold_out_shawarma(client) -> dict:
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    talk(client, STAFF_PHONE, "sold out shawarma")
    assert fresh(client, item)["available"] is False
    return item


def watches(status: str | None = None) -> list:
    sql = "select w.status, w.reason, c.phone from stock_watches w join contacts c " \
          "on c.id = w.contact_id"
    if status:
        return owner_sql(sql + " where w.status = $1", status)
    return owner_sql(sql)


def agree(client, phone, item, text="tell me when shawarma is back"):
    asked = talk(client, phone, text)[-1]
    yes = next(c for c in choices(asked) if c["id"].startswith("notify_yes:"))
    return asked, talk(client, phone, reply_id=yes["id"])[-1]


def test_a_sold_out_item_offers_to_tell_the_customer_when_it_is_back(client):
    item = sold_out_shawarma(client)
    card = talk(client, AHMED_PHONE, "shawarma")[-1]
    assert "Sold out right now." in card["body"]
    assert choices(card) == [{"id": f"notify:{item['id']}", "title": "Tell me when back"}]


def test_scenario_13_the_customer_agrees_once_and_is_told_once_when_it_is_back(client):
    item = sold_out_shawarma(client)
    asked, done = agree(client, AHMED_PHONE, item)
    # The agreement is asked plainly, with who it is from and how to stop.
    assert "agree to get that one message from Al Noor Electricals" in asked["body"]
    assert "not a subscription" in asked["body"]
    assert "STOP" in asked["body"] and [c["title"] for c in choices(asked)] == [
        "Yes, tell me", "No thanks"]
    assert "I will message you once when Shawarma is back" in done["body"]
    # Recorded like every other consent: what they were shown, where, and when.
    [row] = owner_sql(
        "select s.purpose, s.status, s.source, s.wording from consents s "
        "join contacts c on c.id = s.contact_id where c.phone = $1 and s.source = $2",
        AHMED_PHONE, "back_in_stock_request",
    )
    # A purpose of its own: asking to be told about one item is not marketing consent.
    assert (row["purpose"], row["status"]) == ("back_in_stock", "granted")
    assert "agree to get that one message" in row["wording"]
    states = owner_sql(
        "select consent_marketing, consent_back_in_stock from contacts where phone = $1",
        AHMED_PHONE,
    )[0]
    assert (states["consent_marketing"], states["consent_back_in_stock"]) == (
        "unknown", "granted")
    assert [w["status"] for w in watches()] == ["waiting"]

    # Nothing is sent while it is still gone.
    before = len(sent(client, AHMED_PHONE))
    talk(client, AHMED_PHONE, "tell me when shawarma is back")  # already on the list
    assert len(sent(client, AHMED_PHONE)) == before + 1  # only the "already on the list"

    # Stock returns: staff say so, and the customer is told, once, in plain words.
    count = len(sent(client, AHMED_PHONE))
    talk(client, STAFF_PHONE, "back shawarma")
    told = sent(client, AHMED_PHONE)[count:]
    assert len(told) == 1 and told[0]["kind"] == "text"
    assert told[0]["body"].startswith("Good news from Al Noor Electricals: Shawarma is back")
    assert re.search(rf"/s/{DEMO_SLUG}\?c=\S+", told[0]["body"])
    assert [w["status"] for w in watches()] == ["sent"]

    # It sells out and comes back again: the request is closed, so there is no second message.
    talk(client, STAFF_PHONE, "sold out shawarma")
    talk(client, STAFF_PHONE, "back shawarma")
    client.post(f"/api/items/{item['id']}/switch", json={"available": True})
    assert len(sent(client, AHMED_PHONE)) == count + 1


def test_scenario_13_in_arabic(client):
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    talk(client, STAFF_PHONE, "نفذ شاورما")
    asked, done = agree(client, AHMED_PHONE, item, "بلغني لما يتوفر شاورما")
    assert "أوافق" not in asked["body"]
    assert "توافق على تلقي هذه الرسالة الواحدة من النور" in asked["body"]
    assert [c["title"] for c in choices(asked)] == ["نعم، أخبرني", "لا شكراً"]
    assert ARABIC.search(done["body"]) and "سأراسلك مرة واحدة عند توفر «شاورما»" in done["body"]
    count = len(sent(client, AHMED_PHONE))
    talk(client, STAFF_PHONE, "رجع شاورما")
    told = sent(client, AHMED_PHONE)[count:]
    assert len(told) == 1 and "أخبار سارة من النور للكهربائيات: عاد «شاورما» إلى المخزون" in (
        told[0]["body"])


def test_scenario_13_only_if_they_agreed(client):
    sold_out_shawarma(client)
    # One customer says no thanks, one never asks, one asks and then says no.
    asked = talk(client, AHMED_PHONE, "tell me when shawarma is back")[-1]
    no = next(c for c in choices(asked) if c["id"].startswith("notify_no:"))
    declined = talk(client, AHMED_PHONE, reply_id=no["id"])[-1]
    assert "I will not message you about Shawarma" in declined["body"]
    talk(client, BILAL_PHONE, "shawarma")  # looked, did not ask
    assert watches() == []
    assert not owner_sql("select 1 from consents where source = 'back_in_stock_request'")
    count = (len(sent(client, AHMED_PHONE)), len(sent(client, BILAL_PHONE)))
    talk(client, STAFF_PHONE, "back shawarma")
    assert (len(sent(client, AHMED_PHONE)), len(sent(client, BILAL_PHONE))) == count


def test_a_customer_who_already_agreed_to_messages_is_not_asked_again(client):
    item = sold_out_shawarma(client)
    agree(client, AHMED_PHONE, item)
    other = mk(client, name="Falafel", name_ar="فلافل")
    talk(client, STAFF_PHONE, "sold out falafel")
    done = talk(client, AHMED_PHONE, "tell me when falafel is back")[-1]
    assert done["kind"] == "text" and "I will message you once when Falafel is back" in done["body"]
    assert len(watches("waiting")) == 2 and fresh(client, other)["available"] is False


def test_outside_the_24_hour_window_it_is_a_marketing_template_to_someone_who_agreed(client):
    item = sold_out_shawarma(client)
    agree(client, AHMED_PHONE, item)
    window_closed(AHMED_PHONE)
    count = len(sent(client, AHMED_PHONE))
    talk(client, STAFF_PHONE, "back shawarma")
    [told] = sent(client, AHMED_PHONE)[count:]
    assert told["kind"] == "template" and told["status"] == "sent"
    assert told["payload"]["template"] == "back_in_stock"
    assert told["payload"]["category"] == "marketing"
    assert told["payload"]["params"][:2] == ["Al Noor Electricals", "Shawarma"]
    assert "Send STOP to stop these updates" in told["body"]
    assert [w["status"] for w in watches()] == ["sent"]


def test_a_template_is_not_sent_to_a_customer_who_no_longer_agrees(client):
    item = sold_out_shawarma(client)
    agree(client, AHMED_PHONE, item)
    window_closed(AHMED_PHONE)
    owner_sql(
        "update contacts set consent_back_in_stock = 'revoked' where phone = $1", AHMED_PHONE
    )
    count = len(sent(client, AHMED_PHONE))
    talk(client, STAFF_PHONE, "back shawarma")
    # Nothing is sent, in the window or out of it, and the request says why it was closed.
    assert len(sent(client, AHMED_PHONE)) == count
    [watch] = watches()
    assert (watch["status"], watch["reason"]) == ("not_sent", "no_back_in_stock_consent")


def test_saying_stop_closes_every_request(client):
    item = sold_out_shawarma(client)
    agree(client, AHMED_PHONE, item)
    assert "will not receive reminders" in talk(client, AHMED_PHONE, "STOP")[-1]["body"]
    assert [w["status"] for w in watches()] == ["cancelled"]
    # STOP takes back the narrow consent as well as the general ones, and logs each.
    log = owner_sql(
        "select s.purpose, s.status from consents s join contacts c on c.id = s.contact_id "
        "where c.phone = $1 and s.source = 'customer_message' order by s.created_at",
        AHMED_PHONE,
    )
    assert {(r["purpose"], r["status"]) for r in log} == {
        ("service", "revoked"), ("marketing", "revoked"), ("back_in_stock", "revoked")}
    states = owner_sql(
        "select consent_marketing, consent_back_in_stock from contacts where phone = $1",
        AHMED_PHONE,
    )[0]
    assert (states["consent_marketing"], states["consent_back_in_stock"]) == (
        "revoked", "revoked")
    count = len(sent(client, AHMED_PHONE))
    talk(client, STAFF_PHONE, "back shawarma")
    assert len(sent(client, AHMED_PHONE)) == count
    # Asking again after stopping is answered, not granted.
    talk(client, STAFF_PHONE, "sold out shawarma")
    asked = talk(client, AHMED_PHONE, "tell me when shawarma is back")[-1]
    assert "asked us to stop messages" in asked["body"] and not choices(asked)
    assert watches("waiting") == []


def test_asking_about_an_item_that_is_in_stock_gives_the_order_link_not_a_waiting_list(client):
    mk(client, name="Shawarma", name_ar="شاورما")
    answer = talk(client, AHMED_PHONE, "tell me when shawarma is back")[-1]
    assert "Shawarma is available now" in answer["body"] and "/s/" in answer["body"]
    assert watches() == []


def wait_for(client, phone, text, item_word="dates"):
    """A customer sees an item sold out, asks to be told, and agrees."""
    assert "Sold out right now." in talk(client, phone, item_word)[-1]["body"]
    asked = talk(client, phone, text)[-1]
    yes = next(c for c in choices(asked) if c["id"].startswith("notify_yes:"))
    talk(client, phone, reply_id=yes["id"])


def test_a_cancelled_order_gives_its_stock_back_and_the_waiting_customer_is_told(client):
    item = counted(client, 1, name="Dates", name_ar="تمر", price=900)
    placed = order(client, people(client)[0], [line(item)], payment="link")
    assert placed.status_code == 200 and stock_of(client, item) == 0
    wait_for(client, BILAL_PHONE, "tell me when dates are back")
    count = len(sent(client, BILAL_PHONE))
    cancelled = client.post(f"/api/orders/{placed.json()['order_id']}/status",
                            json={"status": "cancelled"})
    assert cancelled.status_code == 200 and stock_of(client, item) == 1
    [told] = sent(client, BILAL_PHONE)[count:]
    assert told["body"].startswith("Good news from Al Noor Electricals: Dates is back in stock")


def test_an_unpaid_order_that_lapses_gives_its_stock_back_and_the_waiting_customer_is_told(client):
    item = counted(client, 2, name="Dates", name_ar="تمر", price=900)
    placed = order(client, people(client)[0], [line(item, 2)], payment="link")
    assert placed.status_code == 200 and stock_of(client, item) == 0
    wait_for(client, BILAL_PHONE, "tell me when dates are back")
    count = len(sent(client, BILAL_PHONE))
    owner_sql("update stock_holds set expires_at = now() - interval '1 minute' "
              "where status = 'held'")
    owner_sql("update jobs set run_at = now() where kind = 'stock_hold_expiry'")
    client.portal.call(client.app.state.jobs.drain)
    assert stock_of(client, item) == 2
    assert len(sent(client, BILAL_PHONE)) == count + 1


def test_stock_received_in_the_workspace_tells_the_waiting_customer(client):
    item = counted(client, 0, name="Dates", name_ar="تمر", price=900)
    wait_for(client, BILAL_PHONE, "tell me when dates are back")
    count = len(sent(client, BILAL_PHONE))
    received = client.post(f"/api/items/{item['id']}/stock",
                           json={"kind": "received", "quantity": 20, "reason": "delivery"})
    assert received.status_code == 200
    assert len(sent(client, BILAL_PHONE)) == count + 1
    # A second delivery tells nobody: the request was closed by the first message.
    client.post(f"/api/items/{item['id']}/stock",
                json={"kind": "received", "quantity": 5, "reason": "more"})
    assert len(sent(client, BILAL_PHONE)) == count + 1


def test_a_request_waits_while_the_item_is_still_not_orderable(client):
    item = sold_out_shawarma(client)
    agree(client, AHMED_PHONE, item)
    # The item is edited without coming back (a new description): nobody is told.
    client.put(f"/api/items/{item['id']}", json={"description": "Fresh"})
    assert [w["status"] for w in watches()] == ["waiting"]
    # A shelf delivery for an item that is switched off does not put it on sale either.
    count = len(sent(client, AHMED_PHONE))
    talk(client, STAFF_PHONE, "back shawarma")
    assert len(sent(client, AHMED_PHONE)) == count + 1


def test_old_requests_expire_unsent(client):
    item = sold_out_shawarma(client)
    agree(client, AHMED_PHONE, item)
    owner_sql("update stock_watches set expires_at = now() - interval '1 day'")
    count = len(sent(client, AHMED_PHONE))
    talk(client, STAFF_PHONE, "back shawarma")
    assert len(sent(client, AHMED_PHONE)) == count
    assert [w["status"] for w in watches()] == ["expired"]


def test_a_request_in_one_shop_is_never_answered_by_another(client):
    from test_sign_in import other_shop_with_owner

    other = other_shop_with_owner(f"omar-{uuid4().hex[:8]}@other.example")
    item = sold_out_shawarma(client)
    agree(client, AHMED_PHONE, item)
    # The other shop has an item of the same name and sells more of it.
    their_item = owner_sql(
        "insert into items (tenant_id, name, name_ar, price) values ($1, 'Shawarma', "
        "'شاورما', 1200) returning id", other,
    )[0]["id"]
    owner_sql("update items set available = false where id = $1", their_item)
    count = len(sent(client, AHMED_PHONE))
    owner_sql("update items set available = true where id = $1", their_item)
    assert len(sent(client, AHMED_PHONE)) == count and [w["status"] for w in watches()] == [
        "waiting"]
    assert owner_sql("select count(*) from stock_watches where tenant_id = $1", other)[0][0] == 0


# ── the narrow consent: asking to be told is not marketing consent ───────────────────


def consent_states(phone: str):
    row = owner_sql(
        "select consent_service, consent_marketing, consent_back_in_stock from contacts "
        "where phone = $1", phone,
    )[0]
    return row["consent_service"], row["consent_marketing"], row["consent_back_in_stock"]


def send_template(client, phone: str, name: str, category: str, *params: str):
    """Hand one template to the outbound layer, as a module would, and say what it did."""
    from uuid import UUID

    from alyr.channels.base import OutboundMessage

    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            who = await conn.fetchval("select id from contacts where phone = $1", phone)
            return await client.app.state.outbound.send(conn, OutboundMessage(
                to=UUID(str(who)), kind="template", body="x", template_name=name,
                template_category=category, template_params=params,
            ))

    return client.portal.call(go)


def test_a_customer_who_only_asked_to_be_told_is_not_opted_in_to_marketing(client):
    item = sold_out_shawarma(client)
    agree(client, AHMED_PHONE, item)
    assert consent_states(AHMED_PHONE) == ("granted", "unknown", "granted")
    # No marketing consent was recorded, so any other marketing message is still refused.
    assert not owner_sql(
        "select 1 from consents s join contacts c on c.id = s.contact_id "
        "where c.phone = $1 and s.purpose = 'marketing'", AHMED_PHONE,
    )
    window_closed(AHMED_PHONE)
    refused = send_template(client, AHMED_PHONE, "new_stock", "marketing")
    assert refused.blocked == "no_marketing_consent"
    # The narrow template itself is allowed to them.
    allowed = send_template(client, AHMED_PHONE, "back_in_stock", "marketing",
                            "Al Noor Electricals", "Shawarma", "http://web.test/s/al-noor")
    assert allowed.blocked is None


def test_marketing_consent_alone_does_not_allow_the_back_in_stock_template(client):
    owner_sql("update contacts set consent_marketing = 'granted' where phone = $1", AHMED_PHONE)
    say(client, AHMED_PHONE, "hello")
    window_closed(AHMED_PHONE)
    blocked = send_template(client, AHMED_PHONE, "back_in_stock",
                            "marketing", "Al Noor Electricals", "Shawarma", "http://x")
    assert blocked.blocked == "no_back_in_stock_consent"
    # And the general consent still allows the general marketing template, as before.
    assert send_template(client, AHMED_PHONE, "new_stock", "marketing").blocked is None


def test_start_does_not_give_back_the_consent_that_stop_took(client):
    item = sold_out_shawarma(client)
    agree(client, AHMED_PHONE, item)
    talk(client, AHMED_PHONE, "STOP")
    talk(client, AHMED_PHONE, "start")
    # Service notices are back; the one-message agreement is not, and neither is marketing.
    assert consent_states(AHMED_PHONE) == ("granted", "revoked", "revoked")
    # Asking again means agreeing again: the question is asked, not skipped.
    asked = talk(client, AHMED_PHONE, "tell me when shawarma is back")[-1]
    assert [c["title"] for c in choices(asked)] == ["Yes, tell me", "No thanks"]
    assert watches("waiting") == []
    yes = next(c for c in choices(asked) if c["id"].startswith("notify_yes:"))
    assert "I will message you once" in talk(client, AHMED_PHONE, reply_id=yes["id"])[-1]["body"]
    assert consent_states(AHMED_PHONE) == ("granted", "revoked", "granted")
    assert [w["status"] for w in watches("waiting")] == ["waiting"]


def test_a_consent_purpose_the_shop_does_not_know_is_refused(client):
    import pytest

    from alyr.core import consent

    async def go(conn):
        who = await conn.fetchval("select id from contacts where phone = $1", AHMED_PHONE)
        with pytest.raises(ValueError):
            await consent.record(conn, who, "newsletter", "granted", "test")
        return await consent.current(conn, who, "back_in_stock")

    assert on_shop(client, go) == "unknown"
