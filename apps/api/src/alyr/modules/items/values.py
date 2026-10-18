"""Reading what people type in a spreadsheet cell (D-039, ALY-108).

An owner's file is typed by hand, on a phone or a laptop, in either language: Eastern Arabic
digits, a comma or a space between thousands, "QAR" or «ر.ق» beside a price, "yes" or
«نعم». These functions turn a cell into a value or raise `CellError` with a stable `code`
and the details a message needs. They never guess where a guess could be wrong: a number
that could be read two ways is refused with a request to write it plainly.

Money is in dirhams (1 QAR = 100), always whole numbers.
"""

import re
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from alyr.core.normalise import western_digits
from alyr.modules.items import text


class CellError(Exception):
    """A cell that cannot be used. `code` picks the message; `args` fill it in."""

    def __init__(self, code: str, **args: object) -> None:
        super().__init__(code)
        self.code = code
        self.args_ = args


MAX_MONEY = 100_000_000  # dirhams: QAR 1,000,000, what the API allows
MAX_RIYALS = MAX_MONEY // 100

# ── text ──────────────────────────────────────────────────

# Bidirectional marks and the byte-order mark are invisible, arrive with text copied from
# the web or a chat, and make two equal names differ.
_INVISIBLE_CODES = (0x200B, 0x200E, 0x200F, *range(0x202A, 0x202F), *range(0x2066, 0x206A), 0xFEFF)
_INVISIBLE = re.compile(f"[{''.join(chr(c) for c in _INVISIBLE_CODES)}]")
_CONTROL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
# What an export puts in front of text that a spreadsheet would run as a formula.
_NEUTRALISED = re.compile(r"^'(?=[=+\-@\t\r])")
FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def as_text(value: object) -> str:
    """A cell as plain text. Numbers lose a needless ".0", dates become YYYY-MM-DD."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, Decimal):
        whole = value.to_integral_value()
        return str(int(whole)) if value == whole else format(value.normalize(), "f")
    if isinstance(value, datetime):
        midnight = value.time().isoformat() == "00:00:00"
        return value.date().isoformat() if midnight else value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def clean(value: object, multiline: bool = False) -> str:
    """Text from a cell: no invisible marks or control characters, no padding. A name keeps
    single spaces between words; a description keeps its line breaks. The apostrophe an
    export adds in front of text that looks like a formula is taken off again."""
    raw = _CONTROL.sub("", _INVISIBLE.sub("", as_text(value)))
    raw = _NEUTRALISED.sub("", raw.strip())
    if multiline:
        lines = [" ".join(line.split()) for line in raw.replace("\r\n", "\n").split("\n")]
        return "\n".join(lines).strip()
    return " ".join(raw.split())


def starts_like_formula(value: object) -> bool:
    return isinstance(value, str) and value.lstrip().startswith(FORMULA_START[:4])


# ── money and numbers ─────────────────────────────────────

_CURRENCY_WORD = (
    r"(?:qatari\s+riyals?|qar|q\.?\s?r\.?|riyals?|ريال\s+قطري|ريالات?|ريال|ر\s?\.\s?ق\s?\.?|رق)"
)
# The currency is written before or after the number, never inside it.
_CURRENCY = re.compile(rf"^\s*{_CURRENCY_WORD}\s*|\s*{_CURRENCY_WORD}\s*$", re.IGNORECASE)
# Spaces of every width, and the apostrophes some systems put between thousands.
_SPACE_CODES = (0x00A0, 0x2009, 0x202F, 0x2019)
_SPACES = re.compile(r"[\s`']|[" + "".join(chr(c) for c in _SPACE_CODES) + "]")


def _plain_number(value: str) -> str:
    """Digits as 0-9, the Arabic comma as a comma, currency words and spaces gone."""
    s = western_digits(value.strip()).replace("،", ",").replace("−", "-")
    s = _CURRENCY.sub("", s)
    return _SPACES.sub("", s)


def _decimal_of(s: str, original: str) -> Decimal:
    """A plain number string, with thousands separators and a decimal mark, as a Decimal."""
    if re.fullmatch(r"\d+", s):
        return Decimal(s)
    if "," in s and "." in s:
        point = "," if s.rfind(",") > s.rfind(".") else "."
        group = "." if point == "," else ","
        if re.fullmatch(rf"\d{{1,3}}(?:{re.escape(group)}\d{{3}})+{re.escape(point)}\d+", s):
            return Decimal(s.replace(group, "").replace(point, "."))
        raise CellError("bad_number", value=original)
    if "," in s:
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+", s):
            return Decimal(s.replace(",", ""))
        if re.fullmatch(r"\d+,\d+", s):
            return Decimal(s.replace(",", "."))
        raise CellError("bad_number", value=original)
    if "." in s:
        if re.fullmatch(r"\d*\.\d+", s):
            whole, frac = s.split(".")
            if len(frac) == 3 and whole and whole != "0" and len(whole) <= 3:
                # 1.250 is one riyal 25 in some files and one thousand two hundred fifty
                # in others. Guessing wrong prices an item a thousand times too high or low.
                raise CellError("ambiguous_number", value=original)
            return Decimal(s)
        if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", s):  # 1.250.000: dots between thousands
            return Decimal(s.replace(".", ""))
        raise CellError("bad_number", value=original)
    raise CellError("bad_number", value=original)


def _signed(s: str) -> tuple[bool, str]:
    if s.startswith("-"):
        return True, s[1:]
    return False, s[1:] if s.startswith("+") else s


def parse_money(value: object, *, signed: bool = False, zero_ok: bool = True) -> int:
    """A price in dirhams from "12", "12.5", "QAR 1,250.50", "١٢٫٥٠", "12 ريال" or a number
    cell. At most two decimals in text; a number cell, which a spreadsheet may carry as
    12.499999999999998, is rounded to the nearest dirham. `signed` allows a minus (a price
    difference)."""
    if isinstance(value, bool) or isinstance(value, date):
        raise CellError("bad_money", value=as_text(value))
    exact = not isinstance(value, Decimal)  # a number cell may carry floating-point noise
    if isinstance(value, Decimal):
        amount = value
        shown = ""
    else:
        shown = as_text(value)
        negative, body = _signed(_plain_number(shown))
        if not body:
            raise CellError("bad_money", value=shown)
        try:
            amount = _decimal_of(body, shown)
        except CellError as error:
            if error.code == "ambiguous_number":
                raise
            raise CellError("bad_money", value=shown) from error
        if negative:
            amount = -amount
    if abs(amount) > MAX_RIYALS * 10:  # far past the limit, and too big to do arithmetic on
        raise CellError("money_too_big", value=(shown or "")[:60])
    shown = shown or as_text(value)
    if exact and amount != amount.quantize(Decimal("0.01")):
        raise CellError("money_decimals", value=shown)
    if amount < 0 and not signed:
        raise CellError("negative_money", value=shown)
    dirhams = int((amount * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    if abs(dirhams) > MAX_MONEY:
        raise CellError("money_too_big", value=shown)
    if dirhams == 0 and not zero_ok:
        raise CellError("zero_money", value=shown)
    return dirhams


def parse_int(value: object, low: int, high: int) -> int:
    """A whole number between `low` and `high` from "12", "1,000", "١٢", "12.0" or a
    number cell."""
    shown = as_text(value)
    if isinstance(value, bool) or isinstance(value, date):
        raise CellError("bad_number", value=shown)
    if isinstance(value, Decimal):
        amount = value
    else:
        negative, body = _signed(_plain_number(shown))
        try:
            amount = _decimal_of(body, shown) if body else None
        except CellError:
            amount = None
        if amount is None:
            raise CellError("bad_number", value=shown)
        if negative:
            amount = -amount
    if amount != amount.to_integral_value():
        raise CellError("not_whole", value=shown)
    number = int(amount)
    if number < low or number > high:
        raise CellError("out_of_range", value=shown, low=low, high=high)
    return number


# ── yes / no, words, dates, lists ─────────────────────────

YES = {"yes", "y", "true", "1", "on", "نعم", "ايوه", "اي", "صح"}
NO = {"no", "n", "false", "0", "off", "لا", "كلا", "خطا"}


def parse_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    word = text.fold(western_digits(as_text(value)).strip())
    if word in {text.fold(w) for w in YES}:
        return True
    if word in {text.fold(w) for w in NO}:
        return False
    raise CellError("bad_yes_no", value=as_text(value))


# Anything that is not a Latin letter, a digit or an Arabic letter (U+0600 to U+06FF).
_NOT_WORD = re.compile("[^0-9a-z" + chr(0x600) + "-" + chr(0x6FF) + "]")


def squash(value: str) -> str:
    """One spelling for comparing words: folded, no spaces or punctuation."""
    return _NOT_WORD.sub("", text.fold(western_digits(value)))


def parse_word(value: object, words: dict[str, tuple[str, ...]], code: str) -> str:
    """The key whose words include this cell, in English or Arabic. `words` maps a key to
    the spellings it answers to."""
    shown = as_text(value).strip()
    wanted = squash(shown)
    for key, spellings in words.items():
        if wanted == squash(key) or any(wanted == squash(s) for s in spellings):
            return key
    raise CellError(code, value=shown)


_ISO = re.compile(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})")
_DMY = re.compile(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})")


def parse_date(value: object) -> date:
    """A day from a date cell, "2026-10-31" or "31/10/2026" (day first)."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    shown = as_text(value)
    s = western_digits(shown).strip()
    s = s.split("T")[0] if re.match(r"\d{4}-\d{2}-\d{2}T", s) else s
    s = re.sub(r"\s+\d{1,2}:\d{2}(:\d{2})?$", "", s)  # a time of day after the date
    found = _ISO.fullmatch(s)
    if found:
        year, month, day = (int(g) for g in found.groups())
    else:
        found = _DMY.fullmatch(s)
        if not found:
            raise CellError("bad_date", value=shown)
        day, month, year = (int(g) for g in found.groups())
    try:
        return date(year, month, day)
    except ValueError as error:
        raise CellError("bad_date", value=shown) from error


_LIST_SPLIT = re.compile(r"[,;،؛|\n]+")


def split_list(value: object) -> list[str]:
    """Items separated by commas, semicolons, the Arabic comma, a bar or a line break."""
    parts = (clean(p) for p in _LIST_SPLIT.split(as_text(value)))
    seen, out = set(), []
    for part in parts:
        if part and part.lower() not in seen:
            seen.add(part.lower())
            out.append(part)
    return out


def money_text(dirhams: int | None) -> str:
    """12 and a half riyals as "12.50" for a file; nothing as an empty cell."""
    if dirhams is None:
        return ""
    sign = "-" if dirhams < 0 else ""
    whole, part = divmod(abs(dirhams), 100)
    return f"{sign}{whole}.{part:02d}"


def decimal_of_dirhams(dirhams: int) -> Decimal:
    return Decimal(dirhams) / 100


def number_or_none(value: str) -> Decimal | None:
    try:
        return Decimal(value)
    except InvalidOperation:
        return None
