"""Importing a POS's sales export (ALY-142, spec 016).

Upload, a preview of every row with its number in English and Arabic, apply as one transaction
through the same door as the open API, and an undo of the newest import. The Catalog's import is
the model and its file reading is reused, so this checks what is new: grouping rows into sales,
the mapping and the saved mappings, money, the checks that need the database, the atomic apply,
and an undo that withdraws rather than deletes.
"""

import json
from uuid import UUID

import pytest

from alyr.core import links
from alyr.modules.documents import service
from alyr.modules.documents.errors import DocumentError
from connect_support import (
    authority,
    connected_shop,
    documents_of,
    rows,
    series_counters,
)
from documents_sales_support import activity
from documents_support import refused_by_database
from test_consent import owner_sql

HEAD = "sale_id,document_number,date,phone,name,description,sku,quantity,unit_price," \
       "payment_method,total"
GOOD = "\n".join([
    HEAD,
    "S-1,R-1,2026-10-18,+974 5555 0101,Maha,Bread,BR-01,12,3.50,cash,87.00",
    "S-1,,,,,Date cake,CK-02,1,45.00,,",
    "S-2,R-2,2026-10-18,+974 5555 0102,Noor,Coffee,CF-01,2,12.00,card,24.00",
])


@pytest.fixture
def shop(client_factory, monkeypatch):
    return connected_shop(client_factory, monkeypatch)


def upload(shop, text: str | bytes, name: str = "sales.csv", who=None):
    data = text if isinstance(text, bytes) else text.encode("utf-8")
    return (who or shop.owner).post(f"/api/connect-setup/imports?filename={name}", content=data,
                                    headers={"Content-Type": "text/csv"})


def preview_of(shop, text, **kw) -> dict:
    answer = upload(shop, text, **kw)
    assert answer.status_code == 201, answer.text
    return answer.json()


def apply(shop, preview: dict, who=None):
    return (who or shop.owner).post(f"/api/connect-setup/imports/{preview['id']}/apply",
                                    json={"preview": preview["hash"]})


# ── the template ─────────────────────────────────────────────────────────────────────────


def test_the_template_downloads_and_reads_back_clean(shop):
    for lang, first in (("en", "Sale ID"), ("ar", "رقم العملية")):
        got = shop.owner.get(f"/api/connect-setup/imports/template?lang={lang}")
        assert got.status_code == 200
        assert got.headers["content-type"].startswith("text/csv")
        assert "attachment" in got.headers["content-disposition"]
        assert got.content.startswith(b"\xef\xbb\xbf") and first in got.content.decode("utf-8-sig")
        preview = preview_of(shop, got.content)
        assert preview["problems_total"] == 0, preview["problems"]
        assert preview["can_apply"] and preview["counts"]["sales"] == 2
        assert preview["missing"] == [] and preview["mapping"]["phone"]


# ── the preview ──────────────────────────────────────────────────────────────────────────


def test_the_preview_groups_rows_into_sales_and_writes_nothing(shop):
    preview = preview_of(shop, GOOD)
    assert preview["counts"] == {"rows": 3, "sales": 2, "ready": 2, "existing": 0,
                                 "problems": 0}, preview["problems"]
    assert [(s["sale_id"], s["number"], s["lines"], s["total_minor"], s["state"])
            for s in preview["sales"]] == [("S-1", "R-1", 2, 8700, "ready"),
                                           ("S-2", "R-2", 1, 2400, "ready")]
    assert preview["mapping"]["unit_price"] == "unit_price"
    assert preview["can_apply"] is True and len(preview["hash"]) == 64
    assert documents_of(shop.shop) == []
    assert rows("select count(*) as n from contacts where tenant_id = $1",
                shop.tenant_id)[0]["n"] == 0
    assert rows("select count(*) as n from connect_sales where tenant_id = $1",
                shop.tenant_id)[0]["n"] == 0


