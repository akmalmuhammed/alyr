"""A shop switches the Catalog's features on and off (ALY-148, D-039 "As built (feature engine)").

What a feature does when it is on and when it is off, through the real API: the Features screen's
answer, who may change it, the cascade between features, the record, the item form's guards (a
feature that is off stops applying to new items and never touches what exists), the customer's
order page, the files, the report, the cards and the chat. Nothing is deleted by turning a feature
off.
"""

import pytest

from alyr import capabilities
from alyr.modules.items import columns, report
from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    catalog_module_on,
    choices,
    talk,
)
from test_consent import owner_sql
from test_items import EVERY_DAY, STORE, counted, fresh, line, mk, on_shop, order, people
from test_sign_in import other_shop_with_owner, sign_in

FEATURES = "/api/features"
RECORD = "/api/items/settings/activity"
# Named, not built (the pricing pack's three are built by ALY-150 and are in PRICING_PACK).
LATER = tuple(c.key for c in capabilities.EXTENSION_POINTS)
PRICING_PACK = ("discounts", "delivery_fees", "cost_margin")
# Features that start OFF for a plain shop (the rest start on): "Sold by weight or volume" is on
# only for the trades that weigh or pour (ALY-149); the pricing pack is the founder's to switch on.
STARTS_OFF = ("decimal_quantity", *PRICING_PACK)


def view(client) -> dict:
    answer = client.get(FEATURES)
    assert answer.status_code == 200, answer.text
    return answer.json()


def flat(client) -> dict[str, dict]:
    return {f["key"]: f for g in view(client)["groups"] for f in g["features"]}


def switch(client, key, enabled=None, **more):
    body = {} if enabled is None else {"enabled": enabled}
    return client.put(f"{FEATURES}/{key}", json={**body, **more})


def off(client, *keys):
    for key in keys:
        assert switch(client, key, False).status_code == 200, key


def refused(response, code="feature_off"):
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == code, response.text
    return response.json()["detail"]


def rules() -> list[dict]:
    return [{"weekdays": EVERY_DAY, "lead_days": 1, "cutoff": "18:00"}]


# ── the Features screen ──────────────────────────────────────────────────────────────


def test_the_screen_lists_every_shipped_feature_in_groups_with_words_in_both_languages(client):
    answer = view(client)
    keys = [f["key"] for g in answer["groups"] for f in g["features"]]
    assert keys == [c.key for g in capabilities.GROUPS for c in capabilities.SHOWN
                    if c.group == g.key]
    for g in answer["groups"]:
        assert g["name"] and g["name_ar"]
        for f in g["features"]:
            assert f["hint"] and f["hint_ar"] and f["changes"] and f["changes_ar"], f["key"]
            assert f["affects"] and f["set_by"] == "template"
            assert f["enabled"] is (f["key"] not in STARTS_OFF)
    assert answer["can_manage"] is True
    assert {c["key"] for c in answer["core"]} == {
        "names", "photos", "price", "stock_log", "categories", "sku", "import_export"}
    assert answer["template"]["key"] == "generic"


def test_a_feature_that_is_not_built_is_in_no_answer_and_cannot_be_switched(client):
    text = str(view(client))
    for key in LATER:
        assert key not in text
        assert switch(client, key, True).status_code == 422
        assert refused(switch(client, key, False), "unknown_feature")["code"] == "unknown_feature"
    for core in ("names", "price", "sku"):
        refused(switch(client, core, False), "unknown_feature")
    refused(switch(client, "no_such_thing", True), "unknown_feature")
    assert "coming" not in text.lower() and "capabilit" not in text.lower()


def test_a_shop_that_has_every_feature_on_has_the_defaults_every_shop_had(client):
    answer = flat(client)
    assert all(f["enabled"] for k, f in answer.items() if k not in STARTS_OFF)
    assert not any(answer[k]["enabled"] for k in STARTS_OFF if k in answer)
    assert answer["sold_out_display"]["config"] == {"mode": "grey"}
    assert answer["sold_out_display"]["kind"] == "choice"


def test_switching_a_feature_off_and_on_changes_only_that_feature(client):
    before = {k: f["enabled"] for k, f in flat(client).items()}
    done = switch(client, "tags", False)
    assert done.status_code == 200 and done.json()["changed"] == [
        {"key": "tags", "from": True, "to": False}]
    after = {k: f["enabled"] for k, f in flat(client).items()}
    assert after == {**before, "tags": False}
    assert flat(client)["tags"]["set_by"] == "owner"
    switch(client, "tags", True)
    assert {k: f["enabled"] for k, f in flat(client).items()} == before


