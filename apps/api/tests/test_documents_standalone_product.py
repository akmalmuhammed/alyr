"""ALYR Invoices as a product, and the "Invoices only" way of signing up (ALY-141, spec 016, D-042
"As built (ALY-141)"): the bundle and its independence from every other module, the switch for
new shops (off: nothing changes; on: the way appears and makes a working shop), the Products
screen, the back office, and the steps that follow sign-up.
"""

from uuid import uuid4

import pytest

from alyr import catalog, presets
from alyr.config import get_settings
from test_consent import owner_sql
from test_onboarding import BASE, new_business

OTHER_MODULES = {"inbox", "orders", "bookings", "catalog", "ledger"}


@pytest.fixture
def switched_on(client_factory, monkeypatch):
    """A client of an app whose switch for new shops is on (the product lead has turned it on)."""
    monkeypatch.setenv("ALYR_INVOICES_FOR_NEW_SHOPS", "true")
    return client_factory()


def modules_of(slug: str) -> set[str]:
    return {r["module_key"] for r in owner_sql(
        "select m.module_key from tenant_modules m join tenants t on t.id = m.tenant_id "
        "where t.slug = $1 and m.enabled", slug)}


# ── the product ───────────────────────────────────────────────────────────────────────────


def test_alyr_invoices_is_documents_and_payment_links_and_nothing_else():
    product = catalog.PRODUCT_BY_KEY["invoices"]
    assert product.modules == ("documents", "payments") and product.status == "available"
    assert set(product.modules).isdisjoint(OTHER_MODULES)
    assert catalog.own_modules(product) == ("documents",)  # the module that says it is in use
    # Both languages, in plain words; the name stays Latin (D-025).
    assert product.name.en == product.name.ar == "ALYR Invoices"
    assert product.descriptor.en and product.descriptor.ar and product.summary.en and product.summary.ar
    assert any("؀" <= c <= "ۿ" for c in product.descriptor.ar + product.summary.ar)


def test_it_is_in_use_with_its_own_module_and_adds_to_other_products_without_changing_them():
    assert catalog.products_for({"documents", "payments"}) == ["agent", "invoices"]
    assert catalog.products_for({"documents"}) == ["agent", "invoices"]
    # Turning the others on later only adds to it.
    assert catalog.products_for({"documents", "payments", "orders", "inbox"}) == [
        "chat", "agent", "invoices"]
    assert catalog.products_for({"documents", "payments", "bookings", "inbox"}) == [
        "bookings", "agent", "invoices"]
    assert catalog.products_for({"documents", "payments", "ledger"}) == [
        "agent", "accounts", "invoices"]
    # A shop with the others and no documents module is exactly what it was.
    assert catalog.products_for({"orders", "inbox", "payments"}) == ["chat", "agent"]


def test_the_switch_for_shops_is_off_by_default_like_the_catalog_switch_was():
    assert get_settings().invoices_for_new_shops is False
    product = catalog.PRODUCT_BY_KEY["invoices"]
    assert catalog.offered(product) is False
    assert catalog.offered(product, using=True) is True      # a shop that has it keeps it
    assert catalog.offered(catalog.PRODUCT_BY_KEY["chat"]) is True


# ── the switch: off, nothing changes ──────────────────────────────────────────────────────


def test_with_the_switch_off_the_way_is_not_offered_and_cannot_be_chosen(client):
    types = client.get(f"{BASE}/types").json()["types"]
    assert "invoices" not in [t["key"] for t in types]
    assert len(types) == 11  # the eleven types there were, no more
    with pytest.raises(AssertionError):
        new_business(client, kind="invoices")


