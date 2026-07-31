import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { StringDecoder } from "node:string_decoder";
import {
  BackupError,
  decryptReadable,
  encryptReadable,
  invariant,
  parsePostgresIdentity,
  sha256Hex
} from "./backup-core.mjs";

const MAX_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_ERROR_BYTES = 64 * 1024;
const DEFAULT_OPERATION_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_OPERATION_TIMEOUT_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_LOCK_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_VERIFY_SCHEMAS = [
  "auth",
  "public",
  "storage"
];
export const SCHEMA_FINGERPRINT_FORMAT =
  "pg-dump-schema-canonical-v1";

function canonicalSchemaLine(line, state) {
  const normalized = line.endsWith("\r")
    ? line.slice(0, -1)
    : line;
  if (
    state.prologue &&
    /^-- (?:Dumped from database version|Dumped by pg_dump version|Started on) /u.test(
      normalized
    )
  ) {
    return null;
  }
  if (
    state.prologue &&
    normalized.length > 0 &&
    !normalized.startsWith("--") &&
    !normalized.startsWith("\\restrict ")
  ) {
    state.prologue = false;
  }
  return `${normalized}\n`;
}

export function canonicalSchemaFingerprintFromText(value) {
  invariant(
    typeof value === "string",
    "INVALID_SCHEMA_DUMP",
    "Schema dump text is invalid."
  );
  const lines = value.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const state = { prologue: true };
  const canonicalText = lines
    .map((line) => canonicalSchemaLine(line, state))
    .filter((line) => line !== null)
    .join("");
  return {
    bytes: Buffer.byteLength(canonicalText, "utf8"),
    canonicalText,
    format: SCHEMA_FINGERPRINT_FORMAT,
    sha256: sha256Hex(canonicalText)
  };
}

const SAFE_CHILD_ENVIRONMENT_KEYS = new Set([
  "APPDATA",
  "COMSPEC",
  "HOME",
  "LOCALAPPDATA",
  "LOGNAME",
  "PATH",
  "PATHEXT",
  "PROGRAMDATA",
  "SHELL",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
  "USER",
  "USERPROFILE",
  "WINDIR"
]);

function sanitizedProcessEnvironment(environment) {
  const childEnvironment = {};
  for (const [key, value] of Object.entries(environment)) {
    if (
      value !== undefined &&
      SAFE_CHILD_ENVIRONMENT_KEYS.has(key.toUpperCase())
    ) {
      childEnvironment[key] = value;
    }
  }
  return {
    ...childEnvironment,
    LANG: "C",
    LC_ALL: "C"
  };
}

export function postgresEnvironment(
  databaseUrl,
  environment = process.env
) {
  parsePostgresIdentity(databaseUrl);
  const parsed = new URL(databaseUrl);
  invariant(
    parsed.username && parsed.password,
    "DATABASE_CREDENTIALS_MISSING",
    "Database URL must include a username and password."
  );
  const sslMode =
    parsed.searchParams.get("sslmode") ??
    environment.HELDAT_PG_SSLMODE ??
    "require";
  invariant(
    [
      "disable",
      "allow",
      "prefer",
      "require",
      "verify-ca",
      "verify-full"
    ].includes(sslMode),
    "INVALID_PG_SSLMODE",
    "HELDAT_PG_SSLMODE is invalid."
  );
  const localHost = [
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]"
  ].includes(parsed.hostname);
  if (
    !localHost &&
    !["require", "verify-ca", "verify-full"].includes(
      sslMode
    )
  ) {
    throw new BackupError(
      "INSECURE_DATABASE_TRANSPORT",
      "TLS cannot be disabled for a remote database."
    );
  }
  const connectTimeout =
    environment.HELDAT_PG_CONNECT_TIMEOUT?.trim() ??
    "30";
  invariant(
    /^\d+$/u.test(connectTimeout) &&
      Number(connectTimeout) >= 1 &&
      Number(connectTimeout) <= 120,
    "INVALID_PG_CONNECT_TIMEOUT",
    "HELDAT_PG_CONNECT_TIMEOUT must be between 1 and 120 seconds."
  );
  const sslRootCertificate =
    environment.HELDAT_PG_SSLROOTCERT?.trim();
  invariant(
    !sslRootCertificate ||
      (sslRootCertificate.length <= 4_096 &&
        !sslRootCertificate.includes("\0")),
    "INVALID_PG_SSLROOTCERT",
    "HELDAT_PG_SSLROOTCERT is invalid."
  );
  return {
    ...sanitizedProcessEnvironment(environment),
    PGHOST:
      parsed.hostname === "[::1]"
        ? "::1"
        : parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGSSLMODE: sslMode,
    PGCONNECT_TIMEOUT: connectTimeout,
    ...(sslRootCertificate
      ? { PGSSLROOTCERT: sslRootCertificate }
      : {})
  };
}

