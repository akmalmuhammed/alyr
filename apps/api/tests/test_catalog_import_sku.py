"""SKU in the Catalog's import and export (ALY-108 on top of ALY-127): the code of an item and
the code of each size or colour come in and go out with every row, are never used twice in a
shop (case does not matter) or twice in a file, and a clash is an error for the row that
causes it, naming what already has the code. The helpers are in test_catalog_import.py."""

from alyr.modules.items import columns, xlsx
from test_catalog_import import (
    apply_import,
    by_name,
    codes,
    do_import,
    entry_for,
    items_of,
    new_shop,
    preview_of,
    table,
    xlsx_of,
)

KEYS = ["name", "name_ar", "sku", "price", "variant", "variant_sku", "stock"]


def seed(client):
    do_import(client, table(
        KEYS,
        ["Scarf", "وشاح", "SCARF", 45, "Blue", "SCARF-BLU", 5],        # row 2
        ["Scarf", "وشاح", None, None, "Grey", "SCARF-GRY", 3],         # row 3
        ["Mug", "كوب", "MUG-1", 20, None, None, None],                 # row 4
        # row 5: a code on its one size
        ["Lamp", "مصباح", None, 75, None, "LAMP-ONLY", None],
    ))


def skus_of(client, name: str) -> dict:
    return {v["name"]: v["sku"] for v in by_name(client, name)["variants"]}


def exported(client, lang="en") -> list[list]:
    return xlsx.read(client.get("/api/items/export", params={"lang": lang}).content).rows


def test_the_code_of_an_item_and_of_each_size_comes_in_and_goes_out(client):
    new_shop(client)
    seed(client)
    scarf = by_name(client, "Scarf")
    assert scarf["sku"] == "SCARF"
    assert {v["name"]: v["sku"] for v in scarf["variants"]} == {
        "Blue": "SCARF-BLU", "Grey": "SCARF-GRY"}
    assert by_name(client, "Mug")["sku"] == "MUG-1"
    assert by_name(client, "Lamp")["variants"][0]["sku"] == "LAMP-ONLY"
    rows = exported(client)
    header = rows[0]
    assert header[columns.ORDER.index("sku")] == "SKU"
    assert header[columns.ORDER.index("variant_sku")] == "Size or colour SKU"
    by_row = {(r[header.index("Name (English)")], r[header.index("Size or colour")] or ""):
              (r[header.index("SKU")] or "", r[header.index("Size or colour SKU")] or "")
              for r in rows[1:]}
    assert by_row == {("Scarf", "Blue"): ("SCARF", "SCARF-BLU"),
                      ("Scarf", "Grey"): ("SCARF", "SCARF-GRY"),
                      ("Mug", ""): ("MUG-1", ""), ("Lamp", ""): ("", "LAMP-ONLY")}
    for lang in ("en", "ar"):   # and it reads back as no change in either language
        shown = preview_of(client, client.get("/api/items/export", params={"lang": lang}).content)
        assert shown["summary"]["unchanged"] == 3 and shown["summary"]["error"] == 0, lang
        assert shown["summary"]["warnings"] == 0


def test_the_templates_that_sell_by_code_ask_for_it_in_both_languages(client):
    new_shop(client)
    for kind in ("generic", "grocery", "fashion", "shop", "wholesale"):
        assert "sku" in columns.KIND_BY_KEY[kind].columns, kind
        for lang, word in (("en", "SKU"), ("ar", "رمز الصنف")):
            data = client.get("/api/items/import/template",
                              params={"kind": kind, "lang": lang}).content
            assert word in xlsx.read(data).rows[0], (kind, lang)
    for kind in ("restaurant", "bakery", "services"):
        assert "sku" not in columns.KIND_BY_KEY[kind].columns


def test_a_code_the_shop_already_uses_is_an_error_naming_what_has_it(client):
    new_shop(client)
    seed(client)
    rows = table(
        KEYS,
        # row 2: an item's code, in other case
        ["Cup", "فنجان", "scarf", 5, None, None, None],
        ["Plate", "صحن", "PLATE", 8, "Big", "scarf-gry", None],        # row 3: a size's code
        ["Bowl", "وعاء", "BOWL", 6, None, None, None],                 # row 4: fine
        # row 5: an item's code on a size
        ["Jug", "إبريق", "JUG", 9, "Tall", "MUG-1", None],
        ["Fork", "شوكة", "FORK", 2, None, None, None],                 # row 6: fine
    )
    shown = preview_of(client, xlsx_of(rows))
    assert [i["action"] for i in shown["items"]] == ["error", "error", "create", "error", "create"]
    taken = {i["row"]: i["issues"][0] for i in shown["items"] if i["action"] == "error"}
    assert taken[2]["code"] == "sku_taken"
    assert "“scarf” is already used by Scarf" in taken[2]["message"]
    assert "Scarf (Grey)" in taken[3]["message"] and taken[3]["row"] == 3
    assert "Mug" in taken[5]["message"]
    assert "مستخدم بالفعل" in taken[2]["message_ar"] and "Scarf" in taken[2]["message_ar"]
    assert apply_import(client, shown).status_code == 200
    assert sorted(i["name"] for i in items_of(client)) == [
        "Bowl", "Fork", "Lamp", "Mug", "Scarf"]


