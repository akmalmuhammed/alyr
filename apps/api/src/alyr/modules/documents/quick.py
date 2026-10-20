"""Reading "invoice for AC repair, QAR 500, to Ahmed 5551 2345" (ALY-141, spec 016).

One short sentence in English or Arabic becomes a draft: who it is for, how much, what for. The
workspace's "write it in one line" box and the WhatsApp command for the shop's own staff
(`wa_command.py`) read the same sentence the same way, which is why the parser is a module of its
own that touches nothing:

    invoice Ahmed 500 for AC repair                 فاتورة أحمد 500 صيانة مكيف
    invoice for AC repair, QAR 500, to Ahmed 5551 2345
    receipt Ahmed 500 cash                          إيصال أحمد 500 نقدا
    Ahmed paid 500 cash                             أحمد دفع 500 كاش      استلمت من أحمد 500

The rules, in the order they are applied:

1. A message is an invoice or a receipt only when it says so: it begins with the word ("invoice",
   «فاتورة») or, for a receipt, says that someone paid or that money was received. Anything else
   is not ours and is left to the other modules (the credit ledger reads "Ahmed 450 credit").
2. **A phone number** is eight digits in a Qatar form (5551 2345, 55512345, 974 5551 2345,
   +974 5551 2345, 00974...), found even when the digits are spaced into groups.
3. **An amount** is the number next to a currency word (QAR, QR, «ريال», «ر.ق»), else the only
   number left. Two numbers left and neither next to a currency word is a question, never a
   guess.
4. What is left is words: after "for" or «عن»/«مقابل» is what it is for; after "to"/"from" or
   «إلى»/«من» is who. With no such word the words before the amount are the person and the words
   after it are what it is for (the order Arabic speakers write it). Where that cannot be
   known (`ambiguous`) the caller decides by looking at who the shop's customers are. A phone
   number written right after some words settles it: those words are the person.

Nothing is guessed that the shop's own records cannot settle, and nothing here touches the
database. Money is whole minor units; there is no float.
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from alyr.core.normalise import has_arabic, western_digits
from alyr.modules.items import text

# ── the words ────────────────────────────────────────────────────────────────────────────


def _set(*words: str) -> frozenset[str]:
    return frozenset(text.fold(w) for w in words)


INVOICE_VERBS = _set("invoice", "inv", "bill", "فاتورة", "فاتوره", "فاتوره")
RECEIPT_VERBS = _set("receipt", "إيصال", "ايصال", "وصل", "إيصالا", "ايصالا")
# Words that may come before the verb: "please make an invoice".
LEAD_IN = _set("please", "pls", "plz", "make", "create", "issue", "send", "new", "an", "a", "the",
               "اصدر", "أصدر", "اعمل", "سوي", "سوّي", "انشئ", "أنشئ", "ارسل", "أرسل", "لو", "سمحت",
               "من فضلك", "فضلك", "ممكن", "يا", "الرجاء", "رجاء")
PAID_VERBS = _set("paid", "pay", "pays", "payment", "received", "receive", "collected", "دفع",
                  "دفعت", "يدفع", "سدد", "سددت", "استلمت", "استلم", "قبضت", "قبض", "دفعة")
DESCRIPTION_MARKS = _set("for", "about", "regarding", "عن", "مقابل", "لقاء", "بخصوص",
                         "بسبب")
NAME_MARKS = _set("to", "from", "إلى", "الى", "من", "عند")
CURRENCY = _set("qar", "qr", "qatari", "riyal", "riyals", "ريال", "ريالات", "ريالا", "رق")
POLITE = _set("please", "pls", "plz", "thanks", "thank", "you", "now", "ok", "okay", "شكرا",
              "شكراً", "لو", "سمحت", "فضلك", "الان", "الآن")
METHODS = {
    "cash": _set("cash", "نقد", "نقدا", "نقداً", "كاش", "نقدي"),
    "card": _set("card", "visa", "mastercard", "بطاقة", "بطاقه", "كرت", "فيزا", "شبكة", "شبكه"),
    "bank_transfer": _set("transfer", "bank", "تحويل", "حوالة", "حواله", "بنك"),
    "cheque": _set("cheque", "check", "شيك"),
}
METHOD_OF = {word: method for method, words in METHODS.items() for word in words}

MAX_AMOUNT_MINOR = 100_000_000 * 100  # a hundred million riyals: far above any real invoice

_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
_TOKEN = re.compile(r"(?P<num>\+?\d[\d,]*(?:\.\d+)?)|(?P<word>[^\W\d_][\w'’\-]*)")
_GAP_OK = re.compile(r"^[ \-]*$")


@dataclass
class Quick:
    kind: str                       # invoice | receipt
    amount_minor: int | None = None
    phone: str = ""                 # as typed, digits only
    name: str = ""
    description: str = ""
    method: str = ""                # cash | card | bank_transfer | cheque (receipts)
    paid: bool = False              # said as "Ahmed paid 500": a receipt for money received
    lang: str = "en"
    # "swap": the words before and after the amount could be the person and the reason either
    # way round; "lone": there is one such segment and it may be either. The caller settles it
    # by asking whether a customer has that name.
    ambiguous: str = ""
    lone: str = ""
    # Reasons the sentence cannot be used as it stands: "amount" (none found), "amount_many"
    # (two numbers and none next to a currency word), "amount_decimals", "amount_big".
    problems: list[str] = field(default_factory=list)
    numbers: list[str] = field(default_factory=list)  # the numbers that were left, for the question


# ── reading ──────────────────────────────────────────────────────────────────────────────


@dataclass
class _Tok:
    kind: str       # num | word
    value: str
    start: int
    end: int
    plus: bool = False


def _tokens(raw: str) -> list[_Tok]:
    out = []
    for m in _TOKEN.finditer(raw):
        if m.group("num"):
            value = m.group("num")
            out.append(_Tok("num", value.lstrip("+").rstrip(","), m.start(), m.end(),
                            value.startswith("+")))
        else:
            out.append(_Tok("word", m.group("word"), m.start(), m.end()))
    return out


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value)


def _phone_slice(toks: list[_Tok], raw: str, blocked: set[int]) -> tuple[int, int] | None:
    """The run of number tokens that is a phone number: [first, last] token indexes."""
    best: tuple[tuple[int, int, int], tuple[int, int]] | None = None
    n = len(toks)

    def plain(k: int) -> bool:
        return toks[k].kind == "num" and k not in blocked and "." not in toks[k].value \
            and "," not in toks[k].value

    for i in range(n):
        if not plain(i):
            continue
        digits = ""
        for j in range(i, n):
            if not plain(j) or (j > i and not _GAP_OK.match(raw[toks[j - 1].end:toks[j].start])):
                break
            digits += _digits(toks[j].value)
            if len(digits) > 15:
                break
            score = 0
            if digits.startswith("974") and 11 <= len(digits) <= 12:
                score = 3                                   # the country code, then eight digits
            elif digits.startswith("00974") and 13 <= len(digits) <= 14:
                score = 3
            elif toks[i].plus and not digits.startswith("974") and 10 <= len(digits) <= 15:
                score = 3                                   # +, so it is meant as international
            elif len(digits) == 8 and digits[0] in "34567":
                score = 2                                   # a Qatar number as people write it
            elif len(digits) == 8:
                score = 1
            # The best-fitting reading wins; of two as good, the one that starts first.
            key = (score, -i, len(digits))
            if score and (best is None or key > best[0]):
                best = (key, (i, j))
    return best[1] if best else None


def _amount(value: str) -> int | None | str:
    """A written amount as minor units: an int, None if it is not a number, or the reason."""
    plain = value
    if re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", plain):
        plain = plain.replace(",", "")
    elif "," in plain:
        plain = plain.replace(",", ".") if re.fullmatch(r"\d+,\d{1,2}", plain) else plain
    try:
        number = Decimal(plain)
    except InvalidOperation:
        return None
    if number != number.quantize(Decimal("0.01")):
        return "amount_decimals"
    minor = int(number * 100)
    if minor <= 0:
        return None
    if minor > MAX_AMOUNT_MINOR:
        return "amount_big"
    return minor


def parse(message: str, *, allow_paid: bool = True) -> Quick | None:
    """The invoice or receipt a message asks for, or None if it is not one. `allow_paid` is
    False in a shop whose credit ledger reads "Ahmed paid 200" as a payment on an account."""
    raw = western_digits(message or "").replace("ر.ق", " qar ").replace("ـ", "")
    raw = " ".join(raw.split())
    if not raw:
        return None
    toks = _tokens(raw)
    words = [(i, text.fold(t.value)) for i, t in enumerate(toks) if t.kind == "word"]
    if not words:
        return None

    # 1. is it ours? the verb, after any polite lead-in
    kind, verb_at, paid = "", -1, False
    for i, word in words:
        if word in LEAD_IN:
            continue
        if word in INVOICE_VERBS:
            kind, verb_at = "invoice", i
        elif word in RECEIPT_VERBS:
            kind, verb_at = "receipt", i
        break
    if not kind:
        if not allow_paid:
            return None
        first_paid = next((i for i, w in words if w in PAID_VERBS), None)
        has_number = any(t.kind == "num" for t in toks)
        if first_paid is None or not has_number:
            return None
        kind, paid = "receipt", True
    elif kind == "receipt":
        paid = True  # a receipt is always for money received
    lang = "ar" if has_arabic(raw) else "en"
    quick = Quick(kind, lang=lang, paid=paid)

    removed: set[int] = {verb_at} if verb_at >= 0 else set()

    # 2. the phone number (before the currency words: "55512345 QR 80" has a currency word
    # beside the phone and beside the amount)
    span = _phone_slice(toks, raw, set())
    if span is not None:
        quick.phone = "".join(_digits(toks[k].value) for k in range(span[0], span[1] + 1))
        removed.update(range(span[0], span[1] + 1))

    # 3. the currency words mark the number beside them as the amount
    marked: set[int] = set()
    for i, t in enumerate(toks):
        if t.kind == "word" and text.fold(t.value) in CURRENCY:
            removed.add(i)
            for j in (i - 1, i + 1):
                if 0 <= j < len(toks) and toks[j].kind == "num" and j not in removed:
                    marked.add(j)

    # 4. the amount
    left = [i for i, t in enumerate(toks) if t.kind == "num" and i not in removed]
    pick = [i for i in left if i in marked] or left
    quick.numbers = [toks[i].value for i in pick]
    amount_at = -1
    if not pick:
        quick.problems.append("amount")
    elif len(pick) > 1 and not [i for i in left if i in marked]:
        quick.problems.append("amount_many")
    else:
        amount_at = pick[0]
        value = _amount(toks[amount_at].value)
        if isinstance(value, str):
            quick.problems.append(value)
        elif value is None:
            quick.problems.append("amount")
        else:
            quick.amount_minor = value
        removed.add(amount_at)
        removed.update(i for i in pick[1:] if i in marked)

    # 5. the words
    before: list[str] = []          # no mark, before the amount
    after: list[str] = []           # no mark, after it
    named: list[str] = []           # after "to" / «إلى»
    why_before: list[str] = []      # after "for" / «عن», before the amount
    why_after: list[str] = []       # after "for" / «عن», after the amount
    mode = ""
    for i, t in enumerate(toks):
        if t.kind != "word" or i in removed:
            if i == amount_at and mode in ("name", "desc"):
                mode = "after"          # a mark's reach ends at the amount
            continue
        word = text.fold(t.value)
        if i == verb_at:
            continue
        if word in LEAD_IN and not (before or named or why_before or why_after):
            continue
        if word in PAID_VERBS and (paid or kind == "receipt"):
            continue
        if kind == "receipt" and word in METHOD_OF:
            quick.method = quick.method or METHOD_OF[word]
            continue
        if word in POLITE:
            continue
        if word in DESCRIPTION_MARKS:
            mode = "desc"
            continue
        if word in NAME_MARKS:
            mode = "name"
            continue
        past = amount_at >= 0 and i > amount_at
        if mode == "desc":
            (why_after if past else why_before).append(t.value)
        elif mode == "name":
            named.append(t.value)
        else:
            (after if past else before).append(t.value)
    join = " ".join

    if named:
        quick.name = join(named)
        quick.description = join([*why_before, *why_after]) or join([*before, *after])
    elif why_before and why_after:
        # "invoice for Ahmed 75 for a key": the first "for" is the person.
        quick.name = join(why_before)
        quick.description = join(why_after)
    elif why_before or why_after:
        quick.name = join(before or after)
        quick.description = join([*why_before, *why_after])
        if before and after:
            quick.description = join([*why_before, *why_after, *after])
        elif quick.name:
            # "Ahmed 500 for AC repair" and "AC repair 500 for Ahmed" are both said: "for" does
            # not tell the person from the reason, so the caller looks at who the customers are.
            quick.ambiguous = "swap"
        if not quick.name:
            quick.lone, quick.description, quick.ambiguous = quick.description, "", "lone"
    elif before and after:
        quick.name, quick.description = join(before), join(after)
        quick.ambiguous = "swap"
    elif before or after:
        quick.lone = join(before or after)
        quick.ambiguous = "lone"
        if kind == "receipt":           # a receipt is about a person: "receipt Ahmed 500 cash"
            quick.name, quick.lone, quick.ambiguous = quick.lone, "", ""
    if span is not None and quick.ambiguous == "swap" and (why_before or why_after):
        _by_the_phone(quick, toks, span)     # only where "for" left it open, not the plain order
    quick.name = quick.name.strip(" ,.;:-")
    quick.description = quick.description.strip(" ,.;:-")
    quick.lone = quick.lone.strip(" ,.;:-")
    return quick


def _by_the_phone(quick: Quick, toks: list[_Tok], span: tuple[int, int]) -> None:
    """People write a name and then the number: the words just before a phone number are the
    person, and the other words are what it is for: "AC repair 500 for Ahmed 5551 2345" is
    settled without a look at the customers. Only where "for" left it open: in the plain order
    ("Ahmed 500 AC repair 5551 2345", «محمد 250 صيانة 55566123») the person is who comes first,
    and a number after the amount says nothing about the order."""
    k = span[0] - 1
    if not 0 <= k < len(toks) or toks[k].kind != "word":
        return
    word = toks[k].value
    in_name = word in quick.name.split()
    in_what = word in quick.description.split()
    if in_name != in_what:
        if in_what:
            quick.name, quick.description = quick.description, quick.name
        quick.ambiguous = ""
