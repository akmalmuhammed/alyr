"""An agent is never SENT shop-wide money, even where a screen would not draw it (D-035, ui-rules
section 16, the redesign review of 21 Nov): the team's performance carries no sales for an agent,
and the credit accounts (balances and entries) are for owners and admins only.

"Manager" in this codebase is an owner or an admin (`catalog.MANAGERS`); there is no third role.
"""

from alyr.seed import AGENT_EMAIL, OWNER_EMAIL
from test_consent import ahmed
from test_orders import place, product
from test_sign_in import other_shop_with_owner, sign_in

ADMIN_EMAIL = "admin@alnoor.example"
MONEY_KEYS = {"sales", "sales_text", "settled"}


def a_shop_with_an_order_on_account(client_factory, monkeypatch):
    """The demo shop with one order on account (so there is a balance, an entry and a sale), an
    admin, and nobody signed in. Returns the client, Ahmed's id and the order."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    sign_in(client, OWNER_EMAIL)
    who = ahmed(client)
    order = place(client, who["id"], [(product(client, "LED panel"), 4)], "account")
    assert order.status_code == 200
    made = client.post(
        "/api/team", json={"email": ADMIN_EMAIL, "name": "Adel", "role": "admin"}
    )
    assert made.status_code == 200
    return client, who["id"]


def as_(client, email):
    client.cookies.clear()
    return sign_in(client, email)


def keys_of(value):
    """Every key anywhere in a JSON answer."""
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in keys_of(v)}
    if isinstance(value, list):
        return {k for v in value for k in keys_of(v)}
    return set()


def strings_of(value):
    if isinstance(value, dict):
        return [s for v in value.values() for s in strings_of(v)]
    if isinstance(value, list):
        return [s for v in value for s in strings_of(v)]
    return [value] if isinstance(value, str) else []


# ── the team's performance ────────────────────────────────────────────────────────────────


def test_owner_and_admin_still_see_the_shops_sales_in_the_team_report(
    client_factory, monkeypatch
):
    client, _ = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    for email in (OWNER_EMAIL, ADMIN_EMAIL):
        as_(client, email)
        response = client.get("/api/team/performance", params={"days": 7})
        assert response.status_code == 200, email
        report = response.json()
        assert report["can_see_everyone"] is True
        assert report["totals"]["sales"] > 0 and report["totals"]["sales_text"].startswith("QAR")
        assert MONEY_KEYS <= set(report["unassigned"]) | set(report["people"][0])


def test_an_agent_is_sent_their_own_counts_and_no_money(client_factory, monkeypatch):
    client, _ = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    me = as_(client, AGENT_EMAIL)
    for days in (1, 7, 30):
        response = client.get("/api/team/performance", params={"days": days})
        assert response.status_code == 200
        report = response.json()
        assert report["can_see_everyone"] is False
        assert [p["id"] for p in report["people"]] == [me["id"]]
        # No money key anywhere, and no figure in riyals written as text.
        assert keys_of(report) & MONEY_KEYS == set(), report
        assert not [s for s in strings_of(report) if "QAR" in s]
        # What an agent is sent is counts.
        mine = report["people"][0]
        assert {"open", "waiting", "replies", "orders", "closed_total"} <= set(mine)
        assert {"waiting", "open", "closed", "sold"} <= set(report["totals"])


def test_the_totals_an_agent_is_sent_are_worked_out_from_their_own_row(
    client_factory, monkeypatch
):
    """An order nobody follows up is in the shop's numbers (an owner's totals count it) and in
    none of an agent's: their totals are their own row, not the shop's."""
    client, _ = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    as_(client, OWNER_EMAIL)
    shop = client.get("/api/team/performance", params={"days": 7}).json()
    assert shop["unassigned"]["orders"] >= 1 and shop["totals"]["sales"] > 0
    as_(client, AGENT_EMAIL)
    report = client.get("/api/team/performance", params={"days": 7}).json()
    mine = report["people"][0]
    assert report["totals"]["open"] == mine["open"]
    assert report["totals"]["waiting"] == mine["waiting"]
    assert report["totals"]["closed"] == mine["closed_total"]
    assert report["totals"]["sold"] == mine["closed"].get("sold", 0)


def test_one_shop_does_not_see_anothers_team_report(client_factory, monkeypatch):
    client, _ = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    other_shop_with_owner("layla@other.example")
    as_(client, "layla@other.example")
    report = client.get("/api/team/performance", params={"days": 7}).json()
    assert [p["name"] for p in report["people"]] == ["Omar"]
    assert report["totals"]["sales"] == 0 and report["unassigned"]["orders"] == 0


# ── the credit accounts ───────────────────────────────────────────────────────────────────


def test_owner_and_admin_read_the_credit_accounts(client_factory, monkeypatch):
    client, who = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    for email in (OWNER_EMAIL, ADMIN_EMAIL):
        as_(client, email)
        summary = client.get("/api/ledger/summary")
        assert summary.status_code == 200, email
        assert summary.json()["outstanding"] > 0
        entries = client.get(f"/api/ledger/customers/{who}/entries")
        assert entries.status_code == 200, email
        assert [e["kind"] for e in entries.json()["entries"]].count("sale") >= 1


def test_an_agent_is_refused_the_credit_accounts(client_factory, monkeypatch):
    client, who = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    as_(client, AGENT_EMAIL)
    for path in ("/api/ledger/summary", f"/api/ledger/customers/{who}/entries"):
        refused = client.get(path)
        assert refused.status_code == 403, path
        # Refused outright: nothing of the balance or the entries is in the body.
        assert not keys_of(refused.json()) - {"detail"}
        assert not [s for s in strings_of(refused.json()) if "QAR" in s]


def test_without_signing_in_the_credit_accounts_are_refused(client_factory, monkeypatch):
    client, who = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    client.cookies.clear()
    assert client.get("/api/ledger/summary").status_code == 401
    assert client.get(f"/api/ledger/customers/{who}/entries").status_code == 401


def test_one_shops_owner_cannot_read_anothers_credit_accounts(client_factory, monkeypatch):
    client, who = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    other_shop_with_owner("layla@other.example")
    as_(client, "layla@other.example")
    summary = client.get("/api/ledger/summary").json()
    assert summary["customers"] == [] and summary["outstanding"] == 0
    # The customer is another shop's: from here there is no such customer.
    assert client.get(f"/api/ledger/customers/{who}/entries").status_code == 404


# ── the navigation and the home cards ─────────────────────────────────────────────────────


def nav_keys(client):
    nav = client.get("/api/workspace").json()["nav"]
    return {s["key"] for part in nav.values() for s in part}


def test_the_credit_screen_is_listed_for_owners_and_admins_only(client_factory, monkeypatch):
    client, _ = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    for email in (OWNER_EMAIL, ADMIN_EMAIL):
        as_(client, email)
        assert "ledger" in nav_keys(client), email
    as_(client, AGENT_EMAIL)
    assert "ledger" not in nav_keys(client)


def test_an_agent_is_sent_no_card_in_riyals_on_the_home(client_factory, monkeypatch):
    client, _ = a_shop_with_an_order_on_account(client_factory, monkeypatch)
    as_(client, OWNER_EMAIL)
    owner_cards = {c["key"] for c in client.get("/api/workspace/home").json()["cards"]}
    assert "outstanding" in owner_cards
    as_(client, AGENT_EMAIL)
    cards = client.get("/api/workspace/home").json()["cards"]
    assert not {"outstanding", "paid_today"} & {c["key"] for c in cards}
    assert not [s for s in strings_of(cards) if "QAR" in s]

