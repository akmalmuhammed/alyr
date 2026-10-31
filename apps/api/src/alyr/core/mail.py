"""Email ALYR sends itself (D-029): sign-in codes, the reminder to finish setting up, and the
welcome and invite emails that tell a person their account exists (specs/037). The weekly report
and a shop's documents use `send` too.

One provider, Resend, called over its REST API. Nothing else in the app sends email.

Sign-in codes are sent while the request waits, not through the job queue: a code is
stored only as a hash, and a job would have to keep it in plain text in its payload. A
code is also useless after ten minutes, so there is nothing to retry later. The call has
a short timeout and the person can ask for a new code.
"""

import base64
import logging
from datetime import date, datetime
from html import escape
from zoneinfo import ZoneInfo

import httpx

from alyr import brand
from alyr.config import get_settings
from alyr.core.normalise import fmt_qar, fmt_qar_ar
from alyr.core.words import WRONG_CODES, counted

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


# What ALYR writes to a client about their plan (ALY-218, D-082), by kind. `c` is the client's
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


# The email that tells an owner their price is ready (ALY-274, CJ-14). Sent once, when ALYR
# publishes the first quote for their client; the price itself is read in the workspace.
_PRICE = {
    "en": {
        "subject": lambda amount: f"Your ALYR price is ready: {amount} a month",
        "hello": lambda name: f"Hello {name}," if name else "Hello,",
        "body": lambda client, amount: (
            f"ALYR has prepared the price for {client}: {amount} a month. "
            "Read it in your workspace and accept it to carry on towards going live."
        ),
        "note": "Accepting the price does not charge you anything.",
        "button": "See your price",
        "reply": "Reply to this email if you have a question about it.",
    },
    "ar": {
        "subject": lambda amount: f"سعرك من ALYR جاهز: {amount} شهرياً",
        "hello": lambda name: f"مرحباً {name}،" if name else "مرحباً،",
        "body": lambda client, amount: (
            f"جهّزت ALYR السعر لـ {client}: {amount} شهرياً. "
            "اطّلع عليه في مساحة عملك واقبله لتتابع نحو الإطلاق."
        ),
        "note": "قبول السعر لا يحمّلك أي مبلغ.",
        "button": "اطّلع على سعرك",
        "reply": "ردّ على هذه الرسالة إن كان لديك سؤال عنه.",
    },
}


def price_ready_message(
    lang: str, owner: str, client: str, monthly: int, link: str,
) -> tuple[str, str, str]:
    """Subject, plain text and HTML of "your price is ready", in the language the owner reads.
    `monthly` is the quote's monthly total in dirhams."""
    lang = "ar" if lang == "ar" else "en"
    w = _PRICE[lang]
    amount = fmt_qar_ar(monthly) if lang == "ar" else fmt_qar(monthly)
    first = _first(owner)
    subject, body = w["subject"](amount), w["body"](client, amount)
    part = {"lang": lang, "lines": [w["hello"](first), body, w["note"]],
            "button": (w["button"], link), "small": w["reply"]}
    return subject, _plain([part]), _letter([part])


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


