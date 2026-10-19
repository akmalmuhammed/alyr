"""Delivery and pickup (ALY-150 part 2, `specs/014-pricing-pack/spec.md`): the feature off and on,
zones and the flat fee, the fee rules (free over, minimum, the cut-off and the days), the fee as
its own line kept on the order with the zone's name, staff seeing it, discounts and delivery
together, the chat's "Pickup or delivery?" in English and Arabic, and the weekly report.

No maps and no driver dispatch: a zone is chosen from a list and the address is words.
"""

from datetime import UTC, datetime, time
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest

from alyr.modules.items import delivery
from alyr.modules.items.clock import ShopClock
from alyr.seed import AGENT_EMAIL, DEMO_SLUG
from catalog_wa import (  # noqa: F401  (the autouse fixture is used by name)
    STRANGER,
    catalog_module_on,
    talk,
)
from test_consent import owner_sql
from test_discounts import cake, check, rule, switch
from test_items import detail, line, order, people
from test_order_by_code import ids, orders_of, tap
from test_sign_in import sign_in
from test_templates import no_templates_left_over, office, owner  # noqa: F401

STORE = f"/api/store/{DEMO_SLUG}"
QATAR = ZoneInfo("Asia/Qatar")


def deliver_on(client, on=True):
    response = client.put("/api/features/delivery_fees", json={"enabled": on})
    assert response.status_code == 200, response.text


@pytest.fixture
def shop(client):
    deliver_on(client)
    return client


def settings(client, **more):
    response = client.put("/api/delivery", json=more)
    assert response.status_code == 200, response.text
    return response.json()


def zone(client, **more) -> dict:
    body = {"name": "Al Wakra", "name_ar": "الوكرة", "fee": 1_500, **more}
    response = client.post("/api/delivery/zones", json=body)
    assert response.status_code == 200, response.text
    return response.json()["zone"]


def go(delivery_mode="delivery", zone_id=None, address="Villa 12, Street 4", note=""):
    return {"mode": delivery_mode, "zone_id": zone_id, "address": address, "note": note}


def place(client, who, lines, fulfilment=None, **more):
    body = {"fulfilment": fulfilment} if fulfilment is not None else {}
    return order(client, who, lines, **body, **more)


def clock_at(day: str, hour: int, minute: int = 0) -> ShopClock:
    return ShopClock(datetime.fromisoformat(f"{day}T{hour:02d}:{minute:02d}:00+03:00"), QATAR)


# ── the feature off: invisible and inert ────────────────────────────────────────────────


def test_it_is_off_by_default_and_every_route_says_so(client):
    for call in (
        lambda: client.get("/api/delivery"),
        lambda: client.put("/api/delivery", json={"pickup": True}),
        lambda: client.post("/api/delivery/zones", json={"name": "X", "fee": 100}),
    ):
        response = call()
        assert response.status_code == 422 and response.json()["detail"]["code"] == "feature_off"
        assert response.json()["detail"]["message_ar"]
    [who] = people(client, 1)
    item = cake(client)
    refused = place(client, who, [line(item)], go())
    assert refused.status_code == 422 and detail(refused)["code"] == "feature_off"
    plain = check(client, who, [line(item)]).json()
    assert set(plain) == {"ok", "lines", "total", "total_text", "group"}
    assert "pricing" not in client.get(STORE).json()
    placed = order(client, who, [line(item)]).json()
    assert placed["total"] == 10_000 and "pricing" not in placed
    row = owner_sql("select fulfilment, delivery_fee from orders where id = $1",
                    UUID(placed["order_id"]))[0]
    assert (row["fulfilment"], row["delivery_fee"]) == (None, 0)
    listed = next(o for o in client.get("/api/orders").json()["orders"]
                  if o["id"] == placed["order_id"])
    assert "fulfilment" not in listed


def test_the_features_screen_names_it_in_plain_words(client):
    groups = client.get("/api/features").json()["groups"]
    feature = next(f for g in groups for f in g["features"] if f["key"] == "delivery_fees")
    assert feature["name"] == "Delivery and pickup" and feature["enabled"] is False
    assert feature["name_ar"] and feature["hint_ar"] and "capabilit" not in str(feature).lower()


