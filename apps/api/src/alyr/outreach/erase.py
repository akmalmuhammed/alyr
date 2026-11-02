"""Erasing a prospect's personal data (specs/065, "Suppression and retention").

Daily. A prospect who opted out, bounced or was disqualified has their name, role, address, notes,
the drafts written to them, their replies and what was read about them erased 30 days later; a
prospect with no activity for 12 months the same way. The row stays (the company, its stage, the
counts) and so does the suppression list, which holds hashes only, so an opt-out is honoured for
good without keeping the address. The lawyer may change both periods (ALY-51).
"""

from alyr.outreach import store

AFTER_STOP_DAYS = 30
IDLE_DAYS = 365


async def erase_due(engine) -> int:
    async with store.office(engine.db) as conn:
        due = await conn.fetch(
            "select id from outreach_prospects where erased_at is null and ("
            " (stage in ('opted_out', 'bounced', 'disqualified') "
            "  and updated_at < now() - make_interval(days => $1)) "
            " or last_activity_at < now() - make_interval(days => $2))",
            AFTER_STOP_DAYS, IDLE_DAYS)
        for row in due:
            await erase(conn, row["id"])
        return len(due)


async def erase(conn, prospect_id) -> None:
    await conn.execute(
        "update outreach_prospects set first_name = '', last_name = '', role = '', email = null, "
        "email_hash = null, notes = '', basis_note = '', erased_at = now() where id = $1",
        prospect_id)
    await conn.execute(
        "update outreach_drafts set subject = '', body = '', sentences = null "
        "where prospect_id = $1", prospect_id)
    await conn.execute(
        "update outreach_replies set subject = '', body = '' where prospect_id = $1", prospect_id)
    for table in ("outreach_found_emails", "outreach_pages", "outreach_claims"):
        await conn.execute(f"delete from {table} where prospect_id = $1", prospect_id)
    await store.event(conn, prospect_id, "erased")
