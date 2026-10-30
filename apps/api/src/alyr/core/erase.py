"""Erasing a stopped client's data, 60 days after it stops (spec 042, decision D-116).

The privacy notice ("How long we keep it") promises it: "60 days after it stops, we delete its
data, except what the law requires us to keep, such as our invoices to it. Copies in our backups
are gone within 35 days after that." Until this file nothing carried the promise.

**The clock** is `clients.cancels_on`, the day a cancellation takes effect (`core/subscription.py`,
D-082). A client whose `cancels_on` is `erase_after_days` or more in the past (60, never below
31) is due. Undoing the cancellation before then empties `cancels_on` and the client is never
due; it keeps everything. A client's businesses are erased together.

**Who runs it.** The daily job `python -m alyr.erase_job`, as the database owner. The
application's role cannot delete a business and the worker no longer holds the owner's address
(ALY-268), so nothing that is always on can run this. It reports and changes nothing unless the
switch `ALYR_ERASE_STOPPED_CLIENTS` is on (a dry run is the default).

**What happens to each table** is `core/erase_rules.py`, a rule for every table; the tests read
the database and fail when one is missing. One business is erased in one transaction: everything
goes, or nothing does. Inside it the business is named in `erasing_businesses`, the narrow door
through the guards of issued documents and recorded payments (migration 0083); nobody else can
use it. The same transaction writes the receipt (counts only) and queues the photo store's
prefix for the worker (`remove_files`), which holds the store's keys; the job does not.

Safe to run again and again: a business that is gone is not there to erase, a client that is
done is not due, and a run that stopped halfway finishes the rest next time.
"""

import hashlib
import json
import logging
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.config import Settings, get_settings
from alyr.core import erase_rules as rules
from alyr.core.storage import Store, StoreError, valid_key
from alyr.db import Database

log = logging.getLogger("alyr.erase")

QATAR = ZoneInfo("Asia/Qatar")
# The 30 days a business has to download its copy are always over first.
MIN_DAYS = 31
# ALYR's own business is never erased, whatever the data says.
PROTECTED_SLUGS = ("alyr",)
ACTOR = "ALYR erasure job"
# A lock held by the live product for longer than this stops the business's erasure; the next
# run tries again. Waiting longer would hold up the shop's customers instead.
LOCK_TIMEOUT = "15s"
# Objects the worker removes from the photo store in one pass for one business.
FILES_PER_PASS = 500
# A hold's reason travels in the job's arguments, which Google logs: a reference, not a story.
MAX_HOLD = 80

_NAME = re.compile(r"[a-z][a-z0-9_]*")
_VALUE = re.compile(r"''|null")


class NotDue(Exception):
    """The client or business should not be erased now (undone, held, protected, already done).
    The message says why and holds no personal data."""


def today() -> date:
    return datetime.now(QATAR).date()


def after_days(settings: Settings) -> int:
    return max(settings.erase_after_days, MIN_DAYS)


def rules_version() -> str:
    """A short fingerprint of the rules that ran, written on every receipt."""
    text = json.dumps(
        {t: [r.kind, r.by, [list(s) for s in r.scrub]] for t, r in sorted(rules.RULES.items())}
    )
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def _check_names() -> None:
    """Table and column names go into SQL text: refuse anything but plain lowercase names."""
    for table, rule in rules.RULES.items():
        names = [table, rule.by, *(c for c, _ in rule.scrub)]
        if not all(_NAME.fullmatch(n) for n in names if n):
            raise RuntimeError(f"erase rules: odd name in {table}")
        if not all(_VALUE.fullmatch(v) for _, v in rule.scrub):
            raise RuntimeError(f"erase rules: odd value in {table}")


_check_names()


# ── connections ──────────────────────────────────────────────────────────────────────────


@asynccontextmanager
async def office(db: Database, *, readonly: bool = False) -> AsyncIterator[asyncpg.Connection]:
    """One transaction as ALYR itself, on the owner's connection. A read-only one cannot write,
    so a dry run cannot change anything even by mistake."""
    async with db.unscoped() as conn, conn.transaction(readonly=readonly):
        await conn.execute("select set_config('app.platform_admin', 'on', true)")
        yield conn


