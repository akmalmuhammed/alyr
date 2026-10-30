"""What a customer's link token means to a public page (ALY-112, ALY-133, D-039).

The order page, the booking page, the document page and the tracking page read their token the
same way: the page sends it in the header `X-Order-Link` (the name is the first page's; the
header carries every kind of token) so no request log of ours holds one, `?t=` is still read
for a tool or a test, and a bare ID is not read at all. Each page names its purpose when it
reads, so a token made for another page is refused (`core/links.py`).

A token that is not good does not stop a page from opening in public: the page asks for the
state and shows the customer why, in both languages. Only an action that needs a customer
(placing an order, booking) refuses with a 403 and the same words.
"""

from uuid import UUID

from fastapi import HTTPException, Response

from alyr.core import links
from alyr.modules.items import text

# The sentences for a link that cannot be used. The order page's are the Catalog's own words
# (`modules/items/text.py`); the booking page's are here. Arabic is a draft until ALY-66.
_BOOKING_WORDS = {
    "bad_link": (
        "This booking link is not valid. Message the shop on WhatsApp to get a new one.",
        "رابط الحجز هذا غير صالح. راسل المتجر على واتساب للحصول على رابط جديد.",
    ),
    "expired_link": (
        "This booking link has expired. Message the shop on WhatsApp to get a new one.",
        "انتهت صلاحية رابط الحجز هذا. راسل المتجر على واتساب للحصول على رابط جديد.",
    ),
}
_DOCUMENT_WORDS = {
    "bad_link": (
        "This document link is not valid. Ask the shop to send the document again.",
        "رابط المستند هذا غير صالح. اطلب من المتجر إرسال المستند مرة أخرى.",
    ),
    "expired_link": (
        "This document link has expired. Ask the shop to send the document again.",
        "انتهت صلاحية رابط المستند هذا. اطلب من المتجر إرسال المستند مرة أخرى.",
    ),
}
_TRACK_WORDS = {
    "bad_link": (
        "This tracking link is not valid. Open the newest link in your chat with the shop, "
        "or message the shop on WhatsApp.",
        "رابط تتبّع الطلب هذا غير صالح. افتح أحدث رابط في محادثتك مع المتجر، أو راسل المتجر "
        "على واتساب.",
    ),
    "expired_link": (
        "This tracking link has expired. Message the shop on WhatsApp to get a new one.",
        "انتهت صلاحية رابط تتبّع الطلب هذا. راسل المتجر على واتساب للحصول على رابط جديد.",
    ),
}
_WORDS = {links.BOOKING: _BOOKING_WORDS, links.DOCUMENT: _DOCUMENT_WORDS, links.TRACK: _TRACK_WORDS}
_UNAVAILABLE = {
    links.ORDER: "orders are not available",
    links.BOOKING: "bookings are not available",
    links.DOCUMENT: "documents are not available",
    links.TRACK: "order tracking is not available",
}


def say(purpose: str, code: str, lang: str) -> str:
    """The sentence for `bad_link` or `expired_link`, on the page that asked."""
    if purpose in _WORDS:
        english, arabic = _WORDS[purpose][code]
        return arabic if lang == "ar" else english
    return text.say(code, lang, {})


def state(token: str | None, tenant_id: UUID, purpose: str) -> tuple[links.Link | None, str]:
    """What a token says: (the link, "ok"), or (None, "none" | "invalid" | "expired").
    `invalid` covers every refusal that is not an old link: a malformed or edited token, one
    made for another shop, and one made for another page."""
    if not token:
        return None, "none"
    try:
        return links.read(token, tenant_id, purpose=purpose), "ok"
    except links.LinkError as error:
        return None, "expired" if error.code == "expired" else "invalid"
    except links.LinkSecretMissing as error:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE[purpose]) from error


def refusal(link_state: str, purpose: str) -> HTTPException:
    """The 403 for an action that needs a good link and did not get one."""
    code = "expired_link" if link_state == "expired" else "bad_link"
    return HTTPException(status_code=403, detail={
        "code": code, "message": say(purpose, code, "en"), "message_ar": say(purpose, code, "ar"),
    })


def require(
    token: str | None, tenant_id: UUID, purpose: str, *, required: bool
) -> links.Link | None:
    """The link behind a token. A token that is present and bad is always refused; a missing
    one is refused only where the action needs a customer."""
    link, link_state = state(token, tenant_id, purpose)
    if link is None and (required or link_state in ("invalid", "expired")):
        raise refusal(link_state, purpose)
    return link


def view(link_state: str, purpose: str) -> dict:
    """The page's `link` block: the state and, when it is not good, the words for it."""
    code = {"invalid": "bad_link", "expired": "expired_link"}.get(link_state)
    return {
        "state": link_state,
        "message": say(purpose, code, "en") if code else "",
        "message_ar": say(purpose, code, "ar") if code else "",
    }


def keep_private(response: Response, *, by_link: bool = True) -> None:
    """What these answers say depends on who is asking (a customer's name, their prices),
    so no shared cache may keep one for someone else. A page that takes the token from the
    header also varies by it."""
    response.headers["Cache-Control"] = "private, no-store"
    if by_link:
        response.headers["Vary"] = "X-Order-Link"