def test_every_problem_has_its_row_and_both_languages(shop):
    bad = "\n".join([
        HEAD,
        "S-1,R-1,2026-10-18,+974 5555 0101,Maha,Bread,BR-01,12,abc,cash,",
        "S-2,R-2,2026-10-18,0555,Noor,Coffee,CF-01,2,12.00,cash,24.00",
        "S-3,R-3,31/31/2026,+974 5555 0103,Huda,Tea,T-1,1,5.00,barter,5.00",
        "S-4,R-4,2026-10-18,+974 5555 0104,Dana,Milk,M-1,,2.00,cash,",
        "S-5,R-5,2026-10-18,+974 5555 0105,Sara,Eggs,E-1,1,6.00,cash,99.00",
        ",R-6,2026-10-18,+974 5555 0106,Lina,Salt,S-1,1,1.00,cash,1.00",
    ])
    preview = preview_of(shop, bad)
    assert preview["can_apply"] is False and preview["counts"]["problems"] >= 6
    found = {(p["row"], p["code"]): p for p in preview["problems"]}
    assert found[(2, "bad_money")]["field"] == "unit_price"
    assert "abc" in found[(2, "bad_money")]["message"]
    assert found[(3, "phone_invalid")]["field"] == "customer.phone"
    assert found[(4, "bad_date")]["field"] == "date"
    assert (4, "bad_method") in found
    for problem in preview["problems"]:  # both languages, and they are different words
        assert problem["message_ar"] and problem["message"] != problem["message_ar"]
    assert found[(5, "blank")]["field"] == "quantity"
    assert "99" in found[(6, "totals_mismatch")]["message"]
    assert (7, "sale_id_blank") in found
    refused = apply(shop, preview)
    assert refused.status_code == 409 and refused.json()["code"] == "import_has_errors"
    assert documents_of(shop.shop) == []


def test_rows_of_one_sale_that_disagree_are_a_problem_not_a_guess(shop):
    text = "\n".join([
        HEAD,
        "S-1,R-1,2026-10-18,+974 5555 0101,Maha,Bread,BR-01,1,3.50,cash,7.00",
        "S-1,R-1,2026-10-18,+974 5555 0102,Maha,Cake,CK-02,1,3.50,cash,",
    ])
    preview = preview_of(shop, text)
    [problem] = [p for p in preview["problems"] if p["code"] == "rows_disagree"]
    assert problem["row"] == 3 and problem["field"] == "phone"


def test_a_sale_split_into_two_places_in_the_file_is_a_problem(shop):
    text = "\n".join([
        HEAD,
        "S-1,R-1,2026-10-18,+974 5555 0101,Maha,Bread,BR-01,1,3.50,cash,3.50",
        "S-2,R-2,2026-10-18,+974 5555 0102,Noor,Cake,CK-02,1,3.50,cash,3.50",
        "S-1,R-1,2026-10-18,+974 5555 0101,Maha,Tea,T-01,1,3.50,cash,",
    ])
    assert any(p["code"] == "duplicate_in_file" for p in preview_of(shop, text)["problems"])


def test_two_sales_cannot_share_a_document_number(shop):
    authority(shop.shop, receipt="external")
    text = "\n".join([
        HEAD,
        "S-1,R-1,2026-10-18,+974 5555 0101,Maha,Bread,BR-01,1,3.50,cash,3.50",
        "S-2,R-1,2026-10-18,+974 5555 0102,Noor,Cake,CK-02,1,3.50,cash,3.50",
    ])
    assert any(p["code"] == "duplicate_number_in_file"
               for p in preview_of(shop, text)["problems"])


def test_numbers_are_read_in_either_language_and_never_guessed(shop):
    text = "\n".join([
        HEAD,
        "S-1,R-1,2026-10-18,+974 5555 0101,مها,خبز,BR-01,١٢,٣٫٥٠,نقد,٤٢٫٠٠",
        "S-2,R-2,2026-10-18,+974 5555 0102,Noor,Cake,CK-02,1,\"1.250\",cash,\"1.250\"",
    ])
    preview = preview_of(shop, text)
    assert preview["sales"][0]["total_minor"] == 4200 and preview["sales"][0]["state"] == "ready"
    # "1.250" could be one riyal 25 or one thousand two hundred fifty: the file is asked to say.
    assert any(p["row"] == 3 and p["code"] == "bad_money" for p in preview["problems"])


