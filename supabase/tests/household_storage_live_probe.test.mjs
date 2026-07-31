import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  authenticatedProbeConfiguration,
  AuthenticatedProbeInputError,
  PROBE_CONFIRMATION,
  PROBE_ENVIRONMENT,
  runAuthenticatedHouseholdStorageProbe,
  validateHouseholdStoragePayload,
} from "../scripts/probe-household-storage-live.mjs";

const SCRIPT_PATH = fileURLToPath(
  new URL("../scripts/probe-household-storage-live.mjs", import.meta.url),
);
const SECURE_WRAPPER_PATH = fileURLToPath(
  new URL("../scripts/invoke-household-storage-live-probe.ps1", import.meta.url),
);
const secureWrapper = fs.readFileSync(SECURE_WRAPPER_PATH, "utf8");
const NOW_MS = Date.parse("2026-08-01T00:00:00.000Z");
const HOUSEHOLD_ID = "ab000000-0000-4000-8000-000000000001";
const SUBJECT_ID = "ab000000-0000-4000-8000-000000000002";
const REQUEST_ID = "ab000000-0000-4000-8000-000000000003";
const PUBLIC_KEY = `sb_publishable_${"p".repeat(32)}`;
const PROJECT_ORIGIN = "https://ifiyragzeizaxdqzxvpk.supabase.co";

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function ephemeralToken(nowMs = NOW_MS) {
  const nowSeconds = Math.floor(nowMs / 1_000);
  return [
    base64UrlJson({ alg: "ES256", typ: "JWT" }),
    base64UrlJson({
      iss: `${PROJECT_ORIGIN}/auth/v1`,
      sub: SUBJECT_ID,
      role: "authenticated",
      iat: nowSeconds - 10,
      exp: nowSeconds + 3_600,
    }),
    "s".repeat(64),
  ].join(".");
}

function validEnvironment(nowMs = NOW_MS) {
  return {
    [PROBE_ENVIRONMENT.confirmation]: PROBE_CONFIRMATION,
    [PROBE_ENVIRONMENT.projectUrl]: PROJECT_ORIGIN,
    [PROBE_ENVIRONMENT.publicKey]: PUBLIC_KEY,
    [PROBE_ENVIRONMENT.accessToken]: ephemeralToken(nowMs),
    [PROBE_ENVIRONMENT.householdId]: HOUSEHOLD_ID,
  };
}

test("configuration is fail-closed without the exact read-only opt-in", () => {
  const environment = validEnvironment();
  delete environment[PROBE_ENVIRONMENT.confirmation];
  assert.throws(
    () => authenticatedProbeConfiguration(environment, { nowMs: NOW_MS }),
    (error) =>
      error instanceof AuthenticatedProbeInputError &&
      error.code === "PROBE_CONFIRMATION_REQUIRED",
  );
});

test("configuration pins the project, rejects privileged keys, and requires a short-lived authenticated token", () => {
  const wrongProject = validEnvironment();
  wrongProject[PROBE_ENVIRONMENT.projectUrl] = "https://example.supabase.co";
  assert.throws(
    () => authenticatedProbeConfiguration(wrongProject, { nowMs: NOW_MS }),
    (error) => error.code === "INVALID_PROJECT_URL",
  );

  const secretKey = validEnvironment();
  secretKey[PROBE_ENVIRONMENT.publicKey] = `sb_secret_${"x".repeat(32)}`;
  assert.throws(
    () => authenticatedProbeConfiguration(secretKey, { nowMs: NOW_MS }),
    (error) => error.code === "INVALID_PUBLIC_KEY",
  );

  const expired = validEnvironment();
  expired[PROBE_ENVIRONMENT.accessToken] = ephemeralToken(NOW_MS - 3_700_000);
  assert.throws(
    () => authenticatedProbeConfiguration(expired, { nowMs: NOW_MS }),
    (error) => error.code === "INVALID_EPHEMERAL_ACCESS_TOKEN",
  );

  const longLived = validEnvironment();
  const nowSeconds = Math.floor(NOW_MS / 1_000);
  longLived[PROBE_ENVIRONMENT.accessToken] = [
    base64UrlJson({ alg: "ES256", typ: "JWT" }),
    base64UrlJson({
      iss: `${PROJECT_ORIGIN}/auth/v1`,
      sub: SUBJECT_ID,
      role: "authenticated",
      iat: nowSeconds - 7_200,
      exp: nowSeconds + 3_600,
    }),
    "s".repeat(64),
  ].join(".");
  assert.throws(
    () => authenticatedProbeConfiguration(longLived, { nowMs: NOW_MS }),
    (error) => error.code === "INVALID_EPHEMERAL_ACCESS_TOKEN",
  );

  const configuration = authenticatedProbeConfiguration(validEnvironment(), {
    nowMs: NOW_MS,
  });
  assert.equal(configuration.householdId, HOUSEHOLD_ID);
  assert.equal(configuration.accessToken, ephemeralToken());
});

