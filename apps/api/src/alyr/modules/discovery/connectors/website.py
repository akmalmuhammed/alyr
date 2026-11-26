"""The `website` source: the business's own website, read the way a polite visitor reads it
(Discovery 2.0, workstream E; research R2 section 5A, R3 section 2.1).

The address is the one the owner gave for each place (`discovery_locations.website_url`, set on
the Places screen). Nothing else is ever fetched.

* **Only the owner's host.** A link or a redirect to another domain is never followed; the one
  allowance is the same name with or without `www.`. Every address is vetted the way a webhook's
  is (`connect/ssrf.py`: a public address, looked up and then connected to, so it cannot be aimed
  at ALYR's own network), and no proxy from the environment is used.
* **robots.txt first**, for ALYR's own agent ("ALYR-Discovery (+https://alyr.qa)"), with `protego`.
  A robots.txt that is missing (4xx) allows everything; one that errors (5xx) allows nothing
  (RFC 9309, 2.3.1). A path robots.txt refuses is not read.
* **Small and short.** At most 20 pages (the home page, then the contact, about, menu and services
  pages it links to, then other pages of the same host), 10 seconds a request, a minute a site,
  2 MB a page. Only GET, never a form.
* **What is read:** LocalBusiness JSON-LD and microdata (`extruct`: name, telephone, address,
  opening hours), `tel:` links, WhatsApp links (`wa.me`, `api.whatsapp.com/send`), whether the site
  answers on HTTPS, and opening hours written on the page, only when the writing is clear (a day or
  a range of days, then a time range with am or pm or a 24-hour clock, every day of the week said
  once). Anything else is "not measured".
* **Nothing else is kept.** No page text, no HTML: only the fields of `SiteWebsite`, and those only
  in the run's snapshot. What the rules keep as evidence is theirs (`rules.py`).
* **PageSpeed Insights** (Core Web Vitals) is an add-on, off unless `ALYR_DISCOVERY_PAGESPEED` is
  on and `ALYR_PAGESPEED_KEY` is set; off, `page_speed` is `None` (not measured). It sends Google
  the home page's public address and nothing about a person.

`None` keeps its meaning from `base.py`: not read, not measured. An empty value (`""`, `()`,
`False`) means the pages were read and it is not there, so a rule may fire on it. A page built by
script in the browser (an empty shell) is read, but its absence of a link says nothing, so it
stays `None`.
"""

import asyncio
import json
import os
import re
import time
import unicodedata
from dataclasses import dataclass, field, replace
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

import extruct
import httpx
import lxml.html
from lxml import etree
from protego import Protego

from alyr.modules.connect import ssrf
from alyr.modules.discovery.connectors.base import (
    DAYS,
    Hours,
    Listing,
    Location,
    PlaceSnapshot,
    RunContext,
    Snapshot,
    Website,
)

KIND = "website"
USER_AGENT = "ALYR-Discovery (+https://alyr.qa)"
AGENT_TOKEN = "ALYR-Discovery"
TIMEOUT_SECONDS = 10.0  # one request, connecting and reading
CONNECT_SECONDS = 3.0
SITE_SECONDS = 60.0  # one site, all its pages
RUN_SECONDS = 240.0  # every site of one check-up
MAX_PAGES = 20
MAX_PAGE_BYTES = 2_000_000
MAX_ROBOTS_BYTES = 500_000  # RFC 9309 asks a reader to take at least 500 KiB
MAX_REDIRECTS = 5
MAX_CRAWL_DELAY = 5.0  # a site that asks for more is read on its home page only
PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
PAGESPEED_SECONDS = 45.0  # Lighthouse runs a whole page load on Google's side

# Tests replace this with an httpx.MockTransport; nothing else should.
transport: httpx.AsyncBaseTransport | None = None
# Waiting between pages when a site's robots.txt asks for it; a test can make it instant.
sleep = asyncio.sleep


@dataclass(frozen=True)
class PageSpeed:
    """What PageSpeed Insights says about the home page, on a phone. `performance` is Lighthouse's
    score out of 100; the rest is field data from real visits (Chrome UX Report), `None` when Google
    has too few visits to say."""

    strategy: str
    performance: int | None = None
    lcp_ms: int | None = None
    cls: float | None = None
    inp_ms: int | None = None
    overall: str | None = None


@dataclass(frozen=True)
class SiteWebsite(Website):
    """The `Website` the rules read, plus what the own-website connector adds (CONTRACTS.md)."""

    https: bool | None = None
    robots_allowed: bool | None = None
    json_ld_local_business: bool | None = None
    json_ld_name: str | None = None
    json_ld_phone: str | None = None
    json_ld_hours: Hours | None = None
    json_ld_address: str | None = None
    # The WhatsApp numbers the site links to, digits as written (country code included).
    whatsapp_links: tuple[str, ...] | None = None
    hours_from: str | None = None  # "json_ld" or "page"
    pages_read: int = 0
    # The other domain the site sent ALYR to, not followed (its host name only).
    redirected_to: str | None = None
    page_speed: PageSpeed | None = None


# ── the connector ────────────────────────────────────────────────────────────────────────────


