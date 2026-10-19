"""Ordering in the chat by a code, a link, a SKU or a name (ALY-136, D-039).

Everything goes through the chat simulator, the real inbound path and the real order path:
nothing reaches Meta. A customer gives the chat an identifier; the chat finds the item in THIS
shop, shows it as a card and asks them to Confirm; confirmed items form a draft with a live
total; "Place order" uses the ordinary order placement (stock taken in one step, a pay link or
the credit account), so these tests read the stock log and the order itself.
"""

import json
import re
from uuid import UUID, uuid4

import pytest

from alyr.channels.base import InboundMessage
from alyr.modules.items import chat_cart, codes
from alyr.seed import AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID, STAFF_PHONE
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    ARABIC,
    STRANGER,
    catalog_module_on,
    choices,
    sent,
    talk,
)
from test_catalog_whatsapp_chat import picture_sent_with, with_photo
from test_consent import owner_sql
from test_items import counted, drain, log_rows, mk, on_hand, reconciled

OTHER = "97455500777"  # a second customer
ARABIC_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def ids(message: dict) -> list[str]:
    return [c["id"] for c in choices(message)]


def titles(message: dict) -> list[str]:
    return [c["title"] for c in choices(message)]


def tap(client, phone, message: dict, index: int = 0) -> list[dict]:
    """Press the button (or list row) at `index` of a message the shop sent."""
    return talk(client, phone, reply_id=choices(message)[index]["id"])


def confirm_and_place(client, phone, item_code, **more):
    """Send a code, confirm, place: the whole way for one item. Returns the shop's messages."""
    asked = talk(client, phone, str(item_code))[-1]
    draft = tap(client, phone, asked, 0)[-1]
    return draft, talk(client, phone, reply_id="cart_place")


def orders_of(phone: str) -> list:
    return owner_sql(
        "select o.id, o.number, o.total, o.payment, o.status from orders o "
        "join contacts c on c.id = o.contact_id where c.phone = $1 and c.tenant_id = $2 "
        "order by o.number", phone, DEMO_TENANT_ID,
    )


def my_contact(phone: str) -> UUID:
    """The customer in the demo shop (the same phone may also be a customer of another shop)."""
    return owner_sql(
        "select id from contacts where phone = $1 and tenant_id = $2", phone, DEMO_TENANT_ID
    )[0]["id"]


def lines_of(order_id) -> list:
    return owner_sql(
        "select name, quantity, price, variant_name, sku from order_items where order_id = $1 "
        "order by name", order_id,
    )


def cart_row(phone: str):
    rows = owner_sql(
        "select k.* from chat_carts k join contacts c on c.id = k.contact_id "
        "where c.phone = $1 and c.tenant_id = $2", phone, DEMO_TENANT_ID,
    )
    if not rows:
        return None
    # (this connection has no jsonb codec: the columns come back as text)
    return {**dict(rows[0]), "lines": json.loads(rows[0]["lines"]),
            "pending": json.loads(rows[0]["pending"]) if rows[0]["pending"] else None}


def draft_of(phone: str) -> list:
    row = cart_row(phone)
    return row["lines"] if row else []


# ── a code brings the item, Confirm adds it, Place order orders it ──────────────────


def test_a_code_brings_the_card_and_confirm_then_place_order_goes_through_the_ordinary_path(client):
    item = with_photo(client, counted(client, 10, name="Oud Royal", name_ar="عود ملكي", price=9000))
    card = talk(client, STRANGER, str(item["code"]))[-1]
    assert card["kind"] == "buttons"
    assert card["body"].startswith("*Oud Royal*\nQAR 90")
    assert f"Item code {item['code']}" in card["body"]
    assert titles(card) == ["Confirm", "Change"]
    assert picture_sent_with(STRANGER)  # the photo travels with the card
    assert orders_of(STRANGER) == []

    draft = tap(client, STRANGER, card, 0)[-1]
    assert draft["body"].startswith("Added to your order.\nYour order from Al Noor Electricals:")
    assert "1 x Oud Royal - QAR 90" in draft["body"] and "Total: QAR 90" in draft["body"]
    assert ids(draft) == ["cart_place", "cart_clear"]
    assert orders_of(STRANGER) == [] and on_hand(client, item) == 10  # a draft holds no stock

    placed = talk(client, STRANGER, reply_id="cart_place")
    # The ordinary order path wrote the order, took the stock, sent its own confirmation.
    [order] = orders_of(STRANGER)
    assert order["total"] == 9000 and order["payment"] == "unpaid" and order["status"] == "new"
    [only] = lines_of(order["id"])
    assert (only["name"], only["quantity"], only["price"]) == ("Oud Royal", 1, 9000)
    assert on_hand(client, item) == 9
    assert [m["delta"] for m in log_rows(client, item) if m["kind"] == "sold"] == [-1]
    assert reconciled(client)
    confirmation = placed[-1]["body"]
    assert f"Order #{order['number']} received." in confirmation and "/pay/" in confirmation
    assert cart_row(STRANGER) is None  # nothing left waiting


