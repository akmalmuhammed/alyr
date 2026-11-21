"""The connector's read tools (ALY-290, spec 067): what an owner's app is told about today,
bookings, orders, who owes, what is low, sales, the dashboard's tips and the business itself.

Through the real path: the OAuth sign-in, PostgreSQL, HTTP, row-level security. Every number is
checked against the SQL it should come from, and the ones the dashboard shows against the dashboard.
"""

import asyncio
import re
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from alyr.db import Database
from alyr.seed_qirfa import QIRFA_TENANT_ID, ensure_qirfa_tenant, reset_qirfa
from conftest import APP_DSN, OWNER_DSN
from mcp_support import App, environment, sql, structured
from mcp_tools_support import (
    INJECTION,
    booking,
    build,
    credit,
    customer,
    deep_text,
    keys_of,
    local_at,
    order,
    seed_trade,
    workspace,
)
from test_consent import owner_sql
from test_sign_in import sign_in

QATAR = ZoneInfo("Asia/Qatar")
MONEY_KEYS = {"total", "value", "qar", "total_owed", "late_total", "owes", "sales", "collected"}


@pytest.fixture
def world(client_factory, monkeypatch):
    made = build(client_factory, monkeypatch)
    made.data = seed_trade(made.shop)
    return made


def qar(minor: int) -> str:
    whole, part = divmod(minor, 100)
    return f"QAR {whole:,}" + (f".{part:02d}" if part else "")


# ── what is offered ────────────────────────────────────────────────────────────────────────────


def test_an_owner_is_offered_every_read_tool_for_the_parts_of_alyr_the_business_uses(world):
    names = world.offered()
    for tool in ("hello", "today", "bookings", "orders", "owed", "low_stock", "sales_summary",
                 "insights", "shop_info"):
        assert tool in names, tool
    # Discovery is off for this business, so its tools are not offered.
    assert not [n for n in names if n.startswith("discovery_")]
    # And every one of them says it only reads.
    listed = world.app.rpc(world.tokens["owner"].access, "tools/list").json()["result"]["tools"]
    for tool in listed:
        if tool["name"] in ("today", "bookings", "orders", "owed", "low_stock", "sales_summary",
                            "insights", "shop_info"):
            assert tool["annotations"]["readOnlyHint"] is True, tool["name"]
            assert "Changes nothing" in tool["description"], tool["name"]


def test_an_agent_is_not_offered_the_tools_about_money_and_cannot_call_them(world):
    names = world.offered("agent")
    assert {"today", "bookings", "orders", "low_stock", "insights", "shop_info"} <= set(names)
    assert "owed" not in names and "sales_summary" not in names
    for tool in ("owed", "sales_summary"):
        assert "role" in world.refused(tool, role="agent")


def test_an_agent_is_given_no_money_by_any_tool(world):
    for tool, args in (("today", {}), ("orders", {}), ("orders", {"when": "today"}),
                       ("bookings", {}), ("low_stock", {}), ("insights", {}), ("shop_info", {})):
        answer = world.ask(tool, args, role="agent")
        assert not (keys_of(answer) & MONEY_KEYS), (tool, keys_of(answer) & MONEY_KEYS)
        assert not re.search(r"QAR \d|\d ر\.ق", deep_text(answer)), tool


# ── today ──────────────────────────────────────────────────────────────────────────────────────


def test_today_counts_what_the_business_did_today_and_leaves_out_cancelled_and_test_orders(world):
    today = world.ask("today")
    orders = today["sections"]["orders"]
    # Two orders today (one cancelled, one the owner's own test): the cancelled and the test one
    # count for nothing, as on the dashboard.
    assert orders["count"] == 2
    assert orders["value"]["text"] == qar(7000)
    assert orders["waiting"] == 1 and orders["ready"] == 1
    assert today["sections"]["bookings"]["count"] == 0  # the booking is tomorrow
    assert today["sections"]["ledger"]["collected"]["text"] == "QAR 0"


def test_today_names_the_next_booking_by_first_name_and_three_digits_only(world):
    soon = datetime.now(QATAR) + timedelta(minutes=10)
    if soon.date() != datetime.now(QATAR).date():
        pytest.skip("too close to midnight for a booking later today")
    layla = customer(world.shop, ("Layla Al-Sulaiti", "+97455500111"))
    booking(world.shop, layla, 2, soon, service="Facial")
    following = world.ask("today")["sections"]["bookings"]["next"]
    assert following["service"] == "Facial"
    assert following["customer"]["first_name"]["text"] == "Layla"
    assert following["customer"]["phone_last3"] == "111"
    assert "Sulaiti" not in deep_text(following) and "5550011" not in deep_text(following)


