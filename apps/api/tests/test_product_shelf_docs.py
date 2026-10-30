"""ALYR Shelf and ALYR Docs in the workspace's line-up (D-046, D-123).

The Catalog module is ALYR Shelf and the Documents module is ALYR Docs. This file proves:
the registry lists them in the public site's order, in both languages, saying only what is
built; the Products screen switches them on and off and keeps every record; the weekly
report and every quote stay exactly as they were; and the back office offers them.
"""

import re
from types import SimpleNamespace

import pytest

from alyr import catalog
from alyr.core import pricing
from alyr.modules.agent import week
from alyr.seed import ALYR_STAFF_EMAIL
from documents_support import SELLER, issued, make_shop, sign_in_all
from test_consent import owner_sql
from test_items import mk
from test_sign_in import code_for, sign_in

ADMIN = "/api/admin"
ARABIC = re.compile("[؀-ۿ]")
# What the new products must not say: unbuilt things (D-039), the held standalone mode, ALYR's
# own invoices, the accountant export, a promise of price or a word the brand bans.
UNBUILT = re.compile(
    r"coming|soon|\bfree\b|no cost|accountant|e-?invoic|tax invoice|standalone|barcode|expiry"
    r"|\bAI\b|smart|intelligen|قريباً|مجاني|ذكي|ذكاء|المحاسب",
    re.I,
)


def shelf_and_docs():
    return catalog.PRODUCT_BY_KEY["shelf"], catalog.PRODUCT_BY_KEY["docs"]


def state_of(client):
    answer = client.get("/api/workspace")
    assert answer.status_code == 200, answer.text
    return answer.json()


def product(state, key):
    return next(p for p in state["products"] if p["key"] == key)


def nav_keys(state):
    return [s["key"] for s in state["nav"]["products"]]


def card_keys(client):
    return [c["key"] for c in client.get("/api/workspace/home").json()["cards"]]


