"""Reading a business's own pages for research: the built-in fetcher behind connected mode's SSRF
guard (the default), Firecrawl for a page the built-in one cannot read (optional), and a simulator.

Fetched pages are hostile input. The built-in fetcher reads https from public addresses only
(`modules/connect/ssrf.get`), follows a redirect only to an address that passes the same checks,
2 MB and 10 seconds a page. Only the text is kept (scripts and styles dropped).

Firecrawl (founder, 2 Nov 2026) is used only while `ALYR_FIRECRAWL_API_KEY` is set, and only when
the built-in fetcher got too little text (a site drawn by JavaScript). Checked against its docs on
2 Nov 2026 (https://docs.firecrawl.dev/api-reference/endpoint/scrape and .../credit-usage):
`POST https://api.firecrawl.dev/v2/scrape` with `Authorization: Bearer`, body `url`, `formats`
(["markdown", "links"]), `onlyMainContent`, `timeout` (ms); the answer has `success`,
`data.markdown`, `data.links[]` and `data.metadata.url`. `GET /v2/team/credit-usage` gives
`data.remainingCredits`. Firecrawl receives the public page's address only.
"""

import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import unquote, urljoin, urlsplit

import httpx

from alyr.modules.connect import ssrf
from alyr.outreach.providers.llm import NotConfigured

MAX_BYTES = 2_000_000
# Fewer characters of text than this and the page counts as unreadable by the built-in fetcher.
TOO_LITTLE = 200
FIRECRAWL = "https://api.firecrawl.dev/v2"


class FetchError(Exception):
    """The page could not be read; the message is a short reason."""


@dataclass(frozen=True)
class Fetched:
    url: str
    text: str
    links: tuple[str, ...]
    by: str  # direct, firecrawl or simulator
    # Addresses the page itself publishes: mailto: links, its visible text, schema.org `email`.
    emails: tuple[str, ...] = ()


_ADDRESS = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")


def _ld_emails(value: object) -> list[str]:
    """Every `email` in a schema.org JSON-LD block, at any depth."""
    found: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "email" and isinstance(item, str):
                found.append(item.removeprefix("mailto:"))
            else:
                found += _ld_emails(item)
    elif isinstance(value, list):
        for item in value:
            found += _ld_emails(item)
    return found


def published_emails(text: str, links: tuple[str, ...] | list[str], jsonld: list[str]) -> tuple:
    found = [unquote(link[7:].split("?")[0]) for link in links
             if link.lower().startswith("mailto:")]
    found += _ADDRESS.findall(text)
    for block in jsonld:
        try:
            found += _ld_emails(json.loads(block))
        except ValueError:
            continue
    clean = [e.strip().strip(".").lower() for e in found]
    return tuple(dict.fromkeys(e for e in clean if _ADDRESS.fullmatch(e)))


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "template", "head"}
    BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section",
             "article", "header", "footer", "td", "title"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.links: list[str] = []
        self.jsonld: list[str] = []
        self._skip = 0
        self._in_ld = False

    def handle_starttag(self, tag, attrs):
        if tag == "script" and (dict(attrs).get("type") or "").lower() == "application/ld+json":
            self._in_ld = True
            self.jsonld.append("")
        if tag in self.SKIP:
            self._skip += 1
        if tag == "a":
            href = dict(attrs).get("href") or ""
            if href:
                self.links.append(href)
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_ld = False
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_ld:
            self.jsonld[-1] += data
        if not self._skip:
            self.parts.append(data)


def html_text(html: str, base: str) -> tuple[str, tuple[str, ...], tuple[str, ...]]:
    """The visible text of a page, one block a line, its links made absolute, and the email
    addresses it publishes."""
    parser = _Text()
    try:
        parser.feed(html)
        parser.close()
    except Exception:  # noqa: BLE001 - a broken page gives what was read
        pass
    lines = [" ".join(line.split()) for line in "".join(parser.parts).splitlines()]
    text = "\n".join(line for line in lines if line)
    links = tuple(dict.fromkeys(urljoin(base, href) for href in parser.links
                                if not href.startswith(("mailto:", "tel:", "javascript:", "#"))))
    return text, links, published_emails(text, parser.links, parser.jsonld)


