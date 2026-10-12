"""What the credit ledger says in a chat.

Staff record sales and payments by message. Customers ask for their balance, pay all or
part of it, or promise a date.
"""

import re
from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, InboundMessage, OutboundMessage
from alyr.core import templates
from alyr.core.normalise import fmt_qar, has_arabic, parse_amount, western_digits
from alyr.modules.ledger import service

BALANCE_WORDS = ("balance", "statement", "how much", "owe", "حساب", "رصيد", "كم علي", "كشف")
PAY_WORDS = ("pay", "ادفع", "أدفع", "دفع", "سداد")
PAYMENT_WORDS = ("paid", "payment", "received", "دفع", "سدد", "استلمت")
SALE_WORDS = ("credit", "sale", "on account", "دين", "آجل", "اجل", "حساب")

# "Ahmed 450 credit", "Ahmed paid 200", "أحمد ٤٥٠ دين"
_ENTRY = re.compile(r"^(?P<name>[^\d]+?)\s+(?P<rest>.*\d.*)$")

MENU = {
    "en": ("Place an order", "My balance", "Pay now"),
    "ar": ("اطلب الآن", "رصيدي", "ادفع الآن"),
}


def _menu(to: UUID, lang: str, body: str) -> OutboundMessage:
    titles = MENU[lang]
    return OutboundMessage(
        to=to, kind="buttons", body=body,
        choices=(Choice("order", titles[0]), Choice("balance", titles[1]),
                 Choice("pay", titles[2])),
    )


async def handle(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    contact: asyncpg.Record,
    message: InboundMessage,
    web_url: str,
) -> list[OutboundMessage]:
    """`contact` is whoever sent the message, already resolved by core identity."""
    text = western_digits(message.text).strip()
    me = contact["id"]

    if contact["role"] == "staff":
        return await _staff(conn, tenant_id, contact, text)

    lang = contact["lang"]
    if has_arabic(text) and lang != "ar":
        lang = "ar"
        await conn.execute("update contacts set lang = 'ar' where id = $1", contact["id"])

    lowered = text.lower()
    typed = not message.reply_id
    wants_pay = message.reply_id == "pay" or (typed and any(w in lowered for w in PAY_WORDS))
    wants_balance = message.reply_id == "balance" or (
        typed and any(w in lowered for w in BALANCE_WORDS)
    )

    if message.reply_id == "promise":
        return [await _promise(conn, contact, lang)]
    if wants_pay and not wants_balance:
        part = parse_amount(text) if typed else None
        return [await _pay(conn, tenant_id, contact, lang, web_url, part)]
    if wants_balance:
        return [await _balance(conn, contact, lang)]
    if message.reply_id == "human":
        body = (
            "سيتواصل معك أحد الموظفين قريباً." if lang == "ar"
            else "A member of staff will reply here shortly."
        )
        return [OutboundMessage(to=me, body=body)]

    shop = await conn.fetchrow("select name, name_ar from tenants where id = $1", tenant_id)
    greeting = (
        f"أهلاً بك في {shop['name_ar'] or shop['name']}. كيف نقدر نساعدك؟" if lang == "ar"
        else f"Welcome to {shop['name']}. How can we help?"
    )
    return [_menu(me, lang, greeting)]


async def _balance(conn, contact, lang: str) -> OutboundMessage:
    to = contact["id"]
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
        return OutboundMessage(to=to, body=body)
    title = "ادفع الآن" if lang == "ar" else "Pay now"
    return OutboundMessage(
        to=to, kind="buttons", body=body, choices=(Choice("pay", title),)
    )


async def _pay(
    conn, tenant_id, contact, lang: str, web_url: str, part: int | None
) -> OutboundMessage:
    to = contact["id"]
    balance = (await service.aged(conn, contact["id"])).balance
    if balance <= 0:
        body = "لا يوجد عليك مبلغ مستحق." if lang == "ar" else "You have nothing to pay."
        return OutboundMessage(to=to, body=body)
    # "pay 500" pays part of the balance; never more than is owed.
    amount = min(part, balance) if part else balance
    link = await service.create_payment_request(conn, tenant_id, contact["id"], amount, web_url)
    if lang == "ar":
        body = f"لدفع {fmt_qar(amount)} افتح الرابط: {link}"
        if amount == balance:
            body += "\nلدفع جزء من المبلغ اكتب مثلاً: ادفع 500"
    else:
        body = f"To pay {fmt_qar(amount)}, open this link: {link}"
        if amount == balance:
            body += '\nTo pay part of it, send for example "pay 500".'
    return OutboundMessage(to=to, body=body)


async def _promise(conn, contact, lang: str) -> OutboundMessage:
    to = contact["id"]
    until = await service.promise_to_pay(conn, contact["id"])
    if lang == "ar":
        body = (
            f"شكراً لك. سجلنا أنك ستدفع قبل {until:%d/%m}. "
            "لن نرسل تذكيرات حتى ذلك التاريخ."
        )
    else:
        body = (
            f"Thank you. We have noted that you will pay by {until:%d %b}. "
            "No reminders will be sent until then."
        )
    return OutboundMessage(to=to, body=body)


async def _staff(conn, tenant_id, staff, text: str) -> list[OutboundMessage]:
    def say(body: str) -> list[OutboundMessage]:
        return [OutboundMessage(to=staff["id"], body=body)]

    match = _ENTRY.match(text)
    amount = parse_amount(match.group("rest")) if match else None
    if not match or amount is None:
        return say(
            'To record a credit sale send: "Ahmed 450 credit". '
            'To record a payment send: "Ahmed paid 200".'
        )
    name = match.group("name").strip()
    lowered = text.lower()
    kind = "payment" if any(w in lowered for w in PAYMENT_WORDS) else "sale"
    for word in PAYMENT_WORDS + SALE_WORDS:
        name = re.sub(rf"\b{re.escape(word)}\b", "", name, flags=re.IGNORECASE).strip()

    found = await conn.fetch(
        "select id, name, lang, credit_limit from contacts "
        "where role = 'customer' and name ilike $1 order by name limit 4",
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
    reply = (
        f"Recorded: {customer['name']}, {what} {fmt_qar(amount)}. "
        f"Balance is now {fmt_qar(balance)}. The customer has been told."
    )
    if kind == "sale" and 0 < customer["credit_limit"] < balance:
        limit = fmt_qar(customer["credit_limit"])
        reply += f"\nWarning: this is over their credit limit of {limit}."

    shop = await conn.fetchrow("select name, name_ar from tenants where id = $1", tenant_id)
    arabic = customer["lang"] == "ar"
    if arabic:
        what = "دفعة" if kind == "payment" else "شراء آجل"
    else:
        what = "a payment" if kind == "payment" else "a credit purchase"
    notice = templates.notice(
        customer["id"], "entry_recorded", customer["lang"],
        service.entry_notice(
            customer["lang"], shop["name"], shop["name_ar"], kind, amount, balance
        ),
        shop["name_ar"] if arabic and shop["name_ar"] else shop["name"],
        what, fmt_qar(amount), fmt_qar(balance),
    )
    return [*say(reply), notice]
