"""Reading a booking or POS system's export of past visits (D-197, spec 070).

The pure half of the visits import: it takes the rows of a sheet (CSV or Excel, read by
`modules/items/sheets.py`) and a mapping of columns, and gives back visits and problems, with the
row number a spreadsheet shows and the words in English and Arabic. It touches no database;
`imports.py` adds what needs one and does the applying.

* **Columns are found by name**, in English or Arabic, and staff can say which column is which. A
  mapping is by the header text of the file, so a saved one works on the next export.
* **Only visits that are over, with a final state, are read**: came, did not come, cancelled. A row
  that is still booked, pending or in the future is a problem, never a guess.
* **Nothing is guessed that could be wrong.** A date no reading can make sense of, a status the
  file has no word for, a visit with no time of day: each is a problem with its row. The one
  assumption (dates written 03/04/2026 are day first, as in Qatar) is said in a note, and staff can
  choose the other order.
* **No customer name or phone is needed.** A client is told apart by a key: a hash made with a
  secret of this business, from the shop's own client number, a phone number or a name, whichever
  the file has first in that order. Whether the name and phone are kept at all is the
  `keep_personal` option, off by default.
* **Notes in the file are never read**, and spreadsheet formulas are never calculated.
"""

import hashlib
import hmac
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from alyr.catalog import Text
from alyr.core.normalise import western_digits
from alyr.modules.history.words import NOTES, PROBLEMS
from alyr.modules.items import values
from alyr.modules.items.values import CellError

MAX_ROWS = 20_000
DEFAULT_MINUTES = 60
MIN_YEAR = 2015
NAME_MAX = 120
STATUSES = ("completed", "no_show", "cancelled")


@dataclass(frozen=True)
class Column:
    key: str
    label: Text
    names: tuple[str, ...]
    needed: bool = False


COLUMNS: tuple[Column, ...] = (
    Column("date", Text("Visit date", "تاريخ الزيارة"),
           ("date", "visit date", "appointment date", "appointment", "start date", "datetime",
            "date time", "start", "starts at", "day", "التاريخ", "تاريخ الزيارة", "تاريخ الموعد",
            "الموعد", "تاريخ الحجز"), needed=True),
    Column("time", Text("Start time", "وقت البدء"),
           ("time", "start time", "appointment time", "from", "الوقت", "وقت البدء", "وقت الموعد",
            "من")),
    Column("end_time", Text("End time", "وقت الانتهاء"),
           ("end", "end time", "ends at", "finish", "finish time", "وقت الانتهاء", "إلى", "الى")),
    Column("duration", Text("Duration (minutes)", "المدة (دقائق)"),
           ("duration", "duration min", "duration minutes", "minutes", "length", "mins", "المدة",
            "مدة الخدمة", "الدقائق")),
    Column("service", Text("Service", "الخدمة"),
           ("service", "services", "service name", "treatment", "procedure", "appointment type",
            "item", "الخدمة", "اسم الخدمة", "الخدمات", "العلاج", "نوع الخدمة"), needed=True),
    Column("service_ar", Text("Service in Arabic", "الخدمة بالعربية"),
           ("service ar", "service name ar", "arabic service", "الخدمة بالعربية")),
    Column("status", Text("Status", "الحالة"),
           ("status", "state", "appointment status", "visit status", "outcome", "الحالة",
            "حالة الموعد", "حالة الزيارة", "النتيجة"), needed=True),
    Column("price", Text("Price", "السعر"),
           ("price", "amount", "total", "paid", "revenue", "service price", "charge", "fee", "net",
            "net amount", "السعر", "المبلغ", "الإجمالي", "المدفوع", "الاجمالي")),
    Column("stylist", Text("Stylist or staff", "المصففة أو الموظفة"),
           ("stylist", "staff", "staff name", "employee", "therapist", "technician", "practitioner",
            "provider", "resource", "specialist", "team member", "الموظف", "الموظفة", "الأخصائية",
            "الاخصائية", "الأخصائي", "المصفف", "المصففة", "مقدم الخدمة")),
    Column("client_id", Text("Client number", "رقم العميل"),
           ("client id", "customer id", "client no", "customer no", "client number",
            "customer number", "member id", "client code", "customer code", "رقم العميل",
            "كود العميل", "رقم العضوية", "معرف العميل")),
    Column("phone", Text("Client phone", "هاتف العميل"),
           ("phone", "mobile", "phone number", "mobile number", "customer phone", "client phone",
            "tel", "whatsapp", "هاتف العميل", "الهاتف", "رقم الهاتف", "الجوال", "رقم الجوال",
            "واتساب")),
    Column("name", Text("Client name", "اسم العميل"),
           ("name", "client", "customer", "client name", "customer name", "full name",
            "اسم العميل", "العميل", "الاسم", "اسم الزبون")),
    Column("visit_id", Text("Appointment number", "رقم الموعد"),
           ("visit id", "appointment id", "booking id", "booking no", "booking number",
            "appointment no", "appointment number", "reference", "ref", "id", "رقم الموعد",
            "رقم الحجز", "رقم الزيارة", "المرجع")),
    Column("booked_at", Text("Booked on", "تاريخ إنشاء الحجز"),
           ("created", "created at", "created on", "booked on", "booked at", "booking created",
            "date created", "تاريخ الإنشاء", "وقت الإنشاء", "تم الحجز في", "تاريخ إنشاء الحجز")),
    Column("cancelled_at", Text("Cancelled on", "تاريخ الإلغاء"),
           ("cancelled at", "cancelled on", "canceled at", "canceled on", "cancellation date",
            "cancel time", "تاريخ الإلغاء", "وقت الإلغاء")),
)
BY_KEY = {c.key: c for c in COLUMNS}
IDENTITY = ("client_id", "phone", "name")