class WebsiteConnector:
    """Adds to a check-up what each place's own website says. Reads only; changes nothing (a
    change to a website is the owner's to make, DECISIONS.md 8)."""

    kind = KIND
    writes: frozenset[tuple[str, str]] = frozenset()
    undoable: frozenset[tuple[str, str]] = frozenset()

    async def snapshot(self, locations: list[Location], ctx: RunContext) -> Snapshot:
        places: list[PlaceSnapshot] = []
        read: dict[str, SiteFacts] = {}
        deadline = time.monotonic() + RUN_SECONDS
        for location in locations:
            url = (location.website_url or "").strip()
            if not url:
                continue
            key = site_key(url)
            if key not in read:
                if time.monotonic() >= deadline:
                    read[key] = SiteFacts(url)  # out of time: this one is not measured
                else:
                    read[key] = await read_site(url)
            places.append(PlaceSnapshot(location.id, Listing(found=None),
                                        read[key].for_location(location, url)))
        return Snapshot(KIND, ctx.now, places)

    @staticmethod
    def sentence(snapshot: Snapshot) -> str:
        """The run log's line for this step (English, like every step summary)."""
        sites: dict[str, int] = {}
        for place in snapshot.places:
            web = place.website
            if isinstance(web, SiteWebsite):
                sites[site_key(web.url)] = web.pages_read
        pages = sum(sites.values())
        return (f"Read {pages} {'page' if pages == 1 else 'pages'} of {len(sites)} "
                f"{'website' if len(sites) == 1 else 'websites'}.")


def merge(primary: Snapshot, extra: Snapshot) -> Snapshot:
    """The run's snapshot with what an added source read. The main source keeps its word: a place
    whose website it already describes (what staff recorded, say) keeps that; a place it left
    without one gets the added source's; a place it did not cover at all is added with no listing
    facts (every listing rule then says "not measured" for it)."""
    added = {p.location_id: p for p in extra.places}
    places = []
    for place in primary.places:
        more = added.pop(place.location_id, None)
        if more is not None and place.website is None and more.website is not None:
            place = replace(place, website=more.website)
        places.append(place)
    places.extend(added.values())
    return replace(primary, places=places)


# ── one site ─────────────────────────────────────────────────────────────────────────────────


@dataclass
class SiteFacts:
    """What one site said, before it is matched to a place."""

    url: str
    reachable: bool | None = None
    https: bool | None = None
    robots_allowed: bool | None = None
    redirected_to: str | None = None
    pages_read: int = 0
    script_built: bool = False  # the home page is an empty shell filled in by script
    business: "Business | None" = None
    tel: list[str] = field(default_factory=list)
    whatsapp: dict[str, str] = field(default_factory=dict)  # digits -> link as written
    page_hours: list[Hours | None] = field(default_factory=list)
    text: str = ""  # folded, only to look for the place's area; never kept
    page_speed: PageSpeed | None = None

    def for_location(self, location: Location, url: str) -> SiteWebsite:
        measured = self.pages_read > 0 and not self.script_built
        biz = self.business
        hours, hours_from = None, None
        if biz is not None and biz.hours is not None:
            hours, hours_from = biz.hours, "json_ld"
        elif self.pages_read and not self.script_built:
            weeks = [h for h in self.page_hours if h is not None]
            if weeks and all(w == weeks[0] for w in weeks):
                hours, hours_from = weeks[0], "page"
        phone = (biz.phone if biz and biz.phone else None) or (self.tel[0] if self.tel else None)
        if phone is None and measured:
            phone = ""
        link = _whatsapp_for(location, self.whatsapp)
        if link is None and measured:
            link = ""
        if biz is not None:
            local_business: bool | None = True
        else:
            local_business = False if measured else None
        numbers = tuple(self.whatsapp) if (self.whatsapp or measured) else None
        return SiteWebsite(
            url=url,
            reachable=self.reachable,
            has_location_page=None,  # never guessed from a crawl
            hours=hours,
            phone=phone,
            whatsapp_link=link,
            lists_location=_lists(location, self) if self.pages_read else None,
            https=self.https,
            robots_allowed=self.robots_allowed,
            json_ld_local_business=local_business,
            json_ld_name=biz.name if biz else None,
            json_ld_phone=biz.phone if biz else None,
            json_ld_hours=biz.hours if biz else None,
            json_ld_address=biz.address if biz else None,
            whatsapp_links=numbers,
            hours_from=hours_from,
            pages_read=self.pages_read,
            redirected_to=self.redirected_to,
            page_speed=self.page_speed,
        )


def _whatsapp_for(location: Location, links: dict[str, str]) -> str | None:
    """The link to the place's own WhatsApp number if the site has one, else the first link."""
    if not links:
        return None
    want = _local_digits(location.whatsapp_e164 or "")
    for number, link in links.items():
        if want and _local_digits(number) == want:
            return link
    return next(iter(links.values()))


def _local_digits(value: str) -> str:
    found = re.sub(r"\D", "", value)
    found = found[2:] if found.startswith("00") else found
    return found[3:] if found.startswith("974") and len(found) > 8 else found


def _fold(text: str) -> str:
    return re.sub(r"[\W_]+", "", text.casefold())


def _lists(location: Location, facts: SiteFacts) -> bool | None:
    """Whether the place's area is written on the site. Only "yes" is claimed: a spelling ALYR
    does not recognise is not "the site does not list it"."""
    area = _fold(location.area or "")
    if len(area) < 3:
        return None
    haystack = facts.text
    if facts.business is not None and facts.business.address:
        haystack += _fold(facts.business.address)
    return True if area in haystack else None


