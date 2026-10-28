"""The PDF engine (ALY-138, spec 011): a finished `Doc` in, the bytes of a PDF out.

fpdf2 draws it and HarfBuzz (uharfbuzz) shapes the Arabic. No network, no system library, no
clock, no randomness: the same `Doc` always gives the same bytes. See `pen.py` for how text is
set and `specs/011-documents-engine/spec.md` for why this and not WeasyPrint, a headless
browser or reportlab.
"""

from alyr.modules.documents.render.context import Doc
from alyr.modules.documents.render.paged import Paged
from alyr.modules.documents.render.thermal import Thermal


def render(doc: Doc, trace: list | None = None) -> bytes:
    """The PDF of a document. `trace`, if given, is filled with every drawing call (for the
    layout tests); it changes nothing about the output."""
    if doc.layout == "thermal80":
        return Thermal(doc, trace).draw()
    first_trace: list | None = [] if trace is not None else None
    data, pages = Paged(doc, total_pages=1, trace=first_trace).draw()
    if pages == 1:
        if trace is not None and first_trace is not None:
            trace.extend(first_trace)
        return data
    # More than one page: draw again knowing the total, so every foot can say "of N".
    return Paged(doc, total_pages=pages, trace=trace).draw()[0]
