"""Helpers for the tests of the visits import (D-197, spec 070): businesses made by the back
office, the salon fixture and what it should make worked out from the file itself (not from the
importer), calls to the back office's routes, and direct reads of the database as the owner role.

Everything here is invented: the salon, its clients, its numbers (a 555 prefix) and its staff.
"""

import asyncio
import csv
import io
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg

from alyr.core.auth import Staff
from alyr.db import Database
from conftest import APP_DSN, OWNER_DSN

ADMIN = "/api/admin"
FIXTURE = Path(__file__).parent / "fixtures" / "visits_salon_export.csv"
# Saturday 21 Nov 2026, 15:00 in Doha: "today" for the Agent in these tests.
NOW = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)

# Every table an outbound path could write to for a customer. An import must leave all of them
# exactly as they were (activity is the one it may add to, for a cancellation with a time).
NOTHING_SENT = (
    "messages", "message_media", "jobs", "consents", "review_requests", "webhook_deliveries",
    "document_deliveries", "payment_requests", "stock_watches", "sold_out_asks", "chat_carts",
    "discovery_asks", "staff_pending", "inbox_notes", "staff_changes", "documents",
    "manual_payments", "ledger_entries", "orders",
)


def fixture_bytes() -> bytes:
    return FIXTURE.read_bytes()


def fixture_rows() -> list[dict]:
    text = FIXTURE.read_bytes().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def unique_rows() -> list[dict]:
    """The fixture's rows, the same appointment once: what the importer should make."""
    seen, out = set(), []
    for r in fixture_rows():
        if r["Appointment ID"] not in seen:
            seen.add(r["Appointment ID"])
            out.append(r)
    return out


def csv_of(rows: list[list[object]], delimiter: str = ",") -> bytes:
    out = io.StringIO(newline="")
    csv.writer(out, delimiter=delimiter, lineterminator="\r\n").writerows(rows)
    return b"\xef\xbb\xbf" + out.getvalue().encode("utf-8")


def sql(query: str, *args):
    """A statement as the database owner (RLS does not apply): for setting a state up and for
    reading what the app role may not."""
    async def go():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return await conn.fetch(query, *args)
        finally:
            await conn.close()

    return asyncio.run(go())


def count(table: str, tenant_id: UUID, where: str = "true") -> int:
    return sql(f"select count(*) as n from {table} where tenant_id = $1 and {where}",
               tenant_id)[0]["n"]


def snapshot(tenant_id: UUID, tables=NOTHING_SENT) -> dict[str, int]:
    return {t: count(t, tenant_id) for t in tables}


def make_business(office, products: list[str] | None = None, name: str | None = None) -> UUID:
    """A business made by the back office. `products=[]` gives one with no Bookings, as a client
    who uses only Discovery and Insights has."""
    slug = f"hist-{uuid4().hex[:8]}"
    made = office.post(f"{ADMIN}/businesses", json={
        "name": name or f"Hist {slug}", "slug": slug, "owner_email": f"{slug}@hist.example",
        "owner_name": "Noor", "products": products if products is not None else ["bookings"]})
    assert made.status_code == 200, made.text
    return UUID(made.json()["id"])


def url(tenant_id: UUID, tail: str = "") -> str:
    return f"{ADMIN}/businesses/{tenant_id}/visits-imports{tail}"


def upload(office, tenant_id: UUID, data: bytes, name: str = "visits.csv"):
    return office.post(url(tenant_id) + f"?filename={name}", content=data,
                       headers={"Content-Type": "application/octet-stream"})


def preview(office, tenant_id: UUID, data: bytes, name: str = "visits.csv",
            options: dict | None = None, mapping: dict | None = None) -> dict:
    answer = upload(office, tenant_id, data, name)
    assert answer.status_code == 201, answer.text
    shown = answer.json()
    if options is not None or mapping is not None:
        body = {}
        if options is not None:
            body["options"] = options
        if mapping is not None:
            body["mapping"] = mapping
        changed = office.put(url(tenant_id, f"/{shown['id']}"), json=body)
        assert changed.status_code == 200, changed.text
        shown = changed.json()
    return shown


def apply(office, tenant_id: UUID, shown: dict, switch_on_bookings: bool = False):
    return office.post(url(tenant_id, f"/{shown['id']}/apply"), json={
        "preview": shown["hash"], "switch_on_bookings": switch_on_bookings})


def do_import(office, tenant_id: UUID, data: bytes | None = None, **kw) -> dict:
    shown = preview(office, tenant_id, fixture_bytes() if data is None else data, **kw)
    done = apply(office, tenant_id, shown)
    assert done.status_code == 200, done.text
    return done.json()


def staff_of(tenant_id: UUID, role: str = "owner") -> Staff:
    return Staff(None, "Noor", "noor@hist.example", role, tenant_id)


def run_in(tenant_id: UUID, work):
    """Run `async def work(conn)` as the application's own role, scoped to one business."""
    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(tenant_id) as conn:
                return await work(conn)
        finally:
            await db.close()

    return asyncio.run(go())
