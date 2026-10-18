"""The item's own low-stock number in the Catalog's import and export (ALY-108 on top of
ALY-106): a counted item can carry the number at or below which ALYR tells the owner it is
running low. An empty cell keeps what is there (the shop's number from Catalog settings is the
default and is not in the file), a number is 0 to 100,000, and it means something only for an
item counted in stock. The helpers are in test_catalog_import.py."""

from alyr.modules.items import columns, xlsx
from test_consent import owner_sql
from test_catalog_import import (
    apply_import,
    by_name,
    codes,
    do_import,
    entry_for,
    new_shop,
    preview_of,
    table,
    xlsx_of,
)

KEYS = ["name", "name_ar", "price", "rule", "stock", "low_stock"]


def seed(client):
    do_import(client, table(
        KEYS,
        ["Rice", "أرز", 38, None, 24, 6],                 # row 2: counted, its own number
        ["Tea", "شاي", 12, None, 30, None],               # row 3: counted, the shop's number
        ["Sugar", "سكر", 9, None, 40, 0],                 # row 4: 0 is a number
        ["Bread", "خبز", 3, "Counted in stock", 50, 12],  # row 5
    ))


def exported(client, lang="en") -> list[list]:
    return xlsx.read(client.get("/api/items/export", params={"lang": lang}).content).rows


def test_the_number_comes_in_with_the_item_and_goes_out_with_the_row(client):
    new_shop(client)
    seed(client)
    assert {n: by_name(client, n)["low_stock_at"] for n in ("Rice", "Tea", "Sugar", "Bread")} == {
        "Rice": 6, "Tea": None, "Sugar": 0, "Bread": 12}
    rows = exported(client)
    header = rows[0]
    assert header[columns.ORDER.index("low_stock")] == "Low-stock number"
    low, name = header.index("Low-stock number"), header.index("Name (English)")
    assert {r[name]: r[low] for r in rows[1:]} == {
        "Rice": 6, "Tea": None, "Sugar": 0, "Bread": 12}
    for lang in ("en", "ar"):   # and it reads back as no change in either language
        shown = preview_of(client, client.get("/api/items/export", params={"lang": lang}).content)
        assert shown["summary"]["unchanged"] == 4 and shown["summary"]["error"] == 0, lang
        assert shown["summary"]["warnings"] == 0, lang


def test_the_templates_that_count_stock_ask_for_it_in_both_languages(client):
    new_shop(client)
    for kind in ("grocery", "shop", "wholesale"):
        assert "low_stock" in columns.KIND_BY_KEY[kind].columns, kind
        for lang, word in (("en", "Low-stock number"), ("ar", "رقم المخزون القليل")):
            data = client.get("/api/items/import/template",
                              params={"kind": kind, "lang": lang}).content
            assert word in xlsx.read(data).rows[0], (kind, lang)
    for kind in ("generic", "restaurant", "bakery", "fashion", "services"):
        assert "low_stock" not in columns.KIND_BY_KEY[kind].columns, kind


def test_the_template_examples_with_a_number_become_items_with_that_number(client):
    new_shop(client)
    data = client.get("/api/items/import/template",
                      params={"kind": "grocery", "lang": "en"}).content
    shown = preview_of(client, data)
    assert shown["summary"]["error"] == 0
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Basmati rice 5 kg")["low_stock_at"] == 6
    assert by_name(client, "Fresh tomatoes")["low_stock_at"] is None


def test_updating_changes_the_number_an_empty_cell_keeps_it_and_undo_puts_it_back(client):
    new_shop(client)
    seed(client)
    rows = exported(client)
    h = rows[0]
    low, name = h.index("Low-stock number"), h.index("Name (English)")
    for r in rows[1:]:
        if r[name] == "Rice":
            r[low] = 2
        if r[name] == "Bread":
            r[low] = None               # empty keeps it
        if r[name] == "Tea":
            r[low] = 10                 # from the shop's number to its own
    shown = preview_of(client, xlsx_of(rows))
    changed = {i["name"]: i for i in shown["items"] if i["action"] == "update"}
    assert set(changed) == {"Rice", "Tea"}
    assert [(d["column"], d["before"], d["after"]) for d in changed["Rice"]["diff"]] == [
        ("low_stock", "6", "2")]
    assert [(d["column"], d["before"], d["after"]) for d in changed["Tea"]["diff"]] == [
        ("low_stock", "", "10")]
    assert apply_import(client, shown).status_code == 200
    assert {n: by_name(client, n)["low_stock_at"] for n in ("Rice", "Tea", "Sugar", "Bread")} == {
        "Rice": 2, "Tea": 10, "Sugar": 0, "Bread": 12}
    undone = client.post("/api/items/import/undo").json()
    assert (undone["restored"], undone["left"]) == (2, [])
    assert {n: by_name(client, n)["low_stock_at"] for n in ("Rice", "Tea", "Sugar", "Bread")} == {
        "Rice": 6, "Tea": None, "Sugar": 0, "Bread": 12}


def test_undo_leaves_a_number_the_owner_changed_since_the_import(client):
    new_shop(client)
    seed(client)
    shown = preview_of(client, xlsx_of(table(["name", "low_stock"], ["Rice", 2], ["Tea", 10])),
                       on_duplicate="update")
    assert apply_import(client, shown).status_code == 200
    rice = by_name(client, "Rice")
    assert client.put(f"/api/items/{rice['id']}", json={"low_stock_at": 3}).status_code == 200
    undone = client.post("/api/items/import/undo").json()
    assert {i["name"]: i["code"] for i in undone["left"]} == {"Rice": "changed_since"}
    assert undone["restored"] == 1
    assert by_name(client, "Rice")["low_stock_at"] == 3     # the owner's own edit stands
    assert by_name(client, "Tea")["low_stock_at"] is None   # restored to the shop's number