STATUS_WORDS: dict[str, tuple[str, ...]] = {
    "completed": (
        "completed", "complete", "done", "finished", "attended", "came", "arrived", "checked out",
        "checkout", "paid", "closed", "served", "تم", "تمت", "مكتمل", "مكتملة", "منتهي", "منتهية",
        "حضر", "حضرت", "حضروا", "حاضر", "حاضرة", "دفع", "مدفوع", "تم الحضور", "منجز", "أنجز"),
    "no_show": (
        "no show", "no-show", "noshow", "no_show", "did not come", "didn't come", "did not show",
        "missed", "absent", "not attended", "did not attend", "لم يحضر", "لم تحضر", "لم يأت",
        "لم تأت", "غياب", "غائب", "غايب", "غابت", "عدم حضور", "تغيب", "تغيبت"),
    "cancelled": (
        "cancelled", "canceled", "cancel", "cancelled by client", "cancelled by customer",
        "cancelled by salon", "void", "voided", "deleted", "rejected", "declined", "ملغي", "ملغى",
        "ملغاة", "ملغية", "إلغاء", "الغاء", "تم الإلغاء", "تم الالغاء", "ألغي", "ألغيت"),
}
# Words that say the visit is not over or not settled. Never imported.
NOT_FINAL_WORDS = (
    "booked", "confirmed", "pending", "scheduled", "upcoming", "reserved", "waiting",
    "in progress", "new", "open", "unconfirmed", "tentative", "محجوز", "مؤكد", "مجدول", "معلق",
    "مفتوح", "جديد", "قادم")

OPTION_KEYS = ("default_status", "keep_personal", "date_order", "allow_date_only",
               "default_minutes", "skip_problem_rows", "exported_on", "source")


# ── problems and notes, in both languages ────────────────────────────────────────────────


@dataclass(frozen=True)
class Problem:
    """Something wrong with a row, in words a person at ALYR can act on. `row` is the row's
    number in the file as a spreadsheet shows it (the header is row 1)."""

    row: int
    code: str
    en: str
    ar: str
    field: str = ""

    def as_dict(self) -> dict:
        return {"row": self.row, "field": self.field, "code": self.code,
                "message": self.en, "message_ar": self.ar}


def _words(
    table: dict[str, tuple[str, str]], code: str, field_: str, args: dict
) -> tuple[str, str]:
    en, ar = table[code]
    label = BY_KEY[field_].label if field_ in BY_KEY else Text(field_, field_)
    shown = {k: "«" + str(v)[:60] + "»" for k, v in args.items() if k == "value"}
    fill = {**args, **shown, "field_en": label.en, "field_ar": label.ar}
    return en.format(**fill), ar.format(**fill)


