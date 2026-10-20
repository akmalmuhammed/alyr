"""The owner's own fields (ALY-148, D-039 "As built (feature engine)"): defining them, their
values on items and sizes, archiving, limits, who may do what, what customers see, search, the
copy kept on an order line, and the Excel and CSV files (columns, preview, errors, apply, undo).
"""

import json

import pytest

from alyr.modules.items import fields
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from order_links import token
from test_catalog_import import (
    apply_import,
    by_name,
    csv_of,
    items_of,
    new_shop,
    preview_of,
    upload,
)
from test_consent import owner_sql
from test_items import STORE, fresh, mk, order, people
from test_sign_in import other_shop_with_owner, sign_in

FIELDS = "/api/custom-fields"
RECORD = "/api/items/settings/activity"
ALLERGENS = [
    {"label": "Contains nuts", "label_ar": "يحتوي مكسرات"},
    {"label": "Dairy free", "label_ar": "خالٍ من الألبان"},
]


def make(client, label="Serves", kind="number", **more) -> dict:
    answer = client.post(FIELDS, json={"label": label, "kind": kind, **more})
    assert answer.status_code == 200, answer.text
    return answer.json()["field"]


def refused(answer, code):
    assert answer.status_code == 422, answer.text
    detail = answer.json()["detail"]
    assert detail["code"] == code, detail
    assert detail["message"] and detail["message_ar"]
    return detail


def listed(client) -> list[dict]:
    return client.get(FIELDS).json()["fields"]


# ── the definitions ──────────────────────────────────────────────────────────────────


def test_a_field_has_a_key_two_names_a_kind_and_a_place(client):
    serves = make(client, "Serves", "number", label_ar="يكفي", unit="people",
                  shown_to_customers=True)
    assert serves["key"] == "serves" and serves["label_ar"] == "يكفي" and serves["unit"] == "people"
    assert (serves["kind"], serves["applies_to"], serves["archived"]) == ("number", "item", False)
    assert (serves["shown_to_customers"], serves["searchable"], serves["required"]) == (
        True, False, False)
    size = make(client, "Shade", "text", applies_to="variant")
    assert size["applies_to"] == "variant"
    # A name in Arabic only still makes a key.
    arabic = make(client, "", "text", label_ar="الوزن")
    assert arabic["key"] == "field" and arabic["label"] == ""
    again = make(client, "Serves", "number")
    assert again["key"] == "serves_2"  # a key is never reused, so a value never changes meaning
    assert [f["key"] for f in listed(client)] == ["serves", "shade", "field", "serves_2"]
    # "Colour" is one of the other spellings the files know for a size's name, so it is not free.
    refused(client.post(FIELDS, json={"label": "Colour", "kind": "text"}), "field_name_taken")


def test_a_list_field_needs_choices_and_a_number_field_takes_a_unit(client):
    refused(client.post(FIELDS, json={"label": "Allergens", "kind": "choice"}), "choices_needed")
    allergens = make(client, "Allergens", "choice", choices=ALLERGENS)
    assert [c["value"] for c in allergens["choices"]] == ["contains_nuts", "dairy_free"]
    assert allergens["choices"][0]["label_ar"] == "يحتوي مكسرات"
    assert make(client, "Note", "text", unit="ml")["unit"] == ""  # only a number has a unit


def test_a_field_cannot_be_named_like_a_column_of_the_files_or_be_empty(client):
    refused(client.post(FIELDS, json={"label": "Price (QAR)", "kind": "text"}), "field_name_taken")
    refused(client.post(FIELDS, json={"label": "", "kind": "text"}), "field_name_needed")
    assert client.post(FIELDS, json={"label": "x" * 61, "kind": "text"}).status_code == 422
    assert client.post(FIELDS, json={"label": "A", "kind": "color"}).status_code == 422


def test_there_is_a_limit_and_archiving_makes_room(client):
    for n in range(fields.MAX_FIELDS):
        make(client, f"Field {n}", "text")
    detail = refused(client.post(FIELDS, json={"label": "One more", "kind": "text"}),
                     "too_many_fields")
    assert "20" in detail["message"] and "Archive" in detail["message"]
    first = listed(client)[0]
    assert client.post(f"{FIELDS}/{first['id']}/archive").status_code == 200
    make(client, "One more", "text")
    refused(client.post(f"{FIELDS}/{first['id']}/restore"), "too_many_fields")
    assert client.get(FIELDS).json()["active"] == fields.MAX_FIELDS


