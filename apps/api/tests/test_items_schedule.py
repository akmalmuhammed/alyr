"""When an item can be ordered (D-039): schedules with lead time and cut-off, date-range
overrides, and the shop's day. Pure rules, so the clock is held still."""

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from alyr.modules.items import availability, schedule, text
from alyr.modules.items.clock import ShopClock
from alyr.modules.items.schedule import Window, weekday

QATAR = ZoneInfo("Asia/Qatar")
EVERY_DAY = frozenset(range(7))


def at(day: int, hour: int, minute: int = 0, month: int = 10) -> datetime:
    """A moment on the shop's wall clock. 18 Oct 2026 is a Sunday."""
    return datetime(2026, month, day, hour, minute, tzinfo=QATAR)


def test_the_calendar_counts_from_sunday_like_the_opening_hours():
    assert weekday(date(2026, 10, 18)) == 0  # Sunday
    assert weekday(date(2026, 10, 24)) == 6  # Saturday


def test_breakfast_can_be_ordered_only_inside_its_hours():
    breakfast = [Window(EVERY_DAY, time(6), time(11))]
    assert schedule.evaluate(breakfast, at(19, 9)).ok
    assert schedule.evaluate(breakfast, at(19, 6)).ok  # opening time itself
    ended = schedule.evaluate(breakfast, at(19, 11))  # closing time itself is closed
    assert (ended.ok, ended.code) == (False, "not_now")
    assert ended.next_at == at(20, 6)


def test_before_opening_the_next_time_is_later_today():
    breakfast = [Window(EVERY_DAY, time(6), time(11))]
    early = schedule.evaluate(breakfast, at(19, 4))
    assert (early.ok, early.code, early.next_at) == (False, "not_now", at(19, 6))


def test_the_next_opening_skips_the_days_it_is_closed():
    sunday_to_thursday = [Window(frozenset({0, 1, 2, 3, 4}), time(6), time(11))]
    friday_noon = at(23, 12)  # 23 Oct 2026 is a Friday
    verdict = schedule.evaluate(sunday_to_thursday, friday_noon)
    assert verdict.next_at == at(25, 6)  # Sunday


def test_a_split_day_opens_again_in_the_evening():
    lunch_and_dinner = [
        Window(EVERY_DAY, time(11), time(15)), Window(EVERY_DAY, time(18), time(23)),
    ]
    assert not schedule.evaluate(lunch_and_dinner, at(19, 16)).ok
    assert schedule.evaluate(lunch_and_dinner, at(19, 16)).next_at == at(19, 18)
    assert schedule.evaluate(lunch_and_dinner, at(19, 20)).ok


def test_an_item_with_no_schedule_can_always_be_ordered():
    assert schedule.evaluate([], at(19, 3)).ok


def test_a_window_that_never_opens_says_closed():
    never = [Window(EVERY_DAY, time(6), time(11), closed=True)]
    verdict = schedule.evaluate(never, at(19, 8))
    assert (verdict.ok, verdict.code, verdict.next_at) == (False, "closed", None)


def test_ramadan_hours_replace_the_usual_week_on_those_days():
    usual = Window(EVERY_DAY, time(6), time(11))
    ramadan = Window(
        EVERY_DAY, time(21), time(23, 30), valid_from=date(2027, 2, 9), valid_to=date(2027, 3, 10)
    )
    windows = [usual, ramadan]
    # Before Ramadan the usual hours rule, and during it only the new ones do.
    assert schedule.evaluate(windows, at(5, 8, month=2).replace(year=2027)).ok
    assert not schedule.evaluate(windows, datetime(2027, 2, 15, 8, tzinfo=QATAR)).ok
    assert schedule.evaluate(windows, datetime(2027, 2, 15, 22, tzinfo=QATAR)).ok
    after = schedule.evaluate(windows, datetime(2027, 3, 11, 8, tzinfo=QATAR))
    assert after.ok  # the usual week is back


