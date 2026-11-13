// Tests for the Table's pure logic: sorting, selection, row focus and paging.
// Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ariaSort, moveRowFocus, nextSort, pageRange, pruneSelection, selectRange, selectionState, skeletonWidth, sortRows, toggleAll, toggleOne } from "./tableLogic.ts";

test("a click on a header runs ascending, descending, off; another column starts ascending", () => {
  assert.deepEqual(nextSort(null, "total"), { key: "total", dir: "asc" });
  assert.deepEqual(nextSort({ key: "total", dir: "asc" }, "total"), { key: "total", dir: "desc" });
  assert.equal(nextSort({ key: "total", dir: "desc" }, "total"), null);
  assert.deepEqual(nextSort({ key: "total", dir: "desc" }, "customer"), { key: "customer", dir: "asc" });
});

test("aria-sort says which column is sorted and which way", () => {
  assert.equal(ariaSort({ key: "a", dir: "asc" }, "a"), "ascending");
  assert.equal(ariaSort({ key: "a", dir: "desc" }, "a"), "descending");
  assert.equal(ariaSort({ key: "a", dir: "desc" }, "b"), "none");
  assert.equal(ariaSort(null, "a"), "none");
});

test("numbers sort as numbers and text as a person reads it", () => {
  const rows = [{ n: "Order 10" }, { n: "order 9" }, { n: "Order 2" }];
  assert.deepEqual(sortRows(rows, (r) => r.n, { key: "n", dir: "asc" }).map((r) => r.n), ["Order 2", "order 9", "Order 10"]);
  const totals = [{ t: 110 }, { t: 9 }, { t: 2730 }];
  assert.deepEqual(sortRows(totals, (r) => r.t, { key: "t", dir: "desc" }).map((r) => r.t), [2730, 110, 9]);
});

test("empty values go last in both directions, and equal rows keep their order", () => {
  const rows = [{ id: 1, v: null }, { id: 2, v: 5 }, { id: 3, v: 5 }, { id: 4, v: 1 }];
  assert.deepEqual(sortRows(rows, (r) => r.v, { key: "v", dir: "asc" }).map((r) => r.id), [4, 2, 3, 1]);
  assert.deepEqual(sortRows(rows, (r) => r.v, { key: "v", dir: "desc" }).map((r) => r.id), [2, 3, 4, 1]);
  assert.deepEqual(sortRows(rows, (r) => r.v, null).map((r) => r.id), [1, 2, 3, 4]);
});

test("dates and booleans sort", () => {
  const rows = [{ d: new Date("2026-11-12") }, { d: new Date("2026-11-01") }];
  assert.equal(sortRows(rows, (r) => r.d, { key: "d", dir: "asc" })[0].d.getUTCDate(), 1);
  assert.deepEqual(sortRows([{ b: true }, { b: false }], (r) => r.b, { key: "b", dir: "asc" }).map((r) => r.b), [false, true]);
});

test("selection state, toggling and the header checkbox", () => {
  const keys = ["a", "b", "c"];
  assert.equal(selectionState(new Set(), keys), "none");
  assert.equal(selectionState(new Set(["a"]), keys), "some");
  assert.equal(selectionState(new Set(keys), keys), "all");
  assert.equal(selectionState(new Set(["a"]), []), "none");
  assert.deepEqual([...toggleOne(new Set(["a"]), "b")], ["a", "b"]);
  assert.deepEqual([...toggleOne(new Set(["a"]), "a")], []);
  assert.deepEqual([...toggleAll(new Set(["a"]), keys)], ["a", "b", "c"]);
  assert.deepEqual([...toggleAll(new Set(keys), keys)], []);
  // rows selected on another page stay selected when this page's header is cleared
  assert.deepEqual([...toggleAll(new Set(["a", "b", "c", "z"]), keys)], ["z"]);
});

test("shift-click selects or clears the whole range", () => {
  const keys = ["a", "b", "c", "d", "e"];
  assert.deepEqual([...selectRange(new Set(["a"]), keys, "a", "d", true)].sort(), ["a", "b", "c", "d"]);
  assert.deepEqual([...selectRange(new Set(keys), keys, "d", "b", false)].sort(), ["a", "e"]);
  assert.deepEqual([...selectRange(new Set(), keys, "zz", "c", true)], ["c"]);
});

test("rows that are gone are forgotten", () => {
  assert.deepEqual([...pruneSelection(new Set(["a", "x"]), ["a", "b"])], ["a"]);
});

test("keyboard row focus", () => {
  assert.equal(moveRowFocus(0, 5, "ArrowDown"), 1);
  assert.equal(moveRowFocus(4, 5, "ArrowDown"), 4);
  assert.equal(moveRowFocus(0, 5, "ArrowUp"), 0);
  assert.equal(moveRowFocus(3, 5, "Home"), 0);
  assert.equal(moveRowFocus(1, 5, "End"), 4);
  assert.equal(moveRowFocus(0, 30, "PageDown"), 8);
  assert.equal(moveRowFocus(2, 30, "PageUp"), 0);
  assert.equal(moveRowFocus(0, 5, "a"), null);
  assert.equal(moveRowFocus(0, 0, "ArrowDown"), null);
});

test("the pager's range", () => {
  assert.deepEqual(pageRange(1, 25, 212), { from: 1, to: 25, pages: 9 });
  assert.deepEqual(pageRange(9, 25, 212), { from: 201, to: 212, pages: 9 });
  assert.deepEqual(pageRange(99, 25, 212), { from: 201, to: 212, pages: 9 });
  assert.deepEqual(pageRange(1, 25, 0), { from: 0, to: 0, pages: 1 });
  assert.deepEqual(pageRange(1, 25, 14), { from: 1, to: 14, pages: 1 });
});

test("skeleton widths are steady and within the cell", () => {
  for (let r = 0; r < 6; r += 1) for (let c = 0; c < 8; c += 1) {
    const w = skeletonWidth(r, c);
    assert.ok(w >= 40 && w <= 90);
    assert.equal(w, skeletonWidth(r, c));
  }
});
