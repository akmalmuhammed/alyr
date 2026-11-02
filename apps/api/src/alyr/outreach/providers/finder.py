"""Finding and checking a work email for a business's domain (Hunter), and a simulator.

Checked against Hunter's API v2 documentation on 2 Nov 2026 (https://hunter.io/api-documentation/v2):
- `GET https://api.hunter.io/v2/domain-search?domain=...&limit=...`: `data.emails[]` with `value`,
  `type` ("personal" or "generic"), `confidence`, `first_name`, `last_name`, `position`,
  `sources[]` (`domain`, `uri`, ...) and `verification.status`. No result is still 200 with `[]`.
- `GET /v2/email-verifier?email=...`: `data.status` is one of "valid", "invalid", "accept_all",
  "webmail", "disposable", "unknown"; HTTP 202 means still verifying (ask again), 222 means the
  remote server answered oddly (try later).
- `GET /v2/account`: `data.plan_name`, `data.requests.searches` and `.verifications` with `used`,
  `available`.
The key goes in the `X-API-KEY` header (also documented), so it never sits in a logged address.
"""

from dataclasses import dataclass, field

import httpx

from alyr.outreach.providers.llm import NotConfigured

API = "https://api.hunter.io/v2"
STATUSES = ("valid", "invalid", "accept_all", "webmail", "disposable", "unknown")


class FinderError(Exception):
    pass


@dataclass(frozen=True)
class Person:
    email: str
    type: str  # personal or generic
    first_name: str
    last_name: str
    position: str
    # The addresses of the pages the email was seen on.
    source_domains: tuple[str, ...]


class HunterFinder:
    name = "hunter"

    def __init__(self, api_key: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._key = api_key
        self._transport = transport

    async def _get(self, path: str, params: dict) -> tuple[int, dict]:
        try:
            async with httpx.AsyncClient(timeout=30.0, transport=self._transport) as client:
                response = await client.get(f"{API}{path}", params=params,
                                            headers={"X-API-KEY": self._key})
        except httpx.HTTPError as error:
            raise FinderError(f"unreachable: {type(error).__name__}") from error
        if response.status_code not in (200, 202, 222):
            raise FinderError(f"HTTP {response.status_code}")
        return response.status_code, response.json()

    async def domain_search(self, domain: str, limit: int = 10) -> list[Person]:
        _, answer = await self._get("/domain-search", {"domain": domain, "limit": limit})
        people = []
        for row in (answer.get("data") or {}).get("emails") or []:
            people.append(Person(
                str(row.get("value") or "").lower(), str(row.get("type") or ""),
                str(row.get("first_name") or ""), str(row.get("last_name") or ""),
                str(row.get("position") or ""),
                tuple(str(s.get("domain") or "").lower() for s in row.get("sources") or []),
            ))
        return [p for p in people if "@" in p.email]

    async def verify(self, email: str) -> str:
        code, answer = await self._get("/email-verifier", {"email": email})
        if code in (202, 222):
            return "unknown"
        status = str((answer.get("data") or {}).get("status") or "unknown")
        return status if status in STATUSES else "unknown"

    async def account(self) -> str:
        _, answer = await self._get("/account", {})
        data = answer.get("data") or {}
        searches = (data.get("requests") or {}).get("searches") or {}
        return (f"plan {data.get('plan_name', '?')}, searches "
                f"{searches.get('used', '?')} of {searches.get('available', '?')}")


class ClosedFinder:
    name = "closed"

    async def domain_search(self, *_: object, **__: object) -> list[Person]:
        raise NotConfigured("ALYR_HUNTER_API_KEY is not set")

    async def verify(self, *_: object) -> str:
        raise NotConfigured("ALYR_HUNTER_API_KEY is not set")

    async def account(self) -> str:
        raise NotConfigured("ALYR_HUNTER_API_KEY is not set")


@dataclass
class SimulatedFinder:
    """A fictional owner at every domain, verified valid, unless a test sets `people` and
    `statuses` (by address)."""

    name: str = "simulator"
    people: dict[str, list[Person]] | None = None
    statuses: dict[str, str] = field(default_factory=dict)
    asked: list[str] = field(default_factory=list)

    async def domain_search(self, domain: str, limit: int = 10) -> list[Person]:
        self.asked.append(domain)
        if self.people is not None:
            return self.people.get(domain, [])
        return [Person(f"sara@{domain}", "personal", "Sara", "Demo", "Owner", (domain,))]

    async def verify(self, email: str) -> str:
        return self.statuses.get(email, "valid")

    async def account(self) -> str:
        return "simulator"