@pytest.fixture
def new_shop(client_factory, monkeypatch):
    """A shop with an owner, an admin and an agent and no module switched on."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    return sign_in_all(client_factory, make_shop(documents=False))


# ── the registry ──────────────────────────────────────────


def test_the_line_up_is_the_public_sites_six_products_in_its_order():
    assert [p.key for p in catalog.PRODUCTS] == [
        "chat", "bookings", "agent", "accounts", "shelf", "docs",
    ]
    shelf, docs = shelf_and_docs()
    # The Catalog and Documents modules are the new products' own modules; both can be switched.
    assert (shelf.modules, shelf.status) == (("catalog",), "available")
    assert (docs.modules, docs.status) == (("documents",), "available")
    # Only Shelf comes "with every product" (D-046) and is never priced as an added product.
    assert [p.key for p in catalog.PRODUCTS if p.bundled] == ["shelf"]
    # ALYR Agent is still the only product every business has.
    assert [p.key for p in catalog.PRODUCTS if p.status == "included"] == ["agent"]
    # Neither is shared with another product: they say a shop is using them.
    assert catalog.SHARED_MODULES == {"inbox", "payments"}
    assert catalog.own_modules(shelf) == ("catalog",)
    assert catalog.own_modules(docs) == ("documents",)


def test_names_stay_latin_and_descriptors_are_the_public_sites():
    shelf, docs = shelf_and_docs()
    assert shelf.name == catalog.Text("ALYR Shelf", "ALYR Shelf")
    assert docs.name == catalog.Text("ALYR Docs", "ALYR Docs")
    assert (shelf.descriptor.en, shelf.descriptor.ar) == ("Items and stock", "الأصناف والمخزون")
    assert (docs.descriptor.en, docs.descriptor.ar) == (
        "Receipts and invoices", "الإيصالات والفواتير",
    )


def test_both_are_worded_in_both_languages_and_claim_nothing_unbuilt():
    for item in shelf_and_docs():
        texts = [item.name, item.descriptor, item.summary, *item.parts]
        assert item.parts, item.key
        for text in texts:
            assert text.en.strip() and text.ar.strip(), (item.key, text)
            assert not ARABIC.search(text.en), (item.key, text.en)
            assert not UNBUILT.search(text.en) and not UNBUILT.search(text.ar), (item.key, text)
        for text in (item.descriptor, item.summary, *item.parts):
            assert ARABIC.search(text.ar), (item.key, text.ar)
        # No line ends in an ellipsis in either language (a truncated word is a bug).
        assert not any(t.en.endswith(("…", "...")) or t.ar.endswith(("…", "...")) for t in texts)


def test_docs_says_what_is_built_and_what_the_law_leaves_to_a_registered_shop():
    docs = catalog.PRODUCT_BY_KEY["docs"]
    en = docs.summary.en
    # The channels carry their condition: the chat while it is open, or email or a link.
    assert "while it is open" in en and "email or a link" in en
    # A shop with no commercial registration number gets receipts, not invoices.
    assert "no commercial registration number gets receipts; invoices need one" in en
    assert "ما دامت مفتوحة" in docs.summary.ar and "تتطلب رقماً" in docs.summary.ar


def test_what_switching_each_off_does_is_said_before_it_is_switched_off():
    shelf, docs = shelf_and_docs()
    for item in (shelf, docs):
        assert item.off_note and ARABIC.search(item.off_note.ar)
        assert "kept" in item.off_note.en or "Nothing is deleted" in item.off_note.en
        assert not UNBUILT.search(item.off_note.en) and not UNBUILT.search(item.off_note.ar)
    # The Catalog's note is about the order page, so it is said only to a shop that takes orders.
    assert (shelf.off_note_when, docs.off_note_when) == ("orders", "")
    assert "older order page" in shelf.off_note.en
    assert [p.key for p in catalog.PRODUCTS if p.off_note] == ["shelf", "docs"]


def test_shelf_is_not_priced_on_its_own_and_docs_has_no_price_in_the_words():
    shelf, docs = shelf_and_docs()
    assert "not priced on its own" in shelf.summary.en
    assert "QAR" not in docs.summary.en and "ر.ق" not in docs.summary.ar


def test_which_products_a_set_of_modules_means_with_the_new_ones():
    using = catalog.products_for
    # Everything that was true before is still true for a shop without the new modules.
    assert using({"inbox", "bookings", "payments"}) == ["bookings", "agent"]
    assert using({"inbox", "ledger", "payments"}) == ["chat", "agent", "accounts"]
    assert using(set()) == ["agent"]
    # The Catalog makes ALYR Shelf in use, and Documents makes ALYR Docs; neither takes the
    # shared inbox or payment links, nor changes which of Chat and Bookings a shop is using.
    assert using({"catalog"}) == ["agent", "shelf"]
    assert using({"documents"}) == ["agent", "docs"]
    assert using({"inbox", "orders", "payments", "catalog", "documents"}) == [
        "chat", "agent", "shelf", "docs",
    ]
    assert using({"inbox", "bookings", "payments", "catalog"}) == ["bookings", "agent", "shelf"]


# ── the Products screen ───────────────────────────────────


def test_the_products_screen_lists_both_in_english_and_arabic(new_shop):
    state = state_of(new_shop.owner)
    assert [p["key"] for p in state["products"]] == [
        "chat", "bookings", "agent", "accounts", "shelf", "docs",
    ]
    shelf, docs = product(state, "shelf"), product(state, "docs")
    # A shop with neither module: both are there to switch on.
    assert (shelf["status"], docs["status"]) == ("available", "available")
    assert shelf["name"] == {"en": "ALYR Shelf", "ar": "ALYR Shelf"}
    assert shelf["descriptor"] == {"en": "Items and stock", "ar": "الأصناف والمخزون"}
    assert docs["descriptor"] == {"en": "Receipts and invoices", "ar": "الإيصالات والفواتير"}
    for item in (shelf, docs):
        assert item["summary"]["en"] and ARABIC.search(item["summary"]["ar"])
        assert item["includes"] and all(
            p["label"]["en"] and ARABIC.search(p["label"]["ar"]) for p in item["includes"]
        )
        assert item["steps"] == []  # nothing has to be done before either is useful
    assert [p["label"]["en"] for p in docs["includes"]] == [
        "Receipts and invoices", "Credit notes", "Your logo, colour and numbering",
        "Connect another system",
    ]
    # The products that had modules to list still list them.
    assert [p["label"]["en"] for p in product(state, "chat")["includes"]] == [
        "Team inbox", "Orders", "Payment links",
    ]
    assert [p["label"]["en"] for p in product(state, "agent")["includes"]] == [
        "Home dashboard", "Sunday report",
    ]


def test_an_agent_cannot_switch_either(new_shop):
    for key in ("shelf", "docs"):
        assert new_shop.agent.post(f"/api/workspace/products/{key}/enable").status_code == 403
        assert new_shop.agent.post(f"/api/workspace/products/{key}/disable").status_code == 403
    assert owner_sql(
        "select 1 from tenant_modules where tenant_id = $1", new_shop.tenant_id
    ) == []


def test_docs_on_shows_its_screens_and_off_hides_them_and_keeps_every_record(new_shop):
    owner = new_shop.owner
    assert "documents" not in nav_keys(state_of(owner))
    assert owner.get("/api/documents").status_code == 403

    assert owner.post("/api/workspace/products/docs/enable").json() == {"enabled": ["documents"]}
    state = state_of(owner)
    assert product(state, "docs")["status"] == "active"
    screen = next(s for s in state["nav"]["products"] if s["key"] == "documents")
    assert screen["label"] == {"en": "Documents", "ar": "المستندات"}
    assert {"unpaid_invoices", "documents_not_delivered"} <= set(card_keys(owner))

    assert owner.put("/api/documents/settings", json=SELLER).status_code == 200
    paper = issued(owner)
    count = "select count(*) as n from documents where tenant_id = $1"
    assert owner_sql(count, new_shop.tenant_id)[0]["n"] == 1

    assert owner.post("/api/workspace/products/docs/disable").json() == {"disabled": ["documents"]}
    state = state_of(owner)
    assert product(state, "docs")["status"] == "available"
    assert "documents" not in nav_keys(state)
    assert not {"unpaid_invoices", "documents_not_delivered"} & set(card_keys(owner))
    assert owner.get("/api/documents").status_code == 403
    assert owner.get(f"/api/documents/{paper['id']}").status_code == 403
    # Nothing was deleted, and the paper is exactly as it was when the shop switches it back on.
    assert owner_sql(count, new_shop.tenant_id)[0]["n"] == 1
    owner.post("/api/workspace/products/docs/enable")
    again = owner.get(f"/api/documents/{paper['id']}")
    assert again.status_code == 200
    assert again.json()["document"]["number"] == paper["number"]
    assert owner.get("/api/documents").status_code == 200


def test_shelf_on_shows_the_catalog_and_off_hides_it_and_keeps_every_item(new_shop):
    owner = new_shop.owner
    assert "catalog" not in nav_keys(state_of(owner))
    assert owner.post("/api/workspace/products/shelf/enable").json() == {"enabled": ["catalog"]}
    state = state_of(owner)
    assert product(state, "shelf")["status"] == "active"
    assert "catalog" in nav_keys(state)
    item = mk(owner, name="Date cake")
    items = "select count(*) as n from items where tenant_id = $1"
    before = owner_sql(items, new_shop.tenant_id)[0]["n"]
    assert before >= 1

    assert owner.post("/api/workspace/products/shelf/disable").json() == {"disabled": ["catalog"]}
    state = state_of(owner)
    assert product(state, "shelf")["status"] == "available"
    assert "catalog" not in nav_keys(state)
    assert owner.get("/api/items").status_code == 403  # no orders module either
    assert owner_sql(items, new_shop.tenant_id)[0]["n"] == before

    owner.post("/api/workspace/products/shelf/enable")
    assert owner.get(f"/api/items/{item['id']}").json()["name"] == "Date cake"


def test_switching_shelf_off_leaves_the_products_a_shop_takes_orders_with(new_shop):
    owner = new_shop.owner
    owner_sql(
        "insert into tenant_modules (tenant_id, module_key) "
        "select $1, unnest(array['inbox', 'orders', 'payments', 'catalog'])", new_shop.tenant_id,
    )
    state = state_of(owner)
    assert [product(state, k)["status"] for k in ("chat", "shelf")] == ["active", "active"]
    # Customers' order page is the Catalog's when it is on, so the owner is told before it goes.
    assert "older order page" in product(state, "shelf")["off_note"]["en"]
    assert ARABIC.search(product(state, "shelf")["off_note"]["ar"])
    assert product(state, "chat")["off_note"] is None
    # Only its own module goes: ALYR Chat's inbox, orders and payment links are not touched.
    assert owner.post("/api/workspace/products/shelf/disable").json() == {"disabled": ["catalog"]}
    state = state_of(owner)
    assert [product(state, k)["status"] for k in ("chat", "shelf")] == ["active", "available"]
    # Orders still reach the items the shop added, whether or not the Catalog screen is on.
    assert owner.get("/api/items").status_code == 200


def test_a_shop_with_no_orders_is_not_told_about_an_order_page(new_shop):
    owner = new_shop.owner
    owner.post("/api/workspace/products/shelf/enable")
    owner.post("/api/workspace/products/docs/enable")
    state = state_of(owner)
    assert product(state, "shelf")["off_note"] is None
    assert "receipts and invoices" in product(state, "docs")["off_note"]["en"]
    assert all(product(state, k)["off_note"] is None for k in ("chat", "bookings", "agent"))


def test_neither_new_product_is_included_for_every_business(new_shop):
    owner = new_shop.owner
    # Only ALYR Agent refuses a switch; the new ones answer like Chat, Bookings and Accounts.
    assert owner.post("/api/workspace/products/agent/enable").status_code == 422
    assert owner.post("/api/workspace/products/docs/enable").status_code == 200
    assert owner.post("/api/workspace/products/docs/disable").status_code == 200


# ── what must not move ────────────────────────────────────


def stub_week(modules, main="orders"):
    return SimpleNamespace(f=SimpleNamespace(modules=frozenset(modules)), main=main)


def test_the_sunday_report_names_only_the_products_it_has_numbers_for():
    base = {"inbox", "orders", "payments"}
    assert week.products(stub_week(base)) == ["chat"]
    # With the Catalog and Documents on, the report is the same: a product without a line
    # would have fallen into the Accounts branch and printed the ledger under its name.
    assert week.products(stub_week(base | {"catalog", "documents"})) == ["chat"]
    both = {"inbox", "orders", "bookings", "ledger", "payments", "catalog", "documents"}
    assert week.products(stub_week(both)) == ["chat", "bookings", "accounts"]
    assert week.products(stub_week(both, main="bookings")) == ["bookings", "chat", "accounts"]
    assert week.REPORT_PRODUCTS == {"chat", "bookings", "accounts"}


def price_list():
    return [pricing._item(r) for r in owner_sql("select * from price_items order by sort, key")]


@pytest.fixture
def prices_restored():
    before = owner_sql("select * from price_items")
    yield
    owner_sql("delete from price_items")
    for r in before:
        owner_sql(
            "insert into price_items (key, name, name_ar, kind, price, applies, active, sort, "
            "updated_by, price_usd) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            r["key"], r["name"], r["name_ar"], r["kind"], r["price"], r["applies"],
            r["active"], r["sort"], r["updated_by"], r["price_usd"],
        )


def lines_for(plist, modules):
    business = pricing.Business(None, "A shop", frozenset(modules))
    return pricing.draft_lines(plist, [business])


def test_registering_the_products_changes_no_quote():
    """A quote is drafted from the price list, and no price item names the new products. So
    a shop with the Catalog or Documents on is quoted exactly what the same shop without
    them is, for every shape of shop, and the product is not counted as an added one."""
    plist = price_list()
    assert not any(i["applies"] in ("product:shelf", "product:docs") for i in plist)
    for modules in (
        {"inbox", "orders", "payments"},
        {"inbox", "bookings", "payments"},
        {"inbox", "orders", "bookings", "payments"},
        {"inbox", "orders", "payments", "ledger"},
        {"ledger"},
        set(),
    ):
        plain = lines_for(plist, modules)
        assert lines_for(plist, modules | {"catalog"}) == plain
        assert lines_for(plist, modules | {"documents"}) == plain
        assert lines_for(plist, modules | {"catalog", "documents"}) == plain
    # And the numbers the founder knows (D-053): Chat is QAR 449, Agent is included.
    chat = lines_for(plist, {"inbox", "orders", "payments", "catalog", "documents"})
    assert [(x["item_key"], x["unit_price"]) for x in chat if x["kind"] == "monthly"] == [
        ("chat", 44900), ("agent", 0),
    ]


def test_a_price_item_for_shelf_is_charged_as_written_and_never_as_an_added_product(
    prices_restored,
):
    plist = price_list() + [pricing._item(_price_row("shelf", "product:shelf", 0))]
    quoted = lines_for(plist, {"inbox", "orders", "payments", "catalog"})
    monthly = [
        (x["item_key"], x["name"], x["unit_price"]) for x in quoted if x["kind"] == "monthly"
    ]
    # QAR 0 stays QAR 0: it is not turned into the "each extra product" price.
    assert ("shelf", "ALYR Shelf", 0) in monthly
    assert ("chat", "ALYR Chat", 44900) in monthly
    # Its presence does not make Chat or anything else an added product either.
    assert [m for m in monthly if "added product" in m[1]] == []
    # A business without the Catalog is not quoted it.
    assert "shelf" not in [x["item_key"] for x in lines_for(plist, {"inbox", "orders", "payments"})]


def _price_row(key, applies, price):
    from datetime import UTC, datetime

    return {
        "key": key, "name": f"ALYR {key.title()}", "name_ar": f"ALYR {key.title()}",
        "kind": "monthly", "price": price, "price_usd": None, "applies": applies,
        "active": True, "sort": 30, "updated_at": datetime.now(UTC), "updated_by": "test",
    }


def test_docs_priced_by_the_founder_joins_the_combination_price():
    """What the founder gets when they price Docs in the back office: it is a product like
    Chat or Accounts. Alone it is its own price; beside a dearer product it is the added price."""
    plist = price_list() + [pricing._item(_price_row("docs", "product:docs", 30000))]
    alone = lines_for(plist, {"documents"})
    assert [(x["item_key"], x["unit_price"]) for x in alone if x["kind"] == "monthly"] == [
        ("agent", 0), ("docs", 30000),
    ]
    beside_chat = lines_for(plist, {"inbox", "orders", "payments", "documents"})
    assert [(x["name"], x["unit_price"]) for x in beside_chat if x["kind"] == "monthly"] == [
        ("ALYR Chat", 44900), ("ALYR Agent, included", 0), ("ALYR Docs, added product", 5000),
    ]


def test_the_price_list_can_name_the_new_products(client_factory, prices_restored):
    office = client_factory()
    listed = office.get(f"{ADMIN}/pricing").json()["products"]
    assert [p["key"] for p in listed] == ["chat", "bookings", "agent", "accounts", "shelf", "docs"]
    body = {"name": "ALYR Docs", "name_ar": "ALYR Docs", "kind": "monthly", "price": 30000,
            "applies": "product:docs", "active": True, "sort": 30}
    assert office.put(f"{ADMIN}/pricing/items/docs", json=body).status_code == 200
    assert office.put(
        f"{ADMIN}/pricing/items/docs2", json={**body, "applies": "product:payroll"}
    ).status_code == 422


# ── the back office ───────────────────────────────────────


def test_the_back_office_creates_a_shop_with_either_product_switched_on(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    office = client_factory()
    sign_in(office, ALYR_STAFF_EMAIL)

    def create(slug, products):
        made = office.post(f"{ADMIN}/businesses", json={
            "name": f"Shop {slug}", "slug": slug, "owner_email": f"{slug}@shelfdocs.example",
            "owner_name": "Reem", "products": products,
        })
        assert made.status_code == 200, made.text
        return made.json()

    chat_docs = create("shelfdocs-chat-docs", ["chat", "docs"])
    # Documents joins what Chat brings; the Catalog is on for every new business (ALY-113).
    assert chat_docs["modules"] == ["inbox", "orders", "payments", "documents", "catalog"]
    shelf_only = create("shelfdocs-shelf", ["shelf"])
    assert shelf_only["modules"] == ["catalog"]
    plain = create("shelfdocs-chat", ["chat"])
    assert plain["modules"] == ["inbox", "orders", "payments", "catalog"]
    listed = {b["slug"]: b for b in office.get(f"{ADMIN}/businesses").json()["businesses"]}
    assert listed["shelfdocs-chat-docs"]["products"] == ["chat", "agent", "shelf", "docs"]
    assert listed["shelfdocs-shelf"]["products"] == ["agent", "shelf"]
    assert listed["shelfdocs-chat"]["products"] == ["chat", "agent", "shelf"]
    # A product that is not built, or not a product, still cannot be switched on.
    refused = office.post(f"{ADMIN}/businesses", json={
        "name": "X", "slug": "shelfdocs-bad", "owner_email": "bad@shelfdocs.example",
        "owner_name": "X", "products": ["payroll"],
    })
    assert refused.status_code == 422

    # The owner of the first shop signs in and sees Docs on and the Documents screen.
    owner = client_factory()
    owner.post("/api/auth/verify", json={
        "email": "shelfdocs-chat-docs@shelfdocs.example",
        "code": code_for(owner, "shelfdocs-chat-docs@shelfdocs.example"),
    })
    state = state_of(owner)
    assert product(state, "docs")["status"] == "active"
    assert product(state, "shelf")["status"] == "active"
    assert {"documents", "catalog"} <= set(nav_keys(state))
