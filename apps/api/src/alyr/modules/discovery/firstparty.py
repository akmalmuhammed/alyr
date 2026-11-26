"""First-party checks: what only ALYR can know (Discovery 2.0, workstream C).

Google sees a shop's listing; it does not see the shop's orders, bookings, pages or the WhatsApp
number the shop confirmed. ALYR holds all four, so these checks set what the public pages say
against what the shop's own records show:

* `hours_vs_activity`: the listing (or the website) shows the shop closed on a weekday, or closing
  earlier, while ALYR holds orders or bookings in that window on at least 3 of the last 4 such days;
* `own_links_present`: the listing and the website carry the shop's own ALYR booking and order
  pages and a WhatsApp link to its number;
* `whatsapp_number_mismatch`: a WhatsApp link shown in public points to another number;
* `bilingual_name_rule`: the listing's name repeats the business name in Arabic and English, which
  Google's guidelines no longer allow (August 2026);
* `season_due`: Ramadan, Eid or National Day is close, so the owner is asked for their hours.

`first_party_facts` reads what the rules need, once per run, through the tenant's own connection
(row-level security): **counts only**, by day and hour, never a customer, a name or a message. The
rules are pure functions of `ctx.first_party`; each answers pass, fail with its evidence, or
`not_measured`, and never fires on missing data (`rules.py`). A proposal's "after" is never taken
from here: hours come only from what the owner confirmed (`facts.py`), so a finding without
confirmed hours asks for them.

Words are in `words_firstparty.py`. The engine (workstream B) puts the facts on
`Context.first_party` and adds `FIRSTPARTY_RULES` to the packs; this file edits neither.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from urllib.parse import urlsplit
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.core.normalise import has_arabic, western_digits
from alyr.modules.discovery.connectors.base import DAYS, Hours, hours_from_json
from alyr.modules.discovery.rules import (
    FAIL,
    NOT_MEASURED,
    PASS,
    Context,
    Evidence,
    Outcome,
    Rule,
    digits,
    hours_text,
    name_key,
    open_days,
    whatsapp_digits,
)

WEEKS = 4  # how far back activity is counted
NEEDED_DAYS = 3  # of those 4 same weekdays, how many must show activity outside the hours
# Bookings that happened (or were due and not marked) count; a cancelled one does not.
BOOKING_STATES = ("booked", "completed", "no_show")


class FirstPartyError(Exception):
    """A caller passed a connection that is not scoped to the business it asked about."""


# ── the facts ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class DayActivity:
    """One day in the shop's time zone: how many orders were placed and how many bookings started
    in each hour (0 to 23). `None`: that product is not switched on, so nothing was counted."""

    day: date
    orders: Mapping[int, int] | None
    bookings: Mapping[int, int] | None

    @property
    def weekday(self) -> str:
        return DAYS[(self.day.weekday() + 1) % 7]


@dataclass(frozen=True)
class OwnLinks:
    """The shop's own public pages on ALYR, and its WhatsApp link. `None`: it has none."""

    booking: str | None
    order: str | None
    whatsapp: str | None


@dataclass(frozen=True)
class Season:
    """A date the shop's hours often change around. `expected` is the first day as published in
    advance (an astronomical calendar for the Hijri ones); ALYR staff set `announced` (the day the
    official date was announced) and `confirmed` (the official first day) when it is announced.

    `lead_days`: ask this many days before the expected day; `None`: ask only on announcement.
    `fixed`: the date does not move (National Day)."""

    key: str
    expected: date
    lead_days: int | None
    fixed: bool = False
    announced: date | None = None
    confirmed: date | None = None

    @property
    def start(self) -> date:
        return self.confirmed or self.expected

    def due(self, today: date) -> bool:
        before = (self.lead_days is not None
                  and self.expected - timedelta(days=self.lead_days) <= today <= self.expected)
        on_announcement = self.announced is not None and self.announced <= today <= self.start
        return before or on_announcement

    def state(self) -> str:
        if self.fixed:
            return "fixed"
        return "announced" if self.announced is not None else "expected"


