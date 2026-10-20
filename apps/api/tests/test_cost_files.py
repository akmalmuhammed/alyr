"""The cost column of the Excel and CSV files (ALY-150 part 3): an owner's export carries it, a
file can set it for an item and for a size (and add an item with one), the preview shows what it
would change, a file that changes nothing changes nothing, the undo puts costs back, and a shop
that does not keep costs has no such column. Who may see or import it is in test_cost_leaks.py.
"""

import csv
import io

from catalog_wa import catalog_module_on  # noqa: F401  (the autouse fixture is used by name)
from test_consent import owner_sql
from test_cost import cake, cost_of, costs_on, sized


def csv_bytes(rows):
    out = io.StringIO()
    csv.writer(out).writerows(rows)
    return out.getvalue().encode("utf-8")


def upload(client, rows):
    response = client.post("/api/items/import?filename=costs.csv", content=csv_bytes(rows))
    assert response.status_code == 200, response.text
    return response.json()


def apply(client, preview):
    response = client.post(f"/api/items/import/{preview['id']}/apply",
                           json={"preview": preview["hash"]})
    assert response.status_code == 200, response.text
    return response.json()


def export_rows(client):
    text = client.get("/api/items/export?format=csv").text
    return list(csv.reader(io.StringIO(text)))


def kept():
    return {(str(r["item_id"]), str(r["variant_id"]) if r["variant_id"] else None): r["cost"]
            for r in owner_sql("select item_id, variant_id, cost from item_costs")}


def test_a_shop_that_keeps_no_costs_has_no_cost_column_and_a_file_that_has_one_is_told(client):
    item = cake(client)
    assert "Cost price (QAR)" not in client.get("/api/items/export?format=csv").text
    assert "Cost price (QAR)" not in client.get("/api/items/import/template?format=csv").text
    preview = upload(client, [["Item ID", "Name (English)", "Cost price (QAR)"],
                              [item["id"], "Dates cake", "5"]])
    note = next(n for n in preview["notes"] if n["code"] == "column_off")
    assert "Cost price and margin" in note["message"] and "switched off" in note["message"]
    assert kept() == {} and preview["items"][0]["action"] == "unchanged"


def test_an_owners_file_has_the_cost_column_at_the_end_and_a_round_trip_changes_nothing(client):
    costs_on(client)
    plain, with_sizes = cake(client), sized(client)
    large = next(v["id"] for v in with_sizes["variants"] if v["name"] == "Large")
    cost_of(client, plain, cost=4_050)
    cost_of(client, with_sizes, cost=3_000, variants={large: 5_500})
    rows = export_rows(client)
    assert rows[0][-1] == "Cost price (QAR)"
    name_col, size_col = rows[0].index("Name (English)"), rows[0].index("Size or colour")
    by_size = {(r[name_col], r[size_col]): r[-1] for r in rows[1:]}
    assert by_size[("Dates cake", "")] == "40.5"
    assert by_size[("Layer cake", "Small")] == "30" and by_size[("Layer cake", "Large")] == "55"
    preview = upload(client, rows)
    assert {i["action"] for i in preview["items"]} == {"unchanged"}
    apply_nothing = client.post(f"/api/items/import/{preview['id']}/apply",
                                json={"preview": preview["hash"]})
    assert apply_nothing.status_code in (200, 422)
    # the size that followed the item still follows it (no row of its own was made for it)
    assert kept() == {(plain["id"], None): 4_050, (with_sizes["id"], None): 3_000,
                      (with_sizes["id"], large): 5_500}


