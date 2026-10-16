"""The workspace shell: which products a shop has, what its navigation shows, what is
left to set up, and the numbers on its home dashboard. Everything here is driven by
`alyr.catalog`; nothing names a particular product.

Every function takes a tenant-scoped connection unless it says otherwise.
"""

from uuid import UUID

import asyncpg

from alyr import catalog
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


def _screen(screen: catalog.Screen) -> dict:
    return {"key": screen.key, "label": _text(screen.label), "icon": screen.icon}


async def state(conn: asyncpg.Connection, staff: Staff) -> dict:
    """Everything the workspace shell needs to draw itself for this person."""
    modules = await enabled_modules(conn)
    connected = await _connections(conn)
    shop = await conn.fetchrow(
        "select name, name_ar, slug from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    open_requests = await conn.fetch(
        "select product_key, step_key from setup_requests where status = 'open'"
    )
    asked = {(r["product_key"], r["step_key"]) for r in open_requests}

    products = []
    for product in catalog.PRODUCTS:
        active = bool(set(product.modules) & modules)
        steps = []
        if active:
            for key in product.modules:
                if key not in modules:
                    continue
                for step in await _steps(conn, catalog.MODULE_BY_KEY[key], connected):
                    step["asked"] = (product.key, step["key"]) in asked
                    steps.append(step)
        products.append(
            {
                "key": product.key,
                "name": _text(product.name),
                "summary": _text(product.summary),
                "status": "active" if active else product.status,
                "modules": list(product.modules),
                "steps": steps,
            }
        )

    nav_products = [
        _screen(screen)
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
            "account": [_screen(s) for s in catalog.ACCOUNT_SCREENS if _visible(s, staff.role)],
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
    """Switch a product's modules off, except any module another active product still
    uses. Nothing is deleted."""
    _can_manage(staff)
    product = catalog.PRODUCT_BY_KEY.get(key)
    if product is None:
        raise LookupError("no such product")
    modules = await enabled_modules(conn)
    still_needed = {
        module
        for other in catalog.PRODUCTS
        if other.key != key and other.modules and set(other.modules) <= modules
        for module in other.modules
    }
    off = [m for m in product.modules if m not in still_needed]
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
