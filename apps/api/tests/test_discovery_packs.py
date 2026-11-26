"""Check packs as data (Discovery 2.0): the core, six families and two overlays; every business type
the product has lands in a family and a trade; the health overlay keeps a clinic's service text
out of every proposal; a pack that names something that does not exist is refused at start; and a
new vertical is one more dictionary. Pure: no database."""

import json
import re
from pathlib import Path

import pytest

from alyr import presets, shop_templates
from alyr.demo import build as demo_build
from alyr.modules.agent import view as agent_view
from alyr.modules.discovery import engine, packs, rules
from alyr.modules.discovery.packs import data
from alyr.modules.items import columns
from test_discovery_words import ARABIC, BANNED

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "packs" / "mobile_services.json"
FAMILIES = ("food", "appointments", "home_services", "retail", "stays_schools", "online_only")
RULE_IDS = [r.id for r in rules.RULES]


def registry(*more: dict, first_party=(), business_types=None) -> packs.Registry:
    extra = {} if business_types is None else {"business_types": business_types}
    return packs.Registry.from_data(
        list(data.PACKS) + list(more), RULE_IDS + list(first_party), first_party, **extra)


# ── what there is ──────────────────────────────────────────────────────────────────────


def test_there_is_one_core_six_families_and_two_overlays_in_the_order_the_picker_shows():
    reg = engine.PACKS
    assert [p.id for p in reg.packs] == ["core", *FAMILIES, "health", "online_seller"]
    assert [p.kind for p in reg.packs] == ["core"] + ["family"] * 6 + ["overlay"] * 2
    assert all(p.family == p.id for p in reg.families())


def test_the_core_holds_every_rule_and_every_first_party_rule():
    assert engine.PACKS.select(None).rule_ids == tuple(r.id for r in engine.ALL_RULES)
    with_first_party = registry(first_party=("fp_hours_vs_orders",))
    assert with_first_party.select(None).rule_ids[-1] == "fp_hours_vs_orders"
    assert with_first_party.select("food", "bakery").owner["fp_hours_vs_orders"] == "core"


def test_every_business_type_in_the_product_has_a_family_and_a_trade():
    """The starting setups, the shop templates, the Catalog's kinds, the Agent's lead per type and
    the demo shops all use the same keys: every one of them is mapped (D-196)."""
    known = set(presets.PRESET_BY_KEY) | set(demo_build._SHOP_DIGIT)
    known |= set(shop_templates.BUILTIN_KEYS) - {shop_templates.GENERIC_KEY}
    known |= set(columns.KIND_OF_BUSINESS) | set(agent_view.TYPE_LEAD)
    assert known <= set(data.BUSINESS_TYPES), known - set(data.BUSINESS_TYPES)
    # "Any other business" has no type of its own: the core only, until the owner picks one.
    assert engine.PACKS.for_business_type(shop_templates.GENERIC_KEY) == (None, None)
    for business_type, (family, trade) in data.BUSINESS_TYPES.items():
        assert engine.PACKS.by_id[family].trade(trade) is not None, business_type


def test_a_salon_starts_as_a_salon_and_a_business_with_no_type_gets_the_core_only():
    reg = engine.PACKS
    assert reg.for_business_type("salon") == ("appointments", "salon")
    assert reg.for_business_type("Bakery ") == ("food", "bakery")
    assert reg.for_business_type("clinic") == ("appointments", "clinic")
    assert reg.for_business_type("") == (None, None)
    assert reg.for_business_type("a type that is not there") == (None, None)
    assert reg.select(None).key == "core" and reg.select("food").key == "food"
    assert reg.select("food", "bakery").key == "food/bakery"


def test_every_title_is_in_both_languages_with_no_ai_word_and_no_ellipsis():
    texts = []
    for pack in engine.PACKS.packs:
        texts.append((pack.title_en, pack.title_ar))
        texts += [(t.title_en, t.title_ar) for t in pack.trades]
    for en, ar in texts:
        assert en.strip() and ar.strip() and not ARABIC.search(en) and ARABIC.search(ar), en
        for text in (en, ar):
            assert "…" not in text and "..." not in text and not BANNED.search(text), text
            assert not re.search(r"[٠-٩]", text), text  # Western digits only


# ── overlays ────────────────────────────────────────────────────────────────────────────


