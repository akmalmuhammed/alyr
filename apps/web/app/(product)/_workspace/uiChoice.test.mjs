// The look a section opens in (uiChoice.ts): the address first, then the device's memory, then the
// registry's default (the classic look for every section until the founder flips it).

import assert from "node:assert/strict";
import { test } from "node:test";
import { UI_STORE, parseRemembered, remember, resolveUi, uiFromQuery } from "./uiChoice.ts";

test("the address asks for 1 or 2 and nothing else", () => {
  assert.equal(uiFromQuery("2"), 2);
  assert.equal(uiFromQuery("1"), 1);
  for (const bad of [null, undefined, "", "3", "true", "02", "2 "]) assert.equal(uiFromQuery(bad), null, String(bad));
});

test("with no address and no memory a section opens as its registry default says", () => {
  assert.equal(resolveUi("orders", null, {}, 1), 1);
  assert.equal(resolveUi("orders", null, {}, 2), 2);
});

test("the address beats the memory, and the memory beats the default", () => {
  assert.equal(resolveUi("orders", 1, { orders: 2 }, 2), 1);
  assert.equal(resolveUi("orders", null, { orders: 2 }, 1), 2);
  assert.equal(resolveUi("orders", null, { inbox: 2 }, 1), 1, "another section's choice does not carry over");
});

test("a choice is remembered for its section only, and the old ones stay", () => {
  const first = remember({}, "orders", 2);
  const second = remember(first, "team", 2);
  assert.deepEqual(second, { orders: 2, team: 2 });
  assert.deepEqual(remember(second, "orders", 1), { orders: 1, team: 2 });
  assert.deepEqual(first, { orders: 2 }, "the input is not changed");
});

test("storage that holds anything else reads as nothing remembered", () => {
  assert.equal(UI_STORE, "alyr-ui-choice");
  assert.deepEqual(parseRemembered(null), {});
  assert.deepEqual(parseRemembered("not json"), {});
  assert.deepEqual(parseRemembered("[1,2]"), {});
  assert.deepEqual(parseRemembered("null"), {});
  assert.deepEqual(parseRemembered('{"orders":2,"inbox":"2","Bad Key":2,"team":3,"ledger":1}'), { orders: 2, ledger: 1 });
});
