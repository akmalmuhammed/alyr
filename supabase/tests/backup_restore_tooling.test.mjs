import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Readable, Writable } from "node:stream";
import test from "node:test";

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  ENCRYPTION_KEY_ENV,
  LocalDestinationAdapter,
  assertDestinationOutsideProject,
  assertNonProductionRestoreTarget,
  assertSupabaseProjectPair,
  buildRestoreConfirmation,
  createBackupId,
  createEnvelope,
  decryptReadable,
  encryptReadable,
  loadEncryptionKey,
  parseDestinationSpec,
  parsePostgresIdentity,
  parseSupabaseIdentity,
  selectRetentionCandidates,
  sha256Hex,
  stableJson,
  validateManifest,
  verifyEnvelope
} from "../scripts/backup-core.mjs";
import {
  assertBackupToolVersions,
  assertRestoreToolCompatibility,
  canonicalSchemaFingerprintFromText,
  compareRowCounts,
  databaseLockWaitTimeout,
  databaseOperationTimeout,
  databaseDumpArguments,
  databaseRestoreArguments,
  postgresEnvironment,
  verificationSchemas,
  waitForDatabaseProcess
} from "../scripts/backup-database.mjs";
import {
  applyRetention,
  createOperatorBackup,
  readAuthenticatedBackup,
  restoreOperatorBackup,
  restoreStorageObject
} from "../scripts/backup-operations.mjs";
import {
  assertServiceRoleKey,
  createStorageClient
} from "../scripts/backup-storage-rest.mjs";

const FIXED_KEY = createHash("sha256")
  .update("heldat deterministic backup test key")
  .digest();
const FIXED_TIME = new Date("2026-07-31T12:34:56.000Z");
const FIXED_BACKUP_ID = createBackupId(
  FIXED_TIME,
  "a1b2c3d4"
);
const SOURCE_DATABASE_URL =
  "postgresql://postgres.sourceproject01:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require";
const SOURCE_SUPABASE_URL =
  "https://sourceproject01.supabase.co";
const TARGET_DATABASE_URL =
  "postgresql://postgres.restoreproject1:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require";
const TARGET_SUPABASE_URL =
  "https://restoreproject1.supabase.co";

function bufferSink() {
  const chunks = [];
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    }),
    value() {
      return Buffer.concat(chunks);
    }
  };
}

async function encryptBuffer({
  bytes,
  backupId = FIXED_BACKUP_ID,
  artifactId = "fixture"
}) {
  const sink = bufferSink();
  const result = await encryptReadable({
    readable: Readable.from([
      bytes.subarray(0, Math.floor(bytes.length / 2)),
      bytes.subarray(Math.floor(bytes.length / 2))
    ]),
    writable: sink.stream,
    key: FIXED_KEY,
    backupId,
    artifactId
  });
  return {
    bytes: sink.value(),
    result
  };
}

function artifactRecord(id, kind, artifactPath, encrypted) {
  return {
    id,
    kind,
    path: artifactPath,
    plaintextBytes: encrypted.plaintextBytes,
    plaintextSha256: encrypted.plaintextSha256,
    ciphertextBytes: encrypted.ciphertextBytes,
    ciphertextSha256: encrypted.ciphertextSha256
  };
}

function staticArtifact(id, kind, artifactPath) {
  return {
    id,
    kind,
    path: artifactPath,
    plaintextBytes: 1,
    plaintextSha256: "1".repeat(64),
    ciphertextBytes: 2,
    ciphertextSha256: "2".repeat(64)
  };
}

function staticManifest() {
  return {
    backupId: FIXED_BACKUP_ID,
    completedAt: "2026-07-31T12:35:00.000Z",
    createdAt: FIXED_TIME.toISOString(),
    database: {
      consistency: {
        boundaryRowCountsMatched: true,
        boundarySchemaMatched: true,
        mode: "boundary-verified-sequential-v1",
        schemaRestrictKey:
          "0123456789abcdef0123456789abcdef"
      },
      dump: staticArtifact(
        "database-dump",
        "postgres-custom-dump",
        "database/database.dump.hbk"
      ),
      rowCounts: {
        "auth.users": "1",
        "public.assets": "2"
      },
      schema: staticArtifact(
        "database-schema",
        "postgres-schema-sql",
        "database/database.schema.sql.hbk"
      ),
      schemaFingerprint: {
        bytes: 1,
        format: "pg-dump-schema-canonical-v1",
        sha256: "3".repeat(64)
      },
      toolVersions: {
        pgDump: "pg_dump 17.5",
        pgRestore: "pg_restore 17.5",
        psql: "psql 17.5"
      }
    },
    format: BACKUP_FORMAT,
    source: {
      databaseIdentitySha256:
        parsePostgresIdentity(SOURCE_DATABASE_URL).sha256,
      projectRefSha256:
        sha256Hex("sourceproject01"),
      storageIdentitySha256:
        parseSupabaseIdentity(SOURCE_SUPABASE_URL).sha256
    },
    storage: {
      buckets: [
        {
          id: "evidence",
          name: "evidence",
          public: false,
          fileSizeLimit: 10_000_000,
          allowedMimeTypes: ["image/jpeg"],
          objects: [
            {
              name: "household/asset/photo.jpg",
              contentType: "image/jpeg",
              updatedAt: "2026-07-31T12:00:00.000Z",
              artifact: staticArtifact(
                "storage-deadbeef",
                "supabase-storage-object",
                "storage/deadbeef.hbk"
              )
            }
          ]
        }
      ]
    },
    totals: {
      privateBuckets: 1,
      storageObjects: 1
    },
    version: BACKUP_VERSION
  };
}

async function writeEncryptedArtifact({
  transaction,
  id,
  kind,
  artifactPath,
  plaintext
}) {
  const encrypted = await encryptReadable({
    readable: Readable.from([plaintext]),
    writable:
      await transaction.createWriteStream(artifactPath),
    key: FIXED_KEY,
    backupId: FIXED_BACKUP_ID,
    artifactId: id
  });
  return artifactRecord(id, kind, artifactPath, encrypted);
}

