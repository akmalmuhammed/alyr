// The Documents screens' pure parts (ALY-146). Run with `node --test` from apps/web (Node 22.18
// or newer reads the .ts files as they are). The totals are compared with the engine's own:
// `documentsVectors.json` is written by the API's test suite from the Python engine, and the
// numbers here must come out the same with integer arithmetic.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  NO_FILTERS, PRESETS, activeFilterCount, cleanColour, dateText, deliveryPill, draftTotals,
  filtersToQuery, inputMoney, lineAmounts, missingForIssue, moneyState, orderedDates,
  parseMoney, parseQuantity, plain, presetFilters, quantityText, roundToStep, settingsDiff,
  westernDigits, written,
} from "./documentsLogic.ts";

const vectors = JSON.parse(readFileSync(new URL("./documentsVectors.json", import.meta.url), "utf8"));

test("every line and rounding the engine worked out comes out the same here", () => {
  assert.ok(vectors.length >= 400);
  for (const v of vectors) {
    const got = lineAmounts({ milli: v.milli, price: v.price, discount: v.discount, rateBp: v.rate_bp });
    assert.deepEqual(got, { gross: v.gross, net: v.net, tax: v.tax, total: v.total }, JSON.stringify(v));
    assert.equal(roundToStep(v.total, v.step), v.rounding, JSON.stringify(v));
  }
});

test("the examples of the engine's own rule", () => {
  // 12 × 3.50 and 2 × 45.00 less 5.00: the shop's usual sale, QAR 127.00
  const bread = lineAmounts({ milli: 12000, price: 350, discount: 0, rateBp: 0 });
  const cake = lineAmounts({ milli: 2000, price: 4500, discount: 500, rateBp: 0 });
  assert.equal(bread.total + cake.total, 12700);
  // a half up, never to even: 1.5 × 9.99 = 14.985, 1498.5 minor units goes to 1499
  assert.equal(lineAmounts({ milli: 1500, price: 999, discount: 0, rateBp: 0 }).gross, 1499);
  assert.equal(lineAmounts({ milli: 500, price: 1, discount: 0, rateBp: 0 }).gross, 1);
  // tax on the net, rounded the same way: 5% of 1499 is 74.95
  assert.equal(lineAmounts({ milli: 1500, price: 999, discount: 0, rateBp: 500 }).tax, 75);
  // a discount of more than the line cannot be worked out
  assert.equal(lineAmounts({ milli: 1000, price: 100, discount: 101, rateBp: 0 }), null);
  assert.equal(roundToStep(12703, 5), 2);
  assert.equal(roundToStep(12702, 5), -2);
  assert.equal(roundToStep(12705, 5), 0);
  assert.equal(roundToStep(12702, 0), 0);
});

test("a draft's totals add the lines, then round the cash once", () => {
  const lines = [
    { milli: 12000, price: 350, discount: 0, rateBp: 0 },
    { milli: 2000, price: 4500, discount: 500, rateBp: 0 },
  ];
  const t = draftTotals(lines, 0, true);
  assert.deepEqual(t, { gross: 13200, discount: 500, tax: 0, rounding: 0, total: 12700, valid: true });
  const cash = draftTotals([{ milli: 1000, price: 12703, discount: 0, rateBp: 0 }], 5, true);
  assert.deepEqual([cash.rounding, cash.total], [2, 12705]);
  // a kind that is not paid in cash is not rounded
  assert.equal(draftTotals([{ milli: 1000, price: 12703, discount: 0, rateBp: 0 }], 5, false).total, 12703);
  assert.equal(draftTotals([null], 0, true).valid, false);
  assert.equal(draftTotals([], 0, true).total, 0);
});

test("what a person types is read the way the engine reads it", () => {
  assert.equal(parseMoney("12.5"), 1250);
  assert.equal(parseMoney("12"), 1200);
  assert.equal(parseMoney("١٢٫٥٠"), 1250);              // Arabic digits and decimal mark
  assert.equal(parseMoney("1 270,00"), 127000);          // a space and a decimal comma
  assert.equal(parseMoney("12.505"), null);              // QAR has two decimals
  assert.equal(parseMoney("12.505", 3), 12505);          // a dinar has three
  assert.equal(parseMoney("-3"), null);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("abc"), null);
  assert.equal(inputMoney(1250), "12.5");
  assert.equal(inputMoney(1200), "12");
  assert.equal(inputMoney(5), "0.05");
  assert.equal(inputMoney(null), "");
  assert.equal(parseQuantity("2"), 2000);
  assert.equal(parseQuantity("0.5"), 500);
  assert.equal(parseQuantity("1.25"), 1250);
  assert.equal(parseQuantity("٣"), 3000);
  assert.equal(parseQuantity("0"), null);
  assert.equal(parseQuantity("1.2345"), null);
  assert.equal(parseQuantity("-1"), null);
  assert.equal(quantityText(2000), "2");
  assert.equal(quantityText(500), "0.5");
  assert.equal(quantityText(12250), "12.25");
  assert.equal(westernDigits("٠١٢٣٤٥٦٧٨٩"), "0123456789");
});

test("amounts are written the way each language writes them", () => {
  assert.equal(plain(12700), "127.00");
  assert.equal(plain(123456789), "1,234,567.89");
  assert.equal(plain(-250), "-2.50");
  assert.equal(plain(1500, 3), "1.500");
  assert.equal(plain(5, 0), "5");
  assert.equal(written(12700, "QAR", 2, "ر.ق", "en"), "QAR 127.00");
  assert.equal(written(12700, "QAR", 2, "ر.ق", "ar"), "127.00 ر.ق");
  assert.equal(written(1500, "KWD", 3, "د.ك", "ar"), "1.500 د.ك");
  assert.equal(written(100, "XYZ", 2, "", "ar"), "1.00 XYZ");
});

