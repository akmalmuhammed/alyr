"""The pricing arithmetic (ALY-150, `specs/014-pricing-pack/spec.md`): rounding, sharing a discount
among lines, the floor, which rules may be used together, and a property test that tries
thousands of random carts and rule sets against the identities the order relies on.

No database: `modules/orders/totals.py` is pure.
"""

import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from alyr.modules.orders import totals

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)
CTX = totals.Context(NOW)


def line(index, price, quantity=1, category="Cakes", item=None):
    return totals.Line(index, item or uuid4(), category, price, quantity)


def rule(**more):
    base = {"id": uuid4(), "kind": "coupon", "code": "TEST10", "value_type": "percent",
            "percent": Decimal(10)}
    return totals.Rule(**(base | more))


def apply(lines, *rules, ctx=CTX):
    return totals.compute(lines, list(rules), ctx)


# ── one rounding rule ─────────────────────────────────────────────────────────────────────


def test_a_line_is_its_price_times_its_quantity_rounded_half_up():
    assert totals.line_total(333, 3) == 999
    assert totals.line_total(333, Decimal("1.5")) == 500  # 499.5 goes up
    assert totals.line_total(333, Decimal("1.4")) == 466  # 466.2
    assert totals.line_total(1, Decimal("0.5")) == 1


def test_money_is_never_a_float():
    with pytest.raises(TypeError):
        totals.line_total(100, 1.5)
    with pytest.raises(TypeError):
        totals.line_total(100.0, 2)


@pytest.mark.parametrize("subtotal,percent,off", [
    (1005, "10", 101),     # 100.5 rounds up to 101
    (1004, "10", 100),     # 100.4 rounds down
    (1001, "12.5", 125),   # 125.125
    (1003, "12.5", 125),   # 125.375
    (1004, "12.5", 126),   # 125.5 rounds up
    (9999, "33.333", 3333),  # 3332.9667
    (200, "0.5", 1),       # 1.0
    (199, "0.5", 1),       # 0.995
])
def test_a_percentage_is_taken_once_on_the_total_and_rounded_half_up(subtotal, percent, off):
    result = apply([line(0, subtotal)], rule(percent=Decimal(percent)),
                   ctx=totals.Context(NOW))
    assert result.discount_total == off


def test_a_discount_is_shared_among_lines_by_largest_remainder_and_adds_up_exactly():
    # Three lines of QAR 1.05, 50% off: the whole is 157.5 dirhams, so 158. Rounding each line
    # would give 53 + 53 + 53 = 159, more than was worked out; sharing gives 53 + 53 + 52 = 158.
    lines = [line(0, 105), line(1, 105), line(2, 105)]
    result = apply(lines, rule(percent=Decimal(50)))
    assert result.discount_total == 158
    assert [result.line_discounts[i] for i in range(3)] == [53, 53, 52]
    assert sum(result.line_discounts.values()) == result.discount_total


def test_allocate_is_exact_and_never_gives_a_line_more_than_it_has():
    assert totals.allocate(10, {0: 1, 1: 1, 2: 1}) == {0: 4, 1: 3, 2: 3}
    assert totals.allocate(0, {0: 5}) == {0: 0}
    assert totals.allocate(5, {}) == {}
    shares = totals.allocate(99, {0: 33, 1: 33, 2: 33})
    assert shares == {0: 33, 1: 33, 2: 33}


# ── amounts, the floor, scope ──────────────────────────────────────────────────────────────


def test_an_amount_off_never_takes_more_than_the_goods_it_covers():
    result = apply([line(0, 5000)], rule(value_type="amount", percent=None, amount=999_999))
    # (the floor keeps QAR 1 of the goods)
    assert result.discount_total == 4900 and result.goods == totals.MIN_PAYABLE


def test_the_goods_are_never_taken_below_qar_1():
    result = apply([line(0, 10_000)], rule(percent=Decimal(100)))
    assert result.goods == totals.MIN_PAYABLE and result.discount_total == 9_900


def test_goods_that_cost_less_than_the_floor_get_no_discount_at_all():
    result = apply([line(0, 50)], rule(percent=Decimal(100)))
    assert result.applied == [] and result.goods == 50
    assert [p.code for _, p in result.rejected] == ["coupon_no_effect"]


def test_a_rule_for_chosen_items_takes_off_only_those():
    cake, tea = uuid4(), uuid4()
    lines = [line(0, 1000, item=cake), line(1, 1000, item=tea, category="Drinks")]
    by_item = apply(lines, rule(scope="selected", item_ids=frozenset({cake})))
    assert by_item.line_discounts == {0: 100, 1: 0}
    by_category = apply(lines, rule(scope="selected", categories=frozenset({"drinks"})))
    assert by_category.line_discounts == {0: 0, 1: 100}  # a category matches in any case
    nothing = apply(lines, rule(scope="selected", item_ids=frozenset({uuid4()})))
    assert nothing.applied == [] and nothing.rejected[0][1].code == "coupon_no_match"


