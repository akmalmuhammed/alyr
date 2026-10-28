"""Spreadsheet files in and out of the Catalog: CSV and Excel (.xlsx) (D-039, ALY-108).

`read_table` takes the bytes an owner uploaded and the name they gave it and returns a
`xlsx.Sheet` (rows of cells), whichever kind it was. The kind is decided by the content,
not the name: an .xlsx is a zip, the old .xls is something else, and anything else is
read as text. CSV from Excel on an Arabic Windows is often not UTF-8, and in many countries
uses a semicolon, so both are handled. Nothing is evaluated: a CSV cell that starts with =
is text.

`write_csv` writes what Excel opens correctly: UTF-8 with a byte-order mark.
"""

import csv
import io
from decimal import Decimal

from alyr.modules.items import xlsx
from alyr.modules.items.xlsx import SheetError

CSV_ROWS = xlsx.MAX_ROWS


def kind_of(data: bytes, filename: str) -> str:
    """"xlsx" or "csv". Raises `SheetError` for files that are neither (the old .xls, a
    macro workbook by its name, a PDF, a photo)."""
    name = filename.lower().strip()
    if name.endswith(".xlsm") or name.endswith(".xlsb"):
        raise SheetError(
            "macros_not_supported",
            "ALYR does not accept Excel files with macros or in the binary format. Save a copy "
            "as a normal Excel Workbook (.xlsx) or as CSV and upload that.",
            "لا يقبل ALYR ملفات إكسل التي تحتوي على ماكرو أو بالصيغة الثنائية. احفظ نسخة كمصنف "
            "إكسل عادي (.xlsx) أو بصيغة CSV وارفعها.",
        )
    if data[:8] == xlsx.OLE_MAGIC or name.endswith(".xls"):
        raise SheetError(
            "xls_not_supported",
            "This is an old Excel (.xls) file, which ALYR does not read. In Excel choose Save As "
            "and pick “Excel Workbook (.xlsx)” or “CSV UTF-8”.",
            "هذا ملف إكسل قديم (.xls) لا يقرؤه ALYR. في إكسل اختر «حفظ باسم» ثم «مصنف Excel "
            "(.xlsx)» أو «CSV UTF-8».",
        )
    if data[:4] == xlsx.ZIP_MAGIC:
        return "xlsx"
    head = data[:4096]
    if b"\x00" in head and not _looks_utf16(data):
        raise SheetError(
            "not_a_spreadsheet",
            "This does not look like a spreadsheet. Upload an Excel (.xlsx) or CSV file.",
            "لا يبدو هذا الملف جدول بيانات. ارفع ملف إكسل (.xlsx) أو CSV.",
        )
    return "csv"


def _looks_utf16(data: bytes) -> bool:
    return data[:2] in (b"\xff\xfe", b"\xfe\xff")


def decode(data: bytes) -> str:
    """The text of a CSV file. UTF-8 (with or without the mark) first; UTF-16, which Excel's
    "Unicode text" makes; then the Arabic Windows code page, which an Arabic Excel's plain
    "CSV" uses; then Western Windows."""
    if data[:3] == b"\xef\xbb\xbf":
        return data[3:].decode("utf-8", errors="replace")
    if _looks_utf16(data):
        return data.decode("utf-16", errors="replace")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        pass
    for codec in ("cp1256", "cp1252"):
        try:
            return data.decode(codec)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _delimiter(text: str) -> str:
    """Comma, semicolon or tab: whichever the first lines use most (outside quotes)."""
    best, best_n = ",", 0
    sample = text[:8192]
    lines = [ln for ln in sample.splitlines() if ln.strip() and not ln.lower().startswith("sep=")]
    for candidate in (",", ";", "\t"):
        n = sum(_unquoted_count(ln, candidate) for ln in lines[:5])
        if n > best_n:
            best, best_n = candidate, n
    return best


def _unquoted_count(line: str, char: str) -> int:
    n, inside = 0, False
    for c in line:
        if c == '"':
            inside = not inside
        elif c == char and not inside:
            n += 1
    return n


def read_csv(data: bytes) -> xlsx.Sheet:
    text = decode(data)
    if text.lower().startswith("sep="):  # Excel's own hint on the first line
        text = text.split("\n", 1)[1] if "\n" in text else ""
    sheet = xlsx.Sheet()
    try:
        reader = csv.reader(io.StringIO(text, newline=""), delimiter=_delimiter(text))
        for number, record in enumerate(reader):
            if number >= CSV_ROWS:
                sheet.truncated = True
                break
            row = [
                (cell.strip()[: xlsx.MAX_CELL_CHARS] or None)
                for cell in record[: xlsx.MAX_COLUMNS]
            ]
            sheet.rows.append(row)
    except csv.Error as error:
        raise SheetError(
            "not_a_spreadsheet",
            "This file could not be read as CSV. Save it again from Excel as “CSV UTF-8”.",
            "تعذّرت قراءة هذا الملف كـ CSV. احفظه مجدداً من إكسل بصيغة «CSV UTF-8».",
        ) from error
    return sheet


def read_table(data: bytes, filename: str) -> tuple[str, xlsx.Sheet]:
    """(kind, sheet) for an uploaded file. Raises `SheetError`."""
    if not data:
        raise SheetError("empty_file", "The file is empty.", "الملف فارغ.")
    kind = kind_of(data, filename)
    return kind, (xlsx.read(data) if kind == "xlsx" else read_csv(data))


def _csv_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def write_csv(rows: list[list[object]]) -> bytes:
    """UTF-8 with a byte-order mark (so Excel reads Arabic correctly), comma separated."""
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\r\n")
    for row in rows:
        writer.writerow([_csv_cell(c) for c in row])
    return b"\xef\xbb\xbf" + out.getvalue().encode("utf-8")
