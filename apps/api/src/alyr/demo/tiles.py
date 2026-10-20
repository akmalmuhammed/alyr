"""Drawn tiles for the demo shops' photos (ALY-110, D-039).

The demo shops show pictures, but ALYR cannot use copyrighted ones and the repository must
stay small. So each item gets a tile drawn at run time from a few plain shapes: a plate, a
cup, a loaf, a bottle, a robe, a box. The same key, motif and hue always draw the same tile
(only arithmetic on a hash, no random numbers, no files, no network), so a demo reset
produces the same photos and stores each of them once.

A tile is a flat, friendly picture, not a photograph, and it says so by looking drawn. It
goes through the real photo pipeline (`core/images.py`) like any upload: checked by content,
redrawn, stored in three WebP sizes. That is what the demo is meant to show.

`tile` returns PNG bytes. Pillow is already a dependency (the photo pipeline).
"""

import colorsys
import hashlib
import io
import math
from collections.abc import Callable

from PIL import Image, ImageDraw

SIZE = 800  # the long side of the tile; the pipeline makes 320 and 800 from it
SUPER = 2  # drawn twice as large and shrunk, so the edges are smooth

MOTIFS = (
    "plate", "wrap", "cup", "bowl", "loaf", "cake", "box", "bottle", "jar", "sack", "bag",
    "robe", "shirt", "device", "tag", "dates", "dots",
)


def _digest(key: str) -> list[float]:
    """Sixteen numbers between 0 and 1 from a word, the same every time."""
    raw = hashlib.sha256(key.encode("utf-8")).digest()
    return [b / 255 for b in raw[:16]]


def _hls(hue: float, lightness: float, saturation: float) -> tuple[int, int, int]:
    r, g, b = colorsys.hls_to_rgb(hue % 1.0, lightness, saturation)
    return int(r * 255), int(g * 255), int(b * 255)


class Pen:
    """The colours of one tile and a canvas in tile units (0 to 100 across and down)."""

    def __init__(self, key: str, hue: int) -> None:
        n = _digest(key)
        self.n = n
        base = (hue / 360 + (n[0] - 0.5) * 0.12) % 1.0
        self.back = _hls(base, 0.92, 0.45)
        self.light = _hls(base, 0.97, 0.55)
        self.soft = _hls(base, 0.80, 0.5)
        self.main = _hls(base + 0.02, 0.58, 0.58)
        self.deep = _hls(base - 0.02, 0.38, 0.52)
        self.accent = _hls(base + 0.12 + n[1] * 0.1, 0.58, 0.55)
        self.ink = _hls(base, 0.22, 0.35)
        px = SIZE * SUPER
        self.image = Image.new("RGB", (px, px), self.back)
        self.d = ImageDraw.Draw(self.image)
        self.k = px / 100

    # Tile units to pixels, so a motif is drawn once whatever the size.
    def p(self, *values: float) -> list[float]:
        return [v * self.k for v in values]

    def ellipse(self, x0, y0, x1, y1, fill, outline=None, width=0) -> None:
        self.d.ellipse(self.p(x0, y0, x1, y1), fill=fill, outline=outline, width=int(width * self.k))

    def rect(self, x0, y0, x1, y1, fill, radius=2.0) -> None:
        self.d.rounded_rectangle(self.p(x0, y0, x1, y1), radius=radius * self.k, fill=fill)

    def poly(self, points: list[tuple[float, float]], fill) -> None:
        self.d.polygon([(x * self.k, y * self.k) for x, y in points], fill=fill)

    def line(self, x0, y0, x1, y1, fill, width=1.2) -> None:
        self.d.line(self.p(x0, y0, x1, y1), fill=fill, width=max(1, int(width * self.k)))

    def arc(self, x0, y0, x1, y1, start, end, fill, width=1.4) -> None:
        self.d.arc(self.p(x0, y0, x1, y1), start, end, fill=fill, width=max(1, int(width * self.k)))

    def png(self) -> bytes:
        small = self.image.resize((SIZE, SIZE), Image.LANCZOS)
        out = io.BytesIO()
        small.save(out, format="PNG", optimize=True)
        return out.getvalue()


def _ground(p: Pen) -> None:
    """A soft table or shelf under every motif, and a little dot pattern in the corner."""
    p.ellipse(8, 70, 92, 94, p.soft)
    for i in range(3):
        p.ellipse(8 + i * 5, 8, 11 + i * 5, 11, p.light)


