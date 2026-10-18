"""Sample items: believable examples a business type starts with (D-039, ALY-107).

A new shop's Catalog is not empty on its first day: its type gives it a few examples, so the
owner sees what a menu or a price list looks like and edits it instead of starting from a
blank form. They are safe by construction:

* They are **marked**: `items.is_sample`. The owner's list shows "Sample" on each.
* They are **never for sale**. The database refuses a sample that is not a draft
  (`items_sample_is_draft`), so a sample cannot reach the order page, the chat or a report,
  whatever the code does. Their prices are examples and the screens say so.
* They have **no photo**. The screens draw a tile from `sample_key`; nothing is stored,
  downloaded or copyrighted.
* They are **the owner's to take or leave**. Saving a sample in the edit sheet makes it the
  owner's own (the mark goes, it stays a draft until they put it on sale), and "Remove all
  samples" deletes every one that is still a sample, in one step. Nothing else may change
  a sample: its switch, its status, its stock and a bulk action are refused (`sample_item`,
  `service.refuse_sample`), and the WhatsApp staff commands do not see samples at all.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.team import Actor
from alyr.modules.items import service
from alyr.modules.items.clock import ShopClock
from alyr.presets_catalog import CatalogSetup, Sample

# Who the record says made the samples, so the owner can tell them from their own work.
SYSTEM = Actor(None, "ALYR")

def _data(setup: CatalogSetup, sample: Sample, sort: int) -> dict:
    """A sample as `service.create_item` takes it. It is always a draft."""
    rule = sample.rule or setup.rule
    data: dict = {
        "name": sample.name, "name_ar": sample.name_ar, "category": sample.category,
        "price": sample.price, "unit": sample.unit, "stock_rule": rule, "status": "draft",
        "tags": list(sample.tags), "min_order": sample.min_order, "pack_size": sample.pack_size,
        "sort": sort,
    }
    if sample.variants:
        data["variants"] = [
            {"name": name, "name_ar": name_ar, "price_delta": delta,
             "daily_limit": limit if rule == "daily_limit" else None}
            for name, name_ar, delta, limit in sample.variants
        ]
    elif rule == "daily_limit":
        data["daily_limit"] = sample.daily_limit
    if sample.choices:
        data["option_groups"] = [
            {"name": c.name, "name_ar": c.name_ar, "required": c.required,
             "max_choices": c.max_choices,
             "options": [{"name": n, "name_ar": a, "price_delta": p} for n, a, p in c.options]}
            for c in sample.choices
        ]
    if sample.lead_days is not None:
        data["schedule"] = [
            {"weekdays": list(range(7)), "lead_days": sample.lead_days, "cutoff": sample.cutoff}
        ]
    return data


async def add(conn: asyncpg.Connection, setup: CatalogSetup, clock: ShopClock) -> int:
    """Give the shop the type's sample items. Returns how many."""
    for sort, sample in enumerate(setup.samples):
        made = await service.create_item(conn, _data(setup, sample, sort), SYSTEM, clock)
        await conn.execute(
            "update items set is_sample = true, sample_key = $2 where id = $1",
            UUID(made["item"]["id"]), sample.key,
        )
    return len(setup.samples)


async def count(conn: asyncpg.Connection) -> int:
    return await conn.fetchval("select count(*) from items where is_sample")


async def remove_all(conn: asyncpg.Connection, actor: Actor) -> int:
    """Delete every item that is still a sample, in one statement. Returns how many.
    Items the owner has made their own are not touched."""
    gone = await conn.fetch("delete from items where is_sample returning id, name")
    for row in gone:
        await team.record(
            conn, "item", row["id"], "deleted", actor, None,
            {"name": row["name"], "sample": True},
        )
    return len(gone)