async function writeFixtureBackup(adapter) {
  const transaction = await adapter.begin(FIXED_BACKUP_ID);
  try {
    const dump = await writeEncryptedArtifact({
      transaction,
      id: "database-dump",
      kind: "postgres-custom-dump",
      artifactPath: "database/database.dump.hbk",
      plaintext: Buffer.from("fixture-custom-dump")
    });
    const schema = await writeEncryptedArtifact({
      transaction,
      id: "database-schema",
      kind: "postgres-schema-sql",
      artifactPath: "database/database.schema.sql.hbk",
      plaintext: Buffer.from("CREATE TABLE fixture(id uuid);")
    });
    const storageArtifact = await writeEncryptedArtifact({
      transaction,
      id: "storage-deadbeef",
      kind: "supabase-storage-object",
      artifactPath: "storage/deadbeef.hbk",
      plaintext: Buffer.from("fixture-image-bytes")
    });
    const manifest = {
      ...staticManifest(),
      database: {
        ...staticManifest().database,
        dump,
        schema
      },
      storage: {
        buckets: [
          {
            ...staticManifest().storage.buckets[0],
            objects: [
              {
                ...staticManifest().storage.buckets[0].objects[0],
                artifact: storageArtifact
              }
            ]
          }
        ]
      }
    };
    const manifestBytes = Buffer.from(
      `${stableJson(manifest)}\n`
    );
    const encryptedManifest = await encryptReadable({
      readable: Readable.from([manifestBytes]),
      writable:
        await transaction.createWriteStream("manifest.hbk"),
      key: FIXED_KEY,
      backupId: FIXED_BACKUP_ID,
      artifactId: "manifest"
    });
    const manifestArtifact = artifactRecord(
      "manifest",
      "encrypted-manifest",
      "manifest.hbk",
      encryptedManifest
    );
    await transaction.writeJson(
      "envelope.json",
      createEnvelope({
        backupId: FIXED_BACKUP_ID,
        createdAt: FIXED_TIME.toISOString(),
        manifestArtifact,
        key: FIXED_KEY
      })
    );
    await transaction.commit();
    return manifest;
  } catch (error) {
    await transaction.abort();
    throw error;
  }
}

function createDeterministicDatabaseOperations(
  restoredDumps
) {
  const schemaBytes = Buffer.from(
    "CREATE TABLE public.assets (id uuid);\n"
  );
  const dumpBytes = Buffer.from(
    "fixture-postgres-custom-dump"
  );
  const canonical =
    canonicalSchemaFingerprintFromText(
      schemaBytes.toString("utf8")
    );
  const versions = {
    pgDump: "pg_dump (PostgreSQL) 17.5",
    pgRestore: "pg_restore (PostgreSQL) 17.5",
    psql: "psql (PostgreSQL) 17.5"
  };
  return {
    assertBackupToolVersions,
    assertRestoreToolCompatibility,
    async captureDatabaseRowCounts() {
      return {
        "auth.users": "1",
        "public.assets": "2",
        "storage.objects": "1"
      };
    },
    async databaseToolVersions() {
      return versions;
    },
    async dumpDatabaseEncrypted({
      writable,
      key,
      backupId,
      artifactId,
      schemaOnly
    }) {
      return encryptReadable({
        readable: Readable.from([
          schemaOnly ? schemaBytes : dumpBytes
        ]),
        writable,
        key,
        backupId,
        artifactId
      });
    },
    async hashDatabaseSchema() {
      return {
        bytes: schemaBytes.length,
        canonical: {
          bytes: canonical.bytes,
          format: canonical.format,
          sha256: canonical.sha256
        },
        sha256: sha256Hex(schemaBytes)
      };
    },
    async restoreDatabaseEncrypted({
      readable,
      totalBytes,
      key,
      backupId,
      artifact
    }) {
      const sink = bufferSink();
      const decrypted = await decryptReadable({
        readable,
        totalBytes,
        writable: sink.stream,
        key,
        backupId,
        artifactId: artifact.id
      });
      assert.equal(
        decrypted.plaintextSha256,
        artifact.plaintextSha256
      );
      restoredDumps.push(sink.value());
      return decrypted;
    }
  };
}

test("canonical JSON and backup identifiers are deterministic", () => {
  assert.equal(
    stableJson({
      z: 1,
      a: { y: true, b: ["x", 2] }
    }),
    '{"a":{"b":["x",2],"y":true},"z":1}'
  );
  assert.equal(
    stableJson(
      JSON.parse(
        '{"a":1,"__proto__":{"polluted":true}}'
      )
    ),
    '{"__proto__":{"polluted":true},"a":1}'
  );
  assert.equal({}.polluted, undefined);
  assert.equal(
    FIXED_BACKUP_ID,
    "heldat-backup-20260731T123456Z-a1b2c3d4"
  );
});

test("encryption keys fail closed and require canonical 32-byte base64", () => {
  assert.deepEqual(
    loadEncryptionKey({
      [ENCRYPTION_KEY_ENV]: FIXED_KEY.toString("base64")
    }),
    FIXED_KEY
  );
  for (const encoded of [
    "",
    "not base64!",
    Buffer.alloc(31, 1).toString("base64"),
    Buffer.alloc(32).toString("base64")
  ]) {
    assert.throws(
      () =>
        loadEncryptionKey({
          [ENCRYPTION_KEY_ENV]: encoded
        }),
      (error) =>
        [
          "MISSING_ENCRYPTION_KEY",
          "INVALID_ENCRYPTION_KEY"
        ].includes(error.code)
    );
  }
});

test("AES-GCM artifact containers round-trip chunked bytes", async () => {
  const plaintext = Buffer.from(
    "Heldat backup streaming fixture ".repeat(2_048)
  );
  const encrypted = await encryptBuffer({
    bytes: plaintext,
    artifactId: "database-dump"
  });
  const output = bufferSink();
  const decrypted = await decryptReadable({
    readable: Readable.from([
      encrypted.bytes.subarray(0, 7),
      encrypted.bytes.subarray(7, 113),
      encrypted.bytes.subarray(113)
    ]),
    totalBytes: encrypted.bytes.length,
    writable: output.stream,
    key: FIXED_KEY,
    backupId: FIXED_BACKUP_ID,
    artifactId: "database-dump"
  });
  assert.deepEqual(output.value(), plaintext);
  assert.equal(
    decrypted.plaintextSha256,
    sha256Hex(plaintext)
  );
  assert.equal(
    decrypted.ciphertextSha256,
    sha256Hex(encrypted.bytes)
  );
  assert.equal(decrypted.plaintextBytes, plaintext.length);
});

test("Storage restore observes an upload rejection before backpressure can stall decryption", async () => {
  const plaintext = Buffer.alloc(2 * 1024 * 1024, 0x61);
  const encrypted = await encryptBuffer({
    bytes: plaintext,
    artifactId: "storage-early-rejection"
  });
  const uploadError = new Error(
    "fixture Storage upload rejected"
  );
  const restore = restoreStorageObject({
    targetStorageClient: {
      uploadObject() {
        return Promise.reject(uploadError);
      }
    },
    handle: {
      async stat() {
        return { size: encrypted.bytes.length };
      },
      createReadStream() {
        return Readable.from([encrypted.bytes]);
      }
    },
    backupId: FIXED_BACKUP_ID,
    key: FIXED_KEY,
    bucketId: "evidence",
    object: {
      name: "opaque-fixture.bin",
      contentType: "application/octet-stream",
      artifact: artifactRecord(
        "storage-early-rejection",
        "supabase-storage-object",
        "storage/early-rejection.hbk",
        encrypted.result
      )
    }
  });
  let timeout;
  try {
    await assert.rejects(
      Promise.race([
        restore,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "Storage restore did not cancel backpressure"
                )
              ),
            2_000
          );
        })
      ]),
      (error) => error === uploadError
    );
  } finally {
    clearTimeout(timeout);
  }
});