def test_switching_it_off_stops_charging_a_fee(shop):
    client = shop
    settings(client, delivery=True, flat_fee=2_000)
    [who] = people(client, 1)
    item = cake(client)
    assert check(client, who, [line(item)], fulfilment=go()).json()["total"] == 12_000
    deliver_on(client, False)
    assert check(client, who, [line(item)]).json()["total"] == 10_000


# ── settings and zones ───────────────────────────────────────────────────────────────────


def test_settings_start_with_pickup_on_and_delivery_off(shop):
    answer = shop.get("/api/delivery").json()
    assert (answer["pickup"], answer["delivery"], answer["zones"]) == (True, False, [])
    assert answer["flat_fee"] is None and answer["can_manage"] is True


def test_delivery_needs_a_zone_or_a_flat_fee_and_one_way_to_receive_stays_on(shop):
    client = shop
    refused = client.put("/api/delivery", json={"delivery": True})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "need_fee"
    assert refused.json()["detail"]["message_ar"]
    both_off = client.put("/api/delivery", json={"pickup": False})
    assert both_off.status_code == 422 and both_off.json()["detail"]["code"] == "need_one"
    zone(client)
    assert settings(client, delivery=True)["delivery"] is True
    assert settings(client, pickup=False, delivery=True)["pickup"] is False


def test_a_zone_is_checked_in_both_languages_and_kept_when_archived(shop):
    client = shop
    for bad, code in (
        ({"name": "", "name_ar": ""}, "name_needed"),
        ({"cutoff": "25:00"}, None),
        ({"days": [9]}, "bad_days"),
        ({"free_over": 0}, None),
    ):
        response = client.post("/api/delivery/zones", json={"name": "Z", "fee": 100, **bad})
        assert response.status_code == 422, bad
        if code:
            assert response.json()["detail"]["code"] == code
            assert response.json()["detail"]["message_ar"]
    made = zone(client, name="Doha", name_ar="الدوحة", cutoff="14:00", days=[0, 3],
                free_over=20_000, min_order=5_000)
    assert made["cutoff"] == "14:00" and made["days"] == [0, 3]
    assert made["days_text"] == "Sun, Wed" and made["days_text_ar"] == "الأحد، الأربعاء"
    changed = client.put(f"/api/delivery/zones/{made['id']}", json={
        "name": "Doha", "name_ar": "الدوحة", "fee": 1_000})
    assert changed.status_code == 200 and changed.json()["zone"]["fee"] == 1_000
    assert changed.json()["zone"]["cutoff"] is None and changed.json()["zone"]["days"] == []
    zone(client, name="Lusail", name_ar="لوسيل", fee=2_000)
    settings(client, delivery=True)
    archived = client.post(f"/api/delivery/zones/{made['id']}/archive")
    assert archived.status_code == 200 and archived.json()["zone"]["active"] is False
    view = client.get("/api/delivery").json()
    assert [z["name"] for z in view["zones"]] == ["Lusail"]
    assert [z["name"] for z in view["archived"]] == ["Doha"]
    assert client.post(f"/api/delivery/zones/{made['id']}/restore").json()["zone"]["active"]
    assert client.post(f"/api/delivery/zones/{made['id']}/dance").status_code == 422
    assert client.post(
        "/api/delivery/zones/00000000-0000-0000-0000-000000000009/archive").status_code == 404


def test_the_last_place_you_deliver_to_cannot_be_taken_away_while_delivery_is_on(shop):
    client = shop
    only = zone(client)
    settings(client, delivery=True)
    refused = client.post(f"/api/delivery/zones/{only['id']}/archive")
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "last_zone"
    settings(client, flat_fee=1_000)
    assert client.post(f"/api/delivery/zones/{only['id']}/archive").status_code == 200


def test_only_owners_and_admins_change_it_but_the_whole_team_can_read_it(shop):
    client = shop
    made = zone(client)
    sign_in(client, AGENT_EMAIL)
    assert client.get("/api/delivery").status_code == 200
    assert client.get("/api/delivery").json()["can_manage"] is False
    assert client.put("/api/delivery", json={"pickup": True}).status_code == 403
    assert client.post("/api/delivery/zones", json={"name": "X", "fee": 1}).status_code == 403
    assert client.post(f"/api/delivery/zones/{made['id']}/archive").status_code == 403


