"""Colours on a printed document, from the tokens (`brand.py`, `design/tokens.json`) and the
shop's own brand colour.

A document is paper: ALYR's Carbon on a white sheet, hairlines in the tokens' `line`, nothing
in Volt (Volt means something is true or done, `alyr-design` rule 1; it is not a shop's
colour). The shop may choose a brand colour for the rule under its header and its title.
Printing wants more care than a screen: a pale colour disappears on paper, so a colour that is
too light for a rule is refused when it is saved, and one too light for text is not used for
text.
"""

from alyr import brand

# WCAG 2.x: 3:1 is the bar for a graphic (the rule), 4.5:1 for small text.
RULE_CONTRAST = 3.0
TEXT_CONTRAST = 4.5

PAPER = brand.LIGHT["surface"]
INK = brand.LIGHT["text"]
MUTED = brand.LIGHT["text-muted"]
HAIRLINE = brand.LIGHT["line"]
STRONG_LINE = brand.LIGHT["line-strong"]
WASH = brand.LIGHT["surface-subtle"]
# What a shop with no colour of its own uses: ALYR's neutral.
NEUTRAL_ACCENT = brand.COLOR["brand"]["carbon"]


def rgb(colour: str) -> tuple[int, int, int]:
    colour = colour.lstrip("#")
    return int(colour[0:2], 16), int(colour[2:4], 16), int(colour[4:6], 16)


def _channel(value: int) -> float:
    c = value / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(colour: str) -> float:
    r, g, b = (_channel(v) for v in rgb(colour))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def accent_rule(brand_color: str | None) -> str:
    """The colour of the rule under the header: the shop's, or ALYR's neutral."""
    return brand_color or NEUTRAL_ACCENT


def accent_text(brand_color: str | None) -> str:
    """The colour the title is set in: the shop's when it can be read on white, else Carbon."""
    if brand_color and contrast(brand_color, PAPER) >= TEXT_CONTRAST:
        return brand_color
    return INK
