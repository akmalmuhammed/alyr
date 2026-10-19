"""The small pieces of text a layout needs: dates, amounts, labels in the page's languages.
Western digits everywhere, as the brand writes numbers (`alyr-design/arabic.md`)."""

from datetime import date
from decimal import Decimal

from alyr.modules.documents import money, words
from alyr.modules.documents.render.context import Bi, Doc


def date_text(value: date, lang: str) -> str:
    """'19 أكتوبر 2026' and '19 Oct 2026'."""
    months = words.MONTHS_AR if lang == "ar" else words.MONTHS_EN
    return f"{value.day} {months[value.month - 1]} {value.year}"


def label(key: str, lang: str) -> str:
    return words.LABELS[key].get(lang)


def labels(doc: Doc, key: str) -> list[tuple[str, str]]:
    """[(lang, text)] of a label in each language the page carries, the first language first."""
    return [(lang, label(key, lang)) for lang in doc.languages]


def by_lane(doc: Doc, value: Bi) -> list[tuple[str, str]]:
    """A bilingual value as the lines to print: one per language on the page, in page order.
    A language with no text of its own is left out, except that the language the page leads
    with falls back on whatever the other one has, so a line is never blank. Two lines that
    are the same text are printed once."""
    out: list[tuple[str, str]] = []
    for position, lang in enumerate(doc.languages):
        text = value.get(lang).strip()
        if not text and position == 0:
            text = (value.ar or value.en).strip()
        if text and all(text != seen for _, seen in out):
            out.append((lang, text))
    return out


def amount(doc: Doc, minor: int) -> str:
    return money.plain(minor, doc.exponent)


def total_runs(doc: Doc, minor: int) -> list[tuple[str, str]]:
    """The amount with its currency in the order the page's first language reads it:
    'QAR 1,250.00' and '1,250.00 ر.ق'. [(lang, text)] in reading order."""
    number = money.plain(minor, doc.exponent)
    if doc.primary == "ar":
        known = doc.currency in money.CURRENCIES
        symbol = money.CURRENCIES[doc.currency].symbol_ar if known else doc.currency
        return [(doc.primary, number), ("ar", symbol)]
    return [(doc.primary, doc.currency), (doc.primary, number)]


def quantity(value: Decimal) -> str:
    return money.quantity_text(value)


def unit_text(unit: str, lang: str) -> str:
    return words.UNITS[unit].get(lang)


def method_text(method: str, lang: str) -> str:
    return words.PAYMENT_METHODS[method].get(lang)


def title_of(doc: Doc) -> list[tuple[str, str]]:
    return by_lane(doc, doc.title)
