"""The thermal receipt: 80 mm wide, as long as it needs to be, one narrow column.

Printed on a till roll, so there is no page foot and no table: each line is its description
(in each language) and under it "quantity × price" with the line's total at the other end.
The roll is cut after the last line, so the page's height is the content's height. It is
drawn twice: once on a very tall page to measure it, and again on a page of exactly that
height (and a few millimetres of margin).

Everything is placed from the page's start edge, so an Arabic-first receipt is mirrored
(labels at the right, amounts at the left) like the A4 layout. The square at the end is
left empty for a payment or verification QR code in a later package.
"""

from alyr.modules.documents import colours
from alyr.modules.documents.render import text as t
from alyr.modules.documents.render.context import Bi, Doc, Line
from alyr.modules.documents.render.pen import Ink, Pen

WIDTH = 80.0
MARGIN = 4.0
MEASURE_HEIGHT = 4000.0
MIN_HEIGHT = 90.0
TAIL = 6.0  # a little paper after the last line
QR_SIDE = 24.0


class Thermal:
    def __init__(self, doc: Doc, trace: list | None = None) -> None:
        self.doc = doc
        self.trace = trace
        self.rtl = doc.rtl
        self.content_w = WIDTH - 2 * MARGIN
        self.accent = colours.accent_rule(doc.brand.colour)
        self.accent_text = colours.accent_text(doc.brand.colour)

    # ── geometry (as in Paged: logical, from the start edge) ──

    @property
    def start_align(self) -> str:
        return "R" if self.rtl else "L"

    @property
    def end_align(self) -> str:
        return "L" if self.rtl else "R"

    def draw(self) -> bytes:
        _, used = self._pass(MEASURE_HEIGHT, record=False)
        height = max(MIN_HEIGHT, used + TAIL)
        data, _ = self._pass(height, record=True)
        return data

    def _pass(self, height: float, *, record: bool) -> tuple[bytes, float]:
        d = self.doc
        pen = Pen(
            WIDTH, height, title=(d.title.en or d.title.ar) + (f" {d.number}" if d.number else ""),
            author=d.seller.name.en or d.seller.name.ar, created=d.created, language=d.primary,
            trace=self.trace if record else None,
        )
        pen.pdf.add_page()
        self.pen = pen
        self.x0, self.x1 = MARGIN, WIDTH - MARGIN
        self.y = 4.0
        if d.preview:
            self._watermark()
        self._header()
        self._identity()
        self._lines()
        self._totals()
        self._texts()
        self._tail()
        return pen.output(), self.y

    # ── small helpers ─────────────────────────────────────────

    def ink(self, size: float, bold: bool = False, colour: str = colours.INK) -> Ink:
        return Ink(size, bold, colour)

    def centered(self, lines: list[tuple[str, str, Ink]]) -> None:
        for text, lang, ink in lines:
            self.y += self.pen.paragraph(text, self.x0, self.y, self.x1 - self.x0, lang, ink,
                                         align="C")

    def lanes(self, value: Bi, size: float, bold: bool = False) -> list[tuple[str, str, Ink]]:
        out = []
        for position, (lang, text) in enumerate(t.by_lane(self.doc, value)):
            out.append((text, lang, self.ink(size if position == 0 else size - 1.0,
                                             bold and position == 0,
                                             colours.INK if position == 0 else colours.MUTED)))
        return out

    def kv(self, label_key: str, value_runs: list[tuple[str, str, Ink]], size: float = 7.6) -> None:
        """A label at the start edge and a value at the end edge on one line."""
        d, pen = self.doc, self.pen
        label_ink = self.ink(size - 0.6, colour=colours.MUTED)
        runs = []
        for position, (lang, text) in enumerate(t.labels(d, label_key)):
            if position:
                runs.append(("·", lang, label_ink))
            runs.append((text, lang, label_ink))
        h = pen.line_height("x", d.primary, self.ink(size))
        pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align=self.start_align,
                    gap=1.0)
        pen.run_row(value_runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align=self.end_align,
                    gap=1.0)
        self.y += h

    def dashed(self) -> None:
        self.y += 1.2
        self.pen.rule(self.x0, self.x1, self.y, colours.STRONG_LINE, 0.2, dash=True)
        self.y += 1.8

    def _watermark(self) -> None:
        pen, pdf = self.pen, self.pen.pdf
        text = "  ".join(t.label("preview", lang) for lang in self.doc.languages)
        ink = Ink(26, True, colours.HAIRLINE)
        with pdf.rotation(angle=38, x=WIDTH / 2, y=60):
            with pdf.local_context(fill_opacity=0.55):
                w = pen.width_of(text, self.doc.primary, ink)
                pen.put(text, (WIDTH - w) / 2, 50, w + 2, 20, self.doc.primary, ink, "C")

    # ── the head ──────────────────────────────────────────────

    def _header(self) -> None:
        d, pen = self.doc, self.pen
        if d.brand.logo_png:
            w, h = pen.picture(d.brand.logo_png, self.x0, self.y, self.x1 - self.x0, 15, align="C")
            self.y += h + 2
        self.centered(self.lanes(d.seller.name, 11.5, bold=True))
        self.y += 0.6
        s = d.seller
        small = self.ink(7.0, colour=colours.MUTED)
        short = {"registration": ("السجل التجاري", "CR"), "tax_id": ("الرقم الضريبي", "Tax ID"),
                 "licence": ("الرخصة", "Licence")}
        for key, value in (("registration", s.registration), ("tax_id", s.tax_id),
                           ("licence", s.licence)):
            if not value:
                continue
            runs: list[tuple[str, str, Ink]] = []
            for position, lang in enumerate(d.languages):
                if position:
                    runs.append(("·", lang, small))
                runs.append((short[key][0] if lang == "ar" else short[key][1], lang, small))
            runs.append((value, d.primary, self.ink(7.4)))
            h = pen.line_height(value, d.primary, self.ink(7.4))
            pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align="C", gap=1.2)
            self.y += h
        if s.branch.ar or s.branch.en:
            for lang, text in t.by_lane(d, s.branch)[:1]:
                runs = [(t.label("branch", d.primary), d.primary, small),
                        (text, lang, self.ink(8.0, True))]
                h = pen.line_height(text, lang, self.ink(8.0, True))
                pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align="C", gap=1.4)
                self.y += h
        for lang, text in t.by_lane(d, s.address):
            self.y += pen.paragraph(text, self.x0, self.y, self.x1 - self.x0, lang, small,
                                    align="C")
        for key, value in (("tel", s.phone), ("email", s.email)):
            if value:
                runs = [(t.label(key, d.primary), d.primary, small),
                        (value, d.primary, self.ink(7.4))]
                h = pen.line_height(value, d.primary, self.ink(7.4))
                pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align="C", gap=1.2)
                self.y += h
        if d.brand.header.ar or d.brand.header.en:
            self.y += 0.8
            self.centered([(text, lang, small) for lang, text in t.by_lane(d, d.brand.header)])
        self.dashed()

    def _identity(self) -> None:
        d, pen = self.doc, self.pen
        for position, (lang, text) in enumerate(t.title_of(d)):
            ink = (self.ink(12.5, True, self.accent_text) if position == 0
                   else self.ink(8.2, colour=colours.MUTED))
            self.y += pen.paragraph(text, self.x0, self.y, self.x1 - self.x0, lang, ink,
                                    align="C")
        self.y += 1.0
        ink = self.ink(8.2, True)
        number = d.number or "—"
        self.kv("number", [(number, d.primary, ink)])
        if d.issue_date:
            self.kv("date", [(t.date_text(d.issue_date, d.primary), d.primary, self.ink(8.0))])
        if d.second_date and d.second_date_label:
            self.kv(d.second_date_label, [(t.date_text(d.second_date, d.primary), d.primary,
                                           self.ink(8.0))])
        if d.preview:
            self.y += 0.8
            for lang, text in t.by_lane(d, Bi(ar=t.words.NOTES["preview"].ar,
                                              en=t.words.NOTES["preview"].en)):
                self.y += pen.paragraph(text, self.x0, self.y, self.x1 - self.x0, lang,
                                        self.ink(6.8, colour=colours.MUTED), align="C")
        c = d.customer
        if c.name.ar or c.name.en or c.company:
            self.y += 1.0
            self.pen.rule(self.x0, self.x1, self.y, colours.HAIRLINE, 0.2)
            self.y += 1.4
            key = "deliver_to" if d.kind == "delivery_note" else "customer"
            small = self.ink(6.8, colour=colours.MUTED)
            runs = []
            for position, (lang, text) in enumerate(t.labels(d, key)):
                if position:
                    runs.append(("·", lang, small))
                runs.append((text, lang, small))
            h = pen.line_height("x", d.primary, small)
            pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align=self.start_align,
                        gap=1.0)
            self.y += h
            for text, lang, ink in self.lanes(c.name, 8.6, bold=True):
                self.y += pen.paragraph(text, self.x0, self.y, self.x1 - self.x0, lang, ink,
                                        align=self.start_align)
            if c.company:
                self.y += pen.paragraph(c.company, self.x0, self.y, self.x1 - self.x0, d.primary,
                                        self.ink(8.0), align=self.start_align)
            for key, value in (("phone", c.phone), ("tax_id", c.tax_id
                                                    if d.brand.show_customer_tax_id else "")):
                if value:
                    self.kv(key, [(value, d.primary, self.ink(7.6))])
        self.dashed()

    # ── the lines ─────────────────────────────────────────────

    def _lines(self) -> None:
        d, pen = self.doc, self.pen
        for line in d.lines:
            self._line(line)
        self.y += 0.4
        pen.rule(self.x0, self.x1, self.y, colours.HAIRLINE, 0.2)
        self.y += 1.6

    def _line(self, line: Line) -> None:
        d, pen = self.doc, self.pen
        for position, (lang, text) in enumerate(t.by_lane(d, line.description)):
            ink = (self.ink(8.4, True) if position == 0
                   else self.ink(7.2, colour=colours.MUTED))
            self.y += pen.paragraph(text, self.x0, self.y, self.x1 - self.x0, lang, ink,
                                    align=self.start_align)
        if d.brand.show_sku and line.sku:
            self.y += pen.paragraph(line.sku, self.x0, self.y, self.x1 - self.x0, "en",
                                    self.ink(6.8, colour=colours.MUTED), align=self.start_align)
        qty = t.quantity(line.quantity)
        unit = t.unit_text(line.unit, d.primary)
        small = self.ink(7.8, colour=colours.INK)
        faint = self.ink(7.2, colour=colours.MUTED)
        left_runs = [(qty, d.primary, small), (unit, d.primary, faint), ("×", d.primary, faint),
                     (t.amount(d, line.unit_price), d.primary, small)]
        h = pen.line_height("1", d.primary, small)
        pen.run_row(left_runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align=self.start_align,
                    gap=1.0)
        total = t.amount(d, line.total)
        use = pen.fit(total, d.primary, self.ink(8.4, True), 30.0)
        pen.put(total, self.x0, self.y, self.x1 - self.x0, h, d.primary, use, self.end_align)
        self.y += h
        if line.discount:
            muted = self.ink(7.0, colour=colours.MUTED)
            runs = [(t.label("discount", d.primary), d.primary, muted),
                    ("-" + t.amount(d, line.discount), d.primary, muted)]
            h = pen.line_height("x", d.primary, muted)
            pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align=self.start_align,
                        gap=1.2)
            self.y += h
        self.y += 1.1

    # ── the totals ────────────────────────────────────────────

    def _totals(self) -> None:
        d, pen = self.doc, self.pen
        plain = self.ink(8.2)
        if d.discount or d.tax or d.rounding:
            self.kv("subtotal", [(t.amount(d, d.gross), d.primary, plain)], 8.2)
        if d.discount:
            self.kv("discount", [("-" + t.amount(d, d.discount), d.primary, plain)], 8.2)
        if d.tax:
            self.kv("tax", [(t.amount(d, d.tax), d.primary, plain)], 8.2)
        if d.rounding:
            sign = "-" if d.rounding < 0 else "+"
            self.kv("rounding", [(sign + t.amount(d, abs(d.rounding)), d.primary, plain)], 8.2)
        self.y += 0.8
        pen.rule(self.x0, self.x1, self.y, self.accent, 0.5)
        self.y += 1.0
        big = self.ink(12.0, True)
        runs = [(text, lang, big) for lang, text in t.total_runs(d, d.total)]
        runs = pen.fit_runs(runs, (self.x1 - self.x0) * 0.62, 1.0)
        label_ink = self.ink(9.4, True)
        label_runs = [(text, lang, label_ink if p == 0 else self.ink(7.2, colour=colours.MUTED))
                      for p, (lang, text) in enumerate(t.labels(d, "total"))]
        h = pen.line_height("x", d.primary, big)
        pen.run_row(label_runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align=self.start_align,
                    gap=1.2)
        pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align=self.end_align, gap=1.0)
        self.y += h + 1.0
        if d.paid:
            for p in d.payments:
                text = " · ".join(t.method_text(p.method, lang) for lang in d.languages)
                self.kv_text(text, t.amount(d, p.amount))
            if d.balance:
                self.kv("balance", [(t.amount(d, d.balance), d.primary, self.ink(8.6, True))], 8.4)

    def kv_text(self, label: str, value: str) -> None:
        d, pen = self.doc, self.pen
        ink = self.ink(7.8, colour=colours.MUTED)
        h = pen.line_height(label, d.primary, ink)
        pen.put(label, self.x0, self.y, self.x1 - self.x0, h, d.primary, ink, self.start_align)
        pen.put(value, self.x0, self.y, self.x1 - self.x0, h, d.primary, self.ink(7.8),
                self.end_align)
        self.y += h

    # ── notes, the registration note, the QR square, the foot ─

    def _texts(self) -> None:
        d, pen = self.doc, self.pen
        blocks: list[tuple[str, Bi, float]] = []
        if d.kind == "credit_note":
            small = self.ink(6.8, True, colours.MUTED)
            label_runs = []
            for position, (lang, text) in enumerate(t.labels(d, "against")):
                if position:
                    label_runs.append(("·", lang, small))
                label_runs.append((text, lang, small))
            self.y += 1.0
            h = pen.line_height("x", d.primary, small)
            pen.run_row(label_runs, self.x0, self.x1, self.y, h, rtl=self.rtl,
                        align=self.start_align, gap=1.0)
            self.y += h
            ink = self.ink(7.6, True)
            title = t.by_lane(d, d.related_title)
            runs = ([(title[0][1], title[0][0], ink)] if title else [])
            runs.append((d.related_number, d.primary, ink))
            h = max(pen.line_height(text, lang, i) for text, lang, i in runs)
            pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align=self.start_align,
                        gap=1.6)
            self.y += h
            if d.reason:
                blocks.append(("reason", Bi(ar=d.reason, en=d.reason), 7.4))
        if d.notes.ar or d.notes.en:
            blocks.append(("notes", d.notes, 7.2))
        if d.terms.ar or d.terms.en:
            blocks.append(("terms", d.terms, 6.6))
        for key, value, size in blocks:
            self.y += 1.0
            small = self.ink(6.8, True, colours.MUTED)
            runs = []
            for position, (lang, text) in enumerate(t.labels(d, key)):
                if position:
                    runs.append(("·", lang, small))
                runs.append((text, lang, small))
            h = pen.line_height("x", d.primary, small)
            pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align=self.start_align,
                        gap=1.0)
            self.y += h
            for position, (lang, text) in enumerate(t.by_lane(d, value)):
                ink = self.ink(size, colour=colours.INK if position == 0 else colours.MUTED)
                self.y += pen.paragraph(text, self.x0, self.y, self.x1 - self.x0, lang, ink,
                                        align=("R" if lang == "ar" else "L"))
        if d.unregistered:
            self.y += 1.4
            for lang, text in t.by_lane(d, Bi(ar=t.words.NOTES["unregistered"].ar,
                                              en=t.words.NOTES["unregistered"].en)):
                self.y += pen.paragraph(text, self.x0, self.y, self.x1 - self.x0, lang,
                                        self.ink(6.6, colour=colours.MUTED), align="C")

    def _tail(self) -> None:
        d, pen = self.doc, self.pen
        self.y += 2.0
        # The square left empty for a later QR code.
        self.y += QR_SIDE + 1.0
        for lang, text in t.by_lane(d, d.brand.footer):
            self.y += pen.paragraph(text, self.x0, self.y, self.x1 - self.x0, lang,
                                    self.ink(6.8, colour=colours.MUTED), align="C")
        small = self.ink(6.4, colour=colours.MUTED)
        if d.code:
            grouped = " ".join(d.code[i:i + 4] for i in range(0, len(d.code), 4)).upper()
            runs = [(t.label("code", d.primary), d.primary, small),
                    (grouped, "en", Ink(6.2, False, colours.MUTED, mono=True))]
            h = pen.line_height("x", d.primary, small)
            pen.run_row(runs, self.x0, self.x1, self.y, h, rtl=self.rtl, align="C", gap=1.4)
            self.y += h
        if d.brand.show_alyr_mark:
            mark = t.label("issued_with", d.primary)
            self.y += pen.paragraph(mark, self.x0, self.y, self.x1 - self.x0, d.primary, small,
                                    align="C")
