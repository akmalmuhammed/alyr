"""The back office and the worker as database roles (ALY-125 part 3, SEC-5, D-137): the guard that
used to trust a setting any code could write now also asks which login made the connection, once
it is enforced. Everything here runs against the real schema and real logins."""

import asyncio
import json
from contextlib import asynccontextmanager

import asyncpg
import pytest

from alyr import db_roles
from alyr.seed import ALYR_STAFF_EMAIL, DEMO_TENANT_ID
from conftest import APP_DSN, EXTERNAL, HOST, OWNER_DSN
from test_consent import owner_sql
from test_onboarding import new_business
from test_pricing import ADMIN, client_of, open_quote
from test_sign_in import sign_in

pytestmark = pytest.mark.skipif(EXTERNAL, reason="needs to make logins in the test cluster")

ADMIN_DSN = f"postgresql://alyr_admin:alyr_admin_local@{HOST}/alyr_test"
WORKER_DSN = f"postgresql://alyr_worker:alyr_worker_local@{HOST}/alyr_test"


@pytest.fixture
def logins(client):
    """Give the two roles a login, and put the guard back to not enforced whatever happens.
    `client` first: building the app seeds the demo shop and the staff list."""
    owner_sql("alter role alyr_admin login password 'alyr_admin_local'")
    owner_sql("alter role alyr_worker login password 'alyr_worker_local'")
    owner_sql("update role_guard set enforced = false")
    yield
    owner_sql("update role_guard set enforced = false")


def enforce(on=True):
    owner_sql("update role_guard set enforced = $1", on)


def as_login(dsn, *statements):
    """Run each statement on one connection of that login, in one transaction that is rolled
    back; returns the last result. An error is raised."""
    async def go():
        conn = await asyncpg.connect(dsn)
        try:
            tx = conn.transaction()
            await tx.start()
            try:
                result = None
                for sql, *args in statements:
                    result = await conn.fetch(sql, *args)
                return result
            finally:
                await tx.rollback()
        finally:
            await conn.close()

    return asyncio.run(go())


DECLARE_OFFICE = ("select set_config('app.platform_admin', 'on', true)",)
DECLARE_WORKER = ("select set_config('app.worker', 'on', true)",)


def a_job():
    """A job of the demo shop, found by its kind; returns the shop."""
    owner_sql("delete from jobs where kind = 'roles-check'")
    owner_sql("insert into jobs (tenant_id, kind) values ($1, 'roles-check')", DEMO_TENANT_ID)
    return DEMO_TENANT_ID


def forget_the_job():
    owner_sql("delete from jobs where kind = 'roles-check'")


# ── the roles ─────────────────────────────────────────────────────────────────────────────────


def test_the_roles_exist_are_members_of_the_application_role_and_have_no_extra_power(logins):
    rows = owner_sql(
        "select rolname, rolsuper, rolbypassrls, rolcreaterole, "
        "pg_has_role(rolname, 'alyr_app', 'member') as member_of_app, "
        "pg_has_role('alyr_app', rolname, 'member') as app_member_of_it "
        "from pg_roles where rolname in ('alyr_admin', 'alyr_worker') order by rolname"
    )
    assert [r["rolname"] for r in rows] == ["alyr_admin", "alyr_worker"]
    for r in rows:
        assert r["member_of_app"] is True       # what the application can do, it can do
        assert r["app_member_of_it"] is False   # and the application cannot become it
        assert not (r["rolsuper"] or r["rolbypassrls"] or r["rolcreaterole"])
    app = owner_sql("select rolsuper, rolbypassrls from pg_roles where rolname = 'alyr_app'")[0]
    assert not (app["rolsuper"] or app["rolbypassrls"])


def test_a_table_given_only_to_the_application_role_is_the_new_roles_too(logins):
    owner_sql("create table roles_probe (n int)")
    try:
        owner_sql("grant select on roles_probe to alyr_app")
        for dsn in (ADMIN_DSN, WORKER_DSN, APP_DSN):
            assert as_login(dsn, ("select count(*) as n from roles_probe",))[0]["n"] == 0
    finally:
        owner_sql("drop table roles_probe")


def test_applying_the_migration_changes_nothing_until_it_is_enforced(logins):
    """The attack of the audit, as the application role: a setting is all it takes."""
    a_job()
    try:
        # Not enforced: the guards read the setting only, as before.
        as_login(APP_DSN, DECLARE_OFFICE, ("select assert_platform_admin()",))
        staff = as_login(APP_DSN, DECLARE_OFFICE, ("select count(*) as n from admin_staff()",))
        assert staff[0]["n"] >= 1
        seen = as_login(APP_DSN, DECLARE_WORKER,
                        ("select count(*) as n from jobs where kind = 'roles-check'",))
        assert seen[0]["n"] == 1
    finally:
        forget_the_job()


# ── enforced ──────────────────────────────────────────────────────────────────────────────────