def test_with_the_switch_off_the_products_screen_is_as_it_was(client):
    keys = [p["key"] for p in client.get("/api/workspace").json()["products"]]
    assert keys == ["chat", "bookings", "agent", "accounts"]
    refused = client.post("/api/workspace/products/invoices/enable")
    assert refused.status_code == 404  # not there, as far as the shop can tell
    # and nothing was switched on by the refused request, in this shop's own list
    after = client.get("/api/workspace").json()
    assert [p["key"] for p in after["products"]] == keys
    assert not any(p["key"] == "invoices" and p.get("on") for p in after["products"])


# ── the switch: on ────────────────────────────────────────────────────────────────────────


def test_with_the_switch_on_the_way_is_offered_in_its_place_with_plain_words(switched_on):
    types = switched_on.get(f"{BASE}/types").json()["types"]
    found = next(t for t in types if t["key"] == "invoices")
    assert found["way"] == "invoices"
    assert found["name"] == {"en": "Invoices only", "ar": "فواتير فقط"}
    assert "nothing else" in found["hint"]["en"] and found["icon"] == "doc"


def test_an_invoices_only_shop_is_made_with_documents_and_payment_links_and_nothing_else(switched_on):
    _, slug, _ = new_business(switched_on, kind="invoices")
    assert modules_of(slug) == {"documents", "payments"}
    state = switched_on.get(f"{BASE}/state").json()
    assert state["way"] == "invoices" and state["steps"] == ["details", "first", "plan", "golive"]
    assert state["step"] == "details" and state["catalog"] is None
    assert state["documents"] == {
        "first": None, "has_registration": False, "email_ready": False,
        "whatsapp_connected": False}
    # Its workspace: Documents and ALYR Invoices, none of the others.
    shell = switched_on.get("/api/workspace").json()
    assert [p["key"] for p in shell["products"] if p["status"] in ("active", "included")] == [
        "agent", "invoices"]
    assert {s["key"] for s in shell["nav"]["products"]} == {"documents"}
    # Nothing it does not have answers: no orders, no inbox, no bookings, no catalog.
    for path in ("/api/orders", "/api/bookings", "/api/inbox/conversations", "/api/items",
                 "/api/ledger/summary"):
        assert switched_on.get(path).status_code == 403, path
    # No setup request for ALYR (it is a way an owner follows alone), and a private test line.
    assert owner_sql("select count(*) as n from setup_requests sr join tenants t "
                     "on t.id = sr.tenant_id where t.slug = $1", slug)[0]["n"] == 0
    assert owner_sql("select count(*) as n from channel_numbers c join tenants t "
                     "on t.id = c.tenant_id where t.slug = $1 and c.channel = 'simulator'",
                     slug)[0]["n"] == 1


def test_the_way_can_be_followed_to_a_first_document_that_is_sent_to_the_test_line(switched_on):
    _, slug, _ = new_business(switched_on, kind="invoices")
    saved = switched_on.put("/api/documents/settings", json={
        "commercial_registration": "77889", "address": "Salwa Road, Doha", "phone": "+974 5550 0199",
        "languages": "ar_en"})
    assert saved.status_code == 200, saved.text
    assert switched_on.patch(f"{BASE}/state", json={"step": "first"}).json()["step"] == "first"

    made = switched_on.post(
        "/api/documents", headers={"Idempotency-Key": "first-invoice-0001"},
        json={"kind": "invoice", "issue": True, "customer": {"name": "Ahmed", "phone": "55512345"},
              "lines": [{"description": "AC repair", "quantity": "1", "unit": "service",
                         "unit_price_minor": 50000}]})
    assert made.status_code == 201, made.text
    doc = made.json()["document"]
    assert doc["number"] == "INV-0001" and doc["totals"]["total_minor"] == 50000
    assert doc["seller"]["commercial_registration"] == "77889"
    state = switched_on.get(f"{BASE}/state").json()
    assert state["documents"]["first"] == {"id": doc["id"], "kind": "invoice", "number": "INV-0001"}
    assert state["documents"]["has_registration"] is True

    sent = switched_on.post(f"{BASE}/test-send", json={"document_id": doc["id"], "lang": "en"})
    assert sent.status_code == 200, sent.text
    assert sent.json()["delivery"]["channel"] == "whatsapp"
    chat = switched_on.get(f"{BASE}/test-chat").json()["messages"]
    arrived = [m for m in chat if m["kind"] == "document"]
    assert len(arrived) == 1 and "INV-0001" in arrived[0]["body"]
    assert arrived[0]["payload"]["filename"] == "INV-0001.pdf"
    # The owner's own test customer is not one of their customers: not listed, not offered.
    listed = switched_on.get("/api/documents/customers/all").json()["customers"]
    assert listed == []
    assert switched_on.get("/api/documents/customers?q=test").json()["customers"] == []
    # The owner can finish: the test is over, the business is theirs.
    assert switched_on.post(f"{BASE}/finish").status_code == 200
    assert switched_on.get(f"{BASE}/state").json()["finished"] is True


