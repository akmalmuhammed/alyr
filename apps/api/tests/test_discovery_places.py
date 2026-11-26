"""The public Google listing as a Discovery source, read live through the Places API (New)
(Discovery 2.0, workstream F; Discovery decision 9).

Every test runs on saved Place Details answers (`tests/fixtures/places/`) served by a fake
transport: a real outbound call, a real socket or a real name lookup fails the test (`no_network`).
What is checked: the owner's Google Maps link or place ID gives the place ID (real link shapes), and
nothing else is accepted; nothing is called unless both settings are on, and never for the sample;
one GET a place ID, to Google's Places host only, with the key in a header and a tight field mask;
what comes back is the listing the rules read, with the owner's side (claimed, replies) not
measured; a failure is "not measured", never a failed check-up; the evidence is Google's, dated
when it was read, removed after 30 days, and never kept as a finding's `observed` values."""

import asyncio
import json
import socket
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from alyr.modules.discovery import connectors, engine, proposals, retention, rules, words
from alyr.modules.discovery.connectors import (
    Listing,
    Location,
    PlaceSnapshot,
    RunContext,
    Snapshot,
    Website,
    places,
)

FIXTURES = Path(__file__).parent / "fixtures" / "places"
NOW = datetime(2026, 11, 26, 9, 0, tzinfo=UTC)
PID = "ChIJN1t_tDeuEmsRUsoyG83frY4"  # the place ID of Google's own documentation examples
PID2 = "ChIJ3S-JXmauEmsRUcIaWtf4MzE"


