"""Discovery Phase 2, the words (spec 066, D-166): every proposal type, field label, failure code,
error code and message exists in both languages and is non-empty; no ellipsis, no AI word, no first
person in ALYR's own words; the review replies are fixed texts of at most 240 characters; digits are
Western; and the ask's lines are the workspace's lines."""

import inspect
import re

import pytest

from alyr.modules.agent import insights
from alyr.modules.discovery import proposal_words as pw
from alyr.modules.discovery import rules, words
from alyr.modules.discovery.connectors.base import WEEK

BANNED = re.compile(
    r"\b(AI|smart|intelligen\w*|learns?|understands?|thinks?|predicts?|forecast\w*|knows?|notices?"
    r"|assistant|agentic|health score|top performer|business intelligence|reads?|magic"
    r"|automatically|optimi[sz]e\w*)\b", re.IGNORECASE)
FIRST_PERSON = re.compile(r"\b(I|I'm|I'll|me|my|we|we'll|us|our|ours)\b")
ARABIC_FIRST_PERSON = re.compile(r"(نحن|أنا|لدينا|عندنا)")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
ARABIC_INDIC = re.compile("[٠-٩۰-۹]")
SPEC_ERRORS = ("forbidden", "not_found", "proposal_closed", "proposal_decided", "proposal_changed",
               "proposal_not_applied", "undo_window_over", "undo_not_possible", "retry_limit",
               "needs_fact", "bad_hours", "bad_phone", "bad_fact", "nothing_to_propose",
               "connector_cannot_write", "bad_manager", "bad_setting", "proposal_in_flight")
FAILURE_CODES = ("stale_before", "connector_off", "connector_unavailable", "not_permitted",
                 "refused", "apply_gave_up")


def test_every_string_exists_is_not_empty_and_has_no_ellipsis():
    texts = pw.all_texts() + pw.reply_texts()
    assert len(texts) > 150
    for text in texts:
        if text == "":  # a failure with nothing to say next
            continue
        assert text.strip(), text
        assert "…" not in text and "..." not in text, text


def test_no_ai_word_no_first_person_no_emoji_in_alyrs_own_words():
    for text in pw.all_texts():
        assert not BANNED.search(text), (BANNED.search(text).group(0), text)
        assert not FIRST_PERSON.search(text), (FIRST_PERSON.search(text).group(0), text)
        assert not ARABIC_FIRST_PERSON.search(text), text
        assert not EMOJI.search(text), text
    for text in pw.reply_texts():  # the shop's own voice: no AI word and no emoji either
        assert not BANNED.search(text) and not EMOJI.search(text), text


def test_every_failure_code_has_words_in_both_languages_for_both_targets():
    assert set(pw.FAILURES) == set(FAILURE_CODES)
    for code in FAILURE_CODES:
        for target in ("listing", "website"):
            for lang, said in (("en", "Nothing was changed."), ("ar", "لم يتغير شيء.")):
                full = pw.failure(code, target, lang)
                assert said in full and "{" not in full, (code, target, lang)
                assert pw.failure(code, target, lang, short=True) in full
    assert pw.failure("stale_before", "listing", "en") == (
        "The listing changed since this was proposed. Nothing was changed. "
        "The next check-up proposes it again.")
    assert pw.failure(None, "listing", "en").startswith("The source refused")  # a safe default


def test_every_error_of_the_spec_has_words_in_both_languages():
    for code in SPEC_ERRORS:
        en, ar = words.ERRORS[code]
        assert en.strip() and ar.strip(), code
        assert re.search(r"[؀-ۿ]", ar), code
        assert not BANNED.search(en) and "…" not in en + ar, code


@pytest.mark.parametrize("rating", [1, 2, 3])
@pytest.mark.parametrize("language", ["en", "ar", "fr", ""])
@pytest.mark.parametrize("number", ["+97455550150", None, "+9715550000"])
def test_a_review_reply_is_a_fixed_text_of_at_most_240_characters(rating, language, number):
    text, name = pw.reply_text(rating, language, number)
    assert 0 < len(text) <= pw.MAX_REPLY and "{" not in text
    assert name == f"reply_{'low' if rating <= 2 else 'mid'}_{'ar' if language == 'ar' else 'en'}"
    assert bool(re.search(r"[؀-ۿ]", text)) == (language == "ar")
    if number == "+97455550150":
        assert "+974 5555 0150" in text
    if number is None:
        assert ("the branch" in text) or ("الفرع" in text)
    # the same inputs, the same text: no model, no randomness
    assert pw.reply_text(rating, language, number) == (text, name)


def test_the_longest_possible_replies_still_fit():
    for name, template in pw.REPLIES.items():
        for contact in pw.CONTACTS["whatsapp"].values():
            filled = template.format(contact=contact.format(number="+974 5555 0150"))
            assert len(filled) <= pw.MAX_REPLY, name


def test_every_type_and_target_has_a_title_and_every_rule_a_rule_line():
    for ptype, target in pw.TITLES:
        for lang in ("en", "ar"):
            title = pw.title(ptype, target, "Place", lang, 3)
            assert title and "{" not in title
    seen = set()
    for rule_id, proposes in rules.PROPOSES.items():
        for _type, _field, target in proposes:
            seen.add((rule_id, target))
            for lang in ("en", "ar"):
                assert pw.rule_line(rule_id, target, lang)
    assert seen == set(pw.RULE_LINES)


def test_a_change_in_words_for_every_field_in_both_languages_in_western_digits():
    cases = {
        "hours": ({}, {d: ["07:00", "22:00"] for d in WEEK}),
        "phone": ({"phone": ""}, {"phone": "+97455550112"}),
        "category": ({"category": ""}, {"category": "Car wash"}),
        "name": ({"name": "A"}, {"name": "B"}),
        "whatsapp_link": ({"url": ""}, {"url": "https://wa.me/97455550150"}),
        "review_reply": ({"reply": ""}, {"reply": "Thank you."}),
    }
    for field, (before, after) in cases.items():
        for lang in ("en", "ar"):
            lines = pw.change_lines({"field": field, "before": before, "after": after}, lang,
                                    "website")
            assert set(lines) == {"field_label", "where", "before", "after"}
            for side in ("before", "after"):
                assert lines[side]["text"].strip()
                assert not ARABIC_INDIC.search(lines[side]["text"]), (field, lang)
            assert bool(lines["after"]["lines"]) == (field == "hours")
            if field == "hours":
                assert [r["day"] for r in lines["after"]["lines"]] == list(WEEK)
                assert lines["before"]["lines"] == []
    every_day = pw.change_lines({"field": "hours", "before": {}, "after": cases["hours"][1]}, "en")
    assert every_day["after"]["text"] == "Sat to Fri 07:00 to 22:00"


def test_the_message_buttons_fit_whatsapps_limits():
    for pair in pw.BUTTONS.values():
        for title in pair:
            assert 0 < len(title) <= 20, title  # a button of a message: 20 characters
    assert set(pw.BUTTONS) == {"approve", "later", "details"}


def test_the_guarantee_line_is_word_for_word():
    source = inspect.getsource(insights)
    assert "Nothing is applied without your tap." in source
    assert "لا يُطبَّق شيء قبل أن تضغط." in source


def test_every_reply_the_chat_can_answer_exists_in_both_languages():
    for key, pair in pw.REPLY.items():
        assert len(pair) == 2 and all(pair), key
    for needed in ("approved", "already", "applied", "failed", "later", "closed", "other_branch",
                   "gone", "off", "on", "nothing"):
        assert needed in pw.REPLY
