"""Migration 0040 on a database that already has shops, orders and chats (ALY-150): every old order
keeps its total and reads as before (no subtotal, nothing discounted), the new columns and tables
exist with forced row-level security, the check that keeps an order's total honest holds, a rule
cannot be used past its limit, and a draft in a chat gets an empty `extras`.

Built like the other migration tests (test_item_codes_migration.py): a throwaway database brought
up to the migration before this one, filled the way a live database is, then 0040 applied, as a
superuser (the local database) and as an owner that does not bypass row-level security (a hosted
database's administrator may not).
"""

import asyncio
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg
import pytest

from alyr.migrate import MIGRATIONS, ensure_app_role
from conftest import APP_DSN, OWNER_DSN
from test_catalog_migration import dsn_for

THIS_ONE = "0040_discounts.sql"
LIMITED_ROLE = "alyr_discounts_check"


async def build_and_migrate(limited: bool) -> dict:
    base = urlparse(OWNER_DSN).path.lstrip("/")
    scratch = f"{base}_disc_{'limited' if limited else 'super'}"
    admin = await asyncpg.connect(dsn_for(OWNER_DSN, "postgres"))
    try:
        await ensure_app_role(admin, APP_DSN)
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        if limited:
            await admin.execute(f"drop role if exists {LIMITED_ROLE}")
            await admin.execute(
                f"create role {LIMITED_ROLE} login password 'check' nosuperuser nobypassrls"
            )
            await admin.execute(f'create database "{scratch}" owner {LIMITED_ROLE}')
        else:
            await admin.execute(f'create database "{scratch}"')
        migrating = await asyncpg.connect(
            dsn_for(OWNER_DSN, scratch, LIMITED_ROLE if limited else None,
                    "check" if limited else None)
        )
        shops = {"busy": uuid4(), "quiet": uuid4()}
        old: dict = {}
        try:
            for path in [f for f in sorted(MIGRATIONS.glob("*.sql")) if f.name < THIS_ONE]:
                async with migrating.transaction():
                    await migrating.execute(path.read_text(encoding="utf-8"))
            for key, tenant in shops.items():
                await migrating.execute(
                    "insert into tenants (id, name, slug) values ($1, $2, $3)", tenant, key, key
                )
            await migrating.execute("select set_config('app.tenant_id', $1, false)",
                                    str(shops["busy"]))
            contact = await migrating.fetchval(
                "insert into contacts (phone, name) values ('97450000001', 'Old customer') "
                "returning id"
            )
            for number, total in ((1001, 4500), (1002, 12000)):
                order_id = await migrating.fetchval(
                    "insert into orders (contact_id, number, total) values ($1, $2, $3) "
                    "returning id", contact, number, total,
                )
                await migrating.execute(
                    "insert into order_items (order_id, name, price, quantity) "
                    "values ($1, 'Old item', $2, 1)", order_id, total,
                )
                old[number] = (order_id, total)
            await migrating.execute(
                "insert into chat_carts (contact_id, expires_at) "
                "values ($1, now() + interval '1 hour')",
                contact,
            )
            await migrating.execute("reset app.tenant_id")
            async with migrating.transaction():
                await migrating.execute((MIGRATIONS / THIS_ONE).read_text(encoding="utf-8"))
        finally:
            await migrating.close()

        look = await asyncpg.connect(dsn_for(OWNER_DSN, scratch))
        try:
            await look.execute("select set_config('app.tenant_id', $1, false)", str(shops["busy"]))
            orders = {r["number"]: dict(r) for r in await look.fetch(
                "select number, total, subtotal, discount_total from orders order by number")}
            lines = [dict(r) for r in await look.fetch(
                "select price, discount from order_items order by price")]
            extras = await look.fetchval("select extras::text from chat_carts")
            forced = await look.fetch(
                "select relname, relforcerowsecurity from pg_class "
                "where relname in ('discount_rules', 'order_discounts') order by relname")
        finally:
            await look.close()

        app = await asyncpg.connect(dsn_for(APP_DSN, scratch))
        try:
            outcome: dict = {}

            async def inside(tenant, fn):
                async with app.transaction():
                    await app.execute("select set_config('app.tenant_id', $1, true)", str(tenant))
                    return await fn()

            async def attempt(tenant, sql, *args):
                try:
                    async with app.transaction():
                        await app.execute("select set_config('app.tenant_id', $1, true)",
                                          str(tenant))
                        await app.execute(sql, *args)
                    return "ok"
                except asyncpg.CheckViolationError as error:
                    return error.constraint_name or "check"
                except asyncpg.UniqueViolationError:
                    return "unique"

            busy, quiet = shops["busy"], shops["quiet"]
            contact_id = await inside(busy, lambda: app.fetchval("select id from contacts"))
            outcome["honest"] = await attempt(
                busy, "insert into orders (contact_id, number, total, subtotal, discount_total) "
                "values ($1, 2001, 900, 1000, 100)", contact_id)
            outcome["dishonest"] = await attempt(
                busy, "insert into orders (contact_id, number, total, subtotal, discount_total) "
                "values ($1, 2002, 800, 1000, 100)", contact_id)
            outcome["rule"] = await attempt(
                busy, "insert into discount_rules (kind, code, code_key, value_type, percent) "
                "values ('coupon', 'EID10', 'EID10', 'percent', 10)")
            outcome["same_code"] = await attempt(
                busy, "insert into discount_rules (kind, code, code_key, value_type, percent) "
                "values ('coupon', 'eid-10', 'EID10', 'percent', 5)")
            outcome["other_shop_same_code"] = await attempt(
                quiet, "insert into discount_rules (kind, code, code_key, value_type, percent) "
                "values ('coupon', 'EID10', 'EID10', 'percent', 10)")
            outcome["over_limit"] = await attempt(
                busy, "insert into discount_rules (kind, code, code_key, value_type, percent, "
                "usage_limit, uses) values ('coupon', 'FULL1', 'FULL1', 'percent', 10, 1, 2)")
            outcome["auto_with_code"] = await attempt(
                busy, "insert into discount_rules (kind, code, code_key, value_type, percent) "
                "values ('auto', 'HAS1', 'HAS1', 'percent', 10)")
            outcome["bad_percent"] = await attempt(
                busy, "insert into discount_rules (kind, code, code_key, value_type, percent) "
                "values ('coupon', 'BIG1', 'BIG1', 'percent', 101)")
            outcome["seen_by_other_shop"] = await inside(
                quiet, lambda: app.fetchval("select count(*) from discount_rules"))
            outcome["seen_by_owner_shop"] = await inside(
                busy, lambda: app.fetchval("select count(*) from discount_rules"))
        finally:
            await app.close()
        return {"orders": orders, "lines": lines, "extras": extras, "forced": forced,
                "outcome": outcome}
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


