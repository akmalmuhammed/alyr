// Tests for the pickup-or-delivery helpers (ALY-150 part 2): what the customer's choice needs
// before it can be paid for, what is kept in the session, the free-delivery nudge in whole
// dirhams, the lines the readable WhatsApp order gains, and the codes-only order that must not
// change. Run with `node --test` from apps/web (Node 22.18 or newer reads the .ts files as they are).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatPrice } from "../price.ts";
import { dayShort, goodsBeforeDiscount, zoneName } from "../fulfil.ts";
import {
  checkBody, EMPTY, FLAT, keyOf, moreForFree, needOf, orderBody, readSaved, settle, storageKey, zoneOf,
} from "./deliveryLogic.ts";
import { waParts } from "./wa.ts";

const zone = (id, name, fee, more = {}) => ({
  id, name, name_ar: `منطقة ${name}`, fee, free_over: null, min_order: 0, days: [], days_text: "Every day", days_text_ar: "كل يوم",
  cutoff: null, cutoff_text: "", cutoff_text_ar: "", next_day: null, next_day_text: null, next_day_text_ar: null, ...more,
});
const wakra = zone("11111111-1111-1111-1111-111111111111", "Al Wakra", 1500, { free_over: 20000 });
const flat = zone(null, "Other areas", 2500);
const both = { pickup: true, delivery: true, zones: [wakra, flat] };

test("both ways offered: nothing is guessed until the customer chooses", () => {
  const choice = settle(EMPTY, both);
  assert.equal(choice.mode, "");
  assert.equal(needOf(choice), "mode");
  assert.equal(checkBody(choice), undefined);
  assert.equal(orderBody(choice), undefined);
});

test("one way offered is the way; one place to deliver to is the place", () => {
  assert.equal(settle(EMPTY, { pickup: true, delivery: false, zones: [] }).mode, "pickup");
  const only = settle(EMPTY, { pickup: false, delivery: true, zones: [flat] });
  assert.equal(only.mode, "delivery");
  assert.equal(only.zone, FLAT);
  assert.equal(needOf(only), "address");
  // two real places: still not chosen
  assert.equal(settle({ ...EMPTY, mode: "delivery" }, both).zone, "");
});

test("a choice the shop no longer offers is dropped", () => {
  assert.equal(settle({ ...EMPTY, mode: "delivery", zone: "gone" }, both).zone, "");
  assert.equal(settle({ ...EMPTY, mode: "delivery" }, { pickup: true, delivery: false, zones: [] }).mode, "pickup");
  assert.equal(settle({ ...EMPTY, mode: "pickup" }, { pickup: false, delivery: true, zones: [flat] }).mode, "delivery");
});

test("delivery needs an area and an address; pickup needs nothing more", () => {
  const base = { ...EMPTY, mode: "delivery" };
  assert.equal(needOf(base), "zone");
  assert.equal(needOf({ ...base, zone: keyOf(wakra) }), "address");
  assert.equal(needOf({ ...base, zone: keyOf(wakra), address: "  a " }), "address");
  assert.equal(needOf({ ...base, zone: keyOf(wakra), address: "Street 5, villa 12" }), null);
  assert.equal(needOf({ ...EMPTY, mode: "pickup" }), null);
});

test("the cart check is asked the mode and the area only, so typing an address asks nothing", () => {
  const typed = { mode: "delivery", zone: keyOf(wakra), address: "Street 5", note: "Call me" };
  assert.deepEqual(checkBody(typed), { mode: "delivery", zone_id: wakra.id });
  assert.deepEqual(checkBody({ ...typed, address: "Street 5, villa 12", note: "" }), checkBody(typed));
  assert.deepEqual(checkBody({ ...typed, zone: FLAT }), { mode: "delivery", zone_id: null });
  assert.deepEqual(checkBody({ ...EMPTY, mode: "pickup" }), { mode: "pickup" });
});

test("the order carries the whole choice, tidied", () => {
  const typed = { mode: "delivery", zone: FLAT, address: "  Street 5,\n villa   12 ", note: " Call at the gate " };
  assert.deepEqual(orderBody(typed), { mode: "delivery", zone_id: null, address: "Street 5, villa 12", note: "Call at the gate" });
  assert.deepEqual(orderBody({ ...EMPTY, mode: "pickup", address: "ignored" }), { mode: "pickup", zone_id: null, address: "", note: "" });
});

