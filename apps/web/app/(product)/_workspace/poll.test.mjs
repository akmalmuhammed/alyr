// Tests for the workspace's polling (ALY-275 PERF-1): no look while the page is hidden, never
// two at once, and a question asked during a look is answered right after it, once.
// Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ticker } from "./poll.ts";

function gate() {
  let open;
  const shut = new Promise((resolve) => { open = resolve; });
  return { shut, open };
}

test("a hidden page asks nothing", async () => {
  let calls = 0;
  const tick = ticker(() => { calls += 1; }, () => false);
  await tick();
  await tick();
  assert.equal(calls, 0);
});

test("ticks during a slow look start no second one, and one more look follows", async () => {
  const gates = [gate(), gate()];
  let calls = 0;
  let inFlight = 0;
  let most = 0;
  const tick = ticker(async () => {
    const mine = gates[calls] ?? gate();
    calls += 1;
    inFlight += 1;
    most = Math.max(most, inFlight);
    if (calls > 2) mine.open();
    await mine.shut;
    inFlight -= 1;
  }, () => true);
  const first = tick();
  await tick();
  await tick();
  await tick();
  assert.equal(calls, 1);
  gates[0].open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  gates[1].open();
  await first;
  assert.equal(calls, 2);
  assert.equal(most, 1);
});

test("a look that fails does not stop the next", async () => {
  let calls = 0;
  const tick = ticker(async () => {
    calls += 1;
    if (calls === 1) throw new Error("offline");
  }, () => true);
  await tick();
  await tick();
  assert.equal(calls, 2);
});
