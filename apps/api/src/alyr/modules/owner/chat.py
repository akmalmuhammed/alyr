"""A staff number's messages as owner actions, and the answers in words (D-065).

Only two things are read from anyone: `LINK <code>`, which proves a phone belongs to a
signed-in person, and, from a linked staff number, the commands below. A customer who
writes TODAY is writing an ordinary customer message and is left alone. Anything this
module does not recognise goes on to the other modules exactly as before.

The words are rules, not a model (D-012). English and Arabic; the Arabic is a draft until
a native speaker has read it (ALY-66).
"""

from datetime import date

import asyncpg

from alyr.channels.base import InboundMessage, OutboundMessage
from alyr.config import get_settings
from alyr.core import actions, staff_link
from alyr.core.normalise import fmt_qar, has_arabic
from alyr.core.words import CUSTOMERS, counted
from alyr.modules.items import wa_text

RLM = "‏"  # keeps a line of Arabic running right to left next to digits and Latin

WORDS = {
    "today": {"today", "اليوم"},
    "orders": {"orders", "الطلبات", "طلبات"},
    "bookings": {"bookings", "الحجوزات", "حجوزات"},
    "owed": {"owed", "المستحقات", "مستحقات"},
    "help": {"help", "مساعدة", "المساعدة"},
}
# Where each answer's link points in the workspace, when ALYR_WORKSPACE_URL is set.
SCREEN = {"today": "", "orders": "orders", "bookings": "bookings", "owed": "ledger"}

ROLE = {
    "en": {"owner": "owner", "admin": "admin", "agent": "agent"},
    "ar": {"owner": "صاحب المحل", "admin": "مدير", "agent": "موظف"},
}
STATUS = {
    "en": {"new": "new", "confirmed": "confirmed", "ready": "ready"},
    "ar": {"new": "جديد", "confirmed": "مؤكد", "ready": "جاهز"},
}
PAYMENT = {
    "en": {"unpaid": "not paid", "paid": "paid", "on_account": "on account"},
    "ar": {"unpaid": "غير مدفوع", "paid": "مدفوع", "on_account": "على الحساب"},
}
VISIT = {
    "en": {"booked": "", "completed": " (done)", "no_show": " (no-show)"},
    "ar": {"booked": "", "completed": " (تمّ)", "no_show": " (لم يحضر)"},
}
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _word(text: str) -> str:
    return text.strip().strip("«»\"'.!؟?").lower()


def _command(text: str) -> str | None:
    word = _word(text)
    return next((key for key, words in WORDS.items() if word in words), None)


def _language(contact: asyncpg.Record, message: InboundMessage) -> str:
    return "ar" if contact["lang"] == "ar" or has_arabic(message.text) else "en"


def _reply(contact: asyncpg.Record, lang: str, lines: list[str]) -> list[OutboundMessage]:
    if lang == "ar":
        lines = [f"{RLM}{line}" if line else line for line in lines]
    return [OutboundMessage(to=contact["id"], body="\n".join(lines))]


def _portal_link(command: str) -> list[str]:
    base = get_settings().workspace_url.rstrip("/")
    if not base:
        return []
    path = SCREEN[command]
    return ["", f"{base}/app/{path}" if path else f"{base}/app"]


# ------------------------------------------------------------------ the messages