test("tampered containers and wrong artifact bindings fail authentication", async () => {
  const encrypted = await encryptBuffer({
    bytes: Buffer.from("authenticated fixture"),
    artifactId: "database-dump"
  });
  const tampered = Buffer.from(encrypted.bytes);
  tampered[tampered.length - 1] ^= 0xff;
  await assert.rejects(
    decryptReadable({
      readable: Readable.from([tampered]),
      totalBytes: tampered.length,
      writable: bufferSink().stream,
      key: FIXED_KEY,
      backupId: FIXED_BACKUP_ID,
      artifactId: "database-dump"
    }),
    (error) =>
      error.code ===
      "DECRYPTION_AUTHENTICATION_FAILED"
  );
  await assert.rejects(
    decryptReadable({
      readable: Readable.from([encrypted.bytes]),
      totalBytes: encrypted.bytes.length,
      writable: bufferSink().stream,
      key: FIXED_KEY,
      backupId: FIXED_BACKUP_ID,
      artifactId: "database-schema"
    }),
    (error) => error.code === "INVALID_ENCRYPTION_HEADER"
  );
});

test("backup envelopes are HMAC authenticated", () => {
  const envelope = createEnvelope({
    backupId: FIXED_BACKUP_ID,
    createdAt: FIXED_TIME.toISOString(),
    manifestArtifact: staticArtifact(
      "manifest",
      "encrypted-manifest",
      "manifest.hbk"
    ),
    key: FIXED_KEY
  });
  assert.equal(
    verifyEnvelope(envelope, FIXED_KEY),
    envelope
  );
  const tampered = structuredClone(envelope);
  tampered.createdAt = "2026-08-01T00:00:00.000Z";
  assert.throws(
    () => verifyEnvelope(tampered, FIXED_KEY),
    (error) =>
      error.code ===
      "BACKUP_ENVELOPE_AUTHENTICATION_FAILED"
  );
  const prototypeTampered = structuredClone(envelope);
  Object.defineProperty(
    prototypeTampered,
    "__proto__",
    {
      enumerable: true,
      value: { futureField: true }
    }
  );
  assert.throws(
    () => verifyEnvelope(prototypeTampered, FIXED_KEY),
    (error) =>
      error.code ===
      "BACKUP_ENVELOPE_AUTHENTICATION_FAILED"
  );
});

test("manifests accept private immutable artifacts and reject duplicate paths", () => {
  const manifest = staticManifest();
  assert.equal(validateManifest(manifest), manifest);
  const duplicate = structuredClone(manifest);
  duplicate.storage.buckets[0].objects[0].artifact.path =
    duplicate.database.dump.path;
  assert.throws(
    () => validateManifest(duplicate),
    (error) => error.code === "INVALID_BACKUP_MANIFEST"
  );
  const publicBucket = structuredClone(manifest);
  publicBucket.storage.buckets[0].public = true;
  assert.throws(
    () => validateManifest(publicBucket),
    (error) => error.code === "INVALID_BACKUP_MANIFEST"
  );
});

test("local destination is off-project, traversal-safe, atomic, and authenticated", async (context) => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "heldat-project-")
  );
  const destinationRoot = await mkdtemp(
    path.join(tmpdir(), "heldat-backups-")
  );
  context.after(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(destinationRoot, {
      recursive: true,
      force: true
    });
  });

  assert.throws(
    () =>
      assertDestinationOutsideProject(
        path.join(projectRoot, "backups"),
        projectRoot
      ),
    (error) => error.code === "DESTINATION_INSIDE_PROJECT"
  );
  assert.throws(
    () =>
      assertDestinationOutsideProject(
        path.dirname(projectRoot),
        projectRoot
      ),
    (error) =>
      error.code === "DESTINATION_CONTAINS_PROJECT"
  );

  const adapter = new LocalDestinationAdapter({
    destinationRoot,
    projectRoot
  });
  const transaction = await adapter.begin(FIXED_BACKUP_ID);
  await assert.rejects(
    transaction.createWriteStream("../escape"),
    (error) => error.code === "INVALID_ARTIFACT_PATH"
  );
  await assert.rejects(
    transaction.createWriteStream("."),
    (error) => error.code === "INVALID_ARTIFACT_PATH"
  );
  await transaction.writeJson(
    "envelope.json",
    createEnvelope({
      backupId: FIXED_BACKUP_ID,
      createdAt: FIXED_TIME.toISOString(),
      manifestArtifact: staticArtifact(
        "manifest",
        "encrypted-manifest",
        "manifest.hbk"
      ),
      key: FIXED_KEY
    })
  );
  await transaction.commit();

  assert.deepEqual(await adapter.list(FIXED_KEY), [
    {
      backupId: FIXED_BACKUP_ID,
      createdAt: FIXED_TIME.toISOString()
    }
  ]);
  await assert.rejects(
    adapter.list(Buffer.alloc(32, 9)),
    (error) =>
      error.code ===
      "BACKUP_ENVELOPE_AUTHENTICATION_FAILED"
  );
  await adapter.remove(FIXED_BACKUP_ID, FIXED_KEY);
  assert.deepEqual(await adapter.list(FIXED_KEY), []);
});

test("offline verification authenticates every encrypted artifact", async (context) => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "heldat-project-")
  );
  const destinationRoot = await mkdtemp(
    path.join(tmpdir(), "heldat-backups-")
  );
  context.after(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(destinationRoot, {
      recursive: true,
      force: true
    });
  });
  const adapter = new LocalDestinationAdapter({
    destinationRoot,
    projectRoot
  });
  const expected = await writeFixtureBackup(adapter);
  const verified = await readAuthenticatedBackup({
    adapter,
    backupId: FIXED_BACKUP_ID,
    key: FIXED_KEY,
    verifyArtifacts: true
  });
  assert.deepEqual(verified.manifest, expected);

  const artifactPath = path.join(
    destinationRoot,
    FIXED_BACKUP_ID,
    "storage",
    "deadbeef.hbk"
  );
  const tampered = await readFile(artifactPath);
  tampered[tampered.length - 1] ^= 0xff;
  await writeFile(artifactPath, tampered);
  await assert.rejects(
    readAuthenticatedBackup({
      adapter,
      backupId: FIXED_BACKUP_ID,
      key: FIXED_KEY,
      verifyArtifacts: true
    }),
    (error) =>
      error.code ===
        "DECRYPTION_AUTHENTICATION_FAILED" ||
      error.code ===
        "BACKUP_ARTIFACT_CHECKSUM_MISMATCH"
  );
  await assert.rejects(
    applyRetention({
      adapter,
      key: FIXED_KEY,
      keepCount: 1,
      keepDays: 30,
      now: new Date("2026-08-01T00:00:00.000Z"),
      execute: false
    }),
    (error) =>
      error.code ===
        "DECRYPTION_AUTHENTICATION_FAILED" ||
      error.code ===
        "BACKUP_ARTIFACT_CHECKSUM_MISMATCH"
  );
});