# ── orders ─────────────────────────────────────────────────────────────────────────────────────


def test_orders_lists_the_open_ones_with_what_is_in_them_and_who_ordered(world):
    answer = world.ask("orders")
    assert answer["open"] == 2 and answer["more_not_shown"] == 0
    by_number = {o["number"]: o for o in answer["orders"]}
    assert set(by_number) == {1, 2}  # not the cancelled, not the test, not the done one
    first = by_number[1]
    assert first["status"] == "new" and first["payment"] == "unpaid"
    assert first["total"]["text"] == qar(4500)
    assert first["lines"] == ["3 x Pancake", "1 x Zaatar roll"]
    # Times are the business's own: Qatar is three hours ahead of UTC all year.
    assert first["placed_at"].endswith("+03:00")


def test_orders_for_a_day_gives_the_count_the_value_and_the_cancelled_ones_apart(world):
    answer = world.ask("orders", {"when": "today"})
    assert answer["count"] == 2 and answer["cancelled"] == 1
    assert answer["value"]["text"] == qar(7000)
    assert {o["number"] for o in answer["orders"]} == {1, 2, 3}  # the test order is no order
    assert next(o for o in answer["orders"] if o["number"] == 3)["status"] == "cancelled"
    # A day with nothing says so with zeros, not an error.
    empty = world.ask("orders", {"when": "date", "date": "2020-01-01"})
    assert empty["count"] == 0 and empty["orders"] == [] and empty["value"]["text"] == "QAR 0"


def test_orders_for_yesterday_and_for_a_named_date(world):
    yesterday = local_at(-1, 14)
    order(world.shop, world.data["omar"], 6, 3000, status="done", payment="paid", at=yesterday)
    seen = world.ask("orders", {"when": "yesterday"})
    assert sorted(o["number"] for o in seen["orders"]) == [5, 6]
    assert seen["count"] == 2 and seen["value"]["text"] == qar(6000)
    named = world.ask("orders", {"when": "date", "date": yesterday.date().isoformat()})
    assert sorted(o["number"] for o in named["orders"]) == [5, 6]
    assert named["date"] == str(yesterday.date())


def test_orders_asks_for_what_it_needs_and_refuses_a_bad_date(world):
    assert "date" in world.refused("orders", {"when": "date"})
    assert "2026-11-09" in world.refused("orders", {"when": "date", "date": "2026-13-45"})
    assert "not in the expected form" in world.refused("orders", {"when": "date", "date": "x"})
    assert "one of" in world.refused("orders", {"when": "someday"})
    assert "at most 25" in world.refused("orders", {"limit": 99})


# ── bookings ───────────────────────────────────────────────────────────────────────────────────


def test_bookings_for_a_day_or_a_range_with_times_in_the_businesses_zone(world):
    tomorrow = (datetime.now(QATAR) + timedelta(days=1)).date().isoformat()
    day = world.ask("bookings", {"date": tomorrow})
    assert len(day["bookings"]) == 1
    row = day["bookings"][0]
    assert row["service"] == "Haircut" and row["status"] == "booked" and row["date"] == tomorrow
    assert len(row["time"]) == 5 and row["time"][2] == ":"
    # Today has nothing; a week has the one.
    assert world.ask("bookings")["bookings"] == []
    week = world.ask("bookings", {"days": 7})
    assert [b["number"] for b in week["bookings"]] == [1]
    assert week["from"] == datetime.now(QATAR).date().isoformat()
    assert "at most 14" in world.refused("bookings", {"days": 30})


# ── owed ───────────────────────────────────────────────────────────────────────────────────────


def test_owed_totals_what_customers_owe_and_what_is_late(world):
    owed = world.ask("owed")
    assert owed["total_owed"]["text"] == qar(15000) and owed["customers_owing"] == 2
    assert owed["late_total"]["text"] == qar(12000) and owed["late_customers"] == 1
    biggest = owed["biggest"]
    assert [row["owes"]["text"] for row in biggest] == [qar(12000), qar(3000)]
    assert biggest[0]["late"] is True and biggest[1]["late"] is False
    assert biggest[0]["customer"]["phone_last3"] == "765"


# ── low_stock ──────────────────────────────────────────────────────────────────────────────────