function collectStream(readable, maxBytes) {
  return (async () => {
    const chunks = [];
    let bytes = 0;
    for await (const rawChunk of readable) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk);
      bytes += chunk.length;
      invariant(
        bytes <= maxBytes,
        "COMMAND_OUTPUT_LIMIT_EXCEEDED",
        "Database command output exceeded its safety limit."
      );
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  })();
}

function collectErrorStream(readable) {
  return (async () => {
    const chunks = [];
    let bytes = 0;
    for await (const rawChunk of readable) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk);
      const remaining = MAX_COMMAND_ERROR_BYTES - bytes;
      if (remaining > 0) {
        chunks.push(chunk.subarray(0, remaining));
        bytes += Math.min(chunk.length, remaining);
      }
    }
    return Buffer.concat(chunks).toString("utf8").trim();
  })();
}

export function databaseOperationTimeout(
  environment = process.env
) {
  const raw =
    environment.HELDAT_PG_OPERATION_TIMEOUT_MS ??
    String(DEFAULT_OPERATION_TIMEOUT_MS);
  invariant(
    /^\d+$/u.test(String(raw)) &&
      Number(raw) >= 1_000 &&
      Number(raw) <= MAX_OPERATION_TIMEOUT_MS,
    "INVALID_PG_OPERATION_TIMEOUT",
    "HELDAT_PG_OPERATION_TIMEOUT_MS must be between 1000 and 21600000 milliseconds."
  );
  return Number(raw);
}

export function databaseLockWaitTimeout(
  environment = process.env
) {
  const raw =
    environment.HELDAT_PG_LOCK_WAIT_TIMEOUT_MS ??
    String(DEFAULT_LOCK_WAIT_TIMEOUT_MS);
  invariant(
    /^\d+$/u.test(String(raw)) &&
      Number(raw) >= 1_000 &&
      Number(raw) <= 10 * 60_000,
    "INVALID_PG_LOCK_WAIT_TIMEOUT",
    "HELDAT_PG_LOCK_WAIT_TIMEOUT_MS must be between 1000 and 600000 milliseconds."
  );
  return Number(raw);
}

export function waitForDatabaseProcess(
  child,
  label,
  stderrPromise,
  { timeoutMs }
) {
  invariant(
    Number.isInteger(timeoutMs) && timeoutMs > 0,
    "INVALID_PG_OPERATION_TIMEOUT",
    "Database process timeout is invalid."
  );
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let timeoutHandle;
    let escalationHandle;
    let abandonHandle;

    function clearTimers() {
      clearTimeout(timeoutHandle);
      clearTimeout(escalationHandle);
      clearTimeout(abandonHandle);
    }

    function settle(callback) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      callback();
    }

    function timeoutError() {
      return new BackupError(
        "DATABASE_TOOL_TIMEOUT",
        `${label} exceeded its ${timeoutMs}ms operation timeout and was terminated.`
      );
    }

    child.once("error", (error) => {
      settle(() => {
        reject(
          timedOut
            ? timeoutError()
            : new BackupError(
                "DATABASE_TOOL_START_FAILED",
                `${label} could not start.`,
                error
              )
        );
      });
    });
    child.once("close", async (code, signal) => {
      if (settled) {
        return;
      }
      clearTimers();
      const stderr = await stderrPromise;
      if (timedOut) {
        settle(() => reject(timeoutError()));
        return;
      }
      if (code === 0) {
        settle(resolve);
        return;
      }
      const detail = stderr
        ? ` Tool stderr was suppressed (bytes=${Buffer.byteLength(
            stderr,
            "utf8"
          )}).`
        : "";
      settle(() =>
        reject(
          new BackupError(
          "DATABASE_TOOL_FAILED",
          `${label} failed with code ${
            code ?? "none"
          }${signal ? ` and signal ${signal}` : ""}.${detail}`
        )
        )
      );
    });

    timeoutHandle = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        settle(() => reject(timeoutError()));
        return;
      }
      escalationHandle = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          settle(() => reject(timeoutError()));
          return;
        }
        abandonHandle = setTimeout(() => {
          child.stdin?.destroy();
          child.stdout?.destroy();
          child.stderr?.destroy();
          settle(() => reject(timeoutError()));
        }, 2_000);
      }, 2_000);
    }, timeoutMs);
  });
}

