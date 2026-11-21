"""The Agent rule `fill_thin_day` (V3, insights plan): the quietest of the next 7 days is under
30% booked and 3 or more regulars are due back with nothing booked.

Two halves, as the rule brief asks. The pure half builds `Facts` and proves the thresholds, the
words in both languages and how the dashboard counts a person once. The database half puts
bookings in PostgreSQL, reads them through `facts.gather` inside `db.tenant()` (the rule reads
the numbers that function already gathers), and checks a second shop's rows never show up."""

import asyncio
import re
from datetime import UTC, date, datetime, time, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from alyr.core.auth import Staff
from alyr.db import Database
from alyr.modules.agent import facts as agent_facts
from alyr.modules.agent import view
from alyr.modules.agent.facts import Facts, Row
from alyr.modules.agent.insights import INSIGHT_BY_KEY, INSIGHTS
from alyr.modules.agent.rules import RULES, fill_thin_day
from alyr.modules.agent.words import plain
from conftest import APP_DSN
from test_consent import owner_sql

RULE = fill_thin_day.INSIGHT
# Thursday 15 Oct 2026, 16:20 in Doha.
NOW = datetime(2026, 10, 15, 13, 20, tzinfo=UTC)
THU = date(2026, 10, 15)
TUE = THU + timedelta(days=5)  # Tuesday 20 Oct
SAT = THU + timedelta(days=2)
ARABIC = re.compile(r"[؀-ۿ]")
SALON = frozenset({"inbox", "bookings", "payments"})
DOHA = ZoneInfo("Asia/Qatar")


def facts(**values) -> Facts:
    base = {"now": NOW, "modules": SALON, "business_type": "salon",
            "started": NOW - timedelta(days=60)}
    return Facts(**(base | values))


def regulars(n: int, start: int = 1) -> list[Row]:
    return [Row(f"id-{i}", f"Customer {i}", {"days": 62, "usual": 14})
            for i in range(start, start + n)]


def at_threshold(**values) -> Facts:
    return facts(**({"thin_days": [(TUE, 0.25)], "due_back": regulars(3)} | values))


# ── the rule, from facts alone ────────────────────────────


def test_it_is_registered_with_the_number_the_plan_gave_it():
    assert fill_thin_day in RULES
    assert INSIGHT_BY_KEY["fill_thin_day"] is RULE
    assert (RULE.number, RULE.kind, RULE.module) == (33, "knowledge", "bookings")
    assert sum(1 for i in INSIGHTS if i.number == 33) == 1


def test_it_is_quiet_just_below_each_threshold():
    # Two regulars are not enough; neither is a thin day alone, nor regulars alone.
    assert RULE.find(at_threshold(due_back=regulars(2))) is None
    assert RULE.find(facts(thin_days=[(TUE, 0.25)])) is None
    assert RULE.find(facts(due_back=regulars(3))) is None
    assert RULE.find(facts()) is None
    assert RULE.find(at_threshold()) is not None


def test_it_reads_only_the_numbers_the_other_two_rules_use():
    f = at_threshold()
    found = RULE.find(f)
    assert found.rows == f.due_back
    assert found.n == 3
    assert "fill_thin_day" not in f.extra  # nothing of its own is gathered
    assert INSIGHT_BY_KEY["thin_days"].find(f) is None  # one thin day: that card is silent
    assert INSIGHT_BY_KEY["due_back"].find(f) is not None


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_it_speaks_at_its_threshold_in_both_languages(lang):
    f = at_threshold()
    found = RULE.find(f)
    first, second = RULE.say(found, f, lang)
    for parts in (first, second):
        text = plain(parts)
        assert text.strip()
        assert "{" not in text and "}" not in text, text
        assert (bool(ARABIC.search(text)) is True) if lang == "ar" else not ARABIC.search(text)
    # Nothing that reads as a mind at work, and no promise of what is not built.
    words = (plain(first) + " " + plain(second)).lower()
    assert not re.search(
        r"\b(ai|smart|learns?|thinks?|noticed|predicts?|forecasts?|soon|send|message)\b", words
    ), words
    assert "قريباً" not in words and "سنرسل" not in words
    assert {"b": "25%"} in first  # the figure is kept whole on screen


