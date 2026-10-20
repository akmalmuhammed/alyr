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
        # 3 of 31 is 9.7%, shown as 10%, so it fires; 3 of 34 is 9% (rounded once, P2-5).
        [{"completed_30": 27, "no_shows_30": 2}, {"completed_30": 31, "no_shows_30": 3}],
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


def test_the_summary_names_its_measures_and_agrees_with_the_numbers():
    v = view.render(busy(), "en")
    assert v["state"] == "normal" and v["lead"] == "orders"
    # Waiting is not repeated as a number: Needs you now says it (05-critique P1-3).
    assert keys(v["kpis"]) == ["sales", "orders", "owed", "came_back"]
    summary = " ".join(plain(s["text"]) for s in v["header"]["summary"])
    assert summary == (
        "Week so far: 41 orders, QAR\u00a03,120. "
        "Orders up 24%, sales up 8% on the same days last week. 1 order needs confirming."
    )
    assert [s["muted"] for s in v["header"]["summary"]] == [False, True, False]
    orders = next(k for k in v["kpis"] if k["key"] == "orders")
    assert plain(orders["change"]["text"]) == "▲ 24%" and orders["change"]["said"] == "up 24%"
    sales = v["kpis"][0]
    assert (sales["value"], sales["unit"], sales["unit_first"]) == ("3,120", "QAR", True)
    assert v["kpi_caption"] == "Against Sunday to 16:20 last week"
    assert v["owed"]["total_text"] == "QAR\u00a012,500"
    first = v["suggestions"][0]
    assert first["key"] == "overdue" and first["primary"] is True
    assert plain(first["title"]) == "QAR\u00a01,150 owed 30+ days, not reminded in 7 days"


def test_staff_with_the_agent_role_see_no_money():
    v = view.render(busy(money=False), "en")
    assert not {"sales", "paid_link", "owed", "collected", "over_60"} & set(keys(v["kpis"]))
    assert keys(v["kpis"]) == ["orders", "came_back", "visits", "booked_ahead"]
    assert v["owed"] is None and v["report"] is None
    assert not any(c["kind"] == "money" for c in v["suggestions"])
    assert "QAR" not in str(v)
    assert v["week"]["format"] == "count"
    assert not any(n["key"] == "setup" for n in v["needs"]["items"])


def test_a_percentage_only_when_both_weeks_count_twenty_or_more():
    at_twenty = view.render(busy(orders=24, orders_last=20), "en")
    change = next(k for k in at_twenty["kpis"] if k["key"] == "orders")["change"]
    assert change["dir"] == "up" and plain(change["text"]) == "▲ 20%"
    small = view.render(busy(orders=24, orders_last=19), "en")
    change = next(k for k in small["kpis"] if k["key"] == "orders")["change"]
    assert change["dir"] is None and plain(change["text"]) == "Last week 19"
    said = " ".join(plain(s["text"]) for s in small["header"]["summary"])
    assert "By this time last week: 19 orders." in said


def test_a_salon_leads_with_visits_and_a_clinic_with_appointments_and_patients():
    salon = facts(modules=frozenset({"inbox", "bookings", "payments"}), business_type="salon",
                  visits=23, visits_last=19, made=9, made_last=7, booked_ahead=14,
                  completed_30=80, no_shows_30=9)
    v = view.render(salon, "en")
    assert keys(v["kpis"]) == ["visits", "booked_ahead", "no_show_rate", "new_bookings"]
    rate = next(k for k in v["kpis"] if k["key"] == "no_show_rate")
    assert (rate["value"], rate["unit"]) == ("10", "%")
    # The rule fires at the figure the screen shows, rounded once (P2-5).
    assert "no_show_rate" in keys(v["suggestions"])
    few = view.render(facts(**{**salon.__dict__, "completed_30": 13, "no_shows_30": 2}), "en")
    rate = next(k for k in few["kpis"] if k["key"] == "no_show_rate")
    assert (rate["value"], rate["unit"]) == ("2", "of 15")  # a percentage needs 20 (A3)
    clinic = facts(**{**salon.__dict__, "business_type": "clinic",
                      "waiting": [row(minutes=12)]})
    ar = view.render(clinic, "ar")
    assert ar["kpis"][0]["label"] == "المواعيد هذا الأسبوع"
    assert plain(ar["needs"]["items"][0]["words"]) == "مراجع بانتظار الرد"


