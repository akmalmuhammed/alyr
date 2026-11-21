// Tests for the product's fetch client and language helpers (Product UI foundation): the three
// refusal shapes the API sends, offline, 401 signing out once, the sentence in each language, and
// the pure parts of `useLang`. `fetch` is replaced, so no server is needed. Run with `node --test`.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { API_COPY } from "./apiCopy.ts";
import { ApiError, api, refusal, say, setSignedOutHandler } from "./api.ts";
import { dirOf, pickText } from "./useLang.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answer the next call with a status and a body (an object is sent as JSON, a string as it is). */
function answer(status, body, calls = []) {
  globalThis.fetch = async (path, init) => {
    calls.push({ path, init });
    const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
    return new Response(status === 204 ? null : text, { status });
  };
  return calls;
}

// ── a good answer ─────────────────────────────────────────

test("a good answer is its JSON, read with no cache", async () => {
  const calls = answer(200, { total: 3 });
  assert.deepEqual(await api("/api/orders"), { total: 3 });
  assert.equal(calls[0].path, "/api/orders");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers, undefined);
});

test("a body goes as JSON with its content type, and extra headers join it", async () => {
  const calls = answer(200, { ok: true });
  await api("/api/orders/1", { method: "PATCH", body: { note: "Ring twice" }, headers: { "x-order-link": "abc" } });
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(calls[0].init.body, '{"note":"Ring twice"}');
  assert.deepEqual(calls[0].init.headers, { "content-type": "application/json", "x-order-link": "abc" });
});

test("FormData, a Blob and a string go as they are, with no JSON content type", async () => {
  const calls = answer(200, {});
  const form = new FormData();
  form.set("file", new Blob(["x"]), "photo.png");
  await api("/api/photos", { method: "POST", body: form });
  assert.equal(calls[0].init.body, form);
  assert.equal(calls[0].init.headers, undefined);
});

test("an empty answer is undefined, not an error", async () => {
  answer(204);
  assert.equal(await api("/api/orders/1", { method: "DELETE" }), undefined);
  answer(200, "");
  assert.equal(await api("/api/ping"), undefined);
});

// ── the three refusal shapes ──────────────────────────────

test("a refusal with plain words carries the status and the words", async () => {
  answer(409, { detail: "That order was already paid." });
  await assert.rejects(api("/api/orders/1/pay", { method: "POST" }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "");
    assert.equal(error.message, "That order was already paid.");
    return true;
  });
});

test("a refusal with a code, words and Arabic words keeps all three", () => {
  const error = refusal(400, { detail: { code: "price_missing", message: "Add a price.", message_ar: "أضف سعراً." } });
  assert.equal(error.status, 400);
  assert.equal(error.code, "price_missing");
  assert.equal(error.message, "Add a price.");
  assert.equal(error.ar, "أضف سعراً.");
});

test("a refusal with words in detail and the code beside it is read too", () => {
  const error = refusal(422, { detail: "Photo too large.", code: "photo_size", message_ar: "الصورة كبيرة." });
  assert.equal(error.code, "photo_size");
  assert.equal(error.message, "Photo too large.");
  assert.equal(error.ar, "الصورة كبيرة.");
});

test("FastAPI's list of field errors is the code invalid, with no words", () => {
  const error = refusal(422, { detail: [{ loc: ["body", "price"], msg: "field required", type: "missing" }] });
  assert.equal(error.code, "invalid");
  assert.equal(error.message, "");
});

test("a refusal that is not JSON still has a status", async () => {
  answer(502, "<html>Bad gateway</html>");
  await assert.rejects(api("/api/orders"), (error) => error instanceof ApiError && error.status === 502 && error.code === "");
});

test("no answer at all is status 0, offline", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(api("/api/orders"), (error) => error instanceof ApiError && error.status === 0 && error.code === "offline");
});

test("a call the screen cancelled is left as the abort it was", async () => {
  globalThis.fetch = async () => {
    throw new DOMException("aborted", "AbortError");
  };
  await assert.rejects(api("/api/orders"), (error) => error.name === "AbortError" && !(error instanceof ApiError));
});

// ── 401 ───────────────────────────────────────────────────

