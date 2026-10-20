// Tests for the Discounts form's pure helpers (ALY-150): riyals typed become whole dirhams
// without float arithmetic, percentages stay exact text, codes are shown the way the API keeps
// them, and a time from the API becomes the shop's wall clock for a date-time input. Run with
// `node --test` from apps/web (Node 22.18 or newer reads the .ts files as they are).

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codeOk, dirhamsToRiyals, percentText, riyalsToDirhams, shownCode, toLocalInput, wholeNumber,
} from "./pricingMoney.ts";

test("riyals become dirhams exactly, where a float would not", () => {
  assert.equal(riyalsToDirhams("1.15"), 115); // 1.15 * 100 === 114.99999999999999
  assert.equal(riyalsToDirhams("0.29"), 29); // 0.29 * 100 === 28.999999999999996
  assert.equal(riyalsToDirhams("4.35"), 435);
  assert.equal(riyalsToDirhams("12"), 1200);
  assert.equal(riyalsToDirhams("12.5"), 1250);
  assert.equal(riyalsToDirhams("12."), 1200);
  assert.equal(riyalsToDirhams("0"), 0);
});

test("anything that is not an amount is refused", () => {
  for (const bad of ["", " ", "abc", "1.234", "-5", "1,2,3", "1e3", "QAR 5"]) assert.equal(riyalsToDirhams(bad), null, bad);
});

test("Arabic digits and separators are read", () => {
  assert.equal(riyalsToDirhams("١٢٫٥"), 1250);
  assert.equal(riyalsToDirhams("۱۲"), 1200);
  assert.equal(riyalsToDirhams("12,50"), 1250);
});

test("dirhams go back to riyals for an input", () => {
  assert.equal(dirhamsToRiyals(1250), "12.50");
  assert.equal(dirhamsToRiyals(1200), "12");
  assert.equal(dirhamsToRiyals(5), "0.05");
  assert.equal(dirhamsToRiyals(0), "0");
  assert.equal(dirhamsToRiyals(null), "");
  for (const value of [0, 1, 29, 99, 100, 115, 1250, 99999]) assert.equal(riyalsToDirhams(dirhamsToRiyals(value)), value);
});

test("a percentage is more than 0, at most 100, with up to three decimals", () => {
  assert.equal(percentText("10"), "10");
  assert.equal(percentText("12.5%"), "12.5");
  assert.equal(percentText("100"), "100");
  assert.equal(percentText("0.001"), "0.001");
  assert.equal(percentText("٢٠"), "20");
  for (const bad of ["0", "0.000", "100.1", "101", "12.3456", "-1", "ten", ""]) assert.equal(percentText(bad), null, bad);
});

test("whole numbers have a floor of 1 and a ceiling", () => {
  assert.equal(wholeNumber("3", 99), 3);
  assert.equal(wholeNumber("٣", 99), 3);
  for (const bad of ["0", "100", "1.5", "", "-1", "x"]) assert.equal(wholeNumber(bad, 99), null, bad);
});

test("a code is shown in capitals with no spaces, and checked for shape", () => {
  assert.equal(shownCode(" ramadan 10 "), "RAMADAN10");
  assert.equal(shownCode("eid-25"), "EID-25");
  assert.equal(shownCode("رمضان ١٠"), "رمضان10");
  assert.ok(codeOk("RAMADAN10"));
  assert.ok(codeOk("EID-25"));
  assert.ok(codeOk("رمضان10"));
  for (const bad of ["AB", "A-", "--", "TWENTY FIVE", "A".repeat(25), "!!!"]) assert.ok(!codeOk(bad), bad);
});

test("a time from the API is the shop's wall clock, Doha, whatever the device says", () => {
  assert.equal(toLocalInput("2026-10-20T06:00:00+00:00"), "2026-10-20T09:00");
  assert.equal(toLocalInput("2026-10-20T23:30:00+03:00"), "2026-10-20T23:30");
  assert.equal(toLocalInput("2026-10-20T21:30:00+00:00"), "2026-10-21T00:30");
  assert.equal(toLocalInput(null), "");
});
