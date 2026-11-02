"""One-click unsubscribe (specs/065; RFC 8058).

Every message carries `List-Unsubscribe: <mailto:...>, <https://.../o/unsubscribe/{token}>` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The token is the send's ID with an HMAC-SHA256
of it (`ALYR_OUTREACH_UNSUBSCRIBE_SECRET`), so it names a send without revealing the address, and
a forged one is refused. Using it suppresses the address's hash for good and stops the sequence.
A `mailto:` unsubscribe reaches the reply inbox and is caught by the opt-out words there.
"""

import base64
import hashlib
import hmac
from uuid import UUID

from alyr.config import Settings
from alyr.outreach import store

MIN_SECRET = 32
MAC_BYTES = 16


def configured(settings: Settings) -> bool:
    return len(settings.outreach_unsubscribe_secret) >= MIN_SECRET and \
        settings.outreach_unsubscribe_base.startswith(("https://", "http://"))


def _mac(settings: Settings, raw: bytes) -> bytes:
    return hmac.new(settings.outreach_unsubscribe_secret.encode(), b"unsubscribe:" + raw,
                    hashlib.sha256).digest()[:MAC_BYTES]


def token(settings: Settings, send_id: UUID) -> str:
    raw = send_id.bytes
    return base64.urlsafe_b64encode(raw + _mac(settings, raw)).decode().rstrip("=")


def link(settings: Settings, send_id: UUID) -> str:
    base = settings.outreach_unsubscribe_base.rstrip("/")
    return f"{base}/o/unsubscribe/{token(settings, send_id)}"


def read(settings: Settings, value: str) -> UUID | None:
    """The send a token names, or None for a token that is malformed or forged."""
    if not configured(settings) or not value or len(value) > 64:
        return None
    try:
        data = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, TypeError):
        return None
    if len(data) != 16 + MAC_BYTES:
        return None
    raw, mac = data[:16], data[16:]
    if not hmac.compare_digest(mac, _mac(settings, raw)):
        return None
    return UUID(bytes=raw)


async def use(engine, send_id: UUID) -> bool:
    """Suppress the address the send went to and stop its sequence. Safe to repeat."""
    async with store.office(engine.db) as conn:
        send = await conn.fetchrow(
            "select prospect_id, to_hash from outreach_sends where id = $1", send_id)
        if send is None:
            return False
        await store.suppress(conn, to_hash=send["to_hash"], reason="unsubscribed",
                             source="unsubscribe")
        stage = await conn.fetchval("select stage from outreach_prospects where id = $1",
                                    send["prospect_id"])
        if stage != "opted_out":
            await store.stop_sequence(conn, send["prospect_id"], "opted_out", "unsubscribe link")
        return True
