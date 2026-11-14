import test from "node:test";
import assert from "node:assert/strict";
import { CREDIT_COPY } from "./copy.ts";

test("credit copy has full symmetry between English and Arabic", () => {
  const enKeys = Object.keys(CREDIT_COPY.en);
  const arKeys = Object.keys(CREDIT_COPY.ar);

  assert.equal(enKeys.length, arKeys.length, "Both languages should have the same number of keys");

  for (const key of enKeys) {
    assert.ok(key in CREDIT_COPY.ar, `Missing key in Arabic: ${key}`);
    const enVal = CREDIT_COPY.en[key];
    const arVal = CREDIT_COPY.ar[key];
    assert.ok(typeof enVal === "string" && enVal.length > 0, `English key ${key} is empty`);
    assert.ok(typeof arVal === "string" && arVal.length > 0, `Arabic key ${key} is empty`);
  }
});

test("credit copy has zero banned marketing or unfinished words", () => {
  const banned = /\b(?:ai|artificial|smart|intelligent|assistant|copilot|beta|coming soon|magic|automagically)\b/i;

  for (const [lang, strings] of Object.entries(CREDIT_COPY)) {
    for (const [key, val] of Object.entries(strings)) {
      assert.ok(!banned.test(val), `Banned word detected in ${lang}.${key}: "${val}"`);
    }
  }
});

test("formatted currency contains non-breaking spaces", () => {
  // Check typical money strings
  assert.ok(CREDIT_COPY.en.totalOwed.includes("\u00a0"), "English money must use non-breaking space");
  assert.ok(CREDIT_COPY.ar.totalOwed.includes("\u00a0"), "Arabic money must use non-breaking space");
  assert.ok(CREDIT_COPY.en.owesBluefinVal.includes("\u00a0"), "Bluefin owes must use non-breaking space");
});

test("arabic copy contains zero Eastern digits and zero 'QAR '", () => {
  const arCopy = CREDIT_COPY.ar;
  const easternDigitsRegex = /[٠-٩۰-۹]/;
  for (const [key, value] of Object.entries(arCopy)) {
    if (typeof value === "string") {
      assert.ok(
        !easternDigitsRegex.test(value),
        `Found Eastern digits in AR copy [${key}]: "${value}"`
      );
      assert.ok(
        !value.includes("QAR "),
        `Found "QAR " in AR copy [${key}]: "${value}"`
      );
    }
  }
});
