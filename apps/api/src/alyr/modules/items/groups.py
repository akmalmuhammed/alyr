"""Customer price groups (wholesale) and the prices they pay (ALY-127, D-039).

A shop has price groups (Retail, Wholesale, Staff...) and exactly one of them is its default.
A customer is in one group, or in none, which means the default. An item, or one of its
sizes and colours, can have a price for a group; where a group has no price the customer pays
the item's normal price, so a shop prices only what differs. The default group *is* the
normal price: it has no price rows of its own.

Group prices keep a history like the normal price does. A group taken away is archived, not
deleted, and its customers go back to the default group. An order keeps a copy of the
group's name it was charged under (`orders.price_group_name`), and the price charged is on
its lines, so changing a group or a price never rewrites an old order.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.normalise import fmt_qar
from alyr.core.team import Actor
from alyr.modules.items import changes
from alyr.modules.items.service import ItemError

# The group every shop starts with, and the only one that cannot be removed.
DEFAULT_NAME = ("Retail", "التجزئة")
MAX_GROUPS = 20
MAX_PRICE = 100_000_000


def _name(value: str | None) -> str:
    return " ".join((value or "").split())


def public(group: dict) -> dict:
    """A group as a customer's page and the workspace see it: no counts, no dates."""
    return {
        "id": str(group["id"]), "name": group["name"], "name_ar": group["name_ar"],
        "is_default": group["is_default"],
    }


def _view(row: asyncpg.Record, customers: int | None = None) -> dict:
    out = public(row)
    out["sort"] = row["sort"]
    if customers is not None:
        out["customers"] = customers
    return out


# ------------------------------------------------------------------------ groups

async def default_group(conn: asyncpg.Connection) -> dict:
    """The shop's default group. A shop that does not have one yet (one made after the
    migration that gave every shop its own) gets it here, so there is always one."""
    row = await conn.fetchrow("select * from price_groups where is_default")
    if row is None:
        row = await conn.fetchrow(
            "insert into price_groups (name, name_ar, is_default) values ($1, $2, true) "
            # No target: two requests that make it together also collide on the name's
            # index, which a target of `is_default` alone turns into an error (seen once in
            # `test_saving_an_item_while_a_customer_orders_it_does_not_deadlock`).
            "on conflict do nothing returning *",
            *DEFAULT_NAME,
        )
    if row is None:  # another request made it between our two statements
        row = await conn.fetchrow("select * from price_groups where is_default")
    return dict(row)


async def effective(conn: asyncpg.Connection, group_id: UUID | None) -> dict:
    """The group whose prices a customer pays: their own, or the default when they have none
    (or their group has been archived)."""
    if group_id is not None:
        row = await conn.fetchrow(
            "select * from price_groups where id = $1 and archived_at is null", group_id
        )
        if row is not None:
            return dict(row)
    return await default_group(conn)


async def group_of(conn: asyncpg.Connection, contact_id: UUID | None) -> dict:
    """The group a customer pays by. Without a customer (or one we do not know), the default."""
    group_id = None
    if contact_id is not None:
        group_id = await conn.fetchval(
            "select price_group_id from contacts where id = $1", contact_id
        )
    return await effective(conn, group_id)


def pricing_id(group: dict) -> UUID | None:
    """What the price lookups take: the group's id, or None for the default group, whose
    prices are the normal prices."""
    return None if group["is_default"] else group["id"]


async def list_groups(conn: asyncpg.Connection) -> list[dict]:
    """The shop's groups, default first, each with the number of customers in it."""
    await default_group(conn)
    rows = await conn.fetch(
        "select g.*, (select count(*) from contacts c where c.role = 'customer' and "
        "  (c.price_group_id = g.id or (g.is_default and c.price_group_id is null)))::int "
        "  as customers "
        "from price_groups g where g.archived_at is null "
        "order by g.is_default desc, g.sort, g.created_at"
    )
    return [_view(r, r["customers"]) for r in rows]


def _clean(name: str | None, name_ar: str | None) -> tuple[str, str]:
    """Both names are always filled: a group named in one language uses it for both."""
    name, name_ar = _name(name), _name(name_ar)
    if not name and not name_ar:
        raise ItemError("price_group_name_needed", "Give the group a name.")
    if len(name) > 60 or len(name_ar) > 60:
        raise ItemError("price_group_name_long", "A group's name can be up to 60 characters.")
    return name or name_ar, name_ar or name


async def create_group(
    conn: asyncpg.Connection, name: str, name_ar: str, actor: Actor | None = None
) -> dict:
    """Add a group. With an `actor`, the change is on the activity record."""
    name, name_ar = _clean(name, name_ar)
    await default_group(conn)
    if await conn.fetchval("select count(*) from price_groups where archived_at is null") >= (
        MAX_GROUPS
    ):
        raise ItemError("too_many_groups", f"A shop can have up to {MAX_GROUPS} price groups.")
    try:
        row = await conn.fetchrow(
            "insert into price_groups (name, name_ar, sort) values ($1, $2, "
            "(select coalesce(max(sort), 0) + 1 from price_groups)) returning *",
            name, name_ar,
        )
    except asyncpg.UniqueViolationError as error:
        raise ItemError("price_group_name_taken", "Another group already has that name.") from error
    if actor is not None:
        await changes.group_changed(conn, actor, "group_added", public(row))
    return _view(row, 0)


