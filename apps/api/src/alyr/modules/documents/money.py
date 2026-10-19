"""Money on a document: integers in the currency's smallest unit, never a float.

QAR has two decimals (1 QAR = 100 dirhams, as everywhere in ALYR); the other Gulf dinars and
rials have three. A document stores its currency's exponent when it is made, so it reads the
same whatever this table says later.

One rounding rule, and the database keeps it too (a CHECK on `document_lines`): the line's
price times its quantity is rounded half up to a whole minor unit, the discount comes off,
and tax is worked out on that and rounded the same way. Tax is never added up across lines
and then rounded, so the paper's columns always add up to its total.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal


@dataclass(frozen=True)
class Currency:
    code: str
    exponent: int
    # How the Arabic page writes it after the amount (alyr-design: «449 ر.ق»). A draft until ALY-66.
    symbol_ar: str


# The Gulf currencies, and the dollar. A shop in another country comes with its country pack
# (ALY-145); until then any other code is refused with a message.
CURRENCIES: dict[str, Currency] = {
    c.code: c for c in (
        Currency("QAR", 2, "ر.ق"),
        Currency("SAR", 2, "ر.س"),
        Currency("AED", 2, "د.إ"),
        Currency("OMR", 3, "ر.ع."),
        Currency("KWD", 3, "د.ك"),
        Currency("BHD", 3, "د.ب"),
        Currency("USD", 2, "دولار"),
    )
}
DEFAULT_CURRENCY = "QAR"

# A document can run to a few hundred lines; one amount never needs more than this.
MAX_MINOR = 100_000_000_000


class MoneyError(ValueError):
    """An amount that does not make sense; the message is for a developer, the API wraps it."""


def round_half_up(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def line_amounts(
    quantity: Decimal, unit_price_minor: int, discount_minor: int, tax_rate_bp: int
) -> tuple[int, int, int]:
    """(net, tax, total) of one line, all in minor units.

    net = round(quantity * price) - discount; tax = round(net * rate / 10000); total = net + tax.
    """
    if isinstance(quantity, float) or isinstance(unit_price_minor, float):
        raise MoneyError("money is never a float")
    gross = round_half_up(quantity * Decimal(unit_price_minor))
    net = gross - discount_minor
    if net < 0:
        raise MoneyError("a discount cannot be more than the line")
    tax = round_half_up(Decimal(net) * Decimal(tax_rate_bp) / Decimal(10000))
    return net, tax, net + tax


def round_to_step(total: int, step: int) -> int:
    """The difference cash rounding makes: the total taken to the nearest multiple of `step`
    minor units, halves going up. 12703 with a step of 5 gives +2 (12705); 12702 gives -2."""
    if step <= 0:
        return 0
    return (2 * total + step) // (2 * step) * step - total


def gross_of(quantity: Decimal, unit_price_minor: int) -> int:
    return round_half_up(quantity * Decimal(unit_price_minor))


def plain(minor: int, exponent: int) -> str:
    """1250000 -> '12,500.00' (exponent 2). Western digits, a comma between thousands, a point
    for decimals, the same on the English and the Arabic page."""
    sign = "-" if minor < 0 else ""
    minor = abs(minor)
    scale = 10**exponent
    whole, frac = divmod(minor, scale)
    text = f"{whole:,}"
    if exponent:
        text += "." + str(frac).rjust(exponent, "0")
    return sign + text


def written(minor: int, currency: str, exponent: int, lang: str) -> str:
    """The amount with its currency, the way each language writes it: «1,250.00 ر.ق» and
    'QAR 1,250.00'."""
    number = plain(minor, exponent)
    if lang == "ar":
        symbol = CURRENCIES[currency].symbol_ar if currency in CURRENCIES else currency
        return f"{number} {symbol}"
    return f"{currency} {number}"


def quantity_text(quantity: Decimal) -> str:
    """2.000 -> '2', 0.500 -> '0.5', 12.250 -> '12.25'."""
    text = format(quantity.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"