# ALYR's calendar (DECISIONS #14): Ramadan four weeks before its expected start and again when it is
# announced; Eid only when announced; National Day (18 December) three weeks before. ALYR never
# guesses a date: these are the dates published in advance, and staff correct a row (set
# `announced` and `confirmed`) when the official date is announced. Expected Hijri dates are the
# Umm al-Qura calendar's, which the Qatar Calendar House's estimate for 1448 matches (checked
# 26 Nov 2026): 1 Ramadan 1448 on 8 Feb 2027, Eid al-Fitr on 9 Mar 2027, Eid al-Adha on
# 16 May 2027.
# TODO(B|D): a place to keep corrections without a release (the owner's own correction, staff's
# announced dates), from the reserved migrations; until then a correction is a change to this table.
SEASONS: tuple[Season, ...] = (
    Season("national_day", date(2026, 12, 18), 21, fixed=True),
    Season("ramadan", date(2027, 2, 8), 28),
    Season("eid_al_fitr", date(2027, 3, 9), None),
    Season("eid_al_adha", date(2027, 5, 16), None),
    Season("national_day", date(2027, 12, 18), 21, fixed=True),
)


@dataclass(frozen=True)
class FirstPartyFacts:
    """What only ALYR knows about a business, as the first-party rules read it. Counts only."""

    tenant_id: UUID | None
    timezone: str
    today: date  # in the shop's time zone
    # The first day ALYR has an order or a booking for (None: none at all). The 4 weeks are only
    # measured when this is on or before their first day.
    measured_from: date | None
    # Every day of the 4 weeks before `today`, oldest first; None when neither orders nor bookings
    # are switched on.
    activity: tuple[DayActivity, ...] | None
    links: OwnLinks
    whatsapp: str | None  # +974..., the number the business confirmed
    whatsapp_source: str | None  # owner, sample, shop_settings or meta
    name_en: str
    name_ar: str
    confirmed_hours: Mapping[UUID, Hours]  # place id -> the hours a person confirmed
    seasons: tuple[Season, ...]

    @property
    def window_start(self) -> date:
        return self.today - timedelta(days=WEEKS * 7)

    def on(self, weekday: str) -> list[DayActivity]:
        return [d for d in self.activity or () if d.weekday == weekday]


def _e164(value: str | None) -> str | None:
    """A stored number as +<country code><number>, or None. The order page's number is kept with
    its country code (`items.service.whatsapp_digits`); a Meta display number is written
    "+974 5555 0100"."""
    found = re.sub(r"\D", "", western_digits(value or ""))
    found = found[2:] if found.startswith("00") else found
    return f"+{found}" if 10 <= len(found) <= 15 else None


async def _counts(conn, sql: str, start: datetime, end: datetime, tz: str) -> dict:
    rows = await conn.fetch(
        f"select (at at time zone $3::text)::date as d, "
        f"extract(hour from at at time zone $3::text)::int as h, count(*)::int as n "
        f"from ({sql}) ev where at >= $1 and at < $2 group by 1, 2",
        start, end, tz,
    )
    found: dict[date, dict[int, int]] = {}
    for row in rows:
        found.setdefault(row["d"], {})[row["h"]] = row["n"]
    return found


_ORDERS = "select created_at as at from orders where not is_test and status <> 'cancelled'"
_BOOKINGS = (
    "select b.starts_at as at from bookings b join contacts c on c.id = b.contact_id "
    "where b.status = any('{booked,completed,no_show}'::text[]) "
    "and coalesce(c.wa_user_id, '') not like 'TEST.%'"
)


