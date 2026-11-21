// Tests for the CalendarGrid's maths: times, positions, hour ticks, the now line, overlapping
// bookings and free gaps. Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPACT_MINUTES, coveredMinutes, dayWindow, freeGaps, hourTicks, isCompact, layoutLanes, nowOffset, placeSpan, toClock, toMinutes } from "./calendarLayout.ts";

const win = dayWindow("07:00", "22:00");

test("times read and write", () => {
  assert.equal(toMinutes("09:40"), 580);
  assert.equal(toMinutes("9:40"), 580);
  assert.equal(toMinutes("24:00"), 1440);
  assert.ok(Number.isNaN(toMinutes("25:00")));
  assert.ok(Number.isNaN(toMinutes("09:60")));
  assert.ok(Number.isNaN(toMinutes("noon")));
  assert.equal(toClock(580), "09:40");
  assert.equal(toClock(1440), "24:00");
  assert.equal(toClock(toMinutes("07:05")), "07:05");
});

test("a day window must run forwards", () => {
  assert.deepEqual(win, { start: 420, end: 1320, length: 900 });
  assert.throws(() => dayWindow("22:00", "07:00"));
  assert.throws(() => dayWindow("07:00", "later"));
});

test("a booking is placed by its offset from the top and its length, clipped to the window", () => {
  assert.deepEqual(placeSpan(win, { start: toMinutes("07:20"), end: toMinutes("08:00") }), { offset: 20, length: 40 });
  assert.deepEqual(placeSpan(win, { start: toMinutes("06:30"), end: toMinutes("07:30") }), { offset: 0, length: 30 });
  assert.deepEqual(placeSpan(win, { start: toMinutes("21:30"), end: toMinutes("23:00") }), { offset: 870, length: 30 });
  assert.equal(placeSpan(win, { start: toMinutes("05:00"), end: toMinutes("06:00") }), null);
  assert.equal(placeSpan(win, { start: toMinutes("22:00"), end: toMinutes("23:00") }), null);
});

test("hour lines run from the first whole hour to the end", () => {
  assert.deepEqual(hourTicks(win).slice(0, 3), [7, 8, 9]);
  assert.equal(hourTicks(win).length, 16);
  assert.deepEqual(hourTicks(dayWindow("07:30", "10:00")), [8, 9, 10]);
});

test("the now line", () => {
  assert.equal(nowOffset(win, toMinutes("09:40")), 160);
  assert.equal(nowOffset(win, toMinutes("06:00")), null);
  assert.equal(nowOffset(win, toMinutes("23:00")), null);
});

test("a short booking shows on one line", () => {
  assert.equal(isCompact(COMPACT_MINUTES - 1), true);
  assert.equal(isCompact(COMPACT_MINUTES), false);
  assert.equal(isCompact(20), true);
  assert.equal(isCompact(40), false);
});

test("bookings that do not overlap take the whole column", () => {
  const lanes = layoutLanes([
    { id: "a", start: 420, end: 480 },
    { id: "b", start: 480, end: 540 },
    { id: "c", start: 600, end: 660 },
  ]);
  for (const id of ["a", "b", "c"]) assert.deepEqual(lanes.get(id), { lane: 0, lanes: 1 });
});

test("bookings that overlap sit side by side and share the width", () => {
  const lanes = layoutLanes([
    { id: "a", start: 420, end: 540 },
    { id: "b", start: 450, end: 500 },
    { id: "c", start: 520, end: 560 },
    { id: "z", start: 700, end: 760 },
  ]);
  assert.deepEqual(lanes.get("a"), { lane: 0, lanes: 2 });
  assert.deepEqual(lanes.get("b"), { lane: 1, lanes: 2 });
  assert.deepEqual(lanes.get("c"), { lane: 1, lanes: 2 });
  assert.deepEqual(lanes.get("z"), { lane: 0, lanes: 1 });
});

test("three at once make three lanes; a later one reuses a freed lane", () => {
  const lanes = layoutLanes([
    { id: "a", start: 0, end: 100 },
    { id: "b", start: 10, end: 50 },
    { id: "c", start: 20, end: 60 },
    { id: "d", start: 55, end: 90 },
  ]);
  assert.deepEqual([lanes.get("a").lanes, lanes.get("b").lanes, lanes.get("c").lanes, lanes.get("d").lanes], [3, 3, 3, 3]);
  assert.equal(lanes.get("d").lane, 1);
});

test("free gaps are the stretches nothing takes, long enough to offer", () => {
  const taken = [
    { start: toMinutes("07:20"), end: toMinutes("08:00") },
    { start: toMinutes("10:00"), end: toMinutes("10:40") },
    { start: toMinutes("17:00"), end: toMinutes("17:40") },
  ];
  const gaps = freeGaps(win, taken, 30);
  assert.deepEqual(gaps.map((g) => [toClock(g.start), toClock(g.end)]), [
    // 07:00-07:20 is only 20 minutes: not offered
    ["08:00", "10:00"],
    ["10:40", "17:00"],
    ["17:40", "22:00"],
  ]);
});

test("a gap shorter than the minimum is left out, and overlapping or off-day parts are handled", () => {
  const gaps = freeGaps(win, [{ start: toMinutes("07:10"), end: toMinutes("09:00") }, { start: toMinutes("08:00"), end: toMinutes("09:30") }, { start: toMinutes("20:00"), end: toMinutes("22:00") }], 30);
  assert.deepEqual(gaps.map((g) => [toClock(g.start), toClock(g.end)]), [["09:30", "20:00"]]);
  // the window clips everything; a person who works 09:00-18:00 is only offered inside those hours
  const inHours = freeGaps(win, [{ start: toMinutes("13:00"), end: toMinutes("14:00") }], 30, { start: toMinutes("09:00"), end: toMinutes("18:00") });
  assert.deepEqual(inHours.map((g) => [toClock(g.start), toClock(g.end)]), [["09:00", "13:00"], ["14:00", "18:00"]]);
  assert.deepEqual(freeGaps(win, [], 30, { start: toMinutes("23:00"), end: toMinutes("23:30") }), []);
});

test("minutes covered count overlaps once", () => {
  assert.equal(coveredMinutes([{ start: 0, end: 60 }, { start: 30, end: 90 }, { start: 200, end: 230 }]), 120);
  assert.equal(coveredMinutes([]), 0);
});
