"""Small helpers for wording numbers in messages, in English and Arabic."""

# (singular, plural) in English; (one, two, three to ten, eleven and up) in Arabic.
Noun = tuple[tuple[str, str], tuple[str, str, str, str]]

CUSTOMERS: Noun = (("customer", "customers"), ("عميل واحد", "عميلان", "عملاء", "عميلاً"))
ORDERS: Noun = (("order", "orders"), ("طلب واحد", "طلبان", "طلبات", "طلباً"))
VISITS: Noun = (("visit", "visits"), ("زيارة واحدة", "زيارتان", "زيارات", "زيارة"))


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