def test_two_taps_on_place_order_make_one_order(client):
    item = counted(client, 5, name="Musk", name_ar="مسك", price=4000)
    asked = talk(client, STRANGER, str(item["code"]))[-1]
    tap(client, STRANGER, asked, 0)
    talk(client, STRANGER, reply_id="cart_place")
    again = talk(client, STRANGER, reply_id="cart_place")
    assert len(orders_of(STRANGER)) == 1 and on_hand(client, item) == 4
    assert "empty" in again[-1]["body"]


def test_on_account_for_a_customer_with_a_credit_account(client):
    item = mk(client, name="Amber", name_ar="عنبر", price=2500)
    asked = talk(client, AHMED_PHONE, str(item["code"]))[-1]
    draft = tap(client, AHMED_PHONE, asked, 0)[-1]
    assert ids(draft) == ["cart_place", "cart_acct", "cart_clear"]
    before = next(c for c in client.get("/api/ledger/summary").json()["customers"]
                  if c["phone"] == AHMED_PHONE)["balance_text"]
    talk(client, AHMED_PHONE, reply_id="cart_acct")
    [order] = orders_of(AHMED_PHONE)
    assert order["payment"] == "on_account"
    after = next(c for c in client.get("/api/ledger/summary").json()["customers"]
                 if c["phone"] == AHMED_PHONE)["balance_text"]
    assert before == "QAR 1,850" and after == "QAR 1,875"


def test_a_customer_with_no_account_is_never_offered_one(client):
    item = mk(client, name="Amber", name_ar="عنبر")
    draft = tap(client, STRANGER, talk(client, STRANGER, str(item["code"]))[-1], 0)[-1]
    assert "cart_acct" not in ids(draft)
    talk(client, STRANGER, reply_id="cart_acct")  # a tap on an old button is still refused
    assert orders_of(STRANGER) == []


# ── every form a code is written in ─────────────────────────────────────────────────


FORMS = [
    "{c}", "#{c}", "code {c}", "Code: {c}", "item no. {c}", "do you have {c} please",
    "رقم {c}", "كود {c}", "منتج رقم {c}", "{ar}", "#{ar}", "رقم {ar}", "كود {fa}", "{fa}",
    "‏{c}‏",
]


@pytest.mark.parametrize("form", FORMS)
def test_a_code_in_every_form_finds_the_item(client, form):
    item = mk(client, name="Saffron", name_ar="زعفران", price=1500)
    code = item["code"]
    message = form.format(
        c=code, ar=str(code).translate(ARABIC_DIGITS), fa=str(code).translate(PERSIAN_DIGITS)
    )
    card = talk(client, STRANGER, message)[-1]
    arabic = bool(ARABIC.search(message))
    assert card["kind"] == "buttons", (message, card["body"])
    assert (f"*{'زعفران' if arabic else 'Saffron'}*") in card["body"], message
    assert titles(card) == (["تأكيد", "تغيير"] if arabic else ["Confirm", "Change"])
    if arabic:
        # The amount is written the way an Arabic page writes it, never "QAR".
        assert "15 ر.ق" in card["body"] and "QAR" not in card["body"]


def test_the_price_in_a_confirmation_is_written_for_the_customers_language(client):
    item = mk(client, name="Saffron", name_ar="زعفران", price=1500)
    asked = talk(client, STRANGER, f"كود {item['code']}")[-1]
    draft = tap(client, STRANGER, asked, 0)[-1]
    assert "15 ر.ق" in draft["body"] and "QAR" not in draft["body"]
    # a line that starts in Latin opens right to left
    assert "\u200f1 x زعفران - 15 ر.ق" in draft["body"]
    assert titles(draft) == ["إتمام الطلب", "تفريغ الطلب"]


# ── several in one message: one question, one Confirm ──────────────────────────────


def test_several_items_in_one_message_are_one_question_and_one_draft(client):
    a = counted(client, 10, name="Oud Royal", name_ar="عود", price=9000)
    b = counted(client, 10, name="Musk", name_ar="مسك", price=4000)
    replies = talk(client, STRANGER, f"{a['code']} x2, {b['code']}")
    assert len(replies) == 1
    [summary] = replies
    assert summary["body"].startswith("Please check your order from Al Noor Electricals:")
    assert "2 x Oud Royal - QAR 180" in summary["body"] and "1 x Musk - QAR 40" in summary["body"]
    assert "Total: QAR 220" in summary["body"]
    assert titles(summary) == ["Confirm", "Change"]
    draft = tap(client, STRANGER, summary, 0)[-1]
    assert "Total: QAR 220" in draft["body"]
    talk(client, STRANGER, reply_id="cart_place")
    [order] = orders_of(STRANGER)
    assert order["total"] == 22000
    assert [(r["name"], r["quantity"]) for r in lines_of(order["id"])] == [
        ("Musk", 1), ("Oud Royal", 2),
    ]
    assert (on_hand(client, a), on_hand(client, b)) == (8, 9)
    assert reconciled(client)


