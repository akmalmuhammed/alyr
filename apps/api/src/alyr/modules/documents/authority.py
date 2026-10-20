"""Who owns the numbers: ALYR or the shop's other system (ALY-142, spec 015).

Two systems must never both number the same kind of paper, or one sale is invoiced twice. So a
shop says, per kind of document, who numbers it:

* `alyr` (the default, and the only thing that exists without this setting): ALYR's gapless counter
  numbers it, exactly as in package 1.
* `external`: the shop's POS, accounting or invoicing tool numbers it. ALYR **never** allocates a
  number for that kind. A document of that kind is made from the other system's own data and
  carries that system's number (series "EXT"), which ALYR does not count or check for gaps. The
  page says it was issued by the seller's own system and delivered by ALYR.

The rule is kept in three places that do not trust each other: the draft and the issue refuse
(`require_alyr`, with a message a person can act on), the numbering code is only reached after
that, and the database refuses to issue an ALYR-numbered document of a kind the shop gave away
(migration 0043). Every change is on the activity record with who and from-to.

A statement is not here: ALYR draws it from its own ledger, so there is nothing to hand over.
"""

import asyncpg

from alyr.core import team
from alyr.core.team import Actor
from alyr.modules.documents import kinds, settings
from alyr.modules.documents.errors import DocumentError

AUTHORITIES = ("alyr", "external")
# Every kind a shop can hand to its other system.
KINDS = tuple(k for k in kinds.KINDS if k != "statement")


async def get_all(conn: asyncpg.Connection) -> dict[str, str]:
    """{kind: "alyr" | "external"} for every kind that can be handed over."""
    rows = await conn.fetch("select kind, authority from document_authority")
    chosen = {r["kind"]: r["authority"] for r in rows}
    return {kind: chosen.get(kind, "alyr") for kind in KINDS}


async def is_external(conn: asyncpg.Connection, kind: str) -> bool:
    return bool(await conn.fetchval(
        "select true from document_authority where kind = $1 and authority = 'external'", kind))


async def require_alyr(conn: asyncpg.Connection, kind: str) -> None:
    """ALYR numbers this kind, or this refuses with a message saying whose it is."""
    if await is_external(conn, kind):
        raise DocumentError("external_authority", 409, kind=kind)


async def _clash(conn: asyncpg.Connection, kind: str) -> str | None:
    """A number of the other system's that ALYR's own counter, for this kind, could reach: it
    starts with one of the kind's series prefixes. Giving numbering back to ALYR would then end
    in a refused issue, so the change is refused first and says which number."""
    for series in await conn.fetch("select prefix from document_series where kind = $1", kind):
        found = await conn.fetchval(
            "select number from documents where number_authority = 'external' "
            "and withdrawn_at is null and number like $1 limit 1",
            series["prefix"] + "-%")
        if found:
            return found
    return None


async def change(conn: asyncpg.Connection, actor: Actor, changes: dict[str, str]) -> dict:
    """Hand kinds to the other system or take them back. `changes` is {kind: authority}."""
    for kind, value in changes.items():
        if kind not in KINDS:
            raise DocumentError("kind_unknown", field=kind)
        if value not in AUTHORITIES:
            raise DocumentError("kind_unknown", field=kind)
    await settings.ensure(conn)
    before = await get_all(conn)
    shop = await settings.shop_id(conn)
    for kind, value in changes.items():
        if before[kind] == value:
            continue
        if value == "alyr":
            clash = await _clash(conn, kind)
            if clash:
                raise DocumentError("authority_number_clash", 409, kind=kind, number=clash)
        await conn.execute(
            "insert into document_authority (kind, authority, changed_by) values ($1, $2, $3) "
            "on conflict (tenant_id, kind) do update set authority = excluded.authority, "
            "changed_by = excluded.changed_by, changed_at = now()",
            kind, value, actor.name)
        await team.record(conn, settings.SUBJECT, shop, "authority_changed", actor, None,
                          {"kind": kind, "from": before[kind], "to": value})
    return await get_all(conn)
