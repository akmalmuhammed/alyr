"""Templates (ALY-148, D-039 "As built (feature engine)"): the starter fields each type brings, a
template made in the back office for a new kind of client, using it for a new business, changing
a shop's type with a preview that only adds, and who may do what.

The back office is `office` (the open demo is ALYR staff on a developer machine); an owner is a
separate client signed in to a shop of their own, so neither session disturbs the other.
"""

import asyncio
from uuid import uuid4

import asyncpg
import pytest

from alyr import shop_templates
from alyr.seed import AGENT_EMAIL
from alyr.shop_templates import STARTER_FIELDS
from conftest import APP_DSN
from test_consent import owner_sql
from test_items import fresh, mk
from test_onboarding import new_business
from test_pricing import ADMIN
from test_sign_in import sign_in

TEMPLATES = f"{ADMIN}/templates"
OWNER_TEMPLATES = "/api/templates"


@pytest.fixture(autouse=True)
def no_templates_left_over():
    """Templates made in a test are global, so each test starts and ends without any."""
    owner_sql("delete from business_templates")
    yield
    owner_sql("delete from business_templates")


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def owner(client_factory):
    return client_factory()


def made(office, name="Perfume shop", **more) -> dict:
    """A template made in the back office, copied from the shop template."""
    body = {"from_key": "shop", "name": name, "name_ar": "متجر عطور", **more}
    answer = office.post(TEMPLATES, json=body)
    assert answer.status_code == 200, answer.text
    return answer.json()["template"]


def refused(answer, code):
    assert answer.status_code == 422, answer.text
    detail = answer.json()["detail"]
    assert detail["code"] == code, detail
    assert detail["message"] and detail["message_ar"]


def features_of(office, key) -> dict[str, bool]:
    template = office.get(f"{TEMPLATES}/{key}").json()["template"]
    return {k: v["enabled"] for k, v in template["features"].items()}


# ── the starter fields each type brings ──────────────────────────────────────────────


@pytest.mark.parametrize("kind", sorted(STARTER_FIELDS))
def test_a_new_shop_of_a_type_starts_with_that_types_fields(client, kind):
    new_business(client, kind=kind)
    got = client.get("/api/custom-fields").json()["fields"]
    assert [f["key"] for f in got] == [s.key for s in STARTER_FIELDS[kind]]
    for field, seed in zip(got, STARTER_FIELDS[kind], strict=True):
        assert (field["label"], field["label_ar"], field["kind"]) == (
            seed.label.en, seed.label.ar, seed.kind)
        assert field["required"] is False and field["archived"] is False
        assert field["shown_to_customers"] is seed.shown
        assert field["label_ar"], seed.key  # every starter field has its Arabic name


def test_the_starter_fields_can_be_edited_or_archived_by_the_owner(client):
    new_business(client, kind="bakery")
    allergens = next(f for f in client.get("/api/custom-fields").json()["fields"]
                     if f["key"] == "allergens")
    assert client.put(f"/api/custom-fields/{allergens['id']}", json={
        "label": "Contains", "shown_to_customers": False}).status_code == 200
    serves = next(f for f in client.get("/api/custom-fields").json()["fields"]
                  if f["key"] == "serves")
    assert client.post(f"/api/custom-fields/{serves['id']}/archive").status_code == 200
    assert [f["label"] for f in client.get("/api/custom-fields").json()["fields"]] == [
        "Contains", "Serves"]


def test_no_starter_field_is_required_so_adding_an_item_is_as_it_was(client):
    for seeds in STARTER_FIELDS.values():
        assert not any(s.required for s in seeds)
    new_business(client, kind="restaurant")
    made_item = client.post("/api/items", json={
        "name": "Soup", "name_ar": "شوربة", "price": 900, "status": "live"})
    assert made_item.status_code == 200, made_item.text


# ── a template made in the back office ───────────────────────────────────────────────


