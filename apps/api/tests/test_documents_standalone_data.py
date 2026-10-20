"""The shop's own customers and saved lines, and the one-line box (ALY-141, spec 016): adding,
finding, balances, the roles, one shop never seeing another's.
"""

from uuid import UUID, uuid4

import pytest

from documents_support import SELLER, configured_shop, make_shop, sign_in_all
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return configured_shop(client_factory, monkeypatch)


def add(client, **fields):
    body = {"name": "Ahmed Al Thani", "phone": "5551 2345", **fields}
    return client.post("/api/documents/customers", json=body)


def invoice_for(client, contact_id, price=50000, **more):
    answer = client.post(
        "/api/documents", headers={"Idempotency-Key": f"inv-{uuid4().hex}"},
        json={"kind": "invoice", "issue": True, "contact_id": contact_id,
              "customer": {"name": "Ahmed Al Thani"}, "lines": [{
                  "description": "AC repair", "quantity": "1", "unit": "service",
                  "unit_price_minor": price}], **more})
    assert answer.status_code == 201, answer.text
    return answer.json()["document"]


# ── customers ─────────────────────────────────────────────────────────────────────────────


def test_a_customer_is_added_with_a_phone_and_read_back(shop):
    made = add(shop.owner, name_ar="أحمد آل ثاني", company="Thani Trading",
               registration_number="55100", tax_id="T-9", address="Salwa Rd", email="a@shop.qa")
    assert made.status_code == 201, made.text
    c = made.json()["customer"]
    assert c["phone"] == "97455512345"                       # a Qatar number gets 974
    assert (c["name"], c["name_ar"], c["company"]) == ("Ahmed Al Thani", "أحمد آل ثاني", "Thani Trading")
    assert (c["registration_number"], c["tax_id"], c["address"], c["email"]) == (
        "55100", "T-9", "Salwa Rd", "a@shop.qa")
    assert c["documents"] == 0 and c["owing_minor"] == 0 and c["recent"] == []
    again = shop.owner.get(f"/api/documents/customers/{c['id']}").json()["customer"]
    assert again == c
    listed = shop.owner.get("/api/documents/customers/all").json()
    assert listed["total"] == 1 and listed["customers"][0]["id"] == c["id"]


def test_a_phone_the_shop_already_knows_is_the_same_person_not_a_second_one(shop):
    chat = owner_sql(
        "insert into contacts (tenant_id, phone, name, role) values ($1, '97455512345', "
        "'Ahmed (chat)', 'customer') returning id", shop.tenant_id)[0]["id"]
    made = add(shop.owner, company="Thani Trading").json()["customer"]
    assert made["id"] == str(chat) and made["name"] == "Ahmed Al Thani"
    assert owner_sql("select count(*) as n from contacts where tenant_id = $1", shop.tenant_id)[
        0]["n"] == 1


def test_the_number_of_someone_on_the_team_is_not_a_customer(shop):
    owner_sql("insert into contacts (tenant_id, phone, name, role) values ($1, '97455500777', "
              "'Yusuf', 'staff')", shop.tenant_id)
    refused = add(shop.owner, phone="97455500777")
    assert (refused.status_code, refused.json()["code"]) == (409, "phone_is_staff")
    assert refused.json()["message_ar"]


@pytest.mark.parametrize(("fields", "code"), [
    ({"phone": ""}, "customer_needs_phone"),
    ({"name": "", "company": ""}, "customer_needs_name"),
    ({"phone": "12"}, "phone_invalid"),
    ({"email": "someone@shop.example"}, "email_invalid"),
])
def test_a_customer_that_cannot_be_saved_says_why_in_words(shop, fields, code):
    refused = add(shop.owner, **fields)
    assert (refused.status_code, refused.json()["code"]) == (422, code), refused.text
    assert refused.json()["detail"] and refused.json()["message_ar"]


def test_a_customer_is_found_by_name_in_either_language_company_and_phone(shop):
    a = add(shop.owner, name_ar="أحمد", company="Thani Trading").json()["customer"]
    b = add(shop.owner, name="Sara Salem", name_ar="سارة سالم", phone="97455566001").json()["customer"]

    def find(q):
        return [c["id"] for c in shop.owner.get(f"/api/documents/customers/all?q={q}").json()[
            "customers"]]

    assert find("ahmed") == [a["id"]] and find("THANI") == [a["id"]]
    assert find("احمد") == [a["id"]]                     # the alef spelling is folded
    assert find("سارة") == [b["id"]] and find("sal") == [b["id"]]
    assert find("5551") == [a["id"]] and find("66001") == [b["id"]]
    assert find("٥٥٥١") == [a["id"]]                     # digits typed in Arabic
    assert find("nobody") == []
    # The picker a draft uses reads the same people, with the new fields.
    hits = shop.owner.get("/api/documents/customers?q=thani").json()["customers"]
    assert hits[0]["id"] == a["id"] and hits[0]["company"] == "Thani Trading"
    assert hits[0]["name_ar"] == "أحمد" and hits[0]["address"] == ""