test("the filters travel as the API takes them, and the cards open the lists they counted", () => {
  assert.equal(filtersToQuery(NO_FILTERS).toString(), "");
  const q = filtersToQuery({ ...NO_FILTERS, q: " fatima ", kind: "invoice", payment: ["unpaid", "part"], from: "2026-10-01", to: "2026-10-31", branch: "lus" });
  assert.equal(q.get("q"), "fatima");
  assert.equal(q.get("payment"), "unpaid,part");
  assert.equal(q.get("date_from"), "2026-10-01");
  assert.equal(q.get("branch"), "lus");
  // the same two as the API's PRESETS, spelled out
  assert.deepEqual(presetFilters("unpaid_invoices"), { ...NO_FILTERS, kind: "invoice", status: "issued", payment: ["unpaid", "part"] });
  assert.deepEqual(presetFilters("not_delivered"), { ...NO_FILTERS, status: "issued", delivery: "not_delivered" });
  assert.equal(presetFilters("nonsense"), null);
  assert.equal(presetFilters(null), null);
  assert.deepEqual(Object.keys(PRESETS).sort(), ["not_delivered", "unpaid_invoices"]);
  assert.equal(activeFilterCount(NO_FILTERS), 0);
  assert.equal(activeFilterCount({ ...NO_FILTERS, q: "x" }), 0);          // the search is not a filter
  assert.equal(activeFilterCount(presetFilters("unpaid_invoices")), 3);
  assert.deepEqual(orderedDates("2026-10-20", "2026-10-01"), { from: "2026-10-01", to: "2026-10-20" });
  assert.deepEqual(orderedDates("2026-10-01", ""), { from: "2026-10-01", to: "" });
});

test("a row says its money state in one word, only where it means something", () => {
  const row = (kind, status, total, paid) => ({ kind, status, total_minor: total, paid_minor: paid, balance_minor: total - paid });
  assert.equal(moneyState(row("invoice", "issued", 100, 0)), "unpaid");
  assert.equal(moneyState(row("invoice", "issued", 100, 40)), "part");
  assert.equal(moneyState(row("invoice", "issued", 100, 100)), "paid");
  assert.equal(moneyState(row("receipt", "issued", 100, 100)), "paid");
  assert.equal(moneyState(row("invoice", "void", 100, 0)), null);         // cancelled owes nothing
  assert.equal(moneyState(row("invoice", "draft", 100, 0)), null);
  assert.equal(moneyState(row("quote", "issued", 100, 0)), null);
  assert.equal(moneyState(row("credit_note", "issued", 100, 0)), null);
  assert.equal(moneyState(row("delivery_note", "issued", 0, 0)), null);
  assert.equal(deliveryPill("draft", "none"), null);
  assert.equal(deliveryPill("issued", "none"), "none");
  assert.equal(deliveryPill("issued", "not_delivered"), "not_delivered");
  assert.equal(deliveryPill("issued", "weird"), "none");
});

test("a draft says what it still needs before it can be issued", () => {
  const ok = { kind: "invoice", needsCustomer: true, customerName: "Fatima", lineCount: 1, lineTexts: ["Bread"], lineErrors: false, total: 100, allowsZero: false, paid: 0, wantsPayment: "optional" };
  assert.deepEqual(missingForIssue(ok), []);
  assert.deepEqual(missingForIssue({ ...ok, customerName: "  " }), ["customer"]);
  assert.deepEqual(missingForIssue({ ...ok, needsCustomer: false, customerName: "" }), []);
  assert.deepEqual(missingForIssue({ ...ok, lineCount: 0, lineTexts: [], total: 0 }), ["lines"]);
  assert.deepEqual(missingForIssue({ ...ok, lineTexts: [" "] }), ["line_text"]);
  assert.deepEqual(missingForIssue({ ...ok, lineErrors: true }), ["line_amount"]);
  assert.deepEqual(missingForIssue({ ...ok, total: 0 }), ["total"]);
  assert.deepEqual(missingForIssue({ ...ok, total: 0, allowsZero: true }), []);
  assert.deepEqual(missingForIssue({ ...ok, kind: "deposit_receipt", wantsPayment: "deposit" }), ["deposit"]);
});

test("settings are sent as what changed, and nothing else", () => {
  const saved = { layout: "a4", brand_color: null, show_sku: false, terms: { receipt: { en: "x" } } };
  assert.deepEqual(settingsDiff(saved, { ...saved }), {});
  assert.deepEqual(settingsDiff(saved, { ...saved, layout: "a5", brand_color: "#8a1c2b" }), { layout: "a5", brand_color: "#8a1c2b" });
  assert.deepEqual(settingsDiff(saved, { ...saved, terms: { receipt: { en: "x" } } }), {});
  assert.deepEqual(settingsDiff(saved, { ...saved, terms: { receipt: { en: "y" } } }), { terms: { receipt: { en: "y" } } });
});

test("a colour is hex or nothing", () => {
  assert.equal(cleanColour(" #8A1C2B "), "#8a1c2b");
  assert.equal(cleanColour("8a1c2b"), "#8a1c2b");
  assert.equal(cleanColour(""), null);
  assert.equal(cleanColour("pink"), "");
  assert.equal(cleanColour("#fff"), "");
});

test("dates are written out with Western digits in both languages", () => {
  assert.equal(dateText("2026-10-19", "en"), "19 Oct 2026");
  assert.match(dateText("2026-10-19", "ar"), /^19 .+ 2026$/);
  assert.doesNotMatch(dateText("2026-10-19", "ar"), /[٠-٩]/);
  assert.equal(dateText(null, "en"), "");
  assert.equal(dateText("nonsense", "en"), "");
});
