// Tests for the order buttons (ALY-259, D-143). Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { reorder } from "./bookingsReorder.ts";

test("one step up or down swaps with the neighbour", () => {
  assert.deepEqual(reorder(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
  assert.deepEqual(reorder(["a", "b", "c"], "b", "down"), ["a", "c", "b"]);
});

test("the first cannot go up and the last cannot go down", () => {
  const ids = ["a", "b", "c"];
  assert.equal(reorder(ids, "a", "up"), ids);
  assert.equal(reorder(ids, "c", "down"), ids);
});

test("an id that is not there changes nothing, and the list is never changed in place", () => {
  const ids = ["a", "b"];
  assert.equal(reorder(ids, "z", "up"), ids);
  const moved = reorder(ids, "a", "down");
  assert.deepEqual(ids, ["a", "b"]);
  assert.deepEqual(moved, ["b", "a"]);
});
