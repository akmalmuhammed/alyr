"""Migration 0069 and what it is for (go-live checklist item 33, ALY-275, D-076): a shop's
rows are found without reading every other shop's, and the order page only reads.

The index rule itself is `test_tenant_isolation.py`'s; the job claim's is in `test_jobs.py`.
Here: every shop has its default price group from the moment it exists, so the order page
never writes, and PostgreSQL refuses a write in a read-only transaction. The migration is
checked like the others: a throwaway database brought up to the one before it, filled the way
a live one is, then 0069 applied, as a superuser and as an owner that row-level security
applies to (as in production).
"""

import asyncio
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg
import pytest

from alyr.migrate import MIGRATIONS, ensure_app_role
from alyr.modules.items import groups
from alyr.seed import DEMO_TENANT_ID
from conftest import APP_DSN, OWNER_DSN
from test_catalog_migration import dsn_for
from test_consent import owner_sql

THIS_ONE = "0069_shop_first_indexes.sql"
LIMITED_ROLE = "alyr_indexes_check"


async def build_and_migrate(limited: bool) -> dict:
    base = urlparse(OWNER_DSN).path.lstrip("/")
    scratch = f"{base}_idx_{'limited' if limited else 'super'}"
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
        # "opened": its order page made the default group; "never": no page has opened yet;
        # "wholesale": opened, and has a group of its own as well.
        shops = {"opened": uuid4(), "never": uuid4(), "wholesale": uuid4()}
        kept = {}
        try:
            for path in [f for f in sorted(MIGRATIONS.glob("*.sql")) if f.name < THIS_ONE]:
                async with migrating.transaction():
                    await migrating.execute(path.read_text(encoding="utf-8"))
            for key, tenant in shops.items():
                await migrating.execute(
                    "insert into tenants (id, name, slug) values ($1, $2, $3)", tenant, key, key
                )
            for key in ("opened", "wholesale"):
                async with migrating.transaction():
                    await migrating.execute("select set_config('app.tenant_id', $1, true)",
                                            str(shops[key]))
                    kept[key] = await migrating.fetchval(
                        "insert into price_groups (name, name_ar, is_default) "
                        "values ('Retail', 'التجزئة', true) returning id")
            async with migrating.transaction():
                await migrating.execute("select set_config('app.tenant_id', $1, true)",
                                        str(shops["wholesale"]))
                await migrating.execute(
                    "insert into price_groups (name, name_ar) values ('Wholesale', 'الجملة')")
            async with migrating.transaction():
                await migrating.execute((MIGRATIONS / THIS_ONE).read_text(encoding="utf-8"))

            # A shop made afterwards, by the same owner, from inside another shop's scope (as
            # the sign-up function is called): it gets its group, and the scope is put back.
            made = uuid4()
            async with migrating.transaction():
                await migrating.execute("select set_config('app.tenant_id', $1, true)",
                                        str(shops["opened"]))
                await migrating.execute(
                    "insert into tenants (id, name, slug) values ($1, 'New', 'new')", made)
                scope_after = await migrating.fetchval("select current_setting('app.tenant_id')")
            shops["made_later"] = made
        finally:
            await migrating.close()

        look = await asyncpg.connect(dsn_for(OWNER_DSN, scratch))
        try:
            rows = await look.fetch(
                "select tenant_id, id, name, name_ar, is_default from price_groups "
                "where archived_at is null")
            forced = await look.fetchval(
                "select relforcerowsecurity from pg_class where relname = 'price_groups'")
        finally:
            await look.close()

        app = await asyncpg.connect(dsn_for(APP_DSN, scratch))
        try:
            seen = {}
            for key, tenant in shops.items():
                async with app.transaction():
                    await app.execute("select set_config('app.tenant_id', $1, true)",
                                      str(tenant))
                    seen[key] = await app.fetchval("select count(*) from price_groups")
        finally:
            await app.close()
        return {"shops": shops, "kept": kept, "rows": rows, "forced": forced,
                "scope_after": scope_after, "seen": seen}
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


@pytest.fixture(scope="module", params=[False, True], ids=["superuser_owner", "row_security_owner"])
def migrated(request):
    return asyncio.run(build_and_migrate(request.param))


def test_every_shop_has_one_default_group_after_the_migration_and_old_ones_are_kept(migrated):
    defaults = {}
    for row in migrated["rows"]:
        if row["is_default"]:
            defaults.setdefault(row["tenant_id"], []).append(row)
    for key, tenant in migrated["shops"].items():
        [group] = defaults[tenant]
        assert (group["name"], group["name_ar"]) == groups.DEFAULT_NAME, key
    for key, group_id in migrated["kept"].items():
        assert defaults[migrated["shops"][key]][0]["id"] == group_id
    assert migrated["forced"] is True


def test_a_shop_made_later_gets_its_group_and_the_callers_scope_is_put_back(migrated):
    assert migrated["seen"]["made_later"] == 1
    assert migrated["scope_after"] == str(migrated["shops"]["opened"])


def test_each_shop_sees_only_its_own_groups(migrated):
    assert migrated["seen"] == {"opened": 1, "never": 1, "wholesale": 2, "made_later": 1}


# ------------------------------------------------------------------ the order page only reads

def test_a_new_shops_order_page_opens_without_writing(client):
    """The page reads in a read-only transaction: before 0069 its first opening made the
    shop's default group, which PostgreSQL would now refuse."""
    shop = owner_sql(
        "insert into tenants (name, slug) values ('Fresh Bakery', $1) returning id",
        f"fresh-{uuid4().hex[:8]}",
    )[0]["id"]
    slug = owner_sql("select slug from tenants where id = $1", shop)[0]["slug"]
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'orders')", shop)
    try:
        def groups_of_the_shop() -> int:
            return owner_sql(
                "select count(*) as n from price_groups where tenant_id = $1", shop)[0]["n"]

        before = groups_of_the_shop()
        response = client.get(f"/api/store/{slug}")
        assert response.status_code == 200, response.text
        assert response.json()["products"] == []
        assert client.get(f"/api/store/{slug}/share").status_code == 200
        assert before == groups_of_the_shop() == 1
    finally:
        for table in ("tenant_modules", "price_groups"):
            owner_sql(f"delete from {table} where tenant_id = $1", shop)
        owner_sql("delete from tenants where id = $1", shop)


def test_a_read_only_transaction_refuses_a_write(client):
    async def write():
        async with client.app.state.db.tenant(DEMO_TENANT_ID, readonly=True) as conn:
            await conn.execute("insert into saved_replies (title, body) values ('x', 'y')")

    with pytest.raises(asyncpg.ReadOnlySQLTransactionError):
        client.portal.call(write)