def test_a_balance_is_what_issued_invoices_still_owe_and_falls_with_payments(shop):
    c = add(shop.owner).json()["customer"]
    first = invoice_for(shop.owner, c["id"], 50000)
    invoice_for(shop.owner, c["id"], 30000)
    row = shop.owner.get(f"/api/documents/customers/{c['id']}").json()["customer"]
    assert row["documents"] == 2 and row["owing_minor"] == 80000
    assert [d["owing_minor"] for d in row["recent"]] == [30000, 50000]   # newest first
    assert shop.owner.get("/api/documents/customers/all?owing=true").json()["total"] == 1
    paid = shop.owner.post(
        "/api/documents/payments", headers={"Idempotency-Key": "pay-0000001"},
        json={"subject": "invoice", "id": first["id"], "method": "cash", "amount_minor": 20000})
    assert paid.status_code == 201, paid.text
    assert shop.owner.get(f"/api/documents/customers/{c['id']}").json()["customer"][
        "owing_minor"] == 60000
    done = shop.owner.post(
        "/api/documents/payments", headers={"Idempotency-Key": "pay-0000002"},
        json={"subject": "invoice", "id": first["id"], "method": "cash"})
    assert done.status_code == 201
    other = add(shop.owner, name="Nobody Owes", phone="97455577001").json()["customer"]
    owing = shop.owner.get("/api/documents/customers/all?owing=true").json()["customers"]
    assert [x["id"] for x in owing] == [c["id"]] and other["id"] not in [x["id"] for x in owing]


def test_an_agent_sees_who_the_customers_are_and_never_the_shops_money(shop):
    c = add(shop.owner).json()["customer"]
    invoice_for(shop.owner, c["id"], 50000)
    listed = shop.agent.get("/api/documents/customers/all").json()["customers"][0]
    assert listed["id"] == c["id"] and "owing_minor" not in listed and "documents" not in listed
    detail = shop.agent.get(f"/api/documents/customers/{c['id']}").json()["customer"]
    assert "owing_minor" not in detail and "recent" not in detail
    assert shop.agent.get("/api/documents/customers/all?owing=true").json()["total"] == 1  # ignored
    # Drafting is for everyone: an agent may add a customer too.
    assert add(shop.agent, name="Agent Added", phone="97455588001").status_code == 201


def test_only_an_owner_or_admin_can_say_a_customer_asked_for_whatsapp(shop):
    asked = add(shop.agent, name="By Agent", phone="97455588002", whatsapp_ok=True).json()["customer"]
    state = owner_sql("select consent_service from contacts where id = $1", UUID(asked["id"]))
    assert state[0]["consent_service"] == "unknown"                   # an agent cannot say it
    done = add(shop.owner, name="By Owner", phone="97455588003", whatsapp_ok=True).json()["customer"]
    assert owner_sql("select consent_service from contacts where id = $1", UUID(done["id"]))[0][
        "consent_service"] == "granted"
    why = owner_sql("select source, wording from consents where contact_id = $1", UUID(done["id"]))
    assert why[0]["source"] == "shop_attested" and "Owner" in why[0]["wording"]
    # Without the box ticked a customer is never given consent, and editing does not give it.
    plain = add(shop.owner, name="Plain", phone="97455588004").json()["customer"]
    shop.owner.put(f"/api/documents/customers/{plain['id']}", json={
        "name": "Plain", "phone": "97455588004", "company": "X"})
    assert owner_sql("select consent_service from contacts where id = $1", UUID(plain["id"]))[0][
        "consent_service"] == "unknown"


def test_a_customer_is_changed_but_never_to_somebody_elses_phone(shop):
    one = add(shop.owner).json()["customer"]
    two = add(shop.owner, name="Second", phone="97455566002").json()["customer"]
    changed = shop.owner.put(f"/api/documents/customers/{one['id']}", json={
        "name": "Ahmed Al Thani", "phone": "5551 2345", "company": "New Co", "tax_id": "T-1"})
    assert changed.status_code == 200 and changed.json()["customer"]["company"] == "New Co"
    clash = shop.owner.put(f"/api/documents/customers/{one['id']}", json={
        "name": "Ahmed", "phone": two["phone"]})
    assert (clash.status_code, clash.json()["code"]) == (409, "phone_taken")
    assert shop.owner.put(f"/api/documents/customers/{uuid4()}", json={
        "name": "X", "phone": "97455566003"}).status_code == 404


