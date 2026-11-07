"""ALYR Agent rule 34, `line_health` (docs/work/insights-plan/plan.md, row L1): the quality of the
shop's own WhatsApp number. First the rule on facts alone (it is quiet just short of each
threshold, speaks at it, in both languages), then `gather` on real PostgreSQL through the
product's own service code (`whatsapp_health.apply_info`), with a second shop whose rows must not
show and an empty shop."""

import re
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from alyr.core import whatsapp_health, whatsapp_line
from alyr.modules.agent import rules, view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INSIGHT_BY_KEY, INSIGHTS
from alyr.modules.agent.rules import line_health as rule
from alyr.modules.agent.words import plain
from alyr.seed import DEMO_TENANT_ID, OWNER_EMAIL
from test_agent import ARABIC, facts
from test_consent import owner_sql
from test_onboarding import new_business
from test_sign_in import sign_in

KEY = rule.KEY
INSIGHT = rule.INSIGHT
THU = date(2026, 10, 15)  # NOW is Thursday 15 Oct 2026, 16:20 in Doha


@pytest.fixture(autouse=True)
def _no_health_left_behind():
    """A flagged line counts in the alert that reaches the founder's phone (spec 062); the
    database lives for the whole run, so a test must not leave one behind."""
    yield
    owner_sql("delete from whatsapp_line_health")


def line_facts(rating="GREEN", status="CONNECTED", health="AVAILABLE", drop=None, **more) -> Facts:
    stored = {"rating": rating, "status": status, "health": health, "drop": drop}
    return facts(extra={KEY: stored}, **more)


def fell(to, on=THU - timedelta(days=2)):
    return {"to": to, "on": on}


def said(f: Facts, lang: str) -> tuple[str, str]:
    found = INSIGHT.find(f)
    assert found is not None
    first, second = INSIGHT.say(found, f, lang)
    return plain(first), plain(second)


# ── the registry ──────────────────────────────────────────


def test_the_rule_is_registered_as_number_34_knowledge_with_a_screen_that_exists():
    assert INSIGHT_BY_KEY[KEY] is INSIGHT and INSIGHT in INSIGHTS
    assert INSIGHT.number == 34 and rule in rules.RULES
    # Nothing in ALYR lets the owner clear a rating, so it is never "Needs you now".
    assert INSIGHT.kind == "knowledge" and INSIGHT.money is False
    assert INSIGHT.action is not None and INSIGHT.status is None
    assert INSIGHT.action.href == "/app/connections"
    assert INSIGHT.module == "inbox|orders|bookings|ledger"


# ── quiet just short of the threshold ─────────────────────


@pytest.mark.parametrize("extra", [
    None,
    {},
    {KEY: None},
    # Meta has not given a rating (a line not connected, the simulator, no read yet).
    {KEY: {"rating": "", "status": "FLAGGED", "health": "BLOCKED", "drop": fell("RED")}},
    {KEY: {"rating": "", "status": "", "health": "", "drop": None}},
])
def test_it_says_nothing_when_meta_has_given_no_rating(extra):
    f = facts(extra=extra) if extra is not None else facts()
    assert INSIGHT.find(f) is None


@pytest.mark.parametrize("rating", ["GREEN", "NA", "UNKNOWN"])
def test_it_says_nothing_for_a_rating_that_is_not_below_the_best(rating):
    assert INSIGHT.find(line_facts(rating)) is None


def test_it_says_nothing_for_a_connected_available_number_with_nothing_unusual():
    assert INSIGHT.find(line_facts("GREEN", "CONNECTED", "AVAILABLE")) is None
    # A status that is only unusual (not flagged, not restricted) is the back office's.
    assert INSIGHT.find(line_facts("GREEN", "PENDING", "AVAILABLE")) is None
    # Not the line's quality: those are the line not working, shown to ALYR staff.
    for status in ("BANNED", "DELETED", "DISCONNECTED"):
        assert INSIGHT.find(line_facts("GREEN", status)) is None, status


# ── speaks at the threshold ───────────────────────────────