def test_arabic_numbers_and_words_for_several_items(client):
    a = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    b = mk(client, name="Musk", name_ar="مسك", price=4000)
    first, second = (str(m["code"]).translate(ARABIC_DIGITS) for m in (a, b))
    text = f"كود {first} × ٢ و كود {second}"
    [summary] = talk(client, STRANGER, text)
    assert "2 x عود - 180 ر.ق" in summary["body"] and "1 x مسك - 40 ر.ق" in summary["body"]


def test_a_second_message_adds_to_the_same_draft(client):
    a = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    b = mk(client, name="Musk", name_ar="مسك", price=4000)
    tap(client, STRANGER, talk(client, STRANGER, str(a["code"]))[-1], 0)
    draft = tap(client, STRANGER, talk(client, STRANGER, f"{b['code']} x3")[-1], 0)[-1]
    assert "1 x Oud Royal" in draft["body"] and "3 x Musk - QAR 120" in draft["body"]
    assert "Total: QAR 210" in draft["body"]
    # The same item again adds to its line.
    again = tap(client, STRANGER, talk(client, STRANGER, f"{a['code']} x2")[-1], 0)[-1]
    assert "3 x Oud Royal - QAR 270" in again["body"]


def test_the_message_the_order_page_writes_is_read_back_whole(client):
    a = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    b = mk(client, name="Musk", name_ar="مسك", price=4000)
    page = (f"Hello Al Noor Electricals, I would like to order (item codes): "
            f"#{a['code']} x2, #{b['code']}. Thank you!")
    [summary] = talk(client, STRANGER, page)
    assert "2 x Oud Royal" in summary["body"] and "1 x Musk" in summary["body"]
    arabic = f"مرحباً النور، أرغب بطلب (أكواد الأصناف): #{a['code']} x2، #{b['code']}. شكراً"
    [again] = talk(client, OTHER, arabic)
    assert "2 x عود" in again["body"] and "1 x مسك" in again["body"]


def test_more_items_than_one_message_may_carry_say_so(client, monkeypatch):
    monkeypatch.setattr(codes, "MAX_REFS", 3)
    made = [mk(client, name=f"Thing {n}", name_ar=f"شيء {n}", price=100) for n in range(5)]
    replies = talk(client, STRANGER, ", ".join(str(m["code"]) for m in made))
    assert any("first 20 items" in m["body"] or "first 3 items" in m["body"] for m in replies)
    [summary] = [m for m in replies if titles(m) == ["Confirm", "Change"]]
    assert summary["body"].count(" x Thing ") == 3


# ── a link ──────────────────────────────────────────────────────────────────────────


def test_a_pasted_item_link_brings_the_card(client):
    item = with_photo(client, mk(client, name="Oud Royal", name_ar="عود", price=9000))
    link = f"http://web.test/s/{DEMO_SLUG}?item={item['id']}"
    card = talk(client, STRANGER, f"I want this {link}")[-1]
    assert "*Oud Royal*" in card["body"] and titles(card) == ["Confirm", "Change"]
    # A link carrying a customer's token (it was forwarded) is still only an item here.
    forwarded = talk(client, OTHER, f"{link}&t=abc.def")[-1]
    assert "*Oud Royal*" in forwarded["body"]


def test_a_link_to_another_shop_resolves_nothing(client):
    item = mk(client, name="Oud Royal", name_ar="عود")
    other = talk(client, STRANGER, f"http://web.test/s/some-other-shop?item={item['id']}")[-1]
    assert "another shop" in other["body"] and not choices(other)
    assert cart_row(STRANGER) is None or cart_row(STRANGER)["pending"] is None


def test_a_link_to_an_item_that_does_not_exist_is_not_found(client):
    missing = talk(client, STRANGER, f"http://web.test/s/{DEMO_SLUG}?item={UUID(int=7)}")[-1]
    assert "could not find that item" in missing["body"]
    assert titles(missing) == ["Search by name", "Talk to a person"]


def test_a_pasted_category_link_lists_what_can_be_ordered_there(client):
    listed = talk(client, STRANGER, f"http://web.test/s/{DEMO_SLUG}?cat=Cables")[-1]
    assert listed["kind"] == "list"
    assert [r["title"] for r in choices(listed)][:2] == [
        "Cable 1.5 mm, 100 m roll", "Cable 2.5 mm, 100 m roll"
    ]
    card = tap(client, STRANGER, listed, 0)[-1]
    assert "*Cable 1.5 mm, 100 m roll*" in card["body"] and titles(card) == ["Confirm", "Change"]


# ── a SKU ───────────────────────────────────────────────────────────────────────────


def test_a_sku_typed_exactly_finds_its_item_before_anything_else(client):
    perfume = mk(client, name="Perfume X", name_ar="عطر", sku="OUD-12", price=9000)
    mk(client, name="Oud Royal", name_ar="عود ملكي", price=7000)  # "oud" is in its name
    for typed in ("OUD-12", "oud-12", "Do you have OUD-12?", "sku OUD-12"):
        card = talk(client, STRANGER, typed)[-1]
        assert "*Perfume X*" in card["body"], typed
        tap(client, STRANGER, card, 1)  # Change, to start again
    assert perfume["code"]


