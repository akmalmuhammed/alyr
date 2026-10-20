"""A sale from another system becomes one document, once (ALY-142, spec 015).

Idempotency is the heart of it: a till that did not hear the answer sends the sale again, and the
customer must not be invoiced twice. These tests send the same sale twice, six times at once,
under other keys, with other bodies, and check the totals, the customer, the Catalog link, the
limits and what is left behind when a sale is refused. Everything goes through the real path:
PostgreSQL, the HTTP API, the job queue and a stand-in for WhatsApp.
"""

from uuid import UUID

import pytest

from alyr.core.team import Actor
from alyr.modules.connect import ingest
from alyr.modules.connect.schemas import SaleIn
from connect_support import (
    LINES_MINOR,
    connected_shop,
    documents_of,
    rows,
    sale_body,
    series_counters,
)
from documents_sales_support import concurrently, customer
from documents_support import LINES_TOTAL
from pdf_support import page_text
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return connected_shop(client_factory, monkeypatch)


def sender_of(shop):
    return ingest.Sender(Actor(None, "API key Till 1", via="api"), via="api",
                         api_key_id=UUID(shop.key["id"]), key_prefix=shop.key["prefix"])


# ── the plain case ───────────────────────────────────────────────────────────────────────


def test_a_sale_makes_a_receipt_with_alyrs_number(shop):
    answer = shop.post_sale(sale_body("POS-1"), "idem-plain-0001")
    assert answer.status_code == 201, answer.text
    made = answer.json()
    assert made["replayed"] is False
    assert made["document"]["kind"] == "receipt"
    assert made["document"]["number"] == "RC-0001"
    assert made["document"]["number_authority"] == "alyr"
    assert made["document"]["totals"]["total_minor"] == LINES_TOTAL
    assert made["sale"]["external_sale_id"] == "POS-1"
    # The PDF is ALYR's own, with the shop's name and the customer's.
    pdf = shop.machine.get(f"/api/connect/documents/{made['document']['id']}/pdf",
                           headers=shop.headers())
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    text = page_text(pdf.content)
    assert "RC-0001" in text and "Qirfa Bakery" in text
    assert "seller's own system" not in text


def test_an_invoice_for_an_unpaid_sale_has_a_balance(shop):
    made = shop.sale(sale_body("POS-2", "invoice"))
    assert made["document"]["number"] == "INV-0001"
    assert made["document"]["totals"]["balance_minor"] == LINES_TOTAL
    partly = shop.sale(sale_body("POS-3", "invoice", payment={
        "method": "bank_transfer", "amount_minor": 5000, "reference": "TRF-1"}))
    assert partly["document"]["totals"]["paid_minor"] == 5000
    assert partly["document"]["totals"]["balance_minor"] == LINES_TOTAL - 5000


def test_the_other_systems_number_is_remembered_when_alyr_numbers_the_paper(shop):
    made = shop.sale(sale_body("POS-4", external_document_number="R-100234"))
    assert made["sale"]["external_document_number"] == "R-100234"
    assert made["document"]["number"] == "RC-0001"  # ALYR's, as the shop chose


def test_a_sale_can_be_read_back(shop):
    shop.sale(sale_body("POS-5"))
    found = shop.machine.get("/api/connect/sales/POS-5", headers=shop.headers())
    assert found.status_code == 200 and found.json()["document"]["number"] == "RC-0001"
    assert shop.machine.get("/api/connect/sales/NOPE", headers=shop.headers()).status_code == 404


# ── idempotency ──────────────────────────────────────────────────────────────────────────


def test_a_sale_posted_twice_with_the_same_key_makes_one_document(shop):
    body = sale_body("POS-10")
    first = shop.post_sale(body, "idem-twice-0001")
    again = shop.post_sale(body, "idem-twice-0001")
    assert first.status_code == 201 and again.status_code == 200
    assert again.json()["replayed"] is True
    assert again.json()["document"]["id"] == first.json()["document"]["id"]
    assert len(documents_of(shop.shop)) == 1
    assert series_counters(shop.shop)[("receipt", "main")] == 1


def test_the_same_key_with_another_body_is_refused(shop):
    shop.post_sale(sale_body("POS-11"), "idem-clash-0001")
    other = sale_body("POS-11")
    other["lines"] = [{**LINES_MINOR[0], "quantity": "13"}]
    other["totals"] = {"total_minor": 13 * 350}
    other["payment"] = {"method": "cash", "amount_minor": 13 * 350}
    refused = shop.post_sale(other, "idem-clash-0001")
    assert refused.status_code == 409 and refused.json()["code"] == "idempotency_key_reused"
    assert len(documents_of(shop.shop)) == 1


