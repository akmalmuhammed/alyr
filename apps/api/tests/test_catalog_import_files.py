"""The files of the Catalog's import and export, end to end (ALY-108): what an export holds and
that it reads back as no change; files typed by hand in either language, from Excel or a
phone; formulas that are never calculated; the size and row caps; and a spreadsheet of 500
items. The helpers are in test_catalog_import.py."""

import io
import time
import zipfile
from decimal import Decimal

import pytest

from alyr.modules.items import columns, xlsx
from test_catalog_files import NS, workbook, zip_of
from test_catalog_import import (
    BASIC,
    OCTET,
    apply_import,
    by_name,
    codes,
    csv_of,
    do_import,
    entry_for,
    head,
    items_of,
    new_shop,
    preview_of,
    table,
    upload,
    xlsx_of,
)

RICH = [
    "name", "name_ar", "category", "price", "sale_price", "sale_starts", "sale_ends", "unit",
    "pack_size", "min_order", "tags", "status", "rule", "available", "variant", "variant_ar",
    "price_diff", "stock", "per_day", "description", "description_ar",
]


def rich_rows() -> list[list]:
    def row(**cells) -> list:
        return [cells.get(k) for k in RICH]

    return table(
        RICH,
        row(name="Shawarma", name_ar="شاورما", category="Wraps", price=14, sale_price=12,
            sale_starts="2030-01-01", sale_ends="2030-12-31", unit="Portion",
            tags="Halal, Spicy", status="On sale", rule="On or off", available="Yes",
            description="Chicken,\ngarlic sauce.", description_ar="دجاج وثوم."),
        row(name="Date loaf", name_ar="رغيف التمر", category="Cakes", price=60, variant="Small",
            variant_ar="صغير", rule="A number each day", per_day=6),
        row(name="Date loaf", name_ar="رغيف التمر", variant="Large", variant_ar="كبير",
            price_diff=40, per_day=3),
        row(name="Abaya", name_ar="عباية", category="Abayas", price=260,
            rule="Counted in stock", variant="52", price_diff=0, stock=4),
        row(name="Abaya", name_ar="عباية", variant="54", price_diff=20, stock=6),
        row(name="Rice", name_ar="أرز", category="Dry goods", price="38.50", unit="Kilo",
            pack_size=5, min_order=2, rule="Counted in stock", stock=40),
        row(name="Secret", name_ar="سر", price=10, status="Hidden"),
        row(name="Idea", status="Draft"),
        row(name="Black tea", name_ar="شاي أسود", category="Drinks", price=3,
            rule="Always available"),
    )


def unchanged(shown: dict) -> bool:
    return (shown["summary"]["unchanged"] == shown["summary"]["items"]
            and shown["summary"]["error"] == 0 and shown["summary"]["warnings"] == 0)


# ── export, and back ─────────────────────────────────────

@pytest.mark.parametrize(
    "fmt, lang", [("xlsx", "en"), ("xlsx", "ar"), ("csv", "en"), ("csv", "ar")]
)
def test_an_export_uploads_again_as_no_change_in_either_language_and_either_format(
        client, fmt, lang):
    new_shop(client)
    do_import(client, rich_rows())
    answer = client.get("/api/items/export", params={"lang": lang, "format": fmt})
    assert answer.status_code == 200
    assert "attachment; filename=\"alyr-items-" in answer.headers["content-disposition"]
    shown = preview_of(client, answer.content, f"export.{fmt}")
    assert unchanged(shown), (shown["summary"], [
        (i["row"], i["action"], i["issues"], i["diff"]) for i in shown["items"]
        if i["action"] != "unchanged" or i["issues"]
    ])
    assert shown["summary"]["items"] == 7


