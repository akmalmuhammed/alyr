"""The weekly report card: one PNG per business, week and language (ALY-99).

The card is drawn as SVG and rendered with resvg (`resvg-py`), which shapes text with
HarfBuzz's rules (rustybuzz) and so joins Arabic letters correctly. Two things it does not
do on its own, handled here:

* **Direction.** resvg lays every line out left to right. Each Arabic line is therefore
  wrapped in a right-to-left embedding (U+202B … U+202C), so the Unicode bidi algorithm
  orders its words, numbers and Latin names as an Arabic reader expects. A number range
  inside it ("4–10") gets a left-to-right embedding of its own, as `<bdi>` does on the site.
* **Mirroring.** In Arabic the whole layout is mirrored: the start of the line is on the
  right, Sunday's bar is the rightmost, and time runs right to left (01-research C, RTL).
  The logo and the ▲▼ marks are never mirrored.

The brand's fonts are embedded from `fonts/` (SIL Open Font Licence 1.1; the licences sit
beside them) and no system font is used, so the card looks the same on every machine.

Size: 1080 × 566, WhatsApp's 1.91:1 for an image header, which no phone crops. Paper or
Carbon; Volt only for the busiest day, the week's one signal, and the logo's own plane.
"""

import re
from functools import lru_cache
from pathlib import Path
from xml.sax.saxutils import escape

from alyr import brand

FONTS = Path(__file__).parent / "fonts"
W, H = 1080, 566
M = 56  # the side margin
# The smallest type on the card. WhatsApp shows the card about 330 px wide on a phone, so
# 31 px here is about 9.5 px there (the founder, 17 Oct: nothing smaller is readable).
SMALL = 31

# The brand's faces and colours come from the design tokens (design/tokens.json, generated
# into alyr/brand.py); nothing here names a colour or a font.
SANS = brand.FONT["sans"][0]
ARABIC = brand.FONT["arabic"][0]
MONO = brand.FONT["mono"][0]
FILES = {
    (SANS, 400): brand.FONT_FILE["sans-400"],
    (SANS, 600): brand.FONT_FILE["sans-600"],
    (ARABIC, 400): brand.FONT_FILE["arabic-400"],
    (ARABIC, 600): brand.FONT_FILE["arabic-600"],
    (MONO, 400): brand.FONT_FILE["mono-400"],
}

# Carbon: the brand's command surface, and the default, since it reads in a light and a dark
# chat alike. Paper for a light page.
THEMES = brand.CARD

RLE, LRE, PDF = "\u202b", "\u202a", "\u202c"
_ARABIC = re.compile(r"[؀-ۿ]")
ARABIC_JOINED = 0.86
_RANGE = re.compile(r"\d+\s?[–-]\s?\d+")

# The ALYR logo, point for point from `apps/web/app/_site/brand.tsx` (never redrawn).
LOGO_PLANES = (
    ("50,0 180,0 130,62 0,62", False),
    ("0,72 126,72 39,160", False),
    ("134,72 190,72 142,160 46,160", True),
)
LOGO_LETTERS = (
    '<polygon points="0,150 69,10 92,10 28,150"/>'
    '<polygon points="76,37 92,10 164,150 134,150"/>'
    '<polygon points="190,10 216,10 216,124 326,124 326,150 190,150"/>'
    '<polygon points="348,10 379,10 433,80 414,107"/>'
    '<polygon points="478,10 511,10 421,150 389,150"/>'
    '<path fill-rule="evenodd" d="M540 10H672L702 40V84L672 114H569V150H540ZM569 36V88H661'
    'L674 75V49L661 36Z"/>'
    '<polygon points="620,88 655,88 706,150 671,150"/>'
)
LOGO_W, LOGO_H = 986, 160  # its view box


# ── measuring text ────────────────────────────────────────


@lru_cache
def _font(family: str, weight: int):
    from fontTools.ttLib import TTFont

    font = TTFont(FONTS / FILES[(family, weight)], lazy=True)
    return font["hmtx"].metrics, font.getBestCmap(), font["head"].unitsPerEm


def width(text: str, family: str, size: float, weight: int = 400, spacing: float = 0) -> float:
    """The advance width of a line, close enough to fit it: unshaped advances, with Arabic
    letters scaled to their joined width."""
    metrics, cmap, upem = _font(family, 600 if weight >= 600 and (family, 600) in FILES
                                else 400)
    total = 0
    for ch in text:
        if ch in (RLE, LRE, PDF, "\u200f"):
            continue
        glyph = cmap.get(ord(ch))
        advance = metrics[glyph][0] if glyph in metrics else upem * 0.55
        # Joined Arabic letters are narrower than their isolated forms: measured against
        # resvg's own rendering, 0.66 to 0.84 of the isolated width. 0.86 keeps every
        # estimate on the wide side, so a line never overflows.
        total += advance * ARABIC_JOINED if _ARABIC.match(ch) else advance
    return total * size / upem + spacing * max(len(text) - 1, 0)