def test_every_change_is_on_the_activity_record(shop):
    client = shop
    made = zone(client)
    client.put(f"/api/delivery/zones/{made['id']}", json={"name": "Wakra", "fee": 900})
    settings(client, delivery=True)
    actions = [r["action"] for r in client.get("/api/items/settings/activity").json()["activity"]]
    assert "delivery_zone_added" in actions and "delivery_zone_changed" in actions
    assert "delivery_settings" in actions


# ── what the customer is offered and what it costs ───────────────────────────────────────


def test_the_page_is_told_what_the_shop_offers(shop):
    client = shop
    zone(client, cutoff="14:00", days=[0, 2, 4], free_over=20_000, min_order=3_000)
    settings(client, delivery=True, flat_fee=2_500)
    offered = client.get(STORE).json()["pricing"]["delivery"]
    assert offered["pickup"] is True and offered["delivery"] is True
    [wakra, other] = offered["zones"]
    assert wakra["name"] == "Al Wakra" and wakra["fee"] == 1_500 and wakra["free_over"] == 20_000
    assert wakra["min_order"] == 3_000 and wakra["days"] == [0, 2, 4]
    assert wakra["cutoff_text"].startswith("Order before ")
    assert wakra["days_text"] == "Sun, Tue, Thu" and wakra["next_day"]
    assert other["id"] is None and other["name"] == "Other areas" and other["fee"] == 2_500
    assert other["name_ar"] == "مناطق أخرى"


def test_pickup_is_free_and_adds_no_line(shop):
    client = shop
    zone(client)
    settings(client, delivery=True)
    [who] = people(client, 1)
    item = cake(client)
    answer = check(client, who, [line(item)], fulfilment=go("pickup")).json()
    assert answer["total"] == 10_000 and answer["pricing"]["delivery"]["mode"] == "pickup"
    placed = place(client, who, [line(item)], go("pickup")).json()
    assert placed["total"] == 10_000
    row = owner_sql("select fulfilment, delivery_fee, delivery_address from orders "
                    "where id = $1", UUID(placed["order_id"]))[0]
    assert (row["fulfilment"], row["delivery_fee"], row["delivery_address"]) == ("pickup", 0, "")


def test_a_delivery_is_its_own_line_kept_with_the_zones_name_and_the_address(shop):
    client = shop
    wakra = zone(client)
    settings(client, delivery=True)
    [who] = people(client, 1)
    item = cake(client)
    cart = [line(item, 2)]
    fulfilment = go(zone_id=wakra["id"], note="Call at the gate")
    answer = check(client, who, cart, fulfilment=fulfilment).json()
    shown = answer["pricing"]["delivery"]
    assert shown["fee"] == 1_500 and shown["zone"]["name"] == "Al Wakra" and shown["free"] is False
    assert answer["total"] == 21_500 and shown["deliver_on"]
    placed = place(client, who, cart, fulfilment, expected_total=21_500).json()
    assert placed["total"] == 21_500
    row = owner_sql("select * from orders where id = $1", UUID(placed["order_id"]))[0]
    assert (row["subtotal"], row["discount_total"], row["delivery_fee"], row["total"]) == (
        20_000, 0, 1_500, 21_500)
    assert (row["fulfilment"], row["delivery_zone_name"], row["delivery_zone_name_ar"]) == (
        "delivery", "Al Wakra", "الوكرة")
    assert (row["delivery_address"], row["delivery_note"]) == (
        "Villa 12, Street 4", "Call at the gate")
    assert row["delivery_on"] is not None
    [request] = owner_sql("select amount from payment_requests where order_id = $1",
                          UUID(placed["order_id"]))
    assert request["amount"] == 21_500
    # (the customer has not written, so the approved template goes: it carries the total)
    sent = client.get(f"/sim/conversations/{who['phone']}").json()["messages"][-1]["body"]
    assert "QAR 215" in sent
    # staff see it on the order
    listed = next(o for o in client.get("/api/orders").json()["orders"]
                  if o["id"] == placed["order_id"])
    f = listed["fulfilment"]
    assert (f["mode"], f["zone"], f["address"], f["fee"]) == (
        "delivery", "Al Wakra", "Villa 12, Street 4", 1_500)
    tenant = owner_sql("select id from tenants where slug = $1", DEMO_SLUG)[0]["id"]
    tracked = client.get(f"/api/track/{tenant}/{placed['order_id']}").json()["order"]
    assert tracked["fulfilment"]["mode"] == "delivery" and tracked["fulfilment"]["fee"] == 1_500