def test_a_feature_that_needs_another_moves_with_it(client):
    done = switch(client, "schedule", False)
    assert {c["key"] for c in done.json()["changed"]} == {"schedule", "pickup_date"}
    assert flat(client)["pickup_date"]["enabled"] is False
    # Turning the day picker on turns on what it needs.
    done = switch(client, "pickup_date", True)
    assert {c["key"] for c in done.json()["changed"]} == {"schedule", "pickup_date"}
    assert flat(client)["schedule"]["enabled"] is True
    # Turning only the dependent off leaves what it needs alone.
    done = switch(client, "pickup_date", False)
    assert [c["key"] for c in done.json()["changed"]] == ["pickup_date"]
    assert flat(client)["schedule"]["enabled"] is True


def test_the_sold_out_look_is_a_choice_not_a_switch(client):
    refused(switch(client, "sold_out_display", False), "always_on")
    refused(switch(client, "sold_out_display", config={"mode": "blink"}), "bad_choice")
    refused(switch(client, "sold_out_display", config={"colour": "red"}), "bad_choice")
    done = switch(client, "sold_out_display", config={"mode": "hide"})
    assert done.status_code == 200 and done.json()["changed"] == [
        {"key": "sold_out_display", "from": {"mode": "grey"}, "to": {"mode": "hide"}}]
    assert client.get("/api/items/settings").json()["sold_out_display"] == "hide"
    assert client.get(STORE).json()["settings"]["sold_out_display"] == "hide"
    assert client.get("/api/items/setup").json()["sold_out"] == "hide"


def test_a_change_that_changes_nothing_writes_nothing(client):
    switch(client, "tags", False)
    count = len(client.get(RECORD).json()["activity"])
    again = switch(client, "tags", False)
    assert again.json()["changed"] == []
    assert len(client.get(RECORD).json()["activity"]) == count
    assert switch(client, "tags").status_code == 422  # say what to change


def test_every_change_is_on_the_record_with_who_and_from_to(client):
    switch(client, "schedule", False)
    switch(client, "sold_out_display", config={"mode": "hide"})
    # (the record is shared by the whole run: the newest two lines are this test's)
    rows = [r for r in client.get(RECORD).json()["activity"] if r["action"] == "features"][:2]
    assert len(rows) == 2 and rows[0]["detail"]["changes"][0]["field"] == "sold_out_display"
    first = rows[1]["detail"]
    assert {c["field"] for c in first["changes"]} == {"schedule", "pickup_date"}
    assert all(c["from"] is True and c["to"] is False for c in first["changes"])
    assert first["also"] == ["pickup_date"]
    assert rows[0]["actor"]["name"]


def test_only_owners_and_admins_change_features_everyone_reads_them(client):
    sign_in(client, AGENT_EMAIL)
    assert client.get(FEATURES).status_code == 200
    assert view(client)["can_manage"] is False
    assert switch(client, "tags", False).status_code == 403
    assert client.get("/api/items/setup").json()["features"]["tags"] is True


def test_one_shop_never_sees_or_changes_anothers_features(client):
    switch(client, "tags", False)
    other = other_shop_with_owner("owner-features@other.example")
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog')", other)
    sign_in(client, "owner-features@other.example")
    assert flat(client)["tags"]["enabled"] is True
    assert switch(client, "variants", False).status_code == 200
    # Back as the demo shop: its own change is there, the other shop's is not.
    owner_sql("delete from tenant_modules where tenant_id = $1", other)
    rows = owner_sql("select tenant_id, key, enabled from shop_features where tenant_id = any($1)",
                     [DEMO_TENANT_ID, other])
    assert {(str(r["tenant_id"]), r["key"]) for r in rows if not r["enabled"]} == {
        (str(DEMO_TENANT_ID), "tags"), (str(other), "variants")}


def test_the_screen_says_how_many_items_use_a_feature_and_that_they_keep_it(client):
    mk(client, name="Tee", name_ar="قميص", variants=[
        {"name": "S", "name_ar": "S"}, {"name": "M", "name_ar": "M"}], tags=["Cotton"])
    counted(client, 4, name="Rice", name_ar="أرز")
    used = flat(client)
    assert used["variants"]["in_use"]["count"] == 1
    assert "1 item" in used["variants"]["in_use"]["text"]
    assert used["variants"]["in_use"]["text_ar"].startswith("يستخدمها")
    assert used["rule_count"]["in_use"]["count"] == 1 and used["tags"]["in_use"]["count"] == 1
    assert used["options"]["in_use"] is None


