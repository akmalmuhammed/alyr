"""Reading the outreach mailbox's replies (specs/065, "Replies").

Every 5 minutes while outreach is on, the unread messages are read over IMAP and, once stored,
marked read. A message is matched to a send by `In-Reply-To` or `References`, else by the sender's
address (its hash), then, in order:

1. a bounce (a delivery report, or a 5.x.x status): the send is bounced, the address suppressed,
   the sequence stopped;
2. an auto-reply (`Auto-Submitted`, `X-Autoreply`, out-of-office words): logged; at L2 and above
   the next step moves past a stated return date. It does not stop the sequence: nobody answered;
3. opt-out words, in code, before any model, in English and Arabic: suppressed at once, the
   sequence stopped, never answered;
4. the Reader labels the rest. `opt_out` and `not_interested` suppress. Every other reply stops
   the sequence and waits for the founder; `interested` also gets a Concierge draft.
"""

import email
import email.policy
import email.utils
import hashlib
import logging
import re
from datetime import UTC, date, datetime, time, timedelta

from alyr.outreach import compose, policy, store
from alyr.outreach.providers.web import html_text

log = logging.getLogger("alyr.outreach.replies")

BODY_CHARS = 20_000
OPT_OUT_EN = re.compile(r"\b(unsubscribe|remove me|stop|not interested|don'?t contact|do not "
                        r"contact|don'?t email|do not email|take me off)\b", re.I)
OPT_OUT_AR = ("إلغاء", "لا ترسل", "أزل", "ازل", "توقف", "غير مهتم")
OUT_OF_OFFICE = re.compile(r"out of (the )?office|on leave|on vacation|on holiday|away until|"
                           r"automatic reply|auto(matic)?[- ]?reply|خارج المكتب|في إجازة", re.I)
QUOTE_START = re.compile(r"^(On .+wrote:|-----Original Message-----|From: .+|في .+ كتب.*:|"
                         r"________________)", re.M)
STATUS_5XX = re.compile(r"\b5\.\d{1,3}\.\d{1,3}\b")
MESSAGE_IDS = re.compile(r"<[^<>\s@]+@[^<>\s]+>")
ISO_DATE = re.compile(r"\b(20\d\d)-(\d\d)-(\d\d)\b")


def _text(msg) -> str:
    part = msg.get_body(preferencelist=("plain", "html"))
    if part is None:
        return ""
    try:
        content = part.get_content()
    except (LookupError, ValueError):
        content = part.get_payload(decode=True).decode("utf-8", errors="replace")
    if part.get_content_type() == "text/html":
        content = html_text(content, "")[0]
    return content


def without_history(text: str) -> str:
    """The reply's own words: quoted lines and everything from "On ... wrote:" on are removed."""
    match = QUOTE_START.search(text)
    if match:
        text = text[: match.start()]
    lines = [line for line in text.splitlines() if not line.lstrip().startswith(">")]
    return "\n".join(lines).strip()[:BODY_CHARS]


def is_bounce(msg, raw_text: str) -> bool:
    if msg.get_content_type() == "multipart/report" and \
            msg.get_param("report-type", "").lower() == "delivery-status":
        return True
    sender = (msg.get("From") or "").lower()
    subject = (msg.get("Subject") or "").lower()
    daemon = "mailer-daemon" in sender or "postmaster" in sender
    return daemon and ("undeliver" in subject or "failure" in subject or
                       "returned" in subject or bool(STATUS_5XX.search(raw_text)))


def is_auto_reply(msg, text: str) -> bool:
    auto = (msg.get("Auto-Submitted") or "").lower()
    if auto and auto != "no":
        return True
    if msg.get("X-Autoreply") or msg.get("X-Autorespond"):
        return True
    if (msg.get("Precedence") or "").lower() in ("auto_reply", "bulk", "junk"):
        return True
    return bool(OUT_OF_OFFICE.search((msg.get("Subject") or "") + "\n" + text[:2000]))


def opts_out(subject: str, text: str) -> bool:
    words = f"{subject}\n{text}"
    return bool(OPT_OUT_EN.search(words)) or any(w in words for w in OPT_OUT_AR)


def _address(msg) -> str:
    return email.utils.parseaddr(msg.get("From") or "")[1].lower()


async def poll(engine) -> int:
    """Read the unread replies; returns how many were handled."""
    if engine.settings.outreach != "on":
        return 0
    handled, done = 0, []
    for uid, raw in await engine.providers.mailbox.unseen(50):
        try:
            await handle(engine, raw)
            handled += 1
            done.append(uid)
        except Exception:  # noqa: BLE001 - one bad message must not stop the rest
            log.exception("could not handle a reply")
    await engine.providers.mailbox.mark_seen(done)
    return handled


