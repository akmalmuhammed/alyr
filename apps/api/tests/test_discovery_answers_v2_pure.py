"""The Answers check, version 2, without a database (DECISIONS 6 and 7, research R4): the range
(Wilson, 95%) and the rule for naming a change, the cited sources and searches (kept as host,
title and passage, checked against the owner's confirmed numbers by rule), the sample engine's
made-up sources, the tools' names in the method line, and that nothing names a position."""

import asyncio
import re
from datetime import UTC, datetime

import pytest

from alyr.modules.discovery import answer_words as aw
from alyr.modules.discovery.answers import (
    engines,
    questions,
    reading,
    sources,
    stats,
)
from alyr.modules.discovery.answers.engines import AskContext, Source
from alyr.modules.discovery.answers.stats import Count

NOW = datetime(2026, 11, 26, 9, 0, tzinfo=UTC)
FORMS = reading.name_forms("Nuqta Car Care", "نقطة لعناية السيارات")
CONFIRMED = sources.phone_keys(["+97455550110", "+97455550112", "+97455550150"])


# ── the range and the change ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("named, counted, low, high", [
    # R4 section 2.3, computed there with the same formula.
    (0, 6, 0, 39), (1, 6, 3, 56), (2, 6, 10, 70), (4, 6, 30, 90), (6, 6, 61, 100),
    (8, 24, 18, 53), (12, 30, 25, 58), (30, 60, 38, 62), (60, 120, 41, 59), (0, 24, 0, 14),
    (24, 24, 86, 100),
])
def test_the_range_is_the_wilson_interval_of_the_research_table(named, counted, low, high):
    assert stats.range_view(named, counted) == {"low": low, "high": high}


def test_no_range_without_an_answer_and_nothing_impossible_is_accepted():
    assert stats.range_view(0, 0) is None
    for bad in ((1, 0), (-1, 5), (6, 5)):
        with pytest.raises(ValueError):
            stats.wilson(*bad)


def test_a_share_is_given_only_from_30_answers_and_rounds_half_up():
    assert stats.share(29, 29) is None and stats.share(0, 0) is None
    assert stats.share(15, 30) == 50 and stats.share(1, 40) == 3  # 2.5 rounds up
    assert stats.share(30, 30) == 100


def test_a_change_needs_30_answers_on_both_sides_and_ranges_that_do_not_overlap():
    assert stats.compare(None, Count(3, 3)) == stats.FIRST
    assert stats.compare(Count(0, 29), Count(30, 30)) == stats.NOT_ENOUGH  # a big jump, too few
    assert stats.compare(Count(0, 30), Count(29, 29)) == stats.NOT_ENOUGH
    assert stats.compare(Count(0, 30), Count(30, 30)) == stats.UP
    assert stats.compare(Count(30, 30), Count(0, 30)) == stats.DOWN
    assert stats.compare(Count(29, 30), Count(30, 30)) == stats.NO_CHANGE
    # 30% to 55% at 30 each: a 25-point move whose ranges still overlap is not a change.
    assert stats.compare(Count(9, 30), Count(17, 30)) == stats.NO_CHANGE


def test_every_change_has_its_reason_in_both_languages_with_the_numbers():
    en = aw.change_reason("not_enough", "en", previous=6, last=12)
    assert en == ("No change is named: that needs at least 30 answers in both check-ups, and "
                  "they counted 6 answers and then 12 answers.")
    ar = aw.change_reason("not_enough", "ar", previous=1, last=2)
    assert "إجابة واحدة" in ar and "إجابتان" in ar
    up = aw.change_reason("up", "en", p_range={"low": 0, "high": 11},
                          range_={"low": 89, "high": 100})
    assert "0 to 11% before, 89 to 100% now" in up and "do not overlap" in up


# ── sources and searches ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("url, host", [
    ("https://www.Example-Guide.example/a?b=c", "example-guide.example"),
    ("http://user:pass@forum.example:8080/x", "forum.example"),
    ("https://maps.example", "maps.example"),
    ("javascript:alert(1)", None), ("ftp://files.example/x", None), ("//cdn.example/x", None),
    ("https://", None), ("https://bad_host.example/", None), (None, None), (42, None),
])
def test_only_the_host_of_an_http_address_is_kept(url, host):
    assert sources.host_of(url) == host


def test_sources_are_cut_to_size_one_line_each_and_without_repeats():
    raw = [Source("https://a.example/1", "Title\nwith a break", "x" * 999),
           Source("https://a.example/2", "Title with a break", "again"),
           Source("javascript:x", "dropped"),
           *[Source(f"https://h{i}.example", "t") for i in range(20)]]
    kept = sources.clean(raw)
    assert len(kept) == sources.MAX_SOURCES
    assert kept[0] == {"host": "a.example", "title": "Title with a break", "snippet": "x" * 300}
    assert [k["host"] for k in kept].count("a.example") == 1
    assert sources.clean(None) == [] and sources.clean_searches(None) == []
    searches = sources.clean_searches(["a", "a", " b\n c ", "", *[f"s{i}" for i in range(9)]])
    assert searches == ["a", "b c", "s0", "s1", "s2"]


@pytest.mark.parametrize("snippet, check", [
    ("Nuqta Car Care, West Bay. Phone +974 5555 0110.", "matches"),
    ("Nuqta Car Care Al Wakra: call 5555 0112", "matches"),
    ("Nuqta Car Care, Al Wakra branch. Call +974 5555 0129.", "differs"),
    ("نقطة لعناية السيارات، الهاتف ٥٥٥٥٠١١٢", "matches"),
    ("Sahm Auto Spa, phone +974 5555 0129.", "not_read"),  # another business's number
    ("Nuqta Car Care has several branches.", "not_read"),  # no number to compare
    ("", "not_read"),
])
def test_a_cited_passage_is_checked_only_where_it_names_the_business_and_gives_a_number(
        snippet, check):
    assert sources.check(snippet, FORMS, CONFIRMED) == check


