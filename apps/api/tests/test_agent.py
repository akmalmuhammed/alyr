"""ALYR Agent (ALY-99): every rule at its threshold in both languages, the view's choices
(states, the four numbers, roles, "Not now"), and the endpoint on the real path."""

import re
from datetime import UTC, date, datetime, timedelta

import pytest

from alyr.modules.agent import view
from alyr.modules.agent.facts import Account, Facts, Row
from alyr.modules.agent.insights import INSIGHT_BY_KEY, INSIGHTS
from alyr.modules.agent.words import plain
from alyr.seed import AGENT_EMAIL, OWNER_EMAIL
from test_onboarding import new_business
from test_sign_in import sign_in

# Thursday 15 Oct 2026, 16:20 in Doha.
NOW = datetime(2026, 10, 15, 13, 20, tzinfo=UTC)
EVERYTHING = frozenset({"inbox", "orders", "payments", "bookings", "ledger"})
ARABIC = re.compile(r"[؀-ۿ]")


def facts(**values) -> Facts:
    base = {"now": NOW, "modules": EVERYTHING, "business_type": "restaurant",
            "started": NOW - timedelta(days=60)}
    return Facts(**(base | values))


def row(i: int = 1, **detail) -> Row:
    return Row(f"id-{i}", f"Customer {i}", detail)


def account(**values) -> Account:
    base = {"id": "a-1", "name": "Palm Court Offices", "balance": 50_000, "oldest_days": 45,
            "buckets": {"d0_30": 10_000, "d31_60": 40_000, "d61_90": 0, "d90_plus": 0},
            "promised": False, "last_reminded_at": None, "over_limit": False}
    return Account(**(base | values))


THU = date(2026, 10, 15)

# For each rule: facts just short of its threshold (one or more), and facts that meet it.
CASES = {
    "waiting": ([{}], {"waiting": [row(minutes=11, nobody=True)]}),
    "unconfirmed": ([{}], {"unconfirmed": [row(number=1001, minutes=16)]}),
    "unmarked": ([{}], {"unmarked": [row(number=101, starts_at=NOW)]}),
    "overdue": (
        [{"accounts": [account(oldest_days=29)]},
         {"accounts": [account(promised=True)]},
         {"accounts": [account(last_reminded_at=NOW - timedelta(days=6))]}],
        {"accounts": [account(oldest_days=30, last_reminded_at=NOW - timedelta(days=8))]},
    ),
    "promise_passed": ([{}], {"promises_passed": [row(promised_until=THU - timedelta(days=1))]}),
    "open_links": ([{}], {"open_links": [row(number=1001, amount=4_500)]}),
    "over_limit": ([{"accounts": [account()]}], {"accounts": [account(over_limit=True)]}),
    "owed_growing": (
        [{"owed_weeks": [(100, 50), (100, 50), (100, 100)]},
         {"owed_weeks": [(100, 50), (100, 50)]}],
        {"owed_weeks": [(100, 50), (100, 50), (101, 100)]},
    ),
    "ready": ([{}], {"ready_waiting": [row(number=1001, hours=2)]}),
    "repeat_no_show": ([{}], {"repeat_no_shows": [row(no_shows=2, next=NOW + timedelta(days=2))]}),
    "slow_answers": (
        [{"first_answer": 1800, "first_answer_before": 600},
         {"first_answer": 2400, "first_answer_before": 2400},
         {"first_answer": 2400, "first_answer_before": None}],
        {"first_answer": 1801, "first_answer_before": 600},
    ),
    "booked_value": (
        [{"priced": False, "booked_value_ahead": 5_000, "booked_ahead": 2},
         {"priced": True, "booked_value_ahead": 0}],
        {"priced": True, "booked_value_ahead": 5_000, "booked_ahead": 2},
    ),
    "no_show_rate": (
        [{"completed_30": 27, "no_shows_30": 2}, {"completed_30": 28, "no_shows_30": 3}],
        {"completed_30": 27, "no_shows_30": 3},
    ),
    "quiet_regulars": ([{}], {"quiet_regulars": [row(times=3, days=31)]}),
    "due_back": ([{}], {"due_back": [row(days=31, usual=20)]}),
    "thin_days": (
        [{"thin_days": [(THU + timedelta(days=2), 0.1)]}],
        {"thin_days": [(THU + timedelta(days=2), 0.1), (THU + timedelta(days=3), 0.29)]},
    ),
    "late_cancellations": ([{"late_cancellations": 2}], {"late_cancellations": 3}),
    "lost_reason": (
        [{"lost_reasons": {"price": 2, "other": 2}}], {"lost_reasons": {"price": 3}},
    ),
    "unused_items": (
        [{"orders_30d": 29, "unused_products": [row()]}, {"orders_30d": 40}],
        {"orders_30d": 30, "unused_products": [row()]},
    ),
    "riser": (
        [{"risers": [("Cinnamon roll", 9, 5)]}], {"risers": [("Cinnamon roll", 10, 5)]},
    ),
}


def test_every_rule_has_a_threshold_case():
    assert set(CASES) == {i.key for i in INSIGHTS}