def test_enforced_the_application_role_cannot_give_itself_the_back_office(logins):
    a_job()
    try:
        enforce()
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match="back office only"):
            as_login(APP_DSN, DECLARE_OFFICE, ("select assert_platform_admin()",))
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match="back office only"):
            as_login(APP_DSN, DECLARE_OFFICE,
                     ("select admin_add_staff('attacker@evil.example', 'x', 'x')",))
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match="back office only"):
            as_login(APP_DSN, DECLARE_OFFICE, ("select count(*) from admin_staff()",))
        # The tables behind the policy show nothing, and take nothing.
        shown = as_login(APP_DSN, DECLARE_OFFICE, ("select count(*) as n from clients",))
        assert shown[0]["n"] == 0
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            as_login(APP_DSN, DECLARE_OFFICE, (
                "insert into platform_audit (staff_email, action, subject_type) "
                "values ('x@x', 'forged', 'nothing')",))
        # Every business's jobs: the setting is not enough.
        seen = as_login(APP_DSN, DECLARE_WORKER,
                        ("select count(*) as n from jobs where kind = 'roles-check'",))
        assert seen[0]["n"] == 0
        # And it cannot become the role that can.
        for role in ("alyr_admin", "alyr_worker"):
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                as_login(APP_DSN, (f"set role {role}",))
        assert owner_sql("select count(*) as n from platform_admins where email = "
                         "'attacker@evil.example'")[0]["n"] == 0
    finally:
        enforce(False)
        forget_the_job()


def test_enforced_the_admin_login_has_the_back_office_and_not_the_workers_jobs(logins):
    a_job()
    try:
        enforce()
        as_login(ADMIN_DSN, DECLARE_OFFICE, ("select assert_platform_admin()",))
        assert as_login(ADMIN_DSN, DECLARE_OFFICE,
                        ("select count(*) as n from admin_staff()",))[0]["n"] >= 1
        # Without the declaration it is an ordinary role: the setting is still needed.
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            as_login(ADMIN_DSN, ("select assert_platform_admin()",))
        assert as_login(ADMIN_DSN, DECLARE_WORKER,
                        ("select count(*) as n from jobs where kind = 'roles-check'",))[0]["n"] == 0
    finally:
        enforce(False)
        forget_the_job()


def test_enforced_the_worker_login_has_every_jobs_queue_and_the_sweeps_back_office_work(logins):
    shop = a_job()
    try:
        enforce()
        seen = as_login(WORKER_DSN, DECLARE_WORKER,
                        ("select count(*) as n from jobs where kind = 'roles-check'",))
        assert seen[0]["n"] == 1
        as_login(WORKER_DSN, DECLARE_OFFICE, ("select assert_platform_admin()",))
        # Its own transaction still sees only its own business unless it says otherwise.
        assert as_login(WORKER_DSN, ("select set_config('app.tenant_id', $1, true)", str(shop)),
                        ("select count(*) as n from jobs where kind = 'roles-check'",))[0]["n"] == 1
        assert as_login(WORKER_DSN, ("select count(*) as n from jobs "
                                     "where kind = 'roles-check'",))[0]["n"] == 0
    finally:
        enforce(False)
        forget_the_job()


def test_enforced_the_database_owner_is_not_locked_out(logins):
    enforce()
    try:
        as_login(OWNER_DSN, DECLARE_OFFICE, ("select assert_platform_admin()",))
        assert as_login(OWNER_DSN, DECLARE_OFFICE,
                        ("select count(*) as n from admin_staff()",))[0]["n"] >= 1
    finally:
        enforce(False)


def test_enforced_back_to_not_enforced_puts_the_application_role_back_as_it_was(logins):
    enforce()
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        as_login(APP_DSN, DECLARE_OFFICE, ("select assert_platform_admin()",))
    enforce(False)
    as_login(APP_DSN, DECLARE_OFFICE, ("select assert_platform_admin()",))


def test_the_application_role_cannot_switch_the_guard_off_itself(logins):
    enforce()
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            as_login(APP_DSN, ("update role_guard set enforced = false",))
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            as_login(ADMIN_DSN, ("update role_guard set enforced = false",))
        assert owner_sql("select enforced from role_guard")[0]["enforced"] is True
    finally:
        enforce(False)


def test_a_setting_written_in_the_middle_of_the_session_is_not_a_way_round(logins):
    enforce()
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            as_login(APP_DSN, ("select set_config('app.platform_admin', 'on', false)",),
                     ("select set_config('role_guard.enforced', 'off', false)",),
                     ("select assert_platform_admin()",))
    finally:
        enforce(False)


# ── the whole product, with the API on the admin login ────────────────────────────────────────


@pytest.fixture
def on_admin_login(client_factory, monkeypatch, logins):
    monkeypatch.setenv("ALYR_ADMIN_DATABASE_URL", ADMIN_DSN)
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    return client_factory


