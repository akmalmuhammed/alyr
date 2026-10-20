"""Decimal quantities in the Catalog's import and export (ALY-149 on top of ALY-108): the quantity
columns (step, smallest order, stock, low-stock number, per day) carry up to three decimals for
something sold by weight or volume, in either language's numerals and decimal marks; a fraction on
a counted unit is an error on its row; a unit or fraction the shop has not switched on is an
error on its row; the new units have words in both languages; and a file written by an export
reads back as no change. The helpers are in test_catalog_import.py."""

from decimal import Decimal

import pytest

from alyr.modules.items import columns, xlsx
from test_catalog_import import (
    apply_import,
    by_name,
    codes,
    csv_of,
    do_import,
    entry_for,
    new_shop,
    preview_of,
    table,
    xlsx_of,
)
from test_features_api import switch

KEYS = ["name", "name_ar", "price", "unit", "pack_size", "min_order", "rule", "stock", "low_stock"]


@pytest.fixture
def shop(client):
    new_shop(client)
    assert switch(client, "decimal_quantity", True).status_code == 200
    return client


def exported(client, lang="en") -> list[list]:
    return xlsx.read(client.get("/api/items/export", params={"lang": lang}).content).rows


def seed(client):
    do_import(client, table(
        KEYS,
        ["Medjool dates", "تمر مجدول", 125, "kg", 0.25, 0.25, "Counted in stock", 12.5, 2.5],
        ["Oud oil", "دهن عود", 90, "ml", 50, 50, "Counted in stock", 1250, 200],
        ["Cake", "كيكة", 60, "kg", 0.5, 0.5, "Counted in stock", 4.5, None],
        ["Cups", "أكواب", 8, "piece", None, 6, "Counted in stock", 48, 12],
    ))


def test_quantities_come_in_as_decimals_and_go_out_as_the_same_numbers(shop):
    seed(shop)
    dates = by_name(shop, "Medjool dates")
    assert (dates["unit"], dates["pack_size"], dates["min_order"]) == ("kg", 0.25, 0.25)
    assert dates["variants"][0]["on_hand"] == 12.5 and dates["low_stock_at"] == 2.5
    oud = by_name(shop, "Oud oil")
    assert (oud["unit"], oud["pack_size"], oud["variants"][0]["on_hand"]) == ("ml", 50, 1250)
    cups = by_name(shop, "Cups")
    assert cups["min_order"] == 6 and cups["variants"][0]["on_hand"] == 48
    rows = exported(shop)
    head = rows[0]
    stock, pack, low = head.index("In stock"), head.index("Units in a pack"), head.index(
        "Low-stock number")
    name = head.index("Name (English)")
    found = {r[name]: r for r in rows[1:]}
    assert found["Medjool dates"][stock] == Decimal("12.5") or found["Medjool dates"][stock] == 12.5
    assert float(found["Medjool dates"][pack]) == 0.25 and float(found["Medjool dates"][low]) == 2.5
    assert found["Oud oil"][head.index("Sold by")] == "Millilitre"


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_an_export_reads_back_as_no_change_in_either_language(shop, lang):
    seed(shop)
    data = shop.get("/api/items/export", params={"lang": lang}).content
    shown = preview_of(shop, data)
    assert shown["summary"]["unchanged"] == 4 and shown["summary"]["error"] == 0, shown["summary"]
    assert shown["summary"]["warnings"] == 0, shown["summary"]


def test_the_files_numerals_and_decimal_marks_are_read_in_either_language(shop):
    keys = ["name", "name_ar", "price", "unit", "pack_size", "min_order", "rule", "stock"]
    shown = preview_of(shop, csv_of(table(
        keys,
        ["Saffron", "زعفران", "450", "g", "٢٫٥", "٢٫٥", "Counted in stock", "١٢٫٥"],
        ["Coffee", "قهوة", "60", "كيلو", "0,25", "0,25", "Counted in stock", "3,5"],
        ["Rice", "أرز", "38", "kg", "0.125", "0.125", "Counted in stock", "1,250"],
    )), "items.csv")
    assert shown["summary"]["error"] == 0, [e["issues"] for e in shown["items"]]
    assert apply_import(shop, shown).status_code == 200
    saffron = by_name(shop, "Saffron")
    assert (saffron["unit"], saffron["pack_size"], saffron["variants"][0]["on_hand"]) == (
        "g", 2.5, 12.5)
    coffee = by_name(shop, "Coffee")
    assert (coffee["pack_size"], coffee["variants"][0]["on_hand"]) == (0.25, 3.5)
    rice = by_name(shop, "Rice")
    assert rice["pack_size"] == 0.125 and rice["variants"][0]["on_hand"] == 1250


