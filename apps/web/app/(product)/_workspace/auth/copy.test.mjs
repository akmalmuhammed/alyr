import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_COPY } from "./copy.ts";

const { en, ar } = AUTH_COPY;

// Every string of one language, with its path. A function is called with sample arguments.
function strings(value, path = "") {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") {
    const sample = value.length === 4 ? ["Chrome", "Windows", "Doha", "Thu 12 Nov 09:40"] : value.length === 3 ? ["35", "1,200", 1] : value.length === 2 ? ["Full wash", "300"] : [3];
    const out = value(...sample);
    return typeof out === "string" ? [[path + "()", out]] : [];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

function shape(value) {
  if (typeof value === "string") return "s";
  if (typeof value === "function") return `f${value.length}`;
  if (Array.isArray(value)) return value.map(shape);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
}

test("English and Arabic have the same keys, the same lists and the same functions", () => {
  const sameShape = (a, b) => {
    if (typeof a === "string") return typeof b === "string";
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length;
    if (typeof a === "function") return typeof b === "function" && a.length === b.length;
    return Object.keys(a).every((k) => k in b && sameShape(a[k], b[k])) && Object.keys(b).every((k) => k in a);
  };
  assert.ok(sameShape(en, ar), "the two languages differ in shape");
  assert.deepEqual(Object.keys(shape(en)), Object.keys(shape(ar)));
});

test("Arabic has no Eastern digits, except the one line that shows how pasted Arabic digits are read", () => {
  for (const [path, text] of strings(ar)) {
    if (path === "codeHint") continue;
    assert.equal(/[٠-٩۰-۹]/.test(text), false, `${path} holds Eastern digits: ${text}`);
  }
  assert.match(ar.codeHint, /٧٣٠٥١٨/);
  assert.match(ar.codeHint, /730518/);
});

test("Arabic never writes the currency in Latin; money comes from the money helper", () => {
  for (const [path, text] of strings(ar)) assert.equal(/QAR/i.test(text), false, `${path}: ${text}`);
  for (const [path, text] of strings(en)) assert.equal(/ر\.ق/.test(text), false, `${path}: ${text}`);
});

test("no string is empty, and no function leaks undefined", () => {
  for (const lang of [en, ar]) {
    for (const [path, text] of strings(lang)) {
      if (/\.(descriptor|after)$/.test(path)) continue; // empty by design: a product with no English descriptor, a kicker with nothing after the email
      assert.ok(text.trim().length > 0, `${path} is empty`);
      assert.equal(/undefined|NaN|\[object/.test(text), false, `${path}: ${text}`);
    }
  }
});

test("Arabic is Arabic: every Arabic string that is not a name, an address or a key has Arabic letters", () => {
  const keep = /^(ALYR|hello@alyr\.qa|app\.alyr\.qa|Enter|English|name@yourbusiness\.qa)$/;
  for (const [path, text] of strings(ar)) {
    if (/\.name$/.test(path) || keep.test(text)) continue;
    if (text === "") continue;
    assert.ok(/[؀-ۿ]/.test(text), `${path} has no Arabic: ${text}`);
  }
});

test("the wording is honest: no unfinished, no AI, no free, no place model, no setup fee", () => {
  const banned = /\b(soon|beta|coming|planned|AI|smart|assistant|bot|magic|powered|predict\w*|forecast\w*|free replies|trial|setup fee|places?|branch(es)?)\b/i;
  for (const [path, text] of strings(en)) {
    if (path === "types.carcare.desc") continue;
    assert.equal(banned.test(text), false, `${path}: ${text}`);
  }
  for (const [path, text] of strings(ar)) {
    assert.equal(/(^|\s)(وكيل|مساعد|ذكي|قريبا|قريباً|فرع|فروع|مجاني)(\s|$|[.،:؟])/.test(text), false, `${path}: ${text}`);
  }
  // "Agent" stays Latin with its descriptor in Arabic.
  assert.equal(ar.products.agent.name, "ALYR Agent");
});

test("the code line says a 6-digit code and that there is no password", () => {
  assert.match(en.signInSubtitle, /6-digit code/);
  assert.match(en.signInSubtitle, /no password/i);
  assert.match(ar.signInSubtitle, /6 أرقام/);
});
