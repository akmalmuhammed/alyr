import test from "node:test";
import assert from "node:assert/strict";
import { ORDERS_COPY } from "./copy.ts";

test("copy: all keys match between English and Arabic", () => {
  const enKeys = Object.keys(ORDERS_COPY.en).sort();
  const arKeys = Object.keys(ORDERS_COPY.ar).sort();

  assert.deepEqual(enKeys, arKeys, "Keys in en and ar must match exactly");

  for (const key of enKeys) {
    const enVal = ORDERS_COPY.en[key];
    const arVal = ORDERS_COPY.ar[key];
    assert.equal(
      typeof enVal,
      typeof arVal,
      `Key "${key}" type mismatch: en is ${typeof enVal}, ar is ${typeof arVal}`
    );
  }
});

test("copy: no forbidden dishonest words in strings", () => {
  const forbidden = [/\bai\b/i, /\bsmart\b/i, /\bassistant\b/i, /\bbeta\b/i, /coming soon/i];

  for (const lang of ["en", "ar"]) {
    const dict = ORDERS_COPY[lang];
    for (const [key, val] of Object.entries(dict)) {
      if (typeof val === "string") {
        for (const pattern of forbidden) {
          assert(
            !pattern.test(val),
            `Dishonest word found in ${lang}.${key}: "${val}" matches ${pattern}`
          );
        }
      }
    }
  }
});