def test_the_last_evening_before_ramadan_looks_ahead_to_the_new_hours():
    usual = Window(EVERY_DAY, time(6), time(11))
    ramadan = Window(
        EVERY_DAY, time(21), time(23, 30), valid_from=date(2027, 2, 9), valid_to=date(2027, 3, 10)
    )
    verdict = schedule.evaluate([usual, ramadan], datetime(2027, 2, 8, 14, tzinfo=QATAR))
    assert verdict.next_at == datetime(2027, 2, 9, 21, tzinfo=QATAR)


def test_a_holiday_row_closes_the_item_on_those_days_only():
    holiday = Window(
        EVERY_DAY, valid_from=date(2026, 10, 20), valid_to=date(2026, 10, 21), closed=True
    )
    usual = Window(EVERY_DAY, time(6), time(11))
    assert not schedule.evaluate([usual, holiday], at(20, 8)).ok
    assert schedule.evaluate([usual, holiday], at(22, 8)).ok
    assert schedule.evaluate([usual, holiday], at(20, 8)).next_at == at(22, 6)


def test_only_dated_rows_leave_every_other_day_unrestricted():
    only_a_holiday = [Window(EVERY_DAY, valid_from=date(2026, 10, 20), valid_to=date(2026, 10, 21),
                             closed=True)]
    assert schedule.evaluate(only_a_holiday, at(25, 3)).ok


def test_order_before_six_for_tomorrow():
    cake = [Window(EVERY_DAY, lead_days=1, cutoff=time(18))]
    monday_noon = schedule.evaluate(cake, at(19, 12))
    assert (monday_noon.ok, monday_noon.for_date) == (True, date(2026, 10, 20))
    just_before = schedule.evaluate(cake, at(19, 17, 59))
    assert just_before.for_date == date(2026, 10, 20)
    # At six the day is gone: the next day to order for is the one after.
    late = schedule.evaluate(cake, at(19, 18))
    assert (late.ok, late.for_date) == (True, date(2026, 10, 21))


def test_a_date_that_is_too_late_is_refused_with_the_next_one_offered():
    cake = [Window(EVERY_DAY, lead_days=1, cutoff=time(18))]
    verdict = schedule.evaluate(cake, at(19, 19), for_date=date(2026, 10, 20))
    assert (verdict.ok, verdict.code, verdict.next_date) == (
        False, "after_cutoff", date(2026, 10, 21),
    )
    assert schedule.evaluate(cake, at(19, 19), for_date=date(2026, 10, 21)).ok


def test_a_date_on_a_day_it_is_not_made_is_refused():
    fridays_only = [Window(frozenset({5}), lead_days=1, cutoff=time(18))]
    verdict = schedule.evaluate(fridays_only, at(19, 9), for_date=date(2026, 10, 21))
    assert (verdict.code, verdict.next_date) == ("not_that_day", date(2026, 10, 23))


def test_a_date_in_the_past_is_refused():
    cake = [Window(EVERY_DAY, lead_days=1, cutoff=time(18))]
    assert schedule.evaluate(cake, at(19, 9), for_date=date(2026, 10, 18)).code == "past"


def test_two_days_notice_pushes_the_earliest_date_out():
    wedding_cake = [Window(EVERY_DAY, lead_days=2)]
    assert schedule.evaluate(wedding_cake, at(19, 23, 59)).for_date == date(2026, 10, 21)


def test_a_made_to_order_item_follows_the_override_for_the_day_it_is_ordered_for():
    usual = Window(frozenset(range(7)), lead_days=1, cutoff=time(18))
    eid = Window(
        EVERY_DAY, lead_days=3, cutoff=time(12), valid_from=date(2026, 10, 24),
        valid_to=date(2026, 10, 26),
    )
    # For a day inside the override the longer notice and earlier cut-off apply.
    verdict = schedule.evaluate([usual, eid], at(21, 13), for_date=date(2026, 10, 24))
    assert (verdict.ok, verdict.code) == (False, "after_cutoff")
    assert schedule.evaluate([usual, eid], at(21, 11), for_date=date(2026, 10, 24)).ok


# ---------------------------------------------------------------- the shop's day

