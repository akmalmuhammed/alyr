"""The drawing tools under the PDF layouts: fonts, measuring, text in either direction,
paragraphs that wrap, rules and pictures. fpdf2 does the shaping (HarfBuzz) and the bidirectional
ordering of free text; this module decides which font a text is set in and keeps the places
where fpdf2's own handling is weak out of the document.

Fonts are the brand's (`brand.FONT_FILE`, SIL Open Font Licence 1.1, in
`modules/agent/fonts/`): IBM Plex Sans Arabic for anything with Arabic in it, Instrument Sans for
Latin text, IBM Plex Mono for the verification code. Both text faces are embedded in the PDF as
subsets, so a document opens the same on a phone, a laptop and a printer with no fonts of its
own, and nothing is fetched while it is drawn.

Rules that came out of the PDF spike (`specs/010-documents-engine/spec.md`):

* A string with any Arabic in it is set wholly in Plex Sans Arabic, which carries the Latin
  glyphs too. Splitting a string between two faces drops the diacritics' positioning.
* Numbers, phone numbers, IDs and amounts are drawn as runs of their own, placed beside the
  Arabic by this module, never left to be reordered inside an Arabic sentence: a bare
  "+974 5555 0000" in an Arabic line comes out as "0000 5555 974+". Free text a person typed
  (a product name, an address) goes through fpdf2's ordering whole, which handles it.
* No Unicode direction-isolate characters: fpdf2's handling of them is wrong.
* Arabic is set about 10% larger than the Latin beside it and with a looser line, so the two
  look the same size (`alyr-print`).
"""

import io
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import MethodReturnValue, XPos, YPos
from PIL import Image

from alyr import brand
from alyr.modules.documents import colours

FONT_DIR = Path(__file__).resolve().parents[2] / "agent" / "fonts"
POINT = 25.4 / 72  # millimetres in a point

