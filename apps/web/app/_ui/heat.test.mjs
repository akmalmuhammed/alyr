// Tests for the HourHeat grid's levels. Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CLOSED, LEVELS, busiest, heatLevel, heatMax, nowRow } from "./heat.ts";

test("with no maximum the level is the count, capped at four", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 12].map((n) => heatLevel(n)), [0, 1, 2, 3, 4, 4, 4]);
});

test("closed hours, nothing and nonsense have no level", () => {
  assert.equal(heatLevel(CLOSED), 0);
  assert.equal(heatLevel(0), 0);
  assert.equal(heatLevel(Number.NaN), 0);
});

test("with a large maximum the counts spread over the four levels", () => {
  assert.deepEqual([1, 5, 10, 11, 20, 40].map((n) => heatLevel(n, 40)), [1, 1, 1, 2, 2, 4]);
  assert.equal(heatLevel(40, 40), LEVELS);
  assert.equal(heatLevel(1, 40), 1);
});

test("a small maximum behaves like no maximum", () => {
  assert.deepEqual([1, 2, 3].map((n) => heatLevel(n, 3)), [1, 2, 3]);
});

test("the busiest cell, and the largest count, ignore closed hours", () => {
  const cells = [[2, 2, CLOSED], [1, 3, 3], [0, 0, 1]];
  assert.equal(heatMax(cells), 3);
  assert.deepEqual(busiest(cells), { column: 1, row: 1, count: 3 });
  assert.equal(busiest([[0, 0], [CLOSED]]), null);
});

test("which hour row the now line is in", () => {
  const at = nowRow(7, 9 * 60 + 40);
  assert.equal(at.row, 2);
  assert.ok(Math.abs(at.within - 40 / 60) < 1e-9);
  assert.deepEqual(nowRow(7, 7 * 60), { row: 0, within: 0 });
});
