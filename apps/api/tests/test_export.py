"""The download of everything a business keeps in ALYR (go-live item 41, specs/040, D-081)."""

import csv
import hashlib
import io
import json
import zipfile
from uuid import uuid4

import httpx
import pytest

from alyr.config import get_settings
from alyr.core import export, mail
from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID, OWNER_EMAIL
from photo_files import photo
from test_consent import ahmed, owner_sql, say
from test_orders import place, product
from test_sign_in import other_shop_with_owner, sign_in


@pytest.fixture
def letters(monkeypatch):
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    sent: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    return sent


def download(client) -> zipfile.ZipFile:
    answer = client.get("/api/account/export")
    assert answer.status_code == 200, answer.text
    return zipfile.ZipFile(io.BytesIO(answer.content))


def table(archive: zipfile.ZipFile, name: str) -> list[dict]:
    data = archive.read(name)
    assert data.startswith(b"\xef\xbb\xbf")  # so Excel reads Arabic
    return list(csv.DictReader(io.StringIO(data[3:].decode("utf-8"), newline="")))


def tenant_tables() -> set[str]:
    return {
        r["table_name"] for r in owner_sql(
            "select c.table_name from information_schema.columns c "
            "join information_schema.tables t using (table_schema, table_name) "
            "where c.table_schema = 'public' and t.table_type = 'BASE TABLE' "
            "and c.column_name = 'tenant_id'"
        )
    }


def test_an_owner_downloads_everything_the_business_keeps(client):
    sign_in(client)
    say(client, AHMED_PHONE, "hello, is the cable in stock?")
    customer = ahmed(client)["id"]
    order = place(client, customer, [(product(client, "Cable 2.5 mm"), 2)], "link").json()
    answer = client.get("/api/account/export")
    assert answer.status_code == 200
    assert answer.headers["content-type"] == "application/zip"
    assert answer.headers["cache-control"] == "no-store"
    assert answer.headers["content-disposition"].startswith('attachment; filename="alyr-al-noor-')
    archive = zipfile.ZipFile(io.BytesIO(answer.content))
    assert archive.testzip() is None
    names = set(archive.namelist())

    # Every table of a business's own is in it, unless it is left out on purpose.
    written = {n.removeprefix("tables/").removesuffix(".csv") for n in names
               if n.startswith("tables/")}
    assert written | set(export.LEFT_OUT) == tenant_tables()
    assert not written & set(export.LEFT_OUT)
    assert {"business.csv", "team.csv", "README.txt"} <= names

    [shop] = table(archive, "business.csv")
    assert shop["name"] == "Al Noor Electricals" and shop["id"] == str(DEMO_TENANT_ID)
    assert {(m["email"], m["role"]) for m in table(archive, "team.csv")} >= {
        (OWNER_EMAIL, "owner"), (AGENT_EMAIL, "agent"),
    }
    orders = {o["id"]: o for o in table(archive, "tables/orders.csv")}
    placed = orders[order["order_id"]]
    assert placed["number"] == str(order["number"]) and placed["contact_id"] == customer
    assert placed["total"] == "45000"  # dirhams, as the README says
    assert placed["created_at"][:4].isdigit() and "T" not in placed["created_at"]
    lines = [r for r in table(archive, "tables/order_items.csv")
             if r["order_id"] == order["order_id"]]
    assert [(r["name"][:12], r["quantity"]) for r in lines] == [("Cable 2.5 mm", "2")]
    assert any(c["phone"] == AHMED_PHONE for c in table(archive, "tables/contacts.csv"))
    assert any(m["body"] == "hello, is the cable in stock?"
               for m in table(archive, "tables/messages.csv"))
    # The catalog is in it, Arabic intact.
    items = table(archive, "tables/items.csv")
    assert any(i["name_ar"] for i in items)

    readme = archive.read("README.txt").decode("utf-8")
    assert "Money is in dirhams: 100 dirhams = 1 QAR" in readme
    assert "المبالغ بالدرهم" in readme and "Doha time" in readme
    assert "tables/orders.csv" in readme and "sessions:" in readme


def test_nothing_of_another_business_and_no_secret_is_in_it(client):
    other = other_shop_with_owner(f"omar-{uuid4().hex[:6]}@other.example")
    phone = f"9745{uuid4().int % 10**7:07d}"
    owner_sql(
        "insert into contacts (tenant_id, phone, name) values ($1, $2, 'Zed Otherwise')",
        other, phone,
    )
    owner_sql(
        "insert into api_keys (tenant_id, name, prefix, secret_hash, scopes) "
        "values ($1, 'Till', 'ab12cd34', 'feedface' || repeat('0', 56), '{sales:write}')",
        DEMO_TENANT_ID,
    )
    owner_sql(
        "insert into webhook_endpoints (tenant_id, name, url, events, secret) "
        "values ($1, 'Books', 'https://books.example/hook', '{document.issued}', "
        "'whsec_do_not_leak_me_0123456789abcdef')",
        DEMO_TENANT_ID,
    )
    sign_in(client)
    archive = download(client)
    everything = b"".join(archive.read(n) for n in archive.namelist())
    for secret in (b"Zed Otherwise", phone.encode(), b"feedface", b"whsec_do_not_leak_me",
                   str(other).encode()):
        assert secret not in everything, secret
    [key] = table(archive, "tables/api_keys.csv")
    assert key["name"] == "Till" and "secret_hash" not in key
    [hook] = table(archive, "tables/webhook_endpoints.csv")
    assert hook["url"] == "https://books.example/hook" and "secret" not in hook
    assert not any(n.startswith("tables/sessions") for n in archive.namelist())