def test_a_shop_with_no_registration_number_makes_a_receipt_first_and_is_told_so(switched_on):
    new_business(switched_on, kind="invoices")
    refused = switched_on.post(
        "/api/documents", headers={"Idempotency-Key": "first-invoice-0002"},
        json={"kind": "invoice", "issue": True, "customer": {"name": "Ahmed"},
              "lines": [{"description": "AC repair", "quantity": "1", "unit": "service",
                         "unit_price_minor": 50000}]})
    assert refused.status_code == 422 and refused.json()["code"] == "registration_needed"
    assert refused.json()["message_ar"]
    receipt = switched_on.post(
        "/api/documents", headers={"Idempotency-Key": "first-receipt-0001"},
        json={"kind": "receipt", "issue": True, "customer": {"name": "Ahmed"},
              "payments": [{"method": "cash", "amount_minor": 50000}],
              "lines": [{"description": "AC repair", "quantity": "1", "unit": "service",
                         "unit_price_minor": 50000}]})
    assert receipt.status_code == 201 and receipt.json()["document"]["number"] == "RC-0001"


def test_the_test_send_is_for_the_owner_and_for_a_document_that_exists(switched_on):
    new_business(switched_on, kind="invoices")
    nothing = switched_on.post(f"{BASE}/test-send", json={"document_id": str(uuid4()), "lang": "en"})
    assert nothing.status_code == 404
    assert switched_on.post(f"{BASE}/test-send", json={"document_id": "not-an-id"}).status_code == 422


def test_the_workspace_offers_the_product_to_a_shop_that_has_none_of_it(switched_on):
    shell = switched_on.get("/api/workspace").json()
    invoices = next(p for p in shell["products"] if p["key"] == "invoices")
    assert invoices["status"] == "available"
    assert [i["key"] for i in invoices["includes"]] == ["documents", "payments"]
    on = switched_on.post("/api/workspace/products/invoices/enable")
    assert on.status_code == 200 and on.json()["enabled"] == ["documents", "payments"]
    shell = switched_on.get("/api/workspace").json()
    assert next(p for p in shell["products"] if p["key"] == "invoices")["status"] == "active"
    assert "documents" in shell["modules"]
    # Its other products are as they were; switching it off keeps every record.
    chat = next(p for p in shell["products"] if p["key"] == "chat")
    assert chat["status"] in ("active", "available")
    off = switched_on.post("/api/workspace/products/invoices/disable")
    assert off.status_code == 200 and "documents" in off.json()["disabled"]


def test_a_shop_that_already_has_it_keeps_it_when_the_switch_is_off(client, monkeypatch):
    """The back office gave it to this shop before the switch was turned off again."""
    office = client
    owner_sql("insert into tenant_modules (tenant_id, module_key, enabled_by) "
              "select id, 'documents', 'test' from tenants where slug = 'al-noor' "
              "on conflict (tenant_id, module_key) do update set enabled = true")
    try:
        keys = {p["key"]: p["status"] for p in office.get("/api/workspace").json()["products"]}
        assert keys["invoices"] == "active"
        assert office.post("/api/workspace/products/invoices/disable").status_code == 200
        # and once off, with the switch off, it is not listed again
        assert "invoices" not in [p["key"] for p in office.get("/api/workspace").json()["products"]]
    finally:
        owner_sql("delete from tenant_modules where module_key = 'documents' and tenant_id = "
                  "(select id from tenants where slug = 'al-noor')")


