"""Migrations 0121 to 0123 and the database's own rules for Discovery Phase 2 (spec 066): the
six new tables are a shop's own (forced row-level security, a tenant-first index: the Phase 1
table test reads the catalogue, so it covers them too) and the constraints say what the spec says.
"""

import asyncio

import asyncpg
import pytest

from conftest import APP_DSN
from test_consent import owner_sql


@pytest.fixture
def world():
    tenant = owner_sql("insert into tenants (name) values ('Tables 2') returning id")[0]["id"]
    place = owner_sql("insert into discovery_locations (tenant_id, name) values ($1, 'P') "
                      "returning id", tenant)[0]["id"]
    run = owner_sql("insert into discovery_runs (tenant_id, connector_kind, status) "
                    "values ($1, 'sample', 'done') returning id", tenant)[0]["id"]
    finding = owner_sql(
        "insert into discovery_findings (tenant_id, fingerprint, rule_id, location_id, kind, "
        "severity, first_run_id, last_run_id) values ($1, 'hours_missing:x', 'hours_missing', $2, "
        "'agent', 'high', $3, $3) returning id", tenant, place, run)[0]["id"]
    return tenant, place, finding


def refused(sql: str, *args) -> bool:
    try:
        owner_sql(sql, *args)
    except asyncpg.PostgresError:
        return True
    return False


HASH = "a" * 64
CHANGE = '{"field": "hours", "before": {}, "after": {}}'


def insert(world, *, type="set_hours", target="listing", status="proposed", subject_ref="",
           expires="now() + interval '14 days'", extra_columns="", extra_values=""):
    """An insert of one proposal (and its arguments), with what a test varies in its place."""
    tenant, place, finding = world
    return (
        "insert into discovery_proposals (tenant_id, finding_id, location_id, type, target, "
        "connector_kind, subject_ref, change, change_hash, severity, status, proposed_at, "
        f"expires_at{extra_columns}) values ($1, $2, $3, '{type}', '{target}', 'sample', "
        f"'{subject_ref}', '{CHANGE}', '{HASH}', 'high', '{status}', now(), {expires}"
        f"{extra_values}) returning id",
        tenant, finding, place,
    )


def make(world, **more):
    return owner_sql(*insert(world, **more))


# ── proposals ───────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("column,value", [("type", "set_everything"), ("target", "google"),
                                          ("status", "pending")])
def test_a_proposal_takes_only_the_types_targets_and_statuses_of_the_spec(world, column, value):
    assert refused(*insert(world, **{column: value}))


def test_every_status_and_type_of_the_spec_is_accepted(world):
    n = 0
    for ptype in ("set_hours", "set_phone", "set_category", "set_name", "add_whatsapp_link",
                  "reply_to_review"):
        n += 1
        assert not refused(*insert(world, type=ptype, subject_ref=f"r{n}"))


def test_a_proposal_must_expire_after_it_was_made(world):
    assert refused(*insert(world, expires="now() - interval '1 day'"))


def test_a_status_needs_what_it_means(world):
    assert refused(*insert(world, status="applied"))  # no applied_at
    assert refused(*insert(world, status="declined"))  # no decided_at
    assert refused(*insert(world, status="undone"))  # no undone_at
    assert refused(*insert(world, status="expired"))  # no reason
    assert refused(*insert(world, status="approved"))  # no person's tap, no door, no name


def test_only_one_live_proposal_for_the_same_thing_but_closed_ones_do_not_count(world):
    make(world)
    assert refused(*insert(world))
    assert refused(*insert(world, status="approved",
                           extra_columns=", decided_at, decided_channel, decided_name",
                           extra_values=", now(), 'portal', 'Huda'"))
    # another target, another subject, a closed one: each is its own
    assert not refused(*insert(world, target="website"))
    assert not refused(*insert(world, subject_ref="another"))
    owner_sql("update discovery_proposals set status = 'declined', decided_at = now() "
              "where tenant_id = $1 and target = 'listing' and subject_ref = ''", world[0])
    assert not refused(*insert(world))


