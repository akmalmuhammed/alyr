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


def without_reversed(entries: list[tuple]) -> list[tuple[str, int, datetime]]:
    """Take out the credit sales that were reversed, and the reversals that took them out.

    An entry that came from an order is (kind, amount, created_at, order_id). A reversal
    undoes the sale of the same order as if neither had happened, so the sale leaves the age
    bucket it was in; a payment of the same size would only have settled the oldest debt. A
    reversal with no sale to undo (an old entry that was never tied to its order) counts as
    a payment."""
    sales = {e[3] for e in entries if e[0] == "sale" and len(e) > 3 and e[3]}
    undone = {e[3] for e in entries if e[0] == "reversal" and len(e) > 3 and e[3] in sales}
    kept = []
    for entry in entries:
        kind, amount, at = entry[:3]
        if kind in ("sale", "reversal") and len(entry) > 3 and entry[3] in undone:
            continue
        kept.append(("payment" if kind == "reversal" else kind, amount, at))
    return kept


def age(entries: list[tuple], now: datetime) -> Aged:
    """Work out what is still owed and how old it is.

    `entries` are (kind, amount, created_at), plus the order's ID for an entry that came
    from an order. Payments settle the oldest debt first, which is how a shop's paper credit
    book is read. A reversed sale is not a debt at all (see `without_reversed`).
    """
    entries = without_reversed(entries)
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
