"""Which words in a customer's message mean what, for the booking chat (the first client's audit,
T10).

The chat used to look for a word anywhere in the message: "cancel appointment" and "change the
appointment" contained "appointment" and were sent a link to make a new booking; "reschedule"
contained "schedule"; the Arabic plural of appointment, «مواعيد», matched nothing. Here a message
is cut into folded words (`items.text.search_words`: one spelling for each Arabic letter people mix
up, no marks, lower case) and each intent is asked in turn, the more specific one first:

* **cancel**: a cancelling word and a booking word ("cancel my appointment", «ألغي الحجز»);
* **change**: a changing word and a booking word, or "reschedule" ("can I change the
  appointment", «أبغى أغير الموعد»);
* **mine**: asks about their own booking ("my booking", «موعدي»);
* **book**: wants to make one.

English words are matched by their start (book, booking, booked) or exactly, never by a word
inside another one; Arabic words keep their prefixes and pronouns (الحجز, لحجز, حجزي), so a root
is looked for inside the word. The Arabic is a draft until the native review (ALY-66).
"""

from alyr.modules.items.text import search_words

# A booking, as a customer says it.
_NOUN_EN = ("book", "appoint", "reserv", "visit")
_NOUN_AR = ("حجز", "حجوزات", "موعد", "مواعيد")

_CANCEL_EN = ("cancel",)
_CANCEL_AR = ("الغا", "الغي", "كنسل")

# Changing words: whole words only ("movie" is not "move").
_CHANGE_EN = frozenset({"change", "changing", "changed", "move", "moving", "postpone",
                        "postponing", "modify", "edit", "switch", "swap"})
_CHANGE_AR = ("تغيير", "تغير", "تعديل", "تاجيل", "تبديل", "نقل", "اغير", "نغير", "غيري")
_RESCHEDULE = ("reschedul", "rebook")

# "my booking", "my appointments": the English possessive is its own word.
_MINE_AR = ("حجزي", "موعدي", "حجوزاتي", "مواعيدي")

# A word that wants a booking made.
_BOOK_EN = ("book", "appoint", "reserv")
_BOOK_AR = ("حجز", "موعد", "مواعيد")


def words(text: str) -> list[str]:
    """The folded words of a message, without the marks at the end of a sentence."""
    return [w for w in (t.strip("?!¿¡…") for t in search_words(text)) if w]


def _starts(tokens: list[str], prefixes: tuple[str, ...]) -> bool:
    return any(t.startswith(p) for t in tokens for p in prefixes)


def _inside(tokens: list[str], roots: tuple[str, ...]) -> bool:
    return any(r in t for t in tokens for r in roots)


def has_booking_word(tokens: list[str]) -> bool:
    return _starts(tokens, _NOUN_EN) or _inside(tokens, _NOUN_AR)


def cancel(tokens: list[str]) -> bool:
    """Wants a booking cancelled: "cancel my appointment", «أبغى ألغي الحجز»."""
    return (_starts(tokens, _CANCEL_EN) or _inside(tokens, _CANCEL_AR)) and has_booking_word(tokens)


def change(tokens: list[str]) -> bool:
    """Wants a booking moved: "change the appointment", "reschedule", «تغيير الموعد»."""
    if _starts(tokens, _RESCHEDULE):
        return True
    wants = bool(set(tokens) & _CHANGE_EN) or _inside(tokens, _CHANGE_AR) or (
        tokens[:1] == ["غير"])
    return wants and has_booking_word(tokens)


def mine(tokens: list[str]) -> bool:
    """Asks about the booking they have: "my booking", «حجزي», «مواعيدي»."""
    if _inside(tokens, _MINE_AR):
        return True
    return any(
        a == "my" and any(b.startswith(p) for p in _NOUN_EN)
        for a, b in zip(tokens, tokens[1:], strict=False)
    )


def book(tokens: list[str]) -> bool:
    """Wants to make a booking: "book", "appointments", "I want to schedule", «أبغى موعد»."""
    return _starts(tokens, _BOOK_EN) or "schedule" in tokens or _inside(tokens, _BOOK_AR)
