#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

export const AUTHENTICATED_PROBE_VERSION = 1;
export const PROJECT_REF = "ifiyragzeizaxdqzxvpk";
export const PROBE_CONFIRMATION = "HELDAT_EPHEMERAL_HOUSEHOLD_STORAGE_READ";
export const PROBE_ENVIRONMENT = Object.freeze({
  confirmation: "HELDAT_AUTHENTICATED_PROBE_CONFIRM",
  accessToken: "HELDAT_AUTHENTICATED_PROBE_ACCESS_TOKEN",
  householdId: "HELDAT_AUTHENTICATED_PROBE_HOUSEHOLD_ID",
  projectUrl: "EXPO_PUBLIC_SUPABASE_URL",
  publicKey: "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  legacyPublicKey: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
});

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const jwtSegmentPattern = /^[A-Za-z0-9_-]+$/u;
const maximumTokenBytes = 8_192;
const maximumResponseBytes = 16_384;
const maximumSuccessResponseBytes = 2_048;
const maximumTokenLifetimeSeconds = 2 * 60 * 60;
const minimumRemainingLifetimeSeconds = 15;
const maximumClockSkewSeconds = 60;
const maximumMeasurementSkewMs = 5 * 60 * 1_000;
const maximumHouseholdBytes = 1_099_511_627_776;
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const fallbackEnvironmentPath = path.join(
  repositoryRoot,
  "asset-continuity-native",
  ".env.local",
);

function readPublicFallbackEnvironment() {
  if (!fs.existsSync(fallbackEnvironmentPath)) return {};
  const values = {};
  const source = fs
    .readFileSync(fallbackEnvironmentPath, "utf8")
    .replace(/^\uFEFF/u, "");
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
    if (!match || ![
      PROBE_ENVIRONMENT.projectUrl,
      PROBE_ENVIRONMENT.publicKey,
      PROBE_ENVIRONMENT.legacyPublicKey,
    ].includes(match[1])) {
      continue;
    }
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/u, "$2");
  }
  return values;
}

export class AuthenticatedProbeInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuthenticatedProbeInputError";
    this.code = code;
  }
}

function boundedCode(value, fallback) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(value)
    ? value
    : fallback;
}

function decodeLegacyRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    return decodeJwtSegment(parts[1]).role ?? null;
  } catch {
    return null;
  }
}

export function isPublicClientKey(value) {
  if (typeof value !== "string" || value.length > maximumTokenBytes) return false;
  if (value.startsWith("sb_secret_")) return false;
  if (value.startsWith("sb_publishable_")) {
    return value.length >= "sb_publishable_".length + 16;
  }
  return decodeLegacyRole(value) === "anon";
}

function decodeJwtSegment(value) {
  if (!jwtSegmentPattern.test(value)) throw new Error("INVALID_JWT_SEGMENT");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const decoded = Buffer.from(padded, "base64").toString("utf8");
  const parsed = JSON.parse(decoded);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_JWT_PAYLOAD");
  }
  return parsed;
}

function validateEphemeralAccessToken(value, projectOrigin, nowMs) {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    Buffer.byteLength(value, "utf8") > maximumTokenBytes ||
    /\s/u.test(value)
  ) {
    throw new AuthenticatedProbeInputError(
      "INVALID_EPHEMERAL_ACCESS_TOKEN",
      `Set ${PROBE_ENVIRONMENT.accessToken} to a short-lived authenticated access token.`,
    );
  }
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !jwtSegmentPattern.test(part))) {
    throw new AuthenticatedProbeInputError(
      "INVALID_EPHEMERAL_ACCESS_TOKEN",
      `Set ${PROBE_ENVIRONMENT.accessToken} to a short-lived authenticated access token.`,
    );
  }

  let payload;
  try {
    payload = decodeJwtSegment(parts[1]);
  } catch {
    throw new AuthenticatedProbeInputError(
      "INVALID_EPHEMERAL_ACCESS_TOKEN",
      `Set ${PROBE_ENVIRONMENT.accessToken} to a short-lived authenticated access token.`,
    );
  }
  const nowSeconds = Math.floor(nowMs / 1_000);
  if (
    payload.role !== "authenticated" ||
    typeof payload.sub !== "string" ||
    !uuidPattern.test(payload.sub) ||
    payload.iss !== `${projectOrigin}/auth/v1` ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.iat > nowSeconds + maximumClockSkewSeconds ||
    payload.exp <= nowSeconds + minimumRemainingLifetimeSeconds ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > maximumTokenLifetimeSeconds ||
    payload.exp - nowSeconds > maximumTokenLifetimeSeconds
  ) {
    throw new AuthenticatedProbeInputError(
      "INVALID_EPHEMERAL_ACCESS_TOKEN",
      "The authenticated probe token must be current, project-bound, and expire within two hours.",
    );
  }
  return value;
}