def test_the_back_office_lists_ours_and_theirs_with_the_registry_and_a_quick_start(office):
    answer = office.get(TEMPLATES).json()
    assert {t["key"] for t in answer["builtin"]} == set(shop_templates.BUILTIN)
    assert all(t["builtin"] for t in answer["builtin"])
    assert answer["made"] == [] or all(not t["builtin"] for t in answer["made"])
    assert "closest template" in answer["quick_start"]["en"] and answer["quick_start"]["ar"]
    keys = {f["key"] for g in answer["registry"]["groups"] for f in g["features"]}
    assert "variants" in keys and "decimal_quantity" in keys
    assert "cost_margin" not in keys  # not built: not offered
    assert {t["key"] for t in answer["types"]} >= {"bakery", "shop", "travel"}


def test_a_template_is_made_from_the_closest_one_and_changed(office):
    mine = made(office, features={"rule_daily_limit": {"enabled": False},
                                  "tags": {"enabled": False}},
                section="Perfumes", section_ar="العطور", layout_style="list",
                categories=[{"name": "Oud", "name_ar": "عود"}, {"name": "Floral"}],
                fields=[{"label": "Concentration", "label_ar": "التركيز", "kind": "choice",
                         "choices": [{"label": "EDP", "label_ar": "ماء عطر"}, {"label": "EDT"}],
                         "shown": True, "searchable": True}])
    assert mine["key"] == "perfume-shop" and mine["builtin"] is False and mine["offered"] is False
    assert mine["section"] == "Perfumes" and mine["layout_style"] == "list"
    shop = shop_templates.BUILTIN["shop"]
    # What was not changed came from the template it was copied from.
    assert mine["rule"] == shop.setup.rule and mine["low_stock_at"] == shop.setup.low_stock_at
    on = features_of(office, "perfume-shop")
    assert on["rule_daily_limit"] is False and on["tags"] is False and on["variants"] is True
    assert [c["name"] for c in mine["categories"]] == ["Oud", "Floral"]
    assert mine["fields"][0]["key"] == "concentration" and mine["fields"][0]["choices"][1][
        "label"] == "EDT"
    # It can be read back, saved again, and it is listed.
    again = office.put(f"{TEMPLATES}/perfume-shop", json={**mine, "name": "Perfume counter"})
    assert again.status_code == 200 and again.json()["template"]["name"] == "Perfume counter"
    assert [t["key"] for t in office.get(TEMPLATES).json()["made"]] == ["perfume-shop"]


def test_a_template_that_does_not_make_sense_is_refused_in_both_languages(office):
    refused(office.post(TEMPLATES, json={"name": "", "section": "X"}), "name_needed")
    refused(office.post(TEMPLATES, json={"name": "A kind", "section": ""}), "section_needed")
    refused(office.post(TEMPLATES, json={"name": "A kind", "section": "X",
                                         "layout_style": "carousel"}), "bad_value")
    refused(office.post(TEMPLATES, json={"name": "A kind", "section": "X",
                                         "based_on": "dentist"}), "bad_type")
    refused(office.post(TEMPLATES, json={
        "name": "A kind", "section": "X", "features": {"discounts": {"enabled": True}}}),
        "unknown_feature")
    refused(office.post(TEMPLATES, json={
        "name": "A kind", "section": "X", "features": {"names": {"enabled": False}}}),
        "unknown_feature")
    # A feature that needs another cannot be on while it is off.
    refused(office.post(TEMPLATES, json={
        "name": "A kind", "section": "X",
        "features": {"schedule": {"enabled": False}, "pickup_date": {"enabled": True}}}),
        "feature_needs")
    # A new item cannot start the way a switched-off feature allows.
    refused(office.post(TEMPLATES, json={
        "name": "A kind", "section": "X", "rule": "count",
        "features": {"rule_count": {"enabled": False}}}), "rule_off")
    refused(office.post(TEMPLATES, json={
        "name": "A kind", "section": "X", "lead_days": 1,
        "features": {"pickup_date": {"enabled": False}}}), "lead_needs_features")
    refused(office.post(TEMPLATES, json={
        "name": "A kind", "section": "X",
        "fields": [{"label": "Pick", "kind": "choice"}]}), "choices_needed")
    refused(office.post(TEMPLATES, json={
        "name": "A kind", "section": "X", "fields": [{"label": "Price (QAR)"}]}),
        "field_name_taken")
    refused(office.post(TEMPLATES, json={
        "name": "A kind", "section": "X",
        "categories": [{"name": "Cakes"}, {"name": "cakes"}]}), "category_twice")


