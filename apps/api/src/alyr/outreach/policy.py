"""Where ALYR may write, to whom, on what basis, and when (specs/065, "The country policy").

This file is the policy, in code, so a change is a pull request: reviewed and dated. Each row says
the country's lane (`allowed`, `consent_only`, `blocked`), the bases a contact may be written to on,
the highest autonomy level, the recipient's time zone, working days and hours, and whether free-mail
addresses are refused. A country that is not here is blocked.

Last reviewed 2 Nov 2026 (D-152). Our reading, not a lawyer's: Qatar and the GCC wait for ALY-51,
which is why they are capped at L1 (a person approves every message).
"""

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

ALLOWED, CONSENT_ONLY, BLOCKED = "allowed", "consent_only", "blocked"

BASES = (
    "published_business_contact", "existing_relationship", "referral", "opt_in", "inbound",
    "legitimate_interest", "conspicuous_publication",
)
# Bases that mean the person asked, or already knows us: free-mail addresses are allowed on these.
PERSONAL_OK = ("opt_in", "inbound", "existing_relationship")

FREE_MAIL = frozenset({
    "gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com",
    "msn.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com",
    "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com",
})

# Monday is 0.
SUN_THU = (6, 0, 1, 2, 3)
MON_FRI = (0, 1, 2, 3, 4)

GCC_BASES = ("published_business_contact", "existing_relationship", "referral", "opt_in", "inbound")
GB_BASES = ("legitimate_interest",) + GCC_BASES
EU_BASES = ("legitimate_interest", "opt_in", "inbound", "existing_relationship")


@dataclass(frozen=True)
class Country:
    code: str
    lane: str
    bases: tuple[str, ...]
    cap: int
    zone: str
    days: tuple[int, ...]
    opens: time
    closes: time
    refuse_free_mail: bool = True
    note: str = ""


def _row(code, lane, bases, cap, zone, days, opens, closes, note=""):
    return Country(code, lane, tuple(bases), cap, zone, days, opens, closes, True, note)


_EU_ZONES = {
    "AT": "Europe/Vienna", "BE": "Europe/Brussels", "BG": "Europe/Sofia", "HR": "Europe/Zagreb",
    "CY": "Asia/Nicosia", "CZ": "Europe/Prague", "DK": "Europe/Copenhagen",
    "EE": "Europe/Tallinn", "FI": "Europe/Helsinki", "FR": "Europe/Paris", "GR": "Europe/Athens",
    "HU": "Europe/Budapest", "IE": "Europe/Dublin", "LV": "Europe/Riga", "LT": "Europe/Vilnius",
    "LU": "Europe/Luxembourg", "MT": "Europe/Malta", "NL": "Europe/Amsterdam",
    "PL": "Europe/Warsaw", "PT": "Europe/Lisbon", "RO": "Europe/Bucharest",
    "SK": "Europe/Bratislava", "SI": "Europe/Ljubljana", "ES": "Europe/Madrid",
    "SE": "Europe/Stockholm",
    # The EEA outside the EU.
    "IS": "Atlantic/Reykjavik", "LI": "Europe/Vaduz", "NO": "Europe/Oslo",
}
EU = frozenset(_EU_ZONES) | {"DE", "IT"}

NINE, FIVE = time(9, 0), time(17, 0)
HALF_EIGHT, HALF_FOUR = time(8, 30), time(16, 30)