test("operator backup and isolated restore orchestration round-trip database and Storage bytes", async (context) => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "heldat-project-")
  );
  const destinationRoot = await mkdtemp(
    path.join(tmpdir(), "heldat-backups-")
  );
  context.after(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(destinationRoot, {
      recursive: true,
      force: true
    });
  });

  const storageBytes = Buffer.from(
    "fixture-private-storage-object"
  );
  const sourceStorageClient = {
    identity: parseSupabaseIdentity(SOURCE_SUPABASE_URL),
    async listPrivateBuckets() {
      return [
        {
          id: "evidence",
          name: "Evidence",
          public: false,
          fileSizeLimit: 10_000_000,
          allowedMimeTypes: ["image/jpeg"]
        }
      ];
    },
    async listObjects(bucketId) {
      assert.equal(bucketId, "evidence");
      return [
        {
          name: "household/asset/photo.jpg",
          contentType: "image/jpeg",
          size: storageBytes.length,
          updatedAt: "2026-07-31T12:00:00.000Z"
        }
      ];
    },
    async downloadObject(bucketId, objectName) {
      assert.equal(bucketId, "evidence");
      assert.equal(
        objectName,
        "household/asset/photo.jpg"
      );
      return {
        readable: Readable.from([storageBytes]),
        contentType: "image/jpeg",
        contentLength: storageBytes.length
      };
    }
  };
  const adapter = new LocalDestinationAdapter({
    destinationRoot,
    projectRoot
  });
  const restoredDumps = [];
  const databaseOperations =
    createDeterministicDatabaseOperations(
      restoredDumps
    );
  const backupProgress = [];
  const created = await createOperatorBackup({
    adapter,
    key: FIXED_KEY,
    sourceDatabaseUrl: SOURCE_DATABASE_URL,
    sourceStorageClient,
    databaseOperations,
    now: new Date("2020-01-02T03:04:05.000Z"),
    randomSuffix: "01020304",
    onProgress: ({ step }) => backupProgress.push(step)
  });
  assert.deepEqual(created.totals, {
    privateBuckets: 1,
    storageObjects: 1
  });
  assert.ok(
    backupProgress.includes("verify-before-commit")
  );

  const authenticated = await readAuthenticatedBackup({
    adapter,
    backupId: created.backupId,
    key: FIXED_KEY,
    verifyArtifacts: true
  });
  assert.equal(
    authenticated.manifest.totals.storageObjects,
    1
  );

  const restoredObjects = new Map();
  const ensuredBuckets = [];
  const targetStorageClient = {
    identity: parseSupabaseIdentity(TARGET_SUPABASE_URL),
    async ensurePrivateBucket(bucket) {
      ensuredBuckets.push(bucket.id);
      return { created: true };
    },
    async uploadObject({
      bucketId,
      objectName,
      readable,
      contentLength
    }) {
      const chunks = [];
      for await (const chunk of readable) {
        chunks.push(Buffer.from(chunk));
      }
      const value = Buffer.concat(chunks);
      assert.equal(value.length, contentLength);
      restoredObjects.set(
        `${bucketId}/${objectName}`,
        value
      );
    },
    async downloadObject(bucketId, objectName) {
      const value = restoredObjects.get(
        `${bucketId}/${objectName}`
      );
      assert.ok(value);
      return {
        readable: Readable.from([value]),
        contentType: "image/jpeg",
        contentLength: value.length
      };
    }
  };
  const restoreProgress = [];
  const restored = await restoreOperatorBackup({
    adapter,
    backupId: created.backupId,
    key: FIXED_KEY,
    targetDatabaseUrl: TARGET_DATABASE_URL,
    targetStorageClient,
    targetClass: "non-production",
    confirmation: buildRestoreConfirmation({
      targetDatabaseUrl: TARGET_DATABASE_URL,
      targetSupabaseUrl: TARGET_SUPABASE_URL
    }),
    databaseOperations,
    onProgress: ({ step }) => restoreProgress.push(step)
  });
  assert.equal(restored.verified, true);
  assert.deepEqual(ensuredBuckets, ["evidence"]);
  assert.deepEqual(
    restoredObjects.get(
      "evidence/household/asset/photo.jpg"
    ),
    storageBytes
  );
  assert.deepEqual(
    restoredDumps,
    [Buffer.from("fixture-postgres-custom-dump")]
  );
  assert.ok(
    restoreProgress.includes("verify-target-storage")
  );
});

test("restore target requires a different, explicitly confirmed non-production project", () => {
  const manifest = staticManifest();
  const confirmation = buildRestoreConfirmation({
    targetDatabaseUrl: TARGET_DATABASE_URL,
    targetSupabaseUrl: TARGET_SUPABASE_URL
  });
  assert.match(
    confirmation,
    /^non-production:[0-9a-f]{16}$/u
  );
  assert.equal(
    assertNonProductionRestoreTarget({
      manifest,
      targetDatabaseUrl: TARGET_DATABASE_URL,
      targetSupabaseUrl: TARGET_SUPABASE_URL,
      targetClass: "non-production",
      confirmation
    }).confirmation,
    confirmation
  );
  assert.throws(
    () =>
      assertNonProductionRestoreTarget({
        manifest,
        targetDatabaseUrl: SOURCE_DATABASE_URL,
        targetSupabaseUrl: SOURCE_SUPABASE_URL,
        targetClass: "non-production",
        confirmation
      }),
    (error) =>
      error.code === "RESTORE_TARGET_MATCHES_SOURCE"
  );
  assert.throws(
    () =>
      assertNonProductionRestoreTarget({
        manifest,
        targetDatabaseUrl: TARGET_DATABASE_URL,
        targetSupabaseUrl: TARGET_SUPABASE_URL,
        targetClass: "production",
        confirmation
      }),
    (error) =>
      error.code ===
      "RESTORE_TARGET_NOT_CLASSIFIED"
  );
  assert.throws(
    () =>
      assertNonProductionRestoreTarget({
        manifest,
        targetDatabaseUrl: TARGET_DATABASE_URL,
        targetSupabaseUrl: TARGET_SUPABASE_URL,
        targetClass: "non-production",
        confirmation: "non-production:0000000000000000"
      }),
    (error) =>
      error.code === "RESTORE_CONFIRMATION_MISMATCH"
  );
});

