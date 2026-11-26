"""The owner's own website as a Discovery source (Discovery 2.0, workstream E).

Every test runs on saved pages (`tests/fixtures/website/`) served by a fake transport, with the
name lookup answered by the test: a real outbound call, a real name lookup or a real socket fails
the test (`no_network`). What is checked: robots.txt is honoured for ALYR's own agent; only the
owner's host is read (a link or a redirect to another domain is never followed); at most 20 pages;
a slow site ends at the timeout and says "not reachable"; what is read is LocalBusiness JSON-LD or
microdata, `tel:` and WhatsApp links, and hours written on the page only when they are clear; and
anything not read is `None` ("not measured"), never an empty value a rule could fire on."""

import ast
import asyncio
import json
import re
import socket
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from alyr.modules.connect import ssrf
from alyr.modules.discovery import connectors, rules
from alyr.modules.discovery.connectors import (
    Listing,
    Location,
    PlaceSnapshot,
    RunContext,
    Snapshot,
    Website,
)
from alyr.modules.discovery.connectors import website as site

FIXTURES = Path(__file__).parent / "fixtures" / "website"
NOW = datetime(2026, 11, 26, 9, 0, tzinfo=UTC)
PUBLIC_IP = "93.184.216.34"
SRC = Path(__file__).resolve().parents[1] / "src" / "alyr" / "modules" / "discovery"


def page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


HTML = {"content-type": "text/html; charset=utf-8"}
ALLOW_ALL = "User-agent: *\nAllow: /\n"


