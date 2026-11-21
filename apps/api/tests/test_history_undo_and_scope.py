"""The visits import: a file read twice, an overlapping file, undo, the Bookings module, and two
businesses side by side (D-197, spec 070)."""

from uuid import UUID

import pytest

from history_support import (
    ADMIN,
    apply,
    count,
    do_import,
    fixture_bytes,
    make_business,
    preview,
    run_in,
    sql,
    unique_rows,
    upload,
    url,
)


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def shop(office):
    return make_business(office, ["bookings"])


# ── a file read twice, and a second file that overlaps the first ─────────────────────────


def test_the_same_file_twice_makes_each_visit_once(office, shop):
    do_import(office, shop)
    before = count("bookings", shop, "history_import_id is not null")
    shown = preview(office, shop, fixture_bytes())
    assert shown["already_imported"] and not shown["can_apply"]
    assert shown["counts"]["visits"] == 0 and shown["counts"]["existing"] == len(unique_rows())
    refused = apply(office, shop, shown)
    assert refused.status_code == 409 and refused.json()["code"] == "already_imported"
    assert count("bookings", shop, "history_import_id is not null") == before


def test_an_overlapping_file_only_adds_what_is_new(office, shop):
    lines = fixture_bytes().decode("utf-8-sig").splitlines()
    head, body = lines[0], lines[1:]
    first = "\r\n".join([head, *body[:100]]).encode()
    second = "\r\n".join([head, *body[60:]]).encode()  # 40 rows are in both files
    one = do_import(office, shop, first)
    two = do_import(office, shop, second)
    assert one["counts"]["visits_made"] + two["counts"]["visits_made"] == len(unique_rows())
    assert two["counts"]["existing"] > 0
    assert count("bookings", shop, "history_import_id is not null") == len(unique_rows())
    # The same client keeps one contact across the two files.
    assert count("contacts", shop, "history_import_id is not null") == len({
        r["Client ID"] for r in unique_rows()})
    keys = sql("select history_row_key from bookings where tenant_id = $1 "
               "and history_row_key is not null", shop)
    assert len({k["history_row_key"] for k in keys}) == len(keys)


# ── undo ─────────────────────────────────────────────────────────────────────────────────


def test_undo_takes_back_the_whole_import_and_nothing_else(office, shop):
    tables = ("bookings", "contacts", "services", "booking_resources")
    before = {t: count(t, shop) for t in tables}
    done = do_import(office, shop)
    assert count("activity", shop, "actor_name = 'Import'") == done["counts"][
        "cancellations_recorded"] == 7
    undone = office.post(url(shop, "/undo"))
    assert undone.status_code == 200, undone.text
    body = undone.json()
    assert body["status"] == "undone" and body["visits_removed"] == len(unique_rows())
    assert body["removed"]["clients"] == done["counts"]["clients_made"]
    assert body["kept"] == {"clients": 0, "services": 0, "stylists": 0}
    assert {t: count(t, shop) for t in tables} == before
    nothing = office.post(url(shop, "/undo"))
    assert nothing.status_code == 404 and nothing.json()["code"] == "nothing_to_undo"
    # The same file can be read again once it is undone.
    again = do_import(office, shop)
    assert again["counts"]["visits_made"] == len(unique_rows())


def test_only_the_newest_import_can_be_undone_and_by_its_own_id(office, shop):
    lines = fixture_bytes().decode("utf-8-sig").splitlines()
    head, body = lines[0], lines[1:]
    one = do_import(office, shop, "\r\n".join([head, *body[:70]]).encode())
    two = do_import(office, shop, "\r\n".join([head, *body[70:]]).encode())
    refused = office.post(url(shop, f"/{one['id']}/undo"))
    assert refused.status_code == 409 and refused.json()["code"] == "not_newest"
    assert office.post(url(shop, f"/{two['id']}/undo")).status_code == 200
    left = count("bookings", shop, "history_import_id is not null")
    assert left == one["counts"]["visits_made"] > 0
    # A client the first import made and the second only used stays until the first goes.
    assert office.post(url(shop, f"/{one['id']}/undo")).status_code == 200
    assert count("contacts", shop, "history_import_id is not null") == 0


def test_a_client_who_wrote_to_the_shop_since_is_kept_when_the_import_is_undone(office, shop):
    do_import(office, shop)
    who = sql("select id from contacts where tenant_id = $1 and history_import_id is not null "
              "limit 1", shop)[0]["id"]
    sql("update contacts set last_inbound_at = now() where id = $1", who)
    body = office.post(url(shop, "/undo")).json()
    assert body["kept"]["clients"] == 1
    left = sql("select history_import_id from contacts where id = $1", who)
    assert left and left[0]["history_import_id"] is None  # theirs now, not the import's


