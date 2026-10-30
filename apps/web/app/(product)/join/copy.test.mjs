// The page a sales link opens (ALY-216) says every sentence in both languages, in the same shape,
// and writes money the way Arabic does (the amount, then «ر.ق»; never "QAR"). The no-AI-words check
// for this copy is in ../start/honesty.test.mjs. Run with `pnpm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { COPY } from "./copy.ts";

/** Every path to a leaf of the copy object, with what kind of leaf it is. */
function shape(value, path = "") {
  if (typeof value === "string") return [`${path}:text`];
  if (typeof value === "function") return [`${path}:fn${value.length}`];
  return Object.entries(value).flatMap(([key, inner]) => shape(inner, `${path}.${key}`));
}

function texts(value) {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [value("1 2 3")];
  return Object.values(value).flatMap(texts);
}

test("English and Arabic have the same sentences", () => {
  assert.deepEqual(shape(COPY.ar), shape(COPY.en));
});

test("no sentence is empty", () => {
  for (const lang of ["en", "ar"]) for (const text of texts(COPY[lang])) assert.ok(text.trim().length > 0, lang);
});

test("Arabic never writes QAR or leaves a line ending in an ellipsis", () => {
  for (const text of texts(COPY.ar)) assert.doesNotMatch(text, /QAR/, text);
  for (const lang of ["en", "ar"]) {
    for (const text of texts(COPY[lang])) assert.doesNotMatch(text, /\.\.\.$/, text);
  }
});

test("every placeholder in a sentence has an Arabic twin", () => {
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  const pairs = (a, b) => (typeof a === "string"
    ? [[a, b]] : typeof a === "function" ? [] : Object.keys(a).flatMap((key) => pairs(a[key], b[key])));
  for (const [en, ar] of pairs(COPY.en, COPY.ar)) assert.equal(slots(ar), slots(en), `${en} / ${ar}`);
});