@asynccontextmanager
async def scoped(
    db: Database, business_id: UUID, *, readonly: bool = False
) -> AsyncIterator[asyncpg.Connection]:
    """The same, with the business in scope (the owner's role may be subject to row-level
    security where the host does not let it bypass it)."""
    async with office(db, readonly=readonly) as conn:
        await conn.execute("select set_config('app.tenant_id', $1, true)", str(business_id))
        if not readonly:
            await conn.execute(f"set local lock_timeout = '{LOCK_TIMEOUT}'")
        yield conn


# ── the order tables are deleted in ──────────────────────────────────────────────────────


async def delete_order(conn: asyncpg.Connection) -> list[tuple[str, rules.Rule]]:
    """The tables to delete from, a table after every table that points at it, worked out from
    the database's own foreign keys. A table that points at itself is deleted in one statement,
    which the database checks at its end."""
    tables = {t for t, r in rules.RULES.items() if r.kind == rules.DELETE}
    waits: dict[str, set[str]] = {t: set() for t in tables}
    for fk in await conn.fetch(
        "select conrelid::regclass::text as child, confrelid::regclass::text as parent "
        "from pg_constraint where contype = 'f'"
    ):
        if fk["child"] in tables and fk["parent"] in tables and fk["child"] != fk["parent"]:
            waits[fk["parent"]].add(fk["child"])
    order: list[str] = []
    state: dict[str, int] = {}

    def visit(table: str, trail: tuple[str, ...]) -> None:
        if state.get(table) == 2:
            return
        if state.get(table) == 1:
            raise RuntimeError(f"erase: tables point at each other: {' > '.join(trail)}")
        state[table] = 1
        for child in sorted(waits[table]):
            visit(child, (*trail, child))
        state[table] = 2
        order.append(table)

    for table in sorted(tables):
        visit(table, (table,))
    return [(t, rules.RULES[t]) for t in order]


async def unruled_tables(conn: asyncpg.Connection) -> list[str]:
    """Tables the database has that `erase_rules.RULES` does not name, and rules for tables the
    database does not have. While there are any, nothing is erased: a table nobody decided about
    could hold a business's data that a run would then report as erased."""
    have = {r["table_name"] for r in await conn.fetch(
        "select table_name from information_schema.tables "
        "where table_schema = 'public' and table_type = 'BASE TABLE'")}
    return sorted(have ^ set(rules.RULES))


# ── what is due, and what stops it ───────────────────────────────────────────────────────

DUE = (
    "select id, cancels_on, erase_hold from clients "
    "where cancels_on is not null and erased_at is null and cancels_on + $2::int <= $1::date "
    "and ($3::uuid[] is null or id = any($3)) order by cancels_on, id"
)


async def refusal(conn: asyncpg.Connection, client_id: UUID, hold: str) -> str:
    """Why this client must not be erased now, or "". A hold set by a person; a card
    subscription still running at the provider (it would keep charging a client whose data is
    gone); a business made after the cancellation was asked for; ALYR's own business."""
    if hold:
        return "held"
    # A business made after the cancellation was asked for (a sign-up again under the same client)
    # is not part of it: erasing it with the rest would delete a live business. A person decides.
    if await conn.fetchval(
        "select true from tenants t join clients c on c.id = t.client_id "
        "where c.id = $1 and c.cancel_requested_at is not null "
        "and t.created_at > c.cancel_requested_at limit 1", client_id,
    ):
        return "business_made_after_the_cancellation"
    if await conn.fetchval(
        "select true from card_checkouts where client_id = $1 and subscription_ref is not null "
        "and coalesce(subscription_status, '') <> 'canceled' limit 1", client_id,
    ):
        return "card_subscription_running"
    if await conn.fetchval(
        "select true from tenants where client_id = $1 and slug = any($2) limit 1",
        client_id, list(PROTECTED_SLUGS),
    ):
        return "protected_business"
    return ""


