"""Applying an import (ALY-108): everything the preview showed and nothing else, in one go;
stock numbers through the stock log; who did it on the record; the one undo; and the export
that reads back as no change. The helpers are in test_catalog_import.py."""

import json
from uuid import UUID

from alyr.modules.items import service, xlsx
from test_catalog_import import (
    BASIC,
    apply_import,
    by_name,
    codes,
    do_import,
    entry_for,
    items_of,
    join_shop,
    new_shop,
    preview_of,
    table,
    xlsx_of,
)
from test_consent import owner_sql


def unreconciled(shop: dict) -> list:
    """Variants whose number is not the total of their stock log: always empty."""
    return owner_sql(
        "select v.id from item_variants v where v.tenant_id = $1 and v.on_hand <> coalesce("
        "(select sum(m.delta) from stock_movements m where m.variant_id = v.id "
        "and m.day is null), 0)", shop["tenant"],
    )


def log_of(client, item: dict) -> list[dict]:
    return client.get(f"/api/items/{item['id']}/stock-log").json()["log"]


def exported(client, **query) -> list[list]:
    answer = client.get("/api/items/export", params=query)
    assert answer.status_code == 200, answer.text
    return xlsx.read(answer.content).rows


STOCKED = ["name", "name_ar", "price", "rule", "variant", "stock"]


# ── stock goes through the log ───────────────────────────

def test_stock_numbers_in_an_import_are_log_entries_with_the_reason_import(client):
    shop = new_shop(client, tag="Huda")
    do_import(client, table(
        STOCKED,
        ["Abaya", "عباية", 260, "Counted in stock", "52", 4],
        ["Abaya", "عباية", None, None, "54", 6],
        ["Mug", "كوب", 20, None, None, 30],      # no rule given: a stock number means counted
        ["Tea", "شاي", 3, None, None, None],     # no number: on or off
    ))
    abaya, mug, tea = by_name(client, "Abaya"), by_name(client, "Mug"), by_name(client, "Tea")
    assert (mug["stock_rule"], tea["stock_rule"]) == ("count", "switch")
    assert {v["name"]: v["on_hand"] for v in abaya["variants"]} == {"52": 4, "54": 6}
    entries = log_of(client, abaya) + log_of(client, mug)
    assert sorted((m["variant"], m["kind"], m["delta"], m["balance_after"]) for m in entries) == [
        ("", "opening", 30, 30), ("52", "opening", 4, 4), ("54", "opening", 6, 6),
    ]
    assert {m["reason"] for m in entries} == {"Import"}
    assert {m["actor"]["name"] for m in entries} == {"owner Huda"}
    assert log_of(client, tea) == []
    assert unreconciled(shop) == []


def test_a_stock_number_for_an_item_that_exists_is_a_count_that_records_the_difference(client):
    shop = new_shop(client)
    do_import(client, table(STOCKED, ["Mug", "كوب", 20, None, None, 30]))
    mug = by_name(client, "Mug")
    rows = exported(client)
    stock_col = rows[0].index("In stock")
    rows[1][stock_col] = 25
    shown = preview_of(client, xlsx_of(rows))
    entry = shown["items"][0]
    assert entry["action"] == "update" and entry["stock_moves"] == 1
    assert [(d["column"], d["before"], d["after"]) for d in entry["diff"]] == [
        ("stock", "30", "25")
    ]
    assert apply_import(client, shown).status_code == 200
    latest = log_of(client, mug)[0]
    assert (latest["kind"], latest["delta"], latest["balance_after"], latest["reason"]) == (
        "counted", -5, 25, "Import",
    )
    assert by_name(client, "Mug")["variants"][0]["on_hand"] == 25
    assert unreconciled(shop) == []
    # The same number again changes nothing and writes nothing.
    rows[1][stock_col] = 25
    again = preview_of(client, xlsx_of(rows))
    assert again["items"][0]["action"] == "unchanged" and again["summary"]["unchanged"] == 1
    apply = apply_import(client, again)
    assert apply.status_code == 422 and apply.json()["detail"]["code"] == "nothing_to_import"
    assert len(log_of(client, mug)) == 2


def test_a_stock_number_for_an_item_that_is_not_counted_is_left_out_with_a_warning(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(
        STOCKED, ["Tea", "شاي", 3, "On or off", None, 12])))
    entry = shown["items"][0]
    assert entry["action"] == "create" and "stock_ignored" in codes(entry, "warning")
    assert entry["stock_moves"] == 0
    apply_import(client, shown)
    assert by_name(client, "Tea")["variants"][0]["on_hand"] == 0