ARABIC = re.compile("[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
ARABIC_SCALE = 1.1

# A fixed instant for a file that has none of its own: the same input, the same bytes.
EPOCH = datetime(2026, 1, 1, tzinfo=UTC)


def has_arabic(text: str) -> bool:
    return bool(ARABIC.search(text))


def family_for(text: str, lang: str) -> str:
    """Plex Arabic for anything with Arabic in it, and for any text in an Arabic line (so a
    number beside Arabic words is drawn by the same face); Instrument Sans otherwise."""
    return "ar" if lang == "ar" or has_arabic(text) else "en"


@dataclass(frozen=True)
class Ink:
    """A text style. `size` is the Latin size in points; Arabic is scaled up from it."""

    size: float = 9.0
    bold: bool = False
    colour: str = colours.INK
    mono: bool = False


class Sheet(FPDF):
    """An FPDF whose footer is drawn by whoever is laying the page out."""

    footer_painter = None

    def footer(self) -> None:
        if self.footer_painter is not None:
            self.footer_painter()


class Pen:
    def __init__(
        self, width: float, height: float, *, title: str, author: str, created: datetime | None,
        language: str, trace: list | None = None,
    ) -> None:
        pdf = Sheet(unit="mm", format=(width, height))
        pdf.set_margins(0, 0, 0)
        # Text sits exactly in the box it is given: no inner margin, so columns line up.
        pdf.c_margin = 0
        pdf.set_auto_page_break(False)
        pdf.set_compression(True)
        pdf.set_creation_date(created or EPOCH)
        pdf.set_title(title)
        pdf.set_author(author)
        pdf.set_creator("ALYR")
        pdf.set_lang(language)
        for family, files in (
            ("ar", (brand.FONT_FILE["arabic-400"], brand.FONT_FILE["arabic-600"])),
            ("en", (brand.FONT_FILE["sans-400"], brand.FONT_FILE["sans-600"])),
        ):
            pdf.add_font(family, "", str(FONT_DIR / files[0]))
            pdf.add_font(family, "B", str(FONT_DIR / files[1]))
        pdf.add_font("mono", "", str(FONT_DIR / brand.FONT_FILE["mono-400"]))
        # Tabular figures where the face has them, so amounts line up in a column.
        pdf.set_text_shaping(True, features={"tnum": True})
        self.pdf = pdf
        self.width = width
        self.height = height
        # A list to record every drawing call in, for the layout tests: what was drawn, where,
        # in what size. It does not change the drawing.
        self.trace = trace

    # ── fonts and measuring ───────────────────────────────────

    def use(self, text: str, lang: str, ink: Ink) -> str:
        family = "mono" if ink.mono else family_for(text, lang)
        size = ink.size * (ARABIC_SCALE if family == "ar" else 1.0)
        self.pdf.set_font(family, "B" if ink.bold and family != "mono" else "", size)
        self.pdf.set_text_color(*colours.rgb(ink.colour))
        return family

    def line_height(self, text: str, lang: str, ink: Ink) -> float:
        """The height of one line of this text, in millimetres."""
        family = "mono" if ink.mono else family_for(text, lang)
        size = ink.size * (ARABIC_SCALE if family == "ar" else 1.0)
        return size * POINT * (1.62 if family == "ar" else 1.4)

    def width_of(self, text: str, lang: str, ink: Ink) -> float:
        if not text:
            return 0.0
        self.use(text, lang, ink)
        return self.pdf.get_string_width(text)

    def fit(self, text: str, lang: str, ink: Ink, room: float, floor: float = 6.0) -> Ink:
        """The same style made smaller until `text` fits in `room` (never cut, never an
        ellipsis): an amount that is larger than usual shrinks, it does not run into the next
        column."""
        current = ink
        while current.size > floor and self.width_of(text, lang, current) > room:
            current = Ink(round(current.size - 0.25, 2), ink.bold, ink.colour, ink.mono)
        return current

    def fit_runs(
        self, runs: list[tuple[str, str, Ink]], room: float, gap: float, floor: float = 6.0
    ) -> list[tuple[str, str, Ink]]:
        """The same pieces of one line made smaller together until the line fits in `room`."""
        current = runs
        while True:
            width = sum(self.width_of(text, lang, ink) for text, lang, ink in current)
            width += gap * (len(current) - 1)
            size = max(ink.size for _, _, ink in current)
            if width <= room or size <= floor:
                return current
            current = [(text, lang, Ink(round(ink.size - 0.25, 2), ink.bold, ink.colour, ink.mono))
                       for text, lang, ink in current]

    # ── text ──────────────────────────────────────────────────

    def put(
        self, text: str, x: float, y: float, w: float, h: float, lang: str, ink: Ink,
        align: str = "L",
    ) -> None:
        """One line of text in a box `w` wide and `h` tall."""
        if not text:
            return
        if self.trace is not None:
            self.trace.append(("text", text, lang, round(x, 1), round(y, 1), round(w, 1),
                               round(h, 1), ink.size, ink.bold, ink.colour, align))
        self.use(text, lang, ink)
        self.pdf.set_xy(x, y)
        self.pdf.cell(w, h, text, align=align, new_x=XPos.RIGHT, new_y=YPos.TOP)

    def run_row(
        self, runs: list[tuple[str, str, Ink]], x0: float, x1: float, y: float, h: float,
        *, rtl: bool, align: str = "L", gap: float = 1.2,
    ) -> float:
        """Several pieces of text on one line, in the order they are read: the first piece is
        the rightmost in an RTL line and the leftmost otherwise, and each piece is set in its
        own direction. `align` places the whole line in [x0, x1]: "L", "R" or "C", in page
        terms (left and right), not reading terms. Returns the width used."""
        runs = [r for r in runs if r[0]]
        if not runs:
            return 0.0
        widths = [self.width_of(text, lang, ink) for text, lang, ink in runs]
        total = sum(widths) + gap * (len(runs) - 1)
        room = x1 - x0
        if align == "C":
            offset = (room - total) / 2
        elif align == "R":
            offset = room - total
        else:
            offset = 0.0
        cursor = x0 + max(offset, 0.0)
        order = list(zip(runs, widths, strict=True))
        if rtl:
            order.reverse()
        for (text, lang, ink), width in order:
            self.put(text, cursor, y, width + 0.4, h, lang, ink, "L")
            cursor += width + gap
        return total

    def paragraph(
        self, text: str, x: float, y: float, w: float, lang: str, ink: Ink,
        *, align: str | None = None, rtl: bool | None = None, draw: bool = True,
        leading: float | None = None,
    ) -> float:
        """A block of text that wraps inside `w`. Returns its height. `align` is "L", "R" or
        "C"; left to itself a paragraph sits against the start edge of its own script (Arabic
        to the right), or of the page when `rtl` is given."""
        if not text:
            return 0.0
        if align is None:
            right = has_arabic(text) if rtl is None else rtl
            align = "R" if right else "L"
        height = leading or self.line_height(text, lang, ink)
        if draw and self.trace is not None:
            self.trace.append(("para", text, lang, round(x, 1), round(y, 1), round(w, 1),
                               ink.size, ink.bold, ink.colour, align))
        self.use(text, lang, ink)
        self.pdf.set_xy(x, y)
        result = self.pdf.multi_cell(
            w, height, text, align=align, dry_run=not draw, output=MethodReturnValue.HEIGHT,
            new_x=XPos.LEFT, new_y=YPos.NEXT,
        )
        return float(result)

    def lines_needed(self, text: str, w: float, lang: str, ink: Ink) -> int:
        if not text:
            return 0
        height = self.line_height(text, lang, ink)
        return round(self.paragraph(text, 0, 0, w, lang, ink, draw=False) / height)

    # ── shapes and pictures ───────────────────────────────────

    def rule(self, x0: float, x1: float, y: float, colour: str = colours.HAIRLINE,
             weight: float = 0.2, dash: bool = False) -> None:
        if self.trace is not None:
            self.trace.append(("rule", round(x0, 1), round(x1, 1), round(y, 1), colour, weight))
        self.pdf.set_draw_color(*colours.rgb(colour))
        self.pdf.set_line_width(weight)
        if dash:
            self.pdf.set_dash_pattern(dash=0.9, gap=0.9)
        self.pdf.line(x0, y, x1, y)
        if dash:
            self.pdf.set_dash_pattern()

    def fill(self, x: float, y: float, w: float, h: float, colour: str) -> None:
        if self.trace is not None:
            self.trace.append(("fill", round(x, 1), round(y, 1), round(w, 1), round(h, 1), colour))
        self.pdf.set_fill_color(*colours.rgb(colour))
        self.pdf.rect(x, y, w, h, style="F")

    def picture(
        self, data: bytes, x: float, y: float, max_w: float, max_h: float, *, align: str = "L",
    ) -> tuple[float, float]:
        """A picture scaled to fit a box, never stretched. `align` places it left, right or
        centre in the box's width. Returns the size drawn."""
        with Image.open(io.BytesIO(data)) as image:
            iw, ih = image.size
        scale = min(max_w / iw, max_h / ih)
        w, h = iw * scale, ih * scale
        if align == "R":
            x += max_w - w
        elif align == "C":
            x += (max_w - w) / 2
        if self.trace is not None:
            self.trace.append(("picture", round(x, 1), round(y, 1), round(w, 1), round(h, 1)))
        self.pdf.image(io.BytesIO(data), x=x, y=y, w=w, h=h)
        return w, h

    def output(self) -> bytes:
        return bytes(self.pdf.output())