async def _count(
    conn: asyncpg.Connection, tables: list[tuple[str, rules.Rule]], key: UUID
) -> dict[str, int]:
    out = {}
    for table, rule in tables:
        n = await conn.fetchval(f'select count(*) from "{table}" where "{rule.by}" = $1', key)
        if n:
            out[table] = n
    return out


def _kept_tables(*, by: set[str]) -> list[tuple[str, rules.Rule]]:
    return [(t, r) for t, r in sorted(rules.RULES.items())
            if r.kind in (rules.KEEP, rules.SCRUB) and r.by in by]


# ── one business, in one transaction ─────────────────────────────────────────────────────


async def erase_business(
    db: Database, client_id: UUID, business_id: UUID, order: list[tuple[str, rules.Rule]],
    *, on: date, days: int,
) -> dict | None:
    """Erase one business and write its receipt. Answers the receipt's counts, or None when the
    business was already gone. Raises NotDue when the client should not be erased now: this is
    checked again here, with the client's row locked, so an undo that commits first wins and an
    undo that comes after is refused (`subscription.undo_cancel`)."""
    async with scoped(db, business_id) as conn:
        client = await conn.fetchrow(
            "select cancels_on, erased_at, erase_hold from clients where id = $1 for update",
            client_id,
        )
        if client is None or client["erased_at"] is not None or client["cancels_on"] is None:
            raise NotDue("not stopped")
        if client["cancels_on"] + timedelta(days=days) > on:
            raise NotDue("not yet")
        why = await refusal(conn, client_id, client["erase_hold"])
        if why:
            raise NotDue(why)
        business = await conn.fetchrow(
            "select business_type, live_at from tenants "
            "where id = $1 and client_id = $2 for update", business_id, client_id,
        )
        if business is None:
            return None
        # From the first business on, the cancellation cannot be undone or asked again, even if
        # the others wait for another night: a client half erased is not one to bring back.
        await conn.execute(
            "update clients set erase_started_at = coalesce(erase_started_at, now()) "
            "where id = $1", client_id,
        )
        members = [r["user_id"] for r in await conn.fetch(
            "select user_id from memberships where tenant_id = $1", business_id)]
        kept = await _count(conn, _kept_tables(by={"tenant_id", "business_id"}), business_id)
        await conn.execute("insert into erasing_businesses (business_id) values ($1)", business_id)
        deleted: dict[str, int] = {}
        for table, rule in order:
            done = await conn.execute(f'delete from "{table}" where "{rule.by}" = $1', business_id)
            if int(done.split()[-1]):
                deleted[table] = int(done.split()[-1])
        scrubbed = await _scrub(conn, business_id)
        people = await _erase_people(conn, members)
        await conn.execute("delete from erasing_businesses where business_id = $1", business_id)

        # The photo store is emptied by the worker, which holds its keys.
        await conn.execute(
            "insert into erasure_files (business_id, prefix) values ($1, $2) "
            "on conflict do nothing", business_id, f"shops/{business_id}/",
        )
        went_live = business["live_at"].astimezone(QATAR).date() if business["live_at"] else None
        receipt = await conn.fetchval(
            "insert into erasure_receipts (scope, client_id, business_id, business_type, "
            "went_live_on, stopped_on, deleted, kept, scrubbed, people, rules) "
            "values ('business', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id",
            client_id, business_id, business["business_type"], went_live, client["cancels_on"],
            deleted, kept, scrubbed, people, rules_version(),
        )
        await _audit(conn, "business.erased", client_id, business_id,
                     {"rows": sum(deleted.values()), "receipt": str(receipt)})
        return {"deleted": deleted, "kept": kept, "scrubbed": scrubbed, "people": people}


async def _scrub(conn: asyncpg.Connection, business_id: UUID) -> dict[str, int]:
    out = {}
    for table, rule in _kept_tables(by={"tenant_id", "business_id"}):
        if rule.kind != rules.SCRUB:
            continue
        sets = ", ".join(f'"{column}" = {value}' for column, value in rule.scrub)
        done = await conn.execute(
            f'update "{table}" set {sets} where "{rule.by}" = $1', business_id
        )
        if int(done.split()[-1]):
            out[table] = int(done.split()[-1])
    return out