def test_the_same_sale_under_a_new_key_is_still_one_document(shop):
    body = sale_body("POS-12")
    first = shop.post_sale(body, "idem-key-a-0001")
    second = shop.post_sale(body, "idem-key-b-0001")  # a retry from a till that lost its key
    assert second.status_code == 200 and second.json()["replayed"] is True
    assert second.json()["document"]["id"] == first.json()["document"]["id"]
    assert len(documents_of(shop.shop)) == 1


def test_the_same_sale_with_another_body_under_a_new_key_is_refused(shop):
    shop.post_sale(sale_body("POS-13"), "idem-key-a-0002")
    other = sale_body("POS-13", customer={"phone": "+974 5555 0188", "name": "Someone else"})
    refused = shop.post_sale(other, "idem-key-b-0002")
    assert refused.status_code == 409 and refused.json()["code"] == "sale_exists"
    assert len(documents_of(shop.shop)) == 1


def test_six_identical_requests_at_the_same_moment_make_one_document(shop):
    sale = SaleIn.model_validate(sale_body("POS-14"))

    def work():
        async def go(conn):
            return await ingest.accept(conn, sender_of(shop), sale, "idem-race-0001")
        return go

    results = concurrently(shop.owner, shop.tenant_id, *[work() for _ in range(6)])
    assert not [r for r in results if isinstance(r, Exception)], results
    assert len({r["document"]["id"] for r in results}) == 1
    assert sorted(r["replayed"] for r in results) == [False] + [True] * 5
    assert len(documents_of(shop.shop)) == 1
    assert series_counters(shop.shop)[("receipt", "main")] == 1


def test_six_requests_for_one_sale_under_six_keys_make_one_document(shop):
    sale = SaleIn.model_validate(sale_body("POS-15"))

    def work(n):
        async def go(conn):
            return await ingest.accept(conn, sender_of(shop), sale, f"idem-many-key-{n}")
        return go

    results = concurrently(shop.owner, shop.tenant_id, *[work(n) for n in range(6)])
    assert not [r for r in results if isinstance(r, Exception)], results
    assert len({r["document"]["id"] for r in results}) == 1
    assert len(documents_of(shop.shop)) == 1


def test_one_key_for_two_different_sales_at_the_same_moment_is_one_sale_and_one_refusal(shop):
    """The key's own lock: two different sales that carry the same key must not both go in
    (without it the second fails on the database's unique index instead of being told 409)."""
    first = SaleIn.model_validate(sale_body("POS-16"))
    second = SaleIn.model_validate(sale_body("POS-17", customer={
        "phone": "+974 5555 0188", "name": "Someone else"}))

    def work(sale):
        async def go(conn):
            return await ingest.accept(conn, sender_of(shop), sale, "idem-samekey-0001")
        return go

    results = concurrently(shop.owner, shop.tenant_id, work(first), work(second))
    made = [r for r in results if isinstance(r, dict)]
    refused = [r for r in results if not isinstance(r, dict)]
    assert len(made) == 1 and len(refused) == 1, results
    assert getattr(refused[0], "code", "") == "idempotency_key_reused", refused
    assert len(documents_of(shop.shop)) == 1


def test_simultaneous_different_sales_get_numbers_without_a_hole(shop):
    def work(n):
        sale = SaleIn.model_validate(sale_body(f"POS-2{n}"))

        async def go(conn):
            return await ingest.accept(conn, sender_of(shop), sale, f"idem-diff-{n:04d}-xx")
        return go

    results = concurrently(shop.owner, shop.tenant_id, *[work(n) for n in range(8)])
    assert not [r for r in results if isinstance(r, Exception)], results
    numbers = sorted(r["document"]["number"] for r in results)
    assert numbers == [f"RC-{n:04d}" for n in range(1, 9)]


def test_the_key_is_required_and_must_be_well_formed(shop):
    no_key = shop.machine.post("/api/connect/sales", json=sale_body(), headers=shop.headers())
    assert no_key.status_code == 400 and no_key.json()["code"] == "idempotency_key_needed"
    short = shop.post_sale(sale_body(), "short")
    assert short.status_code == 400 and short.json()["code"] == "idempotency_key_needed"
    odd = shop.post_sale(sale_body(), "has spaces in it!")
    assert odd.status_code == 400
    assert documents_of(shop.shop) == []


