"""What a type of business gives a shop's Catalog, and how the shop reads it (D-039, ALY-107).

The type is the shop's `business_type` (D-031). Its words and layout come from
`presets_catalog.py`; a few starting values are written into the shop's settings when it is
created and are the owner's to change (`shop_settings`): how a sold-out item looks on the order
page, how a new item runs out, and which alerts are on.

`hints` is the one small answer the rest reads, on the workspace (`/api/items/setup`), on the
onboarding review and, trimmed to what a customer's page needs, on the order page's own
endpoint (`public`). The import and export (ALY-108) and the order page (ALY-112) read the
section's name and the layout from it; their shape is in `specs/008-catalog-business-types`.

A shop with no type of its own (the back office made it, say) gets the plain Catalog.

Every function takes a tenant-scoped connection.
"""

from dataclasses import asdict

import asyncpg

from alyr.catalog import Text
from alyr.modules.items import samples, service
from alyr.modules.items.clock import ShopClock
from alyr.presets_catalog import ALERTS, RULES, CatalogSetup, setup_for

SOLD_OUT = ("grey", "hide")
_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"


async def enabled(conn: asyncpg.Connection) -> bool:
    """Is the Catalog module on for this shop?"""
    return bool(
        await conn.fetchval("select enabled from tenant_modules where module_key = 'catalog'")
    )


async def business_type(conn: asyncpg.Connection) -> str:
    return await conn.fetchval(f"select business_type from tenants where id = {_TENANT}") or ""


async def setup_of(conn: asyncpg.Connection) -> CatalogSetup:
    return setup_for(await business_type(conn))


async def section(conn: asyncpg.Connection) -> Text:
    """What this shop calls its Catalog: "Menu", "Products", "Price list", or "Catalog"."""
    return (await setup_of(conn)).section


def _text(value: Text) -> dict:
    return {"en": value.en, "ar": value.ar}


async def _shop_values(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow(
        "select low_stock_at, sold_out_display, new_item_rule, alert_low_stock, alert_sold_out "
        "from shop_settings"
    )
    if row is None:  # the table's own defaults, which are what every shop had before
        return {"low_stock_at": 5, "sold_out_display": "grey", "new_item_rule": "switch",
                "alert_low_stock": True, "alert_sold_out": True}
    return dict(row)


def _section_view(setup: CatalogSetup) -> dict:
    return {
        "name": setup.section.en, "name_ar": setup.section.ar,
        "sub": setup.sub.en, "sub_ar": setup.sub.ar,
    }


async def hints(conn: asyncpg.Connection) -> dict:
    """The shop's Catalog wording, layout and starting values, for the workspace."""
    kind = await business_type(conn)
    setup = setup_for(kind)
    mine = await _shop_values(conn)
    # A new item is ordered for a date (the bakery's) only while it runs out the type's way.
    lead = setup.lead if setup.lead and mine["new_item_rule"] == setup.rule else None
    return {
        "type": kind,
        "section": _section_view(setup),
        "optional": setup.optional,
        "layout": asdict(setup.layout),
        "sold_out": mine["sold_out_display"],
        "new_item": {
            "rule": mine["new_item_rule"], "unit": setup.unit,
            "lead_days": lead[0] if lead else None, "cutoff": lead[1] if lead else None,
        },
        "low_stock_at": mine["low_stock_at"],
        "alerts": {"low_stock": mine["alert_low_stock"], "sold_out": mine["alert_sold_out"]},
        "focus": list(setup.focus),
        "report_lines": list(setup.report_lines),
        "samples": await samples.count(conn),
    }


async def public(conn: asyncpg.Connection) -> dict:
    """What a customer's page may know: the section's name, the layout and what a sold-out
    item should look like. Nothing about stock numbers, alerts or samples."""
    kind = await business_type(conn)
    setup = setup_for(kind)
    mine = await _shop_values(conn)
    return {
        "type": kind,
        "section": {"name": setup.section.en, "name_ar": setup.section.ar},
        "layout": asdict(setup.layout),
        "sold_out": mine["sold_out_display"],
    }


async def review(conn: asyncpg.Connection) -> dict:
    """What onboarding's review step tells the owner about the catalog they are getting, in
    plain words: the hints, and the list of what the type brings."""
    setup = await setup_of(conn)
    return {
        **await hints(conn),
        "gets": [_text(g) for g in setup.gets],
        "starting_categories": [{"name": n, "name_ar": a} for n, a in setup.categories],
    }


async def save(
    conn: asyncpg.Connection, *, sold_out: str | None = None, new_item_rule: str | None = None,
    alerts: dict | None = None,
) -> dict:
    """The owner changes what their type started them with."""
    if sold_out is not None and sold_out not in SOLD_OUT:
        raise service.ItemError("bad_sold_out", "Choose greyed out or left out.")
    if new_item_rule is not None and new_item_rule not in RULES:
        raise service.ItemError("bad_rule", "Choose how this item runs out.")
    alerts = alerts or {}
    if set(alerts) - set(ALERTS):
        raise service.ItemError("bad_alert", "Choose low stock or sold out.")
    await conn.execute(
        "insert into shop_settings (sold_out_display, new_item_rule, alert_low_stock, "
        "alert_sold_out) values (coalesce($1::text, 'grey'), coalesce($2::text, 'switch'), "
        "coalesce($3::boolean, true), coalesce($4::boolean, true)) "
        "on conflict (tenant_id) do update set "
        "sold_out_display = coalesce($1::text, shop_settings.sold_out_display), "
        "new_item_rule = coalesce($2::text, shop_settings.new_item_rule), "
        "alert_low_stock = coalesce($3::boolean, shop_settings.alert_low_stock), "
        "alert_sold_out = coalesce($4::boolean, shop_settings.alert_sold_out)",
        sold_out, new_item_rule, alerts.get("low_stock"), alerts.get("sold_out"),
    )
    return await hints(conn)


async def draft_rule(conn: asyncpg.Connection) -> str:
    """How a draft made from a photo runs out: the way the shop's new items do. A number each
    day needs its number first, so a draft starts as on or off in that case."""
    rule = (await _shop_values(conn))["new_item_rule"]
    return rule if rule in ("switch", "count", "always") else "switch"


async def alert_on(conn: asyncpg.Connection, kind: str) -> bool:
    """Is this alert ("low_stock" or "sold_out") on for the shop? On unless switched off."""
    if kind not in ALERTS:
        raise ValueError(kind)
    value = await conn.fetchval(f"select alert_{kind} from shop_settings")
    return True if value is None else bool(value)


async def apply(conn: asyncpg.Connection, setup: CatalogSetup, clock: ShopClock) -> int:
    """Give a new shop its type's catalog: the starting values, the categories and the
    sample items. Returns how many samples. Called once, by onboarding, and only while the
    Catalog is switched on for new shops."""
    await conn.execute(
        "insert into shop_settings (low_stock_at, sold_out_display, new_item_rule, "
        "alert_low_stock, alert_sold_out) values ($1, $2, $3, $4, $5) "
        "on conflict (tenant_id) do update set low_stock_at = $1, sold_out_display = $2, "
        "new_item_rule = $3, alert_low_stock = $4, alert_sold_out = $5",
        setup.low_stock_at, setup.sold_out, setup.rule, "low_stock" in setup.alerts,
        "sold_out" in setup.alerts,
    )
    await service.save_categories(
        conn, [{"name": name, "name_ar": ar} for name, ar in setup.categories]
    )
    return await samples.add(conn, setup, clock)