# The welcome after sign-up and the invite to a team (specs/037). Neither holds a code or a link
# that signs anyone in: the person signs in at /login, with a code, as always.
_ACCOUNT = {
    "en": {
        "welcome_subject": lambda first: f"Welcome to ALYR, {first}" if first else "Welcome to ALYR",
        "hello": lambda first: f"Hello {first}," if first else "Hello,",
        "welcome": lambda shop: (
            f"You created the workspace for {shop}. Keep this email: it says how to get back in."
        ),
        "sign_in": lambda link, email: (
            f"To sign in, open {link} and give this address: {email}. ALYR emails you a 6-digit "
            "code each time. There is no password to remember."
        ),
        "continue": "Continue your setup",
        "reply": "Reply to this email if you want a person to help.",
        "invite_subject": lambda by, shop: (
            f"{by} added you to {shop} on ALYR" if by else f"Your ALYR workspace for {shop} is ready"
        ),
        "invite": lambda by, shop, role: (
            f"{by} added you to the team of {shop} on ALYR, as {role}." if by
            else f"ALYR has set up the workspace for {shop}, with you as its owner."
        ),
        "roles": {"owner": "an owner", "admin": "an admin", "agent": "a team member"},
        "elsewhere": (
            "This address is also on another business's team on ALYR, so signing in opens that "
            "one. To open this one, go to Your account and choose Open next to it."
        ),
        "sign_in_button": "Sign in",
        "unexpected": "If you did not expect this email, you can ignore it.",
    },
    "ar": {
        "welcome_subject": lambda first: (
            f"مرحباً بك في ALYR يا {first}" if first else "مرحباً بك في ALYR"
        ),
        "hello": lambda first: f"مرحباً {first}،" if first else "مرحباً،",
        "welcome": lambda shop: (
            f"أنشأت مساحة العمل لـ {shop}. احتفظ بهذه الرسالة: فيها طريقة العودة إليها."
        ),
        "sign_in": lambda link, email: (
            f"لتسجيل الدخول، افتح {link} واكتب هذا البريد: {email}. ترسل لك ALYR رمزاً من "
            "6 أرقام في كل مرة، ولا توجد كلمة مرور لتتذكرها."
        ),
        "continue": "أكمل إعدادك",
        "reply": "ردّ على هذه الرسالة إن أردت أن يساعدك شخص.",
        "invite_subject": lambda by, shop: (
            f"أضافك {by} إلى {shop} على ALYR" if by else f"مساحة عملك على ALYR لـ {shop} جاهزة"
        ),
        "invite": lambda by, shop, role: (
            f"أضافك {by} إلى فريق {shop} على ALYR، بدور {role}." if by
            else f"جهّزت ALYR مساحة العمل لـ {shop}، وأنت مالكها."
        ),
        "roles": {"owner": "مالك", "admin": "مدير", "agent": "موظف"},
        "elsewhere": (
            "هذا البريد مسجّل أيضاً في فريق نشاط تجاري آخر على ALYR، لذلك يفتح تسجيل الدخول "
            "ذلك النشاط. لفتح هذا النشاط، اذهب إلى «حسابك» واختر «افتح» بجانبه."
        ),
        "sign_in_button": "سجّل الدخول",
        "unexpected": "إذا لم تكن تتوقع هذه الرسالة، يمكنك تجاهلها.",
    },
}


def _first(name: str) -> str:
    return name.split()[0] if name.strip() else ""


def _letter(parts: list[dict]) -> str:
    """One email's HTML: ALYR's mark, then each language's part, the second under a rule. A part
    has its paragraphs, a button (label, link) and a quieter last line."""
    e, f = brand.EMAIL, brand.CSS_FONT["email"]
    rows = ['<tr><td style="font-weight:700;font-size:15px;letter-spacing:.06em">ALYR</td></tr>']
    for n, part in enumerate(parts):
        rtl = part["lang"] == "ar"
        cell = ' dir="rtl" style="text-align:right;' if rtl else ' style="text-align:left;'
        # The second language under a rule, with room on both sides of it.
        rule = f"border-top:1px solid {e['rule']};padding-top:22px;" if n else ""
        rule += "padding-bottom:22px;" if n < len(parts) - 1 else ""
        inner = "".join(
            f'<p style="margin:0 0 10px;font-size:15px;line-height:1.55">{escape(line)}</p>'
            for line in part["lines"]
        )
        if part["button"] is not None:
            label, link = part["button"]
            inner += (
                f'<p style="margin:18px 0 6px"><a href="{escape(link)}" style="display:inline-block;'
                f'background:{e["text"]};color:{e["panel"]};text-decoration:none;font-weight:600;'
                f'font-size:15px;padding:13px 22px;min-height:20px">{escape(label)}</a></p>'
            )
        inner += (
            f'<p style="margin:14px 0 0;font-size:13px;color:{e["muted"]}">{escape(part["small"])}</p>'
        )
        rows.append(f'<tr><td{cell}padding-top:18px;{rule}">{inner}</td></tr>')
    body = "\n".join(rows)
    return f"""<!doctype html><html><body style="margin:0;background:{e["bg"]};font-family:{f};color:{e["text"]}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:{e["panel"]};border-radius:16px;padding:28px">
{body}
</table></td></tr></table></body></html>"""