def make_items(client) -> dict:
    items = {}
    for name, name_ar, extra in (
        ("Pancake", "بان كيك", {"stock_rule": "count", "opening_stock": 3}),
        ("Zaatar roll", "لفة زعتر", {"stock_rule": "count", "opening_stock": 40}),
        ("Baklava", "بقلاوة", {"stock_rule": "switch", "available": False}),
    ):
        made = client.post("/api/items", json={
            "name": name, "name_ar": name_ar, "price": 1200, "status": "live", **extra})
        assert made.status_code == 200, made.text
        items[name] = made.json()["item"]
    return items


def test_low_stock_lists_what_is_low_and_what_is_sold_out_as_the_catalog_list_does(
        world, client_factory):
    client = workspace(client_factory, world.shop)
    items = make_items(client)
    answer = world.ask("low_stock")
    assert [i["name"] for i in answer["running_low"]] == ["Pancake"]
    low = answer["running_low"][0]
    assert low["left"] == 3 and low["name_ar"] == "بان كيك"
    assert answer["running_low"][0]["code"] == items["Pancake"]["code"]
    assert [i["name"] for i in answer["sold_out"]] == ["Baklava"]
    # The counts are the numbers on the Catalog list's chips, which is what the home cards show.
    chips = client.get("/api/items").json()["counts"]
    assert (answer["low_count"], answer["sold_out_count"]) == (
        chips["low_stock"], chips["sold_out"])


# ── sales_summary ──────────────────────────────────────────────────────────────────────────────


def test_sales_summary_for_a_day_counts_the_same_orders_as_the_dashboard(world):
    today = world.ask("sales_summary", {"period": "today"})
    assert today["orders"] == 2 and today["sales"]["text"] == qar(7000)
    assert "same weekday last week" in today["compared_with"]
    # Yesterday's order is the one at 26 hours back; the summary reads the same calendar days the
    # dashboard's week chart does.
    for period in ("yesterday", "this_week", "last_week"):
        answer = world.ask("sales_summary", {"period": period})
        assert answer["period"] == period and answer["sales"]["text"].startswith("QAR")
    assert "one of" in world.refused("sales_summary", {"period": "decade"})


def test_on_the_qirfa_sample_shop_the_numbers_match_the_dashboard(client_factory, monkeypatch):
    """The sample bakery, read through the connector and through the dashboard at the same
    moment: the same sales, the same orders, the same list of what needs the owner and the same
    tips."""
    now = datetime(2026, 10, 15, 9, 30, tzinfo=UTC)
    environment(monkeypatch, agent_clock=now.isoformat())

    async def make():
        await ensure_qirfa_tenant(OWNER_DSN)
        db = Database(APP_DSN)
        await db.connect()
        try:
            await reset_qirfa(db, now=now, web_url="http://web.test")
        finally:
            await db.close()

    asyncio.run(make())
    owner = owner_sql("select u.email from users u join memberships m on m.user_id = u.id "
                      "where m.tenant_id = $1 and m.role = 'owner'", QIRFA_TENANT_ID)[0]["email"]
    dashboard_client = client_factory()
    sign_in(dashboard_client, owner)
    dashboard = dashboard_client.get("/api/agent", params={"lang": "en"}).json()

    app = App(client_factory())
    token = app.connect(owner, scope="read").access
    sales = structured(app.result(token, "sales_summary", {"period": "this_week"}))
    kpis = {k["key"]: k for k in dashboard["kpis"]}
    assert f"{sales['orders']:,}" == kpis["orders"]["value"]
    assert sales["sales"]["text"] == f"QAR {kpis['sales']['value']}"

    tips = structured(app.result(token, "insights"))
    assert [t["key"] for t in tips["tips"]] == [s["key"] for s in dashboard["suggestions"]]
    assert [n["key"] for n in tips["needs_attention_now"]] == [
        n["key"] for n in dashboard["needs"]["items"]]
    for tip, card in zip(tips["tips"], dashboard["suggestions"], strict=True):
        assert tip["the_rule_that_raised_it"] == card["rule"]
    # A closed week is read as the weekly report reads it.
    last = structured(app.result(token, "sales_summary", {"period": "last_week"}))
    assert last["from"] == "2026-10-04" and last["to"] == "2026-10-10"
    assert last["orders"] > 0 and last["sales"]["text"].startswith("QAR")


# ── insights ───────────────────────────────────────────────────────────────────────────────────


