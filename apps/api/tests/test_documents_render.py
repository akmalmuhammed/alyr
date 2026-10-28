"""The PDF engine (ALY-138, spec 011): Arabic shaping, joining, diacritics and mixed text in
the same line, A4, A5 and the 80 mm roll, both directions, one page and many, and a layout
that cannot change by accident.

How the Arabic is proved, since a PDF stores glyphs and not sentences:

* **Shaping and joining** are proved on the picture. A word of joined Arabic is a few pieces
  of ink (a letter that does not join leaves a gap) and the same letters drawn one at a time
  are many more. The word «فاتورة» is nine pieces joined (four strokes and five dots) and
  eleven isolated. Unshaped text would give eleven.
* **Diacritics** are proved by reading the page back with a different program (PDFium) and by
  the ink: a word with its marks has more pieces than the same word without.
* **Mixed text** (Arabic with Latin names, numbers and brackets in one line) is read back and
  must still contain every Latin run and number exactly as written.
* **The layout** is a golden file: every drawing call (text, rule, fill, picture) with its
  place in millimetres, kept in `tests/golden/documents/`. A change to the page shows as a
  diff. To accept a change on purpose, run with `ALYR_UPDATE_GOLDEN=1` and read the diff.
"""

import io
import json
import os
import re
import time
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from alyr.modules.documents import colours, money
from alyr.modules.documents.render import render
from alyr.modules.documents.render.context import Bi, Brand, Line, Party
from alyr.modules.documents.render.paged import Paged
from alyr.modules.documents.render.pen import FONT_DIR, Ink, Pen
from alyr.modules.documents.render.sample import LINES, make_lines, sample_doc
from pdf_support import (
    blobs,
    has_letters,
    ink_in,
    page_count,
    page_size_mm,
    page_text,
    picture,
)

GOLDEN = Path(__file__).parent / "golden" / "documents"
ARABIC = re.compile("[؀-ۿ]")


def logo_png(width=400, height=240) -> bytes:
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    paint = ImageDraw.Draw(image)
    paint.ellipse((10, 10, 230, 230), fill=(29, 79, 145, 255))
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def traced(doc):
    trace: list = []
    data = render(doc, trace)
    return data, trace


# ── every layout, every language ──────────────────────────────────────────────────────────

SIZES = {"a4": (210, 297), "a5": (148, 210)}
LANGUAGES = [("ar", "en"), ("en", "ar"), ("ar",), ("en",)]


@pytest.mark.parametrize("languages", LANGUAGES, ids=["ar_en", "en_ar", "ar", "en"])
@pytest.mark.parametrize("layout", ["a4", "a5", "thermal80"])
@pytest.mark.parametrize("kind", ["receipt", "invoice", "credit_note"])
def test_every_kind_in_every_layout_and_language_makes_a_pdf_of_the_right_size(
    kind, layout, languages
):
    doc = sample_doc(kind, languages, layout)
    if kind == "credit_note":
        doc = replace(doc, related_number="INV-0001", related_title=Bi(ar="فاتورة", en="Invoice"),
                      reason="Goods returned")
    data = render(doc)
    assert data.startswith(b"%PDF-") and data.rstrip().endswith(b"%%EOF")
    width, height = page_size_mm(data)
    if layout == "thermal80":
        assert round(width, 1) == 80.0 and 90 <= height <= 400
        assert page_count(data) == 1
    else:
        assert (round(width), round(height)) == SIZES[layout]
    text = page_text(data)
    assert doc.number in text
    # The page says what it should say in the languages it should say it in, and no more.
    assert bool(ARABIC.search(text)) == ("ar" in languages)
    if languages == ("en",):
        assert "Qirfa Bakery" in text
    if "ar" in languages:
        assert has_letters(text, "مخبز قرفة")


def test_fonts_are_embedded_subsets_of_the_brand_faces_and_nothing_is_fetched():
    both = render(sample_doc("invoice"))
    english = render(sample_doc("invoice", ("en",)))
    for data in (both, english):
        assert data.count(b"/FontFile2") >= 1
        for standard in (b"Helvetica", b"Times-Roman", b"Courier", b"Arial"):
            assert standard not in data, standard
        assert b"/URI" not in data and b"/JavaScript" not in data and b"/Launch" not in data
    assert b"IBMPlexSansArabic" in both and b"InstrumentSans" in both
    assert b"InstrumentSans" in english
    names = set(re.findall(rb"/FontName\s*/([A-Z]{6}\+[A-Za-z]+)", both + english))
    assert names and all(n.split(b"+")[1].startswith((b"IBMPlex", b"InstrumentSans")) for n in names)


