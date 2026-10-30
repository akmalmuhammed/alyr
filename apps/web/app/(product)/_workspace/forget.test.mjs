// The words of forgetting a customer (specs/038). Run with `node --test` from apps/web (Node
// 22.18 or newer reads the .ts files as they are): every line exists in both languages, and the
// screen holds no words of its own.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FORGET } from "./forgetCopy.ts";

test("every line is in English and Arabic, and none is empty", () => {
  assert.deepEqual(Object.keys(FORGET.ar).sort(), Object.keys(FORGET.en).sort());
  for (const lang of ["en", "ar"]) {
    for (const [key, line] of Object.entries(FORGET[lang])) {
      const text = typeof line === "function" ? line("Mariam") : line;
      assert.ok(text.trim().length > 0, `${lang}.${key}`);
    }
  }
  assert.match(FORGET.en.title("Mariam"), /Mariam/);
  assert.match(FORGET.ar.title("مريم"), /مريم/);
  assert.match(FORGET.en.owes("QAR 120.00"), /QAR 120\.00/);
  assert.match(FORGET.ar.owes("120.00 ر.ق"), /120\.00 ر\.ق/);
});

test("the Arabic is Arabic", () => {
  for (const [key, line] of Object.entries(FORGET.ar)) {
    const text = typeof line === "function" ? line("") : line;
    assert.match(text, /[؀-ۿ]/, `ar.${key}`);
  }
});

test("the screen takes every word from the copy", () => {
  const screen = readFileSync(new URL("./Forget.tsx", import.meta.url), "utf8");
  // Text between tags that is not an expression is a hard-coded word.
  const loose = [...screen.matchAll(/>([^<>{}]*[A-Za-z؀-ۿ][^<>{}]*)</g)]
    .map((m) => m[1].trim())
    .filter((text) => text && !text.startsWith("//") && !/[=;()]/.test(text));
  assert.deepEqual(loose, []);
});
