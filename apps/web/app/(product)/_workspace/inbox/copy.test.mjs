import test from "node:test";
import assert from "node:assert/strict";
import { copy } from "./copy.ts";

test("inbox copy keys match between English and Arabic", () => {
  const en = copy("en");
  const ar = copy("ar");

  const enKeys = Object.keys(en).sort();
  const arKeys = Object.keys(ar).sort();

  assert.deepEqual(enKeys, arKeys, "all copy keys must exist in both languages");

  for (const key of enKeys) {
    assert.equal(typeof en[key], typeof ar[key], `type mismatch for key ${key}`);
  }
});

test("inbox copy contains zero banned AI words", () => {
  const en = copy("en");
  const banned = [/\bai\b/i, /\bsmart\b/i, /\bassistant\b/i, /\bbeta\b/i, /\bcoming\s+soon\b/i, /ذكاء/, /مساعد/];

  for (const [key, val] of Object.entries(en)) {
    if (typeof val === "string") {
      for (const re of banned) {
        assert.ok(
          !re.test(val),
          `Banned word matching '${re}' found in copy.en.${key}: "${val}"`
        );
      }
    }
  }
});
