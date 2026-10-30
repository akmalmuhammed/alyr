"""Erasing a stopped client's data 60 days after it stops (spec 042, D-116, go-live item 39).

Real PostgreSQL. The run is `erase.run`, the one the daily Cloud Run job calls; the photo store
is the local-disk twin of R2. Every business, person and message here is made up.

What is proved: a rule for every table (and a run that refuses to start when one is missing);
nothing goes before day 60 and everything does on it; a dry run changes nothing; a client who
comes back is untouched, even when the undo and the erasure race; no other business is touched;
the records ALYR keeps survive; the guards of issued documents hold for everyone but the one
business being erased, through the one door; the receipt holds counts and nothing else; no
needle of personal data is left anywhere in the database; a run that fails halfway leaves a
whole state and finishes next time.
"""

import asyncio
import json
from datetime import timedelta
from uuid import UUID, uuid4

import asyncpg
import pytest

from alyr import erase_job
from alyr.config import Settings, get_settings
from alyr.core import erase, subscription
from alyr.core import erase_rules as rules
from alyr.core.storage import LocalStore, StoreUnavailable, valid_key
from alyr.db import Database
from conftest import APP_DSN, HOST, OWNER_DSN
from documents_support import configured_shop, issued, refused_by_database
from erase_support import (
    counts_for,
    everything_else,
    remaining,
    run_erase,
    stopped_client,
    with_owner_db,
)
from photo_files import photo
from test_consent import owner_sql

ADMIN = "/api/admin"


@pytest.fixture
def office(client_factory):
    return client_factory()


def public_tables() -> set[str]:
    return {r["table_name"] for r in owner_sql(
        "select table_name from information_schema.tables "
        "where table_schema = 'public' and table_type = 'BASE TABLE'")}


def foreign_keys() -> list[dict]:
    return [dict(r) for r in owner_sql(
        "select conrelid::regclass::text as child, confrelid::regclass::text as parent, "
        "confdeltype::text as action, (select string_agg(a.attname, ',') from pg_attribute a "
        "where a.attrelid = conrelid and a.attnum = any(conkey)) as columns "
        "from pg_constraint where contype = 'f'")]


def every_count() -> dict[str, int]:
    return {t: owner_sql(f'select count(*) as n from "{t}"')[0]["n"]
            for t in sorted(public_tables())}


def row(sql: str, *args) -> dict:
    found = owner_sql(sql, *args)
    assert len(found) == 1, sql
    return dict(found[0])


# ── a rule for every table ───────────────────────────────────────────────────────────────


def test_every_table_has_a_rule_and_every_rule_a_table():
    """A new table cannot be added without deciding what happens to it when a client is erased:
    say so in core/erase_rules.py (the failure names the table)."""
    have = public_tables()
    assert have - set(rules.RULES) == set(), "no rule in core/erase_rules.py for these tables"
    assert set(rules.RULES) - have == set(), "rules for tables that no longer exist"


def test_the_rules_agree_with_the_schema():
    columns = {(r["table_name"], r["column_name"]) for r in owner_sql(
        "select table_name, column_name from information_schema.columns "
        "where table_schema = 'public'")}
    for table, rule in rules.RULES.items():
        assert rule.reason, table
        if rule.kind == rules.DELETE:
            assert rule.by, table
        if rule.kind == rules.SCRUB:
            assert rule.scrub and rule.by, table
        if rule.by:
            assert (table, rule.by) in columns, f"{table}.{rule.by}"
        for column, _ in rule.scrub:
            assert (table, column) in columns, f"{table}.{column}"
    # A table that names a business or a client is never called global, and a table with a
    # tenant_id is deleted or scrubbed by it.
    for table, column in sorted(columns):
        if column in ("tenant_id", "business_id", "client_id"):
            rule = rules.RULES[table]
            assert rule.kind != rules.GLOBAL, f"{table} has {column}, so it is not global"
            if column == "tenant_id":
                assert rule.kind in (rules.DELETE, rules.SCRUB) and rule.by == "tenant_id", table


def test_nothing_that_is_kept_points_at_something_that_is_deleted():
    """The business's row goes, and with it everything that points at it. A record ALYR keeps
    that still pointed at one would stop the erasure (or be lost with it)."""
    deleted = {t for t, r in rules.RULES.items() if r.kind == rules.DELETE}
    bad = [f"{fk['child']} -> {fk['parent']}" for fk in foreign_keys()
           if fk["parent"] in deleted and rules.RULES[fk["child"]].kind != rules.DELETE
           and fk["action"] not in ("n", "c")]
    assert bad == []


def test_a_kept_record_that_points_at_a_person_is_named():
    """A person who is pointed at by a record ALYR keeps cannot be deleted: they are made
    anonymous. The pairs are listed in core/erase_rules.py; a new one must be added there."""
    pointing = {
        (fk["child"], fk["columns"]) for fk in foreign_keys()
        if fk["parent"] == "users" and rules.RULES[fk["child"]].kind != rules.DELETE
        and fk["action"] in ("a", "r")
    }
    assert pointing == set(rules.USER_REFERENCES)


def test_tables_are_deleted_children_first_and_the_business_last():
    async def order(db):
        async with db.unscoped() as conn:
            return [t for t, _ in await erase.delete_order(conn)]

    names = with_owner_db(order)
    assert names[-1] == "tenants" and len(names) == len(set(names))
    position = {t: i for i, t in enumerate(names)}
    for fk in foreign_keys():
        if fk["child"] in position and fk["parent"] in position and fk["child"] != fk["parent"]:
            assert position[fk["child"]] < position[fk["parent"]], fk