def test_a_refused_sale_leaves_nothing_behind(shop):
    bad = sale_body("POS-30", totals={"total_minor": LINES_TOTAL + 500})
    answer = shop.post_sale(bad, "idem-bad-0001")
    assert answer.status_code == 422
    assert documents_of(shop.shop) == []
    assert rows("select count(*) as n from contacts where tenant_id = $1 "
                "and phone = '97455550199'", shop.tenant_id)[0]["n"] == 0
    assert rows("select count(*) as n from connect_sales where tenant_id = $1",
                shop.tenant_id)[0]["n"] == 0
    assert series_counters(shop.shop).get(("receipt", "main"), 0) == 0
    # The same sale, corrected, goes through under the same key: nothing was spent.
    assert shop.post_sale(sale_body("POS-30"), "idem-bad-0001").status_code == 201


# ── what was sent is checked ─────────────────────────────────────────────────────────────


def test_a_total_that_does_not_match_the_lines_is_refused_with_both_numbers(shop):
    answer = shop.post_sale(sale_body(totals={"total_minor": LINES_TOTAL + 100}),
                            "idem-total-0001")
    assert answer.status_code == 422
    body = answer.json()
    assert body["code"] == "totals_mismatch"
    assert body["expected_total_minor"] == LINES_TOTAL
    assert body["sent_total_minor"] == LINES_TOTAL + 100
    assert body["tolerance_minor"] == 2 and "message_ar" in body


def test_a_difference_of_a_minor_unit_a_line_is_put_on_the_paper_as_rounding(shop):
    # The till printed 127.01 where per-line rounding gives 127.00: the paper says so.
    sold = shop.sale(sale_body("POS-31", totals={"total_minor": LINES_TOTAL + 1},
                               payment={"method": "cash", "amount_minor": LINES_TOTAL + 1}))
    totals = sold["document"]["totals"]
    assert totals["total_minor"] == LINES_TOTAL + 1
    assert totals["rounding_minor"] == 1


def test_the_tills_own_cash_rounding_is_kept(shop):
    sold = shop.sale(sale_body(
        "POS-32", totals={"total_minor": LINES_TOTAL - 2, "rounding_minor": -2},
        payment={"method": "cash", "amount_minor": LINES_TOTAL - 2}))
    assert sold["document"]["totals"]["rounding_minor"] == -2
    assert sold["document"]["totals"]["total_minor"] == LINES_TOTAL - 2


def test_a_declared_tax_or_discount_that_disagrees_is_refused(shop):
    bad_discount = shop.post_sale(sale_body(
        totals={"total_minor": LINES_TOTAL, "discount_minor": 100}), "idem-disc-0001")
    assert bad_discount.status_code == 422
    assert bad_discount.json()["field"] == "totals.discount_minor"
    good = shop.post_sale(sale_body(
        "POS-33", totals={"total_minor": LINES_TOTAL, "discount_minor": 500, "tax_minor": 0}),
        "idem-disc-0002")
    assert good.status_code == 201, good.text


def test_money_must_be_whole_minor_units_and_unknown_fields_are_refused(shop):
    floaty = sale_body()
    floaty["lines"] = [{**LINES_MINOR[0], "unit_price_minor": 3.5}]
    answer = shop.post_sale(floaty, "idem-float-0001")
    assert answer.status_code == 422 and answer.json()["code"] == "validation_error"
    assert any("unit_price_minor" in str(p["loc"]) for p in answer.json()["detail"])
    misspelt = sale_body()
    misspelt["lines"] = [{**LINES_MINOR[0], "unit_price": 350}]
    answer = shop.post_sale(misspelt, "idem-typo-0001")
    assert answer.status_code == 422
    assert any("unit_price" in str(p["loc"]) for p in answer.json()["detail"])
    broken = shop.machine.post("/api/connect/sales", content=b"{not json",
                               headers={**shop.headers("idem-json-0001"),
                                        "Content-Type": "application/json"})
    assert broken.status_code == 422 and broken.json()["code"] == "validation_error"


def test_every_problem_is_listed_not_just_the_first(shop):
    body = sale_body()
    body["lines"] = []
    del body["customer"]
    answer = shop.post_sale(body, "idem-many-0001")
    locs = [".".join(map(str, p["loc"])) for p in answer.json()["detail"]]
    assert any(loc.startswith("lines") for loc in locs)
    assert any(loc.startswith("customer") for loc in locs)