class FakeWeb:
    """A handful of websites. `routes` maps "scheme://host/path" to (status, body, headers), to an
    exception to raise, or to a coroutine function that answers. Every request is recorded."""

    def __init__(self, routes: dict) -> None:
        self.routes = routes
        self.seen: list[httpx.Request] = []

    def key(self, request: httpx.Request) -> str:
        host = request.headers["host"]
        return f"{request.url.scheme}://{host}{request.url.path}"

    async def handle(self, request: httpx.Request) -> httpx.Response:
        self.seen.append(request)
        answer = self.routes.get(self.key(request))
        if answer is None:
            return httpx.Response(404, text="not found", headers=HTML)
        if isinstance(answer, Exception):
            raise answer
        if callable(answer):
            return await answer(request)
        status, body, headers = answer
        return httpx.Response(status, text=body, headers=headers)

    @property
    def keys(self) -> list[str]:
        return [self.key(r) for r in self.seen]

    def hosts(self) -> set[str]:
        return {r.headers["host"] for r in self.seen}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Trip any real outbound call: the real transports, a real socket, a real name lookup."""

    def refuse(*args, **kwargs):
        raise AssertionError("a real outbound call was made")

    async def refuse_async(*args, **kwargs):
        raise AssertionError("a real outbound call was made")

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", refuse_async)
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)

    async def resolve(host: str, port: int) -> list[str]:
        if host == "inside.example":
            return ["10.0.0.5"]
        if host.endswith(".example") or host == "www.googleapis.com":
            return [PUBLIC_IP]
        raise OSError("no such name")

    monkeypatch.setattr(ssrf, "resolve", resolve)
    monkeypatch.delenv("ALYR_PAGESPEED_KEY", raising=False)
    monkeypatch.delenv("ALYR_DISCOVERY_PAGESPEED", raising=False)


def serve(monkeypatch, routes: dict) -> FakeWeb:
    web = FakeWeb(routes)
    monkeypatch.setattr(site, "transport", httpx.MockTransport(web.handle))
    return web


def place(url: str | None, whatsapp: str | None = "+97455550123", area: str = "Al Sadd",
          name: str = "Test Bakery") -> Location:
    return Location(uuid4(), name, "", area, None, url, whatsapp, True, 0)


def ctx() -> RunContext:
    return RunContext(now=NOW)


async def crawl(*locations: Location) -> Snapshot:
    return await site.WebsiteConnector().snapshot(list(locations), ctx())


def run(coro):
    return asyncio.run(coro)


def only(snapshot: Snapshot) -> site.SiteWebsite:
    assert len(snapshot.places) == 1
    web = snapshot.places[0].website
    assert isinstance(web, site.SiteWebsite)
    return web


BAKERY = {
    "https://bakery.example/robots.txt": (200, ALLOW_ALL, {"content-type": "text/plain"}),
    "https://bakery.example/": (200, page("jsonld_home.html"), HTML),
    "https://bakery.example/contact": (200, page("jsonld_contact.html"), HTML),
    "https://bakery.example/about": (200, page("jsonld_about.html"), HTML),
    "https://other.example/partner": (200, "<html><body>other</body></html>", HTML),
}


# ── a site with JSON-LD and a wa.me link ──────────────────────────────────────────────────


def test_a_site_with_json_ld_and_a_whatsapp_link_is_read(monkeypatch):
    web = serve(monkeypatch, BAKERY)
    snapshot = run(crawl(place("https://bakery.example")))
    found = only(snapshot)
    assert snapshot.source == "website"
    assert found.url == "https://bakery.example"
    assert found.reachable is True and found.https is True and found.robots_allowed is True
    assert found.json_ld_local_business is True
    assert found.json_ld_name == "Test Bakery"
    assert found.json_ld_phone == "+974 4444 0101"
    assert found.json_ld_address == "Building 12, Street 840, Zone 38, Al Sadd, Doha, QA"
    week = {d: ("07:00", "22:00") for d in ("sat", "sun", "mon", "tue", "wed", "thu")}
    assert found.json_ld_hours == {**week, "fri": ("13:00", "22:00")}
    assert found.hours == found.json_ld_hours and found.hours_from == "json_ld"
    assert found.phone == "+974 4444 0101"
    assert found.whatsapp_link == "https://wa.me/97455550123?text=Hello"
    assert found.whatsapp_links == ("97455550123",)
    assert found.lists_location is True  # "Al Sadd" is written on the site
    assert found.has_location_page is None  # never guessed
    assert found.pages_read == 3
    assert found.page_speed is None
    # robots first, then the home page, then the two linked pages of the same host, nothing else
    assert web.keys[0] == "https://bakery.example/robots.txt"
    assert set(web.keys) == {
        "https://bakery.example/robots.txt", "https://bakery.example/",
        "https://bakery.example/contact", "https://bakery.example/about",
    }
    assert web.hosts() == {"bakery.example"}  # never other.example, never instagram


def test_every_request_is_a_get_with_alyrs_own_agent_to_the_checked_address(monkeypatch):
    web = serve(monkeypatch, BAKERY)
    run(crawl(place("https://bakery.example")))
    assert web.seen
    for request in web.seen:
        assert request.method == "GET"
        assert request.headers["user-agent"] == "ALYR-Discovery (+https://alyr.qa)"
        assert request.url.host == PUBLIC_IP  # connected to the address that was vetted
        assert not request.content


def test_the_rules_read_what_the_site_says(monkeypatch):
    serve(monkeypatch, BAKERY)
    right = place("https://bakery.example", whatsapp="+97455550123")
    wrong = place("https://bakery.example", whatsapp="+97455559999")
    snapshot = run(crawl(right, wrong))
    outcome = {
        o.location_id: o
        for o in rules.evaluate(rules.Context(snapshot, [right, wrong], {}, now=NOW),
                                parts=("whatsapp",))
        if o.rule_id == "whatsapp_link_missing"
    }
    assert outcome[right.id].state == rules.PASS
    assert outcome[wrong.id].state == rules.FAIL


def test_two_places_with_one_website_read_it_once(monkeypatch):
    web = serve(monkeypatch, BAKERY)
    snapshot = run(crawl(place("https://bakery.example"), place("https://bakery.example/")))
    assert len(snapshot.places) == 2
    assert web.keys.count("https://bakery.example/") == 1


# ── a site without any of it ──────────────────────────────────────────────────────────────


SALON = {
    "https://salon.example/robots.txt": (404, "", HTML),
    "https://salon.example/": (200, page("plain_home.html"), HTML),
    "https://salon.example/services": (200, page("plain_services.html"), HTML),
}


def test_a_site_without_json_ld_or_whatsapp_says_so_and_reads_the_written_hours(monkeypatch):
    serve(monkeypatch, SALON)
    found = only(run(crawl(place("https://salon.example", area="Al Waab"))))
    assert found.reachable is True and found.robots_allowed is True  # no robots.txt: allowed
    assert found.json_ld_local_business is False
    assert found.json_ld_name is None and found.json_ld_hours is None
    assert found.whatsapp_link == ""  # read, and there is none: the rule may fire on this
    assert found.whatsapp_links == ()
    assert found.phone == "+97455550199"
    week = {d: ("10:00", "21:00") for d in ("sat", "sun", "mon", "tue", "wed", "thu")}
    assert found.hours == {**week, "fri": ("16:00", "22:00")}
    assert found.hours_from == "page"
    # the contact page link answers 404: it is not a page read
    assert found.pages_read == 2


def test_a_missing_whatsapp_link_on_the_site_fails_the_rule(monkeypatch):
    serve(monkeypatch, SALON)
    location = place("https://salon.example", whatsapp="+97455550199")
    snapshot = run(crawl(location))
    [outcome] = [o for o in rules.evaluate(rules.Context(snapshot, [location], {}, now=NOW),
                                           parts=("whatsapp",))
                 if o.rule_id == "whatsapp_link_missing"]
    assert outcome.state == rules.FAIL


# ── an Arabic site ────────────────────────────────────────────────────────────────────────


ARABIC = {
    "https://mataam.example/robots.txt": (200, ALLOW_ALL, {"content-type": "text/plain"}),
    "https://mataam.example/ar": (200, page("arabic_home.html"), HTML),
    "https://mataam.example/ar/contact": (200, page("arabic_contact.html"), HTML),
}


def test_an_arabic_site_gives_its_hours_microdata_and_whatsapp_link(monkeypatch):
    serve(monkeypatch, ARABIC)
    found = only(run(crawl(place("https://mataam.example/ar", whatsapp="+97455550177",
                                 area="Al Dafna"))))
    assert found.reachable is True
    assert found.json_ld_local_business is True  # microdata counts: schema.org Restaurant
    assert found.json_ld_name == "مطعم تجريبي"
    assert found.json_ld_phone == "+974 4444 0177"
    assert found.phone == "+974 4444 0177"
    week = {d: ("11:00", "23:00") for d in ("sat", "sun", "mon", "tue", "wed", "thu")}
    assert found.hours == {**week, "fri": ("13:00", "23:00")}
    assert found.hours_from == "page"
    assert found.whatsapp_links == ("97455550177",)
    assert "phone=" in found.whatsapp_link
    # the rule reads the decoded link as the same number as a plain wa.me link to it
    assert rules.whatsapp_digits(found.whatsapp_link) == rules.whatsapp_digits(
        "https://wa.me/97455550177")
    # "Al Dafna" is not written in Latin letters on the page: not measured, never "not listed"
    assert found.lists_location is None


# ── robots.txt says no ────────────────────────────────────────────────────────────────────


def test_robots_disallow_reads_nothing_but_robots(monkeypatch):
    web = serve(monkeypatch, {
        "https://closed.example/robots.txt": (200, page("robots_disallow.txt"),
                                              {"content-type": "text/plain"}),
        "https://closed.example/": (200, page("jsonld_home.html"), HTML),
    })
    found = only(run(crawl(place("https://closed.example"))))
    assert web.keys == ["https://closed.example/robots.txt"]
    assert found.robots_allowed is False
    assert found.https is True
    assert found.pages_read == 0
    for name in ("reachable", "hours", "phone", "whatsapp_link", "lists_location",
                 "has_location_page", "json_ld_local_business"):
        assert getattr(found, name) is None, name


def test_robots_disallow_of_one_path_skips_that_path(monkeypatch):
    home = page("jsonld_home.html").replace('href="/about#story"', 'href="/private/about"')
    web = serve(monkeypatch, {
        "https://part.example/robots.txt": (
            200, "User-agent: *\nDisallow: /private/\n", {"content-type": "text/plain"}),
        "https://part.example/": (200, home, HTML),
        "https://part.example/contact": (200, page("jsonld_contact.html"), HTML),
    })
    found = only(run(crawl(place("https://part.example"))))
    assert found.robots_allowed is True
    assert "https://part.example/private/about" not in web.keys
    assert found.pages_read == 2


def test_a_robots_file_that_errors_means_nothing_is_read(monkeypatch):
    web = serve(monkeypatch, {
        "https://busy.example/robots.txt": (503, "busy", HTML),
        "https://busy.example/": (200, page("jsonld_home.html"), HTML),
    })
    found = only(run(crawl(place("https://busy.example"))))
    assert web.keys == ["https://busy.example/robots.txt"]
    assert found.robots_allowed is None and found.pages_read == 0 and found.hours is None


# ── a site that does not answer in time ───────────────────────────────────────────────────


def test_a_site_that_times_out_is_not_reachable_and_nothing_else_is_measured(monkeypatch):
    monkeypatch.setattr(site, "TIMEOUT_SECONDS", 0.05)

    async def slow(request):
        await asyncio.sleep(5)
        return httpx.Response(200, text=ALLOW_ALL)

    serve(monkeypatch, {
        "https://slow.example/robots.txt": slow,
        "http://slow.example/robots.txt": httpx.ConnectTimeout("no answer"),
    })
    started = time.monotonic()
    found = only(run(crawl(place("https://slow.example"))))
    assert time.monotonic() - started < 3  # ended at the timeout, not when the site answered
    assert found.reachable is False
    for name in ("https", "robots_allowed", "hours", "phone", "whatsapp_link", "lists_location",
                 "json_ld_local_business"):
        assert getattr(found, name) is None, name


def test_a_home_page_that_times_out_after_robots_is_not_reachable(monkeypatch):
    monkeypatch.setattr(site, "TIMEOUT_SECONDS", 0.05)

    async def slow(request):
        await asyncio.sleep(5)
        return httpx.Response(200, text="late")

    serve(monkeypatch, {
        "https://half.example/robots.txt": (200, ALLOW_ALL, {"content-type": "text/plain"}),
        "https://half.example/": slow,
    })
    found = only(run(crawl(place("https://half.example"))))
    assert found.reachable is False and found.robots_allowed is True and found.whatsapp_link is None


# ── redirects ────────────────────────────────────────────────────────────────────────────


def test_a_redirect_to_another_domain_is_not_followed(monkeypatch):
    web = serve(monkeypatch, {
        "https://moved.example/robots.txt": (200, ALLOW_ALL, {"content-type": "text/plain"}),
        "https://moved.example/": (301, "", {"location": "https://elsewhere.example/"}),
        "https://elsewhere.example/": (200, page("jsonld_home.html"), HTML),
    })
    found = only(run(crawl(place("https://moved.example"))))
    assert web.hosts() == {"moved.example"}
    assert found.redirected_to == "elsewhere.example"
    assert found.pages_read == 0
    for name in ("reachable", "hours", "phone", "whatsapp_link", "json_ld_local_business"):
        assert getattr(found, name) is None, name


def test_a_redirect_on_the_same_site_is_followed(monkeypatch):
    web = serve(monkeypatch, {
        "https://shop.example/robots.txt": (200, ALLOW_ALL, {"content-type": "text/plain"}),
        "https://shop.example/": (301, "", {"location": "https://www.shop.example/en/"}),
        "https://www.shop.example/en/": (200, page("plain_home.html"), HTML),
    })
    found = only(run(crawl(place("https://shop.example"))))
    assert "https://www.shop.example/en/" in web.keys
    assert found.reachable is True and found.pages_read >= 1


def test_http_only_site_is_read_and_called_not_https(monkeypatch):
    serve(monkeypatch, {
        "https://old.example/robots.txt": httpx.ConnectError("tls refused"),
        "http://old.example/robots.txt": (404, "", HTML),
        "http://old.example/": (200, page("plain_home.html"), HTML),
    })
    found = only(run(crawl(place("http://old.example"))))
    assert found.https is False and found.reachable is True


def test_an_address_written_without_https_is_tried_on_https_first(monkeypatch):
    web = serve(monkeypatch, {
        "https://salon.example/robots.txt": (404, "", HTML),
        "https://salon.example/": (200, page("plain_home.html"), HTML),
    })
    found = only(run(crawl(place("salon.example"))))
    assert found.https is True
    assert all(k.startswith("https://") for k in web.keys)


# ── limits and refusals ───────────────────────────────────────────────────────────────────


def test_at_most_twenty_pages_are_read(monkeypatch):
    links = "".join(f'<a href="/p{n}">page {n}</a>' for n in range(40))
    body = f"<html><body><p>{'A shop. ' * 40}</p>{links}</body></html>"
    routes = {"https://big.example/robots.txt": (404, "", HTML),
              "https://big.example/": (200, body, HTML)}
    routes.update({f"https://big.example/p{n}": (200, body, HTML) for n in range(40)})
    web = serve(monkeypatch, routes)
    found = only(run(crawl(place("https://big.example"))))
    pages = [k for k in web.keys if not k.endswith("/robots.txt")]
    assert len(pages) == 20 and found.pages_read == 20


@pytest.mark.parametrize("url", [
    "https://localhost/", "https://127.0.0.1/", "https://inside.example/", "ftp://files.example/",
    "https://user:pass@bakery.example/", "javascript:alert(1)",
])
def test_an_address_that_is_not_a_public_website_is_never_called(monkeypatch, url):
    web = serve(monkeypatch, BAKERY)
    found = only(run(crawl(place(url))))
    assert web.seen == []
    assert found.reachable is None and found.robots_allowed is None and found.hours is None


def test_a_place_without_a_website_is_left_out(monkeypatch):
    web = serve(monkeypatch, BAKERY)
    snapshot = run(crawl(place(None), place("")))
    assert snapshot.places == [] and web.seen == []


def test_a_page_built_by_script_measures_no_whatsapp_link_and_no_hours(monkeypatch):
    serve(monkeypatch, {
        "https://app.example/robots.txt": (404, "", HTML),
        "https://app.example/": (200, page("script_shell.html"), HTML),
    })
    found = only(run(crawl(place("https://app.example"))))
    assert found.reachable is True
    assert found.whatsapp_link is None and found.phone is None and found.hours is None
    assert found.json_ld_local_business is None


def test_a_page_that_is_not_html_is_not_parsed(monkeypatch):
    serve(monkeypatch, {
        "https://pdf.example/robots.txt": (404, "", HTML),
        "https://pdf.example/": (200, "%PDF-1.7 wa.me/97455550123", {"content-type":
                                                                    "application/pdf"}),
    })
    found = only(run(crawl(place("https://pdf.example"))))
    assert found.pages_read == 0 and found.whatsapp_link is None


# ── hours written on the page: only clear patterns ────────────────────────────────────────


@pytest.mark.parametrize("text, expected", [
    ("Daily: 8:00 AM - 11:00 PM", {d: ("08:00", "23:00") for d in rules.DAYS}),
    ("Open daily 07:00 - 23:00", {d: ("07:00", "23:00") for d in rules.DAYS}),
    ("Sun–Thu 9am–10pm\nFri 2pm–10pm\nSat closed",
     {**{d: ("09:00", "22:00") for d in ("sun", "mon", "tue", "wed", "thu")},
      "fri": ("14:00", "22:00"), "sat": None}),
    ("يومياً من 9:00 ص إلى 10:00 م", {d: ("09:00", "22:00") for d in rules.DAYS}),
    ("من السبت إلى الخميس: 8:00 صباحاً - 10:00 مساءً\nالجمعة: مغلق",
     {**{d: ("08:00", "22:00") for d in ("sat", "sun", "mon", "tue", "wed", "thu")},
      "fri": None}),
    ("Saturday to Thursday\n10:00 AM - 9:00 PM\nFriday\n4:00 PM - 9:00 PM",
     {**{d: ("10:00", "21:00") for d in ("sat", "sun", "mon", "tue", "wed", "thu")},
      "fri": ("16:00", "21:00")}),
])
def test_clear_hours_are_read(text, expected):
    assert site.hours_in_text(text) == expected


@pytest.mark.parametrize("text", [
    "Open 9 - 5",  # no days, no am or pm
    "Saturday - Thursday: 9 - 10",  # 9 to 10, or 9 am to 10 pm?
    "Monday - Friday: 9:00 AM - 5:00 PM",  # the weekend is not said
    "Daily 9 AM - 1 PM, 4 PM - 10 PM",  # two shifts: one pair a day is all the rules hold
    "Daily 8 AM - 10 PM\nFriday 2 PM - 10 PM",  # Friday said twice, differently
    "We were founded on Monday 9 March 2009 at 10:00 AM",
    "",
])
def test_unclear_hours_are_not_measured(text):
    assert site.hours_in_text(text) is None


@pytest.mark.parametrize("value, expected", [
    ("Mo-Sa 11:00-14:30", {d: ("11:00", "14:30") for d in
                           ("mon", "tue", "wed", "thu", "fri", "sat")} | {"sun": None}),
    (["Mo,Tu,We,Th,Su 08:00-22:00", "Fr 13:00-22:00"],
     {d: ("08:00", "22:00") for d in ("mon", "tue", "wed", "thu", "sun")}
     | {"fri": ("13:00", "22:00"), "sat": None}),
    ("Mo-Su", None),  # no times
    ("sometimes", None),
])
def test_json_ld_opening_hours_strings(value, expected):
    assert site.opening_hours(value) == expected


def test_json_ld_hours_that_contradict_each_other_are_not_measured():
    spec = [
        {"dayOfWeek": "Monday", "opens": "09:00", "closes": "13:00"},
        {"dayOfWeek": "Monday", "opens": "16:00", "closes": "22:00"},
    ]
    assert site.opening_hours_spec(spec) is None


def test_json_ld_closed_all_day_and_open_all_day():
    spec = [
        {"dayOfWeek": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Saturday"],
         "opens": "00:00", "closes": "23:59"},
        {"dayOfWeek": "Friday", "opens": "00:00", "closes": "00:00"},
    ]
    hours = site.opening_hours_spec(spec)
    assert hours["fri"] is None and hours["mon"] == ("00:00", "23:59")


def test_json_ld_in_a_graph_is_found():
    body = """<html><head><script type="application/ld+json">
    {"@context": "https://schema.org", "@graph": [
      {"@type": "WebSite", "name": "Site"},
      {"@type": ["HairSalon", "LocalBusiness"], "name": "Graph Salon", "telephone": "44440155"}
    ]}</script></head><body><p>x</p></body></html>"""
    business = site.local_business(body, "https://graph.example/")
    assert business is not None and business.name == "Graph Salon"
    assert business.phone == "44440155"


def test_broken_json_ld_is_ignored_not_fatal():
    body = """<html><head><script type="application/ld+json">{"@type": "Bakery", "name": </script>
    </head><body></body></html>"""
    assert site.local_business(body, "https://broken.example/") is None


# ── PageSpeed Insights: off unless a key and the flag are both set ────────────────────────


def test_pagespeed_is_off_by_default_and_never_called(monkeypatch):
    web = serve(monkeypatch, BAKERY)
    monkeypatch.setenv("ALYR_PAGESPEED_KEY", "test-key")  # a key alone does not turn it on
    found = only(run(crawl(place("https://bakery.example"))))
    assert found.page_speed is None
    assert "www.googleapis.com" not in web.hosts()


def test_pagespeed_on_with_a_key_reads_the_score_and_field_data(monkeypatch):
    routes = dict(BAKERY)
    routes["https://www.googleapis.com/pagespeedonline/v5/runPagespeed"] = (
        200, page("pagespeed.json"), {"content-type": "application/json"})
    web = serve(monkeypatch, routes)
    monkeypatch.setenv("ALYR_PAGESPEED_KEY", "test-key")
    monkeypatch.setenv("ALYR_DISCOVERY_PAGESPEED", "on")
    found = only(run(crawl(place("https://bakery.example"))))
    speed = found.page_speed
    assert speed is not None
    assert speed.performance == 62
    assert speed.lcp_ms == 2900 and speed.cls == 0.04 and speed.inp_ms == 180
    assert speed.overall == "AVERAGE" and speed.strategy == "mobile"
    [call] = [r for r in web.seen if r.headers["host"] == "www.googleapis.com"]
    assert call.method == "GET"
    assert call.url.params["url"] == "https://bakery.example/"
    assert call.url.params["key"] == "test-key"
    assert call.url.params["strategy"] == "mobile"


def test_pagespeed_flag_without_a_key_is_not_measured(monkeypatch):
    web = serve(monkeypatch, BAKERY)
    monkeypatch.setenv("ALYR_DISCOVERY_PAGESPEED", "on")
    found = only(run(crawl(place("https://bakery.example"))))
    assert found.page_speed is None and "www.googleapis.com" not in web.hosts()


def test_pagespeed_failing_leaves_the_site_read(monkeypatch):
    routes = dict(BAKERY)
    routes["https://www.googleapis.com/pagespeedonline/v5/runPagespeed"] = (
        429, json.dumps({"error": {"code": 429}}), {"content-type": "application/json"})
    serve(monkeypatch, routes)
    monkeypatch.setenv("ALYR_PAGESPEED_KEY", "test-key")
    monkeypatch.setenv("ALYR_DISCOVERY_PAGESPEED", "on")
    found = only(run(crawl(place("https://bakery.example"))))
    assert found.page_speed is None and found.reachable is True and found.pages_read == 3


# ── registration: which run gets the website, and how it joins the main snapshot ──────────


def test_the_website_joins_a_real_source_when_a_place_has_a_website():
    with_site = [place("https://bakery.example")]
    [extra] = connectors.extras_for("manual", with_site)
    assert extra.kind == "website" and isinstance(extra, site.WebsiteConnector)
    assert connectors.extras_for("manual", [place(None)]) == ()
    # the fictional sample business never reads a real address, whatever its places say
    assert connectors.extras_for("sample", with_site) == ()


def test_merge_fills_only_what_the_main_source_did_not_say():
    a, b, c = place("https://a.example"), place("https://b.example"), place("https://c.example")
    staff = Website(url="https://a.example", reachable=True, whatsapp_link="https://wa.me/1")
    primary = Snapshot("manual", NOW, [
        PlaceSnapshot(a.id, Listing(found=True), staff),
        PlaceSnapshot(b.id, Listing(found=True), None),
    ])
    read = Snapshot("website", NOW, [
        PlaceSnapshot(a.id, Listing(found=None), site.SiteWebsite(url="https://a.example")),
        PlaceSnapshot(b.id, Listing(found=None), site.SiteWebsite(url="https://b.example",
                                                                  reachable=True)),
        PlaceSnapshot(c.id, Listing(found=None), site.SiteWebsite(url="https://c.example",
                                                                  reachable=False)),
    ])
    merged = connectors.merge(primary, read)
    assert merged.source == "manual" and merged.taken_at == NOW
    assert merged.of(a.id).website is staff  # what staff recorded is kept
    assert merged.of(b.id).website.reachable is True
    assert merged.of(b.id).listing.found is True
    assert merged.of(c.id).listing.found is None and merged.of(c.id).website.reachable is False


def test_the_step_sentence_counts_what_was_read(monkeypatch):
    serve(monkeypatch, BAKERY)
    snapshot = run(crawl(place("https://bakery.example")))
    assert site.WebsiteConnector.sentence(snapshot) == "Read 3 pages of 1 website."


# ── what the code may do ──────────────────────────────────────────────────────────────────


def test_the_website_reader_only_gets_and_never_follows_a_redirect_by_itself():
    text = (SRC / "connectors" / "website.py").read_text(encoding="utf-8")
    tree = ast.parse(text)
    methods = {
        n.args[0].value for n in ast.walk(tree)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
        and n.func.attr in ("stream", "request") and n.args
        and isinstance(n.args[0], ast.Constant)
    }
    assert methods == {"GET"}
    for verb in ("post", "put", "patch", "delete"):
        assert f".{verb}(" not in text
    assert "follow_redirects=False" in text and "follow_redirects=True" not in text
    assert "trust_env=False" in text
    # the only outside places it may reach: the owner's address (vetted) and PageSpeed's API; the
    # other names are the agent's own link and the WhatsApp link it writes out, never fetched
    assert "ssrf.vet(" in text
    named = set(re.findall(r"https://([a-z0-9-]+(?:\.[a-z0-9-]+)+)", text))
    assert named == {"alyr.qa", "www.googleapis.com", "wa.me"}


def test_nothing_from_a_page_is_kept_but_the_snapshot_fields():
    fields = {f for f in site.SiteWebsite.__dataclass_fields__}
    assert fields == {
        "url", "reachable", "has_location_page", "hours", "phone", "whatsapp_link",
        "lists_location", "https", "robots_allowed", "json_ld_local_business", "json_ld_name",
        "json_ld_phone", "json_ld_hours", "json_ld_address", "whatsapp_links", "hours_from",
        "pages_read", "redirected_to", "page_speed", "read_at",
    }
