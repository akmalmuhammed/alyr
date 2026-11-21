"""Reading a messy export of past visits (D-197, spec 070): column names in English and Arabic,
dates in every shape a salon's system writes them, times with AM and PM in two languages, Arabic
digits, the same visit twice, a visit with no stylist, and the problems a row can have, each with
its number and its words in both languages. The pure half first, then through the back office's
door.
"""

from datetime import UTC, date, datetime, time
from decimal import Decimal

import pytest

from alyr.modules.history import plan
from alyr.modules.items import xlsx
from history_support import count, csv_of, make_business, preview, sql, upload

SALT = bytes.fromhex("ab" * 16)
NOW = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)


def build(rows, options=None, mapping=None, **kw):
    headers = plan.headers_of(rows)
    return plan.build(rows, mapping if mapping is not None else plan.auto_mapping(headers),
                      options or {}, tz="Asia/Qatar", salt=SALT, now=NOW, **kw)


EN = ["Appointment ID", "Client ID", "Service", "Staff", "Date", "Start Time", "Price", "Status"]
AR = ["رقم الموعد", "رقم العميل", "الخدمة", "الموظفة", "التاريخ", "الوقت", "السعر", "الحالة"]


# ── column names ─────────────────────────────────────────────────────────────────────────


def test_columns_are_found_by_name_in_english_and_arabic():
    english = plan.auto_mapping(EN)
    arabic = plan.auto_mapping(AR)
    assert set(english) == set(arabic) == {
        "visit_id", "client_id", "service", "stylist", "date", "time", "price", "status"}
    assert plan.missing_required(english, {}) == [] == plan.missing_required(arabic, {})
    # A unit in brackets is not part of the name, and spellings of alef and ya do not matter.
    assert plan.auto_mapping(["Price (QAR)", "Duration (min)", "الإجمالي", "الحاله"]) == {
        "price": "Price (QAR)", "duration": "Duration (min)", "status": "الحاله"}


def test_a_file_needs_a_date_a_service_a_status_and_some_way_to_tell_clients_apart():
    assert plan.missing_required({}, {}) == ["date", "service", "status", "client_id"]
    only_phone = plan.auto_mapping(["Date", "Service", "Status", "Mobile"])
    assert plan.missing_required(only_phone, {}) == []
    # Without a status column, staff may say every row is a visit that came.
    no_status = plan.auto_mapping(["Date", "Service", "Mobile"])
    assert plan.missing_required(no_status, {}) == ["status"]
    assert plan.missing_required(no_status, {"default_status": "completed"}) == []
    built = build([["Date", "Service", "Name"], ["2026-11-02 10:00", "Haircut", "Noor"]])
    assert [p.code for p in built.problems] == ["missing_column"]
    assert built.problems[0].en and built.problems[0].ar and built.problems[0].row == 1


# ── dates and times ──────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("text, day", [
    ("2026-11-02", date(2026, 11, 2)), ("2026/11/05", date(2026, 11, 5)),
    ("03/11/2026", date(2026, 11, 3)), ("3.11.26", date(2026, 11, 3)),
    ("21-Nov-2026", date(2026, 11, 21)), ("Nov 21, 2026", date(2026, 11, 21)),
    ("4 نوفمبر 2026", date(2026, 11, 4)), ("٢١/١١/٢٠٢٦", date(2026, 11, 21)),
    ("2026-11-21T14:30:00", date(2026, 11, 21)),
])
def test_dates_are_read_in_every_shape_a_system_writes_them(text, day):
    assert plan.parse_day(text).day == day


def test_a_date_that_is_not_one_is_not_read():
    assert plan.parse_day("31/02/2026") is None and plan.parse_day("next week") is None
    assert plan.parse_day("") is None and plan.parse_day(None) is None
    # An Excel cell that holds only a time of day is not a date.
    assert plan.parse_day(datetime(1899, 12, 30, 14, 30)) is None


