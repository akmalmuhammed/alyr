"""Applying an approved proposal, and undoing it (spec 066, D-166).

`discovery.apply` is a job, not background work: the owner is waiting. It is called only for a row
that is `approved`, which only a person's tap makes (`proposals.approve`), and it is idempotent:
the row is taken with a conditional update (so two workers cannot both apply), the live value is
read first (a change already true is recorded, not written again; one that is no longer the
"before" the owner saw is refused as `stale_before` and nothing is changed), and the connector is
given the proposal's id as its idempotency key.

The connector is the only thing here that could reach outside ALYR; today that is the sample one,
which changes the made-up listing inside ALYR (`discovery_sample_state`). Nothing here sends a
message: a result goes to the person on WhatsApp through `notify`, a function the worker hands in.
"""

import logging
from collections.abc import Awaitable, Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.db import Database
from alyr.modules.discovery import connectors
from alyr.modules.discovery import proposal_words as pw
from alyr.modules.discovery.connectors import ConnectorError, Location, WriteContext
from alyr.modules.discovery.connectors.base import Change, Receipt, WriteError, same
from alyr.modules.discovery.errors import DiscoveryError
from alyr.modules.discovery.proposals import (
    APPLY_JOB,
    Scope,
    _locked,
    channel_of,
    person_may_decide,
)
from alyr.modules.items import alerts
from alyr.modules.items import clock as shop_clock

log = logging.getLogger("alyr.discovery")

JOB = APPLY_JOB
# A started apply that is older than this may be taken again (its worker died).
STARTED_STALE = "10 minutes"
Notify = Callable[[asyncpg.Connection, UUID], Awaitable[None]]
# The check after a change was applied (Discovery 2.0): about 20 hours later, so a result on
# WhatsApp can arrive inside the person's 24-hour window (T2 2.1, "a timing trap"); never in the
# shop's quiet hours, where it moves to the evening before. A change the platform still reviews is
# looked at again every few hours, and after three days left for the weekly check-up.
VERIFY_AFTER = timedelta(hours=20)
EVENING = (21, 30)
LOOK_AGAIN = timedelta(hours=4)
PENDING_FOR = timedelta(days=3)


# ── where the sample connector keeps what its fictional owner changed ────────────────────


async def _put(conn, location_id, target, field, subject_ref, value, proposal_id) -> None:
    await conn.execute(
        "insert into discovery_sample_state (location_id, target, field, subject_ref, value, "
        "proposal_id) values ($1, $2, $3, $4, $5, $6) "
        "on conflict (tenant_id, location_id, target, field, subject_ref) do update "
        "set value = excluded.value, proposal_id = excluded.proposal_id, set_at = now()",
        location_id, target, field, subject_ref, value, proposal_id,
    )


async def _delete(conn, location_id, target, field, subject_ref) -> None:
    await conn.execute(
        "delete from discovery_sample_state where location_id = $1 and target = $2 "
        "and field = $3 and subject_ref = $4",
        location_id, target, field, subject_ref,
    )


class ConnState:
    """The state store on a connection the caller already holds (an undo from a request)."""

    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def put(self, location_id, target, field, subject_ref, value, proposal_id) -> None:
        await _put(self._conn, location_id, target, field, subject_ref, value, proposal_id)

    async def delete(self, location_id, target, field, subject_ref) -> None:
        await _delete(self._conn, location_id, target, field, subject_ref)


class DbState:
    """The state store for a job: each write is a short transaction of its own, so no connection
    is held while a (future) source is waited for."""

    def __init__(self, db: Database, tenant_id: UUID) -> None:
        self._db, self._tenant = db, tenant_id

    async def put(self, location_id, target, field, subject_ref, value, proposal_id) -> None:
        async with self._db.tenant(self._tenant) as conn:
            await _put(conn, location_id, target, field, subject_ref, value, proposal_id)

    async def delete(self, location_id, target, field, subject_ref) -> None:
        async with self._db.tenant(self._tenant) as conn:
            await _delete(conn, location_id, target, field, subject_ref)


async def load_overrides(conn: asyncpg.Connection) -> dict:
    """`(place id, target, field, subject ref) -> value`: what the sample's owner changed."""
    return {
        (r["location_id"], r["target"], r["field"], r["subject_ref"]): r["value"]
        for r in await conn.fetch("select * from discovery_sample_state")
    }