test("the zone chosen is found, and flat has no id", () => {
  assert.equal(zoneOf(both, { ...EMPTY, mode: "delivery", zone: FLAT }), flat);
  assert.equal(zoneOf(both, { ...EMPTY, mode: "pickup", zone: FLAT }), undefined);
  assert.equal(keyOf(flat), FLAT);
});

test("what is kept in the session reads back, and nothing else does", () => {
  const saved = { mode: "delivery", zone: FLAT, address: "Street 5", note: "x" };
  assert.deepEqual(readSaved(JSON.stringify(saved)), saved);
  for (const bad of [null, "", "nope", "[]", "42", '{"mode":"flying","zone":7}']) {
    const out = readSaved(bad);
    assert.equal(out.mode, "");
    assert.equal(out.zone, "");
  }
  assert.equal(readSaved(JSON.stringify({ address: "a".repeat(999) })).address.length, 300);
  assert.equal(storageKey("al-noor"), "alyr-fulfil:al-noor");
});

test("free delivery: the nudge is whole dirhams of goods after discounts", () => {
  assert.equal(moreForFree(16000, wakra), 4000); // "Add QAR 40 more"
  assert.equal(moreForFree(19999, wakra), 1);
  assert.equal(moreForFree(20000, wakra), null);
  assert.equal(moreForFree(25000, wakra), null);
  assert.equal(moreForFree(1000, flat), null); // no free-over amount
  assert.equal(moreForFree(1000, { fee: 0, free_over: 5000 }), null); // nothing to waive
  assert.equal(moreForFree(undefined, wakra), null);
  assert.equal(moreForFree(1000.5, wakra), null);
  assert.equal(formatPrice(moreForFree(16000, wakra), "en"), "QAR 40");
  assert.equal(formatPrice(moreForFree(16000, wakra), "ar"), "40 ر.ق");
});

// ── the readable WhatsApp order ───────────────────────────

const spec = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../../../specs/010-order-by-code/messages.json", import.meta.url)), "utf8"),
);
const wa = (order) => waParts(spec.phone, { money: (d) => formatPrice(d, order.lang), ...order });
const line = (code, qty) => ({ code, qty, name: `Item ${code}`, name_ar: `صنف ${code}`, variant: "", variant_ar: "", extras: [], unit: 1000 });
const shop = { name: "Al Noor", name_ar: "النور" };

test("the readable order says pickup, or delivery to the area with the address, and the note", () => {
  const delivery = { mode: "delivery", zone: "Al Wakra", zone_ar: "الوكرة", address: "Street 5, villa 12", note: "Call at the gate" };
  const [en] = wa({ shop, lang: "en", mode: "link", lines: [line(214, 2)], customer: "Huda", fulfilment: delivery });
  assert.equal(en.text, [
    "Order from the Al Noor page",
    "#214 Item 214 x2 - QAR 20",
    "Total: QAR 20",
    "Delivery to Al Wakra: Street 5, villa 12",
    "Note: Call at the gate",
    "Name: Huda",
  ].join("\n"));
  const [ar] = wa({ shop, lang: "ar", mode: "link", lines: [line(214, 2)], fulfilment: delivery });
  assert.equal(ar.text, [
    "طلب من صفحة النور", "#214 صنف 214 x2 - 20 ر.ق", "الإجمالي: 20 ر.ق", "التوصيل إلى الوكرة: Street 5, villa 12", "ملاحظة: Call at the gate",
  ].join("\n"));
  assert.ok(!ar.text.includes("QAR"));
  const [pick] = wa({ shop, lang: "en", mode: "link", lines: [line(214, 1)], fulfilment: { mode: "pickup" } });
  assert.match(pick.text, /\nTotal: QAR 10\nPickup$/);
  const [arPick] = wa({ shop, lang: "ar", mode: "link", lines: [line(214, 1)], fulfilment: { mode: "pickup" } });
  assert.match(arPick.text, /\nالاستلام من المتجر$/);
});

