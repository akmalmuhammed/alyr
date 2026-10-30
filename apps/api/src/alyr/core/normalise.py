"""First piece of the Arabic normaliser (ALY-15): digits, amounts, language detection."""

import re
from decimal import Decimal, InvalidOperation

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬", "01234567890123456789.,")
_ARABIC = re.compile(r"[؀-ۿ]")
_AMOUNT = re.compile(r"\d[\d,]*(?:\.\d{1,2})?")
_PHONE = re.compile(r"\+?[\d\s()-]{6,}")


def western_digits(text: str) -> str:
    """Turn Eastern Arabic and Persian digits into 0-9."""
    return text.translate(_DIGITS)


def has_arabic(text: str) -> bool:
    return bool(_ARABIC.search(text))


def parse_amount(text: str) -> int | None:
    """Read the first money amount in the text and return it in dirhams (1 QAR = 100)."""
    match = _AMOUNT.search(western_digits(text))
    if not match:
        return None
    try:
        value = Decimal(match.group().replace(",", ""))
    except InvalidOperation:
        return None
    dirhams = int(value * 100)
    return dirhams if dirhams > 0 else None


def fmt_qar(dirhams: int) -> str:
    sign = "-" if dirhams < 0 else ""
    whole, part = divmod(abs(dirhams), 100)
    return f"{sign}QAR {whole:,}" + (f".{part:02d}" if part else "")


def fmt_qar_ar(dirhams: int) -> str:
    """The same amount as an Arabic page writes it: the number, then «ر.ق», Western digits
    (ALY-112, D-039 "As built"). «24 ر.ق», «1,234.50 ر.ق». The English form is `fmt_qar`."""
    sign = "-" if dirhams < 0 else ""
    whole, part = divmod(abs(dirhams), 100)
    return f"{sign}{whole:,}" + (f".{part:02d}" if part else "") + " ر.ق"


def shown_name(name: str | None) -> str:
    """A contact's name as a customer page prints it, or "" when the name is only the phone
    number: a customer with no WhatsApp profile name is stored as "+974…" (`core/identity.py`),
    and a page opened from a forwarded link must not print it (ALY-271, CJ-17)."""
    name = (name or "").strip()
    return "" if _PHONE.fullmatch(name) else name
