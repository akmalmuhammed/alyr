"""Saved lines: what a shop writes on its invoices again and again (ALY-141, spec 016).

"AC repair, QAR 500" is typed once, saved with one tap ("save for next time") and offered as the
person starts typing the same words on the next invoice. A saved line is a name in each
language, a usual price and a unit. It is **not the Catalog**: no stock, no photos, no codes,
nothing a customer sees; a shop that has the Catalog on is offered its items as well
(`lookup.catalog_lines`), and a shop that has none still has its own list.

A saved line is a *seed*, like a Catalog line (spec 015): the form copies its words and price
into a line of the draft, and from then on the line belongs to the document. Changing a saved
line's price never changes a document, and issued paper never reads one.

Every function takes a tenant-scoped connection. Anyone on the team may use and save lines
(drafting is for everyone); they are the shop's, not a person's.
"""

from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.auth import Staff
from alyr.core.normalise import western_digits
from alyr.modules.documents import kinds, money
from alyr.modules.documents.errors import DocumentError

MAX_SAVED = 500
LIMIT = 30
_FOLD = "translate(lower({}), 'أإآىة', 'اااية')"
_COLUMNS = "id, name, name_ar, unit, price_minor, uses, last_used_at"


def _present(row: asyncpg.Record) -> dict:
    return {
        "id": str(row["id"]), "name": row["name"], "name_ar": row["name_ar"],
        "unit": row["unit"], "price_minor": row["price_minor"], "uses": row["uses"],
        "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
    }


def _clean(fields: dict) -> dict:
    name = " ".join(str(fields.get("name") or "").split())
    name_ar = " ".join(str(fields.get("name_ar") or "").split())
    if not (name or name_ar):
        raise DocumentError("saved_line_needs_text", field="name")
    if len(name) > 300 or len(name_ar) > 300:
        raise DocumentError("text_too_long", field="name")
    unit = fields.get("unit") or "piece"
    if unit not in kinds.UNITS:
        raise DocumentError("quantity_invalid", field="unit")
    price = fields.get("price_minor", 0)
    if isinstance(price, bool) or not isinstance(price, int) or not 0 <= price <= money.MAX_MINOR:
        raise DocumentError("amount_too_big", field="price_minor")
    return {"name": name, "name_ar": name_ar, "unit": unit, "price_minor": price}


async def listing(conn: asyncpg.Connection, q: str = "", limit: int = LIMIT) -> list[dict]:
    """Saved lines, the most used first (then the most recent); with `q`, those whose name in
    either language contains it, Arabic spellings folded."""
    q = " ".join((q or "").split())
    args: list = []
    where = "not archived"
    if q:
        args.append(western_digits(q))
        haystack = _FOLD.format("name || chr(32) || name_ar")
        where += f" and position({_FOLD.format('$1')} in {haystack}) > 0"
    rows = await conn.fetch(
        f"select {_COLUMNS} from saved_lines where {where} "
        f"order by uses desc, last_used_at desc nulls last, lower(name || name_ar) "
        f"limit ${len(args) + 1}", *args, max(1, min(limit, 200)))
    return [_present(r) for r in rows]


async def save(
    conn: asyncpg.Connection, staff: Staff, fields: dict, line_id: UUID | None = None,
) -> dict:
    """Save a line for next time, or change one. Saving the same words twice finds the line that
    is there and updates its price and unit (that is what "save for next time" on an invoice
    that used it again means)."""
    clean = _clean(fields)
    actor = team.actor_of(staff)
    if line_id is not None:
        row = await conn.fetchrow(
            f"update saved_lines set name = $2, name_ar = $3, unit = $4, price_minor = $5, "
            f"updated_at = now() where id = $1 and not archived returning {_COLUMNS}",
            line_id, clean["name"], clean["name_ar"], clean["unit"], clean["price_minor"])
        if row is None:
            raise DocumentError("saved_line_not_found", 404)
        return _present(row)
    if await conn.fetchval("select count(*) from saved_lines where not archived") >= MAX_SAVED:
        found = await conn.fetchval(
            "select id from saved_lines where not archived and lower(name) = lower($1) "
            "and lower(name_ar) = lower($2)", clean["name"], clean["name_ar"])
        if found is None:
            raise DocumentError("saved_lines_full", 409)
    row = await conn.fetchrow(
        "insert into saved_lines (name, name_ar, unit, price_minor, created_by) "
        "values ($1, $2, $3, $4, $5) "
        "on conflict (tenant_id, lower(name), lower(name_ar)) where not archived "
        "do update set unit = excluded.unit, price_minor = excluded.price_minor, "
        f"updated_at = now() returning {_COLUMNS}",
        clean["name"], clean["name_ar"], clean["unit"], clean["price_minor"], actor.name)
    return _present(row)


async def used(conn: asyncpg.Connection, ids: list[UUID]) -> int:
    """These lines were put on a document: they come earlier next time. Returns how many."""
    if not ids:
        return 0
    return len(await conn.fetch(
        "update saved_lines set uses = uses + 1, last_used_at = now() "
        "where id = any($1) and not archived returning id", ids))


async def archive(conn: asyncpg.Connection, line_id: UUID) -> None:
    """Take a line off the list. It is archived, not deleted: nothing a document says depends on
    it, but a line saved again with the same words starts from nothing."""
    done = await conn.fetchval(
        "update saved_lines set archived = true, updated_at = now() "
        "where id = $1 and not archived returning id", line_id)
    if done is None:
        raise DocumentError("saved_line_not_found", 404)
