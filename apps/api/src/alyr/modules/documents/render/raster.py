"""A page of a PDF as a PNG, for the screens (ALY-146, spec 014).

A phone cannot be trusted to show a PDF inside a page (Android's Chrome offers a download, iOS
Safari shows one page in a frame that scrolls inside the page), and a screen reader gets
nothing from one. So the workspace shows the real PDF's pages as pictures, drawn here from the
same bytes the shop prints, and offers the PDF itself beside them. The picture is a reading,
never stored: the PDF is the document.

PDFium (through pypdfium2) is not safe to call from two threads at once, so every call takes a
lock; drawing a page takes a few tens of milliseconds.
"""

import io
import threading

import pypdfium2 as pdfium

from alyr.modules.documents.errors import DocumentError

MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH = 240, 1600, 900
_LOCK = threading.Lock()


def png_of(pdf: bytes, page: int = 1, width: int = DEFAULT_WIDTH) -> tuple[bytes, int]:
    """Page `page` (from 1) of `pdf` as a PNG `width` pixels wide, and how many pages there
    are. Refuses a page the document does not have, in words."""
    width = max(MIN_WIDTH, min(width, MAX_WIDTH))
    with _LOCK:
        document = pdfium.PdfDocument(pdf)
        try:
            count = len(document)
            if not 1 <= page <= count:
                raise DocumentError("page_unknown", field="page")
            sheet = document[page - 1]
            points, _ = sheet.get_size()
            picture = sheet.render(scale=width / points).to_pil().convert("RGB")
        finally:
            document.close()
    out = io.BytesIO()
    picture.save(out, "PNG")
    return out.getvalue(), count
