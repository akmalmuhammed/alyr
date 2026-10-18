"""Reading and writing .xlsx files with the standard library only (D-039, ALY-108).

Why not a library: the Catalog needs a small, fixed subset (one table of text, numbers,
yes/no and dates in, one formatted table out), and an upload from an owner's phone is
untrusted input, so the limits matter more than the features. Everything here is bounded
before it is parsed: the file, each part inside it, the total once unpacked, the number of
rows and columns. No part is ever written to disk. A formula is never calculated: a cell
that holds one gives its saved value, and the caller is told it was a formula.

`.xls` (the old binary format) and `.xlsm` (macros) are refused with a plain message.

Reading: `read(data) -> Sheet`. Writing: `write(sheets) -> bytes`.
"""

import io
import re
import zipfile
import zlib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree
from xml.sax.saxutils import escape

# ── limits ────────────────────────────────────────────────
MAX_FILE_BYTES = 8 * 1024 * 1024        # the upload as sent (the caller also checks this)
MAX_PART_BYTES = 32 * 1024 * 1024       # any one part, unpacked
MAX_TOTAL_BYTES = 64 * 1024 * 1024      # all parts, unpacked
MAX_PARTS = 400
MAX_RATIO = 200                         # unpacked / packed, for a part over MAX_RATIO_FREE
MAX_RATIO_FREE = 1024 * 1024
MAX_ROWS = 20_000                       # rows read; the importer's own cap is lower
MAX_COLUMNS = 60
MAX_CELL_CHARS = 10_000

OLE_MAGIC = bytes.fromhex("D0CF11E0A1B11AE1")  # the old .xls (and other Office 97) format
ZIP_MAGIC = b"PK\x03\x04"


class SheetError(Exception):
    """A file that cannot be read. `code` is stable; `en` and `ar` are safe to show."""

    def __init__(self, code: str, en: str, ar: str, status: int = 422) -> None:
        super().__init__(en)
        self.code, self.en, self.ar, self.status = code, en, ar, status


def _bad(code: str, en: str, ar: str, status: int = 422) -> SheetError:
    return SheetError(code, en, ar, status)


NOT_A_SHEET = (
    "not_a_spreadsheet",
    "This file could not be read as an Excel (.xlsx) file. Save it again as .xlsx or as CSV "
    "and try again.",
    "تعذّرت قراءة هذا الملف كملف إكسل (.xlsx). احفظه مجدداً بصيغة .xlsx أو CSV وحاول مرة أخرى.",
)
TOO_BIG = (
    "file_unpacks_too_large",
    "This file is too large once opened, so it was not read. Split it into smaller files.",
    "هذا الملف كبير جداً بعد فتحه، لذلك لم يُقرأ. قسّمه إلى ملفات أصغر.",
)


@dataclass
class Sheet:
    """What was read: `rows[i]` is the i-th row of the sheet (index 0 is row `first_row`);
    each cell is None, a str, a bool, a Decimal, or a date/datetime. `formulas` holds the
    (row index, column index) of cells that were formulas, whose saved value was read."""

    rows: list[list[object]] = field(default_factory=list)
    first_row: int = 1
    formulas: set[tuple[int, int]] = field(default_factory=set)
    name: str = ""
    truncated: bool = False


# ── names and numbers in the XML ──────────────────────────

def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _column_index(ref: str) -> int:
    letters = re.match(r"[A-Za-z]+", ref)
    if not letters:
        raise ValueError(ref)
    n = 0
    for ch in letters.group().upper():
        n = n * 26 + ord(ch) - 64
    return n - 1


def _row_number(ref: str) -> int:
    digits = re.search(r"\d+", ref)
    if not digits:
        raise ValueError(ref)
    return int(digits.group())


_BUILTIN_DATE_IDS = set(range(14, 23)) | set(range(27, 37)) | set(range(45, 48)) | set(
    range(50, 59)
)
_DATE_CODE = re.compile(r"[dmyhs]", re.IGNORECASE)


def _is_date_format(code: str) -> bool:
    """Whether a custom number format shows a date or time (letters outside quotes and
    brackets, which hold literal text and colours)."""
    stripped = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.|_.|\*.', "", code)
    return bool(_DATE_CODE.search(stripped))


