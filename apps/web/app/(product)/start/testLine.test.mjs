// The "Try it" step says so when the business has no test line, in both languages (found by the
// end-to-end test of 30 Oct). Run with `pnpm test`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { COPY } from "./copy.ts";
import { testSendOutcome } from "./testLine.ts";

test("a 409 from the test chat is a business with no test line; a good answer is a send", () => {
  assert.equal(testSendOutcome(true, 200), "sent");
  assert.equal(testSendOutcome(false, 409), "no_line");
});

test("any other refusal or error is a message that was not sent, never silence", () => {
  for (const status of [400, 401, 403, 422, 429, 500, 502, 503]) {
    assert.equal(testSendOutcome(false, status), "failed", String(status));
  }
});

test("both languages have the words for it, and both point to ALYR's address", () => {
  for (const lang of ["en", "ar"]) {
    const t = COPY[lang].try;
    assert.ok(t.noLine.length > 20, `${lang} noLine`);
    assert.ok(t.notSent.length > 10, `${lang} notSent`);
    assert.equal(t.noLineAddress, "hello@alyr.qa");
    assert.ok(t.skip, `${lang} still offers to skip`);
  }
});

test("the Arabic says it in Arabic: only the product's name in Latin, no ellipsis", () => {
  const { noLine, notSent } = COPY.ar.try;
  for (const text of [noLine, notSent]) {
    assert.doesNotMatch(text.replaceAll("ALYR", ""), /[A-Za-z]/, text);
    assert.doesNotMatch(text, /(…|\.\.\.)$/, text);
  }
});
