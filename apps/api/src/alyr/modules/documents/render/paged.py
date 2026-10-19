"""The A4 and A5 layouts: a letterhead, a strip of numbers, the customer, a table of lines that
runs on to more pages when it must, the totals, notes and terms, and a foot.

The page leads in the language the shop chose: with Arabic first the whole page is mirrored
(the shop's block on the right, the table read from the right, the totals on the left), with
English first it is the usual way round. Everything is placed by logical offsets from the
page's *start* edge, so one layout serves both directions and a mirrored page is not a
second design.

Nothing is cut and nothing ends in an ellipsis: long text wraps, an amount larger than the
column shrinks to fit (`Pen.fit`).

The square at the foot opposite the signature is left empty on purpose: it is reserved for a
payment or verification QR code (a later package). Nothing is drawn there now, not even a
frame, because the page does not say what it does not yet do.
"""

from dataclasses import dataclass

from alyr.modules.documents import colours
from alyr.modules.documents.render import text as t
from alyr.modules.documents.render.context import Bi, Doc, Line
from alyr.modules.documents.render.pen import Ink, Pen

SIZES = {"a4": (210.0, 297.0), "a5": (148.0, 210.0)}
QR_SIDE = 22.0  # millimetres; reserved, left empty
SHORT_LABELS = {
    "registration": ("السجل التجاري", "CR"),
    "tax_id": ("الرقم الضريبي", "Tax ID"),
    "licence": ("الرخصة", "Licence"),
}
Run = tuple[str, str, Ink]


@dataclass
class Col:
    key: str
    width: float
    numeric: bool


