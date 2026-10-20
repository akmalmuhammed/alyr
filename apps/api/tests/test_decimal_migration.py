"""Migration 0039 on a database that already has shops, items, orders, holds and a stock log
(ALY-149): every quantity keeps the value it had, the stock log still adds up to every number on
the shelf, whole stays whole, row-level security is as it was, and from then on a measure may hold
a fraction and a counted unit may not.

Built like the other migration tests (test_item_codes_migration.py): a throwaway database brought
up to the migration before it, filled the way a live one is, then 0039 applied, twice over: as a
superuser, as the local database is, and as an owner that does not bypass row-level security.
"""

import asyncio
from decimal import Decimal
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg
import pytest

from alyr.migrate import MIGRATIONS, ensure_app_role
from conftest import APP_DSN, OWNER_DSN
from test_catalog_migration import dsn_for

THIS_ONE = "0039_decimal_quantities.sql"
LIMITED_ROLE = "alyr_decimals_check"

# Every column whose type changes, and how a row of data is read back for the comparison.
COLUMNS = (
    ("items", "pack_size"), ("items", "min_order"), ("items", "low_stock_at"),
    ("item_variants", "on_hand"), ("item_variants", "daily_limit"),
    ("variant_day_stock", "delta"), ("stock_movements", "delta"),
    ("stock_movements", "balance_after"), ("stock_holds", "quantity"),
    ("order_items", "quantity"), ("shop_settings", "low_stock_at"),
)


