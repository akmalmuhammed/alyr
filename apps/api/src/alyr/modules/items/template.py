"""What a template gives a shop's Catalog, and how the shop reads it (D-039, ALY-107 and ALY-148).

The shop's template (`shop_templates.py`, usually the one for its business type) brings the
section's words, the order page's layout style, the starter categories and sample items, which
features start on (`features.py`) and a few starting values written into the shop's settings
when it is created: how a new item runs out and the low-stock number. Everything the owner can
change afterwards (the features, the section's name, the layout style) is read from the
shop's own rows first and from the template only where the shop has chosen nothing.

`hints` is the one small answer the rest reads, on the workspace (`/api/items/setup`), on the
onboarding review and, trimmed to what a customer's page needs, on the order page's own
endpoint (`public`). The import and export (ALY-108) and the order page (ALY-112) read the
section's name, the layout and the features from it; their shape is in
`specs/008-catalog-business-types` and `specs/011-feature-engine`.

A shop with no type of its own (the back office made it, say) gets the plain Catalog.

Every function takes a tenant-scoped connection.
"""

import asyncpg

from alyr import capabilities, shop_templates
from alyr.catalog import Text
from alyr.core.team import Actor
from alyr.modules.items import features, samples, service
from alyr.modules.items.clock import ShopClock
from alyr.presets_catalog import ALERTS, RULES, STYLES, CatalogSetup

SOLD_OUT = capabilities.SOLD_OUT_MODES
_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"
MAX_NAME = 40


async def enabled(conn: asyncpg.Connection) -> bool:
    """Is the Catalog module on for this shop?"""
    return bool(
        await conn.fetchval("select enabled from tenant_modules where module_key = 'catalog'")
    )


async def business_type(conn: asyncpg.Connection) -> str:
    return await conn.fetchval(f"select business_type from tenants where id = {_TENANT}") or ""


async def setup_of(conn: asyncpg.Connection) -> CatalogSetup:
    return (await features.template_of(conn)).setup


def _text(value: Text) -> dict:
    return {"en": value.en, "ar": value.ar}


