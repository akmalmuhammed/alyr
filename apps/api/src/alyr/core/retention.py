"""How long ALYR keeps the working copies it makes to get work done (go-live checklist item 19,
ALY-119, D-075, specs/038).

A business's own records (its conversations, orders, bookings, credit accounts, receipts) are
kept for as long as it uses ALYR, as the privacy notice says; a customer who asks is forgotten
from them by `core/forget.py`. What is purged here are copies nobody reads once the work is done:

- **A finished job**, 30 days after it finished. Its payload repeats what is in the record it
  worked on (an inbound job holds the customer's message as Meta sent it, with their number);
  the days are for looking into a fault.
- **A job that failed for good**, 90 days after. Until then a person can still see it and send
  it round again (`/api/jobs/failed`); after that it would arrive too late to help anyone.
- **The IDs of WhatsApp messages already handled** (`processed_messages`), 30 days after. Meta
  tries a webhook again "for up to 7 days" (its WhatsApp webhooks overview, read 29 Oct 2026),
  so a repeat older than that cannot come.

An event sent to a business's own system keeps its copy 30 days (`connect.webhooks.KEEP_DAYS`).

The worker runs `purge` once a day, one business at a time, inside that business's scope.
"""

import logging

from alyr.db import Database

log = logging.getLogger("alyr.retention")

DONE_DAYS = 30
FAILED_DAYS = 90
SEEN_DAYS = 30


async def purge(db: Database) -> dict[str, int]:
    """Delete every working copy past its time, for every business. Answers how many went."""
    async with db.unscoped() as conn:
        shops = [r["id"] for r in await conn.fetch("select id from tenants")]
    gone = {"jobs": 0, "seen": 0}
    for tenant_id in shops:
        try:
            async with db.tenant(tenant_id) as conn:
                jobs = await conn.execute(
                    "delete from jobs where "
                    "(status = 'done' and finished_at < now() - make_interval(days => $1)) "
                    "or (status = 'failed' and finished_at < now() - make_interval(days => $2))",
                    DONE_DAYS, FAILED_DAYS,
                )
                seen = await conn.execute(
                    "delete from processed_messages "
                    "where created_at < now() - make_interval(days => $1)",
                    SEEN_DAYS,
                )
        except Exception:  # noqa: BLE001 - one business must not stop the purge of the others
            log.exception("could not purge the old working copies of shop %s", tenant_id)
            continue
        gone["jobs"] += int(jobs.split()[-1])
        gone["seen"] += int(seen.split()[-1])
    return gone