def site_key(url: str) -> str:
    text = url.strip()
    if "://" not in text:
        text = "https://" + text
    try:
        parts = urlsplit(text)
    except ValueError:
        return text
    return f"{(parts.hostname or '').lower()}{parts.path.rstrip('/')}"


class _Offsite(Exception):
    def __init__(self, host: str) -> None:
        super().__init__(host)
        self.host = host


class _Unreachable(Exception):
    pass


@dataclass
class _Answer:
    url: str  # where the page was, after the redirects of the same site
    status: int
    content_type: str
    body: bytes


def _same_site(a: str, b: str) -> bool:
    def bare(host: str) -> str:
        return host[4:] if host.startswith("www.") else host

    return bare(a.lower()) == bare(b.lower())


class _Reader:
    """One site's requests: every host vetted once and connected to by its address."""

    def __init__(self, client: httpx.AsyncClient, home_host: str) -> None:
        self.client = client
        self.home_host = home_host
        self.vetted: dict[tuple[str, int], str] = {}

    async def _connect_to(self, scheme: str, host: str, port: int, path: str) -> str:
        key = (host, port)
        if key not in self.vetted:
            # Vetted as https on its port, whatever the scheme: the same host rules and the same
            # lookup of every address the name gives.
            port_part = "" if port in (80, 443) else f":{port}"
            _, ip = await ssrf.vet(f"https://{host}{port_part}/")
            self.vetted[key] = ip
        ip = self.vetted[key]
        literal = f"[{ip}]" if ":" in ip else ip
        return f"{scheme}://{literal}:{port}{path}"

    async def get(self, url: str, max_bytes: int = MAX_PAGE_BYTES) -> _Answer:
        """GET a page of the site, following redirects only within it. Raises `_Offsite` for a
        redirect to another domain, `_Unreachable` for anything that kept the page from coming,
        and `ssrf.Blocked` for an address that may not be called."""
        for _ in range(MAX_REDIRECTS + 1):
            parts = urlsplit(url)
            host = (parts.hostname or "").lower()
            if not _same_site(host, self.home_host):
                raise _Offsite(host)
            scheme = parts.scheme
            port = parts.port or (443 if scheme == "https" else 80)
            path = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
            connect_to = await self._connect_to(scheme, host, port, path)
            host_header = host if port in (80, 443) else f"{host}:{port}"
            try:
                async with asyncio.timeout(TIMEOUT_SECONDS):
                    async with self.client.stream(
                        "GET", connect_to,
                        headers={"Host": host_header, "User-Agent": USER_AGENT,
                                 "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
                                 "Accept-Language": "ar,en;q=0.8"},
                        extensions={"sni_hostname": host},
                    ) as response:
                        if response.is_redirect:
                            location = response.headers.get("location", "")
                            if not location:
                                raise _Unreachable()
                            url = urljoin(url, location)
                            if urlsplit(url).scheme not in ("http", "https"):
                                raise _Unreachable()
                            continue
                        data = bytearray()
                        async for chunk in response.aiter_bytes():
                            data.extend(chunk)
                            if len(data) >= max_bytes:
                                break
                        return _Answer(url, response.status_code,
                                       response.headers.get("content-type", ""),
                                       bytes(data[:max_bytes]))
            except (httpx.HTTPError, TimeoutError, OSError) as error:
                raise _Unreachable() from error
        raise _Unreachable()


def _start(url: str) -> tuple[str, str, int | None, str] | None:
    """The host, path and port of the address the owner gave, or None if it is not a public web
    address ALYR may read."""
    text = url.strip()
    if "://" not in text:
        text = "https://" + text
    try:
        parts = urlsplit(text)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or parts.username or parts.password:
        return None
    if "@" in parts.netloc:
        return None
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        return None
    try:
        port_part = "" if port in (None, 80, 443) else f":{port}"
        ssrf.parse(f"https://{host}{port_part}/")
    except ssrf.Blocked:
        return None
    return parts.scheme, host, port, parts.path or "/"


async def read_site(url: str) -> SiteFacts:
    """Read one website. Never raises for anything the site does: what could not be read is not
    measured."""
    facts = SiteFacts(url)
    start = _start(url)
    if start is None:
        return facts
    given_scheme, host, port, path = start
    deadline = time.monotonic() + SITE_SECONDS
    async with httpx.AsyncClient(
        transport=transport, follow_redirects=False, trust_env=False,
        timeout=httpx.Timeout(TIMEOUT_SECONDS, connect=CONNECT_SECONDS),
    ) as client:
        reader = _Reader(client, host)
        try:
            await _crawl(reader, facts, host, port, path, deadline)
        except ssrf.Blocked:
            return SiteFacts(url)  # not a public address: nothing is measured
        if facts.reachable and _pagespeed_on():
            facts.page_speed = await _page_speed(client, _home(facts, host, port, path))
    return facts


def _home(facts: SiteFacts, host: str, port: int | None, path: str) -> str:
    scheme = "https" if facts.https else "http"
    port_part = "" if port in (None, 80, 443) else f":{port}"
    return f"{scheme}://{host}{port_part}{path}"