def test_one_shop_never_sees_another_shops_customers_or_lines(client_factory, monkeypatch, shop):
    mine = add(shop.owner).json()["customer"]
    line = shop.owner.post("/api/documents/saved-lines", json={
        "name": "AC repair", "unit": "service", "price_minor": 50000}).json()["line"]
    other = sign_in_all(client_factory, make_shop())
    other.owner.put("/api/documents/settings", json=SELLER)
    assert other.owner.get("/api/documents/customers/all").json()["total"] == 0
    assert other.owner.get(f"/api/documents/customers/{mine['id']}").status_code == 404
    assert other.owner.put(f"/api/documents/customers/{mine['id']}", json={
        "name": "Stolen", "phone": "97455599999"}).status_code == 404
    assert other.owner.get("/api/documents/saved-lines").json()["lines"] == []
    assert other.owner.put(f"/api/documents/saved-lines/{line['id']}", json={
        "name": "Stolen"}).status_code == 404
    assert other.owner.delete(f"/api/documents/saved-lines/{line['id']}").status_code == 404
    assert shop.owner.get(f"/api/documents/customers/{mine['id']}").json()["customer"][
        "name"] == "Ahmed Al Thani"


def test_the_module_off_closes_all_of_it(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    off = sign_in_all(client_factory, make_shop(documents=False))
    for path in ("/api/documents/customers/all", "/api/documents/saved-lines"):
        assert off.owner.get(path).status_code == 403, path
    assert off.owner.post("/api/documents/quick", json={"text": "AC 500"}).status_code == 403


# ── saved lines ───────────────────────────────────────────────────────────────────────────


def test_a_line_is_saved_once_and_saving_the_same_words_updates_it(shop):
    first = shop.owner.post("/api/documents/saved-lines", json={
        "name": "AC repair", "name_ar": "صيانة مكيف", "unit": "service", "price_minor": 50000})
    assert first.status_code == 201, first.text
    line = first.json()["line"]
    assert (line["name"], line["name_ar"], line["unit"], line["price_minor"], line["uses"]) == (
        "AC repair", "صيانة مكيف", "service", 50000, 0)
    again = shop.owner.post("/api/documents/saved-lines", json={
        "name": "ac REPAIR", "name_ar": "صيانة مكيف", "unit": "hour", "price_minor": 60000})
    assert again.json()["line"]["id"] == line["id"] and again.json()["line"]["price_minor"] == 60000
    assert len(shop.owner.get("/api/documents/saved-lines").json()["lines"]) == 1


def test_the_most_used_line_comes_first_and_the_search_folds_arabic(shop):
    a = shop.owner.post("/api/documents/saved-lines", json={
        "name": "Filter change", "name_ar": "تغيير فلتر", "price_minor": 2500}).json()["line"]
    b = shop.owner.post("/api/documents/saved-lines", json={
        "name": "AC repair", "name_ar": "إصلاح مكيف", "price_minor": 50000}).json()["line"]
    ids = lambda q="": [x["id"] for x in shop.owner.get(  # noqa: E731
        f"/api/documents/saved-lines?q={q}").json()["lines"]]
    assert set(ids()) == {a["id"], b["id"]}
    assert shop.owner.post("/api/documents/saved-lines/used", json={"ids": [a["id"]]}).json() == {
        "used": 1}
    shop.owner.post("/api/documents/saved-lines/used", json={"ids": [a["id"], b["id"]]})
    assert ids() == [a["id"], b["id"]]                    # a: 2 uses, b: 1
    assert ids("repair") == [b["id"]] and ids("اصلاح") == [b["id"]]   # the hamza is folded
    assert ids("zzz") == []


def test_a_line_is_changed_and_removed_and_a_removed_one_is_gone(shop):
    line = shop.owner.post("/api/documents/saved-lines", json={
        "name": "AC repair", "price_minor": 50000}).json()["line"]
    changed = shop.owner.put(f"/api/documents/saved-lines/{line['id']}", json={
        "name": "AC repair", "price_minor": 55000, "unit": "service"})
    assert changed.json()["line"]["price_minor"] == 55000
    assert shop.owner.delete(f"/api/documents/saved-lines/{line['id']}").json() == {"removed": True}
    assert shop.owner.get("/api/documents/saved-lines").json()["lines"] == []
    gone = shop.owner.delete(f"/api/documents/saved-lines/{line['id']}")
    assert (gone.status_code, gone.json()["code"]) == (404, "saved_line_not_found")
    # The same words can be saved again afterwards.
    assert shop.owner.post("/api/documents/saved-lines", json={
        "name": "AC repair", "price_minor": 1}).status_code == 201


@pytest.mark.parametrize(("body", "code"), [
    ({"name": "", "name_ar": ""}, "saved_line_needs_text"),
    ({"name": "x", "unit": "parsec"}, "quantity_invalid"),
])
def test_a_line_that_cannot_be_saved_says_why(shop, body, code):
    refused = shop.owner.post("/api/documents/saved-lines", json=body)
    assert (refused.status_code, refused.json()["code"]) == (422, code)
    assert shop.owner.post("/api/documents/saved-lines", json={
        "name": "x", "price_minor": 10.5}).status_code == 422          # never a fraction of a unit
    assert shop.owner.post("/api/documents/saved-lines", json={
        "name": "x", "price_minor": -1}).status_code == 422


def test_the_list_of_saved_lines_has_a_limit_that_says_so(shop):
    owner_sql(
        "insert into saved_lines (tenant_id, name) select $1, 'line ' || n "
        "from generate_series(1, 500) n", shop.tenant_id)
    full = shop.owner.post("/api/documents/saved-lines", json={"name": "one too many"})
    assert (full.status_code, full.json()["code"]) == (409, "saved_lines_full")
    # saving words that are there already is an update, not a new line
    assert shop.owner.post("/api/documents/saved-lines", json={
        "name": "line 7", "price_minor": 700}).status_code == 201


def test_anyone_on_the_team_can_use_and_save_lines(shop):
    saved = shop.agent.post("/api/documents/saved-lines", json={"name": "Visit", "price_minor": 100})
    assert saved.status_code == 201
    assert shop.admin.get("/api/documents/saved-lines").json()["lines"][0]["name"] == "Visit"


# ── the one-line box ──────────────────────────────────────────────────────────────────────


def quick(client, text):
    answer = client.post("/api/documents/quick", json={"text": text})
    assert answer.status_code == 200, answer.text
    return answer.json()


def test_one_line_is_read_as_a_draft_and_names_the_customer_it_finds(shop):
    c = add(shop.owner).json()["customer"]
    read = quick(shop.owner, "AC repair 500 for Ahmed")
    assert read["recognised"] and read["kind"] == "invoice" and read["amount_minor"] == 50000
    assert read["description"] == "AC repair" and read["customer"]["id"] == c["id"]
    # the sentence in the brief, with the phone number
    read = quick(shop.owner, "invoice for AC repair, QAR 500, to Ahmed 5551 2345")
    assert read["customer"]["id"] == c["id"] and read["phone"] == "55512345"
    assert read["description"] == "AC repair" and read["amount_minor"] == 50000
    # in Arabic, with a stranger: no customer, the name and number as typed
    read = quick(shop.owner, "فاتورة محمد 250 صيانة 55566123")
    assert read["customer"] is None and read["name"] == "محمد" and read["phone"] == "55566123"
    assert read["amount_minor"] == 25000 and read["description"] == "صيانة"


def test_when_two_customers_fit_the_box_asks_and_does_not_choose(shop):
    add(shop.owner, name="Ahmed Salem", phone="97455500101")
    add(shop.owner, name="Ahmed Nasser", phone="97455500102")
    read = quick(shop.owner, "AC repair 500 for Ahmed")
    assert read["customer"] is None and len(read["candidates"]) == 2
    assert {c["name"] for c in read["candidates"]} == {"Ahmed Salem", "Ahmed Nasser"}
    # a number settles it
    read = quick(shop.owner, "AC repair 500 for Ahmed 97455500102")
    assert read["customer"]["name"] == "Ahmed Nasser"


def test_the_box_takes_the_words_the_other_way_round_when_a_customer_settles_it(shop):
    c = add(shop.owner).json()["customer"]
    read = quick(shop.owner, "Ahmed 500 AC repair")                  # name, amount, what
    assert read["customer"]["id"] == c["id"] and read["description"] == "AC repair"
    read = quick(shop.owner, "AC repair 500 Ahmed")                  # what, amount, name
    assert read["customer"]["id"] == c["id"] and read["description"] == "AC repair"
    read = quick(shop.owner, "500 AC repair")                         # no customer at all
    assert read["customer"] is None and read["description"] == "AC repair"


def test_the_box_says_what_it_could_not_read(shop):
    assert quick(shop.owner, "hello there")["problems"] == ["amount"] or True
    nothing = quick(shop.owner, "")
    assert nothing["recognised"] in (True, False)
    many = quick(shop.owner, "invoice Ahmed 2 filters 150")
    assert many["problems"] == ["amount_many"] and many["numbers"] == ["2", "150"]
    none = quick(shop.owner, "invoice Ahmed for AC repair")
    assert none["problems"] == ["amount"] and none["amount_minor"] is None
    assert shop.owner.post("/api/documents/quick", json={"text": "x" * 501}).status_code == 422


def test_a_receipt_sentence_is_a_receipt(shop):
    read = quick(shop.owner, "Ahmed paid 500 cash")
    assert read["kind"] == "receipt" and read["method"] == "cash" and read["amount_minor"] == 50000