def test_a_table_nobody_decided_about_stops_the_run():
    """The mutation check for the guard above: add a table the rules do not name, and the run
    erases nothing and says why. Take it away, and the same run erases."""
    world = stopped_client(70)
    owner_sql("create table zz_undecided (tenant_id uuid not null references tenants(id))")
    try:
        report = run_erase(world)
        assert report["stopped"] == {"tables_and_rules_that_do_not_match": ["zz_undecided"]}
        assert report["failed"] == 1 and report["businesses_erased"] == 0
        assert counts_for(world.businesses[0])["orders"] == 1
    finally:
        owner_sql("drop table zz_undecided")
    assert run_erase(world)["businesses_erased"] == 1


# ── the 60 days ──────────────────────────────────────────────────────────────────────────


def test_nothing_is_deleted_before_day_60_and_everything_on_it():
    early = stopped_client(59)
    before = counts_for(early.businesses[0])
    report = run_erase(early)
    assert report["clients"] == [] and report["businesses_erased"] == 0
    assert counts_for(early.businesses[0]) == before
    assert row("select erased_at from clients where id = $1", early.client_id)["erased_at"] is None

    on_the_day = stopped_client(60)
    report = run_erase(on_the_day)
    assert report["businesses_erased"] == 1 and report["clients_finished"] == 1
    assert remaining(on_the_day.businesses[0]) == {}

    # The same client, a day earlier on the calendar, is the same: counted from cancels_on.
    almost = stopped_client(60)
    assert run_erase(almost, on=subscription.today() - timedelta(days=1))["clients"] == []
    assert counts_for(almost.businesses[0])["orders"] == 1


def test_the_days_cannot_be_set_below_the_30_the_business_has_to_download():
    world = stopped_client(20)
    assert run_erase(world, erase_after_days=5)["clients"] == []
    assert erase.after_days(Settings(erase_after_days=5)) == 31
    assert erase.after_days(Settings(erase_after_days=90)) == 90
    older = stopped_client(40)
    assert run_erase(older, erase_after_days=5)["businesses_erased"] == 1


def test_only_clients_whose_cancellation_took_effect_and_whose_time_is_up_are_listed():
    due, waiting = stopped_client(65, fill=False), stopped_client(30, fill=False)
    never = stopped_client(65, fill=False)
    owner_sql("update clients set cancels_on = null, cancel_requested_at = null where id = $1",
              never.client_id)
    report = run_erase(apply=False)  # nobody is named: every client in the database is looked at
    listed = {c["client_id"] for c in report["clients"]}
    assert str(due.client_id) in listed
    assert str(waiting.client_id) not in listed and str(never.client_id) not in listed


# ── the dry run, and the switch ──────────────────────────────────────────────────────────


def test_a_dry_run_says_what_would_go_and_changes_nothing():
    world = stopped_client(75)
    tenant = world.businesses[0]
    before, before_tenant = every_count(), counts_for(tenant)
    report = run_erase(world, apply=False)
    assert report["mode"] == "dry-run" and report["businesses_erased"] == 0
    [client] = report["clients"]
    [business] = client["businesses"]
    assert business["would_delete"] == {
        t: n for t, n in before_tenant.items() if rules.RULES[t].kind == rules.DELETE}
    assert set(business["would_keep"]) == {"quote_lines", "card_checkouts", "terms_acceptances"}
    assert business["people"] == 2
    assert every_count() == before and counts_for(tenant) == before_tenant
    # The report is IDs, dates and counts: no name, number or message.
    text = json.dumps(report)
    for needle in vars(world.needles).values():
        assert needle not in text


def test_a_dry_run_cannot_write_even_by_mistake():
    async def attempt(db):
        async with erase.office(db, readonly=True) as conn:
            await conn.execute("update clients set note = note")

    with pytest.raises(asyncpg.ReadOnlySQLTransactionError):
        with_owner_db(attempt)


def test_the_job_only_reports_until_the_founder_switches_it_on(monkeypatch, capsys):
    world = stopped_client(70)
    tenant = world.businesses[0]
    before = counts_for(tenant)
    monkeypatch.setenv("ALYR_MIGRATION_URL", OWNER_DSN)
    monkeypatch.delenv("ALYR_ERASE_STOPPED_CLIENTS", raising=False)

    def job(*args) -> dict:
        get_settings.cache_clear()
        code = asyncio.run(erase_job.main(["--client", str(world.client_id), *args]))
        assert code == 0
        return json.loads(capsys.readouterr().out)

    try:
        off = job()
        assert (off["mode"], off["switch"]) == ("dry-run", "off")
        assert counts_for(tenant) == before
        monkeypatch.setenv("ALYR_ERASE_STOPPED_CLIENTS", "true")
        asked_to_look = job("--dry-run")
        assert (asked_to_look["mode"], asked_to_look["switch"]) == ("dry-run", "on")
        assert counts_for(tenant) == before
        on = job()
        assert (on["mode"], on["businesses_erased"]) == ("apply", 1)
        assert remaining(tenant) == {}
    finally:
        get_settings.cache_clear()


def test_the_default_is_off():
    assert Settings().erase_stopped_clients is False
    assert Settings().erase_after_days == 60


# ── coming back inside the 60 days ───────────────────────────────────────────────────────


def test_a_client_who_comes_back_inside_the_60_days_keeps_everything(office):
    world = stopped_client(40)
    tenant = world.businesses[0]
    before = counts_for(tenant)
    url = f"{ADMIN}/clients/{world.client_id}/cancel"
    undone = office.delete(url)
    assert undone.status_code == 200, undone.text
    assert row("select cancels_on, cancel_requested_at from clients where id = $1",
               world.client_id) == {"cancels_on": None, "cancel_requested_at": None}
    # A hundred days after the old day, and a year: never due.
    for later in (100, 365):
        report = run_erase(world, on=subscription.today() + timedelta(days=later))
        assert report["clients"] == []
    assert counts_for(tenant) == before

    # Cancelling again starts a new clock: seven days' notice, then the 60 days.
    again = office.post(url, json={"note": "Asked again by phone"})
    assert again.status_code == 200, again.text
    day = row("select cancels_on from clients where id = $1", world.client_id)["cancels_on"]
    assert day == subscription.today() + timedelta(days=7)
    assert run_erase(world, on=day + timedelta(days=59))["clients"] == []
    assert counts_for(tenant) == before
    assert run_erase(world, on=day + timedelta(days=60))["businesses_erased"] == 1


