"""The Catalog on WhatsApp, staff side (ALY-106, D-039): sold out, back, stock, price, undo,
asking which item, and a number that is not registered.

Plan scenarios 15 (an unclear name is asked about, never guessed), 16 (a mistake is undone
and the log shows who) and 17 (a number that is not registered gets nothing). Every command
is tried in English and in Arabic. Everything goes through the chat simulator and the same
job queue as live traffic; nothing reaches Meta. The rest of the package is in
test_catalog_whatsapp_photos.py (staff numbers, photos), test_catalog_whatsapp_chat.py
(item messages, back in stock: scenario 13) and test_catalog_alerts.py (alerts, refunds).
"""

from alyr.seed import AHMED_PHONE, OWNER_PHONE, STAFF_PHONE
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    ARABIC,
    STRANGER,
    YUSUF,
    activity,
    catalog_module_on,
    choices,
    contact_id,
    talk,
    undo_id,
)
from test_consent import owner_sql
from test_items import counted, fresh, mk, on_hand

# ── staff commands: sold out and back ─────────────────────────────────────────────────


def test_staff_mark_an_item_sold_out_and_back_in_english(client):
    item = mk(client, name="Shawarma", name_ar="شاورما")

    reply = talk(client, STAFF_PHONE, "sold out shawarma")[-1]
    assert "Shawarma is now sold out" in reply["body"]
    assert fresh(client, item)["available"] is False
    # It says what it understood and offers Undo.
    assert reply["kind"] == "buttons" and choices(reply)[0]["title"] == "Undo"

    reply = talk(client, STAFF_PHONE, "back shawarma")[-1]
    assert "Shawarma is back on" in reply["body"]
    assert fresh(client, item)["available"] is True

    # The record says who, and that it came by WhatsApp.
    off = next(a for a in activity(client, item) if a["action"] == "switched_off")
    assert off["actor"]["name"] == YUSUF and off["detail"]["via"] == "whatsapp"


def test_staff_mark_an_item_sold_out_and_back_in_arabic(client):
    item = mk(client, name="Shawarma", name_ar="شاورما")

    reply = talk(client, STAFF_PHONE, "نفذ شاورما")[-1]
    assert ARABIC.search(reply["body"]) and "نفد «شاورما»" in reply["body"]
    assert fresh(client, item)["available"] is False
    assert choices(reply)[0]["title"] == "تراجع"

    # The definite article, and the verb after the name, as people say it.
    assert "عاد «شاورما» للبيع" in talk(client, STAFF_PHONE, "رجع الشاورما")[-1]["body"]
    assert fresh(client, item)["available"] is True
    assert "نفد «شاورما»" in talk(client, STAFF_PHONE, "الشاورما خلصت")[-1]["body"]
    assert fresh(client, item)["available"] is False


def test_an_item_already_sold_out_is_not_changed_again(client):
    item = mk(client, name="Falafel", name_ar="فلافل")
    talk(client, STAFF_PHONE, "sold out falafel")
    reply = talk(client, STAFF_PHONE, "sold out falafel")[-1]
    assert "already sold out" in reply["body"] and not choices(reply)
    assert len([a for a in activity(client, item) if a["action"] == "switched_off"]) == 1


def test_names_are_forgiven_a_spelling_mistake_and_arabic_spellings_are_folded(client):
    shawarma = mk(client, name="Shawarma", name_ar="شاورما")
    rice = mk(client, name="Rice", name_ar="أرز")
    talk(client, STAFF_PHONE, "sold out shwarma")  # a letter missing
    assert fresh(client, shawarma)["available"] is False
    talk(client, STAFF_PHONE, "نفذ ارز")  # without the hamza the shop wrote
    assert fresh(client, rice)["available"] is False
    talk(client, STAFF_PHONE, "back SHAWARMA!")
    assert fresh(client, shawarma)["available"] is True


def test_a_name_that_matches_nothing_changes_nothing(client):
    item = mk(client, name="Shawarma", name_ar="شاورما")
    reply = talk(client, STAFF_PHONE, "sold out pizza")[-1]
    assert "could not find an item called" in reply["body"] and "pizza" in reply["body"]
    reply = talk(client, STAFF_PHONE, "نفذ بيتزا")[-1]
    assert "لم أجد صنفاً" in reply["body"]
    assert fresh(client, item)["available"] is True