def test_a_size_sku_picks_that_size(client):
    mk(client, name="Abaya", name_ar="عباية", price=15000, stock_rule="count", variants=[
        {"name": "S", "name_ar": "S", "sku": "ABY-S", "opening_stock": 3},
        {"name": "L", "name_ar": "L", "sku": "ABY-L", "opening_stock": 3, "price_delta": 1000},
    ])
    card = talk(client, STRANGER, "aby-l")[-1]
    assert card["body"].startswith("*Abaya* - L\nQAR 160")
    assert titles(card) == ["Confirm", "Change"]


def test_a_plain_word_sku_is_found_when_it_is_all_the_message_says(client):
    mk(client, name="Scarf Blue", name_ar="وشاح", sku="SCARF-BLU", price=3000)
    assert "*Scarf Blue*" in talk(client, STRANGER, "SCARF-BLU")[-1]["body"]


# ── the hazard: OUD-12 must never fall into the name search ────────────────────────


def test_a_sku_shaped_word_with_no_such_sku_never_matches_an_item_by_name(client):
    oud = with_photo(client, mk(client, name="Oud Royal", name_ar="عود ملكي", price=7000))
    for who, typed in ((STRANGER, "OUD-12"), (STRANGER, "oud-12"), (STRANGER, "OUD12"),
                       (OTHER, "OUD-12 x2"), (OTHER, "do you have OUD-12")):
        replies = talk(client, who, typed)
        bodies = " ".join(m["body"] for m in replies)
        assert "Oud Royal" not in bodies, typed
        last = replies[-1]
        assert "could not find" in last["body"] and "OUD" in last["body"], typed
        # The customer is offered the two honest ways on.
        assert titles(last) == ["Search by name", "Talk to a person"], typed
    assert cart_row(STRANGER)["pending"] is None and draft_of(STRANGER) == []
    # The name itself still works.
    assert "*Oud Royal*" in talk(client, "97455500888", "oud")[-1]["body"]
    assert oud["code"]


def test_a_number_typed_with_a_name_must_fit_the_name(client):
    mk(client, name="iPhone 15", name_ar="آيفون 15", price=300000)
    assert "*iPhone 15*" in talk(client, STRANGER, "iphone 15")[-1]["body"]
    other = talk(client, OTHER, "iphone 12")[-1]
    assert "iPhone 15" not in other["body"]
    assert "*iPhone 15*" in talk(client, OTHER, "iphone")[-1]["body"]


# ── a name: never a guess ───────────────────────────────────────────────────────────


def test_a_name_that_fits_one_item_is_a_card_with_confirm(client):
    mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج", price=1200)
    card = talk(client, STRANGER, "shawarma")[-1]
    assert "*Chicken Shawarma*" in card["body"] and titles(card) == ["Confirm", "Change"]


def test_a_name_that_fits_several_is_a_list_and_a_pick_is_a_card_to_confirm(client):
    mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج", price=1200)
    mk(client, name="Beef Shawarma", name_ar="شاورما لحم", price=1500)
    asked = talk(client, STRANGER, "shawarma")[-1]
    assert asked["kind"] == "list" and len(choices(asked)) == 2
    assert all(i.startswith("pick:") for i in ids(asked))
    card = tap(client, STRANGER, asked, 0)[-1]
    assert titles(card) == ["Confirm", "Change"]
    assert orders_of(STRANGER) == []  # nothing is ordered by a guess


# ── sold out, closed, unknown ───────────────────────────────────────────────────────


def test_a_sold_out_item_says_so_and_offers_to_tell_the_customer_when_it_is_back(client):
    item = counted(client, 1, name="Last Oud", name_ar="العود الأخير", price=9000)
    client.post(f"/api/items/{item['id']}/count", json={"variant_id": item["variants"][0]["id"],
                                                         "counted": 0, "reason": "gone"})
    card = talk(client, STRANGER, str(item["code"]))[-1]
    assert "Sold out right now." in card["body"]
    assert titles(card) == ["Tell me when back"]
    assert draft_of(STRANGER) == []


def test_one_sold_out_among_several_is_said_and_the_rest_are_asked(client):
    gone = counted(client, 1, name="Last Oud", name_ar="العود الأخير", price=9000)
    client.post(f"/api/items/{gone['id']}/count", json={"variant_id": gone["variants"][0]["id"],
                                                         "counted": 0, "reason": "gone"})
    fine = mk(client, name="Musk", name_ar="مسك", price=4000)
    replies = talk(client, STRANGER, f"{gone['code']}, {fine['code']}")
    assert "Sold out right now." in replies[0]["body"]
    assert "*Musk*" in replies[-1]["body"] and titles(replies[-1]) == ["Confirm", "Change"]


def test_more_than_is_left_is_said_with_what_is_left(client):
    item = counted(client, 2, name="Rare Oud", name_ar="عود نادر", price=9000)
    reply = talk(client, STRANGER, f"{item['code']} x5")
    assert any("Only 2 of Rare Oud left" in m["body"] for m in reply)
    assert not any(titles(m) == ["Confirm", "Change"] for m in reply)


