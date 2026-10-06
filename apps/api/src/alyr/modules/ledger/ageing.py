from dataclasses import dataclass, field
from datetime import datetime

BUCKETS = ("d0_30", "d31_60", "d61_90", "d90_plus")


@dataclass
class Aged:
    balance: int = 0
    oldest_days: int = 0
    buckets: dict[str, int] = field(default_factory=lambda: dict.fromkeys(BUCKETS, 0))


def bucket_for(days: int) -> str:
    if days <= 30:
        return "d0_30"
    if days <= 60:
        return "d31_60"
    if days <= 90:
        return "d61_90"
    return "d90_plus"


def age(entries: list[tuple[str, int, datetime]], now: datetime) -> Aged:
    """Work out what is still owed and how old it is.

    `entries` are (kind, amount, created_at). Payments settle the oldest debt first,
    which is how a shop's paper credit book is read.
    """
    debts = sorted(
        ([amount, at] for kind, amount, at in entries if kind == "sale" or amount > 0 and
         kind == "adjustment"),
        key=lambda d: d[1],
    )
    credit = sum(
        amount if kind == "payment" else -amount
        for kind, amount, _ in entries
        if kind == "payment" or (kind == "adjustment" and amount < 0)
    )
    result = Aged()
    for debt in debts:
        settled = min(credit, debt[0])
        credit -= settled
        remaining = debt[0] - settled
        if remaining <= 0:
            continue
        days = max((now - debt[1]).days, 0)
        result.buckets[bucket_for(days)] += remaining
        result.oldest_days = max(result.oldest_days, days)
        result.balance += remaining
    # Paid more than owed: show the credit rather than hide it.
    result.balance -= credit
    return result
