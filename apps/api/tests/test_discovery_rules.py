"""The twelve rules (spec 065): each fires where it should, does not where it should not, and says
`not_measured` instead of firing when the connector did not give the field. They are pure
functions of the snapshot, so these run on hand-made ones; the same rules run through a real
check-up, over HTTP and PostgreSQL, in `test_discovery_engine.py`."""

import pytest

from alyr.modules.discovery import rules
from alyr.modules.discovery.connectors import Listing, Snapshot
from alyr.modules.discovery.connectors.sample import EARLY_CLOSE, STANDARD
from discovery_support import (
    NOW,
    WA,
    context,
    listing,
    location,
    one,
    outcome,
    place,
    review,
    website,
)

FAIL, PASS, NM = rules.FAIL, rules.PASS, rules.NOT_MEASURED
LOC = location()


def test_there_are_twelve_rules_each_with_a_part_a_kind_and_a_severity():
    assert [r.id for r in rules.RULES] == [
        "listing_missing", "listing_unclaimed", "hours_missing", "hours_conflict",
        "phone_conflict", "name_conflict", "category_missing", "photos_few",
        "website_location_missing", "whatsapp_link_missing", "review_unanswered", "rating_low",
    ]
    assert {r.part for r in rules.RULES} == {"presence", "reviews", "website", "whatsapp"}
    assert {r.kind for r in rules.RULES} == {"agent", "owner", "process"}


# ── listing_missing ─────────────────────────────────────────────────────────────────────


def test_listing_missing_fires_when_there_is_no_listing():
    got = one("listing_missing", LOC, lst=Listing(found=False))
    assert got.state == FAIL and got.evidence[0].value == "~not_found"


def test_listing_missing_does_not_fire_when_there_is_one():
    assert one("listing_missing", LOC).state == PASS


def test_a_place_the_connector_said_nothing_about_is_not_measured_by_any_rule():
    empty = rules.Context(Snapshot("sample", NOW, []), [LOC], {}, NOW)
    for rule in rules.RULES:
        states = {o.state for o in rule.check(empty)}
        assert states == {NM}, rule.id


# ── listing_unclaimed ───────────────────────────────────────────────────────────────────


def test_listing_unclaimed_fires_when_not_claimed():
    assert one("listing_unclaimed", LOC, lst=listing(claimed=False)).state == FAIL


def test_listing_unclaimed_does_not_fire_when_claimed():
    assert one("listing_unclaimed", LOC, lst=listing(claimed=True)).state == PASS


def test_listing_unclaimed_is_not_measured_when_the_field_is_absent_or_there_is_no_listing():
    assert one("listing_unclaimed", LOC, lst=listing(claimed=None)).state == NM
    assert one("listing_unclaimed", LOC, lst=Listing(found=False)).state == NM


# ── hours_missing ───────────────────────────────────────────────────────────────────────


def test_hours_missing_fires_when_no_day_is_open():
    assert one("hours_missing", LOC, lst=listing(hours={})).state == FAIL
    assert one("hours_missing", LOC, lst=listing(hours={"sat": None})).state == FAIL


def test_hours_missing_does_not_fire_with_hours():
    assert one("hours_missing", LOC, lst=listing(hours=STANDARD)).state == PASS


def test_hours_missing_is_not_measured_when_the_field_is_absent():
    assert one("hours_missing", LOC, lst=listing(hours=None)).state == NM


# ── hours_conflict ──────────────────────────────────────────────────────────────────────


def test_hours_conflict_fires_when_listing_and_website_differ_and_names_the_days():
    got = one("hours_conflict", LOC, lst=listing(hours=STANDARD), web=website(hours=EARLY_CLOSE))
    assert got.state == FAIL
    differ = next(e for e in got.evidence if e.label == "hours_differ")
    assert differ.value == "~days:sun,mon,tue,wed,thu,fri,sat"
    assert {e.label for e in got.evidence} >= {"listing_hours", "website_hours"}


def test_hours_conflict_does_not_fire_when_they_agree():
    assert one("hours_conflict", LOC, web=website()).state == PASS


def test_hours_conflict_is_not_measured_without_both_sets_of_hours():
    assert one("hours_conflict", LOC, web=website(hours=None)).state == NM
    assert one("hours_conflict", LOC, lst=listing(hours=None), web=website()).state == NM
    assert one("hours_conflict", LOC, lst=listing(hours={}), web=website()).state == NM
    assert one("hours_conflict", LOC, web=None).state == NM


# ── phone_conflict ──────────────────────────────────────────────────────────────────────


def test_phone_conflict_fires_on_different_numbers():
    got = one("phone_conflict", LOC, lst=listing(phone="+974 5555 0112"),
              web=website(phone="+974 5555 0129"))
    assert got.state == FAIL
    assert [e.value for e in got.evidence] == ["+974 5555 0112", "+974 5555 0129"]


