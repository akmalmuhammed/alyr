"""Quantities: how many, or how much, of an item (D-039 "As built (decimal quantities)", ALY-149).

A quantity is exact. It is a whole number, or a decimal with at most three places (0.25 kg,
12.5 kg, 250 ml). It is never a float: not in Python (an `int` or a `Decimal`), not in
PostgreSQL (`numeric(14,3)`), not in the web (the page works in thousandths, whole numbers).

**One representation.** `norm` turns any quantity into an `int` when it is whole and a
`Decimal` with its trailing zeros removed when it is not. The database connection reads every
`numeric` that way (`db.py`), so a stock of `3` is the Python `3`, exactly what it was when
quantities were integers, and `12.5` is `Decimal('12.5')`. Code written for whole numbers keeps
working for whole numbers; only a fraction needs to know it is one.

**One rounding rule.** A line costs `unit price x quantity`, rounded **half up to a whole minor
unit (a dirham) once per line**, and an order is the sum of its rounded lines. `line_total` is
that rule and nothing else may compute a line's money (the Documents engine uses the same rule,
`modules/documents/money.py`, so an order and the invoice made from it agree to the dirham).

**One way to write it.** `fmt` and `with_unit` write a quantity for a person: Western digits in
English and in Arabic (the rest of the workspace does the same), a point for the decimal mark,
no trailing zeros ("0.5", "12.5", "3"), the unit's short name after a measure ("0.5 kg",
«0.5 كغ»; a quantity of a measure always carries its unit, whole or not). A piece, a box, a pack,
a portion or an hour carries no suffix: "3", as it always did. Order lines made before the
feature keep the unit `piece` and so read as they always did.

**The units** are a short list with English and Arabic names. The measures (kg, g, litre, ml,
metre, tola) may be sold in fractions; the others are counted and stay whole.
"""

import json
import re
from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from alyr.core.normalise import western_digits

Qty = int | Decimal  # what a quantity is in Python: `norm` makes it

PLACES = Decimal("0.001")  # three decimals, the most a quantity has
MAX_QUANTITY = 999  # the most one order line may ask for, as it always was
MAX_STOCK = Decimal("99999999999.999")  # numeric(14,3)


