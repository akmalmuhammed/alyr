"""The Catalog is switched on (ALY-113, D-039): the shops that already exist get it, nothing about
them is touched otherwise, and the back office can still switch it off for one shop.

Migration 0032 runs here on a throwaway database that is built up to 0031 and filled the way a
live database is (shops of several types, one with the Catalog already switched off by hand,
settings, items), twice: as a superuser, as the local database is, and as an owner that does not
bypass row-level security, as a hosted database's administrator may not be.
"""

import asyncio
from urllib.parse import urlparse
from uuid import UUID, uuid4

import asyncpg
import pytest

from alyr.migrate import MIGRATIONS, ensure_app_role
from conftest import APP_DSN, OWNER_DSN
from test_catalog_migration import dsn_for
from test_consent import owner_sql
from test_onboarding import new_business
from test_pricing import ADMIN

THIS_ONE = "0032_catalog_go_live.sql"
LIMITED_ROLE = "alyr_golive_check"
FREE = "ALYR go-live (migration 0032)"


def modules_of(rows, tenant) -> dict[str, bool]:
    return {r["module_key"]: r["enabled"] for r in rows if r["tenant_id"] == tenant}


async def build_and_migrate(limited: bool) -> dict:
    base = urlparse(OWNER_DSN).path.lstrip("/")
    scratch = f"{base}_golive_{'limited' if limited else 'super'}"
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
        shops = {key: uuid4() for key in (
            "restaurant", "salon", "wholesale", "travel", "documents", "untyped", "off_by_hand",
            "already_on", "wholesale_orders_off", "bakery", "shop", "placeholder",
        )}
        try:
            before = [f for f in sorted(MIGRATIONS.glob("*.sql")) if f.name < THIS_ONE]
            for path in before:
                async with migrating.transaction():
                    await migrating.execute(path.read_text(encoding="utf-8"))

            async def shop(key, kind, modules, **settings):
                tenant = shops[key]
                await migrating.execute(
                    "insert into tenants (id, name, slug, business_type) values ($1, $2, $3, $4)",
                    tenant, key.replace("_", " ").title(), f"{key}-x".replace("_", "-"), kind,
                )
                await migrating.execute(
                    "select set_config('app.tenant_id', $1, false)", str(tenant)
                )
                for module, enabled in modules.items():
                    await migrating.execute(
                        "insert into tenant_modules (module_key, enabled, enabled_by) "
                        "values ($1, $2, 'ALYR back office')", module, enabled,
                    )
                if settings:
                    await migrating.execute(
                        "insert into shop_settings (low_stock_at, sold_out_display) "
                        "values ($1, $2)",
                        settings["low_stock_at"], settings["sold_out_display"],
                    )
                await migrating.execute("reset app.tenant_id")

            chat = {"inbox": True, "orders": True, "payments": True}
            await shop("restaurant", "restaurant", chat, low_stock_at=7, sold_out_display="hide")
            await shop("salon", "salon", {"inbox": True, "bookings": True, "payments": True})
            await shop("wholesale", "wholesale", {"inbox": True, "ledger": True, "payments": True})
            await shop("travel", "travel", {"inbox": True, "payments": True})
            await shop("documents", "documents", {"inbox": True})
            await shop("untyped", "", {"inbox": True, "orders": True})
            await shop("bakery", "bakery", chat)
            await shop("shop", "shop", chat)
            await shop("placeholder", "", {})
            # The back office switched the Catalog off by hand before this ran: it stays off.
            await shop("off_by_hand", "restaurant", {**chat, "catalog": False})
            await shop("already_on", "restaurant", {**chat, "catalog": True})
            # A wholesaler whose orders module was switched off by hand: it stays off too.
            await shop("wholesale_orders_off", "wholesale",
                       {"inbox": True, "ledger": True, "orders": False, "payments": True})

            async with migrating.transaction():
                await migrating.execute((MIGRATIONS / THIS_ONE).read_text(encoding="utf-8"))
        finally:
            await migrating.close()

        look = await asyncpg.connect(dsn_for(OWNER_DSN, scratch))
        try:
            rows = await look.fetch(
                "select tenant_id, module_key, enabled, enabled_by from tenant_modules"
            )
            first = {t: dict(modules_of(rows, t)) for t in shops.values()}
            made_by = {
                (r["tenant_id"], r["module_key"]): r["enabled_by"] for r in rows
            }
            settings = await look.fetch("select tenant_id, low_stock_at, sold_out_display "
                                        "from shop_settings")
            counts_before = {
                "items": await look.fetchval("select count(*) from items"),
                "categories": await look.fetchval("select count(*) from item_categories"),
                "tenants": await look.fetchval("select count(*) from tenants"),
            }
            sql = (MIGRATIONS / THIS_ONE).read_text(encoding="utf-8")
            block = sql[sql.index("do $$"):]
            # The data step is safe to run again: nothing is added twice or turned back on.
            async with look.transaction():
                await look.execute(block)
            again = await look.fetch(
                "select tenant_id, module_key, enabled from tenant_modules"
            )
            result = {
                "shops": shops, "first": first, "made_by": made_by, "settings": settings,
                "again": {t: dict(modules_of(again, t)) for t in shops.values()},
                "counts_before": counts_before,
                "forced": await look.fetchval(
                    "select relforcerowsecurity from pg_class where relname = 'tenant_modules'"
                ),
                "subjects": await look.fetchval(
                    "select pg_get_constraintdef(oid) from pg_constraint "
                    "where conname = 'activity_subject_check'"
                ),
                "function": await look.fetchval("select to_regproc('admin_set_module')"),
            }
        finally:
            await look.close()
        return result
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


