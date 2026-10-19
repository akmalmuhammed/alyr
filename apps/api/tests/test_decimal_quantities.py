"""Decimal and weight quantities (ALY-149, D-039 "As built (decimal quantities)").

A quantity is an exact decimal with three places. These tests go through the real path (HTTP in
and out, real PostgreSQL): a customer orders 0.5 kg, stock moves by 0.5, the line is rounded by
one rule, a cancel puts the fraction back, two customers cannot both take the last 0.5 kg, a
counted unit never takes a fraction, and a shop that never uses the feature behaves as it did.
"""

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path

import pytest

from alyr.modules.items import qty, stock
from alyr.modules.items import report as catalog_report
from concurrency import LockWatch, hold_open, warm
from test_consent import ahmed, conversation
from test_features_api import refused, switch
from test_items import (
    ACTOR,
    counted,
    detail,
    drain,
    fresh,
    line,
    log_rows,
    mk,
    on_hand,
    on_shop,
    order,
    people,
    reconciled,
)
from test_orders import STORE

KG = {"unit": "kg", "pack_size": "0.25", "min_order": "0.25"}


@pytest.fixture
def by_weight(client):
    """The demo shop with "Sold by weight or volume" switched on."""
    assert switch(client, "decimal_quantity", True).status_code == 200
    return client


def dates(client, kilos, **more):
    """Medjool dates, QAR 12.50 a kilo, sold in steps of a quarter kilo."""
    fields = {"name": "Medjool dates", "name_ar": "تمر مجدول", "price": 1250, **KG, **more}
    return counted(client, kilos, **fields)


# ── reading and writing a quantity ────────────────────────────────────────────────────


@pytest.mark.parametrize("raw, expected", [
    (3, 3), ("3", 3), ("0.5", Decimal("0.5")), ("٠٫٥", Decimal("0.5")), ("0,5", Decimal("0.5")),
    (" 12.50 ", Decimal("12.5")), ("12.000", 12), ("١٢٫٢٥", Decimal("12.25")),
    ("1,234.5", Decimal("1234.5")), ("12,500", 12500), (0.1, Decimal("0.1")),
    (Decimal("0.250"), Decimal("0.25")), ("+2", 2),
])
def test_a_quantity_is_read_exactly(raw, expected):
    got = qty.parse(raw)
    assert got == expected and type(got) is type(expected)


@pytest.mark.parametrize("raw, code", [
    ("0.1234", "too_many_places"), ("0", "zero"), (0, "zero"), ("-1", "negative"),
    ("abc", "bad_number"),
    ("", "bad_number"), ("1.2.3", "bad_number"), (True, "bad_number"), (float("nan"), "bad_number"),
    ("1e3", "bad_number"), ("999999999999", "too_big"),
])
def test_a_quantity_that_is_not_one_is_refused(raw, code):
    with pytest.raises(qty.QtyError) as refusal:
        qty.parse(raw)
    assert refusal.value.code == code


def test_a_quantity_is_written_one_way_in_both_languages():
    assert qty.fmt(3) == qty.fmt(Decimal("3.000")) == "3"
    assert qty.fmt(Decimal("0.500")) == "0.5" and qty.fmt("12.25", "ar") == "12.25"
    assert qty.fmt(12500, group=True) == "12,500"
    assert qty.with_unit(Decimal("0.5"), "kg") == "0.5 kg"
    assert qty.with_unit(Decimal("0.5"), "kg", "ar") == "0.5 كغ"
    assert qty.with_unit(250, "ml", "ar") == "250 مل" and qty.with_unit(1.5, "l") == "1.5 L"
    assert qty.with_unit(3, "kg") == "3 kg"  # a measure always carries its unit
    for counted_unit in ("piece", "pack", "box", "portion", "hour"):
        assert qty.with_unit(3, counted_unit) == "3"  # a counted unit, as ever, does not


def test_every_unit_has_both_names_and_the_measures_are_the_ones_that_take_fractions():
    assert qty.MEASURES == ("kg", "g", "l", "ml", "m", "tola")
    for unit in qty.UNIT_LIST:
        assert unit.en and unit.ar
        assert bool(unit.short_en) == unit.measure == bool(unit.short_ar)
    assert set(qty.LEGACY_UNITS) == {"piece", "kg", "box", "pack", "portion", "hour"}