def test_an_undo_and_the_erasure_cannot_both_win():
    """The undo commits after the erasure has started and is waiting for the client's row: the
    erasure then finds the client no longer stopped and leaves everything."""
    world = stopped_client(61)
    tenant = world.businesses[0]
    before = counts_for(tenant)

    async def race():
        undoing = await asyncpg.connect(OWNER_DSN)
        db = Database(OWNER_DSN)
        await db.connect()
        try:
            transaction = undoing.transaction()
            await transaction.start()
            await undoing.execute(
                "update clients set cancels_on = null, cancel_requested_at = null where id = $1",
                world.client_id,
            )
            erasing = asyncio.create_task(erase.run(
                db, apply=True, only=[world.client_id], settings=Settings(erase_max_per_run=50)))
            await asyncio.sleep(1.0)
            assert not erasing.done(), "the erasure should be waiting for the client's row"
            await transaction.commit()
            return await asyncio.wait_for(erasing, 20)
        finally:
            await undoing.close()
            await db.close()

    report = asyncio.run(race())
    assert report["businesses_erased"] == 0
    assert report["clients"][0]["skipped"] == "not stopped"
    assert counts_for(tenant) == before


def test_after_the_erasure_there_is_nothing_to_bring_back(office):
    world = stopped_client(70)
    assert run_erase(world)["clients_finished"] == 1
    url = f"{ADMIN}/clients/{world.client_id}/cancel"
    for call in (office.delete(url), office.post(url, json={"note": "Asked again"})):
        assert call.status_code == 422 and "erasure of this client" in call.json()["detail"]
    assert row("select erased_at is not null as done, cancels_on is not null as stopped "
               "from clients where id = $1", world.client_id) == {"done": True, "stopped": True}


# ── other businesses ─────────────────────────────────────────────────────────────────────


def test_no_other_business_is_touched():
    target = stopped_client(80, businesses=1)
    bystanders = [stopped_client(30), stopped_client(0), stopped_client(59)]
    sibling_client = stopped_client(10)
    around = everything_else(target.businesses)
    demo = row("select count(*) as n from contacts where tenant_id = "
               "(select id from tenants where slug = 'al-noor-electricals')")["n"]
    kept_in_global = {t: owner_sql(f'select count(*) as n from "{t}"')[0]["n"]
                      for t in ("price_items", "terms_versions", "platform_admins", "users")}

    assert run_erase(target)["businesses_erased"] == 1

    assert everything_else(target.businesses) == around
    for other in [*bystanders, sibling_client]:
        assert counts_for(other.businesses[0])["orders"] == 1
        assert row("select erased_at from clients where id = $1", other.client_id
                   )["erased_at"] is None
    assert row("select count(*) as n from contacts where tenant_id = "
               "(select id from tenants where slug = 'al-noor-electricals')")["n"] == demo
    after = {t: owner_sql(f'select count(*) as n from "{t}"')[0]["n"] for t in kept_in_global}
    # Only the target's own two people left `users` (one deleted, one made anonymous).
    assert {t: n for t, n in after.items() if t != "users"} == {
        t: n for t, n in kept_in_global.items() if t != "users"}
    assert after["users"] == kept_in_global["users"] - 1


def test_a_person_in_another_business_stays_and_so_does_the_staff_member():
    world = stopped_client(70)
    keeper = stopped_client(5)
    tenant, elsewhere = world.businesses[0], keeper.businesses[0]
    # The owner of the erased business also works at another client's business.
    owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin')",
              elsewhere, world.staff_id)
    # And an ALYR staff member was added to the erased business to help set it up.
    helper = owner_sql("insert into users (email, name) values ($1, 'ALYR helper') returning id",
                       f"helper-{uuid4().hex[:6]}@alyr.example")[0]["id"]
    owner_sql("insert into platform_admins (email) "
              "values ((select email from users where id = $1))", helper)
    owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin')",
              tenant, helper)
    try:
        assert run_erase(world)["businesses_erased"] == 1
        # Still there, still a member of the other business, no longer pointing at the erased one.
        staff = row("select email, last_tenant_id from users where id = $1", world.staff_id)
        assert staff["email"] == world.needles.staff_email
        assert owner_sql("select 1 from memberships where user_id = $1 and tenant_id = $2",
                         world.staff_id, elsewhere)
        assert row("select count(*) as n from users where id = $1", helper)["n"] == 1
        assert row("select (select last_tenant_id from users where id = $1) is null as cleared",
                   world.owner_id)["cleared"]
        receipt = row("select people from erasure_receipts where business_id = $1", tenant)
        assert json.loads(receipt["people"]) == {
            "staff": 1, "deleted": 0, "anonymised": 1, "still_in_another_business": 1}
    finally:
        owner_sql("delete from platform_admins where email = (select email from users "
                  "where id = $1)", helper)


# ── what is kept, what is left, the receipt ──────────────────────────────────────────────


