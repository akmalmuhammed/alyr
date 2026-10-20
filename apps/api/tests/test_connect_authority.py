"""Who owns the numbers (ALY-142, spec 015).

A shop that keeps another POS gives the numbering of a kind of document to it. From then on ALYR
never allocates a number for that kind: the paper carries the other system's number, ALYR's
counters stay where they were, ALYR's own automatic documents for that kind are skipped (so
nothing is on paper twice), and the database holds both systems to it. The decision for ALYR's
own hooks: **skip, and say so on the record** (`document_skipped`, reason `external_authority`).
An order confirmation is not issued in its place; the order's own WhatsApp messages are as they
were, and the shop's other system issues the receipt when it rings the sale up and sends it.
"""

from uuid import UUID, uuid4

import asyncpg
import pytest

from alyr.core.team import Actor
from alyr.modules.documents import sales, service
from connect_support import (
    LINES_MINOR,
    authority,
    connected_shop,
    documents_of,
    rows,
    sale_body,
    series_counters,
)
from documents_sales_support import (
    activity,
    customer,
    documents,
    pay_by_link,
    placed,
    run_in_app,
)
from documents_support import LINES_TOTAL, draft_body
from pdf_support import page_text


@pytest.fixture
def shop(client_factory, monkeypatch):
    return connected_shop(client_factory, monkeypatch)


def external_sale(shop, sale_id, number, kind="receipt", **more):
    return shop.sale(sale_body(sale_id, kind, external_document_number=number, **more))


# ── the setting ──────────────────────────────────────────────────────────────────────────


def test_every_kind_starts_with_alyr_and_a_statement_cannot_be_handed_over(shop):
    start = shop.owner.get("/api/connect-setup/overview").json()["authority"]
    assert set(start.values()) == {"alyr"}
    assert "statement" not in start
    refused = shop.owner.put("/api/connect-setup/authority",
                             json={"changes": {"statement": "external"}})
    assert refused.status_code == 422 and refused.json()["code"] == "kind_unknown"
    assert shop.owner.put("/api/connect-setup/authority",
                          json={"changes": {"receipt": "somebody"}}).status_code == 422


def test_only_owners_and_admins_change_it_and_every_change_is_on_the_record(shop):
    assert shop.shop.agent.put("/api/connect-setup/authority",
                               json={"changes": {"receipt": "external"}}).status_code == 403
    done = shop.shop.admin.put("/api/connect-setup/authority",
                               json={"changes": {"receipt": "external", "invoice": "external"}})
    assert done.status_code == 200 and done.json()["authority"]["receipt"] == "external"
    seen = activity(shop.shop, "document", shop.tenant_id, "authority_changed")
    assert {(a["detail"]["kind"], a["detail"]["from"], a["detail"]["to"]) for a in seen} == {
        ("receipt", "alyr", "external"), ("invoice", "alyr", "external")}
    authority(shop.shop, receipt="external")  # no change, no new record
    assert len(activity(shop.shop, "document", shop.tenant_id, "authority_changed")) == 2


# ── the paper carries the other system's number ──────────────────────────────────────────


def test_with_external_authority_the_number_is_the_other_systems_and_alyr_takes_none(shop):
    authority(shop.shop, receipt="external")
    sold = external_sale(shop, "E-1", "R-5001")
    assert sold["document"]["number"] == "R-5001"
    assert sold["document"]["number_authority"] == "external"
    external_sale(shop, "E-2", "R-5002")
    [first, second] = documents_of(shop.shop)
    assert (first["series_key"], first["seq"]) == ("EXT", None)
    assert (second["number"], second["seq"]) == ("R-5002", None)
    # ALYR's counter for receipts never moved, and the other kinds still count from one.
    assert series_counters(shop.shop)[("receipt", "main")] == 0
    invoice = shop.sale(sale_body("E-3", "invoice"))
    assert invoice["document"]["number"] == "INV-0001"
    assert invoice["document"]["number_authority"] == "alyr"