# ── off stops new use and never touches what exists ─────────────────────────────────

GUARDS = [
    ("rule_switch", {"stock_rule": "switch"}),
    ("rule_count", {"stock_rule": "count", "opening_stock": 3}),
    ("rule_daily_limit", {"stock_rule": "daily_limit", "daily_limit": 5}),
    ("schedule", {"schedule": [{"weekdays": EVERY_DAY, "opens": "08:00", "closes": "20:00"}]}),
    ("pickup_date", {"schedule": rules()}),
    ("variants", {"variants": [{"name": "S", "name_ar": "S"}, {"name": "M", "name_ar": "M"}]}),
    ("options", {"option_groups": [{"name": "Extras", "name_ar": "إضافات", "options": [
        {"name": "Cheese", "name_ar": "جبن", "price_delta": 100}]}]}),
    ("pack_rules", {"pack_size": 6, "unit": "pack"}),
    ("tags", {"tags": ["Halal"]}),
]


@pytest.mark.parametrize(("key", "part"), GUARDS, ids=[g[0] for g in GUARDS])
def test_a_new_item_cannot_use_a_part_whose_feature_is_off(client, key, part):
    ok = client.post("/api/items", json={"name": "A", "name_ar": "أ", "price": 500,
                                         "status": "live", **part})
    assert ok.status_code == 200, (key, ok.text)  # on: it works
    off(client, key)
    detail = refused(client.post("/api/items", json={
        "name": "B", "name_ar": "ب", "price": 500, "status": "live", **part}))
    assert capabilities.BY_KEY[key].name.en in detail["message"]
    assert detail["message_ar"] and "Features" in detail["message"]
    # Back on: it works again.
    switch(client, key, True)
    assert client.post("/api/items", json={"name": "C", "name_ar": "ج", "price": 500,
                                           "status": "live", **part}).status_code == 200


def test_the_minimum_order_is_a_pack_rule_but_one_is_nothing(client):
    off(client, "pack_rules")
    assert mk(client, name="A", name_ar="أ", min_order=1)["min_order"] == 1
    refused(client.post("/api/items", json={"name": "B", "name_ar": "ب", "price": 500,
                                            "status": "live", "min_order": 3}))


def test_price_groups_off_stops_new_group_prices(client):
    group = client.post("/api/price-groups", json={"name": "Wholesale", "name_ar": "جملة"})
    group_id = group.json()["group"]["id"]
    item = mk(client, name="Tea", name_ar="شاي")
    off(client, "price_groups")
    refused(client.put(f"/api/items/{item['id']}", json={
        "group_prices": [{"group_id": group_id, "price": 400}]}))


def test_turning_a_feature_off_changes_nothing_an_item_already_has(client):
    item = mk(client, name="Tee", name_ar="قميص", tags=["Cotton"], pack_size=4, unit="pack",
              min_order=4, variants=[{"name": "S", "name_ar": "S"}, {"name": "M", "name_ar": "M"}],
              schedule=rules(), stock_rule="always",
              option_groups=[{"name": "Wrap", "name_ar": "تغليف", "options": [
                  {"name": "Gift", "name_ar": "هدية", "price_delta": 200}]}])
    before = fresh(client, item)
    off(client, "variants", "options", "tags", "pack_rules", "schedule", "pickup_date")
    assert fresh(client, item) == before
    # The item can still be edited, and its parts are kept as they are.
    edited = client.put(f"/api/items/{item['id']}", json={
        "price": 1500, "tags": ["Cotton", "Soft"], "variants": [
            {"id": v["id"], "name": v["name"], "name_ar": v["name_ar"]}
            for v in before["variants"] if not v["is_default"]], "schedule": rules()})
    assert edited.status_code == 200, edited.text
    after = fresh(client, item)
    assert after["price"] == 1500 and after["tags"] == ["Cotton", "Soft"]
    assert len(after["variants"]) == len(before["variants"])
    assert len(after["option_groups"]) == 1 and after["pack_size"] == 4
    # But it may not gain a part it does not have: another item cannot take tags.
    plain = mk(client, name="Plain", name_ar="عادي")
    refused(client.put(f"/api/items/{plain['id']}", json={"tags": ["New"]}))