async def stage_of(conn: asyncpg.Connection, kind: str) -> int:
    """Where the sample business stands: the stage its last check-up saw."""
    done = await conn.fetchval(
        "select count(*) from discovery_runs where status = 'done' and connector_kind = $1", kind
    )
    return min(max(done - 1, 0), 3)


def location_of(row: asyncpg.Record) -> Location:
    return Location(
        row["id"], row["name"], row["name_ar"], row["area"], row["place_ref"], row["website_url"],
        row["whatsapp_e164"], row["is_primary"], row["position"],
    )


def change_of(row: asyncpg.Record, place: asyncpg.Record) -> Change:
    return Change(
        row["type"], row["target"], row["change"]["field"], location_of(place), row["subject_ref"],
        row["change"]["before"], row["change"]["after"],
    )


# ── the job ─────────────────────────────────────────────────────────────────────────────


class DiscoveryApply:
    """The job handler: `jobs.register(JOB, DiscoveryApply(db, notify).run, applier.gave_up)`."""

    def __init__(self, db: Database, notify: Notify | None = None, get_connector=None) -> None:
        self._db, self._notify, self._get = db, notify, get_connector

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        await apply_one(self._db, tenant_id, UUID(payload["proposal_id"]), self._notify, self._get)

    async def gave_up(self, tenant_id: UUID, payload: dict) -> None:
        """Every try was used (the source kept being unavailable): the change is `failed`."""
        await _fail(
            self._db, tenant_id, UUID(payload["proposal_id"]), "apply_gave_up", self._notify
        )


async def _fail(
    db: Database, tenant_id: UUID, proposal_id: UUID, code: str, notify: Notify | None
) -> str:
    code = code if code in pw.FAILURES else "refused"
    async with db.tenant(tenant_id) as conn:
        row = await conn.fetchrow(
            "update discovery_proposals set status = 'failed', failure_code = $2, "
            "apply_started_at = null, updated_at = now() "
            "where id = $1 and status = 'approved' returning target",
            proposal_id, code,
        )
        if row is None:
            return "skipped"
        await team.record(
            conn, "discovery", proposal_id, "proposal.fail", team.ALYR,
            detail={"code": code, "target": row["target"]}, channel="system",
        )
        if notify is not None:
            await notify(conn, proposal_id)
    return "failed"


async def _release(db: Database, tenant_id: UUID, proposal_id: UUID) -> None:
    """A try that did not finish gives the row back, so the runner's next try may take it."""
    async with db.tenant(tenant_id) as conn:
        await conn.execute(
            "update discovery_proposals set apply_started_at = null where id = $1 "
            "and status = 'approved'",
            proposal_id,
        )


async def apply_one(
    db: Database, tenant_id: UUID, proposal_id: UUID, notify: Notify | None = None,
    get_connector=None,
) -> str:
    """Apply one approved proposal. Answers `applied`, `failed` or `skipped` (not approved, or
    another worker has it). Raises only for a source that is unavailable, so the job runner tries
    again with its backoff; after the last try `gave_up` makes it `failed`."""
    get_connector = get_connector or connectors.get
    async with db.tenant(tenant_id) as conn:
        row = await conn.fetchrow(
            "update discovery_proposals set apply_started_at = now(), "
            "apply_attempts = apply_attempts + 1, updated_at = now() "
            "where id = $1 and status = 'approved' and (apply_started_at is null "
            f"or apply_started_at < now() - interval '{STARTED_STALE}') returning *",
            proposal_id,
        )
        if row is None:
            return "skipped"
        place = await conn.fetchrow(
            "select * from discovery_locations where id = $1", row["location_id"]
        )
        connected = await conn.fetchval(
            "select exists (select 1 from discovery_connections where kind = $1 "
            "and status = 'on')",
            row["connector_kind"],
        )
        stage = await stage_of(conn, row["connector_kind"])
        overrides = await load_overrides(conn)
    if not connected:
        return await _fail(db, tenant_id, proposal_id, "connector_off", notify)
    change = change_of(row, place)
    now = datetime.now(UTC)
    ctx = WriteContext(
        now=now, idempotency_key=str(proposal_id), stage=stage, overrides=overrides,
        state=DbState(db, tenant_id),
    )
    try:
        connector = get_connector(row["connector_kind"])
        current = await connector.read_current(change, ctx)
        if same(change.field, current, change.after):
            # Already true (a write that happened, or a listing that was fixed another way):
            # recorded as applied and written again by nothing.
            receipt = Receipt("already_true", now, None)
        elif not same(change.field, current, change.before):
            raise WriteError(
                "stale_before", "The live value is not the one that was proposed against.",
                "القيمة الحالية ليست التي بُني عليها الاقتراح.",
            )
        else:
            receipt = await connector.apply(change, ctx)
    except WriteError as error:
        if error.retryable:
            await _release(db, tenant_id, proposal_id)
            raise
        return await _fail(db, tenant_id, proposal_id, error.code, notify)
    except ConnectorError:
        return await _fail(db, tenant_id, proposal_id, "connector_unavailable", notify)
    except Exception:
        await _release(db, tenant_id, proposal_id)
        raise
    try:
        return await _applied(db, tenant_id, row, receipt, notify)
    except Exception:
        await _release(db, tenant_id, proposal_id)
        raise


