"""Photos that arrive with an import, matched to items by file name (D-039, ALY-108).

The owner uploads a zip beside the spreadsheet. The spreadsheet's Photos column names the
files (`shawarma.jpg`); a file called like an item (`Shawarma.jpg`) belongs to an item whose
row names none. Nothing in the zip is ever written to disk, and nothing in it is trusted:
the zip's size, the number of files, what each file claims to unpack to and the ratio are all
checked before a byte is read, and every picture then goes through the same checks as any
photo (`core/images.py`: type by content, size, pixels, location data removed).

The zip is only listed when the owner previews. The pictures are added after the import is
applied, by a background job, because adding a few hundred photos (each is re-drawn at three
sizes) takes longer than a request should. The job does one item at a time, remembers where
it is, and can be run again without adding anything twice. A photo that cannot be used is
named, with the reason, and never stops the others.
"""

import io
import logging
import zipfile
from uuid import UUID

from alyr.core.images import PhotoRefused
from alyr.core.team import Actor
from alyr.db import Database
from alyr.modules.items import photos, values
from alyr.modules.items.import_plan import PHOTO_EXTENSIONS, ZipView
from alyr.modules.items.xlsx import SheetError

log = logging.getLogger("alyr.import")

JOB = "items.import_photos"
MAX_ENTRIES = 600
MAX_TOTAL_UNPACKED = 600 * 1024 * 1024
# Pictures are already compressed: a file that unpacks to far more than it packs is a bomb.
MAX_RATIO = 30
RATIO_FREE = 2 * 1024 * 1024
ZIP_MAGIC = b"PK\x03\x04"

NOT_A_ZIP = (
    "not_a_zip",
    "This file could not be read as a zip. Put the photos in a folder and compress it into a "
    "single .zip file.",
    "تعذّرت قراءة هذا الملف كملف zip. ضع الصور في مجلد واضغطه في ملف .zip واحد.",
)


def _bad(code: str, en: str, ar: str, status: int = 422) -> SheetError:
    return SheetError(code, en, ar, status)


def _norm(name: str) -> str:
    return name.replace("\\", "/").strip("/")


def index(data: bytes, max_entry_bytes: int) -> ZipView:
    """Which picture files a zip holds. Raises `SheetError` for a file that is not a zip, is
    protected, or is built to unpack to far more than it says."""
    if data[:4] != ZIP_MAGIC:
        raise _bad(*NOT_A_ZIP)
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise _bad(*NOT_A_ZIP) from error
    by_name: dict[str, list[str]] = {}
    by_stem: dict[str, list[str]] = {}
    unusable: list[str] = []
    total = 0
    count = 0
    with archive:
        for info in archive.infolist():
            name = _norm(info.filename)
            base = name.rsplit("/", 1)[-1]
            if info.is_dir() or name.startswith("__MACOSX/") or base.startswith("."):
                continue
            count += 1
            if count > MAX_ENTRIES:
                raise _bad(
                    "zip_too_many",
                    f"This zip holds more than {MAX_ENTRIES} files. Split the photos into "
                    "smaller zips.",
                    f"يحتوي ملف zip هذا على أكثر من {MAX_ENTRIES} ملفاً. قسّم الصور إلى ملفات "
                    "zip أصغر.",
                )
            if info.flag_bits & 0x1:
                raise _bad(
                    "zip_protected",
                    "This zip is protected with a password. Remove the password and try again.",
                    "ملف zip هذا محمي بكلمة مرور. أزلها وحاول مرة أخرى.",
                )
            total += info.file_size
            bomb = info.file_size > RATIO_FREE and info.file_size > MAX_RATIO * max(
                info.compress_size, 1
            )
            if total > MAX_TOTAL_UNPACKED or bomb:
                raise _bad(
                    "zip_too_large",
                    "This zip is too large once opened, so it was not read. Split the photos "
                    "into smaller zips.",
                    "ملف zip هذا كبير جداً بعد فتحه، لذلك لم يُقرأ. قسّم الصور إلى ملفات أصغر.",
                )
            lowered = base.lower()
            if not lowered.endswith(PHOTO_EXTENSIONS) or info.file_size > max_entry_bytes:
                unusable.append(name)
                continue
            by_name.setdefault(lowered, []).append(name)
            stem = lowered.rsplit(".", 1)[0]
            by_stem.setdefault(values.squash(stem), []).append(name)
    return ZipView(by_name, by_stem, unusable, count)


