"""The outreach engine's real providers, against fake servers (httpx.MockTransport): each request
has the shape its documentation gives (read 2 Nov 2026), each answer is read the documented way,
and a page fetch never reaches a private address. Nothing reaches the network."""

import asyncio
import json

import httpx
import pytest

from alyr.modules.connect import ssrf
from alyr.outreach.providers.finder import HunterFinder
from alyr.outreach.providers.llm import AnthropicLLM, ModelError
from alyr.outreach.providers.search import ExaSearch, GooglePlaces
from alyr.outreach.providers.web import DirectFetcher, Fetched, FetchError, FirecrawlFetcher, Web

SCHEMA = {"type": "object", "properties": {"word": {"type": "string"}}, "required": ["word"],
          "additionalProperties": False}


def run(coro):
    return asyncio.run(coro)


def mock(handler):
    seen = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    return httpx.MockTransport(wrapped), seen


def test_the_model_is_asked_with_a_json_schema_and_its_text_is_read():
    transport, seen = mock(lambda r: httpx.Response(200, json={
        "content": [{"type": "text", "text": '{"word": "ok"}'}], "stop_reason": "end_turn",
        "usage": {"input_tokens": 12, "output_tokens": 3}}))
    done = run(AnthropicLLM("sk-test", transport).complete(
        model="claude-haiku-5-5", system="s", user="u", schema=SCHEMA, max_tokens=20))
    assert (done.data, done.input_tokens, done.output_tokens) == ({"word": "ok"}, 12, 3)
    [request] = seen
    assert str(request.url) == "https://api.anthropic.com/v1/messages"
    assert request.headers["x-api-key"] == "sk-test"
    assert request.headers["anthropic-version"] == "2023-06-01"
    body = json.loads(request.content)
    assert body["output_config"] == {"format": {"type": "json_schema", "schema": SCHEMA}}
    assert body["model"] == "claude-haiku-5-5" and body["system"] == "s"


@pytest.mark.parametrize("answer", [
    {"content": [{"type": "text", "text": "{}"}], "stop_reason": "refusal"},
    {"content": [{"type": "text", "text": '{"wo'}], "stop_reason": "max_tokens"},
    {"content": [{"type": "text", "text": "not json"}], "stop_reason": "end_turn"},
])
def test_a_refusal_a_cut_off_or_not_json_is_a_failure(answer):
    transport, _ = mock(lambda r: httpx.Response(200, json=answer))
    with pytest.raises(ModelError):
        run(AnthropicLLM("k", transport).complete(model="m", system="s", user="u",
                                                  schema=SCHEMA, max_tokens=5))


def test_an_error_answer_never_repeats_the_prompt():
    transport, _ = mock(lambda r: httpx.Response(429, json={
        "type": "error", "error": {"type": "rate_limit_error", "message": "slow down"}}))
    with pytest.raises(ModelError) as caught:
        run(AnthropicLLM("k", transport).complete(model="m", system="s", user="secret words",
                                                  schema=SCHEMA, max_tokens=5))
    assert str(caught.value) == "HTTP 429 rate_limit_error"


def test_exa_is_asked_for_companies_and_sends_the_query_only():
    transport, seen = mock(lambda r: httpx.Response(200, json={"requestId": "x", "results": [
        {"url": "https://a.example/", "title": "A", "text": "about a"}, {"title": "no url"}]}))
    found = run(ExaSearch("exa-key", transport).search("bakeries in Doha", country="qa", limit=3))
    assert [f.url for f in found] == ["https://a.example/"]
    body = json.loads(seen[0].content)
    assert seen[0].headers["x-api-key"] == "exa-key"
    assert body == {"query": "bakeries in Doha", "numResults": 3, "type": "auto",
                    "category": "company", "contents": {"text": {"maxCharacters": 1000}},
                    "userLocation": "QA"}


