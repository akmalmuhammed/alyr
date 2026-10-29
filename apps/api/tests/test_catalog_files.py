"""The files behind the Catalog's import and export (ALY-108): reading what people type in a
cell, reading and writing CSV and Excel with the standard library only, and refusing files that
are too big, damaged, macro-enabled or old. No database: these are the pure parts. The whole
flow through the API is in test_catalog_import.py."""

import io
import json
import time
import zipfile
from datetime import date, datetime
from decimal import Decimal

import pytest

from alyr.modules.items import columns, exports, import_photos, sheets, values, xlsx
from alyr.modules.items.values import CellError
from alyr.modules.items.xlsx import SheetError


def fails(call, code: str):
    with pytest.raises(CellError) as raised:
        call()
    assert raised.value.code == code
    return raised.value


# ── money ────────────────────────────────────────────────

@pytest.mark.parametrize("cell, dirhams", [
    ("12", 1200), ("12.5", 1250), ("12.50", 1250), (" QAR 12.50 ", 1250), ("QR 12", 1200),
    ("1,250.50", 125050), ("QAR 1,250.50", 125050), ("1 250", 125000), ("١٢٫٥٠", 1250),
    ("١٬٢٥٠", 125000), ("١٢", 1200), ("۱۲٫۵", 1250), ("12 ريال", 1200), ("ر.ق 12", 1200),
    ("12,5", 1250), ("1.000.000", 100000000), (".5", 50), ("0", 0),
    (Decimal("12.5"), 1250), (Decimal("12.499999999999998"), 1250), (Decimal("7"), 700),
])
def test_prices_are_read_in_either_language_with_thousands_separators(cell, dirhams):
    assert values.parse_money(cell) == dirhams


def test_a_price_that_could_mean_two_things_is_refused_not_guessed():
    # 1.250 is one riyal and 25 dirhams in one file and a thousand and more in another.
    fails(lambda: values.parse_money("1.250"), "ambiguous_number")
    fails(lambda: values.parse_money("12.345"), "ambiguous_number")
    fails(lambda: values.parse_money("12.3456"), "money_decimals")
    fails(lambda: values.parse_money("abc"), "bad_money")
    fails(lambda: values.parse_money("12 QAR 5"), "bad_money")
    fails(lambda: values.parse_money(True), "bad_money")
    fails(lambda: values.parse_money(date(2026, 1, 1)), "bad_money")
    fails(lambda: values.parse_money("-5"), "negative_money")
    fails(lambda: values.parse_money("2000000"), "money_too_big")
    assert values.parse_money("-5", signed=True) == -500
    assert values.parse_money("−2.5", signed=True) == -250  # a typographic minus


@pytest.mark.parametrize("cell, number", [
    ("12", 12), ("1,000", 1000), ("١٢", 12), ("۱۲", 12), ("12.0", 12), (Decimal("7"), 7),
    ("0", 0),
])
def test_whole_numbers_are_read_in_either_language(cell, number):
    assert values.parse_int(cell, 0, 10_000) == number


def test_whole_numbers_must_be_whole_and_in_range():
    fails(lambda: values.parse_int("12.5", 0, 100), "not_whole")
    fails(lambda: values.parse_int("abc", 0, 100), "bad_number")
    fails(lambda: values.parse_int("-1", 0, 100), "out_of_range")
    fails(lambda: values.parse_int("101", 0, 100), "out_of_range")


def test_yes_and_no_in_both_languages():
    for yes in ("yes", "Yes", "Y", "TRUE", "1", "نعم", True):
        assert values.parse_bool(yes) is True
    for no in ("no", "No", "n", "false", "0", "لا", False):
        assert values.parse_bool(no) is False
    fails(lambda: values.parse_bool("maybe"), "bad_yes_no")