# ── one rounding rule ─────────────────────────────────────────────────────────────────

# The same table the web reads (apps/web/.../customer.test.mjs): one rule, tested on both sides.
TABLE = json.loads(
    (Path(__file__).parents[3] / "specs" / "013-decimal-quantities" / "rounding.json")
    .read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", TABLE["cases"], ids=lambda c: f"{c['price']}x{c['quantity']}")
def test_a_line_is_price_times_quantity_rounded_half_up_to_a_dirham(case):
    assert qty.line_total(case["price"], qty.parse(case["quantity"])) == case["line"]


@pytest.mark.parametrize("case", TABLE["orders"], ids=lambda c: str(c["total"]))
def test_an_order_is_the_sum_of_its_rounded_lines(case):
    lines = [qty.line_total(x["price"], qty.parse(x["quantity"])) for x in case["lines"]]
    assert sum(lines) == case["total"]


def test_rounding_never_goes_through_a_float():
    # 1.005 is not exactly representable as a float; as a decimal it is, and 1005 x 0.5 is 502.5.
    assert qty.line_total(1005, Decimal("0.5")) == 503
    # 1.5 rounds up; as a float, 0.15 * 10 is 1.5000000000000002
    assert qty.line_total(10, Decimal("0.15")) == 2


# ── the rules for a quantity ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("quantity, unit, step, minimum, expected", [
    (3, "piece", None, 1, None),
    (Decimal("0.5"), "piece", None, 1, "not_whole"),
    (0, "piece", None, 1, "bad_quantity"),
    (1000, "piece", None, 1, "bad_quantity"),
    (Decimal("0.5"), "kg", None, 1, "below_minimum"),    # a kilo with no settings: whole kilos
    (Decimal("1.5"), "kg", None, 1, "off_step"),         # ... so a kilo and a half is a step off
    (Decimal("0.5"), "kg", None, Decimal("0.1"), "off_step"),
    (2, "kg", None, 1, None),
    (Decimal("0.5"), "kg", Decimal("0.25"), Decimal("0.25"), None),
    (Decimal("0.75"), "kg", Decimal("0.25"), Decimal("0.25"), None),
    (Decimal("0.3"), "kg", Decimal("0.25"), Decimal("0.25"), "off_step"),
    (Decimal("0.25"), "kg", Decimal("0.25"), Decimal("0.5"), "below_minimum"),
    (0, "kg", Decimal("0.25"), Decimal("0.25"), "bad_amount"),
    (Decimal("0.0001"), "kg", Decimal("0.25"), Decimal("0.25"), "bad_amount"),
    (Decimal("1000"), "kg", Decimal("0.25"), Decimal("0.25"), "bad_amount"),
    (250, "ml", 50, 50, None),
    (225, "ml", 50, 50, "off_step"),
    (12, "piece", 6, 6, None),
    (10, "piece", 6, 6, "not_pack_multiple"),
    (10, "box", 6, 1, None),    # a box or a pack is the pack already
])
def test_the_rules(quantity, unit, step, minimum, expected):
    got = qty.check(quantity, unit, step, minimum)
    assert (got[0] if got else None) == expected


def test_the_next_step_up_is_suggested():
    refusal = qty.check(Decimal("0.3"), "kg", Decimal("0.25"), Decimal("0.25"))
    assert refusal[1]["suggest"] == Decimal("0.5")
    assert qty.check(10, "piece", 6, 6)[1] == {"pack": 6, "suggest": 12}


# ── the feature and the item ──────────────────────────────────────────────────────────


def test_the_feature_is_off_for_a_plain_shop_and_on_for_a_grocery_and_a_bakery(client):
    from alyr.shop_templates import BUILTIN

    on = sorted(k for k, t in BUILTIN.items() if t.on("decimal_quantity"))
    assert on == ["bakery", "grocery"]
    shown = {f["key"]: f for g in client.get("/api/features").json()["groups"]
             for f in g["features"]}["decimal_quantity"]
    assert shown["enabled"] is False
    assert shown["name"] == "Sold by weight or volume" and shown["name_ar"]
    assert "0.5 kg" in shown["hint"] and shown["hint_ar"] and shown["changes_ar"]
    assert "coming" not in str(shown).lower() and "beta" not in str(shown).lower()


