"""The workspace shell: which products a shop has, what its navigation shows, what is
left to set up, and the numbers on its home dashboard. Everything here is driven by
`alyr.catalog`; nothing names a particular product.

Every function takes a tenant-scoped connection unless it says otherwise.
"""

from uuid import UUID

import asyncpg

from alyr import catalog, presets_catalog
from alyr.core import pricing
from alyr.core.auth import Staff
from alyr.core.normalise import fmt_qar
from alyr.db import Database


class WorkspaceError(Exception):
    """A request the workspace cannot carry out; the message is safe to show."""


def _text(value: catalog.Text) -> dict:
    return {"en": value.en, "ar": value.ar}


async def enabled_modules(conn: asyncpg.Connection) -> set[str]:
    rows = await conn.fetch("select module_key from tenant_modules where enabled")
    return {r["module_key"] for r in rows}


async def module_enabled(db: Database, tenant_id: UUID, module: str) -> bool:
    """For code outside a request's own transaction: is this module on for this shop?"""
    async with db.tenant(tenant_id) as conn:
        return bool(
            await conn.fetchval("select enabled from tenant_modules where module_key = $1", module)
        )


async def _connections(conn: asyncpg.Connection) -> dict[str, bool]:
    state = {}
    for connection in catalog.CONNECTIONS:
        state[connection.key] = (
            bool(await conn.fetchval(f"select {connection.connected}"))
            if connection.connected
            else False
        )
    return state


async def _steps(conn: asyncpg.Connection, module: catalog.Module, connected: dict) -> list[dict]:
    steps = []
    for step in module.steps:
        if step.connection:
            done = connected.get(step.connection, False)
        else:
            done = bool(await conn.fetchval(f"select {step.done}"))
        steps.append(
            {
                "key": step.key,
                "label": _text(step.label),
                "done": done,
                "screen": step.screen,
                "connection": step.connection,
            }
        )
    return steps


def _visible(screen: catalog.Screen, role: str) -> bool:
    return role in screen.roles


def _screen(screen: catalog.Screen, label: catalog.Text | None = None) -> dict:
    return {"key": screen.key, "label": _text(label or screen.label), "icon": screen.icon}


# The screen that lists ALYR's own suite is "Products". A shop whose items are "Products"
# too (a shop, a grocery, a salon) would have two entries of that name side by side, so there
# the suite's is "ALYR products" (D-039: the two are kept apart). Nothing else changes.
SUITE_SCREEN = "products"
SUITE_LABEL = catalog.Text("ALYR products", "منتجات ALYR")


def _same_name(screen: catalog.Screen, section: catalog.Text | None) -> bool:
    return (
        section is not None and screen.key == SUITE_SCREEN
        and section.en == screen.label.en
    )