def fit(text: str, family: str, size: float, smallest: float, room: float,
        weight: int = 400, spacing: float = 0) -> tuple[str, float]:
    """Shrink a line until it fits `room`, down to `smallest`; past that, end it with …."""
    while size > smallest and width(text, family, size, weight, spacing) > room:
        size -= 1
    if width(text, family, size, weight, spacing) <= room:
        return text, size
    while len(text) > 1 and width(text + "…", family, size, weight, spacing) > room:
        text = text[:-1].rstrip()
    return text + "…", size


# ── drawing ───────────────────────────────────────────────


class Canvas:
    """Draws in left-to-right coordinates; in Arabic every x is mirrored."""

    def __init__(self, rtl: bool, theme: dict) -> None:
        self.rtl = rtl
        self.t = theme
        self.parts: list[str] = []

    def x(self, x: float) -> float:
        return W - x if self.rtl else x

    def rect(self, x: float, y: float, w: float, h: float, fill: str, extra: str = "") -> None:
        left = W - x - w if self.rtl else x
        self.parts.append(
            f'<rect x="{left:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'fill="{fill}" {extra}/>'
        )

    def line(self, x1: float, y: float, x2: float, color: str, w: float = 2,
             dash: str = "") -> None:
        extra = f' stroke-dasharray="{dash}"' if dash else ""
        self.parts.append(
            f'<line x1="{self.x(x1):.1f}" y1="{y}" x2="{self.x(x2):.1f}" y2="{y}" '
            f'stroke="{color}" stroke-width="{w}"{extra}/>'
        )

    def text(self, x: float, y: float, s: str, size: float, fill: str, *, family: str = "",
             weight: int = 400, anchor: str = "start", spacing: float = 0) -> None:
        arabic = bool(_ARABIC.search(s))
        family = family or (ARABIC if self.rtl or arabic else SANS)
        if self.rtl:
            anchor = {"start": "end", "end": "start"}.get(anchor, anchor)
        body = s
        if arabic or self.rtl:
            # Ranges stay left to right, the line itself right to left (see the docstring).
            body = _RANGE.sub(lambda m: f"{LRE}{m.group(0)}{PDF}", body)
            body = f"{RLE}{body}{PDF}"
        track = f' letter-spacing="{spacing}"' if spacing else ""
        self.parts.append(
            f'<text x="{self.x(x):.1f}" y="{y:.1f}" font-family="{family}" '
            f'font-weight="{weight}" font-size="{size:.1f}" fill="{fill}" '
            f'text-anchor="{anchor}"{track}>{escape(body)}</text>'
        )

    def triangle(self, x: float, y: float, size: float, up: bool, fill: str) -> None:
        """▲ or ▼ with its left edge at `x` (its right edge in Arabic), never mirrored."""
        left = W - x - size if self.rtl else x
        h = size * 0.86
        if up:
            pts = f"{left},{y} {left + size},{y} {left + size / 2},{y - h}"
        else:
            pts = f"{left},{y - h} {left + size},{y - h} {left + size / 2},{y}"
        self.parts.append(f'<polygon points="{pts}" fill="{fill}"/>')

    def logo(self, x: float, y: float, height: float) -> float:
        """The horizontal logo with its top at `y`; returns its width."""
        scale = height / LOGO_H
        w = LOGO_W * scale
        left = W - x - w if self.rtl else x
        planes = "".join(
            f'<polygon points="{pts}" fill="{self.t["volt"] if volt else self.t["logo"]}"/>'
            for pts, volt in LOGO_PLANES
        )
        self.parts.append(
            f'<g transform="translate({left:.1f} {y:.1f}) scale({scale:.4f})">'
            f'<g>{planes}</g><g transform="translate(280 5)" fill="{self.t["logo"]}">'
            f"{LOGO_LETTERS}</g></g>"
        )
        return w

    def svg(self) -> str:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">' + "".join(self.parts) + "</svg>"
        )


def _label(c: Canvas, x: float, y: float, s: str, room: float, anchor: str = "start",
           size: float = SMALL + 1) -> None:
    """A small label: mono capitals, tracked, in English; Plex Sans Arabic, never tracked or
    in capitals, in Arabic (brand.md). Never smaller than `SMALL`: past that it is cut."""
    if c.rtl:
        s, size = fit(s, ARABIC, size + 1, SMALL, room)
        c.text(x, y, s, size, c.t["ink2"], family=ARABIC, anchor=anchor)
    else:
        s, size = fit(s.upper(), MONO, size, SMALL, room, spacing=1.6)
        c.text(x, y, s, size, c.t["ink2"], family=MONO, anchor=anchor, spacing=1.6)