async def _robots(reader: _Reader, scheme: str, host: str, port_part: str) -> Protego | None:
    """robots.txt of one host: a parser, `None` when it errored (nothing may be read). Raises
    `_Unreachable` when the host did not answer at all."""
    try:
        answer = await reader.get(f"{scheme}://{host}{port_part}/robots.txt", MAX_ROBOTS_BYTES)
    except _Offsite:
        return Protego.parse("")  # a robots.txt that cannot be followed is unavailable: allowed
    if 200 <= answer.status < 300:
        return Protego.parse(answer.body.decode("utf-8", errors="replace"))
    if 400 <= answer.status < 500:
        return Protego.parse("")  # unavailable: allowed (RFC 9309, 2.3.1.3)
    return None  # unreachable: complete disallow (RFC 9309, 2.3.1.4)


async def _crawl(reader: _Reader, facts: SiteFacts, host: str, port: int | None, path: str,
                 deadline: float) -> None:
    port_part = "" if port in (None, 80, 443) else f":{port}"
    robots: Protego | None = None
    scheme = None
    for candidate in ("https", "http"):  # HTTPS first, whatever the owner wrote
        try:
            robots = await _robots(reader, candidate, host, port_part)
        except _Unreachable:
            continue
        scheme = candidate
        break
    if scheme is None:
        facts.reachable = False
        return
    facts.https = scheme == "https"
    rules_by_host: dict[str, Protego | None] = {host: robots}
    home = f"{scheme}://{host}{port_part}{path}"
    if robots is None:
        return  # robots.txt errored: nothing may be read, and the site was not read
    facts.robots_allowed = robots.can_fetch(home, USER_AGENT)
    if not facts.robots_allowed:
        return
    delay = robots.crawl_delay(USER_AGENT) or 0
    limit = 1 if delay > MAX_CRAWL_DELAY else MAX_PAGES

    queue: list[str] = [home]
    seen: set[str] = {_page_key(home)}
    requests = 0
    while queue and requests < limit and time.monotonic() < deadline:
        url = queue.pop(0)
        target_host = (urlsplit(url).hostname or "").lower()
        if target_host not in rules_by_host:
            try:
                rules_by_host[target_host] = await _robots(
                    reader, urlsplit(url).scheme, target_host, port_part)
            except _Unreachable:
                rules_by_host[target_host] = None
        allowed = rules_by_host[target_host]
        if allowed is None or not allowed.can_fetch(url, USER_AGENT):
            continue
        if requests and delay:
            await sleep(delay)
        requests += 1
        is_home = requests == 1
        try:
            answer = await reader.get(url)
        except _Offsite as offsite:
            if is_home:
                facts.redirected_to = offsite.host
                return
            continue
        except _Unreachable:
            if is_home:
                facts.reachable = False
                return
            continue
        final_host = (urlsplit(answer.url).hostname or "").lower()
        if final_host not in rules_by_host:
            try:
                rules_by_host[final_host] = await _robots(
                    reader, urlsplit(answer.url).scheme, final_host, port_part)
            except _Unreachable:
                rules_by_host[final_host] = None
            redirected = rules_by_host[final_host]
            if redirected is None or not redirected.can_fetch(answer.url, USER_AGENT):
                if is_home:
                    facts.robots_allowed = False if redirected is not None else None
                    return
                continue
        if is_home:
            facts.reachable = 200 <= answer.status < 300
            if not facts.reachable:
                return
            facts.https = urlsplit(answer.url).scheme == "https"
        if not (200 <= answer.status < 300) or "html" not in answer.content_type.lower():
            continue
        found = _read_page(answer)
        if found is None:
            continue
        facts.pages_read += 1
        if is_home:
            facts.script_built = found.script_built
        _add(facts, found)
        for link in found.links:
            if not _same_site((urlsplit(link).hostname or "").lower(), host):
                continue  # another domain: never followed
            key = _page_key(link)
            if key not in seen:
                seen.add(key)
                queue.append(link)
        if is_home:
            queue.sort(key=_priority)  # the pages most likely to hold the details, first


def _add(facts: SiteFacts, page: "PageFacts") -> None:
    if facts.business is None and page.business is not None:
        facts.business = page.business
    elif facts.business is not None and page.business is not None:
        facts.business = facts.business.filled_from(page.business)
    for number in page.tel:
        if number not in facts.tel:
            facts.tel.append(number)
    for digits, link in page.whatsapp.items():
        facts.whatsapp.setdefault(digits, link)
    if not page.script_built:
        facts.page_hours.append(page.hours)
    facts.text += page.text


# ── one page ─────────────────────────────────────────────────────────────────────────────────

SKIP_EXTENSIONS = (
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".zip", ".rar", ".mp4",
    ".mp3", ".mov", ".avi", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".css", ".js",
    ".json", ".xml", ".txt", ".csv", ".woff", ".woff2", ".ttf",
)
PRIORITY_WORDS = (
    "contact", "about", "menu", "service", "location", "branch", "hour", "find-us", "visit",
    "store", "اتصل", "تواصل", "من-نحن", "عن-", "قائمة", "خدمات", "فروع", "موقع",
)
BLOCK_TAGS = {
    "p", "div", "li", "ul", "ol", "tr", "td", "th", "table", "section", "article", "header",
    "footer", "nav", "main", "aside", "h1", "h2", "h3", "h4", "h5", "h6", "dt", "dd", "dl",
    "address", "blockquote", "form", "figure", "figcaption", "pre", "span",
}
WHATSAPP_IN_HTML = (
    re.compile(r"wa\.me/(?:%2B|\+)?(\d{6,15})", re.I),
    re.compile(r"whatsapp\.com/send/?\?(?:[^\"'\s<>]*?&(?:amp;)?)?phone=(?:%2B|\+)?(\d{6,15})",
               re.I),
)


