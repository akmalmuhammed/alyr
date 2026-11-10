// The Answers view's pure parts and its words (ALY-326, spec 068, D-168). Run with `node --test`
// from apps/web: the client reads the API's shape defensively and never gives a number to a share
// that was not measured, the view's state and its lines come from the API's data alone, the form
// sends only keys of the lists, the copy is whole in both languages and says nothing the product
// may not say (no AI, no assistant, no product's name, no model), the components hold no words of
// their own, and the styles hold no colour and no physical direction.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseAnswerItem, parseAnswers } from "./discoveryAnswersApi.ts";
import { A } from "./discoveryAnswersCopy.ts";
import { alsoNamedLine, answerKind, answersState, barWidth, canSave, draftOf, placeText, recent, settingsBody } from "./discoveryAnswersLogic.ts";
import { VIEWS, readView, stepKind, stepText, viewHref } from "./discoveryLogic.ts";
import { T } from "./discoveryCopy.ts";

const HERE = import.meta.dirname;
const REPO = join(HERE, "../../../../..");
const read = (path) => readFileSync(path, "utf8");

// ── what the API sends (spec 068, "GET /answers") ───────

const ITEM = {
  id: "a1", engine: "sample", engine_label: "Sample answers", question_key: "best", lang: "en", question: "best car care in Doha",
  status: "ok", error: null, named: true, position: 3, list_size: 5, matched: "Nuqta Car Care",
  competitors: ["Sahm Auto Spa", "Basma Car Spa"], text: "1. **Sahm Auto Spa** - x",
};
const BODY = {
  enabled: true, available: ["sample"],
  settings: { trade: "car_care", city: "doha", engines: ["sample"], monthly_ask_cap: 300, trade_label: "car care", city_label: "Doha" },
  options: { trades: [{ key: "car_care", label: "car care" }], cities: [{ key: "doha", label: "Doha" }, { key: "dubai", label: "Dubai" }] },
  engines: [{ kind: "sample", label: "Sample answers", sample: true, live: false }],
  questions: [{ key: "best", lang: "en", text: "best car care in Doha" }, { key: "best", lang: "ar", text: "أفضل خدمات العناية بالسيارات في الدوحة" }],
  last: { run_id: "r2", asked_at: "2026-11-10T12:00:00Z", named: 4, counted: 6, share: 67, measured: true, sample: true, answers: [ITEM], competitors: [{ name: "Sahm Auto Spa", answers: 4 }] },
  previous: { run_id: "r1", asked_at: "2026-11-03T12:00:00Z", named: 2, counted: 6, share: 33, measured: true },
  change: { share_change: 34, since_run_id: "r1" },
  history: [
    { run_id: "r2", asked_at: "2026-11-10T12:00:00Z", named: 4, counted: 6, share: 67, measured: true },
    { run_id: "r1", asked_at: "2026-11-03T12:00:00Z", named: 2, counted: 6, share: 33, measured: true },
  ],
  headline: "Named in 4 of 6 answers.", rule: "By rule: x", limits: "Names are matched as written.", caution: "A few points is not a trend.", sample_note: "Sample answers, made up for the sample business",
};

test("the API's answer is read as the spec writes it", () => {
  const v = parseAnswers(BODY);
  assert.equal(v.enabled, true);
  assert.deepEqual(v.available, ["sample"]);
  assert.equal(v.settings.trade, "car_care");
  assert.equal(v.options.cities.length, 2);
  assert.equal(v.last.share, 67);
  assert.equal(v.last.sample, true);
  assert.equal(v.last.answers[0].position, 3);
  assert.deepEqual(v.last.competitors, [{ name: "Sahm Auto Spa", answers: 4 }]);
  assert.deepEqual(v.change, { share_change: 34, since_run_id: "r1" });
  assert.equal(v.history.length, 2);
  assert.equal(v.headline, "Named in 4 of 6 answers.");
});