def _excel_date(serial: Decimal, epoch_1904: bool) -> date | datetime | None:
    """A date serial as a date (or a datetime when it has a time of day)."""
    try:
        if serial < 0 or serial > Decimal("2958465"):  # 9999-12-31
            return None
        if epoch_1904:
            base = datetime(1904, 1, 1)
        else:
            # Excel's day 60 is a day that never existed (1900-02-29); days after it count
            # from 1899-12-30.
            base = datetime(1899, 12, 30) if serial >= 61 else datetime(1899, 12, 31)
        days = int(serial)
        moment = base + timedelta(days=days, seconds=round(float(serial - days) * 86400))
    except (OverflowError, ValueError, InvalidOperation):
        return None
    return moment.date() if moment.time() == datetime.min.time() else moment


# ── reading ───────────────────────────────────────────────

def _read_part(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    """One part's bytes, never more than the limit allows, whatever the header claims."""
    with archive.open(info) as part:
        data = part.read(MAX_PART_BYTES + 1)
    if len(data) > MAX_PART_BYTES:
        raise _bad(*TOO_BIG)
    return data


def _xml(data: bytes) -> ElementTree.Element:
    """Parse a part. A document type or entity declaration has no place in a spreadsheet
    and is how entity-expansion attacks are made, so any is refused before parsing."""
    head = data[:4096].lower()
    if b"<!doctype" in head or b"<!entity" in data[:65536].lower():
        raise _bad(*NOT_A_SHEET)
    try:
        return ElementTree.fromstring(data)
    except (ElementTree.ParseError, ValueError) as error:
        raise _bad(*NOT_A_SHEET) from error


def _si_text(si: ElementTree.Element) -> str:
    """The text of a shared string or an inline string: its own <t>, or the <t> of each rich
    run <r>. Phonetic guides (<rPh>) are annotations and are left out."""
    parts = []
    for child in si:
        name = _local(child.tag)
        if name == "t":
            parts.append(child.text or "")
        elif name == "r":
            parts.extend(t.text or "" for t in child if _local(t.tag) == "t")
    return "".join(parts)[:MAX_CELL_CHARS]


def _shared_strings(root: ElementTree.Element) -> list[str]:
    return [_si_text(si) for si in root if _local(si.tag) == "si"]


def _date_styles(root: ElementTree.Element) -> list[bool]:
    """For each cell style (xf), whether it formats a date."""
    custom: dict[int, str] = {}
    xfs: list[bool] = []
    for node in root.iter():
        name = _local(node.tag)
        if name == "numFmt":
            try:
                custom[int(node.get("numFmtId", ""))] = node.get("formatCode", "")
            except ValueError:
                continue
    for cell_xfs in root:
        if _local(cell_xfs.tag) != "cellXfs":
            continue
        for xf in cell_xfs:
            try:
                fmt = int(xf.get("numFmtId", "0"))
            except ValueError:
                fmt = 0
            xfs.append(fmt in _BUILTIN_DATE_IDS or (fmt in custom and _is_date_format(custom[fmt])))
    return xfs


def _first_sheet(
    archive: zipfile.ZipFile, names: dict[str, zipfile.ZipInfo]
) -> tuple[str, str, bool]:
    """The part name and title of the first visible worksheet, and whether the workbook
    counts dates from 1904."""
    workbook = _xml(_read_part(archive, names["xl/workbook.xml"]))
    epoch_1904 = False
    sheets: list[tuple[str, str, bool]] = []
    for node in workbook.iter():
        name = _local(node.tag)
        if name == "workbookPr":
            epoch_1904 = node.get("date1904", "0") in ("1", "true")
        elif name == "sheet":
            rid = next((v for k, v in node.attrib.items() if _local(k) == "id"), "")
            sheets.append((node.get("name", ""), rid, node.get("state", "visible") == "visible"))
    targets: dict[str, str] = {}
    rels = names.get("xl/_rels/workbook.xml.rels")
    if rels is not None:
        for node in _xml(_read_part(archive, rels)):
            targets[node.get("Id", "")] = node.get("Target", "")
    for title, rid, visible in sheets:
        if not visible:
            continue
        target = targets.get(rid)
        if not target:
            continue
        path = target.lstrip("/") if target.startswith("/") else f"xl/{target}"
        path = re.sub(r"(^|/)\./", r"\1", path)
        if path in names:
            return path, title, epoch_1904
    # A file with no usable workbook map: the conventional first sheet.
    if "xl/worksheets/sheet1.xml" in names:
        return "xl/worksheets/sheet1.xml", "", epoch_1904
    raise _bad(*NOT_A_SHEET)


def read(data: bytes) -> Sheet:
    """The first visible sheet of an .xlsx file. Raises `SheetError`, whatever is wrong with the
    file: a damaged part, a bad checksum and a stream that does not unpack all come out as
    "could not be read", never as an error of ours."""
    try:
        return _read(data)
    except SheetError:
        raise
    except (
        zipfile.BadZipFile, zlib.error, NotImplementedError, RuntimeError, OSError, EOFError,
        ValueError, KeyError, RecursionError,
    ) as error:
        raise _bad(*NOT_A_SHEET) from error


def _read(data: bytes) -> Sheet:
    if data[:8] == OLE_MAGIC:
        raise _bad(
            "xls_not_supported",
            "This is an old Excel (.xls) file, which ALYR does not read. In Excel choose Save As "
            "and pick “Excel Workbook (.xlsx)” or “CSV UTF-8”.",
            "هذا ملف إكسل قديم (.xls) لا يقرؤه ALYR. في إكسل اختر «حفظ باسم» ثم «مصنف Excel "
            "(.xlsx)» أو «CSV UTF-8».",
        )
    if data[:4] != ZIP_MAGIC:
        raise _bad(*NOT_A_SHEET)
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise _bad(*NOT_A_SHEET) from error
    with archive:
        infos = archive.infolist()
        if len(infos) > MAX_PARTS:
            raise _bad(*NOT_A_SHEET)
        total = 0
        for info in infos:
            total += info.file_size
            if info.file_size > MAX_PART_BYTES or total > MAX_TOTAL_BYTES:
                raise _bad(*TOO_BIG)
            if (
                info.file_size > MAX_RATIO_FREE
                and info.file_size > MAX_RATIO * max(info.compress_size, 1)
            ):
                raise _bad(*TOO_BIG)
            if info.flag_bits & 0x1:  # a password-protected file
                raise _bad(
                    "file_protected",
                    "This file is protected with a password. Remove the password and try again.",
                    "هذا الملف محمي بكلمة مرور. أزلها وحاول مرة أخرى.",
                )
        names = {i.filename: i for i in infos}
        lowered = {n.lower() for n in names}
        if "xl/workbook.xml" not in names:
            raise _bad(*NOT_A_SHEET)
        macros = any(n.startswith("xl/vbaproject") for n in lowered)
        if "[Content_Types].xml" in names:
            macros = macros or b"macroenabled" in _read_part(
                archive, names["[Content_Types].xml"]
            ).lower()
        if macros:
            raise _bad(
                "macros_not_supported",
                "This file can contain macros (.xlsm), which ALYR does not accept. Save a copy "
                "as a normal Excel Workbook (.xlsx) and upload that.",
                "قد يحتوي هذا الملف على وحدات ماكرو (.xlsm) ولا يقبلها ALYR. احفظ نسخة كمصنف "
                "إكسل عادي (.xlsx) وارفعها.",
            )
        sheet_part, title, epoch_1904 = _first_sheet(archive, names)
        strings: list[str] = []
        if "xl/sharedStrings.xml" in names:
            strings = _shared_strings(_xml(_read_part(archive, names["xl/sharedStrings.xml"])))
        date_style: list[bool] = []
        if "xl/styles.xml" in names:
            date_style = _date_styles(_xml(_read_part(archive, names["xl/styles.xml"])))
        return _read_sheet(
            _read_part(archive, names[sheet_part]), title, strings, date_style, epoch_1904
        )


def _read_sheet(
    data: bytes, title: str, strings: list[str], date_style: list[bool], epoch_1904: bool
) -> Sheet:
    head = data[:4096].lower()
    if b"<!doctype" in head or b"<!entity" in data[:65536].lower():
        raise _bad(*NOT_A_SHEET)
    sheet = Sheet(name=title)
    by_row: dict[int, dict[int, object]] = {}
    formulas: set[tuple[int, int]] = set()
    try:
        events = ElementTree.iterparse(io.BytesIO(data), events=("end",))
        for _event, node in events:
            if _local(node.tag) != "row":
                continue
            try:
                number = int(node.get("r") or 0) or None
            except ValueError:
                number = None
            cells: dict[int, object] = {}
            next_col = 0
            for cell in node:
                if _local(cell.tag) != "c":
                    continue
                ref = cell.get("r")
                try:
                    col = _column_index(ref) if ref else next_col
                    if number is None and ref:
                        number = _row_number(ref)
                except ValueError:
                    col = next_col
                next_col = col + 1
                if col >= MAX_COLUMNS:
                    continue
                value, is_formula = _cell_value(cell, strings, date_style, epoch_1904)
                if is_formula:
                    formulas.add((number or 0, col))
                if value is not None:
                    cells[col] = value
            if number is None:
                number = (max(by_row) + 1) if by_row else 1
            if number > MAX_ROWS:
                sheet.truncated = True
                node.clear()
                break
            by_row[number] = cells
            node.clear()
    except ElementTree.ParseError as error:
        raise _bad(*NOT_A_SHEET) from error
    if not by_row:
        return sheet
    first, last = min(by_row), max(by_row)
    sheet.first_row = first
    width = max((max(c) for c in by_row.values() if c), default=-1) + 1
    for n in range(first, last + 1):
        cells = by_row.get(n, {})
        sheet.rows.append([cells.get(c) for c in range(width)])
    sheet.formulas = {(r - first, c) for r, c in formulas if r in by_row}
    return sheet


def _cell_value(
    cell: ElementTree.Element, strings: list[str], date_style: list[bool], epoch_1904: bool
) -> tuple[object, bool]:
    """(value, was a formula). The value is what the file saved, never a calculation."""
    kind = cell.get("t", "n")
    is_formula = False
    raw = None
    inline = None
    for child in cell:
        name = _local(child.tag)
        if name == "f":
            is_formula = True
        elif name == "v":
            raw = child.text
        elif name == "is":
            inline = _si_text(child)
    if kind == "inlineStr":
        return (inline or None), is_formula
    if raw is None or raw == "":
        return None, is_formula
    if kind == "s":
        try:
            return (strings[int(raw)] or None), is_formula
        except (ValueError, IndexError):
            return None, is_formula
    if kind in ("str", "d"):
        return raw[:MAX_CELL_CHARS], is_formula
    if kind == "b":
        return raw.strip() in ("1", "true"), is_formula
    if kind == "e":
        return None, is_formula  # #N/A, #REF! and the like are not values
    if len(raw) > 64:  # no number a shop writes is this long; it is text, or an attack
        return raw[:64], is_formula
    try:
        number = Decimal(raw)
    except InvalidOperation:
        return raw[:MAX_CELL_CHARS], is_formula
    if not number.is_finite():
        return None, is_formula
    if number and not -40 <= number.adjusted() <= 40:
        return raw[:64], is_formula  # 1E+999999999 would be a text of a billion digits
    style = cell.get("s")
    if style is not None and style.isdigit() and int(style) < len(date_style) and date_style[
        int(style)
    ]:
        as_date = _excel_date(number, epoch_1904)
        if as_date is not None:
            return as_date, is_formula
    return number, is_formula


# ── writing ───────────────────────────────────────────────

# Cell styles, by index into cellXfs below.
DEFAULT, HEADER, MONEY, WHOLE, NOTE, EX_TEXT, EX_MONEY, EX_WHOLE = range(8)


@dataclass
class Column:
    width: int = 18
    # An optional list of the values the cell may hold (a drop-down in Excel).
    choices: tuple[str, ...] = ()


@dataclass
class SheetSpec:
    name: str
    rows: list[list[object]]
    columns: list[Column] = field(default_factory=list)
    header: bool = True
    right_to_left: bool = False
    # One style per column (DEFAULT, MONEY, WHOLE or NOTE); the header row has its own.
    column_styles: list[int] = field(default_factory=list)
    example_rows: set[int] = field(default_factory=set)


# Control characters (except tab and line breaks) and U+FFFE and U+FFFF are not allowed in XML.
_ILLEGAL_CODES = (*range(0x00, 0x09), 0x0B, 0x0C, *range(0x0E, 0x20), 0xFFFE, 0xFFFF)
_ILLEGAL = re.compile("[" + "".join(chr(c) for c in _ILLEGAL_CODES) + "]")


def _clean(text: str) -> str:
    return _ILLEGAL.sub("", text)


def _ref(row: int, col: int) -> str:
    letters = ""
    n = col + 1
    while n:
        n, rest = divmod(n - 1, 26)
        letters = chr(65 + rest) + letters
    return f"{letters}{row + 1}"


def _cell_xml(row: int, col: int, value: object, style: int) -> str:
    ref = _ref(row, col)
    if value is None or value == "":
        return f'<c r="{ref}" s="{style}"/>' if style else ""
    if isinstance(value, bool):
        return f'<c r="{ref}" s="{style}" t="b"><v>{int(value)}</v></c>'
    if isinstance(value, float):
        value = Decimal(repr(value))
    if isinstance(value, int | Decimal):
        return f'<c r="{ref}" s="{style}"><v>{value}</v></c>'
    text = escape(_clean(str(value)))
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'


_STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<fonts count="3">'
    '<font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><name val="Calibri"/></font>'
    '<font><i/><sz val="11"/><color rgb="FF595959"/><name val="Calibri"/></font>'
    "</fonts>"
    '<fills count="4">'
    '<fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8E8E8"/><bgColor indexed="64"/>'
    "</patternFill></fill>"
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F4"/><bgColor indexed="64"/>'
    "</patternFill></fill>"
    "</fills>"
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom>'
    "<diagonal/></border></borders>"
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="8">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" '
    'applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">'
    '<alignment vertical="top" wrapText="1"/></xf>'
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
    '<xf numFmtId="2" fontId="2" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" '
    'applyFont="1" applyFill="1"/>'
    '<xf numFmtId="1" fontId="2" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" '
    'applyFont="1" applyFill="1"/>'
    "</cellXfs>"
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    "</styleSheet>"
)