# ── nothing is half done ─────────────────────────────────

def test_if_anything_fails_while_applying_nothing_is_changed(client, monkeypatch):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(
        BASIC, ["A", "أ", "x", 1], ["B", "ب", "x", 2], ["C", "ج", "x", 3], ["D", "د", "x", 4])))
    real = service.create_item
    calls = []

    async def flaky(*args, **kwargs):
        calls.append(1)
        if len(calls) == 3:
            raise service.ItemError("bad_price", "The price must be more than zero.")
        return await real(*args, **kwargs)

    monkeypatch.setattr(service, "create_item", flaky)
    failed = apply_import(client, shown)
    assert failed.status_code == 409
    detail = failed.json()["detail"]
    assert detail["code"] == "import_failed" and "Row 4" in detail["message"]
    assert "Nothing was changed" in detail["message"] and detail["message_ar"]
    assert items_of(client) == []  # not even the two that went before the failure
    monkeypatch.setattr(service, "create_item", real)
    # The preview is still there, and applies once the problem is gone.
    assert client.get(f"/api/items/import/{shown['id']}").json()["status"] == "preview"
    assert apply_import(client, shown).status_code == 200
    assert len(items_of(client)) == 4


def test_an_import_is_applied_with_the_preview_it_was_shown_and_only_once(client):
    new_shop(client)
    do_import(client, table(BASIC, ["Tea", "شاي", "D", 3]))
    shown = preview_of(client, xlsx_of(table(BASIC, ["Tea", "شاي", "D", 5])), on_duplicate="update")
    wrong = client.post(f"/api/items/import/{shown['id']}/apply", json={"preview": "0" * 16})
    assert wrong.status_code == 409 and wrong.json()["detail"]["code"] == "changed_since_preview"
    # Someone else changes the price while the owner is looking: they must look again.
    tea = by_name(client, "Tea")
    client.put(f"/api/items/{tea['id']}", json={"price": 700})
    stale = apply_import(client, shown)
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "changed_since_preview"
    assert by_name(client, "Tea")["price"] == 700
    fresh = client.get(f"/api/items/import/{shown['id']}").json()
    assert fresh["hash"] != shown["hash"]
    assert [(d["before"], d["after"]) for d in fresh["items"][0]["diff"]] == [("QAR 7", "QAR 5")]
    assert apply_import(client, fresh).status_code == 200
    again = apply_import(client, fresh)
    assert again.status_code == 409 and again.json()["detail"]["code"] == "already_applied"
    assert by_name(client, "Tea")["price"] == 500


def test_a_preview_can_be_thrown_away_and_an_applied_import_cannot(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(BASIC, ["Tea", "شاي", "D", 3])))
    assert client.delete(f"/api/items/import/{shown['id']}").json() == {"discarded": True}
    assert client.get(f"/api/items/import/{shown['id']}").status_code == 404
    assert apply_import(client, shown).status_code == 404
    done = do_import(client, table(BASIC, ["Tea", "شاي", "D", 3]))
    assert client.delete(f"/api/items/import/{done['id']}").status_code == 404


# ── the record ───────────────────────────────────────────

def test_an_import_is_on_the_activity_record_with_who_did_it(client):
    new_shop(client, tag="Huda")
    done = do_import(client, table(BASIC, ["Tea", "شاي", "D", 3], ["Cake", "كيك", "S", 9]))
    assert done["by"]["name"] == "owner Huda" and done["filename"] == "items.xlsx"
    row = owner_sql("select action, actor_name, detail from activity where subject_id = $1",
                    UUID(done["id"]))[0]
    assert (row["action"], row["actor_name"]) == ("import_applied", "owner Huda")
    detail = json.loads(row["detail"])
    assert detail["created"] == 2 and detail["filename"] == "items.xlsx"
    # Each item says who made it, too.
    tea = by_name(client, "Tea")
    activity = client.get(f"/api/items/{tea['id']}/activity").json()["activity"]
    assert [(a["action"], a["actor"]["name"]) for a in activity] == [("created", "owner Huda")]
    listing = client.get("/api/items/import/recent").json()["imports"]
    assert [(r["filename"], r["created"], r["by"]["name"]) for r in listing] == [
        ("items.xlsx", 2, "owner Huda")
    ]


