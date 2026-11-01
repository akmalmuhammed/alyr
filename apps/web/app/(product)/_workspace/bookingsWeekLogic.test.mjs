// Tests for the opening-hours week and the days off (ALY-259, D-141): a week becomes seven days
// and back, a week is checked on the right day, a break is two periods, and a day off is read
// as a range of dates. Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { addSpan, checkClosure, checkWeek, periodsFrom, rangeText, sameEveryDay, weekFrom } from "./bookingsWeekLogic.ts";

const salon = [
  ...[0, 1, 2, 3, 4, 6].map((weekday) => ({ weekday, opens: "10:00", closes: "22:00" })),
  { weekday: 5, opens: "14:00", closes: "22:00" },
];

test("the week the API holds is seven days, Sunday first, and goes back unchanged", () => {
  const week = weekFrom(salon);
  assert.equal(week.length, 7);
  assert.ok(week.every((d) => d.on));
  assert.deepEqual(week[5].spans, [{ opens: "14:00", closes: "22:00" }]);
  assert.deepEqual(periodsFrom(week).sort((a, b) => a.weekday - b.weekday), salon.sort((a, b) => a.weekday - b.weekday));
});

test("a day with no hours is off and sends nothing, but keeps a period ready to switch on", () => {
  const week = weekFrom(salon.filter((p) => p.weekday !== 2));
  assert.equal(week[2].on, false);
  assert.equal(week[2].spans.length, 1);
  assert.equal(periodsFrom(week).some((p) => p.weekday === 2), false);
});

test("a break in the middle of the day is two periods, in the order they start", () => {
  const week = weekFrom([
    { weekday: 1, opens: "16:00", closes: "22:00" },
    { weekday: 1, opens: "09:00", closes: "13:00" },
  ]);
  assert.deepEqual(week[1].spans, [{ opens: "09:00", closes: "13:00" }, { opens: "16:00", closes: "22:00" }]);
  assert.equal(checkWeek(week), null);
});

test("a week is refused on the day that is wrong, and why", () => {
  const week = weekFrom(salon);
  week[3] = { on: true, spans: [{ opens: "12:00", closes: "09:00" }] };
  assert.deepEqual(checkWeek(week), { weekday: 3, code: "bad_hours" });
  week[3] = { on: true, spans: [{ opens: "09:00", closes: "13:00" }, { opens: "12:00", closes: "18:00" }] };
  assert.deepEqual(checkWeek(week), { weekday: 3, code: "bad_hours_overlap" });
  week[3] = { on: true, spans: [{ opens: "", closes: "18:00" }] };
  assert.deepEqual(checkWeek(week), { weekday: 3, code: "no_time" });
  // A day that is off is not checked, whatever is left in its boxes.
  week[3] = { on: false, spans: [{ opens: "12:00", closes: "09:00" }] };
  assert.equal(checkWeek(week), null);
});

test("two periods that touch are one after the other, not overlapping", () => {
  const week = weekFrom(salon);
  week[0] = { on: true, spans: [{ opens: "09:00", closes: "13:00" }, { opens: "13:00", closes: "18:00" }] };
  assert.equal(checkWeek(week), null);
});

test("the same hours every day copy the first open day", () => {
  const week = weekFrom(salon.filter((p) => p.weekday !== 0));
  const same = sameEveryDay(week);
  assert.ok(same.every((d) => d.on && d.spans[0].opens === "10:00" && d.spans[0].closes === "22:00"));
  same[1].spans[0].opens = "08:00";
  assert.equal(same[2].spans[0].opens, "10:00", "the days do not share one object");
});

test("adding a period starts an hour after the last one closes", () => {
  const added = addSpan({ on: true, spans: [{ opens: "09:00", closes: "13:00" }] });
  assert.deepEqual(added.spans[1], { opens: "14:00", closes: "18:00" });
  const late = addSpan({ on: true, spans: [{ opens: "10:00", closes: "22:30" }] });
  assert.deepEqual(late.spans[1], { opens: "10:00", closes: "20:00" }, "no room left: the usual hours");
  assert.equal(checkWeek([{ on: true, spans: addSpan({ on: true, spans: [{ opens: "09:00", closes: "13:00" }] }).spans }]), null);
});

test("a day off needs two dates, in order, not already over, within a year", () => {
  const today = "2026-10-31";
  assert.equal(checkClosure("2026-11-01", "2026-11-05", today), null);
  assert.equal(checkClosure("2026-11-01", "2026-11-01", today), null, "one day is first and last the same");
  assert.equal(checkClosure("", "2026-11-05", today), "closure_dates");
  assert.equal(checkClosure("2026-11-05", "2026-11-01", today), "bad_closure");
  assert.equal(checkClosure("2026-10-20", "2026-10-25", today), "closure_past");
  assert.equal(checkClosure("2026-10-30", "2026-11-02", today), null, "one that has begun and runs on");
  assert.equal(checkClosure("2026-11-01", "2027-11-02", today), "bad_closure");
});

test("a range of days reads as a person would write it, in both languages", () => {
  assert.equal(rangeText("2026-11-01", "2026-11-05", "en", "2026-10-31"), "1–5 Nov");
  assert.equal(rangeText("2026-11-01", "2026-11-01", "en", "2026-10-31"), "1 Nov");
  assert.match(rangeText("2026-12-30", "2027-01-02", "en", "2026-10-31"), /2027/);
  const ar = rangeText("2026-11-01", "2026-11-05", "ar", "2026-10-31");
  assert.doesNotMatch(ar, /[٠-٩]/, "Western digits in Arabic");
  assert.match(ar, /1/);
});