def test_a_rule_that_is_off_cannot_be_chosen_but_an_item_on_it_keeps_it(client):
    stocked = counted(client, 5, name="Rice", name_ar="أرز")
    off(client, "rule_count")
    # The item stays counted, can be sold, and its stock can still be recorded.
    assert fresh(client, stocked)["stock_rule"] == "count"
    moved = client.post(f"/api/items/{stocked['id']}/stock", json={
        "kind": "received", "quantity": 3, "reason": "Delivery"})
    assert moved.status_code == 200, moved.text
    who = people(client, 1)[0]
    assert order(client, who, [line(stocked, 2)]).status_code == 200
    # But no other item can be changed to count.
    other = mk(client, name="Tea", name_ar="شاي")
    refused(client.put(f"/api/items/{other['id']}", json={"stock_rule": "count"}))
    # A rule an item already has is allowed in an edit that does not change it.
    assert client.put(f"/api/items/{stocked['id']}", json={
        "stock_rule": "count", "price": 1300}).status_code == 200


def test_the_usual_start_for_a_new_item_falls_back_when_its_rule_is_off(client):
    assert client.get("/api/items/setup").json()["new_item"]["rule"] == "switch"
    off(client, "rule_switch")
    assert client.get("/api/items/setup").json()["new_item"]["rule"] == "always"
    made = client.post("/api/items", json={"name": "Tea", "name_ar": "شاي", "price": 300,
                                           "status": "live"})
    assert made.status_code == 200 and made.json()["item"]["stock_rule"] == "always"


# ── the customer's order page reads the features ─────────────────────────────────────


def page_layout(client) -> dict:
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog') "
              "on conflict (tenant_id, module_key) do update set enabled = true", DEMO_TENANT_ID)
    return client.get(STORE).json()["catalog"]["layout"]


@pytest.mark.parametrize("key", ["pickup_date", "quick_quantity", "same_as_last", "show_sku"])
def test_the_order_page_is_told_each_of_its_four_extras(client, key):
    assert page_layout(client)[key] is True
    off(client, key)
    layout = page_layout(client)
    assert layout[key] is False
    assert all(layout[other] for other in ("pickup_date", "quick_quantity", "same_as_last",
                                           "show_sku") if other != key)
    switch(client, key, True)
    assert page_layout(client)[key] is True


def test_the_day_picker_goes_off_with_the_times_it_belongs_to(client):
    off(client, "schedule")
    layout = page_layout(client)
    assert layout["pickup_date"] is False and layout["style"] == "grid"


def test_same_as_last_time_is_refused_when_the_shop_turned_it_off(client):
    who = people(client, 1)[0]
    item = mk(client, name="Tea", name_ar="شاي")
    assert order(client, who, [line(item)]).status_code == 200
    from order_links import token

    body = {"token": token(who["id"]), "payment": "link"}
    assert client.post(f"{STORE}/orders/repeat", json=body).status_code == 200
    off(client, "same_as_last")
    again = client.post(f"{STORE}/orders/repeat", json=body)
    assert again.status_code == 403 and again.json()["detail"]["code"] == "feature_off"
    assert again.json()["detail"]["message_ar"]


def test_tags_off_hides_tags_from_customers_and_their_search(client):
    mk(client, name="Soup", name_ar="شوربة", tags=["Halal"])
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog') "
              "on conflict (tenant_id, module_key) do update set enabled = true", DEMO_TENANT_ID)
    assert client.get(STORE, params={"q": "halal"}).json()["items"][0]["tags"] == ["Halal"]
    off(client, "tags")
    page = client.get(STORE, params={"q": "halal"}).json()
    assert page["items"] == []
    assert all(i["tags"] == [] for i in client.get(STORE).json()["items"])
    assert client.get("/api/store/" + DEMO_SLUG).json()["catalog"]["features"]["tags"] is False


# ── the files follow the features ────────────────────────────────────────────────────


def header(client) -> list[str]:
    text = client.get("/api/items/export?format=csv").content.decode("utf-8-sig")
    return text.splitlines()[0].split(",")


def template_header(client) -> list[str]:
    text = client.get("/api/items/import/template?kind=generic&format=csv").content.decode(
        "utf-8-sig")
    return text.splitlines()[0].split(",")