def test_sold_out_is_refused_for_a_draft_and_an_always_available_item(client):
    draft = mk(client, name="Hummus", name_ar="حمص", status="draft")
    always = mk(client, name="Delivery", name_ar="توصيل", stock_rule="always")
    assert "not on sale yet" in talk(client, STAFF_PHONE, "sold out hummus")[-1]["body"]
    assert "no sold out switch" in talk(client, STAFF_PHONE, "sold out delivery")[-1]["body"]
    assert fresh(client, draft)["status"] == "draft"
    assert fresh(client, always)["available"] is True


# ── staff commands: stock ─────────────────────────────────────────────────────────────


def abaya(client) -> dict:
    return mk(
        client, name="Abaya", name_ar="عباية", stock_rule="count", price=15000,
        variants=[
            {"name": "Black M", "name_ar": "أسود M", "opening_stock": 2},
            {"name": "Black L", "name_ar": "أسود L", "opening_stock": 2},
            {"name": "White M", "name_ar": "أبيض M", "opening_stock": 2},
        ],
    )


def test_staff_set_the_stock_of_one_size_in_english(client):
    item = abaya(client)
    reply = talk(client, STAFF_PHONE, "stock abaya black M 5")[-1]
    assert "Abaya – Black M now has 5 in stock (it was 2)" in reply["body"]
    assert (on_hand(client, item, "Black M"), on_hand(client, item, "Black L")) == (5, 2)
    # The stock log says who counted, and that it came by WhatsApp.
    row = client.get(f"/api/items/{item['id']}/stock-log").json()["log"][0]
    assert (row["kind"], row["delta"], row["balance_after"]) == ("counted", 3, 5)
    assert row["actor"]["name"] == YUSUF and row["via"] == "whatsapp"


def test_staff_set_the_stock_of_one_size_in_arabic(client):
    item = abaya(client)
    reply = talk(client, STAFF_PHONE, "مخزون عباية أسود M ٧")[-1]
    assert ARABIC.search(reply["body"]) and "أصبح لدى «عباية – أسود M» 7" in reply["body"]
    assert on_hand(client, item, "Black M") == 7


def test_stock_without_saying_which_size_asks_and_waits(client):
    item = abaya(client)
    asked = talk(client, STAFF_PHONE, "stock abaya 9")[-1]
    assert asked["kind"] == "list" and "Which one did you mean?" in asked["body"]
    assert "1. Abaya – Black M" in asked["body"] and "3. Abaya – White M" in asked["body"]
    assert [c["id"] for c in choices(asked)] == ["pick:1", "pick:2", "pick:3"]
    assert on_hand(client, item, "Black M") == 2  # nothing was guessed
    done = talk(client, STAFF_PHONE, "2")[-1]
    assert "Abaya – Black L now has 9" in done["body"]
    assert (on_hand(client, item, "Black M"), on_hand(client, item, "Black L")) == (2, 9)


def test_stock_needs_a_counted_item_and_a_whole_number(client):
    switch = mk(client, name="Shawarma", name_ar="شاورما")
    item = counted(client, 4, name="Dates", name_ar="تمر")
    assert "not counted in stock" in talk(client, STAFF_PHONE, "stock shawarma 5")[-1]["body"]
    assert "How many" in talk(client, STAFF_PHONE, "stock dates")[-1]["body"]
    assert "whole number" in talk(client, STAFF_PHONE, "stock dates 2.5")[-1]["body"]
    assert on_hand(client, item) == 4 and fresh(client, switch)["available"] is True


def test_sold_out_for_one_size_sets_just_that_size_to_nothing(client):
    item = abaya(client)
    reply = talk(client, STAFF_PHONE, "sold out abaya white M")[-1]
    assert "Abaya – White M is now at 0" in reply["body"]
    assert (on_hand(client, item, "White M"), on_hand(client, item, "Black M")) == (0, 2)
    assert fresh(client, item)["available"] is True  # the item itself is still on
    assert "How many" in talk(client, STAFF_PHONE, "back abaya white M")[-1]["body"]


# ── staff commands: price ─────────────────────────────────────────────────────────────


def test_staff_change_a_price_in_english_and_arabic(client):
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    reply = talk(client, STAFF_PHONE, "price shawarma 12.5")[-1]
    assert "Shawarma now costs QAR 12.50 (it was QAR 12)" in reply["body"]
    assert fresh(client, item)["price"] == 1250
    reply = talk(client, STAFF_PHONE, "سعر الشاورما ١٥")[-1]
    assert ARABIC.search(reply["body"]) and fresh(client, item)["price"] == 1500
    history = client.get(f"/api/items/{item['id']}/price-history").json()["history"]
    assert history[0]["price"] == 1500 and history[0]["via"] == "whatsapp"
    assert history[0]["changed_by"]["name"] == YUSUF