async def _erase_people(conn: asyncpg.Connection, members: list[UUID]) -> dict[str, int]:
    """The people who belonged to the business, once its memberships are gone. Someone who
    still belongs to another business, and ALYR's own staff, are not touched. Anyone else is
    deleted, or made anonymous when a record ALYR keeps points at them."""
    out = {"deleted": 0, "anonymised": 0, "still_in_another_business": 0, "staff": 0}
    staff = {r["email"] for r in await conn.fetch(
        "select lower(email) as email from platform_admins")}
    for user_id in members:
        user = await conn.fetchrow("select email from users where id = $1 for update", user_id)
        if user is None:
            continue
        # Row-level security shows a membership of another business only to that person; the
        # owner's role may be subject to it where the host does not let it bypass.
        await conn.execute("select set_config('app.user_id', $1, true)", str(user_id))
        if await conn.fetchval("select true from memberships where user_id = $1 limit 1", user_id):
            out["still_in_another_business"] += 1
            continue
        if user["email"].lower() in staff:
            out["staff"] += 1
            continue
        await conn.execute("delete from sessions where user_id = $1", user_id)
        for table in ("login_codes", "signup_tokens"):
            await conn.execute(f"delete from {table} where lower(email) = lower($1)", user["email"])
        pointed_at = False
        for table, column in rules.USER_REFERENCES:
            if await conn.fetchval(
                f'select true from "{table}" where "{column}" = $1 limit 1', user_id
            ):
                pointed_at = True
        if pointed_at:
            await conn.execute(
                "update users set email = 'erased-' || id::text || '@erased.invalid', "
                "name = '', name_ar = '', last_tenant_id = null where id = $1", user_id,
            )
            out["anonymised"] += 1
        else:
            await conn.execute("delete from users where id = $1", user_id)
            out["deleted"] += 1
    return out


async def _audit(
    conn: asyncpg.Connection, action: str, client_id: UUID, business_id: UUID | None,
    detail: dict,
) -> None:
    await conn.execute(
        "insert into platform_audit (staff_email, staff_name, action, subject_type, subject_id, "
        "client_id, business_id, detail) values ('', $1, $2, $3, $4, $5, $6, $7)",
        ACTOR, action, "business" if business_id else "client",
        str(business_id or client_id), client_id, business_id, detail,
    )


# ── the client's own details, once its businesses are gone ───────────────────────────────


async def finish_client(db: Database, client_id: UUID, *, on: date, days: int) -> bool:
    """When none of the client's businesses is left, blank its contact details and mark it
    erased. Answers whether it did. Refuses, like a business, when the client is held or undone."""
    async with office(db) as conn:
        await conn.execute(f"set local lock_timeout = '{LOCK_TIMEOUT}'")
        client = await conn.fetchrow(
            "select cancels_on, erased_at, erase_hold from clients where id = $1 for update",
            client_id,
        )
        if client is None or client["erased_at"] is not None or client["cancels_on"] is None:
            return False
        if client["cancels_on"] + timedelta(days=days) > on or client["erase_hold"]:
            return False
        if await conn.fetchval("select true from tenants where client_id = $1 limit 1", client_id):
            return False
        scrubbed = {}
        for table, rule in _kept_tables(by={"id"}):
            sets = ", ".join(f'"{column}" = {value}' for column, value in rule.scrub)
            await conn.execute(f'update "{table}" set {sets} where "{rule.by}" = $1', client_id)
            scrubbed[table] = 1
        await conn.execute("update clients set erased_at = now() where id = $1", client_id)
        kept = await _count(conn, _kept_tables(by={"client_id"}), client_id)
        await conn.execute(
            "insert into erasure_receipts (scope, client_id, stopped_on, kept, scrubbed, rules) "
            "values ('client', $1, $2, $3, $4, $5)",
            client_id, client["cancels_on"], kept, scrubbed, rules_version(),
        )
        await _audit(conn, "client.erased", client_id, None, {})
        return True