CASES = {
    "yellow": (line_facts("YELLOW"), "yellow", ""),
    "red": (line_facts("RED"), "low", "red"),
    "flagged": (line_facts("GREEN", "FLAGGED"), "low", "flagged"),
    "restricted": (line_facts("GREEN", "RESTRICTED"), "restricted", ""),
    "limited": (line_facts("GREEN", health="LIMITED"), "limited", "limited"),
    "blocked": (line_facts("GREEN", health="BLOCKED"), "limited", "blocked"),
    "recovered": (line_facts("GREEN", drop=fell("YELLOW")), "recovered", ""),
    "recovered_from_red": (line_facts("NA", drop=fell("RED")), "recovered", ""),
}


@pytest.mark.parametrize("name", list(CASES))
def test_it_speaks_at_each_threshold(name):
    f, state, variant = CASES[name]
    found = INSIGHT.find(f)
    assert found is not None
    assert (found.numbers["state"], found.numbers["variant"]) == (state, variant)
    # Not a count of records: the card carries no rows, so no "0 customers" is printed.
    assert found.rows == [] and found.n == 0


BANNED = re.compile(r"\b(ai|smart|learns?|thinks?|noticed|predicts?|soon|marketing|offers?)\b")
NO_PROMISE = ("قريباً", "سنوقف", "we will", "ALYR will", "pause", "hold")


@pytest.mark.parametrize("lang", ["en", "ar"])
@pytest.mark.parametrize("name", list(CASES))
def test_it_reads_whole_and_calm_in_both_languages(name, lang):
    f = CASES[name][0]
    first, second = said(f, lang)
    for text in (first, second):
        assert text.strip()
        assert "{" not in text and "}" not in text, text
        assert bool(ARABIC.search(text)) == (lang == "ar"), text
    if lang == "ar":
        assert ARABIC.search(first)
    words = (first + " " + second).lower()
    assert not BANNED.search(words), words
    assert not any(p in words for p in NO_PROMISE), words
    assert "!" not in first + second


def test_arabic_keeps_meta_whole_for_the_screen():
    f = CASES["flagged"][0]
    found = INSIGHT.find(f)
    title, line = INSIGHT.say(found, f, "ar")
    assert {"b": "Meta"} in title and {"b": "Meta"} in line


def test_it_says_what_the_runbook_says_and_no_more():
    red = " ".join(said(CASES["red"][0], "en"))
    assert "blocking or reporting" in red and "messaging limit" in red
    assert "recovers over days" in red and "Send customers only what they expect" in red
    yellow = " ".join(said(CASES["yellow"][0], "en"))
    assert "medium quality" in yellow and "does not fall further" in yellow
    # Yellow is not said to lower the limit: the runbook says that of red and a flag.
    assert "limit" not in yellow
    restricted = " ".join(said(CASES["restricted"][0], "en"))
    assert "reached its messaging limit" in restricted and "24 hours" in restricted
    assert "blocked" in said(CASES["blocked"][0], "en")[0]
    assert "limited" in said(CASES["limited"][0], "en")[0]
    assert "محظور" in said(CASES["blocked"][0], "ar")[0]
    assert "محدود" in said(CASES["limited"][0], "ar")[0]


# ── which wins, and the fall ──────────────────────────────


def test_the_most_serious_state_is_said_first():
    blocked_and_red = INSIGHT.find(line_facts("RED", health="BLOCKED"))
    assert blocked_and_red.numbers["state"] == "limited"
    red_and_yellow_status = INSIGHT.find(line_facts("RED", "RESTRICTED"))
    assert red_and_yellow_status.numbers["state"] == "low"
    flagged_over_restricted = INSIGHT.find(line_facts("YELLOW", "FLAGGED"))
    assert (flagged_over_restricted.numbers["state"],
            flagged_over_restricted.numbers["variant"]) == ("low", "flagged")
    restricted_over_limited = INSIGHT.find(line_facts("YELLOW", "RESTRICTED", "LIMITED"))
    assert restricted_over_limited.numbers["state"] == "restricted"
    limited_over_yellow = INSIGHT.find(line_facts("YELLOW", health="LIMITED"))
    assert limited_over_yellow.numbers["state"] == "limited"