def test_the_export_holds_everything_an_owner_sees(client):
    new_shop(client)
    do_import(client, rich_rows())
    rows = xlsx.read(client.get("/api/items/export").content).rows
    header = rows[0]
    assert header == [columns.BY_KEY[k].en for k in columns.ORDER]

    def cell(name: str, column: str, variant: str | None = None):
        for r in rows[1:]:
            if r[header.index("Name (English)")] == name and (
                variant is None or r[header.index("Size or colour")] == variant
            ):
                return r[header.index(columns.BY_KEY[column].en)]
        raise AssertionError((name, variant))

    assert cell("Shawarma", "price") == Decimal("14.00")
    assert cell("Shawarma", "sale_price") == Decimal("12.00")
    assert cell("Shawarma", "sale_ends") == "2030-12-31"
    assert cell("Shawarma", "tags") == "Halal, Spicy"
    assert cell("Shawarma", "unit") == "Portion" and cell("Rice", "unit") == "Kilo"
    assert cell("Rice", "price") == Decimal("38.50") and cell("Rice", "stock") == 40
    assert cell("Abaya", "stock", "54") == 6 and cell("Abaya", "price_diff", "54") == Decimal("20")
    assert cell("Date loaf", "per_day", "Large") == 3
    assert cell("Secret", "status") == "Hidden" and cell("Idea", "status") == "Draft"
    assert cell("Black tea", "rule") == "Always available"
    assert cell("Date loaf", "category", "Large") == "Cakes"   # an item's columns repeat
    assert len([r for r in rows[1:] if r[header.index("Name (English)")] == "Abaya"]) == 2
    ids = {r[0] for r in rows[1:]}
    assert len(ids) == 7 and all(len(i) == 36 for i in ids)
    # Arabic: the same, in the owner's language.
    arabic = xlsx.read(client.get("/api/items/export", params={"lang": "ar"}).content).rows
    assert arabic[0][columns.ORDER.index("price")] == "السعر (ر.ق)"
    assert "معروض للبيع" in {r[columns.ORDER.index("status")] for r in arabic[1:]}


def test_an_export_edited_in_excel_updates_exactly_what_was_changed(client):
    new_shop(client)
    do_import(client, rich_rows())
    rows = xlsx.read(client.get("/api/items/export").content).rows
    h = rows[0]
    col = {k: h.index(columns.BY_KEY[k].en) for k in columns.ORDER}
    for r in rows[1:]:
        if r[col["name"]] == "Shawarma":
            r[col["price"]], r[col["sale_price"]] = 16, 0     # a new price; ends the sale
        if r[col["name"]] == "Abaya" and r[col["variant"]] == "54":
            r[col["price_diff"]], r[col["stock"]] = 30, 2
        if r[col["name"]] == "Idea":
            r[col["name_ar"]], r[col["price"]], r[col["status"]] = "فكرة", 25, "On sale"
    shown = preview_of(client, xlsx_of(rows))
    changed = {i["name"]: i for i in shown["items"] if i["action"] != "unchanged"}
    assert set(changed) == {"Shawarma", "Abaya", "Idea"} and shown["summary"]["error"] == 0
    assert {(d["column"], d["before"], d["after"]) for d in changed["Shawarma"]["diff"]} == {
        ("price", "QAR 14", "QAR 16"), ("sale_price", "QAR 12", ""),
    }
    assert {(d["column"], d["variant"], d["before"], d["after"]) for d in changed["Abaya"]["diff"]
           } == {("price_diff", "54", "QAR 20", "QAR 30"), ("stock", "54", "6", "2")}
    assert apply_import(client, shown).status_code == 200
    shawarma = by_name(client, "Shawarma")
    assert (shawarma["price"], shawarma["sale_price"], shawarma["sale_ends_at"]) == (
        1600, None, None)
    abaya = by_name(client, "Abaya")
    assert {v["name"]: (v["price_delta"], v["on_hand"]) for v in abaya["variants"]} == {
        "52": (0, 4), "54": (3000, 2)}
    idea = by_name(client, "Idea")
    assert (idea["status"], idea["name_ar"], idea["price"]) == ("live", "فكرة", 2500)
    # Everything the file did not touch is as it was.
    assert by_name(client, "Rice")["variants"][0]["on_hand"] == 40
    assert by_name(client, "Date loaf")["stock_rule"] == "daily_limit"


def test_leaving_a_cell_empty_keeps_what_the_shop_has(client):
    new_shop(client)
    do_import(client, rich_rows())
    shawarma = by_name(client, "Shawarma")
    # Only an ID and a new price: names, sale, tags, description and the rest stay.
    shown = preview_of(client, xlsx_of([head("id", "price"), [shawarma["id"], 15]]))
    assert shown["items"][0]["action"] == "update"
    assert apply_import(client, shown).status_code == 200
    after = by_name(client, "Shawarma")
    assert after["price"] == 1500 and after["tags"] == ["Halal", "Spicy"]
    assert after["sale_price"] == 1200 and after["description_ar"] == "دجاج وثوم."
    assert after["name_ar"] == "شاورما" and after["unit"] == "portion"


