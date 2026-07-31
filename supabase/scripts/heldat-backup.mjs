#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BackupError,
  assertNonProductionRestoreTarget,
  loadEncryptionKey,
  parseDestinationSpec,
  parseSupabaseIdentity
} from "./backup-core.mjs";
import {
  databaseToolVersions,
  postgresEnvironment
} from "./backup-database.mjs";
import {
  applyRetention,
  createBackupDryRunPlan,
  createOperatorBackup,
  createRestoreDryRunPlan,
  readAuthenticatedBackup,
  restoreOperatorBackup,
  verifyRestoredTarget
} from "./backup-operations.mjs";
import {
  backupMonitorFailureCanary,
  inspectBackupFreshness
} from "./backup-monitor.mjs";
import { createStorageClient } from "./backup-storage-rest.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

function parseArguments(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { command: "help", options: {} };
  }
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      throw new BackupError("INVALID_ARGUMENT", "Unexpected positional argument.");
    }
    const name = token.slice(2);
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      throw new BackupError(
        "DUPLICATE_ARGUMENT",
        `Option --${name} was supplied more than once.`
      );
    }
    if (
      [
        "dry-run",
        "execute",
        "failure-canary",
        "help",
        "verify-artifacts"
      ].includes(name)
    ) {
      options[name] = true;
      continue;
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) {
      throw new BackupError(
        "INVALID_ARGUMENT",
        `Option --${name} requires a value.`
      );
    }
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function assertAllowedOptions(command, options) {
  const allowedByCommand = {
    backup: new Set(["destination", "dry-run", "execute", "help"]),
    verify: new Set(["destination", "backup-id", "help"]),
    restore: new Set([
      "destination",
      "backup-id",
      "dry-run",
      "execute",
      "confirm-target",
      "help"
    ]),
    "verify-restore": new Set([
      "destination",
      "backup-id",
      "dry-run",
      "execute",
      "confirm-target",
      "help"
    ]),
    retention: new Set([
      "destination",
      "dry-run",
      "execute",
      "keep-count",
      "keep-days",
      "help"
    ]),
    freshness: new Set([
      "destination",
      "max-age-hours",
      "verify-artifacts",
      "failure-canary",
      "help"
    ])
  };
  const allowed = allowedByCommand[command];
  if (!allowed) return;
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) {
      throw new BackupError(
        "UNKNOWN_OPTION",
        `Option --${name} is not valid for ${command}.`
      );
    }
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new BackupError("MISSING_ENVIRONMENT", `${name} is required.`);
  }
  return value;
}

function requireMode(options, command) {
  const dryRun = options["dry-run"] === true;
  const execute = options.execute === true;
  if (dryRun === execute) {
    throw new BackupError(
      "EXECUTION_MODE_REQUIRED",
      `${command} requires exactly one of --dry-run or --execute.`
    );
  }
  return { dryRun, execute };
}

function positiveInteger(value, fallback, label) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BackupError("INVALID_ARGUMENT", `${label} must be a positive integer.`);
  }
  return parsed;
}

function destination(options) {
  const spec = options.destination ?? process.env.HELDAT_BACKUP_DESTINATION;
  return parseDestinationSpec(spec, projectRoot);
}

function backupId(options) {
  const value = options["backup-id"] ?? process.env.HELDAT_BACKUP_ID;
  if (!value) {
    throw new BackupError("MISSING_BACKUP_ID", "Supply --backup-id for this command.");
  }
  return value;
}

