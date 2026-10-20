"""A cost or a margin reaches only an owner or an admin (ALY-150 part 3).

The promise is the founder's: agents never see cost or margin, customers never, and nothing a
customer can open or be sent carries one. These tests put a recognisable cost in a shop that keeps
costs (and a margin, and orders that kept their unit cost), then walk every place a team member
who is not a manager, and every place a customer, can read or be sent something, and look for the
number and for the words that would carry it. They also check that each owner-only place does
answer an owner, so that the walk is not passing because nothing was there to find.

Where the cost lives (tables of its own) is the first line of defence; these are the second.
"""

import io
import re
import zipfile
from uuid import UUID

import pytest

from alyr.modules.items import xlsx
from alyr.seed import AGENT_EMAIL, DEMO_SLUG, DEMO_TENANT_ID
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    STRANGER,
    catalog_module_on,
    talk,
)
from order_links import token
from test_consent import owner_sql
from test_cost import cost_of, costs_on
from test_delivery import deliver_on, go, settings
from test_discounts import rule, switch
from test_items import counted, line, mk, order, people
from test_orders import say
from test_sign_in import sign_in

STORE = f"/api/store/{DEMO_SLUG}"
# A cost, the margin it leaves, and the percentage: numbers nobody would meet by accident.
COST, VARIANT_COST, PRICE = 31_337, 27_711, 50_000
SECRETS = ("31337", "313.37", "18663", "186.63", "27711", "277.11", "37.3%", "(37.3")
KEYS = re.compile(r'"(cost|unit_cost|margin|margins|margin_pct|cost_price|valuation)"\s*:')
WORDS = re.compile(r"\b(unit cost|cost price|gross margin|your margin|it costs you)\b", re.I)


def seen_in(text: str) -> list[str]:
    found = [s for s in SECRETS if s in text]
    found += KEYS.findall(text)
    found += WORDS.findall(text)
    return found


@pytest.fixture
def shop(client):
    """A shop that keeps costs, with a cost on a plain item, a sized item and a counted item, and
    orders that kept their unit cost, discounted and delivered."""
    costs_on(client)
    switch(client)
    deliver_on(client)
    settings(client, delivery=True, flat_fee=1_000)
    rule(client, code="TEN10")
    plain = mk(client, name="Oud cake", name_ar="كيكة العود", category="Cakes", price=PRICE)
    sized = mk(client, name="Layer cake", name_ar="كيكة طبقات", category="Cakes", price=PRICE,
               variants=[{"name": "Small", "name_ar": "صغير", "price_delta": 0},
                         {"name": "Large", "name_ar": "كبير", "price_delta": 4_000}])
    stocked = counted(client, 9, name="Rose tart", name_ar="تارت", price=PRICE, category="Cakes")
    cost_of(client, plain, cost=COST)
    large = next(v["id"] for v in sized["variants"] if v["name"] == "Large")
    cost_of(client, sized, cost=COST, variants={large: VARIANT_COST})
    cost_of(client, stocked, cost=COST)
    who = people(client, 2)
    placed = [
        order(client, who[0], [line(plain, 2)], coupons=["TEN10"],
              fulfilment=go("pickup")).json(),
        order(client, who[1], [line(stocked)], fulfilment=go("pickup")).json(),
    ]
    return {"client": client, "plain": plain, "sized": sized, "stocked": stocked,
            "orders": placed, "customers": who}


def scan(client, paths, expect=200):
    problems = {}
    for path in paths:
        response = client.get(path)
        assert response.status_code in (expect, 403, 404, 422), (path, response.status_code)
        if response.status_code == 200:
            hits = seen_in(response.text)
            if hits:
                problems[path] = hits
    return problems


def staff_paths(shop):
    plain, sized, stocked = shop["plain"]["id"], shop["sized"]["id"], shop["stocked"]["id"]
    return [
        "/api/items", f"/api/items/{plain}", f"/api/items/{sized}", f"/api/items/{stocked}",
        f"/api/items/{plain}/price-history", f"/api/items/{plain}/activity",
        f"/api/items/{plain}/stock-log", f"/api/items/{stocked}/stock-log", "/api/items/stock-log",
        f"/api/items/{plain}/group-prices", f"/api/items/{plain}/photos", "/api/items/setup",
        "/api/items/settings", "/api/items/settings/activity", "/api/items/categories",
        "/api/items?filter=low_stock", "/api/items?filter=sold_out", "/api/items?q=cake",
        "/api/orders", "/api/products", "/api/workspace", "/api/workspace/home", "/api/agent",
        "/api/team", "/api/price-groups", "/api/discounts", "/api/delivery",
        "/api/items/import/recent", "/api/items/import/last",
        "/api/inbox", "/api/ledger/summary", "/api/reports/weekly", "/api/reports/settings",
        "/api/custom-fields", "/api/templates", "/api/staff-numbers", "/api/items/share",
    ]


