"""The registry of what the Catalog can do (ALY-148, D-039 "As built (feature engine)").

Pure: no database. The registry is data that every screen, file and message reads, so what it
says is checked here once: every shipped feature has its words in both languages, its
dependencies come first, the extension points are hidden and mute, and an owner never meets
the word "capability".
"""

import re

import pytest

from alyr import capabilities, shop_templates
from alyr.presets import PRESETS

ARABIC = re.compile(r"[؀-ۿ]")
# Words that promise what is not built, or that an owner should never read.
BANNED = ("coming", "soon", "beta", "early access", "under development", "preview",
          "قريباً", "قريبا", "capability", "capabilities", "قدرة")


def words(cap: capabilities.Capability) -> list[str]:
    return [cap.name.en, cap.name.ar, cap.hint.en, cap.hint.ar, cap.changes.en, cap.changes.ar]


def test_every_feature_key_is_used_once():
    keys = [c.key for c in capabilities.CAPABILITIES]
    assert len(keys) == len(set(keys))


def test_the_core_is_always_on_and_never_switched():
    core = {c.key for c in capabilities.CORE}
    assert core == {"names", "photos", "price", "stock_log", "categories", "sku", "import_export"}
    for cap in capabilities.CORE:
        assert cap.core and cap.built and not cap.switchable
        assert cap.name.en and ARABIC.search(cap.name.ar)


def test_every_switchable_feature_has_plain_words_in_both_languages():
    assert len(capabilities.SWITCHABLE) >= 17
    for cap in capabilities.SHOWN:
        for text in words(cap):
            assert text.strip(), cap.key
        assert ARABIC.search(cap.name.ar) and ARABIC.search(cap.hint.ar), cap.key
        assert ARABIC.search(cap.changes.ar), cap.key
        assert not ARABIC.search(cap.name.en + cap.hint.en + cap.changes.en), cap.key
        assert cap.group in capabilities.GROUP_KEYS and cap.affects, cap.key


def test_an_owner_never_reads_jargon_or_a_promise():
    for cap in (*capabilities.CORE, *capabilities.SHOWN):
        for text in words(cap):
            low = text.lower()
            for banned in BANNED:
                assert banned not in low, (cap.key, banned)
    for group in capabilities.GROUPS:
        for text in (group.name.en, group.name.ar, group.hint.en, group.hint.ar):
            assert not any(b in text.lower() for b in BANNED), group.key


# The three features of the pricing pack, as they are built (ALY-150).
PRICING_PACK = ("discounts", "delivery_fees", "cost_margin")


def test_dependencies_come_before_the_feature_that_needs_them():
    seen: set[str] = set()
    for cap in capabilities.SWITCHABLE:
        assert set(cap.depends_on) <= seen, cap.key
        seen.add(cap.key)
    assert capabilities.BY_KEY["pickup_date"].depends_on == ("schedule",)


def test_the_switchable_features_the_brief_asks_for_are_there():
    wanted = {
        "rule_switch", "rule_count", "rule_daily_limit", "schedule", "pickup_date", "variants",
        "options", "price_groups", "pack_rules", "quick_quantity", "same_as_last", "show_sku",
        "low_stock_alerts", "sold_out_alerts", "sold_out_display", "table_qr", "tags",
        "share_links", "custom_fields",
    }
    assert wanted <= {c.key for c in capabilities.SHOWN}


def test_the_extension_points_are_named_and_hidden():
    later = {c.key for c in capabilities.EXTENSION_POINTS}
    assert later == {
        "decimal_quantity", "bundles", "suppliers",
        "barcode", "batch_expiry", "serial_imei",
    }
    for cap in capabilities.EXTENSION_POINTS:
        assert not cap.built and not cap.switchable and cap.key not in capabilities.SHOWN_KEYS
        # Mute: nothing to say about what is not built, in either language.
        assert not any(words(cap)), cap.key
    # No template can carry one, and no template lists one.
    for template in shop_templates.BUILTIN.values():
        assert not (later & set(template.features))


def test_a_template_covers_exactly_the_features_a_shop_can_have():
    for template in shop_templates.BUILTIN.values():
        assert set(template.features) == set(capabilities.STORED), template.key


def test_there_is_a_built_in_template_for_every_business_type_that_has_a_catalog():
    having = {p.key for p in PRESETS if p.catalog is not None}
    assert having <= set(shop_templates.BUILTIN)
    assert len(having) == 10
    # Travel has none of its own: it gets the plain Catalog.
    assert shop_templates.builtin_for("travel").key == shop_templates.GENERIC_KEY
    assert shop_templates.builtin_for("").key == shop_templates.GENERIC_KEY
    assert shop_templates.builtin_for(None).key == shop_templates.GENERIC_KEY


def test_the_built_in_templates_turn_on_everything_a_shop_always_had():
    """Every part of the form and the order page's four extras were always there, so every
    built-in type starts with them on (spec 012, "identical behaviour")."""
    always = [c.key for c in capabilities.SWITCHABLE
              if c.key not in ("low_stock_alerts", "sold_out_alerts", *PRICING_PACK)]
    for template in shop_templates.BUILTIN.values():
        for key in always:
            assert template.on(key), (template.key, key)


def test_the_pricing_pack_is_off_in_every_built_in_template():
    """The pricing pack (ALY-150) is something the founder switches on for a client: no built-in
    type starts with any of it, so no existing shop behaves differently."""
    for template in shop_templates.BUILTIN.values():
        for key in PRICING_PACK:
            if key in capabilities.BY_KEY and capabilities.BY_KEY[key].built:
                assert not template.on(key), (template.key, key)


@pytest.mark.parametrize("kind", [p.key for p in PRESETS if p.catalog is not None])
def test_a_types_alerts_and_sold_out_look_come_from_its_setup(kind):
    setup = next(p.catalog for p in PRESETS if p.key == kind)
    template = shop_templates.BUILTIN[kind]
    assert template.on("low_stock_alerts") is ("low_stock" in setup.alerts)
    assert template.on("sold_out_alerts") is ("sold_out" in setup.alerts)
    assert template.config("sold_out_display") == {"mode": setup.sold_out}


def test_the_choice_feature_is_always_on_and_has_a_value():
    cap = capabilities.BY_KEY["sold_out_display"]
    assert cap.always_on and not cap.switchable
    assert cap.choices == {"mode": ("grey", "hide")} and cap.config == {"mode": "grey"}