def test_the_records_alyr_keeps_survive_and_the_rest_is_scrubbed():
    world = stopped_client(70)
    tenant = world.businesses[0]
    quote = row("select * from quotes where client_id = $1", world.client_id)
    payments = owner_sql("select * from client_payments where client_id = $1", world.client_id)
    audit_before = row("select count(*) as n from platform_audit where client_id = $1",
                       world.client_id)["n"]
    assert run_erase(world)["clients_finished"] == 1

    assert row("select * from quotes where client_id = $1", world.client_id) == quote
    assert [dict(r) for r in owner_sql(
        "select * from client_payments where client_id = $1", world.client_id)] == [
        dict(r) for r in payments]
    lines = owner_sql("select business_id from quote_lines where quote_id = $1", quote["id"])
    assert [r["business_id"] for r in lines] == [tenant]  # the ID, with no business behind it
    assert row("select count(*) as n from card_checkouts where client_id = $1",
               world.client_id)["n"] == 1
    assert row("select count(*) as n from billing_notices where client_id = $1",
               world.client_id)["n"] == 1

    client = row("select * from clients where id = $1", world.client_id)
    assert client["name"] == f"Zorbo Holdings {world.tag}" and client["erased_at"] is not None
    assert (client["contact_name"], client["contact_email"], client["contact_phone"],
            client["note"], client["access_note"]) == ("", "", "", "", "")
    assert client["cancel_note"] == ""
    assert client["erase_started_at"] is not None
    assert row("select created_by from card_checkouts where client_id = $1",
               world.client_id)["created_by"] == ""
    assert client["billing_state"] == "cancelled"

    terms = row("select ip, user_agent, accepted_by from terms_acceptances where tenant_id = $1",
                tenant)
    assert (terms["ip"], terms["user_agent"]) == ("", "")
    assert terms["accepted_by"] == world.needles.owner_name

    owner = row("select email, name, name_ar from users where id = $1", world.owner_id)
    assert owner["email"] == f"erased-{world.owner_id}@erased.invalid"
    assert (owner["name"], owner["name_ar"]) == ("", "")
    assert owner_sql("select 1 from users where id = $1", world.staff_id) == []

    log = [r["action"] for r in owner_sql(
        "select action from platform_audit where client_id = $1 order by id", world.client_id)]
    assert len(log) == audit_before + 2 and log[-2:] == ["business.erased", "client.erased"]
    assert owner_sql("select 1 from tenants where id = $1", tenant) == []


