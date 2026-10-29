import asyncio
from uuid import uuid4

import asyncpg
import pytest

from alyr.db import Database
from conftest import APP_DSN, OWNER_DSN

# users, login_codes and sessions belong to a person, not a tenant (D-022).
GLOBAL_TABLES = {
    "tenants", "channel_numbers", "schema_migrations", "users", "login_codes", "sessions",
    # Counts of requests to open doors, keyed by a hash of the address (ALY-116).
    "rate_hits",
    # The background worker's check-ins; ALYR's own, not a shop's (ALY-63).
    "worker_heartbeats",
    # ALYR's own staff list; belongs to ALYR, not to a shop (D-027).
    "platform_admins",
    # A verified email before its business exists (D-031).
    "signup_tokens",
    # The paying client spans businesses; the price list and the switches are ALYR's.
    # Each has its own forced row-level security (D-032).
    "clients", "price_items", "business_type_settings", "platform_settings", "quotes",
    "quote_lines",
    # The internal tool's own records: the audit log and Today's set-aside items (D-033).
    "platform_audit", "today_snoozes",
    # The kinds of business ALYR's staff make in the back office (ALY-148); every shop may read
    # them, only the back office writes them. Forced row-level security.
    "business_templates",
    # What a client paid ALYR, before their products open (ALY-212, D-051): the owner reads
    # their own client's, only the back office writes. Forced row-level security.
    "client_payments",
    # What owners are asked to accept: every shop may read it, only the back office adds to it
    # (ALY-167). Forced row-level security.
    "terms_versions",
}


def run(coro):
    return asyncio.run(coro)


async def _two_tenants() -> tuple:
    a, b = uuid4(), uuid4()
    conn = await asyncpg.connect(OWNER_DSN)
    try:
        for tenant_id, name in ((a, "Shop A"), (b, "Shop B")):
            await conn.execute("insert into tenants (id, name) values ($1, $2)", tenant_id, name)
    finally:
        await conn.close()
    return a, b


def test_one_tenant_cannot_read_anothers_rows():
    async def scenario():
        a, b = await _two_tenants()
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(a) as conn:
                await conn.execute(
                    "insert into contacts (phone, name) values ('97450000001', 'A customer')"
                )
            async with db.tenant(b) as conn:
                seen_by_b = await conn.fetchval("select count(*) from contacts")
            async with db.tenant(a) as conn:
                seen_by_a = await conn.fetchval("select count(*) from contacts")
            async with db.unscoped() as conn:
                seen_without_tenant = await conn.fetchval("select count(*) from contacts")
            return seen_by_a, seen_by_b, seen_without_tenant
        finally:
            await db.close()

    assert run(scenario()) == (1, 0, 0)


def test_one_tenant_cannot_write_into_another():
    async def scenario():
        a, b = await _two_tenants()
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(b) as conn:
                await conn.execute(
                    "insert into contacts (tenant_id, phone, name) values ($1, '97450000002', 'x')",
                    a,
                )
        finally:
            await db.close()

    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        run(scenario())


def test_one_tenant_cannot_update_or_delete_anothers_rows():
    async def scenario():
        a, b = await _two_tenants()
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(a) as conn:
                await conn.execute(
                    "insert into contacts (phone, name) values ('97450000003', 'Keep me')"
                )
            async with db.tenant(b) as conn:
                updated = await conn.execute("update contacts set name = 'hacked'")
                deleted = await conn.execute("delete from contacts")
            async with db.tenant(a) as conn:
                name = await conn.fetchval("select name from contacts")
            return updated, deleted, name
        finally:
            await db.close()

    assert run(scenario()) == ("UPDATE 0", "DELETE 0", "Keep me")


def test_app_role_cannot_write_global_tables():
    async def scenario():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.unscoped() as conn:
                await conn.execute("insert into tenants (name) values ('Rogue')")
        finally:
            await db.close()

    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        run(scenario())


def test_every_tenant_table_has_forced_row_level_security():
    """Fails when someone adds a table and forgets its policy."""

    async def scenario():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return await conn.fetch(
                """
                select c.relname as name, c.relrowsecurity as enabled,
                       c.relforcerowsecurity as forced,
                       exists (select 1 from pg_attribute a where a.attrelid = c.oid
                               and a.attname = 'tenant_id' and not a.attisdropped) as has_tenant,
                       exists (select 1 from pg_policy p where p.polrelid = c.oid) as has_policy
                from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r'
                """
            )
        finally:
            await conn.close()

    problems = []
    for table in run(scenario()):
        if table["name"] in GLOBAL_TABLES:
            continue
        if not table["has_tenant"]:
            problems.append(f"{table['name']}: no tenant_id and not on the global list")
        elif not (table["enabled"] and table["forced"] and table["has_policy"]):
            problems.append(f"{table['name']}: row-level security is not fully on")
    assert problems == []


def test_every_tenant_table_has_an_index_that_starts_with_the_shop():
    """Row-level security adds "this shop only" to every query. Without an index that starts
    with tenant_id, a shop's screen, its export or its deletion reads every other shop's rows
    to find its own (ALY-275: an order's lines were found that way). A partial index counts:
    it covers the rows the shop works with (the jobs still waiting, say)."""

    async def scenario():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return await conn.fetch(
                """
                select c.relname as name
                from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r'
                  and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                              and a.attname = 'tenant_id' and not a.attisdropped)
                  and not exists (
                      select 1 from pg_index i
                      join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
                      where i.indrelid = c.oid and a.attname = 'tenant_id')
                order by 1
                """
            )
        finally:
            await conn.close()

    assert [t["name"] for t in run(scenario()) if t["name"] not in GLOBAL_TABLES] == []


def test_app_role_cannot_bypass_row_level_security():
    async def scenario():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return await conn.fetchrow(
                "select rolsuper, rolbypassrls from pg_roles where rolname = 'alyr_app'"
            )
        finally:
            await conn.close()

    role = run(scenario())
    assert (role["rolsuper"], role["rolbypassrls"]) == (False, False)