def test_text_a_spreadsheet_could_run_is_written_harmless(client):
    phone = f"9745{uuid4().int % 10**7:07d}"
    owner_sql(
        "insert into contacts (tenant_id, phone, name) "
        "values ($1, $2, '=HYPERLINK(\"http://evil.example\",\"click\")')",
        DEMO_TENANT_ID, phone,
    )
    sign_in(client)
    archive = download(client)
    [row] = [c for c in table(archive, "tables/contacts.csv") if c["phone"] == phone]
    assert row["name"].startswith("'=HYPERLINK")


def test_files_are_written_as_files(client):
    sign_in(client)
    data = photo(2000, 1500)
    uploaded = client.post(
        "/api/media/photos", content=data, headers={"content-type": "image/jpeg"}
    )
    assert uploaded.status_code == 201
    asset = uploaded.json()["photo"]["id"]
    message = owner_sql(
        "insert into messages (tenant_id, direction, kind, body, contact_id) "
        "values ($1, 'in', 'image', '', (select id from contacts where tenant_id = $1 limit 1)) "
        "returning id",
        DEMO_TENANT_ID,
    )[0]["id"]
    owner_sql(
        "insert into message_media (message_id, tenant_id, content_type, data) "
        "values ($1, $2, 'image/jpeg', $3)",
        message, DEMO_TENANT_ID, b"\xff\xd8\xffcustomer-photo",
    )
    owner_sql(
        "insert into document_settings (tenant_id, logo_png) values ($1, $2) "
        "on conflict (tenant_id) do update set logo_png = excluded.logo_png",
        DEMO_TENANT_ID, b"\x89PNGlogo",
    )
    archive = download(client)
    largest = (client.app.state.media.store.root / f"shops/{DEMO_TENANT_ID}"
               / f"{hashlib.sha256(data).hexdigest()}-1600.webp").read_bytes()
    assert archive.read(f"files/photos/{asset}.webp") == largest
    assert archive.read(f"files/messages/{message}.jpg") == b"\xff\xd8\xffcustomer-photo"
    assert archive.read("files/logo.png") == b"\x89PNGlogo"
    # Never as bytes in a table.
    [media] = [m for m in table(archive, "tables/message_media.csv")
               if m["message_id"] == str(message)]
    assert "data" not in media
    assert "logo_png" not in table(archive, "tables/document_settings.csv")[0]
    readme = archive.read("README.txt").decode("utf-8")
    assert "files/photos/      your catalog's photos, the largest size (1)" in readme


def test_only_an_owner_downloads(client):
    sign_in(client, AGENT_EMAIL)
    assert client.get("/api/account/export").status_code == 403
    assert client.get("/api/account").json()["can_export"] is False


def test_every_owner_is_told_and_it_is_on_the_record(client, letters):
    first = f"owner-{uuid4().hex[:6]}@shop-test.com"
    second = f"partner-{uuid4().hex[:6]}@shop-test.com"
    shop = other_shop_with_owner(first)
    user = owner_sql(
        "insert into users (email, name) values ($1, 'Layla Partner') returning id", second
    )[0]["id"]
    owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner')",
              shop, user)
    admin = f"admin-{uuid4().hex[:6]}@shop-test.com"
    admin_id = owner_sql(
        "insert into users (email, name) values ($1, 'Sami') returning id", admin
    )[0]["id"]
    owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin')",
              shop, admin_id)
    sign_in(client, first)
    download(client)
    notes = [m for m in letters if "data was downloaded" in m["subject"]]
    assert sorted(m["to"][0] for m in notes) == sorted([first, second])
    assert notes[0]["subject"] == "All of Other shop's data was downloaded from ALYR"
    assert "Omar downloaded all of Other shop's data" in notes[0]["text"]
    assert "Doha time" in notes[0]["text"] and "بتوقيت الدوحة" in notes[0]["text"]
    [record] = owner_sql(
        "select subject, actor_name from activity "
        "where tenant_id = $1 and action = 'data_exported'",
        shop,
    )
    assert (record["subject"], record["actor_name"]) == ("team", "Omar")


def test_downloads_are_limited_per_business(client):
    sign_in(client)
    for _ in range(5):
        assert client.get("/api/account/export").status_code == 200
    late = client.get("/api/account/export")
    assert late.status_code == 429 and int(late.headers["retry-after"]) > 0


@pytest.mark.parametrize(
    ("table_name", "column", "data_type", "kept"),
    [
        ("contacts", "name", "text", True),
        ("api_keys", "secret_hash", "text", False),
        ("webhook_endpoints", "secret", "text", False),
        ("any_new_table", "access_token", "text", False),
        ("any_new_table", "password", "text", False),
        ("any_new_table", "code_hash", "text", False),
        ("any_new_table", "api_key", "text", False),
        ("any_new_table", "client_credentials", "jsonb", False),
        ("payment_accounts", "sealed_keys", "bytea", False),
        ("payment_accounts", "key_hint", "text", True),
        ("connect_sales", "api_key_id", "uuid", True),
        ("any_new_table", "scan", "bytea", False),
        ("documents", "content_hash", "text", True),
        ("connect_sales", "request_hash", "text", True),
    ],
)
def test_a_secret_or_a_column_of_bytes_is_never_written(table_name, column, data_type, kept):
    """Including in a table added after this was written."""
    assert export.written(table_name, column, data_type) is kept