def test_a_fall_is_dated_in_the_shops_words():
    two_days = line_facts("YELLOW", drop=fell("YELLOW", THU - timedelta(days=2)))
    assert said(two_days, "en")[1].startswith("It fell to yellow on Tuesday. ")
    assert said(two_days, "ar")[1].startswith("انخفض التقييم إلى الأصفر يوم الثلاثاء. ")
    today = line_facts("RED", drop=fell("RED", THU))
    assert said(today, "en")[1].startswith("It fell to red today. ")
    assert said(today, "ar")[1].startswith("انخفض التقييم إلى الأحمر اليوم. ")
    yesterday = line_facts("RED", drop=fell("RED", THU - timedelta(days=1)))
    assert said(yesterday, "en")[1].startswith("It fell to red yesterday. ")
    assert said(yesterday, "ar")[1].startswith("انخفض التقييم إلى الأحمر أمس. ")


def test_a_fall_that_is_not_the_present_rating_is_not_said():
    # It fell to red and has since come up to yellow: the card is about yellow, not the fall.
    f = line_facts("YELLOW", drop=fell("RED"))
    assert "fell" not in " ".join(said(f, "en"))
    # A flag is not a rating: the day of a fall to yellow is not told with it.
    assert "fell" not in " ".join(said(line_facts("YELLOW", "FLAGGED", drop=fell("YELLOW")), "en"))


def test_a_recovered_rating_says_so_and_asks_for_nothing():
    first, second = said(CASES["recovered"][0], "en")
    assert first == "Your WhatsApp number's quality rating fell and has recovered"
    assert second == "It fell to yellow on Tuesday. It is not low now. Nothing needs doing."


def test_the_card_comes_back_after_not_now_when_anything_it_rests_on_changes():
    def fingerprint(f):
        return INSIGHT.find(f).fingerprint(KEY)

    yellow = fingerprint(line_facts("YELLOW"))
    assert fingerprint(line_facts("YELLOW")) == yellow
    assert fingerprint(line_facts("RED")) != yellow
    assert fingerprint(line_facts("YELLOW", health="LIMITED")) != yellow
    assert fingerprint(line_facts("YELLOW", drop=fell("YELLOW"))) != yellow


# ── the shop's modules and the view ───────────────────────


def test_gathering_is_skipped_without_one_of_the_rules_modules_and_needs_no_money():
    # `conn` is never used when the rule does not apply.
    no_modules = facts(modules=frozenset({"payments"}))
    import asyncio

    asyncio.run(rules.gather_all(None, no_modules))
    assert KEY not in no_modules.extra


def test_the_card_reaches_the_owners_home_and_a_task_list_never_holds_it():
    v = view.render(line_facts("RED"), "en")
    cards = {c["key"]: c for c in v["suggestions"]}
    card = cards[KEY]
    assert card["kind"] == "knowledge" and card["primary"] is False
    assert card["action"] == {"label": "Open Connections", "href": "/app/connections"}
    assert plain(card["title"]) == "Your WhatsApp number's quality rating is red"
    assert card["rule"].startswith("RULE · Meta's quality rating for your number")
    assert KEY not in [n["key"] for n in v["needs"]["items"]]
    ar = view.render(line_facts("RED"), "ar")
    assert ARABIC.search(plain(next(c for c in ar["suggestions"] if c["key"] == KEY)["title"]))


def test_the_samples_and_a_quiet_line_are_unchanged():
    quiet = view.render(line_facts("GREEN"), "en")
    assert KEY not in [c["key"] for c in quiet["suggestions"]]
    none = view.render(facts(), "en")
    assert KEY not in [c["key"] for c in none["suggestions"]]


# ── gather, on real PostgreSQL ────────────────────────────


def the_line(tenant) -> whatsapp_line.Line:
    return whatsapp_line.Line(
        tenant_id=uuid.UUID(str(tenant)), number_id=str(uuid.uuid4().int)[:15],
        waba_id="104100200300400", display_phone="+974 5000 1234")


def meta_says(client, tenant, line, **info):
    """What a read of Meta's `GET /{number-id}` answers, applied by the product's own code (this
    also writes the line's trail: a new rating is a `quality` event)."""
    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            return await whatsapp_health.apply_info(conn, line, info)

    return client.portal.call(go)


