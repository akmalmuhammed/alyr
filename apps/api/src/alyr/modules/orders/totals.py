"""What an order costs: goods, discounts, delivery (ALY-150, `specs/014-pricing-pack/spec.md`).

Pure functions over plain values: no database, no clock of their own, no floats. The same
function prices a cart for the order page ("what will I pay"), the chat's draft and the order
itself, so the total shown before payment is the total charged, and a test can try thousands
of random carts against it.

**Money** is a whole number of minor units (dirhams; 100 to the riyal). A percentage is a
`Decimal`. There is ONE rounding rule: **a percentage is worked out once per rule, on the
amount it applies to, and rounded half up to a whole dirham**. That whole discount is then
shared out among the lines it covers by largest remainder (so the lines add up to it exactly,
and no line takes off more than it costs). The order total is the sum of what was stored:
`total = subtotal - discounts + delivery fee`. A line's own price times its quantity is rounded
half up too (`line_total`), which matters only once quantities have decimals.

**Order of things.** An item's price is first decided by the Catalog (sale price, or a price
group's price which replaces it, plus extras). Then discounts come off the goods, one rule
after another on what is left; then delivery is added. Delivery is never discounted.

**Floor.** The goods are never taken below QAR 1 (or below the goods themselves if they cost
less than that): a discount cannot make an order free or negative.

**Which rules apply.** Every automatic rule and every code the customer typed that is valid
becomes a candidate. Two applied rules must both be stackable; otherwise the combination that
takes the most off wins (ties go to the customer's own code, then to fewer rules). A code that
loses says so ("can't be combined with ...").
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from itertools import combinations
from uuid import UUID

# The least the goods may come to after discounts, in dirhams (QAR 1).
MIN_PAYABLE = 100
# Candidates considered together; the rest are dropped (the best by their own value stay).
MAX_CANDIDATES = 8

Quantity = int | Decimal


def round_half_up(value: Decimal) -> int:
    """The one rounding rule: to a whole minor unit, halves going up."""
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def line_total(unit_price: int, quantity: Quantity) -> int:
    """A line's price: the price of one times the quantity, rounded half up."""
    if isinstance(quantity, float) or isinstance(unit_price, float):
        raise TypeError("money is never a float")
    return round_half_up(Decimal(quantity) * Decimal(unit_price))


def allocate(total: int, weights: dict[int, int]) -> dict[int, int]:
    """Share `total` among the keys of `weights` in proportion to them, by largest remainder,
    ties to the lower key. The shares add up to `total` exactly and no share is more than its
    weight (as long as `total` is not more than the weights' sum)."""
    out = dict.fromkeys(weights, 0)
    whole = sum(weights.values())
    if total <= 0 or whole <= 0:
        return out
    leftovers = []
    for key, weight in weights.items():
        share, rest = divmod(total * weight, whole)
        out[key] = share
        leftovers.append((-rest, key))
    missing = total - sum(out.values())
    for _, key in sorted(leftovers)[:missing]:
        out[key] += 1
    return out


@dataclass(frozen=True)
class Line:
    """One line of a checked cart."""

    index: int
    item_id: UUID
    category: str
    unit_price: int
    quantity: Quantity

    @property
    def gross(self) -> int:
        return line_total(self.unit_price, self.quantity)


@dataclass(frozen=True)
class Rule:
    """A discount rule, as stored (`discount_rules`)."""

    id: UUID
    kind: str  # "coupon" | "auto"
    code: str
    value_type: str  # "percent" | "amount" | "free_units"
    percent: Decimal | None = None
    amount: int | None = None
    buy_qty: int | None = None
    get_qty: int | None = None
    scope: str = "order"
    item_ids: frozenset = frozenset()
    categories: frozenset = frozenset()  # lower case
    min_order: int = 0
    usage_limit: int | None = None
    per_customer_limit: int | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    stackable: bool = False
    group_id: UUID | None = None
    status: str = "active"
    uses: int = 0
    name: str = ""
    name_ar: str = ""

    def covers(self, line: Line) -> bool:
        if self.scope == "order":
            return True
        return line.item_id in self.item_ids or line.category.lower() in self.categories


