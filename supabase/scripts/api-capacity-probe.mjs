#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

export const CAPACITY_LIMITS = Object.freeze({
  providerDatabaseBytes: 500_000_000,
  providerStorageBytes: 1_000_000_000,
  providerMonthlyEgressBytes: 5_000_000_000,
  providerMonthlyEdgeInvocations: 500_000,
  applicationGlobalStorageBytes: 838_860_800,
  applicationHouseholdStorageBytes: 41_943_040,
  applicationMaxAttachmentBytes: 10_485_760,
});

const DEFAULT_USERS = 10_000;
const DEFAULT_PRIMARY_IMAGE_BYTES = 2_097_152;
const DEFAULT_REQUESTS = 3;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_REQUESTS_PER_SECOND = 1;
const DEFAULT_P95_BUDGET_MS = 3_000;
const MAX_LIVE_REQUESTS = 20;
const MAX_LIVE_CONCURRENCY = 3;
const MAX_LIVE_REQUESTS_PER_SECOND = 5;
const REQUEST_TIMEOUT_MS = 10_000;

function finiteInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

function finiteNumber(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be a number from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

function optionValue(argument, name) {
  const prefix = `--${name}=`;
  return argument.startsWith(prefix) ? argument.slice(prefix.length) : null;
}

export function buildCapacityEnvelope({
  users = DEFAULT_USERS,
  primaryImageBytes = DEFAULT_PRIMARY_IMAGE_BYTES,
} = {}) {
  const normalizedUsers = finiteInteger(users, "users", 1, 10_000_000);
  const normalizedImageBytes = finiteInteger(
    primaryImageBytes,
    "primary-image-bytes",
    1,
    CAPACITY_LIMITS.applicationMaxAttachmentBytes,
  );
  const declaredHouseholdStorageBytes =
    CAPACITY_LIMITS.applicationHouseholdStorageBytes * normalizedUsers;

  return {
    modelVersion: 1,
    users: normalizedUsers,
    assumptions: {
      primaryImageBytes: normalizedImageBytes,
      note:
        "This is a quota envelope, not a load-test result or production-readiness claim.",
    },
    providerFreeEnvelope: {
      databaseBytesPerUser: CAPACITY_LIMITS.providerDatabaseBytes / normalizedUsers,
      storageBytesPerUser: CAPACITY_LIMITS.providerStorageBytes / normalizedUsers,
      monthlyEgressBytesPerUser:
        CAPACITY_LIMITS.providerMonthlyEgressBytes / normalizedUsers,
      monthlyEdgeInvocationsPerUser:
        CAPACITY_LIMITS.providerMonthlyEdgeInvocations / normalizedUsers,
    },
    applicationEnvelope: {
      globalStorageBytes: CAPACITY_LIMITS.applicationGlobalStorageBytes,
      globalStorageBytesPerUser:
        CAPACITY_LIMITS.applicationGlobalStorageBytes / normalizedUsers,
      declaredHouseholdStorageBytes,
      declaredQuotaFitsGlobalLimit:
        declaredHouseholdStorageBytes <=
        CAPACITY_LIMITS.applicationGlobalStorageBytes,
      householdsAtDeclaredQuota: Math.floor(
        CAPACITY_LIMITS.applicationGlobalStorageBytes /
          CAPACITY_LIMITS.applicationHouseholdStorageBytes,
      ),
      householdsAtOnePrimaryImage: Math.floor(
        CAPACITY_LIMITS.applicationGlobalStorageBytes / normalizedImageBytes,
      ),
    },
    hardGates: {
      storageProviderUpgradeOrAdapterRequired:
        declaredHouseholdStorageBytes > CAPACITY_LIMITS.providerStorageBytes,
      measuredDatabaseFixtureRequired: true,
      measuredAuthenticatedSyncLoadRequired: true,
      realBackupAndRestoreDrillRequired: true,
    },
  };
}

export function parseArguments(argumentsList) {
  const result = {
    execute: false,
    url: process.env.HELDAT_CAPACITY_PROBE_URL ?? "",
    users: DEFAULT_USERS,
    primaryImageBytes: DEFAULT_PRIMARY_IMAGE_BYTES,
    requests: DEFAULT_REQUESTS,
    concurrency: DEFAULT_CONCURRENCY,
    requestsPerSecond: DEFAULT_REQUESTS_PER_SECOND,
    p95BudgetMs: DEFAULT_P95_BUDGET_MS,
  };

  for (const argument of argumentsList) {
    if (argument === "--execute") {
      result.execute = true;
      continue;
    }
    const knownOptions = [
      "url",
      "users",
      "primary-image-bytes",
      "requests",
      "concurrency",
      "requests-per-second",
      "p95-budget-ms",
    ];
    const name = knownOptions.find((candidate) =>
      argument.startsWith(`--${candidate}=`),
    );
    if (!name) throw new Error(`Unknown argument: ${argument}`);
    const value = optionValue(argument, name);
    if (name === "url") result.url = value ?? "";
    if (name === "users") {
      result.users = finiteInteger(value, name, 1, 10_000_000);
    }
    if (name === "primary-image-bytes") {
      result.primaryImageBytes = finiteInteger(
        value,
        name,
        1,
        CAPACITY_LIMITS.applicationMaxAttachmentBytes,
      );
    }
    if (name === "requests") {
      result.requests = finiteInteger(value, name, 1, MAX_LIVE_REQUESTS);
    }
    if (name === "concurrency") {
      result.concurrency = finiteInteger(
        value,
        name,
        1,
        MAX_LIVE_CONCURRENCY,
      );
    }
    if (name === "requests-per-second") {
      result.requestsPerSecond = finiteNumber(
        value,
        name,
        0.1,
        MAX_LIVE_REQUESTS_PER_SECOND,
      );
    }
    if (name === "p95-budget-ms") {
      result.p95BudgetMs = finiteInteger(value, name, 100, 30_000);
    }
  }

  if (result.concurrency > result.requests) {
    throw new Error("concurrency must not exceed requests.");
  }
  return result;
}

export function validateProductionProbeUrl(value, { allowLocal = false } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("--url must be an absolute URL.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("The probe URL must not contain credentials, query, or fragment data.");
  }
  const local = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(allowLocal && local)) {
    throw new Error("The production probe URL must use HTTPS.");
  }
  if (!allowLocal && !parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("The production probe is restricted to a Supabase project hostname.");
  }
  if (!parsed.pathname.endsWith("/functions/v1/api/signup/mode")) {
    throw new Error("The probe is restricted to the read-only /signup/mode route.");
  }
  return parsed.toString();
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(Math.ceil(fraction * ordered.length) - 1, 0);
  return ordered[index];
}

function validSignupModePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const issuedAt = Date.parse(value.issuedAt ?? "");
  const expiresAt = Date.parse(value.expiresAt ?? "");
  return (
    value.apiVersion === 1 &&
    value.contract === "heldat-signup-mode-v1" &&
    ["closed_pilot", "public_email", "public_email_google"].includes(
      value.signupMode,
    ) &&
    /^[1-9][0-9]{0,18}$/u.test(value.configVersion ?? "") &&
    /^[a-f0-9]{64}$/u.test(value.signature ?? "") &&
    Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now() &&
    expiresAt - issuedAt === 5 * 60 * 1_000
  );
}

async function runOneRequest({ url, fetchImpl, timeoutMs }) {
  const id = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Request-Id": id,
      },
      redirect: "error",
      signal: controller.signal,
    });
    const durationMs = performance.now() - startedAt;
    const responseId = response.headers.get("x-request-id");
    const retryAfter = response.headers.get("retry-after");
    const cacheControl = response.headers.get("cache-control") ?? "";
    const contentType = response.headers.get("content-type") ?? "";
    let validPayload = false;
    if (response.status === 200 && contentType.toLowerCase().includes("application/json")) {
      try {
        validPayload = validSignupModePayload(await response.json());
      } catch {
        validPayload = false;
      }
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
    return {
      status: response.status,
      durationMs,
      requestIdPreserved: responseId === id,
      noStore: /(?:^|,)\s*no-store(?:\s|,|$)/iu.test(cacheControl),
      validPayload,
      validRetryAfter:
        response.status !== 429 || /^[1-9][0-9]*$/u.test(retryAfter ?? ""),
      transportError: null,
    };
  } catch (error) {
    return {
      status: 0,
      durationMs: performance.now() - startedAt,
      requestIdPreserved: false,
      noStore: false,
      validPayload: false,
      validRetryAfter: false,
      transportError: error?.name === "AbortError" ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runReadProbe({
  url,
  requests = DEFAULT_REQUESTS,
  concurrency = DEFAULT_CONCURRENCY,
  requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND,
  p95BudgetMs = DEFAULT_P95_BUDGET_MS,
  fetchImpl = globalThis.fetch,
  allowLocal = false,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const target = validateProductionProbeUrl(url, { allowLocal });
  const normalizedRequests = finiteInteger(
    requests,
    "requests",
    1,
    MAX_LIVE_REQUESTS,
  );
  const normalizedConcurrency = finiteInteger(
    concurrency,
    "concurrency",
    1,
    MAX_LIVE_CONCURRENCY,
  );
  const normalizedRate = finiteNumber(
    requestsPerSecond,
    "requests-per-second",
    0.1,
    MAX_LIVE_REQUESTS_PER_SECOND,
  );
  const normalizedBudget = finiteInteger(
    p95BudgetMs,
    "p95-budget-ms",
    100,
    30_000,
  );
  if (normalizedConcurrency > normalizedRequests) {
    throw new Error("concurrency must not exceed requests.");
  }
  if (typeof fetchImpl !== "function") throw new Error("fetch is required.");

  const results = [];
  let nextIndex = 0;
  const startedAt = performance.now();
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= normalizedRequests) return;
      const scheduledAt = startedAt + (index * 1_000) / normalizedRate;
      const delayMs = scheduledAt - performance.now();
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      results[index] = await runOneRequest({
        url: target,
        fetchImpl,
        timeoutMs,
      });
    }
  }
  await Promise.all(Array.from({ length: normalizedConcurrency }, () => worker()));

  const durations = results.map(({ durationMs }) => durationMs);
  const statusCounts = {};
  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
  }
  const p95Ms = percentile(durations, 0.95);
  const passed =
    results.every(
      (result) =>
        result.status === 200 &&
        result.requestIdPreserved &&
        result.noStore &&
        result.validPayload &&
        result.validRetryAfter &&
        result.transportError === null,
    ) && p95Ms !== null && p95Ms <= normalizedBudget;

  return {
    probeVersion: 1,
    targetClass: "supabase.signup-mode.read-only",
    requestCount: normalizedRequests,
    concurrency: normalizedConcurrency,
    requestsPerSecond: normalizedRate,
    p95BudgetMs: normalizedBudget,
    statusCounts,
    latencyMs: {
      min: Math.round(Math.min(...durations)),
      p50: Math.round(percentile(durations, 0.5)),
      p95: Math.round(p95Ms),
      p99: Math.round(percentile(durations, 0.99)),
      max: Math.round(Math.max(...durations)),
    },
    failures: {
      transport: results.filter(({ transportError }) => transportError !== null).length,
      requestId: results.filter(({ requestIdPreserved }) => !requestIdPreserved).length,
      cachePolicy: results.filter(({ noStore }) => !noStore).length,
      payload: results.filter(({ validPayload }) => !validPayload).length,
      retryAfter: results.filter(({ validRetryAfter }) => !validRetryAfter).length,
      rateLimited: results.filter(({ status }) => status === 429).length,
    },
    passed,
    note:
      "This bounded public-route probe does not replace authenticated sync/upload staging load tests.",
  };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const capacity = buildCapacityEnvelope({
      users: options.users,
      primaryImageBytes: options.primaryImageBytes,
    });
    if (!options.execute) {
      console.log(JSON.stringify({ mode: "plan", capacity }, null, 2));
      return;
    }
    if (!options.url) {
      throw new Error(
        "--execute requires --url or HELDAT_CAPACITY_PROBE_URL; plan mode remains the default.",
      );
    }
    const probe = await runReadProbe(options);
    console.log(JSON.stringify({ mode: "executed-read-only", capacity, probe }, null, 2));
    if (!probe.passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      mode: "failed",
      error: error instanceof Error ? error.message : "Unknown probe failure.",
    }));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