def test_the_order_keeps_the_zone_as_it_was_when_the_zone_changes_later(shop):
    client = shop
    wakra = zone(client)
    zone(client, name="Lusail", name_ar="لوسيل")
    settings(client, delivery=True)
    [who] = people(client, 1)
    item = cake(client)
    placed = place(client, who, [line(item)], go(zone_id=wakra["id"])).json()
    client.put(f"/api/delivery/zones/{wakra['id']}", json={
        "name": "Renamed", "name_ar": "جديد", "fee": 9_900})
    client.post(f"/api/delivery/zones/{wakra['id']}/archive")
    row = owner_sql("select delivery_zone_name, delivery_fee, total from orders where id = $1",
                    UUID(placed["order_id"]))[0]
    assert (row["delivery_zone_name"], row["delivery_fee"], row["total"]) == (
        "Al Wakra", 1_500, 11_500)


def test_free_over_is_judged_on_the_goods_after_discount(shop):
    client = shop
    switch(client)
    wakra = zone(client, free_over=20_000)
    settings(client, delivery=True)
    rule(client, code="TEN10")
    [who] = people(client, 1)
    item = cake(client)
    fulfilment = go(zone_id=wakra["id"])
    two = check(client, who, [line(item, 2)], fulfilment=fulfilment).json()
    assert two["pricing"]["delivery"]["fee"] == 0 and two["pricing"]["delivery"]["free"] is True
    assert two["total"] == 20_000
    # with the code the goods come to 18,000: below the free-over amount, so the fee is charged
    coded = check(client, who, [line(item, 2)], ["TEN10"], fulfilment=fulfilment).json()
    assert coded["pricing"]["delivery"]["fee"] == 1_500 and coded["total"] == 18_000 + 1_500
    assert coded["pricing"]["discount_total"] == 2_000
    placed = place(client, who, [line(item, 2)], fulfilment, coupons=["TEN10"],
                   expected_total=19_500).json()
    row = owner_sql("select subtotal, discount_total, delivery_fee, total from orders "
                    "where id = $1", UUID(placed["order_id"]))[0]
    assert (row["subtotal"], row["discount_total"], row["delivery_fee"], row["total"]) == (
        20_000, 2_000, 1_500, 19_500)


def test_delivery_is_never_discounted_and_the_floor_is_on_the_goods(shop):
    client = shop
    switch(client)
    wakra = zone(client, fee=3_000)
    settings(client, delivery=True)
    rule(client, code="ALL100", percent=100)
    [who] = people(client, 1)
    item = cake(client, price=5_000)
    answer = check(client, who, [line(item)], ["ALL100"], fulfilment=go(zone_id=wakra["id"])).json()
    assert answer["total"] == 100 + 3_000  # the goods keep QAR 1; the fee is not touched


def test_a_zones_minimum_order_is_judged_after_discounts_and_refused_in_both_languages(shop):
    client = shop
    wakra = zone(client, min_order=15_000)
    settings(client, delivery=True)
    [who] = people(client, 1)
    item = cake(client)
    short = check(client, who, [line(item)], fulfilment=go(zone_id=wakra["id"])).json()
    assert short["ok"] is False
    problem = short["pricing"]["delivery"]["problem"]
    assert problem["code"] == "delivery_minimum"
    assert problem["message"] == "Delivery to Al Wakra needs an order of at least QAR 150."
    assert problem["message_ar"] == "التوصيل إلى الوكرة يتطلب طلباً لا يقل عن 150 ر.ق."
    refused = place(client, who, [line(item)], go(zone_id=wakra["id"]))
    assert refused.status_code == 422 and detail(refused)["code"] == "delivery_minimum"
    assert owner_sql("select count(*) as n from orders")[0]["n"] == 0
    assert place(client, who, [line(item, 2)], go(zone_id=wakra["id"])).status_code == 200


