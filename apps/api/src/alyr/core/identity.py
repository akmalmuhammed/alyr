"""Who is this? Contacts are identified by WhatsApp's business-scoped user ID (BSUID),
with the phone number as an optional attribute. See docs/decisions.md D-009.

Every function takes a tenant-scoped connection.
"""

import logging
from uuid import UUID

import asyncpg

from alyr.core import consent, team

log = logging.getLogger("alyr.identity")

_FIELDS = "id, name, role, lang, phone, wa_user_id, username, credit_limit, user_id"

# The owner's own test customer on their business's private test line is `TEST.<user>` (core/
# onboarding.py). A real customer's ID is a phone number or a WhatsApp ID, never this. The
# database marks the orders of such a contact `is_test` when they are made (migration 0056).
TEST_PREFIX = "TEST."


def is_test_user(wa_user_id: str | None) -> bool:
    return bool(wa_user_id) and wa_user_id.startswith(TEST_PREFIX)

# What happens to every table that points at a contact when two records turn out to be the
# same person (ALY-115). `tests/test_contact_merge.py` reads the database's own foreign keys
# and fails if a table is missing here, so a new table cannot be added without deciding.
#
# MOVE: the app may update these, so the rows are re-pointed at the record that stays.
MOVE = (
    "messages", "ledger_entries", "payment_requests", "orders", "bookings", "staff_changes",
)
# COPY: records the app can add to and read but never change or delete (the activity record,
# consent history, notes, sold-out asks). Moving is not allowed, so each row is copied to the
# survivor with every column as it was (read from the table, so a column added later comes
# too) and the duplicate's own rows go when it is deleted. (table, columns that change)
COPY = (
    ("consents", {}),
    ("inbox_notes", {}),
    ("sold_out_asks", {}),
    # An entry about a conversation or a credit account names the contact as its subject too.
    ("activity", {
        "subject_id": "case when subject in ('conversation', 'account') and subject_id = $2 "
                      "then $1 else subject_id end",
    }),
)
# Tables that are combined or left behind, and why.
#   ledger_accounts one chasing record per customer: the two are combined
#   chat_carts      one open cart per customer, and it expires on its own: the survivor's wins
#   stock_watches   one waiting watch per customer and item, and rows cannot be deleted: a watch
#                   the survivor already has is closed, the rest move
#   staff_pending   a staff member's open question; meaningless once the record is gone
SPECIAL = ("ledger_accounts", "chat_carts", "stock_watches", "staff_pending")
# Tables that keep a contact's ID with no foreign key, because their records are locked by
# triggers once issued (an invoice is never rewritten). The merge says where the ID went in
# `contact_merges`, so anything that lists a customer's documents or payments can follow it.
FROZEN = ("documents", "manual_payments", "document_deliveries", "connect_sales")
# The trail itself points at the survivor, and moves with it if that record is merged later.
TRAIL = "contact_merges"
HANDLED = frozenset(MOVE) | {t for t, _ in COPY} | frozenset(SPECIAL) | {TRAIL}

# A withdrawal always wins; otherwise a grant on either record counts.
_RANK = {"unknown": 0, "granted": 1, "revoked": 2}


async def resolve_contact(
    conn: asyncpg.Connection,
    phone: str = "",
    user_id: str = "",
    username: str = "",
    profile_name: str = "",
) -> asyncpg.Record:
    """Find the contact a message came from, creating it on first contact.

    Matches on user ID first, then phone, and fills in whichever identifier was missing.
    If the user ID and the phone turn out to belong to two separate records (a contact
    imported by phone, and the same person arriving later by username), they are merged.
    """
    if not (phone or user_id):
        raise ValueError("need a phone number or a user id")
    by_id = by_phone = None
    if user_id:
        by_id = await conn.fetchrow(
            f"select {_FIELDS} from contacts where wa_user_id = $1", user_id
        )
    if phone:
        by_phone = await conn.fetchrow(f"select {_FIELDS} from contacts where phone = $1", phone)

    if by_id and by_phone and by_id["id"] != by_phone["id"]:
        contact = await _merge(conn, keep=by_phone, drop=by_id, user_id=user_id)
    elif by_id or by_phone:
        contact = by_id or by_phone
    else:
        name = profile_name or username or (f"+{phone}" if phone else "WhatsApp customer")
        return await conn.fetchrow(
            f"insert into contacts (phone, wa_user_id, username, name) "
            f"values ($1, $2, $3, $4) returning {_FIELDS}",
            phone or None, user_id or None, username or None, name,
        )

    return await conn.fetchrow(
        "update contacts set "
        "  phone = coalesce(phone, $2), "
        "  wa_user_id = coalesce($3, wa_user_id), "
        "  username = coalesce($4, username) "
        f"where id = $1 returning {_FIELDS}",
        contact["id"], phone or None, user_id or None, username or None,
    )


