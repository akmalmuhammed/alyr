"""The hash of an issued document (ALY-138, spec 010): SHA-256 of its content in canonical
JSON. The same content always gives the same hash; any change to what the paper says gives a
different one; and a document altered behind the database's back is caught by `verify`.
"""

import copy
import hashlib
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from alyr.modules.documents import canonical
from documents_support import configured_shop, issue, issued, make_draft
from pdf_support import page_text
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return configured_shop(client_factory, monkeypatch)


def content() -> dict:
    """A small issued document, as the hash sees it."""
    doc = {
        "id": UUID("5a446a8e-9c3a-4d5f-8a4c-2f6f0c1d9b11"), "kind": "invoice",
        "number": "INV-2026-0042", "series_key": "main", "number_year": 2026, "seq": 42,
        "issued_at": datetime(2026, 10, 19, 14, 3, 22, 123456, tzinfo=UTC),
        "issue_date": date(2026, 10, 19), "due_date": date(2026, 11, 18), "audience": "consumer",
        "languages": "ar_en", "currency": "QAR", "currency_exponent": 2,
        "customer": {"name": "Fatima Al-Kuwari", "name_ar": "فاطمة الكواري"},
        "seller": {"name": "Qirfa Bakery", "name_ar": "مخبز قرفة", "registered": True},
        "contact_id": None, "gross_minor": 12700, "discount_minor": 500, "tax_minor": 0,
        "total_minor": 12200, "paid_minor": 0, "payments": [], "notes": {}, "terms": {},
        "reason": "", "source": "manual", "source_ref": "", "related_document_id": None,
    }
    lines = [
        {"position": 2, "description": "Cake", "description_ar": "كعكة", "sku": "",
         "quantity": Decimal("2.000"), "unit": "piece", "unit_price_minor": 4500,
         "discount_minor": 500, "tax_rate_bp": 0, "line_net_minor": 8500, "tax_minor": 0,
         "line_total_minor": 8500},
        {"position": 1, "description": "Bread", "description_ar": "خبز", "sku": "",
         "quantity": Decimal("12"), "unit": "piece", "unit_price_minor": 350, "discount_minor": 0,
         "tax_rate_bp": 0, "line_net_minor": 4200, "tax_minor": 0, "line_total_minor": 4200},
    ]
    return {"doc": doc, "lines": lines}


def hash_of(parts: dict) -> str:
    return canonical.hash_content(canonical.content_of(parts["doc"], parts["lines"]))


# ── the hash is a function of the content ─────────────────────────────────────────────────


def test_the_same_content_gives_the_same_hash_every_time():
    a, b = content(), content()
    assert hash_of(a) == hash_of(b) == hash_of(a)
    assert len(hash_of(a)) == 64 and int(hash_of(a), 16) >= 0


def test_the_order_things_were_written_in_makes_no_difference():
    a = content()
    b = content()
    b["doc"] = dict(reversed(list(b["doc"].items())))
    b["doc"]["customer"] = dict(reversed(list(b["doc"]["customer"].items())))
    b["lines"] = list(reversed(b["lines"]))  # the database may return the rows in any order
    assert hash_of(a) == hash_of(b)


def test_the_hash_is_pinned_so_a_change_to_the_format_is_noticed():
    """The canonical form is a promise to every document ever issued. If this value changes
    the format changed: that needs a new HASH_VERSION and a decision, not a quiet edit."""
    assert canonical.HASH_VERSION == 1
    assert hash_of(content()) == "d605d306708706e77b93668df1f2c2ee8474fdd65224ce77ab3e4b014d1e70b5"


def test_arabic_is_hashed_as_arabic_not_as_escapes():
    data = canonical.canonical_bytes(content()["doc"]["customer"])
    assert "فاطمة".encode() in data and b"\\u" not in data


def test_the_canonical_text_is_compact_sorted_and_exact():
    text = canonical.canonical_bytes({"b": [1, {"d": 4, "c": 3}], "a": Decimal("2"),
                                      "t": datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC),
                                      "d": date(2026, 1, 2), "u": UUID(int=1), "n": None}).decode()
    assert text == ('{"a":"2.000","b":[1,{"c":3,"d":4}],"d":"2026-01-02","n":null,'
                    '"t":"2026-01-02T03:04:05.000000Z","u":"00000000-0000-0000-0000-000000000001"}')


