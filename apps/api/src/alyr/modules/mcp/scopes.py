"""What an owner can allow an app to do (spec 067, "Scopes").

A scope is the ceiling the owner gave this app. The action layer's role table is the ceiling for
the person, and the business's modules are the third: a tool is offered only when all three allow
it, and each is checked again on every call.
"""

READ, STOCK, BOOKINGS, ORDERS, SEND = "read", "stock", "bookings", "orders", "send"
ALL = (READ, STOCK, BOOKINGS, ORDERS, SEND)
# What the protected resource asks for at the start: the minimum. The rest come by step-up.
BASIC = (READ,)

# The words the consent page uses, in both languages. Honest and plain: no "AI", no "assistant".
WORDS = {
    READ: ("See how the business is doing: orders, bookings, stock, what is owed",
           "الاطلاع على سير العمل: الطلبات والحجوزات والمخزون والمبالغ المستحقة"),
    STOCK: ("Change what is in stock, after you say yes",
            "تغيير ما هو متوفر في المخزون، بعد موافقتك"),
    BOOKINGS: ("Change bookings, after you say yes", "تغيير الحجوزات، بعد موافقتك"),
    ORDERS: ("Change orders, after you say yes", "تغيير الطلبات، بعد موافقتك"),
    SEND: ("Send messages to customers, after you say yes",
           "إرسال رسائل إلى العملاء، بعد موافقتك"),
}


def parse(text: str | None) -> list[str]:
    """The scopes in a request's `scope` parameter that we know, in our order; unknown words are
    dropped. Never empty: `read` is always there, because an app with no scope can do nothing."""
    asked = set((text or "").split())
    chosen = [s for s in ALL if s in asked]
    return chosen or [READ]


def hierarchy(held: frozenset[str] | set[str] | list[str]) -> frozenset[str]:
    """The scopes a token effectively has. None implies another today (the spec asks servers to
    account for hierarchies; ours are flat), so this is the set itself."""
    return frozenset(held)
