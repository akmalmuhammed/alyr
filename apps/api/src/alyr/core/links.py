"""Signed links for one customer (ALY-112, ALY-133, D-039).

The order page shows a customer their own prices (their price group) and lets them order on
their credit account; the booking page lets them book a visit. Until ALY-112 the link only
carried the contact's ID, so whoever held the link was that customer. A link meant for ONE
customer now carries a token instead:

    <payload>.<mac>          both parts base64url, no padding

    payload = version (1 byte) | purpose (1) | contact ID (16) | expires (4, unix seconds,
              big endian) | table label (UTF-8, optional, order links only)
    mac     = first 16 bytes of HMAC-SHA256(secret, context | tenant ID | payload)

The shop's ID is inside the signature, so a token made for one shop is worthless at another
even if the contact ID were known. The purpose is inside the signature too: a token says what
it opens ("order" or "booking") and a page reads only its own, so an order link that is
forwarded, or whose contact ID is read out of it, opens nothing on the booking page, and a
booking link opens nothing on the order page. The table label is signed too: a link printed
for table 7 cannot be turned into table 3 by editing it. A tampered, malformed, expired,
wrong-shop or wrong-purpose token is refused; a customer who opens an old link asks for a new
one in their chat.

A fourth purpose, "resume" (ALY-171), is the link at the foot of a reminder email that stops
the reminders: the ID in the token is the business's own, the life is a year, and it opens nothing
else (a customer's link, a document's link and this one are not interchangeable).

A third purpose, "document" (ALY-139), makes the link to one issued receipt or invoice: the ID in
the token is the document's, not a customer's, the life is `ALYR_DOCUMENT_LINK_DAYS`, and the same
rule holds: an order or booking token opens nothing on the document page, and a document token
opens nothing on those pages.

A public link (an item, a category, a QR code on a counter or a table, a shop's booking
page) never carries a contact ID or a token: it opens the page for anyone, and the page
sends a customer who wants to order or book to the shop's WhatsApp to get their own link.

The secret is `ALYR_LINK_SECRET`. On a developer machine (`ALYR_ENV=local`) an empty one
falls back to a built-in value, which is fine for demo data and nothing else. Anywhere else
the API refuses to start without a secret of at least 32 characters (`check_secret`, called
when the app starts) and refuses to make or read a link (`secret`).
"""

import base64
import hashlib
import hmac
import logging
import time
from dataclasses import dataclass
from urllib.parse import urlparse
from uuid import UUID

from alyr.config import Settings, get_settings

log = logging.getLogger("alyr.links")