def test_a_price_that_cannot_be_read_or_is_not_allowed_changes_nothing(client):
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    assert "What is the new price" in talk(client, STAFF_PHONE, "price shawarma")[-1]["body"]
    assert "could not read that price" in talk(client, STAFF_PHONE, "price shawarma 0")[-1]["body"]
    assert "too high" in talk(client, STAFF_PHONE, "price shawarma 9999999")[-1]["body"]
    # A sale price must stay below the price: the service says no, and nothing changes.
    client.put(f"/api/items/{item['id']}", json={"sale_price": 1000})
    refused = talk(client, STAFF_PHONE, "price shawarma 9")[-1]
    assert "I could not change Shawarma" in refused["body"]
    assert fresh(client, item)["price"] == 1200
    assert "already costs QAR 12" in talk(client, STAFF_PHONE, "price shawarma 12")[-1]["body"]


# ── several matches: ask, never guess (scenario 15) ──────────────────────────────────


def test_scenario_15_an_unclear_name_is_asked_about_and_never_guessed(client):
    chicken = mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج")
    beef = mk(client, name="Beef Shawarma", name_ar="شاورما لحم")
    other = mk(client, name="Falafel", name_ar="فلافل")

    asked = talk(client, STAFF_PHONE, "sold out shawarma")[-1]
    assert asked["kind"] == "list" and "Which one did you mean?" in asked["body"]
    assert "1. Beef Shawarma" in asked["body"] and "2. Chicken Shawarma" in asked["body"]
    assert "Falafel" not in asked["body"]
    # Nothing changed while it waits.
    assert all(fresh(client, i)["available"] for i in (chicken, beef, other))

    done = talk(client, STAFF_PHONE, "1")[-1]
    assert "Beef Shawarma is now sold out" in done["body"]
    assert fresh(client, beef)["available"] is False and fresh(client, chicken)["available"]
    assert choices(done)[0]["title"] == "Undo"


def test_scenario_15_in_arabic_with_arabic_digits_and_the_list_row(client):
    chicken = mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج")
    beef = mk(client, name="Beef Shawarma", name_ar="شاورما لحم")
    asked = talk(client, STAFF_PHONE, "نفذ شاورما")[-1]
    assert "أي واحد تقصد؟" in asked["body"] and "2. شاورما دجاج" in asked["body"]
    assert fresh(client, chicken)["available"] and fresh(client, beef)["available"]
    done = talk(client, STAFF_PHONE, "٢")[-1]  # an Arabic digit
    assert "نفد «شاورما دجاج»" in done["body"]
    assert fresh(client, chicken)["available"] is False and fresh(client, beef)["available"]
    # Tapping a row of the list does the same as typing its number.
    talk(client, STAFF_PHONE, "back chicken")
    talk(client, STAFF_PHONE, "sold out shawarma")
    talk(client, STAFF_PHONE, reply_id="pick:1")
    assert fresh(client, beef)["available"] is False and fresh(client, chicken)["available"]


def test_a_full_name_is_not_a_question_and_a_typed_number_without_one_is_left_alone(client):
    shawarma = mk(client, name="Shawarma", name_ar="شاورما")
    mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج")
    # "shawarma" is exactly one item's name, so there is nothing to ask.
    assert "Shawarma is now sold out" in talk(client, STAFF_PHONE, "sold out shawarma")[-1]["body"]
    assert fresh(client, shawarma)["available"] is False
    # With no question waiting, a bare number is not ours: another module may answer it.
    assert "Shawarma" not in "".join(m["body"] for m in talk(client, STAFF_PHONE, "2"))


def test_an_answer_that_is_not_one_of_the_numbers_asks_again(client):
    chicken = mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج")
    mk(client, name="Beef Shawarma", name_ar="شاورما لحم")
    talk(client, STAFF_PHONE, "sold out shawarma")
    again = talk(client, STAFF_PHONE, "7")[-1]
    assert "Which one did you mean?" in again["body"]
    assert fresh(client, chicken)["available"] is True
    # A new command replaces the old question.
    assert "Chicken Shawarma is now sold out" in talk(
        client, STAFF_PHONE, "sold out chicken"
    )[-1]["body"]