def test_the_words_in_english():
    f = at_threshold(due_back=regulars(11))
    first, second = RULE.say(RULE.find(f), f, "en")
    assert plain(first) == "Tuesday 20 Oct is the quietest of the next 7 days, 25% booked"
    assert plain(second) == "11 regulars are due back and have nothing booked."


def test_the_words_in_arabic_agree_with_the_count():
    def said(n: int):
        f = at_threshold()
        found = RULE.find(f)
        found.rows = regulars(n)  # one or two can be left after the dashboard counts a person once
        return [plain(p) for p in RULE.say(found, f, "ar")]

    assert said(3) == [
        "الثلاثاء 20 أكتوبر هو أهدأ يوم في الأيام السبعة القادمة، محجوز 25%",
        "3 زبائن دائمين حان موعد عودتهم ولا حجز لديهم.",
    ]
    assert said(11)[1] == "11 زبوناً دائماً حان موعد عودتهم ولا حجز لديهم."
    assert said(2)[1] == "زبونان دائمان حان موعد عودتهما ولا حجز لديهما."
    assert said(1)[1] == "زبون دائم واحد حان موعد عودته ولا حجز لديه."


def test_one_left_after_the_dashboard_counts_a_person_once_reads_in_the_singular():
    f = at_threshold()
    found = RULE.find(f)
    found.rows = found.rows[:1]
    assert plain(RULE.say(found, f, "en")[1]) == "1 regular is due back and has nothing booked."


def test_the_quietest_day_is_named_and_the_earlier_one_wins_a_tie():
    f = at_threshold(thin_days=[(SAT, 0.2), (TUE, 0.1), (TUE + timedelta(days=1), 0.1)])
    assert RULE.find(f).numbers == {"day": TUE, "share": 10}
    f = at_threshold(thin_days=[(SAT, 0.1), (TUE, 0.1)])
    assert RULE.find(f).numbers["day"] == SAT


def test_a_day_just_under_30_never_reads_as_30():
    # 0.299 rounds to 30, which would sit beside "under 30%": the card shows 29.
    f = at_threshold(thin_days=[(TUE, 0.299)])
    first, _ = RULE.say(RULE.find(f), f, "en")
    assert {"b": "29%"} in first
    f = at_threshold(thin_days=[(TUE, 0.0)])
    assert RULE.find(f).numbers["share"] == 0


def test_it_shows_no_money_so_the_money_switch_changes_nothing():
    assert RULE.money is False
    for lang in ("en", "ar"):
        for money in (True, False):
            f = at_threshold(money=money)
            text = " ".join(plain(p) for p in RULE.say(RULE.find(f), f, lang))
            assert "QAR" not in text and "ر.ق" not in text
    seen = view.render(at_threshold(money=False), "en")["suggestions"]
    assert [c["key"] for c in seen] == ["fill_thin_day"]


def test_a_clinic_is_told_about_patients():
    f = at_threshold(business_type="clinic")
    assert plain(RULE.say(RULE.find(f), f, "en")[1]).startswith("3 patients are due back")
    assert plain(RULE.say(RULE.find(f), f, "ar")[1]).startswith("3 مراجعين")


def test_its_action_opens_a_screen_that_exists_and_it_offers_no_message():
    assert RULE.action is not None and RULE.status is None
    assert RULE.action.href == "/app/bookings"
    assert RULE.action.label.get("en") == "Open the bookings"
    assert ARABIC.search(RULE.action.label.get("ar"))
    card = view.render(at_threshold(), "en")["suggestions"][0]
    assert card["action"] == {"label": "Open the bookings", "href": "/app/bookings"}
    assert card["rule"].startswith("RULE · ") and card["rule"].endswith("· 3 regulars")