def test_a_list_has_at_most_thirty_choices(client):
    many = [{"label": f"Choice {n}"} for n in range(31)]
    assert client.post(FIELDS, json={"label": "Big", "kind": "choice", "choices": many}
                       ).status_code == 422


def test_a_field_can_be_renamed_and_its_choices_changed_but_never_its_kind(client):
    allergens = make(client, "Allergens", "choice", choices=ALLERGENS)
    done = client.put(f"{FIELDS}/{allergens['id']}", json={
        "label": "Allergy", "label_ar": "حساسية", "shown_to_customers": True,
        "choices": [{"value": "contains_nuts", "label": "Has nuts", "label_ar": "فيه مكسرات"},
                    {"label": "Gluten", "label_ar": "غلوتين"}],
    })
    assert done.status_code == 200, done.text
    after = done.json()["field"]
    assert after["key"] == "allergens" and after["label"] == "Allergy"
    # A choice taken out stays, switched off: items may hold it.
    assert [(c["value"], c["active"]) for c in after["choices"]] == [
        ("contains_nuts", True), ("gluten", True), ("dairy_free", False)]
    assert client.put(f"{FIELDS}/{allergens['id']}", json={"kind": "text"}).status_code == 422
    assert client.put(f"{FIELDS}/{allergens['id']}", json={"key": "x"}).status_code == 422


def test_every_change_is_on_the_record(client):
    serves = make(client, "Serves", "number")
    client.put(f"{FIELDS}/{serves['id']}", json={"required": True, "label_ar": "يكفي"})
    client.post(f"{FIELDS}/{serves['id']}/archive")
    client.post(f"{FIELDS}/{serves['id']}/restore")
    rows = [r for r in client.get(RECORD).json()["activity"]
            if r["action"].startswith("custom_field")][:4]
    assert [r["action"] for r in rows] == [
        "custom_field_restored", "custom_field_archived", "custom_field_changed",
        "custom_field_added"]
    changed = rows[2]["detail"]
    assert {c["field"] for c in changed["changes"]} == {"required", "label_ar"}
    assert rows[3]["detail"]["key"] == "serves" and rows[0]["actor"]["name"]


def test_everyone_reads_the_fields_and_only_owners_and_admins_change_them(client):
    serves = make(client, "Serves", "number")
    sign_in(client, AGENT_EMAIL)
    assert client.get(FIELDS).status_code == 200
    assert client.get(FIELDS).json()["can_manage"] is False
    assert client.post(FIELDS, json={"label": "X", "kind": "text"}).status_code == 403
    assert client.put(f"{FIELDS}/{serves['id']}", json={"required": True}).status_code == 403
    assert client.post(f"{FIELDS}/{serves['id']}/archive").status_code == 403


def test_a_shop_never_sees_or_uses_another_shops_fields(client):
    serves = make(client, "Serves", "number")
    other = other_shop_with_owner("fields-other@other.example")
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog')", other)
    sign_in(client, "fields-other@other.example")
    assert listed(client) == []
    assert client.put(f"{FIELDS}/{serves['id']}", json={"required": True}).status_code == 404
    mine = make(client, "Serves", "number")  # the same key in another shop is its own field
    assert mine["key"] == "serves" and mine["id"] != serves["id"]
    mk(client, name="Tea", name_ar="شاي", custom={"serves": 4})
    seen = owner_sql("select tenant_id, key from custom_fields where tenant_id = any($1)",
                     [DEMO_TENANT_ID, other])
    assert {(str(r["tenant_id"]), r["key"]) for r in seen} == {
        (str(DEMO_TENANT_ID), "serves"), (str(other), "serves")}


# ── the values ───────────────────────────────────────────────────────────────────────


def test_an_item_holds_a_value_for_each_kind_and_reads_it_back(client):
    make(client, "Serves", "number", unit="people")
    make(client, "Allergens", "choice", choices=ALLERGENS)
    make(client, "Gift wrap", "yes_no")
    make(client, "Best before", "date")
    make(client, "Note", "text")
    tea = mk(client, name="Tea", name_ar="شاي", custom={
        "serves": "٣", "allergens": "Dairy free", "gift_wrap": "نعم", "best_before": "2026-12-31",
        "note": "  Made fresh  ",
    })
    assert tea["custom"] == {"serves": 3, "allergens": "dairy_free", "gift_wrap": True,
                             "best_before": "2026-12-31", "note": "Made fresh"}
    saved = client.put(f"/api/items/{tea['id']}", json={"custom": {"serves": 2.5, "note": None}})
    assert saved.status_code == 200, saved.text
    now = fresh(client, tea)["custom"]
    assert now["serves"] == 2.5 and "note" not in now and now["allergens"] == "dairy_free"
    # Only what was sent changes.
    assert client.put(f"/api/items/{tea['id']}", json={"price": 1500}).status_code == 200
    assert fresh(client, tea)["custom"] == now