def test_day_first_is_the_default_and_month_first_is_a_choice_with_a_note():
    assert plan.parse_day("03/04/2026").day == date(2026, 4, 3)
    assert plan.parse_day("03/04/2026").ambiguous
    assert plan.parse_day("03/04/2026", "mdy").day == date(2026, 3, 4)
    assert not plan.parse_day("23/04/2026").ambiguous  # only one way to read it
    rows = [EN, ["A1", "C1", "Haircut", "Reem", "03/04/2026", "10:30", "120", "Completed"]]
    assert [n["code"] for n in build(rows).notes] == ["dates_day_first"]
    assert build(rows, {"date_order": "mdy"}).notes == []
    assert build(rows).visits[0].day == date(2026, 4, 3)
    assert build(rows, {"date_order": "mdy"}).visits[0].day == date(2026, 3, 4)


@pytest.mark.parametrize("text, clock", [
    ("14:30", time(14, 30)), ("2:30 PM", time(14, 30)), ("2:30 م", time(14, 30)),
    ("11:00 AM", time(11, 0)), ("11 ص", time(11, 0)), ("12:15 am", time(0, 15)),
    ("12:00 PM", time(12, 0)), ("٠٩:٣٠", time(9, 30)), ("9.30", time(9, 30)),
])
def test_times_are_read_with_am_and_pm_in_two_languages(text, clock):
    assert plan.parse_clock(text) == clock


def test_an_excel_time_cell_is_a_time_whatever_day_it_carries():
    assert plan.parse_clock(datetime(1899, 12, 31, 9, 30)) == time(9, 30)
    assert plan.parse_clock(time(17, 5)) == time(17, 5)


def test_a_time_that_is_not_one_is_not_read():
    for text in ("25:00", "13:00 PM", "noon", "10:75", ""):
        assert plan.parse_clock(text) is None


# ── statuses, phones, keys ───────────────────────────────────────────────────────────────


def test_statuses_in_both_languages_and_the_ones_that_are_not_final():
    assert [plan.status_of(x) for x in ("Completed", "done", "حضر", "مكتمل")] == ["completed"] * 4
    assert [plan.status_of(x) for x in ("No-Show", "no show", "لم يحضر", "غياب")] == ["no_show"] * 4
    assert [plan.status_of(x) for x in ("Cancelled", "canceled", "ملغي", "الغاء")] == [
        "cancelled"] * 4
    assert [plan.status_of(x) for x in ("Booked", "pending", "محجوز", "مؤكد")] == [
        "not_final"] * 4
    assert plan.status_of("who knows") is None and plan.status_of("") is None


def test_phone_numbers_become_digits_with_the_country_code():
    for text in ("5550 1007", "+974 5550 1007", "00974 55501007", "(974) 5550-1007"):
        assert plan.phone_digits(text) == "97455501007"
    assert plan.phone_digits("123") is None and plan.phone_digits("call me") is None


def test_a_client_key_is_the_businesss_own_and_says_nothing_about_the_person():
    key = plan.key_of(SALT, "client", "phone", "97455501007")
    assert len(key) == 32 and "97455501007" not in key
    assert key == plan.key_of(SALT, "client", "phone", "97455501007")
    assert key != plan.key_of(bytes.fromhex("cd" * 16), "client", "phone", "97455501007")
    assert plan.label_of(key).startswith("Client ") and "عميل" in plan.label_of(key)


# ── a messy file, row by row ─────────────────────────────────────────────────────────────

MESSY = [
    AR,
    ["A1", "C1", "قص شعر", "ريم", "2026-11-02", "٠٩:٣٠", "١٢٠٫٠٠", "حضر"],
    ["A2", "C2", "Manicure", "", "03/11/2026", "2:30 م", "90", "لم يحضر"],
    ["A3", "C1", "صبغة", "دانة", "4 نوفمبر 2026", "16:00", "350", "ملغي"],
    ["A3", "C1", "صبغة", "دانة", "4 نوفمبر 2026", "16:00", "350", "ملغي"],  # the same row again
    ["A4", "C3", "Haircut", "Reem", "2026/11/05", "11:00 AM", "", "completed"],
    ["", "", "", "", "", "", "", ""],  # an empty row is skipped without a word
    ["A5", "C4", "Facial", "Reem", "yesterday", "10:00", "200", "Completed"],  # not a date
    ["A6", "C5", "Facial", "Reem", "2026-11-06", "10:00", "two hundred", "Completed"],
    ["A7", "C6", "Facial", "Reem", "2026-11-06", "", "200", "Completed"],  # no time of day
    ["A8", "C7", "Facial", "Reem", "2026-11-06", "10:00", "200", "Booked"],  # not final
    ["A9", "C8", "Facial", "Reem", "2026-11-06", "10:00", "200", "mystery"],  # no such word
    ["A10", "C9", "Facial", "Reem", "2030-01-01", "10:00", "200", "Completed"],  # not happened yet
    ["A11", "", "Facial", "Reem", "2026-11-07", "10:00", "200", "Completed"],  # no client
]