def test_a_formula_is_only_text_and_a_spreadsheet_with_macros_is_refused(shop):
    text = HEAD + ('\nS-1,R-1,2026-10-18,+974 5555 0101,Maha,"=cmd|\' /c calc\'!A1",BR,1,3.50,'
                   'cash,3.50')
    preview = preview_of(shop, text)
    assert preview["can_apply"]
    assert apply(shop, preview).status_code == 200
    [line] = rows("select description from document_lines where tenant_id = $1", shop.tenant_id)
    assert line["description"].startswith("=cmd")  # kept as the words it is
    refused = upload(shop, b"anything", name="sales.xlsm")
    assert refused.status_code == 422 and refused.json()["code"] == "macros_not_supported"
    old = upload(shop, b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"0" * 100, name="sales.xls")
    assert old.status_code == 422 and old.json()["code"] == "xls_not_supported"
    assert upload(shop, b"").status_code == 422


def test_what_the_file_has_to_have_and_how_big_it_may_be(shop):
    no_phone = "sale_id,description,quantity,unit_price\nS-1,Bread,1,3.50"
    preview = preview_of(shop, no_phone)
    assert "phone" in preview["missing"] and preview["can_apply"] is False
    assert preview["problems"][0]["code"] == "missing_column"
    big = HEAD + "\n" + "\n".join(
        f"S-{n},R-{n},2026-10-18,+974 5555 {n:04d},C{n},Bread,B,1,3.50,cash,3.50"
        for n in range(201))
    assert any(p["code"] == "too_many_sales" for p in preview_of(shop, big)["problems"])


# ── encodings and delimiters ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("encode, glue", [
    (lambda t: t.encode("utf-8"), ","), (lambda t: b"\xef\xbb\xbf" + t.encode("utf-8"), ","),
    (lambda t: t.encode("cp1256"), ","), (lambda t: t.encode("cp1256"), ";"),
    (lambda t: t.encode("utf-8"), "\t"), (lambda t: t.encode("utf-16"), ";"),
])
def test_utf8_arabic_windows_and_utf16_in_comma_semicolon_or_tab_all_read_the_same(
        shop, encode, glue):
    text = "\n".join([
        glue.join(HEAD.split(",")),
        glue.join(["S-1", "R-1", "2026-10-18", "+974 5555 0101", "مها الكواري", "خبز عربي",
                   "BR-01", "12", "3.50", "cash", "42.00"]),
    ])
    preview = preview_of(shop, encode(text))
    assert preview["problems_total"] == 0, preview["problems"]
    assert preview["sales"][0]["customer"] == "مها الكواري"
    assert preview["sales"][0]["total_minor"] == 4200


def test_arabic_column_names_are_found_too(shop):
    text = "\n".join([
        "رقم العملية,رقم المستند,التاريخ,الجوال,اسم العميل,الصنف,الكمية,السعر,طريقة الدفع",
        "S-1,R-1,2026-10-18,+974 5555 0101,مها,خبز,12,3.50,نقد",
    ])
    preview = preview_of(shop, text)
    assert preview["problems_total"] == 0, preview["problems"]
    assert preview["mapping"]["phone"] == "الجوال" and preview["sales"][0]["total_minor"] == 4200


# ── mapping, options and remembered templates ────────────────────────────────────────────

ODD = "\n".join([
    "Ticket,Mobile no,Who,What,How many,Each,Paid with",
    "T-9,+974 5555 0111,Maha,Bread,2,3.50,Cash",
])


def test_a_mapping_can_be_chosen_and_the_preview_is_made_again(shop):
    preview = preview_of(shop, ODD)
    assert preview["mapping"]["sale_id"] == "Ticket" and preview["mapping"]["phone"] == "Mobile no"
    assert preview["mapping"]["quantity"] == "How many"
    assert preview["mapping"]["unit_price"] == "Each"
    changed = shop.owner.put(f"/api/connect-setup/imports/{preview['id']}", json={
        "mapping": {**preview["mapping"], "description": "What", "name": "Who",
                    "payment_method": "Paid with"}})
    assert changed.status_code == 200
    again = changed.json()
    assert again["problems_total"] == 0 and again["can_apply"], again["problems"]
    assert again["hash"] != preview["hash"]  # what is applied is the new mapping
    assert apply(shop, preview).status_code == 409  # the old preview cannot be applied
    assert apply(shop, again).status_code == 200