def test_the_back_office_sign_up_and_workspace_work_when_it_is_enforced(on_admin_login):
    client = on_admin_login()
    enforce()
    try:
        # A new business signs up through the public door (pricing, readiness, the client's
        # billing read the back office's tables on the admin login).
        owner_client, _, name = new_business(client)
        office = on_admin_login()
        sign_in(office, ALYR_STAFF_EMAIL)
        detail = client_of(office, name)
        quote = open_quote(detail)
        assert office.post(f"{ADMIN}/quotes/{quote['id']}/publish").status_code == 200
        assert office.get(f"{ADMIN}/today").status_code == 200
        assert office.get(f"{ADMIN}/staff").status_code == 200
        entries = office.get(f"{ADMIN}/audit", params={"client_id": detail["id"]}).json()["entries"]
        assert "quote.publish" in [e["action"] for e in entries]
        # The workspace, on the application login, is as it was.
        assert office.get("/api/auth/me").json()["signed_in"] is True
    finally:
        enforce(False)


def test_the_billing_and_the_audit_log_declare_the_back_office_on_the_admin_login(logins):
    """`access.office` (a client's billing, card checkouts, the price notice) and the audit
    log's writer find the admin login through `db.admin`; with none they use the one login."""
    from alyr.core import access, roles, staff_security
    from alyr.db import Database

    async def go():
        db = Database(APP_DSN)
        db.admin = Database(ADMIN_DSN)
        plain = Database(APP_DSN)
        await db.connect()
        await db.admin.connect()
        await plain.connect()
        try:
            assert roles.privileged(db) is db.admin and roles.privileged(plain) is plain
            async with access.office(db) as conn:
                who = await conn.fetchval("select session_user")
                await conn.fetchval("select count(*) from clients")
            await staff_security.audit_event(db, "roles-probe@alyr.example", "Probe",
                                             "staff.roles_probe", {"n": 1})
            return who
        finally:
            await plain.close()
            await db.admin.close()
            await db.close()

    enforce()
    try:
        assert asyncio.run(go()) == "alyr_admin"
        rows = owner_sql("select action from platform_audit where staff_email = "
                         "'roles-probe@alyr.example'")
        assert [r["action"] for r in rows] == ["staff.roles_probe"]
    finally:
        enforce(False)


def test_enforced_with_the_api_still_on_the_application_login_the_back_office_breaks(
    client_factory, monkeypatch, logins,
):
    """What `enforce` refuses to let happen (see the next test): the reason the API is moved
    to its login first."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    sign_in(client, ALYR_STAFF_EMAIL)
    enforce()
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            client.get(f"{ADMIN}/staff")
    finally:
        enforce(False)


# ── the switch (python -m alyr.db_roles) ──────────────────────────────────────────────────────


@asynccontextmanager
async def signed_in_as(*dsns):
    conns = [await asyncpg.connect(d) for d in dsns]
    try:
        yield
    finally:
        for c in conns:
            await c.close()


def run(command, reason=""):
    return asyncio.run(db_roles.run(OWNER_DSN, command, reason))


def test_status_shows_the_roles_the_switch_and_who_is_connected(logins):
    answer = run("status")
    assert answer["enforced"] is False
    assert answer["roles"]["alyr_admin"]["member_of_alyr_app"] is True
    assert answer["roles"]["alyr_worker"]["can_log_in"] is True
    assert set(answer["connections_open_now"]) == {"alyr_app", "alyr_admin", "alyr_worker"}
    text = json.dumps(answer)
    assert "alyr_admin_local" not in text and "alyr_worker_local" not in text


def test_enforce_refuses_until_both_logins_are_in_use_and_then_works_and_is_logged(logins):
    with pytest.raises(db_roles.Refused, match="nothing is signed in as alyr_admin"):
        run("enforce", "too early")
    assert owner_sql("select enforced from role_guard")[0]["enforced"] is False

    async def go():
        async with signed_in_as(ADMIN_DSN, WORKER_DSN):
            return await db_roles.run(OWNER_DSN, "enforce", "checked in a test")

    answer = asyncio.run(go())
    assert answer["enforced"] is True
    assert run("status")["enforced"] is True
    row = owner_sql("select detail from platform_audit where action = 'database.roles_enforced' "
                    "order by id desc limit 1")[0]
    assert json.loads(row["detail"])["reason"] == "checked in a test"
    assert run("relax", "undoing in a test")["enforced"] is False
    assert owner_sql("select count(*) as n from platform_audit "
                     "where action = 'database.roles_relaxed'")[0]["n"] >= 1


def test_enforce_refuses_a_role_with_no_login(logins):
    owner_sql("alter role alyr_worker nologin")
    try:
        with pytest.raises(db_roles.Refused, match="alyr_worker cannot log in"):
            run("enforce", "no login")
    finally:
        owner_sql("alter role alyr_worker login password 'alyr_worker_local'")


@pytest.mark.parametrize("command, reason, why", [
    ("enforce", "", "a reason is needed"),
    ("relax", "", "a reason is needed"),
    ("enforce", "x" * 81, "80 characters at most"),
    ("drop-everything", "because", "unknown command"),
])
def test_the_switch_refuses_what_is_not_on_its_short_list(logins, command, reason, why):
    with pytest.raises(db_roles.Refused, match=why):
        run(command, reason)
    assert owner_sql("select enforced from role_guard")[0]["enforced"] is False