test("strict payload validation rejects extra metadata, unsafe integers, and stale dates", () => {
  const valid = {
    householdId: HOUSEHOLD_ID,
    source: "server-confirmed",
    usedBytes: 1_234,
    allowanceBytes: 41_943_040,
    measuredAt: new Date(NOW_MS).toISOString(),
  };
  assert.equal(validateHouseholdStoragePayload(valid, HOUSEHOLD_ID, NOW_MS), true);
  assert.equal(
    validateHouseholdStoragePayload({ ...valid, objectKey: "private/path" }, HOUSEHOLD_ID, NOW_MS),
    false,
  );
  assert.equal(
    validateHouseholdStoragePayload({ ...valid, usedBytes: Number.MAX_SAFE_INTEGER }, HOUSEHOLD_ID, NOW_MS),
    false,
  );
  assert.equal(
    validateHouseholdStoragePayload(
      { ...valid, measuredAt: new Date(NOW_MS - 10 * 60_000).toISOString() },
      HOUSEHOLD_ID,
      NOW_MS,
    ),
    false,
  );
});

test("successful live probe validates correlation/cache/payload without reporting secrets or household usage", async () => {
  const configuration = authenticatedProbeConfiguration(validEnvironment(), {
    nowMs: NOW_MS,
  });
  let observedUrl = null;
  let observedHeaders = null;
  const report = await runAuthenticatedHouseholdStorageProbe({
    configuration,
    now: () => NOW_MS,
    requestIdFactory: () => REQUEST_ID,
    timeoutSignal: () => undefined,
    fetchImpl: async (url, options) => {
      observedUrl = new URL(url);
      observedHeaders = new Headers(options.headers);
      const body = JSON.stringify({
        householdId: HOUSEHOLD_ID,
        source: "server-confirmed",
        usedBytes: 1_234,
        allowanceBytes: 41_943_040,
        measuredAt: new Date(NOW_MS).toISOString(),
      });
      return new Response(
        body,
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "content-length": String(Buffer.byteLength(body)),
            "x-request-id": REQUEST_ID,
          },
        },
      );
    },
  });

  assert.equal(observedUrl.pathname, "/functions/v1/api/household-storage");
  assert.equal(observedUrl.searchParams.get("householdId"), HOUSEHOLD_ID);
  assert.equal(observedHeaders.get("authorization"), `Bearer ${ephemeralToken()}`);
  assert.equal(observedHeaders.get("apikey"), PUBLIC_KEY);
  assert.deepEqual(report.checks, {
    cacheNoStore: true,
    contentTypeJson: true,
    requestIdMatched: true,
    contentLengthValid: true,
    payloadValidated: true,
  });
  assert.equal(report.passed, true);
  assert.equal(report.status, 200);

  const serialized = JSON.stringify(report);
  for (const forbidden of [
    HOUSEHOLD_ID,
    SUBJECT_ID,
    PUBLIC_KEY,
    ephemeralToken(),
    "1234",
    "41943040",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("failed responses report only bounded error metadata and never echo the server body", async () => {
  const configuration = authenticatedProbeConfiguration(validEnvironment(), {
    nowMs: NOW_MS,
  });
  const privateMessage = "private household diagnostics";
  const report = await runAuthenticatedHouseholdStorageProbe({
    configuration,
    now: () => NOW_MS,
    requestIdFactory: () => REQUEST_ID,
    timeoutSignal: () => undefined,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: {
            errorVersion: 1,
            code: "AUTHORIZATION_DENIED",
            message: privateMessage,
            retryable: false,
          },
        }),
        {
          status: 403,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": REQUEST_ID,
          },
        },
      ),
  });
  assert.equal(report.passed, false);
  assert.equal(report.status, 403);
  assert.equal(report.errorCode, "AUTHORIZATION_DENIED");
  assert.equal(JSON.stringify(report).includes(privateMessage), false);
});

