"""A sentence per check (Discovery 2.0, agent C3; api-gaps U2-3): what was looked at and what it
showed, in English and Arabic, for every check and every state; a difference quotes its evidence;
a part not measured says "Not measured"; nothing raw, empty, ellipsed or in the voice of AI. The
API puts them on each row of `GET /checks`."""

import re

import pytest

from alyr.modules.discovery import check_sentences as cs
from alyr.modules.discovery import engine, firstparty, rules
from alyr.modules.discovery import words_firstparty as fpw
from discovery_support import discovery_shop, listing, location, one, run_check_up, turn_on_sample
from discovery_support import website as site
from test_discovery_firstparty import every_outcome
from test_discovery_words import BANNED

ARABIC = re.compile("[؀-ۿ]")
STATES = ("pass", "fail", "not_measured")
RAW = ("~", "fp_", "alyr_", "{", "}")


def evidence(outcome: rules.Outcome) -> list[dict]:
    """Evidence as the engine stores it on a finding."""
    return [{"label": e.label, "value": e.value, "where": e.where,
             "seen_at": "2026-11-26T06:00:00+00:00", "source": "sample"}
            for e in outcome.evidence]


def clean(text: str, lang: str) -> None:
    assert text and text.strip() == text, repr(text)
    assert "…" not in text and "..." not in text, text
    assert not BANNED.search(text), (BANNED.search(text).group(0), text)
    assert not any(part in text for part in RAW), text
    if lang == "ar":  # an English sentence may quote an Arabic name, never the other way round
        assert ARABIC.search(text), text


@pytest.mark.parametrize("lang", ["en", "ar"])
@pytest.mark.parametrize("state", STATES)
def test_every_check_has_a_sentence_for_every_state(state, lang):
    for rule in engine.ALL_RULES:
        text = cs.sentence(rule.id, state, [], lang)
        clean(text, lang)
        if state == "not_measured":
            assert text.endswith("Not measured." if lang == "en" else "لم يُقَس."), text


def test_a_rule_or_a_state_it_does_not_know_has_no_sentence():
    assert cs.sentence("no_such_rule", "pass", [], "en") is None
    assert cs.sentence("hours_conflict", "maybe", [], "en") is None
    assert cs.sentences("hours_conflict", "maybe", []) is None


def test_every_template_is_clean_in_both_languages():
    for text in cs.all_texts() + fpw.all_texts():
        assert text.strip(), repr(text)
        assert "…" not in text and "..." not in text, text
        assert not BANNED.search(text), (BANNED.search(text).group(0), text)


def test_the_hours_difference_names_the_days():
    one_day = [{"label": "hours_differ", "value": "~days:fri", "where": "website"}]
    two_days = [{"label": "hours_differ", "value": "~days:fri,sat", "where": "website"}]
    assert cs.sentence("hours_conflict", "fail", one_day, "en") == (
        "Your Google opening hours do not match the hours on your website: Fri differs.")
    assert cs.sentence("hours_conflict", "fail", two_days, "en").endswith(": Fri, Sat differ.")
    assert "جمعة، سبت" in cs.sentence("hours_conflict", "fail", two_days, "ar")
    assert cs.sentence("hours_conflict", "pass", [], "en") == (
        "Your Google opening hours match the hours on your website.")


def test_a_difference_with_nothing_to_quote_says_the_rule_plainly():
    removed = [{"label": "listing_phone", "value": "~removed", "where": "listing"},
               {"label": "website_phone", "value": "+974 4444 0000", "where": "website"}]
    for given in ([], None, removed, [{"label": "photos", "value": "many"}], [{"odd": 1}]):
        for lang in ("en", "ar"):
            for rule_id in ("phone_conflict", "photos_few", "hours_vs_activity", "season_due"):
                text = cs.sentence(rule_id, "fail", given, lang)
                clean(text, lang)


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_core_differences_quote_their_evidence(lang):
    loc = location()
    cases = {
        "phone_conflict": one("phone_conflict", loc, lst=listing(phone="+974 4444 1111"),
                              web=site(phone="+974 4444 2222")),
        "photos_few": one("photos_few", loc, lst=listing(photo_count=2)),
        "rating_low": one("rating_low", loc, lst=listing(rating=3.2, review_count=40)),
    }
    for rule_id, outcome in cases.items():
        assert outcome.state == "fail", rule_id
        text = cs.sentence(rule_id, "fail", evidence(outcome), lang)
        clean(text, lang)
        assert text != cs.DIFFERS[rule_id][1 if lang == "ar" else 0], rule_id
    assert "4444 1111" in cs.sentence("phone_conflict", "fail", evidence(cases["phone_conflict"]),
                                      lang)
    photos = cs.sentence("photos_few", "fail", evidence(cases["photos_few"]), lang)
    assert ("2 photos" if lang == "en" else "صورتان") in photos


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_first_party_differences_quote_their_evidence(lang):
    quoted = set()
    for outcome in every_outcome():
        if outcome.state != "fail":
            continue
        text = cs.sentence(outcome.rule_id, "fail", evidence(outcome), lang)
        clean(text, lang)
        if text != fpw.DIFFERS[outcome.rule_id][1 if lang == "ar" else 0]:
            quoted.add(outcome.rule_id)
    assert quoted == set(firstparty.RULE_BY_ID)


def test_the_friday_case_reads_as_a_sentence():
    outcome = next(o for o in every_outcome()
                   if o.rule_id == "hours_vs_activity" and o.state == "fail")
    text = cs.sentence("hours_vs_activity", "fail", evidence(outcome), "en")
    assert text.startswith("Your Google listing shows Fri: closed, while ALYR has orders or "
                           "bookings outside those hours on ")
    assert "of the last 4 Fridays." in text


# ── on GET /checks ────────────────────────────────────────────────────────────────────────


@pytest.fixture
def shop(client_factory, monkeypatch):
    s = discovery_shop(client_factory, monkeypatch, roles=("owner", "agent"))
    turn_on_sample(s)
    return s


def test_every_row_of_checks_has_a_sentence_per_check_in_both_languages(shop):
    run_check_up(shop.owner)
    for client in (shop.owner, shop.agent):
        answer = client.get("/api/discovery/checks", params={"lang": "en"})
        assert answer.status_code == 200, answer.text
        body = answer.json()
        rows = body["places"] + ([body["business"]] if body["business"] else [])
        assert rows
        states = set()
        for row in rows:
            assert set(row["sentences"]) == set(row["checks"]), row.get("id")
            for rule_id, said in row["sentences"].items():
                clean(said["sentence_en"], "en")
                clean(said["sentence_ar"], "ar")
                states.add(row["checks"][rule_id])
        assert "fail" in states and "pass" in states


def test_before_a_check_up_there_is_nothing_to_say(shop):
    body = shop.owner.get("/api/discovery/checks").json()
    assert body["places"] == [] and body["business"] is None