@pytest.mark.parametrize("key", list(CASES))
def test_each_rule_stays_quiet_just_short_of_its_threshold(key):
    insight = INSIGHT_BY_KEY[key]
    for below in CASES[key][0]:
        assert insight.find(facts(**below)) is None, (key, below)


@pytest.mark.parametrize("key", list(CASES))
@pytest.mark.parametrize("lang", ["en", "ar"])
def test_each_rule_speaks_at_its_threshold_in_both_languages(key, lang):
    insight = INSIGHT_BY_KEY[key]
    f = facts(**CASES[key][1])
    found = insight.find(f)
    assert found is not None
    first, second = insight.say(found, f, lang)
    for parts in (first, second):
        text = plain(parts)
        assert text.strip(), key
        assert "{" not in text and "}" not in text, text
        assert bool(ARABIC.search(text)) == (lang == "ar") or lang == "en", text
    if lang == "ar":
        assert ARABIC.search(plain(first)), plain(first)
    # Nothing that reads as a mind at work (E1).
    words = (plain(first) + " " + plain(second)).lower()
    assert not re.search(r"\b(ai|smart|learns?|thinks?|noticed|predicts?)\b", words), words


def test_cards_never_promise_what_is_not_built():
    for insight in INSIGHTS:
        if insight.action:
            assert insight.action.href.startswith("/app/"), insight.key
        else:
            assert insight.status is not None, insight.key


# ── the view, from facts alone ────────────────────────────


def busy(**values) -> Facts:
    return facts(**({
        "orders": 41, "orders_last": 33, "sales": 312_000, "sales_last": 290_000,
        "came_back": 12, "came_back_last": 9, "owed": 1_250_000, "owing": 5,
        "buckets": {"d0_30": 500_000, "d31_60": 450_000, "d61_90": 175_000, "d90_plus": 125_000},
        "accounts": [account(oldest_days=104, balance=125_000,
                             last_reminded_at=NOW - timedelta(days=9))],
        "waiting": [row(minutes=48)], "unconfirmed": [row(2, number=1033, minutes=22)],
    } | values))


def keys(items) -> list[str]:
    return [i["key"] for i in items]


def test_the_owner_sees_sales_first_and_money_throughout():
    v = view.render(busy(), "en")
    assert v["state"] == "normal" and v["lead"] == "orders"
    assert keys(v["kpis"]) == ["sales", "orders", "owed", "waiting"]
    summary = " ".join(plain(s["text"]) for s in v["header"]["summary"])
    assert summary == (
        "Week so far: 41 orders, QAR 3,120. Up 8 on the same days last week. "
        "1 order is waiting."
    )
    assert [s["muted"] for s in v["header"]["summary"]] == [False, True, False]
    assert v["owed"]["total_text"] == "QAR 12,500"
    assert v["suggestions"][0]["key"] == "overdue"


def test_staff_with_the_agent_role_see_no_money():
    v = view.render(busy(money=False), "en")
    assert not {"sales", "paid_link", "owed", "collected", "over_60"} & set(keys(v["kpis"]))
    assert keys(v["kpis"]) == ["orders", "waiting", "came_back", "visits"]
    assert v["owed"] is None and v["report"] is None
    assert not any(c["kind"] == "money" for c in v["suggestions"])
    assert "QAR" not in str(v)
    assert v["week"]["format"] == "count"


def test_a_percentage_only_when_both_weeks_count_twenty_or_more():
    at_twenty = view.render(busy(orders=24, orders_last=20), "en")
    change = next(k for k in at_twenty["kpis"] if k["key"] == "orders")["change"]
    assert change["dir"] == "up" and plain(change["text"]) == "▲ 20% on last week"
    small = view.render(busy(orders=24, orders_last=19), "en")
    change = next(k for k in small["kpis"] if k["key"] == "orders")["change"]
    assert change["dir"] is None and plain(change["text"]) == "Last week 19"


def test_a_salon_leads_with_visits_and_says_appointments_for_a_clinic():
    salon = facts(modules=frozenset({"inbox", "bookings", "payments"}), business_type="salon",
                  visits=23, visits_last=19, made=9, made_last=7, booked_ahead=14,
                  completed_30=80, no_shows_30=9)
    v = view.render(salon, "en")
    assert keys(v["kpis"]) == ["visits", "booked_ahead", "no_show_rate", "new_bookings"]
    assert next(k for k in v["kpis"] if k["key"] == "no_show_rate")["value"] == "10%"
    clinic = view.render(facts(**{**salon.__dict__, "business_type": "clinic"}), "ar")
    assert clinic["kpis"][0]["label"] == "المواعيد هذا الأسبوع"


