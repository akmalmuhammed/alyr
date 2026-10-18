"""An item that runs out by a number each day needs that number for every size (the engine
refuses a size without one, drafts included). The preview says so for the row, so that a
preview with no error is an import that goes through (ALY-108). The helpers are in
test_catalog_import.py."""

from alyr.modules.items import xlsx
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

KEYS = ["name", "name_ar", "price", "rule", "variant", "per_day"]


def test_a_new_item_with_a_number_each_day_and_no_number_is_an_error_for_its_row(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(
        KEYS,
        ["Cake", "كيك", 60, "A number each day", None, None],     # row 2: no number
        ["Pie", "فطيرة", 30, "A number each day", None, 12],       # row 3
        ["Bun", "كعكة", 5, "A number each day", "Small", 20],      # row 4
        [None, None, None, None, "Large", None],                   # row 5: a size with none
        ["Draft", "مسودة", 5, "A number each day", None, None],    # row 6
    )))
    assert codes(entry_for(shown, 2), "error") == ["per_day_needed"]
    assert codes(entry_for(shown, 3), "error") == []
    assert codes(entry_for(shown, 4), "error") == ["per_day_needed"]
    assert shown["summary"]["error"] == 3 and shown["summary"]["create"] == 1
    # What the preview calls good goes through, and the rest stays out.
    done = apply_import(client, shown)
    assert done.status_code == 200, done.text
    assert by_name(client, "Pie")["variants"][0]["daily_limit"] == 12


def test_an_update_that_leaves_a_size_without_its_number_is_an_error_for_its_row(client):
    new_shop(client)
    do_import(client, table(
        ["name", "name_ar", "price", "rule", "stock"],
        ["Soup", "شوربة", 9, "Counted in stock", 10],       # row 2
        ["Salad", "سلطة", 8, "Counted in stock", 10],       # row 3
    ))
    # Soup is moved to a number each day with no number; Salad is given one.
    shown = preview_of(client, xlsx_of(table(
        ["name", "rule", "per_day"],
        ["Soup", "A number each day", None],
        ["Salad", "A number each day", 15],
    )), on_duplicate="update")
    assert codes(entry_for(shown, 2), "error") == ["per_day_needed"]
    assert entry_for(shown, 3)["action"] == "update"
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Soup")["stock_rule"] == "count"
    assert by_name(client, "Salad")["stock_rule"] == "daily_limit"
    assert by_name(client, "Salad")["variants"][0]["daily_limit"] == 15


def test_a_new_size_of_an_item_with_a_number_each_day_needs_its_number_too(client):
    new_shop(client)
    do_import(client, table(
        KEYS,
        ["Bun", "كعكة", 5, "A number each day", "Small", 20],
    ))
    rows = xlsx.read(client.get("/api/items/export").content).rows
    h = rows[0]
    template = list(rows[1])
    template[h.index("Size or colour")] = "Large"
    template[h.index("Per day")] = None
    rows.append(template)
    shown = preview_of(client, xlsx_of(rows))
    assert codes(entry_for(shown, 2), "error") == ["per_day_needed"]
    template[h.index("Per day")] = 9
    shown = preview_of(client, xlsx_of(rows))
    assert shown["summary"]["error"] == 0
    assert apply_import(client, shown).status_code == 200
    assert {v["name"]: v["daily_limit"] for v in by_name(client, "Bun")["variants"]} == {
        "Small": 20, "Large": 9}