async def handle(engine, raw: bytes) -> str:
    msg = email.message_from_bytes(raw, policy=email.policy.default)
    raw_text = raw.decode("utf-8", errors="replace")
    message_id = (msg.get("Message-ID") or "").strip() or \
        "<sha256-" + hashlib.sha256(raw).hexdigest() + "@unknown>"
    sender = _address(msg)
    subject = str(msg.get("Subject") or "")[:300]

    async with store.office(engine.db) as conn:
        if await conn.fetchval("select true from outreach_replies where message_id = $1",
                               message_id):
            return "seen"

        if is_bounce(msg, raw_text):
            ids = MESSAGE_IDS.findall(raw_text)
            send = await conn.fetchrow(
                "select * from outreach_sends where message_id = any($1::text[]) "
                "order by sent_at desc limit 1", ids) if ids else None
            await conn.execute(
                "insert into outreach_replies (send_id, prospect_id, message_id, from_hash, "
                "subject, kind, label) values ($1, $2, $3, $4, $5, 'bounce', 'bounce')",
                send["id"] if send else None, send["prospect_id"] if send else None,
                message_id, store.email_hash(sender), subject)
            if send is not None and STATUS_5XX.search(raw_text):
                await conn.execute("update outreach_sends set status = 'bounced' where id = $1",
                                   send["id"])
                await store.suppress(conn, to_hash=send["to_hash"], reason="bounced",
                                     source="bounce")
                await store.stop_sequence(conn, send["prospect_id"], "bounced", "bounced")
            return "bounce"

        refs = MESSAGE_IDS.findall(f"{msg.get('In-Reply-To') or ''} {msg.get('References') or ''}")
        send = None
        if refs:
            send = await conn.fetchrow(
                "select * from outreach_sends where message_id = any($1::text[]) "
                "order by sent_at desc limit 1", refs)
        if send is None and sender:
            send = await conn.fetchrow(
                "select * from outreach_sends where to_hash = $1 order by sent_at desc limit 1",
                store.email_hash(sender))
        text = without_history(_text(msg))
        if send is None:
            await conn.execute(
                "insert into outreach_replies (message_id, from_hash, subject, body, kind, "
                "needs_founder) values ($1, $2, $3, $4, 'unmatched', true)",
                message_id, store.email_hash(sender), subject, text)
            return "unmatched"
        pid = send["prospect_id"]
        p = await conn.fetchrow("select * from outreach_prospects where id = $1", pid)
        row = await store.settings_row(conn)
        base = (send["id"], pid, message_id, store.email_hash(sender), subject, text)
        insert = ("insert into outreach_replies (send_id, prospect_id, message_id, from_hash, "
                  "subject, body, kind, label, confidence, needs_founder) values ($1, $2, $3, $4, "
                  "$5, $6, $7, $8, $9, $10) returning id")

        if is_auto_reply(msg, text):
            await conn.fetchval(insert, *base, "auto_reply", "auto_reply", None, False)
            await store.event(conn, pid, "auto_reply")
            requested = p["level"] if p["level"] is not None else row["default_level"]
            back = ISO_DATE.search(text)
            if policy.level(requested, p["country"]) >= 2 and back:
                try:
                    day = date(int(back[1]), int(back[2]), int(back[3]))
                except ValueError:
                    day = None
                if day:
                    after = policy.next_opening(
                        p["country"], datetime.combine(day + timedelta(days=1), time(0), UTC))
                    await conn.execute(
                        "update outreach_intents set run_at = greatest(run_at, $2) "
                        "where prospect_id = $1 and status in ('queued', 'rescheduled')",
                        pid, after)
            return "auto_reply"

        if opts_out(subject, text):
            await conn.fetchval(insert, *base, "opt_out", "opt_out", None, False)
            await store.suppress(conn, to_hash=send["to_hash"], reason="asked to stop",
                                 source="reply")
            if sender and store.email_hash(sender) != send["to_hash"]:
                await store.suppress(conn, email=sender, reason="asked to stop", source="reply")
            await store.stop_sequence(conn, pid, "opted_out", "asked to stop")
            return "opt_out"

        reply_id = await conn.fetchval(insert, *base, "read", "", None, True)
        await store.stop_sequence(conn, pid, "replied", "replied")

    try:
        answer = await engine.models.run(
            "reader", f"Subject: {subject}\n<<<REPLY>>>\n{text[:6000]}\n<<<END REPLY>>>",
            prospect_id=pid, max_tokens=300)
    except Exception as error:  # noqa: BLE001 - the founder reads the reply anyway
        async with store.office(engine.db) as conn:
            await store.event(conn, pid, "reader_failed", reason=type(error).__name__)
        return "read"
    labels = [x.lower() for x in answer["labels"]] or ["other"]
    confidence = float(answer["confidence"])
    async with store.office(engine.db) as conn:
        await conn.execute(
            "update outreach_replies set label = $2, confidence = $3 where id = $1",
            reply_id, ",".join(labels), confidence)
        await store.event(conn, pid, "reply", labels=labels, confidence=confidence,
                          sure=confidence >= 0.8 and len(labels) == 1)
        if labels[0] in ("opt_out", "not_interested"):
            await store.suppress(conn, to_hash=send["to_hash"], reason=labels[0], source="reply")
            await store.set_stage(conn, pid, "opted_out", labels[0])
            await conn.execute("update outreach_replies set needs_founder = false where id = $1",
                               reply_id)
            return labels[0]
    if labels == ["interested"] and confidence >= 0.8:
        await compose.concierge(engine, pid, "interested")
    return labels[0]
