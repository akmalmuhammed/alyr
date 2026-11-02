"""A prospect's sequence: approving, editing and rejecting drafts, and the engine's recurring work
(specs/065, "Sequences and follow-ups", "Jobs").

A sequence is three steps: the first message, a follow-up 3 working days later, a last short note
7 more working days later (the recipient's calendar). An approval is bound to the exact text (its
hash): an edit makes a new version that needs its own approval. Any reply, bounce or opt-out stops
the sequence (`store.stop_sequence`).

The worker calls `tick` every minute (the same pattern as the alert rules and the weekly reports):
it queues the sends that are due, reads replies every 5 minutes while outreach is on, sends the
digest at 07:00 Doha and erases what is due once a day. Each recurring run is claimed in
`outreach_settings` by moving its date, so two workers never run one twice.
"""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from alyr.core import alerts
from alyr.outreach import compose, gateway, store

DOHA = ZoneInfo("Asia/Qatar")
POLL_MINUTES = 5
DIGEST_HOUR = 7
REQUEUE_MINUTES = 15


class Refused(Exception):
    """The draft cannot be approved, edited or rejected; the message is safe to show and `code`
    is stable for the screens (stale_hash, not_found, not_waiting, finished, lint)."""

    def __init__(self, message: str, code: str = "refused") -> None:
        super().__init__(message)
        self.code = code


async def _kept(conn, prospect_id) -> set[str]:
    return {r["claim_key"] for r in await compose.kept_claims(conn, prospect_id)}


async def approve(engine, conn, draft_id, given_hash: str, with_follow_ups: bool,
                  staff_email: str) -> list[str]:
    draft = await conn.fetchrow("select * from outreach_drafts where id = $1 for update",
                                draft_id)
    if draft is None:
        raise Refused("no such draft", "not_found")
    if draft["status"] != "in_review":
        raise Refused(f"this draft is {draft['status']}, not waiting for review", "not_waiting")
    current = store.body_hash(draft["subject"], draft["body"])
    if given_hash != draft["body_hash"] or current != draft["body_hash"]:
        raise Refused("the text changed since you read it; read it again", "stale_hash")
    p = await conn.fetchrow("select * from outreach_prospects where id = $1", draft["prospect_id"])
    if draft["step"] < 4 and p["stage"] in store.FINISHED:
        raise Refused(f"the prospect is {p['stage']}", "finished")
    if draft["step"] == 4 and p["stage"] != "replied":
        raise Refused("a reply is only sent to someone who replied", "finished")
    drafts = [draft]
    if with_follow_ups and draft["step"] == 1:
        drafts += await conn.fetch(
            "select distinct on (step) * from outreach_drafts where prospect_id = $1 "
            "and step in (2, 3) and status = 'in_review' order by step, version desc",
            draft["prospect_id"])
    kept = await _kept(conn, draft["prospect_id"])
    for d in drafts:
        result = compose.lint(step=d["step"], subject=d["subject"], body=d["body"],
                              language=d["language"], sentences=d["sentences"], kept=kept,
                              settings=engine.settings)
        if not result["ok"]:
            raise Refused(f"step {d['step']} does not pass the lint: "
                          + "; ".join(result["problems"]), "lint")
    approved = []
    for d in drafts:
        await conn.execute("update outreach_drafts set status = 'approved' where id = $1", d["id"])
        await conn.execute(
            "insert into outreach_approvals (draft_id, body_hash, staff_email) values ($1, $2, $3)",
            d["id"], d["body_hash"], staff_email)
        await store.event(conn, d["prospect_id"], "approved", step=d["step"], version=d["version"])
        approved.append(str(d["id"]))
    pid = draft["prospect_id"]
    if draft["step"] == 1:
        await gateway.queue_intent(engine, conn, pid, 1, draft_id, None)
        await store.set_stage(conn, pid, "approved")
    else:
        # A held step goes back in the queue with its new approval; one not yet due is queued
        # when the step before it is sent.
        held = await conn.fetchval(
            "select id from outreach_intents where prospect_id = $1 and step = $2 "
            "and status in ('held', 'queued', 'rescheduled')", pid, draft["step"])
        if held or draft["step"] == 4:
            await gateway.queue_intent(engine, conn, pid, draft["step"], draft_id, None)
        if draft["step"] < 4 and p["stage"] == "in_review":
            sent = await conn.fetchval(
                "select true from outreach_sends where prospect_id = $1", pid)
            await store.set_stage(conn, pid, "sending" if sent else "approved")
    for d in drafts[1:]:
        await conn.execute(
            "update outreach_intents set draft_id = $3, status = 'queued' where prospect_id = $1 "
            "and step = $2 and status = 'held'", pid, d["step"], d["id"])
    return approved


async def edit(engine, conn, draft_id, subject: str, body: str, staff_email: str) -> dict:
    draft = await conn.fetchrow("select * from outreach_drafts where id = $1", draft_id)
    if draft is None:
        raise Refused("no such draft", "not_found")
    if draft["status"] not in ("in_review", "approved"):
        raise Refused(f"this draft is {draft['status']}", "not_waiting")
    result = compose.lint(step=draft["step"], subject=subject, body=body,
                          language=draft["language"], sentences=None, kept=set(),
                          settings=engine.settings)
    new_id = await compose.save_draft(
        conn, prospect_id=draft["prospect_id"], step=draft["step"], subject=subject, body=body,
        language=draft["language"], sentences=None, critic={"note": "written by staff"},
        lint_result=result, created_by=staff_email or "staff")
    await store.event(conn, draft["prospect_id"], "edited", step=draft["step"])
    stage = await conn.fetchval("select stage from outreach_prospects where id = $1",
                                draft["prospect_id"])
    if draft["step"] < 4 and stage in ("approved", "researched", "drafting"):
        await store.set_stage(conn, draft["prospect_id"], "in_review", "edited")
    return {"id": str(new_id), "lint": result}


