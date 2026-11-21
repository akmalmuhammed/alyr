"""Discovery's words (spec 065): both languages for every rule, no empty string, no ellipsis, no AI
words, an Arabic sentence that agrees with its number, and every code the module can say."""

import asyncio
import re
from pathlib import Path

import pytest

from alyr.modules.discovery import rules, words
from alyr.modules.discovery.connectors import RunContext
from alyr.modules.discovery.connectors.sample import LAST_STAGE, SampleConnector
from discovery_support import NOW, location

SRC = Path(__file__).resolve().parents[1] / "src" / "alyr" / "modules" / "discovery"
ARABIC = re.compile("[؀-ۿ]")
# docs/honesty.md and the Agent's voice: nothing says or implies AI until a model is in the product.
BANNED = re.compile(
    r"\b(AI|smart|intelligen\w*|learns?|understands?|thinks?|predicts?|forecast\w*|knows?|"
    r"notices?|assistant|agentic|health score|top performer|business intelligence|reads?)\b",
    re.I)
FIELDS = ("title", "rule", "why", "what_happens", "what_is_needed")


def test_every_rule_has_every_field_in_both_languages_and_the_arabic_is_arabic():
    assert set(words.RULE_WORDS) == {r.id for r in rules.RULES}
    for rule_id, fields in words.RULE_WORDS.items():
        assert set(fields) == set(FIELDS), rule_id
        for name, (en, ar) in fields.items():
            assert en.strip() and ar.strip(), (rule_id, name)
            assert en != ar and not ARABIC.search(en), (rule_id, name)
            assert ARABIC.search(ar), (rule_id, name)


def test_a_missing_word_is_a_failure_not_a_blank_screen():
    for text in words.all_texts():
        assert isinstance(text, str) and text.strip(), repr(text)


def test_no_ellipsis_anywhere_in_either_language():
    for text in words.all_texts():
        assert "…" not in text and "..." not in text, text


def test_no_ai_words_in_anything_the_module_says():
    for text in words.all_texts():
        assert not BANNED.search(text), (BANNED.search(text).group(0), text)


def test_nothing_the_module_says_claims_it_changed_something_outside_alyr():
    for rule_id, fields in words.RULE_WORDS.items():
        en = fields["what_happens"][0].lower()
        assert en.startswith(("nothing", "no")), rule_id
        for claim in ("will be fixed", "we fixed", "we changed", "approve", "applied"):
            assert claim not in en, (rule_id, claim)


def test_every_piece_of_evidence_the_rules_can_produce_has_words():
    """Run the sample through its four stages and word every line of evidence in both languages."""
    locations = [location(area=a) for a in ("West Bay", "Al Wakra", "Lusail", "Al Sadd",
                                            "Industrial Area")]
    seen = set()
    for stage in range(LAST_STAGE + 1):
        ctx = RunContext(now=NOW, prior_done_runs=stage)
        snapshot = asyncio.run(SampleConnector().snapshot(locations, ctx))
        for outcome in rules.evaluate(rules.Context(snapshot, locations, {}, NOW)):
            for e in outcome.evidence:
                seen.add(e.label)
                assert e.label in words.LABELS and e.where in words.WHERE, (outcome.rule_id, e)
                item = {"label": e.label, "value": e.value, "where": e.where,
                        "seen_at": NOW.isoformat(), "source": "sample"}
                for lang in ("en", "ar"):
                    view = words.evidence_view(item, lang)
                    assert all(view[k] for k in ("label", "value", "where")), (e, lang)
                    assert "~" not in view["value"], (e, lang)
    assert {"listing_status", "claimed", "listing_hours", "website_hours", "hours_differ",
            "listing_phone", "website_phone", "listing_name", "categories", "photos",
            "website_location", "website_whatsapp", "expected_whatsapp", "unanswered_reviews",
            "oldest_unanswered", "rating", "review_count"} <= seen


