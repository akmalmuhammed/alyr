// Tests for the customer pages' small pure helpers (ALY-112): the Arabic search folding, the
// price format, and the cart's arithmetic. Run with `node --test` from apps/web (Node 22.18
// or newer reads the .ts files as they are; CI and scripts/check.sh run this).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as cart from "./order/cart.ts";
import * as qty from "./qty.ts";
import { fold, matches, searchWords } from "./fold.ts";
import { amount, formatPrice, formatRange } from "./price.ts";
import { waHref, waParts } from "./order/wa.ts";
import { sitePath } from "./link.ts";

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

// ── Order on WhatsApp (ALY-136) ───────────────────────────

const spec = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../../specs/010-order-by-code/messages.json", import.meta.url)), "utf8"),
);
const wa = (order) => waParts(spec.phone, { money: (d) => formatPrice(d, order.lang), ...order });
const waLine = (code, qty, more = {}) => ({
  code, qty, name: `Item ${code}`, name_ar: `صنف ${code}`, variant: "", variant_ar: "", extras: [], unit: 1000, ...more,
});

test("every chat message is the one the server's reader is tested on, and under 140 characters", () => {
  for (const c of spec.chat) {
    const lines = c.lines.map((l) => waLine(l.code, l.qty, { variant: l.variant, variant_ar: l.variant }));
    const parts = wa({ shop: c.shop, lang: c.lang, mode: "chat", lines });
    assert.deepEqual(parts.map((p) => p.text), c.parts, c.label);
    for (const part of parts) assert.ok(part.text.length <= 140, `${c.label}: ${part.text.length}`);
    assert.equal(parts.reduce((n, p) => n + p.items, 0), c.lines.length, c.label);
  }
});

test("the link opens WhatsApp on the shop's number with the message encoded as UTF-8", () => {
  const [part] = wa({ shop: spec.chat[1].shop, lang: "ar", mode: "chat", lines: [waLine(214, 2)] });
  assert.ok(part.href.startsWith(`https://wa.me/${spec.phone}?text=`));
  assert.equal(decodeURIComponent(part.href.split("?text=")[1]), part.text);
  assert.ok(!part.href.includes(" ") && !part.href.includes("#"));
  assert.equal(waHref("+974 5545 5001", "x"), "https://wa.me/97455455001?text=x");
});