def test_alyrs_own_templates_are_read_only_and_a_key_is_never_reused(office):
    refused(office.put(f"{TEMPLATES}/bakery", json={"name": "Hacked", "section": "X"}), "builtin")
    assert office.post(f"{TEMPLATES}/bakery/archive").status_code == 422
    one = made(office, "Same name")
    two = made(office, "Same name")
    assert one["key"] != two["key"]
    refused(office.post(TEMPLATES, json={"key": "bakery", "name": "X", "section": "X"}),
            "key_taken")
    assert office.get(f"{TEMPLATES}/nothing-here").status_code == 404


def test_every_back_office_change_is_on_the_audit_record(office):
    mine = made(office, "Audit me")
    office.put(f"{TEMPLATES}/{mine['key']}", json={**mine, "section": "Changed"})
    office.post(f"{TEMPLATES}/{mine['key']}/archive")
    office.post(f"{TEMPLATES}/{mine['key']}/restore")
    entries = [e["action"] for e in office.get(f"{ADMIN}/audit").json()["entries"]
               if e["subject_id"] == mine["key"]]
    assert entries[:4] == ["template.restored", "template.archived", "template.saved",
                           "template.created"]


def test_only_the_back_office_writes_a_template(client_factory):
    stranger = client_factory()
    sign_in(stranger)  # an owner, not ALYR staff
    assert stranger.get(TEMPLATES).status_code in (401, 403)
    assert stranger.post(TEMPLATES, json={"name": "X", "section": "X"}).status_code in (401, 403)

    async def try_to_write(sql, *args):
        conn = await asyncpg.connect(APP_DSN)
        try:
            return await conn.execute(sql, *args)
        finally:
            await conn.close()

    with pytest.raises(asyncpg.PostgresError):
        asyncio.run(try_to_write(
            "insert into business_templates (key, name, section) values ('sneaky', 'S', 'S')"))
    with pytest.raises(asyncpg.PostgresError):
        asyncio.run(try_to_write("select admin_set_business_type($1, 'bakery')", uuid4()))


# ── using one for a new business ─────────────────────────────────────────────────────


def new_with(office, template, name="Oud House", products=()) -> dict:
    slug = f"oud-{uuid4().hex[:6]}"
    email = f"owner-{uuid4().hex[:8]}@oud.example"
    answer = office.post(f"{ADMIN}/businesses", json={
        "name": name, "slug": slug, "owner_email": email, "owner_name": "Salim",
        "template": template, "products": list(products)})
    assert answer.status_code == 200, answer.text
    return {**answer.json(), "email": email}