def test_the_paper_says_the_shops_own_system_issued_it_and_alyr_delivered_it(shop):
    authority(shop.shop, receipt="external")
    sold = external_sale(shop, "E-4", "R-5003")
    pdf = shop.machine.get(f"/api/connect/documents/{sold['document']['id']}/pdf",
                           headers=shop.headers())
    text = page_text(pdf.content)
    assert "R-5003" in text
    assert "seller's own system" in text and "Delivered by ALYR" in text
    # It is a recorded, hashed document like any other, and says whose number it is.
    verify = shop.owner.get(f"/api/documents/{sold['document']['id']}/verify")
    assert verify.status_code == 200 and verify.json()["ok"] is True
    detail = shop.owner.get(f"/api/documents/{sold['document']['id']}").json()["document"]
    assert detail["number_authority"] == "external" and detail["series_key"] == "EXT"
    assert detail["source"] == "external" and detail["source_ref"] == "E-4"


def test_the_other_systems_number_is_required_valid_and_never_reused(shop):
    authority(shop.shop, receipt="external")
    missing = shop.post_sale(sale_body("E-5"), "idem-num-0001")
    assert missing.status_code == 422 and missing.json()["code"] == "external_number_needed"
    for bad in ("", "  ", "a" * 81, "R-50\n04", "<script>", "-lead"):
        answer = shop.post_sale(sale_body("E-5", external_document_number=bad),
                                f"idem-num-{abs(hash(bad))}")
        assert answer.status_code == 422, repr(bad)
    external_sale(shop, "E-6", "R-5005")
    clash = shop.post_sale(sale_body("E-7", external_document_number="R-5005"), "idem-num-0002")
    assert clash.status_code == 409 and clash.json()["code"] == "number_taken"
    assert len(documents_of(shop.shop)) == 1


def test_an_outside_invoice_needs_no_registration_number_from_alyr(client_factory, monkeypatch):
    shop = connected_shop(client_factory, monkeypatch, cr=False)
    authority(shop.shop, invoice="external")
    sold = external_sale(shop, "E-8", "INV-77", "invoice")
    assert sold["document"]["kind"] == "invoice" and sold["document"]["number"] == "INV-77"


# ── ALYR never numbers what the other system owns ────────────────────────────────────────


def test_no_door_in_alyr_allocates_a_number_for_a_kind_that_is_the_other_systems(shop):
    # A draft made while ALYR still numbered receipts cannot be issued once it does not.
    early = shop.owner.post("/api/documents", json=draft_body("receipt"))
    assert early.status_code == 201
    authority(shop.shop, receipt="external", invoice="external", credit_note="external")
    assert shop.owner.post(f"/api/documents/{early.json()['document']['id']}/issue",
                           headers={"Idempotency-Key": "late-issue-0001"}).status_code == 409
    for body in (draft_body("receipt"), draft_body("invoice", due_date="2026-12-31")):
        draft = shop.owner.post("/api/documents", json=body)
        assert draft.status_code == 409, body["kind"]
        assert draft.json()["code"] == "external_authority"
        issued = shop.owner.post("/api/documents", json={**body, "issue": True},
                                 headers={"Idempotency-Key": f"issue-{uuid4().hex}"})
        assert issued.status_code == 409 and issued.json()["code"] == "external_authority"
        assert "message_ar" in issued.json()
    # A kind still ALYR's is untouched.
    assert shop.owner.post("/api/documents", json=draft_body("quote")).status_code == 201
    assert series_counters(shop.shop).get(("receipt", "main"), 0) == 0
    assert series_counters(shop.shop).get(("invoice", "main"), 0) == 0
    assert [d for d in documents_of(shop.shop) if d["number"]] == []


def test_alyrs_own_receipt_for_a_paid_order_is_skipped_and_the_sale_goes_on(shop):
    authority(shop.shop, receipt="external")
    who = customer(shop.shop, "Huda Al-Naimi")
    order = placed(shop.shop, who)
    assert pay_by_link(shop.shop, order).status_code == 200
    assert documents(shop.shop) == []
    seen = activity(shop.shop, "order", order["order_id"], "document_skipped")
    assert seen and seen[0]["detail"] == {"kind": "receipt", "reason": "external_authority"}
    paid = rows("select payment from orders where id = $1", UUID(order["order_id"]))
    assert paid[0]["payment"] == "paid"
    assert series_counters(shop.shop)[("receipt", "main")] == 0


