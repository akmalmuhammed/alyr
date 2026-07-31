import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const CATALOG_RELATIVE_PATH = path.join(
  "supabase",
  "migration-rollout-catalog.json"
);
const MIGRATIONS_RELATIVE_PATH = path.join("supabase", "migrations");
const VERSION_PATTERN = /^\d{12}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024;
const CLI_TIMEOUT_MILLISECONDS = 60_000;
const EXPECTED_PROJECT_REF = "ifiyragzeizaxdqzxvpk";
const EXPECTED_SUPABASE_CLI_VERSION = "2.109.1";
const BACKUP_GATE = "VERIFIED_ENCRYPTED_BACKUP_AND_ISOLATED_RESTORE";
const SAFE_LINK_METADATA = [
  "linked-project.json",
  "pooler-url",
  "postgres-version",
  "project-ref"
];

export class MigrationRolloutError extends Error {
  constructor(code) {
    super(code);
    this.name = "MigrationRolloutError";
    this.code = code;
  }
}

function fail(code) {
  throw new MigrationRolloutError(code);
}

export function sha256Hex(bytes) {
  const normalized = Buffer.from(bytes).toString("utf8").replace(/\r\n/gu, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function migrationApprovalPhrase(entry) {
  return `APPLY_EXACTLY_${entry.version}_${entry.sha256}`;
}

export function parseMigrationLedger(output) {
  const text = String(output).trim();
  if (text.startsWith("{")) {
    let document;
    try {
      document = JSON.parse(text);
    } catch {
      fail("MIGRATION_LEDGER_UNREADABLE");
    }
    if (
      !document ||
      typeof document !== "object" ||
      Array.isArray(document) ||
      !Array.isArray(document.migrations) ||
      document.migrations.length === 0 ||
      document.migrations.length > 1_000
    ) {
      fail("MIGRATION_LEDGER_UNREADABLE");
    }
    return document.migrations.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        fail("MIGRATION_LEDGER_UNREADABLE");
      }
      const local = row.local == null || row.local === "" ? null : String(row.local);
      const remote = row.remote == null || row.remote === "" ? null : String(row.remote);
      if (
        (local !== null && !VERSION_PATTERN.test(local)) ||
        (remote !== null && !VERSION_PATTERN.test(remote)) ||
        (!local && !remote)
      ) {
        fail("MIGRATION_LEDGER_UNREADABLE");
      }
      return { local, remote };
    });
  }
  const rows = [];
  for (const line of text.split(/\r?\n/u)) {
    const columns = line.split("|");
    if (columns.length < 2) continue;
    const local = columns[0].match(/\b\d{12}\b/u)?.[0] ?? null;
    const remote = columns[1].match(/\b\d{12}\b/u)?.[0] ?? null;
    if (local || remote) rows.push({ local, remote });
  }
  if (rows.length === 0) fail("MIGRATION_LEDGER_UNREADABLE");
  return rows;
}

function uniqueVersions(values, duplicateCode) {
  const versions = values.filter(Boolean);
  if (new Set(versions).size !== versions.length) fail(duplicateCode);
  return new Set(versions);
}

export function evaluateLedgerBefore({ rows, localVersions, entry }) {
  const local = uniqueVersions(
    rows.map((row) => row.local),
    "LOCAL_LEDGER_DUPLICATE"
  );
  const remote = uniqueVersions(
    rows.map((row) => row.remote),
    "REMOTE_LEDGER_DUPLICATE"
  );
  const expectedLocal = new Set(localVersions);

  for (const row of rows) {
    if (row.local && row.remote && row.local !== row.remote) {
      fail("MIGRATION_LEDGER_MISALIGNED");
    }
  }
  for (const version of expectedLocal) {
    if (!local.has(version)) fail("LOCAL_LEDGER_INCOMPLETE");
  }
  for (const version of remote) {
    if (!expectedLocal.has(version)) fail("REMOTE_MIGRATION_UNKNOWN");
    if (version > entry.version) fail("REMOTE_LEDGER_AHEAD");
  }
  if (remote.has(entry.version)) fail("TARGET_ALREADY_APPLIED");

  const superseded = entry.supersedes ?? null;
  for (const version of localVersions) {
    if (version >= entry.version) break;
    if (version === superseded) continue;
    if (!remote.has(version)) fail("TARGET_IS_NOT_NEXT_APPROVED_CHANGE");
  }
  if (entry.predecessor !== superseded && !remote.has(entry.predecessor)) {
    fail("TARGET_PREDECESSOR_MISSING");
  }
  if (superseded) {
    const supersededEntryIsImmediate = entry.predecessor === superseded;
    if (!supersededEntryIsImmediate) fail("INVALID_SUPERSESSION_CATALOG");
  }

  return {
    remote,
    repairSupersededLedger: Boolean(superseded && !remote.has(superseded))
  };
}