function spawnDatabaseTool({
  binary,
  args,
  databaseUrl,
  stdin = "pipe",
  environment = process.env
}) {
  const timeoutMs = databaseOperationTimeout(environment);
  const child = spawn(binary, args, {
    env: postgresEnvironment(databaseUrl, environment),
    stdio: [stdin, "pipe", "pipe"],
    windowsHide: true
  });
  const stderrPromise = collectErrorStream(child.stderr);
  const completion = waitForDatabaseProcess(
    child,
    binary,
    stderrPromise,
    { timeoutMs }
  );
  // Mark the shared promise observed immediately; individual callers still
  // await and handle the original rejection.
  completion.catch(() => {});
  return {
    child,
    completion
  };
}

export function databaseToolPaths(environment = process.env) {
  return {
    pgDump: environment.HELDAT_PG_DUMP_BIN || "pg_dump",
    pgRestore:
      environment.HELDAT_PG_RESTORE_BIN || "pg_restore",
    psql: environment.HELDAT_PSQL_BIN || "psql"
  };
}

export async function databaseToolVersions(
  environment = process.env
) {
  const tools = databaseToolPaths(environment);
  const versionTimeoutMs = Math.min(
    databaseOperationTimeout(environment),
    30_000
  );
  const versions = {};
  for (const [name, binary] of Object.entries(tools)) {
    const child = spawn(binary, ["--version"], {
      env: sanitizedProcessEnvironment(environment),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stdoutPromise = collectStream(
      child.stdout,
      64 * 1024
    );
    const stderrPromise = collectErrorStream(child.stderr);
    await waitForDatabaseProcess(
      child,
      binary,
      stderrPromise,
      {
        timeoutMs: versionTimeoutMs
      }
    );
    versions[name] = (
      await stdoutPromise
    ).toString("utf8").trim();
  }
  return versions;
}

function postgresToolMajor(value, expectedName) {
  invariant(
    typeof value === "string" &&
      value.length <= 1_024,
    "INVALID_DATABASE_TOOL_VERSION",
    `${expectedName} version output is invalid.`
  );
  const escapedName = expectedName.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&"
  );
  const match = value.match(
    new RegExp(
      `^${escapedName} \\(PostgreSQL\\) (\\d+)(?:\\.\\d+)*`,
      "u"
    )
  );
  invariant(
    match,
    "INVALID_DATABASE_TOOL_VERSION",
    `${expectedName} did not report an expected PostgreSQL version.`
  );
  return Number(match[1]);
}

export function assertBackupToolVersions(versions) {
  const majors = {
    pgDump: postgresToolMajor(
      versions?.pgDump,
      "pg_dump"
    ),
    pgRestore: postgresToolMajor(
      versions?.pgRestore,
      "pg_restore"
    ),
    psql: postgresToolMajor(versions?.psql, "psql")
  };
  invariant(
    new Set(Object.values(majors)).size === 1,
    "DATABASE_TOOL_VERSION_MISMATCH",
    "pg_dump, pg_restore, and psql must use the same PostgreSQL major version."
  );
  return majors;
}

export function assertRestoreToolCompatibility(
  backupVersions,
  restoreVersions
) {
  const backupMajors =
    assertBackupToolVersions(backupVersions);
  const restoreMajors =
    assertBackupToolVersions(restoreVersions);
  invariant(
    backupMajors.pgDump === restoreMajors.pgDump,
    "DATABASE_RESTORE_VERSION_MISMATCH",
    "Restore PostgreSQL client major version must match the backup client major version."
  );
  return {
    backupMajor: backupMajors.pgDump,
    restoreMajor: restoreMajors.pgDump
  };
}

export function databaseDumpArguments({
  schemaOnly = false,
  restrictKey,
  lockWaitTimeoutMs = DEFAULT_LOCK_WAIT_TIMEOUT_MS
} = {}) {
  invariant(
    Number.isInteger(lockWaitTimeoutMs) &&
      lockWaitTimeoutMs >= 1_000 &&
      lockWaitTimeoutMs <= 10 * 60_000,
    "INVALID_PG_LOCK_WAIT_TIMEOUT",
    "Database dump lock-wait timeout is invalid."
  );
  const common = [
    "--no-owner",
    `--lock-wait-timeout=${lockWaitTimeoutMs}ms`
  ];
  if (!schemaOnly) {
    invariant(
      restrictKey === undefined,
      "INVALID_PG_RESTRICT_KEY",
      "A psql restrict key is valid only for plain schema dumps."
    );
    return [
      "--format=custom",
      "--compress=6",
      ...common
    ];
  }
  invariant(
    typeof restrictKey === "string" &&
      /^[A-Za-z0-9]{32,128}$/u.test(restrictKey),
    "INVALID_PG_RESTRICT_KEY",
    "Plain schema dumps require a 32-128 character alphanumeric restrict key."
  );
  return [
    "--schema-only",
    "--format=plain",
    "--encoding=UTF8",
    ...common,
    `--restrict-key=${restrictKey}`
  ];
}

export function databaseRestoreArguments(databaseName) {
  invariant(
    typeof databaseName === "string" &&
      databaseName.length > 0,
    "INVALID_DATABASE_NAME",
    "Restore database name is missing."
  );
  return [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--exit-on-error",
    "--single-transaction",
    `--dbname=${databaseName}`
  ];
}

export async function dumpDatabaseEncrypted({
  databaseUrl,
  writable,
  key,
  backupId,
  artifactId,
  schemaOnly = false,
  restrictKey,
  environment = process.env
}) {
  const tools = databaseToolPaths(environment);
  const args = databaseDumpArguments({
    schemaOnly,
    restrictKey,
    lockWaitTimeoutMs:
      databaseLockWaitTimeout(environment)
  });
  const { child, completion } = spawnDatabaseTool({
    binary: tools.pgDump,
    args,
    databaseUrl,
    stdin: "ignore",
    environment
  });
  try {
    const encrypted = await encryptReadable({
      readable: child.stdout,
      writable,
      key,
      backupId,
      artifactId
    });
    await completion;
    return encrypted;
  } catch (error) {
    child.kill();
    await completion.catch(() => {});
    throw error;
  }
}

async function runPsql({
  databaseUrl,
  sql,
  environment = process.env
}) {
  const tools = databaseToolPaths(environment);
  const { child, completion } = spawnDatabaseTool({
    binary: tools.psql,
    args: [
      "--no-psqlrc",
      "--no-align",
      "--tuples-only",
      "--field-separator=\t",
      "--set=ON_ERROR_STOP=1"
    ],
    databaseUrl,
    environment
  });
  const outputPromise = collectStream(
    child.stdout,
    MAX_COMMAND_OUTPUT_BYTES
  );
  child.stdin.end(sql);
  await completion;
  return (await outputPromise).toString("utf8");
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function verificationSchemas(environment = process.env) {
  const configured =
    environment.HELDAT_BACKUP_VERIFY_SCHEMAS;
  const schemas = configured
    ? configured
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : DEFAULT_VERIFY_SCHEMAS;
  invariant(
    schemas.length > 0 &&
      schemas.length <= 64 &&
      schemas.every((schema) =>
        /^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/u.test(schema)
      ),
    "INVALID_VERIFY_SCHEMAS",
    "HELDAT_BACKUP_VERIFY_SCHEMAS contains an invalid schema name."
  );
  return [...new Set(schemas)].sort();
}

export async function captureDatabaseRowCounts({
  databaseUrl,
  environment = process.env
}) {
  const schemas = verificationSchemas(environment);
  const schemaArray = schemas
    .map(quoteLiteral)
    .join(", ");
  const tableOutput = await runPsql({
    databaseUrl,
    environment,
    sql:
      "SELECT schemaname, tablename\n" +
      "FROM pg_catalog.pg_tables\n" +
      `WHERE schemaname = ANY (ARRAY[${schemaArray}]::text[])\n` +
      "ORDER BY schemaname, tablename;\n"
  });
  const tables = tableOutput
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [schema, table] = line.split("\t");
      invariant(
        schema && table,
        "DATABASE_VERIFICATION_INVALID",
        "Database table-list output is invalid."
      );
      return { schema, table };
    });
  if (tables.length === 0) {
    return {};
  }
  const countSql = tables
    .map(
      ({ schema, table }) =>
        `SELECT ${quoteLiteral(
          `${schema}.${table}`
        )} AS table_name, count(*)::text AS row_count FROM ${quoteIdentifier(
          schema
        )}.${quoteIdentifier(table)}`
    )
    .join("\nUNION ALL\n");
  const countOutput = await runPsql({
    databaseUrl,
    environment,
    sql: `${countSql}\nORDER BY table_name;\n`
  });
  const result = {};
  for (const line of countOutput.split(/\r?\n/u).filter(Boolean)) {
    const [tableName, count] = line.split("\t");
    invariant(
      tableName && /^\d+$/u.test(count ?? ""),
      "DATABASE_VERIFICATION_INVALID",
      "Database row-count output is invalid."
    );
    result[tableName] = count;
  }
  return result;
}

