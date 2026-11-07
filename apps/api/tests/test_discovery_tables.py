"""Migration 0120 and the database's own rules for Discovery (spec 065): every table is a shop's
own with forced row-level security and an index that starts with `tenant_id` (this fails if a
seventh table is added without them), and the constraints say what the spec says."""

from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
import pytest

from conftest import APP_DSN
from test_consent import owner_sql

TABLES = ("discovery_connections", "discovery_findings", "discovery_locations",
          "discovery_reviews", "discovery_run_steps", "discovery_runs")
MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


def test_the_migration_is_0120_in_the_range_reserved_for_discovery():
    names = sorted(p.name for p in MIGRATIONS.glob("01[2-2]*_*.sql"))
    assert names == ["0120_discovery.sql"]
    assert owner_sql("select name from schema_migrations where name like '0120%'")


def test_discovery_has_exactly_these_six_tables():
    rows = owner_sql("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                     "where n.nspname = 'public' and c.relkind = 'r' and relname like 'discovery%' "
                     "order by 1")
    assert tuple(r["relname"] for r in rows) == TABLES


def test_every_discovery_table_has_tenant_id_forced_rls_a_policy_and_a_tenant_first_index():
    problems = []
    for r in owner_sql(
        "select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced, "
        "exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' "
        "  and not a.attisdropped and a.attnotnull) as tenant, "
        "exists (select 1 from pg_policy p where p.polrelid = c.oid) as policy, "
        "exists (select 1 from pg_index i join pg_attribute a on a.attrelid = c.oid "
        "  and a.attnum = i.indkey[0] where i.indrelid = c.oid and a.attname = 'tenant_id') "
        "  as indexed, "
        "(select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a "
        "  on a.attrelid = d.adrelid and a.attnum = d.adnum where d.adrelid = c.oid "
        "  and a.attname = 'tenant_id') as fallback "
        "from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'discovery%'"
    ):
        for need, ok in (("tenant_id not null", r["tenant"]), ("row-level security", r["rls"]),
                         ("forced row-level security", r["forced"]), ("a policy", r["policy"]),
                         ("an index starting with tenant_id", r["indexed"]),
                         ("tenant_id default from the session",
                          "app.tenant_id" in (r["fallback"] or ""))):
            if not ok:
                problems.append(f"{r['name']}: no {need}")
    assert problems == []


def test_the_application_role_still_cannot_bypass_row_level_security():
    [role] = owner_sql("select rolsuper, rolbypassrls from pg_roles where rolname = 'alyr_app'")
    assert (role["rolsuper"], role["rolbypassrls"]) == (False, False)


# ── what the tables refuse ──────────────────────────────────────────────────────────────


@pytest.fixture
def world():
    """A shop with one place and one run, made as the database's owner."""
    tenant = owner_sql("insert into tenants (name) values ('Tables') returning id")[0]["id"]
    place = owner_sql("insert into discovery_locations (tenant_id, name) values ($1, 'P') "
                      "returning id", tenant)[0]["id"]
    run = owner_sql("insert into discovery_runs (tenant_id, connector_kind, status) "
                    "values ($1, 'sample', 'done') returning id", tenant)[0]["id"]
    return tenant, place, run


def refused(sql: str, *args) -> bool:
    try:
        owner_sql(sql, *args)
    except asyncpg.PostgresError:
        return True
    return False


def finding(tenant, place, run, fingerprint="r:1", **more):
    cols = {"kind": "owner", "severity": "high", "status": "open"} | more
    return owner_sql(
        "insert into discovery_findings (tenant_id, fingerprint, rule_id, location_id, kind, "
        "severity, status, first_run_id, last_run_id) values ($1, $2, 'r', $3, $4, $5, $6, $7, $7) "
        "returning id", tenant, fingerprint, place, cols["kind"], cols["severity"], cols["status"],
        run)


def test_a_finding_fingerprint_is_unique_per_shop_and_free_in_another(world):
    tenant, place, run = world
    finding(tenant, place, run)
    assert refused("insert into discovery_findings (tenant_id, fingerprint, rule_id, kind, "
                   "severity, first_run_id, last_run_id) values ($1, 'r:1', 'r', 'owner', 'low', "
                   "$2, $2)", tenant, run)
    other = owner_sql("insert into tenants (name) values ('Other') returning id")[0]["id"]
    other_run = owner_sql("insert into discovery_runs (tenant_id, connector_kind) values ($1, "
                          "'sample') returning id", other)[0]["id"]
    assert not refused("insert into discovery_findings (tenant_id, fingerprint, rule_id, kind, "
                       "severity, first_run_id, last_run_id) values ($1, 'r:1', 'r', 'owner', "
                       "'low', $2, $2)", other, other_run)


@pytest.mark.parametrize("column,value", [
    ("kind", "robot"), ("severity", "urgent"), ("status", "approved"), ("status", "done"),
])
def test_a_finding_takes_only_the_kinds_severities_and_statuses_of_the_spec(world, column, value):
    tenant, place, run = world
    assert refused(
        "insert into discovery_findings (tenant_id, fingerprint, rule_id, kind, severity, status, "
        "first_run_id, last_run_id) select $1, 'x', 'r', "
        + ("$2" if column == "kind" else "'owner'") + ", "
        + ("$2" if column == "severity" else "'low'") + ", "
        + ("$2" if column == "status" else "'open'") + ", $3, $3", tenant, value, run)


def test_every_status_of_the_spec_is_accepted(world):
    tenant, place, run = world
    for n, status in enumerate(("open", "skipped", "owner_done", "verified", "gone")):
        assert finding(tenant, place, run, f"s:{n}", status=status)


