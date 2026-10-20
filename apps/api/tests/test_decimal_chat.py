"""Decimal quantities in the chat (ALY-149 part 2): what a customer types after an item code
(`214 x0.5`, `214 ×٠٫٥`, `214 x 0,5`), what the order page writes for them, the reader's limits, and
what the shop's staff type (`stock dates 12.5`). The reader is `modules/items/codes.py` and is
pure; the staff command parser is `modules/items/commands.py`. The messages the page writes are
the same file the page's own tests check (`specs/013-decimal-quantities/messages.json`)."""

import json
from decimal import Decimal
from pathlib import Path

import pytest

from alyr.modules.items import codes, commands, qty
from alyr.seed import AHMED_PHONE, STAFF_PHONE
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    ARABIC,
    catalog_module_on,
    choices,
    talk,
    undo_id,
)
from test_consent import owner_sql
from test_features_api import switch
from test_items import counted, log_rows, on_hand, reconciled

MESSAGES = (
    Path(__file__).resolve().parents[3] / "specs" / "013-decimal-quantities" / "messages.json"
)
FILE = json.loads(MESSAGES.read_text(encoding="utf-8"))


def read(message: str) -> list[tuple]:
    """(kind, value, quantity) for each thing the message names."""
    return [(r.kind, r.value, r.quantity) for r in codes.parse(message).refs]


def q(text: str):
    return qty.parse(text)


# ── a quantity after a code ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("message, expected", [
    ("214 x0.5", [("code", "214", q("0.5"))]),
    ("214 x 0.5", [("code", "214", q("0.5"))]),
    ("214x0.5", [("code", "214", q("0.5"))]),
    ("214 ×0.5", [("code", "214", q("0.5"))]),
    ("#214 x1.25", [("code", "214", q("1.25"))]),
    ("214 x0.125", [("code", "214", q("0.125"))]),
    ("214 qty 0.5", [("code", "214", q("0.5"))]),
    ("214 quantity 2.5", [("code", "214", q("2.5"))]),
    # Arabic numerals and the Arabic decimal mark
    ("214 ×٠٫٥", [("code", "214", q("0.5"))]),
    ("٢١٤ × ٠٫٥", [("code", "214", q("0.5"))]),
    ("#٢١٤ ×١٫٢٥", [("code", "214", q("1.25"))]),
    ("٢١٤ عدد ٢٫٥", [("code", "214", q("2.5"))]),
    ("كود 214 كمية 0.5", [("code", "214", q("0.5"))]),
    # a comma as the decimal mark, after x or a quantity word
    ("214 x 0,5", [("code", "214", q("0.5"))]),
    ("214 x0,25", [("code", "214", q("0.25"))]),
    ("214 qty 1,5", [("code", "214", q("1.5"))]),
    # the quantity before the code
    ("0.5 x 214", [("code", "214", q("0.5"))]),
    ("0.5x 214", [("code", "214", q("0.5"))]),
    ("٠٫٥ × ٢١٤", [("code", "214", q("0.5"))]),
    ("0,5 x 214", [("code", "214", q("0.5"))]),
    # several, each with its own
    ("214 x0.5, 305 x1.25", [("code", "214", q("0.5")), ("code", "305", q("1.25"))]),
    ("214 x0.5 and 305", [("code", "214", q("0.5")), ("code", "305", 1)]),
    ("#214 ×٠٫٥ و #305 ×٢", [("code", "214", q("0.5")), ("code", "305", 2)]),
    ("214 x0.5\n305 x1", [("code", "214", q("0.5")), ("code", "305", 1)]),
    # whole quantities are as they were, and a whole value is an int
    ("214 x2", [("code", "214", 2)]),
    ("214 x2.0", [("code", "214", 2)]),
    ("214 x0.50", [("code", "214", q("0.5"))]),
    # a size in brackets
    ("214 (black M) x0.5", [("code", "214", q("0.5"))]),
])
def test_a_decimal_quantity_in_every_form_it_is_written(message, expected):
    got = read(message)
    assert got == expected, message
    for (_, _, wanted), (_, _, found) in zip(expected, got, strict=True):
        assert type(found) is type(wanted), message  # a whole quantity stays an int
    assert codes.parse(message).is_order