async def _merge(conn, keep: asyncpg.Record, drop: asyncpg.Record, user_id: str):
    """Fold `drop` into `keep` without losing anything that matters. The phone record is
    kept because it is the one the merchant created or imported and the one the ledger
    hangs on.

    Above all this must never lose a customer's STOP: the consent history is copied to the
    survivor and the stricter state wins (ALY-115)."""
    keep_id, drop_id = keep["id"], drop["id"]
    # Two messages from one person can start this at the same moment. Lock both rows in a
    # fixed order; if the other one has already done the merge, there is nothing left to do.
    locked = {
        r["id"]
        for r in await conn.fetch(
            "select id from contacts where id = any($1::uuid[]) order by id for update",
            [keep_id, drop_id],
        )
    }
    if keep_id in locked and drop_id in locked:
        moved = await _fold(conn, keep_id, drop_id)
        await _remember(conn, keep_id, drop_id, moved)
        log.info("merged two records for one WhatsApp user")
    return await conn.fetchrow(
        f"update contacts set wa_user_id = $2 where id = $1 returning {_FIELDS}",
        keep_id, user_id,
    )


def _count(status: str) -> int:
    return int(status.rsplit(" ", 1)[-1])


async def _fold(conn: asyncpg.Connection, keep_id: UUID, drop_id: UUID) -> dict[str, int]:
    moved: dict[str, int] = {}
    for table in MOVE:
        moved[table] = _count(await conn.execute(
            f"update {table} set contact_id = $1 where contact_id = $2", keep_id, drop_id
        ))
    for table, changes in COPY:
        moved[table] = await _copy(conn, table, keep_id, drop_id, changes)
    await conn.execute(
        "update contact_merges set kept_contact_id = $1 where kept_contact_id = $2",
        keep_id, drop_id,
    )
    await _merge_stock_watches(conn, keep_id, drop_id)
    await _merge_consent(conn, keep_id, drop_id)
    await _merge_ledger_account(conn, keep_id, drop_id)
    await _merge_contact_fields(conn, keep_id, drop_id)
    # The survivor's open cart wins; otherwise the duplicate's cart comes across.
    await conn.execute(
        "delete from chat_carts where contact_id = $2 "
        "and exists (select 1 from chat_carts where contact_id = $1)",
        keep_id, drop_id,
    )
    moved["chat_carts"] = _count(await conn.execute(
        "update chat_carts set contact_id = $1 where contact_id = $2", keep_id, drop_id
    ))
    # What is left on the duplicate (its own copied rows, its combined ledger account, a
    # staff question) goes with it.
    await conn.execute("delete from contacts where id = $1", drop_id)
    return {k: v for k, v in moved.items() if v}


async def _copy(
    conn: asyncpg.Connection, table: str, keep_id: UUID, drop_id: UUID, changes: dict[str, str]
) -> int:
    """Copy every row of the duplicate in an append-only table to the survivor, column for
    column. `id` is left to its default; a row the survivor already has (the table's own
    key) is skipped."""
    columns = [
        r["column_name"] for r in await conn.fetch(
            "select column_name from information_schema.columns "
            "where table_schema = 'public' and table_name = $1 and column_name <> 'id' "
            "order by ordinal_position",
            table,
        )
    ]
    select = ", ".join(
        "$1" if c == "contact_id" else changes.get(c, c) for c in columns
    )
    status = await conn.execute(
        f"insert into {table} ({', '.join(columns)}) select {select} from {table} "
        "where contact_id = $2 on conflict do nothing",
        keep_id, drop_id,
    )
    return _count(status)


async def _merge_stock_watches(conn: asyncpg.Connection, keep_id: UUID, drop_id: UUID) -> None:
    """A customer waits for one item once. If both records were waiting for the same item the
    duplicate's watch is closed, not deleted (the app cannot delete them), and the rest move."""
    await conn.execute(
        "update stock_watches y set status = 'cancelled', closed_at = now(), "
        "reason = 'merged' where y.contact_id = $2 and y.status = 'waiting' and exists "
        "(select 1 from stock_watches x where x.contact_id = $1 and x.item_id = y.item_id "
        " and x.status = 'waiting')",
        keep_id, drop_id,
    )
    await conn.execute(
        "update stock_watches set contact_id = $1 where contact_id = $2", keep_id, drop_id
    )


