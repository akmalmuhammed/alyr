// Tests for the cost screens' arithmetic (ALY-150 part 3): the margin and its share are worked
// out in whole numbers and rounded the way the API rounds them (half up, to one decimal), the
// price in force is the sale price only while the sale is on, and a price under the cost is found
// for the item and for each size. Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { belowCost, marginOf, pctShown, percentOf, todaysPrice } from "./costMath.ts";

test("the share is amount x 100 / price, to one decimal, halves going up", () => {
  assert.equal(percentOf(3750, 10000), "37.5");
  assert.equal(percentOf(1, 8), "12.5");
  assert.equal(percentOf(1, 16), "6.3"); // 6.25 -> 6.3, as Decimal ROUND_HALF_UP does
  assert.equal(percentOf(1, 3), "33.3");
  assert.equal(percentOf(2, 3), "66.7");
  assert.equal(percentOf(10000, 10000), "100.0");
  assert.equal(percentOf(0, 500), "0.0");
});

test("a negative margin rounds the half away from zero, like the API", () => {
  assert.equal(percentOf(-1, 16), "-6.3");
  assert.equal(percentOf(-250, 1000), "-25.0");
  assert.equal(percentOf(-1, 100000), "0.0");
});

test("a price of nothing has no share", () => {
  assert.equal(percentOf(100, 0), null);
  assert.equal(percentOf(-100, -5), null);
});

test("the margin of one unit", () => {
  assert.deepEqual(marginOf(10000, 6250), { amount: 3750, pct: "37.5" });
  assert.deepEqual(marginOf(500, 800), { amount: -300, pct: "-60.0" });
  assert.equal(marginOf(500, null), null);
  assert.equal(marginOf(null, 500), null);
});

test("the percentage is shown without a needless .0 and with a real minus", () => {
  assert.equal(pctShown("37.5"), "37.5");
  assert.equal(pctShown("40.0"), "40");
  assert.equal(pctShown("-12.5"), "−12.5");
  assert.equal(pctShown(null), null);
});

test("the sale price is the price only while the sale is on", () => {
  assert.equal(todaysPrice(1000, null, "", "2026-10-20"), 1000);
  assert.equal(todaysPrice(1000, 800, "", "2026-10-20"), 800);
  assert.equal(todaysPrice(1000, 800, "2026-10-20", "2026-10-20"), 800); // its last day counts
  assert.equal(todaysPrice(1000, 800, "2026-10-19", "2026-10-20"), 1000);
  assert.equal(todaysPrice(1000, 1000, "", "2026-10-20"), 1000); // a sale must be lower
  assert.equal(todaysPrice(null, 800, "", "2026-10-20"), null);
});

test("a price under the cost is found for the item, its sale price and each size", () => {
  const found = belowCost({
    price: 1000, sale: 700, itemCost: 800,
    sizes: [{ name: "Large", delta: 500, cost: null }, { name: "Small", delta: -300, cost: 500 }],
  });
  assert.deepEqual(found.map((x) => [x.sale, x.size, x.price, x.cost]), [
    [true, "", 700, 800], // the item's sale price
    [true, "Small", 400, 500], // a size with a cost of its own
  ]);
});

test("a size with no cost of its own costs what the item costs; no cost, no warning", () => {
  assert.deepEqual(belowCost({ price: 500, sale: null, itemCost: null, sizes: [] }), []);
  assert.deepEqual(
    belowCost({ price: 500, sale: null, itemCost: 600, sizes: [{ name: "A", delta: 0, cost: null }] }).map((x) => x.size),
    ["", "A"],
  );
  assert.deepEqual(belowCost({ price: 500, sale: null, itemCost: 500, sizes: [] }), []); // equal is not below
});