test("odd answers become nothing, never a crash", () => {
  for (const odd of [null, undefined, 3, "x", [], {}]) {
    const v = parseAnswers(odd);
    assert.equal(v.enabled, false);
    assert.equal(v.last, null);
    assert.deepEqual(v.history, []);
    assert.deepEqual(v.questions, []);
    assert.equal(v.settings.trade, null);
  }
  const v = parseAnswers({ ...BODY, last: { run_id: 5 }, history: [null, 3, { run_id: "x", counted: "many" }], questions: [{ text: "" }, 4], change: { share_change: "up" } });
  assert.equal(v.last, null);
  assert.equal(v.change, null);
  assert.equal(v.questions.length, 0);
  assert.deepEqual(v.history.map((h) => [h.run_id, h.counted, h.share]), [["x", 0, null]]);
});

test("a share that was not measured never has a number", () => {
  assert.equal(parseAnswers({ ...BODY, last: { ...BODY.last, measured: false } }).last.share, null);
  assert.equal(parseAnswers({ ...BODY, last: { ...BODY.last, share: null } }).last.measured, false);
  assert.equal(parseAnswers({ ...BODY, last: { ...BODY.last, share: 140 } }).last.share, 100);
  assert.equal(parseAnswers({ ...BODY, last: { ...BODY.last, share: -4 } }).last.share, 0);
  assert.equal(parseAnswers({ ...BODY, previous: { ...BODY.previous, measured: false } }).previous.share, null);
  assert.equal(barWidth(null), null);
  assert.equal(barWidth(66.6), 67);
  assert.equal(barWidth(300), 100);
  assert.equal(barWidth(Number.NaN), null);
});

test("an answer that could not be had names nothing and has no place", () => {
  const bad = parseAnswerItem({ ...ITEM, status: "error", error: "The source could not answer.", named: true, position: 2 });
  assert.equal(bad.status, "error");
  assert.equal(bad.named, false);
  assert.equal(bad.position, null);
  assert.equal(answerKind(bad), "notCounted");
  assert.equal(parseAnswerItem({ id: "" }), null);
  assert.equal(parseAnswerItem({ ...ITEM, position: 0 }).position, null);
  assert.deepEqual(parseAnswerItem({ ...ITEM, competitors: ["a", 3, "", "b"] }).competitors, ["a", "b"]);
});

test("an answer's text is kept exactly as it came, as data", () => {
  const hostile = "<script>alert(1)</script>\n1. **<b>X</b>** - [click](javascript:x)";
  assert.equal(parseAnswerItem({ ...ITEM, text: hostile }).text, hostile);
});

// ── the state and the lines ─────────────────────────────

test("the view is off, not asked, or asked", () => {
  assert.equal(answersState(parseAnswers({ ...BODY, enabled: false, last: null })), "off");
  assert.equal(answersState(parseAnswers({ ...BODY, enabled: false })), "off");
  assert.equal(answersState(parseAnswers({ ...BODY, last: null })), "notAsked");
  assert.equal(answersState(parseAnswers(BODY)), "asked");
});

test("where an answer named the business, in both languages", () => {
  const listed = parseAnswerItem(ITEM);
  assert.equal(placeText(listed, "en"), "3rd in a list of 5");
  assert.equal(placeText(listed, "ar"), "في المرتبة 3 ضمن قائمة من 5");
  const sentence = parseAnswerItem({ ...ITEM, position: null });
  assert.equal(placeText(sentence, "en"), "Named in a sentence, not in a list");
  assert.equal(placeText(parseAnswerItem({ ...ITEM, named: false, position: null }), "en"), "");
  assert.equal(answerKind(parseAnswerItem({ ...ITEM, named: false })), "notNamed");
  assert.equal(alsoNamedLine(listed), "Sahm Auto Spa · Basma Car Spa");
  // a position past the list's size is not drawn as one
  assert.equal(placeText(parseAnswerItem({ ...ITEM, position: 9, list_size: 5 }), "en"), "Named in a sentence, not in a list");
  for (const [n, word] of [[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [22, "22nd"]]) {
    assert.match(A.en.inList(n, 30), new RegExp(`^${word} `));
  }
});

test("the history is the API's, newest first, at most twelve", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ run_id: `r${i}` }));
  assert.equal(recent(many).length, 12);
  assert.equal(recent(many)[0].run_id, "r0");
  assert.equal(recent(many, 3).length, 3);
});

