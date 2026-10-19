"""An issued document cannot be changed (ALY-138, spec 010).

Every refusal here is the *database's*, proved as the application's own role (`alyr_app`, the
one the API connects as) and again as the table owner. The API's own checks come first in real
life; these tests go around them on purpose, because the promise is that nothing (not a bug,
not a careless script) can alter, delete or renumber what a customer was handed.

What may still happen to an issued document: exactly one thing, it can be cancelled by a credit
note that covers all of it, which moves it to `void` and writes three columns. It is never
deleted and never edited.
"""

from uuid import UUID

import asyncpg
import pytest

from documents_support import configured_shop, issued, make_draft, refused_by_database
from test_consent import owner_sql

RESTRICT = asyncpg.exceptions.RestrictViolationError


@pytest.fixture
def shop(client_factory, monkeypatch):
    return configured_shop(client_factory, monkeypatch)


@pytest.fixture
def invoice(shop):
    return issued(shop.owner, "invoice", due_date="2026-12-31")


def refused(shop, sql: str, *args) -> Exception:
    error = refused_by_database(shop.tenant_id, sql, *args)
    assert error is not None, f"the database allowed: {sql}"
    return error


# ── the content of an issued document ─────────────────────────────────────────────────────

CONTENT_CHANGES = [
    ("total_minor", "total_minor + 100"),  # (also breaks gross - discount + tax = total)
    ("gross_minor", "gross_minor + 100"),
    ("number", "'INV-9999'"),
    ("seq", "seq + 1"),
    ("series_key", "'other'"),
    ("number_year", "2030"),
    ("issued_at", "issued_at + interval '1 day'"),
    ("issue_date", "issue_date + 1"),
    ("due_date", "due_date + 30"),
    ("kind", "'receipt'"),
    ("audience", "'business'"),
    ("languages", "'en'"),
    ("layout", "'a5'"),
    ("currency", "'SAR'"),
    ("currency_exponent", "3"),
    ("customer", "'{\"name\": \"Someone else\"}'::jsonb"),
    ("seller", "'{\"name\": \"Another shop\"}'::jsonb"),
    ("contact_id", "gen_random_uuid()"),
    ("payments", "'[]'::jsonb"),
    ("paid_minor", "0"),
    ("notes", "'{\"en\": \"changed\"}'::jsonb"),
    ("terms", "'{\"en\": \"changed\"}'::jsonb"),
    ("reason", "'changed'"),
    ("source", "'order'"),
    ("source_ref", "'1001'"),
    ("hash_version", "2"),
    ("content_hash", "repeat('0', 64)"),
    ("pdf_sha256", "repeat('0', 64)"),
    ("pdf_bytes", "pdf_bytes + 1"),
    ("issue_key", "'a-different-key'"),
    ("issued_by", "'Someone'"),
    ("created_by", "'Someone'"),
    ("status", "'draft'"),
]


@pytest.mark.parametrize("column,value", CONTENT_CHANGES, ids=[c for c, _ in CONTENT_CHANGES])
def test_no_column_of_an_issued_document_can_be_changed(shop, invoice, column, value):
    error = refused(shop, f"update documents set {column} = {value} where id = $1",
                    UUID(invoice["id"]))
    # Some of these also break a CHECK on the row; the point is that none is allowed.
    assert isinstance(error, (RESTRICT, asyncpg.exceptions.CheckViolationError))


def test_not_even_a_change_that_changes_nothing_is_allowed(shop, invoice):
    error = refused(shop, "update documents set number = number where id = $1", UUID(invoice["id"]))
    assert isinstance(error, RESTRICT) and "cannot be changed" in str(error)


def test_an_issued_document_cannot_be_deleted(shop, invoice):
    error = refused(shop, "delete from documents where id = $1", UUID(invoice["id"]))
    assert isinstance(error, RESTRICT) and "never deleted" in str(error)
    assert shop.owner.get(f"/api/documents/{invoice['id']}").status_code == 200


def test_the_table_owner_is_refused_too(shop, invoice):
    """The migration role owns the tables. The triggers still hold for it: only dropping the
    trigger (a migration, in a pull request) could change this."""
    for sql in (
        "update documents set total_minor = 1 where id = $1",
        "delete from documents where id = $1",
    ):
        with pytest.raises(RESTRICT):
            owner_sql(sql, UUID(invoice["id"]))