def test_a_messy_file_gives_every_row_its_own_answer_with_its_number():
    built = build(MESSY)
    states = {r.row: r.state for r in built.results}
    assert states == {2: "ready", 3: "ready", 4: "ready", 5: "duplicate", 6: "ready",
                      8: "problem", 9: "problem", 10: "problem", 11: "problem", 12: "problem",
                      13: "problem", 14: "problem"}  # row 7 is empty: no answer at all
    codes = {p.row: p.code for p in built.problems}
    assert codes == {8: "bad_date", 9: "bad_money", 10: "no_time", 11: "not_final",
                     12: "bad_status", 13: "date_out_of_range", 14: "no_client"}
    for p in built.problems:
        assert p.en and p.ar and p.row >= 2
    # The ones that read, read right: Arabic digits, Arabic status, Arabic PM, a month's name.
    by_row = {r.row: r.visit for r in built.results if r.visit and r.state == "ready"}
    assert by_row[2].status == "completed" and by_row[2].price == 12000
    assert by_row[2].start == datetime(2026, 11, 2, 6, 30, tzinfo=UTC)  # 09:30 in Doha
    assert by_row[3].status == "no_show" and by_row[3].start.hour == 11 and not by_row[3].stylist
    assert by_row[4].status == "cancelled" and by_row[4].day == date(2026, 11, 4)
    assert by_row[6].price is None and by_row[6].start.hour == 8
    # 03/11/2026 reads two ways, and the file has a repeat and a visit with no price: all said.
    assert {n["code"] for n in built.notes} == {"duplicate_in_file", "no_price",
                                                "dates_day_first"}
    assert built.rows == 12


def test_a_visit_that_has_not_happened_yet_may_only_be_cancelled():
    rows = [EN, ["A1", "C1", "Haircut", "Reem", "2026-12-20", "10:00", "120", "Completed"],
            ["A2", "C2", "Haircut", "Reem", "2026-12-20", "11:00", "120", "Cancelled"]]
    built = build(rows)
    assert [(r.row, r.state) for r in built.results] == [(2, "problem"), (3, "ready")]
    assert built.problems[0].code == "in_future"


def test_a_date_with_no_time_is_a_problem_unless_staff_accept_it():
    rows = [EN, ["A1", "C1", "Haircut", "Reem", "2026-11-02", "", "120", "Completed"]]
    assert build(rows).problems[0].code == "no_time"
    accepted = build(rows, {"allow_date_only": True})
    assert not accepted.problems and accepted.visits[0].start.hour == 9  # 12:00 in Doha


def test_a_time_in_the_date_cell_or_an_excel_date_is_enough():
    rows = [["Appointment", "Client ID", "Service", "Status"],
            ["2026-11-02 14:30", "C1", "Haircut", "Completed"],
            [datetime(2026, 11, 3, 9, 15), "C2", "Haircut", "Completed"]]
    built = build(rows)
    assert not built.problems
    assert [v.start for v in built.visits] == [datetime(2026, 11, 2, 11, 30, tzinfo=UTC),
                                               datetime(2026, 11, 3, 6, 15, tzinfo=UTC)]
    assert built.visits[0].minutes == 60  # no duration in the file: the option's 60, said so
    assert build(rows, {"default_minutes": 45}).visits[0].minutes == 45


