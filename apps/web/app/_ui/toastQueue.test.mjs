// Tests for the Toast queue: room for three, the rest wait; durations by kind; a key replaces.
// Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { DURATION, EMPTY_QUEUE, MAX_VISIBLE, clearToasts, dismissToast, durationFor, newlyVisible, pushToast } from "./toastQueue.ts";

test("a toast that only tells is short, one with Undo is long, a problem stays longest of the kinds without Undo", () => {
  assert.equal(durationFor({}), DURATION.tell);
  assert.equal(durationFor({ tone: "ok" }), DURATION.tell);
  assert.equal(durationFor({ tone: "bad" }), DURATION.problem);
  assert.equal(durationFor({ tone: "warn" }), DURATION.problem);
  assert.equal(durationFor({ undo: () => {} }), DURATION.undo);
  assert.equal(durationFor({ tone: "bad", undo: () => {} }), DURATION.undo);
  assert.equal(durationFor({ duration: 1200, undo: () => {} }), 1200);
  assert.ok(DURATION.tell < DURATION.problem && DURATION.problem < DURATION.undo);
});

test("room for three on screen, the fourth waits and comes in when one goes", () => {
  let state = EMPTY_QUEUE;
  const ids = [];
  for (const text of ["one", "two", "three", "four"]) {
    const result = pushToast(state, { text });
    state = result.state;
    ids.push(result.id);
  }
  assert.equal(MAX_VISIBLE, 3);
  assert.deepEqual(state.visible.map((t) => t.text), ["one", "two", "three"]);
  assert.deepEqual(state.waiting.map((t) => t.text), ["four"]);
  const after = dismissToast(state, ids[1]);
  assert.deepEqual(after.visible.map((t) => t.text), ["one", "three", "four"]);
  assert.deepEqual(after.waiting, []);
  assert.deepEqual(newlyVisible(state, after).map((t) => t.text), ["four"]);
});

test("ids never repeat and the tone defaults to ok", () => {
  const a = pushToast(EMPTY_QUEUE, { text: "a" });
  const b = pushToast(a.state, { text: "b", tone: "bad" });
  assert.notEqual(a.id, b.id);
  assert.equal(a.state.visible[0].tone, "ok");
  assert.equal(b.state.visible[1].tone, "bad");
  assert.equal(a.shown, true);
});

test("a push with the same key replaces the toast, on screen or waiting", () => {
  let state = EMPTY_QUEUE;
  state = pushToast(state, { text: "Saving", key: "save" }).state;
  state = pushToast(state, { text: "Saved", key: "save" }).state;
  assert.deepEqual(state.visible.map((t) => t.text), ["Saved"]);
  for (const text of ["x", "y"]) state = pushToast(state, { text }).state;
  state = pushToast(state, { text: "late 1", key: "late" }).state;
  state = pushToast(state, { text: "late 2", key: "late" }).state;
  assert.deepEqual(state.waiting.map((t) => t.text), ["late 2"]);
});

test("dismissing a toast that is waiting, or one that is gone, is harmless", () => {
  let state = EMPTY_QUEUE;
  const ids = [];
  for (const text of ["1", "2", "3", "4"]) {
    const r = pushToast(state, { text });
    state = r.state;
    ids.push(r.id);
  }
  assert.deepEqual(dismissToast(state, ids[3]).waiting, []);
  assert.equal(dismissToast(state, 999).visible.length, 3);
});

test("clear empties both lists", () => {
  let state = EMPTY_QUEUE;
  for (const text of ["1", "2", "3", "4"]) state = pushToast(state, { text }).state;
  const cleared = clearToasts(state);
  assert.deepEqual([cleared.visible.length, cleared.waiting.length], [0, 0]);
});