def test_the_choices_that_cannot_be_served_are_refused_with_plain_reasons(shop):
    client = shop
    wakra = zone(client)
    settings(client, delivery=True, pickup=True)
    [who] = people(client, 1)
    item = cake(client)
    cart = [line(item)]
    cases = [
        (None, "fulfilment_required"),
        (go(zone_id=None), "zone_required"),
        (go(zone_id="00000000-0000-0000-0000-000000000009"), "zone_unknown"),
        (go(zone_id=wakra["id"], address=""), "address_required"),
        (go(zone_id=wakra["id"], address="  x "), "address_required"),
    ]
    for fulfilment, code in cases:
        refused = place(client, who, cart, fulfilment)
        assert refused.status_code == 422, (fulfilment, refused.text)
        body = detail(refused)
        assert body["code"] == code and body["message"] and body["message_ar"], (fulfilment, body)
    assert place(client, who, cart, {"mode": "teleport"}).status_code == 422  # not a mode
    settings(client, pickup=False)
    assert detail(place(client, who, cart, go("pickup")))["code"] == "pickup_off"
    settings(client, pickup=True, delivery=False)
    assert detail(place(client, who, cart, go(zone_id=wakra["id"])))["code"] == "delivery_off"
    assert owner_sql("select count(*) as n from orders")[0]["n"] == 0


def test_when_there_is_only_one_way_nobody_is_asked(shop):
    client = shop
    wakra = zone(client)
    settings(client, delivery=True, pickup=False)
    [who] = people(client, 1)
    item = cake(client)
    placed = place(client, who, [line(item)], {"zone_id": wakra["id"], "address": "Villa 1"})
    assert placed.status_code == 200, placed.text
    assert owner_sql("select fulfilment from orders")[0]["fulfilment"] == "delivery"
    settings(client, delivery=False, pickup=True)
    again = place(client, who, [line(item)])
    assert again.status_code == 200
    assert owner_sql("select fulfilment from orders order by number desc limit 1"
                     )[0]["fulfilment"] == "pickup"


def test_with_no_zones_the_flat_fee_is_the_delivery_and_with_zones_it_is_other_areas(shop):
    client = shop
    settings(client, delivery=True, flat_fee=2_000, flat_free_over=30_000)
    [who] = people(client, 1)
    item = cake(client)
    flat = check(client, who, [line(item)], fulfilment=go()).json()
    assert flat["pricing"]["delivery"]["fee"] == 2_000
    assert flat["pricing"]["delivery"]["zone"]["name"] == "Delivery"
    free = check(client, who, [line(item, 3)], fulfilment=go()).json()
    assert free["pricing"]["delivery"]["fee"] == 0 and free["total"] == 30_000
    wakra = zone(client)
    other = check(client, who, [line(item)], fulfilment=go()).json()
    assert other["pricing"]["delivery"]["zone"]["name"] == "Other areas"
    named = check(client, who, [line(item)], fulfilment=go(zone_id=wakra["id"])).json()
    assert named["pricing"]["delivery"]["fee"] == 1_500


def test_the_fee_cannot_change_under_the_customer(shop):
    client = shop
    wakra = zone(client)
    settings(client, delivery=True)
    [who] = people(client, 1)
    item = cake(client)
    client.put(f"/api/delivery/zones/{wakra['id']}", json={"name": "Al Wakra", "fee": 2_500})
    stale = place(client, who, [line(item)], go(zone_id=wakra["id"]), expected_total=11_500)
    assert stale.status_code == 409
    body = detail(stale)
    assert body["code"] == "total_changed" and body["total"] == 12_500
    assert body["pricing"]["delivery"]["fee"] == 2_500


# ── the cut-off and the days ─────────────────────────────────────────────────────────────


