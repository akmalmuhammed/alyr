"""Counting an answer, by rule (spec 068, "Reading an answer").

Pure functions, no I/O, no model. An answer is third-party text: it is split into lines and
matched against names, nothing in it is ever followed as an instruction. `read` says whether the
business is named, where in the answer's list, and which other names the list gives. Its limits are
written on the screen: a name is matched as a whole phrase, a nickname or a misspelling is not, and
an answer with no list can name the business but gives no position and no competitors.
"""

import re
from dataclasses import dataclass

from alyr.modules.items.text import fold

MAX_COMPETITORS = 10
MAX_LEAD = 60
MAX_LEAD_WORDS = 8

_ITEM = re.compile(r"^\s*(?:\d{1,2}|[٠-٩]{1,2})\s*[.)\-]\s+(.+)$|^\s*[-*•–]\s+(.+)$")
_BOLD = re.compile(r"\*\*(.+?)\*\*|__(.+?)__")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_CUT = re.compile(r"\s[-–—|]\s|:|\s\(|،|,")
_LEGAL = re.compile(
    r"(?<!\w)(?:w\.?\s?l\.?\s?l\.?|l\.?l\.?c\.?|co\.?|ltd\.?|company)(?!\w)", re.I)
_TRAIL = re.compile(r"[\s\*_`.:;،,\-–—]+$")
_LEAD = re.compile(r"^[\s\*_`\-–—]+")


@dataclass(frozen=True)
class Reading:
    named: bool
    position: int | None
    list_size: int
    matched: str
    competitors: tuple[str, ...]


def base_name(name: str) -> str:
    """A business name without a legal suffix, and without what follows a dash or bar."""
    first = re.split(r"\s[-–—|]\s", name, maxsplit=1)[0]
    return " ".join(_LEGAL.sub(" ", first).split())


def name_forms(*names: str) -> tuple[str, ...]:
    """The distinct base names to look for, longest first; very short ones are left out so a
    one-word nickname cannot match a stray word."""
    seen: dict[str, str] = {}
    for name in names:
        base = base_name(name or "")
        key = fold(base)
        if len(key) >= 4 and key not in seen:
            seen[key] = base
    return tuple(sorted(seen.values(), key=lambda b: -len(b)))


def _pattern(form: str) -> re.Pattern[str]:
    tokens = [re.escape(t) for t in re.findall(r"\w+", fold(form))]
    return re.compile(r"(?<!\w)" + r"[\W_]*".join(tokens) + r"(?!\w)")


def _find(text: str, forms: tuple[str, ...]) -> str | None:
    """The first form found as a whole phrase in `text` (folded); the form as given."""
    folded = fold(text)
    for form in forms:
        if _pattern(form).search(folded):
            return form
    return None


def _lead(item: str) -> str:
    text = _LINK.sub(r"\1", item)
    bold = _BOLD.search(text)
    lead = (bold.group(1) or bold.group(2)) if bold else _CUT.split(text, maxsplit=1)[0]
    lead = _TRAIL.sub("", _LEAD.sub("", lead))
    return lead[:MAX_LEAD].strip()


def list_items(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        found = _ITEM.match(line)
        if found:
            out.append((found.group(1) or found.group(2)).strip())
    return out


def _as_written(text: str, form: str) -> str:
    """The stretch of the answer that matched, as the answer wrote it (for the screen)."""
    tokens = [re.escape(t) for t in re.findall(r"\w+", form)]
    found = re.search(r"[\W_]*".join(tokens), text, re.I) if tokens else None
    return (found.group(0) if found else form)[:200]


def read(text: str, forms: tuple[str, ...]) -> Reading:
    items = list_items(text)
    leads = [_lead(i) for i in items]
    position = None
    matched = ""
    for number, lead in enumerate(leads, start=1):
        if _find(lead, forms):
            position, matched = number, lead
            break
    if position is None:
        found = _find(text, forms)
        matched = _as_written(text, found) if found else ""
    competitors: list[str] = []
    seen: set[str] = set()
    for number, lead in enumerate(leads, start=1):
        key = fold(lead)
        if (
            number == position or len(key) < 2 or key in seen
            or len(lead.split()) > MAX_LEAD_WORDS or _find(lead, forms)
        ):
            continue
        seen.add(key)
        competitors.append(lead)
        if len(competitors) == MAX_COMPETITORS:
            break
    return Reading(position is not None or bool(matched), position, len(items), matched,
                   tuple(competitors))