def test_phone_conflict_does_not_fire_on_the_same_number_written_differently():
    got = one("phone_conflict", LOC, lst=listing(phone="+974 5555 0112"),
              web=website(phone="00974 55550112"))
    assert got.state == PASS
    assert one("phone_conflict", LOC, lst=listing(phone="5555 0112"),
               web=website(phone="+97455550112")).state == PASS


def test_phone_conflict_is_not_measured_when_either_number_is_missing():
    assert one("phone_conflict", LOC, lst=listing(phone=None), web=website()).state == NM
    assert one("phone_conflict", LOC, lst=listing(phone=""), web=website()).state == NM
    assert one("phone_conflict", LOC, web=website(phone=None)).state == NM
    assert one("phone_conflict", LOC, web=None).state == NM


# ── name_conflict (the whole business) ──────────────────────────────────────────────────


def _two(name_a, name_b, area_a="West Bay", area_b="Al Wakra"):
    a, b = location(area=area_a), location(area=area_b)
    return context((a, place(a, lst=listing(name=name_a))), (b, place(b, lst=listing(name=name_b))))


def test_name_conflict_fires_when_the_business_is_spelled_two_ways():
    got = outcome("name_conflict", _two("Nuqta Car Care", "Nuqta Car Wash - Wakra"))
    assert got.state == FAIL and got.location_id is None
    assert [e.label for e in got.evidence] == ["listing_name", "listing_name"]
    assert "Nuqta Car Wash - Wakra (Al Wakra)" in {e.value for e in got.evidence}


def test_name_conflict_ignores_case_legal_suffix_branch_part_and_spacing():
    ctx = _two("Nuqta Car Care", "NUQTA CARCARE W.L.L. - Al Wakra")
    assert outcome("name_conflict", ctx).state == PASS
    assert outcome("name_conflict", _two("Nuqta Car Care", "Nuqta Car Care LLC")).state == PASS


def test_name_conflict_is_not_measured_with_fewer_than_two_named_listings():
    a = location()
    one_listing = context((a, place(a, lst=listing(name="Nuqta Car Care"))))
    assert outcome("name_conflict", one_listing).state == NM
    assert outcome("name_conflict", _two(None, "Nuqta Car Care")).state == NM
    b = location(area="Al Wakra")
    missing = context((a, place(a, lst=listing(name="Nuqta Car Care"))),
                      (b, place(b, lst=Listing(found=False))))
    assert outcome("name_conflict", missing).state == NM


# ── category_missing ────────────────────────────────────────────────────────────────────


def test_category_missing_fires_with_no_category():
    assert one("category_missing", LOC, lst=listing(categories=[])).state == FAIL


def test_category_missing_does_not_fire_with_one():
    assert one("category_missing", LOC, lst=listing(categories=["Car wash"])).state == PASS


def test_category_missing_is_not_measured_when_the_field_is_absent():
    assert one("category_missing", LOC, lst=listing(categories=None)).state == NM


# ── photos_few ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("count,state", [(0, FAIL), (4, FAIL), (5, PASS), (30, PASS)])
def test_photos_few_fires_below_five(count, state):
    assert one("photos_few", LOC, lst=listing(photo_count=count)).state == state


def test_photos_few_is_not_measured_when_the_count_is_absent():
    assert one("photos_few", LOC, lst=listing(photo_count=None)).state == NM


# ── website_location_missing ────────────────────────────────────────────────────────────


def test_website_location_missing_fires_when_not_listed_or_with_no_page():
    not_listed = one("website_location_missing", LOC, web=website(lists_location=False))
    no_page = one("website_location_missing", LOC, web=website(has_location_page=False))
    assert (not_listed.state, not_listed.evidence[0].value) == (FAIL, "~not_listed")
    assert (no_page.state, no_page.evidence[0].value) == (FAIL, "~no_page")


def test_website_location_missing_does_not_fire_when_listed_with_a_page():
    assert one("website_location_missing", LOC, web=website()).state == PASS


def test_website_location_missing_is_not_measured_without_a_readable_website():
    assert one("website_location_missing", LOC, web=None).state == NM
    down = website(reachable=False, lists_location=False)
    assert one("website_location_missing", LOC, web=down).state == NM
    unknown = website(lists_location=None, has_location_page=None)
    assert one("website_location_missing", LOC, web=unknown).state == NM


# ── whatsapp_link_missing ───────────────────────────────────────────────────────────────


def test_whatsapp_link_missing_fires_when_the_website_has_no_link():
    got = one("whatsapp_link_missing", LOC, web=website(whatsapp_link=""))
    assert got.state == FAIL and got.evidence[0].value == "~none"


def test_whatsapp_link_missing_fires_when_the_link_points_to_another_number():
    got = one("whatsapp_link_missing", LOC, web=website(whatsapp_link="https://wa.me/97455550999"))
    assert got.state == FAIL
    assert {e.label for e in got.evidence} == {"website_whatsapp", "expected_whatsapp"}


