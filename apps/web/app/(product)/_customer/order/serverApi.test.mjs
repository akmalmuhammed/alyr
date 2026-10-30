// Tests for what the web app's server sends the API on a visitor's behalf (ALY-265): the two
// headers that say who the visitor is go along, nothing else of the visitor's does, and a call
// the server makes by itself never writes them. Real HTTP: a stand-in API listens on a port and
// records what arrives. Run with `node --test` from apps/web (Node 22.18 or newer reads the .ts
// files as they are; CI and scripts/check.sh run this).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { askApi, visitorHeaders, VISITOR_HEADERS } from "./serverApi.ts";

const seen = [];
let server;
let api;

before(async () => {
  server = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/missing")) {
      res.statusCode = 404;
      res.end('{"detail":"no such shop"}');
    } else {
      res.end('{"name":"Qirfa"}');
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  api = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const SIGNED = { "x-alyr-client-ip": "203.0.113.7", "x-alyr-client-ip-sig": "ab".repeat(32) };

test("the visitor's address and its signature are copied from the request being answered", () => {
  const incoming = new Headers({
    ...SIGNED,
    cookie: "session=secret",
    authorization: "Bearer secret",
    "x-forwarded-for": "198.51.100.1",
    "accept-language": "ar",
  });
  assert.deepEqual(visitorHeaders(incoming), SIGNED);
  assert.deepEqual([...VISITOR_HEADERS], ["x-alyr-client-ip", "x-alyr-client-ip-sig"]);
});

test("nothing is invented: a request that carries neither header yields none", () => {
  assert.deepEqual(visitorHeaders(new Headers({ "accept-language": "ar" })), {});
  assert.deepEqual(visitorHeaders(new Headers({ "x-alyr-client-ip": "" })), {});
});

test("the API receives both headers, over real HTTP, beside the customer's link", async () => {
  seen.length = 0;
  const { status, body } = await askApi(api, "/api/store/qirfa?limit=48", {
    token: "tok.en-1", visitor: SIGNED,
  });
  assert.equal(status, 200);
  assert.deepEqual(body, { name: "Qirfa" });
  const [got] = seen;
  assert.equal(got.url, "/api/store/qirfa?limit=48");
  assert.equal(got.headers["x-alyr-client-ip"], "203.0.113.7");
  assert.equal(got.headers["x-alyr-client-ip-sig"], SIGNED["x-alyr-client-ip-sig"]);
  // The link stays out of the address, where the API's request log would keep it.
  assert.equal(got.headers["x-order-link"], "tok.en-1");
  assert.ok(!got.url.includes("tok.en-1"));
});

test("without a visitor nothing about one is sent, and no link header either", async () => {
  seen.length = 0;
  await askApi(api, "/api/store/qirfa");
  const [got] = seen;
  assert.equal(got.headers["x-alyr-client-ip"], undefined);
  assert.equal(got.headers["x-alyr-client-ip-sig"], undefined);
  assert.equal(got.headers["x-order-link"], undefined);
});

test("what the API refuses or cannot answer comes back as a status, not a throw", async () => {
  const refused = await askApi(api, "/missing", { visitor: SIGNED });
  assert.deepEqual(refused, { status: 404, body: null });
  const down = await askApi("http://127.0.0.1:9", "/api/store/qirfa", { visitor: SIGNED });
  assert.deepEqual(down, { status: 0, body: null });
});

test("every place the server calls the API itself goes through askApi", () => {
  // A new server-side caller that built its own fetch would send every visitor to the API as
  // this server's address. Next's config (the /api rewrite) is the one other reader of the
  // setting, and it forwards the browser's own request headers as they are.
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const callers = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && /\.(ts|tsx)$/.test(f.name) && !f.name.endsWith(".d.ts"))
    .map((f) => `${f.parentPath}/${f.name}`)
    .filter((path) => !/node_modules/.test(path))
    .filter((path) => readFileSync(path, "utf8").includes("ALYR_API_URL"));
  assert.ok(callers.length >= 1, "the order page reads ALYR_API_URL");
  for (const path of callers) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /askApi/, `${path} must call the API through askApi`);
    assert.match(source, /visitorHeaders\(/, `${path} must pass the visitor's headers on`);
  }
});