def test_dates_day_first_or_iso_with_either_digits():
    assert values.parse_date("2026-10-31") == date(2026, 10, 31)
    assert values.parse_date("31/10/2026") == date(2026, 10, 31)
    assert values.parse_date("٣١/١٠/٢٠٢٦") == date(2026, 10, 31)
    assert values.parse_date(date(2026, 10, 31)) == date(2026, 10, 31)
    fails(lambda: values.parse_date("10/31/2026"), "bad_date")  # not day first
    fails(lambda: values.parse_date("soon"), "bad_date")
    fails(lambda: values.parse_date("2026-02-30"), "bad_date")


def test_text_loses_invisible_marks_and_the_apostrophe_an_export_added():
    marks = chr(0x200F), chr(0xFEFF)  # a right-to-left mark and a byte-order mark
    assert values.clean(f"  Shawarma{marks[0]}   wrap{marks[1]} ") == "Shawarma wrap"
    assert values.clean("'=SUM(A1)") == "=SUM(A1)"
    assert values.clean("'-5 off") == "-5 off"
    assert values.clean("'quoted") == "'quoted"  # an apostrophe that guards nothing stays
    assert values.clean(Decimal("7")) == "7"
    assert values.clean(Decimal("7.50")) == "7.5"
    assert values.clean("one\r\ntwo  lines", multiline=True) == "one\ntwo lines"


# ── words and headers ────────────────────────────────────

def test_every_header_in_both_languages_is_understood_and_none_is_ambiguous():
    seen: dict[str, str] = {}
    for column in columns.COLUMNS:
        for spelling in (column.en, column.ar, *column.aliases):
            key = values.squash(spelling)
            assert seen.setdefault(key, column.key) == column.key, (spelling, column.key)
        assert columns.column_for(column.en) == column.key
        assert columns.column_for(column.ar) == column.key
    assert columns.column_for("PRICE (qar)") == "price"
    assert columns.column_for("اسم الصنف") == "name"
    assert columns.column_for("Colour") == "variant"
    assert columns.column_for("something else") is None


def test_words_in_cells_are_understood_in_both_languages():
    assert columns.parse_word_cell("unit", "Kilo", "x") == "kg"
    assert columns.parse_word_cell("unit", "كيلو", "x") == "kg"
    assert columns.parse_word_cell("status", "On sale", "x") == "live"
    assert columns.parse_word_cell("status", "معروض للبيع", "x") == "live"
    assert columns.parse_word_cell("status", "مسوده", "x") == "draft"
    assert columns.parse_word_cell("rule", "Counted in stock", "x") == "count"
    assert columns.parse_word_cell("rule", "محسوب في المخزون", "x") == "count"
    assert columns.parse_word_cell("rule", "عدد في اليوم", "x") == "daily_limit"
    fails(lambda: columns.parse_word_cell("unit", "furlong", "bad"), "bad")
    for group in columns.WORDS:
        for key in columns.WORDS[group]:
            for lang in ("en", "ar"):
                word = columns.word_for(group, key, lang)
                assert columns.parse_word_cell(group, word, "x") == key


# ── CSV ──────────────────────────────────────────────────

ROW = ["اسم", "Price", "n"]


def test_csv_in_utf8_with_or_without_the_mark():
    text = "Name,Price\r\nشاورما,12.5\r\n"
    for data in (text.encode("utf-8"), b"\xef\xbb\xbf" + text.encode("utf-8")):
        kind, sheet = sheets.read_table(data, "items.csv")
        assert kind == "csv"
        assert sheet.rows == [["Name", "Price"], ["شاورما", "12.5"]]


def test_csv_from_an_arabic_windows_excel_is_read_in_its_code_page():
    data = "Name;Price\r\nشاورما;12,5\r\n".encode("cp1256")
    _kind, sheet = sheets.read_table(data, "items.csv")
    assert sheet.rows == [["Name", "Price"], ["شاورما", "12,5"]]  # a semicolon file, too


