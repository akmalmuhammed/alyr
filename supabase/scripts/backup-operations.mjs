import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";
import { Readable, PassThrough, Writable } from "node:stream";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  assertNonProductionRestoreTarget,
  assertSupabaseProjectPair,
  buildRestoreConfirmation,
  createBackupId,
  createEnvelope,
  decryptReadable,
  encryptReadable,
  invariant,
  manifestArtifacts,
  manifestSizeLimit,
  parsePostgresIdentity,
  selectRetentionCandidates,
  stableJson,
  validateManifest,
  verifyEnvelope
} from "./backup-core.mjs";
import {
  assertBackupToolVersions,
  assertRestoreToolCompatibility,
  captureDatabaseRowCounts,
  compareRowCounts,
  databaseToolVersions,
  dumpDatabaseEncrypted,
  hashDatabaseSchema,
  restoreDatabaseEncrypted
} from "./backup-database.mjs";

const DEFAULT_DATABASE_OPERATIONS = Object.freeze({
  assertBackupToolVersions,
  assertRestoreToolCompatibility,
  captureDatabaseRowCounts,
  databaseToolVersions,
  dumpDatabaseEncrypted,
  hashDatabaseSchema,
  restoreDatabaseEncrypted
});

class NullWritable extends Writable {
  _write(_chunk, _encoding, callback) {
    callback();
  }
}

