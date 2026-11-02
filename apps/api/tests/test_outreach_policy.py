"""The outreach engine's pure rules (specs/065): the country policy and send windows, the citation
contract, the lint, data minimisation, and reading replies. No database."""

from datetime import datetime
from zoneinfo import ZoneInfo

from alyr.config import Settings
from alyr.outreach import compose, llm, policy, replies, research

DOHA, RIYADH, DUBAI, LONDON = (ZoneInfo(z) for z in (
    "Asia/Qatar", "Asia/Riyadh", "Asia/Dubai", "Europe/London"))


# ── send windows ───────────────────────────────────────────


def test_doha_works_sunday_to_thursday_from_half_past_eight_to_half_past_four():
    assert policy.in_window("QA", datetime(2026, 11, 8, 8, 30, tzinfo=DOHA))  # Sunday
    assert not policy.in_window("QA", datetime(2026, 11, 8, 8, 29, tzinfo=DOHA))
    assert not policy.in_window("QA", datetime(2026, 11, 12, 16, 30, tzinfo=DOHA))  # Thursday
    assert not policy.in_window("QA", datetime(2026, 11, 13, 10, 0, tzinfo=DOHA))  # Friday
    assert not policy.in_window("QA", datetime(2026, 11, 14, 10, 0, tzinfo=DOHA))  # Saturday
    # Thursday after hours opens again on Sunday morning.
    assert policy.next_opening("QA", datetime(2026, 11, 12, 17, 0, tzinfo=DOHA)) == \
        datetime(2026, 11, 15, 8, 30, tzinfo=DOHA)


def test_riyadh_keeps_the_same_week_in_its_own_zone():
    assert policy.in_window("SA", datetime(2026, 11, 8, 9, 0, tzinfo=RIYADH))
    assert not policy.in_window("SA", datetime(2026, 11, 13, 9, 0, tzinfo=RIYADH))
    # 16:00 in Doha is 16:00 in Riyadh too (both UTC+3).
    assert policy.in_window("SA", datetime(2026, 11, 8, 16, 0, tzinfo=DOHA))


def test_dubai_works_monday_to_friday():
    assert not policy.in_window("AE", datetime(2026, 11, 8, 10, 0, tzinfo=DUBAI))  # Sunday
    assert policy.in_window("AE", datetime(2026, 11, 13, 10, 0, tzinfo=DUBAI))  # Friday
    assert policy.next_opening("AE", datetime(2026, 11, 8, 10, 0, tzinfo=DUBAI)) == \
        datetime(2026, 11, 9, 8, 30, tzinfo=DUBAI)


def test_london_is_read_in_london_time_across_a_doha_working_day():
    # 10:00 on a Sunday in Doha is a Sunday in London too: closed.
    assert not policy.in_window("GB", datetime(2026, 11, 8, 10, 0, tzinfo=DOHA))
    # 11:30 Monday in Doha is 08:30 in London: not yet open; opens at 09:00 London.
    monday = datetime(2026, 11, 9, 11, 30, tzinfo=DOHA)
    assert not policy.in_window("GB", monday)
    assert policy.next_opening("GB", monday) == datetime(2026, 11, 9, 9, 0, tzinfo=LONDON)
    assert policy.in_window("GB", datetime(2026, 11, 13, 16, 59, tzinfo=LONDON))
    assert not policy.in_window("GB", datetime(2026, 11, 14, 10, 0, tzinfo=LONDON))


def test_follow_ups_count_the_recipients_working_days():
    thursday = datetime(2026, 11, 12, 10, 0, tzinfo=DOHA)
    # Three working days after a Thursday in Qatar: Sunday, Monday, Tuesday.
    assert policy.after_working_days("QA", thursday, 3) == datetime(2026, 11, 17, 8, 30,
                                                                    tzinfo=DOHA)


# ── lanes and bases ────────────────────────────────────────


