"""A shop's product photos (D-039, ALY-103): upload, share, remove, count.

How a photo moves:

1. `upload` checks it and makes the three WebP sizes (`core/images.py`), then writes the
   shop's records and a queue of file writes in one transaction. A photo the shop already
   has is found by its hash and costs nothing; a new one counts against the shop's cap.
2. The job `media.sync` carries the queued writes and deletes out against the object store
   with retries. While the store is down a photo stays `pending` and every other part of
   the product keeps working: a photo that is not `ready` is shown as a placeholder tile.
3. Anything that shows items asks `photos_for` or `covers_for` and gets web addresses.

The catalog (ALY-102, ALY-104) calls `attach` and `detach` to say which item a photo
belongs to; nothing here knows what an item is. It also sets `item_counter`, so the meters
and the item cap read the real item table, and calls `assert_can_add_item` before it
creates an item.
"""

import asyncio
import hashlib
import io
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from uuid import UUID

import asyncpg
from PIL import Image

from alyr.config import Settings
from alyr.core import images, jobs
from alyr.core.images import PhotoRefused
from alyr.core.storage import PHOTO_KEY, Store, StoreError
from alyr.db import Database

log = logging.getLogger("alyr.media")

SYNC = "media.sync"
# With the retry delay capped at an hour (core/jobs.py) this is about two days of trying.
SYNC_ATTEMPTS = 48
MAX_PHOTOS_PER_OWNER = 8
# The web address names each size by the screen it is for: the closest size that is at
# least this many pixels on the long side, or the largest we have.
SLOTS = {"thumb": 320, "medium": 800, "large": 1600}
_OWNER_KIND = re.compile(r"[a-z][a-z_]{0,29}")

NO_PHOTO = {
    "id": None, "state": "none", "width": None, "height": None, "urls": None, "srcset": "",
}

ItemCounter = Callable[[asyncpg.Connection], Awaitable[int]]


async def count_products(conn: asyncpg.Connection) -> int:
    """The shop's items until the catalog registers its own counter: today's products.
    Returns 0 if that table has been renamed, rather than breaking uploads."""
    if await conn.fetchval("select to_regclass('public.products')") is None:
        return 0
    return await conn.fetchval("select count(*) from products where available")


# ── words the owner reads (English and Arabic; the Arabic awaits review, ALY-66) ───


def too_large(size: int, limit: int) -> PhotoRefused:
    mb, cap = f"{size / 1_048_576:.1f}", f"{limit / 1_048_576:.0f}"
    return PhotoRefused(
        "photo_too_large", f"This photo is {mb} MB; the limit is {cap} MB. Choose a smaller photo.",
        f"حجم هذه الصورة {mb} ميغابايت والحد الأقصى {cap} ميغابايت. اختر صورة أصغر.",
        status=413, limit_bytes=limit,
    )


def photo_cap(limit: int) -> PhotoRefused:
    return PhotoRefused(
        "photo_limit_reached",
        f"Your shop has reached its limit of {limit:,} photos. Nothing has been deleted. "
        "Remove photos you no longer use, or ask ALYR to raise the limit.",
        f"وصل متجرك إلى الحد الأقصى للصور ({limit:,}). لم يُحذف شيء. "
        "احذف الصور التي لم تعد تحتاجها، أو اطلب من ALYR رفع الحد.",
        status=409, limit=limit,
    )


def item_cap(limit: int) -> PhotoRefused:
    return PhotoRefused(
        "item_limit_reached",
        f"Your shop has reached its limit of {limit:,} items. Nothing has been deleted. "
        "Archive items you no longer sell, or ask ALYR to raise the limit.",
        f"وصل متجرك إلى الحد الأقصى للأصناف ({limit:,}). لم يُحذف شيء. "
        "أرشِف الأصناف التي لم تعد تبيعها، أو اطلب من ALYR رفع الحد.",
        status=409, limit=limit,
    )