test("a chat message puts the codes in the middle and cues each one", () => {
  const [part] = wa({ shop: { name: "Al Noor", name_ar: "" }, lang: "en", mode: "chat", lines: [waLine(214, 2), waLine(305, 1)] });
  assert.match(part.text, /^Hello Al Noor, .*: #214 x2, #305\. Thank you!$/);
  const [arabic] = wa({ shop: { name: "Al Noor", name_ar: "النور" }, lang: "ar", mode: "chat", lines: [waLine(214, 2)] });
  assert.match(arabic.text, /^مرحباً النور، .*#214 x2\. شكراً$/);
});

test("a line with no code cannot be said to the chat; with no lines there is no message", () => {
  assert.deepEqual(wa({ shop: spec.chat[0].shop, lang: "en", mode: "chat", lines: [] }), []);
  assert.deepEqual(wa({ shop: spec.chat[0].shop, lang: "en", mode: "chat", lines: [waLine(null, 1)] }), []);
  const [part] = wa({ shop: spec.chat[0].shop, lang: "en", mode: "chat", lines: [waLine(null, 1), waLine(305, 1)] });
  assert.match(part.text, /#305/);
});

test("a message for a person is laid out line by line with codes, quantities, the total and the name", () => {
  const lines = [
    waLine(214, 2, { name: "Black abaya", variant: "M", unit: 26000 }),
    waLine(305, 1, { name: "Oud 50 ml", unit: 12000, extras: [{ name: "Gift box", name_ar: "علبة" }] }),
  ];
  const [part] = wa({ shop: { name: "Al Noor", name_ar: "النور" }, lang: "en", mode: "link", lines, customer: "Huda" });
  assert.equal(part.text, [
    "Order from the Al Noor page",
    "#214 Black abaya (M) x2 - QAR 520",
    "#305 Oud 50 ml (Gift box) x1 - QAR 120",
    "Total: QAR 640",
    "Name: Huda",
  ].join("\n"));
  const [arabic] = wa({ shop: { name: "Al Noor", name_ar: "النور" }, lang: "ar", mode: "link", lines: [waLine(214, 2, { unit: 26000 })], table: "7" });
  assert.match(arabic.text, /^طلب من صفحة النور\n#214 صنف 214 x2 - 520 ر\.ق\nالإجمالي: 520 ر\.ق\nطاولة 7$/);
  assert.ok(!arabic.text.includes("QAR"));
});

test("a long order for a person goes in parts, and only the last carries the total", () => {
  const lines = Array.from({ length: 40 }, (_, i) => waLine(101 + i, 2, { name: `A fairly long item name number ${i}`, unit: 1500 }));
  const parts = wa({ shop: spec.chat[0].shop, lang: "en", mode: "link", lines });
  assert.ok(parts.length >= 2);
  for (const part of parts) assert.ok(part.text.length <= 900, String(part.text.length));
  assert.ok(parts[0].text.includes("(1/") && !parts[0].text.includes("Total:"));
  assert.ok(parts[parts.length - 1].text.includes("Total: QAR 1,200"));
  assert.equal(parts.reduce((n, p) => n + p.items, 0), 40);
});


// ── quantities: weight and volume (ALY-149) ───────────────

const rounding = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../../specs/013-decimal-quantities/rounding.json", import.meta.url)), "utf8"),
);

test("a line is its price times its quantity rounded half up, the same table the server is tested on", () => {
  for (const c of rounding.cases) {
    assert.equal(qty.lineTotal(c.price, qty.readQty(c.quantity)), c.line, `${c.price} x ${c.quantity}`);
  }
  for (const o of rounding.orders) {
    const total = o.lines.reduce((sum, l) => sum + qty.lineTotal(l.price, qty.readQty(l.quantity)), 0);
    assert.equal(total, o.total, JSON.stringify(o.lines));
  }
});

test("quantities add and compare without float noise", () => {
  assert.equal(0.1 + 0.2 === 0.3, false, "the float problem this module avoids");
  assert.equal(qty.addQty(0.1, 0.2), 0.3);
  assert.equal(qty.subQty(1, 0.9), 0.1);
  assert.equal(qty.cmpQty(qty.addQty(0.1, 0.2), 0.3), 0);
  assert.equal(qty.sumQty([0.25, 0.25, 0.25, 0.25]), 1);
  assert.equal(qty.milli(0.333), 333);
  assert.equal(qty.milli(12.5), 12500);
  assert.equal(qty.isMultiple(0.75, 0.25), true);
  assert.equal(qty.isMultiple(0.3, 0.25), false);
  assert.equal(qty.ceilToStep(0.3, 0.25), 0.5);
  assert.equal(qty.floorToStep(0.7, 0.25), 0.5);
});

test("a quantity is written one way: Western numerals, a point, no trailing zeros, the unit after a measure", () => {
  assert.equal(qty.fmtQty(3), "3");
  assert.equal(qty.fmtQty(0.5), "0.5");
  assert.equal(qty.fmtQty(12.25), "12.25");
  assert.equal(qty.fmtQty(0.001), "0.001");
  assert.equal(qty.fmtQtyUnit(0.5, "kg", "en"), "0.5 kg");
  assert.equal(qty.fmtQtyUnit(0.5, "kg", "ar"), "0.5 كغ");
  assert.equal(qty.fmtQtyUnit(250, "ml", "ar"), "250 مل");
  assert.equal(qty.fmtQtyUnit(3, "kg", "en"), "3 kg", "a measure always carries its unit");
  for (const counted of ["piece", "pack", "box", "portion", "hour"]) assert.equal(qty.fmtQtyUnit(3, counted, "en"), "3");
  assert.equal(qty.qtyForApi(2), 2);
  assert.equal(qty.qtyForApi(0.25), "0.25");
});

test("typed amounts are read in either language", () => {
  const read = qty.readQty;
  assert.equal(read("0.5"), 0.5);
  assert.equal(read("٠٫٥"), 0.5);
  assert.equal(read("0,5"), 0.5);
  assert.equal(read(" 12 "), 12);
  assert.equal(read("١٢٫٢٥"), 12.25);
  assert.equal(read("1,250"), 1250);
  assert.equal(read("1,250.5"), 1250.5);
  assert.equal(read(".5"), 0.5);
  for (const bad of ["", "abc", "1.2.3", "0.1234", "-1", "1e3", "٫", "1,2,3"]) assert.equal(read(bad), null, JSON.stringify(bad));
  assert.equal(qty.tooManyPlaces("0.1234"), true);
  assert.equal(qty.tooManyPlaces("0.123"), false);
});

const dates = (more = {}) => item({
  unit: "kg", pack_size: 0.25, min_order: 0.25, left: 12.5,
  quantity: { measure: true, step: 0.25, min: 0.25, fractions: true, chips: [0.25, 0.5, 1] }, ...more,
});

test("an item sold by weight steps by its step, starts at its smallest order and stops at what is left", () => {
  assert.deepEqual([cart.step(dates()), cart.smallest(dates())], [0.25, 0.25]);
  assert.equal(cart.next(dates(), 0, +1), 0.25);
  assert.equal(cart.next(dates(), 0.25, +1), 0.5);
  assert.equal(cart.next(dates(), 0.75, +1), 1);
  assert.equal(cart.next(dates(), 0.5, -1), 0.25);
  assert.equal(cart.next(dates(), 0.25, -1), 0, "below the smallest order the line is removed");
  assert.equal(cart.next(dates({ left: 1.5 }), 1.5, +1), 1.5, "no further than what is left");
  assert.equal(cart.next(dates({ left: 1.5 }), 1.25, +1), 1.5);
  assert.equal(cart.most(dates({ left: 0.4 })), 0.4);
  // A box is already the pack, even when the API sends its pack size as the step: it counts by one.
  assert.equal(cart.step(item({ unit: "box", pack_size: 12, quantity: { measure: false, step: 1, min: 1, fractions: false, chips: [] } })), 1);
});

test("a typed amount is checked the way the server checks it", () => {
  const code = (q, more) => cart.problem(dates(more), q)?.code ?? null;
  assert.equal(code(0.75), null);
  assert.equal(code(0.3), "off_step");
  assert.deepEqual(cart.problem(dates(), 0.3), { code: "off_step", step: 0.25, suggest: 0.5 });
  assert.equal(code(0.2), "below_minimum");
  assert.equal(code(0), "bad");
  assert.equal(code(1000), "bad");
  assert.equal(code(13), "not_enough");
  assert.equal(cart.problem(item({ unit: "piece" }), 1.5)?.code, "not_whole");
  assert.equal(cart.problem(item({ unit: "piece" }), 3), null);
  assert.equal(cart.problem(item({ unit: "kg" }), 1.5)?.code, "off_step", "a kilo with no step is sold in whole kilos");
});

test("a cart of fractions totals line by line, and a half kilo counts as one thing", () => {
  const lines = [{ key: "a", qty: 0.333, unit: 1250 }, { key: "b", qty: 0.5, unit: 333 }];
  assert.equal(cart.total(lines), 416 + 167);
  assert.equal(cart.count(lines), 2);
  assert.equal(cart.count([{ key: "c", qty: 3, unit: 1 }, { key: "d", qty: 0.5, unit: 1 }]), 4);
  // 250 ml is one thing, and so is a whole kilo whose unit is written beside it
  assert.equal(cart.count([{ key: "e", qty: 250, unit: 1, unitKey: "ml" }, { key: "f", qty: 2, unit: 1, unitKey: "piece" }]), 3);
});

test("WhatsApp messages carry a fraction as x0.5, and a person's message says the unit and rounds each line", () => {
  const lines = [waLine(214, 0.5, { name: "Medjool dates", unit: 1250, unitKey: "kg" }), waLine(305, 1.25, { unit: 1000 })];
  const [chat] = wa({ shop: { name: "Al Noor", name_ar: "" }, lang: "en", mode: "chat", lines });
  assert.match(chat.text, /#214 x0\.5, #305 x1\.25\./);
  const [link] = wa({ shop: { name: "Al Noor", name_ar: "" }, lang: "en", mode: "link", lines });
  assert.equal(link.text, [
    "Order from the Al Noor page",
    "#214 Medjool dates x0.5 kg - QAR 6.25",
    "#305 Item 305 x1.25 - QAR 12.50",
    "Total: QAR 18.75",
  ].join("\n"));
  const [arabic] = wa({ shop: { name: "Al Noor", name_ar: "النور" }, lang: "ar", mode: "link", lines: [lines[0]] });
  assert.match(arabic.text, /x0\.5 كغ - 6\.25 ر\.ق/);
});

const decimals = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../../specs/013-decimal-quantities/messages.json", import.meta.url)), "utf8"),
);

test("a fraction is written the way the server's reader is tested to read it, under 140 characters", () => {
  for (const c of decimals.chat) {
    const lines = c.lines.map((l) => waLine(l.code, l.qty, { variant: l.variant, variant_ar: l.variant }));
    const parts = wa({ shop: c.shop, lang: c.lang, mode: "chat", lines });
    assert.deepEqual(parts.map((p) => p.text), c.parts, c.label);
    for (const part of parts) assert.ok(part.text.length <= 140, `${c.label}: ${part.text.length}`);
  }
});

test("a link from the API opens on this site with its signed token", () => {
  assert.equal(sitePath("https://app.alyr.qa/t/al-noor?t=AbC-1.x_Y"), "/t/al-noor?t=AbC-1.x_Y");
  assert.equal(sitePath("http://localhost:3100/pay/a/b"), "/pay/a/b");
});
