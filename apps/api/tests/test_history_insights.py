"""What ALYR Insights reads from an imported visit history (D-197, D-198, spec 070): the Agent's
booking rules, its busiest-hours grid and week, and the weekly report, on the invented salon file.

Every expected number is worked out here from the CSV itself, in plain Python, with the rule's own
definition, never by asking the importer or the Agent. Today for the Agent is Saturday 21 Nov 2026.
"""

from collections import Counter
from datetime import UTC, date, datetime, timedelta
from statistics import median
from zoneinfo import ZoneInfo

import pytest

from alyr.modules import report
from alyr.modules.agent import facts as facts_
from alyr.modules.agent import view
from alyr.modules.agent.insights import INSIGHT_BY_KEY
from alyr.modules.bookings import report as bookings_report
from history_support import NOW, do_import, make_business, run_in, sql, staff_of, unique_rows

DOHA = ZoneInfo("Asia/Qatar")


@pytest.fixture
def office(client_factory):
    return client_factory()


def visit_time(row: dict) -> datetime:
    """When a row of the file happened, as the importer must read it (Doha time)."""
    day = row["Date"]
    if "/" in day:
        d, m, y = day.split("/")
        day = f"{y}-{m}-{d}"
    clock = row["Start Time"]
    if clock.endswith(("AM", "PM")):
        clock = datetime.strptime(clock, "%I:%M %p").strftime("%H:%M")
    return datetime.fromisoformat(f"{day}T{clock}").replace(tzinfo=DOHA).astimezone(UTC)


ROWS = [(visit_time(r), r) for r in unique_rows()]


def count_where(status: str, start: datetime, end: datetime) -> int:
    return sum(1 for at, r in ROWS if r["Status"] == status and start <= at < end)


def gather(shop):
    async def go(conn):
        return await facts_.gather(conn, staff_of(shop), NOW)

    return run_in(shop, go)


@pytest.fixture
def salon(office):
    shop = make_business(office, ["bookings"])
    before = gather(shop)
    do_import(office, shop)
    return shop, before, gather(shop)


# ── the Agent ────────────────────────────────────────────────────────────────────────────


def test_the_week_and_the_thirty_days_are_counted_from_the_file(salon):
    _, _, f = salon
    week = datetime(2026, 11, 14, 21, 0, tzinfo=UTC)  # Sunday 15 Nov 00:00 in Doha
    assert f.visits == count_where("Completed", week, NOW)
    last = (week - timedelta(days=7), NOW - timedelta(days=7))
    assert f.visits_last == count_where("Completed", *last)
    assert f.no_shows_week == count_where("No show", week, NOW)
    month = (NOW - timedelta(days=30), NOW)
    assert f.completed_30 == count_where("Completed", *month) > 40
    assert f.no_shows_30 == count_where("No show", *month) >= 3
    assert f.unmarked == [] and f.booked_ahead == 0 and f.repeat_no_shows == []


def test_a_week_compares_with_the_week_before_from_the_first_day(salon):
    _, before, f = salon
    # Without the history the business looks a day old; with it, it has a past to compare with.
    assert before.first_week and not f.first_week
    assert f.comparisons_from <= f.today
    assert f.has_records


def test_the_booking_rules_fire_from_the_imported_visits(salon):
    _, _, f = salon
    fired = {key for key, rule in INSIGHT_BY_KEY.items() if rule.find(f) is not None}
    assert {"no_show_rate", "quiet_regulars", "due_back", "late_cancellations"} <= fired
    rate = INSIGHT_BY_KEY["no_show_rate"].find(f)
    assert rate.numbers["rate"] >= 10 and rate.n == f.no_shows_30
    # The ones that look at what is booked ahead say nothing: ALYR holds nothing booked ahead.
    assert not {"unmarked", "repeat_no_show", "thin_days", "booked_value", "unconfirmed"} & fired
    for key in ("no_show_rate", "quiet_regulars", "due_back", "late_cancellations"):
        finding = INSIGHT_BY_KEY[key].find(f)
        for lang in ("en", "ar"):
            title, line = INSIGHT_BY_KEY[key].say(finding, f, lang)
            assert str(title) and str(line)