export function authenticatedProbeConfiguration(
  environment = process.env,
  { nowMs = Date.now() } = {},
) {
  if (environment[PROBE_ENVIRONMENT.confirmation] !== PROBE_CONFIRMATION) {
    throw new AuthenticatedProbeInputError(
      "PROBE_CONFIRMATION_REQUIRED",
      `Set ${PROBE_ENVIRONMENT.confirmation}=${PROBE_CONFIRMATION} only for the reviewed read-only live probe.`,
    );
  }

  let projectUrl;
  try {
    projectUrl = new URL(environment[PROBE_ENVIRONMENT.projectUrl] ?? "");
  } catch {
    throw new AuthenticatedProbeInputError(
      "INVALID_PROJECT_URL",
      `Set ${PROBE_ENVIRONMENT.projectUrl} to the pinned Heldat Supabase URL.`,
    );
  }
  if (
    projectUrl.protocol !== "https:" ||
    projectUrl.hostname !== `${PROJECT_REF}.supabase.co` ||
    projectUrl.username ||
    projectUrl.password ||
    projectUrl.search ||
    projectUrl.hash ||
    !["", "/"].includes(projectUrl.pathname)
  ) {
    throw new AuthenticatedProbeInputError(
      "INVALID_PROJECT_URL",
      "The authenticated live probe is pinned to the reviewed Heldat Supabase project.",
    );
  }
  const projectOrigin = projectUrl.origin;

  const publicKey =
    environment[PROBE_ENVIRONMENT.publicKey] ??
    environment[PROBE_ENVIRONMENT.legacyPublicKey] ??
    "";
  if (!isPublicClientKey(publicKey)) {
    throw new AuthenticatedProbeInputError(
      "INVALID_PUBLIC_KEY",
      "Provide only the pinned project's publishable or legacy anon key; privileged keys are rejected.",
    );
  }

  const householdId = environment[PROBE_ENVIRONMENT.householdId] ?? "";
  if (!uuidPattern.test(householdId)) {
    throw new AuthenticatedProbeInputError(
      "INVALID_HOUSEHOLD_ID",
      `Set ${PROBE_ENVIRONMENT.householdId} to the reviewed synthetic probe household UUID.`,
    );
  }
  const accessToken = validateEphemeralAccessToken(
    environment[PROBE_ENVIRONMENT.accessToken] ?? "",
    projectOrigin,
    nowMs,
  );

  return Object.freeze({
    apiUrl: `${projectOrigin}/functions/v1/api/household-storage`,
    publicKey,
    accessToken,
    householdId: householdId.toLowerCase(),
  });
}

async function readBoundedJson(response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumResponseBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { value, byteLength: bytes }
      : null;
  } catch {
    await reader.cancel().catch(() => {});
    return null;
  } finally {
    reader.releaseLock();
  }
}

export function validateHouseholdStoragePayload(value, expectedHouseholdId, nowMs) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = Object.keys(value).sort();
  const expectedFields = [
    "allowanceBytes",
    "householdId",
    "measuredAt",
    "source",
    "usedBytes",
  ];
  if (
    fields.length !== expectedFields.length ||
    fields.some((field, index) => field !== expectedFields[index]) ||
    value.householdId !== expectedHouseholdId ||
    value.source !== "server-confirmed" ||
    !Number.isSafeInteger(value.usedBytes) ||
    value.usedBytes < 0 ||
    value.usedBytes > maximumHouseholdBytes ||
    !Number.isSafeInteger(value.allowanceBytes) ||
    value.allowanceBytes < 1 ||
    value.allowanceBytes > maximumHouseholdBytes ||
    typeof value.measuredAt !== "string"
  ) {
    return false;
  }
  const measuredAt = Date.parse(value.measuredAt);
  return (
    Number.isFinite(measuredAt) &&
    Math.abs(measuredAt - nowMs) <= maximumMeasurementSkewMs
  );
}