def test_with_the_feature_off_the_new_units_and_fractional_steps_are_refused(client):
    refused(client.post("/api/items", json={
        "name": "Oud", "name_ar": "عود", "price": 9000, "status": "live", "unit": "ml"}))
    refused(client.post("/api/items", json={
        "name": "Dates", "name_ar": "تمر", "price": 1250, "status": "live", "unit": "kg",
        "pack_size": "0.25"}))
    # A kilo with a whole step, as before, is fine.
    assert client.post("/api/items", json={
        "name": "Rice", "name_ar": "أرز", "price": 800, "status": "live", "unit": "kg",
        "pack_size": 5, "min_order": 5}).status_code == 200


def test_with_the_feature_on_an_item_is_sold_by_a_measure_in_steps(by_weight):
    item = mk(by_weight, name="Medjool dates", name_ar="تمر", price=1250, **KG)
    assert (item["unit"], item["pack_size"], item["min_order"]) == ("kg", 0.25, 0.25)
    assert item["quantity"] == {"measure": True, "step": 0.25, "min": 0.25, "fractions": True,
                                "show_unit": True, "chips": [0.25, 0.5, 1]}
    # A step and a smallest order on a measure belong to this feature even with pack sizes off.
    assert switch(by_weight, "pack_rules", False).status_code == 200
    again = mk(by_weight, name="Saffron", name_ar="زعفران", price=9000, unit="g", pack_size=5,
               min_order=5)
    assert again["quantity"]["chips"] == [] and again["quantity"]["step"] == 5


def test_a_counted_unit_never_takes_a_fraction_in_the_item_or_its_stock(by_weight):
    refused_item = by_weight.post("/api/items", json={
        "name": "Cake", "name_ar": "كيكة", "price": 4000, "status": "live", "unit": "piece",
        "min_order": "0.5"})
    assert refused_item.status_code == 422
    cake = counted(by_weight, 4, name="Cake", name_ar="كيكة", price=4000)
    answer = by_weight.post(f"/api/items/{cake['id']}/stock",
                            json={"kind": "received", "quantity": "1.5"})
    assert answer.status_code == 422 and answer.json()["detail"]["code"] == "not_whole"
    assert on_hand(by_weight, cake) == 4
    # The database says no too, if anything slips past the application.
    with pytest.raises(Exception, match="only a measure"):
        on_shop(by_weight, lambda conn: conn.execute(
            "update item_variants set on_hand = 1.5 where item_id = $1", cake["id"]))


def test_stock_is_received_wasted_and_counted_in_decimals(by_weight):
    item = dates(by_weight, "12.5")
    assert on_hand(by_weight, item) == 12.5
    assert by_weight.post(f"/api/items/{item['id']}/stock",
                          json={"kind": "received", "quantity": "2.25"}).json()["balance"] == 14.75
    waste = by_weight.post(f"/api/items/{item['id']}/stock",
                           json={"kind": "wasted", "quantity": 0.75, "reason": "dropped"})
    assert waste.json()["balance"] == 14
    counted_ = by_weight.post(f"/api/items/{item['id']}/count",
                              json={"counted": "13.5", "reason": "dry"})
    assert counted_.json()["difference"] == -0.5 and on_hand(by_weight, item) == 13.5
    short = by_weight.post(f"/api/items/{item['id']}/stock",
                           json={"kind": "wasted", "quantity": "20", "reason": "x"})
    assert short.status_code == 422 and "13.5 kg" in short.json()["detail"]["message"]
    assert by_weight.post(f"/api/items/{item['id']}/stock",
                          json={"kind": "received", "quantity": "0.1234"}).status_code == 422
    assert sorted(r["delta"] for r in log_rows(by_weight, item)) == [-0.75, -0.5, 2.25, 12.5]
    assert reconciled(by_weight)
    # The log adds up to the number, exactly.
    variant = fresh(by_weight, item)["variants"][0]["id"]
    assert on_shop(by_weight, stock.total, variant) == Decimal("13.5")