def test_the_receipt_is_counts_and_nothing_else():
    world = stopped_client(70)
    tenant = world.businesses[0]
    before = counts_for(tenant)
    assert run_erase(world)["businesses_erased"] == 1

    receipt = row("select * from erasure_receipts where business_id = $1", tenant)
    assert receipt["scope"] == "business" and receipt["client_id"] == world.client_id
    assert receipt["business_type"] == "bakery" and receipt["rules"] == erase.rules_version()
    assert receipt["stopped_on"] == subscription.today() - timedelta(days=70)
    assert receipt["went_live_on"] is not None
    deleted = json.loads(receipt["deleted"])
    assert deleted == {t: n for t, n in before.items() if rules.RULES[t].kind == rules.DELETE}
    assert json.loads(receipt["kept"]) == {"quote_lines": 1, "card_checkouts": 1,
                                           "terms_acceptances": 1}
    assert json.loads(receipt["scrubbed"]) == {"terms_acceptances": 1, "card_checkouts": 1}
    assert json.loads(receipt["people"]) == {
        "deleted": 1, "anonymised": 1, "still_in_another_business": 0, "staff": 0}
    # Every key is a table (or a kind of person) and every value a number.
    for column in ("deleted", "kept", "scrubbed", "people"):
        for key, value in json.loads(receipt[column]).items():
            assert isinstance(value, int) and (key in rules.RULES or column == "people"), key
    text = json.dumps({k: str(v) for k, v in receipt.items()})
    for needle in vars(world.needles).values():
        assert needle not in text

    [client_receipt] = owner_sql(
        "select * from erasure_receipts where client_id = $1 and scope = 'client'", world.client_id)
    assert json.loads(client_receipt["scrubbed"]) == {"clients": 1}
    assert json.loads(client_receipt["kept"]) == {"quotes": 1, "client_payments": 1,
                                                  "billing_notices": 1}
    # A receipt, once written, is not changed or removed, by anyone.
    for statement in ("update erasure_receipts set rules = 'x' where id = $1",
                      "delete from erasure_receipts where id = $1"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            owner_sql(statement, receipt["id"])
    audit = row("select detail from platform_audit where business_id = $1 and "
                "action = 'business.erased'", tenant)
    assert set(json.loads(audit["detail"])) == {"rows", "receipt"}


def test_no_trace_of_the_business_or_its_people_is_left_but_the_records_kept_on_purpose():
    world = stopped_client(70)
    needles = world.needles
    assert run_erase(world)["businesses_erased"] == 1

    def where_found(pattern: str) -> set[str]:
        found = set()
        for column in owner_sql(
            "select table_name, column_name from information_schema.columns "
            "where table_schema = 'public' and data_type in "
            "('text', 'character varying', 'jsonb', 'json', 'ARRAY') order by 1, 2"
        ):
            table, name = column["table_name"], column["column_name"]
            if owner_sql(f'select 1 from "{table}" where "{name}"::text ~* $1 limit 1', pattern):
                found.add(f"{table}.{name}")
        return found

    # Nothing that could give a person away, anywhere.
    assert where_found(needles.pattern(leave=("owner_name",))) == set()
    # The owner's name is on the two records that prove they accepted ALYR's quote and terms.
    assert where_found(needles.pattern(leave=tuple(
        k for k in vars(needles) if k != "owner_name"))) == {
        "quotes.accepted_by_name", "terms_acceptances.accepted_by"}


# ── the guards of issued documents ───────────────────────────────────────────────────────


def test_issued_documents_and_recorded_payments_go_only_through_the_one_door(
    client_factory, monkeypatch
):
    stopping = configured_shop(client_factory, monkeypatch)
    staying = configured_shop(client_factory, monkeypatch)
    world = stopped_client(70, businesses=0, fill=False)
    owner_sql("update tenants set client_id = $2, live_at = now() - interval '100 days', "
              "created_at = now() - interval '300 days' where id = $1",
              stopping.tenant_id, world.client_id)
    invoice = issued(stopping.owner, "invoice")
    issued(stopping.owner, "receipt")
    paid = stopping.owner.post(
        "/api/documents/payments", headers={"Idempotency-Key": f"pay-{uuid4().hex}"},
        json={"subject": "invoice", "id": invoice["id"], "method": "cash"})
    assert paid.status_code == 201, paid.text
    kept = issued(staying.owner, "invoice")
    stuff = ("documents", "document_lines", "document_files", "manual_payments")
    before = {t: counts_for(stopping.tenant_id).get(t, 0) for t in stuff}
    assert all(before.values()), before

    # Without the door, nobody deletes them: not the application, not the table owner.
    refusals = (asyncpg.exceptions.InsufficientPrivilegeError,
                asyncpg.exceptions.RestrictViolationError)
    for sql in ("delete from documents where tenant_id = $1",
                "delete from document_files where tenant_id = $1",
                "delete from manual_payments where tenant_id = $1"):
        error = refused_by_database(stopping.tenant_id, sql, stopping.tenant_id)
        assert isinstance(error, refusals), sql
        with pytest.raises(asyncpg.exceptions.RestrictViolationError):
            owner_sql(sql, stopping.tenant_id)
    # The application cannot open the door, or even look at it.
    error = refused_by_database(
        stopping.tenant_id, "insert into erasing_businesses (business_id) values ($1)",
        stopping.tenant_id)
    assert isinstance(error, asyncpg.exceptions.InsufficientPrivilegeError)
    error = refused_by_database(stopping.tenant_id, "select * from erasing_businesses")
    assert isinstance(error, asyncpg.exceptions.InsufficientPrivilegeError)

    async def door_open_for_one_business_only():
        conn = await asyncpg.connect(OWNER_DSN)
        door = conn.transaction()
        await door.start()
        try:
            await conn.execute("insert into erasing_businesses (business_id) values ($1)",
                               stopping.tenant_id)
            # The door is for that business only.
            with pytest.raises(asyncpg.exceptions.RestrictViolationError):
                async with conn.transaction():
                    await conn.execute("delete from documents where tenant_id = $1",
                                       staying.tenant_id)
            # And only for deleting: the paper cannot be rewritten through it.
            with pytest.raises(asyncpg.exceptions.RestrictViolationError):
                async with conn.transaction():
                    await conn.execute("update documents set total_minor = 1 "
                                       "where tenant_id = $1", stopping.tenant_id)
        finally:
            await door.rollback()  # the door was never really opened
            await conn.close()

    asyncio.run(door_open_for_one_business_only())
    assert owner_sql("select 1 from erasing_businesses") == []

    assert run_erase(world)["businesses_erased"] == 1
    assert {t: counts_for(stopping.tenant_id).get(t, 0) for t in stuff} == dict.fromkeys(stuff, 0)
    assert counts_for(staying.tenant_id)["documents"] == 1
    assert owner_sql("select count(*) as n from erasing_businesses")[0]["n"] == 0
    # Everyone else's paper is still guarded.
    with pytest.raises(asyncpg.exceptions.RestrictViolationError):
        owner_sql("delete from documents where id = $1", UUID(kept["id"]))
    # The former owner's sign-in is gone, and the other shop's still works.
    assert stopping.owner.get("/api/documents").status_code == 401
    assert staying.owner.get("/api/documents").status_code == 200


def test_the_photos_of_an_erased_business_are_removed_by_the_worker(client_factory, monkeypatch):
    shop = configured_shop(client_factory, monkeypatch)
    other = configured_shop(client_factory, monkeypatch)
    world = stopped_client(70, businesses=0, fill=False)
    owner_sql("update tenants set client_id = $2, created_at = now() - interval '300 days' "
              "where id = $1", shop.tenant_id, world.client_id)
    for who, seed in ((shop, 1), (shop, 2), (other, 3)):
        uploaded = who.owner.post("/api/media/photos", content=photo(2000, 1500, seed=seed),
                                  headers={"content-type": "image/jpeg"})
        assert uploaded.status_code == 201, uploaded.text
    store: LocalStore = shop.owner.app.state.media.store
    mine, theirs = f"shops/{shop.tenant_id}/", f"shops/{other.tenant_id}/"
    assert len(asyncio.run(store.list(mine))) >= 6 and len(asyncio.run(store.list(theirs))) >= 3
    # A stray object under the prefix that no record points at is removed too.
    stray = f"{mine}{'ab' * 32}-800.webp"
    asyncio.run(store.put(stray, b"stray", content_type="image/webp"))

    async def worker_pass(db):
        return await erase.remove_files(db, store)

    while any(with_owner_db(worker_pass, APP_DSN).values()):
        pass  # whatever earlier tests left queued is finished first
    assert with_owner_db(worker_pass, APP_DSN) == {"businesses": 0, "objects": 0, "errors": 0}
    assert run_erase(world)["businesses_erased"] == 1
    queued = row("select * from erasure_files where business_id = $1", shop.tenant_id)
    assert queued["prefix"] == mine and queued["done_at"] is None

    gone = with_owner_db(worker_pass, APP_DSN)
    assert gone["businesses"] == 1 and gone["objects"] >= 7 and gone["errors"] == 0
    assert asyncio.run(store.list(mine)) == []
    assert len(asyncio.run(store.list(theirs))) >= 3  # another shop's photos are not touched
    done = row("select * from erasure_files where business_id = $1", shop.tenant_id)
    assert done["done_at"] is not None and done["objects_deleted"] == gone["objects"]
    assert with_owner_db(worker_pass, APP_DSN) == {"businesses": 0, "objects": 0, "errors": 0}


def test_a_store_that_is_down_leaves_the_prefix_queued_for_the_next_pass(tmp_path):
    business = uuid4()
    prefix = f"shops/{business}/"
    store = LocalStore(tmp_path)
    keys = [f"{prefix}{c * 64}-800.webp" for c in "abc"]
    for key in keys:
        asyncio.run(store.put(key, b"x", content_type="image/webp"))
    owner_sql("insert into erasure_files (business_id, prefix) values ($1, $2)", business, prefix)
    failing = {"on": True}
    real_delete = store.delete

    async def flaky(key: str) -> None:
        if failing["on"] and key == keys[1]:
            raise StoreUnavailable("the store answered 503")
        await real_delete(key)

    store.delete = flaky

    async def worker_pass(db):
        return await erase.remove_files(db, store)

    first = with_owner_db(worker_pass, APP_DSN)
    assert first["errors"] == 1 and first["businesses"] == 0
    pending = row("select * from erasure_files where business_id = $1", business)
    assert pending["done_at"] is None and pending["attempts"] == 1
    assert pending["last_error"] == "StoreUnavailable: the store answered 503"
    assert asyncio.run(store.list(prefix)) == [keys[1], keys[2]]
    failing["on"] = False
    second = with_owner_db(worker_pass, APP_DSN)
    assert second["businesses"] == 1 and second["errors"] == 0
    done = row("select * from erasure_files where business_id = $1", business)
    assert done["done_at"] is not None and done["attempts"] == 2 and done["last_error"] == ""
    assert asyncio.run(store.list(prefix)) == []


def test_only_a_shops_own_prefix_can_be_listed(tmp_path):
    store = LocalStore(tmp_path)
    for bad in ("", "shops/", "shops/not-a-uuid/", "shops/../", f"shops/{uuid4()}", "_check/"):
        with pytest.raises(ValueError):
            asyncio.run(store.list(bad))


# ── a run that stops halfway ─────────────────────────────────────────────────────────────


def test_a_business_that_cannot_be_erased_is_left_whole_and_the_next_run_finishes():
    """Two businesses of one client. Something nobody planned for (a row in a table the rules do
    not know, here held by a foreign key) stops the first one's deletion at its very last
    statement. Nothing of it changes, the second is erased, and the client is not marked done.
    When the cause is gone, the next run erases the first and finishes the client."""
    world = stopped_client(70, businesses=2)
    first, second = world.businesses
    owner_sql("create table zz_blocker (tenant_id uuid not null references tenants(id))")
    owner_sql("insert into zz_blocker values ($1)", first)
    before = counts_for(first)
    blocker = True
    try:
        # The rules guard would stop the run at the door; take it out of the way for this test,
        # which is about what happens when something goes wrong in the middle.
        rules.RULES["zz_blocker"] = rules.Rule(rules.GLOBAL, "a test table")
        report = run_erase(world)
        assert report["businesses_erased"] == 1 and report["failed"] == 1
        assert counts_for(first) == before
        assert remaining(second) == {}
        assert owner_sql("select 1 from erasure_receipts where business_id = $1", first) == []
        assert owner_sql("select 1 from erasure_files where business_id = $1", first) == []
        assert owner_sql("select 1 from erasing_businesses") == []
        assert row("select erased_at from clients where id = $1", world.client_id
                   )["erased_at"] is None
        assert owner_sql("select 1 from users where id = $1", world.owner_id)  # not made anonymous

        owner_sql("drop table zz_blocker")
        blocker = False
        del rules.RULES["zz_blocker"]
        again = run_erase(world)
        assert again["businesses_erased"] == 1 and again["clients_finished"] == 1
        assert remaining(first) == {}
        assert row("select erased_at is not null as done from clients where id = $1",
                   world.client_id)["done"]
        # And a third run finds nothing to do.
        assert run_erase(world)["clients"] == []
        assert row("select count(*) as n from erasure_receipts where client_id = $1",
                   world.client_id)["n"] == 3  # two businesses and the client
    finally:
        rules.RULES.pop("zz_blocker", None)
        if blocker:
            owner_sql("drop table zz_blocker")


def test_running_it_again_changes_nothing():
    world = stopped_client(70)
    assert run_erase(world)["businesses_erased"] == 1
    snapshot = every_count()
    again = run_erase(world)
    assert again["clients"] == [] and again["businesses_erased"] == 0
    assert every_count() == snapshot
    # Even asked about the business by name after it is gone: nothing to erase.
    async def straight_at_it(db):
        return await erase.erase_business(
            db, world.client_id, world.businesses[0], [], on=subscription.today(), days=60)

    with pytest.raises(erase.NotDue):
        with_owner_db(straight_at_it)
    assert every_count() == snapshot


# ── what stops a run ─────────────────────────────────────────────────────────────────────


def test_a_held_client_is_not_erased_until_released(capsys, monkeypatch):
    world = stopped_client(70)
    tenant = world.businesses[0]
    before = counts_for(tenant)
    monkeypatch.setenv("ALYR_MIGRATION_URL", OWNER_DSN)
    get_settings.cache_clear()
    try:
        assert asyncio.run(erase_job.main(
            ["hold", str(world.client_id), "Dispute", "about", "the", "last", "invoice"])) == 0
        assert json.loads(capsys.readouterr().out) == {"held": True}
        report = run_erase(world)
        assert report["clients"][0]["skipped"] == "held" and report["businesses_erased"] == 0
        assert counts_for(tenant) == before
        assert row("select erase_hold from clients where id = $1", world.client_id
                   )["erase_hold"] == "Dispute about the last invoice"

        assert asyncio.run(erase_job.main(["release", str(world.client_id)])) == 0
        assert json.loads(capsys.readouterr().out) == {"released": True}
        assert run_erase(world)["businesses_erased"] == 1
        # An erased client cannot be held, and a hold needs a reason.
        assert asyncio.run(erase_job.main(["hold", str(world.client_id), "Too late"])) == 1
        capsys.readouterr()
        with pytest.raises(ValueError):
            with_owner_db(lambda db: erase.hold(db, world.client_id, "  "))
    finally:
        get_settings.cache_clear()


def test_a_card_subscription_still_running_stops_the_erasure():
    world = stopped_client(70)
    owner_sql("update card_checkouts set subscription_status = 'active' where client_id = $1",
              world.client_id)
    report = run_erase(world)
    assert report["clients"][0]["skipped"] == "card_subscription_running"
    assert counts_for(world.businesses[0])["orders"] == 1
    owner_sql("update card_checkouts set subscription_status = 'canceled' where client_id = $1",
              world.client_id)
    assert run_erase(world)["businesses_erased"] == 1


def test_alyrs_own_business_is_never_erased(monkeypatch):
    world = stopped_client(70)
    slug = row("select slug from tenants where id = $1", world.businesses[0])["slug"]
    monkeypatch.setattr(erase, "PROTECTED_SLUGS", (slug,))
    report = run_erase(world)
    assert report["clients"][0]["skipped"] == "protected_business"
    assert counts_for(world.businesses[0])["orders"] == 1


def test_one_run_erases_at_most_the_number_it_is_allowed():
    worlds = [stopped_client(70) for _ in range(3)]
    first = run_erase(worlds, erase_max_per_run=2)
    assert first["businesses_erased"] == 2 and first["clients_finished"] == 2
    waiting = [b for c in first["clients"] for b in c["businesses"] if b.get("waiting")]
    assert len(waiting) == 1
    second = run_erase(worlds, erase_max_per_run=2)
    assert second["businesses_erased"] == 1 and second["clients_finished"] == 1
    assert all(remaining(w.businesses[0]) == {} for w in worlds)


# ── an owner the database applies row-level security to ──────────────────────────────────


def test_it_works_for_an_owner_that_row_level_security_applies_to():
    """On a host where the owner's role cannot bypass row-level security the job still works,
    because it names the business and itself in every transaction. The probe role is a member of
    the owner's role (so it owns what the owner owns) and has no bypass."""
    probe = "erase_probe"
    owner_sql(f"drop role if exists {probe}")
    owner_sql(f"create role {probe} login password 'probe' nobypassrls in role alyr")
    try:
        assert row("select rolbypassrls, rolsuper from pg_roles where rolname = $1", probe
                   ) == {"rolbypassrls": False, "rolsuper": False}
        world = stopped_client(70)
        keeper = stopped_client(5)
        before = counts_for(world.businesses[0])
        assert before["orders"] == 1
        # Someone from the erased business also works for another client's: their membership
        # there is invisible to a role that row-level security applies to, unless the job says
        # whose memberships it is asking about.
        owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin')",
                  keeper.businesses[0], world.staff_id)
        dsn = f"postgresql://{probe}:probe@{HOST}/alyr_test"
        report = run_erase(world, dsn=dsn)
        assert report["failed"] == 0 and report["businesses_erased"] == 1
        assert report["clients_finished"] == 1
        assert remaining(world.businesses[0]) == {}
        assert owner_sql("select 1 from users where id = $1", world.staff_id)
        assert owner_sql("select 1 from memberships where user_id = $1 and tenant_id = $2",
                         world.staff_id, keeper.businesses[0])
    finally:
        owner_sql(f"drop role if exists {probe}")