def test_the_minimum_is_judged_on_the_goods_before_the_discount():
    cart = [line(0, 9_900)]
    assert apply(cart, rule(min_order=10_000)).rejected[0][1].code == "coupon_minimum"
    assert apply(cart, rule(min_order=9_900)).discount_total == 990


# ── buy N get one ──────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("quantity,free", [(1, 0), (3, 0), (4, 1), (7, 1), (8, 2), (12, 3)])
def test_buy_three_get_one_free(quantity, free):
    r = rule(value_type="free_units", percent=None, buy_qty=3, get_qty=1)
    result = apply([line(0, 1250, quantity)], r)
    assert result.discount_total == free * 1250
    if not free:
        assert result.applied == []


def test_buy_n_get_free_works_per_line_and_in_a_category():
    r = rule(value_type="free_units", percent=None, buy_qty=1, get_qty=1, scope="selected",
             categories=frozenset({"cakes"}))
    lines = [line(0, 500, 2), line(1, 300, 2, category="Drinks")]
    assert apply(lines, r).line_discounts == {0: 500, 1: 0}


def test_free_units_work_with_decimal_quantities():
    r = rule(value_type="free_units", percent=None, buy_qty=3, get_qty=1)
    assert apply([line(0, 1000, Decimal("4.5"))], r).discount_total == 1000
    assert apply([line(0, 1000, Decimal("3.9"))], r).applied == []


# ── why a rule does not apply ──────────────────────────────────────────────────────────────


def reason(r, cart=None, ctx=CTX):
    return apply(cart or [line(0, 10_000)], r, ctx=ctx).rejected[0][1]


def test_each_reason_has_its_code_and_its_details():
    past, future = NOW - timedelta(days=3), NOW + timedelta(days=3)
    group = uuid4()
    assert reason(rule(status="paused")).code == "coupon_paused"
    assert reason(rule(status="ended", ends_at=past)).code == "coupon_ended"
    ended = reason(rule(ends_at=past))
    assert ended.code == "coupon_ended" and ended.details["on"] == past
    assert reason(rule(starts_at=future)).code == "coupon_not_started"
    assert reason(rule(group_id=group)).code == "coupon_group"
    assert reason(rule(group_id=group), ctx=totals.Context(NOW, uuid4())).code == "coupon_group"
    assert apply([line(0, 10_000)], rule(group_id=group),
                 ctx=totals.Context(NOW, group)).discount_total == 1000
    assert reason(rule(usage_limit=5, uses=5)).code == "coupon_used_up"
    mine = rule(per_customer_limit=2)
    used = reason(mine, ctx=totals.Context(NOW, None, {mine.id: 2}))
    assert used.code == "coupon_used_by_you" and used.details["limit"] == 2
    minimum = reason(rule(min_order=20_000))
    assert minimum.code == "coupon_minimum" and minimum.details["minimum"] == 20_000


def test_a_rule_that_has_started_and_not_ended_is_open():
    r = rule(starts_at=NOW - timedelta(hours=1), ends_at=NOW + timedelta(hours=1))
    assert totals.availability(r, CTX) is None
    # the end itself is already too late
    assert totals.availability(rule(ends_at=NOW), CTX).code == "coupon_ended"


# ── which rules go together ────────────────────────────────────────────────────────────────


def test_two_stackable_rules_compound_on_what_is_left():
    a = rule(percent=Decimal(10), stackable=True, code="A111")
    b = rule(percent=Decimal(10), stackable=True, code="B111")
    result = apply([line(0, 10_000)], a, b)
    assert [x.amount for x in result.applied] == [1000, 900]
    assert result.goods == 8100


def test_two_rules_that_are_not_stackable_do_not_go_together_and_the_bigger_wins():
    small = rule(percent=Decimal(5), code="SMALL5")
    big = rule(percent=Decimal(20), code="BIG20")
    result = apply([line(0, 10_000)], small, big)
    assert [a.rule.code for a in result.applied] == ["BIG20"]
    lost = dict((r.code, p) for r, p in result.rejected)
    assert lost["SMALL5"].code == "coupon_not_combined"
    assert lost["SMALL5"].details["with"].code == "BIG20"


def test_a_stackable_rule_and_one_that_is_not_do_not_go_together_either():
    a = rule(percent=Decimal(10), stackable=True, code="STACK1")
    b = rule(percent=Decimal(10), stackable=False, code="SOLO11")
    result = apply([line(0, 10_000)], a, b)
    assert len(result.applied) == 1
    assert result.rejected[0][1].code == "coupon_not_combined"


def test_on_a_tie_the_customers_own_code_beats_an_automatic_discount():
    auto = rule(kind="auto", code="", percent=Decimal(10), name="Ten off")
    coupon = rule(percent=Decimal(10), code="MINE10")
    result = apply([line(0, 10_000)], auto, coupon)
    assert [a.rule.kind for a in result.applied] == ["coupon"]