def test_a_business_made_with_a_template_gets_its_wording_features_categories_and_fields(
    office, owner
):
    mine = made(
        office, features={"variants": {"enabled": False}, "tags": {"enabled": False}},
        section="Perfumes", section_ar="العطور", layout_style="grid", based_on="shop",
        categories=[{"name": "Oud", "name_ar": "عود"}, {"name": "Floral", "name_ar": "زهري"}],
        fields=[{"label": "Concentration", "label_ar": "التركيز", "kind": "choice",
                 "choices": [{"label": "EDP", "label_ar": "ماء عطر"}], "shown": True},
                {"label": "Bottle", "label_ar": "الزجاجة", "kind": "number", "unit": "ml",
                 "applies_to": "variant", "shown": True}])
    shop = new_with(office, mine["key"])
    assert shop["template"] == "perfume-shop"
    sign_in(owner, shop["email"])
    setup = owner.get("/api/items/setup").json()
    assert setup["template"]["key"] == "perfume-shop" and setup["template"]["builtin"] is False
    assert setup["section"]["name"] == "Perfumes" and setup["section"]["name_ar"] == "العطور"
    assert setup["layout"]["style"] == "grid"
    assert setup["features"]["variants"] is False and setup["features"]["tags"] is False
    assert setup["features"]["options"] is True
    assert [c["name"] for c in owner.get("/api/items/categories").json()["categories"]] == [
        "Oud", "Floral"]
    assert [(f["key"], f["applies_to"]) for f in owner.get("/api/custom-fields").json()["fields"]
            ] == [("concentration", "item"), ("bottle", "variant")]
    assert owner.get("/api/items").json()["total"] == 0  # no samples in a business made here
    # Its type follows the template; the plain template keeps the type empty.
    kind = owner_sql("select business_type from tenants where slug = $1", shop["slug"])[0]
    assert kind["business_type"] == "shop"
    # The features it left off are off for new items; the rest works, with the owner's own field.
    refused(owner.post("/api/items", json={"name": "A", "name_ar": "أ", "price": 100,
                                           "status": "live", "tags": ["x"]}), "feature_off")
    item = owner.post("/api/items", json={
        "name": "Rose oud", "name_ar": "عود الورد", "price": 25000, "status": "live",
        "custom": {"concentration": "EDP"}})
    assert item.status_code == 200, item.text
    assert item.json()["item"]["custom"] == {"concentration": "edp"}


def test_a_business_made_with_a_template_that_does_not_exist_is_not_made(office):
    answer = office.post(f"{ADMIN}/businesses", json={
        "name": "X", "slug": f"x-{uuid4().hex[:6]}", "owner_email": "x@x.example",
        "owner_name": "X", "template": "no-such-template"})
    assert answer.status_code == 404


def test_a_business_made_without_a_template_is_as_it_always_was(office, owner):
    shop = new_with(office, "")
    assert shop["template"] is None
    sign_in(owner, shop["email"])
    assert owner.get("/api/items/setup").json()["template"]["key"] == "generic"
    assert owner.get("/api/custom-fields").json()["fields"] == []


def test_a_built_in_template_can_start_a_back_office_business_too(office, owner):
    shop = new_with(office, "bakery")
    sign_in(owner, shop["email"])
    setup = owner.get("/api/items/setup").json()
    assert setup["template"]["key"] == "bakery" and setup["section"]["name"] == "Menu"
    assert owner_sql("select business_type from tenants where slug = $1",
                     shop["slug"])[0]["business_type"] == "bakery"
    assert [f["key"] for f in owner.get("/api/custom-fields").json()["fields"]] == [
        "allergens", "serves"]


def test_an_archived_template_is_no_longer_offered_but_its_shops_keep_working(office, owner):
    mine = made(office, "Old kind", offered=True)
    shop = new_with(office, mine["key"])
    office.post(f"{TEMPLATES}/{mine['key']}/archive")
    sign_in(owner, shop["email"])
    assert owner.get("/api/items/setup").json()["template"]["key"] == "old-kind"
    assert "old-kind" not in {c["key"] for c in owner.get(OWNER_TEMPLATES).json()["choices"]}
    assert office.post(f"{ADMIN}/businesses", json={
        "name": "N", "slug": f"n-{uuid4().hex[:6]}", "owner_email": "n@n.example",
        "owner_name": "N", "template": "old-kind"}).status_code == 404


# ── an owner changes their shop's type ───────────────────────────────────────────────


def preview(owner, to) -> dict:
    answer = owner.get(f"{OWNER_TEMPLATES}/preview", params={"to": to})
    assert answer.status_code == 200, answer.text
    return answer.json()


