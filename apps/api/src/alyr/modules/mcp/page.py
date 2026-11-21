"""The page an owner sees when an app asks to connect (spec 067, "Sign-in and consent").

Plain server-rendered HTML, no script, English and Arabic, light and dark, from the generated
tokens (`brand.py`). One Volt button on the page (the main action) and the outlined twin beside it;
hairline rules, no rounded panels; targets of 44 px; a focus ring from the focus token. It says
"app" and "connection", never AI, assistant or smart: the app is named by the name it gives
itself, and the address it will return to is shown beside it.

This is the foundation's page. The workspace's own screen for these connections is ALY-292, and
the Arabic here is a draft until a native reviewer reads it (ALY-66).
"""

from html import escape
from urllib.parse import urlsplit

from alyr import brand
from alyr.modules.mcp import scopes

COPY = {
    "en": {
        "title": "Connect to ALYR",
        "sign_in": "Sign in to ALYR",
        "lead": lambda client: f"{client} wants to connect to your business in ALYR.",
        "email": "Email",
        "send_code": "Send me a code",
        "code_sent": lambda email: f"We sent a 6-digit code to {email}.",
        "code": "Code",
        "continue": "Continue",
        "wrong_code": "That code is wrong or has expired. Check it, or ask for a new one.",
        "which": "Which business?",
        "as_role": lambda role: {"owner": "as an owner", "admin": "as an admin",
                                 "agent": "as a team member"}.get(role, ""),
        "wants": lambda client, shop: f"{client} wants to connect to {shop}.",
        "can": "It will be able to:",
        "returns": lambda host: f"After you choose, you will go back to {host}.",
        "loopback": ("This app runs on the computer you are using. Only continue if you started "
                     "it yourself."),
        "named_by": lambda host: f"The app gives its own name. It is described at {host}.",
        "opt_in": lambda client: (
            f"I understand that what ALYR sends to {client} leaves ALYR and is handled by the "
            "provider I use there, under my own account."
        ),
        "opt_in_need": "Tick the box to continue.",
        "owner_must": ("An owner of this business has to switch this on first. Ask an owner to "
                       "connect, or to switch it on in ALYR."),
        "paused": "This connection is paused for this business.",
        "not_member": "You are not on this business's team.",
        "expired": ("This request has expired or was started in another browser. Start again from "
                    "the app."),
        "allow": "Allow",
        "cancel": "Cancel",
        "no_business": "This email is not on the team of any business in ALYR.",
        "bad_request": "This request cannot continue",
        "local_code": "On this machine the code is",
        "scopes": scopes.WORDS,
        "scope_i": 0,
    },
    "ar": {
        "title": "الربط مع ALYR",
        "sign_in": "سجّل الدخول إلى ALYR",
        "lead": lambda client: f"يريد {client} الاتصال بنشاطك التجاري في ALYR.",
        "email": "البريد الإلكتروني",
        "send_code": "أرسل لي رمزاً",
        "code_sent": lambda email: f"أرسلنا رمزاً من 6 أرقام إلى {email}.",
        "code": "الرمز",
        "continue": "متابعة",
        "wrong_code": "الرمز خاطئ أو انتهت صلاحيته. تحقّق منه أو اطلب رمزاً جديداً.",
        "which": "أي نشاط تجاري؟",
        "as_role": lambda role: {"owner": "بصفتك مالكاً", "admin": "بصفتك مديراً",
                                 "agent": "بصفتك موظفاً"}.get(role, ""),
        "wants": lambda client, shop: f"يريد {client} الاتصال بـ {shop}.",
        "can": "سيتمكن من:",
        "returns": lambda host: f"بعد اختيارك ستعود إلى {host}.",
        "loopback": "يعمل هذا التطبيق على الحاسوب الذي تستخدمه. تابع فقط إن كنت أنت من شغّله.",
        "named_by": lambda host: f"التطبيق هو من يحدد اسمه. وصفه موجود في {host}.",
        "opt_in": lambda client: (
            f"أفهم أن ما ترسله ALYR إلى {client} يخرج من ALYR ويعالجه المزوّد الذي أستخدمه هناك، "
            "بحسابي أنا."
        ),
        "opt_in_need": "ضع علامة في المربع للمتابعة.",
        "owner_must": ("يجب أن يفعّل مالك هذا النشاط الخدمة أولاً. اطلب من مالك أن يربط التطبيق "
                       "أو يفعّلها في ALYR."),
        "paused": "هذا الربط متوقف مؤقتاً لهذا النشاط.",
        "not_member": "لست ضمن فريق هذا النشاط التجاري.",
        "expired": "انتهى هذا الطلب أو بدأ في متصفح آخر. ابدأ من جديد من التطبيق.",
        "allow": "السماح",
        "cancel": "إلغاء",
        "no_business": "هذا البريد غير مسجّل في فريق أي نشاط تجاري في ALYR.",
        "bad_request": "لا يمكن متابعة هذا الطلب",
        "local_code": "على هذا الجهاز الرمز هو",
        "scopes": scopes.WORDS,
        "scope_i": 1,
    },
}