test("database and Storage endpoints must identify the same standard Supabase project", () => {
  const pair = assertSupabaseProjectPair({
    databaseUrl: SOURCE_DATABASE_URL,
    supabaseUrl: SOURCE_SUPABASE_URL
  });
  assert.equal(pair.database.projectRef, "sourceproject01");
  assert.equal(pair.storage.projectRef, "sourceproject01");
  assert.throws(
    () =>
      assertSupabaseProjectPair({
        databaseUrl: SOURCE_DATABASE_URL,
        supabaseUrl: TARGET_SUPABASE_URL
      }),
    (error) =>
      error.code ===
      "SUPABASE_PROJECT_IDENTITY_MISMATCH"
  );
  assert.throws(
    () =>
      assertSupabaseProjectPair({
        databaseUrl:
          "postgresql://operator:secret@database-alias.example.test:5432/postgres",
        supabaseUrl: TARGET_SUPABASE_URL
      }),
    (error) =>
      error.code ===
      "SUPABASE_PROJECT_IDENTITY_MISMATCH"
  );
});

test("retention preserves count and age guarantees", () => {
  const candidates = selectRetentionCandidates(
    [
      {
        backupId: "newest",
        createdAt: "2026-07-30T00:00:00.000Z"
      },
      {
        backupId: "second",
        createdAt: "2026-07-20T00:00:00.000Z"
      },
      {
        backupId: "old",
        createdAt: "2026-06-01T00:00:00.000Z"
      },
      {
        backupId: "oldest",
        createdAt: "2026-05-01T00:00:00.000Z"
      }
    ],
    {
      keepCount: 2,
      keepDays: 30,
      now: new Date("2026-07-31T00:00:00.000Z")
    }
  );
  assert.deepEqual(
    candidates.map((entry) => entry.backupId),
    ["old", "oldest"]
  );
});

test("destination parser exposes a pluggable but fail-closed R2/S3 boundary", async (context) => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "heldat-project-")
  );
  const destinationRoot = await mkdtemp(
    path.join(tmpdir(), "heldat-backups-")
  );
  context.after(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(destinationRoot, {
      recursive: true,
      force: true
    });
  });
  assert.ok(
    parseDestinationSpec(
      `local:${destinationRoot}`,
      projectRoot
    ) instanceof LocalDestinationAdapter
  );
  for (const spec of [
    "r2://bucket/prefix",
    "s3://bucket/prefix"
  ]) {
    assert.throws(
      () => parseDestinationSpec(spec, projectRoot),
      (error) =>
        error.code ===
        "DESTINATION_ADAPTER_NOT_INSTALLED"
    );
  }
});

test("database subprocess environment keeps secrets out of arguments and enforces TLS remotely", () => {
  const environment = postgresEnvironment(
    "postgresql://operator:p%40ss@db.example.test:6543/heldat?sslmode=verify-full",
    {
      PATH: "fixture-path",
      HELDAT_BACKUP_ENCRYPTION_KEY_BASE64: "must-not-leak",
      CUSTOM_SECRET: "must-not-leak",
      SAFE_FLAG: "kept",
      AWS_ACCESS_KEY_ID: "must-not-leak",
      LANG: "de_DE.UTF-8",
      LC_ALL: "fr_FR.UTF-8",
      PGOPTIONS: "--must-not-leak",
      HELDAT_PG_CONNECT_TIMEOUT: "45",
      HELDAT_PG_SSLROOTCERT: "C:\\certs\\root.pem"
    }
  );
  assert.equal(environment.PGHOST, "db.example.test");
  assert.equal(environment.PGPORT, "6543");
  assert.equal(environment.PGDATABASE, "heldat");
  assert.equal(environment.PGUSER, "operator");
  assert.equal(environment.PGPASSWORD, "p@ss");
  assert.equal(environment.PGSSLMODE, "verify-full");
  assert.equal(environment.PGCONNECT_TIMEOUT, "45");
  assert.equal(
    environment.PGSSLROOTCERT,
    "C:\\certs\\root.pem"
  );
  assert.equal(environment.PGOPTIONS, undefined);
  assert.equal(environment.SAFE_FLAG, undefined);
  assert.equal(environment.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(environment.LANG, "C");
  assert.equal(environment.LC_ALL, "C");
  assert.equal(
    environment.HELDAT_BACKUP_ENCRYPTION_KEY_BASE64,
    undefined
  );
  assert.equal(environment.CUSTOM_SECRET, undefined);
  assert.equal(
    postgresEnvironment(
      "postgresql://u:p@[::1]:5432/db?sslmode=disable",
      { PATH: "fixture-path" }
    ).PGHOST,
    "::1"
  );
  assert.throws(
    () =>
      postgresEnvironment(
        "postgresql://u:p@remote.example.test/db?sslmode=disable"
      ),
    (error) =>
      error.code === "INSECURE_DATABASE_TRANSPORT"
  );
  assert.throws(
    () =>
      postgresEnvironment(
        "postgresql://u:p@remote.example.test/db?sslmode=prefer"
      ),
    (error) =>
      error.code === "INSECURE_DATABASE_TRANSPORT"
  );
  const fullDumpArguments = databaseDumpArguments();
  const schemaArguments = databaseDumpArguments({
    schemaOnly: true,
    restrictKey:
      "0123456789abcdef0123456789abcdef"
  });
  const restoreArguments =
    databaseRestoreArguments("postgres");
  for (const args of [
    fullDumpArguments,
    schemaArguments,
    restoreArguments
  ]) {
    assert.equal(args.includes("--no-acl"), false);
    assert.equal(args.includes("--no-owner"), true);
  }
  assert.equal(
    restoreArguments.includes("--exit-on-error"),
    true
  );
  assert.equal(
    restoreArguments.includes("--single-transaction"),
    true
  );
  assert.equal(
    schemaArguments.includes(
      "--restrict-key=0123456789abcdef0123456789abcdef"
    ),
    true
  );
  assert.deepEqual(
    assertBackupToolVersions({
      pgDump: "pg_dump (PostgreSQL) 17.5",
      pgRestore: "pg_restore (PostgreSQL) 17.4",
      psql: "psql (PostgreSQL) 17.5"
    }),
    {
      pgDump: 17,
      pgRestore: 17,
      psql: 17
    }
  );
  assert.deepEqual(
    assertRestoreToolCompatibility(
      {
        pgDump: "pg_dump (PostgreSQL) 17.5",
        pgRestore: "pg_restore (PostgreSQL) 17.5",
        psql: "psql (PostgreSQL) 17.5"
      },
      {
        pgDump: "pg_dump (PostgreSQL) 17.6",
        pgRestore: "pg_restore (PostgreSQL) 17.6",
        psql: "psql (PostgreSQL) 17.6"
      }
    ),
    {
      backupMajor: 17,
      restoreMajor: 17
    }
  );
  assert.throws(
    () =>
      assertRestoreToolCompatibility(
        {
          pgDump: "pg_dump (PostgreSQL) 17.5",
          pgRestore: "pg_restore (PostgreSQL) 17.5",
          psql: "psql (PostgreSQL) 17.5"
        },
        {
          pgDump: "pg_dump (PostgreSQL) 16.9",
          pgRestore: "pg_restore (PostgreSQL) 16.9",
          psql: "psql (PostgreSQL) 16.9"
        }
      ),
    (error) =>
      error.code ===
      "DATABASE_RESTORE_VERSION_MISMATCH"
  );
});

test("schema fingerprints remove volatile pg_dump headers but preserve logical DDL", () => {
  const first = canonicalSchemaFingerprintFromText(
    [
      "-- PostgreSQL database dump",
      "-- Dumped from database version 17.4",
      "-- Dumped by pg_dump version 17.5",
      "-- Started on 2026-07-31 10:00:00 UTC",
      "CREATE TABLE public.assets (id uuid);",
      ""
    ].join("\r\n")
  );
  const second = canonicalSchemaFingerprintFromText(
    [
      "-- PostgreSQL database dump",
      "-- Dumped from database version 17.6",
      "-- Dumped by pg_dump version 17.6",
      "-- Started on 2026-08-01 11:00:00 UTC",
      "CREATE TABLE public.assets (id uuid);",
      ""
    ].join("\n")
  );
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.bytes, second.bytes);
  assert.equal(
    first.canonicalText.includes("database version"),
    false
  );
  const changed = canonicalSchemaFingerprintFromText(
    "CREATE TABLE public.assets (id text);\n"
  );
  assert.notEqual(first.sha256, changed.sha256);
  const embeddedVersionComment =
    canonicalSchemaFingerprintFromText(
      [
        "COMMENT ON TABLE public.assets IS 'before",
        "-- Dumped from database version user-content",
        "after';",
        ""
      ].join("\n")
    );
  const changedEmbeddedVersionComment =
    canonicalSchemaFingerprintFromText(
      [
        "COMMENT ON TABLE public.assets IS 'before",
        "-- Dumped from database version changed-content",
        "after';",
        ""
      ].join("\n")
    );
  assert.notEqual(
    embeddedVersionComment.sha256,
    changedEmbeddedVersionComment.sha256
  );
});