export async function hashDatabaseSchema({
  databaseUrl,
  restrictKey,
  environment = process.env
}) {
  const tools = databaseToolPaths(environment);
  const { child, completion } = spawnDatabaseTool({
    binary: tools.pgDump,
    args: databaseDumpArguments({
      schemaOnly: true,
      restrictKey,
      lockWaitTimeoutMs:
        databaseLockWaitTimeout(environment)
    }),
    databaseUrl,
    stdin: "ignore",
    environment
  });
  const rawHash = createHash("sha256");
  const canonicalHash = createHash("sha256");
  const decoder = new StringDecoder("utf8");
  let bytes = 0;
  let canonicalBytes = 0;
  let pending = "";
  const canonicalState = { prologue: true };

  function consumeCanonicalLine(line) {
    const canonical = canonicalSchemaLine(
      line,
      canonicalState
    );
    if (canonical === null) {
      return;
    }
    const encoded = Buffer.from(canonical, "utf8");
    canonicalHash.update(encoded);
    canonicalBytes += encoded.length;
  }

  function consumeText(value) {
    pending += value;
    let lineEnd;
    while ((lineEnd = pending.indexOf("\n")) >= 0) {
      consumeCanonicalLine(pending.slice(0, lineEnd));
      pending = pending.slice(lineEnd + 1);
    }
  }

  for await (const rawChunk of child.stdout) {
    const chunk = Buffer.isBuffer(rawChunk)
      ? rawChunk
      : Buffer.from(rawChunk);
    rawHash.update(chunk);
    bytes += chunk.length;
    consumeText(decoder.write(chunk));
  }
  consumeText(decoder.end());
  if (pending.length > 0) {
    consumeCanonicalLine(pending);
    pending = "";
  }
  await completion;
  return {
    bytes,
    canonical: {
      bytes: canonicalBytes,
      format: SCHEMA_FINGERPRINT_FORMAT,
      sha256: canonicalHash.digest("hex")
    },
    sha256: rawHash.digest("hex")
  };
}

