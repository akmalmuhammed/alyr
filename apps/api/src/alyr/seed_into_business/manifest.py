"""What one load wrote, and taking exactly that out again (spec 063, decision D-150).

The load never says which rows it wrote: whatever the product's services insert along the way
(an item's variants, an order's activity, a document's lines and its PDF) lands in the business's
tables on its own. So the load is measured from outside. Before it starts, the primary keys of
every row the business has are written down (and, for the few tables the load is allowed to
change in place, the rows themselves). When it ends, the same is done again. A key that is new
is the load's. A row that changed is the load's too, but only in the tables of `RESTORABLE`, and
only the columns that changed are kept (their old values), so `--remove` can put them back. A
change in any other table makes the load stop and take itself out again: the load is allowed to
add rows, never to alter what the business already had.

`remove` deletes the new keys, child tables first, puts the changed columns back, and leaves
every other row of the business as it was. It runs as the database owner, because the product's
own role may not delete a stock movement, an activity line or an issued document (those tables
refuse it by design); the one door through the guards of issued documents is the one the
erasure job uses (migration 0083), opened for this business only, inside this transaction only.
Every statement names the business as well, so a mistake cannot reach another one.
"""

import json
from dataclasses import dataclass, field
from uuid import UUID

import asyncpg

from alyr.demo import build
from alyr.demo.build import Refused

SEP = "\x1f"
# Tables with a `tenant_id` that the diff does not look at: the job queue (checked on its own),
# this file's own record, sessions, and counters the product keeps up to date by itself.
IGNORED = {"jobs", "demo_seed_runs", "sessions", "media_usage", "processed_messages",
           "staff_link_codes", "erasing_businesses"}
# Tables whose existing rows the load may change, because the product's own services do it when
# something is added (a counter moves, a category is re-ordered, a module is switched on).
RESTORABLE = {
    "shop_settings", "document_settings", "document_series", "document_branches",
    "item_code_counters", "items", "item_categories", "tenant_modules", "shop_features",
    "delivery_settings", "services", "business_hours", "price_groups", "memberships",
}


class Unexpected(Refused):
    """The load changed something it must not change. It was taken out again."""


@dataclass
class Snapshot:
    keys: dict[str, dict[str, str]] = field(default_factory=dict)  # table -> {pk: md5}
    rows: dict[str, dict[str, dict]] = field(default_factory=dict)  # restorable: {pk: row}


async def primary_keys(conn: asyncpg.Connection) -> dict[str, list[str]]:
    """Every table with a `tenant_id`, with the columns of its primary key. A table without one
    cannot be taken out exactly, so it is an error here, not a guess."""
    names = [t for t in await build._tables_to_empty(conn) if t not in IGNORED]
    out: dict[str, list[str]] = {}
    for table in names:
        cols = await conn.fetchval(
            "select array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum)) "
            "from pg_index i join pg_attribute a on a.attrelid = i.indrelid "
            "and a.attnum = any(i.indkey) where i.indrelid = format('public.%I', $1::text)::regclass "
            "and i.indisprimary", table,
        )
        if not cols:
            raise Refused(f"the table {table} has no primary key, so a load into it could not "
                          "be taken out exactly")
        out[table] = list(cols)
    return out


def key_sql(cols: list[str]) -> str:
    return "concat_ws(E'\\x1f', " + ", ".join(f'x."{c}"::text' for c in cols) + ")"


async def take(conn: asyncpg.Connection, tenant_id: UUID, pks: dict[str, list[str]]) -> Snapshot:
    """Write down the business's rows. `conn` is any connection that may read them."""
    snap = Snapshot()
    for table, cols in pks.items():
        key = key_sql(cols)
        if table in RESTORABLE:
            found = await conn.fetch(
                f'select {key} as pk, to_jsonb(x) as row from "{table}" x where x.tenant_id = $1',
                tenant_id,
            )
            snap.rows[table] = {r["pk"]: r["row"] for r in found}
            snap.keys[table] = {r["pk"]: "" for r in found}
        else:
            found = await conn.fetch(
                f'select {key} as pk, md5(x::text) as h from "{table}" x where x.tenant_id = $1',
                tenant_id,
            )
            snap.keys[table] = {r["pk"]: r["h"] for r in found}
    return snap


