"""The score is arithmetic and nothing else (spec 065, "Scoring"): the share of checks that pass in
each part, a part that was not measured is `null` and said so, the total is the weighted mean of
the measured parts with their weights renormalised, and nothing is invented."""

from uuid import uuid4

from alyr.modules.discovery import rules, scoring

FAIL, PASS, NM = rules.FAIL, rules.PASS, rules.NOT_MEASURED


def oc(rule_id: str, state: str) -> rules.Outcome:
    return rules.Outcome(rule_id, uuid4(), state)


def many(rule_id: str, passed: int = 0, failed: int = 0, unmeasured: int = 0) -> list:
    return ([oc(rule_id, PASS)] * passed + [oc(rule_id, FAIL)] * failed
            + [oc(rule_id, NM)] * unmeasured)


def test_the_part_weights_are_the_ones_written_down():
    assert scoring.PART_WEIGHTS == {
        "presence": 40, "reviews": 25, "website": 15, "whatsapp": 10, "ai": 10}


def test_a_part_is_the_weighted_share_of_its_measured_checks_that_pass():
    # listing_missing counts 3 and hours_missing 2: (3*4 + 2*5) / (3*5 + 2*5) = 22 / 25
    outcomes = many("listing_missing", passed=4, failed=1) + many("hours_missing", passed=5)
    parts = scoring.part_values(outcomes)
    assert parts["presence"] == {"value": 88, "measured": True, "weight": 40}


def test_a_check_that_was_not_measured_is_not_a_check_at_all():
    base = many("listing_missing", passed=4, failed=1)
    padded = base + many("listing_missing", unmeasured=10) + many("hours_missing", unmeasured=3)
    assert scoring.part_values(padded) == scoring.part_values(base)


def test_a_part_with_no_measured_check_is_null_and_not_measured_never_a_number():
    parts = scoring.part_values(many("review_unanswered", unmeasured=4))
    assert parts["reviews"] == {"value": None, "measured": False, "weight": 25}
    assert parts["website"] == {"value": None, "measured": False, "weight": 15}


def test_ai_is_never_measured_in_phase_one_and_is_left_out_of_the_total():
    everything = [oc(r.id, PASS) for r in rules.RULES]
    parts = scoring.part_values(everything)
    assert parts["ai"] == {"value": None, "measured": False, "weight": 10}
    # every other part is 100, and the total is 100, not 90: the missing part is not zero
    assert scoring.total(parts) == 100


def test_the_total_is_the_weighted_mean_of_the_measured_parts_with_weights_renormalised():
    outcomes = (
        many("listing_missing", passed=4, failed=1) + many("hours_missing", passed=5)  # 88
        + many("review_unanswered", passed=1, failed=1)                                # 50
        + many("whatsapp_link_missing", passed=2)                                      # 100
    )  # the website is not measured
    total, parts = scoring.score(outcomes)
    assert [parts[p]["value"] for p in ("presence", "reviews", "website", "whatsapp", "ai")] == [
        88, 50, None, 100, None]
    # (88*40 + 50*25 + 100*10) / (40 + 25 + 10) = 5770 / 75 = 76.93...
    assert total == 77


def test_one_measured_part_is_the_whole_score_whatever_its_weight():
    total, parts = scoring.score(many("website_location_missing", passed=1, failed=3))
    assert parts["website"]["value"] == 25 and total == 25
    total, _ = scoring.score(many("whatsapp_link_missing", passed=3, failed=1))
    assert total == 75


def test_rounding_is_half_up_not_to_even():
    # 1 of 8 is 12.5: half up gives 13 (to even would give 12); 3 of 8 is 37.5, giving 38
    assert scoring.part_values(many("category_missing", passed=1, failed=7))["presence"][
        "value"] == 13
    assert scoring.part_values(many("category_missing", passed=3, failed=5))["presence"][
        "value"] == 38
    # and the total rounds the same way: presence 13 alone
    assert scoring.score(many("category_missing", passed=1, failed=7))[0] == 13
    assert scoring.score(many("category_missing", passed=0, failed=7))[0] == 0


def test_nothing_measured_is_no_score_at_all_not_zero():
    total, parts = scoring.score([])
    assert total is None and not any(p["measured"] for p in parts.values())
    assert scoring.score(many("photos_few", unmeasured=5))[0] is None


def test_the_score_is_exact_fractions_the_same_every_time():
    # 1/3 in two parts: floats would drift; fractions give the same integer on every machine
    outcomes = many("listing_unclaimed", passed=1, failed=2) + many("rating_low", passed=1,
                                                                    failed=2)
    assert scoring.score(outcomes) == scoring.score(outcomes)
    assert scoring.score(outcomes)[0] == 33


def test_a_failed_check_costs_its_rules_weight():
    heavy = scoring.part_values(many("listing_missing", failed=1) + many("photos_few", passed=1))
    light = scoring.part_values(many("listing_missing", passed=1) + many("photos_few", failed=1))
    # weights 3 and 1: failing the heavier rule costs 75 points, the lighter one 25
    assert (heavy["presence"]["value"], light["presence"]["value"]) == (25, 75)