def test_country_lane_refusals():
    assert policy.lane("ZZ") == policy.BLOCKED
    assert policy.basis_refusal("ZZ", "opt_in", "", "a@b.co") == "country_blocked"
    assert policy.basis_refusal("", "opt_in", "", "a@b.co") == "country_blocked"
    # Germany is consent only: a published business contact is not enough.
    assert policy.lane("DE") == policy.CONSENT_ONLY
    assert policy.basis_refusal("DE", "published_business_contact", "", "a@firma.de") == \
        "basis_not_allowed"
    assert policy.basis_refusal("DE", "opt_in", "", "a@firma.de") == ""
    assert policy.basis_refusal("QA", "", "", "a@shop.qa") == "no_basis"
    # The EU's legitimate interest needs the assessment's reference.
    assert policy.basis_refusal("FR", "legitimate_interest", "", "a@shop.fr") == \
        "no_assessment_reference"
    assert policy.basis_refusal("FR", "legitimate_interest", "LIA-2026-01", "a@shop.fr") == ""


def test_free_mail_is_refused_unless_asked_known_or_published_on_its_own_site():
    assert policy.basis_refusal("QA", "published_business_contact", "", "x@gmail.com") == \
        "free_mail"
    assert policy.basis_refusal("QA", "opt_in", "", "x@gmail.com") == ""
    assert policy.basis_refusal("QA", "published_business_contact", "", "x@gmail.com",
                                published_on_own_site=True) == ""
    assert policy.basis_refusal("QA", "referral", "", "x@hotmail.com",
                                published_on_own_site=True) == "free_mail"


def test_the_level_is_the_lower_of_the_request_and_the_countrys_cap():
    assert policy.level(3, "QA") == 1
    assert policy.level(3, "GB") == 2
    assert policy.level(3, "US") == 3
    assert policy.level(0, "US") == 0
    assert policy.level(3, "ZZ") == 0
    assert all(policy.country(c).cap == 1 for c in ("QA", "SA", "AE", "KW", "BH", "OM", "EG",
                                                     "JO", "CA", "DE", "IT", "FR", "NL"))


# ── the citation contract ──────────────────────────────────


def test_a_claim_is_kept_only_when_its_quote_is_on_the_page_it_names():
    pages = {"https://bake.example/": "We bake  fresh bread\nevery morning in Doha.",
             "https://bake.example/about": "Family owned since 2015."}
    checked = research.check_claims([
        {"id": "c1", "text": "Fresh bread daily", "url": "https://bake.example",
         "quote": "we bake fresh bread every morning"},  # whitespace and case fold
        {"id": "c2", "text": "Since 2015", "url": "https://bake.example/",
         "quote": "Family owned since 2015."},  # on another page
        {"id": "c3", "text": "Ships worldwide", "url": "https://other.example/",
         "quote": "We ship worldwide to every country"},
        {"id": "c4", "text": "Bread", "url": "https://bake.example/", "quote": "bread"},
    ], pages)
    assert [(c["key"], c["kept"]) for c in checked] == [
        ("c1", True), ("c2", False), ("c3", False), ("c4", False)]
    assert checked[1]["why"] == "the quote is not on the page"
    assert checked[2]["why"] == "the page it names was not read"


# ── data minimisation ──────────────────────────────────────


def test_addresses_and_numbers_are_removed_before_a_model_sees_text():
    text = ("Write to Sara.Owner@bakery.qa or info (at) bakery.qa, call +974 4412 3456 or "
            "00974-5555-1234. Open since 2015, 3 shops, 120 cakes a day.")
    clean = llm.scrub(text)
    assert not llm.personal(clean)
    assert "since 2015" in clean and "120 cakes" in clean
    assert llm.personal("call 55551234") and llm.personal("a@b.qa")


def test_every_schema_is_one_the_api_accepts():
    """Structured outputs need `additionalProperties: false` on every object and accept no
    length or number limits (docs read 2 Nov 2026)."""
    def walk(schema):
        if schema.get("type") == "object":
            assert schema["additionalProperties"] is False
            assert set(schema["required"]) <= set(schema["properties"])
            for item in schema["properties"].values():
                walk(item)
        if schema.get("type") == "array":
            walk(schema["items"])
        assert not {"minLength", "maxLength", "minimum", "maximum"} & set(schema)
    for schema in llm.SCHEMAS.values():
        walk(schema)