def test_an_item_id_from_another_shop_is_not_found_and_nothing_leaks(client):
    new_shop(client)
    do_import(client, rich_rows())
    exported = client.get("/api/items/export").content
    first_shop_items = {i["id"]: i["price"] for i in items_of(client)}
    new_shop(client)
    shown = preview_of(client, exported)
    assert shown["summary"]["error"] == 7 and shown["summary"]["create"] == 0
    assert {c for i in shown["items"] for c in codes(i, "error")} == {"unknown_id"}
    assert apply_import(client, shown).status_code == 422   # nothing to import
    assert items_of(client) == []
    # Without the IDs the same rows are simply new items here, and the first shop is untouched.
    rows = xlsx.read(exported).rows
    for r in rows[1:]:
        r[0] = None
    assert preview_of(client, xlsx_of(rows))["summary"]["create"] == 7
    new_shop(client)  # sign in to a third shop to read the first through the API: no access
    assert items_of(client) == [] and first_shop_items


# ── formulas ─────────────────────────────────────────────

def test_formula_injection_everything_a_spreadsheet_could_run_is_neutralised_on_export(client):
    new_shop(client)
    names = ["=1+1", "+cmd|' /C calc'!A0", "-5% off", "@SUM(1,1)", "\tTabbed", "Plain"]
    for n, name in enumerate(names):
        made = client.post("/api/items", json={
            "name": name, "name_ar": "اسم", "price": 100 + n, "status": "live",
            "description": "=HYPERLINK(\"http://example.test\")", "category": "=Cat",
            "tags": ["@tag"],
        })
        assert made.status_code == 200, made.text
    for fmt in ("xlsx", "csv"):
        answer = client.get("/api/items/export", params={"format": fmt})
        rows = (xlsx.read(answer.content).rows if fmt == "xlsx"
                else [line for line in __import__("csv").reader(io.StringIO(
                    answer.content.decode("utf-8-sig")))])
        dangerous = ("=", "+", "-", "@", "\t", "\r")
        for r in rows[1:]:
            for value in r:
                if isinstance(value, str) and value:
                    assert not value.startswith(dangerous), (fmt, value)
        names_out = {r[1] for r in rows[1:]}
        assert "'=1+1" in names_out and "'@SUM(1,1)" in names_out and "Plain" in names_out
    with zipfile.ZipFile(io.BytesIO(client.get("/api/items/export").content)) as z:
        sheet_xml = z.read("xl/worksheets/sheet1.xml").decode()
    assert "<f>" not in sheet_xml and "<f " not in sheet_xml
    # ... and the apostrophe is not part of the name when the file comes back.
    shown = preview_of(client, client.get("/api/items/export").content)
    assert unchanged(shown)


def test_an_import_never_calculates_a_formula_it_uses_the_value_the_file_saved(client):
    new_shop(client)
    parts = workbook(sheets_xml='<sheet name="S" sheetId="1" r:id="rId2"/>')
    parts["xl/worksheets/sheet2.xml"] = (
        f"<worksheet {NS}><sheetData>"
        '<row r="1"><c r="A1" t="inlineStr"><is><t>Name (English)</t></is></c>'
        '<c r="B1" t="inlineStr"><is><t>Name (Arabic)</t></is></c>'
        '<c r="C1" t="inlineStr"><is><t>Price (QAR)</t></is></c>'
        '<c r="D1" t="inlineStr"><is><t>Description</t></is></c></row>'
        '<row r="2"><c r="A2" t="str"><f>CONCATENATE("Tea"," ","shop")</f><v>Computed name</v></c>'
        '<c r="B2" t="inlineStr"><is><t>شاي</t></is></c>'
        '<c r="C2"><f>B9*2</f><v>10</v></c>'
        '<c r="D2" t="inlineStr"><is><t>=SUM(1,1)</t></is></c></row>'
        '<row r="3"><c r="A3" t="inlineStr"><is><t>No value</t></is></c>'
        '<c r="B3" t="inlineStr"><is><t>بلا قيمة</t></is></c>'
        '<c r="C3"><f>1+1</f></c></row>'
        "</sheetData></worksheet>"
    )
    shown = preview_of(client, zip_of(parts))
    first, second = shown["items"]
    assert codes(first, "warning") == ["formula_value", "formula_value", "text_formula"]
    # saved values, not computed
    assert first["name"] == "Computed name" and first["price"] == 1000
    assert "never calculates formulas" in first["issues"][0]["message"]
    assert second["action"] == "create" and second["draft"] is True      # a formula with no value
    assert "formula_blank" in codes(second, "warning")
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Computed name")["description"] == "=SUM(1,1)"   # text, kept as typed
    # Exported again, it is neutralised.
    rows = xlsx.read(client.get("/api/items/export").content).rows
    desc = rows[0].index("Description")
    assert "'=SUM(1,1)" in [r[desc] for r in rows[1:]]