async def rename_group(
    conn: asyncpg.Connection, group_id: UUID, name: str, name_ar: str,
    actor: Actor | None = None,
) -> dict | None:
    """Change a group's names (the default group too). None if there is no such group. With
    an `actor`, the change is on the activity record."""
    name, name_ar = _clean(name, name_ar)
    was = await conn.fetchrow(
        "select name, name_ar from price_groups where id = $1 and archived_at is null",
        group_id,
    )
    try:
        row = await conn.fetchrow(
            "update price_groups set name = $2, name_ar = $3 "
            "where id = $1 and archived_at is null returning *",
            group_id, name, name_ar,
        )
    except asyncpg.UniqueViolationError as error:
        raise ItemError("price_group_name_taken", "Another group already has that name.") from error
    if row and was and actor is not None and (
        (was["name"], was["name_ar"]) != (row["name"], row["name_ar"])
    ):
        await changes.group_changed(conn, actor, "group_renamed", public(row), was=was["name"])
    return _view(row) if row else None


async def archive_group(conn: asyncpg.Connection, group_id: UUID, actor: Actor) -> dict | None:
    """Take a group away. Its customers go back to the default group, which is on their
    record; its prices and their history stay, unused. The default group cannot go.
    Returns how many customers moved, or None if there is no such group."""
    row = await conn.fetchrow(
        "select * from price_groups where id = $1 and archived_at is null for update", group_id
    )
    if row is None:
        return None
    if row["is_default"]:
        raise ItemError(
            "default_group", "The default group cannot be removed. Rename it instead."
        )
    await conn.execute("update price_groups set archived_at = now() where id = $1", group_id)
    fallback = await default_group(conn)
    moved = await conn.fetch(
        "update contacts set price_group_id = null where price_group_id = $1 returning id",
        group_id,
    )
    for contact in moved:
        await _record(conn, contact["id"], actor, row, fallback)
    await changes.group_changed(conn, actor, "group_removed", public(row))
    return {"moved": len(moved), "group": public(row)}


async def _record(
    conn: asyncpg.Connection, contact_id: UUID, actor: Actor, before: dict, after: dict
) -> None:
    await team.record(
        conn, "conversation", contact_id, "price_group", actor, contact_id,
        {"from": before["name"], "to": after["name"]},
    )


async def set_customer_group(
    conn: asyncpg.Connection, contact_id: UUID, group_id: UUID | None, actor: Actor
) -> dict | None:
    """Put a customer in a group (None: the default group). The group decides the prices on
    the order page, in the cart check, in the order and on its payment link from now on;
    orders already placed keep what they were charged. Returns the group, or None if there
    is no such customer."""
    contact = await conn.fetchrow(
        "select id, price_group_id from contacts where id = $1 and role = 'customer' for update",
        contact_id,
    )
    if contact is None:
        return None
    if group_id is not None:
        target = await conn.fetchrow(
            "select * from price_groups where id = $1 and archived_at is null", group_id
        )
        if target is None:
            raise ItemError("unknown_group", "That price group is not there.")
        target = dict(target)
    else:
        target = await default_group(conn)
    before = await effective(conn, contact["price_group_id"])
    stored = None if target["is_default"] else target["id"]
    if stored != contact["price_group_id"]:
        await conn.execute(
            "update contacts set price_group_id = $2 where id = $1", contact_id, stored
        )
        if before["id"] != target["id"]:
            await _record(conn, contact_id, actor, before, target)
    return public(target)


# ------------------------------------------------------------- prices of one item

async def prices_of(conn: asyncpg.Connection, item_id: UUID) -> list[dict]:
    """Every group price the item has (groups that are still in use), as the edit sheet
    lists them."""
    rows = await conn.fetch(
        "select p.group_id, p.variant_id, p.price from item_group_prices p "
        "join price_groups g on g.id = p.group_id and g.archived_at is null "
        "where p.item_id = $1 order by g.sort, g.created_at, p.variant_id nulls first",
        item_id,
    )
    return [price_view(r["group_id"], r["variant_id"], r["price"]) for r in rows]


def price_view(group_id: UUID, variant_id: UUID | None, price: int) -> dict:
    return {
        "group_id": str(group_id), "variant_id": str(variant_id) if variant_id else None,
        "price": price, "price_text": fmt_qar(price),
    }