export function assertExactRemoteDelta({ before, after, added }) {
  const expected = new Set([...before, ...added]);
  if (after.size !== expected.size) fail("POST_APPLY_LEDGER_DELTA_MISMATCH");
  for (const version of expected) {
    if (!after.has(version)) fail("POST_APPLY_LEDGER_DELTA_MISMATCH");
  }
}

function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = /^--(mode|target|expected-sha256)=(.+)$/u.exec(argument);
    if (!match || values.has(match[1])) fail("INVALID_ARGUMENTS");
    values.set(match[1], match[2]);
  }
  if (values.size !== 3) fail("INVALID_ARGUMENTS");
  const mode = values.get("mode");
  const target = values.get("target");
  const expectedSha256 = values.get("expected-sha256")?.toLowerCase();
  if (!["check", "plan", "execute"].includes(mode)) fail("INVALID_MODE");
  if (!VERSION_PATTERN.test(target ?? "")) fail("INVALID_TARGET_VERSION");
  if (!SHA256_PATTERN.test(expectedSha256 ?? "")) fail("INVALID_EXPECTED_SHA256");
  return { mode, target, expectedSha256 };
}

async function assertRegularFile(filePath) {
  const stat = await lstat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail("ROLLOUT_SOURCE_INVALID");
}

export async function loadRolloutCatalog(repositoryRoot = DEFAULT_REPOSITORY_ROOT) {
  const catalogPath = path.join(repositoryRoot, CATALOG_RELATIVE_PATH);
  await assertRegularFile(catalogPath);
  let catalog;
  try {
    catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  } catch {
    fail("ROLLOUT_CATALOG_INVALID");
  }
  if (
    catalog?.format !== "heldat-exact-migration-rollout-v1" ||
    catalog?.projectRef !== EXPECTED_PROJECT_REF ||
    catalog?.supabaseCliVersion !== EXPECTED_SUPABASE_CLI_VERSION ||
    !Array.isArray(catalog?.migrations)
  ) {
    fail("ROLLOUT_CATALOG_INVALID");
  }
  const versions = new Set();
  for (const entry of catalog.migrations) {
    if (
      !VERSION_PATTERN.test(entry?.version ?? "") ||
      !SHA256_PATTERN.test(entry?.sha256 ?? "") ||
      !VERSION_PATTERN.test(entry?.predecessor ?? "") ||
      !entry.filename?.startsWith(`${entry.version}_`) ||
      path.basename(entry.filename) !== entry.filename ||
      versions.has(entry.version)
    ) {
      fail("ROLLOUT_CATALOG_INVALID");
    }
    versions.add(entry.version);
  }
  const expectedActions = new Map([
    ["202607310007", "apply-exactly-one"],
    ["202607310008", "apply-exactly-one"],
    ["202607310009", "ledger-superseded-only"],
    ["202607310010", "repair-predecessor-then-apply-exactly-one"]
  ]);
  const expectedPredecessors = new Map([
    ["202607310007", "202607310006"],
    ["202607310008", "202607310007"],
    ["202607310009", "202607310008"],
    ["202607310010", "202607310009"]
  ]);
  if (
    catalog.migrations.length !== expectedActions.size ||
    catalog.migrations.some(
      (entry) =>
        expectedActions.get(entry.version) !== entry.action ||
        expectedPredecessors.get(entry.version) !== entry.predecessor
    )
  ) {
    fail("ROLLOUT_CATALOG_INVALID");
  }
  for (const entry of catalog.migrations) {
    if (entry.version === "202607310009") {
      if (entry.replacement !== "202607310010" || entry.supersedes !== undefined) {
        fail("ROLLOUT_CATALOG_INVALID");
      }
    } else if (entry.version === "202607310010") {
      if (entry.supersedes !== "202607310009" || entry.replacement !== undefined) {
        fail("ROLLOUT_CATALOG_INVALID");
      }
    } else if (entry.supersedes !== undefined || entry.replacement !== undefined) {
      fail("ROLLOUT_CATALOG_INVALID");
    }
  }
  return catalog;
}

