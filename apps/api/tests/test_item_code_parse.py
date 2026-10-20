"""Reading a customer's message for the items it names (ALY-136): `modules/items/codes.py`.

Pure: no database. Every form a code is written in, in English and in Arabic with Western,
Arabic-Indic and Persian digits, several in one message with quantities, links, SKU-shaped words,
and the messages the order page writes (the same file the page's own tests check them against,
`specs/010-order-by-code/messages.json`).
"""

import json
from pathlib import Path

import pytest

from alyr.modules.items import codes

MESSAGES = Path(__file__).resolve().parents[3] / "specs" / "010-order-by-code" / "messages.json"
ITEM = "0a1f0000-0000-4000-8000-00000000a1f0"


def read(message: str) -> list[tuple]:
    """(kind, value, quantity) for each thing the message names."""
    return [(r.kind, r.value, r.quantity) for r in codes.parse(message).refs]


# ── a single code, however it is written ────────────────────────────────────────────


@pytest.mark.parametrize("message", [
    "214", " 214 ", "#214", "# 214", "code 214", "Code: 214", "item 214", "item no. 214",
    "number 214", "ref 214", "do you have 214", "214 please", "hi, 214", "No 214",
    # Arabic words
    "رقم 214", "كود 214", "الكود 214", "رمز 214", "منتج رقم 214", "صنف 214", "عندكم 214",
    # Arabic-Indic and Persian digits
    "٢١٤", "#٢١٤", "رقم ٢١٤", "كود ۲۱۴", "۲۱۴", "code ٢١٤",
    # the invisible marks an Arabic keyboard leaves
    "‏214‏", "‫#214‬",
])
def test_a_code_in_every_form_it_is_written(message):
    assert read(message) == [("code", "214", 1)], message
    assert codes.parse(message).is_order, message


def test_the_digits_are_the_same_whatever_script_they_come_in():
    assert read("٠٠٢١٤") == read("214") == [("code", "214", 1)]  # a leading zero is no part of it
    assert read("#12") == [("code", "12", 1)]  # a cued number is a code, found or not
    assert read("99999") == [("code", "99999", 1)]


def test_a_bare_number_that_is_not_three_to_five_digits_is_not_a_code():
    for message in ("12", "7", "123456", "1234567890", "0"):
        assert codes.parse(message).refs == [], message
    assert not codes.parse("12").is_order


# ── several in one message ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("message, expected", [
    ("214 x2, 305", [("code", "214", 2), ("code", "305", 1)]),
    ("214x2 305x3", [("code", "214", 2), ("code", "305", 3)]),
    ("214 × 2 and 305", [("code", "214", 2), ("code", "305", 1)]),
    ("#214 ×2 و #305", [("code", "214", 2), ("code", "305", 1)]),
    ("2x 214, 3 x 305", [("code", "214", 2), ("code", "305", 3)]),
    ("214 qty 3", [("code", "214", 3)]),
    ("214 quantity 4, 305", [("code", "214", 4), ("code", "305", 1)]),
    ("٢١٤ عدد ٢", [("code", "214", 2)]),
    ("٢١٤ × ٢، ٣٠٥ × ٣", [("code", "214", 2), ("code", "305", 3)]),
    ("كود 214 و كود 305", [("code", "214", 1), ("code", "305", 1)]),
    ("214\n305\n410 x4", [("code", "214", 1), ("code", "305", 1), ("code", "410", 4)]),
    ("214, 305, 410", [("code", "214", 1), ("code", "305", 1), ("code", "410", 1)]),
    ("214 305", [("code", "214", 1), ("code", "305", 1)]),
    ("214 2 pcs, 305", [("code", "214", 2), ("code", "305", 1)]),
    ("#214 x120", [("code", "214", 120)]),
    ("214 x2 214", [("code", "214", 3)]),  # the same item twice is one line of three
])
def test_several_codes_with_their_quantities(message, expected):
    assert read(message) == expected, message
    assert codes.parse(message).is_order


def test_a_size_in_brackets_after_a_code_is_kept_as_a_hint():
    parsed = codes.parse("214 (black M) x2, 305")
    assert [(r.value, r.quantity, r.hint) for r in parsed.refs] == [
        ("214", 2, "black m"), ("305", 1, ""),
    ]


def test_a_message_longer_than_the_most_it_will_read_says_how_many_were_left_out():
    message = ", ".join(str(100 + n) for n in range(30))
    parsed = codes.parse(message)
    assert len(parsed.refs) == codes.MAX_REFS
    assert parsed.dropped == 10


# ── numbers that are not codes ──────────────────────────────────────────────────────


