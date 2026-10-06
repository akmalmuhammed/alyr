"""What the credit ledger says in a chat.

Staff record sales and payments by message. Customers ask for their balance and pay.
"""

import re
from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, InboundMessage, OutboundMessage
from alyr.core.normalise import fmt_qar, has_arabic, parse_amount, western_digits
from alyr.modules.ledger import service

BALANCE_WORDS = ("balance", "statement", "how much", "owe", "حساب", "رصيد", "كم علي", "كشف")
PAY_WORDS = ("pay", "ادفع", "أدفع", "دفع", "سداد")
PAYMENT_WORDS = ("paid", "payment", "received", "دفع", "سدد", "استلمت")
SALE_WORDS = ("credit", "sale", "on account", "دين", "آجل", "اجل", "حساب")

# "Ahmed 450 credit", "Ahmed paid 200", "أحمد ٤٥٠ دين"
_ENTRY = re.compile(r"^(?P<name>[^\d]+?)\s+(?P<rest>.*\d.*)$")

MENU = {
    "en": ("My balance", "Pay now", "Talk to staff"),
    "ar": ("رصيدي", "ادفع الآن", "تحدث مع موظف"),
}


def _menu(to: str, lang: str, body: str) -> OutboundMessage:
    titles = MENU[lang]
    return OutboundMessage(
        to_number=to, kind="buttons", body=body,
        choices=(Choice("balance", titles[0]), Choice("pay", titles[1]),
                 Choice("human", titles[2])),
    )


async def handle(
    conn: asyncpg.Connection, tenant_id: UUID, message: InboundMessage, web_url: str
) -> list[OutboundMessage]:
    contact = await conn.fetchrow(
        "select id, name, role, lang from contacts where phone = $1", message.from_number
    )
    if contact is None:
        contact = await conn.fetchrow(
            "insert into contacts (phone, name) values ($1, $2) returning id, name, role, lang",
            message.from_number, f"+{message.from_number}",
        )
    text = western_digits(message.text).strip()

    if contact["role"] == "staff":
        return [await _staff(conn, contact, message.from_number, text)]

    lang = contact["lang"]
    if has_arabic(text) and lang != "ar":
        lang = "ar"
        await conn.execute("update contacts set lang = 'ar' where id = $1", contact["id"])

    lowered = text.lower()
    wants_pay = message.reply_id == "pay" or (
        not message.reply_id and any(w in lowered for w in PAY_WORDS)
    )
    wants_balance = message.reply_id == "balance" or (
        not message.reply_id and any(w in lowered for w in BALANCE_WORDS)
    )

    if wants_pay and not wants_balance:
        return [await _pay(conn, tenant_id, contact, message.from_number, lang, web_url)]
    if wants_balance:
        return [await _balance(conn, contact, message.from_number, lang)]
    if message.reply_id == "human":
        body = (
            "سيتواصل معك أحد الموظفين قريباً." if lang == "ar"
            else "A member of staff will reply here shortly."
        )
        return [OutboundMessage(to_number=message.from_number, body=body)]

    shop = await conn.fetchrow("select name, name_ar from tenants where id = $1", tenant_id)
    greeting = (
        f"أهلاً بك في {shop['name_ar'] or shop['name']}. كيف نقدر نساعدك؟" if lang == "ar"
        else f"Welcome to {shop['name']}. How can we help?"
    )
    return [_menu(message.from_number, lang, greeting)]


async def _balance(conn, contact, to: str, lang: str) -> OutboundMessage:
    aged = await service.aged(conn, contact["id"])
    recent = await service.recent_entries(conn, contact["id"], limit=3)
    labels = (
        {"sale": "شراء", "payment": "دفعة", "adjustment": "تعديل"} if lang == "ar"
        else {"sale": "Purchase", "payment": "Payment", "adjustment": "Adjustment"}
    )
    lines = [
        f"{r['created_at']:%d %b}  {labels[r['kind']]}  {fmt_qar(r['amount'])}" for r in recent
    ]
    if lang == "ar":
        body = f"رصيدك الحالي: {fmt_qar(aged.balance)}"
        if lines:
            body += "\nآخر الحركات:\n" + "\n".join(lines)
    else:
        body = f"Your balance is {fmt_qar(aged.balance)}."
        if lines:
            body += "\nLatest entries:\n" + "\n".join(lines)
    if aged.balance <= 0:
        return OutboundMessage(to_number=to, body=body)
    title = "ادفع الآن" if lang == "ar" else "Pay now"
    return OutboundMessage(
        to_number=to, kind="buttons", body=body, choices=(Choice("pay", title),)
    )


async def _pay(conn, tenant_id, contact, to: str, lang: str, web_url: str) -> OutboundMessage:
    balance = (await service.aged(conn, contact["id"])).balance
    if balance <= 0:
        body = "لا يوجد عليك مبلغ مستحق." if lang == "ar" else "You have nothing to pay."
        return OutboundMessage(to_number=to, body=body)
    link = await service.create_payment_request(conn, tenant_id, contact["id"], balance, web_url)
    body = (
        f"لدفع {fmt_qar(balance)} افتح الرابط: {link}" if lang == "ar"
        else f"To pay {fmt_qar(balance)}, open this link: {link}"
    )
    return OutboundMessage(to_number=to, body=body)


async def _staff(conn, staff, to: str, text: str) -> OutboundMessage:
    def say(body: str) -> OutboundMessage:
        return OutboundMessage(to_number=to, body=body)

    match = _ENTRY.match(text)
    amount = parse_amount(match.group("rest")) if match else None
    if not match or amount is None:
        return say(
            'To record a credit sale send: "Ahmed 450 credit". '
            'To record a payment send: "Ahmed paid 200".'
        )
    name = match.group("name").strip()
    lowered = text.lower()
    # A trailing or leading "paid" inside the name part still means a payment.
    kind = "payment" if any(w in lowered for w in PAYMENT_WORDS) else "sale"
    for word in PAYMENT_WORDS + SALE_WORDS:
        name = re.sub(rf"\b{re.escape(word)}\b", "", name, flags=re.IGNORECASE).strip()

    found = await conn.fetch(
        "select id, name from contacts where role = 'customer' and name ilike $1 "
        "order by name limit 4",
        f"%{name}%",
    )
    if not found:
        return say(f'No customer matches "{name}". Check the name and send it again.')
    if len(found) > 1:
        names = ", ".join(r["name"] for r in found[:3])
        return say(f'Several customers match "{name}": {names}. Send the full name.')

    customer = found[0]
    await service.add_entry(conn, customer["id"], kind, amount, created_by=staff["name"])
    balance = (await service.aged(conn, customer["id"])).balance
    what = "payment of" if kind == "payment" else "credit sale of"
    return say(
        f"Recorded: {customer['name']}, {what} {fmt_qar(amount)}. "
        f"Balance is now {fmt_qar(balance)}."
    )