def apply(owner, to, shown):
    return owner.post(f"{OWNER_TEMPLATES}/apply", json={"to": to, "preview": shown["hash"]})


def names(rows):
    return [r["key"] for r in rows]


def test_the_preview_says_what_would_be_added_and_changes_nothing(client):
    new_business(client, kind="restaurant")
    before = (client.get("/api/items/setup").json(), client.get("/api/items/categories").json())
    shown = preview(client, "grocery")
    assert shown["from"]["key"] == "restaurant" and shown["to"]["key"] == "grocery"
    # the restaurant has no such alert, and does not weigh or pour
    assert set(names(shown["turn_on"])) == {"low_stock_alerts", "decimal_quantity"}
    # (the restaurant already has Drinks: a category the shop has is not added again)
    assert [c["name"] for c in shown["categories"]] == [
        "Fruit & vegetables", "Dairy & eggs", "Pantry", "Household"]
    assert set(names(shown["fields"])) == {"origin", "shelf_life_days"}
    assert shown["wording"]["section"]["to"]["en"] == "Products"
    assert shown["wording"]["layout"] == {"from": "menu", "to": "list"}
    assert shown["stays_on"] == [] and shown["nothing"] is False
    assert (client.get("/api/items/setup").json(), client.get("/api/items/categories").json()
            ) == before
    assert client.get(f"{OWNER_TEMPLATES}/preview", params={"to": "no-such"}).status_code == 404


def test_applying_adds_and_removes_nothing_and_changes_none_of_the_shops_things(client):
    new_business(client, kind="restaurant")
    soup = mk(client, name="Soup", name_ar="شوربة", price=900, tags=["Halal"])
    client.put("/api/items/settings", json={"low_stock_at": 9})
    shown = preview(client, "grocery")
    done = apply(client, "grocery", shown)
    assert done.status_code == 200, done.text
    assert names(done.json()["turn_on"]) == []  # now there is nothing left to add
    # The template, the wording and the layout follow; the item and the settings are untouched.
    setup = client.get("/api/items/setup").json()
    assert setup["template"]["key"] == "grocery" and setup["section"]["name"] == "Products"
    assert setup["layout"]["style"] == "list" and setup["alerts"]["low_stock"] is True
    assert setup["low_stock_at"] == 9 and setup["new_item"]["rule"] == "switch"
    assert fresh(client, soup)["price"] == 900 and fresh(client, soup)["tags"] == ["Halal"]
    cats = [c["name"] for c in client.get("/api/items/categories").json()["categories"]]
    assert cats[:4] == ["Starters", "Mains", "Drinks", "Desserts"] and "Pantry" in cats
    assert {f["key"] for f in client.get("/api/custom-fields").json()["fields"]} >= {
        "allergens", "spice_level", "serves", "origin", "shelf_life_days"}
    line = client.get("/api/items/settings/activity").json()["activity"][0]
    assert line["action"] == "template_applied" and line["detail"]["to"] == "grocery"
    assert sorted(line["detail"]["turned_on"]) == ["decimal_quantity", "low_stock_alerts"]


def test_what_the_owner_set_themselves_stays_as_they_set_it(client):
    new_business(client, kind="shop")
    client.put("/api/features/tags", json={"enabled": False})
    client.put("/api/items/setup", json={"section_name": "Our kitchen",
                                         "alerts": {"low_stock": False}})
    shown = preview(client, "wholesale")
    assert set(names(shown["stay_off"])) == {"tags", "low_stock_alerts"}
    assert shown["turn_on"] == []
    # The owner's own English name is theirs; only the Arabic one, which they did not write,
    # follows the new template.
    assert shown["wording"]["section"] == {
        "from": {"en": "Our kitchen", "ar": "المنتجات"},
        "to": {"en": "Our kitchen", "ar": "قائمة الأسعار"}}
    assert shown["wording"]["layout"] == {"from": "grid", "to": "table"}
    assert apply(client, "wholesale", shown).status_code == 200
    feats = {f["key"]: f for g in client.get("/api/features").json()["groups"]
             for f in g["features"]}
    assert feats["tags"]["enabled"] is False and feats["low_stock_alerts"]["enabled"] is False
    assert client.get("/api/items/setup").json()["section"]["name"] == "Our kitchen"