def test_the_application_cannot_switch_the_guard_off(shop, invoice):
    for sql in ("alter table documents disable trigger documents_guard",
                "drop trigger documents_guard on documents",
                "alter table documents disable trigger all",
                "set session_replication_role = replica"):
        assert isinstance(refused(shop, sql), asyncpg.exceptions.InsufficientPrivilegeError), sql
    assert isinstance(refused(shop, "truncate documents"),
                      asyncpg.exceptions.InsufficientPrivilegeError)


# ── lines and the PDF ─────────────────────────────────────────────────────────────────────


def test_the_lines_of_an_issued_document_cannot_be_changed_added_or_removed(shop, invoice):
    doc_id = UUID(invoice["id"])
    for sql in (
        "update document_lines set quantity = 99 where document_id = $1",
        "update document_lines set description = 'changed' where document_id = $1",
        "update document_lines set unit_price_minor = 1 where document_id = $1",
        "update document_lines set position = position + 10 where document_id = $1",
        "delete from document_lines where document_id = $1",
    ):
        assert "cannot change" in str(refused(shop, sql, doc_id)), sql
    added = refused(
        shop,
        "insert into document_lines (document_id, position, description, quantity, "
        "unit_price_minor, line_net_minor, tax_minor, line_total_minor) "
        "values ($1, 9, 'extra', 1, 100, 100, 0, 100)", doc_id)
    assert "cannot change" in str(added)
    assert owner_sql("select count(*) as n from document_lines where document_id = $1",
                     doc_id)[0]["n"] == 2


def test_the_pdf_is_never_replaced_or_removed(shop, invoice):
    doc_id = UUID(invoice["id"])
    for sql in ("update document_files set content = 'x'::bytea, bytes = 1 where document_id = $1",
                "delete from document_files where document_id = $1"):
        error = refused(shop, sql, doc_id)
        # The application role has no UPDATE or DELETE on this table at all.
        assert isinstance(error, asyncpg.exceptions.InsufficientPrivilegeError)
    # And the table owner, who does have the privilege, meets the trigger.
    with pytest.raises(RESTRICT):
        owner_sql("delete from document_files where document_id = $1", doc_id)
    with pytest.raises(RESTRICT):
        owner_sql("update document_files set bytes = bytes where document_id = $1", doc_id)


# ── a draft is still a draft ──────────────────────────────────────────────────────────────


def test_a_draft_can_be_edited_and_thrown_away_at_the_database_too(shop):
    draft = make_draft(shop.owner)
    doc_id = UUID(draft["id"])
    assert refused_by_database(shop.tenant_id,
                               "update documents set reason = 'x' where id = $1", doc_id) is None
    assert refused_by_database(shop.tenant_id,
                               "delete from documents where id = $1", doc_id) is None
    assert owner_sql("select count(*) as n from document_lines where document_id = $1",
                     doc_id)[0]["n"] == 0  # its lines went with it


def test_a_draft_cannot_pretend_to_be_issued(shop):
    """The statuses that need a number, a hash and a PDF cannot be set without them."""
    draft = make_draft(shop.owner)
    doc_id = UUID(draft["id"])
    for sql in (
        "update documents set status = 'issued' where id = $1",
        "update documents set status = 'void' where id = $1",
        "update documents set number = 'RC-0001' where id = $1",
        "update documents set content_hash = repeat('a', 64) where id = $1",
    ):
        assert refused(shop, sql, doc_id) is not None, sql


# ── cancelling: only through a credit note that covers it all ─────────────────────────────


def test_an_invoice_is_voided_only_by_a_credit_note_that_covers_it(shop, invoice):
    doc_id = UUID(invoice["id"])
    void = ("update documents set status = 'void', voided_at = now(), "
            "voided_by_document_id = {} where id = $1")
    # No credit note at all.
    assert refused(shop, void.format("gen_random_uuid()"), doc_id) is not None
    # A credit note that covers only part of it.
    half = shop.owner.post(f"/api/documents/{invoice['id']}/credit-note", json={
        "reason": "One item returned",
        "lines": [{"description": "Large date cake", "quantity": "1", "unit_price_minor": 4500}],
    })
    assert half.status_code == 201, half.text
    partial = half.json()["document"]
    assert shop.owner.get(f"/api/documents/{invoice['id']}").json()["document"]["status"] == "issued"
    error = refused(shop, void.format("$2"), doc_id, UUID(partial["id"]))
    assert "cover less than the whole" in str(error)
    # A credit note of another document does not do either.
    other = issued(shop.owner, "invoice")
    elsewhere = shop.owner.post(f"/api/documents/{other['id']}/credit-note",
                                json={"reason": "Cancelled"}).json()["document"]
    assert "points at it" in str(refused(shop, void.format("$2"), doc_id, UUID(elsewhere["id"])))


