import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MigrationRolloutError,
  evaluateLedgerBefore,
  loadRolloutCatalog,
  migrationApprovalPhrase,
  parseMigrationLedger,
  runMigrationRollout,
  sha256Hex
} from "../scripts/apply-approved-migration.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const migrationDirectory = path.join(repositoryRoot, "supabase", "migrations");
const rolloutSource = await readFile(
  path.join(repositoryRoot, "supabase", "scripts", "apply-approved-migration.mjs"),
  "utf8"
);
const rootPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8")
);
const rolloutRunbook = await readFile(
  path.join(
    repositoryRoot,
    "docs",
    "operations",
    "EXACT_ONE_SUPABASE_MIGRATION_ROLLOUT.md"
  ),
  "utf8"
);
const target = "202607310010";
const targetSha =
  "3f7d3720477c62cc4806975b25e21d8f2a85e4363133d9129a03943c000f6218";

async function versionsAt(workdir = repositoryRoot) {
  return (await readdir(path.join(workdir, "supabase", "migrations")))
    .filter((name) => /^\d{12}_.+\.sql$/u.test(name))
    .sort()
    .map((name) => name.slice(0, 12));
}

function ledgerJson(versions, remote) {
  return JSON.stringify({
    migrations: versions.map((version) => ({
      local: version,
      remote: remote.has(version) ? version : null,
      time: version
    }))
  });
}

function mockCli(initialRemote) {
  const remote = new Set(initialRemote);
  const calls = [];
  return {
    calls,
    remote,
    async run(arguments_) {
      calls.push([...arguments_]);
      if (arguments_[0] === "--version") {
        return { code: 0, stdout: "2.109.1\n", stderr: "" };
      }
      const workdirIndex = arguments_.indexOf("--workdir");
      const workdir = arguments_[workdirIndex + 1];
      const versions = await versionsAt(workdir);
      if (arguments_[1] === "list") {
        return { code: 0, stdout: ledgerJson(versions, remote), stderr: "" };
      }
      if (arguments_[1] === "repair") {
        remote.add(arguments_[2]);
        return { code: 0, stdout: "", stderr: "" };
      }
      if (arguments_[1] === "up") {
        versions.forEach((version) => remote.add(version));
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "unexpected" };
    }
  };
}

test("catalog pins reviewed bytes and marks legacy 009 superseded", async () => {
  const catalog = await loadRolloutCatalog(repositoryRoot);
  for (const entry of catalog.migrations) {
    const bytes = await readFile(path.join(migrationDirectory, entry.filename));
    assert.equal(sha256Hex(bytes), entry.sha256);
  }
  const legacy = catalog.migrations.find((entry) => entry.version === "202607310009");
  assert.equal(legacy.action, "ledger-superseded-only");
  assert.equal(legacy.replacement, target);
  assert.deepEqual(
    Object.fromEntries(
      catalog.migrations.map((entry) => [entry.version, entry.predecessor])
    ),
    {
      "202607310007": "202607310006",
      "202607310008": "202607310007",
      "202607310009": "202607310008",
      "202607310010": "202607310009"
    }
  );
  assert.equal(
    sha256Hex(Buffer.from("begin;\r\ncommit;\r\n")),
    sha256Hex(Buffer.from("begin;\ncommit;\n"))
  );
});

