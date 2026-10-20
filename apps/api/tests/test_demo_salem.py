"""The demo shop for ALYR Invoices (ALY-141): Salem Maintenance, made by the same command as the
Catalog's demo shops, safe to run again (it leaves its papers alone), and not able to touch a shop
that is not the demo.
"""

import asyncio
import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from alyr import seed_catalog_demos, seed_invoices_demo
from alyr.db import Database
from alyr.demo.build import Refused
from conftest import APP_DSN, OWNER_DSN
from test_consent import owner_sql

NOW = datetime(2026, 10, 20, 10, 30, tzinfo=UTC)
WEB = "http://web.test"


def run(coro):
    return asyncio.run(coro)


async def make(now=NOW) -> dict:
    owner, app = Database(OWNER_DSN), Database(APP_DSN)
    await owner.connect()
    await app.connect()
    try:
        return await seed_invoices_demo.make(owner, app, now)
    finally:
        await owner.close()
        await app.close()


@pytest.fixture(scope="module")
def salem():
    owner_sql("delete from tenants where slug = 'salem-maintenance' and id <> $1",
              seed_invoices_demo.SALEM_TENANT_ID)
    return run(make())


def rows(sql, *args):
    return [dict(r) for r in owner_sql(sql, seed_invoices_demo.SALEM_TENANT_ID, *args)]


def test_it_is_made_with_documents_and_payment_links_and_nothing_else(salem):
    assert salem == {"customers": 3, "saved lines": 4, "documents": 5}
    assert {r["module_key"] for r in rows(
        "select module_key from tenant_modules where tenant_id = $1 and enabled")} == {
        "documents", "payments"}
    [shop] = rows("select name, slug, business_type, onboarding_way from tenants where id = $1")
    assert (shop["slug"], shop["business_type"], shop["onboarding_way"]) == (
        "salem-maintenance", "invoices", "invoices")
    assert [r["role"] for r in rows(
        "select role from memberships where tenant_id = $1 order by role")] == ["agent", "owner"]
    assert rows("select count(*) as n from channel_numbers where tenant_id = $1 "
                "and channel = 'simulator'")[0]["n"] == 1


def test_it_has_saved_lines_customers_and_a_staff_number_for_the_message_demo(salem):
    lines = rows("select name, name_ar, price_minor from saved_lines where tenant_id = $1 "
                 "order by price_minor desc")
    assert [r["name"] for r in lines] == ["AC repair", "AC deep clean", "Inspection visit",
                                          "Filter change"]
    assert all(r["name_ar"] for r in lines)
    people = rows("select name, name_ar, company, phone, consent_service from contacts "
                  "where tenant_id = $1 and role = 'customer' order by name")
    assert [r["name"] for r in people] == ["Ahmed Al Thani", "Doha Villas Co.", "Sara Al Mulla"]
    assert people[0]["consent_service"] == "granted"       # asked for WhatsApp, on the test line
    assert people[1]["consent_service"] == "unknown"
    [staff] = rows("select name, phone from contacts where tenant_id = $1 and role = 'staff'")
    assert staff["phone"] == seed_invoices_demo.STAFF_PHONE


def test_its_book_has_an_unpaid_invoice_a_paid_one_with_its_receipt_and_a_walk_in_receipt(salem):
    docs = rows("select kind, number, status, total_minor, paid_minor, source from documents "
                "where tenant_id = $1 order by seq, kind")
    by = {(d["kind"], d["number"]): d for d in docs}
    assert set(by) == {("invoice", "INV-0001"), ("invoice", "INV-0002"), ("invoice", "INV-0003"),
                       ("receipt", "RC-0001"), ("receipt", "RC-0002")}
    assert by[("invoice", "INV-0001")]["total_minor"] == 105000        # three deep cleans
    [request] = rows("select amount, status, document_id from payment_requests "
                     "where tenant_id = $1 and status = 'pending' order by amount desc limit 1")
    assert request["amount"] == 105000                                  # the company's, still open
    owing = rows("select d.number from documents d where d.tenant_id = $1 and d.kind = 'invoice' "
                 "and d.paid_minor = 0 and not exists (select 1 from manual_payments m "
                 "where m.subject_id = d.id) order by d.number")
    assert [r["number"] for r in owing] == ["INV-0001", "INV-0003"]
    # the paid one carries the payment by hand and the receipt that goes with it
    paid = rows("select m.amount_minor, m.method, m.receipt_document_id from manual_payments m "
                "where m.tenant_id = $1")
    assert [(p["amount_minor"], p["method"]) for p in paid] == [(50000, "cash")]
    assert paid[0]["receipt_document_id"] is not None
    notes = json.loads(rows("select notes from document_settings where tenant_id = $1")[0]["notes"])
    assert "14 days" in notes["invoice"]["en"] and notes["invoice"]["ar"]


def test_a_second_run_leaves_the_papers_as_they_are(salem):
    before = rows("select count(*) as n from documents where tenant_id = $1")[0]["n"]
    assert run(make()) == {}
    assert rows("select count(*) as n from documents where tenant_id = $1")[0]["n"] == before == 5
    assert rows("select count(*) as n from contacts where tenant_id = $1 and role = 'customer'"
                )[0]["n"] == 3


def test_the_command_knows_the_shop_and_lists_it(capsys):
    assert run(seed_catalog_demos.main(["--list"])) == 0
    said = capsys.readouterr().out
    assert "Salem Maintenance" in said and "owner@demo-salem.example" in said
    assert "invoice Ahmed 500 for AC repair" in said
    assert run(seed_catalog_demos.main(["--only", "salem", "--list"])) == 0
    only = capsys.readouterr().out
    assert "Salem Maintenance" in only and "Zaytoun" not in only
    assert run(seed_catalog_demos.main(["--only", "nonesuch"])) == 2
    refused = capsys.readouterr().out
    assert "Unknown shop" in refused and "salem" in refused


def test_it_will_not_take_over_an_address_that_belongs_to_a_real_shop():
    owner_sql("update tenants set slug = $2 where id = $1 and slug = 'salem-maintenance'",
              seed_invoices_demo.SALEM_TENANT_ID, f"moved-{uuid4().hex[:6]}")
    real = owner_sql("insert into tenants (name, slug) values ('Real shop', 'salem-maintenance') "
                     "returning id")[0]["id"]
    try:
        with pytest.raises(Refused) as refusal:
            run(make())
        assert "not the demo" in str(refusal.value)
        assert owner_sql("select name from tenants where id = $1", real)[0]["name"] == "Real shop"
    finally:
        owner_sql("delete from tenants where id = $1", real)
        owner_sql("update tenants set slug = 'salem-maintenance' where id = $1",
                  seed_invoices_demo.SALEM_TENANT_ID)