def test_undo_is_refused_once_money_was_recorded_against_a_visit(office, shop):
    do_import(office, shop)
    one = sql("select id, contact_id from bookings where tenant_id = $1 "
              "and history_import_id is not null limit 1", shop)[0]
    sql("insert into manual_payments (tenant_id, subject, subject_id, contact_id, amount_minor, "
        "method, idempotency_key, recorded_by) values ($1, 'booking', $2, $3, 5000, 'cash', "
        "'history-test-key', 'Noor')", shop, one["id"], one["contact_id"])
    refused = office.post(url(shop, "/undo"))
    assert refused.status_code == 409 and refused.json()["code"] == "not_undoable"
    assert count("bookings", shop, "history_import_id is not null") == len(unique_rows())


# ── the Bookings module ──────────────────────────────────────────────────────────────────


def modules_of(tenant_id) -> set[str]:
    return {r["module_key"] for r in sql(
        "select module_key from tenant_modules where tenant_id = $1 and enabled", tenant_id)}


def test_a_business_without_bookings_is_refused_unless_staff_switch_it_on(office):
    shop = make_business(office, [])
    assert "bookings" not in modules_of(shop)
    shown = preview(office, shop, fixture_bytes())
    assert shown["needs_bookings_switch"] and shown["can_apply"]
    refused = apply(office, shop, shown)
    assert refused.status_code == 409 and refused.json()["code"] == "bookings_off"
    assert "bookings" not in modules_of(shop)
    assert count("bookings", shop) == 0

    done = apply(office, shop, shown, switch_on_bookings=True)
    assert done.status_code == 200, done.text
    assert "bookings" in modules_of(shop)
    actions = [e["action"] for e in office.get(f"{ADMIN}/audit").json()["entries"]
               if e["business_id"] == str(shop)]
    assert "module.on" in actions and "history.applied" in actions


def test_bookings_is_not_switched_on_when_the_import_would_be_refused(office):
    shop = make_business(office, [])
    # No client column at all: the file cannot be applied, so nothing is switched on for it.
    bad = b"Date,Service,Status\r\n2026-11-02 10:00,Haircut,Completed\r\n"
    shown = preview(office, shop, bad)
    assert not shown["can_apply"] and "client_id" in shown["missing"]
    refused = apply(office, shop, shown, switch_on_bookings=True)
    assert refused.status_code == 409 and refused.json()["code"] == "import_has_problems"
    assert "bookings" not in modules_of(shop)


# ── two businesses ───────────────────────────────────────────────────────────────────────


def test_one_business_cannot_see_or_touch_anothers_import(office):
    a, b = make_business(office, ["bookings"]), make_business(office, ["bookings"])
    shown_a = preview(office, a, fixture_bytes())
    assert apply(office, a, shown_a).status_code == 200
    assert count("bookings", b) == 0 and count("history_imports", b) == 0
    # The import's address under the other business is not found, whatever staff try.
    for call in (office.get(url(b, f"/{shown_a['id']}")),
                 office.get(url(b, f"/{shown_a['id']}/rows")),
                 office.put(url(b, f"/{shown_a['id']}"), json={"options": {}}),
                 office.post(url(b, f"/{shown_a['id']}/apply"), json={"preview": shown_a["hash"]}),
                 office.delete(url(b, f"/{shown_a['id']}"))):
        assert call.status_code == 404 and call.json()["code"] == "import_not_found"
    assert office.post(url(b, "/undo")).status_code == 404
    assert count("bookings", a, "history_import_id is not null") == len(unique_rows())

    async def seen(conn):
        out = {t: await conn.fetchval(f"select count(*) from {t}")
               for t in ("history_imports", "bookings", "contacts")}
        out["a_rows"] = await conn.fetchval(
            "select count(*) from bookings where history_import_id = $1", UUID(shown_a["id"]))
        return out

    # The app's own role, scoped to B, sees none of A's rows in any table the import touched.
    result = run_in(b, seen)
    assert result["history_imports"] == 0 and result["a_rows"] == 0


def test_the_same_client_has_a_different_key_in_every_business(office):
    a, b = make_business(office, ["bookings"]), make_business(office, ["bookings"])
    do_import(office, a)
    do_import(office, b)
    keys_a = {r["history_key"] for r in sql(
        "select history_key from contacts where tenant_id = $1 and history_key is not null", a)}
    keys_b = {r["history_key"] for r in sql(
        "select history_key from contacts where tenant_id = $1 and history_key is not null", b)}
    assert keys_a and len(keys_a) == len(keys_b) and not keys_a & keys_b
    # Undoing A leaves B whole.
    assert office.post(url(a, "/undo")).status_code == 200
    assert count("bookings", b, "history_import_id is not null") == len(unique_rows())


def test_the_back_office_door_is_for_staff_only(client_factory, office):
    from test_onboarding import new_business

    shop = make_business(office, ["bookings"])
    owner = client_factory()
    new_business(owner)
    for call in (owner.get(url(shop)), upload(owner, shop, fixture_bytes()),
                 owner.post(url(shop, "/undo"))):
        assert call.status_code == 403
    assert count("history_imports", shop) == 0
