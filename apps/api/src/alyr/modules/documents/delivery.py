"""Getting an issued document to the customer (ALY-139, spec 013).

Three ways out, one record of each attempt (`document_deliveries`):

* **WhatsApp.** Inside the customer's 24-hour window the PDF goes as a WhatsApp document message
  with a short caption; outside it, as the header of an approved UTILITY template
  (`document_receipt`, `document_invoice`, `document_credit_note` in `core/templates.py`, written
  but not yet submitted to Meta). Either way it goes through `Outbound.send`, which checks
  consent, the window and the messaging limit like every other message and queues the send job,
  so a refusal is recorded (and shown to the owner as "not delivered") and a failure is retried
  with backoff. The delivery's state is read from the `messages` row that Meta's reports keep up
  to date: queued, sent, delivered (read counts), failed, blocked.
* **Email.** The PDF attached, a plain-text twin, the subject in the customer's language, only
  when the customer has an address on file (or staff typed one), never to a reserved example
  domain. A job of its own retries it; nothing reports back on an email, so it ends at `sent`.
* **A hosted link.** Every send mints a link to the document's page (`core/links.py`, purpose
  `document`, signed, 90 days, no bare ID) and puts it in the message or the email. The page and
  its PDF are in `routes/document_page.py`.

The shop decides what happens on its own (`document_settings`: send at once or only when staff
press send; WhatsApp; email). Staff can always send again, to the customer or to another number
or address they type; that is audited. A document sent to a typed number that is not a contact
is recorded as blocked (we have no consent to message a stranger): ALYR never starts a
conversation with someone who has not agreed to one.
"""

import logging
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.config import get_settings
from alyr.core import jobs, links, mail, team, templates
from alyr.core.team import Actor
from alyr.db import Database
from alyr.modules.connect import webhooks
from alyr.modules.documents import access, delivery_words, kinds, money
from alyr.modules.documents import settings as doc_settings
from alyr.modules.documents.errors import DocumentError

log = logging.getLogger("alyr.documents.delivery")

JOB = "document_send"
CHANNELS = ("whatsapp", "email")
PHONE = re.compile(r"\d{8,15}")


# ── the record ───────────────────────────────────────────────────────────────────────────

_VIEW = (
    "select d.id, d.document_id, d.channel, d.trigger, d.contact_id, d.recipient, d.language, "
    "d.status, d.error, d.message_id, d.link_expires_at, d.requested_by, d.created_at, "
    "d.updated_at, m.status as message_status, m.error as message_error "
    "from document_deliveries d left join messages m on m.id = d.message_id"
)


def state_of(row: asyncpg.Record) -> tuple[str, str]:
    """(state, reason) of one delivery: queued, sent, delivered, failed or blocked. A WhatsApp
    delivery reads its message; a read message is delivered."""
    if row["channel"] == "whatsapp" and row["message_id"]:
        state = row["message_status"]
        return ("delivered" if state == "read" else state), row["message_error"] or ""
    return row["status"], row["error"]


def present(row: asyncpg.Record) -> dict:
    state, reason = state_of(row)
    return {
        "id": str(row["id"]), "channel": row["channel"], "trigger": row["trigger"],
        "to": row["recipient"] or "customer", "language": row["language"],
        "state": state, "reason": reason,
        "requested_by": row["requested_by"],
        "link_expires_at": row["link_expires_at"].isoformat() if row["link_expires_at"] else None,
        "created_at": row["created_at"].isoformat(), "updated_at": row["updated_at"].isoformat(),
    }


def overall(states: list[str]) -> str:
    """What the owner sees against a document: none (never sent), delivered, sent, queued, or
    not_delivered (everything tried failed or was refused)."""
    if not states:
        return "none"
    for best in ("delivered", "sent", "queued"):
        if best in states:
            return best
    return "not_delivered"


async def deliveries_of(conn: asyncpg.Connection, doc_id: UUID) -> list[dict]:
    rows = await conn.fetch(_VIEW + " where d.document_id = $1 order by d.created_at desc, d.id",
                            doc_id)
    return [present(r) for r in rows]