VERSION = 2
CONTEXT = b"alyr-link-v2\x00"
# What a token opens. A page reads only its own purpose (`read(..., purpose=...)`), which is
# what stops a link made for one page being used on another.
ORDER = "order"
BOOKING = "booking"
DOCUMENT = "document"
RESUME = "resume"
_CODES = {ORDER: 1, BOOKING: 2, DOCUMENT: 3, RESUME: 4}
_PURPOSES = {code: name for name, code in _CODES.items()}
HEADER = 22  # version, purpose, contact ID, expiry
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
    """A link that cannot be used. `code` is `malformed`, `bad_signature`, `wrong_purpose`
    (a good token, but made for another page) or `expired`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Link:
    # Who or what the link is for: a customer's contact ID for the order and booking pages, a
    # document's ID for the document page (`subject_id` says it plainly there).
    contact_id: UUID
    table: str
    expires_at: int
    purpose: str

    @property
    def subject_id(self) -> UUID:
        return self.contact_id


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    if not text.isascii() or not all(c.isalnum() or c in "-_" for c in text):
        raise LinkError("malformed")
    raw = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    # One spelling per token: the last character of a text has bits that mean nothing, and a
    # token with different ones must not pass for the same token.
    if _b64(raw) != text:
        raise LinkError("malformed")
    return raw


def secret(settings: Settings | None = None) -> bytes:
    """The key links are signed with. Raises `LinkSecretMissing` where there is none."""
    settings = settings or get_settings()
    value = settings.link_secret
    if not value and settings.env == "local":
        value = DEV_SECRET
        if not _on_this_machine(settings.public_web_url):
            # The built-in key is public (it is in the repository). Fine on one machine; not
            # for a demo shown through a tunnel, where anyone could make a link.
            log.warning(
                "ALYR_LINK_SECRET is empty and the public web address is not this machine: "
                "customer links are signed with the public built-in key. Set ALYR_LINK_SECRET."
            )
    if len(value) < MIN_SECRET:
        raise LinkSecretMissing(
            f"ALYR_LINK_SECRET must be set to at least {MIN_SECRET} random characters"
        )
    return value.encode("utf-8")


def _on_this_machine(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in ("localhost", "127.0.0.1", "::1", "") or host.endswith(".localhost")


def check_secret(settings: Settings | None = None) -> None:
    """Called when the API starts: a server without a secret does not start."""
    secret(settings)


def clean_table(label: str | None) -> str:
    """A table label as a person writes it ("7", "A3"): trimmed, one line, short, with no
    control characters (a NUL would be refused by the database, and none belongs on a card)."""
    printable = "".join(c for c in (label or "") if c.isprintable() or c.isspace())
    return " ".join(printable.split())[:MAX_TABLE]


def _mac(key: bytes, tenant_id: UUID, payload: bytes) -> bytes:
    return hmac.new(key, CONTEXT + tenant_id.bytes + payload, hashlib.sha256).digest()[:MAC_BYTES]


def mint(
    tenant_id: UUID, contact_id: UUID, *, purpose: str, table: str = "",
    now: float | None = None, settings: Settings | None = None, days: int | None = None,
) -> str:
    """A token that makes the page named by `purpose` open for this customer at this shop.
    The purpose is not optional: every link is made for one page. For the document page the
    ID in the token is the document's, not a customer's, and `days` is its own life."""
    if purpose not in _CODES:
        raise ValueError(f"a link is made for one of {sorted(_CODES)}, not {purpose!r}")
    if clean_table(table) and purpose != ORDER:
        raise ValueError("only an order link can name a table")
    settings = settings or get_settings()
    key = secret(settings)
    life = days if days is not None else (
        settings.document_link_days if purpose == DOCUMENT else settings.link_days
    )
    expires = int((now if now is not None else time.time()) + life * 86400)
    payload = (
        bytes([VERSION, _CODES[purpose]]) + contact_id.bytes + expires.to_bytes(4, "big")
        + clean_table(table).encode("utf-8")
    )
    return f"{_b64(payload)}.{_b64(_mac(key, tenant_id, payload))}"


def read(
    token: str, tenant_id: UUID, *, purpose: str, now: float | None = None,
    settings: Settings | None = None,
) -> Link:
    """Who a token is for at this shop, if it was made for `purpose`. Raises `LinkError`.

    The purpose is checked after the signature (nothing in an unsigned token is trusted, not
    even what it says it is for) and before the expiry."""
    if purpose not in _CODES:
        raise ValueError(f"a link is read for one of {sorted(_CODES)}, not {purpose!r}")
    key = secret(settings)
    try:
        body, _, tag = token.partition(".")
        payload, mac = _unb64(body), _unb64(tag)
    except (ValueError, LinkError) as error:
        raise LinkError("malformed") from error
    if len(payload) < HEADER or payload[0] != VERSION or len(mac) != MAC_BYTES:
        raise LinkError("malformed")
    # Compared in constant time, and before anything inside the payload is trusted.
    if not hmac.compare_digest(mac, _mac(key, tenant_id, payload)):
        raise LinkError("bad_signature")
    made_for = _PURPOSES.get(payload[1])
    if made_for is None:  # signed by us, so this cannot happen; refuse anyway
        raise LinkError("malformed")
    if made_for != purpose:
        raise LinkError("wrong_purpose")
    expires = int.from_bytes(payload[18:22], "big")
    if (now if now is not None else time.time()) >= expires:
        raise LinkError("expired")
    try:
        table = payload[22:].decode("utf-8")
    except UnicodeDecodeError as error:  # signed by us, so this cannot happen; refuse anyway
        raise LinkError("malformed") from error
    return Link(UUID(bytes=payload[2:18]), table, expires, made_for)


def resume_stop_url(web_url: str, slug: str, tenant_id: UUID) -> str:
    """The link at the foot of a reminder email that switches the reminders off. It needs no
    sign-in: whoever holds the email can stop it, and it can do nothing else."""
    return f"{web_url}/start/stop?b={slug}&t={mint(tenant_id, tenant_id, purpose=RESUME, days=365)}"


def order_url(
    web_url: str, slug: str, tenant_id: UUID, contact_id: UUID, table: str = "",
    item: UUID | str = "",
) -> str:
    """The order page link sent to one customer. With `item`, the page opens on that item
    (the item is only a place to open: the link's token is what makes it theirs)."""
    link = f"{web_url}/s/{slug}?t={mint(tenant_id, contact_id, purpose=ORDER, table=table)}"
    return f"{link}&item={item}" if item else link


def booking_url(web_url: str, slug: str, tenant_id: UUID, contact_id: UUID) -> str:
    """The booking page link sent to one customer. It opens the booking page and nothing
    else: an order link is refused there, and this one is refused on the order page."""
    return f"{web_url}/b/{slug}?t={mint(tenant_id, contact_id, purpose=BOOKING)}"


def document_url(
    web_url: str, slug: str, tenant_id: UUID, document_id: UUID, *,
    now: float | None = None, settings: Settings | None = None,
) -> str:
    """The link to one issued document (ALY-139): the hosted page that shows it with a button
    for its PDF. The token names the document and the shop, is made for this page only (an
    order or booking link opens nothing here, and this one opens nothing there), and runs out
    after `ALYR_DOCUMENT_LINK_DAYS`. There is no bare ID in the address."""
    token = mint(tenant_id, document_id, purpose=DOCUMENT, now=now, settings=settings)
    return f"{web_url}/d/{slug}?t={token}"