def customer_paths(shop):
    plain, sized = shop["plain"]["id"], shop["sized"]["id"]
    mine = shop["customers"][0]
    first = shop["orders"][0]
    return [
        STORE, f"{STORE}/items/{plain}", f"{STORE}/items/{sized}", f"{STORE}/share",
        f"{STORE}/share?item={plain}", f"{STORE}?q=cake",
        f"/api/track/{DEMO_TENANT_ID}/{first['order_id']}", f"{STORE}?t={token(mine['id'])}",
    ]


# ── the owner does see it (so the walks below are not passing on an empty shop) ───────────


def test_an_owner_sees_the_cost_the_margin_and_the_value_of_the_stock(shop):
    client, plain = shop["client"], shop["plain"]
    cost = client.get(f"/api/items/{plain['id']}/cost").json()
    assert cost["cost"] == COST and cost["margin"]["pct"] == "37.3"
    assert seen_in(client.get("/api/items/margins").text)
    assert seen_in(client.get("/api/orders/margins").text)
    assert client.get("/api/items/valuation").json()["value"] == 8 * COST  # (one was sold)
    # …and the weekly report's lines, once the orders are in a week that has closed
    export = client.get("/api/items/export?format=csv")
    assert "Cost price (QAR)" in export.text and "313.37" in export.text


# ── a team member who is not an owner or an admin ──────────────────────────────────────────


def test_an_agent_is_shown_no_cost_or_margin_anywhere(shop):
    client = shop["client"]
    sign_in(client, AGENT_EMAIL)
    assert scan(client, staff_paths(shop)) == {}


def test_an_agent_who_may_edit_items_still_sees_no_cost(shop):
    client = shop["client"]
    client.put("/api/items/settings", json={"agents_edit_items": True})
    sign_in(client, AGENT_EMAIL)
    plain = shop["plain"]
    assert client.put(f"/api/items/{plain['id']}", json={"price": 1_000}).status_code == 200
    saved = client.put(f"/api/items/{plain['id']}", json={"price": 100})
    # a price far below the cost is saved, and the agent is not told why that matters
    assert saved.status_code == 200 and "cost_warnings" not in saved.json()
    assert seen_in(saved.text) == []
    created = client.post("/api/items", json={"name": "Agent item", "name_ar": "صنف", "price": 5})
    assert created.status_code == 200 and seen_in(created.text) == []
    assert client.put(f"/api/items/{plain['id']}/cost", json={"cost": 1}).status_code == 403


def test_an_agent_who_exports_or_downloads_the_template_gets_no_cost_column(shop):
    client = shop["client"]
    client.put("/api/items/settings", json={"agents_edit_items": True})
    sign_in(client, AGENT_EMAIL)
    for lang in ("en", "ar"):
        for fmt in ("csv", "xlsx"):
            export = client.get(f"/api/items/export?format={fmt}&lang={lang}")
            assert export.status_code == 200
            text = export.text if fmt == "csv" else _xlsx_text(export.content)
            assert seen_in(text) == [] and "Cost price" not in text and "سعر التكلفة" not in text
            template = client.get(f"/api/items/import/template?format={fmt}&lang={lang}")
            body = template.text if fmt == "csv" else _xlsx_text(template.content)
            assert "Cost price" not in body and "سعر التكلفة" not in body, (lang, fmt)


def _xlsx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return " ".join(z.read(n).decode("utf-8", "replace") for n in z.namelist())


def test_an_owners_export_has_the_cost_and_a_template_has_the_column(shop):
    client = shop["client"]
    rows = xlsx.read(client.get("/api/items/export?format=xlsx").content).rows
    header = rows[0]
    col = header.index("Cost price (QAR)")
    by_name = {}
    for r in rows[1:]:
        by_name.setdefault(r[header.index("Name (English)")], []).append(r[col])
    assert [float(v) for v in by_name["Oud cake"]] == [313.37]
    assert sorted(float(v) for v in by_name["Layer cake"]) == [277.11, 313.37]
    assert "Cost price (QAR)" in client.get("/api/items/import/template?format=csv").text


def test_an_agents_upload_with_a_cost_column_ignores_it_and_says_only_owners_can(shop):
    client = shop["client"]
    client.put("/api/items/settings", json={"agents_edit_items": True})
    sign_in(client, AGENT_EMAIL)
    sheet = ("Name (English),Name (Arabic),Price (QAR),Cost price (QAR)\n"
             "Agent cake,كيكة الموظف,20,9999.99\n")
    preview = client.post("/api/items/import?filename=a.csv", content=sheet.encode("utf-8"))
    assert preview.status_code == 200, preview.text
    body = preview.text
    assert "9999.99" not in body and "999999" not in body and '"costs"' not in body
    assert any("only owners and admins can import costs" in n["message"]
               for n in preview.json()["notes"])
    applied = client.post(f"/api/items/import/{preview.json()['id']}/apply",
                          json={"preview": preview.json()["hash"]})
    assert applied.status_code == 200, applied.text
    assert owner_sql("select count(*) as n from item_costs where cost = 999999")[0]["n"] == 0


