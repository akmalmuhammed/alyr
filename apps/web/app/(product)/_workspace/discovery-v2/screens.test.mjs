// The pure logic of Checks, Proof, Answers and Set up (screens.ts) and the parsers of api2.ts: what
// each page draws comes from the API's answers, "Not measured" is never counted, and what the API
// does not send is absent, never invented.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAnswers, parseChecksBlock, parsePackChoice, parsePacks } from "./api2.ts";
import { BLOCK, answersFixture, checksFixture, findingsFixture, packsFixture, proofFixture, setupFixture } from "./fixtures2.ts";
import { bidiValue, buildAnswers, buildChecks, buildProof, checksFor, familyRules, filterReceipts, filterRows, hoursLines, knownFacts, markName, receiptOf } from "./screens.ts";

const titles = { core: "Core", own: "Your own data" };
const checks = (over = {}) => buildChecks({ checks: checksFixture("en"), findings: findingsFixture("en"), packs: packsFixture("en"), block: BLOCK, waiting: [], titles, ...over });

// ── Checks ─────────────────────────────────────────────

test("checks: N of M leaves out what was not measured", () => {
  const v = checks();
  assert.equal(v.state, "content");
  assert.deepEqual([v.tally.matched, v.tally.measured, v.tally.notMeasured], [10, 14, 2]);
  assert.deepEqual(v.counts, { all: 16, differ: 4, ok: 10, nm: 2 });
});

test("checks: grouped as core and own data, differences first", () => {
  const v = checks();
  assert.deepEqual(v.groups.map((g) => g.id), ["core", "own"]);
  const core = v.groups[0];
  assert.deepEqual(core.rows.slice(0, 3).map((r) => r.kind), ["differ", "differ", "differ"]);
  assert.equal(core.rows.at(-1).kind, "nm");
  assert.deepEqual([core.matched, core.differ, core.notMeasured], [7, 3, 2]);
  assert.equal(v.groups[1].rows[0].ruleId, "hours_vs_activity");
});

test("checks: a difference carries its finding's evidence and whether an ask waits", () => {
  const row = checks().groups[0].rows.find((r) => r.ruleId === "hours_conflict");
  assert.equal(row.evidence.length, 3);
  assert.equal(row.askWaiting, true);
  const link = checks().groups[0].rows.find((r) => r.ruleId === "whatsapp_link_missing");
  assert.equal(link.askWaiting, false);
  assert.equal(link.finding.kind, "owner");
});

test("checks: a match or a not-measured row has no evidence of its own (the API keeps none)", () => {
  for (const r of checks().groups.flatMap((g) => g.rows).filter((r) => r.kind !== "differ")) assert.equal(r.evidence.length, 0);
});

test("checks: the family title and trade come from the packs", () => {
  const v = checks();
  assert.equal(v.familyTitle, "Appointments");
  assert.equal(v.tradeTitle, "Car care");
});

test("checks: a family pack with rules of its own makes its own group", () => {
  const packs = packsFixture("en").map((p) => (p.id === "appointments" ? { ...p, rules: ["photos_few"] } : p));
  const v = checks({ packs });
  assert.deepEqual(v.groups.map((g) => g.id), ["core", "own", "family"]);
  assert.equal(v.groups[2].title, "Appointments");
  assert.deepEqual(v.groups[2].rows.map((r) => r.ruleId), ["photos_few"]);
});

test("checks: nothing measured is a state, with no counts", () => {
  const v = checks({ checks: { run_id: null, finished_at: null, measured: false, rules: [], places: [], business: null } });
  assert.equal(v.state, "notMeasured");
  assert.equal(v.tally, null);
  assert.equal(v.groups.length, 0);
});

test("checks: filters show only their kind", () => {
  const rows = checks().groups[0].rows;
  assert.ok(filterRows(rows, "differ").every((r) => r.kind === "differ"));
  assert.equal(filterRows(rows, "all").length, rows.length);
});

test("checks: several places name the place on each row", () => {
  const c = checksFixture("en");
  const two = { ...c, business: null, places: [{ id: "a", name: "West Bay", ...c.business }, { id: "b", name: "Lusail", ...c.business }] };
  const v = checks({ checks: two });
  assert.equal(v.counts.all, 32);
  assert.ok(v.groups[0].rows.every((r) => r.place === "West Bay" || r.place === "Lusail"));
});

test("familyRules: a trade's overlay adds its rules", () => {
  const packs = packsFixture("en").map((p) => (p.id === "health" ? { ...p, rules: ["x_rule"] } : p));
  assert.ok(familyRules(packs, "appointments", "clinic").has("x_rule"));
  assert.ok(!familyRules(packs, "appointments", "salon").has("x_rule"));
});

// ── Set up ─────────────────────────────────────────────

test("checksFor: core plus family, minus what an overlay skips", () => {
  const packs = packsFixture("en");
  assert.equal(checksFor(packs, "appointments", "car_care"), 16);
  assert.equal(checksFor(packs, "online_only", "online_seller"), 15);
  assert.equal(checksFor(packs, "nope", null), 0);
});

test("hoursLines: days with the same hours run together", () => {
  const value = { sat: ["07:00", "22:00"], sun: ["07:00", "22:00"], mon: ["07:00", "22:00"], tue: ["07:00", "22:00"], wed: ["07:00", "22:00"], thu: ["07:00", "22:00"], fri: ["13:00", "22:00"] };
  assert.deepEqual(hoursLines(value, "en"), ["Sat–Thu 07:00–22:00", "Fri 13:00–22:00"]);
  assert.deepEqual(hoursLines({ ...value, fri: [] }, "en").at(-1), "Fri Closed");
});