export async function runAuthenticatedHouseholdStorageProbe({
  configuration,
  fetchImpl = fetch,
  now = () => Date.now(),
  requestIdFactory = randomUUID,
  timeoutSignal = () => AbortSignal.timeout(15_000),
}) {
  const requestId = requestIdFactory();
  if (!uuidPattern.test(requestId)) {
    throw new Error("The request ID factory returned an invalid UUID.");
  }
  const url = new URL(configuration.apiUrl);
  url.searchParams.set("householdId", configuration.householdId);
  const startedAt = performance.now();
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: configuration.publicKey,
        Authorization: `Bearer ${configuration.accessToken}`,
        "X-Request-Id": requestId,
      },
      redirect: "error",
      signal: timeoutSignal(),
    });
  } catch {
    return {
      probeVersion: AUTHENTICATED_PROBE_VERSION,
      probe: "household-storage-authenticated-read",
      method: "GET",
      passed: false,
      status: 0,
      latencyMs: Math.max(Math.round(performance.now() - startedAt), 0),
      errorCode: "NETWORK_ERROR",
      checks: {
        cacheNoStore: false,
        contentTypeJson: false,
        requestIdMatched: false,
        contentLengthValid: false,
        payloadValidated: false,
      },
    };
  }

  const decoded = await readBoundedJson(response);
  const payload = decoded?.value ?? null;
  const contentTypeJson =
    response.headers.get("content-type")?.toLowerCase().includes("application/json") === true;
  const cacheNoStore =
    response.headers.get("cache-control")?.toLowerCase().includes("no-store") === true;
  const requestIdMatched = response.headers.get("x-request-id") === requestId;
  const rawContentLength = response.headers.get("content-length") ?? "";
  const contentLength = /^[1-9][0-9]{0,3}$/u.test(rawContentLength)
    ? Number(rawContentLength)
    : 0;
  const contentLengthValid =
    response.status === 200 &&
    contentLength > 0 &&
    contentLength <= maximumSuccessResponseBytes &&
    contentLength === decoded?.byteLength;
  const payloadValidated =
    response.status === 200 &&
    contentLengthValid &&
    validateHouseholdStoragePayload(payload, configuration.householdId, now());
  const passed =
    response.status === 200 &&
    contentTypeJson &&
    cacheNoStore &&
    requestIdMatched &&
    contentLengthValid &&
    payloadValidated;
  const errorCode = response.status === 200
    ? payloadValidated
      ? null
      : "INVALID_SUCCESS_PAYLOAD"
    : boundedCode(payload?.error?.code, `HTTP_${response.status}`);

  return {
    probeVersion: AUTHENTICATED_PROBE_VERSION,
    probe: "household-storage-authenticated-read",
    method: "GET",
    passed,
    status: response.status,
    latencyMs: Math.max(Math.round(performance.now() - startedAt), 0),
    errorCode,
    checks: {
      cacheNoStore,
      contentTypeJson,
      requestIdMatched,
      contentLengthValid,
      payloadValidated,
    },
  };
}

function parseCliArguments(argumentsList) {
  const allowed = new Set(["--check-config"]);
  for (const argument of argumentsList) {
    if (!allowed.has(argument)) {
      throw new AuthenticatedProbeInputError(
        "UNKNOWN_ARGUMENT",
        "Only the optional --check-config argument is supported.",
      );
    }
  }
  return { checkConfig: argumentsList.includes("--check-config") };
}

async function main() {
  try {
    const arguments_ = parseCliArguments(process.argv.slice(2));
    const configuration = authenticatedProbeConfiguration({
      ...readPublicFallbackEnvironment(),
      ...process.env,
    });
    if (arguments_.checkConfig) {
      process.stdout.write(`${JSON.stringify({
        probeVersion: AUTHENTICATED_PROBE_VERSION,
        probe: "household-storage-authenticated-read",
        mode: "configuration-check",
        passed: true,
        networkRequestMade: false,
      }, null, 2)}\n`);
      return;
    }
    const report = await runAuthenticatedHouseholdStorageProbe({ configuration });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      probeVersion: AUTHENTICATED_PROBE_VERSION,
      probe: "household-storage-authenticated-read",
      passed: false,
      code: boundedCode(error?.code, "PROBE_FAILED"),
      message: error instanceof Error
        ? error.message
        : "Authenticated household-storage probe failed.",
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