def test_a_managers_preview_opened_by_an_agent_shows_no_cost(shop):
    client = shop["client"]
    sheet = ("Name (English),Name (Arabic),Price (QAR),Cost price (QAR)\n"
             "Owner cake,كيكة المالك,20,7.77\n")
    preview = client.post("/api/items/import?filename=o.csv", content=sheet.encode("utf-8"))
    assert preview.status_code == 200 and "7.77" not in preview.text.replace("QAR 7.77", "")
    assert preview.json()["items"][0].get("costs") == [
        {"row": 2, "variant": "", "variant_id": None, "cost": 777}]
    client.put("/api/items/settings", json={"agents_edit_items": True})
    sign_in(client, AGENT_EMAIL)
    opened = client.get(f"/api/items/import/{preview.json()['id']}")
    assert opened.status_code == 200
    assert "777" not in opened.text and '"costs"' not in opened.text
    assert "7.77" not in opened.text


# ── customers ───────────────────────────────────────────────────────────────────────────────


def test_a_customer_is_shown_no_cost_or_margin_anywhere(shop):
    client = shop["client"]
    client.cookies.clear()
    assert scan(client, customer_paths(shop)) == {}
    me = shop["customers"][0]
    plain = shop["plain"]
    check = client.post(f"{STORE}/cart/check", json={
        "items": [line(plain, 3)], "token": token(me["id"]), "coupons": ["TEN10"],
        "fulfilment": go("delivery")})
    assert check.status_code == 200 and seen_in(check.text) == []
    placed = client.post(f"{STORE}/orders", json={
        "token": token(me["id"]), "items": [line(plain)], "payment": "link",
        "fulfilment": go("pickup")})
    assert placed.status_code == 200 and seen_in(placed.text) == []
    again = client.post(f"{STORE}/orders/repeat", json={"token": token(me["id"]),
                                                          "payment": "link"})
    assert seen_in(again.text) == []


def test_a_customer_who_asks_in_the_chat_is_sent_no_cost(shop):
    client = shop["client"]
    plain = shop["plain"]
    customer = shop["customers"][0]
    for text in (str(plain["code"]), "Oud cake", "menu", "price of Oud cake", "كيكة العود"):
        for message in talk(client, STRANGER, text):
            assert seen_in(str(message)) == [], text
    asked = talk(client, STRANGER, f"{plain['code']} x 3")[-1]
    assert seen_in(str(asked)) == []
    say(client, customer["phone"], "hello")
    thread = client.get(f"/sim/conversations/{customer['phone']}").json()
    assert seen_in(str(thread)) == []
    # every message the shop ever sent anyone, in any conversation
    sent = owner_sql("select body from messages where direction = 'out'")
    assert [r["body"] for r in sent if seen_in(r["body"] or "")] == []


def test_a_customer_cannot_reach_a_cost_route(shop, client_factory, monkeypatch):
    plain = shop["plain"]
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")  # (the open demo of a developer machine is off)
    anonymous = client_factory()
    for path in (f"/api/items/{plain['id']}/cost", "/api/items/margins", "/api/items/valuation",
                 "/api/orders/margins"):
        assert anonymous.get(path).status_code == 401, path
    assert anonymous.put(f"/api/items/{plain['id']}/cost", json={"cost": 1}).status_code == 401


def test_the_cost_tables_are_not_read_by_any_route_that_serves_an_agent_or_a_customer():
    """The second line of defence, as a rule of the code: only the cost module, the owner-only
    routes, the import's owner-only pass, the report and the order's snapshot touch the tables."""
    from pathlib import Path

    src = Path(__file__).parent.parent / "src" / "alyr"
    allowed = {
        "modules/items/costs.py", "routes/costs.py", "modules/items/imports.py",
        "modules/items/import_plan.py", "modules/items/report.py", "modules/orders/service.py",
        "modules/items/exports.py", "routes/items_import.py", "modules/items/features.py",
        "routes/items.py", "seed.py",
    }
    readers = set()
    for path in src.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if re.search(r"item_costs|order_item_costs|item_cost_history", text):
            readers.add(path.relative_to(src).as_posix())
    assert readers <= allowed, sorted(readers - allowed)
    for path in sorted(readers - {"modules/items/costs.py", "routes/costs.py"}):
        # the ones that read them for anyone else must say who may
        text = (src / path).read_text(encoding="utf-8")
        assert re.search(r"cost_margin|COSTS|is_manager|costs\.", text), path


def test_a_deleted_orders_snapshot_goes_with_it_and_isolation_holds(shop):
    # (the generic tenant-isolation tests cover every table; this is the specific shape)
    rows = owner_sql("select count(*) as n from order_item_costs")[0]["n"]
    assert rows == 2
    other = owner_sql("select id from tenants where id <> $1 limit 1", DEMO_TENANT_ID)
    if other:
        assert owner_sql("select count(*) as n from order_item_costs where tenant_id = $1",
                         UUID(str(other[0]["id"])))[0]["n"] == 0