async def _shop_values(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow(
        "select low_stock_at, new_item_rule, section_name, section_name_ar, layout_style "
        "from shop_settings"
    )
    if row is None:  # the table's own defaults, which are what every shop had before
        return {"low_stock_at": 5, "new_item_rule": "switch", "section_name": "",
                "section_name_ar": "", "layout_style": ""}
    return dict(row)


def section_of(setup: CatalogSetup, mine: dict) -> Text:
    """What the shop calls its Catalog: the owner's words where they gave them, else the
    template's ("Menu", "Products", "Price list", "Catalog"). Each language falls back on its
    own, so a shop that only renamed the English keeps the template's Arabic."""
    return Text(mine["section_name"] or setup.section.en,
                mine["section_name_ar"] or setup.section.ar)


async def section(conn: asyncpg.Connection) -> Text:
    """What this shop calls its Catalog."""
    return section_of(await setup_of(conn), await _shop_values(conn))


def _section_view(setup: CatalogSetup, mine: dict) -> dict:
    name = section_of(setup, mine)
    return {
        "name": name.en, "name_ar": name.ar,
        "sub": setup.sub.en, "sub_ar": setup.sub.ar,
        # True once the owner has written their own, so the screen can offer to go back.
        "custom": bool(mine["section_name"] or mine["section_name_ar"]),
        "template_name": setup.section.en, "template_name_ar": setup.section.ar,
    }


# The parts of the item form a type starts open, and the feature each one belongs to.
_FOCUS_FEATURE = {
    "options": "options", "schedule": "schedule", "variants": "variants", "groups": "price_groups",
}


async def hints(conn: asyncpg.Connection) -> dict:
    """The shop's Catalog wording, layout, features and starting values, for the workspace."""
    feats = await features.load(conn)
    template = feats.template
    setup = template.setup
    mine = await _shop_values(conn)
    style = mine["layout_style"] or setup.layout.style
    rule = feats.new_item_rule(mine["new_item_rule"])
    # A new item is ordered for a date (the bakery's) only while it runs out the template's way
    # and the shop lets customers pick a day.
    lead = (
        setup.lead if setup.lead and rule == setup.rule and feats.on("pickup_date") else None
    )
    return {
        "type": await business_type(conn),
        "template": {"key": template.key, "name": template.name.en,
                     "name_ar": template.name.ar, "builtin": template.builtin},
        "section": _section_view(setup, mine),
        "optional": setup.optional,
        "layout": feats.layout(style),
        "layout_custom": bool(mine["layout_style"]),
        "sold_out": feats.sold_out_mode,
        "new_item": {
            "rule": rule, "unit": setup.unit,
            "lead_days": lead[0] if lead else None, "cutoff": lead[1] if lead else None,
        },
        "low_stock_at": mine["low_stock_at"],
        "alerts": {"low_stock": feats.on("low_stock_alerts"),
                   "sold_out": feats.on("sold_out_alerts")},
        "focus": [p for p in setup.focus if feats.on(_FOCUS_FEATURE.get(p, p))],
        "features": feats.snapshot(),
        "samples": await samples.count(conn),
    }


async def public(conn: asyncpg.Connection) -> dict:
    """What a customer's page may know: the section's name, the layout (its style and the four
    things it can offer) and what a sold-out item should look like. Nothing about stock
    numbers, alerts or samples."""
    feats = await features.load(conn)
    setup = feats.template.setup
    mine = await _shop_values(conn)
    name = section_of(setup, mine)
    return {
        "type": await business_type(conn),
        "section": {"name": name.en, "name_ar": name.ar},
        "layout": feats.layout(mine["layout_style"] or setup.layout.style),
        "sold_out": feats.sold_out_mode,
        # What else the page needs to know is on: the tags it can search, the table on an order.
        "features": {k: feats.on(k) for k in ("tags", "variants", "options", "pack_rules",
                                              "price_groups", "table_qr", "custom_fields")},
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


def _clean_name(value: str, what: str) -> str:
    name = " ".join(value.split())
    if len(name) > MAX_NAME:
        raise service.ItemError("bad_section", f"The {what} can be up to {MAX_NAME} letters.")
    return name


async def save(
    conn: asyncpg.Connection, actor: Actor, *, sold_out: str | None = None,
    new_item_rule: str | None = None, alerts: dict | None = None,
    section_name: str | None = None, section_name_ar: str | None = None,
    layout_style: str | None = None,
) -> dict:
    """The owner changes what the type started them with. A section name or layout style of
    "" goes back to the template's. The features it touches (the two alerts and the sold-out
    look) are written to the shop's features, marked as the owner's."""
    if sold_out is not None and sold_out not in SOLD_OUT:
        raise service.ItemError("bad_sold_out", "Choose greyed out or left out.")
    if new_item_rule is not None and new_item_rule not in RULES:
        raise service.ItemError("bad_rule", "Choose how this item runs out.")
    if layout_style is not None and layout_style not in ("", *STYLES):
        raise service.ItemError("bad_layout", "Choose a menu, a grid, a list or a table.")
    alerts = alerts or {}
    if set(alerts) - set(ALERTS):
        raise service.ItemError("bad_alert", "Choose low stock or sold out.")
    name = _clean_name(section_name, "section name") if section_name is not None else None
    name_ar = _clean_name(section_name_ar, "Arabic name") if section_name_ar is not None else None
    await conn.execute(
        "insert into shop_settings (new_item_rule, section_name, section_name_ar, layout_style) "
        "values (coalesce($1::text, 'switch'), coalesce($2::text, ''), coalesce($3::text, ''), "
        "coalesce($4::text, '')) "
        "on conflict (tenant_id) do update set "
        "new_item_rule = coalesce($1::text, shop_settings.new_item_rule), "
        "section_name = coalesce($2::text, shop_settings.section_name), "
        "section_name_ar = coalesce($3::text, shop_settings.section_name_ar), "
        "layout_style = coalesce($4::text, shop_settings.layout_style)",
        new_item_rule, name, name_ar, layout_style,
    )
    if sold_out is not None:
        await features.set_feature(
            conn, actor, "sold_out_display", config={"mode": sold_out}, record=False
        )
    for kind in ("low_stock", "sold_out"):
        if kind in alerts:
            await features.set_feature(
                conn, actor, f"{kind}_alerts", enabled=bool(alerts[kind]), record=False
            )
    return await hints(conn)


async def draft_rule(conn: asyncpg.Connection) -> str:
    """How a draft made from a photo runs out: the way the shop's new items do. A number each
    day needs its number first, so a draft starts as on or off in that case."""
    feats = await features.load(conn)
    rule = feats.new_item_rule((await _shop_values(conn))["new_item_rule"])
    return rule if rule in ("switch", "count", "always") else "switch"


async def alert_on(conn: asyncpg.Connection, kind: str) -> bool:
    """Is this alert ("low_stock" or "sold_out") on for the shop?"""
    if kind not in ALERTS:
        raise ValueError(kind)
    return (await features.load(conn)).on(f"{kind}_alerts")


async def apply(
    conn: asyncpg.Connection, template: shop_templates.ShopTemplate, clock: ShopClock,
    samples_too: bool = True, by: str = "ALYR",
) -> int:
    """Give a new shop its template: the starting values, the features, the categories and the
    sample items. Returns how many samples. Called once, by onboarding (and by the back office
    when it makes a business), and only while the Catalog is switched on for new shops. The demo
    shops (ALY-110) start the same way but sell real items, so they leave the samples out
    (`samples_too=False`)."""
    setup = template.setup
    # A shop on the template for its own business type needs no key of its own.
    own_key = "" if template.key == await business_type(conn) else template.key
    await conn.execute(
        "insert into shop_settings (low_stock_at, new_item_rule, template_key) "
        "values ($1, $2, $3) "
        "on conflict (tenant_id) do update set low_stock_at = $1, new_item_rule = $2, "
        "template_key = $3",
        setup.low_stock_at, setup.rule, own_key,
    )
    await features.seed(conn, template, by)
    await service.save_categories(
        conn, [{"name": name, "name_ar": ar} for name, ar in setup.categories]
    )
    return await samples.add(conn, setup, clock) if samples_too else 0

