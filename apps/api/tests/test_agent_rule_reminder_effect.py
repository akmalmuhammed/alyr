"""Agent rule `reminder_effect` (number 36, plan row V4): no-shows with a reminder and without.

The first half is pure (Facts built by hand, no database): quiet just short of each threshold,
speaks at it, in both languages, never as a cause. The second half gathers from real
PostgreSQL through the tenant scope: what it counts, what it leaves out and says so, a second
shop whose rows must not show up, and an empty shop."""

import asyncio
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from alyr.core.auth import Staff
from alyr.db import Database
from alyr.modules.agent import facts as agent_facts
from alyr.modules.agent import view
from alyr.modules.agent.facts import Facts
from alyr.modules.agent.insights import INSIGHT_BY_KEY, INSIGHTS
from alyr.modules.agent.rules import RULES, gather_all, reminder_effect
from alyr.modules.agent.rules.reminder_effect import INSIGHT, KEY
from alyr.modules.agent.words import plain
from alyr.modules.bookings import service as bookings
from conftest import APP_DSN
from test_consent import owner_sql

NOW = datetime(2026, 10, 15, 13, 20, tzinfo=UTC)
ARABIC = re.compile(r"[؀-ۿ]")
BOOKINGS_ONLY = frozenset({"bookings"})


def counts(with_n=40, with_ns=2, without_n=40, without_ns=6, left_out=0) -> dict:
    return {"with_n": with_n, "with_ns": with_ns, "without_n": without_n,
            "without_ns": without_ns, "left_out": left_out}


def facts(extra=None, **values) -> Facts:
    base = {"now": NOW, "modules": BOOKINGS_ONLY, "business_type": "salon",
            "started": NOW - timedelta(days=60)}
    return Facts(**(base | values), extra={KEY: extra} if extra is not None else {})


def found(extra, **values):
    return INSIGHT.find(facts(extra, **values))


# ---------------------------------------------------------------- the registration

def test_the_rule_is_registered_with_its_number_and_a_status_not_an_action():
    assert reminder_effect in RULES
    assert INSIGHT_BY_KEY[KEY] is INSIGHT
    assert INSIGHT in INSIGHTS
    assert (INSIGHT.number, INSIGHT.kind, INSIGHT.module, INSIGHT.money) == (
        36, "knowledge", "bookings", False)
    # No workspace screen switches the reminders, so the card promises no action.
    assert INSIGHT.action is None and INSIGHT.status is not None
    assert "Information only" in INSIGHT.status.en
    assert "switch" in INSIGHT.status.en  # says the workspace has none; true today


def test_the_lead_time_in_the_words_is_the_one_the_reminder_uses():
    # The rule text and the Arabic card say "2 hours"; the reminder is queued for this long
    # before the start (`bookings.service.schedule_reminder`).
    assert bookings.REMIND_BEFORE == timedelta(hours=2)
    assert reminder_effect.LEAD_HOURS == 2
    assert "2 hours" in INSIGHT.rule.en and "بساعتين" in INSIGHT.rule.ar


# ---------------------------------------------------------------- quiet and speaking

def test_quiet_without_anything_gathered():
    assert INSIGHT.find(facts()) is None  # the rule's key is not in extra at all
    assert found(counts(with_n=0, with_ns=0, without_n=0, without_ns=0)) is None


def test_quiet_just_below_fifteen_in_either_group():
    # 0 of 14 reminded, 14 of 14 not: a huge gap, but 14 is too few to say it.
    assert found(counts(with_n=14, with_ns=0, without_n=40, without_ns=12)) is None
    assert found(counts(with_n=40, with_ns=0, without_n=14, without_ns=7)) is None
    # At fifteen in each it speaks.
    assert found(counts(with_n=15, with_ns=0, without_n=15, without_ns=3)) is not None


def test_quiet_when_the_gap_is_four_points_and_speaks_at_five():
    # 1 of 25 is 4%, 2 of 25 is 8%: four points.
    assert found(counts(with_n=25, with_ns=1, without_n=25, without_ns=2)) is None
    # 1 of 20 is 5%, 2 of 20 is 10%: five points.
    got = found(counts(with_n=20, with_ns=1, without_n=20, without_ns=2))
    assert got is not None and got.numbers == {"with": 5, "without": 10}


def test_quiet_when_reminded_bookings_do_worse_or_the_same():
    assert found(counts(with_ns=10, without_ns=10)) is None
    assert found(counts(with_ns=14, without_ns=2)) is None
    assert found(counts(with_ns=0, without_ns=0)) is None


def test_quiet_when_nearly_everything_was_reminded():
    # Reminders were on all along: the few bookings without one are too few to compare.
    assert found(counts(with_n=180, with_ns=7, without_n=6, without_ns=3)) is None
    # And a shop that never had them has no reminded group at all.
    assert found(counts(with_n=0, with_ns=0, without_n=200, without_ns=30)) is None