def test_alyrs_own_invoice_for_a_credit_sale_is_skipped(shop):
    authority(shop.shop, invoice="external")
    who = customer(shop.shop, "Huda Al-Naimi", credit_limit=100_000)
    order = placed(shop.shop, who, payment="account")
    assert documents(shop.shop) == []
    seen = activity(shop.shop, "order", order["order_id"], "document_skipped")
    assert seen and seen[0]["detail"]["reason"] == "external_authority"


def test_a_credit_note_on_cancel_is_skipped_when_credit_notes_are_the_other_systems(shop):
    who = customer(shop.shop, "Huda Al-Naimi")
    order = placed(shop.shop, who)
    pay_by_link(shop.shop, order)
    assert [d["kind"] for d in documents(shop.shop)] == ["receipt"]
    authority(shop.shop, credit_note="external")
    cancelled = shop.owner.post(f"/api/orders/{order['order_id']}/status",
                                json={"status": "cancelled"})
    assert cancelled.status_code == 200, cancelled.text
    assert [d["kind"] for d in documents(shop.shop)] == ["receipt"]  # no ALYR credit note
    seen = activity(shop.shop, "order", order["order_id"], "document_skipped")
    assert any(a["detail"]["reason"] == "external_authority" for a in seen)


def test_a_payment_recorded_by_hand_is_kept_and_its_receipt_is_the_other_systems_job(shop):
    authority(shop.shop, receipt="external")
    who = customer(shop.shop, "Huda Al-Naimi")
    order = placed(shop.shop, who)
    done = shop.owner.post("/api/documents/payments", headers={"Idempotency-Key": "pay-ext-0001"},
                           json={"subject": "order", "id": order["order_id"], "method": "cash"})
    assert done.status_code == 201, done.text
    assert done.json()["payment"]["subject"] == "order" and done.json()["document"] is None
    assert done.json()["receipt_error"] == "external_authority"
    assert documents(shop.shop) == []


def test_an_invoice_on_request_for_an_order_is_refused_with_words(shop):
    authority(shop.shop, invoice="external")
    who = customer(shop.shop, "Huda Al-Naimi")
    order = placed(shop.shop, who)
    refused = shop.owner.post(f"/api/documents/from/order/{order['order_id']}",
                              json={"kind": "invoice"})
    assert refused.status_code == 409 and refused.json()["code"] == "external_authority"


def test_the_database_refuses_an_alyr_number_for_a_kind_the_shop_gave_away(shop, monkeypatch):
    early = shop.owner.post("/api/documents", json=draft_body("receipt")).json()["document"]
    authority(shop.shop, receipt="external")
    # Take the application's own check away: the database is still the last word.
    async def allow(conn, kind, external):
        return None

    monkeypatch.setattr(service, "_require_authority", allow)
    with pytest.raises(asyncpg.exceptions.CheckViolationError, match="other system numbers"):
        shop.owner.post(f"/api/documents/{early['id']}/issue",
                        headers={"Idempotency-Key": "db-refuses-0001"})
    assert series_counters(shop.shop).get(("receipt", "main"), 0) == 0  # the counter rolled back


def test_the_database_refuses_an_outside_number_for_a_kind_that_is_alyrs(shop, monkeypatch):
    async def allow(conn, kind, external):
        return None

    monkeypatch.setattr(service, "_require_authority", allow)
    staff = sales.staff_for(shop.tenant_id, Actor(None, "Till"))
    body = {"kind": "receipt", "customer": {"name": "X", "phone": "+97455550100"},
            "lines": LINES_MINOR, "source": "external", "source_ref": "E-9",
            "payments": [{"method": "cash", "amount_minor": LINES_TOTAL}]}

    async def work(conn):
        return await service.create_and_issue_external(
            conn, staff, body, number="R-9001", key="db-refuses-0002")

    with pytest.raises(asyncpg.exceptions.CheckViolationError, match="ALYR numbers this kind"):
        run_in_app(shop.owner, shop.tenant_id, work)
    assert documents_of(shop.shop) == []