def test_an_appointment_number_makes_a_visit_the_same_visit_in_every_file():
    one = [EN, ["A1", "C1", "Haircut", "Reem", "2026-11-02", "10:30", "120", "Completed"]]
    moved = [EN, ["A1", "C1", "Haircut", "Reem", "2026-11-02", "10:45", "120", "Completed"]]
    assert build(one).visits[0].row_key == build(moved).visits[0].row_key
    # Without one, the client, the minute and the service do it: two services at once are two.
    bare = ["Date", "Time", "Client ID", "Service", "Status"]
    both = build([bare, ["2026-11-02", "10:00", "C1", "Haircut", "Completed"],
                  ["2026-11-02", "10:00", "C1", "Colour", "Completed"],
                  ["2026-11-02", "10:00", "C1", "Haircut", "Completed"]])
    assert [r.state for r in both.results] == ["ready", "ready", "duplicate"]


def test_names_and_phones_are_kept_only_when_staff_say_so():
    rows = [["Date", "Time", "Client", "Mobile", "Service", "Status"],
            ["2026-11-02", "10:00", "Noor Test", "5550 1007", "Haircut", "Completed"]]
    quiet = build(rows).visits[0]
    assert quiet.name == "" and quiet.phone == "" and quiet.client_kind == "phone"
    kept = build(rows, {"keep_personal": True}).visits[0]
    assert kept.name == "Noor Test" and kept.phone == "97455501007"
    assert quiet.client_key == kept.client_key  # the same person, kept or not


def test_the_shops_own_client_number_beats_a_phone_and_a_phone_beats_a_name():
    rows = [["Date", "Time", "Client ID", "Mobile", "Client", "Service", "Status"],
            ["2026-11-02", "10:00", "C1", "5550 1007", "Noor", "Haircut", "Completed"],
            ["2026-11-03", "10:00", "", "5550 1007", "Noor", "Haircut", "Completed"],
            ["2026-11-04", "10:00", "", "", "Noor", "Haircut", "Completed"]]
    got = build(rows)
    assert [v.client_kind for v in got.visits] == ["id", "phone", "name"]


def test_a_file_with_too_many_rows_or_cut_short_is_refused_whole():
    rows = [EN] + [["A", "C", "Haircut", "R", "2026-11-02", "10:00", "1", "Completed"]] * (
        plan.MAX_ROWS + 1)
    assert build(rows).problems[0].code == "too_many_rows"
    assert build([EN], truncated=True).problems[0].code == "too_many_rows"


def test_the_template_reads_back_clean_in_both_languages():
    for lang in ("en", "ar"):
        built = build(plan.template_rows(lang))
        assert not built.problems and len(built.visits) == 3, lang
        assert {v.status for v in built.visits} == {"completed", "no_show", "cancelled"}


# ── through the back office's door ───────────────────────────────────────────────────────


@pytest.fixture
def office(client_factory):
    return client_factory()


def test_an_arabic_semicolon_file_reads_the_same_as_an_english_comma_one(office):
    shop = make_business(office, ["bookings"])
    arabic = preview(office, shop, csv_of(MESSY[:5], delimiter=";"), "visits-ar.csv")
    english = preview(office, shop, csv_of([EN] + [
        ["A1", "C1", "Haircut", "Reem", "2026-11-02", "09:30", "120.00", "Completed"],
        ["A2", "C2", "Manicure", "", "2026-11-03", "14:30", "90", "No show"],
        ["A3", "C1", "Colour", "Dana", "2026-11-04", "16:00", "350", "Cancelled"]]))
    assert arabic["counts"]["visits"] == 3 and arabic["counts"]["duplicates"] == 1
    assert english["counts"]["visits"] == 3 and english["problems_total"] == 0
    assert arabic["counts"]["by_status"] == english["counts"]["by_status"]


def test_problems_come_back_with_their_rows_and_both_languages_and_can_be_skipped(office):
    shop = make_business(office, ["bookings"])
    shown = preview(office, shop, csv_of(MESSY))
    assert not shown["can_apply"] and shown["problems_total"] == 7
    assert {p["row"] for p in shown["problems"]} == {8, 9, 10, 11, 12, 13, 14}
    assert all(p["message"] and p["message_ar"] for p in shown["problems"])
    page = office.get(f"/api/admin/businesses/{shop}/visits-imports/{shown['id']}/rows",
                      params={"state": "problem"}).json()
    assert page["total"] == 7 and all(r["problems"] for r in page["rows"])
    # Staff may choose to leave the rows with problems out; the rest then goes through.
    skipped = office.put(f"/api/admin/businesses/{shop}/visits-imports/{shown['id']}",
                         json={"options": {"skip_problem_rows": True}}).json()
    assert skipped["can_apply"] and skipped["counts"]["skipped"] == 7
    assert skipped["counts"]["visits"] == 4
    done = office.post(f"/api/admin/businesses/{shop}/visits-imports/{shown['id']}/apply",
                       json={"preview": skipped["hash"]})
    assert done.status_code == 200 and done.json()["counts"]["visits_made"] == 4


