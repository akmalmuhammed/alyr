"""The score, and nothing but arithmetic (spec 065, "Scoring").

`score_parts` is `{presence, reviews, website, whatsapp, ai}`, each `{value, measured, weight}`.

* A part's value is the share of its checks that pass across places, 0 to 100, each check
  counting as much as its rule's `weight`. A check that was `not_measured` is not a check.
* A part with no measured check has `measured = false` and `value = null`: the screen says "Not
  measured yet", never a number.
* `ai` is the Answers check (spec 068): the share of counted answers that name the business,
  each answer one check, measured only from `MIN_ANSWERS` counted answers. With the check off,
  or too few answers, it stays `measured = false` and out of the total, as in Phase 1.
* The total is the weighted mean of the measured parts only, their `weight`s renormalised to add
  up to 100 among themselves; rounded half up; `null` when nothing was measured.

Exact fractions, never floats, so a score is the same on every machine. A score is not a
ranking and not a forecast, and nothing here is invented.
"""

from dataclasses import dataclass
from fractions import Fraction

from alyr.modules.discovery.rules import FAIL, NOT_MEASURED, PARTS, PASS, RULE_BY_ID, Outcome

# What each part is worth in the total before the unmeasured ones are left out.
PART_WEIGHTS = {"presence": 40, "reviews": 25, "website": 15, "whatsapp": 10, "ai": 10}


MIN_ANSWERS = 4


@dataclass(frozen=True)
class AnswersTally:
    """The answers a check-up counted: how many named the business, out of how many were counted
    (an answer that could not be had is not counted)."""

    named: int
    counted: int

    @property
    def measured(self) -> bool:
        return self.counted >= MIN_ANSWERS


def _half_up(value: Fraction) -> int:
    return int((value + Fraction(1, 2)) // 1)


def part_values(outcomes: list[Outcome], answers: AnswersTally | None = None) -> dict[str, dict]:
    passed = {p: Fraction(0) for p in PARTS}
    counted = {p: Fraction(0) for p in PARTS}
    for outcome in outcomes:
        if outcome.state == NOT_MEASURED:
            continue
        rule = RULE_BY_ID[outcome.rule_id]
        counted[rule.part] += rule.weight
        if outcome.state == PASS:
            passed[rule.part] += rule.weight
        else:
            assert outcome.state == FAIL, outcome.state
    parts = {}
    for part in PARTS:
        measured = counted[part] > 0
        parts[part] = {
            "value": _half_up(100 * passed[part] / counted[part]) if measured else None,
            "measured": measured,
            "weight": PART_WEIGHTS[part],
        }
    if answers is not None and answers.measured:
        parts["ai"] = {
            "value": _half_up(Fraction(100 * answers.named, answers.counted)),
            "measured": True,
            "weight": PART_WEIGHTS["ai"],
        }
    return parts


def total(parts: dict[str, dict]) -> int | None:
    """The weighted mean of the measured parts, their weights renormalised."""
    measured = [p for p in parts.values() if p["measured"]]
    weight = sum(p["weight"] for p in measured)
    if not weight:
        return None
    return _half_up(sum(Fraction(p["value"] * p["weight"]) for p in measured) / weight)


def score(
    outcomes: list[Outcome], answers: AnswersTally | None = None
) -> tuple[int | None, dict[str, dict]]:
    parts = part_values(outcomes, answers)
    return total(parts), parts