def test_a_comma_that_separates_items_still_separates_them():
    # Three places after a comma is a list, not a decimal: no quantity is a thousand.
    assert read("214 x2,305") == [("code", "214", 2), ("code", "305", 1)]
    assert read("214 x2, 305") == [("code", "214", 2), ("code", "305", 1)]
    assert read("214,305") == [("code", "214", 1), ("code", "305", 1)]
    assert read("214, 305, 410") == [("code", "214", 1), ("code", "305", 1), ("code", "410", 1)]


def test_a_decimal_is_never_taken_for_a_code_or_a_name():
    for message in ("0.5", "0.5 kg", "12.5"):
        assert codes.parse(message).refs == [], message


def test_more_than_three_places_is_not_a_quantity():
    # "214 x0.1234" cannot be read as an order for 0.1234 of anything; the code is still read.
    assert read("214 x0.1234") == [("code", "214", 1)]


def test_the_same_item_twice_adds_exactly():
    assert read("214 x0.1 214 x0.2") == [("code", "214", q("0.3"))]
    assert read("214 x0.5, 214 x0.5") == [("code", "214", 1)]


# ── what the order page writes ───────────────────────────────────────────────────────


@pytest.mark.parametrize("case", FILE["chat"], ids=lambda c: c["label"])
def test_what_the_order_page_writes_for_a_fraction_is_read_back_exactly(case):
    wanted = [(line["code"], qty.parse(str(line["qty"]))) for line in case["lines"]]
    for part in case["parts"]:
        got = [(int(r.value), r.quantity) for r in codes.parse(part).refs if r.kind == "code"]
        assert got, part
        assert all(item in wanted for item in got), (part, got, wanted)
    read_back = [
        (int(r.value), r.quantity)
        for part in case["parts"] for r in codes.parse(part).refs if r.kind == "code"
    ]
    assert read_back == wanted, case["label"]


@pytest.mark.parametrize("case", FILE["reads"], ids=lambda c: c["message"])
def test_the_reads_both_sides_agree_on(case):
    got = [(r.kind, r.value, str(r.quantity)) for r in codes.parse(case["message"]).refs]
    assert got == [tuple(x) for x in case["refs"]]


# ── what staff type ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("message, query, number", [
    ("stock dates 12.5", "dates", "12.5"),
    ("stock dates 12,5", "dates", "12,5"),
    ("stock medjool dates 0.25", "medjool dates", "0.25"),
    ("مخزون تمر ١٢٫٥", "تمر", "12.5"),
    ("stock rice 40", "rice", "40"),
])
def test_a_stock_command_keeps_a_decimal_in_one_piece(message, query, number):
    command = commands.parse(message)
    assert (command.verb, command.query, command.number) == ("stock", query, number)


@pytest.mark.parametrize("raw, expected", [
    ("12.5", Decimal("12.5")), ("12,5", Decimal("12.5")), ("40", 40), ("0", 0),
    ("0.001", Decimal("0.001")), ("12.5000", Decimal("12.5")),
])
def test_a_stock_figure_is_read_exactly(raw, expected):
    got = commands.quantity(raw)
    assert got == expected and type(got) is type(expected)


@pytest.mark.parametrize("raw", [None, "", "abc", "1.2345", "-3", "1e3"])
def test_a_stock_figure_that_is_not_one_is_none(raw):
    assert commands.quantity(raw) is None


# ── the whole way, through the chat ──────────────────────────────────────────────────


def dates(client, kilos="12.5", **more):
    fields = {"name": "Medjool dates", "name_ar": "تمر مجدول", "price": 1250, "unit": "kg",
              "pack_size": "0.25", "min_order": "0.25", **more}
    return counted(client, kilos, **fields)


def order_lines(phone: str) -> list:
    return owner_sql(
        "select i.name, i.quantity, i.unit, i.unit_shown, o.total from order_items i "
        "join orders o on o.id = i.order_id join contacts c on c.id = o.contact_id "
        "where c.phone = $1 order by o.number desc, i.name", phone,
    )