async def first_party_facts(
    conn: asyncpg.Connection, tenant_id: UUID, now: datetime, *, web_url: str | None = None
) -> FirstPartyFacts | None:
    """What the first-party rules need about one business, or None if there is no such business.

    `conn` must be the business's own connection (`db.tenant(tenant_id)`): every table read here is
    under row-level security, and a connection scoped to another business is refused rather than
    read. `tenants` and `channel_numbers` are shared tables, so they are read by this id."""
    scoped = await conn.fetchval("select nullif(current_setting('app.tenant_id', true), '')::uuid")
    if scoped != tenant_id:
        raise FirstPartyError("first_party_facts needs the business's own connection")
    shop = await conn.fetchrow(
        "select name, name_ar, slug, timezone from tenants where id = $1", tenant_id)
    if shop is None:
        return None
    if web_url is None:
        from alyr.config import get_settings

        web_url = get_settings().public_web_url
    web_url = web_url.rstrip("/")
    tz = shop["timezone"] or "Asia/Qatar"
    zone = ZoneInfo(tz)
    today = now.astimezone(zone).date()
    first = today - timedelta(days=WEEKS * 7)
    start, end = datetime.combine(first, time(), zone), datetime.combine(today, time(), zone)

    modules = {r["module_key"] for r in await conn.fetch(
        "select module_key from tenant_modules where enabled")}
    orders_on, bookings_on = "orders" in modules, "bookings" in modules
    orders = await _counts(conn, _ORDERS, start, end, tz) if orders_on else None
    bookings = await _counts(conn, _BOOKINGS, start, end, tz) if bookings_on else None
    activity = None
    if orders_on or bookings_on:
        activity = tuple(
            DayActivity(
                day,
                orders.get(day, {}) if orders is not None else None,
                bookings.get(day, {}) if bookings is not None else None,
            )
            for day in (first + timedelta(days=n) for n in range(WEEKS * 7))
        )
    firsts = []
    for on, sql in ((orders_on, _ORDERS), (bookings_on, _BOOKINGS)):
        if on:
            at = await conn.fetchval(f"select min(at) from ({sql}) ev")
            if at is not None:
                firsts.append(at.astimezone(zone).date())

    whatsapp, source = await _confirmed_whatsapp(conn, tenant_id)
    slug = shop["slug"]
    links = OwnLinks(
        f"{web_url}/b/{slug}" if slug and bookings_on else None,
        f"{web_url}/s/{slug}" if slug and orders_on else None,
        f"https://wa.me/{whatsapp[1:]}" if whatsapp else None,
    )
    hours = {
        r["location_id"]: hours_from_json(r["value"])
        for r in await conn.fetch(
            "select location_id, value from discovery_facts "
            "where key = 'hours' and source in ('owner', 'sample')")
    }
    return FirstPartyFacts(
        tenant_id, tz, today, min(firsts) if firsts else None, activity, links, whatsapp, source,
        shop["name"] or "", shop["name_ar"] or "", hours, SEASONS,
    )


async def _confirmed_whatsapp(conn, tenant_id: UUID) -> tuple[str | None, str | None]:
    """The business's confirmed WhatsApp number and where it came from, in this order: the number a
    person confirmed for Discovery (the primary place's first); the number the order page sends
    customers to; the number ALYR attached for the business on Meta."""
    fact = await conn.fetchrow(
        "select f.value->>'phone' as phone, f.source from discovery_facts f "
        "join discovery_locations l on l.id = f.location_id "
        "where f.key = 'whatsapp' and f.source in ('owner', 'sample') "
        "order by l.is_primary desc, l.position, l.created_at limit 1")
    if fact is not None and _e164(fact["phone"]):
        return _e164(fact["phone"]), fact["source"]
    shop = _e164(await conn.fetchval("select whatsapp_number from shop_settings"))
    if shop:
        return shop, "shop_settings"
    meta = _e164(await conn.fetchval(
        "select display_phone from channel_numbers where tenant_id = $1 and channel = 'meta' "
        "limit 1", tenant_id))
    return (meta, "meta") if meta else (None, None)


# ── reading the snapshot ──────────────────────────────────────────────────────────────────


def _fp(ctx: Context) -> FirstPartyFacts | None:
    # `Context.first_party` is added by workstream B; until then the attribute may be absent.
    return getattr(ctx, "first_party", None)


def number(value: str | None) -> str:
    """A phone number as `rules.digits` compares it, after Arabic-Indic digits become 0-9.
    TODO(A): use A's phone normalisation (`normalize.py`) once it is merged."""
    return digits(western_digits(value or ""))


def link_number(link: str) -> str:
    """The number a WhatsApp link points to, or a bare number as written, or ""."""
    text = western_digits(link or "")
    if "wa.me" in text or "phone=" in text:
        return whatsapp_digits(text.replace(" ", ""))
    return number(text) if re.fullmatch(r"[\d\s()+-]{6,}", text.strip()) else ""


def _listing(place):
    return place.listing if place is not None and place.listing.found else None


def _website(place):
    web = place.website if place is not None else None
    return web if web is not None and web.reachable is not False else None


def _all_outcomes(rule_id: str, ctx: Context, state: str = NOT_MEASURED) -> list[Outcome]:
    return [Outcome(rule_id, loc.id, state) for loc in ctx.locations]