COUNTRIES: dict[str, Country] = {
    "QA": _row("QA", ALLOWED, GCC_BASES, 1, "Asia/Qatar", SUN_THU, HALF_EIGHT, HALF_FOUR),
    "SA": _row("SA", ALLOWED, GCC_BASES, 1, "Asia/Riyadh", SUN_THU, HALF_EIGHT, HALF_FOUR),
    "KW": _row("KW", ALLOWED, GCC_BASES, 1, "Asia/Kuwait", SUN_THU, HALF_EIGHT, HALF_FOUR),
    "BH": _row("BH", ALLOWED, GCC_BASES, 1, "Asia/Bahrain", SUN_THU, HALF_EIGHT, HALF_FOUR),
    "OM": _row("OM", ALLOWED, GCC_BASES, 1, "Asia/Muscat", SUN_THU, HALF_EIGHT, HALF_FOUR),
    "AE": _row("AE", ALLOWED, GCC_BASES, 1, "Asia/Dubai", MON_FRI, HALF_EIGHT, HALF_FOUR,
               "the UAE's working week has been Monday to Friday since 2022; to confirm"),
    "EG": _row("EG", ALLOWED, GCC_BASES, 1, "Africa/Cairo", SUN_THU, NINE, FIVE),
    "JO": _row("JO", ALLOWED, GCC_BASES, 1, "Asia/Amman", SUN_THU, NINE, FIVE),
    "GB": _row("GB", ALLOWED, GB_BASES, 2, "Europe/London", MON_FRI, NINE, FIVE,
               "corporate addresses only; a sole trader needs consent"),
    "US": _row("US", ALLOWED, GB_BASES, 3, "America/New_York", MON_FRI, NINE, FIVE),
    "CA": _row("CA", CONSENT_ONLY, ("conspicuous_publication", "existing_relationship", "opt_in",
                                    "inbound"), 1, "America/Toronto", MON_FRI, NINE, FIVE,
               "consent, or a conspicuous publication recorded"),
    "DE": _row("DE", CONSENT_ONLY, ("opt_in", "inbound", "existing_relationship"), 1,
               "Europe/Berlin", MON_FRI, NINE, FIVE),
    "IT": _row("IT", CONSENT_ONLY, ("opt_in", "inbound", "existing_relationship"), 1,
               "Europe/Rome", MON_FRI, NINE, FIVE),
    **{code: _row(code, ALLOWED, EU_BASES, 1, zone, MON_FRI, NINE, FIVE,
                  "legitimate interest needs the assessment's reference in the basis note")
       for code, zone in _EU_ZONES.items()},
}


def country(code: str) -> Country | None:
    return COUNTRIES.get((code or "").upper())


def lane(code: str) -> str:
    row = country(code)
    return row.lane if row else BLOCKED


def level(requested: int, code: str) -> int:
    """The level a sequence runs at: the lower of what was asked and the country's cap."""
    row = country(code)
    return 0 if row is None else max(0, min(requested, row.cap))


def free_mail(email: str) -> bool:
    return (email or "").rpartition("@")[2].lower() in FREE_MAIL


def basis_refusal(
    code: str, basis: str, basis_note: str, email: str, published_on_own_site: bool = False
) -> str:
    """Why this contact may not be written to, or '' when it may. A free-mail address is refused
    unless the person asked or knows us, or the business published it on its own website
    (founder, 2 Nov 2026: it is then the business's published contact, flagged for review)."""
    row = country(code)
    if row is None or row.lane == BLOCKED:
        return "country_blocked"
    if not basis:
        return "no_basis"
    if basis not in row.bases:
        return "basis_not_allowed"
    if basis == "legitimate_interest" and code.upper() in EU and not basis_note.strip():
        return "no_assessment_reference"
    if row.refuse_free_mail and free_mail(email) and basis not in PERSONAL_OK and not (
            published_on_own_site and basis == "published_business_contact"):
        return "free_mail"
    return ""


def _zone(row: Country) -> ZoneInfo:
    return ZoneInfo(row.zone)


def in_window(code: str, when: datetime) -> bool:
    row = country(code)
    if row is None:
        return False
    local = when.astimezone(_zone(row))
    return local.weekday() in row.days and row.opens <= local.time() < row.closes


def next_opening(code: str, when: datetime) -> datetime:
    """`when` if the recipient's office is open then, else the next time it opens."""
    row = country(code)
    if row is None:
        raise ValueError("no policy for this country")
    if in_window(code, when):
        return when
    local = when.astimezone(_zone(row))
    day = local.date()
    for _ in range(15):
        if day.weekday() in row.days:
            opening = datetime.combine(day, row.opens, _zone(row))
            if opening > local:
                return opening
        day += timedelta(days=1)
    raise ValueError("no working day in two weeks")


def after_working_days(code: str, start: datetime, days: int) -> datetime:
    """The first opening `days` working days after `start`, in the recipient's calendar."""
    row = country(code)
    if row is None:
        raise ValueError("no policy for this country")
    local = start.astimezone(_zone(row))
    day, counted = local.date(), 0
    while counted < days:
        day += timedelta(days=1)
        if day.weekday() in row.days:
            counted += 1
    return next_opening(code, datetime.combine(day, row.opens, _zone(row)))