def test_the_mapping_can_be_changed_when_the_names_are_not_the_ones_we_know(office):
    shop = make_business(office, ["bookings"])
    odd = csv_of([["When", "Who", "What", "How it went"],
                  ["2026-11-02 10:30", "C1", "Haircut", "Completed"]])
    shown = preview(office, shop, odd)
    assert not shown["can_apply"] and set(shown["missing"]) == {"date", "service", "status",
                                                                "client_id"}
    fixed = preview(office, shop, odd, mapping={
        "date": "When", "client_id": "Who", "service": "What", "status": "How it went"})
    assert fixed["can_apply"] and fixed["counts"]["visits"] == 1


def test_an_excel_file_reads_the_same_as_a_csv_one(office):
    shop = make_business(office, ["bookings"])
    sheet = [EN,
             ["A1", "C1", "Haircut", "Reem", datetime(2026, 11, 2), "09:30",
              Decimal("120"), "Completed"],
             ["A2", "C2", "Manicure", None, date(2026, 11, 3), "2:30 PM", Decimal("90"),
              "No show"]]
    book = xlsx.write([xlsx.SheetSpec("Visits", sheet)])
    shown = preview(office, shop, book, "visits.xlsx")
    assert shown["problems_total"] == 0 and shown["counts"]["visits"] == 2, shown["problems"]
    assert [r["time"] for r in shown["rows"]] == ["09:30", "14:30"]
    assert shown["rows"][0]["price"] == 12000 and shown["rows"][1]["stylist"] is None


def test_a_file_that_is_not_a_spreadsheet_is_refused_and_keeps_nothing(office):
    shop = make_business(office, ["bookings"])
    for data, name in ((b"", "empty.csv"), (b"%PDF-1.7\x00\x01", "visits.pdf"),
                       (b"x" * 10, "old.xls")):
        answer = upload(office, shop, data, name)
        assert answer.status_code == 422 and answer.json()["message_ar"]
    assert count("history_imports", shop) == 0


def test_staff_who_keep_names_and_phones_match_a_customer_the_shop_already_has(office):
    shop = make_business(office, ["bookings"])
    known = sql("insert into contacts (tenant_id, phone, name, consent_service, last_inbound_at) "
                "values ($1, '97455501007', 'Noor Test', 'granted', now()) returning id",
                shop)[0]["id"]
    rows = [["Date", "Time", "Client ID", "Client", "Mobile", "Service", "Status"],
            ["2026-11-02", "10:00", "C1", "Noor Test", "+974 5550 1007", "Haircut", "Completed"],
            ["2026-11-09", "10:00", "C2", "Dana", "5550 2000", "Haircut", "Completed"],
            ["2026-11-10", "10:00", "C3", "Dana's mother", "5550 2000", "Colour", "Completed"]]
    shown = preview(office, shop, csv_of(rows), options={"keep_personal": True})
    assert shown["counts"]["clients_known"] == 1 and shown["counts"]["clients_new"] == 2
    assert office.post(f"/api/admin/businesses/{shop}/visits-imports/{shown['id']}/apply",
                       json={"preview": shown["hash"]}).status_code == 200
    # The shop's own customer got the visit and is not marked, so is still reachable as before.
    mine = sql("select history_import_id, name from contacts where id = $1", known)[0]
    assert mine["history_import_id"] is None and mine["name"] == "Noor Test"
    assert count("bookings", shop, f"contact_id = '{known}' and history_import_id is not null") == 1
    # Two people who share a number are two clients; the number stays with the first.
    phones = sql("select phone, name from contacts where tenant_id = $1 "
                 "and history_import_id is not null order by created_at", shop)
    assert [p["phone"] for p in phones] == ["97455502000", None]
