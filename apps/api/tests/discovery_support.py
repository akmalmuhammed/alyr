"""Shared helpers for the Discovery tests (spec 065): a shop of its own with an owner, an admin and
an agent signed in, builders for snapshots (the rules are tested on hand-made ones), and a way to
run a check-up through the HTTP routes and wait for it."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from alyr.modules.discovery import rules
from alyr.modules.discovery.connectors import (
    Listing,
    Location,
    PlaceSnapshot,
    Review,
    Snapshot,
    Website,
)
from alyr.modules.discovery.connectors.sample import STANDARD
from documents_support import Shop, make_shop
from test_consent import owner_sql
from test_sign_in import sign_in

NOW = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)
WA = "https://wa.me/97455550150"


def discovery_shop(client_factory, monkeypatch, *, module: bool = True, gap: int = 0,
                   roles: tuple = ("owner",)) -> Shop:
    """A new shop with its three roles signed in. Discovery is on unless said otherwise. The
    ten-minute limit between manual runs is off (`gap=0`) so a test can run several in a row; the
    tests of the limit pass `gap=600`. Each signed-in client builds an app, so only the roles a test
    uses are signed in (`roles=`)."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    monkeypatch.setenv("ALYR_DISCOVERY_RUN_GAP_SECONDS", str(gap))
    shop = make_shop(documents=False)
    if module:
        owner_sql(
            "insert into tenant_modules (tenant_id, module_key) values ($1, 'discovery')",
            shop.tenant_id,
        )
    for role in roles:
        client = client_factory()
        sign_in(client, shop.emails[role])
        setattr(shop, role, client)
    return shop


def turn_on_sample(shop: Shop) -> dict:
    answer = shop.owner.put("/api/discovery/connection", json={"kind": "sample", "on": True})
    assert answer.status_code == 200, answer.text
    return answer.json()


def run_check_up(client, *, expect: str = "done") -> dict:
    """Start a check-up and return it finished. Jobs run in the API's own process in tests
    (`ALYR_JOBS_INLINE`), so it is done when the POST has answered."""
    started = client.post("/api/discovery/runs")
    assert started.status_code == 202, started.text
    run = client.get(f"/api/discovery/runs/{started.json()['id']}")
    assert run.status_code == 200, run.text
    assert run.json()["status"] == expect, run.json()
    return run.json()


def findings(client, status: str = "open", **query) -> list[dict]:
    answer = client.get("/api/discovery/findings", params={"status": status, **query})
    assert answer.status_code == 200, answer.text
    return answer.json()["items"]


def by_rule(items: list[dict]) -> dict[str, list[dict]]:
    found: dict[str, list[dict]] = {}
    for item in items:
        found.setdefault(item["rule_id"], []).append(item)
    return found


# ── hand-made snapshots for the rules ───────────────────────────────────────────────────


def location(name: str = "Nuqta Car Care - West Bay", area: str = "West Bay", **more) -> Location:
    return Location(
        more.pop("id", uuid4()), name, "", area, whatsapp_e164=more.pop("whatsapp", "+97455550150"),
        **more,
    )


def listing(**more) -> Listing:
    base = {
        "found": True, "claimed": True, "name": "Nuqta Car Care", "phone": "+974 5555 0110",
        "address": "West Bay", "hours": STANDARD, "categories": ["Car wash"], "photo_count": 12,
        "rating": 4.5, "review_count": 40, "url": "https://nuqta-carcare.example",
        "whatsapp_link": None,
    }
    return Listing(**(base | more))


def website(**more) -> Website:
    base = {
        "url": "https://nuqta-carcare.example/west-bay", "reachable": True,
        "has_location_page": True, "hours": STANDARD, "phone": "+974 5555 0110",
        "whatsapp_link": WA, "lists_location": True,
    }
    return Website(**(base | more))


def review(rating: int, days: int, *, replied: bool = False, n: int = 0) -> Review:
    return Review(f"r-{rating}-{days}-{n}", rating, NOW - timedelta(days=days), "Someone", "Text",
                  "en", replied)


def place(loc: Location, *, lst: Listing | None = None, web: Website | None = None,
          reviews: list[Review] | None = None) -> PlaceSnapshot:
    return PlaceSnapshot(loc.id, lst if lst is not None else listing(), web, reviews)


def context(*places: tuple[Location, PlaceSnapshot]) -> rules.Context:
    locations = [p[0] for p in places]
    return rules.Context(Snapshot("sample", NOW, [p[1] for p in places]), locations, {}, NOW)


def outcome(rule_id: str, ctx: rules.Context, loc: Location | None = None) -> rules.Outcome:
    """The one outcome of a rule for one place (or for the business)."""
    found = [o for o in rules.RULE_BY_ID[rule_id].check(ctx)
             if loc is None or o.location_id == loc.id]
    assert len(found) == 1, found
    return found[0]


def one(rule_id: str, loc: Location, **parts) -> rules.Outcome:
    """A rule's outcome for a single place described by `listing=`, `website=`, `reviews=`."""
    return outcome(rule_id, context((loc, place(loc, **parts))), loc)


def uuid_of(value: str) -> UUID:
    return UUID(value)

