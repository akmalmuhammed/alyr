"""A discount code typed in the chat (ALY-150, `specs/014-pricing-pack/spec.md`).

"coupon RAMADAN10", "use promo code RAMADAN10", «كوبون رمضان10», «عندي كود خصم RAMADAN10»: the
customer says the word for a code and the code. This file only *reads* the message; whether the
code exists and fits the draft is decided by the same engine the order page uses
(`items/discounts.py`), and what is said back is in `wa_text.py`.

The reading is careful not to take over an ordinary conversation: it needs a word that means a
code (coupon, promo, voucher, "discount code"), and a message that is not a long sentence. A code
is any word left once the filler is taken out; the caller tries each against the shop's codes,
so «please apply coupon ramadan10 to my order» works and «can I get a coupon for my birthday» does
not make a code of «birthday» unless the shop has one by that name.
"""

import re
from dataclasses import dataclass, field

from alyr.modules.items.text import fold

# Words that mean "a code" (folded: Arabic spellings and case are already one).
TRIGGERS = {fold(w) for w in (
    "coupon", "coupons", "promo", "promocode", "voucher", "vouchers", "كوبون", "كوبونات",
    "قسيمة", "قسيمه", "برومو",
)}
# "discount code", "promo code", "كود خصم": two words, either order.
_KIND = {fold(w) for w in ("discount", "promo", "voucher", "خصم", "الخصم", "الكوبون", "القسيمة")}
_CODE = {fold(w) for w in ("code", "كود", "رمز", "الكود", "الرمز")}

FILLER = {fold(w) for w in (
    "i", "have", "a", "an", "the", "my", "use", "using", "apply", "add", "enter", "try", "please",
    "pls", "with", "this", "that", "is", "it", "here", "got", "want", "to", "can", "could",
    "you", "for", "order", "and", "of", "on", "code", "discount", "off", "now", "also", "one",
    "عندي", "لدي", "لدى", "استخدم", "استخدام", "طبق", "اضف", "أضف", "ادخل", "أدخل", "هذا",
    "هذه", "ال", "كود", "رمز", "الكود", "الرمز", "خصم", "الخصم", "من", "على", "في", "لو",
    "سمحت", "فضلا", "فضلاً", "ارجو", "أرجو", "اريد", "أريد", "ابغى", "ابي", "عشان", "الطلب",
    "طلبي", "مع", "الي", "اللي", "هو", "هي", "و", "لي", "عليه", "به", "بي", "كوبون",
)}
MAX_WORDS = 10
_SHAPE = re.compile(r"^[\w-]{3,24}$")
_EDGES = ".,;:!?\"'()[]{}«»،؛؟"


@dataclass
class Ask:
    """What the customer said about a code: the words that could be it, in the order written."""

    candidates: list[str] = field(default_factory=list)


def parse(raw: str) -> Ask | None:
    """None when the message is not about a code. Otherwise the words that could be the code
    (possibly none, when the customer said they have one but not which)."""
    words = [w.strip(_EDGES) for w in raw.split()]
    words = [w for w in words if w]
    if not words or len(words) > MAX_WORDS:
        return None
    folded = [fold(w) for w in words]
    marks: set[int] = set()
    for i, w in enumerate(folded):
        nxt = folded[i + 1] if i + 1 < len(folded) else ""
        if w in TRIGGERS:
            marks.add(i)
        elif w in _KIND and nxt in _CODE:
            marks.update((i, i + 1))
        elif w in _CODE and nxt in _KIND:
            marks.update((i, i + 1))
    if not marks:
        return None
    ask = Ask()
    for i, (word, key) in enumerate(zip(words, folded, strict=True)):
        if i in marks or key in FILLER or not _SHAPE.match(word):
            continue
        ask.candidates.append(word)
    return ask
