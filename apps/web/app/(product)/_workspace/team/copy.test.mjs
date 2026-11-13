import test from "node:test";
import assert from "node:assert/strict";
import { teamCopy } from "./copy.ts";

test("teamCopy contains en and ar with symmetric keys", () => {
  const enKeys = Object.keys(teamCopy.en).sort();
  const arKeys = Object.keys(teamCopy.ar).sort();
  assert.deepEqual(enKeys, arKeys, "all copy keys must exist in both languages");
});

test("honest copy check - zero forbidden marketing words", () => {
  const forbidden = [
    /\bai\b/i,
    /\bsmart\b/i,
    /\bintelligent\b/i,
    /\bassistant\b/i,
    /\bbeta\b/i,
    /\bcoming soon\b/i,
    /\bgame-changing\b/i,
    /\bseamless\b/i,
  ];

  for (const lang of ["en", "ar"]) {
    const bag = teamCopy[lang];
    for (const [key, value] of Object.entries(bag)) {
      if (typeof value === "string") {
        for (const pattern of forbidden) {
          assert.equal(
            pattern.test(value),
            false,
            `Forbidden word in ${lang}.${key}: "${value}" matches ${pattern}`
          );
        }
      }
    }
  }
});

test("currency formatted with non-breaking space", () => {
  assert.match(teamCopy.en.statSalesVal, /QAR\u00a0/);
  assert.match(teamCopy.ar.statSalesVal, /\u00a0ر\.ق/);
});