async def summaries(conn: asyncpg.Connection, doc_ids: list[UUID]) -> dict[str, dict]:
    """The delivery state of each of these documents, in one query: {id: {"state", "count",
    "last"}}. A document never sent is not in the answer."""
    if not doc_ids:
        return {}
    rows = await conn.fetch(
        _VIEW + " where d.document_id = any($1) order by d.created_at desc, d.id", doc_ids)
    grouped: dict[UUID, list[asyncpg.Record]] = {}
    for row in rows:
        grouped.setdefault(row["document_id"], []).append(row)
    return {
        str(doc_id): {
            "state": overall([state_of(r)[0] for r in group]), "count": len(group),
            "last": present(group[0]),
        }
        for doc_id, group in grouped.items()
    }


def summary_of(summary: dict | None) -> dict:
    return summary or {"state": "none", "count": 0, "last": None}


# ── queueing ─────────────────────────────────────────────────────────────────────────────


async def _insert(
    conn: asyncpg.Connection, doc_id: UUID, channel: str, trigger: str, contact_id: UUID | None,
    recipient: str, language: str, actor: Actor, *, status: str = "queued", error: str = "",
) -> UUID | None:
    """A delivery row and, when there is something to send, the job that sends it. For an
    automatic one the database allows a single row per document and channel: the second
    caller gets None and queues nothing."""
    row = await conn.fetchval(
        "insert into document_deliveries (document_id, channel, trigger, contact_id, recipient, "
        "language, status, error, requested_by, requested_by_user) "
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) "
        "on conflict (tenant_id, document_id, channel) where trigger = 'auto' do nothing "
        "returning id",
        doc_id, channel, trigger, contact_id, recipient, language, status, error, actor.name,
        actor.id,
    )
    if row is not None and status == "queued":
        await jobs.enqueue(conn, JOB, {"delivery_id": str(row)})
    return row


async def queue_auto(
    conn: asyncpg.Connection, document: dict, contact_id: UUID | None, *, send: bool | None,
    actor: Actor,
) -> list[UUID]:
    """What the shop's settings send on their own when a document has just been issued.
    `send` is False to send nothing and True to send even if the shop sends by hand."""
    cfg = await doc_settings.get(conn)
    if send is False or (send is None and cfg["send_mode"] != "automatic"):
        return []
    if contact_id is None or document["kind"] not in kinds.KINDS:
        return []
    contact = await conn.fetchrow("select id, lang, email from contacts where id = $1",
                                  contact_id)
    if contact is None:
        return []
    doc_id = UUID(document["id"])
    made = []
    if cfg["auto_send_whatsapp"]:
        made.append(await _insert(conn, doc_id, "whatsapp", "auto", contact_id, "",
                                  contact["lang"], actor))
    if cfg["auto_send_email"] and contact["email"] and mail.deliverable(contact["email"]):
        made.append(await _insert(conn, doc_id, "email", "auto", contact_id, contact["email"],
                                  contact["lang"], actor))
    return [m for m in made if m is not None]


def wants_whatsapp(cfg: dict, send: bool | None) -> bool:
    """Whether a connected sale asks for a WhatsApp message: `send: true` always does; leaving
    it out follows the shop's settings (sent at once, and WhatsApp on); `send: false` never."""
    if send is not None:
        return send
    return cfg["send_mode"] == "automatic" and bool(cfg["auto_send_whatsapp"])


async def queue_connected(
    conn: asyncpg.Connection, document: dict, contact_id: UUID, *, send: bool | None,
    language: str | None, actor: Actor,
) -> list[UUID]:
    """What a sale from another system asks to be sent (ALY-142). `send: true` sends on WhatsApp
    whatever the shop's automatic settings say (it is the other system asking, for this sale)
    and by email when the customer has an address; `false` sends nothing; leaving it out follows
    the shop's settings. The customer's own language decides the words unless the sale gives a
    hint. A customer who said stop is not messaged: the outbound layer refuses it and the
    delivery shows it as not delivered."""
    cfg = await doc_settings.get(conn)
    if send is False or (send is None and cfg["send_mode"] != "automatic"):
        return []
    contact = await conn.fetchrow("select id, lang, email from contacts where id = $1", contact_id)
    if contact is None:
        return []
    doc_id = UUID(document["id"])
    lang = language or contact["lang"]
    made = []
    if wants_whatsapp(cfg, send):
        made.append(await _insert(conn, doc_id, "whatsapp", "auto", contact_id, "", lang, actor))
    if (contact["email"] and mail.deliverable(contact["email"])
            and (send is True or cfg["auto_send_email"])):
        made.append(await _insert(conn, doc_id, "email", "auto", contact_id, contact["email"],
                                  lang, actor))
    return [m for m in made if m is not None]