async def _applied(
    db: Database, tenant_id: UUID, row: asyncpg.Record, receipt: Receipt, notify: Notify | None
) -> str:
    """The connector accepted the write: `applied` only now, never before."""
    proposal_id = row["id"]
    async with db.tenant(tenant_id) as conn:
        zone = (await shop_clock.load(conn, receipt.at)).tz
        done = await conn.fetchrow(
            "update discovery_proposals set status = 'applied', applied_at = $2, receipt = $3, "
            "undo_until = $4, verification = 'pending', failure_code = null, "
            "apply_started_at = null, life = 'sent', life_history = life_history || "
            "jsonb_build_array(jsonb_build_object('state', 'sent', 'at', $2::timestamptz)), "
            "verify_at = $5, updated_at = now() "
            "where id = $1 and status = 'approved' returning id",
            proposal_id, receipt.at,
            {"ref": receipt.ref, "at": receipt.at.isoformat(),
             "edited": row["approved_as"] == "edited"},
            receipt.undo_until, verify_time(receipt.at, zone),
        )
        if done is None:
            return "skipped"
        if row["type"] == "reply_to_review":
            await conn.execute(
                "update discovery_reviews set replied = true, reply_text = $3 "
                "where location_id = $1 and source_ref = $2",
                row["location_id"], row["subject_ref"], row["change"]["after"]["reply"],
            )
        # With no live proposal of the finding left, the finding waits for a check-up to say it
        # is fixed: the existing lifecycle makes it `verified`, or opens it again.
        await conn.execute(
            "update discovery_findings set status = 'owner_done', updated_at = now() "
            "where id = $1 and status = 'open' and not exists (select 1 from discovery_proposals "
            "where finding_id = $1 and status in ('proposed', 'approved'))",
            row["finding_id"],
        )
        await team.record(
            conn, "discovery", proposal_id, "proposal.apply", team.ALYR,
            detail={"type": row["type"], "ref": receipt.ref}, channel="system",
        )
        # No message now: the person had their confirmation at the tap, and their one result
        # comes with the check about 20 hours from now (`check_changes`, then `asks`).
    return "applied"


def verify_time(applied_at: datetime, zone) -> datetime:
    """About 20 hours after it was applied; if that falls in the shop's quiet hours, the evening
    before at 21:30 (still well inside the person's 24-hour window)."""
    due = applied_at + VERIFY_AFTER
    local = due.astimezone(zone)
    if not alerts.in_quiet_hours(local):
        return due
    evening = local.replace(hour=EVENING[0], minute=EVENING[1], second=0, microsecond=0)
    if local.hour < 12:
        evening -= timedelta(days=1)
    return max(evening, applied_at + timedelta(hours=1))


# ── the sweep puts a lost apply back on the queue ───────────────────────────────────────


async def requeue_lost(conn: asyncpg.Connection, now: datetime) -> int:
    """An approved proposal that was never started (older than 10 minutes) or was started and
    never finished (over 15 minutes) goes back on the queue. A second job for the same proposal is
    harmless: only one of them takes the row."""
    from alyr.core import jobs

    rows = await conn.fetch(
        "select id from discovery_proposals where status = 'approved' and ("
        "(apply_started_at is null and decided_at < $1::timestamptz - interval '10 minutes') "
        "or apply_started_at < $1::timestamptz - interval '15 minutes')",
        now,
    )
    for r in rows:
        await conn.execute(
            "update discovery_proposals set apply_started_at = null where id = $1", r["id"]
        )
        await jobs.enqueue(conn, JOB, {"proposal_id": str(r["id"])}, max_attempts=3)
    return len(rows)


