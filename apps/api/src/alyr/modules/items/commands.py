"""Reading a staff member's message as a Catalog command (D-039, ALY-106).

    sold out shawarma         نفذ شاورما          الشاورما خلصت
    back shawarma             رجع شاورما
    stock abaya black M 5     مخزون عباية أسود M 5
    price shawarma 12         سعر شاورما 12
    undo                      تراجع

A command is a verb, the name of an item, and (for stock and price) a number. The verb
comes first, or, for "sold out" and "back", last as people say it in Arabic («الشاورما
خلصت»). Words are compared after folding, so the Arabic spellings people mix up do not
matter. A message that does not start (or, for sold out and back, end) with a verb is not
a command and is left to the other modules: staff also record credit sales and payments
by message.

Nothing here touches the database.
"""

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from alyr.core.normalise import western_digits
from alyr.modules.items import qty, text

# verb: phrases, folded. Longer phrases are tried first.
_VERBS: dict[str, tuple[str, ...]] = {
    "sold_out": (
        "sold out", "soldout", "out of stock", "ran out", "finished", "out",
        "نفذ", "نفذت", "نفد", "نفدت", "خلص", "خلصت", "خلصان", "انتهى", "انتهت",
        "غير متوفر", "مو متوفر",
    ),
    "back": (
        "back in stock", "in stock", "restocked", "available", "back",
        "رجع", "رجعت", "رجعوا", "توفر", "توفرت", "متوفر", "متوفرة", "عاد", "عادت", "موجود",
    ),
    "stock": ("stock", "مخزون", "المخزون"),
    "price": ("price", "set price", "سعر", "السعر"),
    "undo": ("undo", "تراجع", "تراجعي"),
    "help": ("help", "commands", "مساعدة", "الاوامر", "اوامر"),
}
# Only these may come last: "shawarma finished", «الشاورما نفذت».
_AFTER = {
    "sold_out": {"sold out", "soldout", "finished", "نفذ", "نفذت", "نفد", "نفدت", "خلص",
                 "خلصت", "خلصان", "انتهى", "انتهت"},
    "back": {"back", "رجع", "رجعت", "رجعوا", "توفر", "توفرت", "متوفر", "متوفرة"},
}
_POLITE = {"please", "pls", "plz", "now", "من", "فضلك", "لو", "سمحت", "الان", "ياخي", "يا"}
_CURRENCY = {"qar", "qr", "riyal", "riyals", "ريال", "ر.ق", "رق", "ر"}
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
# A point or comma between two digits belongs to the number; the word splitter would cut it.
_POINT, _COMMA = "\x01", "\x02"


@dataclass(frozen=True)
class Command:
    verb: str  # sold_out, back, stock, price, undo, help
    query: str  # the typed name, as typed (minus the verb and the number)
    number: str | None = None  # the last number in the message, as typed (stock, price)


def _words(message: str) -> list[str]:
    """The words of a message, folded, with a decimal number kept in one piece."""
    folded = text.fold(western_digits(message))
    folded = re.sub(r"[!?¿¡…]+", " ", folded)
    folded = re.sub(r"(?<=\d)\.(?=\d)", _POINT, folded)
    folded = re.sub(r"(?<=\d),(?=\d)", _COMMA, folded)
    words = [w for w in text.search_words(folded) if w]
    return [w.replace(_POINT, ".").replace(_COMMA, ",") for w in words]


_TABLE: list[tuple[str, tuple[str, ...], str]] = sorted(
    (
        (verb, tuple(_words(phrase)), " ".join(_words(phrase)))
        for verb, phrases in _VERBS.items() for phrase in phrases
    ),
    key=lambda row: -len(row[1]),
)
_LAST_OK = {
    verb: {" ".join(_words(phrase)) for phrase in phrases} for verb, phrases in _AFTER.items()
}


def parse(message: str) -> Command | None:
    """The command in a message, or None if it is not one."""
    words = _words(message)
    while words and words[0] in _POLITE:
        words = words[1:]
    while words and words[-1] in _POLITE:
        words = words[:-1]
    if not words:
        return None
    for verb, phrase, joined in _TABLE:
        size = len(phrase)
        if tuple(words[:size]) == phrase:
            return _build(verb, words[size:], message)
        if verb in _LAST_OK and joined in _LAST_OK[verb] and tuple(words[-size:]) == phrase:
            if len(words) > size:
                return _build(verb, words[:-size], message)
    return None


def _build(verb: str, rest: list[str], original: str) -> Command:
    number = None
    if verb in ("stock", "price"):
        # "price shawarma 12 QAR": the money word after the number is not part of the name.
        while rest and rest[-1] in _CURRENCY:
            rest = rest[:-1]
        if rest and _NUMBER.fullmatch(rest[-1]):
            number, rest = rest[-1], rest[:-1]
    return Command(verb, " ".join(rest), number)


def quantity(raw: str | None) -> "qty.Qty | None":
    """A stock figure that may be a decimal ("12.5", "12,5") for something sold by weight or
    volume: from zero up, at most three places; None if it is not one (ALY-149)."""
    if raw is None:
        return None
    try:
        return qty.parse(raw, allow_zero=True)
    except qty.QtyError:
        return None


def whole_number(raw: str | None) -> int | None:
    """A stock figure: a whole number from zero up, or None."""
    if raw is None or not re.fullmatch(r"\d{1,7}", raw):
        return None
    return int(raw)


def dirhams(raw: str | None) -> int | None:
    """A price typed in riyals ("12", "12.5", "12,5", "1,000") as dirhams (1 QAR = 100);
    None if it is not a positive amount with at most two decimals."""
    if raw is None:
        return None
    # "1,000" is a thousand; "12,5" is twelve and a half.
    plain = raw.replace(",", "") if re.fullmatch(r"\d{1,3}(,\d{3})+", raw) else raw
    try:
        value = Decimal(plain.replace(",", "."))
    except InvalidOperation:
        return None
    cents = value * 100
    if value <= 0 or cents != cents.to_integral_value():
        return None
    return int(cents)
