// The workspace home gives one count of what is left to go live (CJ-24 of the go-live audit).
// Run with `pnpm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { STEPS_LEFT, checksLeft, withoutSetupRow } from "./goLive.ts";

const CHECKS = [
  { key: "content", status: "done" }, { key: "test", status: "todo" }, { key: "price", status: "todo" },
  { key: "paid", status: "blocked" }, { key: "whatsapp", status: "todo" }, { key: "terms", status: "done" },
];

test("what is left is every check that is not done, and nothing when there are none", () => {
  assert.deepEqual(checksLeft(CHECKS).map((c) => c.key), ["test", "price", "paid", "whatsapp"]);
  assert.deepEqual(checksLeft([]), []);
  assert.deepEqual(checksLeft(null), []);
  assert.deepEqual(checksLeft(undefined), []);
});

test("the count the banner says is the number of steps it lists", () => {
  const left = checksLeft(CHECKS);
  assert.equal(STEPS_LEFT.en(left.length), "4 steps left");
  assert.equal(STEPS_LEFT.en(1), "1 step left");
});

test("Arabic counts one, two, three to ten and eleven or more as Arabic does", () => {
  assert.equal(STEPS_LEFT.ar(1), "خطوة واحدة متبقية");
  assert.equal(STEPS_LEFT.ar(2), "خطوتان متبقيتان");
  assert.equal(STEPS_LEFT.ar(3), "3 خطوات متبقية");
  assert.equal(STEPS_LEFT.ar(10), "10 خطوات متبقية");
  assert.equal(STEPS_LEFT.ar(11), "11 خطوة متبقية");
});

const VIEW = {
  state: "normal",
  needs: { items: [{ key: "unmarked" }, { key: "setup" }, { key: "overdue" }] },
  header: { title: "kept" },
};

test("while the go-live banner shows, Needs you now has no setup row of its own", () => {
  const shown = withoutSetupRow(VIEW, true);
  assert.deepEqual(shown.needs.items.map((i) => i.key), ["unmarked", "overdue"]);
  assert.equal(shown.header, VIEW.header); // the rest of the view is the same
  assert.equal(VIEW.needs.items.length, 3); // and the view that came in is not changed
});

test("once the business is live the row comes back, as the only list there is", () => {
  assert.equal(withoutSetupRow(VIEW, false), VIEW);
});
