import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateFreeTierQuotaSnapshot,
  parseQuotaSnapshotJson,
  parseQuotaGuardArguments,
  structuredQuotaGuardError,
} from "../scripts/free-tier-quota-guard.mjs";

const evaluatedAt = new Date("2026-08-01T12:00:00.000Z");

function snapshot(usage, observedAt = "2026-08-01T11:00:00.000Z") {
  return {
    snapshotVersion: 1,
    observedAt,
    usage: {
      databaseBytes: 0,
      storageBytes: 0,
      monthlyEgressBytes: 0,
      monthlyEdgeInvocations: 0,
      applicationRetainedStorageBytes: 0,
      ...usage,
    },
  };
}

test("quota guard turns the 50/70/85/100 thresholds into operator actions", () => {
  const result = evaluateFreeTierQuotaSnapshot(
    snapshot({
      databaseBytes: 249_999_999,
      storageBytes: 500_000_000,
      monthlyEgressBytes: 3_500_000_000,
      monthlyEdgeInvocations: 425_000,
      applicationRetainedStorageBytes: 838_860_800,
    }),
    { evaluatedAt },
  );

  assert.equal(result.quotas.database.level, "normal");
  assert.equal(result.quotas.database.nextThresholdPercent, 50);
  assert.equal(result.quotas.storage.level, "watch");
  assert.equal(result.quotas.monthlyEgress.level, "action");
  assert.equal(result.quotas.monthlyEdgeInvocations.level, "critical");
  assert.equal(result.quotas.applicationRetainedStorage.level, "exhausted");
  assert.equal(result.summary.level, "exhausted");
  assert.equal(result.summary.action.code, "CAPACITY_INCIDENT");
  assert.equal(result.summary.enrollmentAllowed, false);
  assert.equal(result.summary.cloudUploadsAllowed, false);
  assert.equal(result.summary.passed, false);
});

test("fresh usage below 50 percent passes while exposing remaining capacity", () => {
  const result = evaluateFreeTierQuotaSnapshot(
    snapshot({
      databaseBytes: 100_000_000,
      storageBytes: 200_000_000,
      monthlyEgressBytes: 1_000_000_000,
      monthlyEdgeInvocations: 100_000,
      applicationRetainedStorageBytes: 167_772_160,
    }),
    { evaluatedAt },
  );

  assert.equal(result.summary.level, "normal");
  assert.equal(result.summary.enrollmentAllowed, true);
  assert.equal(result.summary.cloudUploadsAllowed, true);
  assert.equal(result.summary.passed, true);
  assert.equal(result.quotas.storage.saturationPercent, 20);
  assert.equal(result.quotas.storage.remaining, 800_000_000);
  assert.equal(result.quotas.storage.nextThresholdValue, 500_000_000);
});

test("stale snapshots fail closed even when reported usage is low", () => {
  const result = evaluateFreeTierQuotaSnapshot(
    snapshot({}, "2026-07-30T11:59:59.000Z"),
    { evaluatedAt, maxAgeHours: 24 },
  );

  assert.equal(result.fresh, false);
  assert.equal(result.summary.quotaLevel, "normal");
  assert.equal(result.summary.level, "unknown");
  assert.equal(result.summary.action.code, "REFRESH_USAGE_SNAPSHOT");
  assert.equal(result.summary.enrollmentAllowed, false);
  assert.equal(result.summary.cloudUploadsAllowed, false);
  assert.equal(result.summary.passed, false);
});

test("missing, unsafe, and future usage values are rejected", () => {
  const missing = snapshot({});
  delete missing.usage.storageBytes;
  assert.throws(
    () => evaluateFreeTierQuotaSnapshot(missing, { evaluatedAt }),
    /usage\.storageBytes must be a safe integer/u,
  );
  assert.throws(
    () =>
      evaluateFreeTierQuotaSnapshot(
        snapshot({ databaseBytes: -1 }),
        { evaluatedAt },
      ),
    /usage\.databaseBytes must be a safe integer/u,
  );
  assert.throws(
    () =>
      evaluateFreeTierQuotaSnapshot(
        snapshot({}, "2026-08-01T12:05:01.000Z"),
        { evaluatedAt },
      ),
    /five-minute clock skew/u,
  );
});

test("CLI argument and error contracts are bounded and structured", () => {
  assert.deepEqual(
    parseQuotaGuardArguments([
      "--snapshot=C:/tmp/heldat-usage.json",
      "--max-age-hours=12",
    ]),
    {
      snapshotPath: "C:/tmp/heldat-usage.json",
      maxAgeHours: 12,
    },
  );
  assert.throws(() => parseQuotaGuardArguments([]), /--snapshot=PATH/u);
  assert.throws(
    () => parseQuotaGuardArguments(["--max-age-hours=0"]),
    /1 through 168/u,
  );
  let unknownArgumentError;
  try {
    parseQuotaGuardArguments(["--token=private-value"]);
  } catch (error) {
    unknownArgumentError = error;
  }
  assert.equal(
    JSON.stringify(structuredQuotaGuardError(unknownArgumentError)).includes(
      "private-value",
    ),
    false,
  );
  assert.deepEqual(structuredQuotaGuardError(new Error("private detail")), {
    mode: "failed",
    error: {
      errorVersion: 1,
      code: "QUOTA_GUARD_FAILED",
      message: "The quota snapshot could not be evaluated.",
      retryable: false,
    },
  });
});

test("snapshot JSON accepts the UTF-8 BOM emitted by Windows PowerShell", () => {
  assert.deepEqual(
    parseQuotaSnapshotJson('\ufeff{"snapshotVersion":1}'),
    { snapshotVersion: 1 },
  );
  assert.throws(
    () => parseQuotaSnapshotJson("not-json"),
    /must contain valid JSON/u,
  );
});