# ── a customer orders by weight ───────────────────────────────────────────────────────


def test_a_customer_orders_half_a_kilo_and_the_line_is_rounded_once(by_weight):
    item = dates(by_weight, "12.5")
    [who] = people(by_weight, 1)
    placed = order(by_weight, who, [line(item, "0.5")])
    assert placed.status_code == 200, placed.text
    assert placed.json()["total"] == 625 and placed.json()["total_text"] == "QAR 6.25"
    assert on_hand(by_weight, item) == 12
    assert [(r["kind"], r["delta"]) for r in log_rows(by_weight, item)][0] == ("sold", -0.5)
    listed = by_weight.get("/api/orders").json()
    listed = listed["orders"] if isinstance(listed, dict) else listed
    [shown] = [o for o in listed if o["number"] == placed.json()["number"]][0]["items"]
    assert (shown["quantity"], shown["unit"], shown["line_text"]) == (0.5, "kg", "QAR 6.25")
    assert reconciled(by_weight)


def test_the_total_of_an_order_is_the_sum_of_its_rounded_lines(by_weight):
    a = dates(by_weight, 50, pack_size="0.001", min_order="0.001")
    b = counted(by_weight, 50, name="Almonds", name_ar="لوز", price=333, unit="kg",
                pack_size="0.5", min_order="0.5")
    [who] = people(by_weight, 1)
    placed = order(by_weight, who, [line(a, "0.333"), line(b, "0.5")])
    assert placed.status_code == 200, placed.text
    assert placed.json()["total"] == 416 + 167  # 416.25 and 166.5, each rounded alone


def test_a_wrong_amount_gets_a_plain_sentence_in_both_languages(by_weight):
    item = dates(by_weight, 10)
    [who] = people(by_weight, 1)
    cases = [
        ("0.3", "off_step", "steps of 0.25 kg", "0.5 kg"),
        ("0.2", "below_minimum", "0.25 kg", None),
        ("2.001", "off_step", "steps of 0.25 kg", None),
    ]
    for quantity, code, english, _ in cases:
        refusal = detail(order(by_weight, who, [line(item, quantity)]))
        assert refusal["code"] == code, (quantity, refusal)
        assert english in refusal["message"] or english in refusal["lines"][0]["message"]
        assert refusal["lines"][0]["message_ar"]
    assert on_hand(by_weight, item) == 10  # nothing was taken
    whole = counted(by_weight, 5, name="Box of cake", name_ar="علبة", price=900)
    refusal = detail(order(by_weight, who, [line(whole, "1.5")]))
    assert refusal["code"] == "not_whole"
    assert "whole" in refusal["lines"][0]["message"]
    for odd in ("0.0001", 0):
        assert order(by_weight, who, [line(whole, odd)]).status_code == 422


def test_only_what_is_left_is_told_in_the_unit(by_weight):
    item = dates(by_weight, "1.5")
    [who] = people(by_weight, 1)
    refusal = detail(order(by_weight, who, [line(item, 2)]))
    assert refusal["code"] == "not_enough"
    assert refusal["lines"][0]["left"] == 1.5
    assert "1.5 kg" in refusal["message"] and "1.5 كغ" in refusal["lines"][0]["message_ar"]


def test_integers_and_strings_and_numbers_all_work_and_whole_stays_whole(by_weight):
    item = dates(by_weight, 20)
    customers = people(by_weight, 4)
    for who, quantity in zip(customers, (1, "1", "1.0", 1.0), strict=True):
        assert order(by_weight, who, [line(item, quantity)]).status_code == 200
    assert on_hand(by_weight, item) == 16
    body = fresh(by_weight, item)
    assert isinstance(body["variants"][0]["on_hand"], int)  # whole in JSON is an integer


def test_a_customer_cannot_slip_a_float_or_too_many_places_past_the_page(by_weight):
    item = dates(by_weight, 20)
    [who] = people(by_weight, 1)
    for quantity in ("1e3", "abc", "0.1234", -1, "NaN"):
        assert order(by_weight, who, [line(item, quantity)]).status_code == 422
    assert on_hand(by_weight, item) == 20