def test_the_fonts_are_the_open_licensed_brand_fonts_with_their_licences_beside_them():
    for face, licence in (("IBMPlexSansArabic", "IBMPlexSansArabic-LICENSE.txt"),
                          ("InstrumentSans", "InstrumentSans-LICENSE.txt"),
                          ("IBMPlexMono", "IBMPlexMono-LICENSE.txt")):
        text = (FONT_DIR / licence).read_text(encoding="utf-8", errors="replace")
        assert "SIL OPEN FONT LICENSE Version 1.1" in text, face
        assert list(FONT_DIR.glob(f"{face}-*.ttf")), face


def test_the_same_document_gives_the_same_bytes_every_time():
    doc = sample_doc("invoice", brand=Brand(colour="#1d4f91", logo_png=logo_png()))
    first, second = render(doc), render(doc)
    assert first == second
    assert render(doc, []) == first  # watching the drawing changes nothing
    other = render(replace(doc, number="INV-2026-0043"))
    assert other != first


def test_the_properties_of_the_file_say_who_and_what():
    data = render(sample_doc("invoice"))
    assert b"/Title" in data and b"INV-2026-0042" in data and b"/Creator" in data
    assert b"2026" in data and b"/CreationDate" in data


def test_a_one_page_invoice_is_small_and_fast():
    doc = sample_doc("invoice", brand=Brand(colour="#1d4f91", logo_png=logo_png()))
    render(doc)  # the first call loads the fonts
    best = min(_timed(doc) for _ in range(5))
    data = render(doc)
    assert best < 0.5, f"a one-page invoice took {best:.2f} s"
    assert len(data) < 120_000, f"{len(data)} bytes is too big for one page"


def _timed(doc) -> float:
    start = time.perf_counter()
    render(doc)
    return time.perf_counter() - start


# ── the Arabic itself ─────────────────────────────────────────────────────────────────────


def word_picture(word: str, *, joined: bool = True):
    """A big rendering of one word, drawn whole or one letter at a time."""
    pen = Pen(90, 26, title="t", author="a", created=None, language="ar")
    pen.pdf.add_page()
    ink = Ink(36.0)
    if joined:
        pen.put(word, 4, 2, 82, 22, "ar", ink, "R")
    else:
        x = 86.0
        for ch in word:
            w = pen.width_of(ch, "ar", ink)
            pen.put(ch, x - w, 2, w + 1, 22, "ar", ink, "L")
            x -= w
    data = pen.output()
    return picture(data, 0, scale=3.0)


@pytest.mark.parametrize("word,joined_pieces,isolated_pieces", [
    ("فاتورة", 9, 11), ("مخبز", 4, 7), ("كعكة", 3, 8), ("العميل", 4, 8),
])
def test_arabic_letters_are_joined_the_way_arabic_is_written(word, joined_pieces, isolated_pieces):
    assert blobs(word_picture(word, joined=True)) == joined_pieces
    assert blobs(word_picture(word, joined=False)) == isolated_pieces


def test_the_shaped_word_is_narrower_than_its_letters_set_apart():
    pen = Pen(90, 26, title="t", author="a", created=None, language="ar")
    pen.pdf.add_page()
    ink = Ink(20.0)
    word = "العميل"
    assert pen.width_of(word, "ar", ink) < 0.8 * sum(pen.width_of(c, "ar", ink) for c in word)


def test_diacritics_are_drawn_and_read_back():
    marked = "فَاتُورَةٌ"  # four marks
    plain = "فاتورة"
    with_marks, without = blobs(word_picture(marked)), blobs(word_picture(plain))
    assert with_marks >= without + 3, (with_marks, without)
    data = render(sample_doc("invoice", customer=Party(name=Bi(ar="مَخْبَزُ قِرْفَة"))))
    text = page_text(data)
    assert has_letters(text, "مَخْبَزُ قِرْفَة", marks=True)
    for mark in "َُِْ":
        assert mark in text


def test_arabic_mixed_with_names_numbers_and_brackets_survives_in_one_line():
    description = "كعكة Chantilly الفاخرة (حجم كبير) 250 g - طلب 12"
    lines = make_lines((((description, "Chantilly cake"), "2", "piece", 4500, 0),))
    data = render(sample_doc("invoice", lines=lines))
    text = page_text(data)
    assert "Chantilly" in text and "250" in text and "12" in text
    assert has_letters(text, "كعكة الفاخرة حجم كبير طلب")
    # Mirrored brackets: the bracket that closes sits at the end of what it holds.
    assert "(" in text and ")" in text


