"""Reading what a customer sends to say which item they want (ALY-136, D-039).

A shop shares its inventory page. The customer browses it, picks, and gives the chat an
identifier: the product's link, its short CODE (a number every item of the shop has), its SKU
typed exactly, or its name. This module reads the message. It touches no database and decides
nothing about the shop: the caller looks what it found up in the customer's own shop, and only
there.

What it understands, in English and Arabic, with Western, Arabic-Indic or Persian digits:

* **A link** to the shop's order page: `.../s/<shop>?item=<id>` is one item, `?cat=<name>` a
  category. A link to anything else is not read.
* **A code**: three to five digits, written `214`, `#214`, `code 214`, `item no. 214`,
  «رقم ٢١٤», «كود 214», «منتج رقم 214». Several in one message, each with its quantity:
  `214 x2, 305`, `#214 ×2 و #305`, `2x 214`, `214 qty 3`, «٢١٤ عدد ٢». A size or colour may
  follow in brackets: `214 (black M) x2`.
* **A SKU**: a token with letters and digits (`OUD-12`, `AB123`), looked up as a SKU only.
* **A name**: anything else. The caller matches it by name and always asks which one.

A bare number of three to five digits is a code only when the rest of the message says nothing
else ("214", "do you have 214 please"); with other words ("214 shirt", "iPhone 128") it is part
of a name. A number with a cue ("code 214", "#214") is a code whatever else is said.

A SKU-shaped token is never a name. That is the hazard the audit found: «OUD-12» fell into the
name search and found an unrelated item with «oud» in its name. Here it is a reference to a SKU
and nothing else; if there is no such SKU the customer is told so.
"""

import re
from dataclasses import dataclass, field
from urllib.parse import parse_qs, unquote, urlparse

from alyr.core.normalise import western_digits
from alyr.modules.items import text

MAX_REFS = 20
MAX_NUMBER = 99999

# Invisible direction marks that Arabic keyboards and copy-paste leave in a message.
_CONTROLS = re.compile("[​-‏‪-‮⁦-⁩﻿]")
_URL = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
_TRAILING = ".,;:!?)]}»\"'،؛"
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_HINT = re.compile(r"(?P<code>#?\d{1,5})\s*\((?P<hint>[^()]{1,40})\)")
_SEPARATORS = re.compile(r"[,;+&\n\r|،؛]+")
_AND = re.compile(r"\s+(?:and|plus|مع)\s+|(?:(?<=\s)|^)و(?=\s*#?\d)|\s+و\s+", re.IGNORECASE)
_X_AFTER_NUMBER = re.compile(r"(\d)\s*[x*](?![a-z])")
_X_BEFORE_NUMBER = re.compile(r"(?<![a-z\d])x\s*(\d)")
_NUMBER = re.compile(r"^\d{1,5}$")
_SKU_SHAPE = re.compile(r"^[^\W_]+(?:[-_/.][^\W_]+)*$")

# Said before a number to say "this is a code" (folded the way `text.fold` writes them).
_CUES = {text.fold(w) for w in (
    "code", "item", "no", "number", "ref", "id", "product", "sku", "num",
    "رقم", "كود", "الكود", "رمز", "الرمز", "صنف", "الصنف", "منتج", "المنتج", "الرقم",
)}
# Said beside a number to say "this many".
_QUANTITY_WORDS = {text.fold(w) for w in (
    "qty", "quantity", "pcs", "pc", "pieces", "piece", "count",
    "عدد", "كمية", "قطعة", "قطع", "حبة", "حبات",
)}
# Next to a number, these make it an amount of money, not a code ("QAR 640", «640 ر.ق»).
_MONEY = {
    "qar", "qr", "ر.ق", "ر.ق.", "ريال", "total", "subtotal", "=", "الإجمالي", "المجموع",
    "الاجمالي",
}
# Said around the identifiers; part of no item's name.
_FILLER = {text.fold(w) for w in (
    "hi hello hey please pls thanks thank you i we would like want need to order these this "
    "that items codes my the a an of for from is are do does have any can could get send me "
    "give also kindly regards salam price available stock in just "
    "مرحبا اهلا السلام عليكم من فضلك لو سمحت شكرا ابي ابغى ابغي اريد هذه هذا الاصناف "
    "الاكواد طلب عندكم عندك هل يوجد ممكن ارسل كم سعر متوفر في على"
).split()}


