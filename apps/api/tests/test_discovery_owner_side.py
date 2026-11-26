"""Whether a listing is claimed and whether the owner replied to reviews cannot be read from
Google's public listing (Places has no such fields, research R2), so the two rules that need
them are "not measured" unless the snapshot was read through the owner's connected Business
Profile (Discovery decision 9). A round ALYR staff recorded by hand (D-169) is a person reading
the public page, which does show both, so it still measures them. Pure: no database."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from alyr.modules.discovery import rules
from alyr.modules.discovery.connectors.base import (
    Listing,
    Location,
    PlaceSnapshot,
    Review,
    Snapshot,
)

NOW = datetime(2026, 11, 26, 9, 0, tzinfo=UTC)


def _ctx(source: str, business_profile: bool = False) -> tuple[rules.Context, Location]:
    loc = Location(uuid4(), "Nuqta Car Care - Al Sadd", area="Al Sadd")
    reviews = [Review(f"r{n}", 2, NOW - timedelta(days=20 + n)) for n in range(4)]
    place = PlaceSnapshot(loc.id, Listing(found=True, claimed=False), reviews=reviews)
    snap = Snapshot(source, NOW, [place], business_profile=business_profile)
    return rules.Context(snap, [loc], now=NOW), loc


def _state(rule_id: str, ctx: rules.Context) -> str:
    [outcome] = rules.RULE_BY_ID[rule_id].check(ctx)
    return outcome.state


@pytest.mark.parametrize("rule_id", ["listing_unclaimed", "review_unanswered"])
@pytest.mark.parametrize("source", ["places", "sample", "google"])
def test_a_public_read_does_not_measure_the_owner_side(rule_id, source):
    ctx, _ = _ctx(source)
    assert _state(rule_id, ctx) == rules.NOT_MEASURED


@pytest.mark.parametrize("rule_id", ["listing_unclaimed", "review_unanswered"])
def test_a_connected_business_profile_measures_it(rule_id):
    ctx, _ = _ctx("gbp", business_profile=True)
    assert _state(rule_id, ctx) == rules.FAIL


@pytest.mark.parametrize("rule_id", ["listing_unclaimed", "review_unanswered"])
def test_a_round_recorded_by_hand_measures_what_staff_recorded(rule_id):
    ctx, _ = _ctx("manual")
    assert _state(rule_id, ctx) == rules.FAIL


def test_the_other_listing_rules_are_still_measured_from_a_public_read():
    ctx, _ = _ctx("places")
    assert _state("listing_missing", ctx) == rules.PASS