@pytest.mark.parametrize(("key", "value", "code"), [
    ("serves", "many", "bad_number"), ("serves", 10**12, "bad_number"),
    ("allergens", "Peanuts", "bad_choice"), ("gift_wrap", "maybe", "bad_yes_no"),
    ("best_before", "31/12/2026", "bad_date"), ("note", "x" * 201, "value_too_long"),
    ("nothing", "x", "unknown_field"),
])
def test_a_value_that_does_not_fit_is_refused_in_both_languages(client, key, value, code):
    make(client, "Serves", "number")
    make(client, "Allergens", "choice", choices=ALLERGENS)
    make(client, "Gift wrap", "yes_no")
    make(client, "Best before", "date")
    make(client, "Note", "text")
    refused(client.post("/api/items", json={"name": "A", "name_ar": "أ", "price": 100,
                                            "status": "live", "custom": {key: value}}), code)


def test_a_size_holds_its_own_values_and_an_item_field_is_not_a_size_field(client):
    make(client, "Colour code", "text", applies_to="variant")
    make(client, "Serves", "number")
    shirt = mk(client, name="Shirt", name_ar="قميص", variants=[
        {"name": "S", "name_ar": "S", "custom": {"colour_code": "A1"}},
        {"name": "M", "name_ar": "M", "custom": {"colour_code": "B2"}}])
    assert [v["custom"] for v in shirt["variants"] if v["name"]] == [
        {"colour_code": "A1"}, {"colour_code": "B2"}]
    base = {"name": "B", "name_ar": "ب", "price": 1, "status": "live"}
    refused(client.post("/api/items", json={
        **base, "variants": [{"name": "S", "custom": {"serves": 2}}]}), "unknown_field")
    refused(client.post("/api/items", json={**base, "custom": {"colour_code": "A1"}}),
            "unknown_field")
    # A save of the sizes that does not mention the values keeps them.
    kept = client.put(f"/api/items/{shirt['id']}", json={"variants": [
        {"id": v["id"], "name": v["name"], "name_ar": v["name_ar"]}
        for v in shirt["variants"] if v["name"]]})
    assert kept.status_code == 200
    assert [v["custom"] for v in fresh(client, shirt)["variants"] if v["name"]] == [
        {"colour_code": "A1"}, {"colour_code": "B2"}]


def test_a_required_field_is_needed_before_an_item_goes_on_sale_not_for_a_draft(client):
    make(client, "Serves", "number", required=True)
    detail = refused(client.post("/api/items", json={
        "name": "A", "name_ar": "أ", "price": 100, "status": "live"}), "field_required")
    assert "Serves" in detail["message"]
    draft = client.post("/api/items", json={"name": "A", "name_ar": "أ", "price": 100,
                                            "status": "draft"})
    assert draft.status_code == 200
    item_id = draft.json()["id"]
    refused(client.put(f"/api/items/{item_id}", json={"status": "live"}), "field_required")
    assert client.put(f"/api/items/{item_id}", json={"status": "live",
                                                     "custom": {"serves": 2}}).status_code == 200
    # An item already on sale can be edited without it being filled in for everything else.
    other = mk(client, name="B", name_ar="ب", custom={"serves": 1})
    assert client.put(f"/api/items/{other['id']}", json={"price": 900}).status_code == 200


def test_a_required_size_field_is_needed_on_every_size(client):
    make(client, "Colour code", "text", applies_to="variant", required=True)
    refused(client.post("/api/items", json={
        "name": "A", "name_ar": "أ", "price": 100, "status": "live",
        "variants": [{"name": "S", "custom": {"colour_code": "A1"}}, {"name": "M"}]}),
        "field_required")