def _removed() -> PhotoRefused:
    return PhotoRefused(
        "photo_removed",
        "This photo was removed under ALYR's listing policy and can't be uploaded again.",
        "أُزيلت هذه الصورة وفق سياسة الإدراج لدى ALYR ولا يمكن رفعها مرة أخرى.",
        status=409,
    )


def _busy() -> PhotoRefused:
    return PhotoRefused(
        "photo_busy", "This photo is still being saved. Try again in a moment.",
        "ما زالت الصورة قيد الحفظ. حاول مرة أخرى بعد قليل.", status=409,
    )


def _not_found() -> PhotoRefused:
    return PhotoRefused(
        "photo_not_found", "There is no such photo.", "لا توجد صورة بهذا الرقم.", status=404
    )


def _owner_full() -> PhotoRefused:
    return PhotoRefused(
        "photo_owner_full",
        f"An item can have up to {MAX_PHOTOS_PER_OWNER} photos.",
        f"يمكن أن يحتوي الصنف على {MAX_PHOTOS_PER_OWNER} صور كحد أقصى.",
        status=409, limit=MAX_PHOTOS_PER_OWNER,
    )


def _order_changed() -> PhotoRefused:
    return PhotoRefused(
        "photos_changed",
        "The photos on this item changed while you were looking. Reload and try again.",
        "تغيّرت صور هذا الصنف أثناء عرضك لها. أعد تحميل الصفحة وحاول مرة أخرى.",
        status=409,
    )


def _as_jpeg(data: bytes) -> bytes:
    """Decode a stored WebP and write it as a JPEG, on white where it was see-through."""
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.mode in ("RGBA", "LA", "P"):
            flat = Image.new("RGB", image.size, (255, 255, 255))
            flat.paste(image.convert("RGBA"), mask=image.convert("RGBA").split()[-1])
            image = flat
        else:
            image = image.convert("RGB")
        out = io.BytesIO()
        image.save(out, "JPEG", quality=85)
        return out.getvalue()


def parse_photo_ref(text: str) -> tuple[UUID, str] | None:
    """The shop and file hash a photo's web address (or stored name) points at."""
    found = PHOTO_KEY.search(text.strip())
    return (UUID(found["tenant"]), found["digest"]) if found else None


def pick(variants: list[dict], target: int) -> dict:
    """The smallest stored size that is at least `target` on its long side, else the largest."""
    for variant in variants:  # smallest first
        if max(variant["width"], variant["height"]) >= target:
            return variant
    return variants[-1]


@dataclass(frozen=True)
class Uploaded:
    photo: dict
    duplicate: bool


_ASSET = "id, state, width, height, variants, bytes_total, created_at"


