"""What a customer reads when a document reaches them: the WhatsApp caption, the email's
subject, text and HTML, and the names of the files (ALY-139).

Every sentence is written whole in each language (never a fragment joined to another), in the
customer's own language: a contact's `lang`, or the document's lead language when staff typed
a number or an address. The Arabic is formal Modern Standard Arabic and a draft until the
native review (ALY-66). Amounts come from `money.written` («127.00 ر.ق», "QAR 127.00"); a
number, an amount or a link stays a run of its own inside an Arabic sentence.

The rules these follow are the WhatsApp and email design skills': lead with the fact in the
shop's name, short, a link on its own with a space before the full stop, nothing promotional
(a document is utility), an Arabic WhatsApp line opens with U+200F, an email has a plain-text
twin and no tracking.
"""

from html import escape

from alyr import brand
from alyr.modules.documents import words

RLM = "‏"  # right-to-left mark: an Arabic WhatsApp line opens with it


def title(kind: str, lang: str) -> str:
    return words.KIND_TITLES[kind].get(lang)


def file_name(number: str) -> str:
    """The name the customer's phone or mail shows: the document's number, which is made of
    letters, digits and dashes, so it is safe in any file system."""
    safe = "".join(c for c in number if c.isalnum() or c in "-_") or "document"
    return f"{safe}.pdf"


# ── WhatsApp ─────────────────────────────────────────────────────────────────────────────


def caption(kind: str, number: str, shop: str, amount: str, url: str, lang: str) -> str:
    """The text under the PDF inside the 24-hour window. Short; the link is on its own line,
    followed by a space so the phone does not take the full stop into it."""
    if lang == "ar":
        head = f"{RLM}{title(kind, 'ar')} رقم {number} من {shop} بمبلغ {amount}."
        if kind == "credit_note":
            head += " يلغي هذا الإشعار مستنداً أصدرناه سابقاً."
        else:
            head += " شكراً لك."
        return f"{head}\n{RLM}يمكنك أيضاً فتحه عبر الإنترنت:\n{url} ."
    head = f"{title(kind, 'en')} {number} from {shop}: {amount}."
    head += " It cancels a document we issued before." if kind == "credit_note" else " Thank you."
    return f"{head}\nYou can also open it online:\n{url} ."


# Which approved template carries a kind outside the 24-hour window. A kind with none (a quote,
# a delivery note, a statement, a proforma: later packages) is sent inside the window only.
TEMPLATE_FOR = {
    "receipt": "document_receipt",
    "deposit_receipt": "document_receipt",
    "invoice": "document_invoice",
    "credit_note": "document_credit_note",
}


# ── Email ────────────────────────────────────────────────────────────────────────────────


def email_subject(kind: str, number: str, shop: str, lang: str) -> str:
    if lang == "ar":
        return f"{title(kind, 'ar')} رقم {number} من {shop}"
    return f"{title(kind, 'en')} {number} from {shop}"


def email_text(kind: str, number: str, shop: str, amount: str, url: str, lang: str) -> str:
    """The plain-text twin: everything the HTML says, in the same order, link written out."""
    if lang == "ar":
        lines = [
            shop, "",
            f"{title(kind, 'ar')} رقم {number}",
            f"المبلغ: {amount}", "",
            "المستند مرفق بصيغة PDF. ويمكنك أيضاً فتحه عبر الإنترنت:",
            url, "",
            "إذا لم يكن هذا البريد موجهاً إليك، فتجاهله.",
            f"أُرسل نيابةً عن {shop} عبر ALYR.",
        ]
    else:
        lines = [
            shop, "",
            f"{title(kind, 'en')} {number}",
            f"Amount: {amount}", "",
            "The document is attached as a PDF. You can also open it online:",
            url, "",
            "If this email is not meant for you, you can ignore it.",
            f"Sent for {shop} with ALYR.",
        ]
    return "\n".join(lines)


def email_html(kind: str, number: str, shop: str, amount: str, url: str, lang: str) -> str:
    """One column, simple tables and inline styles (a mail client strips the rest), the
    shop's name on top, the document's number and amount, one link. No images and no tracking.
    Light colours only: the brand has no dark email tokens yet."""
    e, font = brand.EMAIL, brand.CSS_FONT["email"]
    arabic = lang == "ar"
    direction = 'dir="rtl"' if arabic else 'dir="ltr"'
    align = "right" if arabic else "left"
    s, n, a, u = escape(shop), escape(number), escape(amount), escape(url)
    what = title(kind, lang)
    if arabic:
        headline = f"{what} رقم <bdi>{n}</bdi>"
        amount_label, attached = "المبلغ", "المستند مرفق بصيغة PDF. ويمكنك أيضاً فتحه عبر الإنترنت:"
        ignore = "إذا لم يكن هذا البريد موجهاً إليك، فتجاهله."
        foot = f"أُرسل نيابةً عن {s} عبر <bdi>ALYR</bdi>."
    else:
        headline = f"{what} <bdi>{n}</bdi>"
        amount_label, attached = "Amount", "The document is attached as a PDF. You can also open it online:"
        ignore = "If this email is not meant for you, you can ignore it."
        foot = f"Sent for {s} with <bdi>ALYR</bdi>."
    return f"""<!doctype html>
<html lang="{lang}" {direction}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>{escape(what)} {n}</title></head>
<body style="margin:0;background:{e["bg"]};font-family:{font};color:{e["text"]}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:{e["panel"]};border:1px solid {e["rule"]};border-radius:2px">
<tr><td style="padding:24px 24px 12px;text-align:{align};font-size:18px;font-weight:700;line-height:1.5">{s}</td></tr>
<tr><td style="padding:0 24px;text-align:{align}"><div style="border-top:1px solid {e["rule"]}"></div></td></tr>
<tr><td style="padding:16px 24px 4px;text-align:{align};font-size:15px;line-height:1.5;color:{e["muted"]}">{headline}</td></tr>
<tr><td style="padding:0 24px 16px;text-align:{align};font-size:28px;font-weight:700;line-height:1.3"><span style="font-size:13px;font-weight:400;color:{e["muted"]};display:block">{amount_label}</span><bdi>{a}</bdi></td></tr>
<tr><td style="padding:0 24px 8px;text-align:{align};font-size:15px;line-height:1.5">{attached}</td></tr>
<tr><td style="padding:0 24px 20px;text-align:{align};font-size:15px;line-height:1.5;word-break:break-all"><a href="{u}" style="color:{e["text"]};text-decoration:underline">{u}</a></td></tr>
<tr><td style="padding:12px 24px 24px;text-align:{align};font-size:13px;line-height:1.5;color:{e["muted"]};border-top:1px solid {e["rule"]}">{ignore}<br>{foot}</td></tr>
</table></td></tr></table></body></html>"""