def test_a_csv_cell_that_is_a_formula_is_kept_as_text_and_pointed_out(client):
    new_shop(client)
    data = csv_of(table(BASIC, ["=HYPERLINK(\"http://example.test\")", "شاي", "D", 3]))
    shown = preview_of(client, data, "x.csv")
    assert codes(shown["items"][0], "warning") == ["text_formula"]
    assert apply_import(client, shown).status_code == 200
    assert items_of(client)[0]["name"] == '=HYPERLINK("http://example.test")'


# ── files from Excel, an Arabic Windows and a phone ──────

def test_a_csv_from_an_arabic_windows_excel_with_semicolons_and_arabic_digits(client):
    new_shop(client)
    text = ("الاسم بالإنجليزية;الاسم بالعربية;الفئة;السعر (ر.ق)\r\n"
            "Shawarma;شاورما;ساندويتشات;14,50\r\n"
            "Falafel;فلافل;ساندويتشات;QAR 1,250\r\n")
    shown = preview_of(client, text.encode("cp1256"), "items.csv")
    assert shown["summary"]["create"] == 2 and shown["summary"]["error"] == 0
    assert apply_import(client, shown).status_code == 200
    assert by_name(client, "Shawarma")["price"] == 1450
    assert by_name(client, "Falafel")["price"] == 125000
    assert by_name(client, "Shawarma")["category"] == "ساندويتشات"


def test_a_csv_saved_as_utf8_with_arabic_digits_and_separators(client):
    new_shop(client)
    text = ("Name (English),Name (Arabic),Price (QAR),In stock\r\n"
            "Shawarma,شاورما,\"١٬٢٥٠٫٥٠\",١٢\r\n")
    shown = preview_of(client, b"\xef\xbb\xbf" + text.encode("utf-8"), "items.csv")
    assert shown["summary"]["create"] == 1 and shown["summary"]["error"] == 0
    apply_import(client, shown)
    made = by_name(client, "Shawarma")
    assert made["price"] == 125050 and made["variants"][0]["on_hand"] == 12