def test_a_customer_orders_half_a_kilo_by_code_confirms_and_places(client):
    assert switch(client, "decimal_quantity", True).status_code == 200
    item = dates(client)
    asked = talk(client, AHMED_PHONE, f"{item['code']} x0.5")[-1]
    assert "0.5 kg x QAR 12.50 = QAR 6.25" in asked["body"]
    draft = talk(client, AHMED_PHONE, reply_id=choices(asked)[0]["id"])[-1]
    assert "0.5 kg x Medjool dates - QAR 6.25" in draft["body"]
    assert "Total: QAR 6.25" in draft["body"] or "QAR 6.25" in draft["body"].splitlines()[-3]
    talk(client, AHMED_PHONE, reply_id="cart_place")
    [line] = order_lines(AHMED_PHONE)[:1]
    assert (line["name"], line["quantity"], line["unit"], line["unit_shown"], line["total"]) == (
        "Medjool dates", Decimal("0.5"), "kg", True, 625)
    assert on_hand(client, item) == 12 and reconciled(client)
    assert [r["delta"] for r in log_rows(client, item)][0] == -0.5


def test_a_second_message_adds_to_the_same_line_exactly(client):
    assert switch(client, "decimal_quantity", True).status_code == 200
    item = dates(client, 5)
    # 0.1 is below the smallest order and 0.3 is not a step: each is refused in words
    assert "least you can order of Medjool dates is 0.25 kg" in talk(
        client, AHMED_PHONE, f"{item['code']} x0.1")[-1]["body"]
    assert "steps of 0.25 kg" in talk(
        client, AHMED_PHONE, f"{item['code']} x0.3")[-1]["body"]
    asked = talk(client, AHMED_PHONE, f"{item['code']} x0.25")[-1]
    talk(client, AHMED_PHONE, reply_id=choices(asked)[0]["id"])
    asked = talk(client, AHMED_PHONE, f"{item['code']} x0.75")[-1]
    draft = talk(client, AHMED_PHONE, reply_id=choices(asked)[0]["id"])[-1]
    assert "1 kg x Medjool dates - QAR 12.50" in draft["body"]


def test_arabic_numerals_and_the_arabic_decimal_mark_order_the_same(client):
    assert switch(client, "decimal_quantity", True).status_code == 200
    item = dates(client)
    asked = talk(client, AHMED_PHONE, f"{item['code']} ×٠٫٧٥".translate(
        str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")))[-1]
    assert ARABIC.search(asked["body"]) or "0.75 kg" in asked["body"]
    assert "0.75" in asked["body"]


def test_a_fraction_of_something_counted_is_refused_in_the_chat(client):
    piece = counted(client, 9, name="Cake box", name_ar="علبة كيك", price=900)
    said = talk(client, AHMED_PHONE, f"{piece['code']} x0.5")[-1]["body"]
    assert "whole piece" in said
    assert on_hand(client, piece) == 9


def test_staff_set_a_stock_in_decimals_and_undo_puts_it_back(client):
    assert switch(client, "decimal_quantity", True).status_code == 200
    item = dates(client, "3")
    done = talk(client, STAFF_PHONE, "stock medjool dates 12.5")[-1]
    assert "12.5 kg" in done["body"] and "(it was 3 kg)" in done["body"]
    assert on_hand(client, item) == 12.5
    undone = talk(client, STAFF_PHONE, reply_id=undo_id(done))[-1]
    assert "3 kg" in undone["body"] and on_hand(client, item) == 3
    again = talk(client, STAFF_PHONE, "stock medjool dates 12,25")[-1]
    assert "12.25 kg" in again["body"] and on_hand(client, item) == Decimal("12.25")
    assert reconciled(client)


def test_staff_cannot_give_a_counted_item_a_fraction_and_a_wrong_figure_is_named(client):
    piece = counted(client, 9, name="Cake box", name_ar="علبة كيك", price=900)
    assert "whole number" in talk(client, STAFF_PHONE, "stock cake box 2.5")[-1]["body"]
    assert "number" in talk(client, STAFF_PHONE, "stock cake box 1.2345")[-1]["body"]
    assert on_hand(client, piece) == 9
