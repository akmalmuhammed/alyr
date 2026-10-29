"""Email ALYR sends itself: sign-in codes, for now (D-029).

One provider, Resend, called over its REST API. Nothing else in the app sends email.

Sign-in codes are sent while the request waits, not through the job queue: a code is
stored only as a hash, and a job would have to keep it in plain text in its payload. A
code is also useless after ten minutes, so there is nothing to retry later. The call has
a short timeout and the person can ask for a new code.
"""

import base64
import logging
from datetime import date
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


_RESUME = {
    "en": {
        "subject": lambda step: f"Your ALYR setup is waiting: next, {step}",
        "hello": lambda name: f"Hello {name}," if name else "Hello,",
        "body": lambda shop, step: (
            f"You started setting up {shop} on ALYR and stopped partway. "
            f"Your next step is to {step}."
        ),
        "button": "Continue your setup",
        "reply": "Reply to this email if you want a person to help.",
        "stop": "Stop these reminder emails",
    },
    "ar": {
        "subject": lambda step: f"إعداد ALYR بانتظارك: الخطوة التالية، {step}",
        "hello": lambda name: f"مرحباً {name}،" if name else "مرحباً،",
        "body": lambda shop, step: (
            f"بدأت إعداد {shop} على ALYR وتوقفت في منتصف الطريق. "
            f"خطوتك التالية هي أن {step}."
        ),
        "button": "أكمل إعدادك",
        "reply": "ردّ على هذه الرسالة إن أردت أن يساعدك شخص.",
        "stop": "أوقف رسائل التذكير هذه",
    },
}


def resume_message(
    lang: str, owner: str, shop: str, step: str, link: str, stop_link: str,
) -> tuple[str, str, str]:
    """Subject, plain text and HTML of the reminder to finish setting up (ALY-171), in the
    language the owner reads. `step` is a phrase that completes "your next step is to ..."."""
    w = _RESUME["ar" if lang == "ar" else "en"]
    rtl = lang == "ar"
    first = owner.split()[0] if owner.strip() else ""
    subject = w["subject"](step)
    text = (
        f"{w['hello'](first)}\n\n{w['body'](shop, step)}\n\n{w['button']}: {link}\n\n"
        f"{w['reply']}\n\n{w['stop']}: {stop_link}"
    )
    e, f = brand.EMAIL, brand.CSS_FONT["email"]
    direction = ' dir="rtl"' if rtl else ""
    align = "right" if rtl else "left"
    html = f"""<!doctype html><html><body style="margin:0;background:{e["bg"]};font-family:{f};color:{e["text"]}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%"{direction} style="max-width:480px;background:{e["panel"]};border-radius:16px;padding:28px;text-align:{align}">
<tr><td style="font-weight:700;font-size:15px;letter-spacing:.06em">ALYR</td></tr>
<tr><td style="padding-top:18px;font-size:15px">{escape(w["hello"](first))}</td></tr>
<tr><td style="padding-top:10px;font-size:15px;line-height:1.55">{escape(w["body"](shop, step))}</td></tr>
<tr><td style="padding:20px 0 6px"><a href="{escape(link)}" style="display:inline-block;background:{e["text"]};color:{e["panel"]};text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;min-height:20px">{escape(w["button"])}</a></td></tr>
<tr><td style="padding-top:14px;font-size:13px;color:{e["muted"]}">{escape(w["reply"])}</td></tr>
<tr><td style="padding-top:18px;border-top:1px solid {e["rule"]};font-size:12px;color:{e["muted"]}"><a href="{escape(stop_link)}" style="color:{e["muted"]}">{escape(w["stop"])}</a></td></tr>
</table></td></tr></table></body></html>"""
    return subject, text, html


_MONTHS = {
    "en": ("January", "February", "March", "April", "May", "June", "July", "August",
           "September", "October", "November", "December"),
    "ar": ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر",
           "أكتوبر", "نوفمبر", "ديسمبر"),
}


def _day(value: str | None, lang: str) -> str:
    """"12 November 2026" from "2026-11-12", in the owner's language."""
    if not value:
        return ""
    d = date.fromisoformat(value)
    return f"{d.day} {_MONTHS[lang][d.month - 1]} {d.year}"


