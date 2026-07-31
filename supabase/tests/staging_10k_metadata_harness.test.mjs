import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertExecutionAuthorization,
  buildBatchSql,
  buildExpectedRowCounts,
  buildPlan,
  buildSchemaSql,
  buildWorkload,
  HARNESS_LIMITS,
  LOCAL_EXECUTION_CONFIRMATION,
  parseArguments,
  percentile,
  RETAIN_CONFIRMATION,
  runLocalHarness,
  summarizeExecution,
  summarizeLatencies,
} from "../scripts/staging-10k-metadata-harness.mjs";

const SCRIPT_PATH = fileURLToPath(
  new URL("../scripts/staging-10k-metadata-harness.mjs", import.meta.url),
);

test("default invocation is a non-mutating deterministic 10K plan", () => {
  const options = parseArguments([]);
  const first = buildPlan(options);
  const second = buildPlan(parseArguments([]));

  assert.equal(options.mode, "plan");
  assert.equal(first.mode, "plan");
  assert.equal(first.mutatesDatabase, false);
  assert.equal(first.target.hostedTargetsAccepted, false);
  assert.equal(first.target.linkedTargetsAccepted, false);
  assert.equal(first.target.credentialsAccepted, false);
  assert.equal(first.workload.users, 10_000);
  assert.equal(first.workload.assets, 250_000);
  assert.equal(first.workload.totalRows, 1_030_000);
  assert.equal(first.workload.logicalAttachmentBytes, 524_288_000_000);
  assert.deepEqual(first, second);
});

test("workload expands every assumption into exact bounded row counts", () => {
  const workload = buildWorkload({
    users: 10,
    placesPerUser: 2,
    assetsPerUser: 3,
    evidencePerAsset: 2,
    syncOperationsPerAsset: 1,
  });
  assert.deepEqual(buildExpectedRowCounts(workload), {
    households: 10,
    memberships: 10,
    places: 20,
    assets: 30,
    asset_location_revisions: 30,
    evidence_metadata: 60,
    sync_operations: 30,
  });
  assert.equal(workload.totalRows, 190);
  assert.equal(workload.logicalAttachmentBytes, 125_829_120);
});

test("hard caps prevent oversized users, dimensions, rows, and concurrency", () => {
  assert.throws(() => parseArguments(["--users=10001"]), /1 through 10000/);
  assert.throws(() => parseArguments(["--assets-per-user=26"]), /1 through 25/);
  assert.throws(() => parseArguments(["--places-per-user=4"]), /1 through 3/);
  assert.throws(() => parseArguments(["--concurrency=5"]), /1 through 4/);
  assert.throws(
    () =>
      buildWorkload({
        users: HARNESS_LIMITS.users,
        assetsPerUser: HARNESS_LIMITS.assetsPerUser,
        placesPerUser: HARNESS_LIMITS.placesPerUser,
        evidencePerAsset: HARNESS_LIMITS.evidencePerAsset,
        syncOperationsPerAsset: HARNESS_LIMITS.syncOperationsPerAsset,
      }),
    /hard cap/,
  );
});

test("production, linked, hosted, URL, and credential-shaped targets are refused", () => {
  assert.throws(
    () => parseArguments(["--target=production"]),
    /Only the fixed local Supabase Docker target/,
  );
  assert.throws(() => parseArguments(["--linked"]), /intentionally unsupported/);
  assert.throws(
    () => parseArguments(["--url=https:\/\/example.supabase.co"]),
    /intentionally unsupported/,
  );
  assert.throws(
    () => parseArguments(["--project-ref=ifiyragzeizaxdqzxvpk"]),
    /intentionally unsupported/,
  );
  assert.throws(
    () => parseArguments(["--database-url=postgres:\/\/user:secret@host\/db"]),
    /intentionally unsupported/,
  );
});

test("execution and retention require separate exact confirmations", () => {
  const unconfirmed = parseArguments([
    "--execute",
    "--users=1",
    "--batch-users=1",
    "--concurrency=1",
  ]);
  assert.throws(() => assertExecutionAuthorization(unconfirmed), /confirm-disposable/);
  const execution = parseArguments([
    "--execute",
    `--confirm-disposable=${LOCAL_EXECUTION_CONFIRMATION}`,
    "--users=1",
    "--batch-users=1",
    "--concurrency=1",
  ]);
  assert.equal(execution.mode, "execute");
  assert.equal(execution.retain, false);

  const missingRetainConfirmation = parseArguments([
    "--execute",
    `--confirm-disposable=${LOCAL_EXECUTION_CONFIRMATION}`,
    "--retain",
    "--users=1",
    "--batch-users=1",
    "--concurrency=1",
  ]);
  assert.throws(
    () => assertExecutionAuthorization(missingRetainConfirmation),
    /Retaining fixtures requires/,
  );

  const retained = parseArguments([
    "--execute",
    `--confirm-disposable=${LOCAL_EXECUTION_CONFIRMATION}`,
    "--retain",
    `--confirm-retain=${RETAIN_CONFIRMATION}`,
    "--users=1",
    "--batch-users=1",
    "--concurrency=1",
  ]);
  assert.doesNotThrow(() => assertExecutionAuthorization(retained));
});

test("authorization fails closed before any target inspection", async () => {
  const options = parseArguments([
    "--execute",
    "--users=1",
    "--batch-users=1",
    "--concurrency=1",
  ]);
  let inspected = false;
  await assert.rejects(
    () =>
      runLocalHarness(options, {
        inspectLocalContainerImpl: async () => {
          inspected = true;
          return {};
        },
      }),
    /confirm-disposable/,
  );
  assert.equal(inspected, false);
});

