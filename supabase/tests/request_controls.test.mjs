import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controls = await readFile(
  new URL("../functions/_shared/requestControls.ts", import.meta.url),
  "utf8",
);
const api = await readFile(
  new URL("../functions/api/index.ts", import.meta.url),
  "utf8",
);

test("browser API access is explicit while native requests remain supported", () => {
  assert.match(controls, /request\.headers\.get\("Origin"\)/u);
  assert.match(controls, /if \(!origin\) return true/u);
  assert.match(controls, /configuredBrowserOrigins\(configured\)\.has/u);
  assert.doesNotMatch(controls, /Access-Control-Allow-Origin["']?:\s*["']\*["']/u);
});

test("network identifiers are validated and hashed before persistence", () => {
  assert.match(controls, /cf-connecting-ip/u);
  assert.match(controls, /x-real-ip/u);
  assert.match(controls, /\^\[0-9a-f:\.\]\+\$/u);
  assert.match(controls, /crypto\.subtle\.digest\(\s*"SHA-256"/u);
  assert.match(controls, /p_scope_hash: scopeHash/u);
  assert.doesNotMatch(controls, /p_scope_hash: scope,/u);
});

test("public and authenticated routes have bounded policies", () => {
  for (const group of [
    "signup.preflight",
    "pilot.preflight",
    "invites.preflight",
    "maintenance.exports",
    "sync.push",
    "sync.pull",
    "household.storage.read",
    "network.authenticated.household.storage.read",
    "uploads",
    "exports.create",
    "account.delete",
  ]) {
    assert.match(controls, new RegExp(`routeGroup: "${group}"`, "u"));
  }
  assert.match(controls, /unavailable: true/u);
  assert.match(api, /await enforceNetworkRateLimit\(request, path\)/u);
  assert.match(api, /await enforceUserRateLimit\([\s\S]*context\.userId/u);
  assert.match(api, /"RATE_LIMITED"/u);
  assert.match(
    api,
    /function requiresPersistentNetworkRateLimit\([\s\S]*request\.method === "GET" && path === "\/signup\/mode"[\s\S]*if \(requiresPersistentNetworkRateLimit\(request, path\)\)[\s\S]*await enforceNetworkRateLimit\(request, path\)/u,
  );
  assert.doesNotMatch(controls, /routeGroup: "signup\.mode"/u);
});

test("shared-network limits do not make signed-in users share a tiny NAT bucket", () => {
  assert.match(controls, /network\.authenticated\.sync\.push/u);
  assert.match(controls, /network\.authenticated\.sync\.pull/u);
  assert.match(controls, /network\.authenticated\.uploads/u);
  assert.match(
    controls,
    /routeGroup: "network\.authenticated-or-unknown"[\s\S]*limit: 600/u,
  );
  assert.match(
    controls,
    /authenticated requests receive a second, actor-specific limiter/iu,
  );
  assert.doesNotMatch(
    controls,
    /routeGroup: "network\.default"[\s\S]{0,80}limit: 120/u,
  );
});

test("operational telemetry is structured and free of query or payload data", () => {
  assert.match(controls, /X-Request-Id/u);
  assert.match(controls, /api\.request\.completed/u);
  assert.match(controls, /JSON\.stringify/u);
  assert.doesNotMatch(controls, /request\.url/u);
  assert.doesNotMatch(controls, /authorization/iu);
  assert.doesNotMatch(controls, /body:/u);
  assert.match(api, /withOperationalHeaders\(/u);
  assert.match(api, /logRequestCompletion\(/u);
  assert.match(api, /api\.request\.failed/u);
});