def test_an_answer_that_does_not_match_its_schema_is_a_failure():
    import pytest

    with pytest.raises(llm.Invalid):
        llm.validate(llm.SCHEMAS["qualifier"], {"fit_score": "high", "reason": "x"})
    with pytest.raises(llm.Invalid):
        llm.validate(llm.SCHEMAS["qualifier"], {"fit_score": 5, "reason": "x", "extra": 1})
    llm.validate(llm.SCHEMAS["qualifier"], {"fit_score": 5, "reason": "x"})


# ── the lint ───────────────────────────────────────────────


def settings(**over) -> Settings:
    return Settings(env="local", outreach_from_name="Akmal Muhammed",
                    outreach_legal_line="ALYR Technologies W.L.L., Doha, Qatar", **over)


def test_the_lint_catches_each_rule():
    s = settings()
    good = compose.body_of(["I saw you bake every morning.", "Could we talk?"], "Sara", "en", s)
    sentences = [{"text": "I saw you bake every morning.", "kind": "fact", "claims": ["c1"]},
                 {"text": "Could we talk?", "kind": "ask", "claims": []}]
    ok = compose.lint(step=1, subject="Your mornings", body=good, language="en",
                      sentences=sentences, kept={"c1"}, settings=s)
    assert ok["ok"], ok
    uncited = [{**sentences[0], "claims": []}, sentences[1]]
    assert "states a fact and cites nothing" in " ".join(compose.lint(
        step=1, subject="x", body=good, language="en", sentences=uncited, kept={"c1"},
        settings=s)["problems"])
    with_link = compose.body_of(["See https://alyr.qa now."], "Sara", "en", s)
    assert "no link" in " ".join(compose.lint(step=1, subject="x", body=with_link,
                                              language="en", sentences=None, kept=set(),
                                              settings=s)["problems"])
    # A follow-up or a reply may carry a link; a tracking pixel never.
    assert compose.lint(step=4, subject="Re: x", body=with_link, language="en", sentences=None,
                        kept=set(), settings=s)["ok"]
    pixel = good.replace("Could we talk?", 'Could we talk? <img src="x">')
    assert not compose.lint(step=2, subject="x", body=pixel, language="en", sentences=None,
                            kept=set(), settings=s)["ok"]
    long = compose.body_of(["word " * 160], "Sara", "en", s)
    assert not compose.lint(step=1, subject="x", body=long, language="en", sentences=None,
                            kept=set(), settings=s)["ok"]
    assert not compose.lint(step=1, subject="x" * 70, body=good, language="en", sentences=None,
                            kept=set(), settings=s)["ok"]
    no_footer = "Hi Sara,\n\nCould we talk?"
    problems = compose.lint(step=2, subject="x", body=no_footer, language="en", sentences=None,
                            kept=set(), settings=s)["problems"]
    assert {"the sender's name is missing", "the legal name and address line is missing",
            "the opt-out sentence is missing"} <= set(problems)


# ── reading replies ────────────────────────────────────────


def test_opt_out_words_in_english_and_arabic():
    for text in ("Please unsubscribe me", "remove me from your list", "STOP", "Not interested.",
                 "Don't contact me again", "أرجو إلغاء الاشتراك", "لا ترسل لي", "توقف",
                 "غير مهتم شكراً"):
        assert replies.opts_out("", text), text
    for text in ("Yes, let's talk on Monday", "What does it cost?", "نعم، متى؟"):
        assert not replies.opts_out("Re: your orders", text), text


def test_quoted_history_is_removed():
    body = "Sounds good, call me.\n\nOn Sun, 8 Nov 2026 Akmal wrote:\n> Hi Sara,\n> stop here"
    assert replies.without_history(body) == "Sounds good, call me."