_EXAMPLE_OF = {DEFAULT: EX_TEXT, MONEY: EX_MONEY, WHOLE: EX_WHOLE}


def _sheet_xml(spec: SheetSpec) -> str:
    rows_xml = []
    for r, row in enumerate(spec.rows):
        cells = []
        for c, value in enumerate(row):
            if r == 0 and spec.header:
                style = HEADER
            elif c < len(spec.column_styles):
                style = spec.column_styles[c]
            else:
                style = DEFAULT
            if r in spec.example_rows:
                style = _EXAMPLE_OF.get(style, EX_TEXT)
            cells.append(_cell_xml(r, c, value, style))
        height = ' ht="32" customHeight="1"' if r == 0 and spec.header else ""
        rows_xml.append(f'<row r="{r + 1}"{height}>{"".join(cells)}</row>')
    width = max((len(row) for row in spec.rows), default=1)
    cols = "".join(
        f'<col min="{i + 1}" max="{i + 1}" width="{col.width}" customWidth="1"/>'
        for i, col in enumerate(spec.columns[:width])
    )
    view = '<sheetView workbookViewId="0"' + (' rightToLeft="1"' if spec.right_to_left else "")
    if spec.header:
        view += (
            '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
            '<selection pane="bottomLeft"/></sheetView>'
        )
    else:
        view += "/>"
    validations = []
    for i, col in enumerate(spec.columns[:width]):
        if not col.choices or len(spec.rows) < 1:
            continue
        joined = ",".join(c.replace('"', "") for c in col.choices)
        if len(joined) > 250:
            continue
        last = max(len(spec.rows) + 1000, 1001)
        validations.append(
            f'<dataValidation type="list" allowBlank="1" showErrorMessage="0" '
            f'sqref="{_ref(1, i)}:{_ref(last, i)}"><formula1>"{escape(joined)}"</formula1>'
            "</dataValidation>"
        )
    parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        f"<dimension ref=\"A1:{_ref(max(len(spec.rows) - 1, 0), max(width - 1, 0))}\"/>",
        f"<sheetViews>{view}</sheetViews>",
        '<sheetFormatPr defaultRowHeight="15"/>',
    ]
    if cols:
        parts.append(f"<cols>{cols}</cols>")
    parts.append(f"<sheetData>{''.join(rows_xml)}</sheetData>")
    if validations:
        parts.append(f'<dataValidations count="{len(validations)}">{"".join(validations)}'
                     "</dataValidations>")
    parts.append('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" '
                 'footer="0.3"/></worksheet>')
    return "".join(parts)