def test_a_time_in_another_zone_is_the_same_instant():
    from datetime import timedelta, timezone

    qatar = timezone(timedelta(hours=3))
    a = canonical.canonical_bytes({"t": datetime(2026, 1, 1, 12, 0, tzinfo=UTC)})
    b = canonical.canonical_bytes({"t": datetime(2026, 1, 1, 15, 0, tzinfo=qatar)})
    assert a == b


def test_a_float_or_a_naive_time_cannot_be_hashed():
    for bad in ({"x": 1.5}, {"x": [1, {"y": 0.1}]}, {"x": datetime(2026, 1, 1)}, {"x": object()},
                {"x": {1, 2}}):
        with pytest.raises(canonical.CanonicalError):
            canonical.canonical_bytes(bad)


CHANGES = [
    ("doc", "number", "INV-2026-0043"), ("doc", "kind", "receipt"), ("doc", "total_minor", 12201),
    ("doc", "gross_minor", 12701), ("doc", "paid_minor", 1), ("doc", "currency", "SAR"),
    ("doc", "currency_exponent", 3), ("doc", "languages", "ar"), ("doc", "audience", "business"),
    ("doc", "issued_at", datetime(2026, 10, 19, 14, 3, 22, 123457, tzinfo=UTC)),
    ("doc", "issue_date", date(2026, 10, 20)), ("doc", "due_date", None),
    ("doc", "customer", {"name": "Someone else"}),
    ("doc", "seller", {"name": "Another shop"}), ("doc", "notes", {"en": "changed"}),
    ("doc", "terms", {"en": "changed"}), ("doc", "reason", "changed"), ("doc", "source", "order"),
    ("doc", "source_ref", "1001"), ("doc", "contact_id", UUID(int=7)),
    ("doc", "related_document_id", UUID(int=8)), ("doc", "seq", 43), ("doc", "series_key", "x"),
    ("doc", "number_year", 2027), ("doc", "payments", [{"method": "cash", "amount_minor": 1}]),
    ("doc", "id", UUID(int=9)),
    ("line0", "quantity", Decimal("3.000")), ("line0", "description", "Cakes"),
    ("line0", "description_ar", "كعك"), ("line0", "unit_price_minor", 4501),
    ("line0", "discount_minor", 0), ("line0", "line_total_minor", 8501),
    ("line0", "unit", "kg"), ("line0", "sku", "C-1"), ("line0", "tax_rate_bp", 500),
]


@pytest.mark.parametrize("where,field,value", CHANGES, ids=[f"{w}.{f}" for w, f, _ in CHANGES])
def test_any_change_to_what_the_paper_says_changes_the_hash(where, field, value):
    original = content()
    changed = copy.deepcopy(original)
    target = changed["doc"] if where == "doc" else changed["lines"][0]
    assert target[field] != value, "a test that changes nothing proves nothing"
    target[field] = value
    assert hash_of(changed) != hash_of(original)


def test_adding_removing_or_reordering_a_line_changes_the_hash():
    original = content()
    fewer = copy.deepcopy(original)
    fewer["lines"].pop()
    more = copy.deepcopy(original)
    more["lines"].append({**more["lines"][0], "position": 3})
    moved = copy.deepcopy(original)
    moved["lines"][0]["position"], moved["lines"][1]["position"] = 1, 2
    assert len({hash_of(original), hash_of(fewer), hash_of(more), hash_of(moved)}) == 4


def test_what_is_not_content_is_not_in_the_hash():
    """The look of the paper, who pressed the button and its status can change without the
    document having said anything different."""
    original = content()
    other = copy.deepcopy(original)
    other["doc"].update({"layout": "a5", "status": "void", "issued_by": "Someone",
                         "created_by": "Someone else", "pdf_sha256": "0" * 64,
                         "voided_at": datetime(2027, 1, 1, tzinfo=UTC), "balance_minor": 0})
    assert hash_of(other) == hash_of(original)


# ── the stored hash ───────────────────────────────────────────────────────────────────────