def test_archiving_hides_a_field_but_keeps_its_values_and_restoring_brings_them_back(client):
    serves = make(client, "Serves", "number", required=True)
    tea = mk(client, name="Tea", name_ar="شاي", custom={"serves": 4})
    assert client.post(f"{FIELDS}/{serves['id']}/archive").status_code == 200
    # It is not asked for, is refused as new input, and its value is still on the item.
    assert mk(client, name="Coffee", name_ar="قهوة")["custom"] == {}
    refused(client.put(f"/api/items/{tea['id']}", json={"custom": {"serves": 5}}), "field_archived")
    assert fresh(client, tea)["custom"] == {"serves": 4}
    assert [f["archived"] for f in listed(client)] == [True]
    client.post(f"{FIELDS}/{serves['id']}/restore")
    assert fresh(client, tea)["custom"] == {"serves": 4}
    assert client.put(f"/api/items/{tea['id']}", json={"custom": {"serves": 5}}).status_code == 200


def test_the_screen_says_how_many_items_hold_a_field(client):
    serves = make(client, "Serves", "number")
    mk(client, name="Tea", name_ar="شاي", custom={"serves": 4})
    mk(client, name="Cake", name_ar="كيك", custom={"serves": 8})
    mk(client, name="Plain", name_ar="عادي")
    row = next(f for f in client.get(FIELDS).json()["fields"] if f["id"] == serves["id"])
    assert row["used_by"] == 2


# ── the feature switch ───────────────────────────────────────────────────────────────


def test_with_the_feature_off_nothing_new_is_made_and_nothing_is_lost(client):
    serves = make(client, "Serves", "number", required=True)
    tea = mk(client, name="Tea", name_ar="شاي", custom={"serves": 4})
    assert client.put("/api/features/custom_fields", json={"enabled": False}).status_code == 200
    refused(client.post(FIELDS, json={"label": "New", "kind": "text"}), "feature_off")
    refused(client.post(f"{FIELDS}/{serves['id']}/restore"), "feature_off")
    # An item that has none cannot take one; an item that has keeps and may change its own.
    plain = mk(client, name="Plain", name_ar="عادي")  # required is not asked for any more
    refused(client.put(f"/api/items/{plain['id']}", json={"custom": {"serves": 1}}), "feature_off")
    assert fresh(client, tea)["custom"] == {"serves": 4}
    assert client.put(f"/api/items/{tea['id']}", json={"custom": {"serves": 6}}).status_code == 200
    # The definitions can still be changed and archived.
    assert client.put(f"{FIELDS}/{serves['id']}", json={"label": "People"}).status_code == 200
    assert client.post(f"{FIELDS}/{serves['id']}/archive").status_code == 200
    # Customers do not see fields while the feature is off.
    assert [r["fields"] for r in client.get(STORE).json()["items"] if r["id"] == tea["id"]] == [[]]


# ── customers ────────────────────────────────────────────────────────────────────────


def page_item(client, item) -> dict:
    return next(r for r in client.get(STORE).json()["items"] if r["id"] == item["id"])


def test_a_customer_sees_only_the_fields_the_owner_shows(client):
    make(client, "Serves", "number", label_ar="يكفي", unit="people", shown_to_customers=True)
    make(client, "Cost price note", "text", shown_to_customers=False)
    make(client, "Allergens", "choice", choices=ALLERGENS, shown_to_customers=True)
    tea = mk(client, name="Tea", name_ar="شاي", custom={
        "serves": 4, "cost_price_note": "secret", "allergens": "contains_nuts"})
    row = page_item(client, tea)
    assert [(f["key"], f["text"], f["text_ar"]) for f in row["fields"]] == [
        ("serves", "4 people", "4 people"), ("allergens", "Contains nuts", "يحتوي مكسرات")]
    assert "secret" not in str(client.get(STORE).json())
    # A field with no value is not shown, and an archived field goes.
    plain = mk(client, name="Plain", name_ar="عادي")
    assert page_item(client, plain)["fields"] == []
    serves = next(f for f in listed(client) if f["key"] == "serves")
    client.post(f"{FIELDS}/{serves['id']}/archive")
    assert [f["key"] for f in page_item(client, tea)["fields"]] == ["allergens"]


def test_a_size_field_is_shown_on_its_size(client):
    make(client, "Roast", "text", applies_to="variant", shown_to_customers=True)
    beans = mk(client, name="Beans", name_ar="بن", variants=[
        {"name": "250g", "name_ar": "250", "custom": {"roast": "Dark"}},
        {"name": "1kg", "name_ar": "1", "custom": {"roast": "Light"}}])
    sizes = page_item(client, beans)["variants"]
    assert [(v["name"], [f["text"] for f in v["fields"]]) for v in sizes] == [
        ("250g", ["Dark"]), ("1kg", ["Light"])]