def clean_phone(text: str) -> str:
    digits = re.sub(r"[\s\-().]", "", text or "").lstrip("+")
    if digits.startswith("00"):
        digits = digits[2:]
    if not PHONE.fullmatch(digits):
        raise DocumentError("phone_invalid", field="phone")
    return digits


async def send(
    conn: asyncpg.Connection, staff, doc_id: UUID, *, channels: list[str] | None = None,
    phone: str | None = None, email: str | None = None, language: str | None = None,
) -> list[dict]:
    """Send an issued document by hand: to its customer, or (owners and admins) to a number or
    an address typed here. Again and again if wanted; every press is on the activity record.
    A delivery already waiting to go to the same place is returned, not doubled."""
    row = await conn.fetchrow(
        "select id, kind, status, number, languages, customer, contact_id, created_by_user, "
        "withdrawn_at from documents where id = $1", doc_id)
    if row is None:
        raise DocumentError("not_found", 404)
    access.require_own_or_manager(staff, row["created_by_user"])
    await access.require_issue(conn, staff)
    if row["status"] == "draft":
        raise DocumentError("not_issued", 409)
    if row["withdrawn_at"] is not None:
        raise DocumentError("document_withdrawn", 409)
    if row["status"] == "void":
        raise DocumentError("document_voided", 409)
    if (phone or email) and not access.is_manager(staff):
        raise DocumentError("not_allowed", 403)
    wanted = list(channels or CHANNELS)
    if language is not None and language not in ("ar", "en"):
        raise DocumentError("kind_unknown", field="language")

    contact = None
    if row["contact_id"]:
        contact = await conn.fetchrow("select id, lang, email from contacts where id = $1",
                                      row["contact_id"])
    customer = row["customer"] or {}
    lead = kinds.languages_of(row["languages"])[0]
    plan: list[tuple[str, UUID | None, str, str]] = []  # channel, contact, recipient, language

    if "whatsapp" in wanted:
        # A number typed here, else the customer's own contact, else the number written on
        # the document.
        typed = (phone or "").strip() or (None if contact else customer.get("phone"))
        if typed:
            digits = clean_phone(typed)
            found = await conn.fetchrow(
                "select id, lang from contacts where phone in ($1, '+' || $1) limit 1", digits)
            plan.append(("whatsapp", found["id"] if found else None, digits,
                         language or (found["lang"] if found else lead)))
        elif contact:
            plan.append(("whatsapp", contact["id"], "", language or contact["lang"]))
    if "email" in wanted:
        address, owner_id = None, None
        if (email or "").strip():
            address = email.strip()
        elif contact and contact["email"]:
            address, owner_id = contact["email"], contact["id"]
        elif customer.get("email"):
            address = customer["email"]
        if address:
            if not mail.deliverable(address):
                raise DocumentError("email_invalid", field="email")
            plan.append(("email", owner_id, address,
                         language or (contact["lang"] if contact else lead)))
    if not plan:
        raise DocumentError("no_recipient", 422)

    actor = team.actor_of(staff)
    sent_before = await conn.fetchval(
        "select count(*) from document_deliveries where document_id = $1", doc_id)
    made = []
    for channel, contact_id, recipient, lang in plan:
        waiting = await conn.fetchrow(
            _VIEW + " where d.document_id = $1 and d.channel = $2 "
            "and d.contact_id is not distinct from $3 and d.recipient = $4 "
            "and (case when d.message_id is null then d.status else m.status end) = 'queued' "
            "order by d.created_at desc limit 1",
            doc_id, channel, contact_id, recipient)
        if waiting is not None:
            made.append(present(waiting))
            continue
        if channel == "whatsapp" and contact_id is None:
            # A number that is not a contact: no consent to message it, so it is recorded
            # as refused and nothing is sent.
            new = await _insert(conn, doc_id, channel, "staff", None, recipient, lang, actor,
                                status="blocked", error="no_consent")
        else:
            new = await _insert(conn, doc_id, channel, "staff", contact_id, recipient, lang, actor)
        made.append(present(await conn.fetchrow(_VIEW + " where d.id = $1", new)))
    await team.record(
        conn, "document", doc_id, "resent" if sent_before else "sent", actor, row["contact_id"],
        {"number": row["number"], "channels": sorted({p[0] for p in plan}),
         "to": "another recipient" if (phone or email) else "customer"},
    )
    return made


