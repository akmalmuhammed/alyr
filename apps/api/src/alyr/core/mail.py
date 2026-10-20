"""Email ALYR sends itself: sign-in codes, for now (D-029).

One provider, Resend, called over its REST API. Nothing else in the app sends email.

Sign-in codes are sent while the request waits, not through the job queue: a code is
stored only as a hash, and a job would have to keep it in plain text in its payload. A
code is also useless after ten minutes, so there is nothing to retry later. The call has
a short timeout and the person can ask for a new code.
"""

import base64
import logging
from html import escape

import httpx

from alyr import brand
from alyr.config import get_settings

log = logging.getLogger("alyr.mail")

API = "https://api.resend.com/emails"
TIMEOUT_SECONDS = 8

# Tests replace this with an httpx.MockTransport; nothing else should.
transport: httpx.AsyncBaseTransport | None = None


class MailError(Exception):
    """The provider did not accept the message."""


def configured() -> bool:
    return bool(get_settings().email_api_key)


# Domains reserved for examples and tests (RFC 2606). The demo shops' people use them, and
# nothing should ever be emailed there.
RESERVED_DOMAINS = (".example", ".test", ".invalid", ".localhost")


def deliverable(address: str) -> bool:
    """Whether an address could be a real person's: it has a name, an @ and a dotted domain,
    and the domain is not one reserved for examples. Every email ALYR sends to a customer or
    an owner (the weekly report, a document) is checked with this first."""
    address = (address or "").strip()
    local, at, domain = address.rpartition("@")
    domain = domain.lower()
    if not (local and at and "." in domain) or any(c.isspace() for c in address):
        return False
    return not domain.endswith(RESERVED_DOMAINS)


def _display_name(name: str) -> str:
    """A shop's name as the sender's display name: no quotes, brackets or control characters
    that could end the header early or start a second one."""
    clean = "".join(c for c in name if c.isprintable() and c not in '"<>\\,;@')
    return " ".join(clean.split())[:60]


async def send(
    to: str, subject: str, text: str, html: str, *,
    attachments: list[tuple[str, bytes]] | None = None, reply_to: str | None = None,
    from_name: str | None = None,
) -> None:
    """Send one email. `attachments` are (file name, bytes) pairs, sent base64-encoded as
    Resend's API takes them. `from_name` puts a shop's name in front of ALYR's address (the
    address is always ALYR's); `reply_to` sends answers to the shop."""
    settings = get_settings()
    sender = settings.email_from
    name = _display_name(from_name) if from_name else ""
    if name:
        address = sender.rpartition("<")[2].rstrip(">") if "<" in sender else sender
        sender = f"{name} via ALYR <{address}>"
    body: dict = {
        "from": sender, "to": [to], "subject": subject, "text": text, "html": html,
        "reply_to": reply_to or settings.email_reply_to,
    }
    if attachments:
        body["attachments"] = [
            {"filename": file_name, "content": base64.b64encode(data).decode("ascii")}
            for file_name, data in attachments
        ]
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, transport=transport) as http:
            answer = await http.post(
                API, json=body, headers={"Authorization": f"Bearer {settings.email_api_key}"}
            )
    except httpx.HTTPError as error:
        raise MailError(type(error).__name__) from error
    if answer.status_code >= 300:
        # Status only: the body can echo the recipient's address.
        log.error("email provider refused a message: HTTP %s", answer.status_code)
        raise MailError(f"HTTP {answer.status_code}")


def sign_in_message(code: str, minutes: int) -> tuple[str, str, str]:
    """Subject, plain text and HTML for a sign-in code, in English and Arabic together:
    the code is requested before we know which language the person reads."""
    subject = f"{code} is your ALYR sign-in code"
    text = (
        f"Your ALYR sign-in code is {code}\n"
        f"It works once and expires in {minutes} minutes.\n"
        "If you did not ask for it, you can ignore this email.\n\n"
        f"رمز الدخول إلى ALYR هو {code}\n"
        f"يعمل مرة واحدة وتنتهي صلاحيته خلال {minutes} دقائق.\n"
        "إذا لم تطلبه، تجاهل هذه الرسالة."
    )
    c = escape(code)
    e, f, fm = brand.EMAIL, brand.CSS_FONT["email"], brand.CSS_FONT["email-mono"]
    html = f"""<!doctype html><html><body style="margin:0;background:{e["bg"]};font-family:{f};color:{e["text"]}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:440px;background:{e["panel"]};border-radius:16px;padding:28px">
<tr><td style="font-weight:700;font-size:15px;letter-spacing:.06em">ALYR</td></tr>
<tr><td style="padding-top:18px;font-size:15px">Your sign-in code</td></tr>
<tr><td style="padding:10px 0 6px;font-size:36px;font-weight:700;letter-spacing:.18em;font-family:{fm}">{c}</td></tr>
<tr><td style="font-size:13px;color:{e["muted"]}">It works once and expires in {minutes} minutes. If you did not ask for it, ignore this email.</td></tr>
<tr><td dir="rtl" style="padding-top:20px;border-top:1px solid {e["rule"]};margin-top:20px;font-size:13px;color:{e["muted"]};text-align:right">
رمز الدخول إلى ALYR هو <b style="color:{e["text"]}">{c}</b>. يعمل مرة واحدة وتنتهي صلاحيته خلال {minutes} دقائق.</td></tr>
</table></td></tr></table></body></html>"""
    return subject, text, html
