"""Migration 0035 brings every existing shop across without changing how it behaves (ALY-148).

It runs here on a throwaway database that is built up to 0033 and filled the way a live database
is: a shop of each business type with the settings its type gave it, shops whose owner changed a
setting, a shop with no settings at all, a shop with items and orders. Twice: as a superuser, as
the local database is, and as an owner that does not bypass row-level security, as a hosted
database's administrator may not be.
"""

import asyncio
import json
from urllib.parse import urlparse
from uuid import uuid4

import asyncpg
import pytest

from alyr import capabilities, shop_templates
from alyr.migrate import MIGRATIONS, ensure_app_role
from alyr.presets import PRESETS
from conftest import APP_DSN, OWNER_DSN
from test_catalog_migration import dsn_for

THIS_ONE = "0035_feature_engine.sql"
LIMITED_ROLE = "alyr_features_check"
TYPES = [p.key for p in PRESETS]


def settings_of(kind: str) -> tuple[bool, bool, str]:
    """The three values a type's onboarding wrote into a shop's settings."""
    template = shop_templates.builtin_for(kind)
    return (template.on("low_stock_alerts"), template.on("sold_out_alerts"),
            template.config("sold_out_display")["mode"])


async def build_and_migrate(limited: bool) -> dict:
    base = urlparse(OWNER_DSN).path.lstrip("/")
    scratch = f"{base}_features_{'limited' if limited else 'super'}"
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
        shops: dict[str, object] = {}
        try:
            for path in [f for f in sorted(MIGRATIONS.glob("*.sql")) if f.name < THIS_ONE]:
                async with migrating.transaction():
                    await migrating.execute(path.read_text(encoding="utf-8"))

            async def shop(key: str, kind: str, settings: tuple | None = "default"):
                tenant = shops[key] = uuid4()
                await migrating.execute(
                    "insert into tenants (id, name, slug, business_type) "
                    "values ($1, $2, $3, $4)",
                    tenant, key.title(), f"{key}-x".replace("_", "-"), kind,
                )
                await migrating.execute(
                    "select set_config('app.tenant_id', $1, false)", str(tenant)
                )
                if settings == "default":
                    settings = settings_of(kind)
                if settings is not None:
                    await migrating.execute(
                        "insert into shop_settings (alert_low_stock, alert_sold_out, "
                        "sold_out_display, low_stock_at) values ($1, $2, $3, 7)", *settings,
                    )
                await migrating.execute("reset app.tenant_id")

            for kind in TYPES:
                await shop(kind, kind)
            # What an owner changed after onboarding.
            await shop("restaurant_low_on", "restaurant", (True, True, "grey"))
            await shop("grocery_greyed", "grocery", (True, True, "grey"))
            await shop("bakery_quiet", "bakery", (False, False, "hide"))
            # Shops that were never given settings, or have no type.
            await shop("no_settings", "shop", None)
            await shop("untyped", "", None)
            await shop("untyped_with_settings", "", (True, True, "grey"))

            # An item and an order, to prove the migration leaves the data alone.
            await migrating.execute(
                "select set_config('app.tenant_id', $1, false)", str(shops["shop"])
            )
            await migrating.execute(
                "insert into items (name, name_ar, price, category) values "
                "('Lamp', 'مصباح', 4500, 'Home')"
            )
            counts_before = {
                "items": await migrating.fetchval("select count(*) from items"),
                "tenants": await migrating.fetchval("select count(*) from tenants"),
            }
            await migrating.execute("reset app.tenant_id")
            async with migrating.transaction():
                await migrating.execute((MIGRATIONS / THIS_ONE).read_text(encoding="utf-8"))
        finally:
            await migrating.close()

        look = await asyncpg.connect(dsn_for(OWNER_DSN, scratch))
        try:
            rows = await look.fetch(
                "select tenant_id, key, enabled, config, set_by, updated_by from shop_features"
            )
            sql = (MIGRATIONS / THIS_ONE).read_text(encoding="utf-8")
            data_step = sql[sql.index("insert into shop_features"):sql.index(
                "alter table shop_settings force row level security;")]
            async with look.transaction():
                await look.execute("alter table shop_settings no force row level security")
                await look.execute(data_step)  # again: nothing is added or changed twice
                await look.execute("alter table shop_settings force row level security")
            again = await look.fetchval("select count(*) from shop_features")
            return {
                "shops": shops, "rows": rows, "again": again, "counts_before": counts_before,
                "counts_after": {
                    "items": await look.fetchval("select count(*) from items"),
                    "tenants": await look.fetchval("select count(*) from tenants"),
                },
                "forced": await look.fetchval(
                    "select relforcerowsecurity from pg_class where relname = 'shop_features'"
                ),
                "settings_forced": await look.fetchval(
                    "select relforcerowsecurity from pg_class where relname = 'shop_settings'"
                ),
                "columns": [r["column_name"] for r in await look.fetch(
                    "select column_name from information_schema.columns "
                    "where table_name = 'shop_settings'"
                )],
                "legacy": await look.fetch(
                    "select tenant_id, alert_low_stock, alert_sold_out, sold_out_display, "
                    "low_stock_at, section_name, section_name_ar, layout_style, template_key "
                    "from shop_settings"
                ),
            }
        finally:
            await look.close()
    finally:
        await admin.execute(f'drop database if exists "{scratch}" with (force)')
        await admin.execute(f"drop role if exists {LIMITED_ROLE}")
        await admin.close()


