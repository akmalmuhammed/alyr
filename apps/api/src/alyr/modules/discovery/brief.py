"""The one thing a morning brief (or the dashboard) may ask Discovery (spec 066, D-166).

`brief_line` answers the "Needs you now" line about changes waiting for approval, or `None`. It is
a read: it approves nothing and sends nothing (the brief carries no ask). ALY-134 (the daily brief)
is not on main, so nothing here is wired into a brief that does not exist; the same count is shown
on the workspace home now through the Agent (`modules/agent/facts.py`, `insights.py`).
"""

from datetime import UTC, datetime

import asyncpg

from alyr.core import actions
from alyr.core.actions import Caller
from alyr.modules.discovery import proposal_words as pw
from alyr.modules.discovery import proposals

KEY = "discovery_proposals"
HREF = "/app/discovery?view=proposals"


async def waiting_for(conn: asyncpg.Connection, caller: Caller, now: datetime | None = None):
    """(count, oldest age in days) of the proposed changes this caller may approve, not expired."""
    scope = await proposals.scope_of(conn, caller)
    if scope.nothing or caller.user_id is None:
        return 0, 0
    now = now or datetime.now(UTC)
    row = await conn.fetchrow(
        "select count(*) as n, min(proposed_at) as oldest from discovery_proposals "
        "where status = 'proposed' and expires_at > $1 "
        "and ($2::uuid[] is null or location_id = any($2))",
        now, None if scope.everywhere else list(scope.places),
    )
    days = (now - row["oldest"]).days if row["oldest"] else 0
    return row["n"], max(days, 0)


async def brief_line(conn: asyncpg.Connection, caller: Caller, lang: str) -> dict | None:
    """`{key, count, oldest_days, text, href}`: how many changes wait for this caller's approval,
    **whether or not an ask was sent** (the line is exactly where an ask could not go). `None`
    when Discovery is off for the shop, when the caller may approve nothing, or when none wait."""
    if not await actions.module_on(conn, "discovery"):
        return None
    count, oldest = await waiting_for(conn, caller)
    if count == 0:
        return None
    return {
        "key": KEY,
        "count": count,
        "oldest_days": oldest,
        "text": pw.waiting_text(count, lang),
        "href": HREF,
    }