def test_the_hash_is_a_sha256_in_hex(world):
    tenant, place, finding = world
    for bad in ("short", "G" * 64, "A" * 64):
        assert refused(
            "insert into discovery_proposals (tenant_id, finding_id, location_id, type, target, "
            "connector_kind, change, change_hash, severity, expires_at) values ($1, $2, $3, "
            "'set_hours', 'listing', 'sample', '{}', $4, 'high', now() + interval '1 day')",
            tenant, finding, place, bad), bad


def test_a_change_cannot_be_edited_by_anyone_not_even_the_owner_of_the_database(world):
    [row] = make(world)
    assert row["id"]
    for assignment in ("type = 'set_phone'", "target = 'website'", "subject_ref = 'x'",
                       "change_hash = '" + "b" * 64 + "'", "connector_kind = 'gbp'",
                       "change = '{\"field\": \"hours\"}'"):
        assert refused(f"update discovery_proposals set {assignment} where id = $1", row["id"]), (
            assignment)
    assert not refused("update discovery_proposals set status = 'declined', decided_at = now() "
                       "where id = $1", row["id"])  # what may change, may


def test_removing_a_place_takes_its_proposals_facts_managers_and_sample_state_with_it(world):
    tenant, place, finding = world
    user = owner_sql("insert into users (email, name) values ('t2@docs.example', 'T') "
                     "on conflict (email) do update set name = 'T' returning id")[0]["id"]
    make(world)
    owner_sql("insert into discovery_facts (tenant_id, location_id, key, value, source) "
              "values ($1, $2, 'phone', '{\"phone\": \"+97455550112\"}', 'sample')", tenant, place)
    owner_sql("insert into discovery_location_managers (tenant_id, location_id, user_id) "
              "values ($1, $2, $3)", tenant, place, user)
    owner_sql("insert into discovery_sample_state (tenant_id, location_id, target, field, value) "
              "values ($1, $2, 'listing', 'hours', '{}')", tenant, place)
    owner_sql("delete from discovery_locations where id = $1", place)
    for table in ("discovery_proposals", "discovery_facts", "discovery_location_managers",
                  "discovery_sample_state", "discovery_findings"):
        assert owner_sql(f"select count(*) as n from {table} where tenant_id = $1",
                         tenant)[0]["n"] == 0, table


# ── facts, managers, settings, sample state ─────────────────────────────────────────────


def test_a_fact_is_one_per_place_and_key_and_an_owner_fact_names_the_person(world):
    tenant, place, _ = world
    sql = ("insert into discovery_facts (tenant_id, location_id, key, value, source, "
           "confirmed_name) values ($1, $2, $3, '{\"phone\": \"+97455550112\"}', $4, $5)")
    assert not refused(sql, tenant, place, "phone", "sample", "")
    assert refused(sql, tenant, place, "phone", "sample", "")  # one per place and key
    assert refused(sql, tenant, place, "category", "owner", "")  # an owner fact needs a name
    assert not refused(sql, tenant, place, "category", "owner", "Huda")
    assert refused(sql, tenant, place, "colour", "sample", "")
    assert refused(sql, tenant, place, "hours", "places", "")  # `places` is a default, never a row
    assert refused("insert into discovery_facts (tenant_id, location_id, key, value, source) "
                   "values ($1, $2, 'name', '[]', 'sample')", tenant, place)


def test_a_manager_is_linked_to_a_place_once(world):
    tenant, place, _ = world
    user = owner_sql("insert into users (email, name) values ('t3@docs.example', 'T') "
                     "on conflict (email) do update set name = 'T' returning id")[0]["id"]
    sql = ("insert into discovery_location_managers (tenant_id, location_id, user_id) "
           "values ($1, $2, $3)")
    assert not refused(sql, tenant, place, user) and refused(sql, tenant, place, user)


def test_the_daily_cap_is_one_to_five_and_a_shop_has_one_row(world):
    tenant, _, _ = world
    for bad in (0, 6, -2):
        assert refused("insert into discovery_settings (tenant_id, ask_cap_per_day) "
                       "values ($1, $2)", tenant, bad), bad
    assert not refused("insert into discovery_settings (tenant_id, ask_cap_per_day) "
                       "values ($1, 5)", tenant)
    assert refused("insert into discovery_settings (tenant_id) values ($1)", tenant)
    assert owner_sql("select weekly_run from discovery_settings where tenant_id = $1",
                     tenant)[0]["weekly_run"] is False  # off by default