// ── the form sends only keys of the lists ───────────────

test("the settings call carries only what was chosen", () => {
  const view = parseAnswers(BODY);
  assert.deepEqual(draftOf(view), { trade: "car_care", city: "doha" });
  assert.equal(canSave(view, draftOf(view)), false);
  assert.equal(canSave(view, { trade: "car_care", city: "dubai" }), true);
  assert.equal(canSave(view, { trade: "", city: "dubai" }), false);
  assert.deepEqual(settingsBody({ trade: "car_care", city: "dubai" }), { trade: "car_care", city: "dubai" });
  assert.deepEqual(settingsBody({ trade: "", city: "" }, true), { enabled: true });
  assert.deepEqual(settingsBody({ trade: "x", city: "" }, false), { enabled: false, trade: "x" });
  const fresh = parseAnswers({ ...BODY, enabled: false, last: null, settings: { ...BODY.settings, trade: null, city: null } });
  assert.deepEqual(draftOf(fresh), { trade: "", city: "" });
});

// ── the address, the menu and the steps ─────────────────

test("Answers is a fifth view, with its own address", () => {
  assert.ok(VIEWS.includes("answers"));
  assert.equal(readView("answers"), "answers");
  assert.equal(viewHref("answers"), "/app/discovery?view=answers");
  assert.equal(T.en.views.answers, "Answers");
  assert.equal(T.ar.views.answers, "الإجابات");
});

test("the check-up's answers step is worded in Arabic by the screen and in English by the log", () => {
  assert.deepEqual(stepKind("ai.answers"), { kind: "other", word: "answers" });
  const step = { seq: 9, tool: "ai.answers", summary: "Asked 6 public questions: your business was named in 1 of 6 answers counted.", ok: true, started_at: null, ended_at: null };
  assert.deepEqual(stepText(step, "en"), { text: step.summary, foreign: false });
  assert.deepEqual(stepText(step, "ar"), { text: T.ar.stepOther.answers, foreign: false });
  assert.match(T.ar.stepOther.answers, /[؀-ۿ]/);
});

// ── the words ───────────────────────────────────────────

function lines(object, path = "") {
  const out = [];
  for (const [key, value] of Object.entries(object)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof value === "string") out.push([here, value]);
    else if (typeof value === "function") {
      const samples = value.length === 2 ? [[1, 1], [3, 5], [12, 30], [21, 3]] : [[0], [1], [2], [3], [5], [11], [12]];
      for (const args of samples) out.push([`${here}(${args.join(",")})`, String(value(...(key === "readOnlyLine" || key === "matchedOn" ? ["car care", "Doha"].slice(0, value.length) : args)))]);
    }
  }
  return out;
}