def test_a_delivery_day_honours_the_days_the_zone_delivers_and_the_cut_off():
    # 2026-10-19 is a Monday; Sunday is 0 in a zone's days.
    sunday_wed = delivery.Zone(None, "Z", "ز", 100, days=(0, 3))
    def day(zone_, clock, ready=None):
        return delivery.next_day(zone_, clock, ready).isoformat()

    assert day(sunday_wed, clock_at("2026-10-19", 9)) == "2026-10-21"
    assert day(sunday_wed, clock_at("2026-10-21", 9)) == "2026-10-21"
    assert day(sunday_wed, clock_at("2026-10-22", 9)) == "2026-10-25"
    cut = delivery.Zone(None, "Z", "ز", 100, cutoff=time(14, 0))
    assert day(cut, clock_at("2026-10-19", 13, 59)) == "2026-10-19"
    assert day(cut, clock_at("2026-10-19", 14, 0)) == "2026-10-19"
    assert day(cut, clock_at("2026-10-19", 14, 1)) == "2026-10-20"
    both = delivery.Zone(None, "Z", "ز", 100, days=(1,), cutoff=time(14, 0))  # Mondays
    assert day(both, clock_at("2026-10-19", 15)) == "2026-10-26"
    assert day(both, clock_at("2026-10-19", 10)) == "2026-10-19"


def test_a_delivery_is_never_before_the_day_a_made_to_order_item_is_ready():
    zone_ = delivery.Zone(None, "Z", "ز", 100, days=(0, 3))
    ready = datetime(2026, 10, 22, tzinfo=QATAR).date()
    assert delivery.next_day(zone_, clock_at("2026-10-19", 9), ready).isoformat() == "2026-10-25"
    assert delivery.next_day(zone_, clock_at("2026-10-19", 9), None).isoformat() == "2026-10-21"


def test_the_day_is_shown_to_the_customer_and_kept_on_the_order(shop):
    client = shop
    every = zone(client, name="Every day", name_ar="كل يوم")
    settings(client, delivery=True)
    [who] = people(client, 1)
    item = cake(client)
    answer = check(client, who, [line(item)], fulfilment=go(zone_id=every["id"])).json()
    shown = answer["pricing"]["delivery"]
    assert shown["deliver_on_text"] and shown["deliver_on_text_ar"]
    placed = place(client, who, [line(item)], go(zone_id=every["id"])).json()
    row = owner_sql("select delivery_on from orders where id = $1", UUID(placed["order_id"]))[0]
    assert row["delivery_on"].isoformat() == shown["deliver_on"]


def test_a_zone_with_no_delivery_day_in_two_weeks_is_refused(shop, monkeypatch):
    client = shop
    never = zone(client)
    settings(client, delivery=True)
    monkeypatch.setattr(delivery, "next_day", lambda *a, **k: None)
    [who] = people(client, 1)
    refused = place(client, who, [line(cake(client))], go(zone_id=never["id"]))
    assert refused.status_code == 422 and detail(refused)["code"] == "delivery_no_day"


# ── cancelling, the account, the report ──────────────────────────────────────────────────


def test_an_order_on_account_is_ledgered_with_its_delivery_fee(shop):
    from test_orders import customer

    client = shop
    wakra = zone(client)
    settings(client, delivery=True)
    who = customer(client)
    item = cake(client)
    placed = place(client, who, [line(item)], go(zone_id=wakra["id"]), payment="account")
    assert placed.status_code == 200, placed.text
    [entry] = owner_sql("select amount from ledger_entries where order_id = $1 and kind = 'sale'",
                        UUID(placed.json()["order_id"]))
    assert entry["amount"] == 11_500


def test_staff_can_tell_pickups_from_deliveries_in_the_orders_list(shop):
    client = shop
    wakra = zone(client)
    settings(client, delivery=True)
    first, second = people(client, 2)
    item = cake(client)
    place(client, first, [line(item)], go("pickup"))
    place(client, second, [line(item)], go(zone_id=wakra["id"]))
    modes = sorted(o["fulfilment"]["mode"] for o in client.get("/api/orders").json()["orders"]
                   if "fulfilment" in o)
    assert modes == ["delivery", "pickup"]


