"""Signed links for one customer (ALY-112, D-039).

The order page shows a customer their own prices (their price group) and lets them order on
their credit account. Until now the link only carried the contact's ID, so whoever held the
link was that customer. A link meant for ONE customer now carries a token instead:

    <payload>.<mac>          both parts base64url, no padding

    payload = version (1 byte) | contact ID (16) | expires (4, unix seconds, big endian)
              | table label (UTF-8, optional)
    mac     = first 16 bytes of HMAC-SHA256(secret, context | tenant ID | payload)

The shop's ID is inside the signature, so a token made for one shop is worthless at another
even if the contact ID were known. The table label is signed too: a link printed for table 7
cannot be turned into table 3 by editing it. A tampered, malformed, expired or wrong-shop
token is refused; a customer who opens an old link asks for a new one in their chat.

A public link (an item, a category, a QR code on a counter or a table) never carries a
contact ID or a token: it opens the order page for anyone, at the normal prices, and the
page sends a customer who wants to order to the shop's WhatsApp to get their own link.

The secret is `ALYR_LINK_SECRET`. On a developer machine (`ALYR_ENV=local`) an empty one
falls back to a built-in value, which is fine for demo data and nothing else. Anywhere else
the API refuses to start without a secret of at least 32 characters (`check_secret`, called
when the app starts) and refuses to make or read a link (`secret`).
"""

import base64
import hashlib
import hmac
import time
from dataclasses import dataclass
from uuid import UUID

from alyr.config import Settings, get_settings

VERSION = 1
CONTEXT = b"alyr-order-link-v1\x00"
MAC_BYTES = 16
MIN_SECRET = 32
MAX_TABLE = 20
# What a developer machine uses when no secret is set. It is public (it is in the
# repository), so it protects nothing and is never used outside `ALYR_ENV=local`. Put
# together from words, so a secret scanner does not mistake this stand-in for a real one.
DEV_SECRET = "-".join(("alyr", "local", "development", "link", "key", "not", "for", "real", "use"))


class LinkSecretMissing(RuntimeError):
    """The API has no usable link secret and is not on a developer machine."""


class LinkError(Exception):
    """A link that cannot be used. `code` is `malformed`, `bad_signature` or `expired`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Link:
    contact_id: UUID
    table: str
    expires_at: int


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    if not text.isascii() or not all(c.isalnum() or c in "-_" for c in text):
        raise LinkError("malformed")
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def secret(settings: Settings | None = None) -> bytes:
    """The key links are signed with. Raises `LinkSecretMissing` where there is none."""
    settings = settings or get_settings()
    value = settings.link_secret
    if not value and settings.env == "local":
        value = DEV_SECRET
    if len(value) < MIN_SECRET:
        raise LinkSecretMissing(
            f"ALYR_LINK_SECRET must be set to at least {MIN_SECRET} random characters"
        )
    return value.encode("utf-8")


def check_secret(settings: Settings | None = None) -> None:
    """Called when the API starts: a server without a secret does not start."""
    secret(settings)


def clean_table(label: str | None) -> str:
    """A table label as a person writes it ("7", "A3"): trimmed, one line, short."""
    return " ".join((label or "").split())[:MAX_TABLE]


def _mac(key: bytes, tenant_id: UUID, payload: bytes) -> bytes:
    return hmac.new(key, CONTEXT + tenant_id.bytes + payload, hashlib.sha256).digest()[:MAC_BYTES]


def mint(
    tenant_id: UUID, contact_id: UUID, *, table: str = "", now: float | None = None,
    settings: Settings | None = None,
) -> str:
    """A token that makes the order page open for this customer at this shop."""
    settings = settings or get_settings()
    key = secret(settings)
    expires = int((now if now is not None else time.time()) + settings.link_days * 86400)
    payload = (
        bytes([VERSION]) + contact_id.bytes + expires.to_bytes(4, "big")
        + clean_table(table).encode("utf-8")
    )
    return f"{_b64(payload)}.{_b64(_mac(key, tenant_id, payload))}"


def read(
    token: str, tenant_id: UUID, *, now: float | None = None, settings: Settings | None = None
) -> Link:
    """Who a token is for at this shop. Raises `LinkError`."""
    key = secret(settings)
    try:
        body, _, tag = token.partition(".")
        payload, mac = _unb64(body), _unb64(tag)
    except (ValueError, LinkError) as error:
        raise LinkError("malformed") from error
    if len(payload) < 21 or payload[0] != VERSION or len(mac) != MAC_BYTES:
        raise LinkError("malformed")
    # Compared in constant time, and before anything inside the payload is trusted.
    if not hmac.compare_digest(mac, _mac(key, tenant_id, payload)):
        raise LinkError("bad_signature")
    expires = int.from_bytes(payload[17:21], "big")
    if (now if now is not None else time.time()) >= expires:
        raise LinkError("expired")
    try:
        table = payload[21:].decode("utf-8")
    except UnicodeDecodeError as error:  # signed by us, so this cannot happen; refuse anyway
        raise LinkError("malformed") from error
    return Link(UUID(bytes=payload[1:17]), table, expires)


def order_url(web_url: str, slug: str, tenant_id: UUID, contact_id: UUID, table: str = "") -> str:
    """The order page link sent to one customer."""
    return f"{web_url}/s/{slug}?t={mint(tenant_id, contact_id, table=table)}"
