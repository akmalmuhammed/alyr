// Tests for what the owner's browser trusts from Meta's Embedded Signup pop-up (ALY-39, spec 063):
// only a message from facebook.com itself, only the WA_EMBEDDED_SIGNUP kind, and ids turned into
// text. Nothing it says is believed by the server; this is the first, cheap line. Run with
// `node --test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import { isFacebookOrigin, readMessage } from "./signup.ts";

test("only facebook.com and its own subdomains, over https, count as Meta", () => {
  for (const ok of ["https://www.facebook.com", "https://facebook.com", "https://web.facebook.com"]) {
    assert.equal(isFacebookOrigin(ok), true, ok);
  }
  for (const bad of [
    "http://www.facebook.com", "https://evilfacebook.com", "https://facebook.com.evil.example",
    "https://www.facebook.com.evil.example", "https://alyr.qa", "null", "", "javascript:alert(1)",
  ]) {
    assert.equal(isFacebookOrigin(bad), false, bad);
  }
});

const finish = (event, data = { phone_number_id: "106540352242922", waba_id: "524126980791429", business_id: 2729063490586005 }) =>
  ({ type: "WA_EMBEDDED_SIGNUP", event, data });

test("a finished sign-up gives the account, the number and the portfolio, as text", () => {
  const heard = readMessage("https://www.facebook.com", JSON.stringify(finish("FINISH")));
  assert.deepEqual(heard, { kind: "finish", session: {
    event: "FINISH", waba_id: "524126980791429", phone_number_id: "106540352242922", business_id: "2729063490586005",
  } });
  // Meta may hand the object itself instead of a string.
  assert.equal(readMessage("https://www.facebook.com", finish("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")).kind, "finish");
});

test("a finish without a number still finishes, with empty ids for the server to refuse", () => {
  const heard = readMessage("https://www.facebook.com", finish("FINISH_ONLY_WABA", { waba_id: "524126980791429" }));
  assert.equal(heard.kind, "finish");
  assert.equal(heard.session.phone_number_id, "");
});

test("closing the pop-up and Meta's own error are told apart", () => {
  assert.deepEqual(
    readMessage("https://www.facebook.com", { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE_NUMBER_SETUP" } }),
    { kind: "cancel", step: "PHONE_NUMBER_SETUP" },
  );
  assert.deepEqual(
    readMessage("https://www.facebook.com", { type: "WA_EMBEDDED_SIGNUP", event: "ERROR", data: { error_message: "Something went wrong", error_code: 1001 } }),
    { kind: "error", message: "Something went wrong", code: "1001" },
  );
});

test("anything else is ignored", () => {
  const ours = JSON.stringify(finish("FINISH"));
  assert.equal(readMessage("https://evil.example", ours), null);
  assert.equal(readMessage("https://www.facebook.com.evil.example", ours), null);
  assert.equal(readMessage("https://www.facebook.com", { type: "SOMETHING_ELSE", event: "FINISH", data: {} }), null);
  assert.equal(readMessage("https://www.facebook.com", "not json"), null);
  assert.equal(readMessage("https://www.facebook.com", null), null);
  assert.equal(readMessage("https://www.facebook.com", 42), null);
  assert.equal(readMessage("https://www.facebook.com", finish("RESTART")), null);
});
