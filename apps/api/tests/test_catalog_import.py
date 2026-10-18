"""Importing and exporting the Catalog as Excel or CSV (ALY-108, D-039): the templates, the
export, the upload and its preview of every row, applying what was previewed in one go, the
stock numbers in the stock log, the activity record and the one undo, the zip of photos
matched by file name, and everything that must be refused. Plan scenarios 20 (an import with
bad rows) and 21 (duplicate names) are `test_scenario_20_...` and `test_scenario_21_...`.

Each test works in a shop of its own (a new tenant with the Catalog module on), so what other
tests left in the demo shop cannot change what a preview says.
"""

import io
import uuid
import zipfile

import pytest

from alyr.modules.items import columns, sheets, xlsx
from test_consent import owner_sql
from test_sign_in import sign_in

OCTET = {"content-type": "application/octet-stream"}


# ── a shop of its own ────────────────────────────────────

def new_shop(client, role: str = "owner", tag: str = "") -> dict:
    """A new shop with the Catalog on, and someone signed in to it."""
    email = f"{role}-{uuid.uuid4().hex[:10]}@import.example"
    tenant = owner_sql("insert into tenants (name) values ('Import test shop') returning id")[0][
        "id"
    ]
    user = owner_sql(
        "insert into users (email, name) values ($1, $2) returning id",
        email, f"{role} {tag or 'person'}",
    )[0]["id"]
    owner_sql(
        "insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)",
        tenant, user, role,
    )
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog')", tenant)
    client.cookies.clear()
    sign_in(client, email)
    return {"tenant": tenant, "email": email, "user": user}


def join_shop(client, shop: dict, role: str) -> str:
    """Another person on the same shop, signed in."""
    email = f"{role}-{uuid.uuid4().hex[:10]}@import.example"
    user = owner_sql(
        "insert into users (email, name) values ($1, $2) returning id", email, f"{role} person"
    )[0]["id"]
    owner_sql(
        "insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)",
        shop["tenant"], user, role,
    )
    client.cookies.clear()
    sign_in(client, email)
    return email


# ── making files ─────────────────────────────────────────

def head(*keys: str, lang: str = "en") -> list[str]:
    return [columns.BY_KEY[k].label(lang) for k in keys]


def table(keys: list[str], *rows: list, lang: str = "en") -> list[list]:
    return [head(*keys, lang=lang), *rows]


def xlsx_of(rows: list[list], name: str = "Items") -> bytes:
    return xlsx.write([xlsx.SheetSpec(name, rows)])


def csv_of(rows: list[list]) -> bytes:
    return sheets.write_csv(rows)


BASIC = ["name", "name_ar", "category", "price"]


def upload(client, data: bytes, filename: str = "items.xlsx", **query):
    return client.post("/api/items/import", params={"filename": filename, **query},
                       content=data, headers=OCTET)


def preview_of(client, data: bytes, filename: str = "items.xlsx", **query) -> dict:
    answer = upload(client, data, filename, **query)
    assert answer.status_code == 200, answer.text
    return answer.json()


def apply_import(client, shown: dict):
    return client.post(f"/api/items/import/{shown['id']}/apply", json={"preview": shown["hash"]})


def do_import(client, rows: list[list], **query) -> dict:
    shown = preview_of(client, xlsx_of(rows), **query)
    done = apply_import(client, shown)
    assert done.status_code == 200, done.text
    return done.json()


def items_of(client, **query) -> list[dict]:
    answer = client.get("/api/items", params={"limit": 500, **query})
    assert answer.status_code == 200, answer.text
    return answer.json()["items"]


def by_name(client, name: str, **query) -> dict:
    found = [i for i in items_of(client, **query) if i["name"] == name]
    assert len(found) == 1, (name, [i["name"] for i in items_of(client)])
    return found[0]


def entry_for(shown: dict, row: int) -> dict:
    return next(i for i in shown["items"] if row in i["rows"])


