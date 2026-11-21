"""A customer's "thanks" or "ok" is not a question (the first client's audit, T10).

After a confirmation, a reminder or a link, customers answer "thank you", "ok" or «شكراً». Nothing
asked for those, and the chat answered each with the welcome menu again. `is_thanks` says when a
message is only that, so the router can leave it alone: the conversation stays as it is for a person
to read, and nobody is sent anything.

Two kinds count. A message with a thank-you word that asks nothing, however it goes on ("thank you
for the appointment", «شكراً على الموعد»); and a message of one to three words that are only an
"ok" ("ok", "okay great", «تمام»). A message that thanks and also asks ("thanks, can I book
again?") is not a pleasantry: a word that wants something is in it. Words are folded as
`items.text.fold` does (one spelling for each Arabic letter, no marks). The Arabic is a draft until
the native review (ALY-66).
"""

import re

from alyr.modules.items.text import search_words

_THANKS = frozenset({
    "thanks", "thank", "thx", "ty", "tnx", "cheers", "appreciate", "appreciated",
    "شكرا", "مشكور", "مشكوره", "جزاك", "تسلم", "تسلمي", "يعطيك", "يعطيكم",
})

# Alone, or with another of these: an "ok".
_OK = frozenset({
    "ok", "okay", "okey", "k", "kk", "noted", "alright", "great", "perfect", "nice", "cool",
    "got", "it", "sure", "bye", "goodbye",
    "تمام", "اوكي", "اوك", "ماشي", "طيب", "زين", "حاضر", "ممتاز", "باي",
    "\U0001f44d", "\U0001f44c", "\U0001f64f", "❤", "\U0001f60a",
})

# A word that wants something done: a question word, a request, a verb about a booking, a "no".
_ASKS = frozenset({
    "can", "could", "would", "want", "need", "how", "when", "where", "what", "why", "who",
    "which", "do", "does", "did", "please", "pls", "book", "cancel", "change", "move",
    "reschedule", "price", "cost", "not", "no", "never", "late", "sorry", "problem", "wrong",
    "هل", "كيف", "متى", "وين", "اين", "ماذا", "ليش", "لماذا", "كم", "ممكن", "ابغى", "ابي",
    "اريد", "احتاج", "الغاء", "الغي", "تغيير", "احجز", "سعر", "لا", "ما", "مو", "مشكله",
    "غلط", "اسف", "متاخر",
})

_MAX_WORDS = 8
_QUESTION = re.compile(r"[?؟]")


def is_thanks(text: str) -> bool:
    """True when the message is only a thank-you or an "ok" and asks nothing."""
    if not text.strip() or _QUESTION.search(text):
        return False
    tokens = [t for t in (w.strip("!.،,؛") for w in search_words(text)) if t]
    if not tokens or len(tokens) > _MAX_WORDS or set(tokens) & _ASKS:
        return False
    if set(tokens) & _THANKS:
        return True
    return len(tokens) <= 3 and set(tokens) <= _OK