# ── hours_vs_activity ─────────────────────────────────────────────────────────────────────


def _minutes(text: str) -> int:
    hour, minute = text.split(":")
    return int(hour) * 60 + int(minute)


def _outside(counts: Mapping[int, int] | None, span: tuple[str, str] | None) -> int | None:
    """How many fell in an hour that does not touch the listed hours at all (a closed day: all of
    them). An hour that partly overlaps counts as inside: the rule never fires on a few minutes."""
    if counts is None:
        return None
    if span is None:
        return sum(counts.values())
    opens, closes = _minutes(span[0]), _minutes(span[1])
    return sum(n for h, n in counts.items() if not (h * 60 < closes and (h + 1) * 60 > opens))


def _hours_vs_activity(ctx: Context) -> list[Outcome]:
    rule_id = "hours_vs_activity"
    fp = _fp(ctx)
    covered = (fp is not None and fp.activity is not None and fp.measured_from is not None
               and fp.measured_from <= fp.window_start)
    # Orders and bookings belong to the business, not to a branch: with several places none of
    # them can be said to be open when an order came in.
    if not covered or len(ctx.locations) != 1:
        return _all_outcomes(rule_id, ctx)
    loc = ctx.locations[0]
    place = ctx.snapshot.of(loc.id)
    sources = []
    listing, web = _listing(place), _website(place)
    if listing is not None and open_days(listing.hours):
        sources.append(("listing", listing.hours))
    if web is not None and open_days(web.hours):
        sources.append(("website", web.hours))
    if not sources:
        return [Outcome(rule_id, loc.id, NOT_MEASURED)]
    confirmed = open_days(fp.confirmed_hours.get(loc.id))
    evidence: list[Evidence] = []
    for where, hours in sources:
        days = open_days(hours)
        for weekday in DAYS:
            dated = fp.on(weekday)
            if len(dated) < WEEKS:
                continue
            span = days.get(weekday)
            if confirmed and confirmed.get(weekday) == span:
                continue  # the owner confirmed this day as the listing shows it
            seen = [(d, _outside(d.orders, span), _outside(d.bookings, span)) for d in dated]
            busy = [s for s in seen if (s[1] or 0) + (s[2] or 0) > 0]
            if len(busy) < NEEDED_DAYS:
                continue
            shown = "closed" if span is None else f"{span[0]}-{span[1]}"
            evidence.append(Evidence(f"fp_{where}_day", f"~fp_day:{weekday}:{shown}", where))
            for day, orders, bookings in seen:
                evidence.append(Evidence(
                    f"fp_outside_{where}",
                    f"~fp_act:{day.day.isoformat()}:{'-' if orders is None else orders}:"
                    f"{'-' if bookings is None else bookings}",
                    "alyr_records",
                ))
    if not evidence:
        return [Outcome(rule_id, loc.id, PASS)]
    # The value of a change comes only from hours a person confirmed; without them, the finding is
    # the question.
    hours = fp.confirmed_hours.get(loc.id)
    evidence.append(Evidence(
        "fp_confirmed_hours", hours_text(hours) if confirmed else "~fp_not_confirmed", "business"))
    return [Outcome(rule_id, loc.id, FAIL, tuple(evidence))]


# ── own_links_present ─────────────────────────────────────────────────────────────────────


def _host(netloc: str) -> str:
    host = netloc.lower().rsplit("@", 1)[-1].split(":", 1)[0]
    return host.removeprefix("www.")


def same_page(link: str, page: str) -> bool:
    """A link opens this page: the same host and path, whatever the scheme, query or last slash
    (a customer's own link carries a token, `?t=...`)."""
    try:
        a, b = urlsplit(link.strip()), urlsplit(page)
    except ValueError:
        return False
    if not a.netloc:
        a = urlsplit("//" + link.strip())
    return _host(a.netloc) == _host(b.netloc) and a.path.rstrip("/") == b.path.rstrip("/")


