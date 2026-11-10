// The connected-apps screen's pure parts and its words (ALY-292, specs/067-mcp-connector). Run with
// `node --test` from apps/web (Node 22.18 or newer reads the .ts files as they are): the copy is
// complete in both languages and says nothing the product may not say (no AI word beyond the owner's
// own tool, named once, and no promise of what is not built), the answers of the API are read without
// ever being trusted (a missing field, a name that tries to reorder a line), the screen's state follows
// the API's refusals, and the styles hold no colour and no physical direction.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { clean, endedCount, parseOverview, parseRows } from "./mcpApi.ts";
import { T } from "./mcpCopy.ts";
import {
  argsText, callOf, canOptIn, capIsRecent, day, endedLine, eventText, eventWhy, isManager, modeOf, newerOnly,
  sayError, screenFor, splitRows, usableAddress, when,
} from "./mcpLogic.ts";

const HERE = import.meta.dirname;
const read = (name) => readFileSync(join(HERE, name), "utf8");

// ── the words ───────────────────────────────────────────

/** Every line of a copy object as text: functions are called with sample arguments. */
function lines(object, path = "") {
  const out = [];
  for (const [key, value] of Object.entries(object)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof value === "string") out.push([here, value]);
    else if (Array.isArray(value)) value.forEach((v, i) => out.push([`${here}[${i}]`, v]));
    else if (typeof value === "function") {
      const sets = value.length === 3 ? [["Huda", "Dafira", "7 Nov"]] : value.length === 2 ? [["Huda", "7 Nov"], [1, 0], [3, 2], [12, 11]] : [[0], [1], [2], [3], [5], [10], [11], [12], ["Claude"], ["tool"]];
      for (const args of sets) {
        const out2 = value(...args);
        out.push([`${here}(${args.join(",")})`, String(out2)]);
      }
    } else if (value && typeof value === "object") out.push(...lines(value, here));
  }
  return out;
}
const keysOf = (object, path = "") => Object.entries(object).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keysOf(v, `${path}${k}.`) : [`${path}${k}`])).sort();