# ── the files of the photo store, over the wire ──────────────────────────────────────────


def test_the_store_lists_everything_under_a_prefix_so_that_empty_means_empty(tmp_path):
    business = uuid4()
    store = LocalStore(tmp_path)
    good = f"shops/{business}/{'ab' * 32}-800.webp"
    asyncio.run(store.put(good, b"x", content_type="image/webp"))
    (tmp_path / f"shops/{business}" / "notes.txt").write_text("not a photo")
    listed = asyncio.run(store.list(f"shops/{business}/"))
    assert listed == sorted([good, f"shops/{business}/notes.txt"])
    assert [k for k in listed if valid_key(k)] == [good]


def test_something_that_is_not_a_photo_is_reported_and_the_photos_still_go(tmp_path):
    """A stray the store will not delete by its name must not hide the photos behind it, and the
    prefix must not be called empty while it is there."""
    business = uuid4()
    prefix = f"shops/{business}/"
    store = LocalStore(tmp_path)
    photos = [f"{prefix}{c * 64}-800.webp" for c in "bc"]
    for key in photos:
        asyncio.run(store.put(key, b"x", content_type="image/webp"))
    stray = tmp_path / prefix / "aaa-notes.txt"  # sorts before the photos
    stray.write_text("not a photo")

    async def worker_pass(db):
        return await erase.remove_files(db, store)

    while any(with_owner_db(worker_pass, APP_DSN).values()):
        pass  # whatever earlier tests left queued is finished first
    owner_sql("insert into erasure_files (business_id, prefix) values ($1, $2)", business, prefix)
    first = with_owner_db(worker_pass, APP_DSN)
    assert first["objects"] == 2 and first["businesses"] == 0
    pending = row("select * from erasure_files where business_id = $1", business)
    assert pending["done_at"] is None
    assert pending["last_error"] == "1 objects that are not photo files were left"
    assert asyncio.run(store.list(prefix)) == [f"{prefix}aaa-notes.txt"]
    stray.unlink()  # a person looked
    second = with_owner_db(worker_pass, APP_DSN)
    assert second["businesses"] == 1
    assert row("select done_at is not null as done from erasure_files where business_id = $1",
               business)["done"]