def test_an_unknown_code_is_not_found_and_offers_a_name_search_or_a_person(client):
    reply = talk(client, STRANGER, "9999")[-1]
    assert "could not find code 9999 in Al Noor Electricals" in reply["body"]
    assert titles(reply) == ["Search by name", "Talk to a person"]
    ask = talk(client, STRANGER, reply_id="find_name")[-1]
    assert ask["body"].startswith("Send the name of the item, for example:")
    person = talk(client, STRANGER, reply_id="person")[-1]
    assert "A person from Al Noor Electricals will read this" in person["body"]
    [asked] = owner_sql(
        "select detail from activity where action = 'asked_person' and contact_id = $1",
        my_contact(STRANGER),
    )
    assert json.loads(asked["detail"])["why"] == "asked"


def test_the_not_found_message_is_arabic_for_an_arabic_customer(client):
    reply = talk(client, STRANGER, "كود 9999")[-1]
    assert "لم أجد الكود 9999 في النور للكهربائيات" in reply["body"].replace("\u200f", "")
    assert titles(reply) == ["البحث بالاسم", "التحدث مع موظف"]


def test_a_code_found_in_another_shop_resolves_nothing_here(client):
    """Codes are looked up in the shop the chat belongs to and nowhere else."""
    here = mk(client, name="Here Oud", name_ar="هنا", price=9000)
    other = shop_with_items(40)
    # The other shop has a code this one does not (the demo shop has fewer than 40 items).
    high = 100 + 40
    assert [i for i in owner_sql("select code from items where tenant_id = $1 and code = $2",
                                 other["tenant"], high)]
    reply = talk(client, STRANGER, str(high))[-1]
    assert "could not find" in reply["body"]
    assert not any("Other item" in m["body"] for m in sent(client, STRANGER))
    # ... and the other shop's own chat resolves its own number, and its own 101 is not ours.
    theirs = talk_in(client, other, STRANGER, str(high))[-1]
    assert "*Other item 40*" in theirs["body"]
    mine = talk_in(client, other, OTHER, "101")[-1]
    assert "*Other item 1*" in mine["body"] and "Here Oud" not in mine["body"]
    assert here["code"] != 101


def shop_with_items(count: int) -> dict:
    """Another shop with a test line of its own and `count` items (codes 101...), made the way
    the database makes them: with the owner's rights, naming the shop."""
    slug = f"other-{count}-{uuid4().hex[:8]}"
    tenant = owner_sql(
        "insert into tenants (name, name_ar, slug) values ('Other Shop', 'متجر آخر', $1) "
        "returning id", slug,
    )[0]["id"]
    owner_sql("insert into channel_numbers (number_id, tenant_id, channel) values ($1, $2, "
              "'simulator')", f"sim-{slug}", tenant)
    for module in ("catalog", "orders", "inbox"):
        owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, $2)",
                  tenant, module)
    for n in range(1, count + 1):
        owner_sql(
            "insert into items (tenant_id, name, name_ar, price, status, sort) "
            "values ($1, $2, $2, 1000, 'live', $3)", tenant, f"Other item {n}", n,
        )
    return {"tenant": tenant, "slug": slug}


def talk_in(client, shop: dict, phone: str, text: str = "", reply_id: str = "") -> list[dict]:
    """Say something on another shop's private test line (the simulator takes its address)."""
    before = client.get(f"/sim/conversations/{phone}", params={"shop": shop["slug"]}).json()
    after = client.post("/sim/messages", json={
        "from_number": phone, "text": text, "reply_id": reply_id, "shop": shop["slug"],
    }).json()
    return [m for m in after["messages"][len(before["messages"]):] if m["direction"] == "out"]


def test_the_simulator_takes_a_shops_address(client):
    other = shop_with_items(3)
    assert talk_in(client, other, STRANGER, "102")[-1]["kind"] == "buttons"
    assert client.post("/sim/messages", json={
        "from_number": STRANGER, "text": "hi", "shop": "no-such-shop"}).status_code == 404
    people = client.get("/sim/personas", params={"shop": other["slug"]}).json()
    assert "customers" in people and people["staff"]["phone"]


# ── Confirm and Change ──────────────────────────────────────────────────────────────


def test_change_drops_the_question_and_asks_again_for_what_the_customer_wants(client):
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    card = talk(client, STRANGER, str(item["code"]))[-1]
    changed = tap(client, STRANGER, card, 1)[-1]
    assert changed["body"].startswith("No problem. Send the code, link or name")
    assert cart_row(STRANGER)["pending"] is None and draft_of(STRANGER) == []
    # Confirm on the old card does nothing now.
    old = tap(client, STRANGER, card, 0)[-1]
    assert "question has run out" in old["body"]
    assert draft_of(STRANGER) == []


def test_typing_yes_or_no_answers_the_question_too(client):
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    talk(client, STRANGER, str(item["code"]))
    assert "Added to your order." in talk(client, STRANGER, "yes")[-1]["body"]
    talk(client, STRANGER, f"{item['code']} x2")
    assert "No problem" in talk(client, STRANGER, "no thanks")[-1]["body"]
    talk(client, OTHER, f"كود {item['code']}")
    assert "تمت الإضافة" in talk(client, OTHER, "نعم")[-1]["body"]