def answer(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Trip any real outbound call, and start with the Places read switched on."""

    def refuse(*args, **kwargs):
        raise AssertionError("a real outbound call was made")

    async def refuse_async(*args, **kwargs):
        raise AssertionError("a real outbound call was made")

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", refuse_async)
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)
    monkeypatch.setattr(socket, "getaddrinfo", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setenv("ALYR_DISCOVERY_PLACES", "on")
    monkeypatch.setenv("ALYR_PLACES_KEY", "test-key-not-real")


class FakeGoogle:
    """Place Details for a few place IDs; every request is recorded."""

    def __init__(self, routes: dict) -> None:
        self.routes = routes
        self.seen: list[httpx.Request] = []

    async def handle(self, request: httpx.Request) -> httpx.Response:
        self.seen.append(request)
        found = self.routes.get(request.url.path.rsplit("/", 1)[-1])
        if found is None:
            return httpx.Response(404, json=answer("error_not_found.json"))
        if isinstance(found, Exception):
            raise found
        if isinstance(found, tuple):
            return httpx.Response(found[0], json=found[1])
        return httpx.Response(200, json=found)


def serve(monkeypatch, routes: dict) -> FakeGoogle:
    google = FakeGoogle(routes)
    monkeypatch.setattr(places, "transport", httpx.MockTransport(google.handle))
    return google


def place(ref: str | None, area: str = "Al Sadd", url: str | None = None) -> Location:
    return Location(uuid4(), "Test Bakery", "", area, ref, url, "+97455550123", True, 0)


SPENT: list[int] = []  # the cost units of the last read


def read(*locations: Location, budget: int = 100) -> places.PlacesRead:
    ctx = RunContext(now=NOW, cost_budget=budget)
    snapshot = asyncio.run(places.PlacesConnector().snapshot(list(locations), ctx))
    SPENT[:] = [ctx.spent]
    return snapshot


# ── the place ID the owner gives ───────────────────────────────────────────────────────────

LINKS = [
    # a bare place ID, and the API's resource name
    (PID, PID),
    (f"  {PID}\n", PID),
    (f"places/{PID}", PID),
    # Maps URLs (developers.google.com/maps/documentation/urls/get-started)
    (f"https://www.google.com/maps/search/?api=1&query=Test%20Bakery&query_place_id={PID}", PID),
    (f"https://www.google.com/maps/dir/?api=1&destination=Test&destination_place_id={PID}", PID),
    (f"https://www.google.com/maps/dir/?api=1&origin=A&origin_place_id={PID}&destination=B", PID),
    # the place_id: form of the q parameter
    (f"https://www.google.com/maps/place/?q=place_id:{PID}", PID),
    (f"https://maps.google.com/?q=place_id:{PID}", PID),
    # the review links an owner gets from Google ("Ask for reviews")
    (f"https://search.google.com/local/writereview?placeid={PID}", PID),
    (f"https://search.google.com/local/reviews?placeid={PID}", PID),
    # a place page from the browser's address bar, the place ID after !19s in its data
    ("https://www.google.com/maps/place/Test+Bakery/@25.2854,51.5310,17z/data=!3m1!4b1!4m6!3m5"
     f"!1s0x3e45c534ffdce87f:0x44d9319f78cfd4b1!8m2!3d25.2854!4d51.5310!16s%2Fg%2F11c1!19s{PID}"
     "?entry=ttu", PID),
    # a country domain, no scheme
    (f"google.com.qa/maps/place/?q=place_id:{PID}", PID),
    (f"https://www.google.qa/maps/search/?api=1&query=x&query_place_id={PID2}", PID2),
]


@pytest.mark.parametrize("text,expected", LINKS)
def test_the_place_id_is_read_from_a_link_or_a_pasted_id(text, expected):
    assert places.parse_place(text) == expected
    assert places.place_id_of(text) == expected


@pytest.mark.parametrize("text", [
    "https://maps.app.goo.gl/AbCdEf123456",
    "maps.app.goo.gl/AbCdEf123456",
    "https://goo.gl/maps/AbCdEf123456",
    "https://g.page/r/CQ5u8kNjExMEAB/review",
])
def test_a_short_link_is_refused_with_what_to_do_instead(text):
    with pytest.raises(places.PlaceLinkError) as refused:
        places.parse_place(text)
    assert refused.value.code == "place_link_short"
    assert places.place_id_of(text) is None


@pytest.mark.parametrize("text", [
    "Test Bakery",
    "sample:sadd",
    "ChIJshort",
    # a place page without the place ID: its 0x...:0x... feature ID is not one
    "https://www.google.com/maps/place/Test+Bakery/@25.28,51.53,17z/data=!3m1!4b1!4m6!3m5"
    "!1s0x3e45c534ffdce87f:0x44d9319f78cfd4b1!8m2!3d25.28!4d51.53",
    "https://maps.google.com/?cid=1234567890123456789",
    # someone else's site carrying a place-ID-looking parameter
    f"https://evil.example/maps?query_place_id={PID}",
    f"https://google.com.evil.example/maps?query_place_id={PID}",
    f"https://www.google.com/maps/search/?api=1&query_place_id={PID}%22%3E",
    "javascript:alert(1)",
])
def test_anything_without_a_place_id_is_refused(text):
    with pytest.raises(places.PlaceLinkError) as refused:
        places.parse_place(text)
    assert refused.value.code == "place_link_bad"
    assert places.place_id_of(text) is None


def test_an_empty_field_is_no_place_id():
    assert places.parse_place("") is None and places.parse_place(None) is None
    assert places.parse_place("   ") is None


def test_the_refusals_have_words_in_both_languages():
    for code in ("place_link_short", "place_link_bad"):
        en, ar = words.ERRORS[code]
        assert en and ar and en != ar


# ── switched off, and the sample ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("flag,key", [("", "k"), ("on", ""), ("off", "k"), ("", "")])
def test_without_both_settings_nothing_is_called_and_no_extra_is_added(monkeypatch, flag, key):
    monkeypatch.setenv("ALYR_DISCOVERY_PLACES", flag)
    monkeypatch.setenv("ALYR_PLACES_KEY", key)
    google = serve(monkeypatch, {PID: answer("details_bakery.json")})
    assert places.places_on() is False
    assert connectors.extras_for("manual", [place(PID)]) == ()
    assert read(place(PID)).places == [] and google.seen == []


def test_the_extra_is_added_only_for_a_place_with_a_place_id_and_never_for_the_sample():
    [extra] = connectors.extras_for("manual", [place(PID)])
    assert extra.kind == "places" and isinstance(extra, places.PlacesConnector)
    assert connectors.extras_for("manual", [place(None), place("sample:sadd")]) == ()
    assert connectors.extras_for("sample", [place(PID)]) == ()
    # with a website too, both are added
    kinds = [e.kind for e in connectors.extras_for("manual", [place(PID, url="https://a.example")])]
    assert kinds == ["website", "places"]


# ── the call ───────────────────────────────────────────────────────────────────────────────


def test_one_get_to_googles_places_host_with_the_key_in_a_header_and_a_tight_mask(monkeypatch):
    google = serve(monkeypatch, {PID: answer("details_bakery.json")})
    a, b = place(PID), place(PID, area="Lusail")  # two places, one listing
    snapshot = read(a, b)
    assert len(google.seen) == 1
    request = google.seen[0]
    assert request.method == "GET"
    assert str(request.url).startswith(f"https://places.googleapis.com/v1/places/{PID}")
    assert request.url.params["languageCode"] == "en"
    assert request.headers["X-Goog-Api-Key"] == "test-key-not-real"
    assert "key" not in request.url.params  # never in the address, where logs keep it
    assert request.headers["X-Goog-FieldMask"].split(",") == [
        "displayName", "nationalPhoneNumber", "internationalPhoneNumber", "websiteUri",
        "regularOpeningHours", "businessStatus", "googleMapsUri", "rating", "userRatingCount"]
    for banned in ("reviews", "photos", "formattedAddress", "editorialSummary", "*"):
        assert banned not in request.headers["X-Goog-FieldMask"].split(",")
    assert {p.location_id for p in snapshot.places} == {a.id, b.id}
    assert snapshot.source == "places" and snapshot.business_profile is False
    assert SPENT == [1]  # one cost unit for one call


def test_what_google_says_is_the_listing_the_rules_read(monkeypatch):
    serve(monkeypatch, {PID: answer("details_bakery.json")})
    [p] = read(place(PID)).places
    listing = p.listing
    assert isinstance(listing, places.PlacesListing)
    assert (listing.found, listing.name, listing.phone) == (True, "Test Bakery Al Sadd",
                                                            "+974 5555 0123")
    assert listing.hours == {"sun": ("06:00", "22:00"), "mon": ("06:00", "22:00"),
                             "tue": ("06:00", "22:00"), "wed": ("06:00", "22:00"),
                             "thu": ("06:00", "22:00"), "fri": ("13:00", "22:00"),
                             "sat": ("06:00", "22:00")}
    assert (listing.rating, listing.review_count) == (4.6, 212)
    assert listing.url == "https://maps.google.com/?cid=1234567890123456789"
    assert listing.website_uri == "https://bakery.example/"
    assert listing.business_status == "OPERATIONAL"
    assert (listing.source, listing.read_at) == ("google", NOW)
    # what the public read cannot see is not measured
    assert listing.claimed is None and listing.whatsapp_link is None
    assert listing.photo_count is None and listing.categories is None and p.reviews is None


def test_a_listing_with_no_hours_phone_or_rating_shows_none_and_the_rating_is_not_measured(
        monkeypatch):
    serve(monkeypatch, {PID: answer("details_bare.json")})
    [p] = read(place(PID)).places
    assert p.listing.hours == {} and p.listing.phone == ""
    assert p.listing.rating is None and p.listing.review_count == 0
    assert p.listing.name == "مخبز تجريبي"
    assert p.listing.business_status == "CLOSED_TEMPORARILY"


def test_open_round_the_clock_and_after_midnight():
    assert places.hours_of(answer("details_all_day.json")["regularOpeningHours"]) == {
        d: ("00:00", "24:00") for d in ("sun", "mon", "tue", "wed", "thu", "fri", "sat")}
    late = {"periods": [
        {"open": {"day": 4, "hour": 18, "minute": 0}, "close": {"day": 5, "hour": 2, "minute": 0}},
        {"open": {"day": 5, "hour": 0, "minute": 0}, "close": {"day": 6, "hour": 0, "minute": 0}},
    ]}
    hours = places.hours_of(late)
    assert hours["thu"] == ("18:00", "02:00") and hours["fri"] == ("00:00", "24:00")
    assert hours["sat"] is None  # a day not named is closed


def test_a_split_shift_or_a_span_of_days_is_not_measured():
    assert places.hours_of(answer("details_split_shift.json")["regularOpeningHours"]) is None
    long = {"periods": [{"open": {"day": 1, "hour": 8}, "close": {"day": 3, "hour": 8}}]}
    assert places.hours_of(long) is None
    assert places.hours_of({"periods": [{"open": {"day": 9, "hour": 8}}]}) is None
    assert places.hours_of({"weekdayDescriptions": []}) is None  # no periods: not read


@pytest.mark.parametrize("trouble", [
    (404, answer("error_not_found.json")),
    (400, {"error": {"code": 400, "status": "INVALID_ARGUMENT"}}),
    (403, {"error": {"code": 403, "status": "PERMISSION_DENIED"}}),
    (429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}}),
    (500, {}),
    httpx.ConnectTimeout("too slow"),
    httpx.ReadTimeout("too slow"),
    (200, ["not", "an", "object"]),
])
def test_a_failure_is_not_measured_never_a_failed_run(monkeypatch, trouble):
    serve(monkeypatch, {PID: trouble, PID2: answer("details_bakery.json")})
    a, b = place(PID), place(PID2, area="Lusail")
    snapshot = read(a, b)
    assert snapshot.of(a.id) is None  # not "not found": Google's 404 says the ID is stale
    assert snapshot.of(b.id).listing.found is True
    assert (snapshot.read, snapshot.missed) == (1, 1)
    assert places.PlacesConnector.sentence(snapshot) == (
        "Read 1 Google listing live on Google Maps; 1 could not be read.")


def test_the_timeout_is_ten_seconds():
    assert places.TIMEOUT_SECONDS == 10.0


def test_the_run_budget_stops_the_calls_and_the_rest_is_not_measured(monkeypatch):
    google = serve(monkeypatch, {PID: answer("details_bakery.json"),
                                 PID2: answer("details_all_day.json")})
    snapshot = read(place(PID), place(PID2, area="Lusail"), budget=1)
    assert len(google.seen) == 1 and SPENT == [1]
    assert (snapshot.read, snapshot.missed) == (1, 1)


def test_the_step_sentence_counts_listings(monkeypatch):
    serve(monkeypatch, {PID: answer("details_bakery.json"), PID2: answer("details_bare.json")})
    assert places.PlacesConnector.sentence(read(place(PID), place(PID2))) == (
        "Read 2 Google listings live on Google Maps.")


# ── what the rules make of it ──────────────────────────────────────────────────────────────


def outcome(rule_id: str, snapshot: Snapshot, locations: list[Location]):
    ctx = rules.Context(snapshot, locations, now=NOW)
    return {o.location_id: o for o in rules.RULE_BY_ID[rule_id].check(ctx)}


def test_the_rules_read_the_live_listing_and_the_owner_side_stays_not_measured(monkeypatch):
    serve(monkeypatch, {PID: answer("details_bare.json")})
    a = place(PID)
    snapshot = read(a)
    assert outcome("hours_missing", snapshot, [a])[a.id].state == rules.FAIL
    assert outcome("listing_missing", snapshot, [a])[a.id].state == rules.PASS
    # decision 9: whether it is claimed and the replies need the Business Profile
    assert outcome("listing_unclaimed", snapshot, [a])[a.id].state == rules.NOT_MEASURED
    assert outcome("review_unanswered", snapshot, [a])[a.id].state == rules.NOT_MEASURED
    assert outcome("rating_low", snapshot, [a])[a.id].state == rules.NOT_MEASURED
    assert outcome("whatsapp_link_missing", snapshot, [a])[a.id].state == rules.NOT_MEASURED


def test_merged_into_a_recorded_round_the_owner_side_still_needs_the_profile(monkeypatch):
    """A round recorded by hand sees claims and replies; a place it did not describe and the
    Places read filled does not: its `claimed` is None, so the rule is not measured for it."""
    serve(monkeypatch, {PID: answer("details_bakery.json")})
    a = place(PID)
    primary = Snapshot("manual", NOW, [PlaceSnapshot(a.id, Listing(found=None))])
    merged = connectors.merge(primary, read(a))
    assert merged.of(a.id).listing.found is True
    assert outcome("listing_unclaimed", merged, [a])[a.id].state == rules.NOT_MEASURED
    assert outcome("rating_low", merged, [a])[a.id].state == rules.PASS


def test_merge_keeps_a_listing_the_main_source_described():
    a, b, c = place(PID), place(PID2, area="Lusail"), place(PID, area="Wakra")
    staff = Listing(found=True, name="As recorded")
    primary = Snapshot("manual", NOW, [
        PlaceSnapshot(a.id, staff),
        PlaceSnapshot(b.id, Listing(found=None), Website(url="https://b.example")),
    ])
    live = places.PlacesListing(found=True, name="Live", read_at=NOW)
    extra = Snapshot("places", NOW, [PlaceSnapshot(p.id, live) for p in (a, b, c)])
    merged = connectors.merge(primary, extra)
    assert merged.source == "manual"
    assert merged.of(a.id).listing is staff
    assert merged.of(b.id).listing is live and merged.of(b.id).website.url == "https://b.example"
    assert merged.of(c.id).listing is live


# ── what is kept ───────────────────────────────────────────────────────────────────────────


def test_evidence_from_the_live_listing_is_googles_dated_when_read(monkeypatch):
    serve(monkeypatch, {PID: answer("details_bakery.json")})
    a = place(PID)
    primary = Snapshot("manual", NOW - timedelta(days=9), [
        PlaceSnapshot(a.id, Listing(found=None),
                      Website(url="https://a.example", phone="+97444440000")),
    ])
    merged = connectors.merge(primary, read(a))
    hit = outcome("phone_conflict", merged, [a])[a.id]
    assert hit.state == rules.FAIL
    items = engine._evidence(hit, merged)
    listing = [e for e in items if e["where"] == "listing"]
    assert listing and all(e["source"] == "google" and e["seen_at"] == NOW.isoformat()
                           for e in listing)
    # what the connection said keeps its own source
    assert all(e["source"] == "manual" for e in items if e["where"] == "website")
    # and the reader is told it is Google Maps' (the attribution Google's terms ask for)
    shown = words.evidence_view(listing[0], "en")["where"]
    assert shown == "Google listing (Google Maps, read live)"
    assert "Google Maps" in words.evidence_view(listing[0], "ar")["where"]


def test_a_business_wide_finding_quoting_live_listings_is_googles(monkeypatch):
    serve(monkeypatch, {PID: answer("details_bakery.json"),
                        PID2: answer("details_split_shift.json")})
    a, b = place(PID), place(PID2, area="Lusail")
    snapshot = read(a, b)
    hit = outcome("name_conflict", snapshot, [a, b])[None]
    assert hit.state == rules.FAIL
    assert {e["source"] for e in engine._evidence(hit, snapshot)} == {"google"}


def test_nothing_from_the_live_listing_is_kept_as_a_findings_observed_values(monkeypatch):
    serve(monkeypatch, {PID: answer("details_bakery.json")})
    a = place(PID)
    snapshot = read(a)
    for rule_id in ("hours_missing", "phone_conflict", "name_conflict", "category_missing"):
        assert proposals.observed_for(rule_id, a.id, snapshot, [a]) == {}


def test_google_evidence_is_removed_after_thirty_days():
    old = (NOW - timedelta(days=31)).isoformat()
    items = [
        {"label": "listing_phone", "value": "+974 5555 0123", "where": "listing",
         "seen_at": old, "source": "google"},
        {"label": "website_phone", "value": "+97444440000", "where": "website",
         "seen_at": old, "source": "website"},
    ]
    kept, changed = retention.strip_evidence(items, connectors.base.GOOGLE_SOURCES,
                                             NOW - retention.KEEP_FOR)
    assert changed and kept[0]["value"] == retention.REMOVED
    assert kept[1]["value"] == "+97444440000"


def test_the_live_read_is_never_a_business_profile_and_never_writes():
    connector = places.PlacesConnector()
    assert connector.writes == frozenset() and connector.undoable == frozenset()
    assert not hasattr(connector, "apply")
    assert "places" in connectors.base.GOOGLE_SOURCES and "google" in connectors.base.GOOGLE_SOURCES