async def build_and_migrate(limited: bool) -> dict:
    base = urlparse(OWNER_DSN).path.lstrip("/")
    scratch = f"{base}_dec_{'limited' if limited else 'super'}"
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
        owner = dsn_for(OWNER_DSN, scratch, LIMITED_ROLE if limited else None,
                        "check" if limited else None)
        migrating = await asyncpg.connect(owner)
        shops = {"a": uuid4(), "b": uuid4()}
        ids: dict[str, object] = {}
        try:
            for path in [f for f in sorted(MIGRATIONS.glob("*.sql")) if f.name < THIS_ONE]:
                async with migrating.transaction():
                    await migrating.execute(path.read_text(encoding="utf-8"))

            async def as_shop(key):
                await migrating.execute("select set_config('app.tenant_id', $1, false)",
                                        str(shops[key]))

            for key, tenant in shops.items():
                await migrating.execute(
                    "insert into tenants (id, name, slug) values ($1, $2, $3)",
                    tenant, key, f"shop-{key}",
                )
            # Shop A: a kilo item sold in lots of 5 with stock, sold and held; a made-to-order cake
            # with a daily limit; a settings row; one order on the books.
            await as_shop("a")
            await migrating.execute(
                "insert into shop_settings (low_stock_at) values (9)"
            )
            rice = await migrating.fetchval(
                "insert into items (name, name_ar, price, status, unit, pack_size, min_order, "
                "stock_rule, low_stock_at) values ('Rice', 'أرز', 3800, 'live', 'kg', 5, 5, "
                "'count', 7) returning id"
            )
            cake = await migrating.fetchval(
                "insert into items (name, name_ar, price, status, unit, stock_rule) "
                "values ('Cake', 'كيكة', 9000, 'live', 'piece', 'daily_limit') returning id"
            )
            rice_v = await migrating.fetchval(
                "select id from item_variants where item_id = $1", rice)
            cake_v = await migrating.fetchval(
                "select id from item_variants where item_id = $1", cake)
            await migrating.execute(
                "update item_variants set daily_limit = 12 where id = $1", cake_v)
            contact = await migrating.fetchval(
                "insert into contacts (name, phone) values ('Huda', '97455500001') returning id")
            placed = await migrating.fetchval(
                "insert into orders (contact_id, number, total) values ($1, 1001, 19000) "
                "returning id", contact)
            line = await migrating.fetchval(
                "insert into order_items (order_id, item_id, name, price, quantity) "
                "values ($1, $2, 'Rice', 3800, 5) returning id", placed, rice)
            await migrating.execute(
                "update item_variants set on_hand = 40 where id = $1", rice_v)
            await migrating.executemany(
                "insert into stock_movements (variant_id, kind, delta, balance_after, actor_name) "
                "values ($1, $2, $3, $4, 'Test')",
                [(rice_v, "opening", 45, 45), (rice_v, "sold", -5, 40)],
            )
            await migrating.execute(
                "insert into stock_holds (order_id, order_item_id, variant_id, quantity, status) "
                "values ($1, $2, $3, 5, 'committed')", placed, line, rice_v)
            await migrating.execute(
                "insert into variant_day_stock (variant_id, day, delta) "
                "values ($1, '2026-10-20', -3)", cake_v)
            await migrating.execute(
                "insert into stock_movements (variant_id, kind, delta, balance_after, day, "
                "actor_name) values ($1, 'sold', -3, 9, '2026-10-20', 'Test')", cake_v)
            ids |= {"rice": rice, "rice_v": rice_v, "cake": cake, "cake_v": cake_v}
            # Shop B: an item, so there is another shop for isolation.
            await as_shop("b")
            ids["other"] = await migrating.fetchval(
                "insert into items (name, name_ar, price, status) values ('Other', 'آخر', 100, "
                "'live') returning id")
            await migrating.execute("reset app.tenant_id")
            before = await read_all(migrating, shops.values())
            async with migrating.transaction():
                await migrating.execute((MIGRATIONS / THIS_ONE).read_text(encoding="utf-8"))
        finally:
            await migrating.close()

        look = await asyncpg.connect(owner)
        try:
            after = await read_all(look, shops.values())
            types = {
                (t, c): (await look.fetchrow(
                    "select data_type, numeric_precision, numeric_scale from "
                    "information_schema.columns where table_name = $1 and column_name = $2",
                    t, c))
                for t, c in COLUMNS
            }
            forced = await look.fetch(
                "select relname, relforcerowsecurity from pg_class where relname = any($1)",
                ["items", "item_variants", "order_items", "stock_movements", "stock_holds",
                 "variant_day_stock", "shop_settings", "business_templates"],
            )
            await look.execute("select set_config('app.tenant_id', $1, false)", str(shops["a"]))
            unit = await look.fetchval("select unit from order_items")
            shown = await look.fetchval("select unit_shown from order_items")
            features = {}
            for key, tenant in shops.items():
                await look.execute("select set_config('app.tenant_id', $1, false)", str(tenant))
                features[key] = await look.fetch(
                    "select enabled, set_by from shop_features "
                    "where key = 'decimal_quantity' and tenant_id = $1", tenant)
        finally:
            await look.close()

        app = await asyncpg.connect(dsn_for(APP_DSN, scratch))
        checks: dict[str, object] = {}
        try:
            async def attempt(name, sql, *args, shop="a"):
                try:
                    async with app.transaction():
                        await app.execute("select set_config('app.tenant_id', $1, true)",
                                          str(shops[shop]))
                        await app.execute(sql, *args)
                    checks[name] = "ok"
                except asyncpg.PostgresError as error:
                    checks[name] = type(error).__name__

            await attempt("kg_half", "update item_variants set on_hand = 40.5 where id = $1",
                          ids["rice_v"])
            await attempt("piece_half", "update item_variants set on_hand = 1.5 where id = $1",
                          ids["cake_v"])
            await attempt("piece_limit_half",
                          "update item_variants set daily_limit = 2.5 where id = $1", ids["cake_v"])
            await attempt("piece_day_half",
                          "update variant_day_stock set delta = -2.5 where variant_id = $1",
                          ids["cake_v"])
            await attempt("negative_stock", "update item_variants set on_hand = -0.5 "
                          "where id = $1", ids["rice_v"])
            await attempt("kg_step", "update items set pack_size = 0.25, min_order = 0.25 "
                          "where id = $1", ids["rice"])
            await attempt("piece_step", "update items set min_order = 0.5 where id = $1",
                          ids["cake"])
            await attempt("zero_min", "update items set min_order = 0 where id = $1", ids["rice"])
            await attempt("new_unit", "update items set unit = 'ml' where id = $1", ids["cake"])
            await attempt("bad_unit", "update items set unit = 'yard' where id = $1", ids["cake"])
            await attempt("line_half_piece", "update order_items set quantity = 0.5")
            await attempt("line_half_kg", "update order_items set unit = 'kg', quantity = 0.5")
            await attempt("line_zero", "update order_items set quantity = 0")
            await attempt("hold_zero", "update stock_holds set quantity = 0")
            async with app.transaction():
                await app.execute("select set_config('app.tenant_id', $1, true)",
                                  str(shops["b"]))
                checks["b_sees"] = await app.fetchval("select count(*) from items")
                checks["b_sees_a"] = await app.fetchval(
                    "select count(*) from items where id = $1", ids["rice"])
        finally:
            await app.close()
        return {"before": before, "after": after, "types": types, "forced": forced,
                "unit": unit, "shown": shown, "features": features, "checks": checks}
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