async def send_to_contact(
    conn: asyncpg.Connection, staff, doc_id: UUID, contact_id: UUID, *,
    language: str | None = None,
) -> dict:
    """Send an issued document by WhatsApp to one of the shop's contacts, who need not be the
    document's customer: the owner's private test customer on the onboarding test line
    (ALY-141) is the one use. The same checks and the same outbound layer as `send`: a
    contact who has not agreed, or whose window is closed, is recorded as blocked."""
    row = await conn.fetchrow(
        "select id, status, number, contact_id, created_by_user from documents where id = $1",
        doc_id)
    if row is None:
        raise DocumentError("not_found", 404)
    access.require_own_or_manager(staff, row["created_by_user"])
    await access.require_issue(conn, staff)
    if row["status"] == "draft":
        raise DocumentError("not_issued", 409)
    if row["status"] == "void":
        raise DocumentError("document_voided", 409)
    contact = await conn.fetchrow("select id, lang from contacts where id = $1", contact_id)
    if contact is None:
        raise DocumentError("customer_not_found", 404)
    actor = team.actor_of(staff)
    new = await _insert(conn, doc_id, "whatsapp", "staff", contact_id, "",
                        language or contact["lang"], actor)
    await team.record(conn, "document", doc_id, "sent", actor, row["contact_id"],
                      {"number": row["number"], "channels": ["whatsapp"], "to": "test customer"})
    return present(await conn.fetchrow(_VIEW + " where d.id = $1", new))


async def share_link(conn: asyncpg.Connection, staff, doc_id: UUID) -> dict:
    """A link to the hosted page of an issued (or cancelled) document, for the person to copy
    and send by hand. The same signed token a send carries (a third purpose of `core/links`,
    90 days); making one is on the activity record, so "who shared it" has an answer."""
    row = await conn.fetchrow(
        "select id, status, number, contact_id, created_by_user from documents where id = $1",
        doc_id)
    if row is None:
        raise DocumentError("not_found", 404)
    access.require_own_or_manager(staff, row["created_by_user"])
    if row["status"] == "draft":
        raise DocumentError("not_issued", 409)
    shop = await conn.fetchrow(
        "select id, slug from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid")
    if not shop["slug"]:
        raise DocumentError("no_public_link", 409)
    settings = get_settings()
    expires = datetime.now(UTC) + timedelta(days=settings.document_link_days)
    url = links.document_url(settings.public_web_url, shop["slug"], shop["id"], doc_id)
    await team.record(conn, "document", doc_id, "link_created", team.actor_of(staff),
                      row["contact_id"], {"number": row["number"]})
    return {"url": url, "expires_at": expires.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "days": settings.document_link_days}


# ── the job: hand the document to the channel ────────────────────────────────────────────