test("every line is in English and Arabic, and none is empty", () => {
  assert.deepEqual(keysOf(T.ar), keysOf(T.en));
  for (const lang of ["en", "ar"]) {
    for (const [where, line] of lines(T[lang])) {
      assert.ok(line.trim().length > 0, `${lang} ${where} is empty`);
      assert.ok(!/undefined|NaN|\[object/.test(line), `${lang} ${where} shows a hole: ${line}`);
    }
  }
  assert.equal(T.en.shared.length, T.ar.shared.length);
});

test("no line is cut with an ellipsis", () => {
  for (const lang of ["en", "ar"]) for (const [where, line] of lines(T[lang])) assert.ok(!/…|\.\.\./.test(line), `${lang} ${where} ends in an ellipsis`);
});

// The words the product may not say (alyr-design/honesty.md). The one thing allowed is the owner's own
// tool, named as "your own AI app, such as Claude or ChatGPT" in the screen's sentence and the link's.
// The owner's own sentence of consent, "I understand that ...", is a person speaking, not the product claiming to understand.
const OWN_WORDS = /I understand that/g;
const OWN_TOOL = [/[Yy]our own AI app, such as Claude or ChatGPT/g, /تطبيق الذكاء الاصطناعي الخاص بك، مثل Claude أو ChatGPT/g];
const BANNED_EN = /\b(AI|smart|intelligen\w*|learns?|understands?|thinks?|predicts?|forecasts?|notices?|assistant|agentic|copilot|magic)\b/i;
const BANNED_AR = /ذكي|ذكاء|يتعلم|يفهم|يتوقع|مساعد|وكيل|خوارزمية|سحر/;
const COMING = /coming soon|under development|beta|قريباً|قيد التطوير/i;

test("nothing says AI beyond the owner's own tool, and nothing is promised that is not built", () => {
  let named = 0;
  for (const lang of ["en", "ar"]) {
    for (const [where, line] of lines(T[lang])) {
      let rest = line.replace(OWN_WORDS, "");
      for (const own of OWN_TOOL) rest = rest.replace(own, () => { named += 1; return ""; });
      assert.ok(!(lang === "en" ? BANNED_EN : BANNED_AR).test(rest), `${lang} ${where} uses a word the product may not: ${line}`);
      assert.ok(!COMING.test(line), `${lang} ${where} promises something that is not built: ${line}`);
    }
  }
  // Twice per language: the sentence under the heading and the Connections link.
  assert.equal(named, 4, "the owner's own tool is named in exactly two places per language");
});

test("the screen says what an app is given, where it goes, and who may turn it on (D-170)", () => {
  const en = T.en.shared.join(" ");
  assert.match(en, /first name and the last three digits/);
  assert.match(en, /Message text, ID numbers and salaries are never given/);
  assert.match(en, /provider, under your own account/);
  assert.match(T.en.confirm, /leaves ALYR and is handled by the provider I use there, under my own account/);
  assert.match(T.en.offOther, /Only an owner can turn this on/);
  const ar = T.ar.shared.join(" ");
  assert.match(ar, /باسمه الأول وآخر ثلاثة أرقام/);
  assert.match(ar, /نص الرسائل/);
  assert.match(T.ar.offOther, /يفعّلها المالك فقط/);
  // ALYR does not run a model: the screen never says it does.
  assert.match(T.en.shared[3], /ALYR does not run your app/);
});

test("Arabic has no English but names, Western digits only, and agrees with its counts", () => {
  const allowed = new Set(["ALYR", "Claude", "ChatGPT"]);
  for (const [where, line] of lines(T.ar)) {
    assert.ok(!/[٠-٩]/.test(line), `${where} has Eastern digits`);
    assert.ok(!/\bQAR\b/.test(line), `${where} says QAR`);
    for (const word of line.match(/[A-Za-z]{2,}/g) ?? []) assert.ok(allowed.has(word) || /^(Huda|Dafira|tool|Nov)$/.test(word), `${where} has English: ${word}`);
  }
  assert.equal(T.ar.connCount(1), "تطبيق واحد متصل");
  assert.equal(T.ar.connCount(2), "تطبيقان متصلان");
  assert.equal(T.ar.connCount(3), "3 تطبيقات متصلة");
  assert.equal(T.ar.connCount(11), "11 تطبيقاً متصلاً");
  assert.equal(T.ar.endAllBody(2), "سينتهي اتصالان فوراً. يتوقف كل تطبيق إلى أن يُربط من جديد.");
  assert.equal(T.ar.records(1), "سجل واحد");
  assert.equal(T.ar.records(11), "11 سجلاً");
  assert.equal(T.en.connCount(1), "1 app connected");
  assert.equal(T.en.connCount(2), "2 apps connected");
});

test("every permission the API can name has its words, in both languages", () => {
  for (const scope of ["read", "stock", "bookings", "orders", "send"]) {
    assert.ok(T.en.scopeNames[scope] && T.ar.scopeNames[scope], scope);
  }
  for (const phase of ["read", "preview", "confirm"]) assert.ok(T.en.phase[phase] && T.ar.phase[phase], phase);
  for (const result of ["ok", "refused", "error", "capped", "bad_confirm", "over_size"]) assert.ok(T.en.result[result] && T.ar.result[result], result);
  for (const why of ["ended_by_workspace", "all_ended_by_workspace", "replaced", "request_reused", "code_reused", "refresh_reused", "person_removed", "revoked_by_app", "ended_by_alyr"]) {
    assert.ok(T.en.endedWhy[why] && T.ar.endedWhy[why], why);
  }
});

// ── what the API sends, read without trust ──────────────

const overview = {
  settings: { enabled: true, enabled_by: "Huda", enabled_at: "2026-11-09T08:00:00+00:00", paused: false, paused_by: null, paused_at: null, cap_hit_at: null },
  grants: [
    { id: "g1", client: "Claude", person: "Huda", scopes: ["read"], created_at: "2026-11-09T08:00:00+00:00", expires_at: "2027-02-07T08:00:00+00:00", last_used_at: null, revoked_at: null, revoked_by: null, revoked_why: null, live: true },
    { id: "g2", client: "ChatGPT", person: "Huda", scopes: ["read", "stock"], created_at: "2026-10-01T08:00:00+00:00", expires_at: "2027-01-01T08:00:00+00:00", last_used_at: "2026-10-05T09:00:00+00:00", revoked_at: "2026-10-06T09:00:00+00:00", revoked_by: "Huda", revoked_why: "ended_by_workspace", live: false },
  ],
  caps: { changes_per_day: 50, sends_per_day: 20 },
  address: "https://mcp.alyr.example/mcp", scopes: ["read", "stock", "bookings", "orders", "send"],
};

test("the overview is read into what the screen draws", () => {
  const o = parseOverview(overview);
  assert.equal(o.settings.enabled, true);
  assert.equal(o.settings.enabledBy, "Huda");
  assert.equal(o.grants.length, 2);
  assert.deepEqual(o.grants.map((g) => g.live), [true, false]);
  assert.equal(o.changesPerDay, 50);
  assert.equal(o.sendsPerDay, 20);
  assert.equal(o.address, "https://mcp.alyr.example/mcp");
});

test("a missing or odd answer becomes a quiet default, never a crash", () => {
  for (const odd of [null, undefined, "x", 3, [], {}, { settings: 4, grants: "no", caps: [] }, { grants: [null, 4, {}] }]) {
    const o = parseOverview(odd);
    assert.equal(o.settings.enabled, false);
    assert.equal(o.settings.paused, false);
    assert.deepEqual(o.grants, []);
    assert.equal(o.changesPerDay, null);
  }
  assert.deepEqual(parseRows(null), []);
  assert.deepEqual(parseRows({ calls: "no" }), []);
  assert.deepEqual(parseRows({ calls: [{}, null, { id: "r1" }] }).map((r) => r.id), ["r1"]);
  assert.equal(endedCount({ ended: 3 }), 3);
  assert.equal(endedCount({ ended: "3" }), 0);
  assert.equal(endedCount(null), 0);
});

test("a name from outside cannot reorder a line, and is cut to a size a person can read", () => {
  assert.equal(clean("My app‮dne‬"), "My appdne");
  assert.equal(clean("a​b⁦c⁩d\u0000e"), "abcde");
  assert.equal(clean("two\nlines", { lines: true }), "two\nlines");
  assert.equal(clean("two\nlines"), "twolines");
  const o = parseOverview({ ...overview, grants: [{ ...overview.grants[0], client: `<img src=x onerror=alert(1)>${"x".repeat(200)}` }] });
  assert.equal(o.grants[0].client.length, 80);
  assert.ok(o.grants[0].client.startsWith("<img src=x"), "markup is kept as the characters it is; React draws it as text");
});

test("what an app asked for is kept as text, cleaned and bounded, from an object or from a string", () => {
  const detail = { tool: "hello", args: { q: "a‮b", deep: { a: { b: { c: { d: { e: { f: 1 } } } } } }, list: Array.from({ length: 80 }, (_, i) => i) } };
  for (const given of [detail, JSON.stringify(detail)]) {
    const [row] = parseRows({ calls: [{ id: "r", grant_id: "g", action: "call", actor_name: "x", person: "Huda", at: "2026-11-09T08:00:00Z", detail: given }] });
    const call = callOf(row);
    assert.equal(call.tool, "hello");
    assert.equal(call.args.q, "ab");
    assert.equal(call.args.list.length, 50);
    assert.ok(argsText(call.args).includes('"q": "ab"'));
  }
  assert.equal(argsText(null), "");
  assert.equal(argsText({}), "");
  assert.equal(callOf({ detail: {} }).ms, null);
  assert.equal(callOf({ detail: { ms: 12.4, affects: 3, result: "ok", phase: "read", client: "Claude" } }).ms, 12);
});

test("the record's rows are two lists: requests and changes to the connection", () => {
  const rows = parseRows({ calls: [
    { id: "1", grant_id: "g1", action: "call", person: "Huda", at: "2026-11-09T10:00:00Z", detail: { tool: "hello", result: "ok" } },
    { id: "2", grant_id: "t", action: "paused", person: "Huda", at: "2026-11-09T09:00:00Z", detail: null },
    { id: "3", grant_id: "g2", action: "grant_revoked", person: "Huda", at: "2026-11-09T08:00:00Z", detail: { why: "ended_by_workspace" } },
    { id: "4", grant_id: "g2", action: "something_new", person: "", at: null, detail: {} },
  ] });
  const { calls, events } = splitRows(rows);
  assert.deepEqual(calls.map((r) => r.id), ["1"]);
  assert.deepEqual(events.map((r) => r.id), ["2", "3", "4"]);
  const grants = parseOverview(overview).grants;
  assert.equal(eventText(events[0], grants, T.en), "Huda paused all apps");
  assert.equal(eventText(events[1], grants, T.en), "Huda ended the connection of ChatGPT");
  assert.equal(eventText(events[1], grants, T.ar), "أنهى Huda اتصال ChatGPT");
  assert.equal(eventText(events[2], grants, T.en), "Recorded: something_new");
  assert.equal(eventWhy(events[1], T.en), "Ended in the workspace");
  assert.equal(eventWhy(events[0], T.en), "");
  assert.equal(eventText({ action: "grant_revoked", grantId: "gone", person: "", detail: {} }, grants, T.en), "Someone ended a connection");
});

// ── the screen's state ──────────────────────────────────

test("the API's refusals are states: 404 is not available here, 403 is not for you, the rest is an error", () => {
  assert.equal(screenFor({ status: 404, code: "" }), "unavailable");
  assert.equal(screenFor({ status: 403, code: "" }), "forbidden");
  assert.equal(screenFor({ status: 0, code: "offline" }), "error");
  assert.equal(screenFor({ status: 500 }), "error");
  assert.equal(screenFor(new Error("x")), "error");
  assert.equal(screenFor(null), "error");
});

test("the mode follows the opt-in and the kill switch, and only an owner may opt in", () => {
  const s = (enabled, paused) => ({ enabled, paused });
  assert.equal(modeOf(s(false, false)), "off");
  assert.equal(modeOf(s(false, true)), "off");
  assert.equal(modeOf(s(true, false)), "on");
  assert.equal(modeOf(s(true, true)), "paused");
  assert.equal(canOptIn("owner"), true);
  assert.equal(canOptIn("admin"), false);
  assert.equal(canOptIn("agent"), false);
  assert.equal(isManager("owner") && isManager("admin"), true);
  assert.equal(isManager("agent"), false);
});

test("an error says what happened in the person's words, never the server's", () => {
  assert.equal(sayError({ status: 0, code: "offline" }, T.en), T.en.offline);
  assert.equal(sayError({ status: 422, code: "must_confirm" }, T.ar), T.ar.mustTick);
  assert.equal(sayError({ status: 403, code: "owner_must_switch_on", message: "an owner must switch this on first" }, T.en), T.en.forbidden);
  assert.equal(sayError({ status: 404, code: "" }, T.en), T.en.alreadyEnded);
  assert.equal(sayError({ status: 500, code: "", message: "Traceback (most recent call last)" }, T.en), T.en.failed);
  assert.equal(sayError("odd", T.ar), T.ar.failed);
});

test("a daily limit is news for a day; only an https address is offered to copy", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  assert.equal(capIsRecent("2026-11-09T01:00:00Z", now), true);
  assert.equal(capIsRecent("2026-11-08T11:00:00Z", now), false);
  assert.equal(capIsRecent(null, now), false);
  assert.equal(capIsRecent("not a time", now), false);
  assert.equal(usableAddress("https://mcp.alyr.example/mcp"), "https://mcp.alyr.example/mcp");
  assert.equal(usableAddress("http://localhost:8000/mcp"), "http://localhost:8000/mcp");
  assert.equal(usableAddress("http://mcp.alyr.example/mcp"), "");
  assert.equal(usableAddress("javascript:alert(1)"), "");
  assert.equal(usableAddress("/mcp"), "");
  assert.equal(usableAddress(""), "");
});

