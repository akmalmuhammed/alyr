"""Everything a business keeps in ALYR, in one ZIP for its owner (go-live item 41, specs/040,
D-081).

* **Tables.** Every table with a `tenant_id` that the app can read is written whole, one CSV each
  (`tables/<name>.csv`), except the few in LEFT_OUT. A table added later is in the download
  without anyone remembering to add it. Rows are read inside the business's own scope
  (row-level security) and asked for by `tenant_id` as well, for the two tables without it.
* **Columns.** Secrets are never written: the ones in DROPPED, and any column whose name says
  secret, password, token, credential, sealed or private key, or ends in `api_key` or `_hash`,
  unless KEPT says it is not a secret. A column of
  raw bytes is never written into a CSV: the ones that hold files are written as files.
* **Files.** Every issued document's PDF, the logo and stamp, the catalog's photos (the largest
  size kept) and what customers sent in the chat (`files/...`).
* **README.txt**, in English and Arabic: what is inside, money in dirhams, times in Doha time,
  what is left out and why, and who downloaded it when.

Cells are what Excel opens with Arabic intact (UTF-8 with a byte-order mark). Text a
spreadsheet could take for a formula gets the catalog export's leading apostrophe. The ZIP is
written as it is sent, so a large business never sits whole in memory.
"""

import csv
import io
import json
import logging
import re
import zipfile
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, time
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.core.storage import Store, StoreError
from alyr.db import Database
from alyr.modules.items.exports import safe_text

log = logging.getLogger("alyr.export")

DOHA = ZoneInfo("Asia/Qatar")
BOM = b"\xef\xbb\xbf"
# Bytes gathered before they are sent on.
CHUNK = 256 * 1024
ROWS_PER_WRITE = 500

# Tables of a business's own that the download leaves out, and why (in both languages, for
# the README).
LEFT_OUT: dict[str, tuple[str, str]] = {
    "sessions": ("sign-ins of your team's browsers (secret)", "جلسات دخول متصفحات فريقك (سرية)"),
    "staff_link_codes": (
        "one-time codes that link a staff phone (secret)", "رموز لمرة واحدة لربط هاتف موظف (سرية)",
    ),
    "jobs": ("ALYR's own queue of work to do", "قائمة الأعمال الداخلية في ALYR"),
    "processed_messages": (
        "WhatsApp message IDs already handled, kept so none is handled twice",
        "معرّفات رسائل واتساب التي عولجت، حتى لا تعالج مرتين",
    ),
    "media_ops": ("the photo store's own log", "سجل مخزن الصور الداخلي"),
    "demo_seed_runs": (
        "ALYR's own record of loading demo data", "سجل ALYR الداخلي لتحميل البيانات التجريبية",
    ),
}

# Columns never written. Secrets, the spreadsheets the owner uploaded (they have them), and
# columns of bytes written as files instead.
DROPPED = {
    ("api_keys", "secret_hash"),
    ("webhook_endpoints", "secret"),
    ("item_imports", "file"),
    ("item_imports", "zip"),
    ("sale_imports", "file"),
    ("document_files", "content"),
    ("document_settings", "logo_png"),
    ("document_settings", "stamp_png"),
    ("message_media", "data"),
}
SECRET_NAME = re.compile(r"secret|password|token|credential|sealed|private_key|api_key$|_hash$")
# Columns whose names look secret and are not: a document's fingerprint, a sale's request's.
KEPT = {("documents", "content_hash"), ("connect_sales", "request_hash")}

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
_MEDIA_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
              "application/pdf": "pdf"}


class _Sink(io.RawIOBase):
    """Where the ZIP is written: it holds bytes until they are taken and sent. It cannot seek,
    so the ZIP writes each file's size after the file (as a stream must)."""

    def __init__(self) -> None:
        self._chunks: list[bytes] = []
        self.size = 0
        self._at = 0

    def writable(self) -> bool:
        return True

    def write(self, data) -> int:
        self._chunks.append(bytes(data))
        self.size += len(data)
        self._at += len(data)
        return len(data)

    def tell(self) -> int:
        return self._at

    def take(self) -> bytes:
        data = b"".join(self._chunks)
        self._chunks.clear()
        self.size = 0
        return data


def _cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, datetime):
        moment = value.astimezone(DOHA) if value.tzinfo else value.replace(tzinfo=UTC)
        return moment.astimezone(DOHA).strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (UUID, int, float)):
        return str(value)
    if isinstance(value, (dict, list, tuple)):
        return safe_text(json.dumps(value, ensure_ascii=False, default=str))
    if isinstance(value, (bytes, bytearray, memoryview)):
        return ""  # never bytes in a cell; DROPPED and the bytea rule keep these out
    return safe_text(str(value))


def written(table: str, column: str, data_type: str) -> bool:
    """Whether a column goes into the table's CSV."""
    if (table, column) in DROPPED or data_type == "bytea":
        return False
    return (table, column) in KEPT or not SECRET_NAME.search(column)


