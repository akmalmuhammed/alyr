// Tests for the bakery sales demo (ALY-263): the owner's estimate, the order of scene 4, the
// beats from the first scene to the last, and the words: English and Arabic have the same
// keys, and nothing says what the demo must not (docs/work/ALY-263-demo-bakery/02-truth.md).
// Run with `node --test` from apps/web (Node 22.18 or newer reads the .ts files as they are).

import assert from "node:assert/strict";
import { test } from "node:test";
import { COPY } from "./copy.ts";
import {
  DEFAULT_PAINS, LAST, PAINS, POINTS_TO, SCENES, START, beats, estimate, painOrder, progress, qar, shopName, step, testLine,
} from "./logic.ts";

test("the estimate is after-hours messages × 30 days × the share × the average order, to the nearest 10", () => {
  assert.equal(estimate(START), 2880); // 8 × 30 × 10% × 120
  assert.equal(estimate({ daily: 40, after: 7, average: 95, share: 10 }), 2000); // 1,995
  assert.equal(estimate({ daily: 5, after: 9, average: 100, share: 10 }), 1500, "after closing never exceeds the day's messages");
});

test("money reads QAR 1,234 in English and 1,234 ر.ق in Arabic, Western digits", () => {
  assert.equal(qar(2880, "en"), "QAR 2,880");
  assert.equal(qar(2880, "ar"), "2,880 ر.ق");
});

test("scene 4 follows the taps in their order, without repeats, or four defaults", () => {
  assert.deepEqual(painOrder(["cafe", "ready", "cafe"]), ["cafe", "ready"]);
  assert.deepEqual(painOrder([]), DEFAULT_PAINS);
  assert.equal(beats(4, ["cafe"]), 4, "a pain is two beats, the invoice two more");
});

test("every beat is reached going forward and back, and the walk stops at both ends", () => {
  for (const tapped of [[], [...PAINS]]) {
    let pos = { scene: 1, beat: 0 };
    let count = 1;
    for (;;) {
      const next = step(pos, 1, tapped);
      if (next.scene === pos.scene && next.beat === pos.beat) break;
      pos = next;
      count++;
    }
    assert.equal(pos.scene, LAST);
    const total = SCENES.slice(1).reduce((n, _, i) => n + beats(i + 1, tapped), 0);
    assert.equal(count, total);
    assert.equal(progress(pos, tapped), 1);
    let back = pos;
    for (let i = 0; i < total - 1; i++) back = step(back, -1, tapped);
    assert.deepEqual(back, { scene: 1, beat: 0 });
    assert.deepEqual(step(back, -1, tapped), back);
  }
});

test("pains that belong elsewhere point at a real scene", () => {
  for (const [pain, scene] of Object.entries(POINTS_TO)) {
    assert.ok(PAINS.includes(pain));
    assert.ok(scene >= 1 && scene <= LAST);
  }
});

test("the shop's name falls back from Arabic to English to the sample", () => {
  const fb = COPY.en.fallback;
  assert.equal(shopName({ name: "", nameAr: "", colour: "cocoa", line: "" }, "en", fb), "Qirfa Bakery");
  assert.equal(shopName({ name: "Noor Sweets", nameAr: "", colour: "cocoa", line: "" }, "ar", fb), "Noor Sweets");
  assert.equal(shopName({ name: "Noor Sweets", nameAr: "حلويات نور", colour: "cocoa", line: "" }, "ar", fb), "حلويات نور");
});

test("a QR is drawn only for a web address", () => {
  assert.equal(testLine(""), null);
  assert.equal(testLine("wa.me/97455555555"), "https://wa.me/97455555555");
  assert.equal(testLine("not a link"), null);
});

/** Every string in a copy object, functions called with sample arguments. */
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") out.push(String(value("X", 1)));
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, shape(value[k])]));
  return typeof value;
}

test("English and Arabic carry the same words, in the same shape", () => {
  assert.deepEqual(shape(COPY.ar), shape(COPY.en));
  assert.equal(COPY.en.says.length, SCENES.length);
  assert.equal(COPY.en.scenes.length, SCENES.length);
});

test("nothing says what the demo must not", () => {
  const banned = [
    /\bAI\b/, /\bsmart/i, /seamless/i, /\bsolutions?\b/i, /\bplatform\b/i, /\bunlock/i, /artificial/i, /\bintelligen/i,
    /keep your number/i, /WhatsApp Business app/i, /\bpartner\b/i, /\bfree (message|repl|trial|pilot|plan|setup)/i, /\blive on WhatsApp/i,
    /(^|[\s«])(ال)?ذكي/, /ذكاء/, /منصة/, /مساعد/, /وكيل/, /حل متكامل/, /مجاناً/,
  ];
  for (const lang of ["en", "ar"]) {
    for (const line of strings(COPY[lang])) {
      for (const word of banned) assert.ok(!word.test(line), `${lang}: "${line}" matches ${word}`);
      assert.ok(!/[٠-٩]/.test(line), `${lang}: Eastern digits in "${line}"`);
      assert.ok(!line.includes("—"), `${lang}: an em dash in "${line}"`);
    }
  }
  for (const line of strings(COPY.ar)) assert.ok(!/\bQAR\b/.test(line), `Arabic says QAR: "${line}"`);
});

test("no price of ALYR's is on any screen: the only money is the bakery's", () => {
  for (const lang of ["en", "ar"]) {
    for (const line of strings(COPY[lang])) assert.ok(!/(a month|في الشهر).*(QAR|ر\.ق)|\b449\b|\b1,500\b/.test(line) || /never saw|لم تصل/.test(line), `${lang}: "${line}"`);
  }
});