# ── the back office ───────────────────────────────────────────────────────────────────────


def test_the_back_office_prices_the_product_like_the_others_and_needs_no_price(client):
    pricing = client.get("/api/admin/pricing").json()
    assert {"key": "invoices", "name": "ALYR Invoices", "status": "available"} in pricing["products"]
    # An item can be priced per client that uses it (D-032) ...
    saved = client.put("/api/admin/pricing/items/invoices_test", json={
        "name": "ALYR Invoices", "name_ar": "ALYR Invoices", "kind": "monthly", "price": 0,
        "applies": "product:invoices", "active": True, "sort": 90})
    assert saved.status_code == 200, saved.text
    owner_sql("delete from price_items where key = 'invoices_test'")
    # ... and it is free now: the starting list has no item for it.
    assert not [i for i in pricing["items"] if i["applies"] == "product:invoices"]
    types = {t["key"]: t for t in pricing["types"]}
    assert types["invoices"]["can_self_serve"] is True and types["invoices"]["name"] == "Invoices only"


def test_the_back_office_makes_an_invoices_only_shop_whatever_the_switch_says(client):
    assert get_settings().invoices_for_new_shops is False
    slug = f"invoices-{uuid4().hex[:8]}"
    made = client.post("/api/admin/businesses", json={
        "name": "Salem Maintenance", "name_ar": "سالم للصيانة", "slug": slug,
        "owner_email": f"salem-{uuid4().hex[:6]}@shop.example", "owner_name": "Salem",
        "products": ["invoices"]})
    assert made.status_code == 200, made.text
    assert modules_of(slug) == {"documents", "payments"}  # not even the Catalog every shop gets
    other = f"chat-{uuid4().hex[:8]}"
    assert client.post("/api/admin/businesses", json={
        "name": "Chat Shop", "slug": other, "owner_email": f"c-{uuid4().hex[:6]}@shop.example",
        "owner_name": "Owner", "products": ["chat"]}).status_code == 200
    assert "catalog" in modules_of(other)  # the others are made as they were


def test_a_type_the_back_office_hides_is_not_offered_even_with_the_switch_on(switched_on):
    office = switched_on
    changed = office.put("/api/admin/pricing/types/invoices", json={
        "availability": "hidden", "price_mode": "prepared"})
    assert changed.status_code == 200, changed.text
    try:
        assert "invoices" not in [t["key"] for t in switched_on.get(f"{BASE}/types").json()["types"]]
    finally:
        office.put("/api/admin/pricing/types/invoices", json={
            "availability": "self_serve", "price_mode": "prepared"})
    assert "invoices" in [t["key"] for t in switched_on.get(f"{BASE}/types").json()["types"]]


def test_the_preset_is_in_the_registry_once_and_declares_its_way():
    keys = [p.key for p in presets.PRESETS]
    assert keys.count("invoices") == 1
    preset = presets.PRESET_BY_KEY["invoices"]
    assert preset.way == "invoices" and preset.catalog is None and preset.requires_invoices
    assert preset.modules_for(True) == ("documents", "payments")  # no Catalog, even when it is on
    assert preset.offered(True) is False and preset.offered(True, invoices_on=True) is True
    assert presets.STEPS["invoices"] == ("details", "first", "plan", "golive")
    for ordinary in presets.PRESETS:
        if ordinary.key != "invoices":
            assert ordinary.offered(True, invoices_on=False) or ordinary.requires_catalog
