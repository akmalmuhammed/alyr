"""Who has agreed to be messaged, and the customer's stop and start words.

Meta requires opt-in before a business starts a conversation, and Qatar's privacy law
requires a record of consent. Every change is appended to `consents` with its source and
the customer's own wording; the current state is kept on the contact for fast checks.

Every function takes a tenant-scoped connection. See docs/decisions.md D-020.
"""

import re
from uuid import UUID

import asyncpg

from alyr.channels.base import InboundMessage, OutboundMessage
from alyr.core import templates

# Matched against the whole message, not a word inside it, so "please stop by tomorrow"
# does not unsubscribe anyone.
STOP_WORDS = {"stop", "unsubscribe", "opt out", "optout", "cancel messages",
              "إيقاف", "ايقاف", "توقف", "لا ترسل", "الغاء الاشتراك", "إلغاء الاشتراك"}
START_WORDS = {"start", "subscribe", "opt in", "اشترك", "ابدأ", "ابدا", "تفعيل"}

_PUNCTUATION = re.compile(r"[\s.!?،؟]+")

# Each purpose has its own current state on the contact. `back_in_stock` is the consent a
# customer gives by asking to be told when one item is back: a single message, for that. It
# is not marketing consent and never sets `consent_marketing`.
COLUMNS = {
    "service": "consent_service",
    "marketing": "consent_marketing",
    "back_in_stock": "consent_back_in_stock",
}


def _plain(text: str) -> str:
    return _PUNCTUATION.sub(" ", text).strip().lower()


async def record(
    conn: asyncpg.Connection,
    contact_id: UUID,
    purpose: str,
    status: str,
    source: str,
    wording: str = "",
) -> None:
    """Append a consent change and update the contact's current state for that purpose."""
    column = COLUMNS.get(purpose)
    if column is None:
        raise ValueError(f"unknown consent purpose {purpose!r}")
    await conn.execute(
        "insert into consents (contact_id, purpose, status, source, wording) "
        "values ($1, $2, $3, $4, $5)",
        contact_id, purpose, status, source, wording[:500],
    )
    await conn.execute(f"update contacts set {column} = $2 where id = $1", contact_id, status)


async def current(conn: asyncpg.Connection, contact_id: UUID, purpose: str) -> str:
    """Where a contact stands on one purpose now: unknown, granted or revoked."""
    return await conn.fetchval(
        f"select {COLUMNS[purpose]} from contacts where id = $1", contact_id
    )


async def on_inbound(
    conn: asyncpg.Connection, contact: asyncpg.Record, message: InboundMessage, shop: str
) -> OutboundMessage | None:
    """Called for every customer message, before any module sees it.

    Opens the 24-hour window, records implied service consent on first contact, and
    handles stop and start. Returns a reply when the message was a stop or start word,
    in which case no module should answer.
    """
    await conn.execute("update contacts set last_inbound_at = now() where id = $1", contact["id"])
    if contact["role"] == "staff":
        return None
    state = await conn.fetchval(
        "select consent_service from contacts where id = $1", contact["id"]
    )
    word = _plain(message.text) if not message.reply_id else ""
    arabic = contact["lang"] == "ar" or bool(re.search(r"[؀-ۿ]", message.text))

    if word in STOP_WORDS:
        for purpose in ("service", "marketing"):
            await record(conn, contact["id"], purpose, "revoked", "customer_message",
                         message.text)
        if await current(conn, contact["id"], "back_in_stock") == "granted":
            await record(conn, contact["id"], "back_in_stock", "revoked", "customer_message",
                         message.text)
        # Nothing more goes to this customer, so every "tell me when it is back" they
        # asked for (modules/items/watches.py) is closed unsent.
        await conn.execute(
            "update stock_watches set status = 'cancelled', closed_at = now() "
            "where contact_id = $1 and status = 'waiting'",
            contact["id"],
        )
        body = (
            f"لن تصلك تذكيرات أو إشعارات من {shop} بعد الآن. ما زال بإمكانك مراسلتنا هنا. "
            "أرسل «اشترك» لإعادة تفعيلها." if arabic
            else f"You will not receive reminders or notices from {shop} any more. "
                 "You can still message us here. Send START to turn them back on."
        )
        return OutboundMessage(to=contact["id"], body=body)

    if word in START_WORDS:
        await record(conn, contact["id"], "service", "granted", "customer_message",
                     message.text)
        body = (
            f"تم. ستصلك إشعارات {shop} من جديد." if arabic
            else f"Done. You will receive notices from {shop} again."
        )
        return OutboundMessage(to=contact["id"], body=body)

    if state == "unknown":
        # Writing to the shop first is the customer's agreement to be answered and to
        # receive service notices. It is not agreement to marketing.
        await record(conn, contact["id"], "service", "granted", "customer_initiated")
    return None


def refusal(contact: asyncpg.Record, message: OutboundMessage) -> str | None:
    """Why this message may not be sent to this contact, or None if it may.

    `contact` needs consent_service, consent_marketing, consent_back_in_stock and
    window_open. A marketing template that names a narrower consent (`Template.consent`)
    needs that consent and not the general one: a customer who only asked to be told when
    an item is back has not agreed to marketing, and one who agreed to marketing has not
    asked for that item.
    """
    if message.kind != "template":
        # A document is something ALYR sends, not a reply to what the customer just said, so
        # a customer who said stop gets none even inside the window (ALY-139).
        if message.kind == "document" and contact["consent_service"] == "revoked":
            return "opted_out"
        # Free-form text is only allowed as a reply, inside the 24-hour window.
        return None if contact["window_open"] else "window_closed"
    if message.template_category == "marketing":
        known = templates.CATALOGUE.get(message.template_name)
        if known is not None and known.consent:
            held = contact[COLUMNS[known.consent]] == "granted"
            return None if held else f"no_{known.consent}_consent"
        return None if contact["consent_marketing"] == "granted" else "no_marketing_consent"
    if contact["consent_service"] == "revoked":
        return "opted_out"
    if contact["consent_service"] != "granted":
        return "no_consent"
    return None


async def history(conn: asyncpg.Connection, contact_id: UUID) -> list[dict]:
    rows = await conn.fetch(
        "select purpose, status, source, wording, created_at from consents "
        "where contact_id = $1 order by created_at",
        contact_id,
    )
    return [{**dict(r), "created_at": r["created_at"].isoformat()} for r in rows]