def test_cancelling_an_order_puts_the_fraction_back(by_weight):
    item = dates(by_weight, "5.5")
    [who] = people(by_weight, 1)
    placed = order(by_weight, who, [line(item, "1.75")]).json()
    assert on_hand(by_weight, item) == 3.75
    cancelled = by_weight.post(
        f"/api/orders/{placed['order_id']}/status", json={"status": "cancelled"})
    assert cancelled.status_code == 200, cancelled.text
    assert on_hand(by_weight, item) == 5.5
    assert [(r["kind"], r["delta"]) for r in log_rows(by_weight, item)][:2] == [
        ("cancelled_restocked", 1.75), ("sold", -1.75)]
    assert reconciled(by_weight)


def test_an_unpaid_pay_link_order_gives_the_fraction_back_when_its_hold_runs_out(by_weight):
    from test_catalog_concurrency import rewind, sweep

    item = dates(by_weight, 3)
    [who] = people(by_weight, 1)
    placed = order(by_weight, who, [line(item, "0.75")]).json()
    assert on_hand(by_weight, item) == 2.25
    rewind(placed["order_id"])
    sweep(by_weight)
    drain(by_weight)
    assert on_hand(by_weight, item) == 3 and reconciled(by_weight)


def test_a_daily_limit_can_be_a_fraction(by_weight):
    cake = mk(by_weight, name="Cake by the kilo", name_ar="كيكة", price=6000, unit="kg",
              stock_rule="daily_limit", daily_limit="2.5", pack_size="0.5", min_order="0.5")
    [who] = people(by_weight, 1)
    assert order(by_weight, who, [line(cake, "1.5")]).status_code == 200
    answer = order(by_weight, who, [line(cake, "1.5")])
    assert answer.status_code == 409
    assert detail(answer)["lines"][0]["left"] == 1
    assert order(by_weight, who, [line(cake, 1)]).status_code == 200
    assert reconciled(by_weight)


def test_a_credit_order_puts_the_rounded_total_on_the_ledger(by_weight):
    item = dates(by_weight, 10, pack_size="0.001", min_order="0.001")
    [who] = people(by_weight, 1)
    before = by_weight.get("/api/ledger/summary").json()["customers"]
    before = next(c for c in before if c["id"] == who["id"])["balance"]
    placed = order(by_weight, who, [line(item, "0.333")], payment="account")
    if placed.status_code == 200:
        after = next(c for c in by_weight.get("/api/ledger/summary").json()["customers"]
                     if c["id"] == who["id"])["balance"]
        assert after - before == placed.json()["total"] == 416
    else:  # this demo customer has no account: the refusal is the usual one
        assert detail(placed)["code"] in ("no_account", "over_limit")


# ── two customers, the last half kilo ─────────────────────────────────────────────────


