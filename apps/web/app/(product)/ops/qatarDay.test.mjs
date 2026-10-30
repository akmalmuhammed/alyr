// Tests for the back office's date (ALY-274, CJ-27). Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { qatarDay } from "./qatarDay.ts";

test("at 02:40 in Doha the day is today's, though UTC is still yesterday", () => {
  // 02:40 on 29 Oct in Doha is 23:40 on 28 Oct UTC: the audit's case.
  const at = new Date("2026-10-28T23:40:00Z");
  assert.equal(at.toISOString().slice(0, 10), "2026-10-28");
  assert.equal(qatarDay(at), "2026-10-29");
});

test("the day turns over at midnight in Doha, three hours before UTC's", () => {
  assert.equal(qatarDay(new Date("2026-10-29T20:59:59Z")), "2026-10-29");
  assert.equal(qatarDay(new Date("2026-10-29T21:00:00Z")), "2026-10-30");
});

test("month and year ends follow Doha's clock", () => {
  assert.equal(qatarDay(new Date("2026-12-31T22:00:00Z")), "2027-01-01");
});

test("with no argument it is a date", () => {
  assert.match(qatarDay(), /^\d{4}-\d{2}-\d{2}$/);
});
