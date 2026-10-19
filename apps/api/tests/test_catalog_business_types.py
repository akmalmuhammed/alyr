"""Business-type templates for the Catalog (ALY-107, D-039): what each type of business
starts with, and that nothing half-finished shows.

Every type is created through the real onboarding path (email code, sign-up token, HTTP),
once with the Catalog switched off for new shops (the setting is on since the go-live sweep,
ALY-113, and can still be turned off: onboarding must then behave exactly as it did before) and
once with it on.
The expectations in EXPECT are written here, apart from the code, as the specification.
"""

import re
from uuid import UUID, uuid4

import pytest

from alyr import presets, presets_catalog
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from order_links import token
from test_consent import owner_sql
from test_onboarding import BASE, new_business
from test_sign_in import sign_in

ARABIC = re.compile(r"[؀-ۿ]")
BANNED = ("coming", "soon", "beta", "early access", "under development", "قريباً", "قريبا")

# What each type starts with: (section in English and Arabic, how a new item runs out, the
# low-stock number, sold-out items on the order page, the alerts that start on, the order
# page's layout, how many samples, how many starting categories).
BOTH = {"low_stock", "sold_out"}
EXPECT = {
    "restaurant": ("Menu", "القائمة", "switch", 3, "grey", {"sold_out"}, "menu", 6, 4),
    "bakery": ("Menu", "القائمة", "daily_limit", 3, "grey", BOTH, "menu", 6, 5),
    "grocery": ("Products", "المنتجات", "count", 10, "hide", BOTH, "list", 6, 5),
    "fashion": ("Products", "المنتجات", "count", 2, "grey", BOTH, "grid", 6, 5),
    "shop": ("Products", "المنتجات", "count", 5, "grey", BOTH, "grid", 6, 4),
    "wholesale": ("Price list", "قائمة الأسعار", "count", 20, "grey", BOTH, "table", 6, 4),
    "salon": ("Products", "المنتجات", "switch", 3, "grey", set(), "grid", 3, 2),
    "spa": ("Products", "المنتجات", "switch", 3, "grey", set(), "grid", 3, 2),
    "clinic": ("Products", "المنتجات", "switch", 3, "grey", set(), "grid", 2, 1),
    "home": ("Products", "المنتجات", "switch", 3, "grey", set(), "grid", 2, 1),
}
NEW_TYPES = ("bakery", "grocery", "fashion")
# Today's setups, before the Catalog: the modules each type is created with.
BEFORE = {
    "salon": {"inbox", "bookings", "payments"}, "spa": {"inbox", "bookings", "payments"},
    "clinic": {"inbox", "bookings", "payments"}, "home": {"inbox", "bookings", "payments"},
    "restaurant": {"inbox", "orders", "payments"}, "shop": {"inbox", "orders", "payments"},
    "wholesale": {"inbox", "ledger", "payments"}, "travel": {"inbox", "payments"},
}


@pytest.fixture(autouse=True)
def no_samples_left_behind():
    """Some tests change every shop's items at once with owner SQL, and a sample can only be a
    draft, so these tests leave no sample in the shared test database."""
    owner_sql("delete from items where is_sample")
    yield
    owner_sql("delete from items where is_sample")


@pytest.fixture
def on(client_factory, monkeypatch):
    """A client for an API whose new businesses get their type's Catalog (the default since
    ALY-113; the setting is still named so a test says which way it runs)."""
    monkeypatch.setenv("ALYR_CATALOG_FOR_NEW_SHOPS", "true")
    return client_factory()


@pytest.fixture
def off(client_factory, monkeypatch):
    """A client for an API with the Catalog switched off for new businesses: every type is
    created exactly as it was before the Catalog."""
    monkeypatch.setenv("ALYR_CATALOG_FOR_NEW_SHOPS", "false")
    return client_factory()


def make(client, kind):
    tenant, slug, _ = new_business(client, kind=kind, name=f"{kind.title()} {uuid4().hex[:6]}")
    return tenant, slug


def modules(tenant) -> set[str]:
    rows = owner_sql(
        "select module_key from tenant_modules where tenant_id = $1 and enabled", UUID(tenant)
    )
    return {r["module_key"] for r in rows}


def state(client):
    return client.get(f"{BASE}/state").json()


def listed(client, **query):
    answer = client.get("/api/items", params={"limit": 100, **query})
    assert answer.status_code == 200, answer.text
    return answer.json()


def samples_of(client):
    return listed(client, filter="sample")["items"]


# ── the setting is off: nothing is different ──────────────────────────────────────────


def test_the_catalog_is_on_for_new_shops_unless_the_setting_says_otherwise(client):
    from alyr.config import get_settings

    assert get_settings().catalog_for_new_shops is True


def test_the_setting_can_still_turn_the_catalog_off_for_new_shops(off):
    from alyr.config import get_settings

    assert get_settings().catalog_for_new_shops is False
    tenant, _ = make(off, "restaurant")
    assert "catalog" not in modules(tenant)