def test_the_phone_must_be_international(shop):
    for bad in ("0555 0199", "5555 0199", "+0 555 5555", "abc", "+97455"):
        answer = shop.post_sale(sale_body(customer={"phone": bad, "name": "X"}),
                                f"idem-{abs(hash(bad))}-xx")
        assert answer.status_code == 422, bad
        assert answer.json()["code"] == "phone_invalid"
    for good in ("+974 5555 0123", "00974 5555 0124", "+974-5555-0125", "+97455550126"):
        assert shop.post_sale(sale_body(customer={"phone": good, "name": "X"}),
                              f"idem-{abs(hash(good))}-yy").status_code == 201, good


def test_limits_on_size_and_number_of_lines(shop):
    many = sale_body()
    many["lines"] = [{**LINES_MINOR[0]} for _ in range(201)]
    many["totals"] = {"total_minor": 201 * 12 * 350}
    many["payment"] = {"method": "cash", "amount_minor": 201 * 12 * 350}
    assert shop.post_sale(many, "idem-lines-0001").status_code == 422
    huge = sale_body(customer={"phone": "+974 5555 0199", "name": "X", "address": "y" * 20})
    huge["note"] = "z" * (600 * 1024)
    answer = shop.post_sale(huge, "idem-huge-0001")
    assert answer.status_code == 413 and answer.json()["code"] == "body_too_large"
    exactly = sale_body("POS-40")
    exactly["lines"] = [{**LINES_MINOR[0]} for _ in range(200)]
    exactly["totals"] = {"total_minor": 200 * 12 * 350}
    exactly["payment"] = {"method": "cash", "amount_minor": 200 * 12 * 350}
    assert shop.post_sale(exactly, "idem-lines-0002").status_code == 201


def test_what_a_kind_needs_before_it_is_issued(shop):
    unpaid_receipt = shop.post_sale(sale_body(payment="unpaid"), "idem-need-0001")
    assert unpaid_receipt.json()["code"] == "receipt_needs_payment"
    part_paid_receipt = shop.post_sale(
        sale_body(payment={"method": "cash", "amount_minor": 1000}), "idem-need-0002")
    assert part_paid_receipt.json()["code"] == "receipt_needs_payment"
    too_much = shop.post_sale(
        sale_body("POS-41", "invoice", payment={"method": "cash",
                                                "amount_minor": LINES_TOTAL + 1}),
        "idem-need-0003")
    assert too_much.json()["code"] == "payment_too_big"
    no_name = shop.post_sale(sale_body(
        "POS-42", "invoice", customer={"phone": "+974 5555 0123"}), "idem-need-0004")
    assert no_name.json()["code"] == "customer_name_needed"
    quote_paid = shop.post_sale(sale_body(
        "POS-43", "quote", payment={"method": "cash", "amount_minor": 100}), "idem-need-0005")
    assert quote_paid.json()["code"] == "payment_not_for_kind"
    nameless_receipt = shop.post_sale(sale_body(
        "POS-44", customer={"phone": "+974 5555 0123"}), "idem-need-0006")
    assert nameless_receipt.status_code == 201  # "a customer": the number says who
    assert nameless_receipt.json()["customer"]["created"] is True


def test_an_invoice_needs_the_shops_registration_number_unless_the_other_system_owns_them(
        client_factory, monkeypatch):
    no_cr = connected_shop(client_factory, monkeypatch, cr=False)
    refused = no_cr.post_sale(sale_body("POS-50", "invoice"), "idem-cr-0001")
    assert refused.status_code == 422 and refused.json()["code"] == "registration_needed"
    receipt = no_cr.post_sale(sale_body("POS-51"), "idem-cr-0002")
    assert receipt.status_code == 201  # a receipt needs none


def test_the_currency_and_the_day_of_the_sale_are_checked(shop):
    odd = shop.post_sale(sale_body(currency="EUR"), "idem-cur-0001")
    assert odd.status_code == 422 and odd.json()["code"] == "currency_not_supported"
    future = shop.post_sale(sale_body(sold_at="2999-01-01T10:00:00+03:00"), "idem-cur-0002")
    assert future.status_code == 422 and future.json()["code"] == "sold_at_invalid"
    old = shop.post_sale(sale_body(sold_at="2020-01-01T10:00:00+03:00"), "idem-cur-0003")
    assert old.status_code == 422 and old.json()["code"] == "sold_at_invalid"
    branch = shop.post_sale(sale_body(branch="nowhere"), "idem-cur-0004")
    assert branch.status_code == 422 and branch.json()["code"] == "branch_unknown"