def _priority(url: str) -> int:
    path = unquote(urlsplit(url).path).casefold()
    if path in ("", "/"):
        return 0
    return 1 if any(word in path for word in PRIORITY_WORDS) else 2


def _page_key(url: str) -> str:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    host = host[4:] if host.startswith("www.") else host
    return f"{host}{parts.path.rstrip('/') or '/'}?{parts.query}"


@dataclass
class PageFacts:
    business: "Business | None"
    tel: list[str]
    whatsapp: dict[str, str]
    hours: Hours | None
    links: list[str]
    text: str
    script_built: bool


def _charset(content_type: str) -> str:
    found = re.search(r"charset=([\w.-]+)", content_type, re.I)
    return found.group(1) if found else "utf-8"


def _read_page(answer: _Answer) -> PageFacts | None:
    try:
        parser = lxml.html.HTMLParser(encoding=_charset(answer.content_type))
        tree = lxml.html.document_fromstring(answer.body, parser=parser)
    except (etree.ParserError, ValueError, LookupError):
        return None
    business = _business_of(tree, answer.url)
    tel: list[str] = []
    whatsapp: dict[str, str] = {}
    links: list[str] = []
    for anchor in tree.iter("a"):
        href = (anchor.get("href") or "").strip()
        if not href:
            continue
        if href.lower().startswith("tel:"):
            number = unquote(href[4:]).strip()
            if re.sub(r"\D", "", number) and number not in tel:
                tel.append(number)
            continue
        absolute = urljoin(answer.url, href)
        number = _whatsapp_number(absolute)
        if number:
            whatsapp.setdefault(number, unquote(absolute))
            continue
        link = _crawlable(absolute)
        if link:
            links.append(link)
    raw = answer.body.decode(_charset(answer.content_type), errors="replace")
    for pattern in WHATSAPP_IN_HTML:  # a chat button a script draws keeps its number in the page
        for number in pattern.findall(raw):
            whatsapp.setdefault(number, f"https://wa.me/{number}")
    has_script = any(True for _ in tree.iter("script"))
    text = _visible_text(tree)
    script_built = has_script and len(text.strip()) < 80
    return PageFacts(
        business=business,
        tel=tel,
        whatsapp=whatsapp,
        hours=None if script_built else hours_in_text(text),
        links=links,
        text=_fold(text),
        script_built=script_built,
    )


def _whatsapp_number(url: str) -> str | None:
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    host = (parts.hostname or "").lower()
    if host == "wa.me":
        found = re.fullmatch(r"/\+?(\d{6,15})/?", unquote(parts.path))
        return found.group(1) if found else None
    if host in ("api.whatsapp.com", "whatsapp.com", "www.whatsapp.com", "web.whatsapp.com"):
        found = re.search(r"(?:^|&)phone=\+?(\d{6,15})(?:&|$)", unquote(parts.query))
        return found.group(1) if found else None
    return None


def _crawlable(url: str) -> str | None:
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    if parts.path.lower().endswith(SKIP_EXTENSIONS):
        return None
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", parts.query, ""))


def _visible_text(tree) -> str:
    for bad in list(tree.iter("script", "style", "noscript", "template", "svg")):
        bad.drop_tree()
    for element in tree.iter():
        if not isinstance(element.tag, str):
            continue
        if element.tag == "br":
            element.tail = "\n" + (element.tail or "")
        elif element.tag in BLOCK_TAGS:
            element.text = "\n" + (element.text or "")
            element.tail = "\n" + (element.tail or "")
    return tree.text_content()


# ── LocalBusiness from JSON-LD and microdata ─────────────────────────────────────────────────

LOCAL_TYPES = {
    "LocalBusiness", "FoodEstablishment", "Restaurant", "Bakery", "CafeOrCoffeeShop",
    "FastFoodRestaurant", "IceCreamShop", "BarOrPub", "Brewery", "Winery", "Distillery",
    "HealthAndBeautyBusiness", "BeautySalon", "HairSalon", "NailSalon", "DaySpa", "HealthClub",
    "TattooParlor", "AutomotiveBusiness", "AutoRepair", "AutoWash", "AutoDealer", "AutoRental",
    "AutoBodyShop", "GasStation", "MotorcycleRepair", "MotorcycleDealer", "MedicalBusiness",
    "Dentist", "Optician", "Pharmacy", "MedicalClinic", "Physician", "HomeAndConstructionBusiness",
    "Plumber", "Electrician", "HVACBusiness", "HousePainter", "Locksmith", "RoofingContractor",
    "GeneralContractor", "MovingCompany", "ProfessionalService", "LegalService", "Attorney",
    "Notary", "AccountingService", "FinancialService", "InsuranceAgency", "TravelAgency",
    "LodgingBusiness", "Hotel", "Motel", "Resort", "BedAndBreakfast", "Hostel", "ChildCare",
    "DryCleaningOrLaundry", "SportsActivityLocation", "ExerciseGym", "EntertainmentBusiness",
    "RealEstateAgent", "EmploymentAgency", "SelfStorage", "AnimalShelter", "Library",
    "RecyclingCenter", "TouristInformationCenter", "EmergencyService", "GovernmentOffice",
    "InternetCafe", "RadioStation", "TelevisionStation", "ShoppingCenter", "Store",
}
# Every schema.org store, shop and salon type ends this way ("ShoeStore", "PawnShop").
LOCAL_SUFFIXES = ("Store", "Shop", "Salon", "Restaurant", "Repair", "Dealer")