def plate(p: Pen) -> None:
    n = p.n
    p.ellipse(10, 14, 90, 86, p.light)
    p.ellipse(15, 19, 85, 81, p.soft)
    p.ellipse(22, 26, 78, 74, p.light)
    spots = [(0.38, 0.4), (0.56, 0.36), (0.5, 0.58), (0.34, 0.6), (0.64, 0.56)]
    for i, (x, y) in enumerate(spots[: 3 + int(n[2] * 3)]):
        r = 7 + n[3 + i] * 5
        p.ellipse(100 * x - r, 100 * y - r, 100 * x + r, 100 * y + r,
                  (p.main, p.accent, p.deep)[i % 3])
    p.arc(30, 32, 70, 68, 200, 300, p.deep, 1.0)


def wrap(p: Pen) -> None:
    p.poly([(24, 66), (34, 24), (74, 32), (62, 76)], p.soft)
    p.poly([(30, 62), (38, 30), (68, 36), (58, 70)], p.main)
    for i in range(4):
        y = 34 + i * 8
        p.line(38 + i * 1.5, y, 66 - i * 1.5, y + 3, p.deep if i % 2 else p.accent, 1.8)
    p.poly([(24, 66), (62, 76), (58, 80), (22, 70)], p.deep)
    p.line(34, 24, 74, 32, p.deep, 1.4)


def cup(p: Pen) -> None:
    p.poly([(28, 36), (72, 36), (66, 78), (34, 78)], p.main)
    p.poly([(28, 36), (72, 36), (70.5, 44), (29.5, 44)], p.deep)
    p.arc(62, 42, 88, 66, -80, 90, p.main, 3.2)
    for x in (40, 50, 60):
        p.arc(x - 3, 14, x + 3, 32, 200, 340, p.accent, 1.4)
    p.rect(22, 78, 78, 83, p.deep, 2.4)


def bowl(p: Pen) -> None:
    p.ellipse(20, 30, 80, 56, p.accent)
    p.ellipse(26, 34, 74, 52, p.light)
    p.poly([(14, 46), (86, 46), (74, 78), (26, 78)], p.main)
    p.ellipse(14, 40, 86, 52, p.deep)
    p.ellipse(22, 42, 78, 50, p.soft)
    for i, x in enumerate((38, 50, 62)):
        p.ellipse(x - 4, 36 - (i % 2) * 3, x + 4, 44 - (i % 2) * 3, (p.accent, p.main, p.accent)[i])


def loaf(p: Pen) -> None:
    p.ellipse(10, 34, 90, 80, p.deep)
    p.ellipse(10, 28, 90, 74, p.main)
    for x in (30, 44, 58, 72):
        p.line(x, 40, x + 7, 62, p.light, 2.4)
    p.arc(14, 30, 86, 70, 200, 340, p.soft, 1.4)


def cake(p: Pen) -> None:
    p.rect(18, 56, 82, 80, p.deep, 3)
    p.rect(22, 38, 78, 60, p.main, 3)
    p.rect(30, 22, 70, 42, p.accent, 3)
    p.arc(22, 52, 78, 70, 0, 180, p.light, 1.6)
    p.arc(30, 34, 70, 50, 0, 180, p.light, 1.4)
    p.ellipse(46, 12, 54, 22, p.deep)
    p.line(50, 8, 50, 14, p.ink, 1.1)


def box(p: Pen) -> None:
    p.rect(20, 40, 80, 82, p.main, 3)
    p.rect(16, 28, 84, 44, p.deep, 3)
    p.rect(46, 28, 54, 82, p.light, 1)
    p.poly([(50, 28), (36, 14), (42, 12), (50, 24)], p.accent)
    p.poly([(50, 28), (64, 14), (58, 12), (50, 24)], p.accent)


def bottle(p: Pen) -> None:
    p.rect(40, 10, 60, 24, p.deep, 2)
    p.rect(44, 22, 56, 36, p.soft, 2)
    p.rect(30, 34, 70, 86, p.main, 8)
    p.rect(34, 52, 66, 72, p.light, 2)
    p.line(40, 60, 60, 60, p.deep, 1.2)
    p.line(40, 65, 56, 65, p.accent, 1.2)


def jar(p: Pen) -> None:
    p.rect(26, 20, 74, 30, p.deep, 2)
    p.rect(30, 28, 70, 84, p.soft, 5)
    p.rect(34, 48, 66, 80, p.main, 4)
    p.rect(34, 40, 66, 50, p.accent, 2)
    p.line(38, 34, 38, 76, p.light, 1.6)


def sack(p: Pen) -> None:
    p.poly([(36, 22), (64, 22), (80, 46), (84, 80), (16, 80), (20, 46)], p.main)
    p.ellipse(28, 66, 72, 90, p.deep)
    p.rect(34, 18, 66, 26, p.accent, 3)
    p.rect(34, 44, 66, 66, p.light, 3)
    p.line(40, 54, 60, 54, p.deep, 1.4)
    p.line(40, 59, 54, 59, p.accent, 1.4)