def test_a_question_that_waited_too_long_is_forgotten(client):
    chicken = mk(client, name="Chicken Shawarma", name_ar="شاورما دجاج")
    mk(client, name="Beef Shawarma", name_ar="شاورما لحم")
    talk(client, STAFF_PHONE, "sold out shawarma")
    owner_sql("update staff_pending set created_at = now() - interval '1 hour'")
    stale = talk(client, STAFF_PHONE, reply_id="pick:1")[-1]
    assert "no longer have that question" in stale["body"]
    assert fresh(client, chicken)["available"] is True


# ── undo (scenario 16) ────────────────────────────────────────────────────────────────


def test_scenario_16_a_mistake_is_undone_with_the_button_and_the_log_shows_who(client):
    item = mk(client, name="Shawarma", name_ar="شاورما")
    sold = talk(client, STAFF_PHONE, "sold out shawarma")[-1]
    assert fresh(client, item)["available"] is False

    undone = talk(client, STAFF_PHONE, reply_id=undo_id(sold))[-1]
    assert "Undone: Shawarma is back on sale" in undone["body"]
    assert fresh(client, item)["available"] is True

    # Both steps are on the record, by the same staff member, by WhatsApp.
    steps = [a for a in activity(client, item) if a["action"].startswith("switched")]
    assert [s["action"] for s in steps] == ["switched_on", "switched_off"]
    assert all(s["actor"]["name"] == YUSUF and s["detail"]["via"] == "whatsapp" for s in steps)
    # A change is undone once.
    again = talk(client, STAFF_PHONE, reply_id=undo_id(sold))[-1]
    assert "already undone" in again["body"] and fresh(client, item)["available"] is True


def test_scenario_16_the_word_undo_in_both_languages_puts_back_the_newest_change(client):
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    talk(client, STAFF_PHONE, "price shawarma 99")
    assert fresh(client, item)["price"] == 9900
    assert "Undone: Shawarma costs QAR 12 again" in talk(client, STAFF_PHONE, "undo")[-1]["body"]
    assert fresh(client, item)["price"] == 1200

    talk(client, STAFF_PHONE, "نفذ شاورما")
    undone = talk(client, STAFF_PHONE, "تراجع")[-1]
    assert "تم التراجع" in undone["body"] and fresh(client, item)["available"] is True
    assert "nothing to undo" in talk(client, STAFF_PHONE, "undo")[-1]["body"]


def test_scenario_16_undoing_a_count_puts_the_number_back_and_the_log_keeps_both(client):
    item = counted(client, 10, name="Dates", name_ar="تمر")
    sold = talk(client, STAFF_PHONE, "stock dates 3")[-1]
    assert on_hand(client, item) == 3
    undone = talk(client, STAFF_PHONE, reply_id=undo_id(sold))[-1]
    assert "now has 10 in stock" in undone["body"] and on_hand(client, item) == 10
    log = client.get(f"/api/items/{item['id']}/stock-log").json()["log"]
    assert [(r["kind"], r["delta"]) for r in log[:2]] == [("adjusted", 7), ("counted", -7)]
    assert all(r["actor"]["name"] == YUSUF and r["via"] == "whatsapp" for r in log[:2])


def test_an_undo_that_would_overwrite_a_later_change_is_refused(client):
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    changed = talk(client, STAFF_PHONE, "price shawarma 15")[-1]
    client.put(f"/api/items/{item['id']}", json={"price": 2000})  # someone else, meanwhile
    refused = talk(client, STAFF_PHONE, reply_id=undo_id(changed))[-1]
    assert "changed again since" in refused["body"] and fresh(client, item)["price"] == 2000

    # A count that added 5 cannot be taken back once most of them have gone.
    dates = counted(client, 5, name="Dates", name_ar="تمر")
    counted_it = talk(client, STAFF_PHONE, "stock dates 10")[-1]
    assert on_hand(client, dates) == 10
    client.post(f"/api/items/{dates['id']}/stock", json={"kind": "wasted", "quantity": 8,
                                                         "reason": "dropped"})
    short = talk(client, STAFF_PHONE, reply_id=undo_id(counted_it))[-1]
    assert "some of Dates was sold since" in short["body"] and "It has 2 now" in short["body"]
    assert on_hand(client, dates) == 2  # never below zero, never overwritten


def test_staff_cannot_undo_another_persons_change(client):
    item = mk(client, name="Shawarma", name_ar="شاورما")
    sold = talk(client, STAFF_PHONE, "sold out shawarma")[-1]
    other = talk(client, OWNER_PHONE, reply_id=undo_id(sold))[-1]
    assert "nothing to undo" in other["body"] and fresh(client, item)["available"] is False