@pytest.fixture(scope="module", params=[False, True], ids=["superuser_owner", "row_security_owner"])
def migrated(request):
    return asyncio.run(build_and_migrate(request.param))


def test_every_shop_that_should_have_a_catalog_gets_the_module(migrated):
    s, got = migrated["shops"], migrated["first"]
    for key in ("restaurant", "salon", "untyped", "bakery", "shop", "already_on"):
        assert got[s[key]].get("catalog") is True, key
    # A wholesaler's catalog needs the orders module (its customers order from the price list).
    assert got[s["wholesale"]] == {
        "inbox": True, "ledger": True, "payments": True, "catalog": True, "orders": True,
    }
    # Nothing else is added to anyone.
    assert got[s["restaurant"]] == {
        "inbox": True, "orders": True, "payments": True, "catalog": True,
    }
    assert got[s["salon"]] == {"inbox": True, "bookings": True, "payments": True, "catalog": True}


def test_travel_and_documents_businesses_have_no_catalog(migrated):
    s, got = migrated["shops"], migrated["first"]
    assert got[s["travel"]] == {"inbox": True, "payments": True}
    assert got[s["documents"]] == {"inbox": True}


def test_a_row_with_no_modules_is_not_a_shop_and_is_left_alone(migrated):
    s, got = migrated["shops"], migrated["first"]
    assert got[s["placeholder"]] == {}


def test_a_module_the_back_office_switched_off_stays_off(migrated):
    s, got = migrated["shops"], migrated["first"]
    assert got[s["off_by_hand"]]["catalog"] is False
    assert got[s["wholesale_orders_off"]]["orders"] is False
    assert got[s["wholesale_orders_off"]]["catalog"] is True


def test_the_shops_that_were_already_on_are_not_rewritten(migrated):
    s = migrated["shops"]
    assert migrated["made_by"][(s["already_on"], "catalog")] == "ALYR back office"
    assert migrated["made_by"][(s["restaurant"], "catalog")] == FREE
    assert migrated["made_by"][(s["restaurant"], "orders")] == "ALYR back office"


def test_it_writes_nothing_but_the_module_rows(migrated):
    s = migrated["shops"]
    assert [(r["low_stock_at"], r["sold_out_display"]) for r in migrated["settings"]
            if r["tenant_id"] == s["restaurant"]] == [(7, "hide")]
    assert len(migrated["settings"]) == 1  # no shop was given settings, categories or samples
    assert migrated["counts_before"]["items"] == 0
    assert migrated["counts_before"]["categories"] == 0