def test_nothing_is_checked_for_a_business_with_no_confirmed_number():
    assert sources.check("Nuqta Car Care, +974 5555 0110", FORMS, frozenset()) == "not_read"


def test_the_sources_of_a_check_up_are_counted_per_host():
    def answer(named, hosts, lang="en", engine="sample"):
        return {"status": "ok", "named": named, "engine": engine, "lang": lang,
                "sources": [{"host": h, "title": t, "check": c} for h, t, c in hosts]}

    rows = [
        answer(False, [("guide.example", "Guide", "not_read")]),
        answer(True, [("guide.example", "Guide", "not_read"), ("own.example", "Own", "differs"),
                      ("own.example", "Own 2", "matches")], lang="ar"),
        {"status": "error", "named": False, "engine": "sample", "lang": "en", "sources": []},
    ]
    table = sources.aggregate(rows)
    assert [(h["host"], h["answers"], h["answers_without_you"], h["check"]) for h in table] == [
        ("guide.example", 2, 1, "not_read"), ("own.example", 1, 0, "differs")]
    assert table[1]["checks"] == {"matches": 1, "differs": 1, "not_read": 0}
    assert table[1]["titles"] == ["Own", "Own 2"] and table[0]["langs"] == ["en", "ar"]


# ── the sample engine's sources ─────────────────────────────────────────────────────────


def ask(q, stage):
    return asyncio.run(engines.get("sample").ask(questions.request_of(q), AskContext(NOW, stage)))


def test_the_sample_cites_only_made_up_example_hosts_and_names_its_searches():
    for stage in range(4):
        for q in questions.build("car_care", "doha"):
            answer = ask(q, stage)
            assert answer.sources and answer.searches
            for s in answer.sources:
                assert sources.host_of(s.url).endswith(".example"), s.url
            assert answer.sources == ask(q, stage).sources  # deterministic
            text = " ".join(answer.searches)
            assert not re.search(r"\d|nuqta|نقطة", text, re.I)


def test_the_sample_sources_differ_then_match_as_the_sample_website_is_fixed():
    where = next(q for q in questions.build("car_care", "doha") if (q.key, q.lang) == (
        "where", "en"))
    checks = {}
    for stage in (0, 1):
        cited = sources.clean(ask(where, stage).sources)
        checks[stage] = {c["host"]: c["check"] for c in sources.checked(cited, FORMS, CONFIRMED)}
    assert checks[0] == {"doha-car-guide.example": "not_read",
                         "qatar-motoring-forum.example": "not_read",
                         "gulf-listings.example": "matches", "nuqta-carcare.example": "differs"}
    assert checks[1]["nuqta-carcare.example"] == "matches"


def test_an_answer_that_does_not_name_the_sample_does_not_cite_its_pages():
    for q in questions.build("car_care", "doha"):
        answer = ask(q, 0)
        hosts = {sources.host_of(s.url) for s in answer.sources}
        named = reading.read(answer.text, FORMS).named
        assert ("gulf-listings.example" in hosts) == named


# ── the tools' names ────────────────────────────────────────────────────────────────────


def test_a_live_tool_is_numbered_unless_naming_is_on_and_it_has_a_name(monkeypatch):
    numbers = engines.numbering(["sample", "fake", "other", "fake"])
    assert numbers == {"fake": 1, "other": 2}
    assert engines.label_of("fake", "en", 1) == "Answer tool 1"
    assert engines.label_of("other", "ar", 2) == "أداة الإجابة 2"
    assert engines.label_of("fake", "en", 1, named=True) == "Answer tool 1"  # no name known
    monkeypatch.setitem(engines.NAMES, "fake", ("Fake Tool", "أداة مزيفة"))
    assert engines.label_of("fake", "en", 1, named=True) == "Fake Tool"
    assert engines.label_of("fake", "en", 1, named=False) == "Answer tool 1"
    assert engines.label_of("sample", "en", None, named=True) == "Sample answers"
    assert engines.NAMES.keys() == {"fake"}  # nothing else is named in the code


def test_the_method_line_names_the_place_and_the_tools_in_both_languages():
    place = aw.place_of("Doha", "West Bay", "en")
    assert aw.method(["Answer tool 1", "Answer tool 2"], place, False, "en") == (
        "ALYR asked the same public questions through the developer interfaces of Answer tool 1 "
        "and Answer tool 2, as if the asker were in West Bay, Doha. Those interfaces can answer "
        "differently from the tools' own apps.")
    tools_ar = ["أداة الإجابة 1", "أداة الإجابة 2"]
    ar = aw.method(tools_ar, aw.place_of("الدوحة", "", "ar"), False, "ar")
    assert "أداة الإجابة 1 وأداة الإجابة 2" in ar and "في الدوحة." in ar
    assert aw.method([], "Doha", False, "en") == aw.METHOD_SAMPLE[0]
    assert aw.joined(["A", "B", "C"], "en") == "A, B and C"


def test_a_sample_variant_is_its_stage_and_a_live_tools_its_model():
    assert engines.variant_of(engines.get("sample"), 2) == "stage2"

    class Live:
        kind, live, model = "fake", True, "model-x"

    assert engines.variant_of(Live(), 2) == "model-x"
