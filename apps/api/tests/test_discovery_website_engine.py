"""The engine adds the business's own website to a check-up (Discovery 2.0, workstream E), through
the real path: HTTP in, real PostgreSQL, the jobs worker.

The fictional sample business is never crawled (`connectors.extras_for("sample", ...)` is empty,
tested in test_discovery_website.py), so this run swaps in a stand-in website source that does no
I/O, and a sample that leaves one place without website facts: the stand-in's read must fill that
place, be logged as its own step, and its evidence must say it came from the website, dated when it
was read. Any real outbound HTTP call fails the test."""

import json
from dataclasses import replace
from uuid import uuid4

import httpx

from alyr.modules.discovery import connectors
from alyr.modules.discovery.connectors import (
    Listing,
    PlaceSnapshot,
    SampleConnector,
    SiteWebsite,
    Snapshot,
)
from discovery_support import discovery_shop, run_check_up, turn_on_sample
from test_consent import owner_sql

AREA = "Al Sadd"


class NoSiteForOnePlace(SampleConnector):
    """The sample, with no website facts for one place (as a source that does not read sites)."""

    async def snapshot(self, locations, ctx):
        snapshot = await super().snapshot(locations, ctx)
        target = next(loc.id for loc in locations if loc.area == AREA)
        return replace(snapshot, places=[
            replace(p, website=None) if p.location_id == target else p for p in snapshot.places])


class StandInWebsite:
    """What the website connector returns, without reading anything: the place's site, read, with
    no WhatsApp link on it."""

    kind = "website"
    asked: list = []

    async def snapshot(self, locations, ctx):
        self.asked.append([loc.area for loc in locations])
        place = next(loc for loc in locations if loc.area == AREA)
        web = SiteWebsite(url="https://site.example", reachable=True, whatsapp_link="",
                          whatsapp_links=(), pages_read=2, https=True, robots_allowed=True,
                          read_at=ctx.now)
        return Snapshot("website", ctx.now, [PlaceSnapshot(place.id, Listing(found=None), web)])

    @staticmethod
    def sentence(snapshot):
        return "Read 2 pages of 1 website."


def test_a_run_merges_the_website_read_and_logs_its_step(client_factory, monkeypatch):
    async def refuse(*args, **kwargs):
        raise AssertionError("a real outbound call was made")

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", refuse)
    stand_in = StandInWebsite()
    StandInWebsite.asked = []
    monkeypatch.setattr(connectors, "get", lambda kind: NoSiteForOnePlace())
    monkeypatch.setattr(connectors, "extras_for", lambda kind, locations: (stand_in,))
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)

    run = run_check_up(shop.owner)
    assert run["status"] == "done"
    tools = [s["tool"] for s in run["steps"]]
    assert tools[:2] == ["connector.snapshot", "connector.website"]
    step = run["steps"][1]
    assert step["ok"] and step["summary"] == "Read 2 pages of 1 website."
    assert len(StandInWebsite.asked) == 1 and AREA in StandInWebsite.asked[0]

    rows = owner_sql(
        "select f.evidence from discovery_findings f join discovery_locations l "
        "on l.id = f.location_id where f.tenant_id = $1 and f.rule_id = 'whatsapp_link_missing' "
        "and l.area = $2", shop.tenant_id, AREA)
    assert len(rows) == 1
    evidence = rows[0]["evidence"]
    evidence = json.loads(evidence) if isinstance(evidence, str) else evidence
    site = [e for e in evidence if e["where"] == "website"]
    assert site and all(e["source"] == "website" for e in site)
    assert any(e["label"] == "website_whatsapp" and e["value"] == "~none" for e in site)
    # everything else in the run is still the connection's
    others = [e for e in evidence if e["where"] != "website"]
    assert all(e["source"] == "sample" for e in others)


def test_the_real_registry_never_adds_a_website_read_to_the_sample():
    # every sample place has a made-up website address, and none may be read
    sample_places = [connectors.Location(id=uuid4(), name="x",
                                         website_url="https://nuqta.example/a")]
    assert connectors.extras_for("sample", sample_places) == ()