def _title(name: str) -> str:
    return re.sub(r"[\\/*?:\[\]]", " ", name).strip()[:31] or "Sheet"


def write(sheets: list[SheetSpec]) -> bytes:
    """An .xlsx file with these sheets. Text is written as text (never as a formula),
    numbers as numbers; the first row of a sheet with `header` is a bold frozen header."""
    out = io.BytesIO()
    titles = [_title(s.name) for s in sheets]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        def put(name: str, body: str) -> None:
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))  # same bytes every time
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, body.encode("utf-8"))

        overrides = "".join(
            f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/'
            'vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for i in range(len(sheets))
        )
        put(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.'
            'relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.'
            'openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.'
            'openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            f"{overrides}</Types>",
        )
        put(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/'
            '2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        )
        sheet_tags = "".join(
            f'<sheet name="{escape(title, {chr(34): "&quot;"})}" sheetId="{i + 1}" '
            f'r:id="rId{i + 1}"/>'
            for i, title in enumerate(titles)
        )
        put(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f"<sheets>{sheet_tags}</sheets></workbook>",
        )
        rels = "".join(
            f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/'
            f'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i + 1}.xml"/>'
            for i in range(len(sheets))
        )
        put(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'{rels}<Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.'
            'org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        )
        put("xl/styles.xml", _STYLES)
        for i, spec in enumerate(sheets):
            put(f"xl/worksheets/sheet{i + 1}.xml", _sheet_xml(spec))
    return out.getvalue()
