"""The back office's switch for demo data (specs/063, D-150, migration 0110): only ALYR staff can
mark a business as one that may be filled with made-up data, it is off for every business, the
change is in the audit log, and the app role cannot write the flag any other way."""

import asyncio
from uuid import UUID

import asyncpg
import pytest

from alyr.seed import OWNER_EMAIL
from conftest import APP_DSN
from test_consent import owner_sql
from test_onboarding import new_business
from test_pricing import ADMIN, client_of
from test_sign_in import sign_in


@pytest.fixture
def office(client_factory):
    return client_factory()


def listed(office, business_id):
    rows = office.get(f"{ADMIN}/businesses").json()["businesses"]
    return next(b for b in rows if b["id"] == business_id)


def audit_of(business_id):
    return owner_sql(
        "select action, subject_type, staff_email, business_id from platform_audit "
        "where business_id = $1 order by id",
        UUID(business_id),
    )


def test_a_new_business_may_not_be_loaded_with_demo_data(client, office):
    business_id, _, name = new_business(client)
    row = listed(office, business_id)
    assert row["demo_data_allowed"] is False and row["demo_data_loaded"] is False
    # The same two fields on the business inside its client, which the back-office screen reads.
    detail = client_of(office, name)
    assert detail["businesses"][0]["demo_data_allowed"] is False
    assert detail["businesses"][0]["demo_data_loaded"] is False


def test_staff_switch_demo_data_on_and_off_and_it_is_in_the_audit_log(client, office):
    business_id, _, _ = new_business(client)
    url = f"{ADMIN}/businesses/{business_id}/demo-data"

    on = office.post(url, json={"allowed": True})
    assert on.status_code == 200, on.text
    assert on.json() == {"demo_data_allowed": True}
    assert listed(office, business_id)["demo_data_allowed"] is True
    stamped = owner_sql(
        "select demo_data_allowed, demo_data_allowed_at is not null as at, demo_data_allowed_by "
        "from tenants where id = $1",
        UUID(business_id),
    )[0]
    assert stamped["demo_data_allowed"] and stamped["at"] and stamped["demo_data_allowed_by"]

    off = office.post(url, json={"allowed": False})
    assert off.status_code == 200 and off.json() == {"demo_data_allowed": False}
    assert listed(office, business_id)["demo_data_allowed"] is False
    cleared = owner_sql(
        "select demo_data_allowed_at, demo_data_allowed_by from tenants where id = $1",
        UUID(business_id),
    )[0]
    assert cleared["demo_data_allowed_at"] is None and cleared["demo_data_allowed_by"] == ""

    # Off again when it is already off is fine: switching off is always allowed.
    assert office.post(url, json={"allowed": False}).status_code == 200

    entries = [e for e in audit_of(business_id) if e["action"].startswith("business.demo_data")]
    assert [e["action"] for e in entries] == [
        "business.demo_data_on", "business.demo_data_off", "business.demo_data_off",
    ]
    assert all(e["subject_type"] == "business" and str(e["business_id"]) == business_id
               for e in entries)


def test_a_business_that_does_not_exist_is_a_404_and_leaves_no_audit_entry(office):
    ghost = "00000000-0000-4000-8000-0000000000aa"
    before = owner_sql("select count(*) as n from platform_audit")[0]["n"]
    answer = office.post(f"{ADMIN}/businesses/{ghost}/demo-data", json={"allowed": True})
    assert answer.status_code == 404
    assert owner_sql("select count(*) as n from platform_audit")[0]["n"] == before


def test_the_body_must_say_allowed_as_true_or_false(client, office):
    business_id, _, _ = new_business(client)
    url = f"{ADMIN}/businesses/{business_id}/demo-data"
    assert office.post(url, json={}).status_code == 422
    assert office.post(url, json={"allowed": "maybe"}).status_code == 422


def test_an_owner_who_is_not_alyr_staff_cannot_switch_it(client, client_factory, monkeypatch):
    # The owner of the demo shop, signed in, with the open demo off: not on the staff list.
    business_id, _, _ = new_business(client)
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    mine = client_factory()
    sign_in(mine, OWNER_EMAIL)
    answer = mine.post(f"{ADMIN}/businesses/{business_id}/demo-data", json={"allowed": True})
    assert answer.status_code == 403
    assert mine.get(f"{ADMIN}/businesses").status_code == 403
    assert owner_sql("select demo_data_allowed from tenants where id = $1", UUID(business_id))[0][
        "demo_data_allowed"
    ] is False
    assert not [e for e in audit_of(business_id) if e["action"].startswith("business.demo_data")]


def test_the_app_role_cannot_write_the_flag_itself(client):
    business_id, _, _ = new_business(client)

    async def write():
        conn = await asyncpg.connect(APP_DSN)
        try:
            await conn.execute(
                "update tenants set demo_data_allowed = true where id = $1", UUID(business_id)
            )
        finally:
            await conn.close()

    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        asyncio.run(write())
    assert owner_sql("select demo_data_allowed from tenants where id = $1", UUID(business_id))[0][
        "demo_data_allowed"
    ] is False


def test_the_function_refuses_anyone_the_api_has_not_declared_staff(client):
    business_id, _, _ = new_business(client)

    async def call():
        conn = await asyncpg.connect(APP_DSN)
        try:
            await conn.fetchval(
                "select admin_set_demo_data_allowed($1, true, 'x')", UUID(business_id)
            )
        finally:
            await conn.close()

    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        asyncio.run(call())
    assert owner_sql("select demo_data_allowed from tenants where id = $1", UUID(business_id))[0][
        "demo_data_allowed"
    ] is False


def test_the_listing_says_when_demo_data_is_loaded(client, office):
    business_id, _, name = new_business(client)
    run = owner_sql(
        "insert into demo_seed_runs (tenant_id, story_end, seed, run_by) "
        "values ($1, now(), 'test', 'tests') returning id",
        UUID(business_id),
    )[0]["id"]
    assert listed(office, business_id)["demo_data_loaded"] is True
    assert client_of(office, name)["businesses"][0]["demo_data_loaded"] is True
    # Taken out again: no longer loaded. The switch itself is a separate fact.
    owner_sql(
        "update demo_seed_runs set status = 'removed', removed_at = now() where id = $1", run
    )
    row = listed(office, business_id)
    assert row["demo_data_loaded"] is False and row["demo_data_allowed"] is False