def test_an_old_buttons_answer_cannot_confirm_a_newer_question(client):
    a = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    b = mk(client, name="Musk", name_ar="مسك", price=4000)
    first = talk(client, STRANGER, str(a["code"]))[-1]
    talk(client, STRANGER, str(b["code"]))
    stale = tap(client, STRANGER, first, 0)[-1]
    assert "question has run out" in stale["body"]
    assert draft_of(STRANGER) == []


def test_a_question_nobody_answered_runs_out(client):
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    card = talk(client, STRANGER, str(item["code"]))[-1]
    owner_sql("update chat_carts set pending_expires_at = now() - interval '1 minute'")
    assert "question has run out" in tap(client, STRANGER, card, 0)[-1]["body"]
    assert draft_of(STRANGER) == []


def test_a_draft_nobody_came_back_to_runs_out_and_costs_the_shop_nothing(client):
    item = counted(client, 3, name="Oud Royal", name_ar="عود", price=9000)
    tap(client, STRANGER, talk(client, STRANGER, str(item["code"]))[-1], 0)
    assert on_hand(client, item) == 3
    owner_sql("update chat_carts set expires_at = now() - interval '1 minute'")
    assert "empty" in talk(client, STRANGER, reply_id="cart_place")[-1]["body"]
    assert orders_of(STRANGER) == [] and on_hand(client, item) == 3


def test_empty_order_clears_the_draft(client):
    item = mk(client, name="Oud Royal", name_ar="عود")
    tap(client, STRANGER, talk(client, STRANGER, str(item["code"]))[-1], 0)
    assert "empty again" in talk(client, STRANGER, reply_id="cart_clear")[-1]["body"]
    assert cart_row(STRANGER) is None


# ── what changed while the customer thought ────────────────────────────────────────


def test_a_price_that_changed_before_confirm_is_said_and_asked_again(client):
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    card = talk(client, STRANGER, str(item["code"]))[-1]
    assert client.put(f"/api/items/{item['id']}", json={"price": 10000}).status_code == 200
    reply = tap(client, STRANGER, card, 0)
    assert "The price of Oud Royal changed from QAR 90 to QAR 100." in reply[0]["body"]
    assert "Please check again before you confirm." in reply[0]["body"]
    assert titles(reply[-1]) == ["Confirm", "Change"] and "QAR 100" in reply[-1]["body"]
    assert draft_of(STRANGER) == []  # nothing was added behind the customer's back
    draft = tap(client, STRANGER, reply[-1], 0)[-1]
    assert "Total: QAR 100" in draft["body"]


def test_an_item_that_sold_out_before_confirm_is_not_added(client):
    item = counted(client, 1, name="Last Oud", name_ar="العود الأخير", price=9000)
    card = talk(client, STRANGER, str(item["code"]))[-1]
    # Someone else buys the last one.
    other = tap(client, OTHER, talk(client, OTHER, str(item["code"]))[-1], 0)[-1]
    talk(client, OTHER, reply_id="cart_place")
    assert on_hand(client, item) == 0 and other
    gone = tap(client, STRANGER, card, 0)
    assert "sold out" in " ".join(m["body"] for m in gone).lower()
    assert draft_of(STRANGER) == []


def test_a_price_that_changed_in_the_draft_is_said_before_the_order_is_placed(client):
    item = counted(client, 5, name="Oud Royal", name_ar="عود", price=9000)
    tap(client, STRANGER, talk(client, STRANGER, str(item["code"]))[-1], 0)
    client.put(f"/api/items/{item['id']}", json={"price": 8000})
    shown = talk(client, STRANGER, reply_id="cart_place")
    assert "changed from QAR 90 to QAR 80" in shown[-1]["body"]
    assert orders_of(STRANGER) == []  # not placed at a price the customer did not see
    talk(client, STRANGER, reply_id="cart_place")
    [order] = orders_of(STRANGER)
    assert order["total"] == 8000


def test_an_item_that_sold_out_in_the_draft_is_taken_off_and_said(client):
    a = counted(client, 1, name="Last Oud", name_ar="العود الأخير", price=9000)
    b = mk(client, name="Musk", name_ar="مسك", price=4000)
    tap(client, STRANGER, talk(client, STRANGER, str(a["code"]))[-1], 0)
    tap(client, STRANGER, talk(client, STRANGER, str(b["code"]))[-1], 0)
    tap(client, OTHER, talk(client, OTHER, str(a["code"]))[-1], 0)
    talk(client, OTHER, reply_id="cart_place")
    shown = talk(client, STRANGER, reply_id="cart_place")[-1]
    assert "I took it off your order" in shown["body"] and "1 x Musk - QAR 40" in shown["body"]
    assert "Last Oud" not in shown["body"].split("Your order from")[1]
    assert orders_of(STRANGER) == []