def test_with_the_setting_off_every_old_type_is_created_exactly_as_before(off):
    client = off
    for kind, expected in BEFORE.items():
        tenant, _ = make(client, kind)
        assert modules(tenant) == expected, kind
        assert state(client)["catalog"] is None, kind
        workspace = client.get("/api/workspace").json()
        assert "catalog" not in workspace["modules"], kind
        assert "catalog" not in [s["key"] for s in workspace["nav"]["products"]], kind
        # Nothing the Catalog adds exists for the shop: no sample, no category, no setting.
        assert owner_sql("select count(*) as n from items where tenant_id = $1",
                         UUID(tenant))[0]["n"] == 0, kind
        assert owner_sql("select count(*) as n from item_categories where tenant_id = $1",
                         UUID(tenant))[0]["n"] == 0, kind
        assert owner_sql("select count(*) as n from shop_settings where tenant_id = $1",
                         UUID(tenant))[0]["n"] == 0, kind
        # The Catalog's own API answers a shop with the orders module (that is how it always
        # was) and refuses one without orders or catalog.
        has_orders = "orders" in expected
        assert (client.get("/api/items/setup").status_code == 200) is has_orders, kind
        assert client.get("/api/items").status_code == (200 if has_orders else 403), kind


def test_with_the_setting_off_the_types_offered_are_the_ones_offered_today(off):
    client = off
    keys = [t["key"] for t in client.get(f"{BASE}/types").json()["types"]]
    assert keys == ["salon", "spa", "clinic", "home", "restaurant", "shop", "wholesale", "travel"]


def test_with_the_setting_off_a_type_that_exists_for_the_catalog_cannot_be_created(off):
    client = off
    for kind in NEW_TYPES:
        body = {"signup_token": "x" * 40, "owner_name": "A", "name": "Nope", "type": kind}
        answer = client.post(f"{BASE}/business", json=body)
        assert answer.status_code in (401, 422), kind  # never a business
    # A real token is refused for the type itself, not for the token.
    from test_onboarding import signup_token

    token = signup_token(client, f"new-{uuid4().hex[:6]}@shop.example")
    body = {"signup_token": token, "owner_name": "A", "name": "Nope", "type": "bakery"}
    refused = client.post(f"{BASE}/business", json=body)
    assert refused.status_code == 422 and "type of business" in refused.json()["detail"]


# ── the setting is on: each type gets its catalog ─────────────────────────────────────


def test_with_the_setting_on_the_new_types_are_offered_with_their_names_in_both_languages(on):
    types = {t["key"]: t for t in on.get(f"{BASE}/types").json()["types"]}
    assert list(types)[:2] == ["salon", "spa"]
    assert set(types) == set(BEFORE) | set(NEW_TYPES)
    assert types["bakery"]["name"] == {"en": "Bakery & home kitchen", "ar": "مخبز ومطبخ منزلي"}
    assert types["grocery"]["name"] == {"en": "Grocery & baqala", "ar": "بقالة وسوبرماركت"}
    assert types["fashion"]["name"] == {"en": "Fashion & gifts", "ar": "أزياء وهدايا"}
    for kind in NEW_TYPES:
        assert types[kind]["way"] == "assisted" and types[kind]["icon"]


@pytest.mark.parametrize("kind", sorted(EXPECT))
def test_each_type_starts_with_its_own_catalog(on, kind):
    section, section_ar, rule, low, sold_out, alerts, layout, n_samples, n_categories = EXPECT[
        kind
    ]
    tenant, _ = make(on, kind)
    preset = presets.PRESET_BY_KEY[kind]

    # The modules are the type's own, plus the Catalog and what its catalog needs: a
    # wholesaler's customers order from the price list, so wholesale also gets `orders`.
    needs = {"wholesale": {"orders"}}.get(kind, set())
    assert modules(tenant) == set(preset.modules) | needs | {"catalog"}

    # The navigation says what the type calls it, in both languages, and nothing else changed.
    workspace = on.get("/api/workspace").json()
    nav = next(s for s in workspace["nav"]["products"] if s["key"] == "catalog")
    assert nav["label"] == {"en": section, "ar": section_ar}

    # The starting values and the layout hints.
    hints = on.get("/api/items/setup").json()
    assert hints["type"] == kind
    assert hints["section"]["name"] == section and hints["section"]["name_ar"] == section_ar
    assert hints["new_item"]["rule"] == rule
    assert hints["low_stock_at"] == low and hints["sold_out"] == sold_out
    assert {k for k, v in hints["alerts"].items() if v} == alerts
    assert hints["layout"]["style"] == layout
    assert hints["optional"] is (kind in ("salon", "spa", "clinic", "home"))
    assert on.get("/api/items/settings").json()["low_stock_at"] == low

    # The starting categories, with their Arabic names, in order.
    categories = on.get("/api/items/categories").json()["categories"]
    assert len(categories) == n_categories
    assert all(c["name"] and ARABIC.search(c["name_ar"]) for c in categories)

    # The samples: marked, drafts, in both languages, never for sale.
    found = samples_of(on)
    assert len(found) == n_samples == hints["samples"]
    assert listed(on)["counts"]["sample"] == n_samples
    for item in found:
        assert item["sample"] is True and item["sample_key"]
        assert item["status"] == "draft"
        assert item["name"].strip() and ARABIC.search(item["name_ar"])
        assert item["price"] > 0  # an example price, which the screens call a sample
        assert item["category"] in {c["name"] for c in categories}
        assert item["photos"] == [] and item["cover"]["state"] == "missing"
    # The onboarding review says it in plain words, in both languages.
    review = state(on)["catalog"]
    assert review["section"]["name"] == section and review["samples"] == n_samples
    assert review["gets"] and all(g["en"] and ARABIC.search(g["ar"]) for g in review["gets"])
    assert [c["name"] for c in review["starting_categories"]] == [c["name"] for c in categories]