def test_terms_must_have_been_accepted_for_a_sale_to_be_taken(client_factory, monkeypatch):
    shop = connected_shop(client_factory, monkeypatch)
    owner_sql("update document_settings set connect_terms_version = null where tenant_id = $1",
              shop.tenant_id)
    refused = shop.post_sale(sale_body(), "idem-terms-0001")
    assert refused.status_code == 409 and refused.json()["code"] == "terms_not_accepted"


# ── the customer, and the Catalog ────────────────────────────────────────────────────────


def test_a_new_customer_is_made_and_a_known_one_is_kept(shop):
    known = customer(shop.shop, "Huda Al-Naimi", phone="97455550177", lang="ar")
    first = shop.sale(sale_body("POS-60", customer={"phone": "+974 5555 0188", "name": "Maha",
                                                    "name_ar": "مها"}, language="ar"))
    assert first["customer"]["created"] is True
    [maha] = rows("select name, lang, role from contacts where tenant_id = $1 "
                  "and phone = '97455550188'", shop.tenant_id)
    assert (maha["name"], maha["lang"], maha["role"]) == ("Maha", "ar", "customer")
    again = shop.sale(sale_body("POS-61", customer={"phone": "+974 5555 0177",
                                                    "name": "A different name"}))
    assert again["customer"]["created"] is False
    assert again["customer"]["contact_id"] == known.id
    [huda] = rows("select name from contacts where id = $1", UUID(known.id))
    assert huda["name"] == "Huda Al-Naimi"  # the shop's own record is not renamed by a till


def test_lines_are_linked_to_the_catalog_by_sku_and_no_stock_moves(shop):
    made = shop.shop.owner.post("/api/items", json={
        "name": "Fresh Arabic bread", "name_ar": "خبز عربي طازج", "price": 350, "status": "live",
        "sku": "BR-01"})
    assert made.status_code == 200, made.text
    item_id = made.json()["item"]["id"]
    before = rows("select count(*) as n from stock_movements where tenant_id = $1",
                  shop.tenant_id)[0]["n"]
    lines = [{**LINES_MINOR[0], "sku": "br-01"}, LINES_MINOR[1]]
    sold = shop.sale(sale_body("POS-62", lines=lines))
    assert [m["item_id"] for m in sold["matched_items"]] == [item_id]
    assert sold["matched_items"][0]["position"] == 1 and sold["matched_items"][0]["sku"] == "br-01"
    after = rows("select count(*) as n from stock_movements where tenant_id = $1",
                 shop.tenant_id)[0]["n"]
    assert after == before  # the other system owns its stock


def test_the_sale_and_its_customer_are_private_to_the_shop(client_factory, monkeypatch):
    a = connected_shop(client_factory, monkeypatch)
    b = connected_shop(client_factory, monkeypatch)
    a.sale(sale_body("POS-70"))
    from documents_support import as_app

    async def see(conn):
        return (await conn.fetchval("select count(*) from connect_sales"),
                await conn.fetchval("select count(*) from documents"),
                await conn.fetchval("select count(*) from contacts"))

    assert as_app(b.tenant_id, see) == (0, 0, 0)
    assert as_app(a.tenant_id, see)[0] == 1
    # The same external sale ID in two shops is two sales.
    assert b.post_sale(sale_body("POS-70"), "idem-priv-0001").status_code == 201


def test_a_sale_is_on_the_activity_record(shop):
    sold = shop.sale(sale_body("POS-71"))
    from documents_sales_support import activity

    seen = activity(shop.shop, "document", sold["document"]["id"], "sale_received")
    assert seen and seen[0]["detail"]["external_sale_id"] == "POS-71"
    assert seen[0]["detail"]["via"] == "api" and seen[0]["actor_name"] == "API key Till 1"


def test_the_documents_module_off_refuses_a_sale(client_factory, monkeypatch):
    shop = connected_shop(client_factory, monkeypatch)
    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'documents'",
              shop.tenant_id)
    answer = shop.post_sale(sale_body(), "idem-off-0001")
    assert answer.status_code == 403 and answer.json()["code"] == "module_off"
