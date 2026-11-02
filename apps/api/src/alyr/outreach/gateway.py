"""The send gateway: plain code, the only place that sends (specs/065, "The send gateway").

The model proposes; this disposes. A send intent (prospect, step, draft) is checked in a fixed
order and the first failure decides:

 1 switched on, kill switch off, mailbox configured, prospect not paused -> stop, stays queued
 2 the address is not a honeytoken            -> trip the kill switch, alert, stop everything
 3 the idempotency key was not used           -> a duplicate: nothing happens
 4 an approval for this draft and its hash, or the level allows this step -> held, back to review
 5 neither the address nor its domain is suppressed -> blocked for good
 6 the country allows it and the basis is recorded and allowed -> blocked, a person decides
 7 frequency: no other active sequence for the contact or company, the gap since the last step
                                              -> rescheduled
 8 the mailbox's last 7 days: bounces under 2%, opt-outs under 3% (from 20 sends) -> paused, alert
 9 caps: the mailbox's ramp (10, 20, 30, then 40 a day) and the global cap -> next working day
10 the recipient's working day and hours      -> the next opening
11 final lint (legal line, opt-out, no uncited fact, words, subject, no link in the first
   message, no tracking), and a working unsubscribe link -> held, back to review

Then the intent is claimed (status `sending`) and committed BEFORE the SMTP call, so a retry or a
second worker finds the key used (check 3). After the server takes the message, the send, the
intent, the draft, the timeline and an audit row are written in one transaction. A definite
refusal by the server releases the claim; a connection that broke mid-send keeps it, because the
message may have gone, and a message must never go twice.
"""

import logging
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from zoneinfo import ZoneInfo

from alyr.core import alerts
from alyr.outreach import compose, policy, store, unsubscribe
from alyr.outreach.providers.mailbox import NotSent, Uncertain

log = logging.getLogger("alyr.outreach.gateway")
DOHA = ZoneInfo("Asia/Qatar")
RAMP = (10, 20, 30, 40)
HEALTH_MIN_SENDS = 20
GAPS = {2: 3, 3: 7}  # working days after the step before
CONTACT_REST_DAYS, COMPANY_REST_DAYS = 90, 30


class Retry(Exception):
    """The server did not take the message this time; the job runner tries again later."""