def test_travel_and_documents_have_no_catalog_at_all(on):
    tenant, slug = make(on, "travel")
    assert modules(tenant) == BEFORE["travel"]
    workspace = on.get("/api/workspace").json()
    assert "catalog" not in workspace["modules"]
    assert "catalog" not in [s["key"] for s in workspace["nav"]["products"]]
    assert state(on)["catalog"] is None
    # No screen, no API, no entry in the search palette's list (the palette is the nav).
    for path in ("/api/items", "/api/items/setup", "/api/items/categories",
                 "/api/price-groups"):
        assert on.get(path).status_code == 403, path
    assert owner_sql("select count(*) as n from items where tenant_id = $1",
                     UUID(tenant))[0]["n"] == 0
    assert presets.PRESET_BY_KEY["travel"].catalog is None
    assert "travel" not in presets_catalog.SETUPS


def test_changing_the_setting_does_not_touch_a_shop_that_exists(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_CATALOG_FOR_NEW_SHOPS", "false")
    before = client_factory()
    tenant, _ = make(before, "shop")
    monkeypatch.setenv("ALYR_CATALOG_FOR_NEW_SHOPS", "true")
    after = client_factory()  # the setting was flipped; the existing shop is as it was
    # (the shops that existed when the Catalog went live got it from migration 0032, which is
    # tested in test_catalog_go_live.py; the setting itself never touches a shop)
    sign_in(after, owner_of(tenant))
    assert "catalog" not in modules(tenant)
    assert "catalog" not in after.get("/api/workspace").json()["modules"]


def owner_of(tenant) -> str:
    return owner_sql(
        "select u.email from memberships m join users u on u.id = m.user_id "
        "where m.tenant_id = $1 and m.role = 'owner'", UUID(tenant),
    )[0]["email"]


# ── the types that were already there keep their ways ─────────────────────────────────


def test_a_salon_with_the_catalog_keeps_its_bookings_flow_unchanged(on):
    tenant, _ = make(on, "salon")
    preset = presets.PRESET_BY_KEY["salon"]
    s = state(on)
    assert (s["way"], s["step"]) == ("appointments", "services")
    assert [x["name"] for x in s["services"]] == [x.name for x in preset.services]
    assert s["services"][0]["price_text"] == "QAR 60"
    assert len(s["hours"]) == len(preset.hours)
    assert modules(tenant) == {"inbox", "bookings", "payments", "catalog"}
    # The Catalog is optional: it says so, and the products are not a step of onboarding.
    assert s["catalog"]["optional"] is True
    assert "catalog" not in s["steps"] and s["steps"] == list(presets.STEPS["appointments"])


def test_a_restaurant_is_still_set_up_with_alyr_and_a_wholesaler_keeps_its_credit_accounts(on):
    tenant, _ = make(on, "restaurant")
    s = state(on)
    assert (s["way"], s["step"]) == ("assisted", "assisted")
    assert owner_sql("select count(*) as n from setup_requests where tenant_id = $1",
                     UUID(tenant))[0]["n"] == 1
    tenant, _ = make(on, "wholesale")
    # It keeps its credit accounts and, because customers order from its price list, gets orders.
    assert modules(tenant) == {"inbox", "ledger", "payments", "orders", "catalog"}
    assert state(on)["way"] == "assisted"


# ── what each type is for ─────────────────────────────────────────────────────────────


def test_a_bakery_runs_on_daily_limits_with_notice_and_a_cutoff(on):
    make(on, "bakery")
    hints = on.get("/api/items/setup").json()
    assert hints["new_item"] == {"rule": "daily_limit", "unit": "piece", "lead_days": 1,
                                 "cutoff": "18:00"}
    assert hints["layout"]["pickup_date"] is True
    by_key = {i["sample_key"]: i for i in samples_of(on)}
    cake = by_key["choc-cake"]
    assert cake["stock_rule"] == "daily_limit"
    assert [(v["name"], v["daily_limit"]) for v in cake["variants"]] == [("Small", 3), ("Large", 2)]
    assert cake["schedule"][0]["lead_days"] == 1 and cake["schedule"][0]["cutoff"] == "18:00:00"
    # A made-to-order cake never runs out, and is ordered two days ahead.
    custom = by_key["custom-cake"]
    assert custom["stock_rule"] == "always" and custom["schedule"][0]["lead_days"] == 2
    assert by_key["croissant"]["variants"][0]["daily_limit"] == 40


def test_a_grocery_counts_stock_in_kilos_pieces_and_packs_and_hides_what_is_gone(on):
    make(on, "grocery")
    hints = on.get("/api/items/setup").json()
    assert (hints["new_item"]["rule"], hints["low_stock_at"], hints["sold_out"]) == (
        "count", 10, "hide")
    # The four things a page can offer were declared per type and never read; the page always
    # offered all four, so every type starts with all four on (ALY-148, spec 011).
    assert hints["layout"] == {"style": "list", "pickup_date": True, "quick_quantity": True,
                               "same_as_last": True, "show_sku": True}
    items = samples_of(on)
    assert {i["unit"] for i in items} == {"kg", "piece", "pack"}
    assert all(i["stock_rule"] == "count" for i in items)
    # Samples carry no stock: nothing is counted that the owner has not counted.
    assert all(v["on_hand"] == 0 for i in items for v in i["variants"])


def test_a_fashion_seller_gets_sizes_and_colours_with_their_own_stock(on):
    make(on, "fashion")
    hints = on.get("/api/items/setup").json()
    assert hints["layout"]["style"] == "grid" and hints["focus"] == ["variants"]
    by_key = {i["sample_key"]: i for i in samples_of(on)}
    abaya = by_key["abaya"]
    assert [v["name"] for v in abaya["variants"]] == ["Black M", "Black L", "Navy M", "Navy L"]
    assert [v["name_ar"] for v in abaya["variants"]][0] == "أسود M"
    assert abaya["stock_rule"] == "count"
    assert by_key["gift-box"]["stock_rule"] == "always"  # a pre-order
    assert by_key["gift-box"]["schedule"][0]["lead_days"] == 3


def test_a_restaurant_has_sizes_and_extras_a_switch_and_an_alert_for_sold_out_only(on):
    make(on, "restaurant")
    by_key = {i["sample_key"]: i for i in samples_of(on)}
    wrap = by_key["chicken-wrap"]
    assert wrap["stock_rule"] == "switch" and wrap["tags"] == ["Halal"]
    size, extras = wrap["option_groups"]
    assert size["required"] is True and [o["name"] for o in size["options"]] == ["Regular", "Large"]
    assert extras["required"] is False and extras["max_choices"] == 2
    assert [o["price_delta"] for o in extras["options"]] == [100, 0]
    assert on.get("/api/items/setup").json()["alerts"] == {"low_stock": False, "sold_out": True}


def test_a_wholesaler_gets_a_price_list_with_pack_sizes_minimum_orders_and_price_groups(on):
    make(on, "wholesale")
    hints = on.get("/api/items/setup").json()
    assert hints["section"]["name"] == "Price list"
    assert hints["layout"] == {"style": "table", "pickup_date": True, "quick_quantity": True,
                               "same_as_last": True, "show_sku": True}
    assert hints["focus"] == ["groups"] and hints["new_item"]["unit"] == "pack"
    by_key = {i["sample_key"]: i for i in samples_of(on)}
    assert (by_key["oil-9"]["pack_size"], by_key["oil-9"]["min_order"]) == (9, 3)
    assert by_key["rice-20"]["min_order"] == 5
    assert all(i["sku"] == "" for i in samples_of(on))  # a sample takes no code from the shop
    groups = on.get("/api/price-groups")
    assert groups.status_code == 200 and groups.json()["groups"][0]["is_default"] is True


def test_a_wholesale_shop_made_with_the_setting_on_orders_on_account_at_its_group_price(on):
    """The wholesaler's customers order from the price list: the order page is there, a
    customer with a credit limit puts the order on their account at their group's price, the
    ledger takes the sale, and the credit limit still holds."""
    tenant, slug = make(on, "wholesale")
    assert {"orders", "ledger", "catalog"} <= modules(tenant)
    # The owner's test customer is the shop's customer, given a credit limit of QAR 50.
    on.post(f"{BASE}/test-chat", json={"text": "hello"})
    contact = str(owner_sql("select id from contacts where tenant_id = $1 and role = 'customer'",
                            UUID(tenant))[0]["id"])
    owner_sql("update contacts set credit_limit = 5000 where id = $1", UUID(contact))
    cable = on.post("/api/items", json={
        "name": "Cable", "name_ar": "كابل", "price": 1000, "status": "live", "unit": "pack",
        "pack_size": 10, "min_order": 2, "stock_rule": "count", "opening_stock": 50,
    }).json()["item"]
    group = on.post("/api/price-groups", json={"name": "Wholesale", "name_ar": "الجملة"}).json()
    group_id = group["group"]["id"]
    assert on.put(f"/api/items/{cable['id']}/group-prices", json={
        "prices": [{"group_id": group_id, "price": 800}]}).status_code == 200
    assert on.put(f"/api/price-groups/customers/{contact}",
                  json={"group_id": group_id}).status_code == 200

    # The order page is open, in the wholesale layout, with the customer's own price.
    mine = token(contact, tenant)  # the customer's own link (ALY-112): a signed token
    page = on.get(f"/api/store/{slug}", params={"t": mine}).json()
    assert page["catalog"]["layout"]["style"] == "table"
    assert page["catalog"]["section"]["name"] == "Price list"
    assert page["customer"]["can_use_account"] is True
    assert page["group"]["name"] == "Wholesale"
    assert [(p["name"], p["price"], p["price_source"]) for p in page["products"]] == [
        ("Cable", 800, "group")]

    # On account at the group's price (the minimum order is two).
    def place(quantity, price=800):
        return on.post(f"/api/store/{slug}/orders", json={
            "token": mine, "payment": "account",
            "items": [{"product_id": cable["id"], "quantity": quantity, "expected_price": price}]})

    placed = place(4)
    assert placed.status_code == 200, placed.text
    assert placed.json()["total"] == 3200 and placed.json()["price_group"]["name"] == "Wholesale"
    balance = next(c for c in on.get("/api/ledger/summary").json()["customers"]
                   if c["id"] == contact)["balance"]
    assert balance == 3200
    # The credit limit holds: a second order of QAR 32 would take the account past QAR 50.
    over = place(4)
    assert over.status_code == 409 and over.json()["detail"]["code"] == "over_limit"
    # A smaller order than the minimum is refused, and a customer with no credit is not offered
    # the account.
    assert place(1).status_code == 422
    owner_sql("update contacts set credit_limit = 0 where id = $1", UUID(contact))
    assert on.get(f"/api/store/{slug}", params={"t": mine}).json()[
        "customer"]["can_use_account"] is False
    refused = place(2)
    assert refused.status_code == 403 and refused.json()["detail"]["code"] == "no_account"


def test_giving_a_wholesaler_orders_does_not_change_the_price_drafted_for_it(
    on, client_factory, monkeypatch
):
    """A quote is drafted from the business's modules (D-032, D-035). A wholesaler's inbox and
    payment links already count as ALYR Chat beside ALYR Accounts, so adding the orders module
    leaves its drafted price as it was. The founder sets the final price in the back office."""
    from test_pricing import client_of, open_quote

    def drafted(name):
        lines = open_quote(client_of(client_factory(), name))["lines"]
        return [(x["item_key"], x["unit_price"]) for x in lines]

    with_catalog = f"Wholesale {uuid4().hex[:6]}"
    new_business(on, kind="wholesale", name=with_catalog)
    monkeypatch.setenv("ALYR_CATALOG_FOR_NEW_SHOPS", "false")
    off = client_factory()
    without = f"Wholesale {uuid4().hex[:6]}"
    new_business(off, kind="wholesale", name=without)
    assert drafted(with_catalog) == drafted(without)
    assert {"chat", "credit"} <= {key for key, _ in drafted(without)}  # Accounts is "credit"


def test_the_orders_step_points_to_the_catalog_under_the_types_name(on):
    make(on, "restaurant")
    steps = [s for p in on.get("/api/workspace").json()["products"] for s in p["steps"]]
    step = next(s for s in steps if s["key"] == "products")
    assert step["label"] == {"en": "Add your menu", "ar": "أضف القائمة"}
    assert step["screen"] == "catalog" and step["done"] is False  # samples are not "done"


def test_a_shop_whose_items_are_called_products_does_not_get_two_entries_of_that_name(on):
    make(on, "shop")
    nav = on.get("/api/workspace").json()["nav"]
    assert [s["label"]["en"] for s in nav["products"] if s["key"] == "catalog"] == ["Products"]
    suite = next(s for s in nav["account"] if s["key"] == "products")
    assert suite["label"] == {"en": "ALYR products", "ar": "منتجات ALYR"}
    # A menu does not collide, so the suite keeps its name.
    make(on, "restaurant")
    nav = on.get("/api/workspace").json()["nav"]
    assert next(s for s in nav["account"] if s["key"] == "products")["label"]["en"] == "Products"


# ── samples are never sold, and are the owner's to take or leave ──────────────────────


def test_samples_never_reach_customers(on):
    tenant, slug = make(on, "restaurant")
    page = on.get(f"/api/store/{slug}").json()
    assert page["products"] == [] and page["unavailable"] == []
    # The chat on the owner's test line: asking for a sample dish finds nothing to show.
    for text in ("chicken shawarma wrap", "menu"):
        on.post(f"{BASE}/test-chat", json={"text": text})
    said = " ".join(m["body"] or "" for m in on.get(f"{BASE}/test-chat").json()["messages"]
                    if m["direction"] == "out")
    assert "shawarma wrap" not in said.lower()
    # Nor does the workspace's older product list (the Orders screen's) carry them.
    assert on.get("/api/products").json()["products"] == []


def test_the_database_will_not_hold_a_sample_that_is_for_sale(on):
    tenant, _ = make(on, "bakery")
    with pytest.raises(Exception, match="items_sample_is_draft"):
        owner_sql("update items set status = 'live' where tenant_id = $1 and is_sample",
                  UUID(tenant))


def test_nothing_but_the_owner_opening_a_sample_can_change_it(on):
    make(on, "grocery")
    item = samples_of(on)[0]
    gone = item["id"]
    refusals = [
        on.post(f"/api/items/{gone}/switch", json={"available": False}),
        on.post(f"/api/items/{gone}/status", json={"status": "live"}),
        on.post(f"/api/items/{gone}/stock", json={"kind": "received", "quantity": 5}),
        on.post(f"/api/items/{gone}/count", json={"counted": 5}),
        on.put(f"/api/items/{gone}/group-prices", json={"prices": [
            {"group_id": on.get("/api/price-groups").json()["groups"][0]["id"], "price": 100}]}),
    ]
    for answer in refusals:
        assert answer.status_code == 422, answer.text
        assert answer.json()["detail"]["code"] == "sample_item"
    # A bulk action leaves samples alone and says why.
    plan = on.post("/api/items/bulk/preview", json={"action": "archive", "item_ids": [gone]})
    assert plan.json()["changes"] == []
    assert [s["code"] for s in plan.json()["skipped"]] == ["sample"]
    plan = on.post("/api/items/bulk/preview", json={"action": "price_percent",
                                                    "item_ids": [gone], "percent": 10})
    assert [s["code"] for s in plan.json()["skipped"]] == ["sample"]
    assert on.get(f"/api/items/{gone}").json()["sample"] is True


def test_saving_a_sample_makes_it_the_owners_own_and_it_stays_a_draft(on):
    make(on, "restaurant")
    item = next(i for i in samples_of(on) if i["sample_key"] == "hummus")
    saved = on.put(f"/api/items/{item['id']}", json={"price": 1700, "name": "House hummus"})
    assert saved.status_code == 200, saved.text
    mine = saved.json()["item"]
    assert mine["sample"] is False and mine["sample_key"] == "" and mine["status"] == "draft"
    assert mine["price"] == 1700 and mine["name"] == "House hummus"
    assert len(samples_of(on)) == 5
    # It is a draft like any other now: it appears among the owner's drafts.
    assert mine["id"] in [i["id"] for i in listed(on, filter="draft")["items"]]
    # And the owner can put it on sale, which a sample could never be.
    live = on.put(f"/api/items/{item['id']}", json={"status": "live"})
    assert live.status_code == 200 and live.json()["item"]["status"] == "live"
    # The record says who and what.
    record = on.get(f"/api/items/{item['id']}/activity").json()["activity"]
    assert "adopted" in [a["action"] for a in record]


def test_putting_a_sample_on_sale_in_the_same_save_is_allowed_and_it_is_then_theirs(on):
    make(on, "shop")
    item = samples_of(on)[0]
    answer = on.put(f"/api/items/{item['id']}", json={
        "name": "Our earbuds", "name_ar": "سماعاتنا", "price": 9900, "status": "live"})
    assert answer.status_code == 200, answer.text
    assert answer.json()["item"]["status"] == "live" and answer.json()["item"]["sample"] is False
    assert len(samples_of(on)) == 5


def test_a_sample_can_be_taken_as_it_is_without_changing_anything(on):
    make(on, "fashion")
    item = samples_of(on)[0]
    taken = on.post(f"/api/items/{item['id']}/adopt")
    assert taken.status_code == 200 and taken.json()["sample"] is False
    assert taken.json()["name"] == item["name"] and taken.json()["status"] == "draft"
    again = on.post(f"/api/items/{item['id']}/adopt")
    assert again.status_code == 200 and again.json()["sample"] is False
    assert on.post(f"/api/items/{uuid4()}/adopt").status_code == 404


def test_remove_all_samples_is_one_step_and_keeps_what_the_owner_made(on):
    make(on, "bakery")
    mine = on.post("/api/items", json={"name": "Our cake", "name_ar": "كيكتنا", "price": 5000,
                                       "status": "live"}).json()["item"]
    adopted = samples_of(on)[0]
    on.put(f"/api/items/{adopted['id']}", json={"price": 4000})
    answer = on.post("/api/items/samples/remove")
    assert answer.status_code == 200 and answer.json() == {"removed": 5}
    assert samples_of(on) == []
    kept = {i["id"] for i in listed(on)["items"]}
    assert kept == {mine["id"], adopted["id"]}
    assert listed(on)["counts"]["sample"] == 0
    # The starting categories stay, so the owner's first item has somewhere to go.
    assert len(on.get("/api/items/categories").json()["categories"]) == 5
    # Asking again removes nothing and fails nothing.
    assert on.post("/api/items/samples/remove").json() == {"removed": 0}
    # What was done is on each item's record.
    n = owner_sql("select count(*) as n from activity where subject = 'item' "
                  "and action = 'deleted' and detail->>'sample' = 'true'")[0]["n"]
    assert n >= 5


def test_an_import_never_matches_a_sample_and_the_sample_stays_as_it_was(on):
    from test_catalog_import import BASIC, apply_import, preview_of, table, xlsx_of

    make(on, "bakery")
    before = {i["id"]: i["price"] for i in samples_of(on)}
    # A row with a sample's name is a new item, even when the shop asks to update names that
    # exist: the sample is an example, not something the owner has.
    rows = table(BASIC, ["Chocolate cake", "كيكة الشوكولاتة", "Cakes", 90])
    done = apply_import(on, preview_of(on, xlsx_of(rows), on_duplicate="update"))
    assert done.status_code == 200, done.text
    mine = [i for i in listed(on)["items"] if i["name"] == "Chocolate cake" and not i["sample"]]
    assert len(mine) == 1 and mine[0]["price"] == 9000
    assert {i["id"]: i["price"] for i in samples_of(on)} == before  # the samples are as they were


def test_one_shops_samples_are_not_another_shops(on):
    first, _ = make(on, "bakery")
    second, _ = make(on, "bakery")
    assert on.post("/api/items/samples/remove").json() == {"removed": 6}
    left = owner_sql("select tenant_id, count(*) as n from items where is_sample "
                     "and tenant_id = any($1) group by tenant_id", [UUID(first), UUID(second)])
    assert [(str(r["tenant_id"]), r["n"]) for r in left] == [(first, 6)]


def test_an_agent_cannot_remove_samples_unless_the_owner_lets_agents_edit(client):
    owner_sql("insert into tenant_modules (tenant_id, module_key, enabled_by) "
              "values ($1, 'catalog', 'test') on conflict (tenant_id, module_key) "
              "do update set enabled = true", DEMO_TENANT_ID)
    made = client.post("/api/items", json={"name": "Sample thing", "price": 100,
                                           "status": "draft"}).json()["item"]
    owner_sql("update items set is_sample = true, sample_key = 'x' where id = $1",
              UUID(made["id"]))
    sign_in(client, AGENT_EMAIL)
    assert client.post("/api/items/samples/remove").status_code == 403
    assert client.post(f"/api/items/{made['id']}/adopt").status_code == 403
    assert client.get("/api/items/setup").status_code == 200  # an agent may read it
    assert client.put("/api/items/setup", json={"sold_out": "hide"}).status_code == 403
    assert owner_sql("select count(*) as n from items where is_sample and tenant_id = $1",
                     DEMO_TENANT_ID)[0]["n"] == 1
    owner_sql("delete from items where is_sample and tenant_id = $1", DEMO_TENANT_ID)


@pytest.fixture
def photos_cleared():
    """The photo tables are shared by the whole test run: start and finish with none."""

    def clear():
        for table in ("media_ops", "media_links", "media_assets", "media_usage"):
            owner_sql(f"delete from {table}")
        owner_sql("delete from jobs where kind = 'media.sync'")

    clear()
    yield
    clear()


def test_a_draft_made_from_a_photo_runs_out_the_way_the_shops_new_items_do(on, photos_cleared):
    from test_catalog_screens import stored_photo

    make(on, "grocery")
    first = on.post("/api/items/drafts", json={"photo_ids": [stored_photo(on, 1)]}).json()
    assert first["created"][0]["stock_rule"] == "count"  # a grocery counts what it has
    # A number each day needs its number first, so a draft starts as on or off.
    on.put("/api/items/setup", json={"new_item_rule": "daily_limit"})
    second = on.post("/api/items/drafts", json={"photo_ids": [stored_photo(on, 2)]}).json()
    assert second["created"][0]["stock_rule"] == "switch"
    on.put("/api/items/setup", json={"new_item_rule": "always"})
    third = on.post("/api/items/drafts", json={"photo_ids": [stored_photo(on, 3)]}).json()
    assert third["created"][0]["stock_rule"] == "always"


def test_a_restaurants_drafts_stay_on_or_off(on, photos_cleared):
    from test_catalog_screens import stored_photo

    make(on, "restaurant")
    draft = on.post("/api/items/drafts", json={"photo_ids": [stored_photo(on, 1)]}).json()
    assert draft["created"][0]["stock_rule"] == "switch"


# ── what the owner may change, and who is told ────────────────────────────────────────


def test_the_owner_changes_what_the_type_started_with(on):
    make(on, "restaurant")
    changed = on.put("/api/items/setup", json={
        "sold_out": "hide", "new_item_rule": "count", "alerts": {"low_stock": True}})
    assert changed.status_code == 200, changed.text
    hints = changed.json()
    assert hints["sold_out"] == "hide" and hints["new_item"]["rule"] == "count"
    assert hints["alerts"] == {"low_stock": True, "sold_out": True}
    assert on.get("/api/items/setup").json() == hints
    # Only what was sent changed: the low-stock number and the layout are as they were.
    assert hints["low_stock_at"] == 3 and hints["layout"]["style"] == "menu"
    for bad in ({"sold_out": "gone"}, {"new_item_rule": "sometimes"}, {"alerts": {"x": True}}):
        assert on.put("/api/items/setup", json=bad).status_code == 422, bad


def test_a_bakery_new_item_is_ordered_for_a_date_only_while_it_runs_out_the_bakery_way(on):
    make(on, "bakery")
    assert on.get("/api/items/setup").json()["new_item"]["lead_days"] == 1
    on.put("/api/items/setup", json={"new_item_rule": "switch"})
    assert on.get("/api/items/setup").json()["new_item"]["lead_days"] is None


def test_the_order_page_is_told_the_types_wording_and_layout_and_nothing_private(on):
    _, slug = make(on, "grocery")
    page = on.get(f"/api/store/{slug}").json()
    assert page["catalog"] == {
        "type": "grocery",
        "section": {"name": "Products", "name_ar": "المنتجات"},
        "layout": {"style": "list", "pickup_date": True, "quick_quantity": True,
                   "same_as_last": True, "show_sku": True},
        "sold_out": "hide",
        "features": {"tags": True, "variants": True, "options": True, "pack_rules": True,
                     "price_groups": True, "table_qr": True, "custom_fields": True},
    }
    # A shop without the Catalog gets an order page as it always had.
    from alyr.seed import DEMO_SLUG

    sign_in(on, AGENT_EMAIL)
    assert on.get(f"/api/store/{DEMO_SLUG}").json()["catalog"] is None


# ── the words ─────────────────────────────────────────────────────────────────────────


def all_words():
    for key, setup in presets_catalog.SETUPS.items():
        yield key, "section", setup.section
        yield key, "sub", setup.sub
        for n, g in enumerate(setup.gets):
            yield key, f"gets {n}", g
    for p in presets.PRESETS:
        yield p.key, "name", p.name
        yield p.key, "hint", p.hint


def test_every_word_has_an_arabic_line_and_none_says_coming_or_beta():
    for key, where, text in all_words():
        assert text.en.strip() and ARABIC.search(text.ar), (key, where)
        for banned in BANNED:
            assert banned not in text.en.lower() and banned not in text.ar, (key, where, banned)


def test_every_sample_has_arabic_names_and_every_category_too():
    for key, setup in presets_catalog.SETUPS.items():
        for en, ar in setup.categories:
            assert en and ARABIC.search(ar), (key, en)
        for s in setup.samples:
            assert s.name.strip() and ARABIC.search(s.name_ar), (key, s.key)
            assert s.price > 0 and s.price % 100 == 0, (key, s.key)
            for choice in s.choices:
                assert ARABIC.search(choice.name_ar), (key, s.key, choice.name)
                assert all(ARABIC.search(a) for _, a, _ in choice.options), (key, s.key)
            for name, name_ar, _, _ in s.variants:
                # a size such as "M" is the same in both; a colour has its Arabic word
                assert name_ar and (ARABIC.search(name_ar) or name == name_ar), (key, s.key, name)


def test_the_review_says_only_what_the_settings_do():
    """The plain words of the review match the numbers and switches behind them."""
    for kind, (_, _, rule, low, sold_out, alerts, layout, *_rest) in EXPECT.items():
        setup = presets_catalog.SETUPS[kind]
        assert (setup.rule, setup.low_stock_at, setup.sold_out, set(setup.alerts),
                setup.layout.style) == (rule, low, sold_out, alerts, layout), kind
        said = " ".join(g.en for g in setup.gets)
        # A bullet about alerts exists exactly when an alert is on.
        assert ("under Staff on WhatsApp" in said) is bool(alerts), kind
        # A number in a low-stock bullet is the low-stock number, in both languages.
        for g in setup.gets:
            numbers = re.findall(r"(?:number of |down to |low \()(\d+)", g.en)
            if numbers:
                assert numbers == [str(low)], (kind, g.en)
                assert str(low) in g.ar, (kind, g.ar)
        # What a bullet says about greyed or left-out items is what the setting is.
        if "greyed out" in said and kind != "restaurant":
            assert sold_out == "grey", kind
        if "left off your order page" in said:
            assert sold_out == "hide", kind


def test_a_new_type_is_in_the_registry_once_with_its_catalog():
    keys = [p.key for p in presets.PRESETS]
    assert len(keys) == len(set(keys))
    for kind in NEW_TYPES:
        preset = presets.PRESET_BY_KEY[kind]
        assert preset.requires_catalog and preset.catalog is presets_catalog.SETUPS[kind]
        assert "catalog" not in preset.modules  # declared apart; the setting decides
        assert "catalog" in preset.modules_for(True) and "catalog" not in preset.modules_for(False)
        assert preset.offered(True) and not preset.offered(False)
    for kind in BEFORE:
        assert presets.PRESET_BY_KEY[kind].offered(False)
        # With the setting off every type is exactly as it was: no catalog, nothing extra.
        assert presets.PRESET_BY_KEY[kind].modules_for(False) == presets.PRESET_BY_KEY[
            kind].modules
    wholesale = presets.PRESET_BY_KEY["wholesale"]
    assert "orders" not in wholesale.modules and "orders" not in wholesale.modules_for(False)
    assert set(wholesale.modules_for(True)) == {"inbox", "ledger", "payments", "orders", "catalog"}
    assert len(wholesale.modules_for(True)) == 5  # none twice
    assert presets.PRESET_BY_KEY["travel"].modules_for(True) == presets.PRESET_BY_KEY[
        "travel"].modules