def test_a_new_item_is_a_draft_when_it_cannot_be_on_sale_and_the_row_says_why(client):
    new_shop(client)
    rows = table(BASIC,
                 ["Tea", "شاي", "D", 3],           # complete
                 ["Cake", None, "S", 9],            # no Arabic name
                 ["Bread", "خبز", "S", None],       # no price
                 ["Rice", None, "S", None])         # neither
    shown = preview_of(client, xlsx_of(rows))
    assert shown["summary"]["drafts"] == 3 and shown["summary"]["error"] == 0
    assert codes(entry_for(shown, 3), "warning") == ["arabic_missing"]
    assert codes(entry_for(shown, 4), "warning") == ["price_missing"]
    assert codes(entry_for(shown, 5), "warning") == ["price_missing", "arabic_missing"]
    assert apply_import(client, shown).status_code == 200
    states = {i["name"]: i["status"] for i in items_of(client)}
    assert states == {"Tea": "live", "Cake": "draft", "Bread": "draft", "Rice": "draft"}
    assert client.get("/api/items", params={"filter": "draft"}).json()["counts"]["draft"] == 3


def test_names_in_one_language_fill_the_other_and_say_so(client):
    new_shop(client)
    shown = preview_of(client, xlsx_of(table(
        BASIC, [None, "شاي", "D", 3], ["قهوة", None, "D", 4], ["Cola", "Cola", "D", 2])))
    assert codes(entry_for(shown, 2)) == ["english_from_arabic"]
    assert codes(entry_for(shown, 3)) == ["arabic_in_english"]
    assert codes(entry_for(shown, 4)) == ["name_not_arabic"]
    apply_import(client, shown)
    tea = [i for i in items_of(client) if i["name_ar"] == "شاي"][0]
    assert tea["name"] == "شاي" and tea["status"] == "live"


def test_new_categories_are_listed_and_one_letter_off_is_pointed_out(client):
    new_shop(client)
    do_import(client, table(BASIC, ["Tea", "شاي", "Drinks", 3]))
    rows = table(BASIC,
                 ["Coffee", "قهوة", "drinks", 4],       # the same, in other letters: snaps
                 ["Cake", "كيك", "Desserts", 9],        # new
                 ["Pie", "فطيرة", "Dessert", 8])        # new and a letter off the other
    shown = preview_of(client, xlsx_of(rows))
    assert [c["name"] for c in shown["summary"]["new_categories"]] == ["Dessert", "Desserts"]
    assert "similar_category" in codes(entry_for(shown, 4)) + codes(entry_for(shown, 3))
    apply_import(client, shown)
    assert by_name(client, "Coffee")["category"] == "Drinks"


# ── the one undo ─────────────────────────────────────────

def test_undo_takes_back_what_an_import_added_and_only_the_last_import_once(client):
    shop = new_shop(client, tag="Huda")
    do_import(client, table(BASIC, ["Keep", "ابق", "x", 1]))
    second = do_import(client, table(
        STOCKED, ["Mug", "كوب", 20, None, None, 30], ["Tea", "شاي", 3, None, None, None]))
    last = client.get("/api/items/import/last").json()["last"]
    assert last["id"] == second["id"] and last["can_undo"] is True
    undone = client.post("/api/items/import/undo")
    assert undone.status_code == 200, undone.text
    body = undone.json()
    assert (body["removed"], body["archived"], body["restored"], body["left"]) == (2, 0, 0, [])
    assert [i["name"] for i in items_of(client)] == ["Keep"]
    assert unreconciled(shop) == []
    assert client.get("/api/items/import/last").json() == {"last": None}
    again = client.post("/api/items/import/undo")
    assert again.status_code == 404 and again.json()["detail"]["code"] == "nothing_to_undo"
    # Who undid it is on the record, and the first import cannot be undone after the second.
    row = owner_sql("select action, actor_name from activity where subject_id = $1 "
                    "order by created_at desc", UUID(second["id"]))[0]
    assert (row["action"], row["actor_name"]) == ("import_undone", "owner Huda")
    recent = client.get("/api/items/import/recent").json()["imports"]
    assert [(r["status"], r["can_undo"]) for r in recent] == [("undone", False), ("applied", False)]