def gathered(client, tenant, now=None, modules=None, **more) -> Facts:
    f = Facts(now=now or datetime.now(UTC), modules=frozenset(modules or {"inbox", "bookings"}),
              business_type="salon", **more)

    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            await rules.gather_all(conn, f)

    client.portal.call(go)
    return f


def said_by(client, tenant, **more):
    f = gathered(client, tenant, **more)
    found = INSIGHT.find(f)
    return f, found


def test_a_shop_with_no_line_reads_nothing(client):
    tenant, _, _ = new_business(client)
    f, found = said_by(client, tenant)
    assert KEY not in f.extra and found is None


def test_a_green_line_with_no_fall_reads_nothing(client):
    tenant, _, _ = new_business(client)
    line = the_line(tenant)
    meta_says(client, tenant, line, status="CONNECTED", quality_rating="GREEN")
    f, found = said_by(client, tenant)
    assert f.extra[KEY]["rating"] == "GREEN" and f.extra[KEY]["drop"] is None
    assert found is None


def test_a_rating_that_drops_to_yellow_is_read_with_the_day_it_fell(client):
    tenant, _, _ = new_business(client)
    line = the_line(tenant)
    meta_says(client, tenant, line, status="CONNECTED", quality_rating="GREEN")
    meta_says(client, tenant, line, status="CONNECTED", quality_rating="YELLOW")
    f, found = said_by(client, tenant)
    stored = f.extra[KEY]
    assert (stored["rating"], stored["status"]) == ("YELLOW", "CONNECTED")
    assert stored["drop"] == {"to": "YELLOW", "on": f.today}
    assert (found.numbers["state"], found.numbers["fell_to"]) == ("yellow", "YELLOW")
    first, second = INSIGHT.say(found, f, "en")
    assert plain(first) == "Your WhatsApp number's quality rating is yellow"
    assert plain(second).startswith("It fell to yellow today. Yellow means medium quality")


def test_a_red_flagged_and_limited_number_is_read_from_what_meta_said(client):
    tenant, _, _ = new_business(client)
    line = the_line(tenant)
    meta_says(client, tenant, line, status="CONNECTED", quality_rating="GREEN")
    meta_says(client, tenant, line, status="FLAGGED", quality_rating="RED",
              health_status={"can_send_message": "LIMITED"})
    f, found = said_by(client, tenant)
    assert f.extra[KEY]["status"] == "FLAGGED" and f.extra[KEY]["health"] == "LIMITED"
    assert (found.numbers["state"], found.numbers["variant"]) == ("low", "red")
    assert plain(INSIGHT.say(found, f, "ar")[0]) == "تقييم جودة رقم واتساب لديك أحمر"


def test_a_fall_that_was_made_good_reads_as_recovered_while_it_is_inside_the_week(client):
    tenant, _, _ = new_business(client)
    line = the_line(tenant)
    for rating in ("GREEN", "RED", "GREEN"):
        meta_says(client, tenant, line, status="CONNECTED", quality_rating=rating)
    f, found = said_by(client, tenant)
    assert f.extra[KEY]["rating"] == "GREEN" and f.extra[KEY]["drop"]["to"] == "RED"
    assert found.numbers["state"] == "recovered"
    # A week and a day later the fall is out of the window and the card is gone.
    _, later = said_by(client, tenant, now=datetime.now(UTC) + timedelta(days=8))
    assert later is None


def test_the_newest_fall_wins_and_a_rise_is_not_a_fall(client):
    tenant, _, _ = new_business(client)
    line = the_line(tenant)
    for rating in ("GREEN", "YELLOW", "RED", "YELLOW"):
        meta_says(client, tenant, line, status="CONNECTED", quality_rating=rating)
    f, found = said_by(client, tenant)
    # The last change was a rise to yellow; the newest fall is the one to red.
    assert f.extra[KEY]["rating"] == "YELLOW" and f.extra[KEY]["drop"]["to"] == "RED"
    assert found.numbers["state"] == "yellow"
    assert "fell" not in plain(INSIGHT.say(found, f, "en")[1])