def test_the_percentages_are_rounded_once_half_up_and_the_card_says_what_the_rule_used():
    assert reminder_effect._pct(1, 8) == 13  # 12.5 goes up (round() would say 12)
    assert reminder_effect._pct(1, 15) == 7 and reminder_effect._pct(2, 15) == 13
    # 1 of 15 shows 7%, 2 of 15 shows 13%: six points, and the card shows 7% and 13%.
    got = found(counts(with_n=15, with_ns=1, without_n=15, without_ns=2))
    assert got is not None and got.numbers == {"with": 7, "without": 13}
    # 1 of 8... but with 15 minimum: 4 of 30 is 13%, 7 of 30 is 23%.
    assert found(counts(with_n=30, with_ns=4, without_n=30, without_ns=7)).numbers == {
        "with": 13, "without": 23}


def test_the_finding_counts_every_booking_compared_and_has_no_rows():
    got = found(counts(with_n=50, with_ns=2, without_n=50, without_ns=7))
    assert got.rows == [] and got.n == 100
    # A card set aside with "Not now" comes back when the rates change, not when a booking is
    # added to the counts.
    same_rates = found(counts(with_n=100, with_ns=4, without_n=100, without_ns=14))
    assert got.fingerprint(KEY) == same_rates.fingerprint(KEY)
    other = found(counts(with_n=50, with_ns=2, without_n=50, without_ns=8))
    assert got.fingerprint(KEY) != other.fingerprint(KEY)


# ---------------------------------------------------------------- the words

def said(extra, lang, **values):
    f = facts(extra, **values)
    got = INSIGHT.find(f)
    assert got is not None
    first, second = INSIGHT.say(got, f, lang)
    return plain(first), plain(second)


def test_the_title_says_what_happened_in_the_briefs_words():
    title, line = said(counts(with_n=50, with_ns=2, without_n=50, without_ns=7), "en")
    assert title == "Bookings with a reminder were no-shows 4% of the time, without one 14%"
    assert line == (
        "In 90 days: 50 bookings with a reminder, 50 bookings without. "
        "This is what happened, not why."
    )


def test_the_card_says_what_it_left_out_and_when_reminders_are_off():
    extra = counts(with_n=50, with_ns=2, without_n=50, without_ns=7, left_out=12)
    _, line = said(extra, "en")
    assert "Left out: 12 bookings made under 2 hours before the start, walk-ins, and " \
           "bookings whose deposit was not paid." in line
    assert "Reminders are off now." not in line
    _, off = said(extra, "en", booking_reminders=False)
    assert off.endswith("Reminders are off now.")
    _, nothing_left_out = said(counts(left_out=0), "en")
    assert "Left out" not in nothing_left_out


def test_both_languages_are_whole_clean_and_never_say_why_or_money():
    for extra in (counts(), counts(left_out=1), counts(left_out=2), counts(left_out=11)):
        for lang in ("en", "ar"):
            for reminders in (True, False):
                title, line = said(extra, lang, booking_reminders=reminders)
                for text in (title, line):
                    assert text.strip()
                    assert "{" not in text and "}" not in text, text
                    assert not re.search(
                        r"\b(ai|smart|learns?|thinks?|noticed|predicts?|soon|because|caused?|"
                        r"proves?|QAR)\b", text.lower()), text
                    assert "قريباً" not in text and "ر.ق" not in text
                    assert bool(ARABIC.search(text)) == (lang == "ar"), text
    ar_title, ar_line = said(counts(with_n=50, with_ns=2, without_n=50, without_ns=7,
                                    left_out=3), "ar")
    assert "4%" in ar_title and "14%" in ar_title
    assert "50 حجزاً" in ar_line and "3 حجوزات" in ar_line and "90" in ar_line


def test_arabic_counts_agree_with_their_noun():
    _, one = said(counts(with_n=21, with_ns=0, without_n=15, without_ns=3, left_out=1), "ar")
    assert "21 حجزاً" in one and "15 حجزاً" in one and "المستبعد: حجز واحد،" in one
    _, two = said(counts(left_out=2), "ar")
    assert "حجزان" in two
    _, few = said(counts(with_n=40, without_n=40, left_out=7), "ar")
    assert "7 حجوزات" in few


def test_the_rule_line_names_the_bookings_compared():
    f = facts(counts(with_n=50, with_ns=2, without_n=50, without_ns=7))
    cards = view.render(f, "en")["suggestions"]
    [card] = [c for c in cards if c["key"] == KEY]
    assert card["rule"].startswith("RULE · last 90 days of bookings")
    assert card["rule"].endswith("· 100 bookings")
    assert card["status"].startswith("Information only.") and card["action"] is None
    ar = [c for c in view.render(f, "ar")["suggestions"] if c["key"] == KEY][0]
    assert ar["rule"].startswith("القاعدة · آخر 90 يوماً") and ar["rule"].endswith("100 حجزاً")