@dataclass(frozen=True)
class Business:
    name: str | None
    phone: str | None
    address: str | None
    hours: Hours | None

    def filled_from(self, other: "Business") -> "Business":
        return Business(self.name or other.name, self.phone or other.phone,
                        self.address or other.address,
                        self.hours if self.hours is not None else other.hours)


def _types(item: dict) -> list[str]:
    value = item.get("@type") or []
    values = value if isinstance(value, list) else [value]
    return [re.sub(r"^(?:https?://schema\.org/|schema:)", "", str(v)) for v in values]


def _is_local(item: dict) -> bool:
    return any(t in LOCAL_TYPES or t.endswith(LOCAL_SUFFIXES) for t in _types(item))


def _flatten(items: list) -> list[dict]:
    out: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        out.append(item)
        graph = item.get("@graph")
        if isinstance(graph, list):
            out.extend(_flatten(graph))
        for value in item.values():  # one level down: an Organization's department, a page's
            for inner in value if isinstance(value, list) else [value]:  # mainEntity
                if isinstance(inner, dict) and "@type" in inner and inner is not item:
                    out.append(inner)
    return out


def _text(value) -> str | None:
    if isinstance(value, list):
        value = next((v for v in value if isinstance(v, str | int)), None)
    if isinstance(value, dict):
        value = value.get("@value") or value.get("name")
    if isinstance(value, int):
        value = str(value)
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    return value[:200] or None


def _address(value) -> str | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, str):
        return _text(value)
    if not isinstance(value, dict):
        return None
    parts = []
    for key in ("streetAddress", "addressLocality", "addressRegion", "addressCountry"):
        part = value.get(key)
        part = _text(part.get("name") if isinstance(part, dict) else part)
        if part and part not in parts:
            parts.append(part)
    return ", ".join(parts)[:300] or None


def _business_from(item: dict) -> Business:
    hours = opening_hours_spec(item.get("openingHoursSpecification"))
    if hours is None and item.get("openingHours"):
        hours = opening_hours(item.get("openingHours"))
    return Business(_text(item.get("name")), _text(item.get("telephone")),
                    _address(item.get("address")), hours)


def _business_of(tree, url: str) -> Business | None:
    try:
        data = extruct.extract(tree, base_url=url, syntaxes=["json-ld", "microdata"],
                               errors="ignore", uniform=True)
    except Exception:  # noqa: BLE001 - a page's broken markup is that page's problem, not the run's
        return None
    found: Business | None = None
    for item in _flatten(data.get("json-ld", []) + data.get("microdata", [])):
        if not _is_local(item):
            continue
        business = _business_from(item)
        found = business if found is None else found.filled_from(business)
    return found


def local_business(html: str, url: str) -> Business | None:
    """The LocalBusiness a page describes in JSON-LD or microdata, if any."""
    try:
        tree = lxml.html.document_fromstring(html.encode("utf-8"),
                                             parser=lxml.html.HTMLParser(encoding="utf-8"))
    except (etree.ParserError, ValueError):
        return None
    return _business_of(tree, url)


# ── opening hours in schema.org ──────────────────────────────────────────────────────────────

SCHEMA_DAYS = {"su": "sun", "mo": "mon", "tu": "tue", "we": "wed", "th": "thu", "fr": "fri",
               "sa": "sat"}
FULL_DAYS = {"sunday": "sun", "monday": "mon", "tuesday": "tue", "wednesday": "wed",
             "thursday": "thu", "friday": "fri", "saturday": "sat"}


def _clock(value) -> str | None:
    found = re.fullmatch(r"\s*(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?\s*",
                         str(value or ""))
    if not found:
        return None
    hour, minute = int(found.group(1)), int(found.group(2))
    if hour > 24 or minute > 59 or (hour == 24 and minute):
        return None
    return f"{hour:02d}:{minute:02d}"


def _span(first: str, last: str) -> list[str]:
    """Days from `first` to `last`, round the week (DAYS order) if need be: sat-thu."""
    start, end = DAYS.index(first), DAYS.index(last)
    return [DAYS[(start + n) % 7] for n in range((end - start) % 7 + 1)]


def _week(assigned: dict[str, tuple[str, str] | None]) -> Hours | None:
    """Every day of the week, an unnamed one closed, or None when no day is open."""
    if not any(assigned.values()):
        return None
    return {d: assigned.get(d) for d in DAYS}


def opening_hours_spec(value) -> Hours | None:
    """schema.org `openingHoursSpecification`. Seasonal entries (validFrom, validThrough) and
    holidays are left out; a day given two different spans is not measured (one span a day is
    what the rules hold). A day not named is closed; 00:00 to 00:00 is closed all day."""
    items = value if isinstance(value, list) else [value] if isinstance(value, dict) else []
    assigned: dict[str, tuple[str, str] | None] = {}
    for item in items:
        if not isinstance(item, dict) or item.get("validFrom") or item.get("validThrough"):
            continue
        days = item.get("dayOfWeek")
        days = days if isinstance(days, list) else [days]
        opens, closes = _clock(item.get("opens")), _clock(item.get("closes"))
        if opens is None or closes is None:
            return None
        span = None if opens == closes == "00:00" else (opens, closes)
        for raw in days:
            name = re.sub(r"^.*[/:]", "", str(raw or "")).casefold()
            day = FULL_DAYS.get(name)
            if day is None:
                continue  # PublicHolidays and anything not a weekday
            if day in assigned and assigned[day] != span:
                return None
            assigned[day] = span
    return _week(assigned) if assigned else None


