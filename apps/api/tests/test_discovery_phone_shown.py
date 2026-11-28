"""Phone numbers on Discovery's screens are written as people write them (Discovery 2.0, agent P4):
every number a check sentence, an evidence chip or a change quotes goes through
`proposal_words.format_number` ("+974 5555 0999"), held together by no-break spaces inside a
sentence and isolated in Arabic so it reads left to right. A raw run such as "+97455550999" in a
sentence or a chip fails here."""

import json
import re

import pytest

from alyr.modules.discovery import check_sentences as cs
from alyr.modules.discovery import proposal_words as pw
from alyr.modules.discovery import words
from alyr.modules.discovery import words_firstparty as fpw
from discovery_support import discovery_shop, findings, run_check_up, turn_on_sample

NB = "\u00a0"
ISOLATE = ("\u2068", "\u2069")
# A Qatar number as stored: "+97455550999", "97455550999" or eight digits in one run (a link's
# own path, "wa.me/97455550999", is the link as it is shown, not a number written out).
RAW = re.compile(r"\+974\d{8}|(?<![\d/+])974\d{8}|(?<![\d/])\d{8}(?!\d)")


def no_raw(text: str) -> None:
    assert not RAW.search(text), (RAW.search(text).group(0), text)


def test_the_helper_writes_a_qatar_number_however_it_was_stored():
    for stored in ("+97455550999", "0097455550999", "974 5555 0999", "5555 0999", "٥٥٥٥٠٩٩٩"):
        assert pw.format_number(stored) == "+974 5555 0999", stored
    assert pw.format_number("+97455550999", NB) == f"+974{NB}5555{NB}0999"
    # Not a Qatar number, or not a number: as given, never guessed at.
    assert pw.format_number("+971501234567") == "+971501234567"
    assert pw.format_number("call us") == "call us"


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_check_sentences_never_quote_a_raw_number(lang):
    link = [{"label": "website_whatsapp", "value": "https://wa.me/97455550999", "where": "website"}]
    phones = [{"label": "listing_phone", "value": "55550112", "where": "listing"},
              {"label": "website_phone", "value": "+97455550129", "where": "website"}]
    mismatch = [{"label": "fp_confirmed_whatsapp", "value": "+97455550150", "where": "alyr"},
                {"label": "listing_whatsapp", "value": "wa.me/97455550999", "where": "listing"}]
    for rule_id, evidence, shown in (
        ("whatsapp_link_missing", link, ["5555{nb}0999"]),
        ("phone_conflict", phones, ["5555{nb}0112", "5555{nb}0129"]),
        ("whatsapp_number_mismatch", mismatch, ["5555{nb}0999", "5555{nb}0150"]),
    ):
        text = cs.sentence(rule_id, "fail", evidence, lang)
        no_raw(text)
        for part in shown:
            number = "+974" + NB + part.format(nb=NB)
            assert number in text, (number, text)
            if lang == "ar":  # left to right inside the Arabic sentence
                assert f"{ISOLATE[0]}{number}{ISOLATE[1]}" in text, text


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_phone_evidence_and_changes_are_written_as_people_write_them(lang):
    for label in sorted(words.PHONE_LABELS | fpw.PHONE_LABELS):
        item = {"label": label, "value": "+97455550112", "where": "listing",
                "seen_at": "2026-11-26T06:00:00+00:00", "source": "sample"}
        assert words.evidence_view(item, lang)["value"] == "+974 5555 0112"
    change = {"field": "phone", "before": {"phone": "+97455550129"}, "after": {"phone": "55550112"}}
    said = pw.change_lines(change, lang)
    assert said["before"]["text"] == "+974 5555 0129"
    assert said["after"]["text"] == "+974 5555 0112"
    assert fpw.phone_shown("+97455550150", lang).strip(
        "".join(ISOLATE)) == f"+974{NB}5555{NB}0150"


@pytest.fixture
def shop(client_factory, monkeypatch):
    s = discovery_shop(client_factory, monkeypatch, roles=("owner",))
    turn_on_sample(s)
    return s


def test_no_screen_answer_carries_a_raw_number_after_a_check_up(shop):
    """The sample's website opens wa.me/97455550999: once a sentence and a chip showed it raw."""
    run_check_up(shop.owner)
    for lang in ("en", "ar"):
        checks = shop.owner.get("/api/discovery/checks", params={"lang": lang})
        assert checks.status_code == 200, checks.text
        said = [s for row in checks.json()["places"] + [checks.json()["business"] or {}]
                for pair in (row.get("sentences") or {}).values() for s in pair.values()]
        assert any("5555" in s for s in said)
        for text in said:
            no_raw(text)
        for finding in findings(shop.owner, lang=lang):
            no_raw(finding["title"])
            for ev in finding.get("evidence", []):
                no_raw(ev["value"])
                no_raw(ev.get("sentence") or "")
        proposals = shop.owner.get("/api/discovery/proposals", params={"lang": lang})
        if proposals.status_code == 200:
            for p in proposals.json().get("items", proposals.json().get("proposals", [])):
                no_raw(json.dumps({k: p.get(k) for k in ("before", "after", "title")},
                                  ensure_ascii=False))
