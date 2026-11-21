import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { copy } from "./copy.ts";

/** Every string the copy can write in one language, calling each template with plausible arguments. */
function strings(value, path = "") {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") {
    // A template takes numbers, names, times or flags; numbers read as all of them (3 is a name, a time, true).
    const sample = [Array.from({ length: value.length }, () => 3), Array.from({ length: value.length }, () => 1)];
    if (value.length === 3) sample.push(["12", "", "34"]);
    const out = [];
    for (const args of sample) {
      let result;
      try { result = value(...args); } catch { continue; }
      if (typeof result === "string") out.push([`${path}(${args.map(String).join(",")})`, result]);
    }
    return out;
  }
  return Object.entries(value).flatMap(([key, inner]) => strings(inner, path ? `${path}.${key}` : key));
}

/** The shape of an object: its keys, recursively, with a function marked as one. */
function shape(value) {
  if (typeof value === "function") return "fn";
  if (typeof value === "string") return "str";
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]));
}

test("English and Arabic have the same keys, at every depth, with the same kind of value", () => {
  assert.deepEqual(shape(copy("ar")), shape(copy("en")));
});

test("no string is empty, and no Arabic page word is left in English", () => {
  for (const lang of ["en", "ar"]) {
    for (const [path, text] of strings(copy(lang))) {
      assert.ok(text.trim().length > 0 || path.includes("owesFor"), `${lang}.${path} is empty`);
    }
  }
  // Names that stay in Latin on an Arabic page, and the few words a person must type.
  const allowed = /ALYR|Meta|START|Ctrl|Enter|WhatsApp|QAR/g;
  for (const [path, text] of strings(copy("ar"))) {
    const latin = text.replace(allowed, "").match(/[A-Za-z]{3,}/);
    assert.equal(latin, null, `ar.${path} has English left in it: ${text}`);
  }
});

test("the copy never says what the product must not (honesty.md), in either language", () => {
  const banned = [
    /\bAI\b/, /\bsmart\b/i, /\bassistant\b/i, /\bbot\b/i, /\bpredict/i, /\bforecast/i, /health score/i, /\bmagic\b/i, /\bpowered\b/i,
    /ask alyr/i, /free repl/i, /\bat risk\b/i, /\bSKU\b/, /coming soon/i, /\bbeta\b/i, /\bnot yet\b/i, /\bplanned\b/i,
    /ذكاء/, /(^|[s،.:])(ال)?مساعد([s،.:]|$)/, /قريباً/, /قيد التنفيذ/, /ليس بعد/, /وكيل/,
  ];
  for (const lang of ["en", "ar"]) {
    for (const [path, text] of strings(copy(lang))) {
      for (const re of banned) assert.ok(!re.test(text), `${lang}.${path} says "${text}" (${re})`);
    }
  }
});

test("every digit is a Western digit, money is never written QAR in Arabic, and no line ends in an ellipsis", () => {
  for (const [path, text] of strings(copy("ar"))) {
    assert.ok(!/[٠-٩۰-۹]/.test(text), `ar.${path} has an Eastern digit`);
    assert.ok(!/QAR/.test(text), `ar.${path} writes QAR`);
  }
  for (const lang of ["en", "ar"]) {
    for (const [path, text] of strings(copy(lang))) assert.ok(!/(…|\.\.\.)$/.test(text), `${lang}.${path} ends in an ellipsis`);
  }
  const source = readFileSync(new URL("./copy.ts", import.meta.url), "utf8");
  assert.ok(!/[٠-٩۰-۹]/.test(source), "copy.ts has no Eastern digit");
});

test("typed replies are never called free: the window line says what it is", () => {
  assert.equal(copy("en").windowOpen(23, 0), "Typed replies allowed for 23 more".replace(" more", " hours more"));
  assert.match(copy("en").windowOpen(1, 0), /1 hour more/);
  assert.match(copy("en").windowOpen(0, 42), /42 more minutes/);
  assert.match(copy("ar").windowOpen(2, 0), /ساعتان/);
  assert.match(copy("ar").windowOpen(23, 0), /23 ساعة/);
});

test("Arabic counts agree with their noun", () => {
  const ar = copy("ar");
  assert.equal(ar.closed.conversations(1), "محادثة واحدة");
  assert.equal(ar.closed.conversations(2), "محادثتان");
  assert.equal(ar.closed.conversations(6), "6 محادثات");
  assert.equal(ar.closed.conversations(15), "15 محادثة");
  assert.equal(ar.strip.orders(7), "7 طلبات");
});

test("the reasons a reply was refused are in the person's words, not the API's codes", () => {
  for (const lang of ["en", "ar"]) {
    for (const code of ["window_closed", "opted_out", "no_consent", "no_marketing_consent", "billing_paused", "template_not_approved"]) {
      assert.ok(!copy(lang).blockedReason(code).includes("_"), `${lang} ${code}`);
    }
  }
  assert.equal(copy("en").blockedReason("something_new"), "Not sent");
});

test("the close dialog's outcome and reason ids are the ones the API takes", () => {
  assert.deepEqual(Object.keys(copy("en").outcomes), ["sold", "booked", "answered", "lost"]);
  assert.deepEqual(Object.keys(copy("en").reasons), ["price", "not_available", "no_reply", "went_elsewhere", "other"]);
});
