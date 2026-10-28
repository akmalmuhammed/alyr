"""Migration 0041 on a database that already has shops and orders, some of them discounted
(ALY-150 part 2): every old order keeps its total and reads as before (no way of receiving, no
fee), an order's total must equal its goods minus discounts plus the delivery fee, a pickup has no
fee and no address, a zone and the shop's settings are checked by the database itself, and one shop
cannot see another's zones.

Built like test_discounts_migration.py: a throwaway database brought up to the migration before
this one, filled the way a live database is, then 0041 applied, as a superuser and as an owner that
does not bypass row-level security.
"""

import asyncio
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg
import pytest

from alyr.migrate import MIGRATIONS, ensure_app_role
from conftest import APP_DSN, OWNER_DSN
from test_catalog_migration import dsn_for

THIS_ONE = "0041_delivery.sql"
LIMITED_ROLE = "alyr_delivery_check"


async def build_and_migrate(limited: bool) -> dict:
    base = urlparse(OWNER_DSN).path.lstrip("/")
    scratch = f"{base}_deliv_{'limited' if limited else 'super'}"
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
            await migrating.execute(
                "insert into orders (contact_id, number, total) values ($1, 1001, 4500)", contact
            )
            await migrating.execute(
                "insert into orders (contact_id, number, total, subtotal, discount_total) "
                "values ($1, 1002, 9000, 10000, 1000)", contact
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
                "select number, total, subtotal, discount_total, fulfilment, delivery_fee, "
                "delivery_address, delivery_zone_name from orders order by number")}
            forced = await look.fetch(
                "select relname, relforcerowsecurity from pg_class "
                "where relname in ('delivery_settings', 'delivery_zones') order by relname")
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
                except asyncpg.CheckViolationError as error:
                    return error.constraint_name or "check"

            async def count(tenant, table):
                async with app.transaction():
                    await app.execute("select set_config('app.tenant_id', $1, true)",
                                      str(tenant))
                    return await app.fetchval(f"select count(*) from {table}")

            busy, quiet = shops["busy"], shops["quiet"]
            async with app.transaction():
                await app.execute("select set_config('app.tenant_id', $1, true)", str(busy))
                contact_id = await app.fetchval("select id from contacts")
            order = ("insert into orders (contact_id, number, total, subtotal, discount_total, "
                     "fulfilment, delivery_fee, delivery_address) values "
                     "($1, $2, $3, $4, $5, $6, $7, $8)")
            outcome = {
                "delivery_adds_up": await attempt(
                    busy, order, contact_id, 3001, 10_500, 10_000, 1_000, "delivery", 1_500,
                    "Villa 1"),
                "delivery_wrong": await attempt(
                    busy, order, contact_id, 3002, 10_500, 10_000, 1_000, "delivery", 500,
                    "Villa 1"),
                "pickup_clean": await attempt(
                    busy, order, contact_id, 3003, 9_000, 10_000, 1_000, "pickup", 0, ""),
                "pickup_with_fee": await attempt(
                    busy, order, contact_id, 3004, 9_500, 10_000, 1_000, "pickup", 500, ""),
                "pickup_with_address": await attempt(
                    busy, order, contact_id, 3005, 9_000, 10_000, 1_000, "pickup", 0, "Villa 1"),
                "bad_mode": await attempt(
                    busy, order, contact_id, 3006, 9_000, 10_000, 1_000, "teleport", 0, ""),
                "zone": await attempt(
                    busy, "insert into delivery_zones (name, name_ar, fee, days) "
                    "values ('Wakra', 'الوكرة', 1500, '{0,3}')"),
                "bad_day": await attempt(
                    busy, "insert into delivery_zones (name, name_ar, fee, days) "
                    "values ('X', 'س', 1, '{7}')"),
                "negative_fee": await attempt(
                    busy, "insert into delivery_zones (name, name_ar, fee) values ('X', 'س', -1)"),
                "free_over_zero": await attempt(
                    busy, "insert into delivery_zones (name, name_ar, fee, free_over) "
                    "values ('Y', 'ص', 1, 0)"),
                "settings": await attempt(
                    busy, "insert into delivery_settings (pickup_enabled, delivery_enabled) "
                    "values (true, true)"),
                "both_off": await attempt(
                    quiet, "insert into delivery_settings (pickup_enabled, delivery_enabled) "
                    "values (false, false)"),
                "zones_seen_by_other_shop": await count(quiet, "delivery_zones"),
                "zones_seen_by_owner_shop": await count(busy, "delivery_zones"),
                "settings_seen_by_other_shop": await count(quiet, "delivery_settings"),
            }
        finally:
            await app.close()
        return {"orders": orders, "forced": forced, "outcome": outcome}
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


@pytest.fixture(scope="module", params=[False, True], ids=["superuser_owner", "row_security_owner"])
def migrated(request):
    return asyncio.run(build_and_migrate(request.param))


def test_every_old_order_keeps_its_total_and_has_no_way_of_receiving(migrated):
    plain, discounted = migrated["orders"][1001], migrated["orders"][1002]
    assert (plain["total"], plain["subtotal"], plain["discount_total"]) == (4500, None, 0)
    assert (discounted["total"], discounted["subtotal"], discounted["discount_total"]) == (
        9000, 10000, 1000)
    for old in (plain, discounted):
        assert (old["fulfilment"], old["delivery_fee"], old["delivery_address"]) == (None, 0, "")


def test_the_new_tables_have_forced_row_level_security(migrated):
    assert {r["relname"]: r["relforcerowsecurity"] for r in migrated["forced"]} == {
        "delivery_settings": True, "delivery_zones": True,
    }


def test_an_orders_total_is_its_goods_minus_discounts_plus_the_fee(migrated):
    out = migrated["outcome"]
    assert out["delivery_adds_up"] == "ok"
    assert out["delivery_wrong"] == "orders_total_adds_up"


def test_a_pickup_has_no_fee_and_no_address_and_a_mode_is_one_of_two(migrated):
    out = migrated["outcome"]
    assert out["pickup_clean"] == "ok"
    assert out["pickup_with_fee"] != "ok" and out["pickup_with_address"] != "ok"
    assert out["bad_mode"] != "ok"


def test_a_zone_and_the_settings_are_checked_by_the_database(migrated):
    out = migrated["outcome"]
    assert out["zone"] == "ok" and out["settings"] == "ok"
    assert out["bad_day"] != "ok" and out["negative_fee"] != "ok" and out["free_over_zero"] != "ok"
    assert out["both_off"] != "ok"  # one way to receive an order always stays on


def test_one_shop_cannot_see_anothers_zones_or_settings(migrated):
    out = migrated["outcome"]
    assert out["zones_seen_by_other_shop"] == 0 and out["zones_seen_by_owner_shop"] == 1
    assert out["settings_seen_by_other_shop"] == 0