async def tables(conn: asyncpg.Connection) -> list[tuple[str, list[str]]]:
    """The business's tables the download writes, each with the columns it writes."""
    rows = await conn.fetch(
        "select c.table_name, c.column_name, c.data_type from information_schema.columns c "
        "join information_schema.tables t "
        "on t.table_schema = c.table_schema and t.table_name = c.table_name "
        "where c.table_schema = 'public' and t.table_type = 'BASE TABLE' "
        "and exists (select 1 from information_schema.columns k where k.table_schema = 'public' "
        "and k.table_name = c.table_name and k.column_name = 'tenant_id') "
        "and has_column_privilege(format('public.%I', c.table_name), c.column_name, 'SELECT') "
        "order by c.table_name, c.ordinal_position"
    )
    found: dict[str, list[str]] = {}
    for r in rows:
        if r["table_name"] in LEFT_OUT:
            continue
        columns = found.setdefault(r["table_name"], [])
        if written(r["table_name"], r["column_name"], r["data_type"]):
            columns.append(r["column_name"])
    return [(name, columns) for name, columns in found.items() if "tenant_id" in columns]


def _quoted(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _file_name(text: str) -> str:
    return _SAFE_NAME.sub("-", text).strip("-.")[:80]


def _lines(rows: list[list[object]]) -> bytes:
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\r\n")
    for row in rows:
        writer.writerow([_cell(value) for value in row])
    return out.getvalue().encode("utf-8")


async def stream(
    db: Database, store: Store, tenant_id: UUID, by: str, at: datetime,
) -> AsyncIterator[bytes]:
    """The ZIP's bytes, a piece at a time. `by` is the name of who asked, for the README."""
    sink = _Sink()
    counts: dict[str, int] = {}
    files = {"documents": 0, "photos": 0, "messages": 0, "missing_photos": 0}
    with zipfile.ZipFile(sink, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        async with db.tenant(tenant_id) as conn:
            shop = await conn.fetchrow(
                "select * from tenants where id = $1", tenant_id
            )
            archive.writestr(
                "business.csv", BOM + _lines([list(shop.keys()), list(shop.values())])
            )
            team = await conn.fetch(
                "select u.id, u.name, u.name_ar, u.email, m.role, m.created_at as joined_at "
                "from memberships m join users u on u.id = m.user_id where m.tenant_id = $1 "
                "order by m.created_at",
                tenant_id,
            )
            archive.writestr("team.csv", BOM + _lines(
                [["id", "name", "name_ar", "email", "role", "joined_at"]]
                + [list(r.values()) for r in team]
            ))
            yield sink.take()

            for table, columns in await tables(conn):
                select = ", ".join(_quoted(c) for c in columns)
                order = " order by created_at" if "created_at" in columns else ""
                query = f"select {select} from public.{_quoted(table)} where tenant_id = $1{order}"
                counts[table] = 0
                with archive.open(f"tables/{table}.csv", "w", force_zip64=True) as entry:
                    entry.write(BOM + _lines([columns]))
                    batch: list[list[object]] = []
                    async for record in conn.cursor(query, tenant_id, prefetch=ROWS_PER_WRITE):
                        batch.append(list(record.values()))
                        counts[table] += 1
                        if len(batch) >= ROWS_PER_WRITE:
                            entry.write(_lines(batch))
                            batch.clear()
                            if sink.size >= CHUNK:
                                yield sink.take()
                    entry.write(_lines(batch))
                yield sink.take()

            names: set[str] = set()
            async for doc in conn.cursor(
                "select d.id, d.kind, d.number, f.content from document_files f "
                "join documents d on d.id = f.document_id order by d.created_at",
                prefetch=10,
            ):
                name = _file_name(f"{doc['kind']}-{doc['number']}") if doc["number"] else ""
                if not name or name in names:
                    name = str(doc["id"])
                names.add(name)
                archive.writestr(f"files/documents/{name}.pdf", doc["content"])
                files["documents"] += 1
                if sink.size >= CHUNK:
                    yield sink.take()

            marks = await conn.fetchrow(
                "select logo_png, stamp_png from document_settings where tenant_id = $1", tenant_id
            )
            for key in ("logo", "stamp"):
                if marks and marks[f"{key}_png"]:
                    archive.writestr(f"files/{key}.png", marks[f"{key}_png"])
            yield sink.take()

            async for media in conn.cursor(
                "select message_id, content_type, data from message_media order by created_at",
                prefetch=10,
            ):
                ext = _MEDIA_EXT.get(media["content_type"], "bin")
                archive.writestr(f"files/messages/{media['message_id']}.{ext}", media["data"])
                files["messages"] += 1
                if sink.size >= CHUNK:
                    yield sink.take()

            photos = await conn.fetch(
                "select id, variants from media_assets where state = 'ready' order by created_at"
            )
        # The photos are read from the photo store, outside the database's transaction.
        for photo in photos:
            variants = photo["variants"] or []
            if not variants:
                continue
            largest = max(variants, key=lambda v: v.get("width") or 0)
            try:
                data = await store.get(largest["key"])
            except StoreError:
                data = None
            if data is None:
                files["missing_photos"] += 1
                continue
            archive.writestr(f"files/photos/{photo['id']}.webp", data, zipfile.ZIP_STORED)
            files["photos"] += 1
            if sink.size >= CHUNK:
                yield sink.take()

        archive.writestr("README.txt", readme(shop["name"], by, at, counts, files).encode("utf-8"))
    yield sink.take()


def readme(shop: str, by: str, at: datetime, counts: dict[str, int], files: dict[str, int]) -> str:
    """What the download holds, in English and Arabic."""
    when = at.astimezone(DOHA).strftime("%Y-%m-%d %H:%M")
    tables_list = "\n".join(f"  tables/{name}.csv  {n}" for name, n in sorted(counts.items()))
    left = "\n".join(f"  {name}: {en}" for name, (en, _) in LEFT_OUT.items())
    left_ar = "\n".join(f"  {name}: {ar}" for name, (_, ar) in LEFT_OUT.items())
    missing = files["missing_photos"]
    missing_en = missing_ar = ""
    if missing:
        missing_en = (
            f"\n  {missing} photos could not be read from the photo store just now;\n"
            "  download again later to include them.\n"
        )
        missing_ar = (
            f"\n  تعذرت قراءة {missing} من الصور من مخزن الصور الآن؛\n"
            "  نزّل الملف مرة أخرى لاحقاً لتضمينها.\n"
        )
    return f"""{shop}: everything in ALYR
Downloaded by {by} on {when} Doha time.

WHAT IS INSIDE
  business.csv   your business as ALYR has it
  team.csv       who works for it, with their role
  tables/        every table of your business, one CSV each, with how many rows:
{tables_list}
  files/documents/   the PDF of every document issued ({files["documents"]})
  files/logo.png, files/stamp.png   your logo and stamp, if you added them
  files/photos/      your catalog's photos, the largest size ({files["photos"]})
  files/messages/    pictures and files customers sent in the chat ({files["messages"]})
{missing_en}
HOW TO READ IT
  Open any CSV in Excel or Google Sheets; Arabic shows correctly.
  Money is in dirhams: 100 dirhams = 1 QAR. A price of 2550 is QAR 25.50.
  Times are Doha time (UTC+3), written 2026-10-29 14:05:00.
  Rows point at each other by ID: an order's contact_id is the id in tables/contacts.csv.
  Text that starts with = + - or @ has an apostrophe in front, so a spreadsheet does not
  run it.

WHAT IS LEFT OUT, AND WHY
  Secret columns: API keys and webhook signing secrets.
  The spreadsheets you uploaded to import items or sales: you have them, and what they
  changed is in the tables.
  What ALYR charges you: see Products in your workspace, or ask us.
{left}

Every owner of {shop} is emailed each time this download is made.

---

{shop}: كل بياناتك في ALYR
نزّلها {by} في {when} بتوقيت الدوحة.

ما الذي يحتويه
  business.csv   بيانات نشاطك كما هي لدى ALYR
  team.csv       فريق العمل ودور كل شخص
  tables/        كل جداول نشاطك، ملف CSV لكل جدول، مع عدد الصفوف أعلاه
  files/documents/   ملف PDF لكل مستند صدر ({files["documents"]})
  files/logo.png و files/stamp.png   شعارك وختمك إن أضفتهما
  files/photos/      صور الكتالوج بأكبر حجم ({files["photos"]})
  files/messages/    الصور والملفات التي أرسلها العملاء في المحادثة ({files["messages"]})
{missing_ar}
كيف تقرؤه
  افتح أي ملف CSV في Excel أو Google Sheets؛ يظهر النص العربي بشكل صحيح.
  المبالغ بالدرهم: 100 درهم = 1 ريال قطري. السعر 2550 يعني 25.50 ريال.
  الأوقات بتوقيت الدوحة (UTC+3)، مكتوبة هكذا 2026-10-29 14:05:00.
  تشير الصفوف إلى بعضها بالمعرّف: contact_id في الطلب هو id في tables/contacts.csv.
  النص الذي يبدأ بـ = أو + أو - أو @ تسبقه علامة ' حتى لا يشغّله برنامج الجداول.

ما الذي لم يُضمَّن، ولماذا
  الأعمدة السرية: مفاتيح API وأسرار توقيع الإشعارات.
  الجداول التي رفعتها لاستيراد الأصناف أو المبيعات: هي لديك، وما غيّرته موجود في الجداول.
  ما تدفعه لـ ALYR: انظر "المنتجات" في مساحة العمل، أو اسألنا.
{left_ar}

يصل بريد إلى كل مالكي {shop} في كل مرة يُنزَّل فيها هذا الملف.
"""