def opening_hours(value) -> Hours | None:
    """schema.org `openingHours` text: "Mo-Sa 11:00-14:30", "Mo,Tu,We 08:00-22:00", or a list of
    them. Anything else is not measured."""
    texts = value if isinstance(value, list) else [value]
    assigned: dict[str, tuple[str, str] | None] = {}
    for text in texts:
        for chunk in str(text or "").split(";"):
            chunk = chunk.strip()
            if not chunk:
                continue
            found = re.fullmatch(
                r"((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*[-,]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))*)\s+"
                r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", chunk)
            if not found:
                return None
            opens, closes = _clock(found.group(2)), _clock(found.group(3))
            if opens is None or closes is None:
                return None
            days: list[str] = []
            for part in re.split(r"\s*,\s*", found.group(1)):
                ends = [SCHEMA_DAYS[p.strip().casefold()] for p in part.split("-")]
                days.extend(_span(ends[0], ends[-1]))
            span = None if opens == closes == "00:00" else (opens, closes)
            for day in days:
                if day in assigned and assigned[day] != span:
                    return None
                assigned[day] = span
    return _week(assigned) if assigned else None


# ── opening hours written on the page ────────────────────────────────────────────────────────

_DAY_WORDS = {
    "sunday": "sun", "sun": "sun", "monday": "mon", "mon": "mon", "tuesday": "tue",
    "tues": "tue", "tue": "tue", "wednesday": "wed", "wed": "wed", "thursday": "thu",
    "thurs": "thu", "thur": "thu", "thu": "thu", "friday": "fri", "fri": "fri",
    "saturday": "sat", "sat": "sat",
    # Arabic, after `_normal_line` (alef forms as ا, ة as ه, no diacritics)
    "الاحد": "sun", "الاثنين": "mon", "الثلاثاء": "tue", "الاربعاء": "wed", "الخميس": "thu",
    "الجمعه": "fri", "السبت": "sat",
}
_DAY = "(?:" + "|".join(sorted(map(re.escape, _DAY_WORDS), key=len, reverse=True)) + r")(?!\w)"
_EVERY = (r"(?:daily|every\s*day|7\s*days(?:\s*a\s*week)?|all\s*week|يوميا|كل\s*يوم|"
          r"طوال\s*(?:ايام\s*)?الاسبوع)(?!\w)")
_TIME = (r"\d{1,2}(?::\d{2})?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?|صباحا|مساءا|مساء|ص|م)?(?![\w:])")
_TO = r"\s*(?:-|to|until|till|الي|حتي)\s*"  # إلى and حتى, after `_normal_line`
_RANGE = rf"(?:(?:from|من)\s+)?{_TIME}{_TO}{_TIME}"
_CLOSED = r"(?:closed|off|مغلق|مغلقه|عطله|اجازه)(?!\w)"
_DAY_ITEM = rf"(?:(?:from|من)\s+)?{_DAY}(?:\s*(?:-|to|through|thru|till|until|الي|حتي)\s*{_DAY})?"
_DAY_SPEC = rf"(?:{_EVERY}|{_DAY_ITEM}(?:(?:\s*(?:,|،|&|\band\b)\s*|\s+و\s*){_DAY_ITEM})*)"
_PREFIX = (r"(?:(?:(?:opening|working|business)\s+)?hours|open|timings?|اوقات\s+العمل|"
           r"ساعات\s+العمل|مواعيد\s+العمل|مفتوح)\s*:?\s*")
_FULL_LINE = re.compile(rf"(?:{_PREFIX})?(?P<days>{_DAY_SPEC})\s*:?\s*(?:open\s+)?"
                        rf"(?P<value>{_RANGE}|{_CLOSED})")
_DAYS_LINE = re.compile(rf"(?:{_PREFIX})?(?P<days>{_DAY_SPEC})\s*:?")
_VALUE_LINE = re.compile(rf"(?:open\s+)?(?P<value>{_RANGE}|{_CLOSED})")
_ONE_TIME = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|صباحا|مساءا|مساء|ص|م)?")
_HAS_DAY = re.compile(rf"(?<!\w)(?:{_DAY}|{_EVERY})")
_TASHKEEL = re.compile(r"[ؐ-ًؚ-ٰٟـ]")
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def _normal_line(line: str) -> str:
    text = unicodedata.normalize("NFKC", line).translate(_ARABIC_DIGITS).casefold()
    text = _TASHKEEL.sub("", text)
    text = re.sub("[أإآ]", "ا", text).replace("ة", "ه").replace("ى", "ي")
    text = re.sub(r"[‐-―−]", "-", text)
    text = re.sub(r"\s+", " ", text).strip(" .;|")
    return text