class DocumentSender:
    """Job handler for `document_send`: one delivery, one channel."""

    def __init__(self, db: Database, outbound) -> None:
        self._db = db
        self._outbound = outbound

    async def _context(self, conn: asyncpg.Connection, d: asyncpg.Record) -> dict:
        doc = await conn.fetchrow(
            "select id, kind, number, currency, currency_exponent, total_minor, paid_minor, "
            "seller from documents where id = $1", d["document_id"])
        pdf = bytes(await conn.fetchval(
            "select content from document_files where document_id = $1", d["document_id"]))
        shop = await conn.fetchrow(
            "select id, slug, name, name_ar from tenants "
            "where id = nullif(current_setting('app.tenant_id', true), '')::uuid")
        settings = get_settings()
        lang = d["language"]
        seller = doc["seller"] or {}
        name = (seller.get("name_ar") if lang == "ar" else None) or seller.get("name") \
            or (shop["name_ar"] if lang == "ar" and shop["name_ar"] else shop["name"])
        # A link is minted every time a document is sent. A shop with no public address (only
        # a test shop lacks one) sends without a link to the page.
        url = (links.document_url(settings.public_web_url, shop["slug"], shop["id"], doc["id"])
               if shop["slug"] else settings.public_web_url)
        shown = doc["paid_minor"] if doc["kind"] == "deposit_receipt" else doc["total_minor"]
        return {
            "doc": doc, "pdf": pdf, "shop": name, "url": url, "lang": lang,
            "amount": money.written(shown, doc["currency"], doc["currency_exponent"], lang),
            "expires": (datetime.now(UTC) + timedelta(days=settings.document_link_days)
                        if shop["slug"] else None),
            "reply_to": None,
        }

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        delivery_id = UUID(payload["delivery_id"])
        async with self._db.tenant(tenant_id) as conn:
            d = await conn.fetchrow(
                "select * from document_deliveries where id = $1 for update", delivery_id)
            if d is None or d["status"] != "queued" or d["message_id"] is not None:
                return  # sent already, or refused: nothing to do
            ctx = await self._context(conn, d)
            if d["channel"] == "whatsapp":
                await self._whatsapp(conn, d, ctx)
                return
            cfg = await doc_settings.get(conn)
            ctx["reply_to"] = cfg["email"] if mail.deliverable(cfg["email"]) else None
        await self._email(tenant_id, d, ctx)

    async def _whatsapp(self, conn: asyncpg.Connection, d: asyncpg.Record, ctx: dict) -> None:
        doc, lang = ctx["doc"], ctx["lang"]
        caption = delivery_words.caption(
            doc["kind"], doc["number"], ctx["shop"], ctx["amount"], ctx["url"], lang)
        file_name = delivery_words.file_name(doc["number"])
        template = delivery_words.TEMPLATE_FOR.get(doc["kind"])
        if template and not get_settings().document_templates_approved:
            standing = await conn.fetchrow(
                "select consent_service, coalesce(last_inbound_at > now() - interval '24 hours', "
                "false) as window_open from contacts where id = $1", d["contact_id"])
            # Outside the 24-hour window only an approved template will do, and these three are
            # written and not yet approved by Meta (ALY-139). Say so at once, honestly, and
            # fall back to email when the customer has an address, rather than failing at Meta
            # six times (ALY-142). A customer who said stop is told "stopped", not this: the
            # outbound layer refuses that one first. The hosted link is in the failure event.
            if not standing["window_open"] and standing["consent_service"] != "revoked":
                await self._not_delivered(conn, d, ctx, "template_not_approved")
                return
        if template:
            message = templates.notice(
                d["contact_id"], template, lang, caption, doc["number"], ctx["shop"],
                ctx["amount"], ctx["url"], document=ctx["pdf"], filename=file_name,
            )
        else:
            message = OutboundMessage(
                to=d["contact_id"], kind="document", body=caption, document=ctx["pdf"],
                filename=file_name, lang=lang,
            )
        sent = await self._outbound.send(conn, message)
        await conn.execute(
            "update document_deliveries set message_id = $2, link_expires_at = $3, "
            "updated_at = now() where id = $1", d["id"], sent.message_id, ctx["expires"])
        if sent.blocked:
            # Refused by the outbound layer (no consent, a customer who said stop, the window):
            # recorded as blocked, and the shop's other system is told.
            await webhooks.emit(conn, "document.failed", _failure(
                doc, d, ctx, sent.blocked))

    async def _not_delivered(self, conn: asyncpg.Connection, d: asyncpg.Record, ctx: dict,
                             reason: str) -> None:
        """The WhatsApp message cannot be sent: write that down, tell the shop's other system
        (with the hosted link, so it can pass the document on some other way), and fall back to
        email when the customer has an address and no email was queued for this document."""
        doc = ctx["doc"]
        await conn.execute(
            "update document_deliveries set status = 'blocked', error = $2, "
            "link_expires_at = $3, updated_at = now() where id = $1 and status = 'queued'",
            d["id"], reason, ctx["expires"])
        await webhooks.emit(conn, "document.failed", _failure(doc, d, ctx, reason))
        email = await conn.fetchval("select email from contacts where id = $1", d["contact_id"])
        if email and mail.deliverable(email):
            await _insert(conn, doc["id"], "email", "auto", d["contact_id"], email, d["language"],
                          Actor(None, "ALYR"))

    async def on_failed(self, tenant_id: UUID, delivery_id: UUID, reason: str) -> None:
        """A delivery ended badly outside the job's own path (an email that cannot be sent):
        tell the shop's other system."""
        async with self._db.tenant(tenant_id) as conn:
            row = await conn.fetchrow(
                "select d.id, d.document_id, d.channel, doc.number, doc.kind "
                "from document_deliveries d join documents doc on doc.id = d.document_id "
                "where d.id = $1", delivery_id)
            if row is None:
                return
            await webhooks.emit(conn, "document.failed", {
                "document_id": str(row["document_id"]), "number": row["number"],
                "delivery_id": str(row["id"]), "channel": row["channel"], "reason": reason,
            })

    async def _email(self, tenant_id: UUID, d: asyncpg.Record, ctx: dict) -> None:
        doc, lang = ctx["doc"], ctx["lang"]
        if not mail.deliverable(d["recipient"]):
            await self._finish(tenant_id, d["id"], "failed", "email_invalid", ctx)
            return
        if not mail.configured():
            await self._finish(tenant_id, d["id"], "failed", "email_not_set_up", ctx)
            return
        args = (doc["kind"], doc["number"], ctx["shop"], ctx["amount"], ctx["url"], lang)
        try:
            await mail.send(
                d["recipient"], delivery_words.email_subject(*args[:3], lang),
                delivery_words.email_text(*args), delivery_words.email_html(*args),
                attachments=[(delivery_words.file_name(doc["number"]), ctx["pdf"])],
                reply_to=ctx["reply_to"], from_name=ctx["shop"],
            )
        except mail.MailError:
            raise  # the job queue tries again later, with a longer wait each time
        await self._finish(tenant_id, d["id"], "sent", "", ctx)

    async def _finish(self, tenant_id: UUID, delivery_id: UUID, status: str, error: str,
                      ctx: dict) -> None:
        async with self._db.tenant(tenant_id) as conn:
            await conn.execute(
                "update document_deliveries set status = $2, error = $3, link_expires_at = $4, "
                "updated_at = now() where id = $1 and status = 'queued'",
                delivery_id, status, error, ctx["expires"])
        if status == "failed":
            await self.on_failed(tenant_id, delivery_id, error)

    async def gave_up(self, tenant_id: UUID, payload: dict) -> None:
        """Every try failed: the owner sees the document as not delivered."""
        async with self._db.tenant(tenant_id) as conn:
            changed = await conn.execute(
                "update document_deliveries set status = 'failed', "
                "error = 'could not be delivered', updated_at = now() "
                "where id = $1 and status = 'queued' and message_id is null",
                UUID(payload["delivery_id"]))
        if changed == "UPDATE 1":
            await self.on_failed(tenant_id, UUID(payload["delivery_id"]),
                                 "could not be delivered")


