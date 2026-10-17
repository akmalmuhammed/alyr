"""When an item can be ordered: its schedule, as plain rules with no database in sight.

A schedule is a set of windows. Windows without dates are the usual week. A window with
dates (Ramadan, a holiday) replaces the usual week on the days it covers, and a window
marked `closed` makes the item unavailable on those days.

Two kinds of item, told apart by the windows themselves:

* **Ordered now** (no lead time, no cut-off): the item can be ordered while the clock is
  inside one of the windows. Breakfast, 6 am to 11 am, Sunday to Thursday.
* **Ordered for a date** (a lead time or a cut-off): the customer picks the day the order
  is for. The order must be placed `lead_days` before that day, and before the cut-off
  on that earlier day: "order before 6 pm for tomorrow" is a lead of one day and a
  cut-off of 18:00. The hours in the window are the serving hours, shown to the customer;
  only its days decide which dates can be picked.

Every function takes the shop's local time. Weekdays count from Sunday as 0, like
business_hours and PostgreSQL.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

# How far ahead we look for the next time an item opens before giving up.
LOOK_AHEAD_DAYS = 60


@dataclass(frozen=True)
class Window:
    weekdays: frozenset[int] = frozenset(range(7))
    opens: time | None = None
    closes: time | None = None
    lead_days: int = 0
    cutoff: time | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    closed: bool = False

    @property
    def dated(self) -> bool:
        """An item ordered for a date, not for now."""
        return self.lead_days > 0 or self.cutoff is not None

    @property
    def is_override(self) -> bool:
        return self.valid_from is not None or self.valid_to is not None

    def covers(self, day: date) -> bool:
        return (self.valid_from is None or day >= self.valid_from) and (
            self.valid_to is None or day <= self.valid_to
        )


@dataclass(frozen=True)
class Verdict:
    """Whether the item can be ordered, and if not why and when it can.

    `code` is empty when it can: otherwise `not_now` (outside its hours), `closed` (not
    on any day we can see), `not_that_day` (the date asked for is not one it is made on)
    or `after_cutoff` (too late to order for that date). `next_at` is when an item
    ordered now opens next; `next_date` is the earliest date an item ordered for a date
    can be ordered for; `for_date` is the date an order is for, when it is for a date.
    """

    ok: bool
    code: str = ""
    next_at: datetime | None = None
    next_date: date | None = None
    for_date: date | None = None
    dated: bool = False


def weekday(day: date) -> int:
    """0 is Sunday."""
    return (day.weekday() + 1) % 7


def _rows_for(windows: list[Window], day: date) -> list[Window] | None:
    """The windows that rule `day`: the dated ones that cover it, else the usual week.
    None when nothing rules it (an item with no usual week is unrestricted outside its
    dated windows)."""
    overrides = [w for w in windows if w.is_override and w.covers(day)]
    if overrides:
        return overrides
    usual = [w for w in windows if not w.is_override]
    return usual or None


def _open_on(rows: list[Window] | None, day: date) -> list[Window]:
    if rows is None:
        return [Window()]
    return [w for w in rows if not w.closed and weekday(day) in w.weekdays]


def evaluate(windows: list[Window], now: datetime, for_date: date | None = None) -> Verdict:
    """Can an order be placed at `now` (the shop's local time)? For an item ordered for a
    date, `for_date` is the day the customer chose; leave it out to find the earliest."""
    if not windows:
        return Verdict(True)
    if any(w.dated for w in windows):
        return _for_a_date(windows, now, for_date)
    return _right_now(windows, now)


def _right_now(windows: list[Window], now: datetime) -> Verdict:
    today, clock = now.date(), now.time()
    for w in _open_on(_rows_for(windows, today), today):
        if (w.opens is None or w.opens <= clock) and (w.closes is None or clock < w.closes):
            return Verdict(True)
    best = None
    for k in range(LOOK_AHEAD_DAYS):
        day = today + timedelta(days=k)
        starts = []
        for w in _open_on(_rows_for(windows, day), day):
            start = w.opens or time(0)
            if k == 0 and start <= clock:
                continue  # today's hours are over, or this window is the one we are past
            starts.append(start)
        if starts:
            best = datetime.combine(day, min(starts), tzinfo=now.tzinfo)
            break
    return Verdict(False, "not_now" if best else "closed", next_at=best)


def _order_by(w: Window, day: date, tzinfo) -> datetime:
    return datetime.combine(
        day - timedelta(days=w.lead_days), w.cutoff or time.max, tzinfo=tzinfo
    )


def _can_order_for(windows: list[Window], now: datetime, day: date) -> str:
    """"" if an order placed now can be for `day`; else why not."""
    rows = _open_on(_rows_for(windows, day), day)
    if not rows:
        return "not_that_day"
    if any(now < _order_by(w, day, now.tzinfo) for w in rows):
        return ""
    return "after_cutoff"


def _for_a_date(windows: list[Window], now: datetime, for_date: date | None) -> Verdict:
    today = now.date()
    earliest = next(
        (
            today + timedelta(days=k)
            for k in range(LOOK_AHEAD_DAYS)
            if not _can_order_for(windows, now, today + timedelta(days=k))
        ),
        None,
    )
    if for_date is None:
        if earliest is None:
            return Verdict(False, "closed", dated=True)
        return Verdict(True, next_date=earliest, for_date=earliest, dated=True)
    why = "past" if for_date < today else _can_order_for(windows, now, for_date)
    if not why:
        return Verdict(True, next_date=earliest, for_date=for_date, dated=True)
    return Verdict(False, why, next_date=earliest, dated=True)