def test_the_health_overlay_comes_with_a_clinic_and_a_pharmacy_and_never_edits_service_text():
    reg = engine.PACKS
    for family, trade in (("appointments", "clinic"), ("retail", "pharmacy")):
        chosen = reg.select(family, trade)
        assert chosen.overlays == ("health",)
        assert {"services", "offers"} <= chosen.never_edit
    assert reg.select("appointments", "salon").never_edit == frozenset()
    writes = {("listing", "hours"), ("listing", "services"), ("website", "services"),
              ("website", "offers"), ("listing", "phone")}
    kept = packs.allowed_writes(writes, reg.select("appointments", "clinic").never_edit)
    assert kept == {("listing", "hours"), ("listing", "phone")}
    assert packs.allowed_writes(writes, frozenset()) == writes


def test_no_proposal_the_product_can_make_today_touches_a_field_the_health_overlay_guards():
    """Today's proposals change hours, phone, category, name, the WhatsApp link and review
    replies: none is service text. A proposal type that does must add its field to the guard."""
    fields = {p[1] for proposals in rules.PROPOSES.values() for p in proposals}
    assert not fields & set(engine.PACKS.by_id["health"].never_edit)


def test_an_online_seller_is_not_asked_for_an_address_on_its_website():
    reg = engine.PACKS
    seller = reg.select("online_only", "online_seller")
    assert seller.overlays == ("online_seller",)
    assert "website_location_missing" not in seller.rule_ids
    assert "website_location_missing" in reg.select("online_only", "wholesale").rule_ids
    assert len(seller.rule_ids) == len(reg.select(None).rule_ids) - 1


def test_a_family_or_trade_that_is_not_there_is_refused():
    reg = engine.PACKS
    for family, trade in (("bakeries", None), ("health", None), ("core", None),
                          ("food", "clinic"), (None, "bakery")):
        with pytest.raises(packs.PackError):
            reg.select(family, trade)


# ── a pack that is wrong never loads ────────────────────────────────────────────────────


def family(**more) -> dict:
    return {"id": "x", "kind": "family", "family": "x", "title_en": "X", "title_ar": "س",
            "trades": [{"key": "x1", "title_en": "X one", "title_ar": "س واحد"}],
            "rules": [], "overlays": []} | more


@pytest.mark.parametrize("bad", [
    family(rules=["no_such_rule"]),
    family(skip=["no_such_rule"]),
    family(overlays=["no_such_overlay"]),
    family(overlays=["food"]),  # a family is not an overlay
    family(trades=[]),
    family(trades=[{"key": "bakery", "title_en": "Bakery", "title_ar": "مخبز"}]),  # in food
    family(family="y"),
    family(title_ar=""),
    family(colour="red"),
    family(rules=["hours_missing", "hours_missing"]),
    family(kind="core"),
    family(id="food", family="food"),
])
def test_a_pack_that_names_what_is_not_there_is_refused(bad):
    with pytest.raises(packs.PackError):
        registry(bad)


def test_a_first_party_rule_with_the_id_of_an_existing_rule_is_refused():
    with pytest.raises(packs.PackError):
        registry(first_party=("hours_missing",))


def test_a_business_type_pointing_at_no_trade_is_refused():
    with pytest.raises(packs.PackError):
        registry(business_types={"salon": ("appointments", "no_such_trade")})


# ── counting ────────────────────────────────────────────────────────────────────────────


def test_n_of_m_checks_match_leaves_out_what_was_not_measured():
    entries = [{"state": "pass"}] * 7 + [{"state": "fail"}] * 2 + [{"state": "not_measured"}] * 3
    entries += [{"state": "something else"}, {}]
    assert packs.tally(entries) == {"matched": 7, "measured": 9, "total": 12, "not_measured": 3}
    assert packs.tally([]) == {"matched": 0, "measured": 0, "total": 0, "not_measured": 0}


# ── a new vertical in a day ─────────────────────────────────────────────────────────────


def test_a_new_vertical_is_one_more_piece_of_data():
    """A family written as JSON, by someone who did not write the layer, loads with no code change:
    its trades are pickable, its skip is applied, and the rules it names are the existing ones."""
    reg = registry(json.loads(FIXTURE.read_text(encoding="utf-8")))
    chosen = reg.select("mobile_services", "mobile_barber")
    assert chosen.key == "mobile_services/mobile_barber"
    assert [p.id for p in chosen.packs] == ["core", "mobile_services"]
    assert "website_location_missing" not in chosen.rule_ids
    assert set(chosen.rule_ids) == set(RULE_IDS) - {"website_location_missing"}
    assert reg.expand(reg.by_id["mobile_services"]) == ("hours_missing", "whatsapp_link_missing")