@pytest.fixture(scope="module", params=[False, True], ids=["superuser_owner", "row_security_owner"])
def migrated(request):
    return asyncio.run(build_and_migrate(request.param))


def test_every_old_order_keeps_its_total_and_reads_as_before(migrated):
    assert migrated["orders"][1001] == {"number": 1001, "total": 4500, "subtotal": None,
                                        "discount_total": 0}
    assert migrated["orders"][1002]["total"] == 12000
    assert migrated["orders"][1002]["subtotal"] is None
    assert all(line["discount"] == 0 for line in migrated["lines"])


def test_a_draft_in_a_chat_gets_an_empty_extras(migrated):
    assert migrated["extras"] == "{}"


def test_the_new_tables_have_forced_row_level_security(migrated):
    assert {r["relname"]: r["relforcerowsecurity"] for r in migrated["forced"]} == {
        "discount_rules": True, "order_discounts": True,
    }


def test_an_orders_total_must_equal_its_goods_minus_what_came_off(migrated):
    assert migrated["outcome"]["honest"] == "ok"
    assert migrated["outcome"]["dishonest"] == "orders_total_adds_up"


def test_a_rule_is_checked_by_the_database_itself(migrated):
    out = migrated["outcome"]
    assert out["rule"] == "ok"
    assert out["same_code"] == "unique"  # «eid-10» is the same code as «EID10»
    assert out["other_shop_same_code"] == "ok"  # (another shop may use any code)
    assert out["over_limit"] != "ok"  # uses past the limit is refused
    assert out["auto_with_code"] != "ok"  # an automatic rule has no code
    assert out["bad_percent"] != "ok"


def test_one_shop_cannot_see_anothers_rules(migrated):
    out = migrated["outcome"]
    assert out["seen_by_other_shop"] == 1 and out["seen_by_owner_shop"] == 1
