import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCapacityEnvelope,
  CAPACITY_LIMITS,
  parseArguments,
  runReadProbe,
  validateProductionProbeUrl,
} from "../scripts/api-capacity-probe.mjs";

test("10K capacity envelope exposes the free-tier storage and invocation breakpoints", () => {
  const capacity = buildCapacityEnvelope();
  assert.equal(capacity.users, 10_000);
  assert.equal(capacity.providerFreeEnvelope.storageBytesPerUser, 100_000);
  assert.equal(capacity.providerFreeEnvelope.monthlyEgressBytesPerUser, 500_000);
  assert.equal(capacity.providerFreeEnvelope.monthlyEdgeInvocationsPerUser, 50);
  assert.equal(capacity.applicationEnvelope.globalStorageBytesPerUser, 83_886.08);
  assert.equal(capacity.applicationEnvelope.householdsAtDeclaredQuota, 20);
  assert.equal(capacity.applicationEnvelope.householdsAtOnePrimaryImage, 400);
  assert.equal(capacity.applicationEnvelope.declaredQuotaFitsGlobalLimit, false);
  assert.equal(capacity.hardGates.storageProviderUpgradeOrAdapterRequired, true);
  assert.equal(
    capacity.applicationEnvelope.declaredHouseholdStorageBytes,
    CAPACITY_LIMITS.applicationHouseholdStorageBytes * 10_000,
  );
});

test("argument parser keeps live execution bounded", () => {
  const options = parseArguments([
    "--execute",
    "--url=https://project.supabase.co/functions/v1/api/signup/mode",
    "--requests=20",
    "--concurrency=3",
    "--requests-per-second=5",
    "--p95-budget-ms=2500",
  ]);
  assert.equal(options.execute, true);
  assert.equal(options.requests, 20);
  assert.equal(options.concurrency, 3);
  assert.equal(options.requestsPerSecond, 5);
  assert.equal(options.p95BudgetMs, 2500);
  assert.throws(() => parseArguments(["--requests=21"]), /1 through 20/);
  assert.throws(() => parseArguments(["--concurrency=4"]), /1 through 3/);
  assert.throws(() => parseArguments(["--unknown=value"]), /Unknown argument/);
});

test("production target validation only admits the read-only Supabase route", () => {
  assert.equal(
    validateProductionProbeUrl(
      "https://project.supabase.co/functions/v1/api/signup/mode",
    ),
    "https://project.supabase.co/functions/v1/api/signup/mode",
  );
  assert.throws(
    () => validateProductionProbeUrl("http://project.supabase.co/functions/v1/api/signup/mode"),
    /must use HTTPS/,
  );
  assert.throws(
    () => validateProductionProbeUrl("https://example.com/functions/v1/api/signup/mode"),
    /Supabase project hostname/,
  );
  assert.throws(
    () => validateProductionProbeUrl("https://project.supabase.co/functions/v1/api/sync/pull"),
    /read-only \/signup\/mode/,
  );
  assert.throws(
    () =>
      validateProductionProbeUrl(
        "https://user:secret@project.supabase.co/functions/v1/api/signup/mode",
      ),
    /must not contain credentials/,
  );
});

test("read probe verifies signed payload, request correlation, cache policy, and latency", async () => {
  const observedRequestIds = [];
  const fetchImpl = async (_url, options) => {
    const requestId = options.headers["X-Request-Id"];
    observedRequestIds.push(requestId);
    return new Response(
      JSON.stringify({
        apiVersion: 1,
        contract: "heldat-signup-mode-v1",
        signupMode: "closed_pilot",
        configVersion: "1",
        issuedAt: "2099-07-31T00:00:00.000Z",
        expiresAt: "2099-07-31T00:05:00.000Z",
        signature: "a".repeat(64),
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "private, no-store",
          "x-request-id": requestId,
        },
      },
    );
  };
  const result = await runReadProbe({
    url: "http://127.0.0.1/functions/v1/api/signup/mode",
    requests: 3,
    concurrency: 1,
    requestsPerSecond: 5,
    p95BudgetMs: 3_000,
    fetchImpl,
    allowLocal: true,
  });
  assert.equal(result.passed, true);
  assert.deepEqual(result.statusCounts, { 200: 3 });
  assert.deepEqual(result.errorCodeCounts, {});
  assert.deepEqual(result.failureSamples, []);
  assert.equal(result.failures.transport, 0);
  assert.equal(result.failures.requestId, 0);
  assert.equal(result.failures.cachePolicy, 0);
  assert.equal(result.failures.payload, 0);
  assert.equal(new Set(observedRequestIds).size, 3);
});

test("rate limiting below the probe envelope is surfaced as a failed readiness sample", async () => {
  const fetchImpl = async (_url, options) =>
    new Response("{}", {
      status: 429,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "retry-after": "30",
        "x-request-id": options.headers["X-Request-Id"],
      },
    });
  const result = await runReadProbe({
    url: "http://localhost/functions/v1/api/signup/mode",
    requests: 1,
    fetchImpl,
    allowLocal: true,
  });
  assert.equal(result.passed, false);
  assert.equal(result.failures.rateLimited, 1);
  assert.equal(result.failures.retryAfter, 0);
  assert.deepEqual(result.errorCodeCounts, { HTTP_429: 1 });
});

test("read probe records bounded structured diagnostics for server failures", async () => {
  const fetchImpl = async (_url, options) =>
    new Response(
      JSON.stringify({
        error: {
          errorVersion: 1,
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
        },
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "retry-after": "30",
          "x-request-id": options.headers["X-Request-Id"],
        },
      },
    );
  const result = await runReadProbe({
    url: "http://localhost/functions/v1/api/signup/mode",
    requests: 1,
    fetchImpl,
    allowLocal: true,
  });
  assert.equal(result.passed, false);
  assert.equal(result.failures.serverErrors, 1);
  assert.deepEqual(result.errorCodeCounts, { STORAGE_UNAVAILABLE: 1 });
  assert.deepEqual(result.failureSamples, [
    {
      status: 503,
      errorCode: "STORAGE_UNAVAILABLE",
      retryable: true,
      validRetryAfter: true,
    },
  ]);
});
