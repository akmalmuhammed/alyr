// The Discovery screens' pure parts and their words (ALY-322, spec 065; ALY-324, spec 066). Run
// with `node --test` from apps/web (Node 22.18 or newer reads the .ts files as they are): the copy
// is complete in both languages and says nothing the product may not say, the address and the menu
// route the views and leave every other section alone, the client's parsers turn the spec's shapes
// into what the screens read (and never invent a number or a permission), what a person may do
// with a change is only what the API says, an approval is made in one place and carries the hash of
// the change shown, a fact is typed and checked the way the API checks it, and the styles hold no
// colour and no physical direction.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  DiscoveryError, errorFrom, parseConnection, parseFact, parseFacts, parseFinding, parseFindings, parseManagers, parseOverview, parsePlaces,
  parseProposal, parseProposalDetail, parseProposals, parseReport, parseReviews, parseRun, parseSettings, parseTeam,
} from "./discoveryApi.ts";
import { T } from "./discoveryCopy.ts";
import {
  MAX_POLLS, VIEWS, appliedNoteKey, averageText, eventAt, formatDay, formatDayLong, formatWhen, groupByKind, homeState, hoursDraft, hoursText,
  hoursValue, isLive, isNumeric, isSample, lastMonths, liveProposals, mayApprove, minutesFrom, monthName, normalizeTime, phoneValue,
  pollDecision, proposalPillClass, proposalPollDecision, proposalWhen, readView, reviewQuery, sayError, stepKind, stepText, subItems,
  tabCount, textFact, verifiedAt, viewHref, viewsFor, waitingProposals, withChange,
} from "./discoveryLogic.ts";

const HERE = import.meta.dirname;
const REPO = join(HERE, "../../../../..");
const read = (path) => readFileSync(path, "utf8");

// ── the words ───────────────────────────────────────────

/** Every line of a copy object as text: functions are called with sample arguments. */
const SAMPLES = {
  rowWhen: [["proposed", "Tue 24 Nov"], ["approved", "9 Nov"], ["applied", "9 Nov"], ["declined", "9 Nov"], ["expired", "23 Nov"], ["undone", "17 Nov"], ["failed", "9 Nov"]],
  fieldAt: [["Opening hours", "the listing"]], expiresOn: [["Tue 24 Nov"]],
  stepApproved: [["Huda", "whatsapp"], ["Huda", "portal"], ["", ""]],
  appliedLine: [["9 Nov · 09:12", "Huda", "whatsapp"], ["9 Nov · 09:12", "Huda", "portal"], ["9 Nov · 09:12", "", ""]],
  declinedLine: [["9 Nov · 09:12", "Huda", "portal"], ["9 Nov · 09:12", "", ""]],
  undoUntil: [["16 Nov"]], verifyConfirmedOn: [["12 Nov"]], verifyNotOn: [["12 Nov"]], expiredLine: [["23 Nov"]], undoneLine: [["17 Nov"], [""]],
  undoneNote: [["the listing"]], managersFor: [["Nuqta Car Care - Al Sadd"]], last4: [["0112"]], confirmedBy: [["Huda", "9 Nov"]], confirmedOnly: [["9 Nov"]],
  proposalCount: [["live", 0], ["live", 1], ["live", 2], ["live", 3], ["live", 11], ["done", 1], ["done", 2], ["done", 5], ["closed", 1], ["closed", 2], ["closed", 12]],
  factTooLong: [[80], [160]],
};

