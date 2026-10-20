"""Migration 0042 on a database that already has shops, items and orders (ALY-150 part 3): nothing
about an existing item or order changes, the three cost tables exist with forced row-level
security, a cost is checked by the database, one cost is kept for an item (and one for each size),
the history can be added to but never edited or erased by the app, and one shop cannot see
another's costs.

Built like test_discounts_migration.py: a throwaway database brought up to the migration before
this one, filled the way a live database is, then 0042 applied, as a superuser and as an owner
that does not bypass row-level security.
"""

import asyncio
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg
import pytest

from alyr.migrate import MIGRATIONS, ensure_app_role
from conftest import APP_DSN, OWNER_DSN
from test_catalog_migration import dsn_for

THIS_ONE = "0042_cost.sql"
LIMITED_ROLE = "alyr_cost_check"


async def build_and_migrate(limited: bool) -> dict:
    base = urlparse(OWNER_DSN).path.lstrip("/")
    scratch = f"{base}_cost_{'limited' if limited else 'super'}"
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
        made: dict = {}
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
            made["item"] = await migrating.fetchval(
                "insert into items (name, name_ar, price, status) values ('Cake', 'كيك', 5000, "
                "'live') returning id")
            made["size"] = await migrating.fetchval(
                "insert into item_variants (item_id, name, name_ar) values ($1, 'Large', 'كبير') "
                "returning id", made["item"])
            contact = await migrating.fetchval(
                "insert into contacts (phone, name) values ('97450000001', 'Old customer') "
                "returning id")
            order = await migrating.fetchval(
                "insert into orders (contact_id, number, total) values ($1, 1001, 5000) "
                "returning id", contact)
            await migrating.execute(
                "insert into order_items (order_id, item_id, name, price, quantity) "
                "values ($1, $2, 'Cake', 5000, 1)", order, made["item"])
            await migrating.execute("reset app.tenant_id")
            async with migrating.transaction():
                await migrating.execute((MIGRATIONS / THIS_ONE).read_text(encoding="utf-8"))
        finally:
            await migrating.close()

        look = await asyncpg.connect(dsn_for(OWNER_DSN, scratch))
        try:
            await look.execute("select set_config('app.tenant_id', $1, false)", str(shops["busy"]))
            untouched = [dict(r) for r in await look.fetch(
                "select i.price, l.price as line_price, l.quantity from items i "
                "join order_items l on l.item_id = i.id")]
            empty = [await look.fetchval(f"select count(*) from {t}")
                     for t in ("item_costs", "item_cost_history", "order_item_costs")]
            forced = await look.fetch(
                "select relname, relforcerowsecurity from pg_class where relname in "
                "('item_costs', 'item_cost_history', 'order_item_costs') order by relname")
        finally:
            await look.close()

        app = await asyncpg.connect(dsn_for(APP_DSN, scratch))
        try:
            async def attempt(tenant, sql, *args):
                try:
                    async with app.transaction():
                        await app.execute("select set_config('app.tenant_id', $1, true)",
                                          str(tenant))
                        await app.execute(sql, *args)
                    return "ok"
                except asyncpg.CheckViolationError:
                    return "check"
                except asyncpg.UniqueViolationError:
                    return "unique"
                except asyncpg.InsufficientPrivilegeError:
                    return "privilege"

            async def count(tenant, table):
                async with app.transaction():
                    await app.execute("select set_config('app.tenant_id', $1, true)",
                                      str(tenant))
                    return await app.fetchval(f"select count(*) from {table}")

            busy, quiet = shops["busy"], shops["quiet"]
            item, size = made["item"], made["size"]
            insert = "insert into item_costs (item_id, variant_id, cost) values ($1, $2, $3)"
            outcome = {
                "item_cost": await attempt(busy, insert, item, None, 3000),
                "item_cost_twice": await attempt(busy, insert, item, None, 3500),
                "size_cost": await attempt(busy, insert, item, size, 4000),
                "size_cost_twice": await attempt(busy, insert, item, size, 4100),
                "negative": await attempt(busy, insert, item, None, -1) ,
                "history_add": await attempt(
                    busy, "insert into item_cost_history (item_id, cost) values ($1, 3000)", item),
                "history_edit": await attempt(
                    busy, "update item_cost_history set cost = 1"),
                "history_erase": await attempt(busy, "delete from item_cost_history"),
                "seen_by_other_shop": await count(quiet, "item_costs"),
                "seen_by_owner_shop": await count(busy, "item_costs"),
                "history_seen_by_other_shop": await count(quiet, "item_cost_history"),
            }
        finally:
            await app.close()
        return {"untouched": untouched, "empty": empty, "forced": forced, "outcome": outcome}
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


@pytest.fixture(scope="module", params=[False, True], ids=["superuser_owner", "row_security_owner"])
def migrated(request):
    return asyncio.run(build_and_migrate(request.param))


def test_nothing_about_an_existing_item_or_order_changes(migrated):
    assert migrated["untouched"] == [{"price": 5000, "line_price": 5000, "quantity": 1}]
    assert migrated["empty"] == [0, 0, 0]


def test_the_three_tables_have_forced_row_level_security(migrated):
    assert {r["relname"]: r["relforcerowsecurity"] for r in migrated["forced"]} == {
        "item_costs": True, "item_cost_history": True, "order_item_costs": True,
    }


def test_one_cost_is_kept_for_the_item_and_one_for_each_size_and_it_is_not_negative(migrated):
    out = migrated["outcome"]
    assert out["item_cost"] == "ok" and out["size_cost"] == "ok"
    assert out["item_cost_twice"] == "unique" and out["size_cost_twice"] == "unique"
    assert out["negative"] == "check"


def test_the_history_can_be_added_to_but_not_edited_or_erased_by_the_app(migrated):
    out = migrated["outcome"]
    assert out["history_add"] == "ok"
    assert out["history_edit"] == "privilege" and out["history_erase"] == "privilege"


def test_one_shop_cannot_see_anothers_costs(migrated):
    out = migrated["outcome"]
    assert out["seen_by_owner_shop"] == 2
    assert out["seen_by_other_shop"] == 0 and out["history_seen_by_other_shop"] == 0