def test_more_than_three_decimals_is_an_error_for_its_row(shop):
    shown = preview_of(shop, csv_of(table(
        KEYS, ["Tea", "شاي", "12", "kg", "0.25", "0.25", "Counted in stock", "1.2345", None],
    )), "items.csv")
    assert codes(entry_for(shown, 2), "error") == ["qty_decimals"]


def test_a_fraction_on_something_counted_is_an_error_naming_the_cell(shop):
    shown = preview_of(shop, csv_of(table(
        KEYS,
        ["Cups", "أكواب", "8", "piece", None, "1.5", "Counted in stock", "10", None],
        ["Plates", "صحون", "9", "box", None, None, "Counted in stock", "2.5", "1.5"],
    )), "items.csv")
    assert codes(entry_for(shown, 2), "error") == ["not_whole"]
    assert codes(entry_for(shown, 3), "error") == ["not_whole", "not_whole"]
    assert shown["summary"]["error"] == 2


def test_a_shop_that_has_not_switched_it_on_cannot_add_a_new_unit_or_a_fraction(client):
    new_shop(client)
    shown = preview_of(client, csv_of(table(
        KEYS,
        ["Oud oil", "دهن عود", "90", "ml", None, None, "Counted in stock", "10", None],
        ["Dates", "تمر", "12", "kg", "0.25", "0.25", "Counted in stock", "2", None],
        ["Rice", "أرز", "38", "kg", "5", "5", "Counted in stock", "20", None],
    )), "items.csv")
    assert codes(entry_for(shown, 2), "error") == ["decimal_off"]
    assert codes(entry_for(shown, 3), "error") == ["decimal_off"]
    assert codes(entry_for(shown, 4), "error") == []   # a kilo in whole lots, as ever
    assert apply_import(client, shown).status_code in (200, 409, 422)


def test_the_new_units_have_words_in_both_languages_and_the_old_ones_keep_theirs(shop):
    for key in ("g", "l", "ml", "m", "tola"):
        english, arabic, *_ = columns.WORDS["unit"][key]
        assert english and arabic
    assert columns.word_for("unit", "kg", "en") == "Kilo"
    assert columns.word_for("unit", "ml", "ar") == "مليلتر"
    for word, key in (("Gram", "g"), ("litre", "l"), ("مل", "ml"), ("Metre", "m"),
                      ("تولة", "tola"), ("كيلو", "kg"), ("Piece", "piece")):
        assert columns.parse_word_cell("unit", word, "bad_word") == key, word


def test_the_pack_and_minimum_columns_are_in_the_files_when_either_feature_is_on(shop):
    assert switch(shop, "pack_rules", False).status_code == 200
    head = exported(shop)[0]
    assert "Units in a pack" in head and "Smallest order" in head   # decimal quantities need them
    assert switch(shop, "decimal_quantity", False).status_code == 200
    head = exported(shop)[0]
    assert "Units in a pack" not in head and "Smallest order" not in head


def test_undoing_an_import_puts_decimal_stock_back(shop):
    seed(shop)
    rows = exported(shop)
    stock = rows[0].index("In stock")
    name = rows[0].index("Name (English)")
    for row in rows[1:]:
        if row[name] == "Medjool dates":
            row[stock] = 20.75
    shown = preview_of(shop, xlsx_of(rows))
    assert shown["summary"]["update"] == 1 and shown["summary"]["error"] == 0, shown["summary"]
    assert apply_import(shop, shown).status_code == 200
    assert by_name(shop, "Medjool dates")["variants"][0]["on_hand"] == 20.75
    undone = shop.post("/api/items/import/undo")
    assert undone.status_code == 200, undone.text
    assert by_name(shop, "Medjool dates")["variants"][0]["on_hand"] == 12.5