def test_quiet_regulars_and_those_due_back_are_the_ones_the_file_says(salon):
    _, _, f = salon
    by_client: dict[str, list[datetime]] = {}
    for at, r in ROWS:
        if r["Status"] == "Completed":
            by_client.setdefault(r["Client ID"], []).append(at)
    window = (NOW - timedelta(days=120), NOW - timedelta(days=30))
    quiet = {c for c, visits in by_client.items()
             if sum(1 for v in visits if window[0] <= v < window[1]) >= 3
             and max(visits) < window[1]}
    due = set()
    for c, visits in by_client.items():
        visits.sort()
        if len(visits) < 3:
            continue
        usual = median((b - a).total_seconds() / 86400 for a, b in zip(visits, visits[1:],
                                                                        strict=False))
        if usual > 0 and (NOW - visits[-1]).total_seconds() / 86400 > 1.5 * usual:
            due.add(c)
    assert len(f.quiet_regulars) == len(quiet) >= 3
    assert len(f.due_back) == len(due) >= 1


def test_late_cancellations_count_only_cancellations_the_file_gives_a_time_for(salon):
    _, _, f = salon
    late = 0
    for at, r in ROWS:
        if r["Status"] == "Cancelled" and r["Cancelled At"]:
            cancelled = datetime.fromisoformat(r["Cancelled At"]).replace(tzinfo=DOHA)
            if NOW - timedelta(days=30) <= cancelled < NOW and cancelled > at - timedelta(hours=24):
                late += 1
    assert f.late_cancellations == late >= 3


def test_the_busiest_hours_grid_is_the_files_own_counts(salon):
    _, _, f = salon
    grid = Counter()
    for at, r in ROWS:
        if r["Status"] in ("Completed", "No show") and NOW - timedelta(days=28) <= at < NOW:
            local = at.astimezone(DOHA)
            grid[((local.weekday() + 1) % 7, local.hour)] += 1  # Sunday first, as the Agent has it
    assert dict(f.hours_grid) == dict(grid) and f.hours_total == sum(grid.values()) >= 50
    shown = view.render(f, "en")["hours"]
    assert shown is not None
    assert view.render(f, "ar")["hours"] is not None


def test_the_dashboard_has_something_real_to_say_in_both_languages(salon):
    _, _, f = salon
    for lang in ("en", "ar"):
        built = view.render(f, lang)
        assert built["state"] not in ("empty", "first_week")
        assert any(k["key"] == "visits" for k in built["kpis"]), built["kpis"]
        assert built["week"] is not None and built["top"] is not None
        assert built["placeholders"] == []


def test_a_shop_that_makes_its_own_bookings_still_sees_thin_days(salon):
    shop, _, imported_only = salon
    # Hours for every day, and one booking of the shop's own, made in ALYR for next week.
    for weekday in range(7):
        sql("insert into business_hours (tenant_id, weekday, opens, closes) "
            "values ($1, $2, '09:00', '21:00')", shop, weekday)
    service = sql("insert into services (tenant_id, name, duration_minutes, price) "
                  "values ($1, 'Haircut', 60, 12000) returning id", shop)[0]["id"]
    contact = sql("insert into contacts (tenant_id, phone, name) values ($1, '97455500777', "
                  "'Own customer') returning id", shop)[0]["id"]
    assert imported_only.live_bookings is False
    assert gather(shop).thin_days == []  # nothing is booked ahead in ALYR: not "thin", unknown
    sql("insert into bookings (tenant_id, number, contact_id, service_id, service_name, starts_at, "
        "ends_at, created_at) values ($1, 90001, $2, $3, 'Haircut', $4, $5, $6)", shop, contact,
        service, NOW + timedelta(days=3), NOW + timedelta(days=3, hours=1),
        NOW - timedelta(days=1))
    after = gather(shop)
    assert after.live_bookings is True and len(after.thin_days) >= 2
    assert after.booked_ahead == 1


# ── the weekly report ────────────────────────────────────────────────────────────────────


def test_the_weekly_report_counts_the_imported_week(salon):
    shop, _, _ = salon
    week = date(2026, 11, 8)  # Sunday to Saturday, 8 to 14 Nov
    start = datetime(2026, 11, 7, 21, 0, tzinfo=UTC)
    end = start + timedelta(days=7)

    async def go(conn):
        return await report.build(conn, week)

    built = run_in(shop, go)
    section = next(s for s in built["sections"] if s["key"] == "bookings")
    numbers = section["numbers"]
    assert numbers["came"] == count_where("Completed", start, end) > 0
    assert numbers["no_shows"] == count_where("No show", start, end)
    assert numbers["cancelled"] == count_where("Cancelled", start, end)
    assert numbers["unmarked"] == 0
    before = section["before"]
    assert before["came"] == count_where("Completed", start - timedelta(days=7), start)
    for lang in ("en", "ar"):
        lines = bookings_report.lines(numbers, before, lang)
        assert lines and all(isinstance(x, str) and x for x in lines)
        assert bookings_report.headline(numbers, lang)