test("database operation and lock waits are bounded, including on Windows", async () => {
  assert.equal(
    databaseOperationTimeout({
      HELDAT_PG_OPERATION_TIMEOUT_MS: "45000"
    }),
    45_000
  );
  assert.equal(
    databaseLockWaitTimeout({
      HELDAT_PG_LOCK_WAIT_TIMEOUT_MS: "5000"
    }),
    5_000
  );
  assert.throws(
    () =>
      databaseOperationTimeout({
        HELDAT_PG_OPERATION_TIMEOUT_MS: "0"
      }),
    (error) =>
      error.code === "INVALID_PG_OPERATION_TIMEOUT"
  );

  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
  const stderrPromise = (async () => {
    const chunks = [];
    for await (const chunk of child.stderr) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  })();
  const startedAt = Date.now();
  await assert.rejects(
    waitForDatabaseProcess(
      child,
      "fixture-database-tool",
      stderrPromise,
      { timeoutMs: 100 }
    ),
    (error) => error.code === "DATABASE_TOOL_TIMEOUT"
  );
  assert.ok(Date.now() - startedAt < 5_000);
  assert.ok(
    child.exitCode !== null || child.signalCode !== null
  );
});

test("verification schemas, row counts, origins, and service keys are validated", () => {
  assert.deepEqual(
    verificationSchemas({
      HELDAT_BACKUP_VERIFY_SCHEMAS:
        "storage,public,public,auth"
    }),
    ["auth", "public", "storage"]
  );
  assert.throws(
    () =>
      verificationSchemas({
        HELDAT_BACKUP_VERIFY_SCHEMAS:
          "public,invalid schema"
      }),
    (error) => error.code === "INVALID_VERIFY_SCHEMAS"
  );
  assert.deepEqual(
    compareRowCounts(
      { "public.assets": "2", "auth.users": "1" },
      { "public.assets": "3", "storage.objects": "4" }
    ),
    [
      {
        tableName: "auth.users",
        expected: "1",
        actual: null
      },
      {
        tableName: "public.assets",
        expected: "2",
        actual: "3"
      },
      {
        tableName: "storage.objects",
        expected: null,
        actual: "4"
      }
    ]
  );
  assert.throws(
    () => parseSupabaseIdentity("http://project.test"),
    (error) => error.code === "INVALID_SUPABASE_URL"
  );
  assert.equal(
    assertServiceRoleKey(
      `sb_secret_${"x".repeat(24)}`
    ),
    `sb_secret_${"x".repeat(24)}`
  );
  for (const key of [
    `sb_publishable_${"x".repeat(24)}`,
    `sb_anon_${"x".repeat(24)}`,
    "short"
  ]) {
    assert.throws(() => assertServiceRoleKey(key));
  }
});

