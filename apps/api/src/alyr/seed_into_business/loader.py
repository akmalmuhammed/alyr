"""One load, start to finish: the steps of `world.py`, the story's writes, and the touches that
need the database owner (spec 063).

Everything the product's services write is stamped with the database's clock, and ten weeks of
history cannot be written at the speed of one request. So the load works in three moves: the
product's role (row-level security holds) writes the setup and the story, with the moments of
the past on every row it can date itself; the owner role then moves the few rows that carry
"now" on them (the setup's items and activity, the consent records, the activity lines of the
documents) back to where they belong, touching only rows made since the load began; and last
the queue is cleaned of anything that would send.
"""

from datetime import timedelta

from alyr.core import jobs  # noqa: F401 - the queue the cleanup reads
from alyr.seed_into_business import bookings, chats, credit, docs, world
from alyr.seed_into_business.context import Refused, Run

# Jobs that may stay in the queue after a load. The photo store's own writes carry no message;
# the worker, which holds the store's keys, carries them out.
KEEP_JOBS = ("media.sync",)


async def load(run: Run) -> dict:
    """Write the whole story. Returns the counts the summary prints."""
    world.require(run)
    await world.private_line(run)
    made, profiles, rng = await world.setup(run)
    story = world.story_for(run, made, rng, profiles)
    owner_actor = made.owner
    async with run.app.tenant(run.id) as conn:
        made.conn = conn
        story.conn = conn
        await docs.configure(run, conn, owner_actor)
        ids = await bookings.setup(run, conn)
        story.simulate()
        # In the order the product would have lived it. Orders first (everything points at
        # them), the diary, the shelf, the credit book, then the papers the sales made.
        story.number_orders(run.order_start)
        await story.write_orders()
        await bookings.write(run, conn, story, ids)
        await story.write_stock()
        await story.write_ledger()
        counts = await docs.write(run, conn, story, owner_actor)
        credit_counts = await credit.finish(run, conn, story, run.names[run.emails["dina"]])
        accounts = [p for p in made.people if p.customer.kind == "account"
                    and story.profiles.get(p.id) in ("slow", "monthly", "late", "aged")]
        counts["statements"] = await docs.statements(run, conn, story, owner_actor, accounts)
        chat_count = await chats.plan(run, story)
        await story.write_record()
        await story.finish_contacts()
        await chats.finish(run, conn, story)
    await finish(run, story)
    return {**counts, **credit_counts, "conversations": chat_count, **story.counts}


async def finish(run: Run, story) -> None:
    """What only the owner role may touch, restricted to what this load made, and the queue."""
    async with run.owner.tenant(run.id) as conn:
        await conn.execute(
            "update consents c set created_at = ct.created_at + interval '1 minute' "
            "from contacts ct where ct.id = c.contact_id and c.tenant_id = $1 and "
            "c.created_at >= $2 and c.status = 'granted'", run.id, run.since)
        for contact_id, at in getattr(story, "revoked", []):
            await conn.execute(
                "update consents set created_at = $3 where tenant_id = $1 and contact_id = $2 "
                "and status = 'revoked' and created_at >= $4", run.id, contact_id, at, run.since)
        await conn.execute(
            "update activity a set created_at = d.issued_at + interval '1 second' "
            "from documents d where a.tenant_id = $1 and a.subject = 'document' and "
            "a.subject_id = d.id and a.action = 'issued' and a.created_at >= $2", run.id, run.since)
        await conn.execute(
            "update activity a set created_at = d.created_at "
            "from documents d where a.tenant_id = $1 and a.subject = 'document' and "
            "a.subject_id = d.id and a.action = 'draft_created' and a.created_at >= $2",
            run.id, run.since)
        await conn.execute(
            "update activity a set created_at = d.issued_at + interval '3 seconds' "
            "from documents d where a.tenant_id = $1 and a.subject = 'document' and "
            "a.subject_id = d.id and a.action not in ('issued', 'draft_created') and "
            "a.created_at >= $2", run.id, run.since)
        await clean_queue(conn, run)


async def clean_queue(conn, run: Run) -> None:
    """Nothing the load made may send. It sent nothing itself and queued no message; this makes
    sure: every job made since it began is removed except the photo store's own writes, and so
    is any event queued for a connected system (a webhook)."""
    await conn.execute(
        "delete from jobs where tenant_id = $1 and created_at >= $2 and not (kind = any($3))",
        run.id, run.since, list(KEEP_JOBS))
    await conn.execute(
        "delete from webhook_deliveries where tenant_id = $1 and created_at >= $2",
        run.id, run.since)
    if run.photos == "now":
        await conn.execute(
            "delete from jobs where tenant_id = $1 and created_at >= $2 and kind = 'media.sync'",
            run.id, run.since)