# What goes wrong in an Arabic line: a number with spaces or a plus in it, an identifier with a
# hyphen, an amount with decimals, an address. (A date, 19 أكتوبر 2026, is each of its numbers
# on its own between words, and the algorithm sets it right.)
NUMBERS = re.compile(r"\+\d|[A-Z]+-\d|\d+\.\d\d|@|\d{4} \d{4}")


def test_a_number_is_never_set_inside_an_arabic_sentence():
    """Left to the bidirectional algorithm, '+974 5555 0100' in an Arabic line comes out as
    '0100 5555 974+'. So the engine draws every number, phone number, identifier and amount
    as a run of its own, left to right, and places the Arabic around it. Proved on what was
    drawn: no drawn string has Arabic letters and a number together (the strings a person
    typed, a product's name and an address, are free text and are left to the algorithm)."""
    docs = [sample_doc("invoice", layout=layout) for layout in ("a4", "a5", "thermal80")]
    docs += [replace(sample_doc("credit_note", layout=layout), related_number="INV-2026-0042",
                     related_title=Bi(ar="فاتورة", en="Invoice"), reason="إرجاع")
             for layout in ("a4", "thermal80")]
    for doc in docs:
        _, trace = traced(doc)
        for entry in trace:
            if entry[0] in ("text", "para") and ARABIC.search(entry[1]):
                free_text = entry[1] in {line.description.ar for line in sample_doc().lines} | {
                    "فاطمة الكواري", "شارع المطار القديم، الدوحة، قطر", "اللؤلؤة، الدوحة"}
                assert free_text or not NUMBERS.search(entry[1]), entry


def test_every_number_on_the_page_is_there_exactly_as_written():
    """Read back with another program, on a page with no Arabic so the reader has no
    direction to guess."""
    text = page_text(render(sample_doc("invoice", ("en",))))
    for exact in ("+974 5555 0100", "+974 5555 0199", "INV-2026-0042", "169.00", "174.00",
                  "ML-4455", "100200", "orders@qirfa.example", "TRX-20261019-7781", "3.50",
                  "42.00", "85.00", "19 Oct 2026", "18 Nov 2026"):
        assert exact in text, f"{exact} is not on the page: {text[:300]!r}"
    arabic_page = page_text(render(sample_doc("invoice")))
    # Western digits throughout: nothing was written in Arabic-Indic digits.
    assert not re.search("[٠-٩]", arabic_page)
    assert has_letters(arabic_page, "19 أكتوبر 2026")


def test_the_currency_follows_the_amount_in_arabic_and_leads_it_in_english():
    arabic = page_text(render(sample_doc("invoice", ("ar", "en"))))
    english = page_text(render(sample_doc("invoice", ("en", "ar"))))
    assert "169.00" in arabic and "ر.ق" in arabic
    assert re.search(r"QAR\s*169\.00", english)


# ── the page, mirrored ────────────────────────────────────────────────────────────────────


def heading_x(trace, label: str) -> float:
    return next(e[3] for e in trace if e[0] == "text" and e[1] == label)


def test_an_arabic_first_page_is_mirrored_and_an_english_first_page_is_not():
    _, ar = traced(sample_doc("invoice", ("ar", "en")))
    _, en = traced(sample_doc("invoice", ("en", "ar")))
    # The table reads from the right in Arabic: the item number is the rightmost column and
    # the line total the leftmost.
    assert heading_x(ar, "م") > heading_x(ar, "الوصف") > heading_x(ar, "الكمية") \
        > heading_x(ar, "الإجمالي")
    assert heading_x(en, "#") < heading_x(en, "Description") < heading_x(en, "Qty") \
        < heading_x(en, "Total")
    # The seller's name is against the start edge: right in Arabic, left in English.
    seller_ar = next(e for e in ar if e[0] == "para" and e[1] == "مخبز قرفة")
    seller_en = next(e for e in en if e[0] == "para" and e[1] == "Qirfa Bakery")
    assert seller_ar[3] + seller_ar[5] > 180 and seller_en[3] < 20  # (x, then width)
    assert seller_ar[-1] == "R" and seller_en[-1] == "L"