class DirectFetcher:
    name = "direct"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def fetch(self, url: str) -> Fetched:
        try:
            page = await ssrf.get(url, max_bytes=MAX_BYTES, transport=self._transport)
        except ssrf.Blocked as error:
            raise FetchError(f"refused: {error.reason}") from error
        except (httpx.HTTPError, TimeoutError) as error:
            raise FetchError(f"unreachable: {type(error).__name__}") from error
        if page.status != 200:
            raise FetchError(f"HTTP {page.status}")
        kind = page.content_type.split(";")[0].strip().lower()
        if kind not in ("text/html", "text/plain", "application/xhtml+xml", ""):
            raise FetchError(f"not a page: {kind}")
        raw = page.body.decode("utf-8", errors="replace")
        if kind == "text/plain":
            return Fetched(page.url, raw, (), self.name, published_emails(raw, (), []))
        text, links, emails = html_text(raw, page.url)
        return Fetched(page.url, text, links, self.name, emails)


class FirecrawlFetcher:
    name = "firecrawl"

    def __init__(self, api_key: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._key = api_key
        self._transport = transport

    async def fetch(self, url: str) -> Fetched:
        try:
            ssrf.parse(url)  # an address the built-in fetcher would accept, nothing else
        except ssrf.Blocked as error:
            raise FetchError(f"refused: {error.reason}") from error
        try:
            async with httpx.AsyncClient(timeout=40.0, transport=self._transport) as client:
                response = await client.post(f"{FIRECRAWL}/scrape", json={
                    "url": url, "formats": ["markdown", "links"], "onlyMainContent": True,
                    "timeout": 30000,
                }, headers={"Authorization": f"Bearer {self._key}"})
        except httpx.HTTPError as error:
            raise FetchError(f"unreachable: {type(error).__name__}") from error
        if response.status_code != 200:
            raise FetchError(f"HTTP {response.status_code}")
        answer = response.json()
        data = answer.get("data") or {}
        if not answer.get("success") or not data.get("markdown"):
            raise FetchError("no text")
        final = str((data.get("metadata") or {}).get("url") or url)
        links = tuple(str(link) for link in data.get("links") or [])
        markdown = str(data["markdown"])
        return Fetched(final, markdown, tuple(x for x in links if not x.startswith("mailto:")),
                       self.name, published_emails(markdown, links, []))

    async def credits(self) -> str:
        try:
            async with httpx.AsyncClient(timeout=20.0, transport=self._transport) as client:
                response = await client.get(f"{FIRECRAWL}/team/credit-usage",
                                            headers={"Authorization": f"Bearer {self._key}"})
        except httpx.HTTPError as error:
            raise FetchError(f"unreachable: {type(error).__name__}") from error
        if response.status_code != 200:
            raise FetchError(f"HTTP {response.status_code}")
        data = response.json().get("data") or {}
        return f"{data.get('remainingCredits', '?')} credits left"


class ClosedFirecrawl:
    name = "closed"

    async def fetch(self, url: str) -> Fetched:
        raise NotConfigured("ALYR_FIRECRAWL_API_KEY is not set")

    async def credits(self) -> str:
        raise NotConfigured("ALYR_FIRECRAWL_API_KEY is not set")


class Web:
    """The built-in fetcher first; Firecrawl only when it is configured and the built-in one
    failed or read too little."""

    def __init__(self, direct, firecrawl=None) -> None:
        self.direct = direct
        self.firecrawl = firecrawl

    async def fetch(self, url: str) -> Fetched:
        try:
            page = await self.direct.fetch(url)
            if len(page.text) >= TOO_LITTLE or self.firecrawl is None:
                return page
        except FetchError:
            if self.firecrawl is None:
                raise
        return await self.firecrawl.fetch(url)


@dataclass
class SimulatedWeb:
    """Pages a test wrote, by address (HTML); any other address of a `.example` site gets a short
    fictional page. Nothing reaches the network."""

    name: str = "simulator"
    pages: dict[str, str] = field(default_factory=dict)
    fetched: list[str] = field(default_factory=list)

    async def fetch(self, url: str) -> Fetched:
        self.fetched.append(url)
        html = self.pages.get(url)
        if html is None:
            host = urlsplit(url).hostname or ""
            if not host.endswith(".example") or self.pages:
                raise FetchError("HTTP 404")
            html = (f"<html><body><h1>{host}</h1><p>We bake fresh bread every morning in Doha "
                    "since 2015.</p><p>Customers order cakes for birthdays and weddings.</p>"
                    "<a href='/about'>About</a></body></html>")
        text, links, emails = html_text(html, url)
        return Fetched(url, text, links, self.name, emails)