def test_a_mapping_can_be_remembered_and_is_used_for_the_next_file(shop):
    first = preview_of(shop, ODD)
    mapping = {**first["mapping"], "description": "What", "name": "Who",
               "payment_method": "Paid with"}
    saved = shop.owner.put("/api/connect-setup/import-templates", json={
        "name": "Till export", "mapping": mapping, "options": {"send": False}})
    assert saved.status_code == 200 and saved.json()["template"]["name"] == "Till export"
    second = preview_of(shop, ODD.replace("T-9", "T-10"))
    assert second["template"] == "Till export" and second["mapping"]["description"] == "What"
    assert second["problems_total"] == 0
    listed = shop.owner.get("/api/connect-setup/import-templates").json()["templates"]
    assert [t["name"] for t in listed] == ["Till export"]
    assert shop.owner.delete("/api/connect-setup/import-templates/Till%20export").status_code == 200
    assert preview_of(shop, ODD)["template"] is None


def test_options_set_the_kind_a_way_of_paying_and_whether_to_send(shop):
    no_payment = "\n".join([
        "sale_id,phone,name,description,quantity,unit_price",
        "S-1,+974 5555 0101,Maha,Bread,2,3.50",
    ])
    preview = preview_of(shop, no_payment)
    assert [p["code"] for p in preview["problems"]] == ["no_payment"]
    as_invoice = shop.owner.put(f"/api/connect-setup/imports/{preview['id']}",
                                json={"options": {"kind": "invoice"}}).json()
    assert as_invoice["problems_total"] == 0 and as_invoice["sales"][0]["kind"] == "invoice"
    paid = shop.owner.put(f"/api/connect-setup/imports/{preview['id']}", json={
        "options": {"kind": "receipt", "default_payment_method": "cash"}}).json()
    assert paid["problems_total"] == 0 and paid["options"]["default_payment_method"] == "cash"


# ── applying ─────────────────────────────────────────────────────────────────────────────


def test_applying_makes_every_sale_in_one_go_through_the_same_door_as_the_api(shop):
    preview = preview_of(shop, GOOD)
    done = apply(shop, preview)
    assert done.status_code == 200, done.text
    assert done.json()["counts"] == {"sales": 2, "made": 2, "skipped": 0}
    assert [d["number"] for d in documents_of(shop.shop)] == ["RC-0001", "RC-0002"]
    sources = rows("select via, import_id, external_sale_id, external_number from connect_sales "
                   "where tenant_id = $1 order by external_sale_id", shop.tenant_id)
    assert [(r["via"], r["external_sale_id"], r["external_number"]) for r in sources] == [
        ("csv", "S-1", "R-1"), ("csv", "S-2", "R-2")]
    assert str(sources[0]["import_id"]) == preview["id"]
    # The same sale from the till's API afterwards finds the document that is there.
    again = shop.post_sale({
        "external_sale_id": "S-2", "kind": "receipt", "external_document_number": "R-2",
        "customer": {"phone": "+974 5555 0102", "name": "Noor"},
        "lines": [{"description": "Coffee", "quantity": "2", "unit_price_minor": 1200,
                   "sku": "CF-01"}],
        "totals": {"total_minor": 2400}, "payment": {"method": "card", "amount_minor": 2400}},
        "idem-csv-api-0001")
    assert again.status_code in (200, 409)
    assert len(documents_of(shop.shop)) == 2
    assert activity(shop.shop, "document", preview["id"], "import_applied")


def test_the_file_is_dropped_when_it_is_applied_and_cannot_be_applied_twice(shop):
    preview = preview_of(shop, GOOD)
    assert apply(shop, preview).status_code == 200
    assert rows("select file, status from sale_imports where id = $1",
                UUID(preview["id"]))[0]["file"] is None
    again = apply(shop, preview)
    assert again.status_code == 409 and again.json()["code"] == "import_not_preview"
    assert len(documents_of(shop.shop)) == 2


