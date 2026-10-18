"""The Catalog's cards on the home screen (ALY-109, D-039, spec 007): "Sold out now" and "Low
stock", on the workspace home and on the ALYR Agent dashboard. Each number is the number of rows
in the Catalog list the card opens, in English and Arabic, and they exist only where the
Catalog module is on (it is off for every shop until go-live).
"""

from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from catalog_wa import catalog_module_on  # noqa: F401  (the autouse fixture is used by name)
from test_consent import owner_sql
from test_items import counted, line, mk, order, people
from test_sign_in import sign_in


def chips(client) -> dict:
    return client.get("/api/items?limit=1").json()["counts"]


def listed(client, kind: str) -> int:
    """How many rows the Catalog list shows when the card's link is followed."""
    return client.get(f"/api/items?filter={kind}&limit=200").json()["total"]


def card(cards, key):
    return next(c for c in cards if c["key"] == key)


def test_the_home_cards_are_the_number_of_rows_in_the_lists_they_open(client):
    switch = mk(client, name="Shawarma", name_ar="شاورما")
    client.post(f"/api/items/{switch['id']}/switch", json={"available": False})
    ran_out = counted(client, 1, name="Dates", name_ar="تمر")
    assert order(client, people(client, 1)[0], [line(ran_out, 1)]).status_code == 200
    counted(client, 2, name="Figs", name_ar="تين")  # low: two left, the shop's number is 5
    counted(client, 40, name="Rice", name_ar="أرز")  # plenty
    own = counted(client, 8, name="Oil", name_ar="زيت", low_stock_at=10)  # low by its own number
    mk(client, name="Tea", name_ar="شاي", status="draft")  # not on sale: not sold out

    cards = client.get("/api/workspace/home").json()["cards"]
    sold_out, low = card(cards, "sold_out"), card(cards, "low_stock")
    assert (sold_out["value"], low["value"]) == (2, 2)
    assert (sold_out["label"], low["label"]) == ({"en": "Sold out now", "ar": "نفدت الآن"},
                                                  {"en": "Low stock", "ar": "مخزون قليل"})
    assert sold_out["href"] == "/app/catalog?show=sold_out"
    assert low["href"] == "/app/catalog?show=low_stock"
    # Following the link shows exactly that many rows, and the chips say so too.
    assert listed(client, "sold_out") == sold_out["value"] == chips(client)["sold_out"]
    assert listed(client, "low_stock") == low["value"] == chips(client)["low_stock"]
    # The cards follow the shop: restock the sold-out item (now low, not sold out) and fill the
    # one that was low by its own number.
    client.post(f"/api/items/{ran_out['id']}/stock",
                json={"kind": "received", "quantity": 3, "reason": "delivery"})
    client.post(f"/api/items/{own['id']}/stock",
                json={"kind": "received", "quantity": 20, "reason": "delivery"})
    cards = client.get("/api/workspace/home").json()["cards"]
    assert (card(cards, "sold_out")["value"], card(cards, "low_stock")["value"]) == (1, 2)
    assert listed(client, "sold_out") == 1 and listed(client, "low_stock") == 2
    # The shop's other cards are what they were, and carry no link.
    assert "href" not in card(cards, "unanswered")


def test_the_agent_dashboard_draws_the_same_cards_in_both_languages(client):
    switch = mk(client, name="Shawarma", name_ar="شاورما")
    client.post(f"/api/items/{switch['id']}/switch", json={"available": False})
    counted(client, 2, name="Figs", name_ar="تين")
    counted(client, 3, name="Dates", name_ar="تمر")
    sign_in(client)
    en = client.get("/api/agent?lang=en").json()["catalog"]
    assert en == {"title": "Catalog", "cards": [
        {"key": "sold_out", "label": "Sold out now", "value": 1, "text": "1",
         "href": "/app/catalog?show=sold_out"},
        {"key": "low_stock", "label": "Low stock", "value": 2, "text": "2",
         "href": "/app/catalog?show=low_stock"},
    ]}
    ar = client.get("/api/agent?lang=ar").json()["catalog"]
    assert ar["title"] == "الكتالوج"
    assert [(c["label"], c["value"]) for c in ar["cards"]] == [("نفدت الآن", 1),
                                                                ("مخزون قليل", 2)]
    assert listed(client, "sold_out") == en["cards"][0]["value"]
    assert listed(client, "low_stock") == en["cards"][1]["value"]


def test_a_card_with_nothing_to_show_is_a_number_and_not_a_link(client):
    mk(client, name="Shawarma", name_ar="شاورما")
    sign_in(client)
    cards = client.get("/api/agent").json()["catalog"]["cards"]
    assert [(c["value"], c["text"], c["href"]) for c in cards] == [(0, "0", None), (0, "0", None)]


def test_an_agent_sees_the_cards_too_and_a_shop_without_the_module_sees_none(client):
    mk(client, name="Shawarma", name_ar="شاورما")
    sign_in(client, AGENT_EMAIL)
    assert client.get("/api/agent").json()["catalog"]["title"] == "Catalog"
    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'catalog'",
              DEMO_TENANT_ID)
    assert client.get("/api/agent").json()["catalog"] is None
    keys = [c["key"] for c in client.get("/api/workspace/home").json()["cards"]]
    assert "sold_out" not in keys and "low_stock" not in keys