# ── a number that is not registered (scenario 17) ─────────────────────────────────────


def test_scenario_17_a_number_that_is_not_registered_is_answered_like_any_customer(client):
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    dates = abaya(client)
    # What any customer gets for a message that means nothing to the shop, in each language.
    ordinary = talk(client, STRANGER, "blah blah")[-1]
    for command in ("sold out shawarma", "back shawarma", "stock abaya black M 5", "undo", "help"):
        reply = talk(client, STRANGER, command)
        assert [m["body"] for m in reply] == [ordinary["body"]], command
        assert reply[-1]["payload"] == ordinary["payload"], command
    # The same in Arabic (the shop answers a customer in the language they write in).
    ordinary_ar = talk(client, STRANGER, "كلام عادي")[-1]
    for command in ("نفذ شاورما", "رجع شاورما", "مخزون عباية أسود M 5", "تراجع"):
        reply = talk(client, STRANGER, command)
        assert [m["body"] for m in reply] == [ordinary_ar["body"]], command
        assert reply[-1]["payload"] == ordinary_ar["payload"], command
    # Asking the price is something a customer does: they are shown the item. It is not a
    # change, has no Undo, and does not read like a command being carried out.
    asked = talk(client, STRANGER, "price shawarma 99")[-1]
    assert "now costs" not in asked["body"] and not any(
        c["id"].startswith("undo:") for c in choices(asked)
    )
    # Nothing changed, nothing reveals that the commands exist.
    assert fresh(client, item)["available"] is True and fresh(client, item)["price"] == 1200
    assert on_hand(client, dates, "Black M") == 2
    assert not owner_sql("select 1 from staff_changes")
    for word in ("sold out", "undo", "stock "):
        assert word not in ordinary["body"].lower()


def test_scenario_17_an_existing_customer_gets_nothing_either(client):
    item = mk(client, name="Shawarma", name_ar="شاورما")
    ordinary = talk(client, AHMED_PHONE, "blah blah")[-1]
    reply = talk(client, AHMED_PHONE, "sold out shawarma")
    assert [m["body"] for m in reply] == [ordinary["body"]]
    assert fresh(client, item)["available"] is True


def test_scenario_17_staff_commands_need_the_catalog_module(client):
    item = mk(client, name="Shawarma", name_ar="شاورما")
    owner_sql("update tenant_modules set enabled = false where module_key = 'catalog'")
    reply = talk(client, STAFF_PHONE, "sold out shawarma")
    assert fresh(client, item)["available"] is True
    assert all("sold out" not in m["body"] for m in reply)


def test_scenario_17_a_number_registered_in_another_shop_is_a_customer_here(client):
    from uuid import uuid4

    from test_sign_in import other_shop_with_owner

    item = mk(client, name="Shawarma", name_ar="شاورما")
    other = other_shop_with_owner(f"omar-{uuid4().hex[:8]}@other.example")
    owner_sql(
        "insert into contacts (tenant_id, phone, name, role) values ($1, $2, 'Their staff', "
        "'staff')", other, STRANGER,
    )
    ordinary = talk(client, "97455599124", "blah blah")[-1]
    reply = talk(client, STRANGER, "sold out shawarma")
    assert [m["body"] for m in reply] == [ordinary["body"]]
    assert fresh(client, item)["available"] is True


def test_a_number_taken_off_the_staff_list_stops_working(client):
    item = mk(client, name="Shawarma", name_ar="شاورما")
    assert "now sold out" in talk(client, STAFF_PHONE, "sold out shawarma")[-1]["body"]
    assert client.delete(f"/api/staff-numbers/{contact_id(STAFF_PHONE)}").status_code == 200
    ordinary = talk(client, STRANGER, "blah blah")[-1]
    reply = talk(client, STAFF_PHONE, "back shawarma")
    assert [m["body"] for m in reply] == [ordinary["body"]]
    assert fresh(client, item)["available"] is False


def test_other_staff_messages_still_reach_the_other_modules(client):
    """Staff also record credit sales and payments by message; the Catalog leaves those."""
    reply = talk(client, STAFF_PHONE, "Ahmed 450 credit")[-1]
    assert "Ahmed Al-Kuwari" in reply["body"] and "QAR 2,300" in reply["body"]
    assert "Ahmed 450 credit" in talk(client, STAFF_PHONE, "hello")[-1]["body"]