def test_a_feature_that_is_off_and_unused_takes_its_columns_out_of_the_files(client):
    full = header(client)
    assert "Tags" in full and "Size or colour" in full and "Smallest order" in full
    off(client, "tags", "variants", "pack_rules", "rule_count", "rule_daily_limit")
    short = header(client)
    for gone in ("Tags", "Size or colour", "Size or colour (Arabic)", "Size or colour SKU",
                 "Price difference (QAR)", "Units in a pack", "Smallest order", "In stock",
                 "Per day", "Low-stock number"):
        assert gone not in short, gone
    assert "Name (English)" in short and "SKU" in short and "How it runs out" in short
    assert "Size or colour" not in template_header(client)


def test_a_column_stays_while_an_item_still_uses_its_feature(client):
    mk(client, name="Tee", name_ar="قميص", variants=[
        {"name": "S", "name_ar": "S"}, {"name": "M", "name_ar": "M"}])
    off(client, "variants", "tags")
    now = header(client)
    assert "Size or colour" in now and "Tags" not in now


def test_an_uploaded_column_of_a_feature_that_is_off_is_noted_and_left_out(client):
    off(client, "tags", "pack_rules")
    sheet = (
        "Name (English),Name (Arabic),Price (QAR),Tags,Smallest order\n"
        "Falafel,فلافل,5,Halal,6\n"
    ).encode()
    preview = client.post("/api/items/import?filename=items.csv", content=sheet)
    assert preview.status_code == 200, preview.text
    notes = preview.json()["notes"]
    assert [n["code"] for n in notes if n["code"] == "column_off"] == ["column_off", "column_off"]
    said = next(n for n in notes if n["column"] == "tags")
    assert "Tags and allergens" in said["message"] and "Features" in said["message"]
    assert "الوسوم" in said["message_ar"]
    applied = client.post(f"/api/items/import/{preview.json()['id']}/apply",
                          json={"preview": preview.json()["hash"]})
    assert applied.status_code == 200, applied.text
    made = next(i for i in client.get("/api/items").json()["items"] if i["name"] == "Falafel")
    assert made["tags"] == [] and made["min_order"] == 1


def test_the_columns_are_data_the_files_and_the_features_agree_on():
    # (the cost column is added only for an owner or admin of a shop that keeps costs)
    assert set(columns.NEEDS) <= set(columns.ORDER) | {"cost"}
    stored = set(capabilities.STORED)
    for need in columns.NEEDS.values():
        assert set(need.split("|")) <= stored


# ── reports, cards and the chat ──────────────────────────────────────────────────────


def test_the_reports_lines_follow_the_features(client):
    sample = {
        "show": None, "sold_out": {"count": 1, "items": [
            {"name": "Tea", "name_ar": "شاي", "minutes": 120, "still": False}]},
        "asked": {"customers": 2, "items": [{"name": "Tea", "name_ar": "شاي", "customers": 2}]},
        "low": {"count": 1, "items": [{"name": "Rice", "name_ar": "أرز", "left": 2}]},
        "top_units": [{"name": "Rice", "name_ar": "أرز", "units": 4, "value": 400}],
        "top_value": [{"name": "Rice", "name_ar": "أرز", "units": 4, "value": 400}],
        "idle": {"count": 1, "items": [{"name": "Soup", "name_ar": "شوربة"}]},
    }
    del sample["show"]
    everything = report.lines(sample, None, "en")
    assert len(everything) == 5
    # Stock is not counted here: no low-stock line. Nothing can run out: no sold-out lines.
    only_best = {**sample, "show": report.shown_lines(_feats(client, off_keys=(
        "rule_count", "rule_daily_limit")))}
    assert not any(line.startswith("Low on stock") for line in report.lines(only_best, None, "en"))
    assert len(report.lines(only_best, None, "en")) == 4
    none = {**sample, "show": report.shown_lines(_feats(client, off_keys=(
        "rule_switch", "rule_count", "rule_daily_limit")))}
    assert [line.split(":")[0] for line in report.lines(none, None, "en")] == [
        "Most sold", "Did not sell this week"]
    assert report.headline(none, "en") == "Rice sold most"


def _feats(client, off_keys):
    from alyr import shop_templates
    from alyr.modules.items import features

    template = shop_templates.builtin_for("")
    rows = {k: features.Row(False, {}, "owner") for k in off_keys}
    return features.Features(rows, template)


def test_a_week_with_the_features_on_has_every_line_and_an_older_report_still_reads(client):
    assert report.shown_lines(_feats(client, ())) == [
        k for k in report.LINES if k not in ("discounts", "delivery", "margin")]
    old = {"sold_out": {"count": 0, "items": []}, "asked": {"customers": 0, "items": []},
           "low": {"count": 0, "items": []}, "top_units": [], "top_value": [],
           "idle": {"count": 0, "items": []}}
    assert report.lines(old, None, "en") == []  # no "show": every line allowed, none to say


