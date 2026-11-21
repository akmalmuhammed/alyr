// Tests for the chart scales: points, fractions, arcs and stack shares.
// Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { areaPolygon, barFractions, extent, percent, plotPoints, pointsAttribute, ringFraction, stackShares } from "./chartScale.ts";

test("the extent of a series, with an optional floor", () => {
  assert.deepEqual(extent([3, 9, 5]), { min: 3, max: 9 });
  assert.deepEqual(extent([3, 9, 5], 0), { min: 0, max: 9 });
  assert.deepEqual(extent([4, 4]), { min: 4, max: 5 });
  assert.deepEqual(extent([]), { min: 0, max: 1 });
  assert.deepEqual(extent([Number.NaN, 2, 6]), { min: 2, max: 6 });
});

test("points run left to right and larger is higher", () => {
  const points = plotPoints([0, 5, 10], 100, 40);
  assert.deepEqual(points, [{ x: 0, y: 40 }, { x: 50, y: 20 }, { x: 100, y: 0 }]);
});

test("padding keeps the line off the edges", () => {
  const points = plotPoints([0, 10], 100, 40, { pad: 4 });
  assert.equal(points[0].y, 36);
  assert.equal(points[1].y, 4);
});

test("a fixed floor and ceiling clamp what falls outside", () => {
  const points = plotPoints([-5, 5, 99], 100, 10, { min: 0, max: 10 });
  assert.deepEqual(points.map((p) => p.y), [10, 5, 0]);
});

test("a single value sits in the middle, a flat series sits on one line", () => {
  assert.deepEqual(plotPoints([7], 100, 40), [{ x: 50, y: 40 }]);
  const flat = plotPoints([3, 3, 3], 90, 30);
  assert.equal(new Set(flat.map((p) => p.y)).size, 1);
});

test("the polyline and the fill under it", () => {
  const points = plotPoints([0, 10], 10, 10);
  assert.equal(pointsAttribute(points), "0,10 10,0");
  assert.equal(areaPolygon(points, 10), "0,10 0,10 10,0 10,10");
  assert.equal(areaPolygon([], 10), "");
});

test("bars are shares of the largest, and a small value is still visible", () => {
  assert.deepEqual(barFractions([5, 10, 0]), [0.5, 1, 0]);
  assert.equal(barFractions([1, 100])[0], 0.04);
  assert.deepEqual(barFractions([0, 0]), [0, 0]);
  assert.deepEqual(barFractions([]), []);
});

test("a ring's fraction is clamped", () => {
  assert.equal(ringFraction(84, 100), 0.84);
  assert.equal(ringFraction(150, 100), 1);
  assert.equal(ringFraction(-3, 100), 0);
  assert.equal(ringFraction(1, 0), 0);
  assert.equal(ringFraction(Number.NaN), 0);
});

test("stack parts become shares, and empty parts drop out", () => {
  const shares = stackShares([{ value: 3, tone: "ok" }, { value: 0, tone: "bad" }, { value: 1, tone: "warn" }]);
  assert.deepEqual(shares.map((s) => [s.tone, s.share, s.index]), [["ok", 0.75, 0], ["warn", 0.25, 2]]);
  assert.deepEqual(stackShares([{ value: 0, tone: "ok" }]), []);
});

test("a fraction as a percentage", () => {
  assert.equal(percent(0.5), "50%");
  assert.equal(percent(1.4), "100%");
  assert.equal(percent(-1), "0%");
  assert.equal(percent(0.12345), "12.35%");
});
