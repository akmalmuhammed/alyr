"""Reading names and numbers the way a person in the Gulf writes them (Discovery 2.0, research R3).

Discovery's rules compare what one place says with what another says: the phone on the listing
with the phone on the website, the name of one branch with the name of another. Before this, an
Arabic-Indic digit, a UAE number written two ways, the Arabic legal suffix «ذ.م.م» or a hamza on an
alef made the same fact look like two, and a rule fired on it. This file is the one place those are
folded; `rules.py` calls it.

* **Digits.** Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits are read as 0-9.
* **Phone numbers** are parsed with `phonenumbers` (Apache-2.0, Google's libphonenumber), Qatar by
  default, so "+974 5555 0101", "00974 55550101", "5555 0101" and «٥٥٥٥٠١٠١» are one number, and a
  GCC number in any format is itself. When one side carries a country code and the other does not,
  the other is read in that country. Something that is not a number is "" (not measured), never a
  conflict. Whether a number is *valid* is not asked: the library's ranges trail new Qatar numbers
  by weeks, and a real number must not read as a wrong one.
* **Names** (`name_key`): Unicode compatibility forms, no tashkeel or tatweel, أ إ آ ٱ as ا, ى as ي,
  ة as ه, the Arabic legal suffixes («ذ.م.م», «ش.ذ.م.م», «ذات مسؤولية محدودة») and the Latin ones
  (W.L.L., LLC, Co., Ltd) dropped, "El" read as "Al", then no spaces or punctuation, so "Al-Noor",
  "Al Noor" and "AL NOOR W.L.L." are one key.
* **Two names are one name** (`same_name`) when their keys are equal, or close enough by
  `rapidfuzz` (MIT): a similarity of `SAME_NAME_AT` (90 of 100, about one letter in ten), or, for
  Latin letters only, `SAME_SOUND_AT` (75) when the consonants are the same ("Al-Noor" and
  "Al Nour", "Mohammed" and "Muhammad": the vowels of a name written from Arabic vary, its
  consonants do not). Names are only compared inside one script: an Arabic name and an English one
  are `None`, not measured, never a difference. There is no open-source matcher for that, and a
  guess would be a finding nobody can check (R3, section 2.2).
"""

import re
import unicodedata

import phonenumbers
from rapidfuzz import fuzz

DEFAULT_REGION = "QA"

# A similarity (0 to 100, `rapidfuzz.fuzz.ratio` of the two keys) at or above which two names are
# one: "Al Rayyan Sweets" and "Al Rayan Sweets" (96); not "Point Car Care" and "Point Car Wash"
# (75).
SAME_NAME_AT = 90
# For Latin names whose consonants are the same, in the same order, and at least three: the lower
# similarity at which they are one name. "Al-Noor" and "Al Nour" (83), "Mohammed Trading" and
# "Muhammad Trading" (87); not "Ali" and "Alia" (one consonant), not "Al Noor" and "Al Nasr".
SAME_SOUND_AT = 75
SOUND_MIN_CONSONANTS = 3

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
# Fatha to sukun, shadda, the dagger alef; and tatweel.
_MARKS = re.compile("[ً-ْٰـ]")
_ALEF = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه"})
_AR_LETTER = "ء-يٮ-ۓ"
_AR_LEGAL = re.compile(
    rf"(?<![{_AR_LETTER}])(?:ش[\s.]*)?ذ[\s.]+م[\s.]+م\.?(?![{_AR_LETTER}])"
    r"|ذات\s+مسؤولي[هة]\s+محدود[هة]"
    rf"|(?<![{_AR_LETTER}])(?:شركه|مؤسسه)(?![{_AR_LETTER}])"
)
_LATIN_LEGAL = re.compile(r"\b(w\.?\s?l\.?\s?l\.?|l\.?l\.?c\.?|co\.?|ltd\.?|company)\b", re.I)
_EL = re.compile(r"\bel(?=[\s\-‐]+\w)", re.I)
_ARTICLES = {"al", "el", "ال"}


def ascii_digits(text: str) -> str:
    """Arabic-Indic and Extended Arabic-Indic digits as 0-9; everything else as it was."""
    return text.translate(_DIGITS)