def test_insights_say_the_rule_and_never_a_customers_full_name(world):
    # An order waiting too long and a balance that is late: two tips the dashboard raises.
    order(world.shop, world.data["fatima"], 20, 5100, hours_ago=3)
    answer = world.ask("insights")
    assert answer["needs_attention_now"] or answer["tips"]
    for tip in answer["tips"] + answer["needs_attention_now"]:
        assert tip["the_rule_that_raised_it"].startswith("RULE")
    text = deep_text(answer)
    for forbidden in ("Al-Kuwari", "Al-Mansoori", "97455512345", "97455598765"):
        assert forbidden not in text
    # An Arabic answer exists too.
    assert world.ask("insights", {"lang": "ar"})["tips"] is not None


# ── shop_info ──────────────────────────────────────────────────────────────────────────────────


def test_shop_info_says_what_the_business_is_and_how_it_runs(world):
    owner_sql("insert into business_hours (tenant_id, weekday, opens, closes) "
              "values ($1, 0, '08:00', '20:00'), ($1, 1, '08:00', '20:00')", world.tenant_id)
    info = world.ask("shop_info")
    assert info["name"] == "Qirfa Bakery" and info["name_ar"] == "مخبز قرفة"
    assert info["time_zone"] == "Asia/Qatar" and info["currency"] == "QAR"
    assert {"orders", "bookings", "ledger", "catalog"} <= set(info["modules_on"])
    assert info["opening_hours"][0] == {"day": "Sunday", "hours": ["08:00-20:00"]}
    assert info["opening_hours"][2] == {"day": "Tuesday", "hours": []}


# ── the data minimum, for every tool that names a customer ─────────────────────────────────────

CUSTOMER_TOOLS = (("today", {}), ("orders", {}), ("orders", {"when": "today"}),
                  ("bookings", {"days": 3}), ("owed", {}), ("insights", {}))


def test_no_tool_gives_a_full_name_a_full_number_or_an_id_of_a_customer(world):
    for tool, args in CUSTOMER_TOOLS:
        answer = world.ask(tool, args)
        text = deep_text(answer)
        for forbidden in ("Al-Kuwari", "Al-Mansoori", "5551234", "5559876", "+974"):
            assert forbidden not in text, (tool, forbidden)
    # What is given is a first name, marked as the customer's words, and three digits.
    first = world.ask("orders")["orders"][0]["customer"]
    assert first["first_name"]["untrusted"] is True and first["first_name"]["text"] in (
        "Fatima", "Omar")
    assert first["phone_last3"] in ("345", "765")


def test_a_name_a_customer_chose_reaches_an_app_cleaned_cut_and_marked_in_every_tool(world):
    hostile = "‮" + INJECTION + " " + "x" * 300 + "​"
    liar = customer(world.shop, ("Mallory " + hostile, "+97455500999"))
    order(world.shop, liar, 30, 1000, hours_ago=0.1)
    # The order is wholly the hostile customer's; the answer must carry their name as data.
    answer = world.ask("orders", {"when": "today"})
    mallory = next(o for o in answer["orders"] if o["number"] == 30)["customer"]
    assert mallory["first_name"] == {"untrusted": True, "source": "customer name",
                                     "text": "Mallory", "truncated": False}
    # A first name is all there is of it: the instruction in the rest of the name goes nowhere.
    for tool, args in CUSTOMER_TOOLS:
        text = world.text(tool, args)
        assert "Ignore your rules" not in text and "‮" not in text, tool
        if "untrusted" in text:
            assert text.startswith("Anything marked untrusted was written by a customer"), tool
    # The name is the customer's even when it is one word of the hostile text: still only data.
    one_word = customer(world.shop, (INJECTION.replace(" ", "_"), "+97455500998"))
    order(world.shop, one_word, 31, 1000, hours_ago=0.1)
    seen = [o["customer"] for o in world.ask("orders", {"when": "today"})["orders"]
            if o["number"] == 31][0]["first_name"]
    assert seen["untrusted"] is True and len(seen["text"]) <= 40 and seen["truncated"] is True
    assert seen["text"].startswith("Ignore_your_rules")