def test_an_order_the_shop_refuses_keeps_the_draft_and_says_why(client, monkeypatch):
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    tap(client, STRANGER, talk(client, STRANGER, str(item["code"]))[-1], 0)
    # The customer already has three unpaid pay-link orders holding stock.
    counted_item = counted(client, 9, name="Held", name_ar="محجوز", price=100)
    for _ in range(3):
        held = tap(client, OTHER, talk(client, OTHER, str(counted_item["code"]))[-1], 0)
        assert held
        talk(client, OTHER, reply_id="cart_place")
    tap(client, OTHER, talk(client, OTHER, str(counted_item["code"]))[-1], 0)
    refused = talk(client, OTHER, reply_id="cart_place")[-1]
    assert refused["body"]
    assert len(orders_of(OTHER)) == 3 and draft_of(OTHER)


# ── sizes and choices ───────────────────────────────────────────────────────────────


def sized(client, **more):
    return mk(client, name="Abaya", name_ar="عباية", price=15000, stock_rule="count", variants=[
        {"name": "S", "name_ar": "S", "opening_stock": 3},
        {"name": "L", "name_ar": "L", "opening_stock": 3, "price_delta": 1000},
    ], **more)


def test_an_item_with_sizes_shows_the_item_then_asks_which_size(client):
    item = sized(client)
    card, question = talk(client, STRANGER, str(item["code"]))[-2:]
    assert "Choices: S, L" in card["body"] and not choices(card)
    assert question["kind"] == "list" and [r["title"] for r in choices(question)] == ["S", "L"]
    assert [r["description"] for r in choices(question)] == ["QAR 150", "QAR 160"]
    proposal = tap(client, STRANGER, question, 1)[-1]
    assert proposal["body"].startswith("*Abaya* - L\nQAR 160")
    assert titles(proposal) == ["Confirm", "Change"]
    draft = tap(client, STRANGER, proposal, 0)[-1]
    assert "1 x Abaya (L) - QAR 160" in draft["body"]
    talk(client, STRANGER, reply_id="cart_place")
    [order] = orders_of(STRANGER)
    assert [(r["variant_name"], r["price"]) for r in lines_of(order["id"])] == [("L", 16000)]
    assert on_hand(client, item, "L") == 2 and on_hand(client, item, "S") == 3


def test_a_size_in_brackets_after_the_code_is_used_when_it_fits_exactly_one(client):
    item = sized(client)
    [proposal] = talk(client, STRANGER, f"{item['code']} (L) x2")
    assert "L" in proposal["body"] and "2 x QAR 160 = QAR 320" in proposal["body"]
    unclear = talk(client, OTHER, f"{item['code']} (purple)")
    assert unclear[-1]["kind"] == "list"  # a size that fits none is asked, not guessed


def test_an_item_that_needs_extras_chosen_sends_the_customer_its_page(client):
    pizza = mk(client, name="Pizza", name_ar="بيتزا", price=3000, option_groups=[
        {"name": "Crust", "name_ar": "العجينة", "required": True, "max_choices": 1,
         "options": [{"name": "Thin", "name_ar": "رقيقة"}, {"name": "Thick", "name_ar": "سميكة"}]},
    ])
    reply = talk(client, STRANGER, str(pizza["code"]))[-1]
    assert "has choices to make" in reply["body"]
    link = re.search(r"(http\S+)", reply["body"]).group(1)
    assert f"item={pizza['id']}" in link and "t=" in link
    assert not choices(reply) and cart_row(STRANGER)["pending"] is None


# ── repeat customers, people, and what the chat cannot read ────────────────────────


def test_same_as_last_time_offers_the_last_order_again_to_confirm(client):
    item = counted(client, 9, name="Oud Royal", name_ar="عود", price=9000)
    tap(client, STRANGER, talk(client, STRANGER, f"{item['code']} x2")[-1], 0)
    talk(client, STRANGER, reply_id="cart_place")
    again = talk(client, STRANGER, "same as last time")[-1]
    assert "Oud Royal" in again["body"] and titles(again) == ["Confirm", "Change"]
    assert "2 x" in again["body"]
    new = talk(client, OTHER, "same as last time")[-1]
    assert "nothing to repeat" in new["body"]
    after_change = tap(client, STRANGER, again, 1)[-1]
    assert "same as last time" in after_change["body"]  # a repeat customer is reminded


def test_a_voice_message_goes_to_a_person_with_a_polite_reply(client):
    message = InboundMessage(
        channel="simulator", message_id="sim-voice-1", to_number_id="sim-al-noor", kind="audio",
        from_number=STRANGER,
    )
    client.portal.call(client.app.state.inbound.accept, message)
    drain(client)
    reply = sent(client, STRANGER)[-1]
    assert "cannot read pictures or voice messages" in reply["body"]
    assert "a person from Al Noor Electricals" in reply["body"]
    assert owner_sql("select count(*) as n from activity where action = 'asked_person' "
                     "and tenant_id = $1", DEMO_TENANT_ID)[0]["n"] == 1
    # The conversation is open in the team inbox for a person to answer.
    assert owner_sql("select inbox_status from contacts where phone = $1 and tenant_id = $2",
                     STRANGER, DEMO_TENANT_ID)[0][0] == "open"