class MediaService:
    def __init__(
        self, db: Database, store: Store, settings: Settings,
        item_counter: ItemCounter = count_products,
    ) -> None:
        self.db = db
        self.store = store
        self.settings = settings
        # The catalog replaces this with a count of its live items (ALY-102 follow-up).
        self.item_counter = item_counter
        # Decoding a photo takes memory: only a couple at a time.
        self._cpu = asyncio.Semaphore(2)

    def register(self, runner: jobs.JobRunner) -> None:
        runner.register(SYNC, self.sync, self.gave_up)

    # ── what a client is shown ────────────────────────────

    def view(self, row: asyncpg.Record | None) -> dict:
        """A photo as the API shows it. Anything not ready, or gone, is the placeholder
        state: the page draws a tile, and never a broken image."""
        if row is None or row["state"] == "removed":
            return dict(NO_PHOTO)
        shown = {
            "id": str(row["id"]), "state": row["state"], "width": row["width"],
            "height": row["height"], "urls": None, "srcset": "",
        }
        if row["state"] != "ready":
            return shown
        variants = row["variants"]
        shown["urls"] = {
            slot: self.store.url(pick(variants, target)["key"]) for slot, target in SLOTS.items()
        }
        shown["srcset"] = ", ".join(f"{self.store.url(v['key'])} {v['width']}w" for v in variants)
        return shown

    # ── upload ────────────────────────────────────────────

    async def upload(self, tenant_id: UUID, data: bytes, *, by: str = "") -> Uploaded:
        """Check a photo, store it and say what became of it. Raises `PhotoRefused`."""
        try:
            return await self._upload(tenant_id, data, by)
        except PhotoRefused:
            await self._count(tenant_id, refused=1)
            raise

    async def _upload(self, tenant_id: UUID, data: bytes, by: str) -> Uploaded:
        if len(data) > self.settings.media_max_upload_bytes:
            raise too_large(len(data), self.settings.media_max_upload_bytes)
        digest = hashlib.sha256(data).hexdigest()

        # A photo the shop already has costs nothing: no work, no space, no cap.
        async with self.db.tenant(tenant_id) as conn:
            row = await self._by_digest(conn, digest)
            known = row["id"] if row is not None else None
            if row is not None:
                await self._seen(conn, row)
        if known is not None:
            return await self._finish(tenant_id, known, duplicate=True)

        async with self._cpu:
            variants = await asyncio.to_thread(images.process, data, self.settings.media_max_pixels)

        async with self.db.tenant(tenant_id) as conn:
            # One upload at a time per shop, so two at once cannot slip past the cap or
            # store the same file twice.
            await conn.execute(
                "select pg_advisory_xact_lock(hashtextextended($1, 0))", f"media:{tenant_id}"
            )
            row = await self._by_digest(conn, digest)
            duplicate = row is not None
            if row is not None:
                asset_id = row["id"]
                await self._seen(conn, row)
            else:
                used = await conn.fetchval(
                    "select count(*) from media_assets where state <> 'removed'"
                )
                if used >= self.settings.catalog_max_photos:
                    raise photo_cap(self.settings.catalog_max_photos)
                asset_id = await self._create(conn, tenant_id, digest, variants, by)
        added = 0 if duplicate else sum(len(v.data) for v in variants)
        return await self._finish(tenant_id, asset_id, duplicate=duplicate, added=added)

    async def _finish(
        self, tenant_id: UUID, asset_id: UUID, *, duplicate: bool, added: int = 0
    ) -> Uploaded:
        """Read the photo back once the transaction has committed: an in-process runner
        will usually have finished the writes by now, so it is `ready` rather than `pending`."""
        async with self.db.tenant(tenant_id) as conn:
            row = await self._asset(conn, asset_id)
            total = await conn.fetchval("select media_total_bytes()") if added else 0
        if added:
            self._watch(total, added)
        return Uploaded(self.view(row), duplicate)

    async def _create(
        self, conn: asyncpg.Connection, tenant_id: UUID, digest: str,
        variants: list[images.Variant], by: str,
    ) -> UUID:
        records = [
            {"key": f"shops/{tenant_id}/{digest}-{v.long_side}.webp", "width": v.width,
             "height": v.height, "bytes": len(v.data)}
            for v in variants
        ]
        largest = variants[-1]
        asset_id = await conn.fetchval(
            "insert into media_assets (source_sha256, width, height, variants, bytes_total, "
            "created_by) values ($1, $2, $3, $4, $5, $6) returning id",
            digest, largest.width, largest.height, records, sum(r["bytes"] for r in records), by,
        )
        for record, variant in zip(records, variants, strict=True):
            await conn.execute(
                "insert into media_ops (asset_id, op, key, data) values ($1, 'put', $2, $3)",
                asset_id, record["key"], variant.data,
            )
        await jobs.enqueue(conn, SYNC, {"asset_id": str(asset_id)}, max_attempts=SYNC_ATTEMPTS)
        await conn.execute("select media_record_usage(1, 0, 0, $1)", await self._items(conn))
        return asset_id

    async def _seen(self, conn: asyncpg.Connection, row: asyncpg.Record) -> None:
        """The shop sent a file it already has: count it, and wake one the store never took."""
        if row["state"] == "removed":
            raise _removed()
        if row["state"] == "failed":
            # It never reached the store; the writes are still queued. Try again.
            await conn.execute("update media_assets set state = 'pending' where id = $1", row["id"])
            await jobs.enqueue(
                conn, SYNC, {"asset_id": str(row["id"])}, max_attempts=SYNC_ATTEMPTS
            )
        await conn.execute("select media_record_usage(0, 1, 0, null)")

    async def _count(self, tenant_id: UUID, *, refused: int) -> None:
        try:
            async with self.db.tenant(tenant_id) as conn:
                await conn.execute("select media_record_usage(0, 0, $1, null)", refused)
        except Exception:  # noqa: BLE001 - the meters must never hide the real refusal
            log.warning("could not count a refused upload", exc_info=True)

    def _watch(self, total: int, added: int) -> None:
        """Log once when the stored photos pass the alert line (80% of the free tier)."""
        line = self.settings.media_free_bytes * self.settings.media_alert_percent // 100
        if total >= line > total - added:
            log.warning(
                "photo storage passed %s%% of the free tier (%.2f of %.0f GB)",
                self.settings.media_alert_percent, total / 1e9,
                self.settings.media_free_bytes / 1e9,
            )

    # ── reading ───────────────────────────────────────────

    async def _by_digest(self, conn: asyncpg.Connection, digest: str) -> asyncpg.Record | None:
        return await conn.fetchrow(
            f"select {_ASSET} from media_assets where source_sha256 = $1", digest
        )

    async def _asset(self, conn: asyncpg.Connection, asset_id: UUID) -> asyncpg.Record | None:
        return await conn.fetchrow(f"select {_ASSET} from media_assets where id = $1", asset_id)

    async def photo(self, conn: asyncpg.Connection, asset_id: UUID) -> dict:
        row = await self._asset(conn, asset_id)
        if row is None or row["state"] == "removed":
            raise _not_found()
        return self.view(row)

    async def photos(self, conn: asyncpg.Connection, limit: int = 100, offset: int = 0) -> dict:
        """The shop's photo library, newest first, with how many things each is used on."""
        rows = await conn.fetch(
            f"select {_ASSET}, (select count(*) from media_links l where l.asset_id = a.id) "
            "as links from media_assets a where state <> 'removed' "
            "order by created_at desc, id limit $1 offset $2",
            limit, offset,
        )
        total = await conn.fetchval("select count(*) from media_assets where state <> 'removed'")
        return {
            "total": total,
            "photos": [
                {**self.view(r), "links": r["links"], "bytes": r["bytes_total"],
                 "created_at": r["created_at"].isoformat()}
                for r in rows
            ],
        }

    # ── the interface the catalog uses ────────────────────

    async def attach(
        self, conn: asyncpg.Connection, asset_id: UUID, owner_kind: str, owner_id: UUID
    ) -> int:
        """Say a photo belongs to something (an item, a variant). Idempotent. Returns its
        position among that owner's photos; 0 is the cover. Call it in the owner's own
        transaction so the link and the owner stand or fall together."""
        if not _OWNER_KIND.fullmatch(owner_kind):
            raise ValueError("owner_kind is lowercase letters and underscores")
        row = await self._asset(conn, asset_id)  # only this shop's photos are visible
        if row is None or row["state"] == "removed":
            raise _not_found()
        await conn.execute(
            "select pg_advisory_xact_lock(hashtextextended($1, 0))", f"media-owner:{owner_id}"
        )
        position = await conn.fetchval(
            "select position from media_links where asset_id = $1 and owner_kind = $2 "
            "and owner_id = $3", asset_id, owner_kind, owner_id,
        )
        if position is not None:
            return position
        count, last = await conn.fetchrow(
            "select count(*), max(position) from media_links where owner_kind = $1 "
            "and owner_id = $2", owner_kind, owner_id,
        )
        if count >= MAX_PHOTOS_PER_OWNER:
            raise _owner_full()
        position = 0 if last is None else last + 1
        await conn.execute(
            "insert into media_links (asset_id, owner_kind, owner_id, position) "
            "values ($1, $2, $3, $4)", asset_id, owner_kind, owner_id, position,
        )
        return position

    async def detach(
        self, conn: asyncpg.Connection, asset_id: UUID, owner_kind: str, owner_id: UUID
    ) -> bool:
        """Take a photo off something. The photo stays in the shop's library."""
        done = await conn.execute(
            "delete from media_links where asset_id = $1 and owner_kind = $2 and owner_id = $3",
            asset_id, owner_kind, owner_id,
        )
        return done == "DELETE 1"

    async def reorder(
        self, conn: asyncpg.Connection, owner_kind: str, owner_id: UUID, asset_ids: list[UUID]
    ) -> None:
        """Put an owner's photos in this order; the first is the cover. The list must name
        exactly the photos the owner has now, so a screen that was out of date (a colleague
        added one meanwhile) is told to look again instead of losing a photo."""
        if not _OWNER_KIND.fullmatch(owner_kind):
            raise ValueError("owner_kind is lowercase letters and underscores")
        await conn.execute(
            "select pg_advisory_xact_lock(hashtextextended($1, 0))", f"media-owner:{owner_id}"
        )
        have = {
            r["asset_id"] for r in await conn.fetch(
                "select asset_id from media_links where owner_kind = $1 and owner_id = $2",
                owner_kind, owner_id,
            )
        }
        if len(asset_ids) != len(set(asset_ids)) or set(asset_ids) != have:
            raise _order_changed()
        for position, asset_id in enumerate(asset_ids):
            await conn.execute(
                "update media_links set position = $4 where asset_id = $1 and owner_kind = $2 "
                "and owner_id = $3", asset_id, owner_kind, owner_id, position,
            )

    async def photos_for(
        self, conn: asyncpg.Connection, owner_kind: str, owner_ids: list[UUID]
    ) -> dict[UUID, list[dict]]:
        """Each owner's photos in order, first is the cover, in one query. An owner with
        none has an empty list. Photos still being saved are included, as `pending`."""
        rows = await conn.fetch(
            "select l.owner_id, a.id, a.state, a.width, a.height, a.variants, a.bytes_total, "
            "a.created_at from media_links l join media_assets a on a.id = l.asset_id "
            "where l.owner_kind = $1 and l.owner_id = any($2::uuid[]) and a.state <> 'removed' "
            "order by l.owner_id, l.position",
            owner_kind, owner_ids,
        )
        found: dict[UUID, list[dict]] = {owner: [] for owner in owner_ids}
        for row in rows:
            found[row["owner_id"]].append(self.view(row))
        return found

    async def covers_for(
        self, conn: asyncpg.Connection, owner_kind: str, owner_ids: list[UUID]
    ) -> dict[UUID, dict]:
        """One photo per owner: the first that is ready, else the placeholder state."""
        every = await self.photos_for(conn, owner_kind, owner_ids)
        return {
            owner: next((p for p in shown if p["state"] == "ready"), dict(NO_PHOTO))
            for owner, shown in every.items()
        }

    async def jpeg_for(
        self, conn: asyncpg.Connection, asset_id: UUID, target: int = 800
    ) -> bytes | None:
        """A stored photo as a JPEG of about `target` pixels on its long side, for a
        message. WhatsApp takes JPEG and PNG and our files are WebP, so this reads the
        size from the store and draws it again. None while the photo is not stored yet
        (`pending`), is gone, or the store cannot be read: the message goes without it."""
        row = await self._asset(conn, asset_id)
        if row is None or row["state"] != "ready":
            return None
        try:
            data = await self.store.get(pick(row["variants"], target)["key"])
        except StoreError:
            return None
        if data is None:
            return None
        return await asyncio.to_thread(_as_jpeg, data)

    async def assert_can_add_item(self, conn: asyncpg.Connection) -> None:
        """Called by the catalog before it creates an item. Raises `PhotoRefused` with the
        plain message when the shop is at its cap; never deletes anything."""
        used = await self._items(conn)
        if used is not None and used >= self.settings.catalog_max_items:
            raise item_cap(self.settings.catalog_max_items)

    # ── removing ──────────────────────────────────────────

    async def delete(self, conn: asyncpg.Connection, asset_id: UUID) -> None:
        """The shop deletes one of its own photos, which also takes it off every item. Its
        files leave the store through the queue. Free space for a shop at its cap."""
        row = await conn.fetchrow(
            f"select {_ASSET} from media_assets where id = $1 for update", asset_id
        )
        if row is None or row["state"] == "removed":
            raise _not_found()
        if row["state"] == "pending":
            raise _busy()  # its writes are in flight; deleting now could race them
        await conn.execute("delete from media_ops where asset_id = $1 and op = 'put'", asset_id)
        for variant in row["variants"]:
            await conn.execute(
                "insert into media_ops (asset_id, op, key) values ($1, 'delete', $2)",
                asset_id, variant["key"],
            )
        await conn.execute("delete from media_assets where id = $1", asset_id)  # links cascade
        await jobs.enqueue(conn, SYNC, {"asset_id": str(asset_id)}, max_attempts=SYNC_ATTEMPTS)
        await conn.execute("select media_record_usage(0, 0, 0, $1)", await self._items(conn))

    # ── the queue that keeps the store in step ────────────

    async def sync(self, tenant_id: UUID, payload: dict) -> None:
        """Job `media.sync`: carry out one photo's queued writes and deletes, in order. A
        store that is down raises, and the job runner tries again later."""
        asset_id = UUID(payload["asset_id"])
        while True:
            async with self.db.tenant(tenant_id) as conn:
                op = await conn.fetchrow(
                    "select seq, op, key, content_type, data from media_ops "
                    "where asset_id = $1 order by seq limit 1", asset_id,
                )
            if op is None:
                return
            if op["op"] == "put":
                await self._write(tenant_id, asset_id, op)
            else:
                await self._remove(tenant_id, op)

    async def _write(self, tenant_id: UUID, asset_id: UUID, op: asyncpg.Record) -> None:
        async with self.db.tenant(tenant_id) as conn:
            state = await conn.fetchval("select state from media_assets where id = $1", asset_id)
            if state in (None, "removed"):  # taken down before it was written
                await conn.execute("delete from media_ops where seq = $1", op["seq"])
                return
        await self.store.put(op["key"], op["data"], content_type=op["content_type"])
        async with self.db.tenant(tenant_id) as conn:
            state = await conn.fetchval("select state from media_assets where id = $1", asset_id)
            await conn.execute("delete from media_ops where seq = $1", op["seq"])
            if state in (None, "removed"):
                gone = True
            else:
                gone = False
                waiting = await conn.fetchval(
                    "select count(*) from media_ops where asset_id = $1 and op = 'put'", asset_id
                )
                if waiting == 0:
                    await conn.execute(
                        "update media_assets set state = 'ready' "
                        "where id = $1 and state in ('pending', 'failed')", asset_id,
                    )
        if gone:  # it was taken down while we were writing: undo the write
            await self.store.delete(op["key"])

    async def _remove(self, tenant_id: UUID, op: asyncpg.Record) -> None:
        async with self.db.tenant(tenant_id) as conn:
            # The same picture uploaded again after a delete has the same file names.
            in_use = await conn.fetchval(
                "select exists (select 1 from media_assets where state <> 'removed' "
                "and variants @> $1::jsonb)", [{"key": op["key"]}],
            )
        if not in_use:
            await self.store.delete(op["key"])
        async with self.db.tenant(tenant_id) as conn:
            await conn.execute("delete from media_ops where seq = $1", op["seq"])

    async def gave_up(self, tenant_id: UUID, payload: dict) -> None:
        """The job ran out of attempts: mark the photo, so the owner sees it did not save."""
        async with self.db.tenant(tenant_id) as conn:
            await conn.execute(
                "update media_assets set state = 'failed' where id = $1 and state = 'pending'",
                UUID(payload["asset_id"]),
            )

    # ── meters ────────────────────────────────────────────

    async def _items(self, conn: asyncpg.Connection) -> int | None:
        """The shop's active items, or None if the counter fails. A failing counter must
        not break an upload, and its failed query must not abort the transaction."""
        try:
            async with conn.transaction():  # a savepoint
                return await self.item_counter(conn)
        except Exception:  # noqa: BLE001
            log.warning("could not count the shop's items", exc_info=True)
            return None

    async def refresh_usage(self, conn: asyncpg.Connection) -> None:
        """Bring the shop's stored figures and item count for this month up to date. The
        catalog may call it after items are added or archived."""
        await conn.execute("select media_record_usage(0, 0, 0, $1)", await self._items(conn))

    async def refresh_all(self) -> int:
        """Every shop has a row for the current month, with fresh figures, even if it
        uploaded nothing. The worker calls this every hour. Returns how many shops."""
        async with self.db.unscoped() as conn:
            shops = [r["id"] for r in await conn.fetch("select id from tenants")]
        for tenant_id in shops:
            async with self.db.tenant(tenant_id) as conn:
                await self.refresh_usage(conn)
        return len(shops)

    async def usage(self, conn: asyncpg.Connection) -> dict:
        """The shop's own numbers: what it stores against its caps, and the months so far."""
        month = await conn.fetchval(
            "select date_trunc('month', now() at time zone 'Asia/Qatar')::date"
        )
        live = await conn.fetchrow(
            "select count(*) as photos, coalesce(sum(bytes_total), 0)::bigint as bytes "
            "from media_assets where state <> 'removed'"
        )
        this_month = await conn.fetchrow("select * from media_usage where month = $1", month)
        history = await conn.fetch("select * from media_usage order by month desc limit 12")
        return {
            "month": month.strftime("%Y-%m"),
            "storage": self.store.name,
            "photos": {"used": live["photos"], "limit": self.settings.catalog_max_photos},
            "items": {"used": await self._items(conn), "limit": self.settings.catalog_max_items},
            "bytes": live["bytes"],
            "gb": gigabytes(live["bytes"]),
            "uploads": {
                "month": this_month["uploads"] if this_month else 0,
                "duplicates": this_month["duplicates"] if this_month else 0,
                "refused": this_month["refused"] if this_month else 0,
            },
            "history": [_month(r) for r in history],
        }

    async def admin_usage(self, conn: asyncpg.Connection, month: date) -> dict:
        """Back office: every business's meters for a month, and the free-tier alert."""
        rows = await conn.fetch("select * from admin_media_usage($1)", month)
        current = await conn.fetchval(
            "select date_trunc('month', now() at time zone 'Asia/Qatar')::date"
        )
        live = month == current
        shops = []
        for r in rows:
            photos = r["live_photos"] if live else r["photos"]
            stored = r["live_bytes"] if live else r["bytes_stored"]
            shops.append({
                "tenant_id": str(r["tenant_id"]), "business": r["business"],
                "photos": photos, "gb": gigabytes(stored), "bytes": stored,
                "peak_gb": gigabytes(max(r["peak_bytes_stored"], stored)),
                "uploads": r["uploads"], "duplicates": r["duplicates"], "refused": r["refused"],
                "active_items": r["active_items"],
                "photos_limit": self.settings.catalog_max_photos,
            })
        used = sum(r["live_bytes"] for r in rows)
        free = self.settings.media_free_bytes
        percent = round(used * 100 / free, 1) if free else 0.0
        level = "ok"
        if used >= free:
            level = "over"
        elif percent >= self.settings.media_alert_percent:
            level = "warn"
        return {
            "month": month.strftime("%Y-%m"), "storage": self.store.name,
            "alert": {
                "level": level, "percent": percent, "used_gb": gigabytes(used),
                "free_gb": gigabytes(free), "at_percent": self.settings.media_alert_percent,
            },
            "shops": shops,
        }


def gigabytes(size: int) -> float:
    """Decimal gigabytes, to six places (a shop with a dozen photos is 0.001 GB)."""
    return round(size / 1_000_000_000, 6)


def _month(row: asyncpg.Record) -> dict:
    return {
        "month": row["month"].strftime("%Y-%m"), "photos": row["photos"],
        "gb": gigabytes(row["bytes_stored"]), "peak_gb": gigabytes(row["peak_bytes_stored"]),
        "uploads": row["uploads"], "duplicates": row["duplicates"], "refused": row["refused"],
        "active_items": row["active_items"],
    }