# ── undo ────────────────────────────────────────────────────────────────────────────────


async def undo(
    conn: asyncpg.Connection, caller, scope: Scope, proposal_id: UUID, get_connector=None
) -> tuple[asyncpg.Record, bool]:
    """Put the old value back, while the window is open and the live value is still the one that
    was written. It re-reads first: if someone changed it since, nothing is written."""
    if not person_may_decide(caller):
        raise DiscoveryError("forbidden", 403)
    row = await _locked(conn, caller, scope, proposal_id)
    if row["status"] == "undone":
        return row, True
    if row["status"] != "applied":
        raise DiscoveryError("proposal_not_applied", 409)
    now = datetime.now(UTC)
    if row["undo_until"] is None:
        raise DiscoveryError("undo_not_possible", 409)
    if row["undo_until"] <= now:
        raise DiscoveryError("undo_window_over", 409)
    get_connector = get_connector or connectors.get
    try:
        connector = get_connector(row["connector_kind"])
    except ConnectorError as error:
        raise DiscoveryError("undo_not_possible", 409) from error
    place = await conn.fetchrow("select * from discovery_locations where id = $1",
                                row["location_id"])
    change = change_of(row, place)
    if (change.target, change.field) not in getattr(connector, "undoable", frozenset()):
        raise DiscoveryError("undo_not_possible", 409)
    ctx = WriteContext(
        now=now, idempotency_key=str(proposal_id),
        stage=await stage_of(conn, row["connector_kind"]),
        overrides=await load_overrides(conn), state=ConnState(conn),
    )
    receipt = Receipt((row["receipt"] or {}).get("ref", ""), row["applied_at"], row["undo_until"])
    try:
        if not same(change.field, await connector.read_current(change, ctx), change.after):
            raise DiscoveryError("undo_not_possible", 409)
        await connector.undo(change, receipt, ctx)
    except (WriteError, ConnectorError) as error:
        raise DiscoveryError("undo_not_possible", 409) from error
    row = await conn.fetchrow(
        "update discovery_proposals set status = 'undone', undone_by = $2, undone_name = $3, "
        "undone_at = now(), verification = null, updated_at = now() where id = $1 returning *",
        proposal_id, caller.user_id, caller.name or "—",
    )
    if row["type"] == "reply_to_review":
        await conn.execute(
            "update discovery_reviews set replied = false, reply_text = '' "
            "where location_id = $1 and source_ref = $2",
            row["location_id"], row["subject_ref"],
        )
    # The problem is back: the finding is open again now, not at the next check-up.
    await conn.execute(
        "update discovery_findings set status = 'open', updated_at = now() "
        "where id = $1 and status = 'owner_done'",
        row["finding_id"],
    )
    await team.record(
        conn, "discovery", proposal_id, "proposal.undo", caller.actor,
        detail={"type": row["type"]}, channel=channel_of(caller),
    )
    return row, False


# ── the life of a change after it was applied (Discovery 2.0) ───────────────────────────


async def _step(
    conn, proposal_id: UUID, state: str, at: datetime, *, record: bool = True, **more
) -> None:
    """One step of a change's life: the state, appended to its history, and on the record (a
    change seen live is on the record as its `proposal.verify`)."""
    sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(more, start=4))
    await conn.execute(
        "update discovery_proposals set life = $2, life_history = life_history || "
        "jsonb_build_array(jsonb_build_object('state', $2::text, 'at', $3::timestamptz)), "
        f"updated_at = now(){', ' + sets if sets else ''} where id = $1",
        proposal_id, state, at, *more.values(),
    )
    if record:
        await team.record(
            conn, "discovery", proposal_id, "proposal.life", team.ALYR,
            detail={"state": state}, channel="system",
        )


async def _reverted(conn, row, connector, ctx) -> None:
    """The platform did not keep the change: the finding is open again now (the problem is
    back), and the sample's own listing shows the old value again."""
    put_back = getattr(connector, "platform_reverted", None)
    if put_back is not None:
        place = await conn.fetchrow(
            "select * from discovery_locations where id = $1", row["location_id"])
        await put_back(change_of(row, place), replace(ctx, state=ConnState(conn)))
    await conn.execute(
        "update discovery_findings set status = 'open', updated_at = now() "
        "where id = $1 and status in ('owner_done', 'verified')",
        row["finding_id"],
    )