def test_evidence_says_where_it_came_from_and_that_the_sample_is_a_sample():
    item = {"label": "photos", "value": "3", "where": "listing", "seen_at": "2026-11-07T12:00:00Z",
            "source": "sample"}
    assert words.evidence_view(item, "en")["where"] == "Google listing (sample data)"
    assert words.evidence_view(item, "ar")["where"] == "صفحة Google (بيانات تجريبية)"
    assert words.evidence_view({**item, "source": "google"}, "en")["where"] == "Google listing"


def test_days_are_worded_in_the_readers_language():
    assert words.value_text("~days:sat,sun", "en") == "Sat, Sun"
    assert words.value_text("~days:sat,sun", "ar") == "سبت، أحد"


def test_every_code_the_module_can_raise_has_an_english_and_an_arabic_sentence():
    codes = set()
    for path in SRC.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        codes |= set(re.findall(r'(?:DiscoveryError|RunFailed)\(\s*"([a-z_]+)"', text))
        codes |= set(re.findall(r'ERRORS\["([a-z_]+)"\]', text))
    codes |= {"module_off", "forbidden"}
    assert codes, "found no codes at all: the scan is broken"
    for code in codes:
        assert code in words.ERRORS, code
        en, ar = words.ERRORS[code]
        assert en.strip() and ARABIC.search(ar), code


@pytest.mark.parametrize("n,expected", [
    (1, "مشكلة واحدة تم إصلاحها"),
    (2, "مشكلتان تم إصلاحهما"),
    (3, "3 مشكلات تم إصلاحها"),
    (10, "10 مشكلات تم إصلاحها"),
    (11, "11 مشكلة تم إصلاحها"),
])
def test_the_arabic_headline_agrees_with_how_many_were_fixed(n, expected):
    text = words.report_headline("2026-11", 40, 60, 3, n, 0, "ar")
    assert expected in text and text.endswith("ولا شيء مفتوح.")


@pytest.mark.parametrize("n,expected", [
    (1, "ومشكلة واحدة لا تزال مفتوحة"),
    (2, "ومشكلتان لا تزالان مفتوحتين"),
    (5, "و5 مشكلات لا تزال مفتوحة"),
])
def test_the_arabic_headline_agrees_with_how_many_are_still_open(n, expected):
    assert expected in words.report_headline("2026-11", 40, 60, 3, 4, n, "ar")


def test_the_report_headline_in_english_for_each_case():
    head = words.report_headline
    assert head("2026-11", 54, 71, 3, 6, 4, "en") == (
        "Score up from 54 to 71 in Nov 2026. 6 problems fixed, 4 problems still open.")
    assert head("2026-11", 71, 54, 2, 1, 1, "en") == (
        "Score down from 71 to 54 in Nov 2026. 1 problem fixed, 1 problem still open.")
    assert head("2026-11", 60, 60, 1, 0, 8, "en") == (
        "Score 60 in Nov 2026. Nothing fixed yet, 8 problems still open.")
    assert head("2026-11", None, None, 2, 0, 0, "en") == (
        "Nothing could be measured in Nov 2026. Nothing fixed yet, nothing left open.")
    assert head("2026-11", None, None, 0, 0, 0, "en") == "No check-up was run in Nov 2026."
    for case in (head("2026-11", 54, 71, 3, 6, 4, "ar"), head("2026-11", None, None, 0, 0, 0, "ar"),
                 head("2026-11", 60, 60, 1, 0, 0, "ar")):
        assert ARABIC.search(case) and "…" not in case


def test_the_overview_sentence_counts_by_rule_in_both_languages():
    assert words.overview_headline(0, 0, False, "en") == "No check-up has run yet."
    assert words.overview_headline(0, 0, True, "en") == "Nothing is open on your list."
    assert words.overview_headline(3, 0, True, "en") == "3 things to do on your list."
    assert words.overview_headline(1, 1, True, "en") == (
        "1 thing to do on your list, 1 of them high priority.")
    assert words.overview_headline(2, 2, True, "ar") == (
        "أمران في قائمتك، منها أمران عاليا الأولوية.")
    assert words.overview_headline(5, 1, True, "ar") == (
        "5 أمور في قائمتك، منها أمر واحد عالي الأولوية.")