def _whatsapp_seen(listing, web) -> list[tuple[str, str, list[str] | None]]:
    """(where, label, the WhatsApp links or numbers shown there; None if not measured)."""
    out = []
    if listing is not None:
        shown = None if listing.whatsapp_link is None else [listing.whatsapp_link]
        out.append(("listing", "listing_whatsapp", shown))
    if web is not None:
        shown = None if web.whatsapp_link is None else [web.whatsapp_link]
        more = getattr(web, "whatsapp_links", None)  # TODO(E): every WhatsApp link on the pages
        if more is not None:
            shown = (shown or []) + list(more)
        out.append(("website", "website_whatsapp", shown))
    return out


def _own_links_present(ctx: Context) -> list[Outcome]:
    rule_id = "own_links_present"
    fp = _fp(ctx)
    expected = [] if fp is None else [
        (kind, url) for kind, url in (("booking", fp.links.booking), ("order", fp.links.order),
                                      ("whatsapp", fp.links.whatsapp)) if url
    ]
    if not expected:
        return _all_outcomes(rule_id, ctx)
    out = []
    for loc in ctx.locations:
        place = ctx.snapshot.of(loc.id)
        listing, web = _listing(place), _website(place)
        whatsapp = {where: shown for where, _, shown in _whatsapp_seen(listing, web)}
        # TODO(E): `Website.links`, every link on the owner's pages; a listing source that reports
        # the links it shows (booking, order, chat) sets `Listing.links`. Absent: not measured.
        sources = [(where, getattr(src, "links", None)) for where, src in
                   (("listing", listing), ("website", web)) if src is not None]
        measured, missing = False, []
        for where, links in sources:
            for kind, url in expected:
                if kind == "whatsapp":
                    shown = whatsapp.get(where)
                    if shown is None and links is None:
                        continue
                    measured = True
                    numbers = [link_number(s) for s in (shown or [])]
                    numbers += [link_number(s) for s in (links or []) if "wa.me" in s]
                    if any(numbers):
                        continue  # present; a link to another number is the number check's
                    missing.append((kind, where))
                elif links is not None:
                    measured = True
                    if not any(same_page(link, url) for link in links):
                        missing.append((kind, where))
        if not measured:
            out.append(Outcome(rule_id, loc.id, NOT_MEASURED))
            continue
        if not missing:
            out.append(Outcome(rule_id, loc.id, PASS))
            continue
        evidence = [Evidence(f"fp_{kind}_link", "~fp_missing", where) for kind, where in missing]
        urls = dict(expected)
        for kind in dict.fromkeys(kind for kind, _ in missing):
            evidence.append(Evidence(f"fp_expected_{kind}", urls[kind], "alyr_pages"))
        out.append(Outcome(rule_id, loc.id, FAIL, tuple(evidence)))
    return out


# ── whatsapp_number_mismatch ──────────────────────────────────────────────────────────────


def _whatsapp_number_mismatch(ctx: Context) -> list[Outcome]:
    rule_id = "whatsapp_number_mismatch"
    fp = _fp(ctx)
    mine = number(fp.whatsapp) if fp is not None else ""
    if not mine:
        return _all_outcomes(rule_id, ctx)
    out = []
    for loc in ctx.locations:
        place = ctx.snapshot.of(loc.id)
        shown = []
        for where, label, links in _whatsapp_seen(_listing(place), _website(place)):
            for link in dict.fromkeys(links or ()):
                found = link_number(link)
                if found:
                    shown.append((label, link, where, found))
        if not shown:
            out.append(Outcome(rule_id, loc.id, NOT_MEASURED))  # no number shown to compare
            continue
        wrong = [Evidence(label, link, where) for label, link, where, found in shown
                 if found != mine]
        if not wrong:
            out.append(Outcome(rule_id, loc.id, PASS))
            continue
        wrong.append(Evidence("fp_confirmed_whatsapp", fp.whatsapp or "", "business"))
        out.append(Outcome(rule_id, loc.id, FAIL, tuple(wrong)))
    return out


# ── bilingual_name_rule ───────────────────────────────────────────────────────────────────

_SEPARATORS = re.compile(r"[/|·\-–—()\[\]{},،؛:]+")
_MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")  # marks, tatweel
_ARABIC_FORMS = str.maketrans("أإآٱىةؤئ", "اااايهوي")
_LATIN = re.compile(r"[A-Za-z]")