test("a 200 response without exact bounded Content-Length fails closed", async () => {
  const configuration = authenticatedProbeConfiguration(validEnvironment(), {
    nowMs: NOW_MS,
  });
  const report = await runAuthenticatedHouseholdStorageProbe({
    configuration,
    now: () => NOW_MS,
    requestIdFactory: () => REQUEST_ID,
    timeoutSignal: () => undefined,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          householdId: HOUSEHOLD_ID,
          source: "server-confirmed",
          usedBytes: 0,
          allowanceBytes: 41_943_040,
          measuredAt: new Date(NOW_MS).toISOString(),
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": REQUEST_ID,
          },
        },
      ),
  });
  assert.equal(report.passed, false);
  assert.equal(report.errorCode, "INVALID_SUCCESS_PAYLOAD");
  assert.equal(report.checks.contentLengthValid, false);
  assert.equal(report.checks.payloadValidated, false);
});

test("CLI configuration check makes no request and emits no credential or household value", () => {
  const cliEnvironment = validEnvironment(Date.now());
  const environment = {
    ...cliEnvironment,
    PATH: "",
  };
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--check-config"], {
    encoding: "utf8",
    timeout: 10_000,
    env: environment,
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, "configuration-check");
  assert.equal(output.networkRequestMade, false);
  assert.equal(output.passed, true);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  for (const forbidden of [
    HOUSEHOLD_ID,
    PUBLIC_KEY,
    cliEnvironment[PROBE_ENVIRONMENT.accessToken],
  ]) {
    assert.equal(combinedOutput.includes(forbidden), false);
  }
});

test("CLI refusal does not echo environment secrets", () => {
  const cliEnvironment = validEnvironment(Date.now());
  const environment = {
    ...cliEnvironment,
    [PROBE_ENVIRONMENT.confirmation]: "wrong-confirmation",
    PATH: "",
  };
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
    timeout: 10_000,
    env: environment,
  });
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stderr);
  assert.equal(output.code, "PROBE_CONFIRMATION_REQUIRED");
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  for (const forbidden of [
    HOUSEHOLD_ID,
    PUBLIC_KEY,
    cliEnvironment[PROBE_ENVIRONMENT.accessToken],
  ]) {
    assert.equal(combinedOutput.includes(forbidden), false);
  }
});

test("the interactive PowerShell wrapper keeps the token out of command history and guarantees cleanup", () => {
  assert.match(
    secureWrapper,
    /Read-Host 'Ephemeral authenticated access token' -AsSecureString/u,
  );
  assert.match(secureWrapper, /Read-Host 'Synthetic probe household UUID'/u);
  assert.match(secureWrapper, /finally \{/u);
  assert.match(
    secureWrapper,
    /SetEnvironmentVariable\(\$name, \$null, 'Process'\)/u,
  );
  assert.match(secureWrapper, /ZeroFreeBSTR\(\$secretPointer\)/u);
  assert.doesNotMatch(secureWrapper, /param\([\s\S]*AccessToken/u);
  assert.doesNotMatch(secureWrapper, /Write-(?:Host|Output)[\s\S]*(?:plainToken|secureToken)/u);
});