def test_a_card_set_aside_comes_back_when_the_day_or_the_people_change():
    f = at_threshold()
    first = RULE.find(f).fingerprint("fill_thin_day")
    assert RULE.find(f).fingerprint("fill_thin_day") == first
    moved = RULE.find(at_threshold(thin_days=[(SAT, 0.25)])).fingerprint("fill_thin_day")
    more = RULE.find(at_threshold(due_back=regulars(4))).fingerprint("fill_thin_day")
    assert len({first, moved, more}) == 3
    set_aside = {"fill_thin_day": first}
    # "Not now" sets this card aside; the people are then still due back, so the plain
    # due_back card (which this one had stood in for) shows them once, as it would without it.
    assert [c["key"] for c in view.render(f, "en", set_aside)["suggestions"]] == ["due_back"]
    assert [c["key"] for c in view.render(at_threshold(due_back=regulars(4)), "en", set_aside)[
        "suggestions"]] == ["fill_thin_day"]


# ── how the dashboard counts people (view._suggestions) ───────────


def keys(f: Facts) -> list[str]:
    return [c["key"] for c in view.render(f, "en")["suggestions"]]


def ids(card: dict) -> set[str]:
    return {r["id"] for r in card["rows"]}


def test_it_stands_in_for_due_back_so_the_same_people_are_listed_once():
    f = at_threshold(due_back=regulars(4))
    cards = view.render(f, "en")["suggestions"]
    assert [c["key"] for c in cards] == ["fill_thin_day"]  # due_back left with nobody: dropped
    assert ids(cards[0]) == {"id-1", "id-2", "id-3", "id-4"}
    # Below its threshold it is silent, and due_back speaks as before.
    assert keys(at_threshold(due_back=regulars(2))) == ["due_back"]


def test_it_comes_before_the_cards_it_shares_people_with():
    quiet = [Row("id-1", "Customer 1", {"times": 4, "days": 40}),
             Row("id-9", "Customer 9", {"times": 5, "days": 45})]
    f = at_threshold(quiet_regulars=quiet)
    cards = view.render(f, "en")["suggestions"]
    assert [c["key"] for c in cards] == ["fill_thin_day", "quiet_regulars"]
    assert ids(cards[0]) == {"id-1", "id-2", "id-3"}
    assert ids(cards[1]) == {"id-9"}  # id-1 was counted above
    everyone = [r for r in regulars(3)]
    assert keys(at_threshold(quiet_regulars=everyone)) == ["fill_thin_day"]


def test_no_person_is_in_two_cards_and_its_count_is_what_is_left():
    # A shop whose main product is orders hears about quiet regulars first (it has the orders
    # module); the people it counted leave this card, and the sentence counts who is left.
    orders = frozenset({"inbox", "orders", "bookings", "payments"})
    quiet = [Row("id-1", "Customer 1", {"times": 4, "days": 40})]
    f = at_threshold(modules=orders, business_type="restaurant", quiet_regulars=quiet,
                     due_back=regulars(4))
    cards = view.render(f, "en")["suggestions"]
    assert [c["key"] for c in cards] == ["quiet_regulars", "fill_thin_day"]
    assert ids(cards[0]) == {"id-1"} and ids(cards[1]) == {"id-2", "id-3", "id-4"}
    assert ids(cards[0]).isdisjoint(ids(cards[1]))
    assert "3 regulars are due back" in plain(cards[1]["line"])
    # If the others leave fewer than the minimum, the sentence says how many are left.
    f = at_threshold(modules=orders, business_type="restaurant", quiet_regulars=[
        Row("id-1", "Customer 1", {"times": 4, "days": 40}),
        Row("id-2", "Customer 2", {"times": 4, "days": 40})])
    cards = view.render(f, "en")["suggestions"]
    assert ids(cards[1]) == {"id-3"}
    assert plain(cards[1]["line"]) == "1 regular is due back and has nothing booked."


