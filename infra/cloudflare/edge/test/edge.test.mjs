// The edge Worker's own tests (ALY-265). Run with `pnpm test` in this folder; they need no
// install and no Cloudflare account: the Worker is called as a function and the Cloud Run side
// is a stand-in `fetch` that records what it was given.
//
// Node 22.18 or later reads the TypeScript source directly.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import worker from "../src/index.ts";

const WEB = "https://alyr-web-841433519399.me-central1.run.app";
const API = "https://alyr-api-841433519399.me-central1.run.app";
const KEY = "alyr-test-key";

// The same three values are asserted by the API's tests (apps/api/tests/test_client_address.py):
// if the Worker and the API ever sign differently, both sides fail.
const GOLDEN = [
  [KEY, "203.0.113.7", "928601c79d494c6b8eca820cc396164a9432707a43b853b936bda83025c1d613"],
  [KEY, "2001:db8::1", "76abbbc7c69d3e992c0d6832572df308e8c5b1416012d34f84f26729c09ba3d3"],
  ["another-key", "203.0.113.7", "5e8dad3e88c7e918d354ca8fb959a4406cbc6af3825e26917d1a9807dcaa4b63"],
];

/** Call the Worker as Cloudflare would, with a stand-in for Cloud Run. */
async function through(url, { headers = {}, env = {}, method = "GET", body, answer } = {}) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (target, init) => {
    calls.push({ target: String(target), init, body: init.body ? await new Response(init.body).text() : "" });
    return answer ?? new Response("ok", { status: 200 });
  };
  try {
    const request = new Request(url, { method, headers, body });
    const response = await worker.fetch(request, { WEB_ORIGIN: WEB, API_ORIGIN: API, ...env });
    return { response, calls, sent: calls[0] && new Headers(calls[0].init.headers) };
  } finally {
    globalThis.fetch = real;
  }
}

const VISITOR = {
  "CF-Connecting-IP": "203.0.113.7",
  // What a visitor can write about themselves; none of it may reach Cloud Run.
  "x-alyr-client-ip": "198.51.100.99",
  "x-alyr-client-ip-sig": "deadbeef",
  "x-forwarded-for": "198.51.100.98",
  "x-real-ip": "198.51.100.97",
};

test("the signature is the one the API checks, on known values", async () => {
  for (const [key, address, expected] of GOLDEN) {
    assert.equal(createHmac("sha256", key).update(address).digest("hex"), expected);
    const { sent } = await through("https://api.alyr.qa/health", {
      headers: { "CF-Connecting-IP": address }, env: { CLIENT_IP_KEY: key },
    });
    assert.equal(sent.get("x-alyr-client-ip"), address);
    assert.equal(sent.get("x-alyr-client-ip-sig"), expected);
  }
});

test("the visitor's address comes from Cloudflare and is signed, never taken from the visitor", async () => {
  for (const host of ["app.alyr.qa", "api.alyr.qa"]) {
    const { sent } = await through(`https://${host}/api/auth/code`, {
      headers: VISITOR, env: { CLIENT_IP_KEY: KEY },
    });
    assert.equal(sent.get("x-alyr-client-ip"), "203.0.113.7", host);
    assert.equal(sent.get("x-alyr-client-ip-sig"), GOLDEN[0][2], host);
    assert.equal(sent.get("x-forwarded-for"), "203.0.113.7", host);
    assert.equal(sent.get("x-real-ip"), null, host);
  }
});

test("a visitor's own signature is dropped even when the Worker has no key yet", async () => {
  const { sent } = await through("https://app.alyr.qa/login", { headers: VISITOR });
  assert.equal(sent.get("x-alyr-client-ip"), "203.0.113.7");
  assert.equal(sent.get("x-alyr-client-ip-sig"), null);
});

test("a key pasted with a newline signs the same", async () => {
  const { sent } = await through("https://app.alyr.qa/login", {
    headers: VISITOR, env: { CLIENT_IP_KEY: `${KEY}\r\n` },
  });
  assert.equal(sent.get("x-alyr-client-ip-sig"), GOLDEN[0][2]);
  const blank = await through("https://app.alyr.qa/login", { headers: VISITOR, env: { CLIENT_IP_KEY: " \n" } });
  assert.equal(blank.sent.get("x-alyr-client-ip-sig"), null);
});

test("with no address from Cloudflare nothing a visitor wrote about themselves goes through", async () => {
  const asked = { ...VISITOR };
  delete asked["CF-Connecting-IP"];
  const { sent } = await through("https://api.alyr.qa/api/auth/code", {
    headers: asked, env: { CLIENT_IP_KEY: KEY },
  });
  for (const name of ["x-alyr-client-ip", "x-alyr-client-ip-sig", "x-forwarded-for", "x-real-ip"]) {
    assert.equal(sent.get(name), null, name);
  }
});

test("each name goes to its own service, with the path, query, method and body unchanged", async () => {
  const web = await through("https://app.alyr.qa/s/qirfa?item=7", { headers: VISITOR });
  assert.equal(web.calls[0].target, `${WEB}/s/qirfa?item=7`);
  assert.equal(web.sent.get("x-forwarded-host"), "app.alyr.qa");
  assert.equal(web.sent.get("x-forwarded-proto"), "https");

  // Meta's webhook signature covers the exact bytes.
  const payload = '{"entry":[{"id":"1","note":"مرحبا"}]}';
  const hook = await through("https://api.alyr.qa/webhooks/whatsapp?x=1", {
    method: "POST", body: payload, headers: { ...VISITOR, "x-hub-signature-256": "sha256=abc" },
  });
  assert.equal(hook.calls[0].target, `${API}/webhooks/whatsapp?x=1`);
  assert.equal(hook.calls[0].init.method, "POST");
  assert.equal(hook.calls[0].body, payload);
  assert.equal(hook.sent.get("x-hub-signature-256"), "sha256=abc");
});

test("any other name is not ours", async () => {
  const { response, calls } = await through("https://evil.example/", { headers: VISITOR });
  assert.equal(response.status, 404);
  assert.equal(calls.length, 0);
});

test("a redirect to the service's own address is pointed back at the public name", async () => {
  const own = new Response(null, { status: 302, headers: { Location: `${WEB}/app?x=1` } });
  const moved = await through("https://app.alyr.qa/login", { answer: own });
  assert.equal(moved.response.status, 302);
  assert.equal(moved.response.headers.get("location"), "https://app.alyr.qa/app?x=1");

  const away = new Response(null, { status: 302, headers: { Location: "https://example.com/pay" } });
  const kept = await through("https://app.alyr.qa/login", { answer: away });
  assert.equal(kept.response.headers.get("location"), "https://example.com/pay");
});
