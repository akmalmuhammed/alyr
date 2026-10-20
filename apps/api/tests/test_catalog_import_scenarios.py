"""Plan scenarios 20 and 21 of the Catalog (ALY-108): an import with bad rows imports the good
ones and lists the bad ones with the row and the reason; duplicate names are warned about and
never merged. The helpers are in test_catalog_import.py."""

from test_catalog_import import (
    BASIC,
    apply_import,
    by_name,
    codes,
    do_import,
    entry_for,
    head,
    items_of,
    new_shop,
    preview_of,
    table,
    upload,
    xlsx_of,
)
from test_consent import owner_sql

KEYS = ["name", "name_ar", "category", "price", "sale_price", "unit", "stock", "variant"]


def row_of(name=None, name_ar=None, category=None, price=None, sale=None, unit=None, stock=None,
           variant=None) -> list:
    return [name, name_ar, category, price, sale, unit, stock, variant]


# ── scenario 20: bad rows ────────────────────────────────

def test_scenario_20_good_rows_import_and_bad_rows_are_listed_with_their_row_and_reason(client):
    new_shop(client)
    rows = table(
        KEYS,
        row_of("Shawarma", "شاورما", "Wraps", 14),                                  # row 2
        row_of("Falafel", "فلافل", "Wraps", "QAR 9.50", unit="Piece"),              # row 3
        row_of("Hummus", "حمص", "Starters", "abc"),                                 # row 4: price
        row_of(None, None, "Wraps", 5),                                             # row 5: name
        row_of("Tea", "شاي", "Drinks", 3, unit="furlong"),                          # row 6: unit
        row_of("Juice", "عصير", "Drinks", 8, sale=9),                               # row 7: sale
        row_of("Cake", "كيك", "Sweets", 20, stock="lots"),                          # row 8: stock
        row_of("Soup", "شوربة", "Starters", "١٢٫٥٠"),                               # row 9
    )
    shown = preview_of(client, xlsx_of(rows))
    assert shown["summary"]["create"] == 3 and shown["summary"]["error"] == 5
    bad = {i["row"]: i for i in shown["items"] if i["action"] == "error"}
    assert sorted(bad) == [4, 5, 6, 7, 8]
    assert codes(bad[4], "error") == ["bad_money"]
    assert codes(bad[5], "error") == ["name_needed"]
    assert codes(bad[6], "error") == ["bad_word"]
    assert codes(bad[7], "error") == ["sale_not_below"]
    assert codes(bad[8], "error") == ["bad_number"]
    # Each says which row, in plain words, in both languages.
    note = bad[4]["issues"][0]
    assert note["row"] == 4 and "“abc”" in note["message"] and "Price" in note["message"]
    assert "«abc»" in note["message_ar"] and "السعر" in note["message_ar"]
    assert "piece" in bad[6]["issues"][0]["message"].lower()  # it lists the words that work
    # Nothing is in the catalog until the owner says so.
    assert items_of(client) == []

    done = apply_import(client, shown)
    assert done.status_code == 200, done.text
    result = done.json()
    assert result["summary"]["counts"]["create"] == 3 and result["summary"]["counts"]["error"] == 5
    assert sorted(i["name"] for i in items_of(client)) == ["Falafel", "Shawarma", "Soup"]
    assert by_name(client, "Soup")["price"] == 1250 and by_name(client, "Falafel")["price"] == 950
    # The report that stays lists the rows left out and why.
    left_out = [p for p in result["summary"]["problems"] if p["action"] == "error"]
    assert sorted(p["row"] for p in left_out) == [4, 5, 6, 7, 8]


def test_rows_are_numbered_as_the_spreadsheet_numbers_them_even_under_a_title(client):
    new_shop(client)
    rows = [["My price list"], [None], head(*BASIC), ["Tea", "شاي", "Drinks", 3],
            [None, None, None, None], ["Cake", "كيك", "Sweets", "free"]]
    shown = preview_of(client, xlsx_of(rows))
    assert [(i["row"], i["action"]) for i in shown["items"]] == [(4, "create"), (6, "error")]


def test_a_file_with_nothing_usable_is_refused_and_nothing_is_kept(client):
    shop = new_shop(client)
    for rows, code in (
        ([["a", "b"], [1, 2]], "no_header"),
        ([head("name", "price")], "no_items"),
    ):
        answer = upload(client, xlsx_of(rows))
        assert answer.status_code == 422 and answer.json()["detail"]["code"] == code
        assert answer.json()["detail"]["message_ar"]
    assert owner_sql("select count(*) as n from item_imports where tenant_id = $1",
                     shop["tenant"])[0]["n"] == 0


# ── scenario 21: duplicate names ─────────────────────────

