"""When an item can be ordered, said in plain words a customer reads under its name
(ALY-112, D-039): "Ready from 5 pm", "Order before 2 pm for tomorrow".

The order page used to say nothing: an item outside its hours simply was not there. Now it
is listed with a line that says what is true, in English and in Arabic, built from the same
rules the checkout enforces (`schedule.py`), so the words and the checkout cannot disagree.
Sold out, switched off and hidden items get no note: the page says so with a label.

The Arabic has not been reviewed by a native speaker (ALY-66).
"""

from datetime import date, time, timedelta

from alyr.modules.items import availability, schedule
from alyr.modules.items.clock import ShopClock
from alyr.modules.items.text import MONTHS, WEEKDAYS

# code: (English, Arabic). {time} and the days are written by `clock_text` and `day_text`.
NOTES: dict[str, tuple[str, str]] = {
    "ready_from": ("Ready from {time}", "متاح من الساعة {time}"),
    "ready_day_from": ("Ready {day} from {time}", "متاح {day} من الساعة {time}"),
    "closed": ("Not available right now", "غير متاح حالياً"),
    "until": ("Available until {time}", "متاح حتى الساعة {time}"),
    "order_before_for": (
        "Order before {time} for {day}", "اطلب قبل الساعة {time} ليكون جاهزاً {day}",
    ),
    "order_before_on_for": (
        "Order before {time} on {by} for {day}",
        "اطلب قبل الساعة {time} يوم {by} ليكون جاهزاً {day}",
    ),
    "order_before_tomorrow_for": (
        "Order before {time} tomorrow for {day}",
        "اطلب قبل الساعة {time} غداً ليكون جاهزاً {day}",
    ),
    "order_ahead": (
        "Order ahead: next available {day}", "اطلب مسبقاً: أقرب موعد {day}",
    ),
}


def clock_text(moment: time, lang: str) -> str:
    """"5 pm", "5:30 pm"; in Arabic «5 م», «5:30 م». Western digits."""
    hour = moment.hour % 12 or 12
    minutes = "" if moment.minute == 0 else f":{moment.minute:02d}"
    if lang == "ar":
        return f"{hour}{minutes} {'ص' if moment.hour < 12 else 'م'}"
    return f"{hour}{minutes} {'am' if moment.hour < 12 else 'pm'}"


def day_text(day: date, today: date, lang: str) -> str:
    """"today", "tomorrow", "Mon 19 Oct" (Arabic: «اليوم», «غداً», «الاثنين 19 أكتوبر»)."""
    ar = lang == "ar"
    if day == today:
        return "اليوم" if ar else "today"
    if (day - today).days == 1:
        return "غداً" if ar else "tomorrow"
    names, months = WEEKDAYS[lang], MONTHS[lang]
    return f"{names[schedule.weekday(day)]} {day.day} {months[day.month - 1]}"


def _say(code: str, lang: str, **details: str) -> str:
    english, arabic = NOTES[code]
    return (arabic if lang == "ar" else english).format(**details)


def _both(code: str, today: date, **parts) -> dict:
    """The sentence in both languages. `parts` holds times and dates, written per language."""
    out = {}
    for lang in ("en", "ar"):
        out[lang] = _say(code, lang, **{
            key: (
                clock_text(value, lang) if isinstance(value, time)
                else day_text(value, today, lang) if isinstance(value, date)
                else value
            )
            for key, value in parts.items()
        })
    return out


def note(entry, state: availability.State, clock: ShopClock) -> dict | None:
    """The line under an item: `{"en": ..., "ar": ...}`, or None when there is nothing to say."""
    if state.reason in ("hidden", "off", "sold_out"):
        return None
    today, local = clock.today, clock.local
    if not state.orderable:
        if state.reason == "not_now" and state.next_at is not None:
            when = state.next_at
            start = when.time()
            if when.date() == today:
                return _both("ready_from", today, time=start)
            return _both("ready_day_from", today, day=when.date(), time=start)
        return _both("closed", today)
    windows = entry.windows
    if not windows:
        return None
    if state.dated and state.for_date is not None:
        day = state.for_date
        qualifying = [
            w for w in schedule.open_windows(windows, day)
            if local < schedule.order_by(w, day, local.tzinfo)
        ]
        if not qualifying:
            return _both("order_ahead", today, day=day)
        # The latest cut-off that still works: the most generous of the windows.
        window = max(qualifying, key=lambda w: schedule.order_by(w, day, local.tzinfo))
        if window.cutoff is None:
            return _both("order_ahead", today, day=day)
        by_day = day - timedelta(days=window.lead_days)
        if by_day == today:
            return _both("order_before_for", today, time=window.cutoff, day=day)
        if (by_day - today).days == 1:
            return _both("order_before_tomorrow_for", today, time=window.cutoff, day=day)
        return _both("order_before_on_for", today, time=window.cutoff, by=by_day, day=day)
    # Ordered now, and open now: say when it stops, if it does today.
    for window in schedule.open_windows(windows, today):
        opens = window.opens is None or window.opens <= local.time()
        if opens and window.closes is not None and local.time() < window.closes:
            return _both("until", today, time=window.closes)
    return None


def dates_for(days: list[date], today: date) -> list[dict]:
    """The days a made-to-order item can be ordered for, for a date picker: the date and its
    label in both languages."""
    return [
        {
            "date": d.isoformat(), "label": day_text(d, today, "en"),
            "label_ar": day_text(d, today, "ar"),
        }
        for d in days
    ]