@pytest.mark.parametrize("filename, content_type", [
    ("items.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ("items", "application/octet-stream"),
    ("ITEMS.XLSX", ""),
    ("export (1).xlsx", "application/zip"),
    ("download", "application/vnd.ms-excel"),   # what some phones call every sheet
])
def test_the_kind_of_file_comes_from_its_content_not_its_name_or_type(
        client, filename, content_type):
    new_shop(client)
    headers = {"content-type": content_type} if content_type else {}
    answer = client.post("/api/items/import", params={"filename": filename},
                         content=xlsx_of(table(BASIC, ["Tea", "شاي", "D", 3])), headers=headers)
    assert answer.status_code == 200, answer.text
    assert answer.json()["kind"] == "xlsx" and answer.json()["filename"] == filename
    answer = client.post("/api/items/import", params={"filename": filename},
                         content=csv_of(table(BASIC, ["Tea", "شاي", "D", 3])), headers=headers)
    assert answer.status_code == 200 and answer.json()["kind"] == "csv"


def test_old_macro_corrupt_and_foreign_files_are_refused_and_nothing_is_stored(client):
    shop = new_shop(client)
    macro = zip_of({**workbook(sheets_xml='<sheet name="S" sheetId="1" r:id="rId2"/>'),
                    "xl/worksheets/sheet2.xml": f"<worksheet {NS}><sheetData/></worksheet>",
                    "xl/vbaProject.bin": b"\x00"})
    for data, name, code in (
        (bytes.fromhex("D0CF11E0A1B11AE1") + b"\x00" * 200, "old.xls", "xls_not_supported"),
        (macro, "macro.xlsx", "macros_not_supported"),
        (macro, "macro.xlsm", "macros_not_supported"),
        (b"PK\x03\x04" + b"garbage" * 40, "broken.xlsx", "not_a_spreadsheet"),
        (b"%PDF-1.7 \x00\x01", "list.pdf", "not_a_spreadsheet"),
        (photo_bytes(), "list.csv", "not_a_spreadsheet"),
    ):
        answer = upload(client, data, name)
        assert answer.status_code == 422, name
        detail = answer.json()["detail"]
        assert detail["code"] == code, (name, detail)
        assert detail["message"] and detail["message_ar"]
    assert items_of(client) == []
    assert owner_count(shop) == 0


def photo_bytes() -> bytes:
    from photo_files import photo

    return photo(80, 60)


def owner_count(shop: dict) -> int:
    from test_consent import owner_sql

    return owner_sql("select count(*) as n from item_imports where tenant_id = $1",
                     shop["tenant"])[0]["n"]


# ── limits ───────────────────────────────────────────────

def test_a_file_over_the_size_limit_is_refused_before_it_is_read(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_CATALOG_IMPORT_MAX_BYTES", "4000")
    client = client_factory()
    shop = new_shop(client)
    rows = table(BASIC, *[[f"Item {n}", f"صنف {n}", "Things", n + 1] for n in range(300)])
    big = xlsx_of(rows)
    assert len(big) > 4000
    answer = upload(client, big)
    assert answer.status_code == 413 and answer.json()["detail"]["code"] == "file_too_large"
    assert "MB" in answer.json()["detail"]["message"] and answer.json()["detail"]["message_ar"]
    assert owner_count(shop) == 0
    # The same without a declared length (a chunked upload) is stopped as it arrives.
    def chunks():
        for i in range(0, len(big), 1000):
            yield big[i:i + 1000]

    answer = client.post("/api/items/import", content=chunks(), headers=OCTET)
    assert answer.status_code == 413
    assert upload(client, xlsx_of(table(BASIC, ["Tea", "شاي", "D", 3]))).status_code == 200


def test_a_file_with_too_many_rows_is_refused_with_the_limit_in_the_message(client):
    new_shop(client)
    rows = table(["name", "price"], *[[f"Item {n}", 1] for n in range(3001)])
    answer = upload(client, csv_of(rows), "big.csv")
    assert answer.status_code == 422
    detail = answer.json()["detail"]
    assert detail["code"] == "too_many_rows" and "3,000" in detail["message"]
    rows = table(["name", "price"], *[[f"Item {n}", 1] for n in range(3000)])
    assert upload(client, csv_of(rows), "ok.csv").status_code == 200


def test_the_shops_item_limit_leaves_out_what_does_not_fit_and_deletes_nothing(
        client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_CATALOG_MAX_ITEMS", "5")
    client = client_factory()
    new_shop(client)
    do_import(client, table(BASIC, ["One", "واحد", "x", 1], ["Two", "اثنان", "x", 2]))
    rows = table(BASIC, *[[f"New {n}", f"جديد {n}", "x", 10 + n] for n in range(5)])
    shown = preview_of(client, xlsx_of(rows))
    assert shown["summary"]["create"] == 3 and shown["summary"]["error"] == 2
    assert codes(entry_for(shown, 6), "error") == ["item_limit"]
    assert "limit of 5 items" in entry_for(shown, 6)["issues"][0]["message"]
    assert apply_import(client, shown).status_code == 200
    assert len(items_of(client)) == 5
    assert {"One", "Two"} <= {i["name"] for i in items_of(client)}


# ── 500 items ────────────────────────────────────────────

def test_a_spreadsheet_of_500_items_imports_and_reads_back_as_no_change(client):
    new_shop(client)
    keys = ["name", "name_ar", "category", "price", "variant", "variant_ar", "stock", "tags"]
    rows = [head(*keys)]
    for n in range(500):
        category = f"Category {n % 25}"
        if n % 5 == 0:   # one in five has three sizes
            for size in ("S", "M", "L"):
                rows.append([f"Item {n:04d}", f"صنف {n:04d}", category, 20 + n % 40, size, None,
                             n % 17, "Halal"])
        else:
            rows.append([f"Item {n:04d}", f"صنف {n:04d}", category, 5 + n % 90, None, None,
                         n % 9, None])
    data = xlsx_of(rows)
    started = time.perf_counter()
    shown = preview_of(client, data)
    assert shown["summary"]["create"] == 500 and shown["summary"]["error"] == 0
    assert shown["summary"]["rows"] == 100 * 3 + 400
    done = apply_import(client, shown)
    assert done.status_code == 200, done.text
    assert time.perf_counter() - started < 60
    assert done.json()["summary"]["counts"]["create"] == 500
    listing = client.get("/api/items", params={"limit": 500}).json()
    assert listing["total"] == 500
    assert sum(len(i["variants"]) for i in listing["items"]) == 100 * 3 + 400
    again = preview_of(client, client.get("/api/items/export").content)
    assert unchanged(again) and again["summary"]["items"] == 500
    # The same file again adds nothing silently: every name is a warned-about duplicate.
    twice = preview_of(client, data)
    assert twice["summary"]["create"] == 500 and twice["summary"]["warnings"] == 500
    skipped = preview_of(client, data, on_duplicate="skip")
    assert skipped["summary"]["skip"] == 500 and skipped["summary"]["create"] == 0