def test_google_places_asks_only_for_the_id_the_name_and_the_website():
    transport, seen = mock(lambda r: httpx.Response(200, json={"places": [
        {"id": "ChIJ1", "displayName": {"text": "Cafe One"}, "websiteUri": "https://c1.example"},
        {"id": "ChIJ2", "displayName": {"text": "No site"}}]}))
    found = run(GooglePlaces("g-key", transport).places("cafes", country="QA", limit=5))
    assert [(p.place_id, p.name, p.website) for p in found] == [
        ("ChIJ1", "Cafe One", "https://c1.example"), ("ChIJ2", "No site", "")]
    assert seen[0].headers["X-Goog-FieldMask"] == "places.id,places.displayName,places.websiteUri"
    assert json.loads(seen[0].content) == {"textQuery": "cafes", "pageSize": 5,
                                           "regionCode": "QA"}


def test_hunter_reads_people_with_their_sources_and_a_202_is_unknown():
    def answer(request):
        if request.url.path.endswith("/domain-search"):
            return httpx.Response(200, json={"data": {"emails": [
                {"value": "Noor@Shop.example", "type": "personal", "first_name": "Noor",
                 "last_name": "A", "position": "Founder",
                 "sources": [{"domain": "shop.example", "uri": "https://shop.example/team"}]}]}})
        return httpx.Response(202, json={"data": {}})

    transport, seen = mock(answer)
    finder = HunterFinder("h-key", transport)
    [person] = run(finder.domain_search("shop.example"))
    assert person.email == "noor@shop.example" and person.source_domains == ("shop.example",)
    assert run(finder.verify("noor@shop.example")) == "unknown"
    assert all(r.headers["X-API-KEY"] == "h-key" and "api_key" not in str(r.url) for r in seen)


def test_firecrawl_reads_a_page_and_its_published_addresses():
    transport, seen = mock(lambda r: httpx.Response(200, json={"success": True, "data": {
        "markdown": "# Shop\nWrite to orders@shop.example", "links": [
            "https://shop.example/about", "mailto:owner@shop.example"],
        "metadata": {"url": "https://shop.example/"}}}))
    page = run(FirecrawlFetcher("fc-key", transport).fetch("https://shop.example/"))
    assert page.by == "firecrawl" and page.links == ("https://shop.example/about",)
    assert set(page.emails) == {"orders@shop.example", "owner@shop.example"}
    assert seen[0].headers["Authorization"] == "Bearer fc-key"
    assert json.loads(seen[0].content)["url"] == "https://shop.example/"
    with pytest.raises(FetchError):
        run(FirecrawlFetcher("fc-key", transport).fetch("http://10.0.0.1/"))


class Thin:
    async def fetch(self, url):
        return Fetched(url, "Loading...", (), "direct")


class Rich:
    async def fetch(self, url):
        return Fetched(url, "x" * 500, (), "firecrawl")


def test_firecrawl_is_used_only_when_set_and_the_built_in_fetcher_read_too_little():
    assert run(Web(Thin()).fetch("https://a.example/")).by == "direct"
    assert run(Web(Thin(), Rich()).fetch("https://a.example/")).by == "firecrawl"


@pytest.fixture
def dns(monkeypatch):
    names = {"shop.example": ["93.184.216.34"], "evil.example": ["127.0.0.1"]}

    async def resolve(host, port):
        return names[host]

    monkeypatch.setattr(ssrf, "resolve", resolve)


def test_a_page_is_read_from_the_checked_address(dns):
    transport, seen = mock(lambda r: httpx.Response(
        200, headers={"content-type": "text/html"},
        html="<p>Hello <b>there</b></p><a href='mailto:a@shop.example'>x</a>"))
    page = run(DirectFetcher(transport).fetch("https://shop.example/"))
    assert page.text.startswith("Hello there") and page.emails == ("a@shop.example",)
    assert seen[0].url.host == "93.184.216.34" and seen[0].headers["Host"] == "shop.example"


def test_a_redirect_to_a_private_address_is_never_followed(dns):
    transport, seen = mock(lambda r: httpx.Response(302, headers={
        "location": "https://evil.example/admin"}))
    with pytest.raises(FetchError, match="refused: address"):
        run(DirectFetcher(transport).fetch("https://shop.example/"))
    assert len(seen) == 1
    with pytest.raises(FetchError, match="refused: scheme"):
        run(DirectFetcher(transport).fetch("http://shop.example/"))