def test_the_workspace_of_an_erased_business_is_closed_to_all_its_people(
    client_factory, monkeypatch
):
    shop = configured_shop(client_factory, monkeypatch)
    world = stopped_client(70, businesses=0, fill=False)
    owner_sql("update tenants set client_id = $2, created_at = now() - interval '300 days' "
              "where id = $1", shop.tenant_id, world.client_id)
    assert shop.owner.get("/api/documents").status_code == 200
    assert run_erase(world)["businesses_erased"] == 1
    for client in (shop.owner, shop.admin, shop.agent):
        assert client.get("/api/documents").status_code == 401
    # They cannot ask for a code at the old address either: the people are gone.
    emails = list(shop.emails.values())
    assert owner_sql("select count(*) as n from users where email = any($1::text[])", emails
                     )[0]["n"] == 0


def test_the_status_shows_the_record_without_a_name_a_number_or_a_reason(capsys, monkeypatch):
    world = stopped_client(70)
    held = stopped_client(70)
    assert with_owner_db(lambda db: erase.hold(db, held.client_id, "Dispute with " + "Layla Zorbo"))
    assert run_erase(world)["businesses_erased"] == 1
    monkeypatch.setenv("ALYR_MIGRATION_URL", OWNER_DSN)
    get_settings.cache_clear()
    try:
        assert asyncio.run(erase_job.main(["status"])) == 0
    finally:
        get_settings.cache_clear()
    out = capsys.readouterr().out
    status = json.loads(out)
    assert status["rules"] == erase.rules_version()
    assert str(held.client_id) in {h["client_id"] for h in status["held"]}
    mine = [r for r in status["receipts"] if r["business_id"] == str(world.businesses[0])]
    assert len(mine) == 1 and mine[0]["rows"] > 30 and mine[0]["scope"] == "business"
    assert str(world.businesses[0]) in {f["business_id"] for f in status["photo_store"]}
    for needle in (*vars(world.needles).values(), "Layla Zorbo", "Dispute"):
        assert needle not in out
    with_owner_db(lambda db: erase.release(db, held.client_id))