def diff(before: Snapshot, after: Snapshot, strict: bool = True) -> tuple[dict[str, list[str]], dict[str, list[dict]]]:
    """(the keys that are new, per table; the changed columns of existing rows, per table).
    Raises `Unexpected` for a row that vanished or changed where it must not."""
    inserted: dict[str, list[str]] = {}
    restore: dict[str, list[dict]] = {}
    for table, now in after.keys.items():
        was = before.keys.get(table, {})
        new = sorted(set(now) - set(was))
        if new:
            inserted[table] = new
        gone = set(was) - set(now)
        if gone and strict:
            raise Unexpected(f"the load removed {len(gone)} existing row(s) of {table}")
        if table in RESTORABLE:
            for pk, old in before.rows.get(table, {}).items():
                new_row = after.rows[table].get(pk)
                if new_row is None:
                    continue
                changed = {c: old[c] for c in old if old[c] != new_row.get(c)}
                if changed:
                    restore.setdefault(table, []).append({"pk": pk, "old": changed})
        elif strict:
            changed_keys = [pk for pk, h in was.items() if pk in now and now[pk] != h]
            if changed_keys:
                raise Unexpected(
                    f"the load changed {len(changed_keys)} existing row(s) of {table}, which "
                    "it must never do"
                )
    return inserted, restore


def counts_of(inserted: dict[str, list[str]]) -> dict[str, int]:
    return {t: len(v) for t, v in inserted.items()}


async def remove(conn: asyncpg.Connection, tenant_id: UUID, manifest: dict) -> dict[str, int]:
    """Take out what the manifest lists. `conn` is the owner's connection, inside one transaction
    that the caller commits; everything is scoped by `tenant_id`. Returns rows deleted per table."""
    inserted: dict[str, list[str]] = manifest.get("inserted", {})
    pks = await primary_keys(conn)
    order = [t for t in await build._tables_to_empty(conn) if t in inserted]
    deleted: dict[str, int] = {}
    # The door through the guards of issued documents and recorded payments, for this business
    # and this transaction only (migration 0083, the same one the erasure job uses).
    await conn.execute(
        "insert into erasing_businesses (business_id) values ($1) on conflict do nothing",
        tenant_id,
    )
    for table in order:
        done = await conn.execute(
            f'delete from "{table}" x where x.tenant_id = $1 and {key_sql(pks[table])} = any($2::text[])',
            tenant_id, inserted[table],
        )
        deleted[table] = int(done.split()[-1])
    await conn.execute("delete from erasing_businesses where business_id = $1", tenant_id)
    for table, rows in manifest.get("restore", {}).items():
        if table == "document_series":
            await _restore_series(conn, tenant_id, pks[table], rows)
            continue
        for row in rows:
            await _restore_row(conn, tenant_id, table, pks[table], row)
    return deleted


async def _restore_row(conn, tenant_id: UUID, table: str, cols: list[str], row: dict) -> None:
    image = json.dumps(row["old"])
    for column in row["old"]:
        await conn.execute(
            f'update "{table}" x set "{column}" = (jsonb_populate_record(null::"{table}", $3::jsonb))."{column}" '
            f"where x.tenant_id = $1 and {key_sql(cols)} = $2",
            tenant_id, row["pk"], image,
        )


async def _restore_series(conn, tenant_id: UUID, cols: list[str], rows: list[dict]) -> None:
    """A numbering series refuses to count down, by trigger. After the load's documents are gone
    the counter goes back to where it was, so the next document is numbered as if the load had
    never run: with the trigger off for this one transaction (`alter table` is transactional, and
    only the table's owner can do it, which is who runs this)."""
    await conn.execute("alter table document_series disable trigger document_series_guard")
    try:
        for row in rows:
            await _restore_row(conn, tenant_id, "document_series", cols, row)
    finally:
        await conn.execute("alter table document_series enable trigger document_series_guard")