test("Storage adapter backs up private buckets, recursively enumerates objects, and streams bytes", async () => {
  const requests = [];
  const uploads = new Map();
  let createdBucket;
  const fetchImpl = async (url, options = {}) => {
    assert.equal(options.redirect, "error");
    const parsed = new URL(url);
    const method = options.method ?? "GET";
    requests.push({
      method,
      pathname: parsed.pathname
    });
    if (
      parsed.pathname === "/storage/v1/bucket" &&
      method === "GET"
    ) {
      return new Response(
        JSON.stringify([
          {
            id: "evidence",
            name: "Evidence",
            public: false,
            file_size_limit: "10000000",
            allowed_mime_types: ["image/jpeg"]
          }
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }
    if (
      parsed.pathname === "/storage/v1/bucket" &&
      method === "POST"
    ) {
      createdBucket = JSON.parse(options.body);
      return new Response("{}", {
        status: 201,
        headers: {
          "content-type": "application/json"
        }
      });
    }
    if (
      parsed.pathname ===
        "/storage/v1/object/list/evidence" &&
      method === "POST"
    ) {
      const body = JSON.parse(options.body);
      const entries =
        body.prefix === ""
          ? [
              {
                id: "file-1",
                name: "root.txt",
                metadata: {
                  size: "4",
                  mimetype: "text/plain"
                },
                updated_at: "2026-07-31T10:00:00.000Z"
              },
              {
                id: "file-0",
                name: "empty.bin",
                metadata: {
                  size: "0",
                  mimetype: "application/octet-stream"
                },
                updated_at: "2026-07-31T09:00:00.000Z"
              },
              {
                id: null,
                name: "nested",
                metadata: null
              }
            ]
          : [
              {
                id: "file-2",
                name: "photo.jpg",
                metadata: {
                  size: 5,
                  mimetype: "image/jpeg"
                },
                updated_at: "2026-07-31T11:00:00.000Z"
              }
            ];
      return new Response(JSON.stringify(entries), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
    if (
      parsed.pathname ===
        "/storage/v1/object/authenticated/evidence/nested/photo.jpg" &&
      method === "GET"
    ) {
      return new Response(Buffer.from("photo"), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "5"
        }
      });
    }
    if (
      parsed.pathname ===
        "/storage/v1/object/authenticated/evidence/empty.bin" &&
      method === "GET"
    ) {
      return new Response(Buffer.alloc(0), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "0"
        }
      });
    }
    if (
      parsed.pathname ===
        "/storage/v1/object/evidence/restored/photo.jpg" &&
      method === "POST"
    ) {
      const chunks = [];
      for await (const chunk of options.body) {
        chunks.push(Buffer.from(chunk));
      }
      uploads.set(
        parsed.pathname,
        Buffer.concat(chunks)
      );
      return new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
    return new Response("not found", { status: 404 });
  };
  const client = createStorageClient({
    supabaseUrl: SOURCE_SUPABASE_URL,
    serviceRoleKey: `sb_secret_${"x".repeat(24)}`,
    fetchImpl,
    timeoutMs: 5_000
  });

  assert.deepEqual(await client.listPrivateBuckets(), [
    {
      id: "evidence",
      name: "Evidence",
      public: false,
      fileSizeLimit: 10_000_000,
      allowedMimeTypes: ["image/jpeg"]
    }
  ]);
  assert.deepEqual(
    await client.ensurePrivateBucket({
      id: "evidence",
      name: "Evidence",
      public: false,
      fileSizeLimit: 10_000_000,
      allowedMimeTypes: ["image/jpeg"]
    }),
    { created: false }
  );
  assert.deepEqual(
    await client.ensurePrivateBucket({
      id: "archive",
      name: "Archive",
      public: false,
      fileSizeLimit: null,
      allowedMimeTypes: null
    }),
    { created: true }
  );
  assert.deepEqual(createdBucket, {
    id: "archive",
    name: "Archive",
    public: false,
    file_size_limit: null,
    allowed_mime_types: null
  });
  assert.deepEqual(await client.listObjects("evidence"), [
    {
      name: "empty.bin",
      contentType: "application/octet-stream",
      size: 0,
      updatedAt: "2026-07-31T09:00:00.000Z"
    },
    {
      name: "nested/photo.jpg",
      contentType: "image/jpeg",
      size: 5,
      updatedAt: "2026-07-31T11:00:00.000Z"
    },
    {
      name: "root.txt",
      contentType: "text/plain",
      size: 4,
      updatedAt: "2026-07-31T10:00:00.000Z"
    }
  ]);
  const download = await client.downloadObject(
    "evidence",
    "nested/photo.jpg"
  );
  const downloaded = [];
  for await (const chunk of download.readable) {
    downloaded.push(Buffer.from(chunk));
  }
  assert.equal(
    Buffer.concat(downloaded).toString("utf8"),
    "photo"
  );
  const emptyDownload = await client.downloadObject(
    "evidence",
    "empty.bin"
  );
  assert.equal(emptyDownload.contentLength, 0);
  await client.uploadObject({
    bucketId: "evidence",
    objectName: "restored/photo.jpg",
    readable: Readable.from([Buffer.from("photo")]),
    contentType: "image/jpeg",
    contentLength: 5
  });
  assert.equal(
    uploads
      .get(
        "/storage/v1/object/evidence/restored/photo.jpg"
      )
      .toString("utf8"),
    "photo"
  );
  assert.ok(
    requests.some(
      (request) =>
        request.pathname ===
        "/storage/v1/object/list/evidence"
    )
  );
  for (const operation of [
    () => client.listObjects("../evidence"),
    () =>
      client.downloadObject(
        "evidence",
        "../outside.bin"
      ),
    () =>
      client.uploadObject({
        bucketId: "evidence",
        objectName: "folder/../outside.bin",
        readable: Readable.from([]),
        contentType: "application/octet-stream",
        contentLength: 0
      })
  ]) {
    await assert.rejects(
      operation(),
      (error) => error.code === "STORAGE_PATH_UNSAFE"
    );
  }
  assert.throws(
    () =>
      createStorageClient({
        supabaseUrl: SOURCE_SUPABASE_URL,
        serviceRoleKey:
          `sb_secret_${"x".repeat(24)}`,
        fetchImpl,
        timeoutMs: 999
      }),
    (error) => error.code === "INVALID_STORAGE_TIMEOUT"
  );

  const publicBucketClient = createStorageClient({
    supabaseUrl: SOURCE_SUPABASE_URL,
    serviceRoleKey: `sb_secret_${"x".repeat(24)}`,
    timeoutMs: 5_000,
    fetchImpl: async (_url, options = {}) => {
      assert.equal(options.redirect, "error");
      return new Response(
        JSON.stringify([
          {
            id: "public-assets",
            name: "Public",
            public: true
          }
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }
  });
  await assert.rejects(
    publicBucketClient.listPrivateBuckets(),
    (error) =>
      error.code ===
      "PUBLIC_STORAGE_BUCKET_UNSUPPORTED"
  );

  const unsafeObjectClient = createStorageClient({
    supabaseUrl: SOURCE_SUPABASE_URL,
    serviceRoleKey: `sb_secret_${"x".repeat(24)}`,
    timeoutMs: 5_000,
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          {
            id: "unsafe",
            name: "..",
            metadata: { size: 1 }
          }
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
  });
  await assert.rejects(
    unsafeObjectClient.listObjects("evidence"),
    (error) => error.code === "STORAGE_PATH_UNSAFE"
  );
});

test("CLI advertises backup, verification, restore, retention, and requires explicit mutation mode", () => {
  const cli = path.resolve(
    "supabase/scripts/heldat-backup.mjs"
  );
  const help = spawnSync(process.execPath, [cli, "help"], {
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(help.status, 0, help.stderr);
  const helpBody = JSON.parse(help.stdout);
  assert.deepEqual(
    Object.keys(helpBody.commands).sort(),
    [
      "backup",
      "restore",
      "retention",
      "verify",
      "verify-restore"
    ]
  );
  for (const flag of ["--help", "-h"]) {
    const flaggedHelp = spawnSync(
      process.execPath,
      [cli, flag],
      {
        encoding: "utf8",
        windowsHide: true
      }
    );
    assert.equal(
      flaggedHelp.status,
      0,
      flaggedHelp.stderr
    );
    assert.deepEqual(
      JSON.parse(flaggedHelp.stdout),
      helpBody
    );
  }

  const missingMode = spawnSync(
    process.execPath,
    [cli, "backup", "--destination", "local:C:\\fixture"],
    {
      encoding: "utf8",
      windowsHide: true
    }
  );
  assert.equal(missingMode.status, 1);
  assert.equal(
    JSON.parse(missingMode.stderr).error.code,
    "EXECUTION_MODE_REQUIRED"
  );

  const unknownOption = spawnSync(
    process.execPath,
    [
      cli,
      "retention",
      "--dry-run",
      "--unexpected",
      "value"
    ],
    {
      encoding: "utf8",
      windowsHide: true
    }
  );
  assert.equal(unknownOption.status, 1);
  assert.equal(
    JSON.parse(unknownOption.stderr).error.code,
    "UNKNOWN_OPTION"
  );

  const duplicateOption = spawnSync(
    process.execPath,
    [
      cli,
      "verify",
      "--backup-id",
      FIXED_BACKUP_ID,
      "--backup-id",
      FIXED_BACKUP_ID
    ],
    {
      encoding: "utf8",
      windowsHide: true
    }
  );
  assert.equal(duplicateOption.status, 1);
  assert.equal(
    JSON.parse(duplicateOption.stderr).error.code,
    "DUPLICATE_ARGUMENT"
  );
});

test("CLI backup and restore dry runs are credential-validated but network-free and non-mutating", async (context) => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "heldat-project-")
  );
  const emptyDestinationParent = await mkdtemp(
    path.join(tmpdir(), "heldat-dry-run-")
  );
  const emptyDestination = path.join(
    emptyDestinationParent,
    "must-not-be-created"
  );
  const fixtureDestination = await mkdtemp(
    path.join(tmpdir(), "heldat-restore-plan-")
  );
  context.after(async () => {
    for (const directory of [
      projectRoot,
      emptyDestinationParent,
      fixtureDestination
    ]) {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const cli = path.resolve(
    "supabase/scripts/heldat-backup.mjs"
  );
  const commonEnvironment = {
    ...process.env,
    [ENCRYPTION_KEY_ENV]: FIXED_KEY.toString("base64"),
    HELDAT_PG_DUMP_BIN: process.execPath,
    HELDAT_PG_RESTORE_BIN: process.execPath,
    HELDAT_PSQL_BIN: process.execPath
  };

  const backupPlan = spawnSync(
    process.execPath,
    [
      cli,
      "backup",
      "--destination",
      `local:${emptyDestination}`,
      "--dry-run"
    ],
    {
      encoding: "utf8",
      env: {
        ...commonEnvironment,
        HELDAT_SOURCE_DATABASE_URL: SOURCE_DATABASE_URL,
        HELDAT_SOURCE_SUPABASE_URL: SOURCE_SUPABASE_URL,
        HELDAT_SOURCE_SUPABASE_SERVICE_ROLE_KEY:
          `sb_secret_${"x".repeat(24)}`
      },
      windowsHide: true
    }
  );
  assert.equal(backupPlan.status, 0, backupPlan.stderr);
  const backupBody = JSON.parse(backupPlan.stdout);
  assert.equal(backupBody.action, "backup");
  assert.equal(backupBody.writes, false);
  assert.equal(backupBody.encrypted, true);
  assert.equal(
    backupPlan.stdout.includes(SOURCE_DATABASE_URL),
    false
  );
  assert.equal(
    backupPlan.stdout.includes(
      "postgres.sourceproject01:secret"
    ),
    false
  );
  await assert.rejects(
    access(emptyDestination),
    (error) => error.code === "ENOENT"
  );

  const adapter = new LocalDestinationAdapter({
    destinationRoot: fixtureDestination,
    projectRoot
  });
  await writeFixtureBackup(adapter);
  const before = (await readdir(fixtureDestination)).sort();
  const restorePlan = spawnSync(
    process.execPath,
    [
      cli,
      "restore",
      "--destination",
      `local:${fixtureDestination}`,
      "--backup-id",
      FIXED_BACKUP_ID,
      "--dry-run"
    ],
    {
      encoding: "utf8",
      env: {
        ...commonEnvironment,
        HELDAT_RESTORE_DATABASE_URL:
          TARGET_DATABASE_URL,
        HELDAT_RESTORE_SUPABASE_URL:
          TARGET_SUPABASE_URL
      },
      windowsHide: true
    }
  );
  assert.equal(restorePlan.status, 0, restorePlan.stderr);
  const restoreBody = JSON.parse(restorePlan.stdout);
  assert.equal(restoreBody.action, "restore");
  assert.equal(restoreBody.writes, false);
  assert.equal(
    restoreBody.expectedConfirmation,
    buildRestoreConfirmation({
      targetDatabaseUrl: TARGET_DATABASE_URL,
      targetSupabaseUrl: TARGET_SUPABASE_URL
    })
  );
  assert.deepEqual(
    (await readdir(fixtureDestination)).sort(),
    before
  );

  const verifyRestorePlan = spawnSync(
    process.execPath,
    [
      cli,
      "verify-restore",
      "--destination",
      `local:${fixtureDestination}`,
      "--backup-id",
      FIXED_BACKUP_ID,
      "--dry-run"
    ],
    {
      encoding: "utf8",
      env: {
        ...commonEnvironment,
        HELDAT_RESTORE_DATABASE_URL:
          TARGET_DATABASE_URL,
        HELDAT_RESTORE_SUPABASE_URL:
          TARGET_SUPABASE_URL
      },
      windowsHide: true
    }
  );
  assert.equal(
    verifyRestorePlan.status,
    0,
    verifyRestorePlan.stderr
  );
  const verifyRestoreBody = JSON.parse(
    verifyRestorePlan.stdout
  );
  assert.equal(
    verifyRestoreBody.action,
    "verify-restore"
  );
  assert.equal(verifyRestoreBody.writes, false);
  assert.deepEqual(
    (await readdir(fixtureDestination)).sort(),
    before
  );
});
