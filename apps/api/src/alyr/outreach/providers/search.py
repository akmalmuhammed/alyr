"""Discovery: businesses that match a search, with their addresses (Exa), and a simulator.

Checked against Exa's documentation on 2 Nov 2026 (https://exa.ai/docs/reference/search; the old
docs.exa.ai address redirects there): `POST https://api.exa.ai/search` with `x-api-key`; body
`query`, `numResults` (1 to 100), `type` ("auto", "lite", ...), `category` ("company", ...),
`userLocation` (a two-letter country code), `contents.text.maxCharacters`; the answer has
`results[]` with `url`, `title`, `id` and `text`, and `costDollars.total`. Only the query leaves
ALYR: no personal data.
"""

from dataclasses import dataclass, field

import httpx

from alyr.outreach.providers.llm import NotConfigured

API_URL = "https://api.exa.ai/search"


class SearchError(Exception):
    pass


@dataclass(frozen=True)
class Found:
    url: str
    title: str
    text: str


class ExaSearch:
    name = "exa"

    def __init__(self, api_key: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._key = api_key
        self._transport = transport

    async def search(self, query: str, *, country: str = "", limit: int = 10) -> list[Found]:
        body: dict = {
            "query": query, "numResults": max(1, min(limit, 25)), "type": "auto",
            "category": "company", "contents": {"text": {"maxCharacters": 1000}},
        }
        if country:
            body["userLocation"] = country.upper()
        try:
            async with httpx.AsyncClient(timeout=30.0, transport=self._transport) as client:
                response = await client.post(API_URL, json=body, headers={"x-api-key": self._key})
        except httpx.HTTPError as error:
            raise SearchError(f"unreachable: {type(error).__name__}") from error
        if response.status_code != 200:
            raise SearchError(f"HTTP {response.status_code}")
        return [
            Found(str(r.get("url") or ""), str(r.get("title") or ""), str(r.get("text") or ""))
            for r in (response.json().get("results") or []) if r.get("url")
        ]


class ClosedSearch:
    name = "closed"

    async def search(self, *_: object, **__: object) -> list[Found]:
        raise NotConfigured("ALYR_EXA_API_KEY is not set")


@dataclass
class SimulatedSearch:
    """Answers with fictional businesses on `.example` addresses, or with `results` a test set."""

    name: str = "simulator"
    results: list[Found] | None = None
    queries: list[str] = field(default_factory=list)

    async def search(self, query: str, *, country: str = "", limit: int = 10) -> list[Found]:
        self.queries.append(query)
        if self.results is not None:
            return self.results[:limit]
        return [Found(f"https://bakery-{n}.example/", f"Demo Bakery {n}",
                      "A fictional bakery that takes orders.") for n in range(1, limit + 1)]


@dataclass(frozen=True)
class Place:
    place_id: str
    name: str
    website: str  # used only to fetch the site; kept once our own fetcher has read it


class GooglePlaces:
    """Google Places API (New) Text Search, for local businesses (founder, 2 Nov 2026).

    NOT checked against Google's documentation in this session: the fetch of
    developers.google.com/maps/documentation/places/web-service/text-search was blocked
    (2 Nov 2026).
    Written to the request shape we know and must be checked before the key is set:
    `POST https://places.googleapis.com/v1/places:searchText`, headers `X-Goog-Api-Key` and
    `X-Goog-FieldMask: places.id,places.displayName,places.websiteUri` (only the fields we need),
    body `textQuery`, `regionCode`, `pageSize`; answer `places[]` with `id`, `displayName.text`,
    `websiteUri`. Terms as read by the founder (2 Nov 2026): the place ID may be kept; nothing else
    of Google's is stored (no address, phone, rating or position); Google is credited wherever
    a place's name from Google is shown (docs/runbooks/outreach-setup.md).
    """

    name = "google_places"
    URL = "https://places.googleapis.com/v1/places:searchText"
    FIELDS = "places.id,places.displayName,places.websiteUri"

    def __init__(self, api_key: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._key = api_key
        self._transport = transport

    async def places(self, query: str, *, country: str = "", limit: int = 10) -> list[Place]:
        body: dict = {"textQuery": query, "pageSize": max(1, min(limit, 20))}
        if country:
            body["regionCode"] = country.upper()
        try:
            async with httpx.AsyncClient(timeout=30.0, transport=self._transport) as client:
                response = await client.post(self.URL, json=body, headers={
                    "X-Goog-Api-Key": self._key, "X-Goog-FieldMask": self.FIELDS})
        except httpx.HTTPError as error:
            raise SearchError(f"unreachable: {type(error).__name__}") from error
        if response.status_code != 200:
            raise SearchError(f"HTTP {response.status_code}")
        found = []
        for row in response.json().get("places") or []:
            name = (row.get("displayName") or {}).get("text") or ""
            if row.get("id") and name:
                found.append(Place(str(row["id"]), str(name), str(row.get("websiteUri") or "")))
        return found


class ClosedPlaces:
    name = "closed"

    async def places(self, *_: object, **__: object) -> list[Place]:
        raise NotConfigured("ALYR_GOOGLE_PLACES_API_KEY is not set")


@dataclass
class SimulatedPlaces:
    name: str = "simulator"
    results: list[Place] | None = None
    queries: list[str] = field(default_factory=list)

    async def places(self, query: str, *, country: str = "", limit: int = 10) -> list[Place]:
        self.queries.append(query)
        if self.results is not None:
            return self.results[:limit]
        return [Place(f"sim-place-{n}", f"Demo Cafe {n}", f"https://cafe-{n}.example/")
                for n in range(1, limit + 1)]