async def maybe_handle(
    conn: asyncpg.Connection, contact: asyncpg.Record, message: InboundMessage
) -> list[OutboundMessage] | None:
    text = message.text
    if not text:
        return None
    lang = _language(contact, message)

    code = staff_link.parse(text)
    if code is not None:
        return await _link(conn, contact, code, lang)

    command = _command(text)
    if command is None or contact["role"] != "staff":
        return None

    caller = await staff_link.caller_for(conn, contact["id"])
    if caller is None and command == "help":
        # A registered staff number that is not linked keeps the Catalog's HELP (wa_staff).
        return None
    if caller is None:
        return _reply(contact, lang, [
            "هذا الرقم غير مربوط بحساب. اطلب من صاحب المحل ربطه من مساحة العمل." if lang == "ar"
            else "This number is not linked to a login. Ask the owner to link it from the "
                 "workspace."
        ])
    if command == "help":
        lines = await _help(conn, caller, lang)
        if await actions.module_on(conn, "catalog"):
            # The Catalog answers HELP too (wa_staff); a linked number sees both lists.
            lines += ["", wa_text.say("help", lang)]
        return _reply(contact, lang, lines)
    try:
        data = await actions.run(conn, caller, command, lang=lang)
    except actions.NotAllowed:
        return _reply(contact, lang, [
            "هذا لأصحاب المحل والمدراء فقط." if lang == "ar"
            else "That is for the owner and admins."
        ])
    except actions.NotSwitchedOn:
        return _reply(contact, lang, [
            "هذه الخدمة غير مفعّلة لمحلك." if lang == "ar"
            else "That is not switched on for this shop."
        ])
    lines = RENDER[command](data, caller, lang)
    return _reply(contact, lang, lines + _portal_link(command))


async def _link(
    conn: asyncpg.Connection, contact: asyncpg.Record, code: str, lang: str
) -> list[OutboundMessage]:
    result = await staff_link.redeem(conn, contact, code)
    if result == "taken":
        line = (
            "هذا الرقم مربوط بشخص آخر. عليه أن يفكّ الربط أولاً." if lang == "ar"
            else "This number is linked to another person. They need to unlink it first."
        )
    elif isinstance(result, staff_link.Linked):
        role = ROLE[lang][result.role]
        line = (
            f"تم الربط. هذا الرقم الآن باسم {result.name} ({role}). أرسل «مساعدة» لترى ما "
            "يمكنك سؤاله." if lang == "ar"
            else f"Linked. This number now answers to {result.name} ({role}). "
                 "Send HELP to see what you can ask."
        )
    else:
        line = (
            "هذا الرمز لم يعمل. اطلب رمزاً جديداً من مساحة العمل." if lang == "ar"
            else "That code did not work. Ask for a new one in your workspace."
        )
    return _reply(contact, lang, [line])


async def _help(conn: asyncpg.Connection, caller: actions.Caller, lang: str) -> list[str]:
    """Only what this person's role and this shop's modules allow."""
    topics = {
        "today": ("how the day is going", "كيف يسير اليوم"),
        "orders": ("open orders", "الطلبات المفتوحة"),
        "bookings": ("today's bookings", "حجوزات اليوم"),
        "owed": ("who owes you", "من عليه دين لك"),
    }
    ar = lang == "ar"
    out = ["يمكنك أن تسأل ALYR هنا:" if ar else "What you can ask ALYR here:"]
    for key, (en, arabic) in topics.items():
        action = actions.REGISTRY[key]
        if caller.role not in action.roles:
            continue
        if action.module is not None and not await actions.module_on(conn, action.module):
            continue
        word = next(w for w in sorted(WORDS[key]) if (not w.isascii()) == ar).upper()
        out.append(f"{word}: {arabic if ar else en}")
    out.append("REPORT: تقرير الأسبوع الماضي" if ar else "REPORT: last week's report")
    return out


# ------------------------------------------------------------------ the answers

def _date(iso: str, lang: str) -> str:
    day = date.fromisoformat(iso)
    if lang == "ar":
        return f"{day.day}/{day.month}"
    return f"{DAYS[day.weekday()]} {day.day} {MONTHS[day.month - 1]}"


def _say(lang: str):
    """`say(english, arabic)` picks the line for this reader."""
    return lambda en, ar: ar if lang == "ar" else en


