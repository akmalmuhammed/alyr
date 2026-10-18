// Tests for the customer pages' small pure helpers (ALY-112): the Arabic search folding, the
// price format, and the cart's arithmetic. Run with `node --test` from apps/web (Node 22.18
// or newer reads the .ts files as they are; CI and scripts/check.sh run this).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as cart from "./order/cart.ts";
import { fold, matches, searchWords } from "./fold.ts";
import { amount, formatPrice, formatRange } from "./price.ts";

const cases = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../../specs/005-order-page-v2/fold-cases.json", import.meta.url)), "utf8"),
);

test("folding agrees with the server on every shared case", () => {
  for (const [given, folded] of cases.fold) assert.equal(fold(given), folded, JSON.stringify(given));
});

test("search words agree with the server", () => {
  for (const [query, words] of cases.words) assert.deepEqual(searchWords(query), words, JSON.stringify(query));
});

test("matching agrees with the server", () => {
  for (const [query, fields, found] of cases.matches) {
    assert.equal(matches(searchWords(query), ...fields), found, `${query} in ${JSON.stringify(fields)}`);
  }
});

test("English prices read QAR 24, QAR 24.50, QAR 1,234", () => {
  assert.equal(formatPrice(2400, "en"), "QAR 24");
  assert.equal(formatPrice(2450, "en"), "QAR 24.50");
  assert.equal(formatPrice(123400, "en"), "QAR 1,234");
  assert.equal(formatPrice(5, "en"), "QAR 0.05");
  assert.equal(formatPrice(0, "en"), "QAR 0");
  assert.equal(formatPrice(-1250, "en"), "QAR -12.50");
});

test("Arabic prices read the amount then ر.ق, in Western digits, and never QAR", () => {
  assert.equal(formatPrice(2400, "ar"), "24 ر.ق");
  assert.equal(formatPrice(2450, "ar"), "24.50 ر.ق");
  assert.equal(formatPrice(123400, "ar"), "1,234 ر.ق");
  assert.equal(formatPrice(100_000_000, "ar"), "1,000,000 ر.ق");
  for (const dirhams of [0, 5, 99, 100, 2450, 123456789]) {
    const text = formatPrice(dirhams, "ar");
    assert.ok(!text.includes("QAR"), text);
    assert.ok(/^-?[\d,.]+ ر\.ق$/.test(text), text);
  }
  assert.equal(amount(2450), "24.50");
});

test("a range writes both ends in full", () => {
  assert.equal(formatRange(1200, 1800, "en"), "QAR 12 – 18");
  assert.equal(formatRange(1200, 1850, "ar"), "12 – 18.50 ر.ق");
});

// ── the cart ──────────────────────────────────────────────

const item = (more = {}) => ({
  id: "i1", name: "Nails", name_ar: "مسامير", price: 100, min_order: 1, pack_size: null, unit: "piece",
  left: null, variants: [], option_groups: [], needs_choice: false, ...more,
});

test("quantities step by the pack and start at the smallest order", () => {
  assert.deepEqual([cart.step(item()), cart.smallest(item())], [1, 1]);
  assert.deepEqual([cart.step(item({ pack_size: 12 })), cart.smallest(item({ pack_size: 12 }))], [12, 12]);
  // A smallest order that is not a whole pack rounds up to one.
  assert.equal(cart.smallest(item({ pack_size: 12, min_order: 20 })), 24);
  assert.equal(cart.smallest(item({ min_order: 6 })), 6);
  // A box or a pack is already the pack: the count is of boxes.
  assert.deepEqual([cart.step(item({ pack_size: 12, unit: "box" })), cart.smallest(item({ pack_size: 12, unit: "box" }))], [1, 1]);
  assert.equal(cart.step(item({ pack_size: 1 })), 1);
});

test("the stepper moves by a step, stops at what is left and removes below the smallest", () => {
  const nails = item({ pack_size: 12, left: 30 });
  assert.equal(cart.next(nails, 0, +1), 12);
  assert.equal(cart.next(nails, 12, +1), 24);
  assert.equal(cart.next(nails, 24, +1), 24, "36 would be more than the 30 left");
  assert.equal(cart.next(nails, 24, -1), 12);
  assert.equal(cart.next(nails, 12, -1), 0);
  assert.equal(cart.next(item({ min_order: 6 }), 0, +1), 6);
  assert.equal(cart.next(item({ min_order: 6 }), 6, -1), 0);
  assert.equal(cart.next(item(), 998, +1), 999);
  assert.equal(cart.next(item(), 999, +1), 999);
  assert.equal(cart.most(item({ left: 3 })), 3);
  assert.equal(cart.most(item()), 999);
});

test("a line is the same line for the same item, size and choices in any order", () => {
  assert.equal(cart.keyOf("a", "v", ["2", "1"]), cart.keyOf("a", "v", ["1", "2"]));
  assert.notEqual(cart.keyOf("a", "v", ["1"]), cart.keyOf("a", null, ["1"]));
  assert.notEqual(cart.keyOf("a", "v", []), cart.keyOf("b", "v", []));
});

test("totals add each line's price and its extras", () => {
  const lines = [
    { key: "a", qty: 2, unit: 1250 },
    { key: "b", qty: 1, unit: 300 },
  ];
  assert.equal(cart.total(lines), 2800);
  assert.equal(cart.count(lines), 3);
  assert.equal(cart.total([]), 0);
});

test("a size and its extras make the price of one", () => {
  const abaya = item({
    price: 25000, price_source: "normal",
    variants: [
      { id: "m", name: "M", price: 25000, sold_out: false },
      { id: "l", name: "L", price: 27000, sold_out: false },
    ],
    option_groups: [{ id: "g", required: false, max_choices: 2, options: [{ id: "o1", price_delta: 500 }, { id: "o2", price_delta: 300 }] }],
  });
  assert.equal(cart.unitPrice(abaya, "l", ["o1", "o2"]), 27800);
  assert.equal(cart.unitPrice(abaya, "m", []), 25000);
  assert.equal(cart.unitPrice(item({ price: 100 }), null, []), 100);
});

test("a required choice that is missing is named", () => {
  const pizza = item({
    needs_choice: true,
    variants: [{ id: "s", name: "S", sold_out: false }, { id: "l", name: "L", sold_out: true }],
    option_groups: [
      { id: "size", required: true, max_choices: 1, options: [{ id: "a" }, { id: "b" }] },
      { id: "extras", required: false, max_choices: 2, options: [{ id: "c" }] },
    ],
  });
  assert.deepEqual(cart.missing(pizza, null, []), { variant: true, groups: ["size"], tooMany: [] });
  assert.deepEqual(cart.missing(pizza, "s", ["a"]), { variant: false, groups: [], tooMany: [] });
  assert.deepEqual(cart.missing(pizza, "s", ["a", "c"]).tooMany, []);
  const two = { ...pizza, option_groups: [{ id: "size", required: true, max_choices: 1, options: [{ id: "a" }, { id: "b" }] }] };
  assert.deepEqual(cart.missing(two, "s", ["a", "b"]).tooMany, ["size"]);
});