def test_running_the_data_step_again_changes_nothing(migrated):
    assert migrated["again"] == migrated["first"]


def test_row_level_security_is_still_forced_and_the_new_pieces_exist(migrated):
    assert migrated["forced"] is True
    assert "'catalog'" in migrated["subjects"]
    assert migrated["function"] is not None


# ── the back office can still switch the Catalog off for one shop ─────────────────────


@pytest.fixture
def office(client_factory):
    return client_factory()


def tenant_of(client) -> str:
    return client.get("/api/workspace").json()["business"]["slug"]


def tenant_id(slug: str) -> UUID:
    return owner_sql("select id from tenants where slug = $1", slug)[0]["id"]


def has_catalog(client) -> bool:
    workspace = client.get("/api/workspace").json()
    return "catalog" in workspace["modules"]


def test_the_back_office_switches_the_catalog_off_and_on_for_one_shop(client, office):
    new_business(client, kind="restaurant")
    other_slug = tenant_of(client)
    tenant = tenant_id(other_slug)
    assert has_catalog(client)
    assert client.get("/api/items").status_code == 200

    off = office.post(f"{ADMIN}/businesses/{tenant}/modules/catalog", json={"enabled": False})
    assert off.status_code == 200, off.text
    assert off.json() == {"module": "catalog", "enabled": False}
    # The screens and pages go; the orders module is the shop's own and stays.
    assert not has_catalog(client)
    nav = [s["key"] for s in client.get("/api/workspace").json()["nav"]["products"]]
    assert "catalog" not in nav and "orders" in nav
    page = client.get(f"/api/store/{other_slug}").json()
    assert page["shop"]["catalog"] is False and page["catalog"] is None
    # Nothing was deleted: the shop's samples are still in the database.
    assert owner_sql("select count(*) as n from items where tenant_id = $1", tenant)[0]["n"] > 0

    on = office.post(f"{ADMIN}/businesses/{tenant}/modules/catalog", json={"enabled": True})
    assert on.status_code == 200
    assert has_catalog(client)

    log = [e["action"] for e in office.get(f"{ADMIN}/audit").json()["entries"]]
    assert log[:2] == ["module.on", "module.off"]


def test_the_back_office_switches_only_the_catalog_and_only_a_business_that_exists(office):
    tenant = owner_sql("select id from tenants limit 1")[0]["id"]
    for module in ("inbox", "orders", "payments", "nothing"):
        refused = office.post(
            f"{ADMIN}/businesses/{tenant}/modules/{module}", json={"enabled": False}
        )
        assert refused.status_code == 404, module
    missing = office.post(
        f"{ADMIN}/businesses/{uuid4()}/modules/catalog", json={"enabled": False}
    )
    assert missing.status_code == 404


def test_only_the_back_office_can_switch_a_module(client):
    new_business(client)
    tenant = tenant_id(tenant_of(client))
    # A shop owner, signed in, is not the back office.
    refused = client.post(
        f"{ADMIN}/businesses/{tenant}/modules/catalog", json={"enabled": False}
    )
    assert refused.status_code == 403


def test_a_business_the_back_office_creates_has_the_catalog_while_the_setting_is_on(
    client_factory, monkeypatch
):
    body = {"name": "Back Office Shop", "owner_email": "o@bo.example", "owner_name": "Owner",
            "products": ["chat"]}
    on = client_factory()
    made = on.post(f"{ADMIN}/businesses", json={**body, "slug": f"bo-on-{uuid4().hex[:6]}"})
    assert made.status_code == 200, made.text
    assert set(made.json()["modules"]) == {"inbox", "orders", "payments", "catalog"}

    monkeypatch.setenv("ALYR_CATALOG_FOR_NEW_SHOPS", "false")
    off = client_factory()
    made = off.post(
        f"{ADMIN}/businesses",
        json={**body, "owner_email": "p@bo.example", "slug": f"bo-off-{uuid4().hex[:6]}"},
    )
    assert made.status_code == 200, made.text
    assert set(made.json()["modules"]) == {"inbox", "orders", "payments"}

