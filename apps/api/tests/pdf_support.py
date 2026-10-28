"""Reading a PDF back, for the documents tests: its size, its text, its pictures.

PDFium (through pypdfium2, a development dependency only) is the reader. It is a different
program from the one that drew the PDF, so what it reads is what any viewer or printer sees.

A note on Arabic text: a PDF stores glyphs in the order they are drawn, not in reading order,
and any reader has to guess the reading order back. So the tests do not compare an Arabic
line with a string; they check that every *letter* of the expected phrase is there, with its
diacritics (`has_letters`), and that the Latin runs and the numbers read exactly.
"""

from collections import Counter

import pypdfium2 as pdfium

PT = 25.4 / 72


def open_pdf(data: bytes) -> pdfium.PdfDocument:
    return pdfium.PdfDocument(data)


def page_count(data: bytes) -> int:
    pdf = open_pdf(data)
    try:
        return len(pdf)
    finally:
        pdf.close()


def page_size_mm(data: bytes, page: int = 0) -> tuple[float, float]:
    pdf = open_pdf(data)
    try:
        w, h = pdf[page].get_size()
        return w * PT, h * PT
    finally:
        pdf.close()


def page_text(data: bytes, page: int | None = None) -> str:
    """The text of one page, or of all of them, as PDFium reads it."""
    pdf = open_pdf(data)
    try:
        pages = range(len(pdf)) if page is None else [page]
        out = []
        for i in pages:
            textpage = pdf[i].get_textpage()
            out.append(textpage.get_text_range())
            textpage.close()
        return "\n".join(out)
    finally:
        pdf.close()


def boxes(data: bytes, page: int = 0) -> list[tuple[str, float, float, float, float]]:
    """Every run of text on a page with its box in millimetres from the top left:
    (text, left, top, right, bottom)."""
    pdf = open_pdf(data)
    try:
        pg = pdf[page]
        height = pg.get_size()[1]
        textpage = pg.get_textpage()
        out = []
        for i in range(textpage.count_rects()):
            left, bottom, right, top = textpage.get_rect(i)
            text = textpage.get_text_bounded(left, bottom, right, top)
            out.append((text, left * PT, (height - top) * PT, right * PT, (height - bottom) * PT))
        textpage.close()
        return out
    finally:
        pdf.close()


def picture(data: bytes, page: int = 0, scale: float = 2.0):
    """The page as a PIL image, white where nothing is drawn."""
    pdf = open_pdf(data)
    try:
        return pdf[page].render(scale=scale).to_pil().convert("RGB")
    finally:
        pdf.close()


MARKS = set("ًٌٍَُِّْٰ")  # Arabic harakat


def letters(text: str, *, marks: bool = True) -> Counter:
    """The characters of a phrase without spaces or line breaks (and without the harakat
    when `marks` is false), as a multiset."""
    return Counter(ch for ch in text if not ch.isspace() and (marks or ch not in MARKS))


def has_letters(read: str, phrase: str, *, marks: bool = True) -> bool:
    """Is every letter of `phrase` in what was read back from the page?"""
    need, have = letters(phrase, marks=marks), letters(read, marks=marks)
    return all(have[ch] >= n for ch, n in need.items())


def ink_in(image, left_mm: float, top_mm: float, right_mm: float, bottom_mm: float,
           scale: float = 2.0) -> int:
    """How many non-white pixels there are in a box of the page (millimetres from the top
    left)."""
    f = scale * 72 / 25.4
    box = (int(left_mm * f), int(top_mm * f), int(right_mm * f), int(bottom_mm * f))
    crop = image.crop(box).convert("L")
    return sum(1 for pixel in crop.tobytes() if pixel < 250)


def blobs(image, threshold: int = 128) -> int:
    """How many separate pieces of ink there are in a picture (8-way connected). A word of
    joined Arabic is few pieces and the same letters one by one are many: the test for shaping."""
    from collections import deque

    grey = image.convert("L")
    w, h = grey.size
    px = grey.load()
    seen = bytearray(w * h)
    count = 0
    for y in range(h):
        for x in range(w):
            if px[x, y] < threshold and not seen[y * w + x]:
                count += 1
                seen[y * w + x] = 1
                queue = deque([(x, y)])
                while queue:
                    cx, cy = queue.popleft()
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if (0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]
                                    and px[nx, ny] < threshold):
                                seen[ny * w + nx] = 1
                                queue.append((nx, ny))
    return count