def test_undo_keeps_a_new_item_whose_number_the_owner_changed_since_the_import(client):
    new_shop(client)
    seed(client)
    rice = by_name(client, "Rice")
    assert client.put(f"/api/items/{rice['id']}", json={"low_stock_at": 9}).status_code == 200
    undone = client.post("/api/items/import/undo").json()
    assert {i["name"]: i["code"] for i in undone["left"]} == {"Rice": "changed_since"}
    assert undone["removed"] == 3
    assert by_name(client, "Rice")["low_stock_at"] == 9     # still there, as the owner left it


def test_the_number_changes_when_it_is_the_only_column_that_does(client):
    new_shop(client)
    seed(client)
    shown = preview_of(client, xlsx_of(table(
        ["name", "low_stock"], ["Rice", 9], ["Tea", None]), ), on_duplicate="update")
    rice, tea = entry_for(shown, 2), entry_for(shown, 3)
    assert (rice["action"], tea["action"]) == ("update", "unchanged")
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Rice")["low_stock_at"] == 9
    assert by_name(client, "Rice")["variants"][0]["on_hand"] == 24   # stock untouched


def test_a_number_for_an_item_that_is_not_counted_is_not_used_and_says_so(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(
        [*KEYS, "per_day"],
        ["Lamp", "مصباح", 75, "On or off", None, 5, None],         # row 2
        ["Cake", "كيك", 60, "A number each day", None, 3, 8],      # row 3: a daily number counts
    )))
    lamp, cake = entry_for(shown, 2), entry_for(shown, 3)
    assert "low_stock_ignored" in codes(lamp, "warning")
    assert "low_stock_ignored" not in codes(cake)
    assert "not counted in stock" in next(
        n["message"] for n in lamp["issues"] if n["code"] == "low_stock_ignored")
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Lamp")["low_stock_at"] is None
    assert by_name(client, "Cake")["low_stock_at"] == 3
    # An update of an item that is not counted says the same and changes nothing.
    again = preview_of(client, xlsx_of(table(["name", "low_stock"], ["Lamp", 8])),
                       on_duplicate="update")
    entry = entry_for(again, 2)
    assert entry["action"] == "unchanged" and "low_stock_ignored" in codes(entry)


def test_a_number_outside_0_to_100000_or_not_a_number_is_an_error_for_its_row(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(
        KEYS,
        ["Rice", "أرز", 38, None, 24, -1],        # row 2
        ["Tea", "شاي", 12, None, 30, 100001],     # row 3
        ["Sugar", "سكر", 9, None, 40, "a few"],   # row 4
        ["Salt", "ملح", 2, None, 40, 2.5],        # row 5
        ["Flour", "طحين", 4, None, 40, 100000],   # row 6: the top of the range
        ["Oil", "زيت", 8, None, 40, "٧"],         # row 7: an Eastern digit
    )))
    assert [codes(entry_for(shown, r), "error") for r in (2, 3, 4, 5)] == [
        ["out_of_range"], ["out_of_range"], ["bad_number"], ["not_whole"]]
    assert shown["summary"]["error"] == 4 and shown["summary"]["create"] == 2
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Flour")["low_stock_at"] == 100000
    assert by_name(client, "Oil")["low_stock_at"] == 7


def test_other_spellings_of_the_header_are_understood_in_either_language(client):
    new_shop(client)
    for header, number in (("Reorder level", 4), ("low stock", 5), ("رقم المخزون القليل", 6),
                           ("حد إعادة الطلب", 7)):
        rows = [["Name (English)", "Name (Arabic)", "Price (QAR)", "In stock", header],
                [f"Item {number}", f"صنف {number}", 10, 20, number]]
        shown = preview_of(client, xlsx_of(rows))
        assert shown["summary"]["error"] == 0, header
        assert apply_import(client, shown).status_code == 200, header
        assert by_name(client, f"Item {number}")["low_stock_at"] == number, header


def alert_jobs(item: dict) -> int:
    return owner_sql(
        "select count(*) from jobs where kind = 'catalog.stock_alert' and payload->>'item_id' = $1",
        item["id"],
    )[0][0]


def test_counting_stock_down_to_the_number_queues_the_owner_alert_like_any_count(client):
    """A stock number in a file is a count like any other (ALY-106): taking a live counted
    item to its low-stock number queues the one owner alert; adding stock queues none."""
    new_shop(client)
    seed(client)                                        # opening stock: nothing is low yet
    assert [alert_jobs(by_name(client, n)) for n in ("Rice", "Tea", "Sugar", "Bread")] == [
        0, 0, 0, 0]
    rows = exported(client)
    h = rows[0]
    stock, name = h.index("In stock"), h.index("Name (English)")
    for r in rows[1:]:
        if r[name] == "Rice":
            r[stock] = 4        # down to its own number (6)
        if r[name] == "Tea":
            r[stock] = 80       # up
    assert apply_import(client, preview_of(client, xlsx_of(rows))).status_code == 200
    # (At night on the shop's clock the first job waits for the morning with a second.)
    assert [alert_jobs(by_name(client, n)) > 0 for n in ("Rice", "Tea", "Sugar", "Bread")] == [
        True, False, False, False]