def test_the_owners_search_and_the_customers_search_find_a_searchable_value(client):
    make(client, "Allergens", "choice", choices=ALLERGENS, searchable=True, shown_to_customers=True)
    make(client, "Internal code", "text", searchable=True, shown_to_customers=False)
    make(client, "Origin", "text", shown_to_customers=True)  # shown, not searched
    nuts = mk(client, name="Baklava", name_ar="بقلاوة", custom={
        "allergens": "contains_nuts", "internal_code": "ZX-9", "origin": "Lebanon"})
    mk(client, name="Plain loaf", name_ar="رغيف")
    names = lambda q: [i["name"] for i in items_of(client, q=q)]  # noqa: E731
    assert names("nuts") == ["Baklava"] and names("مكسرات") == ["Baklava"]
    assert names("zx-9") == ["Baklava"] and names("lebanon") == []
    # A customer finds it by what they can see, in either language, and never by what they cannot.
    def found(q):
        return [r["name"] for r in client.get(STORE, params={"q": q}).json()["items"]]
    assert found("nuts") == ["Baklava"] and found("مكسرات") == ["Baklava"]
    assert found("zx-9") == [] and found("lebanon") == []
    assert nuts["custom"]["allergens"] == "contains_nuts"


def test_an_order_line_keeps_the_fields_the_customer_saw_as_they_were(client):
    serves = make(client, "Serves", "number", unit="people", shown_to_customers=True)
    make(client, "Staff note", "text", shown_to_customers=False)
    cake = mk(client, name="Cake", name_ar="كيك", custom={"serves": 8, "staff_note": "hide me"})
    who = people(client, 1)[0]
    placed = order(client, who, [{"product_id": cake["id"], "quantity": 1}])
    assert placed.status_code == 200, placed.text
    line = copy_of_last_line()
    assert [(x["key"], x["label"], x["text"], x["text_ar"]) for x in line] == [
        ("serves", "Serves", "8 people", "8 people")]
    # The field is renamed and archived, the item changes: the order does not.
    client.put(f"{FIELDS}/{serves['id']}", json={"label": "Feeds"})
    client.put(f"/api/items/{cake['id']}", json={"custom": {"serves": 12}})
    client.post(f"{FIELDS}/{serves['id']}/archive")
    assert copy_of_last_line() == line
    shown = client.get("/api/orders").json()["orders"][0]["items"][0]
    assert [f["text"] for f in shown["fields"]] == ["8 people"]
    assert token(who["id"])  # the link a customer would use


def test_a_new_shop_order_without_fields_has_an_empty_copy(client):
    tea = mk(client, name="Tea", name_ar="شاي")
    who = people(client, 1)[0]
    assert order(client, who, [{"product_id": tea["id"], "quantity": 1}]).status_code == 200
    assert copy_of_last_line() == []


# ── the files ────────────────────────────────────────────────────────────────────────


def copy_of_last_line() -> list[dict]:
    """The fields copied onto the newest order line (read by the owner role, as stored)."""
    stored = owner_sql(
        "select i.custom from order_items i join orders o on o.id = i.order_id "
        "order by o.created_at desc, o.number desc limit 1")[0]["custom"]
    return json.loads(stored) if isinstance(stored, str) else stored


def csv_text(client, **query) -> list[str]:
    answer = client.get("/api/items/export", params={"format": "csv", **query})
    assert answer.status_code == 200
    return answer.content.decode("utf-8-sig").splitlines()


def test_the_export_and_the_template_carry_a_column_for_each_field(client):
    new_shop(client)
    make(client, "Serves", "number", label_ar="يكفي")
    make(client, "Allergens", "choice", label_ar="مسببات", choices=ALLERGENS)
    make(client, "Roast", "text", applies_to="variant")
    old = make(client, "Old", "text")
    client.post(f"{FIELDS}/{old['id']}/archive")
    mk(client, name="Tea", name_ar="شاي", custom={"serves": 4, "allergens": "dairy_free"})
    en = csv_text(client)
    assert en[0].split(",")[-3:] == ["Serves", "Allergens", "Roast"]
    assert en[1].split(",")[-3:] == ["4", "Dairy free", ""]
    ar = csv_text(client, lang="ar")
    assert ar[0].split(",")[-3:] == ["يكفي", "مسببات", "Roast"] and "خالٍ من الألبان" in ar[1]
    template = client.get("/api/items/import/template", params={
        "kind": "generic", "format": "csv"}).content.decode("utf-8-sig").splitlines()[0]
    assert template.split(",")[-3:] == ["Serves", "Allergens", "Roast"]
    client.put("/api/features/custom_fields", json={"enabled": False})
    assert "Serves" not in csv_text(client)[0]