@dataclass(frozen=True)
class Ref:
    """One thing the customer pointed at. `kind` is `code` (value: the digits without leading
    zeros), `sku` (value: the token as typed, lower case), `item` (value: the id in a link)
    or `category` (value: the category's name in a link)."""

    kind: str
    value: str
    quantity: int = 1
    # A size or colour typed in brackets after a code.
    hint: str = ""
    # Written as a code: `#214`, «رقم 214». Not a bare number.
    cued: bool = False
    # For a link: the shop address it names, so another shop's link can be refused.
    slug: str = ""

    def but(self, **changes) -> "Ref":
        values = {
            "kind": self.kind, "value": self.value, "quantity": self.quantity,
            "hint": self.hint, "cued": self.cued, "slug": self.slug,
        }
        return Ref(**{**values, **changes})


@dataclass
class Parsed:
    refs: list[Ref] = field(default_factory=list)
    # Words that are neither filler, nor a number, nor a reference.
    words: list[str] = field(default_factory=list)
    # The message without filler, as one string: a SKU made of plain words is tried against
    # this and the whole message, never against pieces of it.
    plain: str = ""
    # References beyond the most one message may carry.
    dropped: int = 0

    @property
    def codes(self) -> list[Ref]:
        return [r for r in self.refs if r.kind == "code"]

    @property
    def is_order(self) -> bool:
        """The message is identifiers, quantities and filler, or says its numbers are codes.
        Anything else is a name for the caller to match."""
        if not self.refs:
            return False
        return not self.words or any(r.cued or r.kind in ("item", "category") for r in self.refs)


def clean(message: str) -> str:
    """The message without direction marks, digits Western, `×` as `x`, in lower case."""
    return western_digits(_CONTROLS.sub("", message)).replace("×", "x").replace("✕", "x").lower()


def sku_like(token: str) -> bool:
    """`OUD-12`, `AB123`, `shirt/12`: letters and digits in one token, not a quantity (`x2`)."""
    if len(token) < 3 or not _SKU_SHAPE.match(token) or re.fullmatch(r"x\d{1,3}|\d{1,3}x", token):
        return False
    return any(c.isdigit() for c in token) and any(c.isalpha() for c in token)


def _strip(token: str) -> str:
    return token.strip(_TRAILING).lstrip("([{«\"'")


def _links(message: str) -> tuple[list[Ref], str]:
    """The references in the message's links, and the message without them."""
    refs: list[Ref] = []

    def take(found: re.Match) -> str:
        url = found.group().rstrip(_TRAILING)
        parsed = urlparse(url if "://" in url else f"https://{url}")
        path = [p for p in parsed.path.split("/") if p]
        if len(path) >= 2 and path[0] == "s":
            query = parse_qs(parsed.query)
            slug = unquote(path[1]).lower()
            item = (query.get("item") or [""])[0].lower()
            category = (query.get("cat") or [""])[0]
            if _UUID.match(item):
                refs.append(Ref("item", item, cued=True, slug=slug))
            elif category.strip():
                refs.append(Ref("category", category.strip(), cued=True, slug=slug))
        return " "

    return refs, _URL.sub(take, message)