async def reject(conn, draft_id, reason: str) -> None:
    draft = await conn.fetchrow("select * from outreach_drafts where id = $1", draft_id)
    if draft is None:
        raise Refused("no such draft", "not_found")
    if draft["status"] not in ("in_review", "approved"):
        raise Refused(f"this draft is {draft['status']}", "not_waiting")
    await conn.execute(
        "update outreach_drafts set status = 'rejected', reason = $2 where id = $1",
        draft_id, reason[:300])
    await store.event(conn, draft["prospect_id"], "rejected", step=draft["step"])
    if draft["step"] == 1:
        await conn.execute(
            "update outreach_intents set status = 'dropped', last_result = 'rejected' "
            "where prospect_id = $1 and status in ('queued', 'rescheduled', 'held')",
            draft["prospect_id"])
        await store.set_stage(conn, draft["prospect_id"], "rejected", reason)


async def tick(engine, now: datetime | None = None) -> dict:
    """The engine's recurring work; returns what it queued (for the tests)."""
    now = now or engine.clock()
    local = now.astimezone(DOHA)
    queued = {"sends": 0, "poll": False, "digest": False, "erase": False}
    on = engine.settings.outreach == "on"
    async with store.office(engine.db) as conn:
        row = await store.settings_row(conn)
        if on and not row["kill_switch"]:
            due = await conn.fetch(
                "update outreach_intents set enqueued_at = $1 where id in ("
                " select id from outreach_intents where status in ('queued', 'rescheduled') "
                " and run_at <= $1 and (enqueued_at is null or enqueued_at < $1::timestamptz - "
                " make_interval(mins => $2)) for update skip locked) returning id",
                now, REQUEUE_MINUTES)
            for intent in due:
                await engine.queue(conn, "outreach.send", {"intent_id": str(intent["id"])})
            queued["sends"] = len(due)
        if on and await conn.fetchval(
            "update outreach_settings set last_poll_at = $1 where last_poll_at is null "
            "or last_poll_at <= $1::timestamptz - make_interval(mins => $2) returning true",
            now, POLL_MINUTES,
        ):
            await engine.queue(conn, "outreach.poll_replies", {})
            queued["poll"] = True
        if local.hour >= DIGEST_HOUR and await conn.fetchval(
            "update outreach_settings set last_digest_on = $1 where last_digest_on is null "
            "or last_digest_on < $1 returning true", local.date(),
        ):
            await engine.queue(conn, "outreach.digest", {})
            queued["digest"] = True
        if await conn.fetchval(
            "update outreach_settings set last_erase_on = $1 where last_erase_on is null "
            "or last_erase_on < $1 returning true", local.date(),
        ):
            await engine.queue(conn, "outreach.erase", {})
            queued["erase"] = True
    return queued


async def digest_counts(engine, now: datetime | None = None) -> dict:
    """Yesterday's numbers (Doha's day). Counts only: no name, address or message."""
    now = now or datetime.now(UTC)
    day = now.astimezone(DOHA).date()
    today = datetime.combine(day, time(0), DOHA)
    yesterday = datetime.combine(day - timedelta(days=1), time(0), DOHA)
    async with store.office(engine.db) as conn:
        return dict(await conn.fetchrow(
            "select "
            "(select count(*) from outreach_sends where sent_at >= $1 and sent_at < $2) as sends, "
            "(select count(*) from outreach_replies where received_at >= $1 "
            " and received_at < $2 and kind in ('read', 'unmatched')) as replies, "
            "(select count(*) from outreach_replies where received_at >= $1 "
            " and received_at < $2 and kind = 'opt_out') + (select count(*) from "
            " outreach_suppression where at >= $1 and at < $2 and source = 'unsubscribe') "
            " as opt_outs, "
            "(select count(*) from outreach_replies where received_at >= $1 "
            " and received_at < $2 and kind = 'bounce') as bounces, "
            "(select count(*) from outreach_events where at >= $1 and at < $2 "
            " and kind = 'gateway' and detail->>'outcome' in ('block', 'hold', 'trip')) "
            " as refusals, "
            "(select count(*) from outreach_drafts where status = 'in_review') as to_review, "
            "(select count(*) from outreach_replies where needs_founder and handled_at is null) "
            " as replies_waiting, "
            "(select count(*) from outreach_events where at >= $1 and at < $2 "
            " and kind = 'spend_cap') as budget_stops",
            yesterday, today))


async def digest(engine) -> str:
    c = await digest_counts(engine)
    body = (f"Yesterday: {c['sends']} sent, {c['replies']} replies, {c['opt_outs']} opt-outs, "
            f"{c['bounces']} bounces, {c['refusals']} stopped by the gateway.\n"
            f"Waiting for you: {c['to_review']} drafts, {c['replies_waiting']} replies."
            + ("\nThe model budget ran out; research and drafting waited for the next day."
               if c["budget_stops"] else ""))
    await alerts.notify("Outreach: yesterday", body, urgent=False, tag="email")
    return body