def own(*rows):
    return csv_of([["Name (English)", "Name (Arabic)", "Price (QAR)", "Serves", "Allergens",
                    "Roast"], *rows])


def test_an_import_reads_a_field_per_column_and_checks_every_value(client):
    new_shop(client)
    make(client, "Serves", "number", required=False)
    make(client, "Allergens", "choice", choices=ALLERGENS)
    make(client, "Roast", "text", applies_to="variant")
    shown = preview_of(client, own(
        ["Date cake", "كيك التمر", "60", "٦", "Contains nuts", ""],
        ["Bad one", "سيئ", "10", "lots", "Peanuts", ""],
    ), "items.csv")
    good, bad = shown["items"]
    assert good["action"] == "create" and bad["action"] == "error"
    assert {i["code"] for i in bad["issues"]} == {"custom_bad"}
    assert any("Serves" in i["message"] for i in bad["issues"])
    assert any("يكفي" in i["message_ar"] or "Serves" in i["message_ar"] for i in bad["issues"])
    assert apply_import(client, shown).status_code == 200
    made = by_name(client, "Date cake")
    assert made["custom"] == {"serves": 6, "allergens": "contains_nuts"}


def test_an_import_updates_a_field_and_shows_what_changes_and_the_undo_puts_it_back(client):
    new_shop(client)
    make(client, "Serves", "number")
    make(client, "Roast", "text", applies_to="variant")
    tea = mk(client, name="Tea", name_ar="شاي", price=500, custom={"serves": 2})
    first = preview_of(client, csv_of([
        ["Item ID", "Name (English)", "Serves"], [tea["id"], "Tea", "9"]]), "items.csv")
    entry = first["items"][0]
    assert entry["action"] == "update"
    assert [(d["label"], d["before"], d["after"]) for d in entry["diff"]] == [("Serves", "2", "9")]
    assert apply_import(client, first).status_code == 200
    assert fresh(client, tea)["custom"] == {"serves": 9}
    undone = client.post("/api/items/import/undo")
    assert undone.status_code == 200 and undone.json()["restored"] == 1
    assert fresh(client, tea)["custom"] == {"serves": 2}


def test_an_import_with_sizes_sets_each_sizes_own_value(client):
    new_shop(client)
    make(client, "Roast", "text", applies_to="variant")
    shown = preview_of(client, csv_of([
        ["Name (English)", "Name (Arabic)", "Price (QAR)", "Size or colour", "Roast"],
        ["Beans", "بن", "40", "250g", "Dark"], ["Beans", "بن", "", "1kg", "Light"]]), "items.csv")
    assert shown["items"][0]["action"] == "create"
    assert apply_import(client, shown).status_code == 200
    beans = by_name(client, "Beans")
    assert [(v["name"], v["custom"]) for v in beans["variants"] if v["name"]] == [
        ("250g", {"roast": "Dark"}), ("1kg", {"roast": "Light"})]


def test_a_required_field_missing_from_a_file_makes_a_draft_with_a_note(client):
    new_shop(client)
    make(client, "Serves", "number", required=True)
    shown = preview_of(client, own(
        ["Date cake", "كيك التمر", "60", "6", "", ""], ["Plain", "عادي", "20", "", "", ""]),
        "items.csv")
    full, empty = shown["items"]
    assert full["draft"] is False and empty["draft"] is True
    assert "custom_missing" in [i["code"] for i in empty["issues"]]
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Plain")["status"] == "draft"


def test_a_column_is_left_out_with_a_note_when_the_feature_is_off(client):
    new_shop(client)
    make(client, "Serves", "number")
    client.put("/api/features/custom_fields", json={"enabled": False})
    shown = preview_of(client, own(["Date cake", "كيك التمر", "60", "6", "", ""]), "items.csv")
    assert "unknown_column" in [n["code"] for n in shown["notes"]]
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Date cake")["custom"] == {}


def test_a_file_with_a_bad_choice_in_arabic_is_refused_in_arabic(client):
    new_shop(client)
    make(client, "Allergens", "choice", choices=ALLERGENS)
    answer = upload(client, csv_of([["Name (English)", "Name (Arabic)", "Price (QAR)", "Allergens"],
                                    ["A", "أ", "5", "Peanuts"]]), "items.csv")
    entry = answer.json()["items"][0]
    note = next(i for i in entry["issues"] if i["code"] == "custom_bad")
    assert "الخيارات" in note["message_ar"] and "choices" in note["message"]

