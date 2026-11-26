"""Arabic-safe matching for Discovery's rules (Discovery 2.0, workstream A).

The cases are the ones the research ran against the old helpers and saw fail (R3, headline 1):
Arabic-Indic digits, a UAE number in two formats, the Arabic legal suffix, hamza on alef, and an
Arabic name beside its English twin. Pure functions: no database.
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from alyr.modules.discovery import normalize, rules
from alyr.modules.discovery.connectors.base import (
    Listing,
    Location,
    PlaceSnapshot,
    Snapshot,
    Website,
    same,
)

NOW = datetime(2026, 11, 26, 9, 0, tzinfo=UTC)


# ── digits and phone numbers ──────────────────────────────────────────────────────────────


def test_arabic_indic_and_extended_digits_become_western_digits():
    assert normalize.ascii_digits("٠١٢٣٤٥٦٧٨٩") == "0123456789"
    assert normalize.ascii_digits("۰۱۲۳۴۵۶۷۸۹") == "0123456789"  # Persian / Urdu forms
    assert normalize.ascii_digits("هاتف ٥٥٥٥ 0101") == "هاتف 5555 0101"


@pytest.mark.parametrize(
    "a, b",
    [
        ("٥٥٥٥٠١٠١", "+974 5555 0101"),
        ("+٩٧٤ ٥٥٥٥ ٠١٠١", "+974 5555 0101"),
        ("00974 5555 0101", "5555-0101"),
        ("(+974) 55550101", "٠٠٩٧٤٥٥٥٥٠١٠١"),
    ],
)
def test_one_qatar_number_in_any_writing_is_one_number(a, b):
    assert rules.digits(a) == rules.digits(b) != ""
    assert normalize.same_phone(a, b) is True


@pytest.mark.parametrize(
    "a, b",
    [
        ("+971 50 123 4567", "00971501234567"),
        ("+971501234567", "+٩٧١ ٥٠ ١٢٣ ٤٥٦٧"),
        # A UAE number written the UAE way at home is read in the region of the other side.
        ("050 123 4567", "+971 50 123 4567"),
        ("+968 9123 4567", "0096891234567"),  # Oman
    ],
)
def test_a_gcc_number_in_any_format_is_one_number(a, b):
    assert normalize.same_phone(a, b) is True


def test_different_numbers_differ_and_a_non_number_is_not_measured():
    assert normalize.same_phone("+974 5555 0101", "+974 5555 0102") is False
    assert normalize.same_phone("+974 5555 0101", "+971 5555 0101") is False
    assert normalize.same_phone("+974 5555 0101", "call us") is None
    assert normalize.same_phone("", "+974 5555 0101") is None
    assert rules.digits("call us") == ""
    assert rules.digits(None) == ""


def test_a_whatsapp_link_is_read_as_the_international_number_it_is():
    assert rules.whatsapp_digits("https://wa.me/97455550101") == rules.digits("+974 5555 0101")
    assert rules.whatsapp_digits("https://api.whatsapp.com/send?phone=97455550101&text=hi") == (
        rules.digits("٥٥٥٥٠١٠١")
    )
    assert rules.whatsapp_digits("https://example.com") == ""


def test_the_phone_conflict_rule_does_not_fire_on_arabic_digits():
    loc = Location(uuid4(), "Point Car Care")
    place = PlaceSnapshot(
        loc.id,
        Listing(found=True, phone="٥٥٥٥٠١٠١"),
        Website("https://example.qa", reachable=True, phone="+974 5555 0101"),
    )
    ctx = rules.Context(Snapshot("sample", NOW, [place]), [loc], now=NOW)
    [outcome] = rules.RULE_BY_ID["phone_conflict"].check(ctx)
    assert outcome.state == rules.PASS


def test_a_proposal_before_value_in_arabic_digits_is_the_same_phone():
    assert same("phone", {"phone": "٥٥٥٥٠١٠١"}, {"phone": "+974 5555 0101"})


# ── names ─────────────────────────────────────────────────────────────────────────────────


def test_arabic_names_fold_marks_alef_forms_and_the_legal_suffix():
    assert rules.name_key("نقطة للعناية بالسيارات ذ.م.م") == rules.name_key(
        "نقطه للعنايه بالسيارات"
    )
    assert rules.name_key("مخبز النور ش.ذ.م.م") == rules.name_key("مخبز النور")
    assert rules.name_key("إيمان") == rules.name_key("ايمان") == rules.name_key("آيمان")
    assert rules.name_key("مُخْبَز النّور") == rules.name_key("مخبز النور")  # tashkeel
    assert rules.name_key("مخبـــز النور") == rules.name_key("مخبز النور")  # tatweel
    assert rules.name_key("مستشفى") == rules.name_key("مستشفي")  # alef maqsura
    assert rules.name_key("مخبز أل نور") == rules.name_key("مخبز النور")  # «ال» apart


def test_latin_names_fold_the_article_and_the_legal_suffix():
    for other in ("Al Noor Bakery", "El-Noor Bakery", "AL NOOR BAKERY W.L.L.", "Al Noor Bakery LLC",
                  "Al-Noor Bakery Co."):
        assert rules.name_key(other) == rules.name_key("Al-Noor Bakery"), other


def test_the_article_is_not_taken_for_an_area_word():
    """"Al" in the area "Al Sadd" is not a word of the area to drop from the name."""
    assert rules.name_key("Al Noor Bakery", "Al Sadd") == rules.name_key("Al Noor Bakery", "Lusail")


@pytest.mark.parametrize(
    "a, b",
    [
        ("Al-Noor", "Al Nour"),
        ("Al-Noor Bakery", "Al Nour Bakery"),
        ("Mohammed Trading", "Muhammad Trading"),
        ("Al Rayyan Sweets", "Al Rayan Sweets"),
        ("نقطة للعناية بالسيارات ذ.م.م", "نقطه للعنايه بالسيارات"),
    ],
)
def test_spellings_of_one_name_are_one_name(a, b):
    assert normalize.same_name(a, b) is True


@pytest.mark.parametrize(
    "a, b",
    [
        ("Point Car Care", "Point Car Wash"),
        ("Cafe A", "Cafe B"),
        ("Al Noor", "Al Nasr"),
        ("Ali", "Alia"),
        ("مخبز النور", "مخبز النصر"),
    ],
)
def test_different_names_are_different(a, b):
    assert normalize.same_name(a, b) is False


def test_an_arabic_name_and_its_english_twin_are_not_compared():
    assert normalize.script_of("نقطة للعناية بالسيارات") == "ar"
    assert normalize.script_of("Point Car Care") == "latin"
    assert normalize.same_name("نقطة للعناية بالسيارات", "Point Car Care") is None
    assert normalize.same_name("", "Point Car Care") is None


def _named(*names: str, area: str = "") -> rules.Context:
    locations = [Location(uuid4(), f"Place {i}", area=area) for i in range(len(names))]
    places = [
        PlaceSnapshot(loc.id, Listing(found=True, name=name))
        for loc, name in zip(locations, names, strict=True)
    ]
    return rules.Context(Snapshot("sample", NOW, places), locations, now=NOW)


def _name_rule(ctx: rules.Context) -> rules.Outcome:
    [outcome] = rules.RULE_BY_ID["name_conflict"].check(ctx)
    return outcome


def test_name_conflict_passes_spellings_of_one_name():
    assert _name_rule(_named("Al-Noor Bakery", "Al Nour Bakery")).state == rules.PASS
    assert _name_rule(
        _named("نقطة للعناية بالسيارات ذ.م.م", "نقطه للعنايه بالسيارات")
    ).state == rules.PASS


def test_name_conflict_never_fires_on_an_arabic_name_beside_its_english_twin():
    outcome = _name_rule(_named("نقطة للعناية بالسيارات", "Point Car Care"))
    assert outcome.state == rules.NOT_MEASURED


def test_name_conflict_with_both_scripts_fires_only_inside_one_script():
    """A real difference between two English spellings is still found when an Arabic listing is
    there too; the Arabic one is not on the evidence, because nothing compared it."""
    outcome = _name_rule(_named("Point Car Care", "Point Car Wash", "نقطة للعناية بالسيارات"))
    assert outcome.state == rules.FAIL
    shown = " ".join(e.value for e in outcome.evidence)
    assert "Point Car Care" in shown and "Point Car Wash" in shown and "نقطة" not in shown


def test_name_conflict_with_both_scripts_and_no_difference_is_not_measured():
    """Two English listings that agree and one Arabic: not every listing was compared, so the
    whole-business check does not say "match"."""
    outcome = _name_rule(_named("Point Car Care", "Point Car Care", "نقطة للعناية بالسيارات"))
    assert outcome.state == rules.NOT_MEASURED


def test_the_fuzzy_threshold_is_written_down():
    assert normalize.SAME_NAME_AT == 90
    assert normalize.SAME_SOUND_AT == 75