def test_the_weekly_run_and_the_asks_are_off_for_a_new_shop():
    tenant = owner_sql("insert into tenants (name) values ('Fresh') returning id")[0]["id"]
    assert owner_sql("select count(*) as n from discovery_settings where tenant_id = $1",
                     tenant)[0]["n"] == 0
    contact = owner_sql("insert into contacts (tenant_id, phone, name, role) values "
                        "($1, '97455501234', 'Staff', 'staff') returning discovery_asks",
                        tenant)
    assert contact[0]["discovery_asks"] is False


def test_an_ask_is_one_per_proposal_per_person_and_answers_are_known(world):
    tenant, place, finding = world
    [row] = make(world)
    contact = owner_sql("insert into contacts (tenant_id, phone, name, role) values "
                        "($1, '97455501235', 'Staff', 'staff') returning id", tenant)[0]["id"]
    sql = ("insert into discovery_asks (tenant_id, proposal_id, contact_id, change_hash, sent_as"
           ", status, answer, closed_reason) values ($1, $2, $3, '" + HASH + "', $4, $5, $6, $7)")
    assert not refused(sql, tenant, row["id"], contact, "buttons", "queued", None, None)
    assert refused(sql, tenant, row["id"], contact, "template", "queued", None, None)
    other = owner_sql("insert into contacts (tenant_id, phone, name, role) values "
                      "($1, '97455501236', 'Staff', 'staff') returning id", tenant)[0]["id"]
    assert refused(sql, tenant, row["id"], other, "email", "queued", None, None)
    assert refused(sql, tenant, row["id"], other, "buttons", "sent", None, None)
    assert refused(sql, tenant, row["id"], other, "buttons", "answered", "approve all", None)
    assert refused(sql, tenant, row["id"], other, "buttons", "closed", None, "Blocked!")
    assert not refused(sql, tenant, row["id"], other, "buttons", "closed", None,
                       "blocked_window_closed")


def test_only_staff_can_be_marked_to_receive_asks(world):
    tenant, _, _ = world
    customer = owner_sql("insert into contacts (tenant_id, phone, name) values "
                         "($1, '97455501237', 'A customer') returning id", tenant)[0]["id"]
    assert refused("update contacts set discovery_asks = true where id = $1", customer)


def test_the_sample_state_takes_a_known_target_and_field_once_per_key(world):
    tenant, place, _ = world
    sql = ("insert into discovery_sample_state (tenant_id, location_id, target, field, "
           "subject_ref, value) values ($1, $2, $3, $4, $5, '{}')")
    assert not refused(sql, tenant, place, "listing", "hours", "")
    assert refused(sql, tenant, place, "listing", "hours", "")
    assert not refused(sql, tenant, place, "listing", "review_reply", "r1")
    assert refused(sql, tenant, place, "google", "hours", "")
    assert refused(sql, tenant, place, "listing", "photos", "")


# ── another shop ────────────────────────────────────────────────────────────────────────


def test_one_shop_cannot_read_or_write_anothers_rows_in_the_new_tables(world):
    tenant, place, finding = world
    make(world)
    owner_sql("insert into discovery_facts (tenant_id, location_id, key, value, source) "
              "values ($1, $2, 'phone', '{\"phone\": \"+97455550112\"}', 'sample')", tenant, place)
    other = owner_sql("insert into tenants (name) values ('Other 2') returning id")[0]["id"]

    async def as_other():
        conn = await asyncpg.connect(APP_DSN)
        try:
            await conn.execute("select set_config('app.tenant_id', $1, false)", str(other))
            seen = {}
            for table in ("discovery_proposals", "discovery_facts", "discovery_asks",
                          "discovery_settings", "discovery_sample_state",
                          "discovery_location_managers"):
                seen[table] = await conn.fetchval(f"select count(*) from {table}")
            blocked = False
            try:
                await conn.execute(
                    "insert into discovery_facts (tenant_id, location_id, key, value, source) "
                    "values ($1, $2, 'name', '{}', 'sample')", tenant, place)
            except asyncpg.PostgresError:
                blocked = True
            return seen, blocked
        finally:
            await conn.close()

    seen, blocked = asyncio.run(as_other())
    assert set(seen.values()) == {0} and blocked
