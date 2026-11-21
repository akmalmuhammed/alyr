import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SETTINGS_COPY } from "./copy.ts";

// Words the product never says (alyr-design/honesty.md, guide section 2 rule 5), in both languages.
const BANNED = [
  /\bAI\b/, /\bsmart\b/i, /\bassistant\b/i, /\bbot\b/i, /\bpredicts?\b/i, /\bforecasts?\b/i, /health score/i,
  /\bmagic\b/i, /\bpowered\b/i, /ask alyr/i, /free replies/i, /at risk/i, /\bSKU\b/, /\bcoming soon\b/i, /\bbeta\b/i,
  /\bsoon\b/i, /\bnot yet\b/i, /\bplanned\b/i,
  ...["مساعد", "ذكي", "ذكاء", "قريباً", "قيد التنفيذ", "ليس بعد", "وكيل"].map((w) => new RegExp(`(?<![\u0600-\u06FF])${w}(?![\u0600-\u06FF])`)),
  // What the product does not do: claims the drawings made and the code does not back.
  /one tap/i, /receipt of the erasure/i, /told on the/i, /read and download only/i, /on every device/i,
];

/** Every string in a copy value, calling the functions with sample arguments. */
function strings(value, lang) {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const samples = [
      ["x"], ["Thu 19 Nov"], [31, "Thu 19 Nov", 11, 9840], [1, "Thu 19 Nov", 1, 85], [2, "Thu 19 Nov", 2, 85], ["09:40"],
    ];
    const out = [];
    for (const args of samples) {
      try {
        const text = value(...args);
        if (typeof text === "string") out.push(text);
      } catch {
        /* wrong sample for this function */
      }
    }
    return out;
  }
  if (Array.isArray(value)) return value.flatMap((v) => strings(v, lang));
  if (value && typeof value === "object") return Object.values(value).flatMap((v) => strings(v, lang));
  return [];
}

/** The shape of a value: its keys, recursively, with the type of each leaf. */
function shape(value) {
  if (typeof value === "function") return "function";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return value.map(shape);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
}

test("English and Arabic have exactly the same keys, in the same shape", () => {
  assert.deepEqual(shape(SETTINGS_COPY.en), shape(SETTINGS_COPY.ar));
  assert.ok(Object.keys(SETTINGS_COPY.en).length > 90, "the copy is complete");
});

test("no string is empty", () => {
  for (const lang of ["en", "ar"]) {
    for (const [key, value] of Object.entries(SETTINGS_COPY[lang])) {
      const all = strings(value, lang);
      assert.ok(all.length > 0, `[${lang}][${key}] has text`);
      for (const text of all) assert.ok(text.trim().length > 0, `[${lang}][${key}] is not blank`);
    }
  }
});

test("no banned word or claim the product does not back", () => {
  for (const lang of ["en", "ar"]) {
    for (const [key, value] of Object.entries(SETTINGS_COPY[lang])) {
      for (const text of strings(value, lang)) {
        for (const pattern of BANNED) assert.ok(!pattern.test(text), `${pattern} in [${lang}][${key}]: "${text}"`);
      }
    }
  }
});

test("money is the amount and its currency joined by a no-break space", () => {
  const en = SETTINGS_COPY.en.closeImpact(31, "Thu 19 Nov", 11, 9840);
  const ar = SETTINGS_COPY.ar.closeImpact(31, "الخميس 19 نوفمبر", 11, 9840);
  assert.ok(en.includes("QAR 9,840"), en);
  assert.ok(ar.includes("9,840 ر.ق"), ar);
  assert.ok(SETTINGS_COPY.en.moneyValue.includes("QAR 1"));
  assert.ok(SETTINGS_COPY.ar.moneyValue.includes("1 ر.ق"));
});

test("Arabic has Western digits only and never 'QAR'", () => {
  for (const [key, value] of Object.entries(SETTINGS_COPY.ar)) {
    for (const text of strings(value, "ar")) {
      assert.ok(!/[٠-٩۰-۹]/.test(text), `Eastern digits in [${key}]: "${text}"`);
      assert.ok(!text.includes("QAR"), `QAR in [${key}]: "${text}"`);
    }
  }
});

test("a count agrees with its noun in both languages", () => {
  const one = SETTINGS_COPY.en.closeImpact(1, "Thu 19 Nov", 1, 85);
  assert.match(one, /1 booking is after/);
  assert.match(one, /1 customer owes/);
  const many = SETTINGS_COPY.en.closeImpact(31, "Thu 19 Nov", 11, 9840);
  assert.match(many, /31 bookings are after/);
  assert.match(many, /11 customers owe/);
  const two = SETTINGS_COPY.ar.closeImpact(2, "x", 2, 85);
  assert.match(two, /^حجزان /);
  assert.match(two, /عميلان عليهما/);
  const few = SETTINGS_COPY.ar.closeImpact(5, "x", 5, 85);
  assert.match(few, /^5 حجوزات /);
  const lots = SETTINGS_COPY.ar.closeImpact(31, "x", 11, 85);
  assert.match(lots, /^31 حجزاً /);
  assert.match(lots, /11 عميلاً عليهم/);
});

test("the close timeline states only what the product does (spec 042, D-082)", () => {
  const en = SETTINGS_COPY.en;
  // Seven days' notice and 60 days, as core/subscription.py NOTICE_DAYS and core/erase.py say.
  assert.match(en.closeUntilText, /Seven days/);
  assert.match(en.keepAfterValue, /60 days/);
  assert.match(en.closeBody, /60 days/);
  // Undoing is a reply to the email (the back office does it), never a button.
  assert.match(en.closeUntilText, /reply to that email/);
  // The law keeps ALYR's own invoices; backups go 35 days later (the privacy notice).
  assert.match(en.closeEraseText, /law/);
  assert.match(en.closeEraseText, /35 days/);
  assert.match(en.keepBackupsValue, /35 days/);
});

test("the screen's source writes no number or claim of its own", () => {
  // The words live here; the components hold none. A string literal with a space in a .tsx is a hole.
  for (const file of ["SettingsAccount", "SettingsPrivacy", "SettingsEmailDialog", "SettingsCloseDialog", "SettingsStates", "SettingsWorkbench"]) {
    const source = readFileSync(new URL(`./${file}.tsx`, import.meta.url), "utf8");
    assert.ok(!/alert\(/.test(source), `${file} must not call alert()`);
    assert.ok(!/style=\{\{/.test(source), `${file} must not carry inline styles`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(source), `${file} must not carry an emoji`);
  }
});