class QtyError(ValueError):
    """A quantity that cannot be read or does not fit. `code` is stable."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


# ── the units ─────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Unit:
    key: str
    en: str
    ar: str
    short_en: str  # written after a quantity of a measure; empty for a counted unit
    short_ar: str
    measure: bool  # may be sold in fractions
    step: str = "1"  # what the item form suggests as the step
    chips: tuple[str, ...] = ()  # the quick quantities on the order page


UNIT_LIST: tuple[Unit, ...] = (
    # Counted: whole numbers, as before. (The first six keys are the ones stored since 0022.)
    Unit("piece", "Piece", "قطعة", "", "", False),
    Unit("pack", "Pack", "عبوة", "", "", False),
    Unit("box", "Box", "علبة", "", "", False),
    Unit("portion", "Portion", "حصة", "", "", False),
    Unit("hour", "Hour", "ساعة", "", "", False),
    # Measured: may be fractions.
    Unit("kg", "Kilogram", "كيلوغرام", "kg", "كغ", True, "0.25", ("0.25", "0.5", "1")),
    Unit("g", "Gram", "غرام", "g", "غ", True, "50", ("100", "250", "500")),
    Unit("l", "Litre", "لتر", "L", "لتر", True, "0.25", ("0.25", "0.5", "1")),
    Unit("ml", "Millilitre", "مليلتر", "ml", "مل", True, "50", ("50", "100", "250")),
    Unit("m", "Metre", "متر", "m", "م", True, "0.5", ("0.5", "1", "2")),
    Unit("tola", "Tola", "تولة", "tola", "تولة", True, "0.5", ("0.5", "1", "2")),
)
UNITS_BY_KEY: dict[str, Unit] = {u.key: u for u in UNIT_LIST}
UNITS: tuple[str, ...] = tuple(UNITS_BY_KEY)
MEASURES: tuple[str, ...] = tuple(u.key for u in UNIT_LIST if u.measure)
# The units a shop had before this feature existed: always allowed, feature or not.
LEGACY_UNITS: tuple[str, ...] = ("piece", "kg", "box", "pack", "portion", "hour")
assert set(LEGACY_UNITS) <= set(UNITS)


def is_measure(unit: str) -> bool:
    found = UNITS_BY_KEY.get(unit)
    return bool(found and found.measure)


def unit_view(unit: str) -> dict:
    """The unit as a screen needs it: names, short names, whether it is a measure, the step it
    suggests and its quick quantities."""
    u = UNITS_BY_KEY[unit]
    return {
        "key": u.key, "name": u.en, "name_ar": u.ar, "short": u.short_en, "short_ar": u.short_ar,
        "measure": u.measure, "step": norm(Decimal(u.step)),
        "chips": [norm(Decimal(c)) for c in u.chips],
    }


def units_view() -> list[dict]:
    return [unit_view(u.key) for u in UNIT_LIST]


# ── reading ───────────────────────────────────────────────────────────────────────────


def norm(value: Any) -> Qty:
    """A quantity in its one form: an `int` if it is whole, else a `Decimal` with no trailing
    zeros. Rounds nothing: a value with more than three decimals is kept as it is (use `parse`
    to refuse one)."""
    d = value if isinstance(value, Decimal) else Decimal(str(value) if not isinstance(
        value, int) else value)
    if d == d.to_integral_value():
        return int(d)
    return d.normalize()


def parse(raw: Any, *, allow_zero: bool = False, allow_negative: bool = False) -> Qty:
    """A quantity from what a person or a client sent: an int, a Decimal, a string with
    Western or Arabic digits ("0.5", "٠٫٥", "0,5"), or a float that is exactly a quantity
    (the decimal text of a float, so 0.1 is 0.1). Raises `QtyError` ("bad_number",
    "too_many_places", "negative", "zero", "too_big")."""
    if isinstance(raw, bool):
        raise QtyError("bad_number", "That is not a number.")
    if isinstance(raw, int):
        d = Decimal(raw)
    elif isinstance(raw, Decimal):
        d = raw
    elif isinstance(raw, float):
        d = Decimal(repr(raw)) if raw == raw and abs(raw) != float("inf") else Decimal("NaN")
    elif isinstance(raw, str):
        d = _from_text(raw)
    else:
        raise QtyError("bad_number", "That is not a number.")
    if not d.is_finite():
        raise QtyError("bad_number", "That is not a number.")
    if d != d.quantize(PLACES):
        raise QtyError("too_many_places", "A quantity can have at most three decimals.")
    if d < 0 and not allow_negative:
        raise QtyError("negative", "A quantity cannot be negative.")
    if d == 0 and not allow_zero and not allow_negative:
        raise QtyError("zero", "A quantity must be above zero.")
    if abs(d) > MAX_STOCK:
        raise QtyError("too_big", "That number is too big.")
    return norm(d)


def _from_text(text: str) -> Decimal:
    s = western_digits(text).strip().replace(" ", "").replace(" ", "")
    sign = ""
    if s[:1] in "+-" and len(s) > 1:
        sign, s = s[0], s[1:]
    if "," in s:
        # A comma groups thousands ("1,250", "1,250.5") or, alone and not before exactly three
        # numerals, marks the decimals ("0,5"). Anywhere else it makes no quantity ("1,2,3").
        if re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", s):
            s = s.replace(",", "")
        elif re.fullmatch(r"\d*,\d+", s) and len(s.split(",")[1]) != 3:
            s = s.replace(",", ".")
        else:
            raise QtyError("bad_number", "That is not a number.")
    if not s or not all(c.isdigit() or c == "." for c in s) or s.count(".") > 1 or s == ".":
        raise QtyError("bad_number", "That is not a number.")
    try:
        return Decimal(sign + s)
    except InvalidOperation as error:
        raise QtyError("bad_number", "That is not a number.") from error


# ── writing ───────────────────────────────────────────────────────────────────────────


def fmt(value: Any, lang: str = "en", *, group: bool = False) -> str:
    """A quantity as a person reads it: "3", "0.5", "12.5". Western digits and a point in
    both languages. `group` puts commas between thousands ("12,500")."""
    q = norm(value)
    return f"{q:,}" if group else f"{q}"


def with_unit(value: Any, unit: str, lang: str = "en", *, group: bool = False) -> str:
    """A quantity with its unit when the unit is a measure ("0.5 kg", «0.5 كغ»), else the
    number alone ("3")."""
    text = fmt(value, lang, group=group)
    u = UNITS_BY_KEY.get(unit)
    if u is None or not u.measure:
        return text
    return f"{text} {u.short_ar if lang == 'ar' else u.short_en}"


def shown(unit: str, step: Any = None, minimum: Any = 1) -> bool:
    """Is the unit written beside a quantity of this item? (`rules(...)["show_unit"]`.)"""
    return bool(rules(unit, step, minimum)["show_unit"])


def label(value: Any, unit: str, show: bool, lang: str = "en") -> str:
    """A quantity in a message: with its unit when the item is sold in fractions (`show`) or the
    quantity is itself a fraction, else the bare number ("3 x Dates")."""
    q = norm(value)
    return with_unit(q, unit, lang) if show or not isinstance(q, int) else fmt(q, lang)


def line_total(unit_price: int, quantity: Any) -> int:
    """What one order line costs, in minor units: the price of one times the quantity,
    rounded half up to a whole unit. THE rounding rule; see the module note."""
    q = quantity if isinstance(quantity, int) else Decimal(quantity)
    if isinstance(q, int):
        return unit_price * q
    return int((Decimal(unit_price) * q).quantize(Decimal(1), rounding=ROUND_HALF_UP))


# ── steps and the least that can be asked ─────────────────────────────────────────────


def is_whole(value: Any) -> bool:
    return norm(value) == int(norm(value))


def is_multiple(value: Any, step: Any) -> bool:
    """`value` is a whole number of `step`s."""
    return (Decimal(value) / Decimal(step)) == (Decimal(value) / Decimal(step)).to_integral_value()


def next_multiple(value: Any, step: Any) -> Qty:
    """The least multiple of `step` that is at least `value` (a pack's next whole pack up)."""
    s = Decimal(step)
    return norm((Decimal(value) / s).to_integral_value(rounding=ROUND_CEILING) * s)


def previous_multiple(value: Any, step: Any) -> Qty:
    s = Decimal(step)
    return norm((Decimal(value) / s).to_integral_value(rounding=ROUND_FLOOR) * s)


def check_range(quantity: Any, unit: str) -> tuple[str, dict] | None:
    """Is this a quantity at all for this unit: above zero, at most 999 a line, at most three
    decimals, and a whole number if the unit is counted? None when it is; else (code, {}):
    `bad_quantity` (a counted unit) or `bad_amount` (a measure) for a number that cannot be
    asked for, `not_whole` for a fraction of a counted unit."""
    measure = is_measure(unit)
    wrong = "bad_amount" if measure else "bad_quantity"
    try:
        q = Decimal(quantity)
    except (InvalidOperation, TypeError, ValueError):
        return wrong, {}
    if not q.is_finite() or q <= 0 or q > MAX_QUANTITY or q != q.quantize(PLACES):
        return wrong, {}
    if not measure and q != q.to_integral_value():
        return "not_whole", {}
    return None


def check_lots(
    quantity: Any, unit: str, step: Any = None, minimum: Any = 1
) -> tuple[str, dict] | None:
    """Given the item's step (its `pack_size`) and smallest order (`min_order`): None when
    the quantity is allowed; else (code, details):

    * `below_minimum`: under the smallest order. Details: `minimum`.
    * `off_step`: a measure that is not a multiple of its step. Details: `pack`, `suggest`.
    * `not_pack_multiple`: a counted unit sold by the pack that is not a multiple. Details:
      `pack`, `suggest`.

    No step (or 1) asks a counted unit nothing. For a measure it means whole units only: an item
    sold by weight takes fractions only when its owner gives it a step such as 0.25.
    """
    q = Decimal(quantity)
    if q < Decimal(minimum or 1):
        return "below_minimum", {"minimum": norm(Decimal(minimum or 1))}
    pack = Decimal(step) if step else Decimal(1)
    if unit in ("box", "pack"):
        return None
    if not is_multiple(q, pack):
        code = "off_step" if is_measure(unit) else "not_pack_multiple"
        return code, {"pack": norm(pack), "suggest": next_multiple(q, pack)}
    return None


def rules(unit: str, step: Any = None, minimum: Any = 1) -> dict:
    """How an item may be ordered, for a screen: `measure` (sold by weight or volume), `step`
    (the least change: 1 unless the item has a pack size or step), `min` (the smallest order),
    `fractions` (whether anything but a whole number can be asked), `show_unit` (whether the unit
    is written beside a quantity) and `chips`, the quick quantities the order page offers for
    an item sold by a measure with its unit shown (the unit's usual ones that the item's step and
    minimum allow)."""
    # A box or a pack is already the pack: its pack size says what is in it, not how it is ordered.
    pack = Decimal(step) if step and unit not in ("box", "pack") else Decimal(1)
    low = Decimal(minimum or 1)
    measure = is_measure(unit)
    fractions = measure and (
        pack != pack.to_integral_value() or low != low.to_integral_value()
    )
    # The unit is written beside a quantity of an item sold in fractions, and of one sold in a unit
    # that is new with this feature (ml, g, litre, metre, tola); a kilo item sold in whole numbers
    # reads "3" as it always did.
    show = measure and (fractions or unit not in LEGACY_UNITS)
    chips: list = []
    if show:
        for c in UNITS_BY_KEY[unit].chips:
            if check_lots(Decimal(c), unit, pack, low) is None:
                chips.append(norm(Decimal(c)))
    return {
        "measure": measure, "step": norm(pack), "min": norm(low), "fractions": fractions,
        # Write the unit beside a quantity of this item ("0.5 kg", "250 ml"). A kilo item sold in
        # whole numbers reads "3", as it always did.
        "show_unit": show, "chips": chips,
    }


def check(
    quantity: Any, unit: str, step: Any = None, minimum: Any = 1
) -> tuple[str, dict] | None:
    """`check_range`, then `check_lots`: can this be asked for?"""
    return check_range(quantity, unit) or check_lots(quantity, unit, step, minimum)


# ── the API's request models ──────────────────────────────────────────────────────────


def quantity_field(
    *, gt: Any = None, ge: Any = None, lt: Any = None, le: Any = None, signed: bool = False
) -> Any:
    """A request field that is a quantity: a JSON number or a string ("0.5"), read exactly (a
    float is read by its decimal text, so 0.1 is 0.1), at most three decimals, within the bounds
    given. Whole values arrive as `int`, fractions as `Decimal` (`norm`). A client that sends
    integers works as it always did. Use as `x: quantity_field(ge=0) | None = None`."""
    from pydantic import AfterValidator, BeforeValidator

    def read(raw: Any) -> Any:
        try:
            q = parse(raw, allow_zero=True, allow_negative=signed or (ge is not None and ge < 0))
        except QtyError as error:
            raise ValueError(str(error)) from error
        if (gt is not None and not q > gt) or (ge is not None and not q >= ge) \
                or (lt is not None and not q < lt) or (le is not None and not q <= le):
            bounds = ", ".join(f"{k} {v}" for k, v in
                               (("above", gt), ("at least", ge), ("below", lt), ("at most", le))
                               if v is not None)
            raise ValueError(f"A quantity {bounds}.")
        return q

    from typing import Annotated

    return Annotated[Decimal | int, BeforeValidator(read), AfterValidator(norm)]


# ── json ──────────────────────────────────────────────────────────────────────────────


def json_default(value: Any) -> Any:
    """For `json.dumps(default=...)`: a Decimal quantity is a JSON number, an integer when it is
    whole."""
    if isinstance(value, Decimal):
        q = norm(value)
        return q if isinstance(q, int) else float(q)
    raise TypeError(f"{type(value).__name__} is not JSON serialisable")


def dumps(value: Any, **kwargs: Any) -> str:
    return json.dumps(value, default=json_default, **kwargs)


def plain(obj: Any) -> Any:
    """`obj` with every Decimal a JSON number (an `int` when whole, else a float, which prints
    as its shortest decimal text, so 0.25 is `0.25`). Returns the same object when there is
    nothing to change. FastAPI's own serialisation of a route that returns a dict writes a Decimal
    as a string; the API's one rule is that a quantity is a number (spec 013)."""
    if isinstance(obj, Decimal):
        return json_default(obj)
    if type(obj) is dict:
        out = None
        for key, value in obj.items():
            new = plain(value)
            if new is not value:
                out = dict(obj) if out is None else out
                out[key] = new
        return obj if out is None else out
    if type(obj) in (list, tuple):
        items = [plain(v) for v in obj]
        return obj if all(a is b for a, b in zip(items, obj, strict=True)) else items
    return obj


def install_json(app: Any = None) -> None:
    """Make every answer write a quantity as a JSON number: a route's return value, and the
    `detail` of an HTTPException (a refusal with the lines of a cart in it). Called once when the
    app is made."""
    import fastapi.routing as routing

    original = routing.serialize_response
    if not getattr(original, "_alyr_quantities", False):
        async def serialize_response(*, response_content: Any, **kwargs: Any) -> Any:
            return await original(response_content=plain(response_content), **kwargs)

        serialize_response._alyr_quantities = True  # type: ignore[attr-defined]
        routing.serialize_response = serialize_response

    if app is not None:
        from fastapi.responses import JSONResponse, Response
        from starlette.exceptions import HTTPException

        async def refused(request: Any, error: HTTPException) -> Response:
            headers = getattr(error, "headers", None)
            if error.status_code in (204, 304) or error.status_code < 200:
                return Response(status_code=error.status_code, headers=headers)
            return JSONResponse(
                {"detail": plain(error.detail)}, status_code=error.status_code, headers=headers
            )

        app.add_exception_handler(HTTPException, refused)


def encode_numeric(value: Any) -> str:
    """For the database connection's `numeric` codec. Floats are refused on purpose: a float
    reaching a quantity or an amount is a bug."""
    if isinstance(value, float) or isinstance(value, bool):
        raise TypeError("a float must not be stored in a numeric column")
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def decode_numeric(text: str) -> Qty | Decimal:
    """For the database connection's `numeric` codec: a whole number is an `int`, anything else
    a `Decimal` without trailing zeros (see the module note)."""
    if text == "NaN":
        return Decimal("NaN")
    return norm(Decimal(text))