def _plain(parts: list[dict]) -> str:
    return "\n\n---\n\n".join(
        "\n\n".join([
            *part["lines"],
            *([f"{part['button'][0]}: {part['button'][1]}"] if part["button"] else []),
            part["small"],
        ])
        for part in parts
    )


def welcome_message(
    lang: str, owner: str, shop: str, email: str, sign_in_link: str, setup_link: str,
) -> tuple[str, str, str]:
    """Subject, plain text and HTML of the welcome after sign-up, in the language the owner
    signed up in. `shop` is the business's name in that language."""
    lang = "ar" if lang == "ar" else "en"
    w, first = _ACCOUNT[lang], _first(owner)
    part = {
        "lang": lang,
        "lines": [w["hello"](first), w["welcome"](shop), w["sign_in"](sign_in_link, email)],
        "button": (w["continue"], setup_link),
        "small": w["reply"],
    }
    return w["welcome_subject"](first), _plain([part]), _letter([part])


def invite_message(
    lang: str, person: str, shops: dict[str, str], email: str, role: str, by: str | None,
    sign_in_link: str, elsewhere: bool = False,
) -> tuple[str, str, str]:
    """Subject, plain text and HTML of the email to someone added to a business's team: `by`
    is who added them, or None when ALYR made the business for its owner in the back office.
    We do not know which language the person reads, so it is in both, the shop's own language
    first (`lang`); `shops` is the business's name by language. `elsewhere` says the address is
    already on another business's team, whose workspace signing in opens, and how to switch."""
    first = _first(person)
    order = ["ar", "en"] if lang == "ar" else ["en", "ar"]
    parts = []
    for code in order:
        w = _ACCOUNT[code]
        lines = [
            w["hello"](first),
            w["invite"](by, shops[code], w["roles"].get(role, w["roles"]["agent"])),
            w["sign_in"](sign_in_link, email),
        ]
        if elsewhere:
            lines.append(w["elsewhere"])
        parts.append({"lang": code, "lines": lines, "button": (w["sign_in_button"], sign_in_link),
                      "small": w["unexpected"]})
    subject = _ACCOUNT[order[0]]["invite_subject"](by, shops[order[0]])
    return subject, _plain(parts), _letter(parts)