def test_a_code_belongs_to_an_archived_item_until_it_is_cleared(client):
    new_shop(client)
    seed(client)
    mug = by_name(client, "Mug")
    archived = client.post(f"/api/items/{mug['id']}/status", json={"status": "archived"})
    assert archived.status_code == 200
    again = table(KEYS, ["Mug 2", "كوب ٢", "MUG-1", 22, None, None, None])
    shown = preview_of(client, xlsx_of(again))
    assert codes(shown["items"][0], "error") == ["sku_taken"]
    assert "Mug" in shown["items"][0]["issues"][0]["message"]


def test_a_code_used_twice_in_one_file_is_an_error_for_the_second_row(client):
    new_shop(client)
    rows = table(
        KEYS,
        ["A", "أ", "X-1", 1, None, None, None],                        # row 2
        # row 3: the same, in other case
        ["B", "ب", "x-1", 2, None, None, None],
        ["C", "ج", "C-1", 3, "S", "C-S", None],                        # row 4
        # row 5: a size repeats a size
        ["C", "ج", None, None, "M", "c-s", None],
        # row 6: a size repeats its item
        ["D", "د", "D-1", 4, "S", "D-1", None],
        ["E", "ه", "E-1", 5, "S", "E-S", None],                        # row 7: fine
        # row 8: the item's code again: the same item
        ["E", "ه", "E-1", None, "M", "E-M", None],
    )
    shown = preview_of(client, xlsx_of(rows))
    actions = {i["name"]: i["action"] for i in shown["items"]}
    assert actions == {"A": "create", "B": "error", "C": "error", "D": "error", "E": "create"}
    second = entry_for(shown, 3)["issues"][0]
    assert second["code"] == "sku_repeated" and second["row"] == 3 and "row 2" in second["message"]
    assert entry_for(shown, 5)["issues"][0]["row"] == 5
    assert entry_for(shown, 6)["issues"][0]["row"] == 6
    assert apply_import(client, shown).status_code == 200
    assert skus_of(client, "E") == {"S": "E-S", "M": "E-M"}


def test_a_code_is_at_most_40_characters(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(KEYS, ["A", "أ", "X" * 41, 1, None, None, None])))
    issue = shown["items"][0]["issues"][0]
    assert (issue["code"], issue["column"]) == ("too_long", "sku") and "SKU" in issue["message"]
    ok = preview_of(client, xlsx_of(table(KEYS, ["A", "أ", "X" * 40, 1, None, None, None])))
    assert ok["summary"]["create"] == 1


def test_updating_changes_a_code_and_an_empty_cell_keeps_it_and_undo_puts_it_back(client):
    new_shop(client)
    seed(client)
    rows = exported(client)
    h = rows[0]
    sku, name = h.index("SKU"), h.index("Name (English)")
    variant_sku = h.index("Size or colour SKU")
    size = h.index("Size or colour")
    for r in rows[1:]:
        if r[name] == "Mug":
            r[sku] = "MUG-2"
        if r[name] == "Scarf" and r[size] == "Grey":
            r[variant_sku] = "SCARF-GREY"
        if r[name] == "Lamp":
            r[variant_sku] = None            # empty keeps it
    shown = preview_of(client, xlsx_of(rows))
    changed = {i["name"]: i for i in shown["items"] if i["action"] == "update"}
    assert set(changed) == {"Mug", "Scarf"}
    assert [(d["column"], d["before"], d["after"]) for d in changed["Mug"]["diff"]] == [
        ("sku", "MUG-1", "MUG-2")]
    assert [(d["column"], d["variant"], d["before"], d["after"])
            for d in changed["Scarf"]["diff"]] == [
        ("variant_sku", "Grey", "SCARF-GRY", "SCARF-GREY")]
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Mug")["sku"] == "MUG-2"
    assert skus_of(client, "Scarf")["Grey"] == "SCARF-GREY"
    assert by_name(client, "Lamp")["variants"][0]["sku"] == "LAMP-ONLY"
    undone = client.post("/api/items/import/undo").json()
    assert (undone["restored"], undone["left"]) == (2, [])
    assert by_name(client, "Mug")["sku"] == "MUG-1"
    assert skus_of(client, "Scarf")["Grey"] == "SCARF-GRY"


def test_moving_a_code_onto_another_item_is_an_error_and_the_item_keeps_its_own(client):
    new_shop(client)
    seed(client)
    rows = exported(client)
    h = rows[0]
    for r in rows[1:]:
        if r[h.index("Name (English)")] == "Mug":
            r[h.index("SKU")] = "SCARF"
    shown = preview_of(client, xlsx_of(rows))
    mug = next(i for i in shown["items"] if i["name"] == "Mug")
    assert mug["action"] == "error" and codes(mug, "error") == ["sku_taken"]
    assert "Scarf" in mug["issues"][0]["message"]
    assert by_name(client, "Mug")["sku"] == "MUG-1"


def test_arabic_headers_for_both_codes_are_understood(client):
    new_shop(client)
    rows = [["الاسم بالإنجليزية", "الاسم بالعربية", "رمز الصنف", "السعر (ر.ق)", "المقاس أو اللون",
             "رمز المقاس أو اللون"],
            ["Scarf", "وشاح", "SCARF", 45, "Blue", "SCARF-BLU"]]
    shown = preview_of(client, xlsx_of(rows))
    assert shown["summary"]["create"] == 1 and not shown["notes"]
    apply_import(client, shown)
    assert by_name(client, "Scarf")["variants"][0]["sku"] == "SCARF-BLU"