def test_a_picture_without_a_code_goes_to_a_person_and_one_with_a_code_is_read(client):
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    sent_photo = client.post("/sim/photos", params={"from_number": STRANGER, "caption": "this one"},
                             content=b"\xff\xd8\xff\xe0jpeg",
                             headers={"content-type": "image/jpeg"})
    assert sent_photo.status_code == 200
    reply = sent(client, STRANGER)[-1]
    assert "cannot read pictures or voice messages" in reply["body"]
    client.post("/sim/photos", params={"from_number": OTHER, "caption": f"#{item['code']}"},
                content=b"\xff\xd8\xff\xe0jpeg", headers={"content-type": "image/jpeg"})
    assert "*Oud Royal*" in sent(client, OTHER)[-1]["body"]


def test_asking_for_a_person_in_words_is_answered_politely(client):
    reply = talk(client, STRANGER, "I want to talk to a human")[-1]
    assert "A person from Al Noor Electricals will read this" in reply["body"]
    arabic = talk(client, OTHER, "ابي اكلم موظف")[-1]
    assert "سيقرأ أحد موظفي" in arabic["body"]


def test_a_message_that_is_not_about_items_goes_on_to_the_other_modules(client):
    assert "balance" in talk(client, AHMED_PHONE, "balance")[-1]["body"].lower()
    assert "Welcome" in talk(client, STRANGER, "hello")[-1]["body"]
    paying = talk(client, AHMED_PHONE, "pay 500")[-1]
    assert paying["body"].startswith("To pay QAR 500, open this link:")
    assert cart_row(AHMED_PHONE) is None  # no code in any of them: nothing was stored


def test_staff_numbers_are_not_customers(client):
    item = mk(client, name="Oud Royal", name_ar="عود")
    reply = talk(client, STAFF_PHONE, str(item["code"]))[-1]
    assert "Item code" not in reply["body"] and titles(reply) != ["Confirm", "Change"]
    assert cart_row(STAFF_PHONE) is None


# ── abuse ───────────────────────────────────────────────────────────────────────────


def test_too_many_codes_that_match_nothing_hand_the_sender_to_a_person(client):
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    for n in range(4):
        assert "could not find" in talk(client, STRANGER, str(9000 + n))[-1]["body"]
    limited = talk(client, STRANGER, "9004")[-1]
    assert "a lot of codes I could not find" in limited["body"]
    # While limited nothing is looked up, even a code that exists.
    held = talk(client, STRANGER, str(item["code"]))[-1]
    assert "a lot of codes I could not find" in held["body"] and not choices(held)
    # One record, not one a message.
    assert owner_sql("select count(*) as n from activity where action = 'asked_person' "
                     "and tenant_id = $1", DEMO_TENANT_ID)[0]["n"] == 1
    # The window passes.
    owner_sql("update chat_carts set misses_since = now() - interval '11 minutes'")
    assert "*Oud Royal*" in talk(client, STRANGER, str(item["code"]))[-1]["body"]


def test_a_draft_holds_at_most_so_many_lines(client, monkeypatch):
    monkeypatch.setattr(chat_cart, "MAX_LINES", 2)
    made = [mk(client, name=f"Thing {n}", name_ar=f"شيء {n}", price=100) for n in range(3)]
    for item in made[:2]:
        tap(client, STRANGER, talk(client, STRANGER, str(item["code"]))[-1], 0)
    full = tap(client, STRANGER, talk(client, STRANGER, str(made[2]["code"]))[-1], 0)[-1]
    assert "already has 2 items" in full["body"] and "/s/al-noor" in full["body"]
    assert len(draft_of(STRANGER)) == 2


def test_a_shop_holds_at_most_so_many_drafts_at_once(client, monkeypatch):
    monkeypatch.setattr(chat_cart, "MAX_OPEN", 1)
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    assert "*Oud Royal*" in talk(client, STRANGER, str(item["code"]))[-1]["body"]
    late = talk(client, OTHER, str(item["code"]))[-1]
    assert "A person from Al Noor Electricals will read this" in late["body"]
    assert cart_row(OTHER) is None


def test_the_chat_does_not_take_orders_when_the_shop_has_no_orders_module(client):
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    owner_sql("update tenant_modules set enabled = false where module_key = 'orders' "
              "and tenant_id = $1", DEMO_TENANT_ID)
    try:
        card = talk(client, STRANGER, str(item["code"]))[-1]
        assert "*Oud Royal*" in card["body"] and not choices(card)
        assert draft_of(STRANGER) == []
        assert (cart_row(STRANGER) or {"pending": None})["pending"] is None
    finally:
        owner_sql("update tenant_modules set enabled = true where module_key = 'orders' "
                  "and tenant_id = $1", DEMO_TENANT_ID)


def test_nothing_here_runs_for_a_shop_whose_catalog_is_off(client):
    item = mk(client, name="Oud Royal", name_ar="عود", price=9000)
    owner_sql("update tenant_modules set enabled = false where module_key = 'catalog' "
              "and tenant_id = $1", DEMO_TENANT_ID)
    reply = talk(client, STRANGER, str(item["code"]))[-1]
    assert "Item code" not in reply["body"] and reply["body"].startswith("Welcome to")
    assert cart_row(STRANGER) is None  # the chat of a shop without the Catalog never stored a thing
