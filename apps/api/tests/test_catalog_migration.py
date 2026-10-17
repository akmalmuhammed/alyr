"""Migration 0022 on a database that already has shops and orders: nothing is lost.

Builds a throwaway database up to migration 0021, fills it the way a live shop would be,
applies 0022, and checks every product, order and order line is still there. It runs twice:
once as a superuser, as the local database does, and once as an owner who does not bypass
row-level security, as a hosted database's administrator may not. Forced row-level security
hides every row from such an owner unless the migration lifts it for its own statements.
"""

import asyncio
import json
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg
import pytest

from alyr.migrate import MIGRATIONS, ensure_app_role
from conftest import APP_DSN, OWNER_DSN

THIS_ONE = "0022_catalog_items.sql"
LIMITED_ROLE = "alyr_migration_check"


def dsn_for(base: str, database: str, user: str | None = None, password: str | None = None) -> str:
    parsed = urlparse(base)
    host = parsed.netloc.rpartition("@")[2]
    credentials = f"{user or parsed.username}:{password or parsed.password}"
    return f"postgresql://{credentials}@{host}/{database}"


async def build_and_migrate(limited: bool) -> dict:
    base = urlparse(OWNER_DSN).path.lstrip("/")
    scratch = f"{base}_mig_{'limited' if limited else 'super'}"
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
        shop, contact = uuid4(), uuid4()
        try:
            files = sorted(MIGRATIONS.glob("*.sql"))
            before = [f for f in files if f.name < THIS_ONE]
            for path in before:
                async with migrating.transaction():
                    await migrating.execute(path.read_text(encoding="utf-8"))
            # A shop the way the live demo has it: products, an order, its lines, its link.
            await migrating.execute(
                "insert into tenants (id, name, slug) values ($1, 'Old', 'old')", shop
            )
            await migrating.execute("select set_config('app.tenant_id', $1, false)", str(shop))
            await migrating.execute(
                "insert into contacts (id, phone, name) values ($1, '97455000001', 'Ahmed')",
                contact,
            )
            ids = [uuid4() for _ in range(3)]
            for n, product in enumerate(ids):
                await migrating.execute(
                    "insert into products (id, name, name_ar, category, price, available, sort) "
                    "values ($1, $2, $3, $4, $5, $6, $7)",
                    product, f"Product {n}", f"منتج {n}", "Cables" if n < 2 else "Lights",
                    1000 * (n + 1), n != 1, n,
                )
            order = uuid4()
            await migrating.execute(
                "insert into orders (id, contact_id, number, total) values ($1, $2, 1001, 7000)",
                order, contact,
            )
            await migrating.execute(
                "insert into order_items (order_id, product_id, name, price, quantity) "
                "values ($1, $2, 'Product 0', 1000, 4), ($1, $3, 'Product 2', 3000, 1)",
                order, ids[0], ids[2],
            )
            await migrating.execute(
                "insert into payment_requests (contact_id, amount, order_id) values ($1, 7000, $2)",
                contact, order,
            )
            # The migration runs with no shop selected, as it does for real.
            await migrating.execute("reset app.tenant_id")
            async with migrating.transaction():
                await migrating.execute((MIGRATIONS / THIS_ONE).read_text(encoding="utf-8"))
        finally:
            await migrating.close()

        # Look at the result as a superuser, so row-level security hides nothing.
        look = await asyncpg.connect(dsn_for(OWNER_DSN, scratch))
        try:
            result = {
                "products_table": await look.fetchval("select to_regclass('products')"),
                "ids": ids,
                "order": order,
                "items": await look.fetch(
                    "select id, name, name_ar, category, price, available, status, stock_rule, "
                    "unit, min_order from items order by sort"
                ),
                "variants": await look.fetch(
                    "select item_id, name, is_default, on_hand, active from item_variants"
                ),
                "lines": await look.fetch(
                    "select item_id, name, name_ar, price, quantity, variant_id, variant_name, "
                    "options::text as options from order_items order by name"
                ),
                "history": await look.fetch("select item_id, price from item_price_history"),
                "orders": await look.fetch("select number, total, status from orders"),
                "links": await look.fetch("select amount, status, order_id from payment_requests"),
                "forced": await look.fetch(
                    "select relname, relforcerowsecurity as forced from pg_class "
                    "where relname = any($1) and relkind = 'r'",
                    ["items", "order_items", "item_variants", "stock_movements"],
                ),
            }
        finally:
            await look.close()
        # The application's own role still sees the shop through row-level security.
        app = await asyncpg.connect(dsn_for(APP_DSN, scratch))
        try:
            async with app.transaction():
                await app.execute("select set_config('app.tenant_id', $1, true)", str(shop))
                result["app_sees"] = (
                    await app.fetchval("select count(*) from items"),
                    await app.fetchval("select count(*) from item_variants"),
                    await app.fetchval("select count(*) from order_items"),
                )
        finally:
            await app.close()
        return result
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


@pytest.mark.parametrize("limited", [False, True], ids=["superuser_owner", "row_security_owner"])
def test_a_database_with_orders_migrates_without_losing_anything(limited):
    found = asyncio.run(build_and_migrate(limited))

    assert found["products_table"] is None  # renamed, not copied
    items = found["items"]
    assert [i["id"] for i in items] == found["ids"]  # every product kept its ID
    assert [(i["name"], i["name_ar"], i["category"], i["price"]) for i in items] == [
        ("Product 0", "منتج 0", "Cables", 1000),
        ("Product 1", "منتج 1", "Cables", 2000),
        ("Product 2", "منتج 2", "Lights", 3000),
    ]
    # Each behaves as before: live, and its old on/off flag is its switch.
    assert [(i["status"], i["stock_rule"], i["available"]) for i in items] == [
        ("live", "switch", True), ("live", "switch", False), ("live", "switch", True),
    ]
    assert {(i["unit"], i["min_order"]) for i in items} == {("piece", 1)}

    # Each has the one default variant that its stock will live on.
    variants = found["variants"]
    assert sorted(v["item_id"] for v in variants) == sorted(found["ids"])
    assert {(v["name"], v["is_default"], v["on_hand"], v["active"]) for v in variants} == {
        ("", True, 0, True),
    }
    assert sorted(h["item_id"] for h in found["history"]) == sorted(found["ids"])

    # The order, its lines and its payment link are exactly as they were; the lines gained a
    # copy of the Arabic name and an empty copy of the variant and options.
    assert [(o["number"], o["total"], o["status"]) for o in found["orders"]] == [
        (1001, 7000, "new"),
    ]
    assert [(link["amount"], link["status"]) for link in found["links"]] == [(7000, "pending")]
    lines = found["lines"]
    assert [(ln["item_id"], ln["name"], ln["name_ar"], ln["price"], ln["quantity"])
            for ln in lines] == [
        (found["ids"][0], "Product 0", "منتج 0", 1000, 4),
        (found["ids"][2], "Product 2", "منتج 2", 3000, 1),
    ]
    assert all(ln["variant_id"] is None and ln["variant_name"] == "" for ln in lines)
    assert all(json.loads(ln["options"]) == [] for ln in lines)
    assert sum(ln["price"] * ln["quantity"] for ln in lines) == 7000

    # Row-level security is back on, and the application sees the shop through it.
    assert all(r["forced"] for r in found["forced"]) and len(found["forced"]) == 4
    assert found["app_sees"] == (3, 3, 2)
