"""Gapless document numbers: one counter per shop, document kind and series.

How it stays gapless. The counter is a row in `document_series`. Issuing a document, in its
own transaction, does three things in this order:

1. **Lock the counter's row** (`select ... for update`). Anyone else issuing the same series
   waits here until this transaction commits or rolls back. This is the whole reason two
   parallel issuances can never be given the same number, and it is the line the tests break
   on purpose to prove it.
2. Work out the next number from what the row says *now* (after the lock, so it is the latest
   committed value) and write it back.
3. Carry on with the issue: render the PDF, store it, write the hash. If anything after the lock
   fails, the transaction rolls back, the counter goes back with it, and the next person gets
   this number: nothing is skipped and nothing is left behind.

A number is a prefix, the year when the series restarts each year, and the count padded with
zeros: `INV-0042`, or `INV-2026-0042` in a series that begins again every January. A
sequence (a Postgres SEQUENCE) is not used on purpose: it would not roll back.

Three more guards sit in the database (migration 0033): the counter can only go up by one, a
number is unique per shop, and each issued document's position is unique per series.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import asyncpg

from alyr.modules.documents import kinds
from alyr.modules.documents.errors import DocumentError

# Kept as one named statement so the test that proves the lock matters can take it out.
LOCK_SERIES = (
    "select prefix, pad, yearly_reset, number_year, last_number from document_series "
    "where kind = $1 and series_key = $2 for update"
)


@dataclass(frozen=True)
class Allocation:
    series_key: str
    number: str
    seq: int
    number_year: int | None
    # The instant the document is issued, taken after the lock so that numbers and times
    # run in the same order.
    issued_at: datetime
    issue_date: date  # in the shop's time zone


async def allocate(
    conn: asyncpg.Connection, kind: str, series_key: str, tz: str,
    *, clock=lambda: datetime.now(UTC),
) -> Allocation:
    """Take the next number of a series, inside the caller's transaction."""
    row = await conn.fetchrow(LOCK_SERIES, kind, series_key)
    if row is None:
        # A series is made with its branch; one that is missing is made here, from the kind's
        # prefix and the branch's code. (A branch that does not exist has no series.)
        code = await conn.fetchval(
            "select code from document_branches where branch_key = $1", series_key)
        if code is None:
            raise DocumentError("series_unknown", 404)
        await conn.execute(
            "insert into document_series (kind, series_key, prefix) values ($1, $2, $3) "
            "on conflict do nothing", kind, series_key, kinds.KINDS[kind].prefix + code,
        )
        row = await conn.fetchrow(LOCK_SERIES, kind, series_key)
        if row is None:
            raise DocumentError("series_unknown", 404)

    issued_at = clock()
    issue_date = issued_at.astimezone(ZoneInfo(tz)).date()
    year = issue_date.year

    if row["yearly_reset"]:
        if row["number_year"] is not None and year < row["number_year"]:
            raise DocumentError("series_year_behind", 409)
        if row["number_year"] == year:
            seq = row["last_number"] + 1
        else:
            seq = 1
        number_year: int | None = year
        stem = f"{row['prefix']}-{year}-"
    else:
        seq = row["last_number"] + 1
        number_year = None
        stem = f"{row['prefix']}-"
    number = f"{stem}{seq:0{row['pad']}d}"

    await conn.execute(
        "update document_series set last_number = $3, number_year = $4 "
        "where kind = $1 and series_key = $2",
        kind, series_key, seq, number_year,
    )
    return Allocation(series_key, number, seq, number_year, issued_at, issue_date)