def test_csv_in_utf16_text_with_tabs_and_excels_separator_hint():
    data = "Name\tPrice\r\nTea\t3\r\n".encode("utf-16")
    assert sheets.read_table(data, "x.txt")[1].rows == [["Name", "Price"], ["Tea", "3"]]
    hinted = b"sep=;\r\nName;Price\r\nTea;3\r\n"
    assert sheets.read_table(hinted, "x.csv")[1].rows == [["Name", "Price"], ["Tea", "3"]]


def test_csv_with_quotes_commas_and_line_breaks_in_a_cell():
    data = b'Name,Description\r\n"Tea, hot","line one\r\nline two"\r\n'
    rows = sheets.read_table(data, "x.csv")[1].rows
    assert rows[1] == ["Tea, hot", "line one\r\nline two"]


def test_a_csv_cell_that_starts_with_equals_is_just_text():
    data = b"Name,Price\r\n=HYPERLINK(\"http://example.test\"),5\r\n"
    assert sheets.read_table(data, "x.csv")[1].rows[1][0] == '=HYPERLINK("http://example.test")'


def test_csv_written_for_excel_has_the_mark_and_survives_a_round_trip():
    rows = [["Name", "Price"], ["شاورما", Decimal("12.50")], ["Tea, hot", None], [True, 3]]
    data = sheets.write_csv(rows)
    assert data.startswith(b"\xef\xbb\xbf")
    back = sheets.read_table(data, "x.csv")[1].rows
    assert back == [["Name", "Price"], ["شاورما", "12.50"], ["Tea, hot", None], ["yes", "3"]]


def test_files_that_are_not_spreadsheets_are_refused_with_a_plain_message():
    for data, name, code in (
        (b"", "x.csv", "empty_file"),
        (bytes.fromhex("D0CF11E0A1B11AE1") + b"\x00" * 100, "old.xls", "xls_not_supported"),
        (b"a,b", "old.xls", "xls_not_supported"),
        (b"a,b", "macro.xlsm", "macros_not_supported"),
        (b"%PDF-1.7\x00\x00\x00", "list.pdf", "not_a_spreadsheet"),
        (b"\x89PNG\r\n\x1a\n\x00\x00", "photo.png", "not_a_spreadsheet"),
        (b"\x00\x01\x02\x03" * 20, "x.xlsx", "not_a_spreadsheet"),
    ):
        with pytest.raises(SheetError) as raised:
            sheets.read_table(data, name)
        assert raised.value.code == code, name
        assert raised.value.en and raised.value.ar


# ── Excel: writing and reading ───────────────────────────

def test_an_xlsx_we_write_is_read_back_exactly():
    rows = [
        ["Name", "Price", "Stock", "Note"],
        ["شاورما دجاج", Decimal("14.00"), 12, "a < b & \"c\""],
        ["Tea", Decimal("3.50"), None, "line one\nline two"],
        ["'=1+1", Decimal("-2"), 0, "   padded   "],
    ]
    data = xlsx.write([xlsx.SheetSpec(
        "Items", rows, [xlsx.Column(20)] * 4,
        column_styles=[xlsx.DEFAULT, xlsx.MONEY, xlsx.WHOLE, xlsx.DEFAULT],
    )])
    sheet = xlsx.read(data)
    assert sheet.rows[0] == rows[0]
    assert sheet.rows[1] == ["شاورما دجاج", Decimal("14.00"), Decimal("12"), 'a < b & "c"']
    assert sheet.rows[2] == ["Tea", Decimal("3.50"), None, "line one\nline two"]
    assert sheet.rows[3] == ["'=1+1", Decimal("-2"), Decimal("0"), "   padded   "]
    assert sheet.formulas == set()
    assert sheet.name == "Items"


def test_an_xlsx_is_made_the_same_way_every_time():
    spec = [xlsx.SheetSpec("Items", [["a", 1], ["b", 2]])]
    assert xlsx.write(spec) == xlsx.write(spec)