test("a slower, older answer never overwrites a newer one", () => {
  const asked = newerOnly();
  const first = asked.next();
  const second = asked.next();
  assert.equal(asked.current(first), false);
  assert.equal(asked.current(second), true);
});

// ── times ───────────────────────────────────────────────

test("times are the shop's clock with Western digits in both languages", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  assert.equal(when("2026-11-09T11:20:00Z", "en", now), "9 Nov · 14:20");
  assert.match(when("2026-11-09T11:20:00Z", "ar", now), /^9 .+ · 14:20$/);
  assert.ok(!/[٠-٩]/.test(when("2026-11-09T11:20:00Z", "ar", now)));
  assert.equal(day("2027-02-07T08:00:00Z", "en", now), "7 Feb 2027");
  assert.equal(day("2026-11-12T08:00:00Z", "en", now), "12 Nov");
  assert.equal(day(null, "en", now), "");
  assert.equal(when("garbage", "en", now), "");
});

test("an ended connection says how it ended", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const [live, ended] = parseOverview(overview).grants;
  assert.equal(endedLine(ended, "en", T.en, now), "Ended in the workspace, by Huda, on 6 Oct");
  assert.equal(endedLine({ ...live, revokedAt: null, expiresAt: "2026-11-01T00:00:00Z" }, "en", T.en, now), "Expired on 1 Nov");
  assert.equal(endedLine({ ...ended, revokedWhy: "something_new", revokedBy: null }, "en", T.en, now), "Ended, on 6 Oct");
});