def problem(row: int, code: str, field_: str = "", **args: object) -> Problem:
    en, ar = _words(PROBLEMS, code, field_, args)
    return Problem(row, code, en, ar, field_)


def note(code: str) -> dict:
    en, ar = NOTES[code]
    return {"code": code, "message": en, "message_ar": ar}


# ── headers and mapping ──────────────────────────────────────────────────────────────────

_STRIP = re.compile(r"[\s_\-./\\:()%#]+")
_MARKS = re.compile("[ً-ٰٟـ]")


def norm(text: object) -> str:
    """A header or a word, compared loosely: case, spaces, dashes, Arabic marks and the many
    spellings of alef and ya do not matter."""
    s = unicodedata.normalize("NFKC", values.as_text(text)).strip().lower()
    s = _MARKS.sub("", western_digits(s))
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ة", "ه")
    return _STRIP.sub("", s)


_UNIT = re.compile(r"\s*[(\[][^)\]]*[)\]]\s*$")
_NAME_INDEX = {norm(n): c.key for c in COLUMNS for n in (*c.names, c.label.en, c.label.ar)}


def headers_of(rows: list[list[object]]) -> list[str]:
    return [values.as_text(c).strip() for c in (rows[0] if rows else [])]


def auto_mapping(headers: list[str]) -> dict[str, str]:
    """{field key: header text}: the first header that names each field."""
    found: dict[str, str] = {}
    for header in headers:
        # A unit in brackets ("Price (QAR)", "Duration (min)") is not part of the name.
        key = _NAME_INDEX.get(norm(header)) or _NAME_INDEX.get(norm(_UNIT.sub("", header)))
        if key and key not in found and header:
            found[key] = header
    return found


def mapping_fits(mapping: dict[str, str], headers: list[str]) -> bool:
    have = {norm(h) for h in headers}
    return bool(mapping) and all(norm(h) in have for h in mapping.values())


def clean_mapping(mapping: object, headers: list[str]) -> dict[str, str]:
    """A mapping from a person: only known fields, only headers the file has."""
    if not isinstance(mapping, dict):
        return {}
    by_norm = {norm(h): h for h in headers if h}
    out = {}
    for key, header in mapping.items():
        if key in BY_KEY and header and norm(header) in by_norm:
            out[key] = by_norm[norm(header)]
    return out


def missing_required(mapping: dict[str, str], options: dict) -> list[str]:
    """The fields the file still needs a column for. A status column may be left out only when
    staff say what every row is (`default_status`); a client needs one of three columns."""
    need = ["date", "service"] + ([] if options.get("default_status") else ["status"])
    out = [k for k in need if k not in mapping]
    if not any(k in mapping for k in IDENTITY):
        out.append("client_id")
    return out


def clean_options(raw: object) -> dict:
    """The choices staff make for this file, only the ones that exist."""
    if not isinstance(raw, dict):
        return {}
    out: dict = {}
    if raw.get("default_status") in STATUSES:
        out["default_status"] = raw["default_status"]
    for key in ("keep_personal", "allow_date_only", "skip_problem_rows"):
        if isinstance(raw.get(key), bool):
            out[key] = raw[key]
    if raw.get("date_order") in ("dmy", "mdy"):
        out["date_order"] = raw["date_order"]
    minutes = raw.get("default_minutes")
    if isinstance(minutes, int) and not isinstance(minutes, bool) and 5 <= minutes <= 600:
        out["default_minutes"] = minutes
    if isinstance(raw.get("exported_on"), str):
        try:
            out["exported_on"] = date.fromisoformat(raw["exported_on"]).isoformat()
        except ValueError:
            pass
    if isinstance(raw.get("source"), str):
        shown = " ".join(raw["source"].split())[:60]
        if shown:
            out["source"] = shown
    return out


# ── keys ─────────────────────────────────────────────────────────────────────────────────