def test_what_is_applied_must_be_what_was_previewed(shop):
    authority(shop.shop, receipt="external")
    preview = preview_of(shop, GOOD)
    wrong = shop.owner.post(f"/api/connect-setup/imports/{preview['id']}/apply",
                            json={"preview": "0" * 64})
    assert wrong.status_code == 409 and wrong.json()["code"] == "import_changed"
    # The world moved between preview and apply: the till's API took one of the numbers.
    taken = shop.post_sale({
        "external_sale_id": "OTHER", "kind": "receipt", "external_document_number": "R-1",
        "customer": {"phone": "+974 5555 0150", "name": "Someone"},
        "lines": [{"description": "Tea", "quantity": "1", "unit_price_minor": 500}],
        "totals": {"total_minor": 500}, "payment": {"method": "cash", "amount_minor": 500}},
        "idem-drift-0001")
    assert taken.status_code == 201
    stale = apply(shop, preview)
    assert stale.status_code == 409 and stale.json()["code"] == "import_changed"
    fresh = shop.owner.get(f"/api/connect-setup/imports/{preview['id']}").json()
    assert fresh["hash"] != preview["hash"] and fresh["can_apply"] is False
    assert any(p["code"] == "number_taken" for p in fresh["problems"])
    assert len(documents_of(shop.shop)) == 1


def test_apply_is_one_transaction_a_failure_on_the_second_sale_leaves_nothing(
        shop, monkeypatch):
    preview = preview_of(shop, GOOD)
    real = service.create_and_issue
    calls = []

    async def flaky(*args, **kwargs):
        calls.append(1)
        if len(calls) == 2:
            raise DocumentError("no_lines")
        return await real(*args, **kwargs)

    monkeypatch.setattr(service, "create_and_issue", flaky)
    refused = apply(shop, preview)
    assert refused.status_code == 409 and refused.json()["code"] == "import_has_errors"
    assert refused.json()["problems"][0]["sale"] == "S-2"
    assert documents_of(shop.shop) == []
    assert series_counters(shop.shop).get(("receipt", "main"), 0) == 0
    assert rows("select count(*) as n from contacts where tenant_id = $1",
                shop.tenant_id)[0]["n"] == 0
    assert rows("select status from sale_imports where id = $1",
                UUID(preview["id"]))[0]["status"] == "preview"
    monkeypatch.setattr(service, "create_and_issue", real)
    assert apply(shop, preview).status_code == 200


def test_a_sale_alyr_already_has_is_skipped_not_made_twice(shop):
    first = preview_of(shop, GOOD)
    apply(shop, first)
    second = preview_of(shop, GOOD)
    assert second["counts"]["existing"] == 2 and second["counts"]["ready"] == 0
    assert second["can_apply"] is False
    assert len(documents_of(shop.shop)) == 2


def test_a_different_file_with_the_same_sale_ids_is_a_problem(shop):
    apply(shop, preview_of(shop, GOOD))
    changed = GOOD.replace("12,3.50,cash,87.00", "13,3.50,cash,90.50")
    preview = preview_of(shop, changed)
    assert any(p["code"] == "sale_exists" for p in preview["problems"])


def test_send_in_the_options_asks_for_delivery_and_records_the_assertion(shop):
    preview = preview_of(shop, GOOD)
    options = shop.owner.put(f"/api/connect-setup/imports/{preview['id']}",
                             json={"options": {"send": True}}).json()
    assert apply(shop, options).status_code == 200
    consents = rows("select c.source, c.wording from consents c join contacts k on "
                    "k.id = c.contact_id where k.tenant_id = $1", shop.tenant_id)
    assert {c["source"] for c in consents} == {"connected_sale"} and len(consents) == 2
    assert all("permission" in c["wording"] for c in consents)


def test_without_the_send_option_nothing_is_sent_and_no_consent_is_recorded(shop):
    apply(shop, preview_of(shop, GOOD))
    assert rows("select count(*) as n from consents where tenant_id = $1",
                shop.tenant_id)[0]["n"] == 0
    assert rows("select count(*) as n from document_deliveries where tenant_id = $1",
                shop.tenant_id)[0]["n"] == 0


def test_applying_needs_the_terms_accepted(shop):
    preview = preview_of(shop, GOOD)
    owner_sql("update document_settings set connect_terms_version = null where tenant_id = $1",
              shop.tenant_id)
    refused = apply(shop, preview)
    assert refused.status_code == 409 and refused.json()["code"] == "terms_not_accepted"