# ── a hold: a person's reason not to erase a client yet ──────────────────────────────────


async def hold(db: Database, client_id: UUID, reason: str) -> bool:
    """Stop the client being erased until released. Answers whether it was set."""
    reason = reason.strip()
    if not reason:
        raise ValueError("say why the client is held")
    if len(reason) > MAX_HOLD:
        raise ValueError(f"give a short reference, {MAX_HOLD} characters at most, not a name")
    async with office(db) as conn:
        done = await conn.fetchval(
            "update clients set erase_hold = $2, erase_hold_at = now() "
            "where id = $1 and erased_at is null returning true", client_id, reason,
        )
        if done:
            await _audit(conn, "client.erase_hold", client_id, None, {})
        return bool(done)


async def release(db: Database, client_id: UUID) -> bool:
    async with office(db) as conn:
        done = await conn.fetchval(
            "update clients set erase_hold = '', erase_hold_at = null "
            "where id = $1 and erase_hold <> '' returning true", client_id,
        )
        if done:
            await _audit(conn, "client.erase_released", client_id, None, {})
        return bool(done)


# ── the daily run ────────────────────────────────────────────────────────────────────────


async def run(
    db: Database, *, apply: bool, settings: Settings | None = None, on: date | None = None,
    only: list[UUID] | None = None,
) -> dict:
    """Find the clients that are due and, when `apply` is true, erase them; otherwise say what
    would be erased and change nothing. `db` is the owner's. Answers a report of IDs, dates and
    counts: no name, number or message is ever in it.

    At most `erase_max_per_run` businesses are erased in one run; the rest wait for the next.
    `only` limits the run to those clients (a person erasing one client by hand, or a test)."""
    settings = settings or get_settings()
    on = on or today()
    days = after_days(settings)
    report: dict = {
        "mode": "apply" if apply else "dry-run", "on": on.isoformat(), "after_days": days,
        "rules": rules_version(), "clients": [], "businesses_erased": 0, "clients_finished": 0,
        "failed": 0,
    }
    async with office(db, readonly=True) as conn:
        due = await conn.fetch(DUE, on, days, only)
        order = await delete_order(conn)
        unruled = await unruled_tables(conn)
    if unruled:
        report["stopped"] = {"tables_and_rules_that_do_not_match": unruled}
        report["failed"] += 1
        return report
    budget = settings.erase_max_per_run
    for client in due:
        client_id = client["id"]
        entry: dict = {"client_id": str(client_id), "stopped_on": client["cancels_on"].isoformat(),
                       "businesses": []}
        report["clients"].append(entry)
        async with office(db, readonly=True) as conn:
            why = await refusal(conn, client_id, client["erase_hold"])
            businesses = [r["id"] for r in await conn.fetch(
                "select id from tenants where client_id = $1 order by created_at, id", client_id)]
        if why:
            entry["skipped"] = why
            continue
        complete = True
        for business_id in businesses:
            if budget <= 0:
                entry["businesses"].append({"business_id": str(business_id), "waiting": True})
                complete = False
                continue
            budget -= 1
            try:
                if apply:
                    done = await erase_business(db, client_id, business_id, order, on=on, days=days)
                    if done is not None:
                        report["businesses_erased"] += 1
                    entry["businesses"].append(
                        {"business_id": str(business_id), "erased": done is not None}
                        | (done or {}))
                else:
                    async with scoped(db, business_id, readonly=True) as conn:
                        entry["businesses"].append({
                            "business_id": str(business_id),
                            "would_delete": await _count(conn, order, business_id),
                            "would_keep": await _count(
                                conn, _kept_tables(by={"tenant_id", "business_id"}), business_id),
                            "people": await conn.fetchval(
                                "select count(*) from memberships where tenant_id = $1",
                                business_id),
                        })
            except NotDue as error:
                entry["skipped"] = str(error)
                complete = False
                break
            except Exception:  # noqa: BLE001 - one business must not stop the others
                log.exception("could not erase a business of client %s", client_id)
                report["failed"] += 1
                entry["businesses"].append({"business_id": str(business_id), "failed": True})
                complete = False
        if apply and complete:
            try:
                if await finish_client(db, client_id, on=on, days=days):
                    report["clients_finished"] += 1
                    entry["finished"] = True
            except Exception:  # noqa: BLE001
                log.exception("could not finish erasing client %s", client_id)
                report["failed"] += 1
    return report


