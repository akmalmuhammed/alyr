"""The loop's reads (Discovery 2.0): the business's open asks, when ALYR checks next, the checks
matched on the check-up before, and how changes were decided (the approve-unedited rate).

Reads only: nothing here changes a proposal, sends a message or reaches outside ALYR. The writes
of the loop are in `proposals.py` (approve, "Change it", not now, the three open asks) and
`apply.py` (the life of a change after it was applied).

`overall_metrics` is the one function that looks at more than one business: it adds up counts
(no names, no values, nothing of any change), one business's transaction at a time, for the lead's
quality bar (DECISIONS #17). It is reached from the command line only:

    uv run python -m alyr.modules.discovery.loop
"""

import asyncio
import json
import sys
from datetime import UTC, datetime, time, timedelta

import asyncpg

from alyr.core.actions import Caller
from alyr.db import Database
from alyr.modules.discovery import proposals
from alyr.modules.discovery.proposals import Scope
from alyr.modules.items import clock as shop_clock

# The weekly check-up starts at the first sweep after this time on the shop's clock, a week after
# the last one finished (`sweep.schedule_if_due`).
WEEKLY_AFTER = time(6, 0)
WEEKLY_EVERY = timedelta(days=7)


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


async def next_check_at(conn: asyncpg.Connection, now: datetime | None = None) -> datetime | None:
    """When the weekly check-up starts next: a week after the last finished one, at or after
    06:00 on the shop's clock. None when the weekly check-up is off, or none has run yet."""
    now = now or datetime.now(UTC)
    if not await conn.fetchval("select weekly_run from discovery_settings"):
        return None
    last = await conn.fetchval("select max(finished_at) from discovery_runs where status = 'done'")
    if last is None:
        return None
    due = max(last + WEEKLY_EVERY, now)
    zone = (await shop_clock.load(conn, now)).tz
    local = due.astimezone(zone)
    if local.time() < WEEKLY_AFTER:
        local = local.replace(hour=WEEKLY_AFTER.hour, minute=0, second=0, microsecond=0)
    return local.astimezone(UTC)


async def previous_checks(conn: asyncpg.Connection) -> dict | None:
    """"Up from 8 on Thu 5 Nov": the checks matched on the check-up before the last one, and when
    it finished, counted the same way as the packs' "N of M" (`packs.tally`). None before two."""
    from alyr.modules.discovery import engine, packs  # engine imports proposals, which is here

    runs = await conn.fetch(
        "select checks, finished_at from discovery_runs where status = 'done' "
        "order by created_at desc limit 2"
    )
    if len(runs) < 2:
        return None
    entries = [
        e for e in (runs[1]["checks"] or [])
        if isinstance(e, dict) and e.get("rule") in engine.RULE_BY_ID
    ]
    if not entries:
        return None
    tally = packs.tally(entries)
    return {"matched": tally["matched"], "measured": tally["measured"],
            "at": _iso(runs[1]["finished_at"])}


async def asks_block(conn: asyncpg.Connection, caller: Caller, scope: Scope, lang: str) -> dict:
    """`{open_asks, also_noticed, cap, next_check_at, next_change_check_at}`. Each item is
    `{kind: "proposal", proposal}` or `{kind: "season", finding}` (a seasonal ask, which counts
    toward the three)."""
    from alyr.modules.discovery import actions  # actions imports this module

    now = datetime.now(UTC)
    first, rest = await proposals.queue_rows(conn, scope, now)
    rows = [r for kind, r in first + rest if kind == "proposal"]
    reviews = await proposals._reviews_of(conn, rows)
    extra = await proposals.extras_for(conn, rows)
    seasons = [r for kind, r in first + rest if kind == "season"]
    season_views = {
        v["id"]: v for v in await actions.finding_views(conn, caller, lang, seasons)
    } if seasons else {}

    def item(kind: str, row, queue: str) -> dict:
        if kind == "season":
            return {"kind": "season", "queue": queue, "finding": season_views[str(row["id"])]}
        return {"kind": "proposal", "queue": queue, "proposal": proposals.view(
            row, caller, scope, lang, now, reviews, queue={row["id"]: queue}, extra=extra)}

    soonest = await conn.fetchval(
        "select min(verify_at) from discovery_proposals where status = 'applied' "
        "and verify_at is not null and ($1::uuid[] is null or location_id = any($1))",
        None if scope.everywhere else list(scope.places),
    ) if not scope.nothing else None
    return {
        "cap": proposals.OPEN_ASKS,
        "open_asks": [item(k, r, "open") for k, r in first],
        "also_noticed": [item(k, r, "also_noticed") for k, r in rest],
        "next_check_at": _iso(await next_check_at(conn, now)),
        "next_change_check_at": _iso(soonest),
    }


async def metrics(conn: asyncpg.Connection) -> dict:
    """How this business's changes were decided and what became of them (counts only). The
    approve-unedited rate is approved as proposed over every approval (None before the first)."""
    row = await conn.fetchrow(
        "select count(*) filter (where approved_as = 'unedited') as unedited, "
        "count(*) filter (where approved_as = 'edited') as edited, "
        "count(*) filter (where status = 'declined' and decline_reason = 'not_now') as not_now, "
        "count(*) filter (where status = 'declined' "
        "and coalesce(decline_reason, 'declined') = 'declined') as declined, "
        "count(*) filter (where status = 'expired' and expire_reason = 'time') as expired, "
        "count(*) filter (where life = 'live') as live, "
        "count(*) filter (where life = 'rejected') as rejected, "
        "count(*) filter (where life = 'changed_back') as changed_back, "
        "count(*) filter (where status = 'undone') as undone "
        "from discovery_proposals"
    )
    return with_rate(dict(row))


def with_rate(counts: dict) -> dict:
    approved = counts["unedited"] + counts["edited"]
    counts = {k: int(v) for k, v in counts.items()}
    counts["approved"] = approved
    counts["approve_unedited_rate"] = round(counts["unedited"] / approved, 4) if approved else None
    return counts


async def overall_metrics(db: Database) -> dict:
    """Every business with Discovery's tables, counted one at a time and added up: `businesses`
    (how many have decided at least one change) and the same counts as `metrics`."""
    async with db.unscoped() as conn:
        shops = [r["id"] for r in await conn.fetch("select id from tenants")]
    total: dict = {}
    decided = 0
    for tenant_id in shops:
        async with db.tenant(tenant_id, readonly=True) as conn:
            one = await metrics(conn)
        decided += one["approved"] + one["not_now"] + one["declined"] > 0
        for key, value in one.items():
            if key not in ("approved", "approve_unedited_rate"):
                total[key] = total.get(key, 0) + value
    out = with_rate(total) if total else with_rate({
        "unedited": 0, "edited": 0, "not_now": 0, "declined": 0, "expired": 0, "live": 0,
        "rejected": 0, "changed_back": 0, "undone": 0})
    out["businesses"] = decided
    return out


async def _main() -> int:  # pragma: no cover - a command for the lead
    from alyr.config import get_settings

    db = Database(get_settings().migration_url)
    await db.connect()
    try:
        print(json.dumps(await overall_metrics(db)))
    finally:
        await db.close()
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(asyncio.run(_main()))