async def check_changes(
    db: Database, tenant_id: UUID, now: datetime | None = None, get_connector=None
) -> dict:
    """Follow every applied change through its life, from the sweep (hourly):

    * the platform's own state, where the source says it (the sample simulates Google's edit
      stages: under review, accepted, not accepted, changed back): `pending_review`, `rejected`,
      `changed_back`;
    * the check about 20 hours after it was applied (`verify_at`): a live read that shows the
      approved value is `live` (verification `confirmed`, `verified_at`, and on the receipt); one
      that does not is `not_confirmed`. A change still under review is looked at again in a few
      hours, and after three days left to the weekly check-up.

    Nothing is written to any source here and nothing is sent: the one result of an ask goes out
    from `asks.send_results`, which the sweep calls next. Returns counts by what was recorded."""
    now = now or datetime.now(UTC)
    get_connector = get_connector or connectors.get
    done = {"pending_review": 0, "live": 0, "rejected": 0, "changed_back": 0, "not_confirmed": 0}
    async with db.tenant(tenant_id) as conn:
        rows = await conn.fetch(
            "select * from discovery_proposals where status = 'applied' and ("
            "life in ('sent', 'pending_review') or (life = 'live' and undo_until > $1)) "
            "order by applied_at, id",
            now,
        )
        stage = {}
        for kind in {r["connector_kind"] for r in rows}:
            stage[kind] = await stage_of(conn, kind)
        overrides = await load_overrides(conn) if rows else {}
    for row in rows:
        try:
            connector = get_connector(row["connector_kind"])
        except ConnectorError:
            continue
        ctx = WriteContext(now=now, idempotency_key=str(row["id"]),
                           stage=stage[row["connector_kind"]], overrides=overrides,
                           state=DbState(db, tenant_id))
        receipt = Receipt((row["receipt"] or {}).get("ref", ""), row["applied_at"],
                          row["undo_until"])
        async with db.tenant(tenant_id) as conn:
            place = await conn.fetchrow(
                "select * from discovery_locations where id = $1", row["location_id"])
        if place is None:
            continue
        change = change_of(row, place)
        states = getattr(connector, "edit_state", None)
        try:
            platform, at = await states(change, receipt, ctx) if states else ("live", now)
            seen = await connector.read_current(change, ctx)
        except (WriteError, ConnectorError):
            continue  # the source could not be read now: the next sweep tries again
        due = row["verify_at"] is not None and row["verify_at"] <= now
        async with db.tenant(tenant_id) as conn:
            if platform in ("rejected", "changed_back") and (
                platform == "rejected" or row["life"] == "live" or due
            ):
                await _step(conn, row["id"], platform, at, verification="not_confirmed",
                            verify_at=None)
                await _reverted(conn, row, connector, ctx)
                done[platform] += 1
                continue
            if platform == "pending":
                if row["life"] == "sent":
                    await _step(conn, row["id"], "pending_review", at)
                    done["pending_review"] += 1
                if due:
                    again = now + LOOK_AGAIN
                    await conn.execute(
                        "update discovery_proposals set verify_at = $2 where id = $1",
                        row["id"], again if now - row["applied_at"] < PENDING_FOR else None,
                    )
                continue
            if not due or row["life"] == "live":
                continue
            if same(change.field, seen, change.after):
                await _step(
                    conn, row["id"], "live", now, record=False, verification="confirmed",
                    verify_at=None,
                    verified_at=now,
                    receipt=(row["receipt"] or {}) | {
                        "verified": {"at": now.isoformat(), "state": "live"}},
                )
                await team.record(
                    conn, "discovery", row["id"], "proposal.verify", team.ALYR,
                    detail={"result": "confirmed", "by": "check"}, channel="system",
                )
                done["live"] += 1
            else:
                await conn.execute(
                    "update discovery_proposals set verification = 'not_confirmed', "
                    "verify_at = null, updated_at = now() where id = $1",
                    row["id"],
                )
                await team.record(
                    conn, "discovery", row["id"], "proposal.verify", team.ALYR,
                    detail={"result": "not_confirmed", "by": "check"}, channel="system",
                )
                done["not_confirmed"] += 1
    return done
