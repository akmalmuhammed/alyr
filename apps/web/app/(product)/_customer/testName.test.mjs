// The owner's test customer, as a customer page names them (run with `pnpm test`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { customerName } from "./testName.ts";

test("an Arabic page names the owner's test customer in Arabic", () => {
  assert.equal(customerName("نورة (test)", "ar"), "نورة (تجريبي)");
  assert.equal(customerName("Noura (test)", "ar"), "Noura (تجريبي)");
});

test("an English page, and every other name, is left as it is", () => {
  assert.equal(customerName("Noura (test)", "en"), "Noura (test)");
  assert.equal(customerName("Noura", "ar"), "Noura");
  assert.equal(customerName("Test Person (tester)", "ar"), "Test Person (tester)");
  assert.equal(customerName("", "ar"), "");
});
