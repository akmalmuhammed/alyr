// Tests for the Delivery sheet's pure helpers (ALY-150 part 2): days in plain words, a cut-off in
// 12 hours, a day turned on or off, and the money a shop types becoming whole dirhams exactly.
// Run with `node --test` from apps/web (Node 22.18 or newer reads the .ts files as they are).

import assert from "node:assert/strict";
import { test } from "node:test";
import { clock12, cutoffValue, daysLine, toggleDay } from "./deliveryForm.ts";
import { dirhamsToRiyals, riyalsToDirhams } from "./pricingMoney.ts";

const EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

test("days are listed in week order, and none or all seven mean every day", () => {
  assert.equal(daysLine([3, 0], EN, ", ", "Every day"), "Sun, Wed");
  assert.equal(daysLine([3, 0, 3], EN, ", ", "Every day"), "Sun, Wed");
  assert.equal(daysLine([], EN, ", ", "Every day"), "Every day");
  assert.equal(daysLine([0, 1, 2, 3, 4, 5, 6], EN, ", ", "Every day"), "Every day");
  assert.equal(daysLine([6, 1], AR, "، ", "كل يوم"), "الاثنين، السبت");
  assert.equal(daysLine([9, -1, 2], EN, ", ", "Every day"), "Tue");
});

test("a day is turned on and off, and the list stays in week order", () => {
  assert.deepEqual(toggleDay([], 3), [3]);
  assert.deepEqual(toggleDay([3], 0), [0, 3]);
  assert.deepEqual(toggleDay([0, 3], 3), [0]);
  assert.deepEqual(toggleDay([0], 0), []);
});

test("a cut-off reads in 12 hours in either language", () => {
  assert.equal(clock12("14:00", "AM", "PM"), "2:00 PM");
  assert.equal(clock12("14:00:00", "ص", "م"), "2:00 م");
  assert.equal(clock12("09:05", "AM", "PM"), "9:05 AM");
  assert.equal(clock12("00:30", "AM", "PM"), "12:30 AM");
  assert.equal(clock12("12:00", "AM", "PM"), "12:00 PM");
  assert.equal(clock12("24:00", "AM", "PM"), "24:00");
  assert.equal(clock12("later", "AM", "PM"), "later");
});

test("a cut-off typed or picked goes to the API as HH:MM, or as nothing", () => {
  assert.equal(cutoffValue("14:00"), "14:00");
  assert.equal(cutoffValue("14:00:00"), "14:00");
  assert.equal(cutoffValue("  "), null);
  assert.equal(cutoffValue("2pm"), null);
});

test("a fee typed in riyals becomes whole dirhams without float arithmetic", () => {
  assert.equal(riyalsToDirhams("15"), 1500);
  assert.equal(riyalsToDirhams("7.5"), 750);
  assert.equal(riyalsToDirhams("7.50"), 750);
  assert.equal(riyalsToDirhams("0.29"), 29);
  assert.equal(riyalsToDirhams("1.15"), 115);
  assert.equal(riyalsToDirhams("0"), 0);
  assert.equal(riyalsToDirhams("١٥٫٥"), 1550);
  assert.equal(riyalsToDirhams("15.555"), null);
  assert.equal(riyalsToDirhams("-3"), null);
  assert.equal(dirhamsToRiyals(1500), "15");
  assert.equal(dirhamsToRiyals(750), "7.50");
  assert.equal(dirhamsToRiyals(0), "0");
  assert.equal(dirhamsToRiyals(null), "");
});