@dataclass(frozen=True)
class Context:
    """What the rules are judged against besides the cart."""

    now: datetime
    group_id: UUID | None = None
    # How often this customer has already used each rule (cancelled orders do not count).
    customer_uses: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Problem:
    """Why a rule does not apply. `code` is a key of `discount_text.MESSAGES`; `details` are
    what the sentence is built from."""

    code: str
    details: dict = field(default_factory=dict)


@dataclass
class Applied:
    rule: Rule
    amount: int
    per_line: dict[int, int]


@dataclass
class Result:
    subtotal: int
    applied: list[Applied]
    # A candidate that did not apply, with the reason (only candidates the customer chose are
    # worth telling about: the caller filters).
    rejected: list[tuple[Rule, Problem]]
    line_discounts: dict[int, int]

    @property
    def discount_total(self) -> int:
        return sum(a.amount for a in self.applied)

    @property
    def goods(self) -> int:
        """The goods after discounts."""
        return self.subtotal - self.discount_total


# ── judging one rule ────────────────────────────────────────────────────────────────────


def availability(rule: Rule, ctx: Context) -> Problem | None:
    """Is this rule open to this customer now (status, dates, price group, uses left)? None when
    it is. Says nothing about the cart."""
    if rule.status == "paused":
        return Problem("coupon_paused")
    if rule.status == "ended":
        return Problem("coupon_ended", {"on": rule.ends_at})
    if rule.starts_at is not None and ctx.now < rule.starts_at:
        return Problem("coupon_not_started", {"on": rule.starts_at})
    if rule.ends_at is not None and ctx.now >= rule.ends_at:
        return Problem("coupon_ended", {"on": rule.ends_at})
    if rule.group_id is not None and rule.group_id != ctx.group_id:
        return Problem("coupon_group")
    if rule.usage_limit is not None and rule.uses >= rule.usage_limit:
        return Problem("coupon_used_up")
    if rule.per_customer_limit is not None and (
        ctx.customer_uses.get(rule.id, 0) >= rule.per_customer_limit
    ):
        return Problem("coupon_used_by_you", {"limit": rule.per_customer_limit})
    return None


def judge(rule: Rule, lines: list[Line], subtotal: int, ctx: Context) -> Problem | None:
    """Can this rule apply to this cart, for this customer, now? None when it can."""
    problem = availability(rule, ctx)
    if problem is not None:
        return problem
    if not any(rule.covers(line) for line in lines):
        return Problem("coupon_no_match")
    if subtotal < rule.min_order:
        return Problem("coupon_minimum", {"minimum": rule.min_order})
    return None


# ── taking a rule off the goods ────────────────────────────────────────────────────────