# What ALYR tells a member of its own staff about their back-office account (ALY-125, D-135).
# Neither email holds a code or a link that signs anyone in. We do not know which language the
# person reads, so each is in both, English first. A Latin run inside an Arabic sentence (an
# address, a browser) sits between Unicode isolates, which is what <bdi> does in HTML.
_STAFF = {
    "en": {
        "hello": lambda first: f"Hello {first}," if first else "Hello,",
        "new_subject": "New sign-in to the ALYR back office",
        "new_what": {
            "device and address": "a device and an address ALYR has not seen before",
            "device": "a device ALYR has not seen before",
            "address": "an address ALYR has not seen before",
        },
        "new_body": lambda what: f"Your ALYR account just signed in to the back office from {what}.",
        "details": lambda when, device, address: (
            f"When: {when} (Doha). Device: {device}. Address: {address}."
        ),
        "new_yes": "If this was you, you do not need to do anything.",
        "new_no": (
            "If it was not you, someone can read your email inbox, because a sign-in code was "
            "needed. Secure the inbox first: change its password and check its two-step "
            "verification. Then write to hello@alyr.qa."
        ),
        "lock_subject": "Sign-in to your ALYR account is paused",
        "lock_body": lambda wrong, email, until: (
            f"{wrong} were entered for {email} in the last 24 hours, so ALYR has paused sign-in "
            f"for this account until {until} (Doha)."
        ),
        "lock_safe": (
            "No one has signed in. If you made these mistakes yourself, wait until then and "
            "ask for a new code."
        ),
        "lock_no": (
            "If you did not, someone is guessing codes for your account. Your email inbox is "
            "the key to it, so check that it is safe. Then write to hello@alyr.qa."
        ),
        "factor": {
            "enrolled": (
                "An authenticator app was set up on your ALYR account",
                "An authenticator app was set up for your ALYR back-office account.",
            ),
            "replaced": (
                "The authenticator app on your ALYR account was replaced",
                "The authenticator app for your ALYR back-office account was replaced.",
            ),
            "removed": (
                "The authenticator app on your ALYR account was turned off",
                "The authenticator app for your ALYR back-office account was turned off.",
            ),
            "recovery_used": (
                "A recovery code was used on your ALYR account",
                "A recovery code was used to sign in to your ALYR back-office account. "
                "That code cannot be used again.",
            ),
            "recovery_new": (
                "New recovery codes were made for your ALYR account",
                "New recovery codes were made for your ALYR back-office account. "
                "The old ones no longer work.",
            ),
        },
        "when": lambda when: f"When: {when} (Doha).",
        "factor_no": (
            "If it was not you, write to hello@alyr.qa at once. Then secure your email inbox "
            "and your phone."
        ),
        "small": "ALYR sends this to the member of staff whose account it is.",
    },
    "ar": {
        "hello": lambda first: f"مرحباً {first}،" if first else "مرحباً،",
        "new_subject": "تسجيل دخول جديد إلى لوحة إدارة ALYR",
        "new_what": {
            "device and address": "جهاز وعنوان لم ترهما ALYR من قبل",
            "device": "جهاز لم تره ALYR من قبل",
            "address": "عنوان لم تره ALYR من قبل",
        },
        "new_body": lambda what: f"سُجّل الدخول إلى لوحة الإدارة بحسابك في ALYR من {what}.",
        "details": lambda when, device, address: (
            f"الوقت: {when} (بتوقيت الدوحة). الجهاز: {device}. العنوان: {address}."
        ),
        "new_yes": "إذا كنت أنت، فلا تحتاج إلى فعل شيء.",
        "new_no": (
            "إذا لم تكن أنت، فهناك من يستطيع قراءة بريدك الإلكتروني، لأن الدخول يحتاج إلى رمز "
            "يصل إليه. أمّن البريد أولاً: غيّر كلمة مروره وراجع التحقق بخطوتين فيه. ثم اكتب إلى "
            "hello@alyr.qa."
        ),
        "lock_subject": "تسجيل الدخول إلى حسابك في ALYR متوقف مؤقتاً",
        "lock_body": lambda wrong, email, until: (
            f"أُدخل {wrong} للبريد {email} خلال آخر 24 ساعة، لذلك أوقفت ALYR تسجيل الدخول إلى "
            f"هذا الحساب حتى {until} (بتوقيت الدوحة)."
        ),
        "lock_safe": (
            "لم يدخل أحد. إذا كنت أنت من أخطأ، فانتظر حتى ذلك الوقت ثم اطلب رمزاً جديداً."
        ),
        "lock_no": (
            "إذا لم تكن أنت، فهناك من يخمّن رموز حسابك. بريدك الإلكتروني هو مفتاحه، فتأكد أنه "
            "آمن. ثم اكتب إلى hello@alyr.qa."
        ),
        "factor": {
            "enrolled": (
                "تم إعداد تطبيق المصادقة لحسابك في ALYR",
                "تم إعداد تطبيق المصادقة لحسابك في لوحة إدارة ALYR.",
            ),
            "replaced": (
                "تم استبدال تطبيق المصادقة في حسابك في ALYR",
                "تم استبدال تطبيق المصادقة في حسابك في لوحة إدارة ALYR.",
            ),
            "removed": (
                "تم إيقاف تطبيق المصادقة في حسابك في ALYR",
                "تم إيقاف تطبيق المصادقة في حسابك في لوحة إدارة ALYR.",
            ),
            "recovery_used": (
                "استُخدم رمز استرداد في حسابك في ALYR",
                "استُخدم رمز استرداد لتسجيل الدخول إلى حسابك في لوحة إدارة ALYR. "
                "لا يمكن استخدام هذا الرمز مرة أخرى.",
            ),
            "recovery_new": (
                "أُنشئت رموز استرداد جديدة لحسابك في ALYR",
                "أُنشئت رموز استرداد جديدة لحسابك في لوحة إدارة ALYR. "
                "الرموز القديمة لم تعد تعمل.",
            ),
        },
        "when": lambda when: f"الوقت: {when} (بتوقيت الدوحة).",
        "factor_no": (
            "إذا لم تكن أنت، فاكتب إلى hello@alyr.qa فوراً. ثم أمّن بريدك الإلكتروني وهاتفك."
        ),
        "small": "ترسل ALYR هذه الرسالة إلى عضو الفريق صاحب الحساب.",
    },
}