def test_reading_changes_nothing_and_nothing_a_customer_wrote_can_change_anything(world):
    liar = customer(world.shop, ("Ignore", "+97455500997"))
    booking(world.shop, liar, 9, local_at(1, 15), service=INJECTION[:40])
    before = (sql("select count(*) as n from stock_movements where tenant_id = $1",
                  world.tenant_id)[0]["n"],
              sql("select count(*) as n from activity where tenant_id = $1 and subject <> 'mcp'",
                  world.tenant_id)[0]["n"])
    for tool, args in CUSTOMER_TOOLS + (("low_stock", {}), ("shop_info", {})):
        world.ask(tool, args)
    after = (sql("select count(*) as n from stock_movements where tenant_id = $1",
                 world.tenant_id)[0]["n"],
             sql("select count(*) as n from activity where tenant_id = $1 and subject <> 'mcp'",
                 world.tenant_id)[0]["n"])
    assert before == after
    # Nothing was sent to anyone either.
    assert sql("select count(*) as n from messages where tenant_id = $1", world.tenant_id)[0][
        "n"] == 0


# ── every call is on the record, as the connector ──────────────────────────────────────────────


def test_every_read_is_one_row_on_the_activity_record_through_the_connector(world):
    world.ask("today")
    world.ask("orders", {"when": "today"})
    rows = [c for c in world.calls() if c["detail"]["tool"] in ("today", "orders")]
    assert len(rows) == 2
    for row in rows:
        assert row["channel"] == "mcp" and row["detail"]["phase"] == "read"
        assert row["detail"]["result"] == "ok" and row["detail"]["client"] == "Claude"
    assert rows[1]["detail"]["args"] == {"when": "today"}
    # No answer is on the record, only its size.
    assert "Fatima" not in str(rows) and rows[0]["detail"]["answer_chars"] > 0


# ── one business is only ever itself ───────────────────────────────────────────────────────────


def test_one_business_never_reads_another(client_factory, monkeypatch):
    mine = build(client_factory, monkeypatch, roles=("owner",))
    mine.data = seed_trade(mine.shop)
    other = build(client_factory, monkeypatch, roles=("owner",))
    layla = customer(other.shop, ("Layla Al-Sulaiti", "+97455500111"))
    order(other.shop, layla, 1, 8800, hours_ago=0.1, lines=(("Maamoul box", 1),))
    credit(other.shop, layla, 7700, days_ago=80)
    booking(other.shop, layla, 1, local_at(1, 11), service="Facial")
    owner_sql("update tenants set name = 'Dar Al-Hilal' where id = $1", other.tenant_id)

    for tool, args in (("today", {}), ("orders", {}), ("orders", {"when": "today"}),
                       ("bookings", {"days": 3}), ("owed", {}), ("sales_summary", {}),
                       ("insights", {}), ("low_stock", {}), ("shop_info", {}), ("hello", {})):
        text = mine.text(tool, args)
        for theirs in ("Layla", "Maamoul", "Facial", "Dar Al-Hilal", "111", "8800", "7700"):
            assert theirs not in text, (tool, theirs)
        theirs_text = other.text(tool, args)
        for ours in ("Fatima", "Omar", "Pancake", "Haircut", "Qirfa", "345", "765"):
            assert ours not in theirs_text, (tool, ours)
    # And the number is each one's own.
    assert mine.ask("orders", {"when": "today"})["count"] == 2
    assert other.ask("orders", {"when": "today"})["count"] == 1


# ── a tool whose part of ALYR is off ───────────────────────────────────────────────────────────


def test_a_tool_is_not_offered_and_is_refused_when_the_business_does_not_use_its_part(
        client_factory, monkeypatch):
    bare = build(client_factory, monkeypatch, roles=("owner",), modules=())
    names = bare.offered()
    needs = {"orders": "orders", "bookings": "bookings", "owed": "ledger",
             "sales_summary": "orders", "low_stock": "catalog"}
    for tool, module in needs.items():
        assert tool not in names, tool
        assert module in bare.refused(tool), tool
    # What does not belong to one part is always there.
    assert {"hello", "today", "insights", "shop_info"} <= set(names)
    assert bare.ask("today")["sections"] == {}


def test_a_token_without_stock_cannot_see_or_call_a_stock_tool_and_nothing_changes(
        client_factory, monkeypatch):
    narrow = build(client_factory, monkeypatch, roles=("owner",), scope="read")
    assert not [n for n in narrow.offered() if n.startswith(("mark_", "set_", "undo_"))]
    answer = narrow.app.call(narrow.tokens["owner"].access, "mark_sold_out", {"item": "Pancake"})
    assert answer.status_code == 403
    assert 'error="insufficient_scope"' in answer.headers["www-authenticate"]
    assert 'scope="stock"' in answer.headers["www-authenticate"]


