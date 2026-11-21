import test from "node:test";
import assert from "node:assert/strict";
import {
  closeSchedule, formatCodeDigits, isValidEmail, isValidVerificationCode, mayClose, mayDownload, normalizeCode,
  refusalKey, resolveEffectiveTheme, sameEmail, themeAttribute, themeFromStored,
} from "./logic.ts";

test("isValidEmail checks standard email strings", () => {
  assert.ok(isValidEmail("hana@nuqta.qa"));
  assert.ok(isValidEmail("hana.saeed@nuqta.qa"));
  assert.ok(!isValidEmail("not-an-email"));
  assert.ok(!isValidEmail("hana@"));
  assert.ok(!isValidEmail("@nuqta.qa"));
  assert.ok(!isValidEmail(""));
});

test("sameEmail ignores case and spaces", () => {
  assert.ok(sameEmail("Hana@Nuqta.qa ", "hana@nuqta.qa"));
  assert.ok(!sameEmail("hana@nuqta.qa", "hana.saeed@nuqta.qa"));
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

test("normalizeCode keeps Western digits, turns Eastern ones into them, and stops at six", () => {
  assert.equal(normalizeCode("730 518"), "730518");
  assert.equal(normalizeCode("٧٣٠٥١٨"), "730518");
  assert.equal(normalizeCode("۷۳۰۵۱۸"), "730518");
  assert.equal(normalizeCode("73a0-5"), "7305");
  assert.equal(normalizeCode("12345678"), "123456");
  assert.equal(normalizeCode(""), "");
});

test("formatCodeDigits pads to 6 characters", () => {
  assert.deepEqual(formatCodeDigits("730"), ["7", "3", "0", " ", " ", " "]);
  assert.deepEqual(formatCodeDigits("730518"), ["7", "3", "0", "5", "1", "8"]);
  assert.deepEqual(formatCodeDigits(""), [" ", " ", " ", " ", " ", " "]);
});

test("closeSchedule is seven days' notice, then 60 days (D-082, D-116)", () => {
  assert.deepEqual(closeSchedule("2026-11-12"), { noticeEnds: "2026-11-19", eraseOn: "2027-01-18" });
  // Across a month end and a year end.
  assert.deepEqual(closeSchedule("2026-12-28"), { noticeEnds: "2027-01-04", eraseOn: "2027-03-05" });
  assert.deepEqual(closeSchedule("2026-11-12", 0, 0), { noticeEnds: "2026-11-12", eraseOn: "2026-11-12" });
});

test("only an owner may download or close; the server's word counts too", () => {
  assert.ok(mayDownload("owner", true));
  assert.ok(!mayDownload("owner", false));
  assert.ok(!mayDownload("admin", true));
  assert.ok(!mayDownload("agent", true));
  assert.ok(mayClose("owner"));
  assert.ok(!mayClose("admin"));
  assert.ok(!mayClose("agent"));
});

test("refusalKey maps the account routes' codes, offline, and anything else", () => {
  for (const code of ["demo", "invalid", "same", "staff", "too_many", "code", "taken"]) {
    assert.equal(refusalKey({ status: 422, code }), code);
  }
  assert.equal(refusalKey({ status: 0, code: "offline" }), "offline");
  assert.equal(refusalKey({ status: 500, code: "boom" }), "failed");
  assert.equal(refusalKey(new Error("x")), "failed");
  assert.equal(refusalKey(null), "failed");
});

test("the theme is kept on this device: light, dark, or nothing for the device", () => {
  assert.equal(resolveEffectiveTheme("light", true), "light");
  assert.equal(resolveEffectiveTheme("dark", false), "dark");
  assert.equal(resolveEffectiveTheme("auto", true), "dark");
  assert.equal(resolveEffectiveTheme("auto", false), "light");
  assert.equal(themeAttribute("light"), "light");
  assert.equal(themeAttribute("dark"), "dark");
  assert.equal(themeAttribute("auto"), null);
  assert.equal(themeFromStored("dark"), "dark");
  assert.equal(themeFromStored("light"), "light");
  assert.equal(themeFromStored(null), "auto");
  assert.equal(themeFromStored("sepia"), "auto");
});