def render_today(data: dict, caller: actions.Caller, lang: str) -> list[str]:
    say = _say(lang)
    s = data["sections"]
    day = _date(data["date"], lang)
    lines = [say(f"*Today, {day}*", f"*اليوم، {day}*")]
    if "orders" in s:
        o = s["orders"]
        money = f" ({fmt_qar(o['value'])})" if o["value"] is not None else ""
        lines.append(say(
            f"Orders: {o['count']}{money}, {o['waiting']} waiting, {o['ready']} ready",
            f"الطلبات: {o['count']}{money}، {o['waiting']} بانتظار التجهيز، {o['ready']} جاهزة",
        ))
    if "bookings" in s:
        b = s["bookings"]
        nxt = b["next"]
        line = say(
            f"Bookings: {b['count']}, {b['ahead']} still to come",
            f"الحجوزات: {b['count']}، متبقٍ منها {b['ahead']}",
        )
        if nxt:
            line += say(
                f". Next: {nxt['time']} {nxt['service']}, {nxt['customer']}",
                f". التالي: {nxt['time']} {nxt['service']}، {nxt['customer']}",
            )
        lines.append(line)
    if "ledger" in s:
        money = fmt_qar(s["ledger"]["collected"])
        lines.append(say(f"Collected: {money}", f"المحصّل: {money}"))
    if "inbox" in s:
        wrote = s["inbox"]["wrote"]
        people = counted(wrote, CUSTOMERS, lang)
        lines.append(say(
            "Chats: " + (f"{people} wrote" if wrote else "no messages yet"),
            "المحادثات: " + (f"راسلك {people}" if wrote else "لا رسائل بعد"),
        ))
    if len(lines) == 1:
        lines.append(say(
            "Nothing is switched on to report yet.", "لا شيء مفعّل للإبلاغ عنه بعد."
        ))
    return lines


def render_orders(data: dict, caller: actions.Caller, lang: str) -> list[str]:
    say = _say(lang)
    if not data["open"]:
        return [say("No open orders.", "لا طلبات مفتوحة.")]
    lines = [say(f"*Open orders ({data['open']})*", f"*الطلبات المفتوحة ({data['open']})*")]
    for item in data["items"]:
        parts = [STATUS[lang][item["status"]], PAYMENT[lang][item["payment"]]]
        if item["total"] is not None:
            parts.append(fmt_qar(item["total"]))
        joined = say(", ", "، ").join(parts)
        lines.append(f"#{item['number']} {item['customer']}: {joined}")
    if data["more"]:
        lines.append(say(f"and {data['more']} more", f"و{data['more']} أخرى"))
    return lines


def render_bookings(data: dict, caller: actions.Caller, lang: str) -> list[str]:
    say = _say(lang)
    items = data["items"]
    if not items:
        return [say("No bookings today.", "لا حجوزات اليوم.")]
    total = len(items) + data["more"]
    lines = [say(f"*Bookings today ({total})*", f"*حجوزات اليوم ({total})*")]
    for item in items:
        mark = VISIT[lang][item["status"]]
        lines.append(f"{item['time']} {item['service']}, {item['customer']}{mark}")
    if data["more"]:
        lines.append(say(f"and {data['more']} more", f"و{data['more']} أخرى"))
    return lines


def render_owed(data: dict, caller: actions.Caller, lang: str) -> list[str]:
    say = _say(lang)
    if not data["customers"]:
        return [say("Nobody owes you anything.", "لا أحد مدين لك.")]
    people = counted(data["customers"], CUSTOMERS, lang)
    total = fmt_qar(data["total"])
    lines = [say(f"*Owed to you: {total} from {people}*", f"*المستحق لك: {total} على {people}*")]
    if data["late_total"]:
        late = fmt_qar(data["late_total"])
        lines.append(say(f"Over 60 days late: {late}", f"متأخر أكثر من ٦٠ يوماً: {late}"))
    for c in data["top"]:
        flag = say(" (late)", " (متأخر)") if c["late"] else ""
        lines.append(f"{c['name']}: {fmt_qar(c['balance'])}{flag}")
    return lines


RENDER = {
    "today": render_today,
    "orders": render_orders,
    "bookings": render_bookings,
    "owed": render_owed,
}