class Paged:
    def __init__(self, doc: Doc, total_pages: int, trace: list | None = None) -> None:
        self.doc = doc
        self.total_pages = total_pages
        self.W, self.H = SIZES[doc.layout]
        a4 = doc.layout == "a4"
        self.k = 1.0 if a4 else 0.86
        self.m = 14.0 if a4 else 9.0
        self.top = 13.0 if a4 else 9.0
        self.pad_bottom = 10.0 if a4 else 7.0
        self.rtl = doc.rtl
        self.pen = Pen(
            self.W, self.H, title=self._doc_title(),
            author=doc.seller.name.en or doc.seller.name.ar, created=doc.created,
            language=doc.primary, trace=trace,
        )
        # The foot's height depends on the shop's footer text, which can only be measured once
        # there is a page; `draw` sets these as soon as the first one exists.
        self.foot_h = 0.0
        self.bottom = self.H - self.pad_bottom
        self.y = self.top
        self.cols: list[Col] = []
        self.in_table = False
        self.signed = False
        self.qr_h = QR_SIDE * self.k + 2.0
        self.pen.pdf.footer_painter = self._footer
        self.accent = colours.accent_rule(doc.brand.colour)
        self.accent_text = colours.accent_text(doc.brand.colour)

    # ── geometry ──────────────────────────────────────────────

    @property
    def start(self) -> float:
        return self.W - self.m if self.rtl else self.m

    def span(self, offset: float, width: float) -> tuple[float, float]:
        """Absolute (left, right) of a box `width` wide that begins `offset` in from the
        page's start edge."""
        if self.rtl:
            right = self.start - offset
            return right - width, right
        left = self.start + offset
        return left, left + width

    @property
    def content_w(self) -> float:
        return self.W - 2 * self.m

    @property
    def start_align(self) -> str:
        return "R" if self.rtl else "L"

    @property
    def end_align(self) -> str:
        return "L" if self.rtl else "R"

    def ink(self, size: float, bold: bool = False, colour: str = colours.INK) -> Ink:
        return Ink(round(size * self.k, 2), bold, colour)

    def _doc_title(self) -> str:
        d = self.doc
        base = d.title.en or d.title.ar
        return f"{base} {d.number}" if d.number else base

    # ── pieces of text ────────────────────────────────────────

    def row(self, runs: list[Run], x0: float, x1: float, y: float, *, align: str | None = None,
            gap: float = 1.2) -> float:
        """Pieces of text on one line, from the start edge unless told otherwise. Returns
        the line's height."""
        runs = [r for r in runs if r[0]]
        if not runs:
            return 0.0
        h = max(self.pen.line_height(text, lang, ink) for text, lang, ink in runs)
        self.pen.run_row(runs, x0, x1, y, h, rtl=self.rtl, align=align or self.start_align,
                         gap=gap)
        return h

    def label_runs(self, key: str, ink: Ink) -> list[Run]:
        runs: list[Run] = []
        for position, (lang, text) in enumerate(t.labels(self.doc, key)):
            if position:
                runs.append(("·", lang, ink))
            runs.append((text, lang, ink))
        return runs

    def short_runs(self, key: str, value: str) -> list[Run]:
        """'السجل التجاري · CR  100200': both languages' short labels, then the number."""
        d = self.doc
        label_ink = self.ink(7.6, colour=colours.MUTED)
        runs: list[Run] = []
        for position, lang in enumerate(d.languages):
            if position:
                runs.append(("·", lang, label_ink))
            runs.append((SHORT_LABELS[key][0] if lang == "ar" else SHORT_LABELS[key][1], lang,
                         label_ink))
        runs.append((value, d.primary, self.ink(8.2)))
        return runs

    def pair_runs(self, key: str, value: str) -> list[Run]:
        d = self.doc
        return [(t.label(key, d.primary), d.primary, self.ink(7.6, colour=colours.MUTED)),
                (value, d.primary, self.ink(8.2))]

    def groups(self, groups: list[list[Run]], x0: float, x1: float, y: float) -> float:
        """Several small facts ('CR 100200', 'Licence ML-4455') on one line if they fit,
        else one under the other. Returns the height used."""
        groups = [g for g in groups if g]
        if not groups:
            return 0.0
        sep: Run = ("|", self.doc.primary, self.ink(7.6, colour=colours.MUTED))
        joined: list[Run] = []
        for position, group in enumerate(groups):
            if position:
                joined.append(sep)
            joined.extend(group)
        gap = 1.6
        width = sum(self.pen.width_of(text, lang, ink) for text, lang, ink in joined)
        width += gap * (len(joined) - 1)
        if width <= x1 - x0:
            return self.row(joined, x0, x1, y, gap=gap)
        used = 0.0
        for group in groups:
            used += self.row(group, x0, x1, y + used, gap=gap)
        return used

    def lane_lines(self, value: Bi, size: float, bold: bool = False,
                   second: float = 0.78) -> list[Run]:
        """A bilingual value as lines: the first language in ink, the rest smaller and muted."""
        lines = []
        for position, (lang, text) in enumerate(t.by_lane(self.doc, value)):
            ink = (self.ink(size, bold) if position == 0
                   else self.ink(size * second, colour=colours.MUTED))
            lines.append((text, lang, ink))
        return lines

    def inline_lanes(self, value: Bi, ink: Ink, x0: float, x1: float, y: float) -> float:
        """A bilingual value on one line ('اللؤلؤة، الدوحة · The Pearl, Doha') if it fits,
        else one language under the other. Returns the height used."""
        lanes = t.by_lane(self.doc, value)
        if len(lanes) == 2:
            runs: list[Run] = [(lanes[0][1], lanes[0][0], ink), ("·", lanes[0][0], ink),
                               (lanes[1][1], lanes[1][0], ink)]
            width = sum(self.pen.width_of(text, lang, i) for text, lang, i in runs) + 3.0
            if width <= x1 - x0:
                return self.row(runs, x0, x1, y, gap=1.5)
        used = 0.0
        for lang, text in lanes:
            used += self.pen.paragraph(text, x0, y + used, x1 - x0, lang, ink,
                                       align=self.start_align)
        return used

    def paragraphs(self, lines: list[Run], x0: float, x1: float, y: float, *,
                   align: str | None = None) -> float:
        used = 0.0
        for text, lang, ink in lines:
            used += self.pen.paragraph(text, x0, y + used, x1 - x0, lang, ink,
                                       align=align or self.start_align)
        return used

    # ── the page ──────────────────────────────────────────────

    def draw(self) -> tuple[bytes, int]:
        pdf = self.pen.pdf
        pdf.add_page()
        self.foot_h = self._foot_height()
        self.bottom = self.H - self.pad_bottom - self.foot_h
        if self.doc.preview:
            self._watermark()
        self._header()
        self._meta()
        self._parties()
        self._table()
        self._totals()
        self._texts()
        self._signoff()
        return self.pen.output(), pdf.page

    def new_page(self) -> None:
        self.pen.pdf.add_page()
        if self.doc.preview:
            self._watermark()
        self.y = self.top
        d, pen = self.doc, self.pen
        left, right = self.span(0, self.content_w)
        name = t.by_lane(d, d.seller.name)
        if name:
            lang, text = name[0]
            self.row([(text, lang, self.ink(10, True))], left, right, self.y)
        title = t.title_of(d)[0]
        ink = self.ink(9.5, True, self.accent_text)
        runs = [(title[1], title[0], ink)]
        if d.number:
            runs.append((d.number, d.primary, ink))  # a run of its own, never inside the Arabic
        self.row(runs, left, right, self.y, align=self.end_align, gap=2.0)
        self.y += 8
        pen.rule(left, right, self.y, self.accent, 0.5)
        self.y += 4
        if self.in_table:
            self._table_head()

    def _watermark(self) -> None:
        pen, pdf = self.pen, self.pen.pdf
        text = "   ".join(t.label("preview", lang) for lang in self.doc.languages)
        ink = Ink(54 * self.k, True, colours.HAIRLINE)
        with pdf.rotation(angle=38, x=self.W / 2, y=self.H / 2):
            w = pen.width_of(text, self.doc.primary, ink)
            pen.put(text, (self.W - w) / 2, self.H / 2 - 12, w + 2, 24, self.doc.primary, ink, "C")

    # ── header: the seller and the title ──────────────────────

    def _header(self) -> None:
        d, pen = self.doc, self.pen
        title_w = 62.0 * self.k
        gap = 8.0
        seller_w = self.content_w - title_w - gap
        top = self.y

        # The seller, from the start edge: logo, names, numbers, address, contact.
        x_off = 0.0
        if d.brand.logo_png:
            logo_w = 24 * self.k
            lx0, _ = self.span(0, logo_w)
            pen.picture(d.brand.logo_png, lx0, top, logo_w, 17 * self.k,
                        align="R" if self.rtl else "L")
            x_off = logo_w + 4
        sx0, sx1 = self.span(x_off, seller_w - x_off)
        y = top
        y += self.paragraphs(self.lane_lines(d.seller.name, 14, bold=True, second=0.72),
                             sx0, sx1, y)
        y += 0.9
        s = d.seller
        y += self.groups(
            [self.short_runs(k, v) for k, v in (("registration", s.registration),
                                                ("tax_id", s.tax_id), ("licence", s.licence)) if v],
            sx0, sx1, y)
        muted = self.ink(8.0, colour=colours.MUTED)
        y += self.inline_lanes(s.address, muted, sx0, sx1, y)
        y += self.groups([self.pair_runs(k, v) for k, v in (("tel", s.phone), ("email", s.email))
                          if v], sx0, sx1, y)
        header_bottom = y

        # The title, from the end edge, and the shop's line under it.
        tx0, tx1 = self.span(self.content_w - title_w, title_w)
        y2 = top
        for position, (lang, text) in enumerate(t.title_of(d)):
            ink = (self.ink(19, True, self.accent_text) if position == 0
                   else self.ink(10, colour=colours.MUTED))
            y2 += pen.paragraph(text, tx0, y2, tx1 - tx0, lang, ink, align=self.end_align)
        if d.brand.header.ar or d.brand.header.en:
            y2 += 1.4
            y2 += self.paragraphs(
                [(text, lang, muted) for lang, text in t.by_lane(d, d.brand.header)],
                tx0, tx1, y2, align=self.end_align)
        self.y = max(header_bottom, y2, top + 18 * self.k) + 2.5
        left, right = self.span(0, self.content_w)
        pen.rule(left, right, self.y, self.accent, 0.7)
        self.y += 2.8

    # ── the strip of numbers ──────────────────────────────────

    def _meta(self) -> None:
        d, pen = self.doc, self.pen
        cells = [("number", d.number or "—"), ("date", d.issue_date)]
        if d.second_date and d.second_date_label:
            cells.append((d.second_date_label, d.second_date))
        cell_w = self.content_w / max(len(cells), 1)
        label_ink = self.ink(7.4, colour=colours.MUTED)
        top = self.y
        tallest = 0.0
        for index, (key, value) in enumerate(cells):
            x0, x1 = self.span(index * cell_w, cell_w - 3)
            y = top
            y += self.row(self.label_runs(key, label_ink), x0, x1, y) + 0.4
            if isinstance(value, str):
                ink = pen.fit(value, d.primary, self.ink(11, True), x1 - x0)
                h = pen.line_height(value, d.primary, ink)
                pen.put(value, x0, y, x1 - x0, h, d.primary, ink, self.start_align)
                y += h
            else:
                for position, lang in enumerate(d.languages):
                    ink = (self.ink(10.5, True) if position == 0
                           else self.ink(8.4, colour=colours.MUTED))
                    text = t.date_text(value, lang)
                    h = pen.line_height(text, lang, ink)
                    pen.put(text, x0, y, x1 - x0, h, lang, ink, self.start_align)
                    y += h
            tallest = max(tallest, y - top)
        self.y = top + tallest + 1.6
        left, right = self.span(0, self.content_w)
        if d.preview:
            note = t.words.NOTES["preview"]
            for lang, text in t.by_lane(d, Bi(ar=note.ar, en=note.en)):
                self.y += pen.paragraph(text, left, self.y, right - left, lang,
                                        self.ink(8.0, True, colours.MUTED),
                                        align=self.start_align)
            self.y += 0.6
        pen.rule(left, right, self.y, colours.HAIRLINE, 0.2)
        self.y += 2.8

    # ── the customer, and what was paid or credited ───────────

    def _parties(self) -> None:
        d, pen = self.doc, self.pen
        c = d.customer
        has_customer = bool(c.name.ar or c.name.en or c.company)
        side = d.kind == "credit_note" or bool(d.payments)
        if not has_customer and not side:
            return
        left_w = self.content_w * (0.56 if side else 1.0)
        top = self.y
        y_left = top
        if has_customer:
            x0, x1 = self.span(0, left_w)
            label_ink = self.ink(7.4, colour=colours.MUTED)
            key = "deliver_to" if d.kind == "delivery_note" else "customer"
            y_left += self.row(self.label_runs(key, label_ink), x0, x1, y_left) + 0.6
            y_left += self.paragraphs(self.lane_lines(c.name, 10.5, bold=True), x0, x1, y_left)
            if c.company:
                y_left += pen.paragraph(c.company, x0, y_left, x1 - x0, d.primary, self.ink(9),
                                        align=self.start_align)
            facts = [self.pair_runs(k, v) for k, v in (
                ("phone", c.phone), ("email", c.email), ("customer_registration", c.registration),
                ("tax_id", c.tax_id if d.brand.show_customer_tax_id else "")) if v]
            y_left += self.groups(facts, x0, x1, y_left)
            y_left += self.inline_lanes(c.address, self.ink(8.2, colour=colours.MUTED), x0, x1,
                                        y_left)
        y_right = top
        if side:
            x0, x1 = self.span(left_w + 8, self.content_w - left_w - 8)
            y_right += (self._credit_box(x0, x1, y_right) if d.kind == "credit_note"
                        else self._payment_box(x0, x1, y_right))
        self.y = max(y_left, y_right) + 2.8

    def _credit_box(self, x0: float, x1: float, y: float) -> float:
        d, pen = self.doc, self.pen
        label_ink = self.ink(7.4, colour=colours.MUTED)
        used = self.row(self.label_runs("against", label_ink), x0, x1, y) + 0.6
        title = t.by_lane(d, d.related_title)
        ink = self.ink(10, True)
        # The kind in words, then the number as a run of its own (never inside the Arabic).
        runs = [(title[0][1], title[0][0], ink)] if title else []
        used += self.row(runs + [(d.related_number, d.primary, ink)], x0, x1, y + used, gap=2.0)
        if d.reason:
            used += 1.2
            used += self.row(self.label_runs("reason", label_ink), x0, x1, y + used) + 0.6
            used += pen.paragraph(d.reason, x0, y + used, x1 - x0, d.primary, self.ink(9),
                                  align=self.start_align)
        return used

    def _payment_box(self, x0: float, x1: float, y: float) -> float:
        d, pen = self.doc, self.pen
        label_ink = self.ink(7.4, colour=colours.MUTED)
        used = self.row(self.label_runs("payment", label_ink), x0, x1, y) + 0.6
        for p in d.payments:
            ink = self.ink(9)
            methods = [t.method_text(p.method, lang) for lang in d.languages]
            text = " · ".join(methods)
            h = pen.line_height(text, d.primary, ink)
            pen.put(text, x0, y + used, x1 - x0, h, d.primary, ink, self.start_align)
            pen.put(t.amount(d, p.amount), x0, y + used, x1 - x0, h, d.primary, ink,
                    self.end_align)
            used += h
            if p.reference:
                used += pen.paragraph(p.reference, x0, y + used, x1 - x0, "en",
                                      self.ink(8, colour=colours.MUTED), align=self.start_align)
        return used

    # ── the table ─────────────────────────────────────────────

    def _build_columns(self) -> list[Col]:
        d, k = self.doc, self.k
        any_discount = any(line.discount for line in d.lines)
        any_tax = any(line.tax for line in d.lines)
        any_sku = d.brand.show_sku and any(line.sku for line in d.lines)
        spec = [Col("no", 7 * k, False), Col("desc", 0.0, False)]
        if any_sku:
            spec.append(Col("sku", 20 * k, False))
        spec.append(Col("qty", 19 * k, True))
        spec.append(Col("price", 24 * k, True))
        if any_discount and d.brand.show_discounts:
            spec.append(Col("discount", 20 * k, True))
        if any_tax:
            spec.append(Col("tax", 18 * k, True))
        spec.append(Col("total", 26 * k, True))
        fixed = sum(c.width for c in spec)
        for c in spec:
            if c.key == "desc":
                c.width = self.content_w - fixed
        return spec

    def _col_box(self, index: int) -> tuple[float, float]:
        """The inside of column `index`, less a little room at each side."""
        offset = sum(c.width for c in self.cols[:index])
        x0, x1 = self.span(offset, self.cols[index].width)
        return x0 + 1.4, x1 - 1.4

    def _table(self) -> None:
        self.cols = self._build_columns()
        self._table_head()
        self.in_table = True
        for index, line in enumerate(self.doc.lines, start=1):
            self._row(index, line)
        self.in_table = False

    def _table_head(self) -> None:
        d, pen = self.doc, self.pen
        two = d.secondary is not None
        head_h = (9.0 if two else 6.2) * self.k
        left, right = self.span(0, self.content_w)
        pen.fill(left, self.y, right - left, head_h, colours.WASH)
        keys = {"no": "item_no", "desc": "description", "sku": "sku", "qty": "qty",
                "price": "unit_price", "discount": "discount", "tax": "tax", "total": "line_total"}
        for i, col in enumerate(self.cols):
            x0, x1 = self._col_box(i)
            align = "R" if col.numeric else self.start_align
            y = self.y + 1.0 * self.k
            for position, (lang, text) in enumerate(t.labels(d, keys[col.key])):
                ink = (self.ink(7.6, True) if position == 0
                       else self.ink(6.8, colour=colours.MUTED))
                h = pen.line_height(text, lang, ink)
                fitted = pen.fit(text, lang, ink, x1 - x0, 5.0)
                pen.put(text, x0, y, x1 - x0, h, lang, fitted, align)
                y += h
        self.y += head_h

    def _row(self, index: int, line: Line) -> None:
        d, pen = self.doc, self.pen
        pad = 1.35 * self.k
        desc_i = next(i for i, c in enumerate(self.cols) if c.key == "desc")
        dx0, dx1 = self._col_box(desc_i)

        pieces: list[Run] = []
        for position, (lang, text) in enumerate(t.by_lane(d, line.description)):
            ink = self.ink(9.2, True) if position == 0 else self.ink(8.2, colour=colours.MUTED)
            pieces.append((text, lang, ink))
        height = pad * 2 + sum(pen.paragraph(text, 0, 0, dx1 - dx0, lang, ink, draw=False)
                               for text, lang, ink in pieces)
        discount_shown = any(c.key == "discount" for c in self.cols)
        note_h = 0.0
        if line.discount and not discount_shown:
            note_h = pen.line_height("x", d.primary, self.ink(8))
            height += note_h
        height = max(height, 7.0 * self.k)
        if self.y + height > self.bottom:
            self.new_page()
        top = self.y
        y = top + pad
        for text, lang, ink in pieces:
            y += pen.paragraph(text, dx0, y, dx1 - dx0, lang, ink, align=self.start_align)
        if line.discount and not discount_shown:
            muted = self.ink(8, colour=colours.MUTED)
            self.row([(t.label("discount", d.primary), d.primary, muted),
                      ("-" + t.amount(d, line.discount), d.primary, muted)], dx0, dx1, y, gap=1.4)

        first_h = pen.line_height("1", d.primary, self.ink(9))
        for i, col in enumerate(self.cols):
            if col.key == "desc":
                continue  # drawn above
            x0, x1 = self._col_box(i)
            ink = self.ink(9)
            if col.key == "no":
                pen.put(str(index), x0, top + pad, x1 - x0, first_h, d.primary,
                        self.ink(8.2, colour=colours.MUTED), self.start_align)
            elif col.key == "sku":
                pen.put(line.sku, x0, top + pad, x1 - x0, first_h, "en",
                        pen.fit(line.sku, "en", self.ink(8.2), x1 - x0), self.start_align)
            elif col.key == "qty":
                qty = t.quantity(line.quantity)
                unit = t.unit_text(line.unit, d.primary)
                unit_ink = self.ink(8, colour=colours.MUTED)
                if pen.width_of(qty, d.primary, ink) + pen.width_of(unit, d.primary, unit_ink) \
                        + 1.5 > x1 - x0:
                    ink = pen.fit(qty, d.primary, ink, x1 - x0 - 6)
                pen.run_row([(qty, d.primary, ink), (unit, d.primary, unit_ink)], x0, x1,
                            top + pad, first_h, rtl=self.rtl, align="R", gap=1.3)
            else:
                value = {"price": line.unit_price, "discount": line.discount, "tax": line.tax,
                         "total": line.total}[col.key]
                text = t.amount(d, value) if (value or col.key in ("price", "total")) else ""
                if col.key == "discount" and value:
                    text = "-" + text
                use = pen.fit(text, d.primary, self.ink(9, col.key == "total"), x1 - x0)
                pen.put(text, x0, top + pad, x1 - x0, first_h, d.primary, use, "R")
        self.y = top + height
        left, right = self.span(0, self.content_w)
        pen.rule(left, right, self.y, colours.HAIRLINE, 0.2)

    # ── the totals ────────────────────────────────────────────

    def _totals(self) -> None:
        d, pen = self.doc, self.pen
        rows: list[tuple[str, int]] = []
        if d.discount or d.tax:
            rows.append(("subtotal", d.gross))
        if d.discount:
            rows.append(("discount", -d.discount))
        if d.tax:
            rows.append(("tax", d.tax))
        rows.append(("total", d.total))
        if d.paid:
            rows.append(("paid", d.paid))
        if d.kind == "invoice" or d.paid:
            if d.balance or d.kind == "invoice":
                rows.append(("balance", d.balance))
        box_w = min(78.0 * self.k, self.content_w * 0.55)
        row_h = 6.0 * self.k
        self._need(3 + row_h * len(rows) + 3)
        self.y += 3.0
        top0 = self.y
        # The box sits against the end edge. Inside it the amounts have a cell of their own at
        # the box's end, the labels the rest from its start: mirrored with the page.
        x0, x1 = self.span(self.content_w - box_w, box_w)
        amount_w = 30.0 * self.k
        label_box = self.span(self.content_w - box_w, box_w - amount_w)
        amount_box = self.span(self.content_w - amount_w, amount_w)
        for key, value in rows:
            big = key == "total"
            strong = big or key == "balance"
            if big:
                pen.fill(x0, self.y, x1 - x0, row_h + 1.6, colours.WASH)
                pen.rule(x0, x1, self.y, self.accent, 0.6)
                top = self.y + 0.8
            else:
                top = self.y
            label_ink = self.ink(9.4 if strong else 8.6, strong)
            runs = [(text, lang, label_ink if position == 0
                     else self.ink(7.6, colour=colours.MUTED))
                    for position, (lang, text) in enumerate(t.labels(d, key))]
            self.row(runs, label_box[0] + 1.5, label_box[1], top, gap=1.5)
            ax0, ax1 = amount_box[0], amount_box[1] - 1.5
            if big:
                # The total may use all of the box the label leaves: against the end edge in
                # the same column as the other amounts, growing toward the label.
                label_w = sum(pen.width_of(text, lang, ink) for text, lang, ink in runs) + 4.5
                left = x0 + 1.5 if self.rtl else label_box[0] + 1.5 + label_w
                self._total_amount(left, ax1, top, self.ink(12.5, True), value)
            else:
                shown = ("-" if key == "discount" else "") + t.amount(d, abs(value))
                ink = pen.fit(shown, d.primary, self.ink(9.4, strong), ax1 - ax0)
                h = pen.line_height(shown, d.primary, ink)
                pen.put(shown, ax0, top, ax1 - ax0, h, d.primary, ink, "R")
            self.y = top + row_h + (0.8 if big else 0.0)
        self._signature_beside(top0, box_w)
        self.y += 3.0

    def _total_amount(self, x0: float, x1: float, top: float, ink: Ink, value: int) -> None:
        """The total with its currency, as the first language writes it, against the right."""
        d, pen = self.doc, self.pen
        runs = [(text, lang, ink) for lang, text in t.total_runs(d, value)]
        runs = pen.fit_runs(runs, x1 - x0 - 1.4, 1.3)
        h = max(pen.line_height(text, lang, ink) for text, lang, ink in runs)
        pen.run_row(runs, x0, x1, top, h, rtl=self.rtl, align="R", gap=1.3)

    # ── notes, terms, bank, the registration note ─────────────

    def _need(self, h: float) -> None:
        """Room for a block after the table, with the square for a later QR code still free
        below it: if it would not be, the block starts the next page."""
        if self.y + h > self.bottom - self.qr_h:
            self.new_page()

    def _lanes(self, value: Bi, size: float, y: float, *, draw: bool) -> float:
        """The text in each language, side by side when there are two (Arabic in the right
        column, English in the left, each against its own edge) and full width when there is
        one. Returns the height."""
        d, pen = self.doc, self.pen
        lanes = t.by_lane(d, value)
        left, right = self.span(0, self.content_w)
        if len(lanes) == 2:
            col_w = (self.content_w - 8) / 2
            heights = []
            for lang, text in lanes:
                ink = self.ink(size, colour=colours.INK)
                x0 = right - col_w if lang == "ar" else left
                align = "R" if lang == "ar" else "L"
                heights.append(pen.paragraph(text, x0, y, col_w, lang, ink, align=align,
                                             draw=draw))
            return max(heights)
        used = 0.0
        for lang, text in lanes:
            used += pen.paragraph(text, left, y + used, right - left, lang,
                                  self.ink(size), align=self.start_align, draw=draw)
        return used

    def _labelled(self, key: str, value: Bi, size: float) -> None:
        left, right = self.span(0, self.content_w)
        label_ink = self.ink(7.4, True, colours.MUTED)
        self._need(self.pen.line_height("x", self.doc.primary, label_ink)
                   + self._lanes(value, size, 0, draw=False) + 4)
        self.y += self.row(self.label_runs(key, label_ink), left, right, self.y) + 0.8
        self.y += self._lanes(value, size, self.y, draw=True) + 2.0

    def _texts(self) -> None:
        d = self.doc
        if d.notes.ar or d.notes.en:
            self._labelled("notes", d.notes, 8.2)
        if d.brand.show_bank and d.brand.bank_details:
            lines = "\n".join(ln for ln in d.brand.bank_details.splitlines() if ln.strip())
            self._labelled("bank", Bi(ar=lines if any(ord(ch) > 0x600 for ch in lines) else "",
                                      en="" if any(ord(ch) > 0x600 for ch in lines) else lines),
                           8.4)
        if d.terms.ar or d.terms.en:
            self._labelled("terms", d.terms, 7.4)
        if d.unregistered:
            note = t.words.NOTES["unregistered"]
            lanes = t.by_lane(d, Bi(ar=note.ar, en=note.en))
            left, right = self.span(0, self.content_w)
            inset = 3.0
            x0 = left if self.rtl else left + inset
            x1 = right - inset if self.rtl else right
            h = sum(self.pen.paragraph(text, x0, 0, x1 - x0, lang, self.ink(7.8), draw=False)
                    for lang, text in lanes)
            self._need(h + 3)
            bar_x = right - 0.8 if self.rtl else left
            self.pen.fill(bar_x, self.y, 0.8, h, self.accent)
            for lang, text in lanes:
                self.y += self.pen.paragraph(text, x0, self.y, x1 - x0, lang,
                                             self.ink(7.8, colour=colours.MUTED),
                                             align=self.start_align)
            self.y += 3.0

    # ── the end of the content: QR space and signature ────────

    def _signature_beside(self, top: float, totals_w: float) -> None:
        """The signature line and the stamp go in the space beside the totals, against the
        start edge, so they cost no height."""
        d = self.doc
        self.signed = False
        if not d.brand.show_signature:
            return
        height = 22.0 * self.k
        width = min(62.0 * self.k, self.content_w - totals_w - 10.0)
        if width < 36.0 * self.k:
            return  # no room beside the totals: `_signoff` finds it a place below
        x0, x1 = self.span(0, width)
        self._signature(x0, x1, top, height)
        self.y = max(self.y, top + height)
        self.signed = True

    def _signature(self, x0: float, x1: float, top: float, height: float) -> None:
        pen = self.pen
        if self.doc.brand.stamp_png:
            pen.picture(self.doc.brand.stamp_png, x0, top, x1 - x0, height - 7, align="C")
        line_y = top + height - 6
        pen.rule(x0, x1, line_y, colours.STRONG_LINE, 0.3)
        self.row(self.label_runs("signature", self.ink(7.4, colour=colours.MUTED)),
                 x0, x1, line_y + 0.8, align="C")

    def _signoff(self) -> None:
        """What is left to place at the end of the content: the signature, if there was no
        room beside the totals. The bottom corner at the start edge, a square of QR_SIDE, is
        never drawn on: `_need` keeps every block above it, and it stays empty until a later
        package puts a payment or verification code there."""
        d = self.doc
        if d.brand.show_signature and not self.signed:
            height = 22.0 * self.k
            self._need(height + 2)
            x0, x1 = self.span(self.content_w - 62.0 * self.k, 62.0 * self.k)
            self._signature(x0, x1, self.y + 2.0, height)
            self.y += height + 2.0

    # ── the foot, on every page ───────────────────────────────

    def _foot_height(self) -> float:
        d, pen = self.doc, self.pen
        height = 9.0 * self.k
        left, right = self.span(0, self.content_w)
        for lang, text in t.by_lane(d, d.brand.footer):
            height += pen.paragraph(text, left, 0, right - left, lang,
                                    Ink(7.4 * self.k, colour=colours.MUTED), align="C", draw=False)
        return height

    def _footer(self) -> None:
        d, pen = self.doc, self.pen
        top = self.H - self.pad_bottom - self.foot_h
        left, right = self.span(0, self.content_w)
        pen.rule(left, right, top, colours.HAIRLINE, 0.2)
        y = top + 1.4
        for lang, text in t.by_lane(d, d.brand.footer):
            y += pen.paragraph(text, left, y, right - left, lang,
                               Ink(7.4 * self.k, colour=colours.MUTED), align="C")
        ink = Ink(6.8 * self.k, colour=colours.MUTED)
        mono = Ink(6.6 * self.k, colour=colours.MUTED, mono=True)
        h = pen.line_height("x", d.primary, ink)
        y = self.H - self.pad_bottom - h - 0.5
        if d.code:
            grouped = " ".join(d.code[i:i + 4] for i in range(0, len(d.code), 4)).upper()
            self.row([(t.label("code", d.primary), d.primary, ink), (grouped, "en", mono)],
                     left, right, y, gap=1.6)
        page = (f"{t.label('page', d.primary)} {pen.pdf.page_no()} "
                f"{t.label('of', d.primary)} {self.total_pages}")
        pen.put(page, left, y, right - left, h, d.primary, ink, "C")
        if d.brand.show_alyr_mark:
            pen.put(t.label("issued_with", d.primary), left, y, right - left, h, d.primary, ink,
                    self.end_align)