def test_a_feature_that_needs_one_the_owner_turned_off_is_not_forced_on(client):
    new_business(client, kind="restaurant")
    client.put("/api/features/schedule", json={"enabled": False})  # and the pickup day with it
    shown = preview(client, "bakery")
    assert "schedule" in names(shown["stay_off"]) and "pickup_date" in names(shown["stay_off"])
    assert apply(client, "bakery", shown).status_code == 200
    feats = {f["key"]: f["enabled"] for g in client.get("/api/features").json()["groups"]
             for f in g["features"]}
    assert feats["schedule"] is False and feats["pickup_date"] is False


def test_nothing_is_switched_off_by_a_change_of_type(client):
    new_business(client, kind="bakery")
    shown = preview(client, "restaurant")
    # The bakery has the low-stock alert on and sells by weight, the restaurant does neither: they
    # stay on, and are said.
    assert set(names(shown["stays_on"])) == {"low_stock_alerts", "decimal_quantity"}
    assert shown["turn_on"] == []
    assert apply(client, "restaurant", shown).status_code == 200
    assert client.get("/api/items/setup").json()["alerts"]["low_stock"] is True


def test_the_apply_must_carry_what_was_seen(client):
    new_business(client, kind="restaurant")
    shown = preview(client, "grocery")
    refused(client.post(f"{OWNER_TEMPLATES}/apply", json={"to": "grocery", "preview": "wrong"}),
            "preview_changed")
    client.put("/api/features/low_stock_alerts", json={"enabled": True})  # the shop changed
    refused(apply(client, "grocery", shown), "preview_changed")
    assert apply(client, "grocery", preview(client, "grocery")).status_code == 200


def test_switching_to_the_template_a_shop_already_has_adds_what_is_missing(client):
    new_business(client, kind="bakery")
    allergens = next(f for f in client.get("/api/custom-fields").json()["fields"]
                     if f["key"] == "allergens")
    client.post(f"/api/custom-fields/{allergens['id']}/archive")
    shown = preview(client, "bakery")
    assert shown["fields"] == []  # an archived field is the owner's: not brought back
    assert shown["nothing"] is True


def test_an_owner_may_choose_only_among_the_offered_templates(client, office):
    new_business(client, kind="restaurant")
    offered = made(office, "Offered kind", offered=True)
    hidden = made(office, "Private kind", offered=False)
    keys = {c["key"] for c in client.get(OWNER_TEMPLATES).json()["choices"]}
    assert offered["key"] in keys and hidden["key"] not in keys
    assert {"restaurant", "bakery", "grocery", "fashion", "shop", "wholesale"} <= keys
    assert client.get(f"{OWNER_TEMPLATES}/preview", params={"to": hidden["key"]}
                      ).status_code == 404
    assert preview(client, offered["key"])["to"]["builtin"] is False


def test_only_owners_and_admins_change_a_shops_type(client):
    sign_in(client, AGENT_EMAIL)
    assert client.get(OWNER_TEMPLATES).status_code == 403
    assert client.get(f"{OWNER_TEMPLATES}/preview", params={"to": "bakery"}).status_code == 403
    assert client.post(f"{OWNER_TEMPLATES}/apply", json={"to": "bakery", "preview": "x"}
                       ).status_code == 403


# ── the back office changes a business's template ────────────────────────────────────


