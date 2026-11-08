// The Discovery screens' pure parts and their words (ALY-322, spec 065). Run with `node --test`
// from apps/web (Node 22.18 or newer reads the .ts files as they are): the copy is complete in
// both languages and says nothing the product may not say, the address and the menu route the
// four views and leave every other section alone, the client's parsers turn the spec's shapes
// into what the screens read (and never invent a number), and the styles hold no colour and no
// physical direction.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DiscoveryError, errorFrom, parseConnection, parseFinding, parseFindings, parseOverview, parsePlaces, parseReport, parseReviews, parseRun } from "./discoveryApi.ts";
import { T } from "./discoveryCopy.ts";
import {
  MAX_POLLS, VIEWS, averageText, formatDay, formatWhen, groupByKind, homeState, isNumeric, isSample, lastMonths,
  minutesFrom, monthName, pollDecision, readView, reviewQuery, sayError, stepKind, stepText, subItems, viewHref,
} from "./discoveryLogic.ts";

const HERE = import.meta.dirname;
const REPO = join(HERE, "../../../../..");
const read = (path) => readFileSync(path, "utf8");

// ── the words ───────────────────────────────────────────

/** Every line of a copy object as text: functions are called with sample arguments. */
function lines(object, path = "") {
  const out = [];
  for (const [key, value] of Object.entries(object)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof value === "string") out.push([here, value]);
    else if (typeof value === "function") {
      const samples = value.length === 2 ? [[0, 0], [1, 0], [3, 2], [12, 11]] : [[0], [1], [2], [3], [5], [10], [11], [12], [30]];
      for (const args of samples) {
        const result = value.length === 1 && key === "stepRules" ? value("presence") : value.length === 1 && /When|lastCheck|firstSeen|lastSeen|preparedOn/.test(key) ? value("7 Nov") : value.length === 1 && key === "listCount" ? "" : value(...args);
        out.push([`${here}(${args.join(",")})`, String(result)]);
      }
      if (key === "listCount") for (const tab of ["open", "skipped", "done"]) for (const n of [0, 1, 2, 3, 10, 11]) out.push([`${here}(${tab},${n})`, value(tab, n)]);
      if (key === "stepRules") for (const family of ["presence", "reviews", "website", "whatsapp", null]) out.push([`${here}(${family})`, value(family)]);
      if (key === "runFinished") out.push([`${here}(null)`, value(null)]);
    } else if (value && typeof value === "object") out.push(...lines(value, here));
  }
  return out;
}
const keysOf = (object, path = "") => Object.entries(object).flatMap(([k, v]) => (v && typeof v === "object" ? keysOf(v, `${path}${k}.`) : [`${path}${k}`])).sort();

// Lines that are empty on purpose: the part nobody draws yet, and the status that has no sentence.
const EMPTY_ON_PURPOSE = new Set(["partNames.ai", "partHints.ai", "statusLine.open"]);

