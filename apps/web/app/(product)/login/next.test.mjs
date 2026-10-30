// Tests for where a sign-in returns to (`/login?next=/ops/signup`): only a plain path of the
// product's own signed-in areas, never another site, and for the back office only for ALYR staff.
// Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { COPY } from "./copy.ts";
import { AFTER_SIGN_IN, isBackOffice, landing, loginUrl, safeNext } from "./next.ts";

const BACKSLASH = String.fromCharCode(92);

test("a page that needs a sign-in can be returned to", () => {
  for (const path of [
    "/ops", "/ops/signup", "/ops/onboarding", "/ops/clients/3f2a9c1e-8b7d-4e5f-9a10-1c2d3e4f5a6b",
    "/app", "/app/orders", "/app/orders?show=unmarked", "/start", "/start/stop", "/ops/", "/app/catalog/items",
  ]) {
    assert.equal(safeNext(path), path, path);
  }
});

test("a hostile or odd value is never used as a place to go", () => {
  const hostile = [
    // another site, however it is written
    "//evil.example", "///evil.example", `/${BACKSLASH}evil.example`, `${BACKSLASH}evil.example`,
    `${BACKSLASH}${BACKSLASH}evil.example`, `/ops${BACKSLASH}signup`, `/ops/${BACKSLASH}signup`,
    "https://evil.example", "http://evil.example/ops", "HTTP://evil.example", "javascript:alert(1)",
    "data:text/html,x", "/ops@evil.example", "/ops:80", "/ops.evil.example", "/start.evil.example",
    // a path that climbs out, or hides a second slash
    "/ops/../login", "/ops/..", "/ops//signup", "/app//evil.example", "/ops/./signup",
    // percent-encoded tricks, whether or not they were decoded once already
    "/ops%2F..%2Flogin", "%2F%2Fevil.example", "/%2Fevil.example", "/ops%5Cevil", "%2Fops", "/ops/%00",
    "/ops/%2e%2e/login", "%252F%252Fevil.example",
    // not an area of the product
    "/login", "/login?next=/ops", "/api/auth/logout", "/s/shop", "/pay/x/y", "/", "/opsx", "/application",
    "/OPS", "/Ops/signup", "/whatsapp", "/ar", "ops/signup", "signup",
    // characters that end or hide a path
    "/ops/signup#frag", "/ops/signup\n", "/ops/signup\r\nSet-Cookie: a=b", "/ops/signup ", " /ops/signup",
    "/ops/sign up", "/ops/signup\t", "/ops/‮signup", "/ops/sign\u0000up", "/ops/signup?next=//evil.example",
    "/ops/signup?a=b/c", "/ops/signup?a=<script>", "/ｏｐｓ/signup", "/ops/sígnup",
    // empty, the wrong type and very long
    "", "   ", null, undefined, 5, {}, ["/ops"], `/ops/${"a".repeat(80)}`, `/ops${"/a".repeat(20)}`,
    `/app?${"a".repeat(500)}`,
  ];
  for (const value of hostile) {
    assert.equal(safeNext(value), null, `${JSON.stringify(value)} was accepted`);
  }
});

test("a value is read from the address once, and a second layer of encoding stays refused", () => {
  const read = (query) => safeNext(new URLSearchParams(query).get("next"));
  assert.equal(read("next=%2Fops%2Fsignup"), "/ops/signup");
  assert.equal(read("next=/ops/signup"), "/ops/signup");
  assert.equal(read("next=%252Fops%252Fsignup"), null);
  assert.equal(read("next=%2F%2Fevil.example"), null);
  assert.equal(read("next=%5C%5Cevil.example"), null);
  assert.equal(read("next=%2Fops%2F..%2F..%2Fapi"), null);
  assert.equal(read("next=https%3A%2F%2Fevil.example"), null);
  assert.equal(read(""), null);
});

test("the back office sends the page it came from, and only a safe one", () => {
  assert.equal(loginUrl("/ops/signup"), "/login?next=/ops/signup");
  assert.equal(loginUrl("/ops"), "/login?next=/ops");
  assert.equal(loginUrl("/app/orders?show=unmarked"), "/login?next=/app/orders%3Fshow%3Dunmarked");
  assert.equal(loginUrl("//evil.example"), "/login");
  assert.equal(loginUrl("/somewhere/else"), "/login");
  assert.equal(loginUrl(undefined), "/login");
  // What the link carries reads back to the same page.
  for (const path of ["/ops/signup", "/ops/clients/3f2a9c1e-8b7d-4e5f-9a10-1c2d3e4f5a6b", "/app/orders?show=unmarked"]) {
    const query = loginUrl(path).split("?").slice(1).join("?");
    assert.equal(new URLSearchParams(query).get("next"), path);
  }
});

test("a back-office page is for ALYR staff; anyone else lands in the workspace as before", async () => {
  const staff = async () => true;
  const notStaff = async () => false;
  const broken = async () => { throw new Error("offline"); };
  assert.equal(await landing("/ops/signup", staff), "/ops/signup");
  assert.equal(await landing("/ops/signup", notStaff), AFTER_SIGN_IN);
  assert.equal(await landing("/ops/signup", broken), AFTER_SIGN_IN);
  assert.equal(AFTER_SIGN_IN, "/app");
  // The workspace and sign-up are not behind the staff check, and the check is not made for them.
  let asked = 0;
  const counted = async () => { asked += 1; return true; };
  assert.equal(await landing("/app/orders", counted), "/app/orders");
  assert.equal(await landing("/start", counted), "/start");
  assert.equal(asked, 0);
  // Nothing, or something hostile, is the workspace, and nothing is asked.
  for (const value of [null, undefined, "", "//evil.example", "https://evil.example", "/ops/../login", "/login"]) {
    assert.equal(await landing(value, counted), "/app", String(value));
  }
  assert.equal(asked, 0);
  assert.equal(isBackOffice("/ops"), true);
  assert.equal(isBackOffice("/ops/signup"), true);
  assert.equal(isBackOffice("/opsx"), false);
  assert.equal(isBackOffice("/app"), false);
});

test("the sign-in page goes where it is sent, and the back office asks to be returned to", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /router\.push\("\/app"\)/);
  assert.match(page, /landing\(next,/);
  assert.match(page, /window\.location\.search/);
  const shell = readFileSync(new URL("../ops/Shell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /href="\/login"/);
  assert.match(shell, /href=\{loginUrl\(path\)\}/);
});

test("under the form, a person whose code does not arrive is told which address to use", () => {
  assert.match(COPY.en.noCode, /signed up with/);
  assert.match(COPY.en.noCode, /ALYR set up/);
  assert.match(COPY.ar.noCode, /ALYR/);
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /\{t\.noCode\}/);
});