def test_only_owners_and_admins_import_and_one_shop_never_sees_anothers(
        client_factory, monkeypatch):
    a = connected_shop(client_factory, monkeypatch)
    b = connected_shop(client_factory, monkeypatch)
    assert upload(a, GOOD, who=a.shop.agent).status_code == 403
    preview = preview_of(a, GOOD)
    assert b.owner.get(f"/api/connect-setup/imports/{preview['id']}").status_code == 404
    assert apply(b, preview).status_code == 404
    assert a.shop.agent.get("/api/connect-setup/imports").status_code == 403


# ── undo ─────────────────────────────────────────────────────────────────────────────────


def test_undo_withdraws_the_documents_of_the_newest_import_and_frees_their_numbers(shop):
    authority(shop.shop, receipt="external")
    preview = preview_of(shop, GOOD)
    assert apply(shop, preview).status_code == 200
    ids = [d["id"] for d in documents_of(shop.shop)]
    history = shop.owner.get("/api/connect-setup/imports").json()["imports"]
    assert history[0]["status"] == "applied" and history[0]["can_undo"] is True
    # A link to the paper works while it stands, and says so: it is the other system's number.
    token = links.mint(shop.tenant_id, ids[0], purpose=links.DOCUMENT)
    page = shop.owner.get(f"/api/d/{shop.shop.slug}", headers={"X-Order-Link": token}).json()
    assert page["document"]["number"] == "R-1" and page["document"]["external"] is True

    undone = shop.owner.post("/api/connect-setup/imports/undo")
    assert undone.status_code == 200 and undone.json()["withdrawn"] == 2
    # Kept on record, marked, never deleted: the paper, its number and its PDF are as they were.
    after = documents_of(shop.shop)
    assert [d["id"] for d in after] == ids and all(d["withdrawn_at"] for d in after)
    assert all(d["status"] == "issued" and d["number"] for d in after)
    assert rows("select count(*) as n from document_files where tenant_id = $1",
                shop.tenant_id)[0]["n"] == 2
    one = shop.owner.get(f"/api/documents/{ids[0]}").json()["document"]
    assert one["withdrawn"]["reason"].startswith("Import")
    listed = shop.owner.get("/api/documents").json()["documents"]
    assert listed == []  # out of the way
    assert shop.owner.post(f"/api/documents/{ids[0]}/send", json={}).status_code == 409
    gone = shop.owner.get(f"/api/d/{shop.shop.slug}", headers={"X-Order-Link": token}).json()
    assert gone["document"] is None and gone["link"]["state"] == "invalid"
    assert shop.owner.get(f"/api/d/{shop.shop.slug}/pdf",
                          headers={"X-Order-Link": token}).status_code in (404, 410, 403)
    # The sales are free again, and so are the numbers: the corrected file goes in.
    assert shop.machine.get("/api/connect/sales/S-1", headers=shop.headers()).status_code == 404
    again = preview_of(shop, GOOD)
    assert again["problems_total"] == 0 and again["counts"]["ready"] == 2
    assert apply(shop, again).status_code == 200
    assert len([d for d in documents_of(shop.shop) if not d["withdrawn_at"]]) == 2
    assert activity(shop.shop, "document", preview["id"], "import_undone")


def test_only_the_newest_import_is_undone_first(shop):
    authority(shop.shop, receipt="external")
    apply(shop, preview_of(shop, GOOD))
    second_file = GOOD.replace("S-1", "S-3").replace("S-2", "S-4").replace(
        "R-1", "R-3").replace("R-2", "R-4")
    apply(shop, preview_of(shop, second_file))
    shop.owner.post("/api/connect-setup/imports/undo")
    live = sorted(d["number"] for d in documents_of(shop.shop) if not d["withdrawn_at"])
    assert live == ["R-1", "R-2"]
    shop.owner.post("/api/connect-setup/imports/undo")
    assert [d for d in documents_of(shop.shop) if not d["withdrawn_at"]] == []
    nothing = shop.owner.post("/api/connect-setup/imports/undo")
    assert nothing.status_code == 404 and nothing.json()["code"] == "import_nothing_to_undo"