# ── what has been done ───────────────────────────────────────────────────────────────────


async def status(db: Database, on: date | None = None, days: int = 60) -> dict:
    """The record in one answer, for a person to read: the latest receipts (IDs, dates and how
    many rows), the photo prefixes and how far the worker has got, the clients held, and how many
    clients are due on `on`. No name, number or message, and not the reason a hold was set."""
    on = on or today()
    async with office(db, readonly=True) as conn:
        receipts = await conn.fetch(
            "select r.scope, r.client_id, r.business_id, r.stopped_on, "
            "r.erased_at::date as erased_on, "
            "(select coalesce(sum(v::int), 0) from jsonb_each_text(r.deleted) as e(k, v)) as rows "
            "from erasure_receipts r order by r.erased_at desc limit 20")
        files = await conn.fetch(
            "select business_id, queued_at::date as queued_on, attempts, objects_deleted, "
            "last_error, done_at is not null as done from erasure_files "
            "order by queued_at desc limit 20")
        held = await conn.fetch(
            "select id as client_id, erase_hold_at::date as since from clients "
            "where erase_hold <> '' and erased_at is null order by erase_hold_at")
        due = await conn.fetchval(
            "select count(*) from clients where cancels_on is not null and erased_at is null "
            "and cancels_on + $2::int <= $1::date", on, days)
    return {
        "rules": rules_version(), "due_now": due,
        "held": [_plain(r) for r in held],
        "receipts": [_plain(r) for r in receipts],
        "photo_store": [_plain(r) for r in files],
    }


def _plain(row: asyncpg.Record) -> dict:
    """A row as JSON can carry it: IDs and dates as text."""
    return {k: (v if isinstance(v, int | bool | str) or v is None else str(v))
            for k, v in dict(row).items()}


# ── the photo store, emptied by the worker ───────────────────────────────────────────────


async def remove_files(db: Database, store: Store, per_pass: int = FILES_PER_PASS) -> dict:
    """Empty the photo store's prefix of every erased business that still has files. Run by the
    worker (the application's role, with the store's keys). A business's row is finished only
    when a listing of its prefix comes back empty; a pass that cannot finish is picked up by the
    next. Answers how many objects went."""
    gone = {"businesses": 0, "objects": 0, "errors": 0}
    async with db.unscoped() as conn:
        pending = await conn.fetch(
            "select business_id, prefix from erasure_files where done_at is null "
            "order by queued_at limit 10"
        )
    for row in pending:
        removed, error, finished = 0, "", False
        try:
            while removed < per_pass:
                keys = await store.list(row["prefix"], limit=min(1000, per_pass - removed))
                photos = [key for key in keys if valid_key(key)]
                if not photos:
                    break
                for key in photos:
                    await store.delete(key)
                    removed += 1
            left = await store.list(row["prefix"], limit=1000)
            finished = not left
            if left and not any(valid_key(key) for key in left):
                # Something under the prefix that is not a photo's name: the store will not
                # delete it by that name, so a person looks.
                error = f"{len(left)} objects that are not photo files were left"
        except StoreError as caught:
            error = f"{type(caught).__name__}: {caught}"[:200]
            gone["errors"] += 1
        async with db.unscoped() as conn:
            await conn.execute(
                "update erasure_files set attempts = attempts + 1, "
                "objects_deleted = objects_deleted + $2, last_error = $3, "
                "done_at = case when $4 then now() end where business_id = $1",
                row["business_id"], removed, error, finished,
            )
        gone["objects"] += removed
        gone["businesses"] += 1 if finished else 0
    return gone