def test_staff_who_may_not_see_money_still_see_it_because_it_shows_no_money():
    f = facts(counts(), money=False)
    assert INSIGHT.money is False
    cards = view.render(f, "en")["suggestions"]
    assert KEY in [c["key"] for c in cards]
    assert "QAR" not in str(view.render(f, "en")["suggestions"])


def test_a_shop_without_bookings_never_has_it():
    f = facts(counts(), modules=frozenset({"orders", "inbox"}))
    assert KEY not in [c["key"] for c in view.render(f, "en")["suggestions"]]


# ---------------------------------------------------------------- the real database

DAY = timedelta(days=1)


def make_shop(name: str, with_bookings_module: bool = True) -> tuple[UUID, UUID, UUID]:
    """A shop with one customer and one service. Past bookings cannot be made through the
    product (it books ahead), so the rows are written as the database owner."""
    # Started 60 days before NOW, so the screen is past its first week.
    tenant = owner_sql(
        "insert into tenants (name, created_at) values ($1, $2) returning id",
        f"{name} {uuid4().hex[:6]}", NOW - 60 * DAY,
    )[0]["id"]
    if with_bookings_module:
        owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')",
                  tenant)
    contact = owner_sql(
        "insert into contacts (tenant_id, phone, name) values ($1, $2, 'Sara') returning id",
        tenant, f"+974{uuid4().int % 10**8:08d}",
    )[0]["id"]
    service = owner_sql(
        "insert into services (tenant_id, name, duration_minutes, price) "
        "values ($1, 'Blow-dry', 30, 8000) returning id", tenant,
    )[0]["id"]
    return tenant, contact, service


def add(tenant, contact, service, n, status="completed", *, reminded=False, days_ago=5,
        lead=timedelta(hours=48), walk_in=False, deposit_state="none"):
    """`n` bookings that started `days_ago` days before NOW (a few minutes apart) and were
    made `lead` before they started."""
    first = owner_sql(
        "select coalesce(max(number), 0) + 1 as n from bookings where tenant_id = $1", tenant
    )[0]["n"]
    owner_sql(
        "insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
        "starts_at, ends_at, status, reminded_at, created_at, walk_in, deposit, deposit_state) "
        "select $1, $2 + i, $3, $4, 'Blow-dry', "
        "       $5::timestamptz - make_interval(days => $6) + make_interval(mins => 40 * i), "
        "       $5::timestamptz - make_interval(days => $6) + make_interval(mins => 40 * i + 30), "
        "       $7, case when $8 then $5::timestamptz - make_interval(days => $6) "
        "                              - interval '2 hours' else null end, "
        "       $5::timestamptz - make_interval(days => $6) + make_interval(mins => 40 * i) "
        "         - $9::interval, $10, case when $11 = 'none' then 0 else 5000 end, $11 "
        "from generate_series(0, $12 - 1) as i",
        tenant, first, contact, service, NOW, days_ago, status, reminded, lead, walk_in,
        deposit_state, n,
    )


def gathered(tenant: UUID, modules=BOOKINGS_ONLY) -> Facts:
    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(tenant) as conn:
                f = Facts(now=NOW, modules=modules)
                await gather_all(conn, f)
                return f
        finally:
            await db.close()

    return asyncio.run(go())


def numbers(f: Facts) -> dict:
    return f.extra[KEY]


def test_gather_counts_the_two_groups_and_says_what_it_left_out():
    tenant, contact, service = make_shop("Reminders")
    add(tenant, contact, service, 29, "completed", reminded=True)
    add(tenant, contact, service, 1, "no_show", reminded=True)
    add(tenant, contact, service, 17, "completed")
    add(tenant, contact, service, 3, "no_show")
    # Left out: made 1 hour before the start (no reminder could be queued), a walk-in (made
    # long before, so only its flag leaves it out), a booking whose deposit is still due, and
    # one whose deposit expired.
    add(tenant, contact, service, 4, "completed", lead=timedelta(hours=1))
    add(tenant, contact, service, 1, "no_show", lead=timedelta(minutes=30))
    add(tenant, contact, service, 2, "completed", walk_in=True)
    add(tenant, contact, service, 1, "completed", deposit_state="due")
    add(tenant, contact, service, 1, "no_show", deposit_state="expired")
    # Not counted at all: other statuses, older than 90 days, not started yet.
    add(tenant, contact, service, 5, "cancelled")
    add(tenant, contact, service, 5, "booked", days_ago=-3)
    add(tenant, contact, service, 6, "no_show", days_ago=91)
    add(tenant, contact, service, 2, "completed", days_ago=0, lead=timedelta(hours=48))

    f = gathered(tenant)
    # Made exactly 2 hours ahead is eligible (a reminder could have been queued).
    assert numbers(f) == {"with_n": 30, "with_ns": 1, "without_n": 20, "without_ns": 3,
                          "left_out": 9}
    got = INSIGHT.find(f)
    assert got is not None and got.numbers == {"with": 3, "without": 15} and got.n == 50