def _css() -> str:
    light, dark = brand.LIGHT, brand.DARK

    def block(t: dict) -> str:
        names = ("canvas", "surface", "surface-subtle", "text", "text-muted", "line",
                 "line-strong", "focus", "on-volt", "volt-ink", "bad", "bad-soft", "warn",
                 "warn-soft")
        return "".join(f"--{n}:{t[n]};" for n in names)

    font = ", ".join(f'"{f}"' if " " in f else f for f in brand.FONT["ui"])
    return (
        f":root{{{block(light)}--volt:{brand.COLOR['brand']['volt']};"
        f"--volt-hover:{brand.COLOR['brand']['volt-hover']}}}"
        f"@media (prefers-color-scheme: dark){{:root{{{block(dark)}}}}}"
        f"*{{box-sizing:border-box}}"
        f"body{{margin:0;background:var(--canvas);color:var(--text);font-family:{font};"
        f"font-size:{brand.SIZE['ui']['body']};line-height:1.5}}"
        "main{max-width:30rem;margin:0 auto;padding:2.5rem 1rem 3rem}"
        ".mark{font-weight:600;letter-spacing:.06em;margin:0 0 2rem}"
        "h1{font-size:" + brand.SIZE["ui"]["heading"] + ";line-height:1.25;margin:0 0 .75rem;"
        "font-weight:600}"
        "p{margin:.5rem 0}"
        ".muted{color:var(--text-muted)}"
        "hr{border:0;border-top:1px solid var(--line);margin:1.5rem 0}"
        "label{display:block;margin:1rem 0 .25rem;font-weight:500}"
        "input[type=email],input[type=text]{width:100%;min-height:44px;padding:.5rem .75rem;"
        "font:inherit;font-size:" + brand.SIZE["ui"]["input"] + ";color:var(--text);"
        "background:var(--surface);border:1px solid var(--line-strong);border-radius:0}"
        "input[type=checkbox]{width:1.25rem;height:1.25rem;margin-inline-end:.75rem;flex:none}"
        ".tick{display:flex;align-items:flex-start;margin:1.25rem 0;font-weight:400}"
        ".row{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1.5rem}"
        "button{min-height:44px;padding:.5rem 1.25rem;font:inherit;font-weight:600;cursor:pointer;"
        "border:1px solid var(--text);background:transparent;color:var(--text);border-radius:0}"
        "button.main{background:var(--volt);border-color:var(--volt);color:var(--on-volt)}"
        "button.main:hover{background:var(--volt-hover)}"
        ":focus-visible{outline:2px solid var(--focus);outline-offset:2px}"
        "ul{margin:.5rem 0;padding-inline-start:1.25rem}"
        "li{margin:.25rem 0}"
        ".note{border-inline-start:3px solid var(--warn);background:var(--warn-soft);"
        "padding:.5rem .75rem;margin:1rem 0}"
        ".err{border-inline-start:3px solid var(--bad);background:var(--bad-soft);"
        "padding:.5rem .75rem;margin:1rem 0}"
        ".shops{display:grid;gap:.5rem;margin-top:1rem}"
        ".shops button{width:100%;text-align:start}"
        "bdi{unicode-bidi:isolate}"
    )


def _shell(lang: str, body: str) -> str:
    c = COPY[lang]
    return (
        f'<!doctype html><html lang="{lang}" dir="{"rtl" if lang == "ar" else "ltr"}"><head>'
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex"><meta name="color-scheme" content="light dark">'
        f"<title>{escape(c['title'])}</title><style>{_css()}</style></head>"
        f'<body><main><p class="mark">ALYR</p>{body}</main></body></html>'
    )


def _hidden(secret: str, **more: str) -> str:
    fields = {"req": secret, **more}
    return "".join(f'<input type="hidden" name="{escape(k)}" value="{escape(v)}">'
                   for k, v in fields.items())


