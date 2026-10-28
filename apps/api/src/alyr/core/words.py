"""Small helpers for wording numbers in messages, in English and Arabic."""

# (singular, plural) in English; (one, two, three to ten, eleven and up) in Arabic.
Noun = tuple[tuple[str, str], tuple[str, str, str, str]]

CUSTOMERS: Noun = (("customer", "customers"), ("عميل واحد", "عميلان", "عملاء", "عميلاً"))
ORDERS: Noun = (("order", "orders"), ("طلب واحد", "طلبان", "طلبات", "طلباً"))
VISITS: Noun = (("visit", "visits"), ("زيارة واحدة", "زيارتان", "زيارات", "زيارة"))
APPOINTMENTS: Noun = (
    ("appointment", "appointments"), ("موعد واحد", "موعدان", "مواعيد", "موعداً")
)
JOBS: Noun = (("job", "jobs"), ("مهمة واحدة", "مهمتان", "مهام", "مهمة"))
MESSAGES: Noun = (("message", "messages"), ("رسالة واحدة", "رسالتان", "رسائل", "رسالة"))
REMINDERS: Noun = (("reminder", "reminders"), ("تذكير واحد", "تذكيران", "تذكيرات", "تذكيراً"))
REQUESTS: Noun = (("request", "requests"), ("طلب واحد", "طلبان", "طلبات", "طلباً"))
NUMBERS: Noun = (("number", "numbers"), ("رقم واحد", "رقمان", "أرقام", "رقماً"))
DAYS: Noun = (("day", "days"), ("يوم واحد", "يومان", "أيام", "يوماً"))
HOURS: Noun = (("hour", "hours"), ("ساعة واحدة", "ساعتان", "ساعات", "ساعة"))
ITEMS: Noun = (("item", "items"), ("صنف واحد", "صنفان", "أصناف", "صنفاً"))
DISCOUNTS: Noun = (("discount", "discounts"), ("خصم واحد", "خصمان", "خصومات", "خصماً"))
ZONES: Noun = (
    ("delivery area", "delivery areas"),
    ("منطقة توصيل واحدة", "منطقتا توصيل", "مناطق توصيل", "منطقة توصيل"),
)
PICKUPS: Noun = (("pickup", "pickups"), ("استلام واحد", "استلامان", "استلامات", "استلاماً"))
CHATS: Noun = (("chat", "chats"), ("محادثة واحدة", "محادثتان", "محادثات", "محادثة"))
PATIENTS: Noun = (("patient", "patients"), ("مراجع واحد", "مراجعان", "مراجعين", "مراجعاً"))
TIMES: Noun = (("time", "times"), ("مرة واحدة", "مرتان", "مرات", "مرة"))
STEPS: Noun = (("setup step", "setup steps"), ("خطوة واحدة", "خطوتان", "خطوات", "خطوة"))


def counted(n: int, noun: Noun, lang: str) -> str:
    """"1 customer", "3 customers"; in Arabic the noun follows the number's own rules."""
    if lang == "ar":
        one, two, few, many = noun[1]
        if n == 1:
            return one
        if n == 2:
            return two
        if n == 0 or 3 <= n % 100 <= 10:
            return f"{n} {few}"
        return f"{n} {many}"
    one, many = noun[0]
    return f"{n} {one if n == 1 else many}"