def test_an_import_that_was_sent_cannot_be_undone(shop):
    authority(shop.shop, receipt="external")
    preview = preview_of(shop, GOOD)
    options = shop.owner.put(f"/api/connect-setup/imports/{preview['id']}",
                             json={"options": {"send": True}}).json()
    apply(shop, options)
    refused = shop.owner.post("/api/connect-setup/imports/undo")
    assert refused.status_code == 409 and refused.json()["code"] == "import_already_sent"
    assert [d for d in documents_of(shop.shop) if d["withdrawn_at"]] == []


def test_documents_alyr_numbered_are_never_taken_back(shop):
    apply(shop, preview_of(shop, GOOD))  # ALYR numbers receipts here
    refused = shop.owner.post("/api/connect-setup/imports/undo")
    assert refused.status_code == 409 and refused.json()["code"] == "import_not_undoable"
    assert len(documents_of(shop.shop)) == 2
    # Nor can anyone do it behind the application's back: the database refuses.
    doc = documents_of(shop.shop)[0]
    error = refused_by_database(
        shop.tenant_id, "update documents set withdrawn_at = now(), withdrawn_by = 'x', "
        "withdrawn_reason = 'y' where id = $1", doc["id"])
    assert error is not None and "numbered by another system" in str(error)


def test_the_database_refuses_to_withdraw_what_was_sent_or_credited_or_to_delete_anything(shop):
    authority(shop.shop, receipt="external", credit_note="external")
    sold = shop.sale({
        "external_sale_id": "X-1", "kind": "receipt", "external_document_number": "R-90",
        "customer": {"phone": "+974 5555 0101", "name": "Maha"},
        "lines": [{"description": "Bread", "quantity": "1", "unit_price_minor": 350}],
        "totals": {"total_minor": 350}, "payment": {"method": "cash", "amount_minor": 350}})
    doc_id = sold["document"]["id"]
    owner_sql("insert into document_deliveries (tenant_id, document_id, channel, trigger, "
              "recipient, language, status) values ($1, $2, 'whatsapp', 'staff', 'x', 'en', "
              "'sent')", shop.tenant_id, UUID(doc_id))
    sent = refused_by_database(
        shop.tenant_id, "update documents set withdrawn_at = now(), withdrawn_by = 'x', "
        "withdrawn_reason = 'y' where id = $1", UUID(doc_id))
    assert sent is not None and "was sent" in str(sent)
    gone = refused_by_database(shop.tenant_id, "delete from documents where id = $1",
                               UUID(doc_id))
    assert gone is not None and "never deleted" in str(gone)
    other = refused_by_database(
        shop.tenant_id, "update documents set total_minor = 1, withdrawn_at = now(), "
        "withdrawn_by = 'x', withdrawn_reason = 'y' where id = $1",
        UUID(doc_id))
    assert other is not None


def test_an_import_that_cancelled_other_documents_cannot_be_undone(shop):
    authority(shop.shop, receipt="external", credit_note="external")
    shop.sale({
        "external_sale_id": "X-2", "kind": "receipt", "external_document_number": "R-91",
        "customer": {"phone": "+974 5555 0101", "name": "Maha"},
        "lines": [{"description": "Bread", "quantity": "1", "unit_price_minor": 350}],
        "totals": {"total_minor": 350}, "payment": {"method": "cash", "amount_minor": 350}})
    text = "\n".join([
        "sale_id,document_number,kind,phone,name,description,quantity,unit_price,credits_sale_id,"
        "reason",
        "X-2-R,CN-91,credit_note,+974 5555 0101,Maha,Bread,1,3.50,X-2,Returned",
    ])
    preview = preview_of(shop, text)
    assert preview["problems_total"] == 0, preview["problems"]
    assert apply(shop, preview).status_code == 200
    refused = shop.owner.post("/api/connect-setup/imports/undo")
    assert refused.status_code == 409 and refused.json()["code"] == "import_not_undoable"


def test_the_json_of_an_import_is_plain_data(shop):
    preview = preview_of(shop, GOOD)
    json.dumps(preview)
    assert set(preview) >= {"id", "headers", "mapping", "options", "columns", "missing",
                            "counts", "sales", "problems", "hash", "can_apply"}