def test_a_booking_made_exactly_two_hours_ahead_counts_and_one_minute_less_does_not():
    tenant, contact, service = make_shop("Boundary")
    add(tenant, contact, service, 1, "completed", lead=timedelta(hours=2))
    add(tenant, contact, service, 1, "completed", lead=timedelta(hours=2) - timedelta(minutes=1))
    assert numbers(gathered(tenant)) == {"with_n": 0, "with_ns": 0, "without_n": 1,
                                         "without_ns": 0, "left_out": 1}


def test_the_ninety_day_window_includes_its_first_day_and_stops_at_now():
    tenant, contact, service = make_shop("Window")
    add(tenant, contact, service, 1, "no_show", days_ago=90)
    add(tenant, contact, service, 1, "no_show", days_ago=91)
    # starts at NOW and a minute later: not over yet
    owner_sql(
        "insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
        "starts_at, ends_at, status, created_at) values ($1, 900, $2, $3, 'x', $4, $5, "
        "'completed', $6)",
        tenant, contact, service, NOW, NOW + timedelta(minutes=30), NOW - 3 * DAY,
    )
    f = gathered(tenant)
    assert numbers(f)["without_n"] == 1 and numbers(f)["without_ns"] == 1


def test_a_second_shop_never_shows_up_in_the_first_and_an_empty_shop_is_quiet():
    mine, my_contact, my_service = make_shop("Mine")
    add(mine, my_contact, my_service, 20, "completed", reminded=True)
    add(mine, my_contact, my_service, 20, "completed")
    add(mine, my_contact, my_service, 4, "no_show")
    theirs, their_contact, their_service = make_shop("Theirs")
    add(theirs, their_contact, their_service, 100, "no_show", reminded=True)
    add(theirs, their_contact, their_service, 60, "completed")
    empty, _, _ = make_shop("Empty")

    assert numbers(gathered(mine)) == {"with_n": 20, "with_ns": 0, "without_n": 24,
                                       "without_ns": 4, "left_out": 0}
    assert numbers(gathered(theirs)) == {"with_n": 100, "with_ns": 100, "without_n": 60,
                                         "without_ns": 0, "left_out": 0}
    nobody = gathered(empty)
    assert numbers(nobody) == {"with_n": 0, "with_ns": 0, "without_n": 0, "without_ns": 0,
                               "left_out": 0}
    assert INSIGHT.find(nobody) is None
    # Mine speaks (0% against 17%), theirs does not (reminded did worse).
    assert INSIGHT.find(gathered(mine)).numbers == {"with": 0, "without": 17}
    assert INSIGHT.find(gathered(theirs)) is None


def test_a_shop_whose_reminders_were_always_on_is_quiet():
    tenant, contact, service = make_shop("Always on")
    add(tenant, contact, service, 90, "completed", reminded=True)
    add(tenant, contact, service, 3, "no_show", reminded=True)
    # Same-day bookings never had one: they are left out, not made into a group.
    add(tenant, contact, service, 30, "completed", lead=timedelta(minutes=45))
    add(tenant, contact, service, 6, "no_show", lead=timedelta(minutes=45))
    f = gathered(tenant)
    assert numbers(f) == {"with_n": 93, "with_ns": 3, "without_n": 0, "without_ns": 0,
                          "left_out": 36}
    assert INSIGHT.find(f) is None


def test_only_a_shop_with_bookings_gathers_it():
    tenant, contact, service = make_shop("No module", with_bookings_module=False)
    add(tenant, contact, service, 20, "no_show")
    assert KEY not in gathered(tenant, modules=frozenset({"orders"})).extra


def test_the_whole_gathering_carries_it_to_the_agent_screen_for_a_signed_in_owner():
    tenant, contact, service = make_shop("Whole path")
    add(tenant, contact, service, 40, "completed", reminded=True)
    add(tenant, contact, service, 40, "completed")
    add(tenant, contact, service, 8, "no_show")

    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(tenant) as conn:
                staff = Staff(None, "Owner", "", "owner", tenant)
                return await agent_facts.gather(conn, staff, NOW)
        finally:
            await db.close()

    f = asyncio.run(go())
    assert numbers(f) == {"with_n": 40, "with_ns": 0, "without_n": 48, "without_ns": 8,
                          "left_out": 0}
    cards = view.render(f, "en")["suggestions"]
    [card] = [c for c in cards if c["key"] == KEY]
    assert plain(card["title"]) == (
        "Bookings with a reminder were no-shows 0% of the time, without one 17%")