def _times(value: str) -> tuple[str, str] | None:
    """A time range, or None when it is not clear: both ends with am or pm, or both on a 24-hour
    clock that shows it is one (an hour of 13 or more, or 00)."""
    found = [m for m in _ONE_TIME.finditer(value)]
    if len(found) != 2:
        return None
    marks = [m.group(3) for m in found]
    out = []
    if all(marks):
        for m in found:
            hour, minute = int(m.group(1)), int(m.group(2) or 0)
            if not 1 <= hour <= 12 or minute > 59:
                return None
            pm = m.group(3).startswith(("p", "م"))
            hour = (hour % 12) + (12 if pm else 0)
            out.append(f"{hour:02d}:{minute:02d}")
    elif not any(marks):
        if not all(m.group(2) for m in found):
            return None
        hours = [int(m.group(1)) for m in found]
        if any(h > 24 for h in hours) or any(int(m.group(2)) > 59 for m in found):
            return None
        if not any(h >= 13 or h == 0 for h in hours):
            return None
        out = [f"{int(m.group(1)):02d}:{m.group(2)}" for m in found]
    else:
        return None
    return None if out[0] == out[1] else (out[0], out[1])


def _days(spec: str) -> list[str] | None:
    if re.fullmatch(_EVERY, spec.strip()):
        return list(DAYS)
    days: list[str] = []
    for item in re.finditer(_DAY_ITEM, spec):
        names = re.findall(_DAY, item.group(0))
        ends = [_DAY_WORDS[n] for n in names]
        if not ends:
            return None
        days.extend(_span(ends[0], ends[-1]) if len(ends) > 1 else ends)
    return days or None


def _entry(days_text: str, value: str) -> tuple[list[str], tuple[str, str] | None] | None:
    days = _days(days_text)
    if days is None:
        return None
    if re.fullmatch(_CLOSED, value.strip()):
        return days, None
    span = _times(value)
    return (days, span) if span else None


def hours_in_text(text: str) -> Hours | None:
    """Opening hours written on a page, or None. Only clear writing counts: each line a day, a
    range of days or "daily", then a time range or "closed" (a day on one line and its times on
    the next is one entry). Every day of the week must be said, each once; a line that mentions
    a day and a number but is not clear makes the page's hours not measured."""
    lines = [_normal_line(line) for line in (text or "").splitlines()]
    lines = [line for line in lines if line]
    assigned: dict[str, tuple[str, str] | None] = {}
    n = 0
    while n < len(lines):
        line = lines[n]
        entry = None
        full = _FULL_LINE.fullmatch(line)
        if full:
            entry = _entry(full.group("days"), full.group("value"))
            if entry is None:
                return None
            n += 1
        else:
            days_only = _DAYS_LINE.fullmatch(line)
            value_next = _VALUE_LINE.fullmatch(lines[n + 1]) if n + 1 < len(lines) else None
            if days_only and value_next:
                entry = _entry(days_only.group("days"), value_next.group("value"))
                if entry is None:
                    return None
                n += 2
            else:
                if _HAS_DAY.search(line) and re.search(r"\d", line):
                    return None  # it talks about a day and a time, but not clearly
                n += 1
                continue
        days, span = entry
        for day in days:
            if day in assigned and assigned[day] != span:
                return None
            assigned[day] = span
    if set(assigned) != set(DAYS) or not any(assigned.values()):
        return None
    return {d: assigned[d] for d in DAYS}


# ── PageSpeed Insights (optional) ────────────────────────────────────────────────────────────


def _pagespeed_on() -> bool:
    flag = os.environ.get("ALYR_DISCOVERY_PAGESPEED", "").strip().lower()
    return flag in ("1", "true", "on", "yes") and bool(_pagespeed_key())


def _pagespeed_key() -> str:
    return os.environ.get("ALYR_PAGESPEED_KEY", "").strip()


def _metric(metrics: dict, name: str) -> int | None:
    value = (metrics.get(name) or {}).get("percentile")
    return int(value) if isinstance(value, int | float) else None


async def _page_speed(client: httpx.AsyncClient, url: str) -> PageSpeed | None:
    """Lighthouse's performance score and the Core Web Vitals field data for the home page, on
    a phone. Any failure is "not measured"; it never fails the read of the site."""
    params = {"url": url, "key": _pagespeed_key(), "strategy": "mobile",
              "category": "performance"}
    try:
        async with asyncio.timeout(PAGESPEED_SECONDS):
            response = await client.request(
                "GET", PAGESPEED_URL, params=params, headers={"User-Agent": USER_AGENT},
                timeout=PAGESPEED_SECONDS,
            )
        if response.status_code != 200:
            return None
        body = response.json()
    except (httpx.HTTPError, TimeoutError, OSError, json.JSONDecodeError, ValueError):
        return None
    if not isinstance(body, dict):
        return None
    score = (((body.get("lighthouseResult") or {}).get("categories") or {})
             .get("performance") or {}).get("score")
    field_data = body.get("loadingExperience") or {}
    metrics = field_data.get("metrics") or {}
    cls = _metric(metrics, "CUMULATIVE_LAYOUT_SHIFT_SCORE")
    return PageSpeed(
        strategy="mobile",
        performance=round(score * 100) if isinstance(score, int | float) else None,
        lcp_ms=_metric(metrics, "LARGEST_CONTENTFUL_PAINT_MS"),
        cls=cls / 100 if cls is not None else None,  # the API gives CLS times 100
        inp_ms=_metric(metrics, "INTERACTION_TO_NEXT_PAINT"),
        overall=field_data.get("overall_category"),
    )
