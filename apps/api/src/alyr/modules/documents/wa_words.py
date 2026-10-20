"""Every word the invoice-by-message command says, in English and Arabic, in one place (ALY-141).

The owner or a member of staff writes "invoice Ahmed 500 for AC repair" from their own registered
phone; this is what ALYR answers, in the language they wrote in. It follows `alyr-whatsapp-message`:
lead with the fact, short, buttons that say the action (at most three), money as "QAR 500" and
«500 ر.ق», links on their own line followed by a space, a bold only for the one name or figure
that matters, no "I", and every Arabic line opens with U+200F. The Arabic is a draft until ALY-66.

A sentence is looked up by its code and filled from the details given; a detail that is missing
leaves a gap rather than breaking the message.
"""

import re

RLM = "‏"

# code: (English, Arabic). {who} is a person's name, {amount} is already written with its
# currency in the sentence's language, {what} is what it is for, {number} a document's number.
WORDS: dict[str, tuple[str, str]] = {
    # ── asking what is missing ───────────────────────────────────────────────────────
    "ask_amount": (
        "How much is it? Send it again with the amount, for example:\n"
        "invoice Ahmed 500 for AC repair",
        "كم المبلغ؟ أرسلها مرة أخرى مع المبلغ، مثلاً:\n"
        "فاتورة أحمد 500 صيانة مكيف",
    ),
    "ask_amount_many": (
        "There are two numbers ({numbers}) and ALYR cannot tell which is the amount. Write the "
        "amount with QAR, for example:\ninvoice Ahmed QAR 150 for 2 filters",
        "هناك رقمان ({numbers}) ولا يمكن معرفة أيهما المبلغ. اكتب المبلغ مع كلمة ريال، مثلاً:\n"
        "فاتورة أحمد 150 ريال فلترين",
    ),
    "ask_amount_decimals": (
        "An amount has at most two decimals, for example 12.50. Send it again.",
        "للمبلغ منزلتان عشريتان على الأكثر، مثل 12.50. أرسلها مرة أخرى.",
    ),
    "ask_amount_big": (
        "That amount is too large for one invoice. Check it and send it again.",
        "هذا المبلغ أكبر من أن يُكتب في فاتورة واحدة. راجعه وأرسلها مرة أخرى.",
    ),
    "ask_who": (
        "Who is it for? Send their name, or their phone number to add them.",
        "لمن الفاتورة؟ أرسل اسمه، أو رقم هاتفه لإضافته.",
    ),
    "ask_what": (
        "What is it for? Send the words that go on the invoice, for example: AC repair",
        "عن ماذا الفاتورة؟ أرسل النص الذي يُكتب فيها، مثلاً: صيانة مكيف",
    ),
    "ask_phone": (
        "No customer is called {who} yet. Send their phone number to add them, or reply Skip "
        "to make it without sending it.",
        "لا يوجد عميل باسم {who} بعد. أرسل رقم هاتفه لإضافته، أو أجب بـ «تخطي» لإصدارها دون "
        "إرسالها.",
    ),
    "ask_phone_bad": (
        "That does not look like a phone number. Send it with the country code, for example "
        "974 5551 2345, or reply Skip.",
        "لا يبدو هذا رقم هاتف. أرسله مع رمز الدولة، مثلاً 974 5551 2345، أو أجب بـ «تخطي».",
    ),
    "ask_pick": (
        "Which {who} do you mean?\n{options}\nReply with the number, or send their phone number.",
        "أي {who} تقصد؟\n{options}\nأرسل الرقم، أو أرسل رقم هاتفه.",
    ),
    "ask_pick_invoice": (
        "{who} has more than one unpaid invoice. Which one did they pay?\n{options}\n"
        "Reply with the number.",
        "لدى {who} أكثر من فاتورة غير مدفوعة. أيّها دفع؟\n{options}\nأرسل الرقم.",
    ),
    "pick_none": (
        "Only a receipt, not against an invoice", "إيصال فقط، دون ربطه بفاتورة",
    ),
    "pick_bad": (
        "Reply with one of the numbers in the list.", "أرسل أحد الأرقام في القائمة.",
    ),
    "team_number": (
        "That number belongs to someone on the team, not to a customer.",
        "هذا الرقم لأحد أعضاء الفريق وليس لعميل.",
    ),
    # ── confirming ───────────────────────────────────────────────────────────────────
    "confirm_invoice": (
        "Invoice to *{who}*{extra}: {amount}{what}.\n"
        "Issue it and send it? Reply Yes, or Edit to start again.",
        "فاتورة إلى *{who}*{extra}: {amount}{what}.\n"
        "نصدرها ونرسلها؟ أجب بـ «نعم»، أو «تعديل» لتبدأ من جديد.",
    ),
    "confirm_receipt": (
        "Receipt: *{who}* paid {amount}{how}{what}.{against}\n"
        "Issue the receipt? Reply Yes, or Edit to start again.",
        "إيصال: دفع *{who}* مبلغ {amount}{how}{what}.{against}\n"
        "نصدر الإيصال؟ أجب بـ «نعم»، أو «تعديل» لتبدأ من جديد.",
    ),
    "extra_new": (" (a new customer, {phone})", " (عميل جديد، {phone})"),
    "extra_phone": (" ({phone})", " ({phone})"),
    "extra_unsaved": (" (not saved as a customer)", " (غير محفوظ كعميل)"),
    "what_for": (" for {what}", " عن {what}"),
    "how_cash": (" in cash", " نقداً"),
    "how_card": (" by card", " بالبطاقة"),
    "how_bank_transfer": (" by bank transfer", " بالتحويل المصرفي"),
    "how_cheque": (" by cheque", " بشيك"),
    "against": (
        "\nIt is against invoice {number}, which still owes {owing}. A payment recorded "
        "against an invoice cannot be undone by message.",
        "\nهذه دفعة عن الفاتورة {number} التي بقي عليها {owing}. لا يمكن التراجع عن دفعة مسجّلة "
        "على فاتورة برسالة.",
    ),
    "yes": ("Yes", "نعم"),
    "edit": ("Edit", "تعديل"),
    "cancel": ("Cancel", "إلغاء"),
    "undo": ("Undo", "تراجع"),
    # ── done ─────────────────────────────────────────────────────────────────────────
    "issued_invoice": (
        "Invoice *{number}* issued to {who}: {amount}.{sent}{undo}",
        "صدرت الفاتورة *{number}* إلى {who}: {amount}.{sent}{undo}",
    ),
    "issued_receipt": (
        "Receipt *{number}* issued: {who} paid {amount}.{sent}{undo}",
        "صدر الإيصال *{number}*: دفع {who} مبلغ {amount}.{sent}{undo}",
    ),
    "sent_whatsapp": (
        "\nIt is on its way to {who} on WhatsApp.",
        "\nفي طريقه إلى {who} على واتساب.",
    ),
    "sent_email": (
        "\nIt is also on its way to {email} by email.",
        "\nوفي طريقه أيضاً إلى {email} بالبريد الإلكتروني.",
    ),
    "sent_email_only": (
        "\nIt is on its way to {email} by email.",
        "\nفي طريقه إلى {email} بالبريد الإلكتروني.",
    ),
    "not_reachable": (
        "\n{who} has not messaged this number, so ALYR cannot start a WhatsApp chat with them. "
        "Send it yourself from your phone:\n{share}",
        "\n{who} لم يراسل هذا الرقم، ولا تستطيع ALYR بدء محادثة واتساب معه. أرسلها بنفسك من "
        "هاتفك:\n{share}",
    ),
    "no_customer": (
        "\nIt has no customer to send to. This is its link, to share yourself:\n{link} ",
        "\nلا يوجد عميل لإرسالها إليه. هذا رابطها لتشاركه بنفسك:\n{link} ",
    ),
    "undo_hint": (
        "\nMade a mistake? Reply Undo within {minutes} minutes: that cancels it with a credit "
        "note. The invoice stays on record as cancelled and its number is not used again.",
        "\nأخطأت؟ أجب بـ «تراجع» خلال {minutes} دقائق: تُلغى بإشعار دائن. تبقى الفاتورة في "
        "السجل ملغاة ولا يُعاد استخدام رقمها.",
    ),
    "undo_hint_receipt": (
        "\nMade a mistake? Reply Undo within {minutes} minutes: that cancels it with a credit "
        "note. The receipt stays on record as cancelled and its number is not used again.",
        "\nأخطأت؟ أجب بـ «تراجع» خلال {minutes} دقائق: يُلغى بإشعار دائن. يبقى الإيصال في "
        "السجل ملغياً ولا يُعاد استخدام رقمه.",
    ),
    "undone": (
        "Cancelled: *{number}* is now void and credit note *{credit}* was issued. Both stay on "
        "record and neither number is used again.{told}",
        "أُلغي: صارت *{number}* ملغاة وصدر الإشعار الدائن *{credit}*. يبقيان في السجل ولا "
        "يُعاد استخدام أي من الرقمين.{told}",
    ),
    "undone_told": (
        "\n{who} was sent the credit note too, so they know.",
        "\nأُرسل الإشعار الدائن إلى {who} أيضاً ليكون على علم.",
    ),
    "undo_late": (
        "It is too late to undo *{number}* by message ({minutes} minutes). Open Documents in "
        "your workspace and cancel it there with a reason.",
        "فات وقت التراجع عن *{number}* برسالة ({minutes} دقائق). افتح المستندات في مساحة "
        "عملك وألغها من هناك مع ذكر السبب.",
    ),
    "undo_nothing": (
        "There is nothing to undo.", "لا يوجد ما يُتراجع عنه.",
    ),
    "undo_payment": (
        "A payment recorded against an invoice cannot be undone by message. Open the invoice in "
        "Documents to see it.",
        "لا يمكن التراجع عن دفعة مسجّلة على فاتورة برسالة. افتح الفاتورة في المستندات لمشاهدتها.",
    ),
    "cancelled": (
        "Cancelled. Nothing was issued.", "أُلغي الطلب. لم يصدر شيء.",
    ),
    "edit_again": (
        "Nothing was issued. Send it again with the change, for example:\n"
        "invoice Ahmed 450 for AC repair",
        "لم يصدر شيء. أرسلها مرة أخرى مع التعديل، مثلاً:\n"
        "فاتورة أحمد 450 صيانة مكيف",
    ),
    "already_issued": (
        "Already issued: *{number}*.", "صدرت بالفعل: *{number}*.",
    ),
    "expired": (
        "That was a while ago, so nothing was issued. Send it again when you are ready.",
        "مضى وقت على ذلك فلم يصدر شيء. أرسلها مرة أخرى حين تكون جاهزاً.",
    ),
    "cannot": (
        "{why}", "{why}",
    ),
    "default_receipt_line": ("Payment received", "دفعة مستلمة"),
}