def test_the_states_empty_first_week_and_quiet():
    empty = view.render(facts(has_records=False), "en")
    assert empty["state"] == "empty" and empty["kpis"] == [] and empty["placeholders"]
    assert plain(empty["header"]["summary"][0]["text"]).startswith("Nothing yet.")

    first = view.render(busy(started=NOW - timedelta(days=3),
                             quiet_regulars=[row(times=3, days=40)]), "en")
    assert first["state"] == "first_week"
    assert all(k["change"] is None for k in first["kpis"])
    assert "Comparisons start Sunday 25 Oct." in plain(first["header"]["summary"][1]["text"])
    assert "quiet_regulars" not in keys(first["suggestions"])  # tasks and actions only

    quiet = view.render(facts(orders=3, orders_last=4), "ar")
    assert quiet["state"] == "quiet"
    assert plain(quiet["header"]["summary"][0]["text"]) == "أسبوع هادئ حتى الآن: 3 طلبات."


def test_at_most_three_suggestions_money_first_and_not_now_hides_one():
    f = busy(open_links=[row(3, number=1001, amount=4_500)],
             ready_waiting=[row(4, number=1002, hours=3)],
             quiet_regulars=[row(5, times=4, days=40)], risers=[("Karak", 20, 4)])
    cards = view.render(f, "en")["suggestions"]
    assert keys(cards) == ["overdue", "open_links", "ready"]
    ready = cards[2]
    assert ready["snooze"] and cards[0]["snooze"] is None  # only knowledge can be set aside
    again = view.render(f, "en", {"ready": ready["snooze"]["fingerprint"]})["suggestions"]
    assert keys(again) == ["overdue", "open_links", "quiet_regulars"]
    # New numbers bring it back.
    changed = busy(open_links=f.open_links, quiet_regulars=f.quiet_regulars,
                   ready_waiting=[*f.ready_waiting, row(6, number=1003, hours=4)])
    snoozed = {"ready": ready["snooze"]["fingerprint"]}
    assert "ready" in keys(view.render(changed, "en", snoozed)["suggestions"])


def test_arabic_is_written_whole_with_amounts_kept_whole():
    v = view.render(busy(), "ar")
    assert v["dir"] == "rtl"
    first = v["header"]["summary"][0]["text"]
    assert {"b": "3,120 ر.ق"} in first
    assert v["header"]["eyebrow"].startswith("اليوم · الخميس 15 أكتوبر")
    assert v["needs"]["items"][0]["rule"].startswith("القاعدة · ")


def test_the_week_runs_sunday_to_saturday_with_today_marked():
    f = busy(orders_by_day={THU: (12, 90_000), THU - timedelta(days=7): (9, 70_000)})
    week = view.render(f, "en")["week"]
    assert [d["label"] for d in week["days"]] == ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    assert [d["state"] for d in week["days"]][3:6] == ["past", "today", "coming"]
    today = week["days"][4]
    assert (today["value"], today["last"]) == (90_000, 70_000)
    assert week["days"][5]["value"] is None


# ── the endpoint, on the real path ────────────────────────


def test_the_owner_reads_the_agent_in_both_languages(client):
    sign_in(client, OWNER_EMAIL)
    en = client.get("/api/agent").json()
    assert en["version"] == view.VERSION and en["money"] is True and en["lang"] == "en"
    assert en["header"]["greeting"].endswith("Fatima.")
    assert "owed" in keys(en["kpis"])
    ar = client.get("/api/agent", params={"lang": "ar"}).json()
    assert ar["dir"] == "rtl" and ARABIC.search(ar["header"]["greeting"])
    assert client.get("/api/agent", params={"lang": "fr"}).status_code == 422


def test_an_agent_reads_it_without_money(client):
    sign_in(client, AGENT_EMAIL)
    v = client.get("/api/agent").json()
    assert v["money"] is False and v["owed"] is None and v["report"] is None
    assert not {"sales", "owed", "paid_link", "collected", "over_60"} & set(keys(v["kpis"]))
    assert all(r["name"] == "Yusuf Rahman" for r in (v["team"] or {"rows": []})["rows"])


def test_another_business_sees_none_of_this_ones_numbers(client, client_factory):
    sign_in(client, OWNER_EMAIL)
    mine = client.get("/api/agent").json()
    assert mine["owed"]["total_text"] != "QAR 0"
    other = client_factory()
    new_business(other)
    theirs = other.get("/api/agent").json()
    assert theirs["owed"] is None  # a salon has no credit accounts
    assert all(k["value"] in ("0", "0 of 0", "—") for k in theirs["kpis"]), theirs["kpis"]
    assert theirs["suggestions"] == [] or all(
        c["key"] not in ("overdue", "promise_passed") for c in theirs["suggestions"]
    )


def test_not_now_sets_a_card_aside_for_the_owner_only(client):
    sign_in(client, OWNER_EMAIL)
    body = {"key": "quiet_regulars", "fingerprint": "abc123"}
    answer = client.post("/api/agent/not-now", json=body)
    assert answer.status_code == 200 and answer.json()["until"]
    assert client.post("/api/agent/not-now", json={**body, "key": "overdue"}).status_code == 422
    assert client.post("/api/agent/not-now", json={**body, "key": "nothing"}).status_code == 422
    sign_in(client, AGENT_EMAIL)
    assert client.post("/api/agent/not-now", json=body).status_code == 403
