// What the back office says when it will not open (run with `pnpm test`): a sign-in that has run
// out is said plainly, with its length, and the sign-in link carries the page back.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { denial } from "./denied.ts";
import { loginUrl } from "../login/next.ts";

test("a staff sign-in that has run out says so, with how long they last", () => {
  const out = denial(401, "sign in again: back-office sign-ins last 12 hours");
  assert.match(out.message, /lasts 12 hours and has run out/);
  assert.match(out.message, /come back to this page/);
  assert.equal(out.signIn, true);
  assert.match(denial(401, "sign in again: back-office sign-ins last 8 hours").message, /lasts 8 hours/);
});

test("no sign-in, and a sign-in that is not staff's, each get their own sentence", () => {
  assert.match(denial(401, "sign-in required").message, /Sign in with your ALYR staff email/);
  assert.match(denial(403, "ALYR staff only").message, /for ALYR staff only/);
  assert.notEqual(denial(401, "sign-in required").message, denial(401, "sign in again: back-office sign-ins last 12 hours").message);
  assert.equal(denial(403, "").signIn, true);
});

test("anything else is not a reason to sign in again", () => {
  for (const status of [0, 500, 502, 503]) {
    const out = denial(status, "boom");
    assert.equal(out.signIn, false);
    assert.doesNotMatch(out.message, /boom/);
    assert.match(out.message, /Check your connection/);
  }
});

test("the door's button goes to the sign-in page with this page to return to", () => {
  const shell = readFileSync(new URL("./Shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /denial\(answer\.status, answer\.error\)/);
  assert.match(shell, /href=\{loginUrl\(path\)\}/);
  assert.equal(loginUrl("/ops/clients"), "/login?next=/ops/clients");
});