async def _section(conn: asyncpg.Connection) -> catalog.Text:
    """What this shop calls its Catalog ("Menu", "Products", "Price list"), by its type."""
    kind = await conn.fetchval(
        "select business_type from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    return presets_catalog.setup_for(kind or "").section


def _catalog_step(step: dict, section: catalog.Text) -> dict:
    """The orders module asks the shop to add its menu or price list. Where the Catalog is
    on, that is done in the Catalog, under the name the shop's type gives it."""
    return step | {
        "label": {"en": f"Add your {section.en.lower()}", "ar": f"أضف {section.ar}"},
        "screen": "catalog",
    }


async def state(conn: asyncpg.Connection, staff: Staff) -> dict:
    """Everything the workspace shell needs to draw itself for this person."""
    modules = await enabled_modules(conn)
    section = await _section(conn) if "catalog" in modules else None
    connected = await _connections(conn)
    shop = await conn.fetchrow(
        "select name, name_ar, slug from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    # Step keys are unique across modules, so an ask counts whichever product it was
    # asked under (requests made before Bookings had its own product said "chat").
    asked = {
        r["step_key"]
        for r in await conn.fetch("select step_key from setup_requests where status = 'open'")
    }

    using = set(catalog.products_for(modules))
    listed: set[str] = set()
    products = []
    for product in catalog.PRODUCTS:
        active = product.key in using
        steps = []
        if active:
            for key in product.modules:
                # A shared module's steps show once, under the first product using it.
                if key not in modules or key in listed:
                    continue
                listed.add(key)
                for step in await _steps(conn, catalog.MODULE_BY_KEY[key], connected):
                    step["asked"] = step["key"] in asked
                    if section is not None and key == "orders" and step["key"] == "products":
                        step = _catalog_step(step, section)
                    steps.append(step)
        if product.status == "included":
            status = "included"
        else:
            status = "active" if active else product.status
        includes = (
            [{"key": m, "label": _text(catalog.MODULE_BY_KEY[m].name)} for m in product.modules]
            or [{"key": "", "label": _text(part)} for part in product.parts]
        )
        products.append(
            {
                "key": product.key,
                "name": _text(product.name),
                "descriptor": _text(product.descriptor),
                "summary": _text(product.summary),
                "status": status,
                "modules": list(product.modules),
                "includes": includes,
                "steps": steps,
            }
        )

    nav_products = [
        _screen(screen, section if screen.key == "catalog" else None)
        for module in catalog.MODULES
        if module.key in modules
        for screen in module.screens
        if _visible(screen, staff.role)
    ]
    # The owner's ALYR price, so home can say when one is waiting for their answer.
    plan = None
    if staff.role in catalog.MANAGERS:
        quote = await pricing.own_quote(conn)
        plan = {"status": quote["status"]}
        if quote["status"] != "preparing":
            plan |= {"monthly_total_text": quote["totals"]["monthly_total_text"],
                     "number": quote["number"]}
    return {
        "business": dict(shop),
        "plan": plan,
        "me": {"name": staff.name, "role": staff.role, "signed_in": staff.user_id is not None},
        "can_manage": staff.role in catalog.MANAGERS,
        "modules": sorted(modules),
        "nav": {
            "core": [_screen(s) for s in catalog.CORE_SCREENS if _visible(s, staff.role)],
            "products": nav_products,
            "account": [
                _screen(s, SUITE_LABEL if _same_name(s, section) else None)
                for s in catalog.ACCOUNT_SCREENS if _visible(s, staff.role)
            ],
        },
        "products": products,
        "connections": [
            {
                "key": c.key,
                "name": _text(c.name),
                "detail": _text(c.detail),
                "connected": connected[c.key],
                "available": bool(c.connected),
            }
            for c in catalog.CONNECTIONS
        ],
    }


async def home(conn: asyncpg.Connection) -> list[dict]:
    """The dashboard numbers, one card per number each switched-on module offers."""
    modules = await enabled_modules(conn)
    cards = []
    for module in catalog.MODULES:
        if module.key not in modules:
            continue
        for card in module.cards:
            value = int(await conn.fetchval(f"select {card.value}") or 0)
            cards.append(
                {
                    "key": card.key,
                    "module": module.key,
                    "label": _text(card.label),
                    "value": value,
                    "text": fmt_qar(value) if card.kind == "qar" else str(value),
                }
            )
    return cards


def _can_manage(staff: Staff) -> None:
    if staff.role not in catalog.MANAGERS:
        raise PermissionError("only an owner or admin can change products")


async def enable_product(conn: asyncpg.Connection, staff: Staff, key: str) -> list[str]:
    """Switch every module of a product on. Data from an earlier time is kept, so turning
    a product back on picks up where the shop left off."""
    _can_manage(staff)
    product = catalog.PRODUCT_BY_KEY.get(key)
    if product is None:
        raise LookupError("no such product")
    if product.status == "included":
        raise WorkspaceError(f"{product.name.en} is included for every business")
    if product.status != "available":
        raise WorkspaceError("this product is not available yet")
    for module in product.modules:
        await conn.execute(
            "insert into tenant_modules (module_key, enabled, enabled_at, enabled_by) "
            "values ($1, true, now(), $2) "
            "on conflict (tenant_id, module_key) do update set enabled = true, "
            "enabled_at = now(), enabled_by = excluded.enabled_by",
            module,
            staff.name,
        )
    return list(product.modules)


async def disable_product(conn: asyncpg.Connection, staff: Staff, key: str) -> list[str]:
    """Switch a product's modules off, except a shared module another product in use
    still needs (the inbox stays on for Bookings when Chat goes off). Nothing is
    deleted."""
    _can_manage(staff)
    product = catalog.PRODUCT_BY_KEY.get(key)
    if product is None:
        raise LookupError("no such product")
    if product.status == "included":
        raise WorkspaceError(f"{product.name.en} is included for every business")
    modules = await enabled_modules(conn)
    still_needed = {
        module
        for other in catalog.products_for(modules)
        if other != key
        for module in catalog.PRODUCT_BY_KEY[other].modules
    }
    off = [m for m in product.modules if m in modules and m not in still_needed]
    if off:
        await conn.execute(
            "update tenant_modules set enabled = false where module_key = any($1)", off
        )
    return off


async def ask_alyr(
    conn: asyncpg.Connection, staff: Staff, product_key: str, step_key: str, note: str
) -> str:
    """The shop asks ALYR to do a setup step for them. Asking twice does not duplicate."""
    if product_key not in catalog.PRODUCT_BY_KEY:
        raise LookupError("no such product")
    existing = await conn.fetchval(
        "select id from setup_requests where product_key = $1 and step_key = $2 "
        "and status = 'open'",
        product_key,
        step_key,
    )
    if existing:
        return str(existing)
    request_id = await conn.fetchval(
        "insert into setup_requests (product_key, step_key, note, requested_by) "
        "values ($1, $2, $3, $4) returning id",
        product_key,
        step_key,
        note.strip()[:500],
        staff.name,
    )
    return str(request_id)


async def requests(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(
        "select id, product_key, step_key, note, requested_by, status, created_at, done_at "
        "from setup_requests order by created_at desc limit 50"
    )
    return [
        {
            **dict(r),
            "id": str(r["id"]),
            "created_at": r["created_at"].isoformat(),
            "done_at": r["done_at"].isoformat() if r["done_at"] else None,
        }
        for r in rows
    ]