def error_page(lang: str, message: str, status_text: str | None = None) -> str:
    c = COPY[lang]
    return _shell(lang, f"<h1>{escape(status_text or c['bad_request'])}</h1>"
                        f'<div class="err">{escape(message)}</div>')


def email_step(lang: str, secret: str, client: str, error: str | None = None) -> str:
    c = COPY[lang]
    return _shell(lang, (
        f"<h1>{escape(c['sign_in'])}</h1><p>{escape(c['lead'](client))}</p>"
        + (f'<div class="err">{escape(error)}</div>' if error else "")
        + '<form method="post" action="/oauth/authorize/email">'
        + _hidden(secret)
        + f'<label for="email">{escape(c["email"])}</label>'
        '<input id="email" name="email" type="email" autocomplete="email" required maxlength="200">'
        f'<div class="row"><button class="main" type="submit">'
        f'{escape(c["send_code"])}</button></div>'
        "</form>"
    ))


def code_step(lang: str, secret: str, email: str, error: str | None = None,
              dev_code: str | None = None) -> str:
    c = COPY[lang]
    return _shell(lang, (
        f"<h1>{escape(c['sign_in'])}</h1><p>{escape(c['code_sent'](email))}</p>"
        + (f'<div class="err">{escape(error)}</div>' if error else "")
        + (f'<p class="muted" data-dev-code="{escape(dev_code)}">{escape(c["local_code"])} '
           f"<bdi>{escape(dev_code)}</bdi></p>" if dev_code else "")
        + '<form method="post" action="/oauth/authorize/code">'
        + _hidden(secret)
        + f'<label for="code">{escape(c["code"])}</label>'
        '<input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" '
        'required maxlength="12">'
        f'<div class="row"><button class="main" type="submit">'
        f'{escape(c["continue"])}</button></div>'
        "</form>"
    ))


def shop_step(lang: str, secret: str, client: str, shops: list[tuple[str, str, str]]) -> str:
    """`shops`: (id, name, role)."""
    c = COPY[lang]
    buttons = "".join(
        '<form method="post" action="/oauth/authorize/shop">'
        + _hidden(secret, tenant_id=sid)
        + f'<button type="submit"><bdi>{escape(name)}</bdi> '
        f'<span class="muted">{escape(c["as_role"](role))}</span></button></form>'
        for sid, name, role in shops
    )
    return _shell(lang, f"<h1>{escape(c['which'])}</h1><p>{escape(c['lead'](client))}</p>"
                        f'<div class="shops">{buttons}</div>')


def consent_step(
    lang: str, secret: str, *, client: str, client_host: str, shop_name: str, tenant_id: str,
    scope_list: list[str], redirect_uri: str, needs_opt_in: bool, error: str | None = None,
) -> str:
    c = COPY[lang]
    redirect_host = urlsplit(redirect_uri).netloc
    loopback = urlsplit(redirect_uri).hostname in ("127.0.0.1", "localhost", "::1")
    items = "".join(f"<li>{escape(scopes.WORDS[s][c['scope_i']])}</li>" for s in scope_list)
    return _shell(lang, (
        f"<h1><bdi>{escape(c['wants'](client, shop_name))}</bdi></h1>"
        + (f'<div class="err">{escape(error)}</div>' if error else "")
        + f"<p>{escape(c['can'])}</p><ul>{items}</ul>"
        + f'<p class="muted">{escape(c["returns"](redirect_host))}</p>'
        + (f'<p class="muted">{escape(c["named_by"](client_host))}</p>' if client_host else "")
        + (f'<div class="note">{escape(c["loopback"])}</div>' if loopback else "")
        + '<form method="post" action="/oauth/authorize/consent">'
        + _hidden(secret, tenant_id=tenant_id)
        + (
            f'<label class="tick"><input type="checkbox" name="opt_in" value="yes" required>'
            f"<span>{escape(c['opt_in'](client))}</span></label>" if needs_opt_in else ""
        )
        + '<div class="row">'
        f'<button class="main" type="submit" name="decision" value="allow">'
        f'{escape(c["allow"])}</button>'
        f'<button type="submit" name="decision" value="deny" formnovalidate>'
        f'{escape(c["cancel"])}</button>'
        "</div></form>"
    ))


CONSENT_MESSAGES = {
    "opt_in_needed": "opt_in_need", "owner_must_switch_on": "owner_must", "paused": "paused",
    "not_member": "not_member", "not_verified": "expired",
}
