"""The engine's way into the database, and the small records every part writes.

Every outreach table is ALYR's own with forced row-level security for the back office
(migration 0111). `office(db)` opens one transaction on ALYR's own business (slug `alyr`) with the
back office declared: the outreach tables open, and a job queued on it (`core/jobs.py` needs a
business) belongs to ALYR and commits with the change. On the API it uses the admin login when
there is one (`core/roles.py`); the worker's own login is allowed the back office (D-137).
"""

import hashlib
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg

from alyr.core import roles
from alyr.db import Database

ALYR_SLUG = "alyr"

STAGES = ("new", "researching", "researched", "drafting", "in_review", "approved", "sending",
          "done", "needs_human", "disqualified", "rejected", "replied", "bounced", "opted_out")
# A prospect in one of these has finished: nothing more is sent.
FINISHED = ("done", "disqualified", "rejected", "replied", "bounced", "opted_out")
ACTIVE = ("approved", "sending")

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


class OutreachError(Exception):
    """A request the engine cannot carry out; the message is safe to show."""


async def alyr_business(conn: asyncpg.Connection) -> UUID:
    found = await conn.fetchval("select id from tenants where slug = $1", ALYR_SLUG)
    if found is None:
        raise OutreachError("ALYR's own business is missing: run python -m alyr.first_admin")
    return found


@asynccontextmanager
async def office(db: Database) -> AsyncIterator[asyncpg.Connection]:
    pool = roles.privileged(db)
    async with pool.unscoped() as conn:
        business = await alyr_business(conn)
    async with pool.tenant(business) as conn:
        await conn.execute("select set_config('app.platform_admin', 'on', true)")
        yield conn


def email_hash(email: str) -> str:
    return hashlib.sha256((email or "").strip().lower().encode()).hexdigest()


def domain_of(email_or_url: str) -> str:
    text = (email_or_url or "").strip().lower()
    if "@" in text:
        return text.rpartition("@")[2]
    text = re.sub(r"^[a-z]+://", "", text).split("/")[0].split(":")[0]
    return text.removeprefix("www.")


def domain_hash(domain: str) -> str:
    return hashlib.sha256(("domain:" + (domain or "").strip().lower()).encode()).hexdigest()


def body_hash(subject: str, body: str) -> str:
    return hashlib.sha256(f"{subject}\n\n{body}".encode()).hexdigest()


def _clean(value: object) -> object:
    """Detail of an event never holds an address: anything that looks like one is replaced."""
    if isinstance(value, str):
        return _EMAIL.sub("[address]", value)[:500]
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_clean(v) for v in value]
    return value


async def event(
    conn: asyncpg.Connection, prospect_id: UUID | None, kind: str, **detail: object
) -> None:
    await conn.execute(
        "insert into outreach_events (prospect_id, kind, detail) values ($1, $2, $3)",
        prospect_id, kind, _clean(detail),
    )


async def set_stage(
    conn: asyncpg.Connection, prospect_id: UUID, stage: str, reason: str = ""
) -> None:
    if stage not in STAGES:
        raise ValueError(stage)
    before = await conn.fetchval(
        "select stage from outreach_prospects where id = $1 for update", prospect_id
    )
    await conn.execute(
        "update outreach_prospects set stage = $2, stage_reason = $3, updated_at = now(), "
        "last_activity_at = now() where id = $1",
        prospect_id, stage, reason[:300],
    )
    await event(conn, prospect_id, "stage", before=before, after=stage, reason=reason)


async def settings_row(conn: asyncpg.Connection) -> asyncpg.Record:
    return await conn.fetchrow("select * from outreach_settings")


async def mailbox(conn: asyncpg.Connection, address: str, name: str) -> asyncpg.Record | None:
    """The row of the configured sending address, made the first time it is needed."""
    address = (address or "").strip().lower()
    if "@" not in address:
        return None
    await conn.execute(
        "insert into outreach_mailboxes (from_address, from_name) values ($1, $2) "
        "on conflict (from_address) do update set from_name = excluded.from_name",
        address, name,
    )
    return await conn.fetchrow("select * from outreach_mailboxes where from_address = $1",
                               address)


async def suppressed(conn: asyncpg.Connection, email: str) -> bool:
    return bool(await conn.fetchval(
        "select true from outreach_suppression where email_hash = $1 or domain_hash = $2",
        email_hash(email), domain_hash(domain_of(email)),
    ))


async def suppress(
    conn: asyncpg.Connection, *, email: str = "", to_hash: str = "", reason: str,
    source: str, domain: str = "",
) -> None:
    """Never write to this address again (or this whole domain). Hashes only: an opt-out is
    honoured for good without keeping the address."""
    if domain:
        await conn.execute(
            "insert into outreach_suppression (domain_hash, reason, source) values ($1, $2, $3) "
            "on conflict do nothing", domain_hash(domain), reason, source)
        return
    hashed = to_hash or email_hash(email)
    await conn.execute(
        "insert into outreach_suppression (email_hash, reason, source) values ($1, $2, $3) "
        "on conflict do nothing", hashed, reason, source)


async def stop_sequence(
    conn: asyncpg.Connection, prospect_id: UUID, stage: str, reason: str
) -> int:
    """Anything still to send for this prospect is dropped, and the prospect moves to `stage`
    (replied, bounced, opted_out, ...). The engine may stop a sequence; it never restarts one."""
    dropped = await conn.execute(
        "update outreach_intents set status = 'dropped', last_result = $2, updated_at = now() "
        "where prospect_id = $1 and status in ('queued', 'rescheduled', 'held')",
        prospect_id, reason,
    )
    await conn.execute(
        "update outreach_drafts set status = 'superseded', reason = $2 "
        "where prospect_id = $1 and step between 1 and 3 and status in ('in_review', 'approved')",
        prospect_id, reason,
    )
    await set_stage(conn, prospect_id, stage, reason)
    return int(dropped.split()[-1])


def honeytoken(settings: asyncpg.Record, email: str) -> bool:
    return (email or "").strip().lower() in {h.lower() for h in settings["honeytokens"] or []}