// ── the styles and the screen's markup ──────────────────

test("the styles hold no colour of their own and no physical direction", () => {
  const css = read("mcp.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), "a hex colour");
  assert.ok(!/\b(rgb|rgba|hsl)\(/.test(css), "a colour function");
  assert.ok(!/\b(margin|padding)-(left|right|top|bottom)\b|\b(left|right):\s|border-(left|right|top|bottom)\b|text-align:\s*(left|right)|\bfloat:/.test(css), "a physical direction");
  assert.ok(!/animation|@keyframes|infinite/.test(css), "nothing on this screen moves");
  assert.ok(!/font-family:\s*(?!var\()\S/.test(css), "a font named outside the tokens");
});

test("no component draws markup from the API, and every control has a name", () => {
  for (const name of ["Mcp.tsx", "McpConnections.tsx", "McpLog.tsx", "McpLink.tsx"]) {
    const source = read(name);
    assert.ok(!/dangerouslySetInnerHTML|innerHTML|\beval\(|new Function/.test(source), `${name} draws HTML`);
    assert.ok(!/["'`][^"'`\n]*\b(Anthropic|OpenAI)\b/.test(source), `${name} names a provider in code`);
  }
  // One Volt button in the status card, and none anywhere else on the screen.
  assert.equal((read("Mcp.tsx").match(/btn volt/g) ?? []).length, 2, "Turn on and Resume are the only Volt buttons, and never together");
  for (const name of ["McpConnections.tsx", "McpLog.tsx", "McpLink.tsx"]) assert.ok(!/btn volt|\bvolt\b/.test(read(name)), `${name} has Volt`);
});