test("the shop's one flat fee has no area to name", () => {
  const flatOnly = { mode: "delivery", zone: "", zone_ar: "", address: "Street 5", note: "" };
  const [en] = wa({ shop, lang: "en", mode: "link", lines: [line(214, 1)], fulfilment: flatOnly });
  assert.match(en.text, /\nTotal: QAR 10\nDelivery: Street 5$/);
  const [ar] = wa({ shop, lang: "ar", mode: "link", lines: [line(214, 1)], fulfilment: flatOnly });
  assert.match(ar.text, /\nالتوصيل: Street 5$/);
});

test("with no choice (or the feature off) the readable order is what it was", () => {
  const plain = wa({ shop, lang: "en", mode: "link", lines: [line(214, 2)], customer: "Huda" });
  assert.deepEqual(wa({ shop, lang: "en", mode: "link", lines: [line(214, 2)], customer: "Huda", fulfilment: null }), plain);
  assert.equal(plain[0].text, "Order from the Al Noor page\n#214 Item 214 x2 - QAR 20\nTotal: QAR 20\nName: Huda");
});

test("the codes-only order for the chat never changes with the choice", () => {
  const choice = { mode: "delivery", zone: "Al Wakra", zone_ar: "الوكرة", address: "Street 5", note: "x" };
  for (const c of spec.chat) {
    const lines = c.lines.map((l) => ({ ...line(l.code, l.qty), variant: l.variant, variant_ar: l.variant }));
    const without = wa({ shop: c.shop, lang: c.lang, mode: "chat", lines });
    const withChoice = wa({ shop: c.shop, lang: c.lang, mode: "chat", lines, fulfilment: choice });
    assert.deepEqual(withChoice.map((p) => p.text), c.parts, c.label);
    assert.deepEqual(withChoice, without);
  }
});

test("a long address and note still keep every part under the limit", () => {
  const lines = Array.from({ length: 30 }, (_, i) => line(101 + i, 2));
  const choice = { mode: "delivery", zone: "Al Wakra", zone_ar: "الوكرة", address: "a".repeat(300), note: "b".repeat(200) };
  const parts = wa({ shop, lang: "en", mode: "link", lines, fulfilment: choice });
  for (const p of parts) assert.ok(p.text.length <= 900 + 520, String(p.text.length));
  assert.ok(parts[parts.length - 1].text.includes("Delivery to Al Wakra"));
});

// ── an order's own copy of the choice ─────────────────────

test("days are written in Western digits in both languages", () => {
  assert.equal(dayShort("2026-10-21", "en"), "Wed 21 Oct");
  assert.match(dayShort("2026-10-21", "ar"), /^[^\d٠-٩]+ 21 [^\d٠-٩]+$/);
  assert.equal(dayShort("not a day", "en"), "not a day");
});

test("the zone is named in the reader's language, falling back to the other", () => {
  assert.equal(zoneName({ zone: "Al Wakra", zone_ar: "الوكرة" }, "en"), "Al Wakra");
  assert.equal(zoneName({ zone: "Al Wakra", zone_ar: "الوكرة" }, "ar"), "الوكرة");
  assert.equal(zoneName({ zone: "Al Wakra", zone_ar: "" }, "ar"), "Al Wakra");
  assert.equal(zoneName({}, "en"), "");
  // the shop's one flat fee is just "Delivery": no area to name
  assert.equal(zoneName({ zone: "Delivery", zone_ar: "التوصيل" }, "en"), "");
  assert.equal(zoneName({ zone: "Delivery", zone_ar: "التوصيل" }, "ar"), "");
  assert.equal(zoneName({ zone: "Other areas", zone_ar: "مناطق أخرى" }, "en"), "Other areas");
});

test("the goods before discount are the total less the fee plus what came off", () => {
  assert.equal(goodsBeforeDiscount({ total: 11500, fulfilment: { fee: 1500 } }), 10000);
  assert.equal(goodsBeforeDiscount({ total: 9500, subtotal: 10000, discount_total: 1000, fulfilment: { fee: 500 } }), 10000);
  assert.equal(goodsBeforeDiscount({ total: 9000, discount_total: 1000 }), 10000);
  assert.equal(goodsBeforeDiscount({ total: 9000 }), 9000);
});