@pytest.mark.parametrize("message", [
    "pay 500", "I want to pay 500 today", "iPhone 128", "214 shirt", "samsung 128 gb",
    "I will come at 1230", "order 3 shirts",
])
def test_a_number_among_other_words_is_part_of_a_name_not_a_code(message):
    parsed = codes.parse(message)
    assert not parsed.is_order, message
    assert parsed.words, message


def test_but_a_cued_number_is_a_code_whatever_else_is_said():
    parsed = codes.parse("hello Al Noor, could I have code 214 for my brother please")
    assert parsed.is_order and [(r.value, r.quantity) for r in parsed.refs] == [("214", 1)]


def test_an_amount_of_money_is_not_a_code():
    for message in (
        "#214 Black abaya x2 - QAR 520", "#214 x2 - 520 ر.ق", "Total: 640", "الإجمالي: 640 ر.ق",
    ):
        found = [r.value for r in codes.parse(message).refs if r.kind == "code"]
        assert found in (["214"], []), message


# ── SKU-shaped words ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("token", ["OUD-12", "oud-12", "AB123", "KT/44", "ab_12", "shirt.m2"])
def test_a_sku_shaped_word_is_a_sku_and_nothing_else(token):
    parsed = codes.parse(token)
    assert [(r.kind, r.value) for r in parsed.refs] == [("sku", token.lower())], token
    assert parsed.words == [] and parsed.is_order


def test_a_sku_word_with_a_quantity():
    assert read("OUD-12 x2") == [("sku", "oud-12", 2)]
    assert read("oud-12, OUD-14 x3") == [("sku", "oud-12", 1), ("sku", "oud-14", 3)]


def test_a_sku_looking_word_inside_a_sentence_leaves_the_sentence_a_name():
    parsed = codes.parse("breaker 16A please")
    assert not parsed.is_order and parsed.words == ["breaker"]
    assert [(r.kind, r.value) for r in parsed.refs] == [("sku", "16a")]


def test_a_quantity_is_not_a_sku():
    for word in ("x2", "2x", "x10"):
        assert not codes.sku_like(word), word


# ── links ───────────────────────────────────────────────────────────────────────────


def test_an_item_link_is_one_item_with_the_shop_it_names():
    for message in (
        f"https://app.alyr.qa/s/al-noor?item={ITEM}",
        f"look at this: http://localhost:3100/s/Al-Noor?item={ITEM.upper()}&t=abc.",
        f"www.example.test/s/al-noor?item={ITEM}",
    ):
        [ref] = codes.parse(message).refs
        assert (ref.kind, ref.value, ref.slug) == ("item", ITEM, "al-noor"), message


def test_a_category_link_names_the_category_as_it_was_encoded():
    [ref] = codes.parse("https://app.alyr.qa/s/al-noor?cat=Cables%20%26%20Wire").refs
    assert (ref.kind, ref.value, ref.slug) == ("category", "Cables & Wire", "al-noor")
    [arabic] = codes.parse("https://app.alyr.qa/s/al-noor?cat=%D9%82%D9%87%D9%88%D8%A9").refs
    assert arabic.value == "قهوة"


def test_a_link_to_anything_else_is_not_read():
    for message in ("https://instagram.com/p/abc?item=" + ITEM, "https://alyr.qa/chat",
                    "https://app.alyr.qa/s/al-noor?item=not-an-id"):
        assert codes.parse(message).refs == [], message


def test_a_link_and_a_code_in_one_message():
    parsed = codes.parse(f"https://alyr.qa/s/al-noor?item={ITEM} and 305 x2")
    assert [(r.kind, r.quantity) for r in parsed.refs] == [("item", 1), ("code", 2)]


# ── the messages the order page writes ──────────────────────────────────────────────


def test_every_message_the_order_page_writes_is_read_back_into_the_same_order():
    spec = json.loads(MESSAGES.read_text(encoding="utf-8"))
    for case in spec["chat"]:
        for text, reads in zip(case["parts"], case["reads"], strict=True):
            parsed = codes.parse(text)
            assert [(int(r.value), r.quantity) for r in parsed.refs] == [tuple(x) for x in reads], (
                case["label"], text,
            )
            assert parsed.is_order, case["label"]


def test_the_message_for_a_person_is_read_the_same_way_if_it_reaches_a_chat():
    text = ("Order from the Al Noor page\n#214 Black abaya (M) x2 - QAR 520\n"
            "#305 Oud 50 ml x1 - QAR 120\nTotal: QAR 640\nName: Huda")
    assert [(r.value, r.quantity) for r in codes.parse(text).refs] == [("214", 2), ("305", 1)]
    arabic = ("طلب من صفحة النور\n#214 عباية سوداء (M) x2 - 520 ر.ق\n#305 عود x1 - 120 ر.ق\n"
              "الإجمالي: 640 ر.ق")
    assert [(r.value, r.quantity) for r in codes.parse(arabic).refs] == [("214", 2), ("305", 1)]
