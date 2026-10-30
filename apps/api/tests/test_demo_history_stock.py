"""The demo history never writes a stock change of nothing (a bug seen on 31 Oct 2026).

`stock_movements` refuses `delta = 0` unless the row is a count. The demo's fortnight asked for
a "delivery" of `opening - have` pieces for a variant that had sold nothing and opened at or below
the low-stock number, so that difference was 0 and the whole seed failed, on the days whose random
orders left such a variant.
"""

from datetime import UTC, datetime
from types import SimpleNamespace

from alyr.demo.history import Fortnight


def _stub():
    return SimpleNamespace(
        movements=[],
        actor=lambda staff: (None, staff),
        shop_day=lambda at: at.date(),
    )


def _var(rule: str = "count"):
    return SimpleNamespace(
        id="v1", item=SimpleNamespace(rule=rule), on_hand=3, limit=None, day={}, last=None,
    )


def test_a_delivery_of_nothing_is_not_written():
    fortnight, var = _stub(), _var()
    at = datetime(2026, 10, 30, 21, 0, tzinfo=UTC)
    Fortnight.stock_move(fortnight, var, "received", 0, at, "Delivery from the supplier", "Sara")
    assert fortnight.movements == []
    assert var.on_hand == 3


def test_a_count_that_finds_nothing_is_still_written():
    fortnight, var = _stub(), _var()
    at = datetime(2026, 10, 30, 21, 0, tzinfo=UTC)
    Fortnight.stock_move(fortnight, var, "counted", 0, at, "Shelf count: all there", "Sara")
    assert [m[1] for m in fortnight.movements] == ["counted"]


def test_a_real_change_is_written_and_applied():
    fortnight, var = _stub(), _var()
    at = datetime(2026, 10, 30, 21, 0, tzinfo=UTC)
    Fortnight.stock_move(fortnight, var, "received", 4, at, "Delivery from the supplier", "Sara")
    assert [(m[1], m[2], m[3]) for m in fortnight.movements] == [("received", 4, 7)]
    assert var.on_hand == 7