@pytest.fixture(scope="module", params=[False, True], ids=["superuser_owner", "row_security_owner"])
def migrated(request):
    return asyncio.run(build_and_migrate(request.param))


def of(migrated, key: str) -> dict[str, asyncpg.Record]:
    tenant = migrated["shops"][key]
    return {r["key"]: r for r in migrated["rows"] if r["tenant_id"] == tenant}


# Features registered after migration 0035 have no row for a shop that existed then: it gets its
# template's value, which for these is on, so nothing changes for it (no migration is needed to
# add a feature; the order-by-code merge, ALY-136, added "Order on WhatsApp").
ADDED_LATER = {"order_on_whatsapp"}


def test_every_shop_gets_a_row_for_every_feature_it_can_have(migrated):
    expected = set(capabilities.STORED) - ADDED_LATER
    for key in migrated["shops"]:
        assert set(of(migrated, key)) == expected, key
    assert len(migrated["rows"]) == len(migrated["shops"]) * len(expected)


def test_a_feature_added_after_the_migration_is_on_for_every_type_so_nothing_changes():
    for kind in TYPES:
        for key in ADDED_LATER:
            assert shop_templates.builtin_for(kind).features[key][0] is True, (kind, key)


@pytest.mark.parametrize("kind", TYPES)
def test_a_shop_of_each_type_gets_exactly_what_its_template_says(migrated, kind):
    """For each of the eleven types: the migrated rows equal the built-in template, which is
    what a shop of the type is given when it is created today."""
    template = shop_templates.builtin_for(kind)
    rows = of(migrated, kind)
    for key, (on, config) in template.features.items():
        if key in ADDED_LATER:
            continue
        assert rows[key]["enabled"] is on, (kind, key)
        assert {**capabilities.BY_KEY[key].config, **dict(
            json.loads(rows[key]["config"]) if rows[key]["config"] else {}
        )} == {**capabilities.BY_KEY[key].config, **config}, (kind, key)
        assert rows[key]["set_by"] == "template", (kind, key)
        assert rows[key]["updated_by"] == "ALYR migration"


def test_what_an_owner_changed_stays_changed_and_is_marked_theirs(migrated):
    low = of(migrated, "restaurant_low_on")
    assert low["low_stock_alerts"]["enabled"] is True
    assert low["low_stock_alerts"]["set_by"] == "owner"
    assert low["sold_out_alerts"]["set_by"] == "template"
    greyed = of(migrated, "grocery_greyed")
    assert json.loads(greyed["sold_out_display"]["config"]) == {"mode": "grey"}
    assert greyed["sold_out_display"]["set_by"] == "owner"
    quiet = of(migrated, "bakery_quiet")
    assert quiet["low_stock_alerts"]["enabled"] is False
    assert quiet["sold_out_alerts"]["enabled"] is False
    assert {k for k, r in quiet.items() if r["set_by"] == "owner"} == {
        "low_stock_alerts", "sold_out_alerts", "sold_out_display"}


def test_a_shop_with_no_settings_gets_the_defaults_every_shop_had(migrated):
    for key in ("no_settings", "untyped"):
        rows = of(migrated, key)
        assert all(r["enabled"] for r in rows.values()), key
        assert json.loads(rows["sold_out_display"]["config"]) == {"mode": "grey"}
        assert all(r["set_by"] == "template" for r in rows.values()), key


def test_the_data_step_can_run_again_and_adds_nothing(migrated):
    assert migrated["again"] == len(migrated["rows"])


def test_nothing_else_is_touched(migrated):
    assert migrated["counts_before"] == migrated["counts_after"]
    for row in migrated["legacy"]:
        # The old columns keep their values; the new ones start empty.
        assert (row["section_name"], row["section_name_ar"], row["layout_style"],
                row["template_key"]) == ("", "", "", "")
        assert row["low_stock_at"] == 7
    assert {"section_name", "section_name_ar", "layout_style", "template_key"} <= set(
        migrated["columns"])
    assert {"alert_low_stock", "alert_sold_out", "sold_out_display"} <= set(migrated["columns"])


def test_row_level_security_is_forced_on_the_new_table_and_kept_on_the_old(migrated):
    assert migrated["forced"] is True and migrated["settings_forced"] is True