async def save_prices(
    conn: asyncpg.Connection, item_id: UUID, rows: list[dict], actor: Actor, reason: str = "",
) -> list[dict]:
    """Set, change or remove group prices for an item. Each row is `group_id`, `variant_id`
    (None for the item's own price) and `price` (None removes it, and the group pays the
    normal price again). Rows not mentioned are left alone. A price must be above zero, and
    an item's price plus a size's difference must stay above zero. Every change is added to
    the group price history. Returns the item's prices as they now are.

    Raises ItemError for a default or archived or unknown group, a size that is not on the
    item, or a price that makes no sense; nothing is changed then (the caller's transaction
    rolls back)."""
    item = await conn.fetchrow("select id from items where id = $1", item_id)
    if item is None:
        raise LookupError("no such item")
    variants = {
        v["id"]: v for v in await conn.fetch(
            "select id, price_delta, active from item_variants where item_id = $1", item_id
        )
    }
    groups = {
        g["id"]: g for g in await conn.fetch(
            "select * from price_groups where archived_at is null"
        )
    }
    current = {
        (r["group_id"], r["variant_id"]): r["price"] for r in await conn.fetch(
            "select group_id, variant_id, price from item_group_prices where item_id = $1",
            item_id,
        )
    }
    seen: set = set()
    changed = []
    for row in rows:
        group_id = UUID(str(row["group_id"]))
        variant_id = UUID(str(row["variant_id"])) if row.get("variant_id") else None
        price = row.get("price")
        group = groups.get(group_id)
        if group is None:
            raise ItemError("unknown_group", "That price group is not there.")
        if group["is_default"]:
            raise ItemError(
                "default_group_price",
                f"“{group['name']}” is the default group: it pays the normal price.",
            )
        if variant_id is not None and variant_id not in variants:
            raise ItemError("unknown_variant", "One of the choices is not on this item.")
        if (group_id, variant_id) in seen:
            raise ItemError("repeated_price", "A group has two prices for the same thing.")
        seen.add((group_id, variant_id))
        if price is not None:
            if not 0 < price <= MAX_PRICE:
                raise ItemError("bad_group_price", "A group price must be more than zero.")
            # The group's price for the item plus a size's difference is what a size costs.
            if variant_id is None and any(
                price + v["price_delta"] <= 0 for v in variants.values() if v["active"]
            ):
                raise ItemError(
                    "bad_group_price", "A price difference cannot bring a price to zero."
                )
        if current.get((group_id, variant_id)) == price:
            continue
        changed.append((group, group_id, variant_id, price))
    for _group, group_id, variant_id, price in changed:
        if price is None:
            await conn.execute(
                "delete from item_group_prices where group_id = $1 and item_id = $2 and "
                "variant_id is not distinct from $3",
                group_id, item_id, variant_id,
            )
        elif variant_id is None:
            await conn.execute(
                "insert into item_group_prices (group_id, item_id, price) values ($1, $2, $3) "
                "on conflict (group_id, item_id) where variant_id is null "
                "do update set price = excluded.price, updated_at = now()",
                group_id, item_id, price,
            )
        else:
            await conn.execute(
                "insert into item_group_prices (group_id, item_id, variant_id, price) "
                "values ($1, $2, $3, $4) "
                "on conflict (group_id, variant_id) where variant_id is not null "
                "do update set price = excluded.price, updated_at = now()",
                group_id, item_id, variant_id, price,
            )
        await conn.execute(
            "insert into item_group_price_history (group_id, item_id, variant_id, price, "
            "changed_by, changed_by_name, reason) values ($1, $2, $3, $4, $5, $6, $7)",
            group_id, item_id, variant_id, price, actor.id, actor.name, reason,
        )
    if changed:
        await conn.execute("update items set updated_at = now() where id = $1", item_id)
        await team.record(
            conn, "item", item_id, "group_prices", actor, None,
            {"groups": ", ".join(dict.fromkeys(g["name"] for g, *_ in changed))},
        )
    return await prices_of(conn, item_id)


async def price_history(conn: asyncpg.Connection, item_id: UUID) -> list[dict]:
    """Every change to the item's group prices, newest first."""
    rows = await conn.fetch(
        "select h.group_id, g.name as group_name, g.name_ar as group_name_ar, h.variant_id, "
        "v.name as variant_name, v.name_ar as variant_name_ar, h.price, h.changed_by, "
        "h.changed_by_name, h.reason, h.created_at "
        "from item_group_price_history h join price_groups g on g.id = h.group_id "
        "left join item_variants v on v.id = h.variant_id "
        "where h.item_id = $1 order by h.created_at desc, h.id",
        item_id,
    )
    return [
        {
            "group": {"id": str(r["group_id"]), "name": r["group_name"],
                      "name_ar": r["group_name_ar"]},
            "variant": {"id": str(r["variant_id"]), "name": r["variant_name"],
                        "name_ar": r["variant_name_ar"]} if r["variant_id"] else None,
            "price": r["price"], "price_text": fmt_qar(r["price"]) if r["price"] else None,
            "reason": r["reason"],
            "changed_by": {"id": str(r["changed_by"]) if r["changed_by"] else None,
                           "name": r["changed_by_name"]},
            "at": r["created_at"].isoformat(),
        }
        for r in rows
    ]