export async function restoreDatabaseEncrypted({
  databaseUrl,
  readable,
  totalBytes,
  key,
  backupId,
  artifact,
  environment = process.env
}) {
  const tools = databaseToolPaths(environment);
  const targetEnvironment = postgresEnvironment(
    databaseUrl,
    environment
  );
  const { child, completion } = spawnDatabaseTool({
    binary: tools.pgRestore,
    args: databaseRestoreArguments(
      targetEnvironment.PGDATABASE
    ),
    databaseUrl,
    environment
  });
  try {
    const decrypted = await decryptReadable({
      readable,
      totalBytes,
      writable: child.stdin,
      key,
      backupId,
      artifactId: artifact.id
    });
    invariant(
      decrypted.plaintextBytes === artifact.plaintextBytes &&
        decrypted.plaintextSha256 ===
          artifact.plaintextSha256,
      "DATABASE_DUMP_CHECKSUM_MISMATCH",
      "Database dump plaintext checksum did not match the authenticated manifest."
    );
    await completion;
    return decrypted;
  } catch (error) {
    child.kill();
    await completion.catch(() => {});
    throw error;
  }
}

export function compareRowCounts(expected, actual) {
  const differences = [];
  const tableNames = new Set([
    ...Object.keys(expected),
    ...Object.keys(actual)
  ]);
  for (const tableName of [...tableNames].sort()) {
    if (expected[tableName] !== actual[tableName]) {
      differences.push({
        tableName,
        expected: expected[tableName] ?? null,
        actual: actual[tableName] ?? null
      });
    }
  }
  return differences;
}