test("a 401 signs the person out, and the screen still gets the refusal", async () => {
  let signedOut = 0;
  const restore = setSignedOutHandler(() => signedOut++);
  try {
    answer(401, { detail: "Not signed in" });
    await assert.rejects(api("/api/workspace"), (error) => error instanceof ApiError && error.status === 401);
    assert.equal(signedOut, 1);
  } finally {
    restore();
  }
});

test("a screen can keep a 401 to itself, and a wrong sign-in code is not a sign-out", async () => {
  let signedOut = 0;
  const restore = setSignedOutHandler(() => signedOut++);
  try {
    answer(401, { detail: "Sign in again" });
    await assert.rejects(api("/api/admin/staff", { signOut: false }));
    answer(401, { detail: "Wrong code" });
    await assert.rejects(api("/api/auth/verify", { method: "POST", body: { code: "000000" } }));
    answer(403, { detail: "No" });
    await assert.rejects(api("/api/workspace"));
    assert.equal(signedOut, 0);
  } finally {
    restore();
  }
});

// ── the sentence, in each language ────────────────────────

test("a sentence the screen wrote for a code wins", () => {
  const error = refusal(400, { detail: { code: "price_missing", message: "Add a price.", message_ar: "أضف سعراً." } });
  const known = { price_missing: { en: "Every item needs a price.", ar: "لكل صنف سعر." } };
  assert.equal(say(error, "en", known), "Every item needs a price.");
  assert.equal(say(error, "ar", known), "لكل صنف سعر.");
});

test("without one, the API's own words are used: its Arabic in Arabic", () => {
  const error = refusal(400, { detail: { code: "x", message: "Add a price.", message_ar: "أضف سعراً." } });
  assert.equal(say(error, "en"), "Add a price.");
  assert.equal(say(error, "ar"), "أضف سعراً.");
});

test("with no Arabic from the API, Arabic gets the standard sentence for the status", () => {
  assert.equal(say(refusal(403, { detail: "Staff only." }), "ar"), API_COPY.forbidden.ar);
  assert.equal(say(refusal(404, {}), "ar"), API_COPY.gone.ar);
  assert.equal(say(refusal(404, {}), "en"), API_COPY.gone.en);
});

test("the standard sentences cover offline, 401, 409, 422, 429, 5xx and the rest", () => {
  const offline = new ApiError(0, "offline", "offline");
  assert.equal(say(offline, "en"), "No connection. Try again.");
  assert.equal(say(offline, "ar"), API_COPY.offline.ar);
  assert.equal(say(refusal(401, {}), "en"), API_COPY.signedOut.en);
  assert.equal(say(refusal(409, {}), "en"), API_COPY.changed.en);
  assert.equal(say(refusal(422, { detail: [] }), "en"), API_COPY.invalid.en);
  assert.equal(say(refusal(429, {}), "ar"), API_COPY.tooMany.ar);
  assert.equal(say(refusal(500, {}), "en"), API_COPY.server.en);
  assert.equal(say(refusal(418, {}), "en"), API_COPY.failed.en);
  assert.equal(say(new Error("boom"), "en"), API_COPY.failed.en);
  assert.equal(say("boom", "ar"), API_COPY.failed.ar);
});

test("an English message that is long or is markup is never shown", () => {
  assert.equal(say(refusal(500, { detail: "x".repeat(300) }), "en"), API_COPY.server.en);
  assert.equal(say(new ApiError(500, "", "<html>oops</html>"), "en"), API_COPY.server.en);
});

test("every sentence exists in both languages, with no em dash, no AI word and no ellipsis", () => {
  for (const [key, line] of Object.entries(API_COPY)) {
    assert.ok(line.en && line.ar, `${key} needs both languages`);
    assert.doesNotMatch(line.en + line.ar, /—|…|\.\.\./, key);
    assert.doesNotMatch(line.en, /\b(AI|smart|assistant|bot|magic)\b/i, key);
  }
});

// ── the language helpers ──────────────────────────────────

test("Arabic reads right to left and English left to right", () => {
  assert.equal(dirOf("ar"), "rtl");
  assert.equal(dirOf("en"), "ltr");
});

test("pickText takes the line in the language", () => {
  const text = { en: "Orders", ar: "الطلبات" };
  assert.equal(pickText(text, "en"), "Orders");
  assert.equal(pickText(text, "ar"), "الطلبات");
});