# ── the cases a reviewer found ───────────────────────────────────────────────────────────


def test_a_client_with_some_businesses_gone_cannot_be_brought_back(office):
    """The cap leaves the second business for another night. In between, the cancellation can
    no longer be undone or asked again: a client half erased is not one to bring back. A hold
    is how to stop the rest."""
    world = stopped_client(70, businesses=2)
    first, second = world.businesses
    report = run_erase(world, erase_max_per_run=1)
    assert report["businesses_erased"] == 1 and report["clients_finished"] == 0
    assert remaining(first) == {} and counts_for(second)["orders"] == 1
    url = f"{ADMIN}/clients/{world.client_id}/cancel"
    for call in (office.delete(url), office.post(url, json={"note": "Asked again"})):
        assert call.status_code == 422 and "erasure of this client" in call.json()["detail"]
    assert row("select cancels_on is not null as stopped from clients where id = $1",
               world.client_id)["stopped"]
    # Someone who wants the rest kept holds it.
    assert with_owner_db(lambda db: erase.hold(db, world.client_id, "Asked to keep the second"))
    assert run_erase(world)["clients"][0]["skipped"] == "held"
    assert counts_for(second)["orders"] == 1
    assert with_owner_db(lambda db: erase.release(db, world.client_id))
    assert run_erase(world)["clients_finished"] == 1
    assert remaining(second) == {}


def test_a_business_made_after_the_cancellation_was_asked_for_is_not_erased_with_it():
    """An owner who cancelled and signed up again under the same client has a live business that
    the old cancellation never covered. Nothing of that client is erased until a person looks."""
    world = stopped_client(70)
    newer = owner_sql(
        "insert into tenants (name, slug, business_type, client_id) values ($1, $2, 'bakery', $3) "
        "returning id", f"Zq Again {world.tag}", f"zq-again-{world.tag}", world.client_id,
    )[0]["id"]
    owner_sql("insert into contacts (tenant_id, phone, name) values ($1, $2, 'A new customer')",
              newer, f"9745{uuid4().int % 10_000_000:07d}")
    report = run_erase(world)
    assert report["clients"][0]["skipped"] == "business_made_after_the_cancellation"
    assert report["businesses_erased"] == 0
    assert counts_for(world.businesses[0])["orders"] == 1 and counts_for(newer)["contacts"] == 1
    # The person moves it to a client of its own; then the old one is erased on its own.
    owner_sql("update tenants set client_id = null where id = $1", newer)
    assert run_erase(world)["businesses_erased"] == 1
    assert counts_for(newer)["contacts"] == 1


def test_a_cancelled_client_takes_no_business_in(office):
    cancelled = stopped_client(5, fill=False)
    erased = stopped_client(70, fill=False)
    assert run_erase(erased)["clients_finished"] == 1
    staying = owner_sql("insert into clients (name) values ('Staying Co') returning id")[0]["id"]
    visitor = owner_sql(
        "insert into tenants (name, slug, business_type) values ($1, $2, 'bakery') returning id",
        f"Moving {uuid4().hex[:6]}", f"moving-{uuid4().hex[:6]}",
    )[0]["id"]
    for target in (cancelled.client_id, erased.client_id):
        moved = office.post(f"{ADMIN}/businesses/{visitor}/client", json={"client_id": str(target)})
        assert moved.status_code == 404 and "has cancelled" in moved.json()["detail"]
    assert row("select client_id from tenants where id = $1", visitor)["client_id"] is None
    ok = office.post(f"{ADMIN}/businesses/{visitor}/client", json={"client_id": str(staying)})
    assert ok.status_code == 200
    assert row("select client_id from tenants where id = $1", visitor)["client_id"] == staying


def test_a_hold_is_a_short_reference_not_a_story():
    world = stopped_client(70)
    with pytest.raises(ValueError, match="short reference"):
        with_owner_db(lambda db: erase.hold(db, world.client_id, "x" * 81))
    assert with_owner_db(lambda db: erase.hold(db, world.client_id, "x" * 80))
    assert with_owner_db(lambda db: erase.release(db, world.client_id))
