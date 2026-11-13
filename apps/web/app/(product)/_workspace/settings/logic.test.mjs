import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidEmail,
  isValidVerificationCode,
  resolveEffectiveTheme,
  formatCodeDigits,
  filterCustomerRequests,
  calculateDaysRemaining,
} from "./logic.ts";

test("isValidEmail checks standard email strings", () => {
  assert.ok(isValidEmail("hana@nuqta.qa"));
  assert.ok(isValidEmail("hana.saeed@nuqta.qa"));
  assert.ok(!isValidEmail("not-an-email"));
  assert.ok(!isValidEmail("hana@"));
  assert.ok(!isValidEmail("@nuqta.qa"));
  assert.ok(!isValidEmail(""));
});

test("isValidVerificationCode checks exactly 6 numeric digits", () => {
  assert.ok(isValidVerificationCode("123456"));
  assert.ok(isValidVerificationCode("730518"));
  assert.ok(isValidVerificationCode("481 920"));
  assert.ok(!isValidVerificationCode("12345"));
  assert.ok(!isValidVerificationCode("1234567"));
  assert.ok(!isValidVerificationCode("12345A"));
  assert.ok(!isValidVerificationCode(""));
});

test("resolveEffectiveTheme respects user choice and auto system mode", () => {
  assert.equal(resolveEffectiveTheme("light", true), "light");
  assert.equal(resolveEffectiveTheme("light", false), "light");
  assert.equal(resolveEffectiveTheme("dark", false), "dark");
  assert.equal(resolveEffectiveTheme("auto", true), "dark");
  assert.equal(resolveEffectiveTheme("auto", false), "light");
});

test("formatCodeDigits pads to 6 characters", () => {
  assert.deepEqual(formatCodeDigits("730"), ["7", "3", "0", " ", " ", " "]);
  assert.deepEqual(formatCodeDigits("730518"), ["7", "3", "0", "5", "1", "8"]);
  assert.deepEqual(formatCodeDigits(""), [" ", " ", " ", " ", " ", " "]);
});

test("filterCustomerRequests filters by status correctly", () => {
  const sample = [
    { id: "1", askedDate: "Mon 9 Nov", customerIdentifier: "+974 5555 0188", askedFor: "copy", state: "sent", handledBy: "Omar", note: "" },
    { id: "2", askedDate: "Thu 5 Nov", customerIdentifier: "Layla Farouk", askedFor: "forget", state: "waiting", handledBy: "Hana", note: "" },
    { id: "3", askedDate: "Mon 2 Nov", customerIdentifier: "Sara Haddad", askedFor: "no_messages", state: "done", handledBy: "By rule", note: "" },
  ];

  assert.equal(filterCustomerRequests(sample, "all").length, 3);
  assert.equal(filterCustomerRequests(sample, "waiting").length, 1);
  assert.equal(filterCustomerRequests(sample, "waiting")[0].customerIdentifier, "Layla Farouk");
  assert.equal(filterCustomerRequests(sample, "done").length, 2);
});

test("calculateDaysRemaining computes days until date", () => {
  const current = "2026-11-12T10:00:00Z";
  const target = "2026-11-19T10:00:00Z";
  assert.equal(calculateDaysRemaining(target, current), 7);
});