def key_of(salt: bytes, *parts: str) -> str:
    """A keyed hash, 32 hex characters, of the parts. The secret is the business's own, so the
    same phone number is a different key in another business, and nothing can be worked back
    from a key without the secret and a guess."""
    return hmac.new(salt, "\x1f".join(parts).encode("utf-8"), hashlib.sha256).hexdigest()[:32]


def label_of(key: str) -> str:
    """A client with no name stored, as the screens show them."""
    short = key[:6].upper()
    return f"Client {short} · عميل {short}"


# ── cells ────────────────────────────────────────────────────────────────────────────────

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4,
    "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11,
    "dec": 12, "december": 12, "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4,
    "مايو": 5, "يونيو": 6, "يوليو": 7, "أغسطس": 8, "اغسطس": 8, "سبتمبر": 9, "أكتوبر": 10,
    "اكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12,
}
_ISO = re.compile(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})")
_NUMERIC = re.compile(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})")
_DAY_MONTH_NAME = re.compile(r"(\d{1,2})[\s\-/.]+([^\W\d_]+)[\s\-/.,]+(\d{4})")
_MONTH_NAME_DAY = re.compile(r"([^\W\d_]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})")
_CLOCK = re.compile(
    r"(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|ص|م|صباحا|صباحاً|مساء|مساءً)?$",
    re.IGNORECASE)
_HOUR_ONLY = re.compile(r"(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.|ص|م|صباحا|صباحاً|مساء|مساءً)$",
                        re.IGNORECASE)
_PM = {"pm", "p.m.", "م", "مساء", "مساءً"}
_TRAILING_CLOCK = re.compile(r"[T\s]+(\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*\S+)?)$", re.IGNORECASE)


def _text(value: object) -> str:
    return values.clean(value)


class DateRead:
    """What a date cell gave: the day, the time of day if it carried one, and whether the day
    was written in a way that day-first and month-first both read (03/04/2026)."""

    __slots__ = ("day", "clock", "ambiguous")

    def __init__(self, day: date, clock: time | None, ambiguous: bool = False) -> None:
        self.day, self.clock, self.ambiguous = day, clock, ambiguous


def _clock_of(text: str) -> time | None:
    s = western_digits(text).strip().lower()
    found = _CLOCK.fullmatch(s)
    if found:
        hour, minute, second, mark = int(found[1]), int(found[2]), int(found[3] or 0), found[4]
    else:
        only = _HOUR_ONLY.fullmatch(s)
        if not only:
            return None
        hour, minute, second, mark = int(only[1]), 0, 0, only[2]
    if mark:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if mark.lower() in _PM else 0)
    if hour > 23 or minute > 59 or second > 59:
        return None
    return time(hour, minute, second)


def parse_clock(value: object) -> time | None:
    """A time of day from "14:30", "2:30 PM", "٢:٣٠ م" or an Excel time cell; None if not one."""
    if isinstance(value, datetime):
        return value.time().replace(microsecond=0)
    if isinstance(value, time):
        return value.replace(microsecond=0)
    return _clock_of(_text(value))


def parse_day(value: object, order: str = "dmy") -> DateRead | None:
    """A day (and a time if the cell has one) from an Excel date cell or a written date:
    2026-11-21, 21/11/2026, 21.11.26, 21 Nov 2026, Nov 21, 2026, 21 نوفمبر 2026. None if it is not
    a date. Day first unless `order` is "mdy"; the year-first form is always read as such."""
    if isinstance(value, datetime):
        if value.year < 1900:  # an Excel cell that holds only a time
            return None
        return DateRead(value.date(), value.time().replace(microsecond=0)
                        if value.time() != time(0) else None)
    if isinstance(value, date):
        return DateRead(value, None)
    s = western_digits(_text(value))
    if not s:
        return None
    clock = None
    found = _TRAILING_CLOCK.search(s)
    if found and (c := _clock_of(found[1])) is not None:
        clock, s = c, s[:found.start()].strip(" ,")
    try:
        iso = _ISO.fullmatch(s)
        if iso:
            return DateRead(date(int(iso[1]), int(iso[2]), int(iso[3])), clock)
        numeric = _NUMERIC.fullmatch(s)
        if numeric:
            a, b, year = int(numeric[1]), int(numeric[2]), int(numeric[3])
            if year < 100:
                year += 2000
            day, month = (a, b) if order == "dmy" else (b, a)
            return DateRead(date(year, month, day), clock, ambiguous=a <= 12 and b <= 12 and a != b)
        named = _DAY_MONTH_NAME.fullmatch(s)
        if named and (m := _MONTHS.get(named[2].lower())):
            return DateRead(date(int(named[3]), m, int(named[1])), clock)
        named = _MONTH_NAME_DAY.fullmatch(s)
        if named and (m := _MONTHS.get(named[1].lower())):
            return DateRead(date(int(named[3]), m, int(named[2])), clock)
    except ValueError:
        return None
    return None