def test_with_two_thin_days_both_cards_show_and_the_days_are_not_people():
    f = at_threshold(thin_days=[(TUE, 0.25), (SAT, 0.1)])
    cards = view.render(f, "en")["suggestions"]
    assert [c["key"] for c in cards] == ["fill_thin_day", "thin_days"]
    assert cards[1]["rows"] == []  # the thin_days card counts days, so there is nothing to share
    # Both name the quietest day (Saturday, 10% booked); this card is the one that names the
    # people, so it stays beside the one that counts the days.
    assert "Saturday 17 Oct" in plain(cards[0]["title"])
    assert "Saturday" in plain(cards[1]["line"])
    assert len(cards[0]["rows"]) == 3


def test_it_shows_in_the_first_week_because_it_has_a_screen_to_act_on():
    f = at_threshold(started=NOW - timedelta(days=3))
    assert "fill_thin_day" in keys(f)
    assert "due_back" not in keys(f)  # status-only: hidden in the first week


# ── the database half: bookings in PostgreSQL, read through facts.gather ──────

HOURS = (time(9, 0), time(17, 0))  # 480 opening minutes, every day


def local(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), DOHA)


def new_shop(name: str) -> str:
    """A shop with the bookings module, open 09:00 to 17:00 every day, and one service."""
    # Made 90 days before NOW, as the records below are, so the Agent sees a shop with a history.
    tenant = str(owner_sql("insert into tenants (name, business_type, created_at) "
                           "values ($1, 'salon', $2) returning id",
                           name, NOW - timedelta(days=90))[0]["id"])
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')", tenant)
    for weekday in range(7):
        owner_sql("insert into business_hours (tenant_id, weekday, opens, closes) "
                  "values ($1, $2, $3, $4)", tenant, weekday, *HOURS)
    return tenant


class Shop:
    def __init__(self, name: str):
        self.id = new_shop(name)
        self.number = 0
        self.service = owner_sql(
            "insert into services (tenant_id, name, duration_minutes) values ($1, 'Cut', 60) "
            "returning id", self.id)[0]["id"]

    def person(self, name: str):
        return owner_sql(
            "insert into contacts (tenant_id, phone, name) values ($1, $2, $3) returning id",
            self.id, f"+974{uuid4().int % 10**8:08d}", name)[0]["id"]

    def book(self, contact, start: datetime, minutes: int = 60, status: str = "booked"):
        self.number += 1
        owner_sql(
            "insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
            "starts_at, ends_at, status, created_at) "
            "values ($1, $2, $3, $4, 'Cut', $5, $6, $7, $8)",
            self.id, self.number, contact, self.service, start,
            start + timedelta(minutes=minutes), status, NOW - timedelta(days=80))

    def regular(self, name: str, last_ago: int = 62, visits: int = 3, gap: int = 14):
        """Completed visits `gap` days apart, the last `last_ago` days before NOW."""
        who = self.person(name)
        for i in range(visits):
            self.book(who, NOW - timedelta(days=last_ago + gap * (visits - 1 - i)),
                      status="completed")
        return who

    def week(self, thin: date | None = TUE, extra_thin: tuple = ()):
        """Two 2-hour bookings (50% of 480 minutes) on each of the next 7 days, except the
        thin ones, which get one hour (12.5%)."""
        busy = self.person("Busy")
        for offset in range(1, 8):
            day = THU + timedelta(days=offset)
            if day == thin or day in extra_thin:
                self.book(busy, local(day, 10), 60)
            else:
                self.book(busy, local(day, 10), 120)
                self.book(busy, local(day, 13), 120)


def read(shop_id: str, now: datetime = NOW) -> Facts:
    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(shop_id) as conn:
                return await agent_facts.gather(
                    conn, Staff(None, "Owner", "", "owner", shop_id), now)
        finally:
            await db.close()

    return asyncio.run(go())