def test_an_automatic_discount_applies_by_itself_and_a_better_code_replaces_it():
    auto = rule(kind="auto", code="", percent=Decimal(10), min_order=20_000)
    assert apply([line(0, 25_000)], auto).discount_total == 2500
    assert apply([line(0, 15_000)], auto).applied == []  # below its minimum: silently not used
    better = rule(percent=Decimal(30), code="BIG30")
    result = apply([line(0, 25_000)], auto, better)
    assert [a.rule.code for a in result.applied] == ["BIG30"]


def test_a_coupon_that_takes_nothing_more_is_not_applied():
    first = rule(value_type="amount", percent=None, amount=100_000, stackable=True, code="FIRST1")
    second = rule(percent=Decimal(10), stackable=True, code="SECOND")
    result = apply([line(0, 10_000)], first, second)
    # the first takes everything the floor allows; the second has nothing left to take
    assert [a.rule.code for a in result.applied] == ["FIRST1"]
    assert result.rejected[0][1].code == "coupon_no_effect"


# ── delivery ───────────────────────────────────────────────────────────────────────────────


def test_delivery_is_free_once_the_goods_after_discount_reach_the_free_over_amount():
    assert totals.delivery_fee(1500, 20_000, 19_999) == 1500
    assert totals.delivery_fee(1500, 20_000, 20_000) == 0
    assert totals.delivery_fee(1500, None, 10**9) == 1500


# ── the identities, on thousands of random orders ──────────────────────────────────────────


def random_rule(rng, items, categories):
    kind = rng.choice(["coupon", "auto"])
    value_type = rng.choice(["percent", "amount", "free_units"])
    scope = rng.choice(["order", "selected"])
    return totals.Rule(
        id=uuid4(), kind=kind, code="X" + str(rng.randrange(10**6)) if kind == "coupon" else "",
        value_type=value_type,
        percent=Decimal(rng.randrange(1, 100_001)) / Decimal(1000) if value_type == "percent"
        else None,
        amount=rng.randrange(1, 50_000) if value_type == "amount" else None,
        buy_qty=rng.randrange(1, 6) if value_type == "free_units" else None,
        get_qty=rng.randrange(1, 3) if value_type == "free_units" else None,
        scope=scope,
        item_ids=frozenset(rng.sample(items, rng.randrange(0, 3))) if scope == "selected"
        else frozenset(),
        categories=frozenset(rng.sample(categories, rng.randrange(0, 2))) if scope == "selected"
        else frozenset(),
        min_order=rng.choice([0, 0, 1000, 5000, 20_000]),
        stackable=rng.random() < 0.5,
    )


def test_property_a_discounted_order_always_adds_up_and_never_goes_below_the_floor():
    rng = random.Random(150)
    categories = ["cakes", "drinks", "gifts"]
    for _ in range(4000):
        items = [uuid4() for _ in range(6)]
        cart = [
            totals.Line(
                i, rng.choice(items), rng.choice(categories),
                rng.randrange(1, 40_000),
                rng.choice([1, 2, 3, 7, 12, Decimal("1.5"), Decimal("0.25"), Decimal("2.75")]),
            )
            for i in range(rng.randrange(1, 8))
        ]
        rules = [random_rule(rng, items, categories) for _ in range(rng.randrange(0, 5))]
        result = totals.compute(cart, rules, CTX)
        subtotal = sum(totals.line_total(x.unit_price, x.quantity) for x in cart)
        assert result.subtotal == subtotal
        # the lines add up to what was taken off, exactly
        assert sum(result.line_discounts.values()) == result.discount_total
        assert result.discount_total == sum(a.amount for a in result.applied)
        for x in cart:
            assert 0 <= result.line_discounts[x.index] <= x.gross
        for a in result.applied:
            assert a.amount > 0 and sum(a.per_line.values()) == a.amount
        # what is paid for the goods is the sum of the stored pieces, never below the floor
        goods = subtotal - result.discount_total
        assert goods == sum(x.gross - result.line_discounts[x.index] for x in cart)
        assert goods >= min(subtotal, totals.MIN_PAYABLE)
        # rules that went together were all stackable
        if len(result.applied) > 1:
            assert all(a.rule.stackable for a in result.applied)
        # deterministic: the same cart and rules give the same answer
        again = totals.compute(cart, rules, CTX)
        assert again.discount_total == result.discount_total
        assert again.line_discounts == result.line_discounts
        # and a delivery fee on top gives total = goods + fee
        fee = totals.delivery_fee(rng.randrange(0, 5000), rng.choice([None, 10_000]), goods)
        total = subtotal - result.discount_total + fee
        assert total == goods + fee and total > 0


def test_the_ids_in_a_result_are_the_rules_given():
    r = rule()
    result = apply([line(0, 1000)], r)
    assert result.applied[0].rule.id == r.id and isinstance(r.id, UUID)