async def read_all(conn, tenants) -> dict:
    """Every changing column, as text, row by row, keyed so before and after line up. Shop by
    shop, so it works for an owner that row-level security holds to one shop at a time."""
    out: dict = {(t, c): {} for t, c in COLUMNS}
    for tenant in tenants:
        await conn.execute("select set_config('app.tenant_id', $1, false)", str(tenant))
        for table, column in COLUMNS:
            key = {"variant_day_stock": "variant_id", "shop_settings": "tenant_id"}.get(table, "id")
            rows = await conn.fetch(
                f"select {key}::text as k, {column}::numeric::text as v from {table} "
                f"where tenant_id = $1 order by 1, 2", tenant,
            )
            out[(table, column)].update({f"{r['k']}#{n}": r["v"] for n, r in enumerate(rows)})
    await conn.execute("reset app.tenant_id")
    return out


@pytest.fixture(scope="module", params=[False, True], ids=["superuser_owner", "row_security_owner"])
def migrated(request):
    return asyncio.run(build_and_migrate(request.param))


def test_every_quantity_keeps_the_value_it_had(migrated):
    for column, before in migrated["before"].items():
        after = migrated["after"][column]
        assert before.keys() == after.keys(), column
        for key, value in before.items():
            if value is None:
                assert after[key] is None, (column, key, after[key])
            else:
                assert Decimal(after[key]) == Decimal(value), (column, key, value, after[key])
    # And the data was there to compare: the busy shop's numbers.
    stocks = migrated["after"][("item_variants", "on_hand")].values()
    assert Decimal("40") in {Decimal(v) for v in stocks}


def test_the_columns_are_exact_decimals_with_three_places(migrated):
    for (table, column), shape in migrated["types"].items():
        assert shape["data_type"] == "numeric", (table, column)
        assert (shape["numeric_precision"], shape["numeric_scale"]) == (14, 3), (table, column)


def test_the_stock_log_still_adds_up_to_every_number_on_the_shelf(migrated):
    after = migrated["after"]
    assert Decimal(next(iter(after[("item_variants", "on_hand")].values()))) is not None
    on_hand = sorted(Decimal(v) for v in after[("item_variants", "on_hand")].values())
    assert 40 in on_hand
    deltas = [Decimal(v) for v in after[("stock_movements", "delta")].values()]
    # 45 opening, -5 sold, -3 sold on the cake's day: the rice is 45 - 5 = 40.
    assert sorted(deltas) == [-5, -3, 45]


def test_every_shop_that_exists_keeps_its_form_the_feature_is_off_for_it(migrated):
    for rows in migrated["features"].values():
        assert [(r["enabled"], r["set_by"]) for r in rows] == [(False, "template")]


def test_whole_numbers_stay_whole_and_a_line_keeps_the_default_unit(migrated):
    assert migrated["unit"] == "piece" and migrated["shown"] is False
    assert all(Decimal(v) == Decimal(v).to_integral_value()
               for column in migrated["after"].values() for v in column.values() if v is not None)


def test_row_level_security_is_still_forced_everywhere(migrated):
    assert migrated["forced"] and all(r["relforcerowsecurity"] for r in migrated["forced"])
    assert migrated["checks"]["b_sees"] == 1 and migrated["checks"]["b_sees_a"] == 0


def test_after_it_a_measure_takes_a_fraction_and_a_counted_unit_does_not(migrated):
    c = migrated["checks"]
    assert c["kg_half"] == "ok" and c["kg_step"] == "ok" and c["new_unit"] == "ok"
    assert c["line_half_kg"] == "ok"
    for refused in ("piece_half", "piece_limit_half", "piece_day_half", "piece_step",
                    "line_half_piece"):
        assert c[refused] == "RaiseError" or c[refused].endswith("ConstraintError") or \
            c[refused] in ("CheckViolationError", "RaiseException"), (refused, c[refused])
        assert c[refused] != "ok", refused


def test_stock_is_still_never_below_zero_and_a_quantity_still_above_zero(migrated):
    c = migrated["checks"]
    for refused in ("negative_stock", "zero_min", "line_zero", "hold_zero", "bad_unit"):
        assert c[refused] != "ok", refused