def test_the_states_empty_first_week_and_quiet():
    empty = view.render(facts(has_records=False), "en")
    assert empty["state"] == "empty" and empty["kpis"] == [] and empty["placeholders"]
    assert plain(empty["header"]["summary"][0]["text"]) == (
        "Nothing yet. This page fills in as customers write and order."
    )
    # the real shape, drawn as outlines: the week, the hours, a list (P1-10)
    assert [p["kind"] for p in empty["placeholders"]][:2] == ["week", "hours"]
    assert {p["kind"] for p in empty["placeholders"]} <= {"week", "hours", "list"}

    first = view.render(busy(started=NOW - timedelta(days=3),
                             quiet_regulars=[row(times=3, days=40)]), "en")
    assert first["state"] == "first_week" and first["kpi_caption"] is None
    assert all(k["change"] is None for k in first["kpis"])
    assert "Comparisons start Sunday 25 Oct." in plain(first["header"]["summary"][1]["text"])
    assert "quiet_regulars" not in keys(first["suggestions"])  # tasks and actions only
    states = [d["state"] for d in first["week"]["days"]]
    assert states[:1] == ["before"]  # days before ALYR are not drawn as zeros
    today = next(d for d in first["week"]["days"] if d["state"] == "today")
    assert today["last"] is None and today["last_by_now"] is None  # no week to compare with

    quiet = view.render(facts(orders=3, orders_last=4), "ar")
    assert quiet["state"] == "quiet"
    assert plain(quiet["header"]["summary"][0]["text"]) == (
        "3 طلبات حتى الآن، و4 حتى هذا الوقت من الأسبوع الماضي."
    )


def test_setup_left_folds_into_needs_you_now():
    steps = [{"key": "whatsapp", "label": {"en": "Connect your WhatsApp number",
                                           "ar": "اربط رقم واتساب"},
              "done": False, "screen": "", "connection": "whatsapp"},
             {"key": "provider", "label": {"en": "Connect your payment provider",
                                           "ar": "اربط بوابة الدفع"},
              "done": False, "screen": "", "connection": "payments"}]
    f = busy(setup=[({"en": "ALYR Chat", "ar": "ALYR Chat"}, steps)])
    row_ = next(n for n in view.render(f, "en")["needs"]["items"] if n["key"] == "setup")
    assert row_["count"] == 2 and plain(row_["words"]) == "setup steps left for ALYR Chat"
    assert plain(row_["detail"]) == "Connect your WhatsApp number"
    assert row_["href"] == "/app/connections"
    ar = next(n for n in view.render(f, "ar")["needs"]["items"] if n["key"] == "setup")
    assert plain(ar["words"]) == "خطوتا إعداد متبقيتان في ALYR Chat"
    # While the business has no records, the workspace shows the whole checklist instead.
    empty = view.render(facts(has_records=False, setup=f.setup), "en")
    assert not empty["needs"]["items"]


def test_at_most_three_suggestions_money_first_and_not_now_hides_one():
    f = busy(open_links=[row(3, number=1001, amount=4_500)],
             ready_waiting=[row(4, number=1002, hours=3)],
             quiet_regulars=[row(5, times=4, days=40)], risers=[("Karak", 20, 4)])
    cards = view.render(f, "en")["suggestions"]
    assert keys(cards) == ["overdue", "open_links", "ready"]
    assert [c["primary"] for c in cards] == [True, False, False]
    ready = cards[2]
    assert ready["snooze"] and cards[0]["snooze"] is None  # only knowledge can be set aside
    again = view.render(f, "en", {"ready": ready["snooze"]["fingerprint"]})["suggestions"]
    assert keys(again) == ["overdue", "open_links", "quiet_regulars"]
    # New numbers bring it back.
    changed = busy(open_links=f.open_links, quiet_regulars=f.quiet_regulars,
                   ready_waiting=[*f.ready_waiting, row(6, number=1003, hours=4)])
    snoozed = {"ready": ready["snooze"]["fingerprint"]}
    assert "ready" in keys(view.render(changed, "en", snoozed)["suggestions"])


def test_a_knowledge_card_never_takes_volt_and_a_person_is_counted_once():
    salon = facts(modules=frozenset({"inbox", "bookings", "payments"}), business_type="salon",
                  visits=23, visits_last=19,
                  quiet_regulars=[row(7, times=4, days=40)],
                  due_back=[row(7, days=40, usual=14), row(8, days=30, usual=10)])
    cards = view.render(salon, "en")["suggestions"]
    assert keys(cards) == ["quiet_regulars", "due_back"]
    assert not any(c["primary"] for c in cards)
    assert [r["id"] for r in cards[1]["rows"]] == ["id-8"]  # id-7 was counted above
    only = facts(**{**salon.__dict__, "due_back": [row(7, days=40, usual=14)]})
    assert keys(view.render(only, "en")["suggestions"]) == ["quiet_regulars"]