def test_the_back_office_previews_and_applies_a_template_to_a_business(office, owner):
    mine = made(office, "Gifts kind", based_on="shop",
                features={"table_qr": {"enabled": False}},
                categories=[{"name": "Boxes"}])
    shop = new_with(office, "restaurant")
    tenant = owner_sql("select id from tenants where slug = $1", shop["slug"])[0]["id"]
    listing = office.get(f"{ADMIN}/businesses/{tenant}/template").json()
    assert listing["current"]["key"] == "restaurant" and listing["business_type"] == "restaurant"
    assert {c["key"] for c in listing["choices"]} >= {mine["key"], "bakery", "generic"}
    shown = office.get(f"{ADMIN}/businesses/{tenant}/template/preview",
                       params={"to": mine["key"]}).json()
    assert [c["name"] for c in shown["categories"]] == ["Boxes"]
    done = office.post(f"{ADMIN}/businesses/{tenant}/template", json={
        "to": mine["key"], "preview": shown["hash"], "set_business_type": True})
    assert done.status_code == 200, done.text
    sign_in(owner, shop["email"])
    assert owner.get("/api/items/setup").json()["template"]["key"] == "gifts-kind"
    assert owner_sql("select business_type from tenants where id = $1",
                     tenant)[0]["business_type"] == "shop"
    actions = [e["action"] for e in office.get(f"{ADMIN}/audit").json()["entries"]
               if e["business_id"] == str(tenant)]
    assert "business.template" in actions
    refused(office.post(f"{ADMIN}/businesses/{tenant}/template", json={
        "to": mine["key"], "preview": "stale"}), "preview_changed")


# ── a founder serves a brand-new kind of client ──────────────────────────────────────


def test_a_perfume_shop_is_served_by_configuring_not_coding(office, owner):
    """The scenario of the brief: Concentration and Size (ml), no daily numbers, a grid."""
    template = made(
        office, "Perfume shop 2", based_on="shop", offered=True, section="Perfumes",
        section_ar="العطور",
        features={"rule_daily_limit": {"enabled": False}, "options": {"enabled": False},
                  "pack_rules": {"enabled": False}},
        fields=[{"label": "Concentration", "label_ar": "التركيز", "kind": "choice",
                 "choices": [{"label": "Eau de parfum", "label_ar": "ماء عطر"},
                             {"label": "Eau de toilette", "label_ar": "ماء تواليت"}],
                 "shown": True, "searchable": True},
                {"label": "Volume", "label_ar": "السعة", "kind": "number", "unit": "ml",
                 "applies_to": "variant", "shown": True}])
    shop = new_with(office, template["key"], "Oud House", products=["chat"])
    sign_in(owner, shop["email"])
    item = owner.post("/api/items", json={
        "name": "Rose oud", "name_ar": "عود الورد", "price": 35000, "status": "live",
        "stock_rule": "count",
        "custom": {"concentration": "Eau de parfum"},
        "variants": [{"name": "50 ml", "name_ar": "50", "opening_stock": 4,
                      "custom": {"volume": 50}},
                     {"name": "100 ml", "name_ar": "100", "price_delta": 30000,
                      "opening_stock": 4, "custom": {"volume": 100}}]})
    assert item.status_code == 200, item.text
    # What the template left off is off; what it keeps works.
    refused(owner.post("/api/items", json={
        "name": "B", "name_ar": "ب", "price": 100, "status": "live",
        "stock_rule": "daily_limit", "daily_limit": 3}), "feature_off")
    page = owner.get(f"/api/store/{shop['slug']}").json()
    row = page["items"][0]
    assert [f["text"] for f in row["fields"]] == ["Eau de parfum"]
    assert [[f["text"] for f in v["fields"]] for v in row["variants"]] == [["50 ml"], ["100 ml"]]
    assert page["catalog"]["section"]["name"] == "Perfumes"
    # The owner's own list finds it by what the field says, in Arabic too.
    assert [i["name"] for i in owner.get("/api/items", params={"q": "ماء عطر"}).json()["items"]
            ] == ["Rose oud"]