async def _merge_consent(conn: asyncpg.Connection, keep_id: UUID, drop_id: UUID) -> None:
    """Keep every consent record, and the stricter current state for each purpose.

    The duplicate's consent rows were already copied across with their original times (the app
    cannot update them). For each purpose, a withdrawal on either record wins;
    failing that, a grant on either counts; a purpose neither had decided stays unknown. If
    that differs from where the survivor stood, it is written as a new, visible consent
    record, so the history still ends where the state is."""
    both = await conn.fetch(
        f"select id, {', '.join(consent.COLUMNS.values())} from contacts "
        "where id = any($1::uuid[])",
        [keep_id, drop_id],
    )
    for purpose, column in consent.COLUMNS.items():
        states = {r["id"]: r[column] for r in both}
        strictest = max(states.values(), key=_RANK.__getitem__)
        if strictest != states[keep_id]:
            await consent.record(
                conn, keep_id, purpose, strictest, source="merge",
                wording="Two records for this customer were merged; the stricter state was kept.",
            )


async def _merge_ledger_account(conn: asyncpg.Connection, keep_id: UUID, drop_id: UUID) -> None:
    """One chasing record for the customer: the later promise and reminder, the sum of the
    reminders sent, and whoever was responsible (the survivor's person first)."""
    await conn.execute(
        "insert into ledger_accounts (contact_id, promised_until, last_reminded_at, "
        "reminder_count, assigned_to) "
        "select $1, max(promised_until), max(last_reminded_at), "
        "coalesce(sum(reminder_count), 0), "
        "(array_agg(assigned_to order by (contact_id = $1) desc) "
        " filter (where assigned_to is not null))[1] "
        "from ledger_accounts where contact_id in ($1, $2) "
        "having count(*) > 0 "
        "on conflict (contact_id) do update set "
        "promised_until = excluded.promised_until, "
        "last_reminded_at = excluded.last_reminded_at, "
        "reminder_count = excluded.reminder_count, assigned_to = excluded.assigned_to",
        keep_id, drop_id,
    )
    await conn.execute("delete from ledger_accounts where contact_id = $1", drop_id)


async def _merge_contact_fields(conn: asyncpg.Connection, keep_id: UUID, drop_id: UUID) -> None:
    """What the duplicate knew that the survivor does not. The survivor's own value wins
    wherever both have one; a conversation stays open, and the assistant stays paused, if
    either was. A staff phone's link to a login (D-065) moves to the survivor if it has none;
    it is taken off the duplicate first, because a login has one number per shop."""
    link = await conn.fetchrow(
        "update contacts set user_id = null, verified_at = null "
        "where id = $1 and user_id is not null returning user_id, verified_at",
        drop_id,
    )
    await conn.execute(
        "update contacts k set "
        "  last_inbound_at = greatest(k.last_inbound_at, d.last_inbound_at), "
        "  inbox_read_at = greatest(k.inbox_read_at, d.inbox_read_at), "
        "  inbox_status = case when 'open' in (k.inbox_status, d.inbox_status) "
        "                      then 'open' else 'closed' end, "
        "  assistant_paused = k.assistant_paused or d.assistant_paused, "
        "  assigned_to = coalesce(k.assigned_to, d.assigned_to), "
        "  price_group_id = coalesce(k.price_group_id, d.price_group_id), "
        "  email = coalesce(k.email, d.email), "
        "  username = coalesce(k.username, d.username), "
        "  number_id = coalesce(k.number_id, d.number_id), "
        "  credit_limit = case when k.credit_limit > 0 then k.credit_limit "
        "                      else d.credit_limit end, "
        "  role = case when 'staff' in (k.role, d.role) then 'staff' else 'customer' end, "
        "  weekly_report = k.weekly_report or d.weekly_report, "
        "  catalog_manager = k.catalog_manager or d.catalog_manager "
        "from contacts d where k.id = $1 and d.id = $2",
        keep_id, drop_id,
    )
    if link is not None:
        await conn.execute(
            "update contacts set user_id = $2, verified_at = $3 "
            "where id = $1 and user_id is null",
            keep_id, link["user_id"], link["verified_at"],
        )


async def _remember(
    conn: asyncpg.Connection, keep_id: UUID, drop_id: UUID, moved: dict[str, int]
) -> None:
    """Leave the trail: the redirect for records that are locked, and a line on the
    customer's record that the owner can read."""
    await conn.execute(
        "insert into contact_merges (kept_contact_id, dropped_contact_id, moved) "
        "values ($1, $2, $3)",
        keep_id, drop_id, moved,
    )
    await team.record(
        conn, "conversation", keep_id, "contacts_merged", team.ASSISTANT,
        contact_id=keep_id, detail={"moved": moved},
    )


async def apply_user_id_update(conn: asyncpg.Connection, previous: str, current: str) -> bool:
    """Meta says a customer's user ID changed. Keep the contact and its history."""
    updated = await conn.execute(
        "update contacts set wa_user_id = $2 where wa_user_id = $1", previous, current
    )
    return updated == "UPDATE 1"
