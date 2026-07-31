#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { CAPACITY_LIMITS } from "./api-capacity-probe.mjs";

export const QUOTA_THRESHOLDS_PERCENT = Object.freeze([50, 70, 85, 100]);

const DEFAULT_MAX_AGE_HOURS = 24;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export const QUOTA_DEFINITIONS = Object.freeze({
  database: Object.freeze({
    usageKey: "databaseBytes",
    unit: "bytes",
    limit: CAPACITY_LIMITS.providerDatabaseBytes,
  }),
  storage: Object.freeze({
    usageKey: "storageBytes",
    unit: "bytes",
    limit: CAPACITY_LIMITS.providerStorageBytes,
  }),
  monthlyEgress: Object.freeze({
    usageKey: "monthlyEgressBytes",
    unit: "bytes",
    limit: CAPACITY_LIMITS.providerMonthlyEgressBytes,
  }),
  monthlyEdgeInvocations: Object.freeze({
    usageKey: "monthlyEdgeInvocations",
    unit: "invocations",
    limit: CAPACITY_LIMITS.providerMonthlyEdgeInvocations,
  }),
  applicationRetainedStorage: Object.freeze({
    usageKey: "applicationRetainedStorageBytes",
    unit: "bytes",
    limit: CAPACITY_LIMITS.applicationGlobalStorageBytes,
  }),
});

const LEVEL_RANK = Object.freeze({
  normal: 0,
  watch: 1,
  action: 2,
  critical: 3,
  exhausted: 4,
  unknown: 5,
});

const ACTIONS = Object.freeze({
  normal: Object.freeze({
    code: "CONTINUE_MONITORING",
    summary: "Continue the controlled pilot and refresh the snapshot daily.",
  }),
  watch: Object.freeze({
    code: "NOTIFY_AND_REVIEW_GROWTH",
    summary: "Notify the operator and review growth before the next threshold.",
  }),
  action: Object.freeze({
    code: "FREEZE_ENROLLMENT_PREPARE_CAPACITY",
    summary: "Freeze new enrollment and prepare the reviewed capacity migration.",
  }),
  critical: Object.freeze({
    code: "QUEUE_UPLOADS_PROTECT_DRAFTS",
    summary: "Queue new cloud uploads locally, protect drafts, and execute the capacity runbook.",
  }),
  exhausted: Object.freeze({
    code: "CAPACITY_INCIDENT",
    summary: "Keep capacity-consuming writes queued and run the capacity incident procedure.",
  }),
  unknown: Object.freeze({
    code: "REFRESH_USAGE_SNAPSHOT",
    summary: "Refresh every required usage value before making an enrollment decision.",
  }),
});

export class QuotaGuardInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "QuotaGuardInputError";
    this.code = code;
  }
}

function finiteInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new QuotaGuardInputError(
      "INVALID_USAGE_SNAPSHOT",
      `${name} must be a safe integer from ${minimum} through ${maximum}.`,
    );
  }
  return parsed;
}

function strictObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QuotaGuardInputError(
      "INVALID_USAGE_SNAPSHOT",
      `${name} must be a JSON object.`,
    );
  }
  return value;
}

function parseTimestamp(value, name) {
  if (typeof value !== "string" || value.length > 40) {
    throw new QuotaGuardInputError(
      "INVALID_USAGE_SNAPSHOT",
      `${name} must be an ISO-8601 timestamp.`,
    );
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new QuotaGuardInputError(
      "INVALID_USAGE_SNAPSHOT",
      `${name} must be an ISO-8601 timestamp.`,
    );
  }
  return milliseconds;
}

function thresholdValue(limit, percent) {
  return Math.floor((limit * percent) / 100);
}

function levelForUsage(used, limit) {
  if (used >= thresholdValue(limit, 100)) return "exhausted";
  if (used >= thresholdValue(limit, 85)) return "critical";
  if (used >= thresholdValue(limit, 70)) return "action";
  if (used >= thresholdValue(limit, 50)) return "watch";
  return "normal";
}

function evaluateQuota(definition, used) {
  const saturationPercent = Math.round((used / definition.limit) * 10_000) / 100;
  const level = levelForUsage(used, definition.limit);
  const nextThresholdPercent = QUOTA_THRESHOLDS_PERCENT.find(
    (threshold) => used < thresholdValue(definition.limit, threshold),
  ) ?? null;
  return {
    unit: definition.unit,
    used,
    limit: definition.limit,
    remaining: Math.max(definition.limit - used, 0),
    saturationPercent,
    level,
    nextThresholdPercent,
    nextThresholdValue:
      nextThresholdPercent === null
        ? null
        : thresholdValue(definition.limit, nextThresholdPercent),
    action: ACTIONS[level],
  };
}

function highestLevel(values) {
  return values.reduce(
    (highest, candidate) =>
      LEVEL_RANK[candidate] > LEVEL_RANK[highest] ? candidate : highest,
    "normal",
  );
}