async function migrationFiles(repositoryRoot) {
  const directory = path.join(repositoryRoot, MIGRATIONS_RELATIVE_PATH);
  const names = (await readdir(directory))
    .filter((name) => /^\d{12}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  const versions = [];
  for (const name of names) {
    const filePath = path.join(directory, name);
    await assertRegularFile(filePath);
    versions.push(name.slice(0, 12));
  }
  if (new Set(versions).size !== versions.length) fail("DUPLICATE_LOCAL_MIGRATION");
  return names;
}

async function verifyCatalogEntry({ repositoryRoot, catalog, target, expectedSha256 }) {
  const entry = catalog.migrations.find((candidate) => candidate.version === target);
  if (!entry) fail("MIGRATION_NOT_REVIEWED");
  if (entry.action === "ledger-superseded-only") fail("MIGRATION_SUPERSEDED");
  if (entry.sha256 !== expectedSha256) fail("EXPECTED_SHA256_MISMATCH");
  const sourcePath = path.join(
    repositoryRoot,
    MIGRATIONS_RELATIVE_PATH,
    entry.filename
  );
  await assertRegularFile(sourcePath);
  const actualSha256 = sha256Hex(await readFile(sourcePath));
  if (actualSha256 !== entry.sha256) fail("MIGRATION_SOURCE_CHANGED");
  return entry;
}

async function validateLinkMetadata(repositoryRoot, projectRef) {
  const source = path.join(repositoryRoot, "supabase", ".temp");
  const projectRefValue = (await readFile(path.join(source, "project-ref"), "utf8"))
    .trim();
  if (projectRefValue !== projectRef) fail("LINKED_PROJECT_MISMATCH");

  let pooler;
  try {
    pooler = new URL(
      (await readFile(path.join(source, "pooler-url"), "utf8")).trim()
    );
  } catch {
    fail("LINK_METADATA_INVALID");
  }
  if (
    pooler.protocol !== "postgresql:" ||
    pooler.password ||
    pooler.search ||
    pooler.hash ||
    pooler.pathname !== "/postgres" ||
    !pooler.hostname.endsWith(".pooler.supabase.com") ||
    pooler.username !== `postgres.${projectRef}`
  ) {
    fail("LINK_METADATA_INVALID");
  }
  const postgresVersion = (
    await readFile(path.join(source, "postgres-version"), "utf8")
  ).trim();
  if (!/^\d{1,2}(?:\.\d{1,4}){0,3}$/u.test(postgresVersion)) {
    fail("LINK_METADATA_INVALID");
  }

  let linked;
  try {
    linked = JSON.parse(
      await readFile(path.join(source, "linked-project.json"), "utf8")
    );
  } catch {
    fail("LINK_METADATA_INVALID");
  }
  if (
    linked?.ref !== projectRef ||
    Object.keys(linked).some(
      (key) => !["ref", "name", "organization_id", "organization_slug"].includes(key)
    )
  ) {
    fail("LINK_METADATA_INVALID");
  }
  return source;
}

export async function prepareStagedProject({ repositoryRoot, catalog, entry }) {
  const names = await migrationFiles(repositoryRoot);
  const selected = names.filter((name) => name.slice(0, 12) <= entry.version);
  if (!selected.includes(entry.filename)) fail("TARGET_MIGRATION_MISSING");
  const linkSource = await validateLinkMetadata(repositoryRoot, catalog.projectRef);
  await assertRegularFile(path.join(repositoryRoot, "supabase", "config.toml"));
  const stagingRoot = await mkdtemp(path.join(tmpdir(), "heldat-exact-migration-"));
  try {
    const stagingSupabase = path.join(stagingRoot, "supabase");
    const stagingMigrations = path.join(stagingSupabase, "migrations");
    const stagingTemp = path.join(stagingSupabase, ".temp");
    await mkdir(stagingMigrations, { recursive: true });
    await mkdir(stagingTemp, { recursive: true });
    await copyFile(
      path.join(repositoryRoot, "supabase", "config.toml"),
      path.join(stagingSupabase, "config.toml")
    );
    for (const name of selected) {
      await copyFile(
        path.join(repositoryRoot, MIGRATIONS_RELATIVE_PATH, name),
        path.join(stagingMigrations, name)
      );
    }
    for (const name of SAFE_LINK_METADATA) {
      await assertRegularFile(path.join(linkSource, name));
      await copyFile(path.join(linkSource, name), path.join(stagingTemp, name));
    }
    return {
      stagingRoot,
      selectedVersions: selected.map((name) => name.slice(0, 12))
    };
  } catch (error) {
    await cleanupStagedProject(stagingRoot);
    throw error;
  }
}

export async function cleanupStagedProject(stagingRoot) {
  const resolved = path.resolve(stagingRoot);
  const temp = path.resolve(tmpdir());
  if (
    path.dirname(resolved) !== temp ||
    !path.basename(resolved).startsWith("heldat-exact-migration-")
  ) {
    fail("UNSAFE_STAGING_PATH");
  }
  await rm(resolved, { recursive: true, force: true });
}

function createProcessRunner(executable, environment) {
  return (arguments_, { cwd }) =>
    new Promise((resolve, reject) => {
      const child = spawn(executable, arguments_, {
        cwd,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      const stdout = [];
      const stderr = [];
      let bytes = 0;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, CLI_TIMEOUT_MILLISECONDS);
      const collect = (bucket) => (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_COMMAND_OUTPUT_BYTES) {
          child.kill();
          return;
        }
        bucket.push(Buffer.from(chunk));
      };
      child.stdout.on("data", collect(stdout));
      child.stderr.on("data", collect(stderr));
      child.once("error", () => {
        clearTimeout(timeout);
        reject(new MigrationRolloutError("CLI_START_FAILED"));
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (timedOut) {
          reject(new MigrationRolloutError("CLI_TIMEOUT"));
          return;
        }
        if (bytes > MAX_COMMAND_OUTPUT_BYTES) {
          reject(new MigrationRolloutError("CLI_OUTPUT_LIMIT_EXCEEDED"));
          return;
        }
        resolve({
          code,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8")
        });
      });
    });
}

async function checkedCli(runCli, arguments_, options, errorCode) {
  let result;
  try {
    result = await runCli(arguments_, options);
  } catch {
    fail(errorCode);
  }
  if (result?.code !== 0) fail(errorCode);
  return String(result.stdout ?? "");
}

async function readLedger(runCli, workdir, localVersions) {
  const output = await checkedCli(
    runCli,
    [
      "migration",
      "list",
      "--linked",
      "--workdir",
      workdir,
      "--output",
      "json"
    ],
    { cwd: workdir },
    "MIGRATION_LEDGER_READ_FAILED"
  );
  const rows = parseMigrationLedger(output);
  const rowVersions = new Set(rows.map((row) => row.local).filter(Boolean));
  for (const version of localVersions) {
    if (!rowVersions.has(version)) fail("LOCAL_LEDGER_INCOMPLETE");
  }
  return rows;
}

function remoteSet(rows) {
  return uniqueVersions(
    rows.map((row) => row.remote),
    "REMOTE_LEDGER_DUPLICATE"
  );
}

export async function runMigrationRollout({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  mode,
  target,
  expectedSha256,
  environment = process.env,
  runCli: suppliedRunner
}) {
  const catalog = await loadRolloutCatalog(repositoryRoot);
  const entry = await verifyCatalogEntry({
    repositoryRoot,
    catalog,
    target,
    expectedSha256
  });
  const names = await migrationFiles(repositoryRoot);
  const allVersions = names.map((name) => name.slice(0, 12));
  if (mode === "check") {
    return {
      ok: true,
      mode,
      targetVersion: entry.version,
      sha256: entry.sha256,
      networkRequests: 0,
      databaseMutations: 0
    };
  }

  const executable = environment.HELDAT_SUPABASE_CLI?.trim();
  if (!suppliedRunner && !executable) fail("PINNED_CLI_PATH_REQUIRED");
  const runCli = suppliedRunner ?? createProcessRunner(executable, environment);
  const cliVersion = (
    await checkedCli(
      runCli,
      ["--version"],
      { cwd: repositoryRoot },
      "CLI_VERSION_CHECK_FAILED"
    )
  ).trim();
  if (cliVersion !== catalog.supabaseCliVersion) fail("CLI_VERSION_MISMATCH");

  const initialRows = await readLedger(runCli, repositoryRoot, allVersions);
  const initial = evaluateLedgerBefore({
    rows: initialRows,
    localVersions: allVersions,
    entry
  });
  let stage;
  try {
    stage = await prepareStagedProject({ repositoryRoot, catalog, entry });
    const stagedRows = await readLedger(
      runCli,
      stage.stagingRoot,
      stage.selectedVersions
    );
    const stagedInitial = evaluateLedgerBefore({
      rows: stagedRows,
      localVersions: stage.selectedVersions,
      entry
    });
    assertExactRemoteDelta({
      before: initial.remote,
      after: stagedInitial.remote,
      added: []
    });

    if (mode === "plan") {
      return {
        ok: true,
        mode,
        targetVersion: entry.version,
        sha256: entry.sha256,
        exactSqlMigrations: 1,
        supersededLedgerRepairRequired: initial.repairSupersededLedger,
        databaseMutations: 0
      };
    }

    if (
      environment.HELDAT_MIGRATION_BACKUP_GATE !== BACKUP_GATE ||
      environment.HELDAT_MIGRATION_APPROVAL !== migrationApprovalPhrase(entry)
    ) {
      fail("EXECUTION_ATTESTATION_MISSING");
    }

    let beforeApply = initial.remote;
    if (initial.repairSupersededLedger) {
      await checkedCli(
        runCli,
        [
          "migration",
          "repair",
          entry.supersedes,
          "--status",
          "applied",
          "--linked",
          "--workdir",
          stage.stagingRoot,
          "--yes"
        ],
        { cwd: stage.stagingRoot },
        "SUPERSEDED_LEDGER_REPAIR_FAILED"
      );
      const repairedRows = await readLedger(
        runCli,
        stage.stagingRoot,
        stage.selectedVersions
      );
      const repaired = remoteSet(repairedRows);
      assertExactRemoteDelta({
        before: initial.remote,
        after: repaired,
        added: [entry.supersedes]
      });
      if (repaired.has(entry.version)) fail("TARGET_APPLIED_DURING_LEDGER_REPAIR");
      beforeApply = repaired;
    }

    await checkedCli(
      runCli,
      [
        "migration",
        "up",
        "--linked",
        "--workdir",
        stage.stagingRoot,
        "--yes"
      ],
      { cwd: stage.stagingRoot },
      "EXACT_MIGRATION_APPLY_FAILED"
    );
    const finalRows = await readLedger(
      runCli,
      stage.stagingRoot,
      stage.selectedVersions
    );
    const finalRemote = remoteSet(finalRows);
    assertExactRemoteDelta({
      before: beforeApply,
      after: finalRemote,
      added: [entry.version]
    });

    return {
      ok: true,
      mode,
      targetVersion: entry.version,
      sha256: entry.sha256,
      exactSqlMigrationsApplied: 1,
      supersededLedgerRecorded: initial.repairSupersededLedger,
      postLedgerVerified: true
    };
  } finally {
    if (stage?.stagingRoot) await cleanupStagedProject(stage.stagingRoot);
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = await runMigrationRollout(options);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    const errorCode =
      error instanceof MigrationRolloutError
        ? error.code
        : "MIGRATION_ROLLOUT_FAILED";
    process.stderr.write(`${JSON.stringify({ ok: false, errorCode })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