function banned() {
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

test("every line is in both languages, none is empty, and the Arabic is Arabic with Western digits", () => {
  assert.deepEqual(Object.keys(A.ar).sort(), Object.keys(A.en).sort());
  for (const lang of ["en", "ar"]) {
    for (const [key, value] of Object.entries(A[lang])) {
      if (typeof value === "string") assert.ok(value.trim().length > 0, `${lang}.${key}`);
    }
    for (const [path, text] of lines(A[lang])) {
      assert.ok(text.trim().length > 0, `${lang}.${path}`);
      assert.doesNotMatch(text, /undefined|NaN|\[object|…|\.\.\./, `${lang}.${path}: ${text}`);
    }
  }
  for (const [path, text] of lines(A.ar)) {
    assert.match(text, /[؀-ۿ]/, `ar.${path}: ${text}`);
    assert.doesNotMatch(text, /[٠-٩۰-۹]/, `ar.${path} has Eastern digits: ${text}`);
  }
});

test("Arabic counts agree with their nouns", () => {
  assert.equal(A.ar.inAnswers(1), "في إجابة واحدة");
  assert.equal(A.ar.inAnswers(2), "في إجابتان");
  assert.equal(A.ar.inAnswers(4), "في 4 إجابات");
  assert.equal(A.ar.inAnswers(12), "في 12 إجابة");
  assert.equal(A.ar.namedOf(4, 6), "ذُكر في 4 من 6 إجابات");
  assert.equal(A.en.namedOf(1, 1), "Named in 1 of 1 answer");
  assert.equal(A.en.inAnswers(3), "in 3 answers");
});

test("no AI words, no assistant, no product's name, no model, and nothing that is not built", () => {
  const words = banned();
  const product = /chatgpt|gemini|perplexity|openai|copilot|claude|bard|grok/i;
  for (const [path, text] of lines(A.en)) {
    for (const word of words.en) assert.doesNotMatch(text, new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), `"${word}" in en.${path}: ${text}`);
    assert.doesNotMatch(text, /\b(coming|beta|model|approve|approval)\b/i, `en.${path}: ${text}`);
    assert.doesNotMatch(text, product, `en.${path}: ${text}`);
  }
  for (const [path, text] of lines(A.ar)) {
    const tokens = arabicTokens(text);
    for (const word of words.ar) assert.ok(!tokens.includes(word.replace(/^ال/, "")), `«${word}» in ar.${path}: ${text}`);
    assert.doesNotMatch(text, /قريباً|نموذج|الذكاء|ذكي|مساعد/, `ar.${path}: ${text}`);
  }
  // The new step sentence follows the same rule.
  assert.doesNotMatch(T.en.stepOther.answers, /\b(read|reads|AI|assistant|model)\b/i);
});

test("the Answers screen holds no words of its own", () => {
  const source = read(join(HERE, "DiscoveryAnswers.tsx"));
  const loose = [...source.matchAll(/>([^<>{}]*[A-Za-z؀-ۿ][^<>{}]*)</g)]
    .map((m) => m[1].trim())
    .filter((text) => text && !text.startsWith("//") && !/[=;()&?|]/.test(text) && text !== "Promise");
  assert.deepEqual(loose, []);
  const attrs = [...source.matchAll(/\b(aria-label|placeholder|title|alt)="([^"{}]+)"/g)].map((m) => m[2]);
  assert.deepEqual(attrs, []);
});

test("an answer is drawn as text and never as markup", () => {
  const source = read(join(HERE, "DiscoveryAnswers.tsx"));
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML/);
  assert.match(source, /<blockquote className="dv-quote" lang=\{item\.lang\} dir="auto"><p>\{item\.text\}<\/p><\/blockquote>/);
});

test("the Answers part is drawn in the report only when it was measured", () => {
  const source = read(join(HERE, "DiscoveryReports.tsx"));
  assert.match(source, /report\.by_part\.ai\?\.measured/);
  assert.equal(T.en.partNames.ai, "");
  assert.equal(T.ar.partNames.ai, "");
});

test("Home's line is drawn only for a measured check", () => {
  const source = read(join(HERE, "DiscoveryAnswers.tsx"));
  assert.match(source, /!view\.enabled \|\| !view\.last\?\.measured\) return null/);
});

test("the styles hold no colour and no physical direction", () => {
  const css = read(join(HERE, "discoveryAnswers.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "a hex colour");
  assert.doesNotMatch(css, /\brgba?\(|\bhsla?\(/, "a colour function");
  assert.doesNotMatch(css, /font-family:(?!\s*var\()/, "a font that is not a token");
  const physical = css.match(/\b(margin|padding|border)-(left|right)\b|(^|[;{\s])(left|right)\s*:|text-align:\s*(left|right)|\bfloat:|(^|[\s;{])(width|height|min-width|max-width|min-height|max-height)\s*:/m);
  assert.equal(physical, null, `a physical property: ${physical?.[0]}`);
});