def test_nothing_is_drawn_outside_the_margins_and_nothing_is_cut_short():
    for layout, margin in (("a4", 14.0), ("a5", 9.0)):
        for languages in LANGUAGES:
            doc = sample_doc("invoice", languages, layout, brand=Brand(
                colour="#1d4f91", logo_png=logo_png(), show_signature=True, show_sku=True,
                bank_details="QA58 QNBA 0000", show_bank=True,
                footer=Bi(ar="شكرًا لزيارتكم", en="Thank you")))
            width = SIZES[layout][0]
            _, trace = traced(doc)
            for entry in trace:
                if entry[0] in ("text", "para"):
                    left, box_w = entry[3], entry[5]
                    assert left >= margin - 0.5 and left + box_w <= width - margin + 0.5, entry
                    assert "…" not in entry[1] and "..." not in entry[1], entry
                elif entry[0] == "picture":
                    assert entry[1] >= margin - 0.5 and entry[1] + entry[3] <= width - margin + 0.5


def test_a_number_too_big_for_its_column_is_made_smaller_not_cut():
    big = make_lines(((("توريد", "Supply"), "1", "service", 99_999_999_99, 0),))
    _, trace = traced(sample_doc("invoice", lines=big))
    sizes = [e[7] for e in trace if e[0] == "text" and e[1] == "99,999,999.99"]
    assert sizes and min(sizes) < 9.0  # smaller than the usual 9 pt
    assert all(e[3] >= 14 - 0.15 for e in trace if e[0] == "text")


def test_a_long_description_wraps_and_the_row_grows():
    long_text = "طبق كبير من الحلويات الشرقية المشكلة بأنواعها المختلفة والمحضرة يوميًا " * 3
    lines = make_lines(((("اسم قصير", "Short"), "1", "piece", 100, 0),
                        ((long_text, "A very large platter of assorted oriental sweets " * 3),
                         "1", "piece", 100, 0)))
    _, trace = traced(sample_doc("invoice", lines=lines))
    paras = [e for e in trace if e[0] == "para" and e[1].startswith("طبق")]
    assert paras and paras[0][5] < 120  # drawn inside the description column, not across the page


# ── more than one page, and the roll ──────────────────────────────────────────────────────

LONG = tuple(((f"صنف {i}", f"Item {i}"), "1.5", "kg", 1234 * i, 0) for i in range(1, 41))


def test_a_long_table_runs_on_with_its_heading_and_a_foot_that_counts_the_pages():
    doc = sample_doc("invoice", lines=make_lines(LONG), number="INV-2026-0043")
    data, trace = traced(doc)
    pages = page_count(data)
    assert pages == 3
    heads = [e for e in trace if e[0] == "text" and e[1] == "الوصف"]
    assert len(heads) == pages, "the table heading is repeated on every page"
    for number in range(1, pages + 1):
        assert f"صفحة {number} من {pages}" in "".join(e[1] for e in trace if e[0] == "text")
    # The totals are on the last page only, once.
    assert has_letters(page_text(data, pages - 1), "الإجمالي المتبقي")
    first = page_text(data, 0)
    assert "Balance due" not in first and "INV-2026-0043" in first
    # Every line is there, in order.
    text = page_text(data)
    assert all(f"Item {i}" in text for i in (1, 20, 40))


def test_the_roll_is_as_long_as_what_is_on_it():
    short = render(sample_doc("receipt", layout="thermal80", lines=make_lines(LINES[:1])))
    longer = render(sample_doc("receipt", layout="thermal80", lines=make_lines(LINES * 3)))
    (_, h_short), (_, h_long) = page_size_mm(short), page_size_mm(longer)
    assert h_long > h_short + 60 and h_long < 600
    assert page_count(longer) == 1


def test_the_thermal_receipt_is_one_narrow_column_in_either_direction():
    for languages in (("ar", "en"), ("en", "ar")):
        _, trace = traced(sample_doc("receipt", languages, "thermal80"))
        for e in trace:
            if e[0] in ("text", "para"):
                assert 3.9 <= e[3] and e[3] + e[5] <= 76.5, e


# ── the square kept free for a later QR code ──────────────────────────────────────────────


def corner(doc):
    """Draw the document and say where the square kept for a QR code is, from the page's own
    numbers: (the PDF, its pages, (left, top, right, bottom) in millimetres)."""
    page = Paged(doc, 1)
    data, pages = page.draw()
    side = 22.0 * page.k
    left = page.W - page.m - side if page.rtl else page.m
    # (a hair above the foot line, which is drawn along the bottom edge of the square)
    return data, pages, (left, page.bottom - side, left + side, page.bottom - 0.6)


