import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDigits, sanitizeCode, isValidCode, isValidEmail, formatMoney, formatCountdown, applyCodeInput, parsePrice, durationLabel, summarizeServices, quoteTotal, canRemoveService } from "./logic.ts";

test("normalizeDigits converts Eastern Arabic numerals to Latin", () => {
  assert.equal(normalizeDigits("٧٣٠٥١٨"), "730518");
  assert.equal(normalizeDigits("۰۱۲۳۴۵۶۷۸۹"), "0123456789");
  assert.equal(normalizeDigits("Code: ٧٣05١8!"), "Code: 730518!");
});

test("sanitizeCode extracts only digits and caps at 6", () => {
  assert.equal(sanitizeCode("٧٣٠-٥١٨"), "730518");
  assert.equal(sanitizeCode("12 34 56 78"), "123456");
  assert.equal(sanitizeCode("abc"), "");
});

test("isValidCode checks for exact 6 digits", () => {
  assert.equal(isValidCode("730518"), true);
  assert.equal(isValidCode("73051"), false);
  assert.equal(isValidCode("7305189"), false);
  assert.equal(isValidCode("73051a"), false);
});

test("isValidEmail checks email format", () => {
  assert.equal(isValidEmail("hana@nuqta.qa"), true);
  assert.equal(isValidEmail("invalid-email"), false);
  assert.equal(isValidEmail(""), false);
});

test("formatMoney outputs correct language formatting", () => {
  assert.equal(formatMoney(500, "en"), "QAR 500");
  assert.equal(formatMoney("1,200", "en"), "QAR 1,200");
  assert.equal(formatMoney(500, "ar"), "500\u00a0ر.ق");
  assert.equal(formatMoney("1,200", "ar"), "1,200\u00a0ر.ق");
});

test("formatCountdown formats mm:ss", () => {
  assert.equal(formatCountdown(42), "0:42");
  assert.equal(formatCountdown(65), "1:05");
  assert.equal(formatCountdown(0), "0:00");
});

test("applyCodeInput: one character fills its box and moves on", () => {
  const edit = applyCodeInput(["", "", "", "", "", ""], 2, "4");
  assert.deepEqual(edit.digits, ["", "", "4", "", "", ""]);
  assert.equal(edit.focus, 3);
});

test("applyCodeInput: a pasted whole code fills every box, whichever box it lands in", () => {
  const edit = applyCodeInput(["7", "", "", "", "", ""], 3, "730518");
  assert.deepEqual(edit.digits, ["7", "3", "0", "5", "1", "8"]);
  assert.equal(edit.focus, 5);
});

test("applyCodeInput: Arabic digits are read as Latin digits", () => {
  const edit = applyCodeInput(["", "", "", "", "", ""], 0, "٧٣٠٥١٨");
  assert.deepEqual(edit.digits, ["7", "3", "0", "5", "1", "8"]);
  assert.equal(applyCodeInput(["", "", "", "", "", ""], 1, "٥").digits[1], "5");
});

test("applyCodeInput: letters are dropped and emptying a box empties only it", () => {
  assert.deepEqual(applyCodeInput(["1", "2", "3", "4", "5", "6"], 2, "x").digits, ["1", "2", "", "4", "5", "6"]);
  assert.equal(applyCodeInput(["1", "2", "3", "4", "5", "6"], 2, "x").focus, 2);
});

test("applyCodeInput: a short paste spreads from the box it lands in and stops at the last box", () => {
  const edit = applyCodeInput(["", "", "", "", "", ""], 4, "123");
  assert.deepEqual(edit.digits, ["", "", "", "", "1", "2"]);
  assert.equal(edit.focus, 5);
});

test("parsePrice reads typed prices, Arabic digits and thousands marks", () => {
  assert.equal(parsePrice("35"), 35);
  assert.equal(parsePrice("1,200"), 1200);
  assert.equal(parsePrice("٣٥"), 35);
  assert.equal(parsePrice("12.5"), 12.5);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("abc"), null);
});

test("formatMoney keeps a half-typed value as typed and writes riyals as the product does", () => {
  assert.equal(formatMoney("", "en"), "");
  assert.equal(formatMoney("12.5", "en"), "QAR 12.50");
  assert.equal(formatMoney(449, "ar"), "449 ر.ق");
});

test("durationLabel writes minutes and hours in both languages", () => {
  assert.equal(durationLabel(40, "en"), "40 min");
  assert.equal(durationLabel(240, "en"), "4 h");
  assert.equal(durationLabel(90, "en"), "90 min");
  assert.equal(durationLabel(60, "en"), "60 min");
  assert.equal(durationLabel(150, "en"), "2 h 30 min");
  assert.equal(durationLabel(240, "ar"), "4 س");
});

test("summarizeServices counts the lines, the price range and the deposits", () => {
  const list = [
    { name: "A", minutes: 20, price: "35", deposit: "" },
    { name: "B", minutes: 240, price: "1,200", deposit: "300" },
    { name: "C", minutes: 60, price: "", deposit: "" }
  ];
  assert.deepEqual(summarizeServices(list), { count: 3, low: 35, high: 1200, withDeposit: 1 });
  assert.equal(summarizeServices([{ name: "A", minutes: 20, price: "", deposit: "" }]), null);
});

test("quoteTotal sums the priced lines; an included line adds nothing", () => {
  assert.equal(quoteTotal([{ product: "bookings", dirhams: 44900 }, { product: "chat", dirhams: 15000 }, { product: "shelf", dirhams: null }]), 59900);
  assert.equal(quoteTotal([]), 0);
});

test("the last service line cannot be removed", () => {
  assert.equal(canRemoveService(1), false);
  assert.equal(canRemoveService(6), true);
});