def _minutes(value: object) -> int:
    text = western_digits(_text(value))
    found = re.fullmatch(r"(\d{1,3})(?:[.,]0+)?(?:\s*(?:min|mins|minutes|m|د|دقيقة|دقائق))?", text,
                         re.IGNORECASE)
    if not found:
        clock = re.fullmatch(r"(\d{1,2}):(\d{2})(?::\d{2})?", text)
        if not clock:
            raise CellError("bad_duration", value=text)
        number = int(clock[1]) * 60 + int(clock[2])
    else:
        number = int(found[1])
    if not 5 <= number <= 600:
        raise CellError("bad_duration", value=text)
    return number


def status_of(value: object) -> str | None:
    """"completed", "no_show" or "cancelled" for a cell, "not_final" for a word that says the
    visit is not settled, None if the file has no word we know."""
    wanted = norm(value)
    if not wanted:
        return None
    for key, words in STATUS_WORDS.items():
        if wanted in {norm(w) for w in words}:
            return key
    if wanted in {norm(w) for w in NOT_FINAL_WORDS}:
        return "not_final"
    return None


def phone_digits(value: object) -> str | None:
    """A phone number as digits in international form, or None if it cannot be one. A number with
    eight digits is a Qatar number and gets 974; a number with a country code is kept."""
    raw = re.sub(r"[\s\-().+]", "", western_digits(_text(value)))
    raw = raw.removeprefix("00")
    if not raw.isdigit():
        return None
    if len(raw) == 8:
        raw = "974" + raw
    return raw if 9 <= len(raw) <= 15 and raw[0] != "0" else None


# ── rows to visits ───────────────────────────────────────────────────────────────────────


@dataclass
class Visit:
    row: int
    start: datetime  # aware, UTC
    end: datetime
    service: str
    service_ar: str
    status: str
    price: int | None
    stylist: str
    client_key: str
    client_kind: str  # "id", "phone" or "name"
    phone: str  # digits, or "" when not stored or not given
    name: str  # as the file wrote it, or ""
    booked_at: datetime | None
    cancelled_at: datetime | None
    row_key: str
    minutes: int
    day: date = field(default=date.min)  # the shop's local day, for the preview


@dataclass
class RowResult:
    row: int
    state: str  # ready, duplicate, problem
    visit: Visit | None = None
    problems: list[Problem] = field(default_factory=list)


@dataclass
class Built:
    results: list[RowResult] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)  # every problem, rows and file
    notes: list[dict] = field(default_factory=list)
    rows: int = 0  # data rows that held anything

    @property
    def visits(self) -> list[Visit]:
        return [r.visit for r in self.results if r.state == "ready" and r.visit is not None]


