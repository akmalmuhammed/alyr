"""What an imported visit history looks like on the Agent and in the weekly report (task I5,
D-197, D-198, spec 070): the dashboard says where the numbers come from and how far they go, an
imported-only shop is never shown a "0" for what ALYR does not count (booked ahead, reminders
sent, new bookings), the report says what it counts and from when, and a second shop with live
bookings keeps all of it. The salon and its numbers are invented."""

from datetime import UTC, date, datetime, timedelta

import pytest

from alyr.modules import report
from alyr.modules.agent import facts as facts_
from alyr.modules.agent import view, week
from alyr.modules.agent.words import plain
from history_support import NOW, do_import, make_business, run_in, sql, staff_of

OPTIONS = {"source": "the salon booking system", "exported_on": "2026-11-20"}
WEEK = date(2026, 11, 15)  # a Sunday inside the file


@pytest.fixture
def office(client_factory):
    return client_factory()


def gather(shop):
    async def go(conn):
        return await facts_.gather(conn, staff_of(shop), NOW)

    return run_in(shop, go)


def imported_salon(office):
    shop = make_business(office, ["bookings"])
    do_import(office, shop, options=OPTIONS)
    return shop


def live_salon(office):
    """A salon whose bookings are made in ALYR: one visit ahead, made by a customer."""
    shop = make_business(office, ["bookings"])
    service = sql("insert into services (tenant_id, name, duration_minutes, price) "
                  "values ($1, 'Cut', 30, 5000) returning id", shop)[0]["id"]
    who = sql("insert into contacts (tenant_id, phone, wa_user_id, name, role) "
              "values ($1, '+97455599001', '97455599001', 'Live customer', 'customer') "
              "returning id", shop)[0]["id"]
    sql("insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
        "starts_at, ends_at, status, price, created_at) values ($1, 1, $2, $3, 'Cut', $4, $5, "
        "'booked', 5000, $6)", shop, who, service, NOW + timedelta(days=2),
        NOW + timedelta(days=2, minutes=30), NOW - timedelta(days=1))
    return shop


def test_the_agent_says_where_an_imported_shops_numbers_come_from(office):
    f = gather(imported_salon(office))
    assert f.data_source["source"] == "the salon booking system" and f.imported_only
    en, ar = view.render(f, "en"), view.render(f, "ar")
    assert plain(en["data_source"]) == (
        "From the salon booking system: visits 6 Sep 2026 to 20 Nov 2026, file exported "
        "20 Nov 2026.")
    said = plain(ar["data_source"])
    assert "من the salon booking system" in said and "6 سبتمبر 2026" in said
    assert "20 نوفمبر 2026" in said and "{" not in said


def test_an_imported_only_shop_is_shown_no_zero_for_what_alyr_does_not_count(office):
    f = gather(imported_salon(office))
    assert f.booked_ahead == 0 and f.live_bookings is False
    for lang in ("en", "ar"):
        v = view.render(f, lang)
        keys = [k["key"] for k in v["kpis"]]
        assert "booked_ahead" not in keys and "new_bookings" not in keys and "visits" in keys
        summary = " ".join(plain(s["text"]) for s in v["header"]["summary"])
        assert "booked for the next 7 days" not in summary and "المحجوز للأيام" not in summary
        assert not any(d.get("booked") for d in v["week"]["days"])
        assert "Booked, next 7 days" not in str(v) and "New bookings this week" not in str(v)


def test_the_weekly_report_says_what_it_counts_and_from_when(office):
    shop = imported_salon(office)

    async def build(conn):
        built = await report.build(conn, WEEK)
        return built, await report._shop(conn)

    built, shop_names = run_in(shop, build)
    bookings = next(s for s in built["sections"] if s["key"] == "bookings")
    assert bookings["numbers"]["from"]["first_visit_on"] == "2026-09-06"
    for lang in ("en", "ar"):
        text = report.render(built, shop_names, lang)["text"]
        assert "Reminders" not in text and "Booked for next week" not in text
        assert "New bookings made" not in text and "تذكيرات" not in text
        assert "محجوز للأسبوع القادم" not in text and "حجوزات جديدة" not in text
        assert ("From the salon booking system" if lang == "en" else "من the salon") in text
    text = report.render(built, shop_names, "en")["text"]
    assert "Customers who came:" in text and "20 Nov 2026" in text


def test_the_card_text_under_the_report_says_it_too(office):
    shop = imported_salon(office)

    async def read(conn):
        return await week.read(conn, WEEK, NOW)

    w = run_in(shop, read)
    en = week.message(w, "en")["caption"]
    assert "From the salon booking system: visits 6 Sep 2026 to 20 Nov 2026" in en
    assert "booked for this week" not in en
    assert "booked ahead" not in str(week.key_facts(w, "en")).lower()


def test_a_shop_with_live_bookings_keeps_booked_ahead_and_has_no_data_source(office):
    f = gather(live_salon(office))
    assert f.data_source is None and f.live_bookings and f.booked_ahead == 1
    v = view.render(f, "en")
    assert v["data_source"] is None
    assert "booked_ahead" in [k["key"] for k in v["kpis"]]

    async def build(conn):
        return await report.build(conn, WEEK)

    built = run_in(live_salon(office), build)
    text = report.render(built, {"en": "Live", "ar": "حي"}, "en")["text"]
    assert "Booked for next week:" in text and "From " not in text


def test_one_shops_import_is_never_another_shops_data_source(office):
    mine, theirs = imported_salon(office), make_business(office, ["bookings"])
    assert gather(mine).data_source is not None
    other = gather(theirs)
    assert other.data_source is None and view.render(other, "en")["data_source"] is None


def test_the_sunday_line_for_an_imported_shop_names_the_owners_email(office, monkeypatch):
    async def owners(conn):
        return ["owner@realsalon.qa"]

    monkeypatch.setattr(report.mail, "configured", lambda: True)
    monkeypatch.setattr(report, "_owner_emails", owners)
    v = view.render(gather(imported_salon(office)), "en")
    assert plain(v["report"]) == "Your report goes to 1 email address on Sunday at 9:00."
    monkeypatch.setattr(report.mail, "configured", lambda: False)
    off = view.render(gather(imported_salon(office)), "en")
    assert "No number or email address receives the Sunday report yet." == plain(off["report"])


def test_reading_an_imported_shop_sends_nothing_to_anyone(office):
    shop = imported_salon(office)
    before = [sql(f"select count(*) as n from {t} where tenant_id = $1", shop)[0]["n"]
              for t in ("messages", "jobs", "consents", "review_requests")]
    f = gather(shop)
    view.render(f, "en")
    week.message(run_in(shop, lambda conn: week.read(conn, WEEK, NOW)), "en")
    after = [sql(f"select count(*) as n from {t} where tenant_id = $1", shop)[0]["n"]
             for t in ("messages", "jobs", "consents", "review_requests")]
    assert before == after and datetime.now(UTC)