def read_entry(data: bytes, name: str, limit: int) -> bytes:
    """One file's bytes, never more than `limit`, whatever the zip claims."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for info in archive.infolist():
            if _norm(info.filename) == name:
                with archive.open(info) as part:
                    body = part.read(limit + 1)
                if len(body) > limit:
                    raise ValueError("too large")
                return body
    raise KeyError(name)


def plain(error: PhotoRefused) -> dict:
    return {"code": error.code, "message": error.en, "message_ar": error.ar}


class ImportPhotos:
    """The job that adds an import's photos. It reads its work from the import row."""

    def __init__(self, db: Database, media) -> None:
        self.db = db
        self.media = media

    async def _row(self, tenant_id: UUID, import_id: UUID, zip_too: bool = False):
        columns = "status, photos, actor_id, actor_name" + (", zip" if zip_too else "")
        async with self.db.tenant(tenant_id) as conn:
            return await conn.fetchrow(
                f"select {columns} from item_imports where id = $1", import_id
            )

    async def _save(self, tenant_id: UUID, import_id: UUID, progress: dict) -> None:
        async with self.db.tenant(tenant_id) as conn:
            await conn.execute(
                "update item_imports set photos = $2 where id = $1", import_id, progress
            )

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        import_id = UUID(payload["import_id"])
        row = await self._row(tenant_id, import_id, zip_too=True)
        if row is None or row["status"] != "applied":
            return  # undone, or gone: nothing to add
        progress = dict(row["photos"])
        plan = progress.get("plan", [])
        actor = Actor(row["actor_id"], row["actor_name"])
        limit = self.media.settings.media_max_upload_bytes
        data = row["zip"]
        progress["state"] = "running"
        while progress["next"] < len(plan):
            fresh = await self._row(tenant_id, import_id)
            if fresh is None or fresh["status"] != "applied":
                return  # undone while the photos were being added
            step = plan[progress["next"]]
            item_id = UUID(step["item_id"])
            for ref in step["refs"]:
                await self._add(tenant_id, item_id, ref, data, limit, actor, progress)
            progress["next"] += 1
            await self._save(tenant_id, import_id, progress)
        progress["state"] = "done"
        async with self.db.tenant(tenant_id) as conn:
            await conn.execute(
                "update item_imports set photos = $2, zip = null where id = $1",
                import_id, progress,
            )

    async def _add(
        self, tenant_id: UUID, item_id: UUID, ref: dict, data: bytes | None, limit: int,
        actor: Actor, progress: dict,
    ) -> None:
        label = ref.get("zip", "").rsplit("/", 1)[-1] or ref.get("asset", "")
        try:
            if "zip" in ref:
                if data is None:
                    raise KeyError(ref["zip"])
                body = read_entry(data, ref["zip"], limit)
                uploaded = await self.media.upload(tenant_id, body, by=actor.name)
                asset_id = UUID(uploaded.photo["id"])
            else:
                asset_id = UUID(ref["asset"])
            async with self.db.tenant(tenant_id) as conn:
                await photos.attach(conn, self.media, item_id, asset_id, actor)
        except PhotoRefused as error:
            progress["failed"].append({"file": label, **plain(error)})
        except (KeyError, ValueError, OSError, zipfile.BadZipFile):
            progress["failed"].append({
                "file": label, "code": "photo_unreadable",
                "message": "This file could not be read from the zip.",
                "message_ar": "تعذّرت قراءة هذا الملف من ملف zip.",
            })
        except LookupError:
            progress["failed"].append({
                "file": label, "code": "item_gone",
                "message": "The item is no longer there.", "message_ar": "الصنف لم يعد موجوداً.",
            })
        else:
            progress["done"] += 1
            progress["attached"].append({"item_id": str(item_id), "asset_id": str(asset_id)})

    async def gave_up(self, tenant_id: UUID, payload: dict) -> None:
        """The job failed for good (every try): say so on the import."""
        import_id = UUID(payload["import_id"])
        row = await self._row(tenant_id, import_id)
        if row is None:
            return
        progress = {**row["photos"], "state": "failed"}
        log.warning("import %s: the photos could not be added", import_id)
        await self._save(tenant_id, import_id, progress)


def initial_progress(plan: list[dict]) -> dict:
    return {
        "state": "queued", "plan": plan, "next": 0,
        "total": sum(len(step["refs"]) for step in plan), "done": 0, "failed": [],
        "attached": [],
    }