def bag(p: Pen) -> None:
    p.arc(32, 8, 68, 46, 180, 360, p.deep, 2.6)
    p.poly([(20, 32), (80, 32), (86, 82), (14, 82)], p.main)
    p.poly([(20, 32), (80, 32), (82, 40), (18, 40)], p.deep)
    p.ellipse(44, 52, 56, 64, p.light)
    p.line(14, 82, 86, 82, p.ink, 1.0)


def robe(p: Pen) -> None:
    """An abaya: a long, loose robe with wide sleeves and a bright cuff."""
    p.poly([(38, 12), (62, 12), (74, 24), (92, 62), (84, 66), (72, 44),
            (78, 90), (22, 90), (28, 44), (16, 66), (8, 62), (26, 24)], p.main)
    p.poly([(38, 12), (62, 12), (56, 30), (44, 30)], p.deep)
    p.line(50, 30, 50, 90, p.deep, 1.0)
    p.line(8, 62, 16, 66, p.accent, 3.2)
    p.line(92, 62, 84, 66, p.accent, 3.2)
    p.line(22, 90, 78, 90, p.accent, 2.4)


def shirt(p: Pen) -> None:
    p.poly([(36, 14), (64, 14), (90, 30), (80, 44), (72, 38), (72, 84), (28, 84), (28, 38),
            (20, 44), (10, 30)], p.main)
    p.poly([(36, 14), (64, 14), (50, 30)], p.deep)
    p.line(50, 30, 50, 84, p.soft, 1.0)
    p.rect(34, 60, 66, 70, p.accent, 2)


def device(p: Pen) -> None:
    p.rect(30, 10, 70, 90, p.ink, 7)
    p.rect(34, 18, 66, 78, p.soft, 3)
    p.rect(38, 24, 62, 36, p.main, 2)
    p.rect(38, 42, 62, 48, p.accent, 2)
    p.rect(38, 54, 54, 60, p.deep, 2)
    p.ellipse(46, 81, 54, 89, p.light)


def tag(p: Pen) -> None:
    p.poly([(14, 40), (54, 14), (86, 14), (86, 46), (60, 86), (14, 54)], p.main)
    p.ellipse(68, 22, 78, 32, p.light)
    p.line(24, 56, 62, 34, p.deep, 2.0)
    p.line(24, 64, 52, 48, p.accent, 2.0)


def dates(p: Pen) -> None:
    n = p.n
    p.ellipse(12, 52, 88, 88, p.soft)
    for i in range(9):
        x = 24 + (i % 3) * 22 + (n[i] - 0.5) * 6
        y = 30 + (i // 3) * 16 + (n[i + 3] - 0.5) * 4
        p.ellipse(x - 9, y - 6, x + 9, y + 6, (p.deep, p.ink, p.deep)[i % 3])
        p.ellipse(x - 5, y - 3, x - 1, y - 1, p.main)


def dots(p: Pen) -> None:
    """The fallback: three plain shapes, like the sample tiles in the workspace."""
    n = p.n
    p.ellipse(14 + n[2] * 20, 20 + n[3] * 10, 54 + n[2] * 20, 60 + n[3] * 10, p.main)
    p.rect(40 + n[4] * 20, 40 + n[5] * 10, 80 + n[4] * 6, 80, p.accent, 8)
    p.poly([(20, 84), (44 + n[6] * 10, 46), (66, 84)], p.deep)


_MOTIFS: dict[str, Callable[[Pen], None]] = {
    "plate": plate, "wrap": wrap, "cup": cup, "bowl": bowl, "loaf": loaf, "cake": cake,
    "box": box, "bottle": bottle, "jar": jar, "sack": sack, "bag": bag, "robe": robe,
    "shirt": shirt, "device": device, "tag": tag, "dates": dates, "dots": dots,
}
assert set(_MOTIFS) == set(MOTIFS)


def tile(key: str, motif: str = "dots", hue: int = 30) -> bytes:
    """A drawn tile as PNG bytes. `key` makes it one item's own (no two items share a
    tile), `motif` is what it shows, `hue` (degrees) is the shop's colour."""
    pen = Pen(key, hue)
    _ground(pen)
    _MOTIFS.get(motif, dots)(pen)
    return pen.png()


def swatch(hue: int) -> tuple[int, int, int]:
    """The shop's main colour, for the pages that list the demo shops."""
    return _hls(hue / 360, 0.58, 0.58)


assert math.isfinite(SIZE)