@pytest.mark.parametrize("rating,ok", [(0, False), (1, True), (5, True), (6, False)])
def test_a_review_rating_is_one_to_five(world, rating, ok):
    tenant, place, run = world
    refusal = refused("insert into discovery_reviews (tenant_id, location_id, source, source_ref, "
                      "rating, posted_at) values ($1, $2, 'sample', $3, $4, now())",
                      tenant, place, f"ref-{rating}", rating)
    assert refusal is (not ok)


def test_a_review_is_unique_per_shop_source_and_reference_and_its_source_is_known(world):
    tenant, place, run = world
    sql = ("insert into discovery_reviews (tenant_id, location_id, source, source_ref, rating, "
           "posted_at) values ($1, $2, $3, 'same', 3, now())")
    owner_sql(sql, tenant, place, "sample")
    assert refused(sql, tenant, place, "sample")
    assert not refused(sql, tenant, place, "google")
    assert refused(sql, tenant, place, "yelp")


def test_only_one_connection_of_a_kind_is_on_and_only_one_run_is_active(world):
    tenant, place, run = world
    on = "insert into discovery_connections (tenant_id, kind, status) values ($1, $2, $3)"
    owner_sql(on, tenant, "sample", "on")
    assert refused(on, tenant, "sample", "on")
    assert not refused(on, tenant, "sample", "off")
    assert not refused(on, tenant, "places", "on")
    assert refused(on, tenant, "mystery", "on")
    start = ("insert into discovery_runs (tenant_id, connector_kind, status) values ($1, 'sample', "
             "$2)")
    owner_sql(start, tenant, "queued")
    assert refused(start, tenant, "running")
    assert refused(start, tenant, "queued")
    assert not refused(start, tenant, "done")
    assert not refused(start, tenant, "failed")


@pytest.mark.parametrize("column,value", [
    ("status", "paused"), ("trigger", "voice"), ("score", 101), ("score", -1),
    ("step_budget", 0), ("steps_used", -1),
])
def test_a_run_takes_only_what_the_spec_says(world, column, value):
    tenant, place, run = world
    assert refused(f"insert into discovery_runs (tenant_id, connector_kind, status, {column}) "
                   "values ($1, 'sample', 'done', $2)", tenant, value)


def test_a_run_step_keeps_its_place_in_the_log_once(world):
    tenant, place, run = world
    sql = "insert into discovery_run_steps (tenant_id, run_id, seq, tool) values ($1, $2, $3, 't')"
    owner_sql(sql, tenant, run, 1)
    assert refused(sql, tenant, run, 1) and refused(sql, tenant, run, 0)
    assert not refused(sql, tenant, run, 2)


def test_one_primary_place_per_shop_and_a_real_whatsapp_number(world):
    tenant, place, run = world
    primary = ("insert into discovery_locations (tenant_id, name, is_primary) "
               "values ($1, 'Q', true)")
    owner_sql(primary, tenant)
    assert refused(primary, tenant)
    for bad in ("55550150", "+0123", "+97455", "+974 5555 0150", "call me"):
        assert refused("insert into discovery_locations (tenant_id, name, whatsapp_e164) "
                       "values ($1, 'N', $2)", tenant, bad), bad
    assert refused("insert into discovery_locations (tenant_id, name) values ($1, '  ')", tenant)
    assert not refused("insert into discovery_locations (tenant_id, name, whatsapp_e164) "
                       "values ($1, 'N', '+97455550150')", tenant)


def test_connection_config_must_be_an_object(world):
    tenant, place, run = world
    assert refused("insert into discovery_connections (tenant_id, kind, config) "
                   "values ($1, 'sample', '[]')", tenant)


def test_removing_a_place_removes_its_findings_and_reviews_and_nothing_else(world):
    tenant, place, run = world
    finding(tenant, place, run, "gone:1")
    finding_elsewhere = owner_sql(
        "insert into discovery_findings (tenant_id, fingerprint, rule_id, kind, severity, "
        "first_run_id, last_run_id) values ($1, 'whole', 'r', 'process', 'low', $2, $2) "
        "returning id", tenant, run)[0]["id"]
    owner_sql("insert into discovery_reviews (tenant_id, location_id, source, source_ref, rating, "
              "posted_at) values ($1, $2, 'sample', 'gone', 3, now())", tenant, place)
    owner_sql("delete from discovery_locations where id = $1", place)
    left = owner_sql("select id from discovery_findings where tenant_id = $1", tenant)
    assert [r["id"] for r in left] == [finding_elsewhere]
    assert owner_sql("select count(*) from discovery_reviews where tenant_id = $1",
                     tenant)[0]["count"] == 0


def test_the_app_role_works_only_inside_its_own_shop(world):
    tenant, place, run = world

    async def attempt():
        conn = await asyncpg.connect(APP_DSN)
        try:
            async with conn.transaction():
                await conn.execute("select set_config('app.tenant_id', $1, true)", str(uuid4()))
                return (await conn.fetchval("select count(*) from discovery_runs"),
                        await conn.execute("update discovery_runs set status = 'failed'"))
        finally:
            await conn.close()

    import asyncio

    assert asyncio.run(attempt()) == (0, "UPDATE 0")
    assert owner_sql("select status from discovery_runs where id = $1", UUID(str(run))
                     )[0]["status"] == "done"


def test_the_activity_record_learns_discovery_and_keeps_every_older_subject():
    [row] = owner_sql("select pg_get_constraintdef(oid) as d from pg_constraint "
                      "where conrelid = 'activity'::regclass "
                      "and conname = 'activity_subject_check'")
    for subject in ("conversation", "order", "booking", "account", "item", "catalog", "document",
                    "team", "discovery"):
        assert f"'{subject}'" in row["d"], subject
