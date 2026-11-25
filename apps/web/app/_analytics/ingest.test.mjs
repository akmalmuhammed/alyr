// The public site's Worker forwards alyr.qa/ingest to PostHog's EU region, and nowhere else.
import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../site-worker.js";

/** Call the Worker as Cloudflare would; `fetch` records where it was sent. */
async function through(url, headers = {}) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (request) => {
    calls.push(request);
    return new Response("ok");
  };
  try {
    const response = await worker.fetch(new Request(url, { headers }), { REDIRECT: "on" });
    return { response, calls };
  } finally {
    globalThis.fetch = real;
  }
}

test("events and PostHog's own scripts go to PostHog's EU addresses", async () => {
  const events = await through("https://alyr.qa/ingest/e/?ip=0");
  assert.equal(events.calls[0].url, "https://eu.i.posthog.com/e/?ip=0");
  const scripts = await through("https://alyr.qa/ingest/static/array.js");
  assert.equal(scripts.calls[0].url, "https://eu-assets.i.posthog.com/static/array.js");
});

test("a path that starts with // cannot pick another host (pen test, 25 Nov)", async () => {
  for (const url of ["https://alyr.qa/ingest//example.com/", "https://alyr.qa/ingest///example.com/x",
    "https://alyr.qa/ingest/static//example.com/"]) {
    const { calls } = await through(url);
    for (const call of calls) {
      assert.match(new URL(call.url).host, /^eu(-assets)?\.i\.posthog\.com$/, url);
    }
  }
});

test("cookies and credentials are never forwarded", async () => {
  const { calls } = await through("https://alyr.qa/ingest/e/", {
    Cookie: "alyr-analytics=granted", Authorization: "Bearer x", "CF-Connecting-IP": "203.0.113.7",
  });
  const sent = calls[0].headers;
  assert.equal(sent.get("cookie"), null);
  assert.equal(sent.get("authorization"), null);
  assert.equal(sent.get("x-forwarded-for"), "203.0.113.7");
});