def test_a_voided_document_is_frozen_too_and_still_there(shop, invoice):
    credit = shop.owner.post(f"/api/documents/{invoice['id']}/credit-note",
                             json={"reason": "Order cancelled"})
    assert credit.status_code == 201, credit.text
    doc_id = UUID(invoice["id"])
    now_void = shop.owner.get(f"/api/documents/{invoice['id']}").json()["document"]
    assert now_void["status"] == "void" and now_void["voided_by"]["number"] == "CN-0001"
    for sql in ("update documents set status = 'issued' where id = $1",
                "update documents set total_minor = 0 where id = $1",
                "update documents set voided_at = now() where id = $1",
                "delete from documents where id = $1"):
        assert refused(shop, sql, doc_id) is not None, sql
    assert shop.owner.get(f"/api/documents/{invoice['id']}/pdf").status_code == 200


def test_credit_notes_cannot_add_up_to_more_than_the_invoice_even_by_hand(shop):
    """The service checks this; so does the database, for a script that skips the service."""
    invoice = issued(shop.owner, "invoice")
    # Credit almost all of it with a real credit note ...
    first = shop.owner.post(f"/api/documents/{invoice['id']}/credit-note", json={
        "reason": "Part returned",
        "lines": [{"description": "Returned", "quantity": "1", "unit_price_minor": 12000}],
    })
    assert first.status_code == 201
    over = shop.owner.post(f"/api/documents/{invoice['id']}/credit-note", json={
        "reason": "Too much", "lines": [{"description": "More", "quantity": "1",
                                          "unit_price_minor": 701}],
    })
    assert (over.status_code, over.json()["code"]) == (409, "credit_too_big")
    exact = shop.owner.post(f"/api/documents/{invoice['id']}/credit-note", json={
        "reason": "The rest", "lines": [{"description": "The rest", "quantity": "1",
                                          "unit_price_minor": 700}],
    })
    assert exact.status_code == 201
    assert shop.owner.get(f"/api/documents/{invoice['id']}").json()["document"]["status"] == "void"


# ── the table's own promises ──────────────────────────────────────────────────────────────


def test_a_number_exists_once_per_shop_by_index(shop):
    """The index that makes a repeated number impossible, whoever writes it."""
    indexes = {r["indexname"]: r["indexdef"] for r in owner_sql(
        "select indexname, indexdef from pg_indexes where tablename = 'documents'")}
    assert "UNIQUE" in indexes["documents_number"] and "(tenant_id, number)" in indexes["documents_number"]
    assert "UNIQUE" in indexes["documents_series_seq"]
    assert "UNIQUE" in indexes["documents_issue_key"]


def test_a_line_that_does_not_add_up_cannot_be_stored(shop):
    draft = make_draft(shop.owner)
    doc_id = UUID(draft["id"])
    error = refused(
        shop,
        "insert into document_lines (document_id, position, description, quantity, "
        "unit_price_minor, line_net_minor, tax_minor, line_total_minor) "
        "values ($1, 5, 'x', 2, 100, 199, 0, 199)", doc_id)
    assert isinstance(error, asyncpg.exceptions.CheckViolationError)


def test_a_draft_that_disagrees_with_its_lines_cannot_be_issued_by_hand(shop):
    """Issuing checks the totals against the lines, in the database, whoever asks."""
    draft = make_draft(shop.owner)
    doc_id = UUID(draft["id"])
    error = refused(
        shop,
        "update documents set gross_minor = gross_minor + 100, total_minor = total_minor + 100, "
        "paid_minor = paid_minor + 100, "
        "payments = '[{\"method\": \"cash\", \"amount_minor\": 12800}]'::jsonb, "
        "status = 'issued', series_key = 'main', number = 'RC-0001', seq = 1, "
        "issued_at = now(), issue_date = current_date, hash_version = 1, "
        "content_hash = repeat('a', 64), pdf_sha256 = repeat('a', 64), seller = '{}'::jsonb "
        "where id = $1", doc_id)
    assert "do not match the lines" in str(error)
