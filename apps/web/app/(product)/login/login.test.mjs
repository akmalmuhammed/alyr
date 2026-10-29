// Tests for the workspace sign-in page's words and small helpers (go-live checklist item 24):
// both languages say the same things, the Arabic has no English left in it, a code typed in
// Arabic digits reaches the API as 0 to 9, and the language chosen before is found again.
// Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { codeDigits } from "./code.ts";
import { COPY } from "./copy.ts";
import { WORKSPACE_LANG, keepLang, savedLang } from "../_workspace/lang.ts";

test("the sign-in page says the same things in English and Arabic", () => {
  assert.deepEqual(Object.keys(COPY.ar).sort(), Object.keys(COPY.en).sort());
  for (const [key, text] of Object.entries(COPY.ar)) {
    assert.ok(text.trim(), `${key} is empty in Arabic`);
    // Only the brand, and the switch back to English, are written in Latin letters.
    const latin = text.replace(/ALYR/g, "").replace(/^English$/, "");
    assert.doesNotMatch(latin, /[A-Za-z]/, `${key} has English in it: ${text}`);
  }
});

test("the page takes every word from the copy", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const markup = page.slice(page.indexOf("<main"));
  // Text between tags, and quoted text in setError, would be words written into the page.
  const between = [...markup.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1].trim()).filter(Boolean);
  assert.deepEqual(between.filter((text) => text !== "ALYR"), []);
  assert.doesNotMatch(page, /setError\("[A-Z]/);
});

test("a code typed in Arabic or Persian digits reaches the API as 0 to 9", () => {
  assert.equal(codeDigits("١٢٣٤٥٦"), "123456");
  assert.equal(codeDigits("۱۲۳۴۵۶"), "123456");
  assert.equal(codeDigits("12٣4۵6"), "123456");
  assert.equal(codeDigits(" 123-456 "), "123456");
  assert.equal(codeDigits("abc"), "");
});

function withStorage(values, run) {
  const store = new Map(Object.entries(values));
  const before = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  try { return run(store); } finally { globalThis.localStorage = before; }
}

test("the workspace's own choice wins, then the one made at sign-up, then none", () => {
  assert.equal(withStorage({ [WORKSPACE_LANG]: "ar", "alyr-lang": "en" }, savedLang), "ar");
  assert.equal(withStorage({ [WORKSPACE_LANG]: "en", "alyr-lang": "ar" }, savedLang), "en");
  assert.equal(withStorage({ "alyr-lang": "ar" }, savedLang), "ar");
  assert.equal(withStorage({ [WORKSPACE_LANG]: "fr" }, savedLang), null);
  assert.equal(withStorage({}, savedLang), null);
});

test("a choice is kept for the workspace, and blocked storage is not an error", () => {
  withStorage({}, (store) => {
    keepLang("ar");
    assert.equal(store.get(WORKSPACE_LANG), "ar");
  });
  const before = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  try {
    assert.equal(savedLang(), null);
    assert.doesNotThrow(() => keepLang("en"));
  } finally {
    globalThis.localStorage = before;
  }
});