test("execution refuses insufficient local disk before schema creation", async () => {
  const options = parseArguments([
    "--execute",
    `--confirm-disposable=${LOCAL_EXECUTION_CONFIRMATION}`,
    "--users=1",
    "--batch-users=1",
    "--concurrency=1",
  ]);
  let psqlCalled = false;
  await assert.rejects(
    () =>
      runLocalHarness(options, {
        inspectLocalContainerImpl: async () => ({
          container: "supabase_db_alyr-local",
          projectLabel: "alyr-local",
          state: "healthy",
        }),
        readLocalDiskSpaceImpl: async () => 1,
        runPsqlImpl: async () => {
          psqlCalled = true;
        },
      }),
    /requires at least .* free local bytes/,
  );
  assert.equal(psqlCalled, false);
});

test("schema and batches use isolated deterministic synthetic metadata only", () => {
  const options = parseArguments([
    "--users=2",
    "--assets-per-user=2",
    "--batch-users=1",
    "--concurrency=1",
  ]);
  const schema = buildSchemaSql(options);
  const first = buildBatchSql(options, 1, 1);
  const second = buildBatchSql(options, 1, 1);

  assert.match(schema, /drop schema if exists heldat_capacity_harness cascade/);
  assert.match(schema, /create schema heldat_capacity_harness/);
  assert.match(first, /Synthetic household/);
  assert.match(first, /Synthetic address; not a deliverable location/);
  assert.match(first, /capacity-harness/);
  assert.match(first, /non-sensitive/);
  assert.doesNotMatch(`${schema}\n${first}`, /public\.(households|assets|evidence|sync_operations)/);
  assert.equal(first, second);
});

test("percentiles use nearest-rank semantics and expose p50 p95 p99", () => {
  const values = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.equal(percentile(values, 0.5), 50);
  assert.equal(percentile(values, 0.95), 95);
  assert.equal(percentile(values, 0.99), 99);
  assert.deepEqual(summarizeLatencies(values), {
    samples: 100,
    minimumMs: 1,
    p50Ms: 50,
    p95Ms: 95,
    p99Ms: 99,
    maximumMs: 100,
  });
});

test("execution summary records latency, errors, growth, WAL, connections, locks, and retained bytes", () => {
  const options = parseArguments([
    "--execute",
    `--confirm-disposable=${LOCAL_EXECUTION_CONFIRMATION}`,
    "--users=2",
    "--assets-per-user=2",
    "--batch-users=1",
    "--concurrency=1",
    "--p95-budget-ms=1000",
  ]);
  const expected = buildExpectedRowCounts(options.workload);
  const snapshot = (databaseBytes, schemaBytes, load, activeLoad, loadLocks) => ({
    databaseBytes,
    schemaBytes,
    walLsn: "0/1000000",
    connections: { all: 11 + load, load, activeLoad, maxConfigured: 100 },
    locks: {
      databaseTotal: 3 + loadLocks,
      databaseWaiting: 0,
      loadTotal: loadLocks,
      loadWaiting: 0,
    },
  });
  const report = summarizeExecution({
    options,
    startedAt: "2026-08-01T00:00:00.000Z",
    finishedAt: "2026-08-01T00:00:02.000Z",
    durationMs: 2_000,
    target: { container: "supabase_db_alyr-local", projectLabel: "alyr-local" },
    beforeSetup: snapshot(100_000, 0, 0, 0, 0),
    beforeLoad: snapshot(110_000, 16_384, 0, 0, 0),
    afterLoad: snapshot(160_000, 50_000, 0, 0, 0),
    afterCleanup: snapshot(160_000, 0, 0, 0, 0),
    walBytes: 75_000,
    rowCounts: expected,
    tableSizes: [{ table_name: "assets", heap_bytes: 10_000, index_bytes: 5_000, retained_bytes: 15_000 }],
    batchResults: [
      { number: 1, startUser: 1, endUser: 1, durationMs: 100, passed: true },
      { number: 2, startUser: 2, endUser: 2, durationMs: 200, passed: true },
    ],
    observer: {
      samples: [snapshot(130_000, 30_000, 1, 1, 5)],
      errors: [],
    },
  });

  assert.equal(report.latency.p50Ms, 100);
  assert.equal(report.latency.p95Ms, 200);
  assert.equal(report.latency.p99Ms, 200);
  assert.equal(report.errors.totalFailedBatches, 0);
  assert.equal(report.database.growthBytes, 50_000);
  assert.equal(report.database.walBytes, 75_000);
  assert.equal(report.database.retainedBytesBeforeCleanup, 50_000);
  assert.equal(report.database.retainedBytesAfterCleanup, 0);
  assert.equal(report.connections.peakObservedLoad, 1);
  assert.equal(report.locks.peakObservedLoadLocks, 5);
  assert.equal(report.reconciliation.matched, true);
  assert.equal(report.gates.passed, true);
});

test("the actual CLI performs plan mode without Docker or database mutation", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
    timeout: 10_000,
    env: { PATH: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, "plan");
  assert.equal(output.mutatesDatabase, false);
  assert.equal(output.workload.users, 10_000);
});

test("the actual CLI refuses a production target without invoking Docker", () => {
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--execute", "--target=production", "--confirm-disposable=anything"],
    {
      encoding: "utf8",
      timeout: 10_000,
      env: { PATH: "" },
    },
  );
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stderr);
  assert.equal(output.code, "TARGET_REFUSED");
  assert.match(output.message, /fixed local Supabase Docker target/);
});
