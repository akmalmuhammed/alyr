"""Migration 0033 on a database that already has shops and items (ALY-136): every item gets the
next free number of its shop, oldest first; examples get none; a shop with no items has no
counter yet; the next item made afterwards continues the count, and the data step is safe to
run again.

Built like the go-live migration's test (test_catalog_go_live.py): a throwaway database brought
up to 0032, filled the way a live database is, then 0033 applied, twice: as a superuser, as the
local database is, and as an owner that does not bypass row-level security, as a hosted
database's administrator may not.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg
import pytest

from alyr.migrate import MIGRATIONS, ensure_app_role
from conftest import APP_DSN, OWNER_DSN
from test_catalog_migration import dsn_for

THIS_ONE = "0033_item_codes.sql"
LIMITED_ROLE = "alyr_codes_check"
BASE = datetime(2026, 9, 1, 10, 0, tzinfo=UTC)


async def build_and_migrate(limited: bool) -> dict:
    base = urlparse(OWNER_DSN).path.lstrip("/")
    scratch = f"{base}_codes_{'limited' if limited else 'super'}"
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
        shops = {key: uuid4() for key in ("busy", "empty", "small", "samples_only")}
        made: dict[str, dict[str, object]] = {key: {} for key in shops}
        try:
            for path in [f for f in sorted(MIGRATIONS.glob("*.sql")) if f.name < THIS_ONE]:
                async with migrating.transaction():
                    await migrating.execute(path.read_text(encoding="utf-8"))

            async def shop(key, items):
                tenant = shops[key]
                await migrating.execute(
                    "insert into tenants (id, name, slug) values ($1, $2, $3)",
                    tenant, key, f"{key}-x".replace("_", "-"),
                )
                await migrating.execute(
                    "select set_config('app.tenant_id', $1, false)", str(tenant)
                )
                for name, hours, sample, status in items:
                    made[key][name] = await migrating.fetchval(
                        "insert into items (name, name_ar, price, status, created_at, sort, "
                        "is_sample) values ($1, $1, 100, $2, $3, 0, $4) returning id",
                        name, status, BASE + timedelta(hours=hours), sample,
                    )
                await migrating.execute("reset app.tenant_id")

            # Not made in the order of their names: the number follows when they were made.
            await shop("busy", [
                ("Third", 3, False, "live"), ("First", 1, False, "live"),
                ("Example", 2, True, "draft"), ("Second", 2, False, "archived"),
                ("Fourth", 4, False, "draft"),
            ])
            await shop("empty", [])
            await shop("small", [("Only", 1, False, "live"), ("Next", 2, False, "live")])
            await shop("samples_only", [("Sample A", 1, True, "draft")])

            async with migrating.transaction():
                await migrating.execute((MIGRATIONS / THIS_ONE).read_text(encoding="utf-8"))
        finally:
            await migrating.close()

        look = await asyncpg.connect(dsn_for(OWNER_DSN, scratch))
        try:
            def by_shop():
                return look.fetch("select tenant_id, name, code from items order by name")

            first = {(r["tenant_id"], r["name"]): r["code"] for r in await by_shop()}
            counters = {r["tenant_id"]: r["next_code"] for r in await look.fetch(
                "select tenant_id, next_code from item_code_counters")}
            sql = (MIGRATIONS / THIS_ONE).read_text(encoding="utf-8")
            async with look.transaction():
                await look.execute(sql[sql.index("do $$"):sql.index("-- ----", sql.index("do $$"))])
            again = {(r["tenant_id"], r["name"]): r["code"] for r in await by_shop()}
            counters_again = {r["tenant_id"]: r["next_code"] for r in await look.fetch(
                "select tenant_id, next_code from item_code_counters")}
            forced = await look.fetch(
                "select relname, relforcerowsecurity from pg_class "
                "where relname in ('item_code_counters', 'chat_carts')"
            )
        finally:
            await look.close()

        # The app's own role makes the next item: the count continues where it was.
        app = await asyncpg.connect(dsn_for(APP_DSN, scratch))
        try:
            continued = {}
            for key in ("busy", "small", "empty", "samples_only"):
                async with app.transaction():
                    await app.execute("select set_config('app.tenant_id', $1, true)",
                                      str(shops[key]))
                    continued[key] = await app.fetchval(
                        "insert into items (name, name_ar, price) values ('Later', 'Later', 1) "
                        "returning code"
                    )
        finally:
            await app.close()
        return {"shops": shops, "first": first, "counters": counters, "again": again,
                "counters_again": counters_again, "forced": forced, "continued": continued}
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


@pytest.fixture(scope="module", params=[False, True], ids=["superuser_owner", "row_security_owner"])
def migrated(request):
    return asyncio.run(build_and_migrate(request.param))


def test_every_item_gets_the_next_number_of_its_shop_oldest_first(migrated):
    s, got = migrated["shops"], migrated["first"]
    busy = {name: got[(s["busy"], name)] for name in ("First", "Second", "Third", "Fourth")}
    assert busy == {"First": 101, "Second": 102, "Third": 103, "Fourth": 104}
    assert [got[(s["small"], "Only")], got[(s["small"], "Next")]] == [101, 102]


def test_an_example_gets_no_number_and_uses_none(migrated):
    s, got = migrated["shops"], migrated["first"]
    assert got[(s["busy"], "Example")] is None
    assert got[(s["samples_only"], "Sample A")] is None
    assert s["samples_only"] not in migrated["counters"]


def test_the_counter_points_at_the_next_free_number_and_a_shop_without_items_has_none(migrated):
    s, counters = migrated["shops"], migrated["counters"]
    assert counters[s["busy"]] == 105 and counters[s["small"]] == 103
    assert s["empty"] not in counters


def test_the_next_item_made_continues_the_count(migrated):
    assert migrated["continued"] == {"busy": 105, "small": 103, "empty": 101, "samples_only": 101}


def test_running_the_data_step_again_changes_nothing(migrated):
    assert migrated["again"] == migrated["first"]
    assert migrated["counters_again"] == migrated["counters"]


def test_the_new_tables_have_forced_row_level_security(migrated):
    assert {r["relname"]: r["relforcerowsecurity"] for r in migrated["forced"]} == {
        "item_code_counters": True, "chat_carts": True,
    }