export function evaluateFreeTierQuotaSnapshot(
  snapshot,
  {
    evaluatedAt = new Date(),
    maxAgeHours = DEFAULT_MAX_AGE_HOURS,
  } = {},
) {
  const input = strictObject(snapshot, "snapshot");
  if (input.snapshotVersion !== 1) {
    throw new QuotaGuardInputError(
      "INVALID_USAGE_SNAPSHOT",
      "snapshotVersion must equal 1.",
    );
  }
  const usage = strictObject(input.usage, "usage");
  const normalizedMaxAgeHours = finiteInteger(
    maxAgeHours,
    "maxAgeHours",
    1,
    168,
  );
  const evaluatedAtMs =
    evaluatedAt instanceof Date ? evaluatedAt.getTime() : Date.parse(evaluatedAt);
  if (!Number.isFinite(evaluatedAtMs)) {
    throw new QuotaGuardInputError(
      "INVALID_EVALUATION_TIME",
      "evaluatedAt must be a valid timestamp.",
    );
  }
  const observedAtMs = parseTimestamp(input.observedAt, "observedAt");
  if (observedAtMs - evaluatedAtMs > MAX_FUTURE_SKEW_MS) {
    throw new QuotaGuardInputError(
      "SNAPSHOT_FROM_FUTURE",
      "observedAt is beyond the allowed five-minute clock skew.",
    );
  }

  const quotas = {};
  for (const [name, definition] of Object.entries(QUOTA_DEFINITIONS)) {
    const used = finiteInteger(
      usage[definition.usageKey],
      `usage.${definition.usageKey}`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    quotas[name] = evaluateQuota(definition, used);
  }

  const snapshotAgeSeconds = Math.max(
    Math.floor((evaluatedAtMs - observedAtMs) / 1_000),
    0,
  );
  const fresh = snapshotAgeSeconds <= normalizedMaxAgeHours * 60 * 60;
  const quotaLevel = highestLevel(Object.values(quotas).map(({ level }) => level));
  const level = fresh ? quotaLevel : "unknown";
  const action = ACTIONS[level];

  return {
    guardVersion: 1,
    observedAt: new Date(observedAtMs).toISOString(),
    evaluatedAt: new Date(evaluatedAtMs).toISOString(),
    maxAgeHours: normalizedMaxAgeHours,
    snapshotAgeSeconds,
    fresh,
    thresholdsPercent: QUOTA_THRESHOLDS_PERCENT,
    quotas,
    summary: {
      level,
      quotaLevel,
      action,
      enrollmentAllowed: fresh && LEVEL_RANK[quotaLevel] < LEVEL_RANK.action,
      cloudUploadsAllowed: fresh && LEVEL_RANK[quotaLevel] < LEVEL_RANK.critical,
      passed: fresh && LEVEL_RANK[quotaLevel] < LEVEL_RANK.action,
    },
    note:
      "This local guard evaluates an operator-supplied snapshot; it is not provider telemetry or tested alert delivery.",
  };
}

export function parseQuotaGuardArguments(argumentsList) {
  const options = {
    snapshotPath: "",
    maxAgeHours: DEFAULT_MAX_AGE_HOURS,
  };
  for (const argument of argumentsList) {
    if (argument.startsWith("--snapshot=")) {
      options.snapshotPath = argument.slice("--snapshot=".length).trim();
      continue;
    }
    if (argument.startsWith("--max-age-hours=")) {
      options.maxAgeHours = finiteInteger(
        argument.slice("--max-age-hours=".length),
        "max-age-hours",
        1,
        168,
      );
      continue;
    }
    throw new QuotaGuardInputError(
      "INVALID_ARGUMENT",
      "Only --snapshot=PATH and --max-age-hours=N are supported.",
    );
  }
  if (!options.snapshotPath) {
    throw new QuotaGuardInputError(
      "SNAPSHOT_REQUIRED",
      "Provide --snapshot=PATH with a local numeric usage snapshot.",
    );
  }
  return options;
}

export function structuredQuotaGuardError(error) {
  if (error instanceof QuotaGuardInputError) {
    return {
      mode: "failed",
      error: {
        errorVersion: 1,
        code: error.code,
        message: error.message,
        retryable: false,
      },
    };
  }
  return {
    mode: "failed",
    error: {
      errorVersion: 1,
      code: "QUOTA_GUARD_FAILED",
      message: "The quota snapshot could not be evaluated.",
      retryable: false,
    },
  };
}

export function parseQuotaSnapshotJson(source) {
  if (typeof source !== "string") {
    throw new QuotaGuardInputError(
      "SNAPSHOT_INVALID_JSON",
      "The quota snapshot file must contain valid JSON.",
    );
  }
  const normalized = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  try {
    return JSON.parse(normalized);
  } catch {
    throw new QuotaGuardInputError(
      "SNAPSHOT_INVALID_JSON",
      "The quota snapshot file must contain valid JSON.",
    );
  }
}

async function main() {
  try {
    const options = parseQuotaGuardArguments(process.argv.slice(2));
    let source;
    try {
      source = await readFile(options.snapshotPath, "utf8");
    } catch {
      throw new QuotaGuardInputError(
        "SNAPSHOT_READ_FAILED",
        "The quota snapshot file could not be read.",
      );
    }
    const snapshot = parseQuotaSnapshotJson(source);
    const guard = evaluateFreeTierQuotaSnapshot(snapshot, {
      maxAgeHours: options.maxAgeHours,
    });
    console.log(JSON.stringify({ mode: "evaluated", guard }, null, 2));
    if (!guard.summary.passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify(structuredQuotaGuardError(error), null, 2));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
