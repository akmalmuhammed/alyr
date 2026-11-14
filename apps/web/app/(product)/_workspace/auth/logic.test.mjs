import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDigits, sanitizeCode, isValidCode, isValidEmail, formatMoney, formatCountdown } from "./logic.ts";

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
  assert.equal(formatMoney(500, "en"), "QAR 500");
  assert.equal(formatMoney("1,200", "en"), "QAR 1,200");
  assert.equal(formatMoney(500, "ar"), "500\u00a0ر.ق");
  assert.equal(formatMoney("1,200", "ar"), "1,200\u00a0ر.ق");
});

test("formatCountdown formats mm:ss", () => {
  assert.equal(formatCountdown(42), "0:42");
  assert.equal(formatCountdown(65), "1:05");
  assert.equal(formatCountdown(0), "0:00");
});