def svg(data: dict, theme: str = "carbon", sample: bool = False) -> str:
    """The card as SVG, from `week.card()`."""
    t = THEMES[theme]
    rtl = data["dir"] == "rtl"
    c = Canvas(rtl, t)
    face = ARABIC if rtl else SANS
    c.parts.append(f'<rect width="{W}" height="{H}" fill="{t["bg"]}"/>')

    # The header: the logo, what this is, and the week.
    logo_w = c.logo(M, 46, 28)
    week = data["week"] if rtl else data["week"].upper()
    if sample:
        week = f"{week} · عيّنة" if rtl else f"{week} · SAMPLE"
    _label(c, W - M, 72, week, 420, anchor="end")
    _label(c, M + logo_w + 18, 72, data["eyebrow"], W - 2 * M - logo_w - 440)

    # The shop's name.
    name, size = fit(data["shop"], face, 48, 34, W - 2 * M, weight=600)
    c.text(M, 134, name, size, t["ink"], weight=600, family=face)
    c.line(M, 156, W - M, t["rule"])

    # The hero number, its unit and its change.
    hero = data["hero"]
    left_room = 430
    label = f"{hero['label']} · {hero['unit']}" if hero["unit"] else hero["label"]
    _label(c, M, 202, label, left_room)
    value, size = fit(hero["value"], SANS, 132, 72, left_room, weight=600)
    c.text(M, 318, value, size, t["ink"], family=SANS, weight=600)
    change = hero["change"]
    x = M
    if change["dir"] in ("up", "down"):
        c.triangle(M, 360, 22, change["dir"] == "up", t["ink"])
        x = M + 34
    # The change may run to the bars' edge.
    words, size = fit(change["text"], face, SMALL + 1, SMALL, 506 - x)
    c.text(x, 362, words, size, t["ink"] if change["dir"] else t["ink2"], family=face)

    # Seven days, Sunday first, the week before as a ghost beside each bar. No legend: at
    # a phone's size it would be too small to read; the template's text says it.
    days = data["days"]
    area_x = 512
    area_w = W - M - area_x
    top, base = 214, 314
    if days:
        peak = max([d["value"] or 0 for d in days] + [d["last"] or 0 for d in days] + [1])
        col = area_w / 7
        pair = min(col - 20, 52)
        bar = (pair - 4) / 2
        for i, d in enumerate(days):
            cx = area_x + col * i + col / 2
            x0 = cx - pair / 2
            if d["state"] == "closed":
                c.line(x0, base, x0 + pair, t["ink2"], 2, "4 4")
            elif d["state"] != "before":
                if d["last"]:
                    h = max(3, (base - top) * d["last"] / peak)
                    c.rect(x0, base - h, bar, h, t["ghost"])
                v = d["value"] or 0
                h = max(3, (base - top) * v / peak)
                ghost_h = (base - top) * (d["last"] or 0) / peak
                fill = t["volt"] if d["signal"] else t["bar"]
                edge = (f'stroke="{t["edge"]}" stroke-width="2"' if d["signal"]
                        and t["edge"] != "none" else "")
                c.rect(x0 + bar + 4, base - h, bar, h, fill, edge)
                if d["signal"] and d["text"]:
                    c.text(x0 + pair / 2, base - max(h, ghost_h) - 10, d["text"], SMALL,
                           t["ink"], family=MONO, anchor="middle")
            c.line(x0 - 6, base + 1, x0 + pair + 6, t["rule"], 2)
            c.text(cx, 356, d["label"] if rtl else d["label"].upper(), SMALL,
                   t["ink"] if d["signal"] else t["ink2"],
                   family=ARABIC if rtl else MONO, anchor="middle",
                   spacing=0 if rtl else 1.2)

    # Two or three key facts on one rule.
    facts = data["facts"]
    c.line(M, 388, W - M, t["rule"])
    if facts:
        col = (W - 2 * M) / len(facts)
        for i, fact in enumerate(facts):
            x = M + col * i
            room = col - 24
            _label(c, x, 428, fact["label"], room)
            value, size = fit(fact["value"], face, 44, 34, room, weight=600)
            c.text(x, 476, value, size, t["ink"], family=face, weight=600)
            note, size = fit(fact["note"], face, SMALL + 1, SMALL, room)
            c.text(x, 518, note, size, t["ink2"], family=face)
    return c.svg()


def render(data: dict, theme: str = "carbon", sample: bool = False) -> bytes:
    """The card as PNG bytes, 1080 × 566."""
    import resvg_py

    png = resvg_py.svg_to_bytes(
        svg_string=svg(data, theme, sample), font_dirs=[str(FONTS)], skip_system_fonts=True,
        font_family=SANS,
    )
    return bytes(png)
