"""The payment QR code on an invoice (ALY-141): the corner both layouts keep free.

The code is made by `core/qr.py` from the payment link and drawn as filled squares, dark on the
white of the paper, in the colour of the page's ink (never the shop's brand colour: a code in a
pale colour does not scan). Beside it the page says what it is, in the languages it carries, and
the amount that is due. A page with no payment link draws nothing here, so the layout of every
document without one is exactly what it was.
"""

from alyr.core import qr
from alyr.modules.documents import colours
from alyr.modules.documents.render import text as t
from alyr.modules.documents.render.context import Doc
from alyr.modules.documents.render.pen import Ink, Pen


def modules(pen: Pen, url: str, x: float, y: float, side: float) -> None:
    """Draw the code for `url` as a square `side` millimetres wide whose top-left is (x, y).
    A run of dark modules in a row is one rectangle."""
    grid = qr.encode(url)
    n = len(grid)
    step = side / n
    for r, row in enumerate(grid):
        c = 0
        while c < n:
            if not row[c]:
                c += 1
                continue
            end = c
            while end < n and row[end]:
                end += 1
            # A hair of overlap between rows, so no viewer draws a white line between them.
            pen.fill(x + c * step, y + r * step, (end - c) * step, step + 0.02, colours.INK)
            c = end


def caption(doc: Doc, pen: Pen, x0: float, x1: float, y: float, k: float, rtl: bool) -> None:
    """'Scan to pay online' in each language and the amount due, in the space beside the code,
    from the page's start edge."""
    align = "R" if rtl else "L"
    small = Ink(round(7.4 * k, 2), True, colours.INK)
    muted = Ink(round(7.0 * k, 2), False, colours.MUTED)
    for lang, line in t.labels(doc, "pay_scan"):
        h = pen.line_height(line, lang, small if lang == doc.primary else muted)
        pen.put(line, x0, y, x1 - x0, h, lang, small if lang == doc.primary else muted, align)
        y += h
    due = max(doc.balance, 0)
    runs = [(text, lang, Ink(round(9.0 * k, 2), True, colours.INK))
            for lang, text in t.total_runs(doc, due)]
    h = max(pen.line_height(text, lang, ink) for text, lang, ink in runs)
    pen.run_row(runs, x0, x1, y + 0.6, h, rtl=rtl, align=align, gap=1.3)