def test_scenario_21_a_name_already_in_the_catalog_is_warned_about_and_allowed(client):
    new_shop(client)
    do_import(client, table(BASIC, ["Shawarma", "شاورما", "Wraps", 14]))
    shown = preview_of(client, xlsx_of(table(BASIC, ["Shawarma", "شاورما", "Wraps", 15])))
    entry = shown["items"][0]
    assert entry["action"] == "create" and codes(entry, "warning") == ["duplicate_name"]
    assert "already in your catalog" in entry["issues"][0]["message"]
    assert apply_import(client, shown).status_code == 200
    # Two items now, side by side, not merged, each with its own price.
    made = [i for i in items_of(client) if i["name"] == "Shawarma"]
    assert sorted(i["price"] for i in made) == [1400, 1500]


def test_scenario_21_the_same_name_twice_in_a_file_stays_two_items_unless_they_are_sizes(client):
    new_shop(client)
    keys = ["name", "name_ar", "price", "variant"]
    rows = table(
        keys,
        ["Scarf", "وشاح", 45, None],       # row 2
        ["Scarf", "وشاح", 50, None],       # row 3: the same name, no size: a second item
        ["Mug", "كوب", 20, "Small"],       # row 4
        ["Mug", "كوب", None, "Large"],     # row 5: the same item, another size
        ["Mug", None, None, "Large"],      # row 6: the same size twice
    )
    shown = preview_of(client, xlsx_of(rows))
    scarves = [i for i in shown["items"] if i["name"] == "Scarf"]
    assert len(scarves) == 2 and all("duplicate_in_file" in codes(s) for s in scarves)
    assert [s["action"] for s in scarves] == ["create", "create"]
    mug = entry_for(shown, 4)
    assert mug["rows"] == [4, 5, 6] and mug["action"] == "error"
    assert "duplicate_variant" in codes(entry_for(shown, 6))
    # Without the repeated size the mug is one item with two sizes.
    rows.pop()
    shown = preview_of(client, xlsx_of(rows))
    mug = entry_for(shown, 4)
    assert mug["rows"] == [4, 5] and mug["action"] == "create" and mug["variants"] == 2
    assert apply_import(client, shown).status_code == 200
    assert len([i for i in items_of(client) if i["name"] == "Scarf"]) == 2
    made = by_name(client, "Mug")
    assert sorted(v["name"] for v in made["variants"]) == ["Large", "Small"]


def test_scenario_21_the_owner_may_choose_to_update_or_skip_names_that_exist(client):
    new_shop(client)
    do_import(client, table(
        BASIC, ["Shawarma", "شاورما", "Wraps", 14], ["Falafel", "فلافل", "W", 9]))
    rows = table(BASIC, ["shawarma", "شاورما", "Wraps", 16], ["Hummus", "حمص", "Starters", 7])

    skipped = preview_of(client, xlsx_of(rows), on_duplicate="skip")
    assert [i["action"] for i in skipped["items"]] == ["skip", "create"]
    assert codes(skipped["items"][0]) == ["skipped_existing"]

    updated = preview_of(client, xlsx_of(rows), on_duplicate="update")
    first = updated["items"][0]
    assert first["action"] == "update" and codes(first) == ["updates_existing"]
    assert {(d["column"], d["before"], d["after"]) for d in first["diff"]} == {
        ("price", "QAR 14", "QAR 16"), ("name", "Shawarma", "shawarma"),
    }
    # The options can be changed on the same preview without sending the file again.
    again = client.post(f"/api/items/import/{skipped['id']}/options",
                        json={"on_duplicate": "update"}).json()
    assert [i["action"] for i in again["items"]] == ["update", "create"]
    assert apply_import(client, again).status_code == 200
    assert by_name(client, "shawarma")["price"] == 1600
    assert len(items_of(client)) == 3  # nothing was added for the name that already existed


def test_updating_by_name_will_not_guess_between_two_items_or_touch_one_twice(client):
    new_shop(client)
    do_import(client, table(BASIC, ["Tea", "شاي", "D", 3]))
    do_import(client, table(BASIC, ["Tea", "شاي", "D", 4]))  # a second item with the name
    shown = preview_of(client, xlsx_of(table(BASIC, ["Tea", "شاي", "D", 5])), on_duplicate="update")
    assert shown["items"][0]["action"] == "error"
    assert codes(shown["items"][0], "error") == ["ambiguous_match"]

    new_shop(client)
    do_import(client, table(BASIC, ["Coffee", "قهوة", "D", 3]))
    shown = preview_of(client, xlsx_of(table(
        BASIC, ["Coffee", "قهوة", "D", 5], ["Coffee", "قهوة", "D", 6])), on_duplicate="update")
    assert [i["action"] for i in shown["items"]] == ["update", "error"]
    assert codes(shown["items"][1], "error") == ["same_item_twice"]