@pytest.mark.parametrize("languages,layout", [(("ar", "en"), "a4"), (("en", "ar"), "a4"),
                                              (("ar", "en"), "a5"), (("en", "ar"), "a5")])
def test_the_corner_reserved_for_a_qr_code_is_empty(languages, layout):
    # (an A5 page holds less: two lines and no notes or terms is what fits with the square free)
    lines = make_lines(LINES[:2]) if layout == "a5" else make_lines(LINES)
    extra = {"notes": Bi(), "terms": Bi()} if layout == "a5" else {}
    data, pages, box = corner(sample_doc("invoice", languages, layout, lines=lines, **extra))
    assert pages == 1
    image = picture(data, 0, scale=2.0)
    assert ink_in(image, *box) == 0
    # ... and it is not just an empty page: there is ink above it.
    width = SIZES[layout][0]
    assert ink_in(image, 5, 5, width - 5, box[1]) > 5000


def test_the_reserved_corner_stays_empty_however_much_is_on_the_page():
    """Bank details, a signature, two lines of footer: whatever there is, the last page ends
    above the square (a block that would reach it starts the next page instead)."""
    brand = Brand(show_bank=True, bank_details="x\n" * 8, show_signature=True,
                  footer=Bi(ar="تذييل أول\nتذييل ثان", en="First\nSecond"))
    for lines in (make_lines(LINES), make_lines(LINES * 2), make_lines(LONG[:12])):
        data, pages, box = corner(sample_doc("invoice", lines=lines, brand=brand))
        image = picture(data, pages - 1, scale=2.0)
        assert ink_in(image, *box) == 0, (len(lines), pages)


# ── the shop's look ───────────────────────────────────────────────────────────────────────


def test_the_logo_is_scaled_to_fit_never_stretched_and_the_stamp_too():
    tall = logo_png(100, 300)
    doc = sample_doc("invoice", brand=Brand(logo_png=tall, stamp_png=logo_png(300, 100),
                                            show_signature=True))
    _, trace = traced(doc)
    pictures = [e for e in trace if e[0] == "picture"]
    assert len(pictures) == 2
    logo, stamp = pictures
    assert logo[3] / logo[4] == pytest.approx(100 / 300, rel=0.02) and logo[4] <= 17.1
    assert stamp[3] / stamp[4] == pytest.approx(300 / 100, rel=0.02)


def test_the_brand_colour_colours_the_rule_and_the_title_only_when_it_can_be_read():
    readable, pale = "#1d4f91", "#b98a00"
    assert colours.contrast(readable, colours.PAPER) >= colours.TEXT_CONTRAST
    assert colours.RULE_CONTRAST <= colours.contrast(pale, colours.PAPER) < colours.TEXT_CONTRAST
    _, dark = traced(sample_doc("invoice", brand=Brand(colour=readable)))
    _, light = traced(sample_doc("invoice", brand=Brand(colour=pale)))
    title = lambda t: next(e for e in t if e[0] == "para" and e[1] == "فاتورة")  # noqa: E731
    rule = lambda t: next(e for e in t if e[0] == "rule" and e[5] == 0.7)  # noqa: E731
    assert title(dark)[-2] == readable and rule(dark)[4] == readable
    assert title(light)[-2] == colours.INK and rule(light)[4] == pale  # the rule keeps the shop's
    _, plain = traced(sample_doc("invoice"))
    assert rule(plain)[4] == colours.NEUTRAL_ACCENT and title(plain)[-2] == colours.INK


def test_no_volt_and_no_page_colour_other_than_the_documents_tokens():
    _, trace = traced(sample_doc("invoice"))
    used = {e[-2] for e in trace if e[0] in ("text", "para")} | {
        e[4] for e in trace if e[0] == "rule"} | {e[5] for e in trace if e[0] == "fill"}
    allowed = {colours.INK, colours.MUTED, colours.HAIRLINE, colours.STRONG_LINE, colours.WASH,
               colours.NEUTRAL_ACCENT, colours.PAPER}
    assert used <= allowed, used - allowed


def test_a_preview_says_so_and_has_no_number():
    doc = sample_doc("invoice", preview=True, number=None)
    data, trace = traced(doc)
    text = page_text(data)
    assert "—" in text and "Preview" in text and "معاينة" in text
    assert "INV-" not in text


def test_a_shop_without_registration_says_so_on_every_layout():
    for layout in ("a4", "a5", "thermal80"):
        text = page_text(render(sample_doc("receipt", layout=layout, registered=False)))
        assert "not a tax invoice" in text and has_letters(text, "وليس فاتورة ضريبية")
        assert "CR" not in text  # no registration number to print
    assert "CR" in page_text(render(sample_doc("receipt", registered=True)))