def test_the_home_cards_about_stock_leave_a_shop_that_does_not_count(client):
    keys = lambda: [c["key"] for c in client.get("/api/workspace/home").json()["cards"]]  # noqa: E731
    assert {"sold_out", "low_stock"} <= set(keys())
    off(client, "rule_count", "rule_daily_limit")
    assert "low_stock" not in keys() and "sold_out" in keys()
    off(client, "rule_switch")
    assert "sold_out" not in keys()
    switch(client, "rule_switch", True)
    assert "sold_out" in keys()


def test_tell_me_when_it_is_back_follows_its_feature(client):
    item = mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    client.post(f"/api/items/{item['id']}/switch", json={"available": False})
    card = talk(client, AHMED_PHONE, "shawarma")[-1]
    assert choices(card) == [{"id": f"notify:{item['id']}", "title": "Tell me when back"}]
    off(client, "back_in_stock")
    card = talk(client, AHMED_PHONE, "shawarma")[-1]
    assert "Sold out right now." in card["body"] and choices(card) == []
    asked = talk(client, AHMED_PHONE, "tell me when shawarma is back")
    assert not any(c["id"].startswith("notify_yes:") for m in asked for c in choices(m))
    assert owner_sql("select count(*) as n from stock_watches")[0]["n"] == 0


def test_the_two_alerts_are_features_and_the_setup_screen_agrees(client):
    assert client.get("/api/items/setup").json()["alerts"] == {"low_stock": True, "sold_out": True}
    off(client, "low_stock_alerts")
    assert client.get("/api/items/setup").json()["alerts"] == {
        "low_stock": False, "sold_out": True}
    saved = client.put("/api/items/setup", json={"alerts": {"low_stock": True, "sold_out": False}})
    assert saved.json()["alerts"] == {"low_stock": True, "sold_out": False}
    assert flat(client)["sold_out_alerts"]["enabled"] is False
    assert on_shop(client, _alert_on, "sold_out") is False


async def _alert_on(conn, kind):
    from alyr.modules.items import template

    return await template.alert_on(conn, kind)


# ── the two things ALY-136 added: the item code and "Order on WhatsApp" ───────────────


def _shop_number(number: str) -> None:
    owner_sql(
        "insert into shop_settings (tenant_id, whatsapp_number) values ($1, $2) "
        "on conflict (tenant_id) do update set whatsapp_number = $2", DEMO_TENANT_ID, number)


def test_order_on_whatsapp_is_a_feature_on_for_every_shop_and_the_page_follows_it(client):
    assert flat(client)["order_on_whatsapp"]["enabled"] is True
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog') "
              "on conflict (tenant_id, module_key) do update set enabled = true", DEMO_TENANT_ID)
    _shop_number("97455550100")
    assert client.get(STORE).json()["shop"]["whatsapp"] == "97455550100"
    off(client, "order_on_whatsapp")
    page = client.get(STORE).json()
    assert page["shop"]["whatsapp"] == "" and page["settings"]["whatsapp_number"] == ""
    # The shop's own setting is not touched: switching the feature back is all it takes.
    assert client.get("/api/items/settings").json()["whatsapp_number"] == "97455550100"
    switch(client, "order_on_whatsapp", True)
    assert client.get(STORE).json()["shop"]["whatsapp"] == "97455550100"


def test_the_whatsapp_mode_is_the_shops_own_choice_and_not_a_feature(client):
    assert "whatsapp_mode" not in flat(client)
    mode = client.get("/api/items/settings").json()["whatsapp_mode"]
    assert mode in ("link", "chat")  # the demo shop answers itself in the chat
    off(client, "order_on_whatsapp")
    assert client.get("/api/items/settings").json()["whatsapp_mode"] == mode


def test_the_item_code_on_the_whatsapp_card_follows_show_the_item_code(client):
    mk(client, name="Shawarma", name_ar="شاورما", price=1200)
    assert "Item code" in talk(client, AHMED_PHONE, "shawarma")[-1]["body"]
    off(client, "show_sku")
    card = talk(client, AHMED_PHONE, "shawarma")[-1]
    assert "Item code" not in card["body"] and "Shawarma" in card["body"]
    # A customer who knows the code can still order by it: the code is only no longer shown.
    switch(client, "show_sku", True)
    assert "Item code" in talk(client, AHMED_PHONE, "shawarma")[-1]["body"]
