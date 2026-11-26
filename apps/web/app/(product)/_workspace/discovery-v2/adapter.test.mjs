// The typed adapter (adapter.ts): the API's answers become This week's view, and what the API does
// not send yet is absent, never invented.

import assert from "node:assert/strict";
import { test } from "node:test";
import { approversOf, buildThisWeek, confirmedFor, toneOf } from "./adapter.ts";
import { FIXTURE_NOW, approvedHours, fixture } from "./fixtures.ts";

const f = fixture("en");
const build = (over = {}) => buildThisWeek({ ...f, now: FIXTURE_NOW, lang: "en", ...over });

test("asks and owner tasks are counted together, in the API's order", () => {
  const v = build();
  assert.equal(v.state, "content");
  assert.equal(v.total, 3);
  assert.deepEqual(v.asks.map((a) => [a.p.id, a.index, a.of]), [["p-hours", 1, 3], ["p-phone", 2, 3]]);
  assert.deepEqual(v.owner.map((x) => x.id), ["f-link"]);
  assert.equal(v.asks[0].where, "google");
  assert.equal(v.asks[0].exact, "Friday 13:00–22:00");
});

test("without extras nothing the API lacks is drawn", () => {
  const v = build({ extras: undefined });
  assert.equal(v.previous, null);
  assert.equal(v.nextCheckAt, null);
  assert.equal(v.asks[0].firstParty, null);
  assert.equal(v.asks[0].listing, null);
  assert.equal(v.asks[0].alsoFixes, null);
});

test("with extras each piece lands on its ask", () => {
  const v = build({ extras: f.extras });
  assert.equal(v.previous.matched, 8);
  assert.equal(v.asks[0].firstParty.weeks.length, 4);
  assert.equal(v.asks[0].listing.rating, 4.6);
  assert.equal(v.asks[1].firstParty, null);
  assert.equal(v.nextCheckAt, f.extras.nextCheckAt);
});

test("what the owner confirmed is read from the facts, for the changed day", () => {
  assert.deepEqual(confirmedFor(f.waiting[0], f.facts, "en"), { text: "13:00–22:00", by: "Hana", at: f.facts[0].confirmed_at });
  assert.equal(confirmedFor(f.waiting[1], f.facts, "en"), null);
  assert.equal(confirmedFor(f.waiting[0], [{ ...f.facts[0], default: true }], "en"), null);
  assert.equal(confirmedFor(f.waiting[0], [{ ...f.facts[0], location_id: "elsewhere" }], "en"), null);
});

test("approvers are the owners and managers, owner first; none when the team could not be read", () => {
  const people = approversOf([{ id: "1", name: "Sara", role: "agent" }, { id: "2", name: "Omar", role: "admin" }, { id: "3", name: "Hana", role: "owner" }]);
  assert.deepEqual(people.map((p) => [p.name, p.tone, p.initial]), [["Hana", "h", "H"], ["Omar", "o", "O"]]);
  assert.deepEqual(approversOf(null), []);
  assert.equal(toneOf("Omar", people), "o");
  assert.equal(toneOf("Someone", people), "n");
});

test("the week's receipts are the sent changes and the owner's own fixes, newest first", () => {
  const v = build();
  assert.deepEqual(v.receipts.map((r) => (r.kind === "change" ? r.p.id : r.f.id)), ["p-category", "p-name", "f-site-phone", "f-site-hours"]);
  const change = v.receipts[0];
  assert.equal(change.kind, "change");
  assert.deepEqual([change.before, change.after, change.where], ["None", "Car wash", "google"]);
});

test("the states: no connection, no check-up yet, nothing this week", () => {
  assert.equal(build({ overview: { ...f.overview, has_connection: false } }).state, "noConnection");
  assert.equal(build({ overview: { ...f.overview, has_run: false } }).state, "noRun");
  assert.equal(build({ waiting: [], recent: [], overview: { ...f.overview, up_next: [], done: [] } }).state, "empty");
});

test("the latest receipt is the newest approved or sent change; the sample source says so", () => {
  assert.equal(build().latest.id, "p-category");
  assert.equal(build({ recent: [...f.recent, approvedHours(f, "en")] }).latest.id, "p-hours");
  const sample = fixture("en", "sample");
  const v = buildThisWeek({ ...sample, now: FIXTURE_NOW, lang: "en" });
  assert.ok(v.sample);
  assert.equal(v.asks[0].where, "listing");
  assert.equal(v.asks[0].lead.pre, "Your listing says you’re ");
});