def test_a_bakery_hears_about_its_orders_before_its_tastings():
    f = busy(completed_30=20, no_shows_30=5, risers=[("Karak", 20, 4)], accounts=[])
    assert keys(view.render(f, "en")["suggestions"])[:2] == ["riser", "no_show_rate"]


def test_arabic_agrees_with_the_count_and_keeps_names_whole():
    one = view.render(busy(repeat_no_shows=[row(1, no_shows=2, next=NOW + timedelta(hours=2))],
                           accounts=[]), "ar")
    card = next(c for c in one["suggestions"] if c["key"] == "repeat_no_show")
    assert plain(card["title"]) == "عميل واحد تغيّب مرتين ولديه حجز جديد"
    assert {"b": "Customer 1"} in card["line"]
    assert plain(card["line"]) == "موعد Customer 1 اليوم الساعة 18:20."
    two = view.render(busy(repeat_no_shows=[row(1, no_shows=2, next=NOW + timedelta(days=2)),
                                            row(2, no_shows=3, next=NOW + timedelta(days=3))],
                           accounts=[]), "ar")
    card = next(c for c in two["suggestions"] if c["key"] == "repeat_no_show")
    assert plain(card["title"]) == "عميلان تغيّبا مرتين ولديهما حجز جديد"
    v = view.render(busy(), "ar")
    assert v["dir"] == "rtl"
    assert {"b": "3,120\u00a0ر.ق"} in v["header"]["summary"][0]["text"]
    assert v["header"]["date"] == "الخميس 15 أكتوبر"
    assert v["needs"]["items"][0]["rule"].startswith("القاعدة · ")
    greeting = view.render(busy(first_name="Huda", first_name_ar="هدى"), "ar")["header"]
    assert greeting["greeting"] == "مساء الخير يا هدى"


def test_the_week_compares_like_with_like():
    f = busy(orders_by_day={THU: (12, 90_000), THU - timedelta(days=7): (9, 70_000)},
             last_by_now={"sales": 50_000, "orders": 6},
             opening={d: [(7, 22)] for d in (0, 1, 2, 3, 4, 6)})
    week = view.render(f, "en")["week"]
    assert week["title"] == "By day"
    assert [d["label"] for d in week["days"]] == ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    assert [d["state"] for d in week["days"]][3:7] == ["past", "today", "closed", "ahead"]
    today = week["days"][4]
    # Today so far against last week up to the same time; the whole day stays as a ghost.
    assert (today["value"], today["last_by_now"], today["last"]) == (90_000, 50_000, 70_000)
    assert week["days"][5]["value"] is None and week["legend"]["closed"] == "Closed"


def test_booked_days_ahead_are_counted_on_the_same_axis():
    salon = facts(modules=frozenset({"inbox", "bookings", "payments"}), business_type="salon",
                  visits=23, visits_last=19, booked_by_day={THU + timedelta(days=1): 3})
    friday = view.render(salon, "en")["week"]["days"][5]
    assert (friday["state"], friday["booked"], friday["booked_text"]) == ("ahead", 3, "3 booked")


def test_busiest_hours_wait_for_enough_and_leave_closed_hours_blank():
    grid = {(4, 9): 30, (4, 10): 10}
    assert view.render(busy(hours_grid=grid, hours_total=40), "en")["hours"] is None
    hours = view.render(busy(hours_grid=grid, hours_total=60, hours_range=(8, 12),
                             opening={4: [(9, 11)]}), "en")["hours"]
    thursday = hours["rows"][4]["cells"]
    assert thursday == [-1, 4, 2, -1]
    assert hours["top"] == {"day": "Thursdays", "range": "09:00–10:00"}


def test_top_items_show_no_change_until_there_is_history():
    fresh = view.render(busy(top_items=[("Karak", 20, 0), ("Cardamom bun", 12, 0)]), "en")
    assert all(r["change"] is None for r in fresh["top"]["rows"])
    assert fresh["top"]["change_label"] is None
    later = view.render(busy(top_items=[("Karak", 20, 8), ("Cardamom bun", 12, 10)]), "en")
    assert later["top"]["change_label"] == "Rank vs previous 28 days"
    assert later["top"]["rows"][0]["change"]["said"] == "up 1"


# ── the endpoint, on the real path ────────────────────────


def test_the_owner_reads_the_agent_in_both_languages(client):
    sign_in(client, OWNER_EMAIL)
    en = client.get("/api/agent").json()
    assert en["version"] == view.VERSION and en["money"] is True and en["lang"] == "en"
    assert en["header"]["greeting"].endswith("Fatima")
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
    assert all(k["value"] in ("0", "—") for k in theirs["kpis"]), theirs["kpis"]
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