def test_gather_gives_the_rule_the_thin_day_and_the_regulars_who_are_due():
    shop = Shop("Fill Thin Day Salon")
    shop.week()
    due = [shop.regular(f"Due {i}") for i in (1, 2, 3)]
    shop.regular("Came lately", last_ago=10)  # 3 visits, but inside 1.5 x the 14-day gap
    shop.regular("Two visits only", visits=2)
    booked_again = shop.regular("Booked again")
    shop.book(booked_again, local(TUE, 14), 60)  # nothing booked is the point: this one is out
    f = read(shop.id)

    assert [d for d, _ in f.thin_days] == [TUE]  # 60 of 480 + 60 of the booked-again visit
    assert f.thin_days[0][1] == pytest.approx(0.25)
    assert {r.id for r in f.due_back} == {str(d) for d in due}
    found = RULE.find(f)
    assert found is not None and found.n == 3
    assert found.numbers == {"day": TUE, "share": 25}
    en = [plain(p) for p in RULE.say(found, f, "en")]
    assert en == ["Tuesday 20 Oct is the quietest of the next 7 days, 25% booked",
                  "3 regulars are due back and have nothing booked."]
    # On the dashboard it is the only card: due_back is left with nobody.
    cards = view.render(f, "en")["suggestions"]
    assert [c["key"] for c in cards] == ["fill_thin_day"]
    assert {r["label"] for r in cards[0]["rows"]} == {"Due 1", "Due 2", "Due 3"}


def test_gather_is_quiet_one_short_of_either_threshold():
    two = Shop("Fill Thin Day Two")
    two.week()
    two.regular("Due 1")
    two.regular("Due 2")
    f = read(two.id)
    assert len(f.due_back) == 2 and f.thin_days
    assert RULE.find(f) is None
    assert [c["key"] for c in view.render(f, "en")["suggestions"]] == ["due_back"]

    full = Shop("Fill Thin Day Full")
    full.week(thin=None)  # every day at 50%: nothing is thin
    for i in (1, 2, 3):
        full.regular(f"Due {i}")
    f = read(full.id)
    assert len(f.due_back) == 3 and f.thin_days == []
    assert RULE.find(f) is None

    edge = Shop("Fill Thin Day Edge")  # 144 of 480 minutes is exactly 30%: not thin
    busy = edge.person("Busy")
    for offset in range(1, 8):
        day = THU + timedelta(days=offset)
        edge.book(busy, local(day, 10), 144 if day == TUE else 240)
    for i in (1, 2, 3):
        edge.regular(f"Due {i}")
    f = read(edge.id)
    assert f.thin_days == [] and RULE.find(f) is None


def test_another_shops_rows_never_show_up_and_an_empty_shop_says_nothing():
    mine = Shop("Fill Thin Day Mine")
    mine.week()
    mine_due = [mine.regular(f"Mine {i}") for i in (1, 2, 3)]

    theirs = Shop("Fill Thin Day Theirs")
    theirs.week(thin=SAT, extra_thin=(SAT + timedelta(days=1),))  # two thin days of their own
    for i in range(1, 6):
        theirs.regular(f"Theirs {i}")

    empty = Shop("Fill Thin Day Empty")  # the module, hours and a service, no bookings at all

    f = read(mine.id)
    assert {r.id for r in f.due_back} == {str(d) for d in mine_due}
    assert [d for d, _ in f.thin_days] == [TUE]
    assert RULE.find(f).n == 3
    other = read(theirs.id)
    assert len(other.due_back) == 5 and len(other.thin_days) == 2
    assert RULE.find(other).n == 5 and RULE.find(other).numbers["day"] == SAT

    nothing = read(empty.id)
    # Open hours and nobody booked is a thin week, but with nobody due back there is no card.
    assert len(nothing.thin_days) == 7 and nothing.due_back == []
    assert RULE.find(nothing) is None
    assert "fill_thin_day" not in [c["key"] for c in view.render(nothing, "en")["suggestions"]]

    # Without the bookings module the rule is not asked at all.
    owner_sql("update tenant_modules set enabled = false where tenant_id = $1", mine.id)
    off = read(mine.id)
    assert "bookings" not in off.modules
    assert "fill_thin_day" not in [c["key"] for c in view.render(off, "en")["suggestions"]]