def test_whatsapp_link_missing_fires_when_the_listing_has_none_even_if_the_website_has_one():
    got = one("whatsapp_link_missing", LOC, lst=listing(whatsapp_link=""), web=website())
    assert got.state == FAIL and [e.label for e in got.evidence] == ["listing_whatsapp"]


def test_whatsapp_link_missing_does_not_fire_with_the_right_link_in_either_form():
    assert one("whatsapp_link_missing", LOC, web=website(whatsapp_link=WA)).state == PASS
    api = "https://api.whatsapp.com/send?phone=97455550150&text=Hi"
    assert one("whatsapp_link_missing", LOC, web=website(whatsapp_link=api)).state == PASS


def test_whatsapp_link_missing_without_a_known_number_only_asks_for_a_link():
    loc = location(whatsapp=None)
    other = website(whatsapp_link="https://wa.me/97455550999")
    assert one("whatsapp_link_missing", loc, web=other).state == PASS


def test_whatsapp_link_missing_is_not_measured_when_no_source_says():
    assert one("whatsapp_link_missing", LOC, web=website(whatsapp_link=None)).state == NM
    assert one("whatsapp_link_missing", LOC, web=None).state == NM
    down = website(reachable=False, whatsapp_link="")
    assert one("whatsapp_link_missing", LOC, web=down).state == NM


# ── review_unanswered ───────────────────────────────────────────────────────────────────


def test_review_unanswered_fires_at_three_old_low_unanswered_reviews():
    reviews = [review(2, 10, n=1), review(3, 20, n=2), review(1, 40, n=3)]
    got = one("review_unanswered", LOC, reviews=reviews)
    assert got.state == FAIL
    assert {e.label: e.value for e in got.evidence} == {
        "unanswered_reviews": "3", "oldest_unanswered": "40"}


def test_review_unanswered_does_not_count_new_answered_or_good_reviews():
    reviews = [
        review(2, 10, n=1), review(3, 20, n=2),        # two that count: one short
        review(2, 3, n=3),                              # too new
        review(1, 30, replied=True, n=4),               # answered
        review(4, 30, n=5), review(5, 30, n=6),         # not low
    ]
    assert one("review_unanswered", LOC, reviews=reviews).state == PASS


def test_review_unanswered_counts_exactly_seven_days_as_too_new_and_eight_as_old():
    def three_at(days):
        return [review(1, days, n=i) for i in range(3)]

    assert one("review_unanswered", LOC, reviews=three_at(7)).state == PASS
    assert one("review_unanswered", LOC, reviews=three_at(8)).state == FAIL


def test_review_unanswered_is_not_measured_when_reviews_were_not_read():
    assert one("review_unanswered", LOC, reviews=None).state == NM
    assert one("review_unanswered", LOC, reviews=[]).state == PASS


# ── rating_low ──────────────────────────────────────────────────────────────────────────


def test_rating_low_fires_below_four_with_ten_reviews():
    got = one("rating_low", LOC, lst=listing(rating=3.9, review_count=10))
    assert got.state == FAIL
    assert [(e.label, e.value) for e in got.evidence] == [("rating", "3.9"), ("review_count", "10")]


def test_rating_low_does_not_fire_at_four_or_above():
    assert one("rating_low", LOC, lst=listing(rating=4.0, review_count=500)).state == PASS


def test_rating_low_is_not_measured_with_fewer_than_ten_reviews_or_missing_numbers():
    assert one("rating_low", LOC, lst=listing(rating=2.0, review_count=9)).state == NM
    assert one("rating_low", LOC, lst=listing(rating=None)).state == NM
    assert one("rating_low", LOC, lst=listing(review_count=None)).state == NM
    assert one("rating_low", LOC, lst=Listing(found=False)).state == NM


# ── the registry as a whole ─────────────────────────────────────────────────────────────


def test_a_tidy_place_passes_every_rule_that_can_be_measured_and_fires_none():
    tidy = context((LOC, place(LOC, web=website(), reviews=[review(5, 30, replied=True)])))
    states = {o.rule_id: o.state for o in rules.evaluate(tidy)}
    assert FAIL not in states.values()
    assert states["whatsapp_link_missing"] == PASS
    # one listing cannot be compared with another
    assert states["name_conflict"] == NM


def test_the_same_snapshot_gives_the_same_outcomes_and_the_same_fingerprints():
    ctx = context((LOC, place(LOC, lst=listing(claimed=False, photo_count=1))))
    first, second = rules.evaluate(ctx), rules.evaluate(ctx)
    assert first == second
    assert {o.fingerprint for o in first if o.state == FAIL} == {
        f"listing_unclaimed:{LOC.id}", f"photos_few:{LOC.id}"}