def _failure(doc: asyncpg.Record, d: asyncpg.Record, ctx: dict, reason: str) -> dict:
    """The `document.failed` event: which document, which way, why, and the hosted link."""
    return {
        "document_id": str(doc["id"]), "number": doc["number"], "delivery_id": str(d["id"]),
        "channel": d["channel"], "reason": reason, "hosted_url": ctx["url"],
    }


async def on_message_failed(conn: asyncpg.Connection, message_id: UUID, reason: str) -> None:
    """Every try to send a WhatsApp message failed (`Outbound.gave_up`): if it carried a
    document, tell the shop's other system."""
    row = await conn.fetchrow(
        "select d.id, d.document_id, d.channel, doc.number from document_deliveries d "
        "join documents doc on doc.id = d.document_id where d.message_id = $1", message_id)
    if row is not None:
        await webhooks.emit(conn, "document.failed", {
            "document_id": str(row["document_id"]), "number": row["number"],
            "delivery_id": str(row["id"]), "channel": row["channel"], "reason": reason},
            once=("delivery_id", str(row["id"])))


async def on_message_status(conn: asyncpg.Connection, provider_id: str, status: str,
                            error: str = "") -> None:
    """A delivery report from WhatsApp for a message that carried a document: tell the shop's
    other system once that it arrived, or that it did not. Called by the inbound path after
    `Outbound.record_status` has moved the message on; costs one query for any other message."""
    row = await conn.fetchrow(
        "select d.id, d.document_id, d.channel, doc.number from document_deliveries d "
        "join messages m on m.id = d.message_id join documents doc on doc.id = d.document_id "
        "where m.wa_message_id = $1", provider_id)
    if row is None:
        return
    data = {"document_id": str(row["document_id"]), "number": row["number"],
            "delivery_id": str(row["id"]), "channel": row["channel"]}
    if status in ("delivered", "read"):
        await webhooks.emit(conn, "document.delivered", data, once=("delivery_id", str(row["id"])))
    elif status == "failed":
        await webhooks.emit(conn, "document.failed", {**data, "reason": error or "failed"},
                            once=("delivery_id", str(row["id"])))
