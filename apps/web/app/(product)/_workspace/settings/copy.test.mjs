import test from "node:test";
import assert from "node:assert/strict";
import { SETTINGS_COPY } from "./copy.ts";

const FORBIDDEN_WORDS = [
  "smart", "ai", "artificial intelligence", "automated", "boost", "streamline",
  "supercharge", "seamless", "effortless", "all-in-one", "magic", "game-changer",
  "revolutionary", "innovative", "cutting-edge", "state-of-the-art"
];

test("settings copy has symmetric english and arabic keys", () => {
  const enKeys = Object.keys(SETTINGS_COPY.en).sort();
  const arKeys = Object.keys(SETTINGS_COPY.ar).sort();

  assert.deepEqual(enKeys, arKeys, "English and Arabic key sets must match exactly");
  assert.ok(enKeys.length > 50, "Should have complete copy keys");
});

test("settings copy strings are non-empty", () => {
  for (const [lang, copy] of Object.entries(SETTINGS_COPY)) {
    for (const [key, value] of Object.entries(copy)) {
      assert.ok(
        typeof value === "string" && value.trim().length > 0,
        `Copy string [${lang}][${key}] must be non-empty`
      );
    }
  }
});

test("settings copy contains zero forbidden marketing or AI words", () => {
  for (const [lang, copy] of Object.entries(SETTINGS_COPY)) {
    for (const [key, value] of Object.entries(copy)) {
      const lower = value.toLowerCase();
      for (const forbidden of FORBIDDEN_WORDS) {
        const regex = new RegExp(`\\b${forbidden}\\b`, "i");
        assert.ok(
          !regex.test(lower),
          `Found forbidden word "${forbidden}" in [${lang}][${key}]: "${value}"`
        );
      }
    }
  }
});

test("settings copy currency formatting uses non-breaking space", () => {
  const enCopy = SETTINGS_COPY.en;
  const arCopy = SETTINGS_COPY.ar;

  assert.ok(enCopy.moneyDetail.includes("QAR\u00a01"), "EN money should use non-breaking space");
  assert.ok(enCopy.closeWarningBanner.includes("QAR\u00a09,840"), "EN warning banner should format money with NBSP");

  assert.ok(arCopy.moneyDetail.includes("1\u00a0ر.ق"), "AR money should use non-breaking space");
  assert.ok(arCopy.closeWarningBanner.includes("9,840\u00a0ر.ق"), "AR warning banner should format money with NBSP");
});