_DOHA = ZoneInfo("Asia/Qatar")


def _doha(moment: datetime, lang: str) -> str:
    """"31 October 2026, 14:05" in Doha time, in the reader's language (Western digits)."""
    local = moment.astimezone(_DOHA)
    month = _MONTHS["ar" if lang == "ar" else "en"][local.month - 1]
    comma = "،" if lang == "ar" else ","
    return f"{local.day} {month} {local.year}{comma} {local:%H:%M}"


def _isolate(text: str) -> str:
    """A Latin run kept in its own direction inside an Arabic sentence."""
    return f"⁨{text}⁩"


def _both(key: str) -> str:
    """A subject in both languages, for an email to someone whose language is not known."""
    return f"{_STAFF['en'][key]} · {_STAFF['ar'][key]}"


def _staff_parts(build) -> list[dict]:
    parts = []
    for lang in ("en", "ar"):
        w = _STAFF[lang]
        parts.append({"lang": lang, "lines": build(lang, w), "button": None, "small": w["small"]})
    return parts


def staff_sign_in_message(
    name: str, when: datetime, device: str, address: str, new_device: bool, new_address: bool,
) -> tuple[str, str, str]:
    """Subject, plain text and HTML of "your account signed in from somewhere new", in both
    languages. `device` is a short phrase such as "Chrome on Windows"; `address` is the
    visitor's address, or "unknown"."""
    kind = (
        "device and address" if new_device and new_address
        else "device" if new_device else "address"
    )
    first = _first(name)

    def build(lang: str, w: dict) -> list[str]:
        ar = lang == "ar"
        return [
            w["hello"](first), w["new_body"](w["new_what"][kind]),
            w["details"](
                _doha(when, lang), _isolate(device) if ar else device,
                _isolate(address) if ar else address,
            ),
            w["new_yes"], w["new_no"],
        ]

    parts = _staff_parts(build)
    return _both("new_subject"), _plain(parts), _letter(parts)


def staff_locked_message(
    name: str, email: str, wrong: int, until: datetime
) -> tuple[str, str, str]:
    """Subject, plain text and HTML of "sign-in to your account is paused": a member of ALYR
    staff had too many wrong codes in a day (ALY-125)."""
    first = _first(name)

    def build(lang: str, w: dict) -> list[str]:
        shown = _isolate(email) if lang == "ar" else email
        return [
            w["hello"](first),
            w["lock_body"](counted(wrong, WRONG_CODES, lang), shown, _doha(until, lang)),
            w["lock_safe"], w["lock_no"],
        ]

    parts = _staff_parts(build)
    return _both("lock_subject"), _plain(parts), _letter(parts)


def staff_factor_message(name: str, event: str, when: datetime) -> tuple[str, str, str]:
    """Subject, plain text and HTML of "your authenticator was set up, replaced or turned off",
    or "a recovery code was used", in both languages (ALY-125, D-136). `event` is a key of
    `_STAFF[...]["factor"]`."""
    first = _first(name)

    def build(lang: str, w: dict) -> list[str]:
        return [
            w["hello"](first), w["factor"][event][1], w["when"](_doha(when, lang)),
            w["new_yes"], w["factor_no"],
        ]

    parts = _staff_parts(build)
    subject = f"{_STAFF['en']['factor'][event][0]} · {_STAFF['ar']['factor'][event][0]}"
    return subject, _plain(parts), _letter(parts)
