"""The first person who can sign in to a new production database (ALY-10)."""

import asyncio

import asyncpg
import pytest

from alyr.first_admin import AlreadySetUp, create_first_admin
from alyr.migrate import migrate
from conftest import APP_DSN, EXTERNAL, OWNER_DSN

# Its own database: the shared test database already has the demo's staff in it.
DB = "alyr_first_admin_test"
OWNER = OWNER_DSN.rsplit("/", 1)[0] + f"/{DB}"
APP = APP_DSN.rsplit("/", 1)[0] + f"/{DB}"

pytestmark = pytest.mark.skipif(EXTERNAL, reason="needs a server where it may create a database")


@pytest.fixture
def empty_database():
    async def admin(sql):
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            await conn.execute(sql)
        finally:
            await conn.close()

    asyncio.run(admin(f"drop database if exists {DB}"))
    asyncio.run(admin(f"create database {DB}"))
    asyncio.run(migrate(OWNER, APP))
    yield
    asyncio.run(admin(f"drop database if exists {DB} with (force)"))


def fetch(sql, *args):
    async def go():
        conn = await asyncpg.connect(OWNER)
        try:
            return await conn.fetch(sql, *args)
        finally:
            await conn.close()

    return asyncio.run(go())


def test_the_first_admin_owns_alyr_and_may_use_the_back_office(empty_database):
    tenant_id = asyncio.run(create_first_admin(OWNER, " Founder@Example.COM ", "Founder"))

    business = fetch("select name, slug, client_id from tenants where id = $1::uuid", tenant_id)[0]
    assert business["slug"] == "alyr" and business["client_id"] is not None
    member = fetch(
        "select m.role, u.email from memberships m join users u on u.id = m.user_id "
        "where m.tenant_id = $1::uuid",
        tenant_id,
    )
    assert [(r["role"], r["email"]) for r in member] == [("owner", "founder@example.com")]
    staff = fetch("select email, added_by from platform_admins")
    assert [(r["email"], r["added_by"]) for r in staff] == [("founder@example.com", "first admin")]


def test_running_it_again_changes_nothing(empty_database):
    first = asyncio.run(create_first_admin(OWNER, "founder@example.com", "Founder"))
    again = asyncio.run(create_first_admin(OWNER, "founder@example.com", "Founder M"))

    assert first == again
    assert fetch("select count(*) from tenants")[0][0] == 1
    assert fetch("select count(*) from memberships")[0][0] == 1
    assert fetch("select name from users")[0]["name"] == "Founder M"


def test_once_staff_exist_another_email_is_refused(empty_database):
    asyncio.run(create_first_admin(OWNER, "founder@example.com", "Founder"))

    with pytest.raises(AlreadySetUp):
        asyncio.run(create_first_admin(OWNER, "someone@example.com", "Someone"))
    assert fetch("select count(*) from users where email = 'someone@example.com'")[0][0] == 0


def test_an_email_and_a_name_are_needed(empty_database):
    with pytest.raises(ValueError):
        asyncio.run(create_first_admin(OWNER, "not-an-email", "Founder"))
    with pytest.raises(ValueError):
        asyncio.run(create_first_admin(OWNER, "founder@example.com", "  "))


def test_alyr_own_number_is_attached_to_alyr(empty_database):
    tenant_id = asyncio.run(
        create_first_admin(OWNER, "founder@example.com", "Founder", "1234567890", "999")
    )
    rows = fetch("select number_id, tenant_id::text, channel, waba_id from channel_numbers")
    assert [tuple(r) for r in rows] == [("1234567890", tenant_id, "meta", "999")]


def test_a_number_that_belongs_to_another_business_is_refused(empty_database):
    async def other_shop():
        conn = await asyncpg.connect(OWNER)
        try:
            shop = await conn.fetchval(
                "insert into tenants (name, slug) values ('Shop', 'shop') returning id"
            )
            await conn.execute(
                "insert into channel_numbers (number_id, tenant_id, channel) "
                "values ('1234567890', $1, 'meta')",
                shop,
            )
        finally:
            await conn.close()

    asyncio.run(other_shop())
    with pytest.raises(AlreadySetUp):
        asyncio.run(create_first_admin(OWNER, "founder@example.com", "Founder", "1234567890"))
    # Nothing half-made: the whole setup is one transaction.
    assert fetch("select count(*) from platform_admins")[0][0] == 0