class BufferWritable extends Writable {
  constructor() {
    super();
    this.chunks = [];
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

function artifactRecord({
  id,
  kind,
  path,
  encrypted
}) {
  return {
    id,
    kind,
    path,
    plaintextBytes: encrypted.plaintextBytes,
    plaintextSha256: encrypted.plaintextSha256,
    ciphertextBytes: encrypted.ciphertextBytes,
    ciphertextSha256: encrypted.ciphertextSha256
  };
}

async function assertAndDecryptArtifact({
  handle,
  artifact,
  key,
  backupId,
  writable
}) {
  const fileStat = await handle.stat(artifact.path);
  invariant(
    fileStat.isFile() &&
      fileStat.size === artifact.ciphertextBytes,
    "BACKUP_ARTIFACT_SIZE_MISMATCH",
    `Encrypted artifact ${artifact.id} size does not match its manifest.`
  );
  const result = await decryptReadable({
    readable: handle.createReadStream(artifact.path),
    totalBytes: fileStat.size,
    writable,
    key,
    backupId,
    artifactId: artifact.id
  });
  invariant(
    result.ciphertextSha256 ===
      artifact.ciphertextSha256 &&
      result.plaintextSha256 ===
        artifact.plaintextSha256 &&
      result.plaintextBytes === artifact.plaintextBytes,
    "BACKUP_ARTIFACT_CHECKSUM_MISMATCH",
    `Artifact ${artifact.id} does not match its authenticated manifest.`
  );
  return result;
}

export async function readAuthenticatedBackup({
  adapter,
  backupId,
  key,
  verifyArtifacts = true,
  handle: suppliedHandle
}) {
  const handle =
    suppliedHandle ?? (await adapter.open(backupId));
  const envelope = verifyEnvelope(
    await handle.readJson("envelope.json"),
    key
  );
  invariant(
    envelope.backupId === backupId,
    "BACKUP_ID_MISMATCH",
    "Requested backup and authenticated envelope identifiers differ."
  );
  invariant(
    envelope.manifest.plaintextBytes <=
      manifestSizeLimit(),
    "BACKUP_MANIFEST_TOO_LARGE",
    "Encrypted backup manifest exceeds its reviewed limit."
  );
  const collector = new BufferWritable();
  await assertAndDecryptArtifact({
    handle,
    artifact: envelope.manifest,
    key,
    backupId,
    writable: collector
  });
  let manifest;
  try {
    manifest = JSON.parse(collector.toBuffer().toString("utf8"));
  } catch (error) {
    throw new BackupError(
      "INVALID_BACKUP_MANIFEST",
      "Decrypted backup manifest is not valid JSON.",
      error
    );
  }
  validateManifest(manifest);
  invariant(
    manifest.backupId === backupId,
    "BACKUP_ID_MISMATCH",
    "Backup manifest identifier differs from its envelope."
  );

  if (verifyArtifacts) {
    for (const artifact of manifestArtifacts(manifest)) {
      await assertAndDecryptArtifact({
        handle,
        artifact,
        key,
        backupId,
        writable: new NullWritable()
      });
    }
  }
  return { envelope, manifest, handle };
}

export async function createOperatorBackup({
  adapter,
  key,
  sourceDatabaseUrl,
  sourceStorageClient,
  environment = process.env,
  now = new Date(),
  randomSuffix,
  onProgress = () => {},
  databaseOperations = DEFAULT_DATABASE_OPERATIONS
}) {
  const sourceIdentity = assertSupabaseProjectPair({
    databaseUrl: sourceDatabaseUrl,
    supabaseUrl: sourceStorageClient.identity.canonical
  });
  const backupId = createBackupId(now, randomSuffix);
  const transaction = await adapter.begin(backupId);
  try {
    onProgress({ step: "database-tools" });
    const toolVersions =
      await databaseOperations.databaseToolVersions(
        environment
      );
    databaseOperations.assertBackupToolVersions(
      toolVersions
    );

    const schemaRestrictKey =
      randomBytes(24).toString("hex");
    onProgress({
      step: "database-consistency-baseline-schema"
    });
    const baselineSchema =
      await databaseOperations.hashDatabaseSchema({
        databaseUrl: sourceDatabaseUrl,
        restrictKey: schemaRestrictKey,
        environment
      });
    onProgress({
      step: "database-consistency-baseline-rows"
    });
    const baselineRowCounts =
      await databaseOperations.captureDatabaseRowCounts({
        databaseUrl: sourceDatabaseUrl,
        environment
      });

    const dumpArtifactId = "database-dump";
    const dumpPath = "database/database.dump.hbk";
    onProgress({ step: "database-dump" });
    const dumpEncrypted =
      await databaseOperations.dumpDatabaseEncrypted({
        databaseUrl: sourceDatabaseUrl,
        writable:
          await transaction.createWriteStream(
            dumpPath
          ),
        key,
        backupId,
        artifactId: dumpArtifactId,
        environment
      });
    const dumpArtifact = artifactRecord({
      id: dumpArtifactId,
      kind: "postgres-custom-dump",
      path: dumpPath,
      encrypted: dumpEncrypted
    });

    const schemaArtifactId = "database-schema";
    const schemaPath = "database/database.schema.sql.hbk";
    onProgress({ step: "database-schema" });
    const schemaEncrypted =
      await databaseOperations.dumpDatabaseEncrypted({
        databaseUrl: sourceDatabaseUrl,
        writable:
          await transaction.createWriteStream(
            schemaPath
          ),
        key,
        backupId,
        artifactId: schemaArtifactId,
        schemaOnly: true,
        restrictKey: schemaRestrictKey,
        environment
      });
    const schemaArtifact = artifactRecord({
      id: schemaArtifactId,
      kind: "postgres-schema-sql",
      path: schemaPath,
      encrypted: schemaEncrypted
    });

    invariant(
      schemaEncrypted.plaintextBytes ===
          baselineSchema.bytes &&
        schemaEncrypted.plaintextSha256 ===
          baselineSchema.sha256,
      "BACKUP_SOURCE_CHANGED_DURING_CAPTURE",
      "Database schema changed across the backup capture window."
    );

    onProgress({
      step: "database-consistency-final-rows"
    });
    const rowCounts =
      await databaseOperations.captureDatabaseRowCounts({
        databaseUrl: sourceDatabaseUrl,
        environment
      });
    const rowCountDifferences = compareRowCounts(
      baselineRowCounts,
      rowCounts
    );
    invariant(
      rowCountDifferences.length === 0,
      "BACKUP_SOURCE_CHANGED_DURING_CAPTURE",
      `Database row counts changed across the backup capture window (${rowCountDifferences.length} table differences).`
    );

    onProgress({ step: "storage-list" });
    const buckets =
      await sourceStorageClient.listPrivateBuckets();
    const storageManifest = [];
    for (const bucket of buckets) {
      const objects =
        await sourceStorageClient.listObjects(bucket.id);
      const objectManifest = [];
      for (const object of objects) {
        onProgress({
          step: "storage-object",
          bucketId: bucket.id,
          objectName: object.name
        });
        const download =
          await sourceStorageClient.downloadObject(
            bucket.id,
            object.name
          );
        const opaqueId = randomUUID();
        const artifactId = `storage-${opaqueId}`;
        const artifactPath = `storage/${opaqueId}.hbk`;
        const encrypted = await encryptReadable({
          readable: download.readable,
          writable:
            await transaction.createWriteStream(artifactPath),
          key,
          backupId,
          artifactId
        });
        if (object.size !== null) {
          invariant(
            object.size === encrypted.plaintextBytes,
            "STORAGE_OBJECT_SIZE_MISMATCH",
            "Storage listing and downloaded object sizes differ."
          );
        }
        objectManifest.push({
          name: object.name,
          contentType:
            download.contentType || object.contentType,
          updatedAt: object.updatedAt,
          artifact: artifactRecord({
            id: artifactId,
            kind: "supabase-storage-object",
            path: artifactPath,
            encrypted
          })
        });
      }
      storageManifest.push({
        ...bucket,
        objects: objectManifest
      });
    }

    const completedAt = new Date().toISOString();
    const manifest = {
      backupId,
      completedAt,
      createdAt: now.toISOString(),
      database: {
        consistency: {
          boundaryRowCountsMatched: true,
          boundarySchemaMatched: true,
          mode: "boundary-verified-sequential-v1",
          schemaRestrictKey
        },
        dump: dumpArtifact,
        rowCounts,
        schema: schemaArtifact,
        schemaFingerprint: baselineSchema.canonical,
        toolVersions
      },
      format: BACKUP_FORMAT,
      source: {
        databaseIdentitySha256:
          sourceIdentity.database.sha256,
        projectRefSha256:
          sourceIdentity.projectRefSha256,
        storageIdentitySha256:
          sourceIdentity.storage.sha256
      },
      storage: {
        buckets: storageManifest
      },
      totals: {
        privateBuckets: storageManifest.length,
        storageObjects: storageManifest.reduce(
          (total, bucket) =>
            total + bucket.objects.length,
          0
        )
      },
      version: BACKUP_VERSION
    };
    validateManifest(manifest);

    const manifestId = "manifest";
    const manifestPath = "manifest.hbk";
    const manifestBytes = Buffer.from(
      `${stableJson(manifest)}\n`,
      "utf8"
    );
    invariant(
      manifestBytes.length <= manifestSizeLimit(),
      "BACKUP_MANIFEST_TOO_LARGE",
      "Backup manifest exceeded its reviewed size limit."
    );
    onProgress({ step: "manifest" });
    const manifestEncrypted = await encryptReadable({
      readable: Readable.from([manifestBytes]),
      writable:
        await transaction.createWriteStream(manifestPath),
      key,
      backupId,
      artifactId: manifestId
    });
    const manifestArtifact = artifactRecord({
      id: manifestId,
      kind: "encrypted-manifest",
      path: manifestPath,
      encrypted: manifestEncrypted
    });
    const envelope = createEnvelope({
      backupId,
      createdAt: now.toISOString(),
      destinationAdapter: adapter.kind,
      manifestArtifact,
      key
    });
    await transaction.writeJson("envelope.json", envelope);

    onProgress({ step: "verify-before-commit" });
    await readAuthenticatedBackup({
      adapter,
      backupId,
      key,
      verifyArtifacts: true,
      handle: transaction
    });
    const finalPath = await transaction.commit();
    return {
      backupId,
      finalPath,
      totals: manifest.totals
    };
  } catch (error) {
    await transaction.abort();
    throw error;
  }
}

export function createBackupDryRunPlan({
  adapter,
  sourceDatabaseUrl,
  sourceStorageClient,
  environment = process.env
}) {
  const sourceIdentity = assertSupabaseProjectPair({
    databaseUrl: sourceDatabaseUrl,
    supabaseUrl: sourceStorageClient.identity.canonical
  });
  const tools = {
    pgDump:
      environment.HELDAT_PG_DUMP_BIN || "pg_dump",
    pgRestore:
      environment.HELDAT_PG_RESTORE_BIN || "pg_restore",
    psql: environment.HELDAT_PSQL_BIN || "psql"
  };
  return {
    action: "backup",
    destinationAdapter: adapter.kind,
    destinationRoot: adapter.root,
    encrypted: true,
    sourceDatabaseIdentitySha256:
      sourceIdentity.database.sha256,
    sourceProjectRefSha256:
      sourceIdentity.projectRefSha256,
    sourceStorageIdentitySha256:
      sourceIdentity.storage.sha256,
    tools,
    writes: false
  };
}

export function createRestoreDryRunPlan({
  manifest,
  targetDatabaseUrl,
  targetSupabaseUrl
}) {
  validateManifest(manifest);
  return {
    action: "restore",
    backupId: manifest.backupId,
    expectedConfirmation: buildRestoreConfirmation({
      targetDatabaseUrl,
      targetSupabaseUrl
    }),
    privateBuckets: manifest.storage.buckets.length,
    storageObjects: manifest.storage.buckets.reduce(
      (total, bucket) => total + bucket.objects.length,
      0
    ),
    targetDatabaseIdentitySha256:
      parsePostgresIdentity(targetDatabaseUrl).sha256,
    writes: false
  };
}

export async function restoreStorageObject({
  targetStorageClient,
  handle,
  backupId,
  key,
  bucketId,
  object
}) {
  const artifact = object.artifact;
  const fileStat = await handle.stat(artifact.path);
  invariant(
    fileStat.size === artifact.ciphertextBytes,
    "BACKUP_ARTIFACT_SIZE_MISMATCH",
    "Storage artifact size differs from its manifest."
  );
  const plaintext = new PassThrough({
    highWaterMark: 1024 * 1024
  });
  // A Storage implementation may reject before it consumes the readable.
  // Observe that rejection immediately and break any pending backpressure wait.
  plaintext.on("error", () => {});
  let uploadFailure;
  const upload = Promise.resolve()
    .then(() =>
      targetStorageClient.uploadObject({
        bucketId,
        objectName: object.name,
        readable: plaintext,
        contentType: object.contentType,
        contentLength: artifact.plaintextBytes
      })
    )
    .catch((error) => {
      uploadFailure = error;
      plaintext.destroy(error);
    });
  try {
    const decrypted = await decryptReadable({
      readable: handle.createReadStream(artifact.path),
      totalBytes: fileStat.size,
      writable: plaintext,
      key,
      backupId,
      artifactId: artifact.id
    });
    invariant(
      decrypted.plaintextSha256 ===
        artifact.plaintextSha256 &&
        decrypted.plaintextBytes ===
          artifact.plaintextBytes,
      "BACKUP_ARTIFACT_CHECKSUM_MISMATCH",
      "Restored Storage plaintext differs from its manifest."
    );
    await upload;
    if (uploadFailure) {
      throw uploadFailure;
    }
  } catch (error) {
    plaintext.destroy(error);
    await upload;
    throw uploadFailure ?? error;
  }
}

export async function restoreOperatorBackup({
  adapter,
  backupId,
  key,
  targetDatabaseUrl,
  targetStorageClient,
  targetClass,
  confirmation,
  environment = process.env,
  onProgress = () => {},
  databaseOperations = DEFAULT_DATABASE_OPERATIONS
}) {
  onProgress({ step: "offline-verification" });
  const { manifest, handle } =
    await readAuthenticatedBackup({
      adapter,
      backupId,
      key,
      verifyArtifacts: true
    });
  assertNonProductionRestoreTarget({
    manifest,
    targetDatabaseUrl,
    targetSupabaseUrl:
      targetStorageClient.identity.canonical,
    targetClass,
    confirmation
  });
  const restoreToolVersions =
    await databaseOperations.databaseToolVersions(
      environment
    );
  databaseOperations.assertRestoreToolCompatibility(
    manifest.database.toolVersions,
    restoreToolVersions
  );

  onProgress({ step: "database-restore" });
  const dump = manifest.database.dump;
  const dumpStat = await handle.stat(dump.path);
  await databaseOperations.restoreDatabaseEncrypted({
    databaseUrl: targetDatabaseUrl,
    readable: handle.createReadStream(dump.path),
    totalBytes: dumpStat.size,
    key,
    backupId,
    artifact: dump,
    environment
  });

  for (const bucket of manifest.storage.buckets) {
    onProgress({
      step: "storage-bucket",
      bucketId: bucket.id
    });
    await targetStorageClient.ensurePrivateBucket(bucket);
    for (const object of bucket.objects) {
      onProgress({
        step: "storage-object",
        bucketId: bucket.id,
        objectName: object.name
      });
      await restoreStorageObject({
        targetStorageClient,
        handle,
        backupId,
        key,
        bucketId: bucket.id,
        object
      });
    }
  }

  return verifyRestoredTarget({
    manifest,
    targetDatabaseUrl,
    targetStorageClient,
    environment,
    onProgress,
    databaseOperations
  });
}

export async function verifyRestoredTarget({
  manifest,
  targetDatabaseUrl,
  targetStorageClient,
  environment = process.env,
  onProgress = () => {},
  databaseOperations = DEFAULT_DATABASE_OPERATIONS
}) {
  validateManifest(manifest);
  onProgress({ step: "verify-target-schema" });
  const schema =
    await databaseOperations.hashDatabaseSchema({
      databaseUrl: targetDatabaseUrl,
      restrictKey:
        manifest.database.consistency.schemaRestrictKey,
      environment
    });
  invariant(
    schema.canonical.sha256 ===
        manifest.database.schemaFingerprint.sha256 &&
      schema.canonical.bytes ===
        manifest.database.schemaFingerprint.bytes &&
      schema.canonical.format ===
        manifest.database.schemaFingerprint.format,
    "RESTORE_SCHEMA_VERIFICATION_FAILED",
    "Restored database schema fingerprint differs from the source backup."
  );

  onProgress({ step: "verify-target-row-counts" });
  const rowCounts =
    await databaseOperations.captureDatabaseRowCounts({
      databaseUrl: targetDatabaseUrl,
      environment
    });
  const differences = compareRowCounts(
    manifest.database.rowCounts,
    rowCounts
  );
  invariant(
    differences.length === 0,
    "RESTORE_ROW_COUNT_VERIFICATION_FAILED",
    `Restored database row counts differ (${differences.length} table differences).`
  );

  let objectsVerified = 0;
  for (const bucket of manifest.storage.buckets) {
    for (const object of bucket.objects) {
      onProgress({
        step: "verify-target-storage",
        bucketId: bucket.id,
        objectName: object.name
      });
      const download =
        await targetStorageClient.downloadObject(
          bucket.id,
          object.name
        );
      let bytes = 0;
      const hash = createHash("sha256");
      for await (const rawChunk of download.readable) {
        const chunk = Buffer.isBuffer(rawChunk)
          ? rawChunk
          : Buffer.from(rawChunk);
        hash.update(chunk);
        bytes += chunk.length;
      }
      invariant(
        bytes === object.artifact.plaintextBytes &&
          hash.digest("hex") ===
            object.artifact.plaintextSha256,
        "RESTORE_STORAGE_VERIFICATION_FAILED",
        `Restored Storage artifact ${object.artifact.id} differs from its source checksum.`
      );
      objectsVerified += 1;
    }
  }
  return {
    backupId: manifest.backupId,
    databaseTablesVerified: Object.keys(rowCounts).length,
    storageObjectsVerified: objectsVerified,
    verified: true
  };
}

export async function applyRetention({
  adapter,
  key,
  keepCount,
  keepDays,
  now = new Date(),
  execute = false,
  onProgress = () => {}
}) {
  const backups = await adapter.list(key);
  const candidates = selectRetentionCandidates(backups, {
    keepCount,
    keepDays,
    now
  });
  const candidateIds = new Set(
    candidates.map((backup) => backup.backupId)
  );
  const survivors = backups.filter(
    (backup) => !candidateIds.has(backup.backupId)
  );
  for (const survivor of survivors) {
    onProgress({
      step: "retention-verify-survivor",
      backupId: survivor.backupId
    });
    await readAuthenticatedBackup({
      adapter,
      backupId: survivor.backupId,
      key,
      verifyArtifacts: true
    });
  }
  if (execute) {
    for (const backup of candidates) {
      onProgress({
        step: "retention-delete-candidate",
        backupId: backup.backupId
      });
      await adapter.remove(backup.backupId, key);
    }
  }
  return {
    candidates,
    deleted: execute
      ? candidates.map((backup) => backup.backupId)
      : [],
    execute,
    totalCommitted: backups.length,
    verifiedSurvivors: survivors.map(
      (backup) => backup.backupId
    )
  };
}
