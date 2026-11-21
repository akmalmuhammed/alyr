"""The visits import, on the real path (D-197, D-198, spec 070): upload as a dry run, apply with the
preview's hash in one transaction, an undo of a whole import, and what it makes.

The salon fixture is invented. What it should make is worked out from the file itself in
`history_support`, not by asking the importer, so a mistake in the importer cannot hide in both.
"""

from collections import Counter
from datetime import date
from zoneinfo import ZoneInfo

import pytest

from history_support import (
    ADMIN,
    apply,
    count,
    do_import,
    fixture_bytes,
    make_business,
    preview,
    sql,
    unique_rows,
    url,
)

DOHA = ZoneInfo("Asia/Qatar")
STATUS = {"Completed": "completed", "No show": "no_show", "Cancelled": "cancelled"}


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def shop(office):
    return make_business(office, ["bookings"])


# ── the dry run ──────────────────────────────────────────────────────────────────────────


def test_the_dry_run_writes_nothing_but_the_preview(office, shop):
    before = {t: count(t, shop) for t in ("bookings", "contacts", "services", "booking_resources")}
    shown = preview(office, shop, fixture_bytes())
    assert {t: count(t, shop) for t in before} == before
    assert shown["status"] == "preview" and shown["can_apply"] and shown["problems_total"] == 0
    c = shown["counts"]
    assert c["visits"] == len(unique_rows()) and c["duplicates"] == 2 and c["existing"] == 0
    # The file itself is never kept, only what was read from it, and only while it is a preview.
    row = sql("select status, sheet is not null as has_sheet, file_sha256 from history_imports "
              "where tenant_id = $1", shop)[0]
    assert row["status"] == "preview" and row["has_sheet"] and len(row["file_sha256"]) == 64
    assert not any(c["data_type"] == "bytea" for c in sql(
        "select data_type from information_schema.columns where table_name = 'history_imports'"))


def test_the_preview_says_what_each_row_would_do_in_both_languages(office, shop):
    shown = preview(office, shop, fixture_bytes())
    states = Counter(r["state"] for r in shown["rows"])
    assert set(states) <= {"ready", "duplicate"} and shown["rows"][0]["service"]
    assert any(n["code"] == "duplicate_in_file" and n["message_ar"] for n in shown["notes"])
    paged = office.get(url(shop, f"/{shown['id']}/rows"), params={"state": "duplicate"}).json()
    assert paged["total"] == 2 and all(r["state"] == "duplicate" for r in paged["rows"])
    everything = []
    offset = 0
    while True:
        page = office.get(url(shop, f"/{shown['id']}/rows"),
                          params={"offset": offset, "limit": 100}).json()
        everything += page["rows"]
        offset += 100
        if offset >= page["total"]:
            break
    assert len(everything) == len(unique_rows()) + 2  # every row of the file, once


def test_by_default_nothing_personal_is_shown_or_kept(office, shop):
    shown = preview(office, shop, fixture_bytes())
    text = str(shown)
    assert "Aisha" not in text and "+974" not in text and "5550" not in text
    done = apply(office, shop, shown)
    assert done.status_code == 200, done.text
    people = sql("select name, phone, wa_user_id from contacts where tenant_id = $1 "
                 "and history_import_id is not null", shop)
    assert people and all(p["phone"] is None and p["wa_user_id"] is None for p in people)
    assert all(p["name"].startswith("Client ") and "عميل" in p["name"] for p in people)
    mine = [e for e in office.get(f"{ADMIN}/audit").json()["entries"]
            if e["business_id"] == str(shop)]
    assert mine and "Aisha" not in str(mine) and "5550" not in str(mine)


# ── apply ────────────────────────────────────────────────────────────────────────────────


def test_apply_makes_what_the_file_says_and_marks_all_of_it(office, shop):
    native = {t: count(t, shop) for t in ("services", "booking_resources", "contacts")}
    done = do_import(office, shop)
    rows = unique_rows()
    visits = sql("select b.*, c.history_import_id as c_import from bookings b "
                 "join contacts c on c.id = b.contact_id where b.tenant_id = $1 "
                 "and b.history_import_id is not null order by b.number", shop)
    assert len(visits) == len(rows) == done["counts"]["visits_made"]
    assert Counter(v["status"] for v in visits) == Counter(STATUS[r["Status"]] for r in rows)
    assert all(v["status"] != "booked" and v["note"] == "" for v in visits)
    assert all(v["history_import_id"] == v["c_import"] or v["c_import"] is None for v in visits)
    numbers = [v["number"] for v in visits]
    assert numbers == sorted(numbers) and len(set(numbers)) == len(numbers)
    # Prices are what the file says (QAR 120.00 is 12000 dirhams), never the service's price today.
    by_id = {r["Appointment ID"]: r for r in rows}
    assert sum(v["price"] for v in visits) == sum(
        int(float(r["Price (QAR)"]) * 100) for r in rows)
    assert by_id  # keep the lookup honest if the fixture changes
    # The first visit in the file is the day a client "started", not the day of the import.
    first = {}
    for r in rows:
        if r["Status"] != "Cancelled":
            first.setdefault(r["Client ID"], r["Date"] + "T" + r["Start Time"])
    made = sql("select count(*) as n, min(created_at) as first from contacts "
               "where tenant_id = $1 and history_import_id is not null", shop)[0]
    assert made["n"] == done["counts"]["clients_made"] > 20
    assert made["first"].date() == date(2026, 9, 6)
    for kind in ("services", "booking_resources", "contacts"):
        marked = count(kind, shop, "history_import_id is not null")
        assert marked == done["counts"][{"services": "services_made",
                                         "booking_resources": "stylists_made",
                                         "contacts": "clients_made"}[kind]]
        assert count(kind, shop) == native[kind] + marked
    # History is not something to book: its services and stylists are switched off.
    assert count("services", shop, "history_import_id is not null and active") == 0
    assert count("booking_resources", shop, "history_import_id is not null and active") == 0


