"""The range around "named in N of M", and when a change may be named (DECISIONS 7, research R4
section 2.3). Pure arithmetic, no I/O.

**The range is the Wilson score interval at 95%** (z = 1.959964): for k of n answers it is the
band where the true share of answers naming the business most likely lies, for these questions,
this tool and these settings. Wilson rather than the plain "share plus or minus" because it stays
inside 0 to 100 and behaves at small n and at 0 or n (0 of 6 is 0 to 39%, not 0 to 0). It is
shown as whole percents rounded half up; the comparison below uses the unrounded bounds.

**A change is named only when** both check-ups counted at least `MIN_FOR_CHANGE` (30) answers
from that tool in that language, **and** the two ranges do not overlap. Otherwise the answer is
"no change named", with the reason. This is conservative on purpose: at 30 answers it needs a
shift of about 25 to 30 points (R4), and answers change every time they are asked.

**A share (a percentage) is given only from `MIN_FOR_SHARE` (30) answers**; below that the screen
says the count and the range. Never a position, never a rank (R4: "a rank is noise").

The interval assumes the answers are independent draws. The questions are fixed, so a range speaks
for "these questions, this tool, these settings", not for every customer: the screen says so.
"""

from dataclasses import dataclass
from math import sqrt

Z95 = 1.959963984540054
MIN_FOR_CHANGE = 30
MIN_FOR_SHARE = 30
METHOD = "wilson_95"

FIRST, NOT_ENOUGH, NO_CHANGE, UP, DOWN = "first", "not_enough", "no_change", "up", "down"


def wilson(named: int, counted: int, z: float = Z95) -> tuple[float, float]:
    """The interval as fractions from 0 to 1. `counted` must be at least 1."""
    if counted < 1 or not 0 <= named <= counted:
        raise ValueError("named must be between 0 and counted, and counted at least 1")
    p = named / counted
    z2 = z * z
    centre = p + z2 / (2 * counted)
    spread = z * sqrt(p * (1 - p) / counted + z2 / (4 * counted * counted))
    denominator = 1 + z2 / counted
    low = max(0.0, (centre - spread) / denominator)
    high = min(1.0, (centre + spread) / denominator)
    if named == 0:
        low = 0.0
    if named == counted:
        high = 1.0
    return low, high


def _percent(value: float) -> int:
    return int(value * 100 + 0.5 + 1e-9)


def range_view(named: int, counted: int) -> dict | None:
    """`{"low", "high"}` in whole percents, or None when nothing was counted."""
    if counted < 1:
        return None
    low, high = wilson(named, counted)
    return {"low": _percent(low), "high": _percent(high)}


def share(named: int, counted: int) -> int | None:
    """The share in whole percents, only from `MIN_FOR_SHARE` counted answers."""
    if counted < MIN_FOR_SHARE:
        return None
    return int((200 * named + counted) // (2 * counted))  # half up, exact


@dataclass(frozen=True)
class Count:
    named: int
    counted: int


def compare(previous: Count | None, last: Count) -> str:
    """One of first, not_enough, no_change, up, down (see the module's words)."""
    if previous is None:
        return FIRST
    if previous.counted < MIN_FOR_CHANGE or last.counted < MIN_FOR_CHANGE:
        return NOT_ENOUGH
    p_low, p_high = wilson(previous.named, previous.counted)
    low, high = wilson(last.named, last.counted)
    if low > p_high:
        return UP
    if high < p_low:
        return DOWN
    return NO_CHANGE
