"""A shop of every business type behaves as it did before the feature engine (ALY-148).

`golden/types_before_features.json` was captured by running the code on `origin/main` (first at
the commit before this work, then captured again at `ec1a92b` when ALY-136 merged, which added
`whatsapp_mode` to the settings and the read-only "Item code (ALYR)" column to the export, and
nothing else) for each of the eleven business types through the real onboarding
path: the navigation, the home cards, the Catalog's setup (`/api/items/setup`), what the order
page is told, the item form's reach (a full item for every way of running out), the columns of
the import and export files, the review onboarding shows, the starting categories and samples.
Here the same is read from the new code and compared with it, field by field.

The only differences are the ones the work meant, written below as `DELIBERATE` and nowhere
else:

* the four things an order page can offer (`pickup_date`, `quick_quantity`, `same_as_last`,
  `show_sku`) were declared per type and never read; the page always offered all four, so the
  registry starts every type with all four on, and the answer says so;
* `report_lines` was declared per type and never read; the report's lines now follow the
  features, and all of them are on, so the report reads as it did;
* the answers gained keys (`template`, `features`, `layout_custom`, `section.custom`...).
"""

import json
from pathlib import Path
from uuid import uuid4

import pytest

from test_onboarding import BASE, new_business

GOLDEN = json.loads(
    (Path(__file__).parent / "golden" / "types_before_features.json").read_text(encoding="utf-8")
)
TYPES = sorted(GOLDEN)
ALL_ON = {"pickup_date": True, "quick_quantity": True, "same_as_last": True, "show_sku": True}
NEW_FEATURES = {"tags": True, "variants": True, "options": True, "pack_rules": True,
                "price_groups": True, "table_qr": True, "custom_fields": True}


@pytest.fixture
def on(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_CATALOG_FOR_NEW_SHOPS", "true")
    return client_factory()


def full_item(rule, n):
    return {
        "name": f"Probe {rule} {n}", "name_ar": f"تجربة {n}", "category": "Probe", "price": 1200,
        "status": "live", "stock_rule": rule, "tags": ["Halal"], "pack_size": 6, "unit": "pack",
        "min_order": 6, "low_stock_at": 4,
        "variants": [
            {"name": "Small", "name_ar": "صغير", "price_delta": 0,
             **({"opening_stock": 9} if rule == "count" else {}),
             **({"daily_limit": 5} if rule == "daily_limit" else {})},
            {"name": "Large", "name_ar": "كبير", "price_delta": 300,
             **({"opening_stock": 9} if rule == "count" else {}),
             **({"daily_limit": 5} if rule == "daily_limit" else {})},
        ],
        "option_groups": [{"name": "Extras", "name_ar": "إضافات", "required": False,
                           "max_choices": 2, "options": [
                               {"name": "Cheese", "name_ar": "جبن", "price_delta": 100}]}],
        "schedule": [{"weekdays": [0, 1, 2, 3, 4, 5, 6], "lead_days": 1, "cutoff": "18:00"}],
    }


def before(setup: dict) -> dict:
    """The golden setup, with the deliberate changes made."""
    out = json.loads(json.dumps(setup))
    out["layout"] |= ALL_ON
    out.pop("report_lines")
    return out


def now(setup: dict) -> dict:
    """The new setup without the keys that did not exist."""
    out = json.loads(json.dumps(setup))
    for key in ("template", "layout_custom", "features"):
        out.pop(key)
    for key in ("custom", "template_name", "template_name_ar"):
        out["section"].pop(key)
    return out


def public_before(catalog: dict) -> dict:
    out = json.loads(json.dumps(catalog))
    out["layout"] |= ALL_ON
    return out


def public_now(catalog: dict) -> dict:
    out = json.loads(json.dumps(catalog))
    assert out.pop("features") == NEW_FEATURES
    return out


@pytest.mark.parametrize("kind", TYPES)
def test_a_shop_of_this_type_behaves_as_it_did_before(on, kind):
    old = GOLDEN[kind]
    _, slug, _ = new_business(on, kind=kind, name=f"{kind.title()} {uuid4().hex[:6]}")
    workspace = on.get("/api/workspace").json()
    assert sorted(workspace["modules"]) == old["modules"]
    assert [(s["key"], s["label"]) for s in workspace["nav"]["products"]] == [
        tuple(x) for x in old["nav_products"]]
    assert [(s["key"], s["label"]) for s in workspace["nav"]["account"]] == [
        tuple(x) for x in old["nav_account"]]
    assert [(p["key"], [s["label"] for s in p["steps"]]) for p in workspace["products"]
            if p["steps"]] == [(k, v) for k, v in old["steps"]]
    home = on.get("/api/workspace/home")
    assert ([c["key"] for c in home.json().get("cards", [])]
            if home.status_code == 200 else None) == old["home_cards"]

    setup = on.get("/api/items/setup")
    assert setup.status_code == old["setup_status"]
    if old["setup_status"] != 200:
        return  # travel and documents have no Catalog at all, as before
    assert now(setup.json()) == before(old["setup"])
    assert on.get("/api/items/settings").json() == old["settings"]
    assert on.get("/api/items/categories").json() == old["categories"]

    page = on.get(f"/api/store/{slug}")
    assert page.status_code == old["store_status"]
    if page.status_code == 200:  # an appointment business has no order page
        assert public_now(page.json()["catalog"]) == public_before(old["store_catalog"])
        assert page.json()["settings"] == old["store_settings"]

    # The item form reaches everything it did: a full item for every way of running out.
    for n, rule in enumerate(("always", "switch", "count", "daily_limit")):
        answer = on.post("/api/items", json=full_item(rule, n))
        assert answer.status_code == old["full_item_status"][rule], (rule, answer.text)

    # The files have the columns they had.
    export = on.get("/api/items/export?format=csv").content.decode("utf-8-sig")
    assert export.splitlines()[0] == old["export_header"]
    template = on.get("/api/items/import/template?kind=generic&format=csv")
    assert template.content.decode("utf-8-sig").splitlines()[0] == old["template_header"]

    review = on.get(f"{BASE}/state").json()["catalog"]
    assert now(review) == before(old["onboarding_catalog"])
    assert on.get("/api/items?filter=sample&limit=100").json()["counts"] == old["samples"]


def test_every_type_the_golden_file_holds_is_a_business_type_alyr_sells():
    from alyr.presets import PRESETS

    assert TYPES == sorted(p.key for p in PRESETS) and len(TYPES) == 11