def test_an_issued_documents_hash_is_the_hash_of_what_is_stored(shop):
    doc = issued(shop.owner, "invoice")
    assert doc["hash_version"] == 1
    check = shop.owner.get(f"/api/documents/{doc['id']}/verify").json()
    assert check == {"ok": True, "content_hash": doc["content_hash"],
                     "recomputed": doc["content_hash"], "hash_version": 1, "pdf_ok": True}
    pdf = shop.owner.get(f"/api/documents/{doc['id']}/pdf").content
    assert hashlib.sha256(pdf).hexdigest() == doc["pdf"]["sha256"]
    assert len(pdf) == doc["pdf"]["bytes"]
    # The first sixteen digits are printed at the foot of the paper. Read back from a page with
    # no Arabic on it: next to Arabic a reader reorders the groups of digits (it was seen to,
    # and the page itself is right: the ink shows them left to right).
    plain = issued(shop.owner, "invoice", audience="business", languages="en")
    text = page_text(shop.owner.get(f"/api/documents/{plain['id']}/pdf").content)
    grouped = " ".join(plain["content_hash"][i:i + 4] for i in range(0, 16, 4)).upper()
    assert grouped in text


def test_two_documents_with_the_same_words_have_different_hashes(shop):
    first, second = issued(shop.owner, "receipt"), issued(shop.owner, "receipt")
    assert first["content_hash"] != second["content_hash"]
    assert [first["number"], second["number"]] == ["RC-0001", "RC-0002"]


def test_issuing_twice_with_one_key_gives_one_document_and_one_hash(shop):
    draft = make_draft(shop.owner)
    a = issue(shop.owner, draft["id"], key="hash-key-00001").json()["document"]
    b = issue(shop.owner, draft["id"], key="hash-key-00001").json()["document"]
    assert a["content_hash"] == b["content_hash"] and a["id"] == b["id"]
    assert owner_sql("select count(*) as n from documents where tenant_id = $1 and status = 'issued'",
                     shop.tenant_id)[0]["n"] == 1


def tampered(shop, doc, change_sql: str, *args, table: str = "documents",
             trigger: str = "documents_guard"):
    """Change a stored document the way only someone with the table owner's rights could, by
    switching its guard off for one statement, and switch it back on."""
    owner_sql(f"alter table {table} disable trigger {trigger}")
    try:
        owner_sql(change_sql, UUID(doc["id"]), *args)
    finally:
        owner_sql(f"alter table {table} enable trigger {trigger}")


def test_a_document_altered_behind_the_databases_back_fails_verification(shop):
    doc = issued(shop.owner, "invoice")
    assert shop.owner.get(f"/api/documents/{doc['id']}/verify").json()["ok"] is True
    tampered(shop, doc, "update documents set customer = '{\"name\": \"Someone else\"}'::jsonb "
                        "where id = $1")
    check = shop.owner.get(f"/api/documents/{doc['id']}/verify").json()
    assert check["ok"] is False and check["content_hash"] != check["recomputed"]
    assert check["pdf_ok"] is True
    # Putting it back, it verifies again: the check is about the content, not about a flag.
    tampered(shop, doc, "update documents set customer = $2::jsonb where id = $1",
             json.dumps(doc["customer"]))
    assert shop.owner.get(f"/api/documents/{doc['id']}/verify").json()["ok"] is True


def test_a_changed_line_or_a_changed_pdf_fails_verification(shop):
    doc = issued(shop.owner, "invoice")
    owner_sql("alter table document_lines disable trigger document_lines_guard")
    try:
        owner_sql("update document_lines set quantity = 13, line_net_minor = 4550, "
                  "line_total_minor = 4550 where document_id = $1 and position = 1", UUID(doc["id"]))
    finally:
        owner_sql("alter table document_lines enable trigger document_lines_guard")
    assert shop.owner.get(f"/api/documents/{doc['id']}/verify").json()["ok"] is False

    other = issued(shop.owner, "invoice")
    tampered(shop, other, "update document_files set content = 'tampered'::bytea, bytes = 8 "
                          "where document_id = $1", table="document_files",
             trigger="document_files_guard")
    check = shop.owner.get(f"/api/documents/{other['id']}/verify").json()
    assert check["ok"] is False and check["pdf_ok"] is False


def test_a_draft_has_no_hash_and_cannot_be_verified(shop):
    draft = make_draft(shop.owner)
    assert draft["content_hash"] is None
    answer = shop.owner.get(f"/api/documents/{draft['id']}/verify")
    assert (answer.status_code, answer.json()["code"]) == (409, "not_issued")
    assert shop.owner.get(f"/api/documents/{uuid4()}/verify").status_code == 404