# ── phone numbers ─────────────────────────────────────────────────────────────────────────


def _parse(value: str | None, region: str) -> phonenumbers.PhoneNumber | None:
    text = ascii_digits(value or "").strip()
    if not re.search(r"\d", text):
        return None
    try:
        number = phonenumbers.parse(text, region)
    except phonenumbers.NumberParseException:
        return None
    return number if phonenumbers.is_possible_number(number) else None


def region_of(value: str | None) -> str | None:
    """The country a number names by its own code ("+971 ..." is AE), or None when it has none."""
    text = ascii_digits(value or "").strip()
    if not (text.startswith("+") or re.sub(r"[^\d]", "", text).startswith("00")):
        return None
    number = _parse(text, DEFAULT_REGION)
    if number is None:
        return None
    return phonenumbers.region_code_for_number(number) or None


def phone_key(value: str | None, region: str = DEFAULT_REGION) -> str:
    """A phone number as its international digits ("97455550101"), read in `region` when it has no
    country code; "" when it is not a number (not measured)."""
    number = _parse(value, region)
    if number is None:
        return ""
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164).lstrip("+")


def same_phone(a: str | None, b: str | None) -> bool | None:
    """Whether two written numbers are one number; None when either is not a number. A side without
    a country code is read in the country of the other side, else in Qatar."""
    region = region_of(a) or region_of(b) or DEFAULT_REGION
    ka, kb = phone_key(a, region), phone_key(b, region)
    if not ka or not kb:
        return None
    return ka == kb


# ── names ─────────────────────────────────────────────────────────────────────────────────


def fold(text: str) -> str:
    """Arabic letters as one spelling: compatibility forms, Western digits, no tashkeel or
    tatweel, one alef, ي for ى and ه for ة. Latin letters are left as they were."""
    text = unicodedata.normalize("NFKC", text or "")
    return _MARKS.sub("", ascii_digits(text)).translate(_ALEF)


def name_key(name: str, area: str = "") -> str:
    """A business name for comparing: folded, lower case, no legal suffix (W.L.L., «ذ.م.م»), no
    branch part after a dash or bar, no words of its area, "El" as "Al", no punctuation and no
    spaces ("Car Care" and "Carcare", «ال نور» and «النور» are one spelling)."""
    text = re.split(r"\s[-–—|]\s", fold(name), maxsplit=1)[0]
    text = _AR_LEGAL.sub(" ", text)
    text = _LATIN_LEGAL.sub(" ", text.casefold())
    text = _EL.sub("al", text)
    for word in re.findall(r"\w+", fold(area).casefold()):
        if word not in _ARTICLES:  # "Al" of "Al Sadd" is not a word of the name to drop
            text = re.sub(rf"\b{re.escape(word)}\b", " ", text)
    return re.sub(r"[\W_]+", "", text)


def script_of(text: str) -> str:
    """"ar" or "latin", by which letters it has more of; "" when it has none."""
    arabic = len(re.findall(f"[{_AR_LETTER}]", text or ""))
    latin = sum(1 for ch in text or "" if ch.isalpha() and ch.isascii())
    if not arabic and not latin:
        return ""
    return "ar" if arabic > latin else "latin"


def _consonants(key: str) -> str:
    return re.sub(r"(.)\1+", r"\1", re.sub(r"[aeiouy]", "", key))


def same_name(a: str, b: str, area_a: str = "", area_b: str = "") -> bool | None:
    """Whether two written names are one name; None when either has no letters, or one is Arabic
    and the other Latin (not measured: never a difference)."""
    ka, kb = name_key(a or "", area_a), name_key(b or "", area_b)
    script = script_of(ka)
    if not ka or not kb or not script or script != script_of(kb):
        return None
    if ka == kb:
        return True
    score = fuzz.ratio(ka, kb)
    if score >= SAME_NAME_AT:
        return True
    if script == "latin" and score >= SAME_SOUND_AT:
        ca, cb = _consonants(ka), _consonants(kb)
        return ca == cb and len(ca) >= SOUND_MIN_CONSONANTS
    return False