test("catalog rejects unreviewed actions and arbitrary supersession relations", async () => {
  const source = JSON.parse(
    await readFile(
      path.join(repositoryRoot, "supabase", "migration-rollout-catalog.json"),
      "utf8"
    )
  );
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "heldat-rollout-catalog-test-"));
  const temporarySupabase = path.join(temporaryRoot, "supabase");
  await mkdir(temporarySupabase, { recursive: true });
  const catalogPath = path.join(temporarySupabase, "migration-rollout-catalog.json");
  try {
    const invalidAction = structuredClone(source);
    invalidAction.migrations[0].action = "apply-everything";
    await writeFile(catalogPath, JSON.stringify(invalidAction), "utf8");
    await assert.rejects(
      loadRolloutCatalog(temporaryRoot),
      /ROLLOUT_CATALOG_INVALID/u
    );

    const invalidSupersession = structuredClone(source);
    invalidSupersession.migrations.at(-1).supersedes = "202607310008";
    await writeFile(catalogPath, JSON.stringify(invalidSupersession), "utf8");
    await assert.rejects(
      loadRolloutCatalog(temporaryRoot),
      /ROLLOUT_CATALOG_INVALID/u
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("CLI execution is time/output bounded and migration hashes retain LF bytes", async () => {
  assert.match(rolloutSource, /const CLI_TIMEOUT_MILLISECONDS = 60_000/u);
  assert.match(
    rolloutSource,
    /setTimeout\(\(\) => \{\s*timedOut = true;\s*child\.kill\(\);/u
  );
  assert.match(rolloutSource, /MAX_COMMAND_OUTPUT_BYTES = 256 \* 1024/u);
  const attributes = await readFile(path.join(repositoryRoot, ".gitattributes"), "utf8");
  assert.match(attributes, /^supabase\/migrations\/\*\.sql text eol=lf$/mu);
});

test("package scripts expose only checksum-pinned 007, 008 and 010 rollout commands", () => {
  for (const version of ["007", "008", "010"]) {
    for (const mode of ["check", "plan", "apply"]) {
      const command = rootPackage.scripts[`${mode}:supabase:migration-${version}`];
      assert.equal(typeof command, "string");
      assert.match(command, /--expected-sha256=[a-f0-9]{64}$/u);
      assert.doesNotMatch(command, /db push|--include-all|--db-url/u);
    }
  }
  assert.equal(rootPackage.scripts["apply:supabase:migration-009"], undefined);
});

test("runbook execute gates always clear one-shot approval variables", () => {
  assert.equal((rolloutRunbook.match(/^try \{$/gmu) ?? []).length, 3);
  assert.equal((rolloutRunbook.match(/^finally \{$/gmu) ?? []).length, 3);
  assert.equal((rolloutRunbook.match(/\$LASTEXITCODE -ne 0/gmu) ?? []).length, 3);
  assert.equal(
    (rolloutRunbook.match(/Remove-Item Env:HELDAT_MIGRATION_APPROVAL -ErrorAction SilentlyContinue/gmu) ?? []).length,
    3
  );
  assert.equal(
    (rolloutRunbook.match(/Remove-Item Env:HELDAT_MIGRATION_BACKUP_GATE -ErrorAction SilentlyContinue/gmu) ?? []).length,
    3
  );
});

test("010 converges signatures and asserts service-only privileges", async () => {
  const source = await readFile(
    path.join(
      migrationDirectory,
      "202607310010_household_storage_usage_reader_hardening.sql"
    ),
    "utf8"
  );
  assert.match(source, /drop function if exists public\.read_household_storage_usage\(uuid\)/u);
  assert.match(source, /p_household_id uuid,\s*p_actor_id uuid/u);
  assert.match(source, /set search_path = public, pg_temp/u);
  assert.match(source, /grant execute[\s\S]*to service_role/u);
  assert.match(source, /LEGACY_HOUSEHOLD_STORAGE_READER_REMAINS/u);
  assert.match(source, /CLIENT_ROLE_CAN_EXECUTE_HOUSEHOLD_STORAGE_READER/u);
});

test("ledger parser supports bounded JSON and rejects malformed rows", () => {
  assert.deepEqual(
    parseMigrationLedger(
      '{"migrations":[{"local":"202607310009","remote":null}]}'
    ),
    [{ local: "202607310009", remote: null }]
  );
  assert.throws(
    () => parseMigrationLedger('{"migrations":[{"local":"009","remote":null}]}'),
    /MIGRATION_LEDGER_UNREADABLE/u
  );
});

test("ledger evaluation allows only the explicit 009 supersession gap", () => {
  const entry = {
    version: target,
    predecessor: "202607310009",
    supersedes: "202607310009"
  };
  const rows = [
    { local: "202607310008", remote: "202607310008" },
    { local: "202607310009", remote: null },
    { local: target, remote: null }
  ];
  assert.equal(
    evaluateLedgerBefore({
      rows,
      localVersions: ["202607310008", "202607310009", target],
      entry
    }).repairSupersededLedger,
    true
  );
  assert.throws(
    () =>
      evaluateLedgerBefore({
        rows: [
          { local: "202607310007", remote: null },
          ...rows
        ],
        localVersions: [
          "202607310007",
          "202607310008",
          "202607310009",
          target
        ],
        entry
      }),
    /TARGET_IS_NOT_NEXT_APPROVED_CHANGE/u
  );
});

test("check mode performs no CLI or database operation", async () => {
  let calls = 0;
  const result = await runMigrationRollout({
    repositoryRoot,
    mode: "check",
    target,
    expectedSha256: targetSha,
    runCli: async () => {
      calls += 1;
      throw new Error("unexpected");
    }
  });
  assert.equal(calls, 0);
  assert.equal(result.networkRequests, 0);
  assert.equal(result.databaseMutations, 0);
});

test("through008 rollout repairs only 009 ledger then applies only 010", async () => {
  const allVersions = await versionsAt();
  const cli = mockCli(allVersions.filter((version) => version <= "202607310008"));
  const catalog = await loadRolloutCatalog(repositoryRoot);
  const entry = catalog.migrations.find((candidate) => candidate.version === target);
  const report = await runMigrationRollout({
    repositoryRoot,
    mode: "execute",
    target,
    expectedSha256: targetSha,
    environment: {
      HELDAT_MIGRATION_BACKUP_GATE:
        "VERIFIED_ENCRYPTED_BACKUP_AND_ISOLATED_RESTORE",
      HELDAT_MIGRATION_APPROVAL: migrationApprovalPhrase(entry)
    },
    runCli: cli.run.bind(cli)
  });
  const repair = cli.calls.find((arguments_) => arguments_[1] === "repair");
  assert.deepEqual(repair.slice(0, 5), [
    "migration",
    "repair",
    "202607310009",
    "--status",
    "applied"
  ]);
  const up = cli.calls.find((arguments_) => arguments_[1] === "up");
  assert.ok(up.includes("--linked"));
  assert.ok(up.includes("--workdir"));
  assert.ok(up.includes("--yes"));
  assert.ok(!up.includes("--include-all"));
  assert.ok(!up.includes("--db-url"));
  assert.equal(report.exactSqlMigrationsApplied, 1);
  assert.equal(report.supersededLedgerRecorded, true);
});

test("recorded 009 skips repair; failures suppress raw CLI output", async () => {
  const allVersions = await versionsAt();
  const cli = mockCli(allVersions.filter((version) => version <= "202607310009"));
  const catalog = await loadRolloutCatalog(repositoryRoot);
  const entry = catalog.migrations.find((candidate) => candidate.version === target);
  const report = await runMigrationRollout({
    repositoryRoot,
    mode: "execute",
    target,
    expectedSha256: targetSha,
    environment: {
      HELDAT_MIGRATION_BACKUP_GATE:
        "VERIFIED_ENCRYPTED_BACKUP_AND_ISOLATED_RESTORE",
      HELDAT_MIGRATION_APPROVAL: migrationApprovalPhrase(entry)
    },
    runCli: cli.run.bind(cli)
  });
  assert.equal(cli.calls.some((arguments_) => arguments_[1] === "repair"), false);
  assert.equal(report.supersededLedgerRecorded, false);

  const secret = "sensitive-token-fixture";
  await assert.rejects(
    runMigrationRollout({
      repositoryRoot,
      mode: "plan",
      target,
      expectedSha256: targetSha,
      runCli: async (arguments_) =>
        arguments_[0] === "--version"
          ? { code: 0, stdout: "2.109.1\n", stderr: "" }
          : { code: 1, stdout: secret, stderr: secret }
    }),
    (error) => {
      assert.ok(error instanceof MigrationRolloutError);
      assert.equal(error.code, "MIGRATION_LEDGER_READ_FAILED");
      assert.doesNotMatch(error.message, new RegExp(secret, "u"));
      return true;
    }
  );
});