test("knownFacts: only what exists, each with where it came from", () => {
  const s = setupFixture("en");
  const facts = knownFacts({ place: s.place, facts: s.facts, sourceKind: "google", lang: "en" });
  assert.deepEqual(facts.map((f) => f.key), ["name", "whatsapp", "phone", "hours", "category", "source"]);
  assert.equal(facts.find((f) => f.key === "name").sub, "نقطة للعناية بالسيارات");
  assert.equal(facts.find((f) => f.key === "whatsapp").prov, "alyr");
  assert.equal(facts.find((f) => f.key === "hours").prov, "you");
  assert.deepEqual(knownFacts({ place: null, facts: [], sourceKind: "", lang: "en" }), []);
});

// ── Proof ──────────────────────────────────────────────

test("proof: receipts newest first, counted by kind", () => {
  const f = proofFixture("en");
  const v = buildProof(f.proposals, f.done);
  assert.equal(v.receipts.length, 6);
  assert.deepEqual(v.counts, { all: 6, approved: 2, you: 2, undone: 1, expired: 1, declined: 0 });
  assert.equal(v.matches, 4);
  assert.deepEqual(v.deciders, ["Hana", "Omar"]);
  assert.equal(v.byYou, true);
  assert.ok(Date.parse(v.receipts[0].when) >= Date.parse(v.receipts.at(-1).when));
  assert.equal(v.since, v.receipts.at(-1).when);
  assert.equal(filterReceipts(v.receipts, "expired").length, 1);
});

test("proof: an ask still waiting is not a receipt; statuses follow the life of a change", () => {
  const p = proofFixture("en").proposals[0];
  assert.equal(receiptOf({ ...p, status: "proposed" }), null);
  assert.equal(receiptOf(p).status, "matches");
  assert.equal(receiptOf({ ...p, verification: "pending" }).status, "sent");
  assert.equal(receiptOf({ ...p, verification: "not_confirmed" }).status, "notMatching");
  assert.equal(receiptOf({ ...p, status: "failed" }).status, "failed");
  assert.equal(receiptOf({ ...p, status: "declined" }).kind, "declined");
});

// ── Answers ────────────────────────────────────────────

test("answers: per language and per tool, never added into one score", () => {
  const v = buildAnswers(answersFixture("en"));
  assert.equal(v.state, "content");
  assert.deepEqual([v.named, v.counted], [4, 12]);
  assert.deepEqual([v.en.named, v.en.counted, v.ar.named, v.ar.counted], [4, 6, 0, 6]);
  assert.equal(v.tools.length, 3);
  assert.deepEqual(v.tools.map((t) => t.en.named), [1, 2, 1]);
  assert.equal(v.quote.engine_label, "Answer tool 2");
});

test("answers: an answer that failed is not counted as not named", () => {
  const a = answersFixture("en");
  a.last.answers[0] = { ...a.last.answers[0], status: "error", named: false };
  const v = buildAnswers(a);
  assert.equal(v.en.counted, 5);
});

test("answers: off and not asked yet are states", () => {
  assert.equal(buildAnswers(answersFixture("en", "off")).state, "off");
  assert.equal(buildAnswers({ ...answersFixture("en", "off"), enabled: true }).state, "notAsked");
});

test("markName marks the matched name once, any case", () => {
  assert.deepEqual(markName("1. nuqta car care: wash", "Nuqta Car Care"), [{ text: "1. ", mark: false }, { text: "nuqta car care", mark: true }, { text: ": wash", mark: false }]);
  assert.deepEqual(markName("nothing", ""), [{ text: "nothing", mark: false }]);
});

// ── parsers ────────────────────────────────────────────

test("parsePacks keeps known kinds only and reads trades", () => {
  const packs = parsePacks({ items: [{ id: "core", kind: "core", rules: ["a"], checks: 1 }, { id: "x", kind: "weird" }, { id: "food", kind: "family", trades: [{ key: "cafe", title: "Café", overlays: ["o"] }, { title: "no key" }] }] });
  assert.deepEqual(packs.map((p) => p.id), ["core", "food"]);
  assert.deepEqual(packs[1].trades.map((t) => [t.key, t.overlays]), [["cafe", ["o"]]]);
});

test("parsePackChoice and parseChecksBlock read what is there", () => {
  assert.deepEqual(parsePackChoice({ family: "food", trade: null, chosen: true, checks: 16 }).family, "food");
  assert.equal(parsePackChoice({}).chosen, false);
  assert.equal(parseChecksBlock(undefined), null);
  assert.equal(parseChecksBlock({ family: "food", matched: 3 }).matched, 3);
});

test("parseAnswers: no range or cited pages unless the API sends them", () => {
  const a = parseAnswers({ enabled: true, last: { run_id: "r", named: 1, counted: 2, measured: true, answers: [{ id: "1", lang: "en", status: "ok", named: true }] } });
  assert.equal(a.range, null);
  assert.equal(a.cited, null);
  assert.equal(a.last.answers.length, 1);
  assert.deepEqual(parseAnswers({ range: { low: 2, high: 7 } }).range, { low: 2, high: 7 });
  assert.equal(parseAnswers({ range: { low: 7, high: 2 } }).range, null);
});

test("bidiValue holds Arabic values' times and numbers left to right, and leaves Latin alone", () => {
  assert.deepEqual(bidiValue("Fri 13:00–22:00"), { rtl: false, text: "Fri 13:00–22:00" });
  assert.equal(bidiValue("الجمعة 13:00–22:00").text, "الجمعة \u206613:00\u2060–\u206022:00\u2069");
  assert.equal(bidiValue("رقم +974 5555 0101").text, "رقم \u2066+974 5555 0101\u2069");
});