def parse(message: str) -> Parsed:
    """Read a customer's message. See the module's text for what counts as what."""
    result = Parsed()
    # Links first, from the message as typed (a category name in a link keeps its case).
    refs, rest = _links(_CONTROLS.sub("", message))
    result.refs.extend(refs)
    rest = clean(rest)
    hints: list[str] = []

    def keep_hint(found: re.Match) -> str:
        hints.append(found.group("hint").strip())
        return f"{found.group('code')} \x00{len(hints) - 1}\x00 "

    rest = _HINT.sub(keep_hint, rest)
    rest = _AND.sub(" , ", rest)
    rest = _SEPARATORS.sub(" , ", rest)
    rest = _X_AFTER_NUMBER.sub(r"\1 x ", rest)
    rest = _X_BEFORE_NUMBER.sub(r" x \1", rest)
    tokens = [t for t in rest.split() if t]

    last: int | None = None  # index in result.refs of the reference just read
    before: int | None = None  # a quantity written before its code: "2 x 214"
    cue = False

    def add(ref: Ref) -> None:
        nonlocal last, before, cue
        if sum(r.kind in ("code", "sku") for r in result.refs) >= MAX_REFS:
            result.dropped += 1
        else:
            result.refs.append(ref.but(quantity=before or ref.quantity))
            last = len(result.refs) - 1
        before = None
        cue = False

    def set_quantity(value: int) -> None:
        nonlocal before
        value = min(value, MAX_NUMBER)
        if last is not None and result.refs[last].quantity == 1 and before is None:
            result.refs[last] = result.refs[last].but(quantity=value)
        else:
            before = value

    i = 0
    while i < len(tokens):
        raw = tokens[i]
        token = raw if raw in ("x", "*") else _strip(raw)
        folded = text.fold(token)
        following = _strip(tokens[i + 1]) if i + 1 < len(tokens) else ""
        digits = token.lstrip("#")
        before_word = tokens[i - 1].rstrip(":") if i > 0 else ""
        if _NUMBER.match(digits) and not token.startswith("#") and (
            before_word in _MONEY or following in _MONEY
        ):
            i += 1  # an amount of money, not a code
            continue
        if raw == ",":
            last, before, cue = None, None, False
        elif raw.startswith("\x00"):
            if last is not None:
                result.refs[last] = result.refs[last].but(hint=hints[int(raw.strip("\x00"))])
        elif token in ("x", "*") and _NUMBER.match(following):
            set_quantity(int(following))
            i += 1
        elif folded in _QUANTITY_WORDS and _NUMBER.match(following):
            set_quantity(int(following))
            i += 1
        elif _NUMBER.match(digits):
            hashed = token.startswith("#")
            if hashed or cue or len(digits) >= 3:
                add(Ref("code", str(int(digits)), cued=hashed or cue))
            elif text.fold(following) in _QUANTITY_WORDS:
                set_quantity(int(digits))  # "2 pcs"
                i += 1
            elif following == "x" and i + 2 < len(tokens) and _NUMBER.match(
                tokens[i + 2].lstrip("#")
            ):
                before = min(int(digits), MAX_NUMBER)  # "2 x 214"
                i += 1
            # Any other small number carries no meaning of its own: not a code, not a word.
        elif folded in _CUES or token == "#":
            cue = True
            i += 1
            continue
        elif sku_like(token):
            add(Ref("sku", token))
        elif folded in _FILLER or not folded or token in ("x", "*", "-", ":", ".", "="):
            pass
        else:
            result.words.append(token)
        cue = False
        i += 1

    merged: dict[tuple, Ref] = {}
    for ref in result.refs:
        key = (ref.kind, ref.value, ref.hint, ref.slug)
        old = merged.get(key)
        merged[key] = ref if old is None else old.but(
            quantity=min(old.quantity + ref.quantity, MAX_NUMBER), cued=old.cued or ref.cued
        )
    result.refs = list(merged.values())
    result.plain = " ".join(
        t for t in (_strip(w) for w in clean(_URL.sub(" ", message)).split())
        if t and text.fold(t) not in _FILLER and text.fold(t) not in _CUES
    )
    return result