def codes(entry: dict, level: str | None = None) -> list[str]:
    return [n["code"] for n in entry["issues"] if level is None or n["level"] == level]


# ── the templates ────────────────────────────────────────

def test_a_template_for_every_type_of_business_downloads_in_both_languages(client):
    new_shop(client)
    listing = client.get("/api/items/import/kinds", params={"lang": "ar"}).json()
    assert {k["key"] for k in listing["kinds"]} == {
        "generic", "restaurant", "bakery", "grocery", "fashion", "shop", "wholesale", "services"
    }
    assert all(k["name"] and k["note"] for k in listing["kinds"])
    for kind in columns.KIND_BY_KEY:
        for lang in ("en", "ar"):
            answer = client.get("/api/items/import/template",
                                params={"kind": kind, "lang": lang, "format": "xlsx"})
            assert answer.status_code == 200, (kind, lang)
            assert answer.headers["content-type"].startswith("application/vnd.openxml")
            assert f"alyr-items-template-{kind}-{lang}.xlsx" in answer.headers[
                "content-disposition"]
            sheet = xlsx.read(answer.content)
            expected = [columns.BY_KEY[k].label(lang) for k in columns.KIND_BY_KEY[kind].columns]
            assert sheet.rows[0] == expected
            assert len(sheet.rows) == 4  # headers and three examples
    assert client.get("/api/items/import/template", params={"kind": "nope"}).status_code == 404


def test_an_arabic_template_has_arabic_headers_arabic_words_and_a_right_to_left_sheet(client):
    new_shop(client)
    answer = client.get("/api/items/import/template",
                        params={"kind": "restaurant", "lang": "ar", "format": "xlsx"})
    sheet = xlsx.read(answer.content)
    assert "الاسم بالعربية" in sheet.rows[0] and "السعر (ر.ق)" in sheet.rows[0]
    assert "تشغيل أو إيقاف" in [c for row in sheet.rows[1:] for c in row]  # a word, not a key
    with zipfile.ZipFile(io.BytesIO(answer.content)) as z:
        assert 'rightToLeft="1"' in z.read("xl/worksheets/sheet1.xml").decode()
        assert "كيف تملأ" in z.read("xl/workbook.xml").decode()
    csv = client.get("/api/items/import/template",
                     params={"kind": "bakery", "lang": "ar", "format": "csv"})
    assert csv.content.startswith(b"\xef\xbb\xbf")
    assert csv.content.decode("utf-8-sig").splitlines()[0].startswith("الاسم بالإنجليزية")


def test_the_template_suggested_follows_the_shops_type_of_business(client):
    shop = new_shop(client)
    assert client.get("/api/items/import/kinds").json()["suggested"] == "generic"
    owner_sql("update tenants set business_type = 'restaurant' where id = $1", shop["tenant"])
    assert client.get("/api/items/import/kinds").json()["suggested"] == "restaurant"
    owner_sql("update tenants set business_type = 'salon' where id = $1", shop["tenant"])
    assert client.get("/api/items/import/kinds").json()["suggested"] == "services"


@pytest.mark.parametrize(
    "fmt, lang", [("xlsx", "en"), ("xlsx", "ar"), ("csv", "en"), ("csv", "ar")]
)
def test_every_template_imports_cleanly_just_as_it_is(client, fmt, lang):
    """An owner who uploads the template untouched sees its three examples, flagged as the
    examples they are, and no problem."""
    new_shop(client)
    for kind in columns.KIND_BY_KEY:
        data = client.get("/api/items/import/template",
                          params={"kind": kind, "lang": lang, "format": fmt}).content
        shown = preview_of(client, data, f"template.{fmt}")
        assert shown["summary"]["error"] == 0, (kind, [i["issues"] for i in shown["items"]])
        assert shown["summary"]["create"] == len(shown["items"]) >= 2
        assert all("example_row" in codes(i) for i in shown["items"]), kind
        client.delete(f"/api/items/import/{shown['id']}")