def test_the_shop_day_starts_when_the_shop_says():
    four_am = ShopClock(at(20, 2), QATAR, time(4))
    assert four_am.today == date(2026, 10, 20)
    assert four_am.shop_day == date(2026, 10, 19)  # still last night's day
    assert ShopClock(at(20, 4), QATAR, time(4)).shop_day == date(2026, 10, 20)
    assert ShopClock(at(20, 2), QATAR).shop_day == date(2026, 10, 20)


def test_a_clock_in_another_zone_reads_the_shops_wall():
    utc_evening = datetime(2026, 10, 19, 22, 0, tzinfo=ZoneInfo("UTC"))  # 01:00 in Doha
    assert ShopClock(utc_evening, QATAR).today == date(2026, 10, 20)


# ----------------------------------------------------- price, sale and the count

def _item(**more):
    return {
        "status": "live", "stock_rule": "count", "available": True, "price": 1000,
        "sale_price": None, "sale_starts_at": None, "sale_ends_at": None, **more,
    }


def test_a_sale_price_applies_only_inside_its_dates():
    item = _item(sale_price=800, sale_starts_at=at(20, 0), sale_ends_at=at(22, 0))
    assert availability.item_price(item, at(19, 12)) == 1000
    assert availability.item_price(item, at(21, 12)) == 800
    assert availability.item_price(item, at(22, 0)) == 1000  # the end is not included
    no_end = _item(sale_price=800)
    assert availability.item_price(no_end, at(30, 12)) == 800


def test_a_variant_adds_its_difference_to_the_price_now():
    item = _item(sale_price=800)
    assert availability.variant_price(item, {"price_delta": 250}, at(19, 12)) == 1050


def _stocked(rule, on_hand=0, daily_limit=None, **more):
    return _item(stock_rule=rule, **more), [
        {"id": "v1", "active": True, "on_hand": on_hand, "daily_limit": daily_limit,
         "price_delta": 0}
    ]


def test_an_item_is_sold_out_at_zero_and_not_before():
    clock = ShopClock(at(19, 12), QATAR)
    item, variants = _stocked("count", on_hand=0)
    gone = availability.evaluate(item, variants, [], {}, clock)
    assert (gone.orderable, gone.reason, gone.left) == (False, "sold_out", 0)
    item, variants = _stocked("count", on_hand=1)
    assert availability.evaluate(item, variants, [], {}, clock).orderable


def test_a_daily_limit_starts_again_each_shop_day():
    item, variants = _stocked("daily_limit", daily_limit=10)
    monday = ShopClock(at(19, 12), QATAR)
    deltas = {("v1", date(2026, 10, 19)): -10}  # all ten sold on Monday
    assert availability.evaluate(item, variants, [], deltas, monday).reason == "sold_out"
    tuesday = ShopClock(at(20, 12), QATAR)
    assert availability.evaluate(item, variants, [], deltas, tuesday).left == 10


def test_switched_off_hidden_and_always_items():
    clock = ShopClock(at(19, 12), QATAR)
    item, variants = _stocked("switch", available=False)
    assert availability.evaluate(item, variants, [], {}, clock).reason == "off"
    item, variants = _stocked("always", available=False)
    assert availability.evaluate(item, variants, [], {}, clock).orderable  # no switch to read
    item, variants = _stocked("switch", status="hidden")
    assert availability.evaluate(item, variants, [], {}, clock).reason == "hidden"


def test_words_say_the_next_time_the_way_a_customer_would():
    today = date(2026, 10, 19)
    assert text.when_text(at(19, 6), today, "en") == "today at 6:00 AM"
    assert text.when_text(at(20, 18, 30), today, "en") == "tomorrow at 6:30 PM"
    assert text.when_text(at(23, 6), today, "en") == "Fri 23 Oct at 6:00 AM"
    assert text.when_text(date(2026, 10, 20), today, "en") == "tomorrow"
    assert text.when_text(at(20, 6), today, "ar") == "غداً الساعة 6:00 ص"
    sentence = text.say("not_now", "en", {"name": "Breakfast", "next_at": at(20, 6)}, today)
    assert sentence == "Breakfast can be ordered again tomorrow at 6:00 AM."