def test_the_weekly_report_counts_pickups_deliveries_and_fees(shop):
    from alyr.modules import report
    from test_catalog_reports import catalog_lines, retime_order
    from test_discounts import cancel
    from test_reports import at

    client = shop
    wakra = zone(client)
    settings(client, delivery=True)
    week = report.last_full_week(datetime.now(UTC), "Asia/Qatar")
    item = cake(client)
    a, b, c, d = people(client, 4)
    placed = [
        place(client, a, [line(item)], go("pickup")).json(),
        place(client, b, [line(item)], go(zone_id=wakra["id"])).json(),
        place(client, c, [line(item)], go(zone_id=wakra["id"])).json(),
        place(client, d, [line(item)], go(zone_id=wakra["id"])).json(),
    ]
    for n, one in enumerate(placed):
        retime_order(one["order_id"], at(week, 2, 9 + n))
    cancel(client, placed[3]["order_id"])
    english = [x for x in catalog_lines(client, week) if x.startswith("Deliver")]
    assert english == ["Deliveries this week: 2 orders, QAR 30 in delivery fees (1 pickup)"]
    arabic = [x for x in catalog_lines(client, week, "ar") if x.startswith("التوصيل")]
    assert arabic == ["التوصيل هذا الأسبوع: طلبان، 30 ر.ق رسوم توصيل (استلام واحد)"]
    deliver_on(client, False)
    assert not [x for x in catalog_lines(client, week) if x.startswith("Deliver")]


def test_a_shop_that_never_used_delivery_has_no_delivery_line_in_its_report(client):
    from alyr.modules import report
    from test_catalog_reports import catalog_lines

    week = report.last_full_week(datetime.now(UTC), "Asia/Qatar")
    assert not [x for x in catalog_lines(client, week) if "eliver" in x]


# ── the chat: "Pickup or delivery?" ──────────────────────────────────────────────────────


def draft_with(client, phone, item, quantity=1):
    asked = talk(client, phone, f"{item['code']} x {quantity}")[-1]
    return tap(client, phone, asked, 0)[-1]


def test_placing_asks_pickup_or_delivery_then_the_zone_then_the_address_then_shows_the_total(shop):
    client = shop
    wakra = zone(client)
    lusail = zone(client, name="Lusail", name_ar="لوسيل", fee=2_500)
    settings(client, delivery=True)
    item = cake(client, price=5_000)
    draft_with(client, STRANGER, item, 2)
    ask = talk(client, STRANGER, reply_id="cart_place")[-1]
    assert ask["kind"] == "buttons" and ask["body"] == "Pickup or delivery?"
    assert ids(ask) == ["fulfil:pickup", "fulfil:delivery"]
    zones = tap(client, STRANGER, ask, 1)[-1]
    assert zones["kind"] == "list" and "area" in zones["body"].lower()
    assert [c["id"] for c in zones["payload"]["choices"]] == [f"zone:{wakra['id']}",
                                                              f"zone:{lusail['id']}"]
    assert "QAR 25" in zones["payload"]["choices"][1]["description"]
    address = tap(client, STRANGER, zones, 1)[-1]
    assert "address" in address["body"].lower()
    assert orders_of(STRANGER) == []
    draft = talk(client, STRANGER, "Villa 7, Street 20, Lusail")[-1]
    assert "Delivery to Lusail: QAR 25" in draft["body"]
    assert "Villa 7, Street 20, Lusail" in draft["body"] and "Total: QAR 125" in draft["body"]
    assert ids(draft)[0] == "cart_place"
    placed = talk(client, STRANGER, reply_id="cart_place")
    assert "Delivery to Lusail: QAR 25" in placed[-1]["body"]
    assert "Villa 7, Street 20, Lusail" in placed[-1]["body"]
    [row] = orders_of(STRANGER)
    assert row["total"] == 12_500
    stored = owner_sql("select fulfilment, delivery_zone_name, delivery_address, delivery_fee "
                       "from orders where id = $1", row["id"])[0]
    assert (stored["fulfilment"], stored["delivery_zone_name"], stored["delivery_fee"]) == (
        "delivery", "Lusail", 2_500)
    assert stored["delivery_address"] == "Villa 7, Street 20, Lusail"


