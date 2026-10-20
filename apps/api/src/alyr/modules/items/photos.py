"""Photos on items and on their variants (D-039, ALY-103's follow-up, used by ALY-104).

The photo library and the stored files are `core/media.py`; this module says which photo
belongs to which item. An item has up to eight photos in an order, and the first is its
cover. A variant (a colour, say) has at most one. The link is a row in `media_links`
(owner kind `item` or `variant`), written in the same transaction as the activity record
that says who did it, so a photo is either on the item with a record, or not on it.

Every item the API returns carries `photos` (all of them, in order, each with a `state`:
`ready`, `pending` while it is still being written to the photo store, or `failed`) and
`cover`, which is the first photo's state, or `missing` for an item with no photo. The
screens draw a placeholder tile for anything that is not `ready`, so nothing looks broken
and no page waits for the store.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.media import MediaService
from alyr.core.team import Actor

ITEM = "item"
VARIANT = "variant"

MISSING = {
    "state": "missing", "id": None, "width": None, "height": None, "urls": None, "srcset": "",
}


def cover_of(shown: list[dict]) -> dict:
    """The cover an item is drawn with: its first photo as it stands now, or `missing`."""
    if not shown:
        return dict(MISSING)
    first = shown[0]
    return {
        "state": first["state"], "id": first["id"], "width": first["width"],
        "height": first["height"], "urls": first["urls"], "srcset": first["srcset"],
    }


def _photo(shown: dict, position: int) -> dict:
    return {**shown, "position": position}


async def add_to_views(conn: asyncpg.Connection, media: MediaService, views: list[dict]) -> None:
    """Put `photos`, `cover` and each variant's `photo` on item views, in two queries."""
    if not views:
        return
    item_ids = [UUID(v["id"]) for v in views]
    variant_ids = [UUID(variant["id"]) for v in views for variant in v["variants"]]
    by_item = await media.photos_for(conn, ITEM, item_ids)
    by_variant = await media.photos_for(conn, VARIANT, variant_ids) if variant_ids else {}
    for view in views:
        shown = [_photo(p, n) for n, p in enumerate(by_item[UUID(view["id"])])]
        view["photos"] = shown
        view["cover"] = cover_of(shown)
        # The slot on the item row stays empty; the cover is worked out from the links.
        view["photo_id"] = shown[0]["id"] if shown else None
        for variant in view["variants"]:
            mine = by_variant.get(UUID(variant["id"]), [])
            variant["photo"] = cover_of(mine)
            variant["photo_id"] = mine[0]["id"] if mine else None


async def _owner(
    conn: asyncpg.Connection, item_id: UUID, variant_id: UUID | None
) -> tuple[str, UUID]:
    """Who the photo is for: the item, or one of its variants. LookupError if neither
    belongs to this shop (row-level security hides every other shop's)."""
    if not await conn.fetchval("select true from items where id = $1", item_id):
        raise LookupError("item not found")
    if variant_id is None:
        return ITEM, item_id
    if not await conn.fetchval(
        "select true from item_variants where id = $1 and item_id = $2", variant_id, item_id
    ):
        raise LookupError("variant not found")
    return VARIANT, variant_id


async def listed(
    conn: asyncpg.Connection, media: MediaService, item_id: UUID, variant_id: UUID | None = None
) -> list[dict]:
    kind, owner_id = await _owner(conn, item_id, variant_id)
    found = (await media.photos_for(conn, kind, [owner_id]))[owner_id]
    return [_photo(p, n) for n, p in enumerate(found)]


async def attach(
    conn: asyncpg.Connection, media: MediaService, item_id: UUID, asset_id: UUID,
    actor: Actor, variant_id: UUID | None = None,
) -> list[dict]:
    """Put a photo from the shop's library on an item, last in its order (or, with
    `variant_id`, on that variant, replacing the one it had). Raises `PhotoRefused` when
    the item already has eight, or the photo is not the shop's."""
    kind, owner_id = await _owner(conn, item_id, variant_id)
    if kind == VARIANT:
        # One photo per variant: the new one replaces the old.
        for shown in (await media.photos_for(conn, VARIANT, [owner_id]))[owner_id]:
            if shown["id"] != str(asset_id):
                await media.detach(conn, UUID(shown["id"]), VARIANT, owner_id)
    position = await media.attach(conn, asset_id, kind, owner_id)
    await team.record(
        conn, ITEM, item_id, "photo_added", actor, None,
        {"position": position + 1, "variant": str(variant_id) if variant_id else None},
    )
    await conn.execute("update items set updated_at = now() where id = $1", item_id)
    return await listed(conn, media, item_id, variant_id)


async def detach(
    conn: asyncpg.Connection, media: MediaService, item_id: UUID, asset_id: UUID,
    actor: Actor, variant_id: UUID | None = None,
) -> list[dict]:
    """Take a photo off an item. It stays in the shop's library, so it can go on another
    item or come back. The photos after it move up, and the next one becomes the cover."""
    kind, owner_id = await _owner(conn, item_id, variant_id)
    if await media.detach(conn, asset_id, kind, owner_id):
        remaining = await media.photos_for(conn, kind, [owner_id])
        ids = [UUID(p["id"]) for p in remaining[owner_id]]
        if ids:
            await media.reorder(conn, kind, owner_id, ids)  # closes the gap, keeps the order
        await team.record(
            conn, ITEM, item_id, "photo_removed", actor, None,
            {"variant": str(variant_id) if variant_id else None},
        )
        await conn.execute("update items set updated_at = now() where id = $1", item_id)
    return await listed(conn, media, item_id, variant_id)


async def reorder(
    conn: asyncpg.Connection, media: MediaService, item_id: UUID, order: list[UUID],
    actor: Actor,
) -> list[dict]:
    """Set the order of an item's photos; the first is the cover. `order` must name every
    photo the item has."""
    await _owner(conn, item_id, None)
    before = [p["id"] for p in await listed(conn, media, item_id)]
    await media.reorder(conn, ITEM, item_id, order)
    after = [str(a) for a in order]
    if before != after:
        cover_changed = bool(before and after and before[0] != after[0])
        await team.record(
            conn, ITEM, item_id, "cover_changed" if cover_changed else "photos_reordered",
            actor, None, {"photos": len(after)},
        )
        await conn.execute("update items set updated_at = now() where id = $1", item_id)
    return await listed(conn, media, item_id)


async def make_cover(
    conn: asyncpg.Connection, media: MediaService, item_id: UUID, asset_id: UUID, actor: Actor
) -> list[dict]:
    """Move one of the item's photos to the front, keeping the others in their order."""
    current = [UUID(p["id"]) for p in await listed(conn, media, item_id)]
    if asset_id not in current:
        raise LookupError("photo not on this item")
    return await reorder(
        conn, media, item_id, [asset_id, *[a for a in current if a != asset_id]], actor
    )