def test_taking_numbering_back_is_refused_when_the_counter_could_reach_an_outside_number(shop):
    authority(shop.shop, receipt="external")
    external_sale(shop, "E-10", "RC-0001")  # looks exactly like ALYR's first receipt
    clash = shop.owner.put("/api/connect-setup/authority",
                           json={"changes": {"receipt": "alyr"}})
    assert clash.status_code == 409 and clash.json()["code"] == "authority_number_clash"
    assert clash.json()["number"] == "RC-0001"
    assert shop.owner.get("/api/connect-setup/overview").json()["authority"]["receipt"] == (
        "external")


def test_taking_numbering_back_works_when_no_number_could_clash(shop):
    authority(shop.shop, receipt="external")
    external_sale(shop, "E-11", "R-6001")
    authority(shop.shop, receipt="alyr")
    own = shop.sale(sale_body("E-12"))
    assert own["document"]["number"] == "RC-0001"  # ALYR starts counting from one
    assert len(documents_of(shop.shop)) == 2


# ── credit notes ─────────────────────────────────────────────────────────────────────────


def test_an_outside_credit_note_cancels_an_outside_receipt(shop):
    authority(shop.shop, receipt="external", credit_note="external")
    original = external_sale(shop, "E-20", "R-7001")
    note = shop.sale(sale_body(
        "E-20-RETURN", "credit_note", external_document_number="CN-701",
        credits_sale_id="E-20", reason="Customer returned the cake", payment=None))
    assert note["document"]["number"] == "CN-701"
    assert note["document"]["related_document_id"] == original["document"]["id"]
    voided = shop.machine.get(f"/api/connect/documents/{original['document']['id']}",
                              headers=shop.headers()).json()["document"]
    assert voided["status"] == "void"  # credit notes now cover all of it
    assert series_counters(shop.shop).get(("credit_note", "main"), 0) == 0


def test_part_credit_notes_add_up_and_cannot_pass_the_original(shop):
    authority(shop.shop, receipt="external", credit_note="external")
    original = external_sale(shop, "E-21", "R-7002")
    cake = LINES_MINOR[1]  # 2 x 45.00 less 5.00 = 85.00
    first = shop.post_sale(sale_body(
        "E-21-R1", "credit_note", external_document_number="CN-702", credits_sale_id="E-21",
        reason="Cake returned", payment=None, lines=[cake],
        totals={"total_minor": 8500}), "idem-credit-0001")
    assert first.status_code == 201, first.text
    detail = shop.machine.get(f"/api/connect/documents/{original['document']['id']}",
                              headers=shop.headers()).json()["document"]
    assert detail["status"] == "issued" and len(detail["credit_notes"]) == 1
    too_much = shop.post_sale(sale_body(
        "E-21-R2", "credit_note", external_document_number="CN-703", credits_sale_id="E-21",
        reason="Again", payment=None, lines=[LINES_MINOR[0], cake],
        totals={"total_minor": LINES_TOTAL}), "idem-credit-0002")
    assert too_much.status_code == 409 and too_much.json()["code"] == "credit_too_big"


def test_a_credit_note_for_a_sale_alyr_never_saw_is_refused(shop):
    authority(shop.shop, credit_note="external")
    answer = shop.post_sale(sale_body(
        "E-22", "credit_note", external_document_number="CN-704", credits_sale_id="NEVER",
        reason="Returned", payment=None), "idem-credit-0003")
    assert answer.status_code == 404 and answer.json()["code"] == "credited_sale_unknown"
    no_reference = shop.post_sale(sale_body(
        "E-23", "credit_note", external_document_number="CN-705", payment=None),
        "idem-credit-0004")
    assert no_reference.status_code == 422 and no_reference.json()["code"] == "credits_sale_needed"


def test_when_alyr_numbers_credit_notes_the_credit_note_for_an_outside_receipt_is_alyrs(shop):
    authority(shop.shop, receipt="external")
    original = external_sale(shop, "E-24", "R-7003")
    note = shop.sale(sale_body(
        "E-24-RETURN", "credit_note", credits_sale_id="E-24", reason="Returned", payment=None))
    assert note["document"]["number"] == "CN-0001"
    assert note["document"]["number_authority"] == "alyr"
    assert note["document"]["related_document_id"] == original["document"]["id"]