def test_a_visit_is_never_left_booked_in_the_database_itself(office, shop):
    do_import(office, shop)
    one = sql("select id, contact_id, service_id from bookings where tenant_id = $1 "
              "and history_import_id is not null limit 1", shop)[0]
    with pytest.raises(Exception, match="bookings_history_final"):
        sql("update bookings set status = 'booked' where id = $1", one["id"])
    with pytest.raises(Exception, match="bookings_history_key"):
        sql("update bookings set history_row_key = null where id = $1", one["id"])
    with pytest.raises(Exception, match="bookings_history_key"):
        sql("insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
            "starts_at, ends_at, status, history_row_key) values ($1, 99999, $2, $3, 'x', "
            "now() - interval '2 days', now() - interval '2 days' + interval '1 hour', "
            "'completed', repeat('a', 32))", shop, one["contact_id"], one["service_id"])


def test_apply_checks_the_hash_and_the_state(office, shop):
    shown = preview(office, shop, fixture_bytes())
    wrong = office.post(url(shop, f"/{shown['id']}/apply"), json={"preview": "0" * 64})
    assert wrong.status_code == 409 and wrong.json()["code"] == "import_changed"
    assert count("bookings", shop, "history_import_id is not null") == 0
    # Changing an option changes the preview, so the old hash no longer applies.
    changed = office.put(url(shop, f"/{shown['id']}"), json={"options": {"default_minutes": 30}})
    assert changed.json()["hash"] != shown["hash"]
    stale = office.post(url(shop, f"/{shown['id']}/apply"), json={"preview": shown["hash"]})
    assert stale.status_code == 409
    done = apply(office, shop, changed.json())
    assert done.status_code == 200
    again = apply(office, shop, changed.json())
    assert again.status_code == 409 and again.json()["code"] == "import_not_preview"


def test_an_import_that_fails_part_way_makes_nothing(office, shop, monkeypatch):
    from alyr.modules.history import imports

    shown = preview(office, shop, fixture_bytes())
    real = imports._write

    async def break_after_writing(conn, p, import_id, options):
        await real(conn, p, import_id, options)
        raise RuntimeError("the database went away")

    monkeypatch.setattr(imports, "_write", break_after_writing)
    with pytest.raises(RuntimeError):
        apply(office, shop, shown)
    assert count("bookings", shop, "history_import_id is not null") == 0
    assert count("contacts", shop, "history_import_id is not null") == 0
    assert count("services", shop, "history_import_id is not null") == 0
    assert sql("select status from history_imports where tenant_id = $1", shop)[0][
        "status"] == "preview"


def test_a_preview_nobody_came_back_to_is_not_kept(office, shop):
    from alyr.core import retention

    stale = preview(office, shop, fixture_bytes())
    fresh = preview(office, shop, fixture_bytes() + b"\r\n")
    sql("update history_imports set created_at = now() - interval '8 days' where id = $1::uuid",
        stale["id"])
    purged = office.portal.call(retention.purge, office.app.state.db)
    assert purged["history_previews"] >= 1
    left = {str(r["id"]) for r in sql("select id from history_imports where tenant_id = $1", shop)}
    assert left == {fresh["id"]}
    # An applied import is a record, not a working copy: it stays however old it is.
    done = do_import(office, shop, fixture_bytes() + b"\r\n\r\n")
    sql("update history_imports set created_at = now() - interval '60 days' where id = $1::uuid",
        done["id"])
    office.portal.call(retention.purge, office.app.state.db)
    assert count("history_imports", shop, "status = 'applied'") == 1


def test_what_the_dashboard_reads_is_recorded_as_data_from(office, shop):
    done = do_import(office, shop, options={"exported_on": "2026-11-20",
                                            "source": "Booking system"})
    assert done["exported_on"] == "2026-11-20" and done["source"] == "Booking system"
    rows = unique_rows()
    days = sorted(r["Date"] if "-" in r["Date"] else f"{r['Date'][6:]}-{r['Date'][3:5]}-"
                  f"{r['Date'][:2]}" for r in rows)
    assert done["first_visit_on"] == days[0] and done["last_visit_on"] == days[-1]
    listed = office.get(url(shop)).json()
    assert listed["data_from"]["exported_on"] == "2026-11-20"
    assert listed["imports"][0]["can_undo"] is True
