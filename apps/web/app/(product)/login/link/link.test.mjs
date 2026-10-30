// Tests for the page the "your workspace is ready" email opens (ALY-213): both languages say the
// same things, the Arabic has no English left in it, the page takes every word from the copy, and
// the address fragment is read safely. Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { COPY } from "./copy.ts";
import { fromHash } from "./token.ts";

test("the page says the same things in English and Arabic", () => {
  assert.deepEqual(Object.keys(COPY.ar).sort(), Object.keys(COPY.en).sort());
  for (const [key, text] of Object.entries(COPY.ar)) {
    assert.ok(text.trim(), `${key} is empty in Arabic`);
    const latin = text.replace(/ALYR/g, "").replace(/^English$/, "");
    assert.doesNotMatch(latin, /[A-Za-z]/, `${key} has English in it: ${text}`);
  }
});

test("the page takes every word from the copy", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const markup = page.slice(page.indexOf("<main"));
  const between = [...markup.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1].trim()).filter(Boolean);
  assert.deepEqual(between.filter((text) => text !== "ALYR"), []);
  assert.doesNotMatch(page, /setError\("[A-Z]/);
});

test("opening the page spends nothing: only the button posts the token", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  // One call to the API, inside the function the button runs; the effect that reads the address
  // only reads.
  assert.equal([...page.matchAll(/fetch\(/g)].length, 1);
  const effect = page.slice(page.indexOf("useEffect(() =>"), page.indexOf("function switchLang"));
  assert.doesNotMatch(effect, /fetch\(|open\(/);
  assert.match(page, /onClick=\{open\}/);
});

test("the token and the language are read from the address fragment", () => {
  const token = "a".repeat(43);
  assert.deepEqual(fromHash(`#t=${token}&l=ar`), { token, lang: "ar" });
  assert.deepEqual(fromHash(`#t=${token}`), { token, lang: null });
  assert.deepEqual(fromHash(`t=${token}&l=en`), { token, lang: "en" });
  assert.deepEqual(fromHash(`#t=${token}&l=fr`), { token, lang: null });
});

test("a token that cannot be ours is dropped", () => {
  const bad = ["", "#", "#t=", "#t=short", `#t=${"a".repeat(101)}`, `#t=${"a".repeat(30)}%20x`,
    `#t=${"a".repeat(20)}<script>`, `#token=${"a".repeat(43)}`];
  for (const hash of bad) assert.equal(fromHash(hash).token, "", hash);
});
