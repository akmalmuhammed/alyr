"""Photo-first adding (D-039, ALY-104): an owner chooses or takes several photos, the page
uploads them (`core/media.py`), and this makes one draft item for each, with the photo as
its cover. The owner then walks through the drafts filling in names and prices.

A draft has no name and no price yet and is never for sale. Each photo is handled on its
own, so one that cannot be used (it is already on an item, or the shop reached its item
limit) does not stop the rest, and a request sent twice makes no second draft.

Every function takes a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.core.images import PhotoRefused
from alyr.core.media import MediaService
from alyr.core.team import Actor
from alyr.modules.items import photos, service, template
from alyr.modules.items.clock import ShopClock

MAX_PER_REQUEST = 50


async def create(
    conn: asyncpg.Connection, media: MediaService, photo_ids: list[UUID], actor: Actor,
    clock: ShopClock,
) -> dict:
    """One draft per photo, in the order given. Returns the drafts made (`created`), the
    photos left out and why (`skipped`: `already_on_item` or `not_found`), and `stopped`
    when the shop's item limit ended the batch (the drafts made so far are kept)."""
    created: list[dict] = []
    skipped: list[dict] = []
    stopped: dict | None = None
    seen: set[UUID] = set()
    # A draft runs out the way the shop's new items do (a grocery's are counted), so the owner
    # does not change it on every one.
    rule = await template.draft_rule(conn)
    for asset_id in photo_ids[:MAX_PER_REQUEST]:
        if asset_id in seen:
            continue
        seen.add(asset_id)
        used = await conn.fetchval(
            "select l.owner_id from media_links l join items i on i.id = l.owner_id "
            "where l.asset_id = $1 and l.owner_kind = 'item' and i.status <> 'archived' "
            "limit 1", asset_id,
        )
        if used is not None:
            skipped.append(
                {"photo_id": str(asset_id), "reason": "already_on_item", "item_id": str(used)}
            )
            continue
        try:
            await media.assert_can_add_item(conn)
        except PhotoRefused as refusal:
            stopped = {"code": refusal.code, "detail": refusal.en, "message_ar": refusal.ar}
            break
        try:
            async with conn.transaction():  # a savepoint: a bad photo leaves no empty draft
                made = await service.create_item(
                    conn, {"status": "draft", "name": "", "price": 0, "stock_rule": rule},
                    actor, clock,
                )
                item_id = UUID(made["item"]["id"])
                await media.attach(conn, asset_id, photos.ITEM, item_id)
        except PhotoRefused:
            skipped.append({"photo_id": str(asset_id), "reason": "not_found", "item_id": None})
            continue
        created.append(made["item"])
    await photos.add_to_views(conn, media, created)
    return {"created": created, "skipped": skipped, "stopped": stopped}