def test_text_that_looks_like_a_formula_is_written_as_text_never_as_a_formula():
    data = xlsx.write([xlsx.SheetSpec("S", [["h"], ["=1+1"], ["@SUM(A1)"]], header=True)])
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        sheet_xml = z.read("xl/worksheets/sheet1.xml").decode()
    assert "<f>" not in sheet_xml and "<f " not in sheet_xml
    assert 't="inlineStr"' in sheet_xml


def zip_of(parts: dict[str, str | bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, body in parts.items():
            z.writestr(name, body)
    return out.getvalue()


NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
REL_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


def workbook(extra: str = "", sheets_xml: str | None = None) -> dict[str, str]:
    return {
        "[Content_Types].xml": "<Types/>",
        "xl/workbook.xml": (
            f'<workbook {NS} {REL_NS}>{extra}<sheets>'
            + (sheets_xml or '<sheet name="Hidden" sheetId="1" state="hidden" r:id="rId1"/>'
               '<sheet name="Real" sheetId="2" r:id="rId2"/>')
            + "</sheets></workbook>"
        ),
        "xl/_rels/workbook.xml.rels": (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>'
        ),
    }


def test_an_xlsx_saved_by_excel_is_read_including_the_things_excel_does():
    parts = workbook(extra='<workbookPr date1904="0"/>')
    parts["xl/sharedStrings.xml"] = (
        f"<sst {NS}><si><t>Name</t></si>"
        "<si><r><t>Rich </t></r><r><rPr><b/></rPr><t>text</t></r><rPh><t>ignored</t></rPh></si>"
        "<si><t>Price</t></si></sst>"
    )
    parts["xl/styles.xml"] = (
        f'<styleSheet {NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="d\\ mmm\\ yyyy"/>'
        '</numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/>'
        "</cellXfs></styleSheet>"
    )
    parts["xl/worksheets/sheet1.xml"] = f"<worksheet {NS}><sheetData/></worksheet>"
    parts["xl/worksheets/sheet2.xml"] = (
        f"<worksheet {NS}><sheetData>"
        '<row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2" t="s"><v>2</v></c></row>'
        '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" s="1"><v>46326</v></c>'
        '<c r="C3"><v>12.499999999999998</v></c><c r="D3" t="b"><v>1</v></c></row>'
        '<row r="5"><c r="A5" t="inlineStr"><is><t>Inline</t></is></c>'
        '<c r="B5" s="2"><v>46327</v></c>'
        '<c r="C5"><f>A1+B1</f><v>99</v></c><c r="D5" t="e"><v>#REF!</v></c>'
        '<c r="E5"><f>1+1</f></c></row>'
        "</sheetData></worksheet>"
    )
    sheet = xlsx.read(zip_of(parts))
    assert sheet.name == "Real"
    assert sheet.first_row == 2
    assert sheet.rows[0] == ["Name", None, "Price", None]
    assert sheet.rows[1] == ["Rich text", date(2026, 10, 31), Decimal("12.499999999999998"), True]
    assert sheet.rows[2] == [None, None, None, None]  # the empty row 4
    assert sheet.rows[3][:2] == ["Inline", date(2026, 11, 1)]
    # A formula gives the value the file saved, is flagged, and is never calculated.
    assert sheet.rows[3][2] == Decimal("99")
    assert sheet.rows[3][3] is None  # an error value is no value
    assert (3, 2) in sheet.formulas and (3, 4) in sheet.formulas


def test_the_1904_date_system_is_honoured():
    parts = workbook(extra='<workbookPr date1904="1"/>')
    parts["xl/styles.xml"] = (
        f'<styleSheet {NS}><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'
    )
    parts["xl/worksheets/sheet2.xml"] = (
        f'<worksheet {NS}><sheetData><row r="1"><c r="A1" s="1"><v>1</v></c></row></sheetData>'
        "</worksheet>"
    )
    parts["xl/worksheets/sheet1.xml"] = f"<worksheet {NS}><sheetData/></worksheet>"
    assert xlsx.read(zip_of(parts)).rows[0][0] == date(1904, 1, 2)


def minimal(sheet_xml: str, extra: dict | None = None) -> bytes:
    parts = workbook(sheets_xml='<sheet name="S" sheetId="1" r:id="rId2"/>')
    parts["xl/worksheets/sheet2.xml"] = sheet_xml
    parts.update(extra or {})
    return zip_of(parts)


def test_damaged_and_hostile_xlsx_files_are_refused_not_crashed_on():
    good = (f'<worksheet {NS}><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>'
            "</worksheet>")
    assert xlsx.read(minimal(good)).rows == [[Decimal("1")]]
    for label, data, code in (
        ("not xml", minimal("<worksheet><sheetData><row"), "not_a_spreadsheet"),
        ("entity bomb", minimal(
            '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa">]>'
            f'<worksheet {NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&a;&a;</t></is>'
            "</c></row></sheetData></worksheet>"), "not_a_spreadsheet"),
        ("no workbook", zip_of({"x.txt": "hello"}), "not_a_spreadsheet"),
        ("truncated zip", minimal(good)[:200], "not_a_spreadsheet"),
        ("macros", minimal(good, {"xl/vbaProject.bin": b"\x00"}), "macros_not_supported"),
        ("macro type", minimal(good, {
            "[Content_Types].xml": (
                '<Types><Override ContentType="application/vnd.ms-excel.sheet.'
                'macroEnabled.main+xml"/></Types>'
            )
        }), "macros_not_supported"),
    ):
        with pytest.raises(SheetError) as raised:
            xlsx.read(data)
        assert raised.value.code == code, label


def test_a_zip_bomb_is_refused_before_it_is_unpacked():
    zeros = b"0" * (40 * 1024 * 1024)  # 40 MB of the same byte: a few KB packed
    bomb = minimal(f'<worksheet {NS}><sheetData>' + "<row/>" * 10 + "</sheetData></worksheet>",
                   {"xl/worksheets/sheet3.xml": zeros})
    assert len(bomb) < 100_000
    with pytest.raises(SheetError) as raised:
        xlsx.read(bomb)
    assert raised.value.code == "file_unpacks_too_large"
    many = zip_of({f"p{n}.xml": "x" for n in range(xlsx.MAX_PARTS + 1)})
    with pytest.raises(SheetError):
        xlsx.read(many)


def test_a_password_protected_xlsx_package_is_refused():
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("xl/workbook.xml", "<workbook/>")
    raw = bytearray(out.getvalue())
    # Set the "encrypted" bit in the local and central directory headers.
    for marker in (b"PK\x03\x04", b"PK\x01\x02"):
        at = raw.find(marker)
        flag_at = at + (6 if marker == b"PK\x03\x04" else 8)
        raw[flag_at] |= 0x1
    with pytest.raises(SheetError) as raised:
        xlsx.read(bytes(raw))
    assert raised.value.code == "file_protected"


def test_rows_beyond_what_is_read_are_cut_off_and_said_so():
    rows = "".join(
        f'<row r="{n}"><c r="A{n}"><v>{n}</v></c></row>' for n in range(1, xlsx.MAX_ROWS + 50)
    )
    sheet = xlsx.read(minimal(f"<worksheet {NS}><sheetData>{rows}</sheetData></worksheet>"))
    assert sheet.truncated and len(sheet.rows) == xlsx.MAX_ROWS


# ── a file built to hold the reader (ALY-278) ────────────

def quickly(call, seconds: float = 1.0):
    started = time.perf_counter()
    result = call()
    assert time.perf_counter() - started < seconds
    return result


def test_a_cell_address_no_sheet_could_have_is_not_worked_out():
    # The letters of an address were read as a number however many there were.
    cells = "".join(
        f'<c r="{ref}"><v>{n}</v></c>'
        for n, ref in enumerate(("A" * 900_000 + "1", "ZZZZ1", "B12345678"), 7)
    )
    data = minimal(f'<worksheet {NS}><sheetData><row r="1">{cells}</row></sheetData></worksheet>')
    assert len(data) < 5_000
    sheet = quickly(lambda: xlsx.read(data))
    # none is an address a sheet can have, so each cell is placed after the one before it
    assert sheet.rows == [[Decimal("7"), Decimal("8"), Decimal("9")]]


def test_row_numbers_no_sheet_could_have_do_not_make_it_longer():
    # A row number out of range made the sheet as long as the gap.
    numbers = ("-2000000000", "0", "x", "99999999999", "1048577")
    rows = "".join(f'<row r="{r}"><c><v>{n}</v></c></row>' for n, r in enumerate(numbers, 1))
    sheet = quickly(lambda: xlsx.read(
        minimal(f"<worksheet {NS}><sheetData>{rows}</sheetData></worksheet>")
    ))
    assert sheet.first_row == 1 and [r[0] for r in sheet.rows] == [Decimal(n) for n in range(1, 6)]


def test_rows_without_numbers_are_read_in_one_pass():
    # Each row with no number looked through every row before it.
    rows = "<row><c><v>1</v></c></row>" * xlsx.MAX_ROWS
    data = minimal(f"<worksheet {NS}><sheetData>{rows}</sheetData></worksheet>")
    assert len(data) < 10_000
    sheet = quickly(lambda: xlsx.read(data))
    assert len(sheet.rows) == xlsx.MAX_ROWS and not sheet.truncated


ENTITIES = '<!DOCTYPE s [<!ENTITY a "aaaaaaaaaa">]>'
INLINE = (f'<worksheet {NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&a;&a;</t></is>'
          "</c></row></sheetData></worksheet>")


@pytest.mark.parametrize("label, part", [
    # A search of the bytes missed both of these: the parser says whether there is one.
    ("in UTF-16", ('<?xml version="1.0" encoding="UTF-16"?>' + ENTITIES + INLINE).encode(
        "utf-16")),
    ("after a long comment",
     '<?xml version="1.0"?><!--' + "x" * 70_000 + "-->" + ENTITIES + INLINE),
    ("with no entities", '<?xml version="1.0"?><!DOCTYPE s>' + INLINE.replace("&a;", "a")),
], ids=["utf-16", "after-a-long-comment", "no-entities"])
def test_a_document_type_is_refused_however_and_wherever_it_is_written(label, part):
    for where in ("xl/worksheets/sheet2.xml", "xl/sharedStrings.xml"):
        good = (f'<worksheet {NS}><sheetData><row r="1"><c r="A1"><v>1</v></c></row>'
                "</sheetData></worksheet>")
        data = minimal(part, {}) if where.endswith("sheet2.xml") else minimal(good, {where: part})
        with pytest.raises(SheetError) as raised:
            xlsx.read(data)
        assert raised.value.code == "not_a_spreadsheet", (label, where)


def test_a_zip_that_lists_more_than_a_spreadsheet_holds_is_refused_before_it_is_listed(
    monkeypatch,
):
    good = (f'<worksheet {NS}><sheetData><row r="1"><c r="A1"><v>1</v></c></row>'
            "</sheetData></worksheet>")
    plain = minimal(good)
    listed = plain.rfind(b"PK\x05\x06") - plain.find(b"PK\x01\x02")
    assert xlsx.zip_directory_bytes(plain) == listed
    crowded = minimal(good, {f"xl/media/{n:06d}-{'x' * 40}": b"" for n in range(25_000)})
    assert xlsx.zip_directory_bytes(crowded) > xlsx.MAX_DIRECTORY_BYTES

    def never(*_args, **_kwargs):
        raise AssertionError("the zip was listed")

    monkeypatch.setattr(xlsx.zipfile, "ZipFile", never)
    for read in (xlsx.read, lambda data: import_photos.index(data, 10**6)):
        with pytest.raises(SheetError):
            read(crowded)


def test_every_entry_of_a_photo_zip_counts_folders_and_a_macs_files_among_them():
    photo = b"\xff\xd8\xff" + b"0" * 100
    fine = zip_of({"photos/": b"", "photos/tea.jpg": photo, "__MACOSX/photos/._tea.jpg": b"x"})
    assert import_photos.index(fine, 10**6).entries == 1
    padded = zip_of({"tea.jpg": photo, **{
        f"__MACOSX/._{n}": b"" for n in range(3 * import_photos.MAX_ENTRIES)
    }})
    with pytest.raises(SheetError) as raised:
        import_photos.index(padded, 10**6)
    assert raised.value.code == "zip_too_many"


def test_what_was_read_is_kept_as_json_and_comes_back_the_same():
    sheet = xlsx.Sheet(
        rows=[
            ["Name", None, "Price", None],
            ["Tea", True, Decimal("12.50"), None],
            [None, None, None, None],
            ["Tea", date(2026, 1, 2), datetime(2026, 1, 2, 3, 4, 5), "=1+1"],
        ],
        first_row=3, formulas={(1, 2)}, name="Items", truncated=True,
    )
    kept = json.loads(json.dumps(xlsx.to_stored(sheet)))
    assert xlsx.from_stored(kept) == sheet
    # rows of different lengths (a CSV's) keep their lengths
    ragged = sheets.read_csv(b"a,b,c\nd\n,,\n")
    assert xlsx.from_stored(json.loads(json.dumps(xlsx.to_stored(ragged)))) == ragged
    # one long text in every cell is kept once
    long = "x" * xlsx.MAX_CELL_CHARS
    many = xlsx.Sheet(rows=[[long] * xlsx.MAX_COLUMNS for _ in range(1_000)])
    assert len(json.dumps(xlsx.to_stored(many))) < 2 * xlsx.MAX_CELL_CHARS + 300_000


# ── the files we hand out ────────────────────────────────

def test_export_neutralises_every_cell_a_spreadsheet_could_run():
    for text in ("=1+1", "+1", "-1", "@SUM(1)", "\t1", "\r1"):
        assert exports.safe_text(text) == "'" + text
    assert exports.safe_text("Shawarma") == "Shawarma"
    assert exports.safe_text("") == ""
    # ... and the import takes the apostrophe off again, so a name survives the round trip.
    for text in ("=1+1", "-1 off", "@home"):
        assert values.clean(exports.safe_text(text)) == text


# ── hostile numbers and damaged parts ────────────────────

def test_absurd_numbers_are_text_not_a_crash_or_a_billion_digits():
    cells = "".join(
        f'<c r="{"ABC"[n]}1"><v>{v}</v></c>'
        for n, v in enumerate(("1E+999999999", "1" + "0" * 80, "7"))
    )
    sheet = xlsx.read(minimal(
        f'<worksheet {NS}><sheetData><row r="1">{cells}</row></sheetData></worksheet>'
    ))
    first, second, third = sheet.rows[0][:3]
    assert isinstance(first, str) and len(first) <= 64 and isinstance(second, str)
    assert third == Decimal("7")
    fails(lambda: values.parse_money(first), "bad_money")
    for huge in ("1" + "0" * 400, Decimal("1E+999"), Decimal("123456789.12")):
        fails(lambda huge=huge: values.parse_money(huge), "money_too_big")


def test_a_part_that_will_not_unpack_is_a_refusal_not_an_error():
    good = (f'<worksheet {NS}><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>'
            "</worksheet>")
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:  # stored, so the bytes can be found
        for name, body in {**workbook(sheets_xml='<sheet name="S" sheetId="1" r:id="rId2"/>'),
                           "xl/worksheets/sheet2.xml": good}.items():
            z.writestr(name, body)
    data = bytearray(out.getvalue())
    at = data.find(b"<worksheet")
    assert at > 0
    data[at + 12] ^= 0xFF   # one wrong byte: the part's checksum no longer matches
    with pytest.raises(SheetError) as raised:
        xlsx.read(bytes(data))
    assert raised.value.code == "not_a_spreadsheet"