function progress(event) {
  process.stderr.write(`${JSON.stringify({ progress: { step: event.step } })}\n`);
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function backupCommand(options) {
  const mode = requireMode(options, "backup");
  const key = loadEncryptionKey();
  const adapter = destination(options);
  const sourceDatabaseUrl = requiredEnvironment("HELDAT_SOURCE_DATABASE_URL");
  postgresEnvironment(sourceDatabaseUrl);
  const sourceStorageClient = createStorageClient({
    supabaseUrl: requiredEnvironment("HELDAT_SOURCE_SUPABASE_URL"),
    serviceRoleKey: requiredEnvironment("HELDAT_SOURCE_SUPABASE_SERVICE_ROLE_KEY")
  });
  if (mode.dryRun) {
    const versions = await databaseToolVersions();
    output({
      ...createBackupDryRunPlan({ adapter, sourceDatabaseUrl, sourceStorageClient }),
      toolVersions: versions
    });
    return;
  }
  const result = await createOperatorBackup({
    adapter,
    key,
    sourceDatabaseUrl,
    sourceStorageClient,
    onProgress: progress
  });
  output({ action: "backup", encrypted: true, status: "complete", ...result });
}

async function verifyCommand(options) {
  const key = loadEncryptionKey();
  const adapter = destination(options);
  const id = backupId(options);
  const { manifest } = await readAuthenticatedBackup({
    adapter,
    backupId: id,
    key,
    verifyArtifacts: true
  });
  output({
    action: "verify",
    backupId: id,
    databaseArtifactsVerified: 2,
    privateBuckets: manifest.storage.buckets.length,
    status: "verified",
    storageObjectsVerified: manifest.totals.storageObjects
  });
}

async function restoreInputs(options, includeServiceKey) {
  const key = loadEncryptionKey();
  const adapter = destination(options);
  const id = backupId(options);
  const targetDatabaseUrl = requiredEnvironment("HELDAT_RESTORE_DATABASE_URL");
  postgresEnvironment(targetDatabaseUrl);
  const targetSupabaseUrl = requiredEnvironment("HELDAT_RESTORE_SUPABASE_URL");
  parseSupabaseIdentity(targetSupabaseUrl);
  const authenticated = await readAuthenticatedBackup({
    adapter,
    backupId: id,
    key,
    verifyArtifacts: true
  });
  return {
    adapter,
    authenticated,
    id,
    key,
    targetDatabaseUrl,
    targetSupabaseUrl,
    ...(includeServiceKey
      ? {
          targetStorageClient: createStorageClient({
            supabaseUrl: targetSupabaseUrl,
            serviceRoleKey: requiredEnvironment(
              "HELDAT_RESTORE_SUPABASE_SERVICE_ROLE_KEY"
            )
          })
        }
      : {})
  };
}

async function restoreCommand(options) {
  const mode = requireMode(options, "restore");
  const inputs = await restoreInputs(options, mode.execute);
  if (mode.dryRun) {
    const versions = await databaseToolVersions();
    output({
      ...createRestoreDryRunPlan({
        manifest: inputs.authenticated.manifest,
        targetDatabaseUrl: inputs.targetDatabaseUrl,
        targetSupabaseUrl: inputs.targetSupabaseUrl
      }),
      toolVersions: versions
    });
    return;
  }
  const result = await restoreOperatorBackup({
    adapter: inputs.adapter,
    backupId: inputs.id,
    key: inputs.key,
    targetDatabaseUrl: inputs.targetDatabaseUrl,
    targetStorageClient: inputs.targetStorageClient,
    targetClass: requiredEnvironment("HELDAT_RESTORE_TARGET_CLASS"),
    confirmation: options["confirm-target"],
    onProgress: progress
  });
  output({ action: "restore", status: "restored-and-verified", ...result });
}

async function verifyRestoreCommand(options) {
  const mode = requireMode(options, "verify-restore");
  const inputs = await restoreInputs(options, mode.execute);
  if (mode.dryRun) {
    output({
      ...createRestoreDryRunPlan({
        manifest: inputs.authenticated.manifest,
        targetDatabaseUrl: inputs.targetDatabaseUrl,
        targetSupabaseUrl: inputs.targetSupabaseUrl
      }),
      action: "verify-restore"
    });
    return;
  }
  const targetClass = requiredEnvironment("HELDAT_RESTORE_TARGET_CLASS");
  assertNonProductionRestoreTarget({
    manifest: inputs.authenticated.manifest,
    targetDatabaseUrl: inputs.targetDatabaseUrl,
    targetSupabaseUrl: inputs.targetSupabaseUrl,
    targetClass,
    confirmation: options["confirm-target"]
  });
  const result = await verifyRestoredTarget({
    manifest: inputs.authenticated.manifest,
    targetDatabaseUrl: inputs.targetDatabaseUrl,
    targetStorageClient: inputs.targetStorageClient,
    onProgress: progress
  });
  output({ action: "verify-restore", status: "verified", ...result });
}

async function retentionCommand(options) {
  const mode = requireMode(options, "retention");
  const key = loadEncryptionKey();
  const adapter = destination(options);
  const keepCount = positiveInteger(
    options["keep-count"],
    process.env.HELDAT_BACKUP_RETENTION_COUNT ?? 7,
    "keep-count"
  );
  const keepDays = positiveInteger(
    options["keep-days"],
    process.env.HELDAT_BACKUP_RETENTION_DAYS ?? 30,
    "keep-days"
  );
  const result = await applyRetention({
    adapter,
    key,
    keepCount,
    keepDays,
    execute: mode.execute,
    onProgress: progress
  });
  output({
    action: "retention",
    keepCount,
    keepDays,
    mode: mode.execute ? "execute" : "dry-run",
    ...result
  });
}

async function freshnessCommand(options) {
  if (options["failure-canary"] === true) {
    if (Object.keys(options).some((name) => name !== "failure-canary")) {
      throw new BackupError(
        "INVALID_ARGUMENT",
        "The freshness failure canary does not accept destination or verification options."
      );
    }
    backupMonitorFailureCanary();
  }

  const key = loadEncryptionKey();
  const adapter = destination(options);
  const maxAgeHours = positiveInteger(
    options["max-age-hours"],
    process.env.HELDAT_BACKUP_MAX_AGE_HOURS ?? 30,
    "max-age-hours"
  );
  const result = await inspectBackupFreshness({
    adapter,
    key,
    maxAgeHours,
    verifyArtifacts: options["verify-artifacts"] === true,
    onProgress: progress
  });
  output({ action: "freshness", ...result });
}

function help() {
  output({
    commands: {
      backup: "backup --destination local:<absolute-path> (--dry-run|--execute)",
      verify: "verify --destination local:<absolute-path> --backup-id <id>",
      restore:
        "restore --destination local:<absolute-path> --backup-id <id> (--dry-run|--execute) [--confirm-target non-production:<fingerprint>]",
      "verify-restore":
        "verify-restore --destination local:<absolute-path> --backup-id <id> (--dry-run|--execute) [--confirm-target non-production:<fingerprint>]",
      retention:
        "retention --destination local:<absolute-path> (--dry-run|--execute) [--keep-count 7] [--keep-days 30]",
      freshness:
        "freshness --destination local:<absolute-path> [--max-age-hours 30] [--verify-artifacts]",
      "freshness-canary":
        "freshness --failure-canary"
    },
    encryptionKeyEnvironment: "HELDAT_BACKUP_ENCRYPTION_KEY_BASE64",
    note:
      "Secrets are accepted only through process environment variables. Review docs/operations/BACKUP_RESTORE_RUNBOOK.md before execution."
  });
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (!command || options.help || command === "help") {
    help();
    return;
  }
  assertAllowedOptions(command, options);
  switch (command) {
    case "backup":
      await backupCommand(options);
      break;
    case "verify":
      await verifyCommand(options);
      break;
    case "restore":
      await restoreCommand(options);
      break;
    case "verify-restore":
      await verifyRestoreCommand(options);
      break;
    case "retention":
      await retentionCommand(options);
      break;
    case "freshness":
      await freshnessCommand(options);
      break;
    default:
      throw new BackupError("UNKNOWN_COMMAND", `Unknown command: ${command}.`);
  }
}

main().catch((error) => {
  const backupError =
    error instanceof BackupError
      ? error
      : new BackupError(
          "UNEXPECTED_BACKUP_FAILURE",
          "Backup tooling stopped on an unexpected failure.",
          error
        );
  process.stderr.write(
    `${JSON.stringify({
      error: { code: backupError.code, message: backupError.message }
    })}\n`
  );
  if (process.env.HELDAT_BACKUP_DEBUG === "1") {
    process.stderr.write(`${backupError.stack}\n`);
  }
  process.exitCode = 1;
});