def test_pickup_in_the_chat_needs_nothing_more(shop):
    client = shop
    zone(client)
    settings(client, delivery=True)
    item = cake(client, price=5_000)
    draft_with(client, STRANGER, item)
    ask = talk(client, STRANGER, reply_id="cart_place")[-1]
    draft = tap(client, STRANGER, ask, 0)[-1]
    assert "Pickup" in draft["body"] and "Total: QAR 50" in draft["body"]
    talk(client, STRANGER, reply_id="cart_place")
    assert [o["total"] for o in orders_of(STRANGER)] == [5_000]


def test_the_same_in_arabic(shop):
    client = shop
    zone(client)
    zone(client, name="Lusail", name_ar="لوسيل", fee=2_500)
    settings(client, delivery=True)
    item = cake(client, price=5_000)
    asked = talk(client, STRANGER, f"رقم {item['code']}")[-1]
    tap(client, STRANGER, asked, 0)
    ask = talk(client, STRANGER, reply_id="cart_place")[-1]
    assert ask["body"] == "استلام أو توصيل؟"
    zones = tap(client, STRANGER, ask, 1)[-1]
    tap(client, STRANGER, zones, 0)
    draft = talk(client, STRANGER, "فيلا 3 شارع 9")[-1]
    assert "التوصيل إلى الوكرة: 15 ر.ق" in draft["body"]
    assert "الإجمالي: 65 ر.ق" in draft["body"] and "QAR" not in draft["body"]


def test_a_shop_with_only_delivery_skips_the_first_question_and_with_only_the_flat_fee_the_zone(
    shop
):
    client = shop
    settings(client, delivery=True, pickup=False, flat_fee=1_000)
    item = cake(client, price=5_000)
    draft_with(client, STRANGER, item)
    reply = talk(client, STRANGER, reply_id="cart_place")[-1]
    assert "address" in reply["body"].lower()
    draft = talk(client, STRANGER, "Flat 2, Tower 5")[-1]
    assert "Delivery: QAR 10" in draft["body"] and "Total: QAR 60" in draft["body"]


def test_a_discount_code_and_delivery_work_together_in_the_chat(shop):
    client = shop
    switch(client)
    rule(client, code="TEN10")
    zone(client)
    settings(client, delivery=True, pickup=False)
    item = cake(client, price=10_000)
    draft_with(client, STRANGER, item)
    talk(client, STRANGER, "coupon TEN10")
    ask = talk(client, STRANGER, reply_id="cart_place")[-1]  # (one area: no list to choose from)
    assert "address" in ask["body"].lower()
    draft = talk(client, STRANGER, "Villa 9")[-1]
    assert "Discount (TEN10): -QAR 10" in draft["body"]
    assert "Delivery to Al Wakra: QAR 15" in draft["body"] and "Total: QAR 105" in draft["body"]
    talk(client, STRANGER, reply_id="cart_place")
    row = owner_sql("select subtotal, discount_total, delivery_fee, total from orders")[0]
    assert (row["subtotal"], row["discount_total"], row["delivery_fee"], row["total"]) == (
        10_000, 1_000, 1_500, 10_500)


def test_with_the_feature_off_the_chat_places_straight_away_as_it_always_did(client):
    item = cake(client, price=5_000)
    draft_with(client, STRANGER, item)
    talk(client, STRANGER, reply_id="cart_place")
    assert [o["total"] for o in orders_of(STRANGER)] == [5_000]




# ── a template made in the back office can include it ───────────────────────────────────────


def test_a_template_made_in_the_back_office_can_switch_delivery_on_for_its_shops(
    office, owner  # noqa: F811
):
    from test_templates import made, new_with

    mine = made(office, name="Cake shop", features={"delivery_fees": {"enabled": True}})
    assert mine["features"]["delivery_fees"]["enabled"] is True
    shop = new_with(office, mine["key"])
    sign_in(owner, shop["email"])
    assert owner.get("/api/delivery").status_code == 200
    plain = new_with(office, made(office, name="Plain")["key"])
    sign_in(owner, plain["email"])
    assert owner.get("/api/delivery").status_code == 422