def arabic_key(text: str) -> str:
    """An Arabic name for comparing: no diacritics or tatweel, one form of alef, ة as ه, ى as ي,
    no spaces or punctuation, no trailing ذ.م.م.
    TODO(A): use A's Arabic normalisation (`normalize.py`) once it is merged."""
    text = _MARKS.sub("", text).translate(_ARABIC_FORMS)
    text = re.sub(r"[^\w]|[A-Za-z0-9_]", "", text)
    return text.removesuffix("ذمم")


def latin_key(text: str, area: str = "") -> str:
    return name_key(_SEPARATORS.sub(" ", text), area)


def scripts(name: str) -> tuple[str, str]:
    """The Latin words of a name and its Arabic words, each in order."""
    words = _SEPARATORS.sub(" ", name).split()
    arabic = " ".join(w for w in words if has_arabic(w))
    latin = " ".join(w for w in words if not has_arabic(w) and _LATIN.search(w))
    return latin, arabic


def _matches(part: str, names: list[str]) -> str | None:
    """The confirmed name `part` starts with (a branch may follow it), or None."""
    for name, key in names:
        if key and len(key) >= 3 and part.startswith(key):
            return name
    return None


def _bilingual_name_rule(ctx: Context) -> list[Outcome]:
    rule_id = "bilingual_name_rule"
    fp = _fp(ctx)
    if fp is None:
        return _all_outcomes(rule_id, ctx)
    out = []
    for loc in ctx.locations:
        listing = _listing(ctx.snapshot.of(loc.id))
        if listing is None or not listing.name:
            out.append(Outcome(rule_id, loc.id, NOT_MEASURED))
            continue
        latin, arabic = scripts(listing.name)
        if not latin or not arabic:
            out.append(Outcome(rule_id, loc.id, PASS))
            continue
        english = [(n, latin_key(n, loc.area)) for n in dict.fromkeys((fp.name_en, loc.name))
                   if n and _LATIN.search(n)]
        arabic_names = [(n, arabic_key(n)) for n in dict.fromkeys((fp.name_ar, loc.name_ar))
                        if n and has_arabic(n)]
        en = _matches(latin_key(latin, loc.area), english)
        ar = _matches(arabic_key(arabic), arabic_names)
        if en is None or ar is None:
            # Two scripts, but not the business's two names: it may be a word in another
            # language, not a repeat. Not something to fire on.
            out.append(Outcome(rule_id, loc.id, NOT_MEASURED))
            continue
        out.append(Outcome(rule_id, loc.id, FAIL, (
            Evidence("listing_name", listing.name, "listing"),
            Evidence("fp_name_en", en, "business"),
            Evidence("fp_name_ar", ar, "business"),
        )))
    return out


# ── season_due ────────────────────────────────────────────────────────────────────────────


def _season_due(ctx: Context) -> list[Outcome]:
    rule_id = "season_due"
    fp = _fp(ctx)
    if fp is None:
        return [Outcome(rule_id, None, NOT_MEASURED)]
    today = fp.today
    # ALYR never guesses a date: with nothing ahead in the calendar, it cannot tell.
    if not any(s.start >= today for s in fp.seasons):
        return [Outcome(rule_id, None, NOT_MEASURED)]
    due = [s for s in fp.seasons if s.due(today)]
    if not due:
        return [Outcome(rule_id, None, PASS)]
    return [Outcome(rule_id, None, FAIL, tuple(
        Evidence("fp_season", f"~fp_season:{s.key}:{s.start.isoformat()}:{s.state()}",
                 "alyr_calendar")
        for s in due
    ))]


# Kinds are the owner's: none of these can be written by a connector yet. When workstream B wires
# `hours_vs_activity` into `rules.PROPOSES` as `("set_hours", "hours", "listing")`,
# `effective_kind` makes it `agent` wherever the connector can write hours.
FIRSTPARTY_RULES: tuple[Rule, ...] = (
    Rule("hours_vs_activity", "presence", "owner", "high", 2, _hours_vs_activity),
    Rule("own_links_present", "presence", "owner", "medium", 1, _own_links_present),
    Rule("whatsapp_number_mismatch", "whatsapp", "owner", "high", 2, _whatsapp_number_mismatch),
    Rule("bilingual_name_rule", "presence", "owner", "high", 2, _bilingual_name_rule),
    Rule("season_due", "presence", "owner", "medium", 1, _season_due),
)
RULE_BY_ID = {r.id: r for r in FIRSTPARTY_RULES}
