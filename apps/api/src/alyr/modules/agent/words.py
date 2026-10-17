"""The Agent's fixed wording, in English and Arabic.

Sentences are whole templates per language, never Arabic stuck together from translated
fragments. Text that carries a figure is returned as "rich" parts: plain strings, and
`{"b": "QAR 3,120"}` for a figure the screen keeps whole in a `<bdi>`.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime

from alyr.core import words as w
from alyr.core.words import Noun

NBSP = " "

MONTHS = {
    "en": ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
    "ar": ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر",
           "أكتوبر", "نوفمبر", "ديسمبر"),
}
# Sunday first, as the shop's week runs. Index with (weekday() + 1) % 7.
DAY_SHORT = {
    "en": ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"),
    "ar": ("أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"),
}
DAY_LONG = {
    "en": ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"),
    "ar": ("الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"),
}
DAY_PLURAL = {
    "en": ("Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"),
    "ar": ("أيام الأحد", "أيام الاثنين", "أيام الثلاثاء", "أيام الأربعاء", "أيام الخميس",
           "أيام الجمعة", "أيام السبت"),
}
RULE = {"en": "RULE", "ar": "القاعدة"}


@dataclass(frozen=True)
class B:
    """A figure kept whole on screen."""

    text: str


def sunday_index(day: date) -> int:
    """0 for Sunday to 6 for Saturday."""
    return (day.weekday() + 1) % 7


def money(dirhams: int, lang: str) -> str:
    """"QAR 3,120" in English, "3,120 ر.ق" in Arabic, never broken across lines."""
    sign = "-" if dirhams < 0 else ""
    whole, part = divmod(abs(dirhams), 100)
    figure = f"{sign}{whole:,}" + (f".{part:02d}" if part else "")
    return f"{figure}{NBSP}ر.ق" if lang == "ar" else f"QAR{NBSP}{figure}"


def count(n: int, noun: Noun, lang: str) -> str:
    return w.counted(n, noun, lang)


def noun_after(n: int, noun: Noun, lang: str) -> str:
    """The noun alone, to follow a number shown on its own ("3 | customers")."""
    if lang == "ar":
        one, _, few, many = noun[1]
        if n == 1:
            return one.replace(" واحد", "").replace(" واحدة", "")
        if n == 0 or 2 <= n % 100 <= 10:
            return few
        return many
    one, many = noun[0]
    return one if n == 1 else many


def minutes(seconds: int | None, lang: str) -> str:
    """A wait in words: "6 min", "1 h 20 min"."""
    if seconds is None:
        return "—"
    mins = max(round(seconds / 60), 0)
    if mins < 60:
        return f"{mins}{NBSP}د" if lang == "ar" else f"{mins}{NBSP}min"
    hours, rest = divmod(mins, 60)
    if lang == "ar":
        return f"{hours}{NBSP}س {rest}{NBSP}د" if rest else f"{hours}{NBSP}س"
    return f"{hours}{NBSP}h {rest}{NBSP}min" if rest else f"{hours}{NBSP}h"


def day_month(day: date, lang: str) -> str:
    return f"{day.day} {MONTHS[lang][day.month - 1]}"


def clock(moment: datetime) -> str:
    return moment.strftime("%H:%M")


def rich(template: str, **values) -> list:
    """Fill a template; `B` values stay whole on screen. Adjacent text is merged."""
    parts: list = []
    for token in re.split(r"(\{\w+\})", template):
        if not token:
            continue
        if token.startswith("{") and token.endswith("}"):
            value = values[token[1:-1]]
            if isinstance(value, B):
                parts.append({"b": value.text})
                continue
            token = str(value)
        if parts and isinstance(parts[-1], str):
            parts[-1] += token
        else:
            parts.append(token)
    return parts


def plain(parts: list) -> str:
    """Rich parts as one string, for tests and logs."""
    return "".join(p if isinstance(p, str) else p["b"] for p in parts)


def pick(text: dict, lang: str) -> str:
    return text["ar"] if lang == "ar" else text["en"]


def rule_line(rule: str, counted_rows: str, lang: str) -> str:
    """"RULE · owed 30+ days, no reminder in 7 days · 4 customers"."""
    return f"{RULE[lang]} · {rule} · {counted_rows}"
