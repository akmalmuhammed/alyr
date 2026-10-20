"""Small pointers from other screens to a document (ALY-146): the Orders screen and the Credit
accounts screen show "Receipt RC-0042" beside a row when the sale made one.

Read only, one query for a whole page of rows, and only for a shop with the module on. A row
that has no document gets nothing, so a shop without Documents sees exactly what it saw before.
"""

import asyncpg


async def enabled(conn: asyncpg.Connection) -> bool:
    return bool(await conn.fetchval(
        "select enabled from tenant_modules where module_key = 'documents'"))


async def by_source(conn: asyncpg.Connection, source: str, refs: list[str]) -> dict[str, dict]:
    """The document a sale made, for each of these sources (`order` with the order's ID,
    `ledger_payment` with the ledger entry's, `booking`): {ref: {id, kind, number, status}}.
    An invoice wins over a receipt for the same order (the receipt of a payment against it
    points at the invoice, and the invoice is the order's own paper); a cancelled paper is
    still pointed at, with its status, so the owner can open it and see why."""
    if not refs or not await enabled(conn):
        return {}
    rows = await conn.fetch(
        "select id, kind, number, status, source_ref from documents "
        "where source = $1 and source_ref = any($2) and status <> 'draft' "
        "and kind in ('invoice', 'receipt', 'deposit_receipt') "
        "order by case kind when 'invoice' then 0 when 'receipt' then 1 else 2 end, seq",
        source, refs)
    found: dict[str, dict] = {}
    for r in rows:
        found.setdefault(r["source_ref"], {
            "id": str(r["id"]), "kind": r["kind"], "number": r["number"], "status": r["status"]})
    return found


async def hand_payments(conn: asyncpg.Connection, contact_id) -> dict[tuple, dict]:
    """The receipts of payments staff recorded by hand for one customer, keyed by what the
    ledger wrote for the same payment: (amount, instant). A payment by hand writes its ledger
    entry and its own record in one transaction, so the two share the instant to the
    microsecond; the receipt's source is the record, not the entry, and this is how the credit
    account row finds it."""
    if not await enabled(conn):
        return {}
    rows = await conn.fetch(
        "select m.amount_minor, m.recorded_at, d.id, d.kind, d.number, d.status "
        "from manual_payments m join documents d on d.id = m.receipt_document_id "
        "where m.contact_id = $1", contact_id)
    return {
        (r["amount_minor"], r["recorded_at"]): {
            "id": str(r["id"]), "kind": r["kind"], "number": r["number"], "status": r["status"]}
        for r in rows
    }
