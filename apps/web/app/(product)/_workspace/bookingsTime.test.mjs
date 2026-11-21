// Tests for the Bookings day view's times and the deposit rule's words (ALY-27, D-084): a time
// typed on the shop's clock becomes the right instant whatever the browser's own zone, days move
// across month ends, and the rule reads as the shop set it. Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { termsSentence } from "../_customer/deposit.ts";
import { nowIn, shift, zonedIso } from "./bookingsTime.ts";

test("a time on the shop's clock in Doha is three hours ahead of UTC", () => {
  assert.equal(zonedIso("2026-10-30", "17:00", "Asia/Qatar"), "2026-10-30T14:00:00.000Z");
  assert.equal(zonedIso("2026-10-30", "00:30", "Asia/Qatar"), "2026-10-29T21:30:00.000Z");
});

test("a zone with summer time is read on the day itself", () => {
  assert.equal(zonedIso("2026-07-01", "09:00", "Europe/London"), "2026-07-01T08:00:00.000Z");
  assert.equal(zonedIso("2026-12-01", "09:00", "Europe/London"), "2026-12-01T09:00:00.000Z");
});

test("days move across the end of a month and a year", () => {
  assert.equal(shift("2026-10-31", 1), "2026-11-01");
  assert.equal(shift("2027-01-01", -1), "2026-12-31");
});

test("now in the shop's zone is a date and a time on five minutes", () => {
  const { day, time } = nowIn("Asia/Qatar");
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(time, /^\d{2}:[0-5][05]$/);
});

test("the deposit rule reads as the shop set it, in both languages", () => {
  const keep = { no_show: "keep", late_cancel: "keep", cancel_hours: 24 };
  assert.equal(termsSentence(keep, "en"),
    "If you do not come, or cancel less than 24 hours before, the shop keeps the deposit. Cancel 24 hours or more before and it is refunded.");
  assert.match(termsSentence({ ...keep, no_show: "refund" }, "en"), /If you do not come, it is refunded/);
  assert.match(termsSentence({ no_show: "refund", late_cancel: "refund", cancel_hours: 12 }, "en"), /refunded if you cancel or do not come/);
  const ar = termsSentence(keep, "ar");
  assert.match(ar, /يحتفظ المحل بالعربون/);
  assert.doesNotMatch(ar, /[٠-٩]/, "Western digits in Arabic");
});

test("the cancel window's hours agree with their noun in Arabic and English", () => {
  const sentence = (hours, lang) => termsSentence({ no_show: "keep", late_cancel: "keep", cancel_hours: hours }, lang);
  // after «من» and «بـ» the dual is «ساعتين», and 3 to 10 take the plural
  assert.match(sentence(1, "ar"), /بأقل من ساعة واحدة، .* بساعة واحدة أو أكثر/);
  assert.match(sentence(2, "ar"), /بأقل من ساعتين، .* بساعتين أو أكثر/);
  assert.match(sentence(3, "ar"), /بأقل من 3 ساعات، .* بـ3 ساعات أو أكثر/);
  assert.match(sentence(10, "ar"), /بأقل من 10 ساعات/);
  assert.match(sentence(11, "ar"), /بأقل من 11 ساعة،/);
  assert.match(sentence(24, "ar"), /بأقل من 24 ساعة، .* بـ24 ساعة أو أكثر/);
  assert.doesNotMatch(sentence(3, "ar"), /3 ساعة/);
  assert.match(sentence(1, "en"), /less than 1 hour before/);
  assert.match(sentence(1, "en"), /Cancel 1 hour or more before/);
  assert.match(sentence(6, "en"), /less than 6 hours before/);
});