function lines(object, path = "") {
  const out = [];
  for (const [key, value] of Object.entries(object)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof value === "string") out.push([here, value]);
    else if (typeof value === "function" && SAMPLES[key]) {
      for (const args of SAMPLES[key]) out.push([`${here}(${args.join(",")})`, String(value(...args))]);
    } else if (typeof value === "function") {
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
    assert.doesNotMatch(text, /\b(coming|beta|connect (to )?google)\b/i, `en.${path}: ${text}`);
    // The product does not speak of itself in the first person, and does not promise magic (spec 066 "Copy rules").
    // "I did this" is the owner's own word on a button of Phase 1, so it is the one first person there is.
    if (!path.startsWith("didThis")) assert.doesNotMatch(text, /\b(I|we|our|ours|magic|automatically|optimi[sz]e)\b/, `en.${path}: ${text}`);
  }
  for (const [path, text] of lines(T.ar)) {
    const tokens = arabicTokens(text);
    for (const word of ar) assert.ok(!tokens.includes(word.replace(/^ال/, "")), `«${word}» in ar.${path}: ${text}`);
    assert.doesNotMatch(text, /قريباً|الذكاء|ذكي|تلقائياً/, `ar.${path}: ${text}`);
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
  assert.deepEqual([...VIEWS], ["home", "todo", "proposals", "reviews", "reports", "answers", "settings"]);
  for (const view of VIEWS) assert.equal(readView(view), view);
  for (const odd of [null, undefined, "", "TODO", "home&x=1", "ai", "approve"]) assert.equal(readView(odd), "home");
  // Settings is for the owner and an admin: for anyone else the address that names it is Home.
  assert.equal(readView("settings", false), "home");
  assert.equal(readView("proposals", false), "proposals");
  assert.deepEqual([...viewsFor(false)], ["home", "todo", "proposals", "reviews", "reports"]);
  assert.deepEqual([...viewsFor(true)], [...VIEWS]);
  assert.equal(viewHref("home"), "/app/discovery");
  assert.equal(viewHref("todo"), "/app/discovery?view=todo");
  assert.equal(viewHref("proposals", { p: "abc" }), "/app/discovery?view=proposals&p=abc");
  assert.equal(viewHref("todo", { finding: "f 1" }), "/app/discovery?view=todo&finding=f+1");
  assert.equal(viewHref("reports", { finding: "" }), "/app/discovery?view=reports");
});

test("only Discovery has views beneath it in the menu; every other section has none", () => {
  assert.deepEqual([...subItems("discovery")], ["home", "todo", "proposals", "reviews", "reports", "answers"]);
  assert.deepEqual([...subItems("discovery", true)], ["home", "todo", "proposals", "reviews", "reports", "answers", "settings"]);
  for (const key of ["home", "inbox", "orders", "bookings", "catalog", "documents", "ledger", "team", "products", "connections", "account", "connect", "unsent", ""]) {
    assert.deepEqual([...subItems(key)], [], key);
    assert.deepEqual([...subItems(key, true)], [], key);
  }
});