def test_a_file_changes_a_cost_the_preview_says_so_and_the_undo_puts_it_back(client):
    costs_on(client)
    item = cake(client)
    cost_of(client, item, cost=4_000)
    header = ["Item ID", "Name (English)", "Cost price (QAR)"]
    preview = upload(client, [header, [item["id"], "Dates cake", "45.50"]])
    [row] = preview["items"]
    assert row["action"] == "update"
    assert row["costs"] == [{"row": 2, "variant": "", "variant_id": None, "cost": 4_550}]
    change = next(d for d in row["diff"] if d["column"] == "cost")
    assert (change["before"], change["after"]) == ("QAR 40", "QAR 45.50")
    assert kept()[(item["id"], None)] == 4_000  # nothing changed yet
    done = apply(client, preview)
    assert done["status"] == "applied"
    assert kept()[(item["id"], None)] == 4_550
    history = client.get(f"/api/items/{item['id']}/cost").json()["history"]
    assert history[0]["cost"] == 4_550 and history[0]["reason"] == "Import"
    undone = client.post("/api/items/import/undo")
    assert undone.status_code == 200, undone.text
    assert kept()[(item["id"], None)] == 4_000
    assert client.get(f"/api/items/{item['id']}/cost").json()["history"][0]["cost"] == 4_000


def test_an_undo_leaves_a_cost_that_was_changed_since(client):
    costs_on(client)
    item = cake(client)
    cost_of(client, item, cost=4_000)
    preview = upload(client, [["Item ID", "Name (English)", "Cost price (QAR)"],
                              [item["id"], "Dates cake", "45"]])
    apply(client, preview)
    cost_of(client, item, cost=9_999)
    undone = client.post("/api/items/import/undo").json()
    assert undone["left"] and kept()[(item["id"], None)] == 9_999


def test_a_file_sets_the_cost_of_one_size_and_an_empty_cell_keeps_what_there_is(client):
    costs_on(client)
    item = sized(client)
    small, large = (v["id"] for v in item["variants"] if v["name"])
    cost_of(client, item, cost=3_000)
    header = ["Item ID", "Name (English)", "Size or colour", "Cost price (QAR)"]
    preview = upload(client, [header, [item["id"], "Layer cake", "Small", ""],
                              [item["id"], "Layer cake", "Large", "60"]])
    apply(client, preview)
    assert kept() == {(item["id"], None): 3_000, (item["id"], large): 6_000}
    assert small


def test_a_file_can_add_an_item_with_its_cost_and_the_cost_of_each_new_size(client):
    costs_on(client)
    header = ["Name (English)", "Name (Arabic)", "Price (QAR)", "Size or colour",
              "Cost price (QAR)"]
    preview = upload(client, [
        header,
        ["Walnut cake", "كيكة الجوز", "80", "Small", "20"],
        ["Walnut cake", "كيكة الجوز", "", "Large", "35.5"],
        ["Plain tea", "شاي", "5", "", "1.25"],
    ])
    apply(client, preview)
    rows = owner_sql(
        "select i.name, v.name as size, c.cost from item_costs c join items i on i.id = c.item_id "
        "left join item_variants v on v.id = c.variant_id order by i.name, v.name")
    assert [(r["name"], r["size"], r["cost"]) for r in rows] == [
        ("Plain tea", None, 125), ("Walnut cake", "Large", 3_550), ("Walnut cake", "Small", 2_000)]
    # the new item's undo removes it, and its costs with it
    client.post("/api/items/import/undo")
    assert owner_sql("select count(*) as n from item_costs")[0]["n"] == 0


def test_a_cost_that_is_not_an_amount_is_a_note_on_its_row_and_the_item_is_left_out(client):
    costs_on(client)
    item = cake(client)
    preview = upload(client, [["Item ID", "Name (English)", "Cost price (QAR)"],
                              [item["id"], "Dates cake", "lots"]])
    assert preview["items"][0]["action"] == "error"
    assert kept() == {}


def test_arabic_headers_and_digits_work_for_the_cost_column(client):
    costs_on(client)
    item = cake(client)
    preview = upload(client, [["رقم الصنف", "الاسم بالإنجليزية", "سعر التكلفة (ر.ق)"],
                              [item["id"], "Dates cake", "٤٥٫٥٠"]])
    apply(client, preview)
    assert kept()[(item["id"], None)] == 4_550
    arabic = client.get("/api/items/export?format=csv&lang=ar").text
    assert "سعر التكلفة (ر.ق)" in arabic