test("every line is in English and Arabic, and none is empty", () => {
  assert.deepEqual(keysOf(T.ar), keysOf(T.en));
  for (const lang of ["en", "ar"]) {
    for (const [path, text] of lines(T[lang])) {
      if (EMPTY_ON_PURPOSE.has(path)) continue;
      assert.ok(text.trim().length > 0, `${lang}.${path} is empty`);
      assert.doesNotMatch(text, /undefined|NaN|\[object/, `${lang}.${path}: ${text}`);
    }
  }
});

test("no line ends in an ellipsis, and the Arabic is Arabic with Western digits", () => {
  for (const lang of ["en", "ar"]) {
    for (const [path, text] of lines(T[lang])) assert.doesNotMatch(text, /…|\.\.\./, `${lang}.${path}: ${text}`);
  }
  for (const [path, text] of lines(T.ar)) {
    if (EMPTY_ON_PURPOSE.has(path)) continue;
    assert.match(text, /[؀-ۿ]/, `ar.${path} has no Arabic: ${text}`);
    assert.doesNotMatch(text, /[٠-٩۰-۹]/, `ar.${path} has Eastern digits: ${text}`);
    assert.doesNotMatch(text, /\bQAR\b/, `ar.${path} says QAR`);
  }
});

test("Arabic counts agree with their nouns", () => {
  const todo = (n) => T.ar.listCount("open", n);
  assert.equal(todo(1), "مهمة واحدة مفتوحة");
  assert.equal(todo(2), "مهمتان مفتوحتان");
  assert.equal(todo(3), "3 مهام مفتوحة");
  assert.equal(todo(10), "10 مهام مفتوحة");
  assert.equal(todo(11), "11 مهمة مفتوحة");
  assert.match(T.ar.changeUp(1), /نقطة واحدة/);
  assert.match(T.ar.changeUp(2), /نقطتان/);
  assert.match(T.ar.changeDown(6), /6 نقاط/);
  assert.match(T.ar.tooSoon(2), /دقيقتين/);
  assert.equal(T.en.listCount("open", 1), "1 to do");
  assert.equal(T.en.changeUp(1), "Up 1 point since the last check-up");
  assert.equal(T.en.changeUp(6), "Up 6 points since the last check-up");
});

/** The AI words of honesty.md section 1, as the sign-up screens' own test reads them. */
function aiWords() {
  const rows = read(join(REPO, ".claude/skills/alyr-design/honesty.md")).split(/\r?\n/);
  const bullet = (label) => {
    const start = rows.findIndex((line) => line.startsWith(`- **${label}:**`));
    assert.ok(start >= 0, `honesty.md has no "- **${label}:**" bullet`);
    let text = rows[start].slice(`- **${label}:**`.length);
    for (let i = start + 1; i < rows.length && /^\s{2,}\S/.test(rows[i]) && !/^\s*- /.test(rows[i]); i += 1) text += ` ${rows[i].trim()}`;
    return text.replace(/\([^)]*\)/g, "").split(/[,،]/).map((w) => w.replace(/["“”.]/g, "").trim()).filter(Boolean);
  };
  return { en: bullet("Words"), ar: bullet("Arabic") };
}
const arabicTokens = (text) => text.split(/[\s.,،؛:!?؟«»"()]+/).filter(Boolean).map((w) => w.replace(/^ال/, ""));

test("no AI words, no \"coming\", and nothing that is not built", () => {
  const { en, ar } = aiWords();
  for (const [path, text] of lines(T.en)) {
    for (const word of en) assert.doesNotMatch(text, new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), `"${word}" in en.${path}: ${text}`);
    assert.doesNotMatch(text, /\b(coming|beta|approve|approval|connect (to )?google)\b/i, `en.${path}: ${text}`);
  }
  for (const [path, text] of lines(T.ar)) {
    const tokens = arabicTokens(text);
    for (const word of ar) assert.ok(!tokens.includes(word.replace(/^ال/, "")), `«${word}» in ar.${path}: ${text}`);
    assert.doesNotMatch(text, /قريباً|موافقة|اعتماد|الذكاء|ذكي/, `ar.${path}: ${text}`);
  }
  // The part that is not measured in Phase 1 has no name on any screen.
  assert.equal(T.en.partNames.ai, "");
  assert.equal(T.ar.partNames.ai, "");
});

test("the screens hold no words of their own", () => {
  const files = readdirSync(HERE).filter((f) => /^Discovery.*\.tsx$/.test(f) || f === "discoveryUi.tsx");
  assert.ok(files.length >= 8, files.join());
  for (const file of files) {
    // Text between tags that is not an expression is a hard-coded word.
    const loose = [...read(join(HERE, file)).matchAll(/>([^<>{}]*[A-Za-z؀-ۿ][^<>{}]*)</g)]
      .map((m) => m[1].trim())
      .filter((text) => text && !text.startsWith("//") && !/[=;()&?|]/.test(text) && text !== "Promise");
    assert.deepEqual(loose, [], file);
    // An attribute that is read aloud or shown comes from the copy too.
    const attrs = [...read(join(HERE, file)).matchAll(/\b(aria-label|placeholder|title|alt)="([^"{}]+)"/g)].map((m) => m[2]);
    assert.deepEqual(attrs, [], file);
  }
});

// ── the address and the menu ────────────────────────────

test("the address names a view, and Home is the default", () => {
  assert.deepEqual([...VIEWS], ["home", "todo", "reviews", "reports"]);
  for (const view of VIEWS) assert.equal(readView(view), view);
  for (const odd of [null, undefined, "", "settings", "TODO", "home&x=1", "ai"]) assert.equal(readView(odd), "home");
  assert.equal(viewHref("home"), "/app/discovery");
  assert.equal(viewHref("todo"), "/app/discovery?view=todo");
  assert.equal(viewHref("todo", { finding: "f 1" }), "/app/discovery?view=todo&finding=f+1");
  assert.equal(viewHref("reports", { finding: "" }), "/app/discovery?view=reports");
});

test("only Discovery has views beneath it in the menu; every other section has none", () => {
  assert.deepEqual([...subItems("discovery")], ["home", "todo", "reviews", "reports"]);
  for (const key of ["home", "inbox", "orders", "bookings", "catalog", "documents", "ledger", "team", "products", "connections", "account", "connect", "unsent", ""]) {
    assert.deepEqual([...subItems(key)], [], key);
  }
});

test("the shell draws a sub-list only for an item that has views", () => {
  const shell = read(join(HERE, "../app/[[...section]]/page.tsx"));
  assert.match(shell, /subItems\(item\.key\)\.length > 0 && section === item\.key/);
  assert.match(shell, /return withViews \? \[link, <SubNav/);
  // The palette adds rows only through subItems too.
  assert.match(shell, /\.\.\.subItems\(item\.key\)\.map/);
});

// ── the client ──────────────────────────────────────────

const FINDING = {
  id: "f1", rule_id: "hours_missing", kind: "agent", severity: "high", status: "open", title: "T", why: "W", what_happens: "H", what_is_needed: "N",
  evidence: [{ label: "Hours", value: "None", where: "Google listing", seen_at: "2026-11-07T11:20:00Z" }],
  location: { id: "p1", name: "Al Wakra" }, first_seen_at: "2026-11-01T08:00:00Z", last_seen_at: "2026-11-07T11:20:00Z",
};

test("a finding is read as the spec writes it, and a bad status is refused", () => {
  const f = parseFinding(FINDING);
  assert.equal(f.title, "T");
  assert.equal(f.location.name, "Al Wakra");
  assert.equal(f.evidence[0].where, "Google listing");
  assert.deepEqual(f.steps, []);
  assert.deepEqual(parseFinding({ ...FINDING, evidence: undefined, location: null }).evidence, []);
  assert.equal(parseFinding({ ...FINDING, location: null }).location, null);
  assert.equal(parseFinding({ ...FINDING, steps: [{ seq: 2, tool: "connector.snapshot", summary: "s", ok: false }] }).steps[0].ok, false);
  assert.throws(() => parseFinding({ ...FINDING, status: "approved" }), DiscoveryError);
  assert.throws(() => parseFinding({ ...FINDING, id: "" }), DiscoveryError);
  assert.equal(parseFinding({ ...FINDING, kind: "robot" }).kind, "owner");
});

test("a part that was not measured never has a number", () => {
  const run = parseRun({
    id: "r1", status: "done", trigger: "manual", score: 72,
    score_parts: { presence: { value: 80, measured: true, weight: 40 }, reviews: { value: 55, measured: false, weight: 25 }, website: null, whatsapp: { value: null, measured: true }, ai: { value: 10, measured: false, weight: 0 } },
    started_at: "2026-11-07T11:00:00Z", finished_at: "2026-11-07T11:01:00Z",
  });
  const parts = run.score_parts;
  assert.deepEqual(parts.presence, { value: 80, measured: true, weight: 40 });
  assert.equal(parts.reviews.value, null);
  assert.equal(parts.reviews.measured, false);
  assert.equal(parts.website.value, null);
  assert.equal(parts.whatsapp.measured, false);
  assert.equal(parts.ai.value, null);
  assert.equal(parseRun({ id: "r", status: "queued" }).score_parts, null);
  assert.equal(parseRun({ id: "r", status: "failed", error: "The listing service did not answer." }).error, "The listing service did not answer.");
  assert.equal(parseRun({ id: "r", status: "weird" }).status, "queued");
});

test("the overview, findings, reviews, report, places and connection are read as the spec writes them", () => {
  const o = parseOverview({
    has_connection: true, has_run: true, last_run: { id: "r1", status: "done" }, score: 72, score_parts: null,
    counts: { open: 3, skipped: 1, owner_done: 2, verified: 4 }, next: FINDING, up_next: [FINDING], done: [], delta: { score_change: -4, since_run_id: "r0" },
  });
  assert.equal(o.score, 72);
  assert.equal(o.next.id, "f1");
  assert.equal(o.delta.score_change, -4);
  assert.equal(o.counts.verified, 4);
  const empty = parseOverview({});
  assert.deepEqual([empty.has_connection, empty.has_run, empty.score, empty.next, empty.delta, empty.up_next], [false, false, null, null, null, []]);
  assert.deepEqual(empty.counts, { open: 0, skipped: 0, owner_done: 0, verified: 0 });

  assert.equal(parseFindings({ items: [FINDING], counts: { open: 1 } }).items.length, 1);

  const reviews = parseReviews({
    items: [{ id: "v1", location: { id: "p1", name: "Al Wakra" }, rating: 9, posted_at: "2026-11-01T00:00:00Z", author_name: "A", body: "<b>x</b>", language: "en", replied: false, reply_text: "" }],
    summary: { count: 1, average: null, unanswered: 1, by_location: [] },
  });
  assert.equal(reviews.items[0].rating, 5);
  assert.equal(reviews.items[0].body, "<b>x</b>");
  assert.equal(reviews.summary.average, null);

  const report = parseReport({ month: "2026-11", generated_at: "2026-11-30T09:00:00Z", score_start: 48, score_end: 74, change: 26, headline: "h", fixed: [FINDING], still_open: [], new: [], by_part: { presence: 80, reviews: null, website: { value: 60, measured: true }, whatsapp: { value: 1, measured: false }, ai: null }, runs: 3 });
  assert.equal(report.by_part.presence.value, 80);
  assert.equal(report.by_part.reviews.measured, false);
  assert.equal(report.by_part.whatsapp.value, null);
  assert.equal(report.runs, 3);
  assert.throws(() => parseReport({ month: "november" }), DiscoveryError);

  assert.deepEqual(parsePlaces([{ id: "p1", name: "Al Wakra", name_ar: "الوكرة", area: "x" }, { name: "no id" }]).map((p) => p.id), ["p1"]);
  assert.equal(parsePlaces({ items: [{ id: "p2", name: "B" }] })[0].name, "B");
  assert.deepEqual(parseConnection({ kind: "sample", on: true }), { kind: "sample", on: true });
  assert.deepEqual(parseConnection({ kind: "sample", status: "off" }), { kind: "", on: false });
  assert.deepEqual(parseConnection({ items: [{ kind: "places", status: "off" }, { kind: "sample", status: "on" }] }), { kind: "sample", on: true });
  assert.deepEqual(parseConnection({}), { kind: "", on: false });
});

test("a refusal carries its code, its words in both languages and when to try again", () => {
  const nested = errorFrom(429, { detail: { code: "run_too_soon", message: "Too soon.", message_ar: "مبكر.", retry_after: 420 } });
  assert.deepEqual([nested.status, nested.code, nested.message, nested.messageAr, nested.retryAfter], [429, "run_too_soon", "Too soon.", "مبكر.", 420]);
  assert.equal(errorFrom(429, { detail: "Too soon.", code: "run_too_soon", message_ar: "مبكر." }).code, "run_too_soon");
  assert.equal(errorFrom(429, {}, "300").retryAfter, 300);
  assert.equal(errorFrom(429, { detail: { retry_after: 60 } }, "300").retryAfter, 60);
  assert.equal(errorFrom(404, { detail: { code: "module_off" } }).code, "module_off");
  assert.equal(errorFrom(500, null).code, "");
  assert.equal(sayError(errorFrom(404, { detail: { code: "module_off" } }), "ar"), T.ar.moduleOff);
  assert.equal(sayError(errorFrom(403, { detail: "x" }), "en"), T.en.forbidden);
  assert.equal(sayError(errorFrom(422, { detail: { code: "x", message: "Nope.", message_ar: "لا." } }), "ar"), "لا.");
  assert.equal(sayError(errorFrom(422, { detail: { code: "x", message: "Nope." } }), "en"), "Nope.");
  assert.equal(sayError(new DiscoveryError(0, "offline", "offline"), "ar"), T.ar.offline);
  assert.equal(sayError(new DiscoveryError(0, "bad_answer", "unexpected answer"), "en"), T.en.failed);
  assert.equal(sayError(new Error("boom"), "en"), T.en.failed);
  assert.equal(minutesFrom(420), 7);
  assert.equal(minutesFrom(61), 2);
  assert.equal(minutesFrom(null), 1);
  assert.equal(minutesFrom(0), 1);
});

// ── the screens' logic ──────────────────────────────────

const overviewOf = (patch) => parseOverview({ has_connection: true, has_run: true, score: 70, counts: { open: 2, skipped: 0, owner_done: 0, verified: 0 }, next: FINDING, up_next: [FINDING], ...patch });

test("Home is in one of four states, from the overview alone", () => {
  assert.equal(homeState(overviewOf({ has_connection: false })), "noConnection");
  assert.equal(homeState(overviewOf({ has_run: false, score: null, counts: {}, next: null, up_next: [] })), "noRun");
  // a first run that failed leaves nothing to show
  assert.equal(homeState(overviewOf({ score: null, counts: {}, next: null, up_next: [], last_run: { id: "r", status: "failed" } })), "noRun");
  assert.equal(homeState(overviewOf({ next: null, up_next: [], counts: { open: 0, verified: 3 } })), "caughtUp");
  assert.equal(homeState(overviewOf({})), "content");
});

test("a run is followed every 1.5 s and never forever", () => {
  const run = (status) => parseRun({ id: "r", status });
  assert.equal(pollDecision(run("queued"), 0), "poll");
  assert.equal(pollDecision(run("running"), MAX_POLLS - 1), "poll");
  assert.equal(pollDecision(run("running"), MAX_POLLS), "slow");
  assert.equal(pollDecision(run("done"), 3), "stop");
  assert.equal(pollDecision(run("failed"), 3), "stop");
  assert.equal(MAX_POLLS * 1.5 / 60, 4);
});

test("findings group by who does them", () => {
  const f = (id, kind, last) => parseFinding({ ...FINDING, id, kind, last_seen_at: last });
  const groups = groupByKind([f("a", "owner"), f("b", "process"), f("c", "owner"), f("d", "agent")]);
  assert.deepEqual(groups.map((g) => [g.kind, g.items.map((x) => x.id)]), [["agent", ["d"]], ["owner", ["a", "c"]], ["process", ["b"]]]);
  assert.deepEqual(groupByKind([f("a", "owner")]).map((g) => g.kind), ["owner"]);
});

test("review filters become the API's query", () => {
  assert.deepEqual(reviewQuery({ place: "", stars: "all", unanswered: false }), { location_id: undefined, max_rating: undefined, replied: undefined });
  assert.deepEqual(reviewQuery({ place: "p1", stars: "3", unanswered: true }), { location_id: "p1", max_rating: 3, replied: false });
  assert.equal(averageText(3.64), "3.6");
  assert.equal(averageText(null), "");
});

test("the months a report is asked for are the last calendar months in Doha", () => {
  assert.deepEqual(lastMonths(new Date("2026-11-08T10:00:00Z"), 3), ["2026-11", "2026-10", "2026-09"]);
  assert.deepEqual(lastMonths(new Date("2026-01-15T10:00:00Z"), 3), ["2026-01", "2025-12", "2025-11"]);
  // 23:30 UTC on 31 October is already November in Doha (UTC+3)
  assert.equal(lastMonths(new Date("2026-10-31T23:30:00Z"), 1)[0], "2026-11");
  assert.match(monthName("2026-11", "en"), /^November 2026$/);
  assert.match(monthName("2026-11", "ar"), /^نوفمبر 2026$/);
});

test("times are the shop's clock, in Western digits, and a bad time is nothing", () => {
  const now = new Date("2026-11-08T10:00:00Z");
  assert.equal(formatWhen("2026-11-07T11:20:00Z", "en", now), "7 Nov · 14:20");
  assert.equal(formatWhen("2026-11-07T11:20:00Z", "ar", now), "7 نوفمبر · 14:20");
  assert.equal(formatWhen("2025-12-31T21:05:00Z", "en", now), "1 Jan · 00:05");
  assert.equal(formatWhen("2025-11-07T11:20:00Z", "en", now), "7 Nov 2025 · 14:20");
  assert.equal(formatDay("2026-11-07T11:20:00Z", "en", now), "7 Nov");
  assert.equal(formatDay("2025-03-02T08:00:00Z", "en", now), "2 Mar 2025");
  assert.equal(formatWhen(null, "en"), "");
  assert.equal(formatWhen("not a time", "ar"), "");
  assert.doesNotMatch(formatWhen("2026-11-07T11:20:00Z", "ar", now), /[٠-٩]/);
});

test("a step is worded by the screen in Arabic and by the log in English", () => {
  assert.deepEqual(stepKind("connector.snapshot"), { kind: "snapshot" });
  assert.deepEqual(stepKind("rules.presence"), { kind: "rules", family: "presence" });
  assert.deepEqual(stepKind("rules.evaluate"), { kind: "rules", family: null });
  assert.deepEqual(stepKind("something.else"), { kind: "other", word: null });
  assert.deepEqual(stepKind("score.compute"), { kind: "other", word: "score" });
  const step = (tool, summary) => ({ seq: 1, tool, summary, ok: true, started_at: null, ended_at: null });
  assert.deepEqual(stepText(step("connector.snapshot", "Read 5 places."), "en"), { text: "Read 5 places.", foreign: false });
  assert.deepEqual(stepText(step("connector.snapshot", "Read 5 places."), "ar"), { text: T.ar.stepSnapshot, foreign: false });
  assert.deepEqual(stepText(step("rules.reviews", ""), "en"), { text: T.en.stepRules("reviews"), foreign: false });
  assert.deepEqual(stepText(step("x.y", "Did a thing."), "ar"), { text: "Did a thing.", foreign: true });
});

test("small helpers", () => {
  assert.ok(isNumeric("+974 4412 3456"));
  assert.ok(isNumeric("08:00"));
  assert.ok(!isNumeric("08:00 to 20:00"));
  assert.ok(!isNumeric("Al Wakra"));
  assert.ok(isSample({ kind: "sample", on: true }));
  assert.ok(!isSample({ kind: "places", on: true }));
  assert.ok(!isSample(null));
});

// ── the styles ──────────────────────────────────────────

test("the styles hold no colour and no physical direction", () => {
  const css = read(join(HERE, "discovery.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "a hex colour");
  assert.doesNotMatch(css, /\brgba?\(|\bhsla?\(/, "a colour function");
  assert.doesNotMatch(css, /font-family:(?!\s*var\()/, "a font that is not a token");
  const physical = css.match(/\b(margin|padding|border)-(left|right)\b|(^|[;{\s])(left|right)\s*:|text-align:\s*(left|right)|\bfloat:|(^|[\s;{])(width|height|min-width|max-width|min-height|max-height)\s*:/m);
  assert.equal(physical, null, `a physical property: ${physical?.[0]}`);
});
