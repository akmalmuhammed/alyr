"""Finding the item a person meant from how they typed it (D-039, ALY-106).

Staff type "sold out shawarma" and customers type "shawarma", in English or Arabic, with
spelling mistakes, the Arabic definite article, or only part of the name. The rule that
matters most: **never guess**. A name that fits one item is that item; a name that fits
several is all of them, and the caller asks which one. Spelling mistakes are forgiven only
where there is little doubt (a longer word, one letter off).

The Arabic spellings people mix up are folded to one (`text.fold`: hamza forms of alef,
ya and alef maqsura, ta marbuta and ha, the marks above letters, Eastern digits), and a
leading «ال» is dropped, so «الشاورما» finds «شاورما».

This module reads nothing from the database. It is given the shop's items already loaded
(`service.Loaded`) and returns who matched.
"""

import re
from dataclasses import dataclass, field

from alyr.modules.items import text

ARTICLE = "ال"
MAX_CHOICES = 10


_MARKS = re.compile(r"[!?¿¡…]+")


def tokens(value: str) -> list[str]:
    """The words of a name or a query, folded, without the Arabic article. A question or
    exclamation mark is not part of a word."""
    out = []
    for word in text.search_words(_MARKS.sub(" ", value)):
        if word.startswith(ARTICLE) and len(word) > len(ARTICLE) + 2:
            word = word[len(ARTICLE):]
        out.append(word)
    return out


def distance(a: str, b: str) -> int:
    """How many single-letter edits (one letter added, dropped, changed or two neighbours
    swapped) turn `a` into `b`."""
    previous2: list[int] | None = None
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            current[j] = min(
                previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)
            )
            if (
                previous2 is not None and i > 1 and j > 1
                and ca == b[j - 2] and a[i - 2] == cb
            ):
                current[j] = min(current[j], previous2[j - 2] + 1)
        previous2, previous = previous, current
    return previous[len(b)]


def word_score(query: str, word: str) -> int:
    """How well one typed word fits one word of a name: 3 the same, 2 the start of it or
    inside it, 1 a spelling mistake away, 0 not at all. Short words must be exact."""
    if query == word:
        return 3
    if len(query) >= 3 and (word.startswith(query) or query in word):
        return 2
    if len(query) >= 4 and distance(query, word) <= (1 if len(query) < 8 else 2):
        return 1
    return 0


def _best(query: str, name_words: list[str]) -> tuple[int, int]:
    """The best score of one typed word against a name's words, and which word it was."""
    best, where = 0, -1
    for index, word in enumerate(name_words):
        score = word_score(query, word)
        if score > best:
            best, where = score, index
    return best, where


@dataclass
class Target:
    """Something a person can mean: an item, or one size or colour of it."""

    item: dict
    variant: dict | None = None
    # How the words fit, best first when ranked: (lowest word score, exact name, total).
    grade: int = 0
    exact: bool = False
    total: int = 0
    coverage: float = 0.0

    @property
    def key(self) -> tuple:
        return (self.grade, self.exact, self.total, self.coverage)


def _fit(words: list[str], name_words: list[str]) -> tuple[int, int, float] | None:
    """(lowest score, total, share of the name used) of typed `words` against a name, or
    None if some word fits nothing in it."""
    if not name_words:
        return None
    scores, used = [], set()
    for query in words:
        best, where = _best(query, name_words)
        if best == 0:
            return None
        scores.append(best)
        used.add(where)
    return min(scores), sum(scores), len(used) / len(name_words)


def _rate(words: list[str], item: dict, variant: dict | None) -> Target | None:
    """Score one target, in whichever language fits it better. A size is a target only
    when the typed words reach past the item's own name into the size's."""
    found = None
    for lang, other in (("name", "name_ar"), ("name_ar", "name")):
        name = tokens(item[lang])
        if variant is not None:
            if name and all(_best(query, name)[0] for query in words):
                continue  # the item's name said it all; the size adds nothing
            # A size named in one language only is still that size in the other.
            name = name + (tokens(variant[lang]) or tokens(variant[other]))
        fit = _fit(words, name)
        if fit is None:
            continue
        grade, total, coverage = fit
        rating = (grade, grade == 3 and coverage == 1.0, total, coverage)
        if found is None or rating > found.key:
            found = Target(item, variant, grade, rating[1], total, coverage)
    return found


@dataclass
class Found:
    """What a typed name matched. `one` is set when exactly one target fits well enough
    to act on; otherwise `many` lists the targets to choose between, best first, at most
    ten, and `more` says there were more. Both empty: nothing fits."""

    one: Target | None = None
    many: list[Target] = field(default_factory=list)
    more: bool = False


def find(words: list[str], entries: list, with_variants: bool = True) -> Found:
    """Match typed `words` (from `tokens`) against the shop's items (`service.Loaded`).
    One target is returned only when it is the only one that fits, or the name was typed in
    full and nothing else is called that; anything else is a question for the person.

    With `with_variants`, every named size or colour of an item is a target too, so "abaya
    black M" can point at one variant; its words are then part of the name it must fit."""
    if not words:
        return Found()
    hits: list[Target] = []
    for entry in entries:
        hit = _rate(words, entry.item, None)
        if hit is not None:
            hits.append(hit)
        if with_variants:
            for variant in entry.variants:
                if variant["active"] and (variant["name"] or variant["name_ar"]):
                    hit = _rate(words, entry.item, variant)
                    if hit is not None:
                        hits.append(hit)
    if not hits:
        return Found()
    hits.sort(key=lambda t: t.key, reverse=True)
    top, rest = hits[0], hits[1:]
    if not rest or (top.exact and not rest[0].exact):
        return Found(one=top)
    return Found(many=hits[:MAX_CHOICES], more=len(hits) > MAX_CHOICES)


def label(target: Target, lang: str) -> str:
    """"Abaya – Black M": what a numbered choice shows."""
    ar = lang == "ar"
    item = target.item
    name = (item["name_ar"] or item["name"]) if ar else (item["name"] or item["name_ar"])
    if target.variant is None:
        return name
    v = target.variant
    sub = (v["name_ar"] or v["name"]) if ar else (v["name"] or v["name_ar"])
    return f"{name} – {sub}"