def ramp_cap(first_send_on: date | None, today: date) -> int:
    if first_send_on is None:
        return RAMP[0]
    return RAMP[min(max(0, (today - first_send_on).days) // 7, len(RAMP) - 1)]


def doha_day_start(now: datetime) -> datetime:
    return datetime.combine(now.astimezone(DOHA).date(), datetime.min.time(), DOHA)


async def _approved(conn, intent, draft, level: int) -> bool:
    if draft is None or draft["id"] != intent["draft_id"]:
        return False
    if draft["status"] == "approved" and await conn.fetchval(
        "select true from outreach_approvals where draft_id = $1 and body_hash = $2",
        draft["id"], draft["body_hash"],
    ) and draft["body_hash"] == store.body_hash(draft["subject"], draft["body"]):
        return True
    # L2 and above: a follow-up goes as drafted, if it still passes the lint (check 11).
    return intent["step"] in (2, 3) and level >= 2 and draft["status"] in ("in_review", "approved")


async def checks(engine, conn, intent, now: datetime) -> tuple[int, str, str, datetime | None]:
    """(check number, outcome, reason, new time). Outcome is one of: pass, stop, trip, duplicate,
    hold, block, reschedule, pause."""
    s = engine.settings
    p = await conn.fetchrow("select * from outreach_prospects where id = $1 for update",
                            intent["prospect_id"])
    draft = await conn.fetchrow("select * from outreach_drafts where id = $1", intent["draft_id"])
    row = await store.settings_row(conn)
    country = p["country"]

    # 1
    if s.outreach != "on":
        return 1, "stop", "outreach is off (ALYR_OUTREACH)", None
    if row["kill_switch"]:
        return 1, "stop", "the kill switch is on", None
    if not (s.outreach_from and engine.providers.mailbox):
        return 1, "stop", "no outreach mailbox configured", None
    if p["paused"]:
        return 1, "stop", "the prospect is paused", None
    # 2
    if store.honeytoken(row, p["email"] or ""):
        return 2, "trip", "a honeytoken address", None
    # 3
    if intent["status"] in ("sending", "sent") or await conn.fetchval(
            "select true from outreach_sends where intent_id = $1", intent["id"]):
        return 3, "duplicate", "already sent or being sent", None
    # 4
    requested = p["level"] if p["level"] is not None else row["default_level"]
    level = policy.level(requested, country)
    if not await _approved(conn, intent, draft, level):
        return 4, "hold", "no approval for this exact text", None
    # 5
    if not p["email"] or await store.suppressed(conn, p["email"]):
        return 5, "block", "the address or its domain is suppressed", None
    # 6
    refusal = policy.basis_refusal(country, p["basis"], p["basis_note"], p["email"],
                                   p["email_source"] == "published")
    if refusal:
        return 6, "block", refusal, None
    # 7
    other = await conn.fetchval(
        "select count(*) from outreach_prospects where id <> $1 and stage = any($4::text[]) "
        "and ((email_hash is not null and email_hash = $2) or (domain <> '' and domain = $3))",
        p["id"], p["email_hash"], p["domain"], list(store.ACTIVE))
    if other:
        return 7, "reschedule", "another sequence is running for this contact or company", \
            policy.after_working_days(country, now, 1)
    rested = await conn.fetchval(
        "select max(s.sent_at + case when q.email_hash = $2 then make_interval(days => $4) "
        "else make_interval(days => $5) end) from outreach_sends s "
        "join outreach_prospects q on q.id = s.prospect_id "
        "where q.id <> $1 and q.stage = any($6::text[]) "
        "and ((q.email_hash is not null and q.email_hash = $2) or (q.domain <> '' and "
        "q.domain = $3))",
        p["id"], p["email_hash"], p["domain"], CONTACT_REST_DAYS, COMPANY_REST_DAYS,
        list(store.FINISHED))
    if rested and rested > now:
        return 7, "reschedule", "this contact or company finished a sequence recently", rested
    if intent["step"] in GAPS:
        last = await conn.fetchval(
            "select max(sent_at) from outreach_sends where prospect_id = $1 and step = $2",
            p["id"], intent["step"] - 1)
        if last is None:
            return 7, "reschedule", "the step before has not gone", \
                policy.after_working_days(country, now, 1)
        due = policy.after_working_days(country, last, GAPS[intent["step"]])
        if now < due:
            return 7, "reschedule", "too soon after the step before", due
    # 8
    box = await store.mailbox(conn, s.outreach_from, s.outreach_from_name)
    if box["paused_at"] is not None:
        return 8, "stop", f"the mailbox is paused: {box['paused_reason']}", None
    week = now - timedelta(days=7)
    health = await conn.fetchrow(
        "select count(*) as sends, count(*) filter (where status = 'bounced') as bounced, "
        "(select count(*) from outreach_suppression where at > $2 "
        " and source in ('reply', 'unsubscribe')) as opted_out "
        "from outreach_sends where mailbox_id = $1 and sent_at > $2", box["id"], week)
    if health["sends"] >= HEALTH_MIN_SENDS and (
            health["bounced"] * 100 >= 2 * health["sends"]
            or health["opted_out"] * 100 >= 3 * health["sends"]):
        return 8, "pause", (f"{health['bounced']} bounces and {health['opted_out']} opt-outs "
                            f"in {health['sends']} sends over 7 days"), None
    # 9
    today = doha_day_start(now)
    mine = await conn.fetchval(
        "select count(*) from outreach_sends where mailbox_id = $1 and sent_at >= $2",
        box["id"], today)
    everyone = await conn.fetchval("select count(*) from outreach_sends where sent_at >= $1",
                                   today)
    cap = ramp_cap(box["first_send_on"], now.astimezone(DOHA).date())
    if mine >= cap or everyone >= row["daily_cap"]:
        return 9, "reschedule", f"today's cap is used ({mine} of {cap}; all {everyone} of " \
            f"{row['daily_cap']})", policy.after_working_days(country, now, 1)
    # 10
    if not policy.in_window(country, now):
        return 10, "reschedule", "outside the recipient's working hours", \
            policy.next_opening(country, now)
    # 11
    kept = {r["claim_key"] for r in await compose.kept_claims(conn, p["id"])}
    result = compose.lint(step=intent["step"], subject=draft["subject"], body=draft["body"],
                          language=draft["language"], sentences=draft["sentences"], kept=kept,
                          settings=s)
    if not result["ok"]:
        return 11, "hold", "; ".join(result["problems"])[:300], None
    if not unsubscribe.configured(s):
        return 11, "hold", "no unsubscribe link (ALYR_OUTREACH_UNSUBSCRIBE_SECRET and _BASE)", None
    return 0, "pass", "", None


def build_message(engine, *, to: str, subject: str, body: str, send_id, references: str = ""):
    s = engine.settings
    message = EmailMessage()
    message["From"] = formataddr((s.outreach_from_name, s.outreach_from))
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=s.outreach_from.rpartition("@")[2] or None)
    if references:
        message["In-Reply-To"] = references
        message["References"] = references
    link = unsubscribe.link(s, send_id)
    message["List-Unsubscribe"] = f"<mailto:{s.outreach_from}?subject=unsubscribe>, <{link}>"
    message["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    message.set_content(body)  # plain text only: no pixel, no tracked link
    return message


async def attempt(engine, intent_id) -> str:
    """Run the checks for one intent and send it if they all pass. Returns the outcome."""
    import uuid

    now = engine.clock()
    tell: tuple[str, str] | None = None
    async with store.office(engine.db) as conn:
        intent = await conn.fetchrow(
            "select * from outreach_intents where id = $1 for update", intent_id)
        if intent is None or intent["status"] in ("blocked", "dropped", "held"):
            return "nothing to do"
        number, outcome, reason, when = await checks(engine, conn, intent, now)
        pid = intent["prospect_id"]
        await conn.execute(
            "update outreach_intents set last_check = $2, last_result = $3, updated_at = now() "
            "where id = $1", intent_id, number, reason or "passed")
        if outcome != "pass":
            await store.event(conn, pid, "gateway", check=number, outcome=outcome, reason=reason,
                              step=intent["step"])
        if outcome == "trip":
            await conn.execute(
                "update outreach_settings set kill_switch = true, kill_reason = $1, "
                "kill_at = now(), kill_by = 'gateway'", "a honeytoken was about to be sent to")
            await conn.execute("update outreach_intents set status = 'blocked' where id = $1",
                               intent_id)
            await _audit(conn, "outreach.kill_switch", pid, {"reason": "honeytoken", "on": True})
            tell = ("Outreach stopped: honeytoken", "The send gateway tripped the kill switch: a "
                    "message was about to go to a honeytoken address. Nothing more is sent until "
                    "a person clears it in /ops/outreach.")
        elif outcome == "duplicate" or outcome == "stop":
            pass
        elif outcome == "hold":
            await conn.execute("update outreach_intents set status = 'held' where id = $1",
                               intent_id)
            if intent["step"] < 4:
                await store.set_stage(conn, pid, "in_review", f"held: {reason}")
        elif outcome == "block":
            await conn.execute("update outreach_intents set status = 'blocked' where id = $1",
                               intent_id)
            if number == 5:
                await store.stop_sequence(conn, pid, "opted_out", "suppressed")
            else:
                await store.set_stage(conn, pid, "needs_human", reason)
        elif outcome == "reschedule":
            await conn.execute(
                "update outreach_intents set status = 'rescheduled', run_at = $2, "
                "enqueued_at = now() where id = $1", intent_id, when)
            await engine.queue(conn, "outreach.send", {"intent_id": str(intent_id)}, run_at=when)
        elif outcome == "pause":
            await conn.execute(
                "update outreach_mailboxes set paused_at = now(), paused_reason = $2 "
                "where from_address = $1", engine.settings.outreach_from.lower(), reason)
            await _audit(conn, "outreach.mailbox_paused", pid, {"reason": reason})
            tell = ("Outreach mailbox paused", f"The mailbox's health check failed: {reason}. "
                    "Nothing more is sent from it until a person resumes it in /ops/outreach.")
        else:
            p = await conn.fetchrow("select email, domain from outreach_prospects where id = $1",
                                    pid)
            draft = await conn.fetchrow("select * from outreach_drafts where id = $1",
                                        intent["draft_id"])
            first = await conn.fetchval(
                "select message_id from outreach_sends where prospect_id = $1 and step = 1", pid)
            await conn.execute(
                "update outreach_intents set status = 'sending', updated_at = now() where id = $1",
                intent_id)
            send_id = uuid.uuid4()
    if tell:
        await alerts.notify(tell[0], tell[1], urgent=True, tag="no_entry")
    if outcome != "pass":
        return outcome

    message = build_message(engine, to=p["email"], subject=draft["subject"], body=draft["body"],
                            send_id=send_id,
                            references=first if intent["step"] > 1 else "")
    try:
        await engine.providers.mailbox.send(message)
    except NotSent as error:
        async with store.office(engine.db) as conn:
            if error.permanent:
                await conn.execute(
                    "update outreach_intents set status = 'blocked', last_result = $2 "
                    "where id = $1", intent_id, f"the server refused: {error}"[:300])
                await store.set_stage(conn, intent["prospect_id"], "needs_human",
                                      "the mail server refused the message")
            else:
                await conn.execute(
                    "update outreach_intents set status = 'queued', last_result = $2 "
                    "where id = $1", intent_id, f"not sent: {error}"[:300])
            await store.event(conn, intent["prospect_id"], "send_failed", step=intent["step"],
                              permanent=error.permanent, reason=str(error))
        if error.permanent:
            return "refused"
        raise Retry(str(error)) from error
    except Uncertain as error:
        async with store.office(engine.db) as conn:
            await conn.execute(
                "update outreach_intents set last_result = $2 where id = $1", intent_id,
                "the connection broke while sending; it may have gone, so it is never resent")
            await store.event(conn, intent["prospect_id"], "send_uncertain", step=intent["step"],
                              reason=str(error))
        return "uncertain"

    await record_sent(engine, intent, draft, send_id, message["Message-ID"], p)
    return "sent"


async def record_sent(engine, intent, draft, send_id, message_id: str, p) -> None:
    s = engine.settings
    pid, step = intent["prospect_id"], intent["step"]
    async with store.office(engine.db) as conn:
        box = await store.mailbox(conn, s.outreach_from, s.outreach_from_name)
        await conn.execute(
            "insert into outreach_sends (id, intent_id, mailbox_id, prospect_id, step, "
            "message_id, to_hash, domain_hash, sent_at) values ($1, $2, $3, $4, $5, $6, $7, $8, "
            "$9)", send_id, intent["id"], box["id"], pid, step, message_id,
            store.email_hash(p["email"]), store.domain_hash(store.domain_of(p["email"])),
            engine.clock())
        await conn.execute(
            "update outreach_mailboxes set first_send_on = coalesce(first_send_on, $2) "
            "where id = $1", box["id"], engine.clock().astimezone(DOHA).date())
        await conn.execute(
            "update outreach_intents set status = 'sent', last_result = 'sent', "
            "updated_at = now() where id = $1", intent["id"])
        await conn.execute("update outreach_drafts set status = 'sent' where id = $1", draft["id"])
        await store.event(conn, pid, "sent", step=step, send_id=str(send_id))
        await _audit(conn, "outreach.sent", pid, {"step": step, "send_id": str(send_id)})
        stage = await conn.fetchval("select stage from outreach_prospects where id = $1", pid)
        if step == 4:
            return
        if step == 3:
            await store.set_stage(conn, pid, "done", "the sequence ended")
            return
        if stage in ("approved", "in_review", "sending"):
            await store.set_stage(conn, pid, "sending")
        await next_step(engine, conn, pid, step + 1)


async def next_step(engine, conn, prospect_id, step: int) -> None:
    """Queue the next step of the sequence, due its gap after the step just sent. Its draft is the
    newest version; the gateway holds it if it is not approved (or allowed by the level)."""
    draft = await conn.fetchrow(
        "select id from outreach_drafts where prospect_id = $1 and step = $2 "
        "and status in ('approved', 'in_review') order by version desc limit 1",
        prospect_id, step)
    if draft is None:
        return
    country = await conn.fetchval("select country from outreach_prospects where id = $1",
                                  prospect_id)
    due = policy.after_working_days(country, engine.clock(), GAPS[step])
    await queue_intent(engine, conn, prospect_id, step, draft["id"], due)


async def queue_intent(engine, conn, prospect_id, step: int, draft_id,
                       run_at: datetime | None) -> None:
    """One intent per prospect and step, ever (the idempotency key). A new approval of a held
    step points the same intent at the new draft and queues it again. No `run_at`: now (the
    gateway still waits for the recipient's working hours)."""
    key = f"{prospect_id}:{step}"
    row = await conn.fetchrow(
        "insert into outreach_intents (prospect_id, step, draft_id, idempotency_key, run_at, "
        "enqueued_at) values ($1, $2, $3, $4, coalesce($5, now()), now()) "
        "on conflict (idempotency_key) do update set draft_id = excluded.draft_id, "
        "status = 'queued', run_at = greatest(outreach_intents.run_at, excluded.run_at), "
        "enqueued_at = now(), updated_at = now() "
        "where outreach_intents.status in ('held', 'queued', 'rescheduled') returning id, run_at",
        prospect_id, step, draft_id, key, run_at)
    if row is not None:
        await engine.queue(conn, "outreach.send", {"intent_id": str(row["id"])},
                           run_at=run_at and row["run_at"])


async def _audit(conn, action: str, prospect_id, detail: dict) -> None:
    await conn.execute(
        "insert into platform_audit (staff_email, staff_name, action, subject_type, subject_id, "
        "detail) values ('outreach engine', 'ALYR outreach engine', $1, 'outreach_prospect', $2, "
        "$3)", action, str(prospect_id or ""), detail)