test("the shell draws a sub-list only for an item that has views", () => {
  const shell = read(join(HERE, "../app/[[...section]]/page.tsx"));
  assert.match(shell, /subItems\(item\.key, state\.can_manage\)\.length > 0 && section === item\.key/);
  assert.match(shell, /return withViews \? \[link, <SubNav/);
  // The palette adds rows only through subItems too.
  assert.match(shell, /\.\.\.subItems\(item\.key, state\?\.can_manage \?\? false\)\.map/);
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

// ── Phase 2: proposals, facts, settings ─────────────────

const SIDE = (text, lines = []) => ({ text, lines });
const HOURS_LINES = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"].map((day) => ({ day, text: day === "fri" ? "13:00 to 22:00" : "07:00 to 22:00" }));
const PROPOSAL = {
  id: "pr1", finding_id: "f1", rule_id: "hours_missing", type: "set_hours", target: "listing", status: "proposed", severity: "high",
  title: "Set the opening hours at Nuqta Car Care - Al Sadd", why: "Customers cannot tell when the branch is open.",
  rule: "The listing shows no opening hours, and you confirmed this branch's hours.",
  location: { id: "p1", name: "Nuqta Car Care - Al Sadd" }, field: "hours", field_label: "Opening hours", where: "the listing",
  before: SIDE("none"), after: SIDE("Sat to Thu 07:00 to 22:00; Fri 13:00 to 22:00", HOURS_LINES), change_hash: "e3b0c442", context: null,
  evidence: [{ label: "Opening hours", value: "none", where: "Google listing", seen_at: "2026-11-09T08:00:00Z" }],
  proposer: "engine", proposed_at: "2026-11-09T08:00:03Z", expires_at: "2026-11-23T08:00:03Z", decided: null, applied_at: null, undo_until: null,
  failure: null, verification: null, sample: true, can: { approve: true, decline: true, undo: false }, already: false,
};

test("a proposal is read as the spec writes it, and what a person may do is only what the API says", () => {
  const p = parseProposal(PROPOSAL);
  assert.equal(p.title, "Set the opening hours at Nuqta Car Care - Al Sadd");
  assert.equal(p.before.text, "none");
  assert.equal(p.before.lines.length, 0);
  assert.equal(p.after.lines.length, 7);
  assert.deepEqual(p.after.lines[6], { day: "fri", text: "13:00 to 22:00" });
  assert.equal(p.sample, true);
  assert.equal(p.change_hash, "e3b0c442");
  assert.deepEqual(p.can, { approve: true, decline: true, undo: false });
  assert.equal(p.already, false);
  // every state is read, and one that is not a state is refused
  for (const status of ["proposed", "approved", "declined", "expired", "applied", "failed", "undone"]) assert.equal(parseProposal({ ...PROPOSAL, status }).status, status);
  assert.throws(() => parseProposal({ ...PROPOSAL, status: "auto_approved" }), DiscoveryError);
  assert.throws(() => parseProposal({ ...PROPOSAL, id: "" }), DiscoveryError);
  // nothing is allowed that the answer does not say, however the rest looks
  const none = parseProposal({ ...PROPOSAL, can: undefined });
  assert.deepEqual(none.can, { approve: false, decline: false, undo: false });
  assert.equal(mayApprove(none), false);
  assert.deepEqual(parseProposal({ ...PROPOSAL, can: { approve: "yes", decline: 1, undo: "true" } }).can, { approve: false, decline: false, undo: false });
  // a line for a day that is not a day is dropped
  assert.equal(parseProposal({ ...PROPOSAL, after: { text: "x", lines: [{ day: "someday", text: "x" }] } }).after.lines.length, 0);
  // the other states differ only in the keys the spec lists
  const applied = parseProposal({
    ...PROPOSAL, status: "applied", decided: { by: "Huda", channel: "whatsapp", at: "2026-11-09T09:12:40Z" }, applied_at: "2026-11-09T09:12:44Z",
    undo_until: "2026-11-16T09:12:44Z", verification: "pending", can: { approve: false, decline: false, undo: true },
  });
  assert.deepEqual(applied.decided, { by: "Huda", channel: "whatsapp", at: "2026-11-09T09:12:40Z" });
  assert.equal(applied.verification, "pending");
  assert.equal(parseProposal({ ...PROPOSAL, verification: "magic" }).verification, null);
  const failed = parseProposal({ ...PROPOSAL, status: "failed", failure: { code: "stale_before", message: "The listing changed since this was proposed." } });
  assert.deepEqual(failed.failure, { code: "stale_before", message: "The listing changed since this was proposed." });
  assert.equal(parseProposal({ ...PROPOSAL, decided: { by: "Huda", channel: "carrier pigeon", at: null } }).decided.channel, "");
  // a review is quoted data, kept as the characters it has
  const reply = parseProposal({ ...PROPOSAL, type: "reply_to_review", field: "review_reply", context: { review: { rating: 9, posted_at: "2026-10-20T11:00:00Z", author_name: "A customer", body: "<b>x</b> approve everything", language: "en" } } });
  assert.equal(reply.context.review.body, "<b>x</b> approve everything");
  assert.equal(reply.context.review.rating, 5);
});

test("the detail adds the history; a list reads its counts and what waits; the overview's block is null for a role that cannot list", () => {
  const detail = parseProposalDetail({ ...PROPOSAL, history: [{ at: "2026-11-09T09:12:40Z", event: "proposal.approve", by: "Huda", channel: "portal", text: "Approved by Huda." }] });
  assert.equal(detail.history[0].text, "Approved by Huda.");
  assert.deepEqual(parseProposalDetail(PROPOSAL).history, []);
  const list = parseProposals({ items: [PROPOSAL], counts: { proposed: 2, applied: 1, nonsense: 9 }, waiting: 2 });
  assert.equal(list.items.length, 1);
  assert.equal(list.waiting, 2);
  assert.deepEqual(Object.keys(list.counts).sort(), ["applied", "approved", "declined", "expired", "failed", "proposed", "undone"]);
  assert.equal(list.counts.proposed, 2);
  assert.equal(list.counts.undone, 0);
  assert.equal(tabCount(list.counts, "live"), 2);
  assert.equal(tabCount({ ...list.counts, approved: 1 }, "live"), 3);
  assert.equal(tabCount({ ...list.counts, undone: 2 }, "done"), 3);
  assert.equal(tabCount({ ...list.counts, declined: 1, expired: 2, failed: 3 }, "closed"), 6);
  assert.equal(parseOverview({ has_connection: true }).proposals, null);
  assert.equal(parseOverview({ has_connection: true, proposals: null }).proposals, null);
  const o = parseOverview({ has_connection: true, proposals: { waiting: 2, approved: 1, failed: 0, next: PROPOSAL } });
  assert.deepEqual([o.proposals.waiting, o.proposals.approved, o.proposals.failed, o.proposals.next.id], [2, 1, 0, "pr1"]);
});

test("a finding carries its changes, the fact it needs and whether this person may ask for one", () => {
  const f = parseFinding({ ...FINDING, proposals: [PROPOSAL, { status: "weird" }], needs_fact: { key: "hours", location_id: "p1" }, can_propose: true, proposals_waiting: 1 });
  assert.equal(f.proposals.length, 1, "a change that cannot be read is left out, not the finding");
  assert.deepEqual(f.needs_fact, { key: "hours", location_id: "p1" });
  assert.equal(f.can_propose, true);
  assert.equal(f.proposals_waiting, 1);
  const plain = parseFinding(FINDING);
  assert.deepEqual([plain.proposals, plain.needs_fact, plain.can_propose, plain.proposals_waiting], [[], null, false, 0]);
  assert.equal(parseFinding({ ...FINDING, needs_fact: { key: "shoe_size", location_id: "p1" } }).needs_fact, null);
  // what waits, what is live, which rows carry the tag
  const mixed = parseFinding({ ...FINDING, proposals: [PROPOSAL, { ...PROPOSAL, id: "pr2", status: "approved" }, { ...PROPOSAL, id: "pr3", status: "applied", verification: "confirmed" }] });
  assert.deepEqual(waitingProposals(mixed).map((p) => p.id), ["pr1"]);
  assert.deepEqual(liveProposals(mixed).map((p) => p.id), ["pr1", "pr2"]);
  assert.equal(isLive(mixed.proposals[2]), false);
  assert.equal(appliedNoteKey(mixed), "confirmed");
  assert.equal(appliedNoteKey(plain), null);
  assert.equal(appliedNoteKey(parseFinding({ ...FINDING, proposals: [{ ...PROPOSAL, status: "applied" }] })), "none");
  assert.deepEqual(withChange([plain, mixed, parseFinding({ ...FINDING, id: "f9", proposals_waiting: 2 })]).map((x) => x.id), ["f1", "f9"]);
});

test("Approve is drawn only where the API says so, for a change that waits or is to be tried again, and carries a hash", () => {
  const p = (patch) => parseProposal({ ...PROPOSAL, ...patch });
  assert.equal(mayApprove(p({})), true);
  assert.equal(mayApprove(p({ status: "failed", can: { approve: true, decline: true, undo: false } })), true);
  for (const status of ["approved", "applied", "declined", "expired", "undone"]) assert.equal(mayApprove(p({ status })), false, status);
  assert.equal(mayApprove(p({ can: { approve: false, decline: true, undo: false } })), false);
  assert.equal(mayApprove(p({ change_hash: "" })), false);
});

test("a change that was approved is asked about until it is applied or has failed, and never for ever", () => {
  const at = (status) => ({ status });
  assert.equal(proposalPollDecision(at("approved"), 0), "poll");
  assert.equal(proposalPollDecision(at("approved"), MAX_POLLS - 1), "poll");
  assert.equal(proposalPollDecision(at("approved"), MAX_POLLS), "slow");
  for (const status of ["proposed", "applied", "failed", "declined", "expired", "undone"]) assert.equal(proposalPollDecision(at(status), 3), "stop", status);
  assert.equal(proposalPollDecision(null, 0), "stop");
});

test("the pill of a status says it in colour only beside its word", () => {
  assert.deepEqual(["proposed", "approved", "applied", "failed", "declined", "expired", "undone"].map(proposalPillClass), ["wait", "wait", "active", "bad", "quiet", "quiet", "quiet"]);
  for (const lang of ["en", "ar"]) for (const status of ["proposed", "approved", "applied", "failed", "declined", "expired", "undone"]) assert.ok(T[lang].proposalStatus[status].length > 0);
});

test("the history says when a check-up verified, and when a change was undone", () => {
  const history = [
    { at: "2026-11-09T09:12:44Z", event: "proposal.apply", by: "ALYR", channel: "system", text: "Applied." },
    { at: "2026-11-12T08:01:00Z", event: "proposal.verify", by: "ALYR", channel: "system", text: "Confirmed." },
    { at: "2026-11-13T08:01:00Z", event: "proposal.undo", by: "Huda", channel: "portal", text: "Undone." },
  ];
  assert.equal(verifiedAt(history), "2026-11-12T08:01:00Z");
  assert.equal(eventAt(history, /undo/i), "2026-11-13T08:01:00Z");
  assert.equal(verifiedAt([]), null);
  assert.equal(verifiedAt([{ at: null, event: "proposal.verify", by: "", channel: "", text: "" }]), null);
});

test("a row says when, by its status, and a long date has its weekday", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  assert.equal(formatDayLong("2026-11-24T08:00:03Z", "en", now), "Tue 24 Nov");
  assert.match(formatDayLong("2026-11-24T08:00:03Z", "ar", now), /^الثلاثاء 24 نوفمبر$/);
  assert.equal(formatDayLong("2027-01-05T08:00:00Z", "en", now), "Tue 5 Jan 2027");
  assert.equal(formatDayLong(null, "en"), "");
  assert.equal(formatDayLong("nonsense", "ar"), "");
  const p = (patch) => parseProposal({ ...PROPOSAL, ...patch });
  assert.equal(proposalWhen(p({}), "en", now), "Mon 23 Nov");
  assert.equal(proposalWhen(p({ status: "applied", applied_at: "2026-11-09T09:12:44Z" }), "en", now), "9 Nov");
  assert.equal(proposalWhen(p({ status: "declined", decided: { by: "Huda", channel: "portal", at: "2026-11-10T09:00:00Z" } }), "en", now), "10 Nov");
  assert.equal(proposalWhen(p({ status: "undone" }), "en", now), "", "an undone change with no undo time says no date, not a wrong one");
  assert.equal(T.en.rowWhen("proposed", "Tue 24 Nov"), "Waiting until Tue 24 Nov");
});

test("hours are said as the API says them: runs of the same hours, closed days, none", () => {
  const week = { sat: ["07:00", "22:00"], sun: ["07:00", "22:00"], mon: ["07:00", "22:00"], tue: ["07:00", "22:00"], wed: ["07:00", "22:00"], thu: ["07:00", "22:00"], fri: ["13:00", "22:00"] };
  assert.equal(hoursText(week, "en"), "Sat to Thu 07:00 to 22:00; Fri 13:00 to 22:00");
  assert.equal(hoursText({ ...week, fri: null }, "en"), "Sat to Thu 07:00 to 22:00; Fri closed");
  assert.equal(hoursText(week, "ar"), "السبت إلى الخميس 07:00 إلى 22:00؛ الجمعة 13:00 إلى 22:00");
  assert.equal(hoursText({}, "en"), "none");
  assert.equal(hoursText({}, "ar"), "لا شيء");
  assert.equal(hoursText({ ...week, sun: ["08:00", "20:00"] }, "en"), "Sat 07:00 to 22:00; Sun 08:00 to 20:00; Mon to Thu 07:00 to 22:00; Fri 13:00 to 22:00");
});

test("a fact is typed and checked the way the API checks it", () => {
  assert.equal(normalizeTime("7:00"), "07:00");
  assert.equal(normalizeTime(" 22:30 "), "22:30");
  for (const bad of ["24:00", "7", "07:60", "7pm", "", "07:00:00"]) assert.equal(normalizeTime(bad), null, bad);
  const draft = hoursDraft(null);
  assert.deepEqual(Object.keys(draft), ["sat", "sun", "mon", "tue", "wed", "thu", "fri"]);
  const empty = hoursValue(draft);
  assert.equal(empty.value, null);
  assert.equal(empty.errors.sat.open, "required");
  const open = Object.fromEntries(Object.keys(draft).map((d) => [d, { closed: false, open: "7:00", close: "22:00" }]));
  open.fri = { closed: true, open: "", close: "" };
  const ok = hoursValue(open);
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.value.sat, ["07:00", "22:00"]);
  assert.equal(ok.value.fri, null);
  assert.deepEqual(Object.keys(ok.value), ["sat", "sun", "mon", "tue", "wed", "thu", "fri"], "all seven days are sent");
  // close must be after open, on the same day; times must be times
  assert.equal(hoursValue({ ...open, mon: { closed: false, open: "22:00", close: "07:00" } }).errors.mon.close, "order");
  assert.equal(hoursValue({ ...open, mon: { closed: false, open: "22:00", close: "22:00" } }).errors.mon.close, "order");
  assert.equal(hoursValue({ ...open, mon: { closed: false, open: "7am", close: "22:00" } }).errors.mon.open, "time");
  assert.equal(hoursValue({ ...open, mon: { closed: false, open: "07:00", close: "" } }).errors.mon.close, "required");
  // a fact that is already confirmed fills the form back in
  const back = hoursDraft({ ...ok.value });
  assert.deepEqual(back.sat, { closed: false, open: "07:00", close: "22:00" });
  assert.equal(back.fri.closed, true);
  // phone: + and 7 to 15 digits
  assert.equal(phoneValue("+974 5555 0112"), "+97455550112");
  assert.equal(phoneValue("+(974) 5555-0112"), "+97455550112");
  for (const bad of ["97455550112", "+12345", "+1234567890123456", "+974 abc", ""]) assert.equal(phoneValue(bad), null, bad);
  assert.deepEqual(textFact("phone", "+974 5555 0112"), { value: { phone: "+97455550112" }, error: null });
  assert.deepEqual(textFact("whatsapp", "+974 5555 0150"), { value: { phone: "+97455550150" }, error: null });
  assert.equal(textFact("phone", "5555").error, "phone");
  assert.deepEqual(textFact("category", "  Car wash "), { value: { category: "Car wash" }, error: null });
  assert.equal(textFact("category", "x".repeat(81)).error, "long");
  assert.equal(textFact("category", "x".repeat(80)).error, null);
  assert.equal(textFact("name", "x".repeat(161)).error, "long");
  assert.equal(textFact("name", "   ").error, "required");
});

test("facts, settings, managers and the team are read, and what is missing is never a permission", () => {
  const fact = parseFact({ location_id: "p1", key: "hours", value: { sat: ["07:00", "22:00"] }, source: "owner", confirmed_by_name: "Huda", confirmed_at: "2026-11-09T08:00:00Z", default: false });
  assert.deepEqual([fact.key, fact.source, fact.confirmed_by_name, fact.default], ["hours", "owner", "Huda", false]);
  assert.throws(() => parseFact({ key: "shoe_size" }), DiscoveryError);
  assert.equal(parseFacts({ items: [{ key: "name", value: { name: "Nuqta" }, default: true }, { key: "nonsense" }] }).length, 1);
  assert.equal(parseFacts({}).length, 0);
  const s = parseSettings({ ask_cap_per_day: 9, weekly_run: true, template_ready: false, receivers: [{ contact_id: "c1", name: "Huda", last4: "0112", linked: true, receives: true }, { name: "no id" }] });
  assert.equal(s.ask_cap_per_day, 5);
  assert.equal(parseSettings({ ask_cap_per_day: 0 }).ask_cap_per_day, 1);
  assert.equal(parseSettings({}).ask_cap_per_day, 3);
  assert.deepEqual([s.weekly_run, s.template_ready, s.receivers.length], [true, false, 1]);
  assert.deepEqual(parseSettings({}).receivers, []);
  assert.equal(parseSettings({}).weekly_run, false);
  assert.deepEqual(parseManagers({ items: [{ user_id: "u1", name: "Yusuf" }, { name: "x" }] }), [{ user_id: "u1", name: "Yusuf" }]);
  assert.deepEqual(parsePlaces([{ id: "p1", name: "A", managers: [{ user_id: "u1", name: "Yusuf" }] }])[0].managers, [{ user_id: "u1", name: "Yusuf" }]);
  assert.equal(parsePlaces([{ id: "p1", name: "A" }])[0].managers, null, "a place that does not say who manages it is not drawn with a picker");
  assert.deepEqual(parseTeam({ members: [{ id: "u1", name: "Yusuf", role: "agent" }, { id: "u2", name: "Hana", role: "owner" }, { name: "x" }] }).map((m) => m.role), ["agent", "owner"]);
});

test("a refusal that asks for a fact carries which one, and a change that moved says so in words of ours", () => {
  const e = errorFrom(422, { detail: { code: "needs_fact", message: "Confirm the hours.", message_ar: "أكّد الساعات.", key: "hours", location_id: "p1" } });
  assert.deepEqual([e.code, e.extra.key, e.extra.location_id], ["needs_fact", "hours", "p1"]);
  const flat = errorFrom(422, { detail: "Confirm the hours.", code: "needs_fact", key: "phone", location_id: "p2" });
  assert.deepEqual([flat.extra.key, flat.extra.location_id], ["phone", "p2"]);
  for (const code of ["proposal_changed", "proposal_closed"]) {
    assert.equal(sayError(errorFrom(409, { detail: { code, message: "x", message_ar: "س" } }), "en"), T.en.errors[code]);
    assert.equal(sayError(errorFrom(409, { detail: { code, message: "x", message_ar: "س" } }), "ar"), T.ar.errors[code]);
  }
  assert.equal(sayError(errorFrom(409, { detail: { code: "retry_limit", message: "Tried three times.", message_ar: "جُرّب ثلاث مرات." } }), "en"), "Tried three times.");
});

test("the guarantee and the sample line are the spec's words, word for word", () => {
  assert.equal(T.en.guarantee, "Nothing is applied without your tap.");
  assert.equal(T.ar.guarantee, "لا يُطبَّق شيء قبل أن تضغط.");
  assert.equal(T.en.sampleChange, "Sample business: this changes the made-up listing inside ALYR, not anything on Google.");
  assert.equal(T.ar.sampleChange, "نشاط توضيحي: هذا يغيّر ملفاً تجارياً وهمياً داخل ALYR، ولا يغيّر شيئاً في Google.");
  assert.equal(T.en.ownerApproves, "The owner approves changes.");
  assert.equal(T.en.views.proposals, "Proposals");
  assert.equal(T.ar.views.proposals, "التعديلات المقترحة");
  assert.equal(T.en.groups.agent, "ALYR can change this after you approve");
  assert.equal(T.ar.groups.agent, "يمكن لـALYR تعديل هذا بعد موافقتك");
  assert.equal(T.en.reviewChanges(3), "Review 3 changes");
  assert.equal(T.en.reviewChanges(1), "Review 1 change");
  assert.equal(T.ar.reviewChanges(1), "مراجعة تعديل واحد");
  assert.equal(T.ar.reviewChanges(2), "مراجعة تعديلين");
  assert.equal(T.ar.reviewChanges(3), "مراجعة 3 تعديلات");
  assert.equal(T.ar.reviewChanges(11), "مراجعة 11 تعديلاً");
  assert.equal(T.en.waitingN(2), "2 waiting");
  assert.equal(T.ar.waitingN(2), "اثنان بالانتظار");
});

// ── Phase 2: where an approval is made ──────────────────

test("an approval is made in one place: a tap on the exact change, carrying its hash", () => {
  const files = readdirSync(HERE).filter((f) => /^Discovery.*\.tsx$/.test(f) || f === "discoveryUi.tsx");
  const callers = files.filter((f) => /discovery\.approve\(/.test(read(join(HERE, f))));
  assert.deepEqual(callers, ["DiscoveryApproval.tsx"], "only the approval sheet calls approve");
  const sheet = read(join(HERE, "DiscoveryApproval.tsx"));
  // it sends the hash of the change that was shown, and only when the person may approve it
  assert.match(sheet, /mayApprove\(p\)\) void act\("approve", \(\) => discovery\.approve\(lang, p\.id, p\.change_hash\)\)/);
  // the button is disabled while a request runs, and it is the one Volt button of the sheet
  assert.match(sheet, /className="btn volt ct-btn" disabled=\{busy !== ""\} onClick=\{approve\}/);
  assert.equal((sheet.match(/btn volt/g) ?? []).length, 1);
  // nothing approves by itself: no timer, no effect, no automatic call
  assert.doesNotMatch(sheet.replace(/\/\/.*$/gm, ""), /useEffect\([^)]*approve|setTimeout\([^)]*approve|setInterval\([^)]*approve/s);
  // the client has no way to approve without a hash
  assert.match(read(join(HERE, "discoveryApi.ts")), /approve: \(lang: Lang, id: string, change_hash: string\)/);
});

test("reviewer text and every value from outside is drawn as text, never as markup", () => {
  for (const file of readdirSync(HERE).filter((f) => /^Discovery.*\.tsx$/.test(f) || f === "discoveryUi.tsx")) {
    assert.doesNotMatch(read(join(HERE, file)), /dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML/, file);
  }
});

test("the confirmed fact and the reply are the only things sent from a person's typing, and the change itself is never sent", () => {
  const api = read(join(HERE, "discoveryApi.ts"));
  // the change a person approves is identified by its id and hash; its before and after are never posted back
  assert.match(api, /call\(`\/proposals\/\$\{encodeURIComponent\(id\)\}\/approve\$\{q\(\{ lang \}\)\}`, parseProposal, "POST", \{ change_hash \}\)/);
  assert.doesNotMatch(api, /\/proposals[^`]*`, parseProposal, "(POST|PUT)", \{[^}]*(after|before)/);
});