def test_two_customers_for_the_last_half_kilo_one_gets_it(by_weight, monkeypatch):
    item = dates(by_weight, "0.5")
    warm(by_weight)
    first, second = people(by_weight)
    hold_open(monkeypatch, stock, "move", 0.4)
    start = threading.Barrier(2)

    def buy(who):
        start.wait()
        return order(by_weight, who, [line(item, "0.5")])

    with LockWatch("item_variants") as watch, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(buy, (first, second)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert watch.blocked >= 1, f"the two requests never met in the database: {watch}"
    refusal = detail(next(r for r in results if r.status_code == 409))
    assert (refusal["code"], refusal["lines"][0]["left"]) == ("sold_out", 0)
    assert on_hand(by_weight, item) == 0
    assert [r["kind"] for r in log_rows(by_weight, item)].count("sold") == 1
    assert reconciled(by_weight)


def test_six_at_once_for_two_and_a_half_kilos_never_sell_more_than_that(by_weight, monkeypatch):
    item = dates(by_weight, "2.5", name="Pistachios", name_ar="فستق")
    warm(by_weight)
    buyers = people(by_weight, 6)
    hold_open(monkeypatch, stock, "move", 0.1)
    start = threading.Barrier(len(buyers))

    def buy(who):
        start.wait()
        return order(by_weight, who, [line(item, "1")])

    with ThreadPoolExecutor(len(buyers)) as pool:
        results = list(pool.map(buy, buyers))
    # two whole kilos fit; half a kilo is left
    assert sorted(r.status_code for r in results).count(200) == 2
    assert on_hand(by_weight, item) == 0.5 and reconciled(by_weight)


# ── the stock engine, directly ────────────────────────────────────────────────────────


def test_the_stock_engine_moves_a_decimal_and_refuses_to_go_below_zero(by_weight):
    item = dates(by_weight, "1.25")
    variant = fresh(by_weight, item)["variants"][0]["id"]

    async def go(conn):
        from uuid import UUID

        v = UUID(variant)
        assert await stock.move(conn, v, "sold", Decimal("-1.25"), ACTOR) == 0
        assert await stock.move(conn, v, "sold", Decimal("-0.001"), ACTOR) is None
        assert await stock.move(conn, v, "received", Decimal("0.001"), ACTOR) == Decimal("0.001")
        return await stock.mismatches(conn)

    assert on_shop(by_weight, go) == []


def test_the_log_of_a_decimal_stock_adds_up_after_a_mixed_day(by_weight):
    item = dates(by_weight, 10)
    who = people(by_weight, 3)
    a = order(by_weight, who[0], [line(item, "0.25")]).json()
    order(by_weight, who[1], [line(item, "1.75")])
    by_weight.post(f"/api/items/{item['id']}/stock",
                   json={"kind": "wasted", "quantity": "0.5", "reason": "x"})
    by_weight.post(f"/api/orders/{a['order_id']}/status", json={"status": "cancelled"})
    by_weight.post(f"/api/items/{item['id']}/count", json={"counted": "7.5", "reason": "recount"})
    assert on_hand(by_weight, item) == 7.5
    assert reconciled(by_weight)


# ── reports and the other places a quantity is added up ──────────────────────────────


def test_the_orders_page_and_the_tracking_page_show_the_quantity_and_unit(by_weight):
    item = dates(by_weight, 10)
    [who] = people(by_weight, 1)
    placed = order(by_weight, who, [line(item, "0.75")]).json()
    tenant_order = placed["track_url"].rsplit("/t/", 1)[1]
    tracked = by_weight.get(f"/api/track/{tenant_order}")
    assert tracked.status_code == 200, tracked.text
    [shown] = tracked.json()["order"]["items"]
    assert (shown["quantity"], shown["unit"], shown["line_total"]) == (0.75, "kg", 938)  # 937.5


def test_the_order_page_tells_the_page_how_much_may_be_ordered(by_weight):
    dates(by_weight, 10)
    page = by_weight.get(STORE).json()
    [row] = [i for i in page["items"] if i["name"] == "Medjool dates"] if "items" in page else [
        p for p in page["products"] if p["name"] == "Medjool dates"]
    assert row["quantity"] == {"measure": True, "step": 0.25, "min": 0.25, "fractions": True,
                               "show_unit": True, "chips": [0.25, 0.5, 1]}
    assert row["unit"] == "kg" and row["pack_size"] == 0.25


# ── what is written beside a quantity ────────────────────────────────────────────────


def order_for_ahmed(client, item, quantity):
    from order_links import token

    return client.post(
        f"{STORE}/orders",
        json={"token": token(ahmed(client)["id"]), "items": [line(item, quantity)],
              "payment": "link"},
    )


def test_the_unit_is_written_beside_a_quantity_only_for_something_sold_in_fractions(by_weight):
    dates_ = dates(by_weight, 20)
    rice = counted(by_weight, 20, name="Rice by the kilo", name_ar="أرز", price=800, unit="kg")
    assert dates_["quantity"]["show_unit"] is True
    assert rice["quantity"]["show_unit"] is False and rice["quantity"]["fractions"] is False
    assert order_for_ahmed(by_weight, dates_, "0.75").status_code == 200
    assert order_for_ahmed(by_weight, rice, 2).status_code == 200
    bodies = [m["body"] for m in conversation(by_weight)]
    assert any("0.75 kg x Medjool dates" in b for b in bodies), bodies[-2:]
    assert any("2 x Rice by the kilo" in b and "2 kg" not in b for b in bodies), bodies[-2:]
    # The stored line says which: a line of a fractional item shows its unit, the other does not.
    orders_ = by_weight.get("/api/orders").json()
    orders_ = orders_["orders"] if isinstance(orders_, dict) else orders_
    shown = {i["name"]: i for o in orders_ for i in o["items"]}
    assert (shown["Medjool dates"]["unit"], shown["Medjool dates"]["unit_shown"]) == ("kg", True)
    rice_line = shown["Rice by the kilo"]
    assert (rice_line["unit"], rice_line["unit_shown"]) == ("kg", False)


def test_a_shortage_is_told_in_the_unit_for_fractions_and_plainly_for_whole_kilos(by_weight):
    dates_ = dates(by_weight, "1.5")
    rice = counted(by_weight, 3, name="Rice by the kilo", name_ar="أرز", price=800, unit="kg")
    [who] = people(by_weight, 1)
    short = detail(order(by_weight, who, [line(dates_, 2)]))["lines"][0]
    assert "1.5 kg" in short["message"] and "1.5 كغ" in short["message_ar"]
    plain = detail(order(by_weight, who, [line(rice, 5)]))["lines"][0]
    assert "kg" not in plain["message"] and "كغ" not in plain["message_ar"]
    assert "Only 3 of Rice by the kilo left" in plain["message"]


def test_the_weekly_report_writes_weights_with_their_unit_and_leaves_pieces_alone():
    news = {
        "sold_out": {"count": 0, "items": []}, "asked": {"customers": 0, "items": []},
        "low": {"count": 2, "items": [
            {"name": "Dates", "name_ar": "تمر", "left": Decimal("1.5"), "unit": "kg",
             "show_unit": True},
            {"name": "Cups", "name_ar": "أكواب", "left": 4}]},
        "top_units": [{"name": "Dates", "name_ar": "تمر", "units": Decimal("12.5"), "value": 1562,
                       "unit": "kg"},
                      {"name": "Cups", "name_ar": "أكواب", "units": 40, "value": 320}],
        "top_value": [], "idle": {"count": 0, "items": []},
    }
    news["top_value"] = list(news["top_units"])
    english = catalog_report.lines(news, None, "en")
    assert "Dates (1.5 kg left), Cups (4 left)" in english[0]
    assert "Most sold: Dates (12.5 kg, QAR 15.62), Cups (40, QAR 3.20)" in " ".join(english)
    arabic = catalog_report.lines(news, None, "ar")
    assert "المتبقي 1.5 كغ" in arabic[0] and "المتبقي 4)" in arabic[0]


# ── the Documents engine reads the same quantity and rounds it the same way ──────────


def test_a_receipt_from_an_order_by_weight_has_the_quantity_the_unit_and_the_same_total(
    client_factory, monkeypatch
):
    from documents_sales_support import customer, documents, pay_by_link, placed, sales_shop

    shop = sales_shop(client_factory, monkeypatch)
    assert switch(shop.owner, "decimal_quantity", True).status_code == 200
    made = shop.owner.post("/api/items", json={
        "name": "Medjool dates", "name_ar": "تمر مجدول", "price": 1250, "status": "live",
        "unit": "kg", "pack_size": "0.001", "min_order": "0.001"})
    assert made.status_code == 200, made.text
    dates_ = made.json()["item"]
    order_ = placed(shop, customer(shop), [(dates_, "0.333")])
    assert order_["total"] == 416                  # 416.25, rounded once
    assert pay_by_link(shop, order_).json() == {"status": "paid"}
    [receipt] = documents(shop)
    assert receipt["total_minor"] == 416           # the receipt agrees with the order, to the dirham
    shown = shop.owner.get(f"/api/documents/{receipt['id']}").json()["document"]
    [row] = shown["lines"]
    assert (row["quantity"], row["unit"], row["line_total_minor"]) == ("0.333", "kg", 416)