def build(
    rows: list[list[object]], mapping: dict[str, str], options: dict, *, tz: str, salt: bytes,
    now: datetime, truncated: bool = False,
) -> Built:
    """Read every data row of a file into a visit or a list of problems. `rows[0]` is the header
    row; `salt` is the business's secret for keys; `now` is when the file is read."""
    out = Built()
    headers = headers_of(rows)
    index = {key: headers.index(header) for key, header in mapping.items() if header in headers}
    data = rows[1:]
    out.rows = sum(1 for r in data if any(_text(c) for c in r))
    if truncated or len(data) > MAX_ROWS:
        out.problems.append(problem(1, "too_many_rows", limit=f"{MAX_ROWS:,}"))
        return out
    for key in missing_required(mapping, options):
        out.problems.append(problem(1, "no_client_column" if key == "client_id"
                                    else "missing_column", key))
    if out.problems:
        return out

    zone = ZoneInfo(tz)
    order = options.get("date_order", "dmy")
    default_status = options.get("default_status")
    default_minutes = options.get("default_minutes", DEFAULT_MINUTES)
    keep = bool(options.get("keep_personal"))
    date_only_ok = bool(options.get("allow_date_only"))
    ambiguous_seen = False
    no_price = False
    first_seen: dict[str, int] = {}

    def cell(row: list[object], key: str) -> object:
        i = index.get(key)
        return row[i] if i is not None and i < len(row) else None

    def local(day: date, clock: time) -> datetime:
        return datetime.combine(day, clock, zone).astimezone(UTC)

    for offset, row in enumerate(data):
        number = offset + 2
        if not any(_text(c) for c in row):
            continue
        problems: list[Problem] = []

        def bad(code: str, field_: str = "", _p=problems, _n=number, **args: object) -> None:
            _p.append(problem(_n, code, field_, **args))

        # the service
        service = _text(cell(row, "service"))
        if not service:
            bad("blank", "service")
        elif len(service) > NAME_MAX:
            bad("too_long", "service")
        service_ar = _text(cell(row, "service_ar"))
        if len(service_ar) > NAME_MAX:
            bad("too_long", "service_ar")

        # the status
        raw_status = cell(row, "status")
        status = None
        if _text(raw_status):
            found = status_of(raw_status)
            if found == "not_final":
                bad("not_final", "status", value=_text(raw_status))
            elif found is None:
                bad("bad_status", "status", value=_text(raw_status))
            else:
                status = found
        elif default_status:
            status = default_status
        else:
            bad("blank", "status")

        # the day and the time
        raw_date, raw_time = cell(row, "date"), cell(row, "time")
        day_read = parse_day(raw_date, order)
        clock = None
        if day_read is None:
            if _text(raw_date):
                bad("bad_date", "date", value=_text(raw_date))
            else:
                bad("blank", "date")
        else:
            clock = day_read.clock
            ambiguous_seen = ambiguous_seen or day_read.ambiguous
        if _text(raw_time):
            read = parse_clock(raw_time)
            if read is None:
                bad("bad_time", "time", value=_text(raw_time))
            else:
                clock = read
        if day_read is not None and clock is None and not any(
                p.code == "bad_time" for p in problems):
            if date_only_ok:
                clock = time(12, 0)
            else:
                bad("no_time", "time")
        start = None
        if day_read is not None and clock is not None:
            if not MIN_YEAR <= day_read.day.year <= now.year + 1:
                bad("date_out_of_range", "date", value=_text(raw_date))
            else:
                start = local(day_read.day, clock)

        # how long
        minutes = default_minutes
        raw_duration, raw_end = cell(row, "duration"), cell(row, "end_time")
        end = None
        if start is not None:
            if _text(raw_duration):
                try:
                    minutes = _minutes(raw_duration)
                except CellError as error:
                    bad("bad_duration", "duration", value=error.args_.get("value", ""))
            elif _text(raw_end):
                finish = parse_clock(raw_end)
                if finish is None:
                    bad("bad_time", "end_time", value=_text(raw_end))
                else:
                    end = local(day_read.day, finish)
                    if end <= start:
                        bad("end_before_start")
                    else:
                        minutes = max(5, min(600, int((end - start).total_seconds() // 60)))
            end = start + timedelta(minutes=minutes)
            if status in ("completed", "no_show") and start > now:
                bad("in_future", "status", value=_text(raw_status) or status)

        # the price
        price = None
        if _text(cell(row, "price")):
            try:
                price = values.parse_money(cell(row, "price"), zero_ok=True)
            except CellError:
                bad("bad_money", "price", value=_text(cell(row, "price")))
        else:
            no_price = no_price or "price" in mapping

        # who: the shop's own number, then the phone, then the name
        kind, ident, phone = "", "", ""
        client_id = _text(cell(row, "client_id"))
        raw_phone = _text(cell(row, "phone"))
        name_text = _text(cell(row, "name"))
        if raw_phone:
            digits = phone_digits(raw_phone)
            if digits is None:
                if not client_id:
                    bad("bad_phone", "phone", value=raw_phone)
            else:
                phone = digits
        if client_id:
            kind, ident = "id", norm(client_id)
        elif phone:
            kind, ident = "phone", phone
        elif name_text:
            kind, ident = "name", norm(name_text)
        elif not any(p.code == "bad_phone" for p in problems):
            bad("no_client")
        client_key = key_of(salt, "client", kind, ident) if kind else ""

        booked_at = cancelled_at = None
        for key, setter in (("booked_at", "booked"), ("cancelled_at", "cancelled")):
            raw = cell(row, key)
            if not _text(raw):
                continue
            read = parse_day(raw, order)
            if read is None:
                bad("bad_date", key, value=_text(raw))
                continue
            moment = local(read.day, read.clock or time(12, 0))
            if setter == "booked":
                booked_at = moment
            elif read.clock is not None:
                cancelled_at = moment  # with no time of day it says nothing about "late"

        if problems or start is None or end is None or status is None or not client_key:
            out.results.append(RowResult(number, "problem", None, problems))
            out.problems.extend(problems)
            continue

        visit_ref = norm(cell(row, "visit_id"))
        row_key = (key_of(salt, "visit-id", visit_ref) if visit_ref
                   else key_of(salt, "visit", client_key, start.strftime("%Y%m%dT%H%M"),
                               norm(service)))
        visit = Visit(
            row=number, start=start, end=end, service=service,
            service_ar=service_ar, status=status, price=price,
            stylist=_text(cell(row, "stylist"))[:NAME_MAX], client_key=client_key,
            client_kind=kind, phone=phone if keep else "",
            name=name_text if keep else "", booked_at=booked_at, cancelled_at=cancelled_at,
            row_key=row_key, minutes=minutes, day=start.astimezone(zone).date(),
        )
        if row_key in first_seen:
            out.results.append(RowResult(number, "duplicate", visit, []))
            continue
        first_seen[row_key] = number
        out.results.append(RowResult(number, "ready", visit, []))

    if any(r.state == "duplicate" for r in out.results):
        out.notes.append(note("duplicate_in_file"))
    if ambiguous_seen and order == "dmy":
        out.notes.append(note("dates_day_first"))
    if no_price:
        out.notes.append(note("no_price"))
    return out


# ── the template ─────────────────────────────────────────────────────────────────────────


def template_rows(lang: str = "en") -> list[list[object]]:
    """A file with the columns the import reads and three made-up visits, to hand to a client's
    other system's owner so they know what to send."""
    if lang == "ar":
        return [
            ["رقم الموعد", "رقم العميل", "الخدمة", "الموظفة", "التاريخ", "الوقت", "المدة (دقائق)",
             "السعر", "الحالة", "تاريخ إنشاء الحجز", "تاريخ الإلغاء"],
            ["A-1001", "C-001", "قص شعر", "ريم", "2026-10-04", "10:30", 60, "120.00", "حضر",
             "2026-10-02 18:10", ""],
            ["A-1002", "C-002", "مانيكير", "", "2026-10-04", "14:00", 45, "90.00", "لم يحضر",
             "2026-10-03 09:00", ""],
            ["A-1003", "C-001", "صبغة", "دانة", "2026-10-05", "16:00", 120, "350.00", "ملغي",
             "2026-10-01 12:00", "2026-10-05 11:30"],
        ]
    return [
        ["Appointment ID", "Client ID", "Service", "Staff", "Date", "Start Time",
         "Duration (min)", "Price", "Status", "Created At", "Cancelled At"],
        ["A-1001", "C-001", "Haircut", "Reem", "2026-10-04", "10:30", 60, "120.00", "Completed",
         "2026-10-02 18:10", ""],
        ["A-1002", "C-002", "Manicure", "", "2026-10-04", "14:00", 45, "90.00", "No show",
         "2026-10-03 09:00", ""],
        ["A-1003", "C-001", "Colour", "Dana", "2026-10-05", "16:00", 120, "350.00", "Cancelled",
         "2026-10-01 12:00", "2026-10-05 11:30"],
    ]