# The words on the buttons: at most 20 characters each.
BUTTONS = ("yes", "edit", "cancel", "undo")


class _Blank(dict):
    def __missing__(self, key: str) -> str:
        return ""


def frag(code: str, lang: str, **details: object) -> str:
    """A piece of a sentence (" for AC repair", " in cash", a line to add), in the language asked,
    to be put inside `say`'s details: no line-opening mark of its own, the whole sentence gets
    its marks once."""
    english, arabic = WORDS[code]
    return (arabic if lang == "ar" else english).format_map(_Blank(details))


def title(code: str, lang: str) -> str:
    """The words on a button: what the button says and nothing else (a title has no marks)."""
    english, arabic = WORDS[code]
    return arabic if lang == "ar" else english


def say(code: str, lang: str, **details: object) -> str:
    """The sentence in the language asked. An Arabic line opens with U+200F so the phone sets
    it right to left whatever it begins with (a name, an amount, a Latin word)."""
    english, arabic = WORDS[code]
    if lang == "ar":
        text = arabic.format_map(_Blank(details))
        # A bold run that ends in Latin letters or digits needs a U+200F after it, or the phone
        # shows «*ALYR Chat* · 68 طلباً» as «68 · ALYR Chat».
        text = _BOLD.sub(lambda m: m.group(0) + RLM if _LATIN_END.search(m.group(1))
                         else m.group(0), text)
        return "\n".join(RLM + line if line else line for line in text.split("\n"))
    return english.format_map(_Blank(details))


_BOLD = re.compile(r"\*([^*\n]+)\*")
_LATIN_END = re.compile(r"[A-Za-z0-9]$")