def test_undo_puts_back_old_prices_names_stock_and_sizes(client):
    shop = new_shop(client)
    do_import(client, table(STOCKED, ["Mug", "كوب", 20, None, None, 30],
                            ["Scarf", "وشاح", 45, "Counted in stock", "Blue", 5]))
    mug, scarf = by_name(client, "Mug"), by_name(client, "Scarf")
    rows = exported(client)
    header = rows[0]
    price, stock, variant = header.index("Price (QAR)"), header.index("In stock"), header.index(
        "Size or colour")
    name = header.index("Name (English)")
    for row in rows[1:]:
        if row[name] == "Mug":
            row[price], row[stock], row[name] = 22, 28, "Big mug"
        if row[name] == "Scarf":
            row[price] = 50
    rows.append([None] * len(header))
    rows[-1][header.index("Item ID")] = scarf["id"]
    rows[-1][variant], rows[-1][stock] = "Green", 8     # a new colour on an existing item
    shown = preview_of(client, xlsx_of(rows))
    assert shown["summary"]["update"] == 2 and shown["summary"]["error"] == 0, shown["items"]
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Big mug")["price"] == 2200
    assert {v["name"]: v["on_hand"] for v in by_name(client, "Scarf")["variants"]} == {
        "Blue": 5, "Green": 8,
    }

    undone = client.post("/api/items/import/undo").json()
    assert (undone["restored"], undone["left"]) == (2, [])
    mug_now, scarf_now = by_name(client, "Mug"), by_name(client, "Scarf")
    assert (mug_now["price"], mug_now["variants"][0]["on_hand"]) == (2000, 30)
    assert scarf_now["price"] == 4500
    active = {v["name"]: v["on_hand"] for v in scarf_now["variants"] if v["active"]}
    assert active == {"Blue": 5}
    assert unreconciled(shop) == []
    reasons = {m["reason"] for m in log_of(client, mug)}
    assert reasons == {"Import", "Undo of an import"}


def test_undo_leaves_alone_what_was_changed_after_the_import_and_names_it(client):
    new_shop(client)
    do_import(client, table(STOCKED, ["Mug", "كوب", 20, None, None, 30],
                            ["Tea", "شاي", 3, None, None, None], ["Cup", "كأس", 4, None, None, 5]))
    mug, tea, cup = by_name(client, "Mug"), by_name(client, "Tea"), by_name(client, "Cup")
    rows = exported(client)
    header = rows[0]
    for row in rows[1:]:
        row[header.index("Price (QAR)")] = row[header.index("Price (QAR)")] + 1
        if row[header.index("Name (English)")] == "Mug":
            row[header.index("In stock")] = 28
    assert apply_import(client, preview_of(client, xlsx_of(rows))).status_code == 200
    client.put(f"/api/items/{tea['id']}", json={"price": 999})          # edited since
    client.post(f"/api/items/{mug['id']}/stock", json={"kind": "received", "quantity": 4})
    undone = client.post("/api/items/import/undo").json()
    left = {item["name"]: item["code"] for item in undone["left"]}
    assert left == {"Tea": "changed_since", "Mug": "changed_since"}
    assert by_name(client, "Tea")["price"] == 999              # the owner's own edit stands
    assert by_name(client, "Cup")["price"] == 400              # restored
    assert by_name(client, "Mug")["price"] == 2000             # its price was restored ...
    assert by_name(client, "Mug")["variants"][0]["on_hand"] == 32   # ... its stock was not
    assert all(item["message"] and item["message_ar"] for item in undone["left"])
    assert cup["id"] and undone["restored"] == 1


def test_undo_archives_instead_of_removing_an_item_that_has_moved_since(client):
    new_shop(client)
    do_import(client, table(STOCKED, ["Mug", "كوب", 20, None, None, 30]))
    mug = by_name(client, "Mug")
    client.post(f"/api/items/{mug['id']}/stock", json={"kind": "wasted", "quantity": 2,
                                                      "reason": "Dropped"})
    undone = client.post("/api/items/import/undo").json()
    assert (undone["removed"], undone["archived"]) == (0, 1)
    assert undone["left"][0]["code"] == "kept"
    assert by_name(client, "Mug", archived=True)["status"] == "archived"
    assert items_of(client) == []   # off the list, with its history kept


def test_undo_is_for_people_who_may_edit_items(client):
    shop = new_shop(client)
    do_import(client, table(BASIC, ["Tea", "شاي", "D", 3]))
    join_shop(client, shop, "agent")
    refused = client.post("/api/items/import/undo")
    assert refused.status_code == 403
    assert client.get("/api/items/import/last").json()["last"]["can_undo"] is True