def _take(rule: Rule, lines: list[Line], remaining: dict[int, int], allowed: int) -> dict[int, int]:
    """What `rule` takes off each line it covers, given what is left of each line, never more
    than `allowed` in all (the floor)."""
    covered = {line.index: remaining[line.index] for line in lines if rule.covers(line)}
    covered = {i: r for i, r in covered.items() if r > 0}
    base = sum(covered.values())
    if base <= 0 or allowed <= 0:
        return {}
    if rule.value_type == "percent":
        want = round_half_up(Decimal(base) * rule.percent / Decimal(100))
        shares = allocate(min(want, base, allowed), covered)
    elif rule.value_type == "amount":
        shares = allocate(min(rule.amount, base, allowed), covered)
    else:
        buy, get = rule.buy_qty, rule.get_qty
        shares = {}
        for line in lines:
            if line.index not in covered:
                continue
            free = int(Decimal(line.quantity) // Decimal(buy + get)) * get
            shares[line.index] = min(free * line.unit_price, covered[line.index])
        over = sum(shares.values()) - allowed
        if over > 0:
            # More free goods than the floor allows: take what is allowed, from the dearest.
            shares = allocate(allowed, {i: s for i, s in shares.items() if s > 0})
    return {i: s for i, s in shares.items() if s > 0}


def _apply(
    chosen: list[Rule], lines: list[Line], subtotal: int
) -> tuple[list[Applied], dict[int, int]]:
    """The rules one after another, each on what the ones before left."""
    remaining = {line.index: line.gross for line in lines}
    floor = min(subtotal, MIN_PAYABLE)
    applied: list[Applied] = []
    for rule in chosen:
        allowed = sum(remaining.values()) - floor
        shares = _take(rule, lines, remaining, allowed)
        amount = sum(shares.values())
        for i, share in shares.items():
            remaining[i] -= share
        applied.append(Applied(rule, amount, shares))
    return applied, {line.index: line.gross - remaining[line.index] for line in lines}


def _ordered(rules: list[Rule]) -> list[Rule]:
    """Automatic rules first, then the customer's codes in the order they were typed."""
    return [r for r in rules if r.kind == "auto"] + [r for r in rules if r.kind == "coupon"]


def compute(
    lines: list[Line], candidates: list[Rule], ctx: Context
) -> Result:
    """Price a cart: the subtotal, which of `candidates` apply and what each takes off, and
    what is left of each line. `candidates` are the automatic rules and the codes typed, the
    codes in the order typed."""
    subtotal = sum(line.gross for line in lines)
    rejected: list[tuple[Rule, Problem]] = []
    valid: list[Rule] = []
    for rule in candidates:
        problem = judge(rule, lines, subtotal, ctx)
        if problem is None:
            valid.append(rule)
        else:
            rejected.append((rule, problem))
    if len(valid) > MAX_CANDIDATES:
        # Keep the ones worth most on their own, and the codes the customer typed.
        alone = {
            r.id: sum(_apply([r], lines, subtotal)[1].values()) for r in valid
        }
        keep = sorted(valid, key=lambda r: (r.kind != "coupon", -alone[r.id]))[:MAX_CANDIDATES]
        for r in valid:
            if r not in keep:
                rejected.append((r, Problem("coupon_no_effect")))
        valid = [r for r in valid if r in keep]
    best: tuple | None = None
    # Every set of rules that may all apply together, and what it takes off.
    for size in range(len(valid), -1, -1):
        for group in combinations(valid, size):
            if size > 1 and not all(r.stackable for r in group):
                continue
            applied, per_line = _apply(_ordered(list(group)), lines, subtotal)
            if any(a.amount == 0 for a in applied):
                continue  # a rule that takes nothing off is not applied
            total = sum(a.amount for a in applied)
            typed = sum(1 for r in group if r.kind == "coupon")
            # More off first; then the customer's own codes; then fewer rules.
            rank = (total, typed, -len(group))
            if best is None or rank > best[0]:
                best = (rank, group, applied, per_line)
    if best is None:
        applied, per_line = [], dict.fromkeys((line.index for line in lines), 0)
        group = ()
    else:
        _, group, applied, per_line = best
    chosen = {r.id for r in group}
    for rule in valid:
        if rule.id in chosen:
            continue
        others = [r for r in group if not (rule.stackable and r.stackable)]
        if others:
            rejected.append((rule, Problem("coupon_not_combined", {"with": others[0]})))
        else:
            rejected.append((rule, Problem("coupon_no_effect")))
    return Result(subtotal, applied, rejected, per_line)


# ── delivery ────────────────────────────────────────────────────────────────────────────


def delivery_fee(fee: int, free_over: int | None, goods: int) -> int:
    """The fee for a zone: nothing when the goods (after discounts) reach `free_over`."""
    if free_over is not None and goods >= free_over:
        return 0
    return fee