# What ALYR writes to a client about their plan (ALY-218, D-080), by kind. `c` is the client's
# name, `p` the plan's state as `subscription.view` gives it, with its dates already written out.
_BILLING = {
    "en": {
        "due": (
            lambda c, p: "Your ALYR payment is due",
            lambda c, p: (
                f"The next period of {c}'s ALYR plan was due on {p['paid_through']}. "
                "Everything keeps working. "
                + (f"To keep it that way, pay {p['owed_text']} by {p['pause_on']}."
                   if p["pause_on"] else f"Please pay {p['owed_text']}.")
            ),
        ),
        "pause_soon": (
            lambda c, p: f"ALYR pauses your WhatsApp replies on {p['pause_on']}",
            lambda c, p: (
                f"{p['owed_text']} for {c} is still unpaid. On {p['pause_on']}, ALYR pauses "
                "its automatic WhatsApp replies and messages to your customers until it is "
                "paid. Your workspace and your data stay as they are."
            ),
        ),
        "paused": (
            lambda c, p: "Your automatic WhatsApp replies are paused",
            lambda c, p: (
                f"{p['owed_text']} for {c} has been due since {p['paid_through']}, so ALYR has "
                "paused its automatic WhatsApp replies and messages to your customers. Your "
                "workspace and your data are all there, and replies you type in the inbox "
                "still go. As soon as your payment is recorded, everything starts again."
            ),
        ),
        "cancel_scheduled": (
            lambda c, p: f"Your ALYR plan ends on {p['cancels_on']}",
            lambda c, p: (
                f"As you asked, {c}'s ALYR plan ends on {p['cancels_on']}. Until then "
                "everything works. From that day ALYR sends nothing more for you on WhatsApp "
                "and charges you nothing more. Your data stays. If you change your mind, "
                "reply to this email."
            ),
        ),
        "hello": lambda name: f"Hello {name}," if name else "Hello,",
        "button": "Open your workspace",
        "reply": "Reply to this email if you have a question.",
    },
    "ar": {
        "due": (
            lambda c, p: "حان موعد دفعتك لـ ALYR",
            lambda c, p: (
                f"استحقت الفترة التالية من خطة {c} في ALYR يوم {p['paid_through']}. "
                "كل شيء يعمل كالمعتاد. "
                + (f"ليبقى كذلك، ادفع {p['owed_text']} قبل {p['pause_on']}."
                   if p["pause_on"] else f"يُرجى دفع {p['owed_text']}.")
            ),
        ),
        "pause_soon": (
            lambda c, p: f"توقف ALYR ردودك على واتساب يوم {p['pause_on']}",
            lambda c, p: (
                f"لم يُدفع بعد مبلغ {p['owed_text']} عن {c}. يوم {p['pause_on']} توقف ALYR "
                "ردودها التلقائية ورسائلها لعملائك على واتساب حتى يُدفع. تبقى مساحة عملك "
                "وبياناتك كما هي."
            ),
        ),
        "paused": (
            lambda c, p: "ردودك التلقائية على واتساب متوقفة",
            lambda c, p: (
                f"مبلغ {p['owed_text']} عن {c} مستحق منذ {p['paid_through']}، لذلك أوقفت ALYR "
                "ردودها التلقائية ورسائلها لعملائك على واتساب. مساحة عملك وبياناتك كلها "
                "موجودة، والردود التي تكتبها في صندوق الرسائل تُرسل. حالما تُسجَّل دفعتك يعود "
                "كل شيء للعمل."
            ),
        ),
        "cancel_scheduled": (
            lambda c, p: f"تنتهي خطتك في ALYR يوم {p['cancels_on']}",
            lambda c, p: (
                f"كما طلبت، تنتهي خطة {c} في ALYR يوم {p['cancels_on']}. حتى ذلك اليوم يعمل كل "
                "شيء. ومنه لا ترسل ALYR شيئاً باسمك على واتساب ولا تحاسبك على شيء. تبقى "
                "بياناتك. إن غيّرت رأيك، ردّ على هذه الرسالة."
            ),
        ),
        "hello": lambda name: f"مرحباً {name}،" if name else "مرحباً،",
        "button": "افتح مساحة عملك",
        "reply": "ردّ على هذه الرسالة إن كان لديك سؤال.",
    },
}


def billing_message(
    lang: str, kind: str, owner: str, client: str, plan: dict, link: str,
) -> tuple[str, str, str]:
    """Subject, plain text and HTML of an email about the client's plan (ALY-218): its payment
    is due, sending pauses soon, sending is paused, or the plan ends on a day. `plan` is
    `subscription.view`."""
    lang = "ar" if lang == "ar" else "en"
    w = _BILLING[lang]
    p = plan | {k: _day(plan.get(k), lang) for k in ("paid_through", "pause_on", "cancels_on")}
    first = owner.split()[0] if owner.strip() else ""
    subject, body = w[kind][0](client, p), w[kind][1](client, p)
    text = f"{w['hello'](first)}\n\n{body}\n\n{w['button']}: {link}\n\n{w['reply']}"
    e, f = brand.EMAIL, brand.CSS_FONT["email"]
    direction = ' dir="rtl"' if lang == "ar" else ""
    align = "right" if lang == "ar" else "left"
    html = f"""<!doctype html><html><body style="margin:0;background:{e["bg"]};font-family:{f};color:{e["text"]}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%"{direction} style="max-width:480px;background:{e["panel"]};border-radius:16px;padding:28px;text-align:{align}">
<tr><td style="font-weight:700;font-size:15px;letter-spacing:.06em">ALYR</td></tr>
<tr><td style="padding-top:18px;font-size:15px">{escape(w["hello"](first))}</td></tr>
<tr><td style="padding-top:10px;font-size:15px;line-height:1.55">{escape(body)}</td></tr>
<tr><td style="padding:20px 0 6px"><a href="{escape(link)}" style="display:inline-block;background:{e["text"]};color:{e["panel"]};text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;min-height:20px">{escape(w["button"])}</a></td></tr>
<tr><td style="padding-top:14px;font-size:13px;color:{e["muted"]}">{escape(w["reply"])}</td></tr>
</table></td></tr></table></body></html>"""
    return subject, text, html


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
