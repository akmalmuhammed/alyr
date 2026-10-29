// Tests for the "Not sent" screen's words (specs/036): both languages say the same things, every
// reason the API can give has its sentence, the Arabic has no English left in it, and the screen
// takes every word from the copy. Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NS } from "./notSentCopy.ts";

const api = readFileSync(new URL("../../../../api/src/alyr/core/not_sent.py", import.meta.url), "utf8");

function flat(words, prefix = "") {
  return Object.entries(words).flatMap(([key, value]) =>
    typeof value === "object" ? flat(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]);
}

test("the screen says the same things in English and Arabic", () => {
  assert.deepEqual(flat(NS.ar).map(([k]) => k).sort(), flat(NS.en).map(([k]) => k).sort());
});

test("every reason the API gives has its sentence, and every refusal says what would let it go", () => {
  const blocked = [...api.match(/BLOCKED = \{([^}]*)\}/s)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  assert.ok(blocked.length >= 5, blocked);
  for (const lang of ["en", "ar"]) {
    for (const reason of [...blocked, "gave_up", "whatsapp"]) assert.ok(NS[lang].reason[reason], `${lang} ${reason}`);
    for (const why of [...blocked, "file_lost"]) assert.ok(NS[lang].whyNot[why], `${lang} ${why}`);
  }
});

test("the Arabic has no English in it but the names it must keep", () => {
  for (const [key, value] of flat(NS.ar)) {
    const text = typeof value === "function" ? value(14) : value;
    assert.doesNotMatch(text.replace(/ALYR|START/g, ""), /[A-Za-z]/, `${key}: ${text}`);
  }
});

test("the screen takes every word from the copy", () => {
  const page = readFileSync(new URL("./NotSent.tsx", import.meta.url), "utf8");
  const markup = page.slice(page.indexOf("return (\n    <>"));
  // Text between tags that is not code (a ternary or && between elements) would be words.
  const between = [...markup.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1].trim())
    .filter((text) => text && !/[()=&?:;]/.test(text));
  assert.deepEqual(between, []);
});