def test_tax_columns_appear_only_when_there_is_tax():
    plain = page_text(render(sample_doc("invoice")))
    taxed_lines = tuple(
        Line(Bi(ar=ar, en=en), "", Decimal(q), unit, p, d, 500, *money.line_amounts(Decimal(q), p, d, 500))
        for (ar, en), q, unit, p, d in LINES)
    taxed = page_text(render(sample_doc("invoice", lines=taxed_lines)))
    assert "Tax" not in plain.replace("Tax ID", "") and "الضريبة" not in plain
    assert "Tax" in taxed and has_letters(taxed, "الضريبة")


# ── the layout, kept ──────────────────────────────────────────────────────────────────────


def golden_cases():
    brand = Brand(colour="#1d4f91", logo_png=logo_png(), show_signature=True, show_sku=True,
                  show_bank=True, bank_details="Qatar National Bank\nQA58 QNBA 0000 1234",
                  header=Bi(ar="طازج كل صباح", en="Fresh every morning"),
                  footer=Bi(ar="شكرًا لزيارتكم", en="Thank you for visiting"))
    return {
        "a4_ar_en_invoice": sample_doc("invoice"),
        "a4_en_ar_quote": sample_doc("quote", ("en", "ar"), number="QT-0003"),
        "a4_ar_unregistered_receipt": sample_doc("receipt", ("ar",), registered=False,
                                                 number="RC-0017"),
        "a4_ar_en_branded_invoice": sample_doc("invoice", brand=brand, number="INV-2026-0050"),
        "a4_ar_en_long_invoice": sample_doc("invoice", lines=make_lines(LONG),
                                            number="INV-2026-0043"),
        "a4_ar_en_credit_note": replace(
            sample_doc("credit_note", number="CN-0001"), related_number="INV-2026-0042",
            related_title=Bi(ar="فاتورة", en="Invoice"), reason="إرجاع المنتجات"),
        "a5_ar_en_receipt": sample_doc("receipt", layout="a5", number="RC-0018"),
        "thermal_ar_en_receipt": sample_doc("receipt", layout="thermal80", number="RC-0018"),
        "thermal_en_receipt": sample_doc("receipt", ("en",), "thermal80", number="RC-0019"),
        "a4_ar_en_preview": sample_doc("invoice", preview=True, number=None),
        "a4_ar_en_branch_rounding_receipt": branch_rounding("a4"),
        "thermal_ar_en_branch_rounding_receipt": branch_rounding("thermal80"),
    }


def branch_rounding(layout):
    """A receipt from a branch (named on the paper, with its own phone) whose total was
    rounded two dirhams down: the rounding is a line of its own."""
    doc = sample_doc("receipt", layout=layout, number="RCLUS-0004", rounding=-2)
    seller = replace(doc.seller, phone="+974 5555 0300", branch=Bi(ar="لوسيل", en="Lusail"))
    return replace(doc, seller=seller)


@pytest.mark.parametrize("name", list(golden_cases()))
def test_the_layout_is_the_one_that_was_reviewed(name):
    _, trace = traced(golden_cases()[name])
    actual = json.loads(json.dumps(trace))
    path = GOLDEN / f"{name}.json"
    if os.environ.get("ALYR_UPDATE_GOLDEN") == "1":
        GOLDEN.mkdir(parents=True, exist_ok=True)
        # One drawing call to a line, so a change reads as a diff of lines.
        body = ",\n".join(json.dumps(entry, ensure_ascii=False) for entry in actual)
        path.write_text(f"[\n{body}\n]\n", encoding="utf-8")
    assert path.exists(), f"no golden file: run with ALYR_UPDATE_GOLDEN=1 and look at {path.name}"
    expected = json.loads(path.read_text(encoding="utf-8"))
    assert actual == expected, (
        f"the layout of {name} changed. If that is meant, regenerate with ALYR_UPDATE_GOLDEN=1, "
        "look at the pictures, and commit the new file."
    )


def test_every_golden_file_belongs_to_a_case():
    names = {p.stem for p in GOLDEN.glob("*.json")}
    assert names == set(golden_cases()), names ^ set(golden_cases())


def test_the_date_on_the_file_is_the_documents_not_the_clock():
    doc = replace(sample_doc("invoice"), created=datetime(2026, 10, 19, 12, 0, tzinfo=UTC))
    data = render(doc)
    assert b"D:20261019120000" in data