def test_a_change_between_equal_ratings_is_not_a_fall(client):
    tenant, _, _ = new_business(client)
    line = the_line(tenant)
    for rating in ("GREEN", "NA", "GREEN"):
        meta_says(client, tenant, line, status="CONNECTED", quality_rating=rating)
    f, found = said_by(client, tenant)
    assert f.extra[KEY]["drop"] is None and found is None


def test_a_fall_older_than_seven_days_is_not_read(client):
    tenant, _, _ = new_business(client)
    line = the_line(tenant)
    meta_says(client, tenant, line, status="CONNECTED", quality_rating="GREEN")
    owner_sql(
        "insert into whatsapp_line_events (tenant_id, number_id, at, kind, ok, actor, detail) "
        "values ($1, $2, now() - interval '8 days', 'quality', false, 'ALYR', "
        "'{\"from\": \"GREEN\", \"to\": \"YELLOW\"}')", tenant, line.number_id)
    f, found = said_by(client, tenant)
    assert f.extra[KEY]["drop"] is None and found is None
    owner_sql(
        "insert into whatsapp_line_events (tenant_id, number_id, at, kind, ok, actor, detail) "
        "values ($1, $2, now() - interval '6 days 23 hours', 'quality', false, 'ALYR', "
        "'{\"from\": \"GREEN\", \"to\": \"YELLOW\"}')", tenant, line.number_id)
    f, found = said_by(client, tenant)
    assert f.extra[KEY]["drop"]["to"] == "YELLOW" and found.numbers["state"] == "recovered"


def test_another_shops_line_is_never_read(client, client_factory):
    mine, _, _ = new_business(client)
    other_client = client_factory()
    theirs, _, _ = new_business(other_client)
    meta_says(client, mine, the_line(mine), status="CONNECTED", quality_rating="GREEN")
    their_line = the_line(theirs)
    meta_says(other_client, theirs, their_line, status="FLAGGED", quality_rating="GREEN")
    meta_says(other_client, theirs, their_line, status="FLAGGED", quality_rating="RED")

    f, found = said_by(client, mine)
    assert f.extra[KEY]["rating"] == "GREEN" and f.extra[KEY]["drop"] is None and found is None
    g, theirs_found = said_by(other_client, theirs)
    assert g.extra[KEY]["rating"] == "RED" and theirs_found.numbers["state"] == "low"
    # Their trail is not in mine: no fall in my facts even though theirs has one.
    assert f.extra[KEY]["drop"] is None


def test_the_rule_runs_without_money_and_only_for_shops_with_a_module_it_names(client):
    tenant, _, _ = new_business(client)
    meta_says(client, tenant, the_line(tenant), status="CONNECTED", quality_rating="RED")
    assert KEY in gathered(client, tenant, money=False).extra
    assert KEY not in gathered(client, tenant, modules={"payments"}).extra


def test_the_owners_home_shows_the_card_for_a_red_line_and_not_for_a_green_one(client):
    # The demo shop has records (a brand-new shop with none shows an empty home, no cards).
    sign_in(client, OWNER_EMAIL)
    tenant = str(DEMO_TENANT_ID)
    line = the_line(tenant)
    try:
        meta_says(client, tenant, line, status="CONNECTED", quality_rating="GREEN")
        cards = client.get("/api/agent").json()["suggestions"]
        assert KEY not in [c["key"] for c in cards]
        meta_says(client, tenant, line, status="CONNECTED", quality_rating="RED")
        body = client.get("/api/agent").json()
        card = next(c for c in body["suggestions"] if c["key"] == KEY)
        assert card["kind"] == "knowledge" and card["primary"] is False
        assert card["action"] == {"label": "Open Connections", "href": "/app/connections"}
        assert plain(card["title"]) == "Your WhatsApp number's quality rating is red"
        assert card["rule"].startswith("RULE · Meta's quality rating for your number")
        assert KEY not in [n["key"] for n in body["needs"]["items"]]
        ar = client.get("/api/agent", params={"lang": "ar"}).json()["suggestions"]
        assert ARABIC.search(plain(next(c for c in ar if c["key"] == KEY)["title"]))
    finally:
        owner_sql("delete from whatsapp_line_events where number_id = $1", line.number_id)
