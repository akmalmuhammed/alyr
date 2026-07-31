import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { once } from "node:events";
import {
  createReadStream,
  createWriteStream
} from "node:fs";
import {
  access,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";

export const BACKUP_FORMAT = "heldat-operator-backup";
export const BACKUP_VERSION = 1;
export const ENVELOPE_FORMAT =
  "heldat-operator-backup-envelope";
export const ENCRYPTION_CONTAINER_VERSION = 1;
export const KEY_DERIVATION = "HKDF-SHA256";
export const ENCRYPTION_KEY_ENV =
  "HELDAT_BACKUP_ENCRYPTION_KEY_BASE64";
export const BACKUP_ID_PATTERN =
  /^heldat-backup-\d{8}T\d{6}Z-[0-9a-f]{8}$/u;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const ENCRYPTION_MAGIC = Buffer.from("HLDBK01\n", "ascii");
const HEADER_LENGTH_BYTES = 4;
const AUTH_TAG_BYTES = 16;
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_ENVELOPE_BYTES = 128 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_STORAGE_BUCKETS = 1_000;
const MAX_STORAGE_OBJECTS = 250_000;

export class BackupError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "BackupError";
    this.code = code;
  }
}

export function invariant(condition, code, message) {
  if (!condition) {
    throw new BackupError(code, message);
  }
}

function canonicalize(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    invariant(
      Number.isFinite(value),
      "INVALID_CANONICAL_JSON",
      "Canonical JSON does not accept non-finite numbers."
    );
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  invariant(
    typeof value === "object" && value !== null,
    "INVALID_CANONICAL_JSON",
    "Canonical JSON accepts only JSON-compatible values."
  );
  const entries = [];
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    invariant(
      entry !== undefined,
      "INVALID_CANONICAL_JSON",
      `Canonical JSON property ${key} is undefined.`
    );
    entries.push([key, canonicalize(entry)]);
  }
  // Object.fromEntries uses an own data property for "__proto__" rather
  // than invoking Object.prototype's legacy setter.
  return Object.fromEntries(entries);
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function loadEncryptionKey(environment = process.env) {
  const encoded = environment[ENCRYPTION_KEY_ENV]?.trim();
  invariant(
    encoded,
    "MISSING_ENCRYPTION_KEY",
    `${ENCRYPTION_KEY_ENV} must contain a base64-encoded 32-byte random key.`
  );
  invariant(
    /^[A-Za-z0-9+/]+={0,2}$/u.test(encoded),
    "INVALID_ENCRYPTION_KEY",
    `${ENCRYPTION_KEY_ENV} is not canonical base64.`
  );
  const key = Buffer.from(encoded, "base64");
  invariant(
    key.length === 32 &&
      key.toString("base64") === encoded,
    "INVALID_ENCRYPTION_KEY",
    `${ENCRYPTION_KEY_ENV} must decode to exactly 32 bytes.`
  );
  invariant(
    !key.equals(Buffer.alloc(32)),
    "INVALID_ENCRYPTION_KEY",
    `${ENCRYPTION_KEY_ENV} must be randomly generated, not an all-zero key.`
  );
  return key;
}

export function createBackupId(
  date = new Date(),
  randomSuffix = randomBytes(4).toString("hex")
) {
  invariant(
    date instanceof Date && Number.isFinite(date.getTime()),
    "INVALID_BACKUP_TIME",
    "Backup time must be a valid Date."
  );
  invariant(
    /^[0-9a-f]{8}$/u.test(randomSuffix),
    "INVALID_BACKUP_SUFFIX",
    "Backup suffix must be eight lowercase hexadecimal characters."
  );
  const timestamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/u, "Z");
  return `heldat-backup-${timestamp}-${randomSuffix}`;
}

export function assertBackupId(backupId) {
  invariant(
    typeof backupId === "string" &&
      BACKUP_ID_PATTERN.test(backupId),
    "INVALID_BACKUP_ID",
    "Backup identifier has an unexpected format."
  );
  return backupId;
}

export function assertSafeRelativePath(relativePath) {
  invariant(
    typeof relativePath === "string" &&
      relativePath.length > 0 &&
      relativePath.length <= 1024,
    "INVALID_ARTIFACT_PATH",
    "Artifact path must be a non-empty relative path."
  );
  invariant(
    !relativePath.includes("\\") &&
      !relativePath.includes("\0") &&
      !path.posix.isAbsolute(relativePath) &&
      path.posix.normalize(relativePath) === relativePath &&
      relativePath !== "." &&
      !relativePath.endsWith("/") &&
      !relativePath.startsWith("../") &&
      relativePath !== "..",
    "INVALID_ARTIFACT_PATH",
    "Artifact path is not a canonical POSIX relative path."
  );
  return relativePath;
}

export function assertDestinationOutsideProject(
  destinationRoot,
  projectRoot
) {
  invariant(
    path.isAbsolute(destinationRoot),
    "DESTINATION_NOT_ABSOLUTE",
    "Local backup destination must be an absolute path."
  );
  const destination = path.resolve(destinationRoot);
  const project = path.resolve(projectRoot);
  const relative = path.relative(project, destination);
  const insideProject =
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative));
  const projectRelativeToDestination = path.relative(
    destination,
    project
  );
  const containsProject =
    projectRelativeToDestination === "" ||
    (!projectRelativeToDestination.startsWith(
      `..${path.sep}`
    ) &&
      projectRelativeToDestination !== ".." &&
      !path.isAbsolute(projectRelativeToDestination));
  invariant(
    !insideProject,
    "DESTINATION_INSIDE_PROJECT",
    "Backup destination must be outside the repository."
  );
  invariant(
    !containsProject,
    "DESTINATION_CONTAINS_PROJECT",
    "Backup destination must not contain the repository."
  );
  return destination;
}

async function writeChunk(writable, chunk) {
  if (chunk.length === 0) {
    return;
  }
  if (!writable.write(chunk)) {
    await once(writable, "drain");
  }
}

async function finishWritable(writable) {
  const completions = [once(writable, "finish")];
  if (
    typeof writable.path === "string" ||
    Buffer.isBuffer(writable.path)
  ) {
    completions.push(once(writable, "close"));
  }
  writable.end();
  await Promise.all(completions);
}

function artifactAad(backupId, artifactId) {
  assertBackupId(backupId);
  invariant(
    typeof artifactId === "string" &&
      /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(artifactId),
    "INVALID_ARTIFACT_ID",
    "Artifact identifier contains unsupported characters."
  );
  return Buffer.from(`${backupId}\0${artifactId}`, "utf8");
}

function deriveKey(key, backupId, purpose) {
  invariant(
    Buffer.isBuffer(key) && key.length === 32,
    "INVALID_ENCRYPTION_KEY",
    "Backup cryptography requires a 32-byte master key."
  );
  assertBackupId(backupId);
  invariant(
    typeof purpose === "string" &&
      purpose.length > 0 &&
      purpose.length <= 256,
    "INVALID_KEY_PURPOSE",
    "Backup key-derivation purpose is invalid."
  );
  return Buffer.from(
    hkdfSync(
      "sha256",
      key,
      Buffer.from(backupId, "utf8"),
      Buffer.from(
        `heldat/operator-backup/v1/${purpose}`,
        "utf8"
      ),
      32
    )
  );
}

export async function encryptReadable({
  readable,
  writable,
  key,
  backupId,
  artifactId
}) {
  invariant(
    Buffer.isBuffer(key) && key.length === 32,
    "INVALID_ENCRYPTION_KEY",
    "Encryption requires a 32-byte key."
  );
  const nonce = randomBytes(12);
  const aad = artifactAad(backupId, artifactId);
  const artifactKey = deriveKey(
    key,
    backupId,
    `artifact/${artifactId}`
  );
  const header = Buffer.from(
    stableJson({
      aadSha256: sha256Hex(aad),
      algorithm: "AES-256-GCM",
      artifactId,
      keyDerivation: KEY_DERIVATION,
      nonce: nonce.toString("base64"),
      version: ENCRYPTION_CONTAINER_VERSION
    }),
    "utf8"
  );
  invariant(
    header.length <= MAX_HEADER_BYTES,
    "ENCRYPTION_HEADER_TOO_LARGE",
    "Encryption header exceeded its safety limit."
  );

  const headerLength = Buffer.alloc(HEADER_LENGTH_BYTES);
  headerLength.writeUInt32BE(header.length);
  const prefix = Buffer.concat([
    ENCRYPTION_MAGIC,
    headerLength,
    header
  ]);
  const plaintextHash = createHash("sha256");
  const ciphertextHash = createHash("sha256");
  const cipher = createCipheriv(
    "aes-256-gcm",
    artifactKey,
    nonce
  );
  cipher.setAAD(aad);
  let plaintextBytes = 0;
  let ciphertextBytes = 0;

  try {
    ciphertextHash.update(prefix);
    ciphertextBytes += prefix.length;
    await writeChunk(writable, prefix);

    for await (const rawChunk of readable) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk);
      plaintextHash.update(chunk);
      plaintextBytes += chunk.length;
      const encrypted = cipher.update(chunk);
      ciphertextHash.update(encrypted);
      ciphertextBytes += encrypted.length;
      await writeChunk(writable, encrypted);
    }

    const finalChunk = cipher.final();
    ciphertextHash.update(finalChunk);
    ciphertextBytes += finalChunk.length;
    await writeChunk(writable, finalChunk);

    const tag = cipher.getAuthTag();
    ciphertextHash.update(tag);
    ciphertextBytes += tag.length;
    await writeChunk(writable, tag);
    await finishWritable(writable);
  } catch (error) {
    // The operation already reports a typed failure to its caller. Destroy
    // without re-emitting the same error on a stream that may have no error
    // listener (for example, the verification sink).
    writable.destroy();
    throw new BackupError(
      "ENCRYPTION_FAILED",
      `Encryption failed for artifact ${artifactId}.`,
      error
    );
  }

  return {
    plaintextBytes,
    plaintextSha256: plaintextHash.digest("hex"),
    ciphertextBytes,
    ciphertextSha256: ciphertextHash.digest("hex")
  };
}

class AsyncByteReader {
  constructor(readable) {
    this.iterator = readable[Symbol.asyncIterator]();
    this.buffer = Buffer.alloc(0);
    this.ended = false;
  }

  async fill() {
    if (this.ended) {
      return;
    }
    const next = await this.iterator.next();
    if (next.done) {
      this.ended = true;
      return;
    }
    const chunk = Buffer.isBuffer(next.value)
      ? next.value
      : Buffer.from(next.value);
    this.buffer =
      this.buffer.length === 0
        ? chunk
        : Buffer.concat([this.buffer, chunk]);
  }

  async readExact(length) {
    while (this.buffer.length < length && !this.ended) {
      await this.fill();
    }
    invariant(
      this.buffer.length >= length,
      "TRUNCATED_ENCRYPTED_ARTIFACT",
      "Encrypted artifact ended before the declared container boundary."
    );
    const output = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return output;
  }

  async *readChunks(length) {
    let remaining = length;
    while (remaining > 0) {
      if (this.buffer.length === 0) {
        await this.fill();
      }
      invariant(
        this.buffer.length > 0,
        "TRUNCATED_ENCRYPTED_ARTIFACT",
        "Encrypted artifact ciphertext is truncated."
      );
      const size = Math.min(remaining, this.buffer.length);
      const output = this.buffer.subarray(0, size);
      this.buffer = this.buffer.subarray(size);
      remaining -= size;
      yield output;
    }
  }

  async assertEnd() {
    while (!this.ended) {
      await this.fill();
    }
    invariant(
      this.buffer.length === 0,
      "ENCRYPTED_ARTIFACT_TRAILING_BYTES",
      "Encrypted artifact contains unexpected trailing bytes."
    );
  }
}

export async function decryptReadable({
  readable,
  totalBytes,
  writable,
  key,
  backupId,
  artifactId
}) {
  invariant(
    Number.isSafeInteger(totalBytes) &&
      totalBytes >
        ENCRYPTION_MAGIC.length +
          HEADER_LENGTH_BYTES +
          AUTH_TAG_BYTES,
    "INVALID_ENCRYPTED_ARTIFACT_SIZE",
    "Encrypted artifact size is invalid."
  );
  invariant(
    Buffer.isBuffer(key) && key.length === 32,
    "INVALID_ENCRYPTION_KEY",
    "Decryption requires a 32-byte key."
  );
  const reader = new AsyncByteReader(readable);
  const ciphertextHash = createHash("sha256");
  const plaintextHash = createHash("sha256");
  let plaintextBytes = 0;

  try {
    const magic = await reader.readExact(ENCRYPTION_MAGIC.length);
    ciphertextHash.update(magic);
    invariant(
      magic.equals(ENCRYPTION_MAGIC),
      "INVALID_ENCRYPTION_CONTAINER",
      "Encrypted artifact magic or version is unsupported."
    );
    const headerLengthBytes = await reader.readExact(
      HEADER_LENGTH_BYTES
    );
    ciphertextHash.update(headerLengthBytes);
    const headerLength = headerLengthBytes.readUInt32BE();
    invariant(
      headerLength > 0 && headerLength <= MAX_HEADER_BYTES,
      "INVALID_ENCRYPTION_HEADER",
      "Encrypted artifact header length is invalid."
    );
    const headerBytes = await reader.readExact(headerLength);
    ciphertextHash.update(headerBytes);
    let header;
    try {
      header = JSON.parse(headerBytes.toString("utf8"));
    } catch (error) {
      throw new BackupError(
        "INVALID_ENCRYPTION_HEADER",
        "Encrypted artifact header is not valid JSON.",
        error
      );
    }
    const aad = artifactAad(backupId, artifactId);
    invariant(
      header?.version === ENCRYPTION_CONTAINER_VERSION &&
        header?.algorithm === "AES-256-GCM" &&
        header?.artifactId === artifactId &&
        header?.keyDerivation === KEY_DERIVATION &&
        header?.aadSha256 === sha256Hex(aad) &&
        typeof header?.nonce === "string",
      "INVALID_ENCRYPTION_HEADER",
      "Encrypted artifact header does not match its manifest binding."
    );
    const nonce = Buffer.from(header.nonce, "base64");
    invariant(
      nonce.length === 12 &&
        nonce.toString("base64") === header.nonce,
      "INVALID_ENCRYPTION_HEADER",
      "Encrypted artifact nonce is invalid."
    );

    const ciphertextLength =
      totalBytes -
      ENCRYPTION_MAGIC.length -
      HEADER_LENGTH_BYTES -
      headerLength -
      AUTH_TAG_BYTES;
    invariant(
      ciphertextLength >= 0,
      "INVALID_ENCRYPTED_ARTIFACT_SIZE",
      "Encrypted artifact boundaries are inconsistent."
    );
    const artifactKey = deriveKey(
      key,
      backupId,
      `artifact/${artifactId}`
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      artifactKey,
      nonce
    );
    decipher.setAAD(aad);
    for await (const chunk of reader.readChunks(
      ciphertextLength
    )) {
      ciphertextHash.update(chunk);
      const plaintext = decipher.update(chunk);
      plaintextHash.update(plaintext);
      plaintextBytes += plaintext.length;
      await writeChunk(writable, plaintext);
    }
    const tag = await reader.readExact(AUTH_TAG_BYTES);
    ciphertextHash.update(tag);
    decipher.setAuthTag(tag);
    const finalChunk = decipher.final();
    plaintextHash.update(finalChunk);
    plaintextBytes += finalChunk.length;
    await writeChunk(writable, finalChunk);
    await reader.assertEnd();
    await finishWritable(writable);

    return {
      plaintextBytes,
      plaintextSha256: plaintextHash.digest("hex"),
      ciphertextBytes: totalBytes,
      ciphertextSha256: ciphertextHash.digest("hex")
    };
  } catch (error) {
    writable.destroy();
    if (error instanceof BackupError) {
      throw error;
    }
    throw new BackupError(
      "DECRYPTION_AUTHENTICATION_FAILED",
      `Artifact ${artifactId} failed authenticated decryption.`,
      error
    );
  }
}

export async function hashReadable(readable) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const rawChunk of readable) {
    const chunk = Buffer.isBuffer(rawChunk)
      ? rawChunk
      : Buffer.from(rawChunk);
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest("hex") };
}

export function createEnvelope({
  backupId,
  createdAt,
  manifestArtifact,
  key,
  destinationAdapter = "local-v1"
}) {
  assertBackupId(backupId);
  validateArtifact(manifestArtifact);
  invariant(
    typeof destinationAdapter === "string" &&
      /^[a-z0-9][a-z0-9-]{0,31}-v\d+$/u.test(
        destinationAdapter
      ),
    "INVALID_DESTINATION_ADAPTER",
    "Backup destination adapter identifier is invalid."
  );
  const unsigned = {
    backupId,
    createdAt,
    destinationAdapter,
    encryption: {
      algorithm: "AES-256-GCM",
      containerVersion: ENCRYPTION_CONTAINER_VERSION,
      keyDerivation: KEY_DERIVATION
    },
    format: ENVELOPE_FORMAT,
    manifest: manifestArtifact,
    status: "complete",
    version: BACKUP_VERSION
  };
  const envelopeKey = deriveKey(
    key,
    backupId,
    "envelope-authentication"
  );
  const value = createHmac("sha256", envelopeKey)
    .update(stableJson(unsigned))
    .digest("hex");
  return {
    ...unsigned,
    integrity: {
      algorithm: "HMAC-SHA256",
      value
    }
  };
}

export function verifyEnvelope(envelope, key) {
  invariant(
    envelope?.format === ENVELOPE_FORMAT &&
      envelope?.version === BACKUP_VERSION &&
      envelope?.status === "complete" &&
      envelope?.encryption?.algorithm ===
        "AES-256-GCM" &&
      envelope?.encryption?.containerVersion ===
        ENCRYPTION_CONTAINER_VERSION &&
      envelope?.encryption?.keyDerivation ===
        KEY_DERIVATION &&
      typeof envelope?.destinationAdapter === "string" &&
      /^[a-z0-9][a-z0-9-]{0,31}-v\d+$/u.test(
        envelope.destinationAdapter
      ),
    "INVALID_BACKUP_ENVELOPE",
    "Backup envelope format, version, or completion state is invalid."
  );
  assertBackupId(envelope.backupId);
  invariant(
    Number.isFinite(Date.parse(envelope.createdAt)),
    "INVALID_BACKUP_ENVELOPE",
    "Backup envelope creation time is invalid."
  );
  validateArtifact(envelope.manifest);
  invariant(
    envelope.manifest.id === "manifest" &&
      envelope.manifest.kind ===
        "encrypted-manifest" &&
      envelope.manifest.path === "manifest.hbk",
    "INVALID_BACKUP_ENVELOPE",
    "Backup envelope manifest artifact is invalid."
  );
  invariant(
    envelope?.integrity?.algorithm === "HMAC-SHA256" &&
      SHA256_PATTERN.test(envelope?.integrity?.value ?? ""),
    "INVALID_BACKUP_ENVELOPE",
    "Backup envelope integrity record is invalid."
  );
  const { integrity, ...unsigned } = envelope;
  const envelopeKey = deriveKey(
    key,
    envelope.backupId,
    "envelope-authentication"
  );
  const expected = createHmac("sha256", envelopeKey)
    .update(stableJson(unsigned))
    .digest("hex");
  const supplied = Buffer.from(integrity.value, "hex");
  const calculated = Buffer.from(expected, "hex");
  invariant(
    supplied.length === calculated.length &&
      timingSafeEqual(supplied, calculated),
    "BACKUP_ENVELOPE_AUTHENTICATION_FAILED",
    "Backup envelope authentication failed."
  );
  return envelope;
}

export function validateArtifact(artifact) {
  invariant(
    artifact &&
      typeof artifact.id === "string" &&
      /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(
        artifact.id
      ) &&
      typeof artifact.kind === "string" &&
      artifact.kind.length > 0 &&
      artifact.kind.length <= 128,
    "INVALID_BACKUP_MANIFEST",
    "Backup artifact identity is missing."
  );
  assertSafeRelativePath(artifact.path);
  invariant(
    Number.isSafeInteger(artifact.plaintextBytes) &&
      artifact.plaintextBytes >= 0 &&
      SHA256_PATTERN.test(artifact.plaintextSha256 ?? "") &&
      Number.isSafeInteger(artifact.ciphertextBytes) &&
      artifact.ciphertextBytes > 0 &&
      SHA256_PATTERN.test(artifact.ciphertextSha256 ?? ""),
    "INVALID_BACKUP_MANIFEST",
    `Backup artifact ${artifact.id} has invalid size or checksum metadata.`
  );
  return artifact;
}

export function validateManifest(manifest) {
  invariant(
    manifest?.format === BACKUP_FORMAT &&
      manifest?.version === BACKUP_VERSION,
    "INVALID_BACKUP_MANIFEST",
    "Backup manifest format or version is invalid."
  );
  assertBackupId(manifest.backupId);
  invariant(
    Number.isFinite(Date.parse(manifest.createdAt)) &&
      Number.isFinite(Date.parse(manifest.completedAt)) &&
      Date.parse(manifest.completedAt) >=
        Date.parse(manifest.createdAt),
    "INVALID_BACKUP_MANIFEST",
    "Backup manifest timestamps are invalid."
  );
  invariant(
    manifest?.source &&
      SHA256_PATTERN.test(
        manifest.source.databaseIdentitySha256 ?? ""
      ) &&
      SHA256_PATTERN.test(
        manifest.source.storageIdentitySha256 ?? ""
      ) &&
      SHA256_PATTERN.test(
        manifest.source.projectRefSha256 ?? ""
      ),
    "INVALID_BACKUP_MANIFEST",
    "Backup source identities are invalid."
  );
  validateArtifact(manifest?.database?.dump);
  validateArtifact(manifest?.database?.schema);
  invariant(
    manifest?.database?.rowCounts &&
      typeof manifest.database.rowCounts === "object" &&
      !Array.isArray(manifest.database.rowCounts) &&
      Object.entries(
        manifest.database.rowCounts
      ).every(
        ([tableName, count]) =>
          tableName.length > 0 &&
          tableName.length <= 256 &&
          /^\d+$/u.test(count)
      ),
    "INVALID_BACKUP_MANIFEST",
    "Database row-count verification data is invalid."
  );
  invariant(
    manifest?.database?.toolVersions &&
      ["pgDump", "pgRestore", "psql"].every(
        (name) =>
          typeof manifest.database.toolVersions[name] ===
            "string" &&
          manifest.database.toolVersions[name].length > 0 &&
          manifest.database.toolVersions[name].length <=
            1_024
      ),
    "INVALID_BACKUP_MANIFEST",
    "Database tool-version metadata is invalid."
  );
  invariant(
    manifest?.database?.schemaFingerprint?.format ===
        "pg-dump-schema-canonical-v1" &&
      Number.isSafeInteger(
        manifest.database.schemaFingerprint.bytes
      ) &&
      manifest.database.schemaFingerprint.bytes >= 0 &&
      SHA256_PATTERN.test(
        manifest.database.schemaFingerprint.sha256 ??
          ""
      ),
    "INVALID_BACKUP_MANIFEST",
    "Canonical database schema fingerprint is invalid."
  );
  invariant(
    manifest?.database?.consistency?.mode ===
        "boundary-verified-sequential-v1" &&
      manifest.database.consistency
        .boundaryRowCountsMatched === true &&
      manifest.database.consistency
        .boundarySchemaMatched === true &&
      typeof manifest.database.consistency
        .schemaRestrictKey === "string" &&
      /^[A-Za-z0-9]{32,128}$/u.test(
        manifest.database.consistency
          .schemaRestrictKey
      ),
    "INVALID_BACKUP_MANIFEST",
    "Database capture-consistency evidence is invalid."
  );
  invariant(
    Array.isArray(manifest?.storage?.buckets) &&
      manifest.storage.buckets.length <=
        MAX_STORAGE_BUCKETS,
    "INVALID_BACKUP_MANIFEST",
    "Storage bucket manifest is missing."
  );
  invariant(
    manifest.database.dump.kind ===
        "postgres-custom-dump" &&
      manifest.database.schema.kind ===
        "postgres-schema-sql" &&
      manifest.database.dump.path !==
        manifest.database.schema.path,
    "INVALID_BACKUP_MANIFEST",
    "Database backup artifacts are invalid."
  );
  const paths = new Set([
    manifest.database.dump.path,
    manifest.database.schema.path
  ]);
  const artifactIds = new Set([
    manifest.database.dump.id,
    manifest.database.schema.id
  ]);
  invariant(
    artifactIds.size === 2,
    "INVALID_BACKUP_MANIFEST",
    "Database backup artifact identifiers must be unique."
  );
  const bucketIds = new Set();
  let storageObjectCount = 0;
  for (const bucket of manifest.storage.buckets) {
    invariant(
      typeof bucket?.id === "string" &&
        bucket.id.length > 0 &&
        bucket.id.length <= 256 &&
        !bucket.id.includes("\0") &&
        typeof bucket.name === "string" &&
        bucket.name.length > 0 &&
        bucket.name.length <= 256 &&
        !bucket.name.includes("\0") &&
        bucket.public === false &&
        Array.isArray(bucket.objects) &&
        (bucket.fileSizeLimit === null ||
          (Number.isSafeInteger(bucket.fileSizeLimit) &&
            bucket.fileSizeLimit >= 0)) &&
        (bucket.allowedMimeTypes === null ||
          (Array.isArray(bucket.allowedMimeTypes) &&
            bucket.allowedMimeTypes.every(
              (value) =>
                typeof value === "string" &&
                value.length > 0 &&
                value.length <= 256 &&
                /^[\x20-\x7e]+$/u.test(value)
            ))),
      "INVALID_BACKUP_MANIFEST",
      "Only explicitly private Storage buckets are accepted."
    );
    invariant(
      !bucketIds.has(bucket.id),
      "INVALID_BACKUP_MANIFEST",
      "Backup manifest contains duplicate Storage buckets."
    );
    bucketIds.add(bucket.id);
    const objectNames = new Set();
    for (const object of bucket.objects) {
      invariant(
        typeof object?.name === "string" &&
          object.name.length > 0 &&
          object.name.length <= 1_024 &&
          !object.name.includes("\0") &&
          typeof object.contentType === "string" &&
          object.contentType.length > 0 &&
          object.contentType.length <= 256 &&
          /^[\x20-\x7e]+$/u.test(
            object.contentType
          ) &&
          (object.updatedAt === null ||
            (typeof object.updatedAt === "string" &&
              Number.isFinite(
                Date.parse(object.updatedAt)
              ))),
        "INVALID_BACKUP_MANIFEST",
        "Storage object metadata is invalid."
      );
      validateArtifact(object.artifact);
      invariant(
        object.artifact.kind ===
            "supabase-storage-object" &&
          !paths.has(object.artifact.path) &&
          !artifactIds.has(object.artifact.id) &&
          !objectNames.has(object.name),
        "INVALID_BACKUP_MANIFEST",
        "Backup manifest contains duplicate Storage names, artifact paths, or identifiers."
      );
      paths.add(object.artifact.path);
      artifactIds.add(object.artifact.id);
      objectNames.add(object.name);
      storageObjectCount += 1;
      invariant(
        storageObjectCount <= MAX_STORAGE_OBJECTS,
        "INVALID_BACKUP_MANIFEST",
        "Backup manifest exceeds the reviewed Storage object limit."
      );
    }
  }
  invariant(
    manifest?.totals?.privateBuckets ===
        manifest.storage.buckets.length &&
      manifest?.totals?.storageObjects ===
        storageObjectCount,
    "INVALID_BACKUP_MANIFEST",
    "Backup manifest totals do not match its contents."
  );
  return manifest;
}

export function manifestArtifacts(manifest) {
  validateManifest(manifest);
  return [
    manifest.database.dump,
    manifest.database.schema,
    ...manifest.storage.buckets.flatMap((bucket) =>
      bucket.objects.map((object) => object.artifact)
    )
  ];
}

export function parsePostgresIdentity(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch (error) {
    throw new BackupError(
      "INVALID_DATABASE_URL",
      "Database URL is invalid.",
      error
    );
  }
  invariant(
    ["postgres:", "postgresql:"].includes(parsed.protocol) &&
      parsed.hostname &&
      parsed.pathname.length > 1,
    "INVALID_DATABASE_URL",
    "Database URL must use postgres:// or postgresql:// and include a database."
  );
  const port = parsed.port || "5432";
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const username = decodeURIComponent(parsed.username);
  const directMatch = parsed.hostname
    .toLowerCase()
    .match(
      /^db\.([a-z0-9]{8,32})\.supabase\.co$/u
    );
  const poolerMatch =
    parsed.hostname
      .toLowerCase()
      .endsWith(".pooler.supabase.com")
      ? username.match(
          /^postgres\.([a-z0-9]{8,32})$/u
        )
      : null;
  invariant(
    !directMatch ||
      !poolerMatch ||
      directMatch[1] === poolerMatch[1],
    "DATABASE_PROJECT_IDENTITY_MISMATCH",
    "Database host and username identify different Supabase projects."
  );
  const projectRef =
    directMatch?.[1] ?? poolerMatch?.[1] ?? null;
  const canonical =
    `${parsed.hostname.toLowerCase()}:${port}/${database}` +
    (projectRef ? `#project=${projectRef}` : "");
  return {
    canonical,
    projectRef,
    sha256: sha256Hex(canonical)
  };
}

export function parseSupabaseIdentity(supabaseUrl) {
  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch (error) {
    throw new BackupError(
      "INVALID_SUPABASE_URL",
      "Supabase URL is invalid.",
      error
    );
  }
  invariant(
    parsed.protocol === "https:" &&
      parsed.hostname &&
      (parsed.pathname === "/" || parsed.pathname === "") &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash,
    "INVALID_SUPABASE_URL",
    "Supabase URL must be an origin-only HTTPS URL."
  );
  const canonical = parsed.origin.toLowerCase();
  const projectMatch = parsed.hostname
    .toLowerCase()
    .match(/^([a-z0-9]{8,32})\.supabase\.co$/u);
  return {
    canonical,
    projectRef: projectMatch?.[1] ?? null,
    sha256: sha256Hex(canonical)
  };
}

export function assertSupabaseProjectPair({
  databaseUrl,
  supabaseUrl
}) {
  const database = parsePostgresIdentity(databaseUrl);
  const storage = parseSupabaseIdentity(supabaseUrl);
  invariant(
    database.projectRef &&
      storage.projectRef &&
      database.projectRef === storage.projectRef,
    "SUPABASE_PROJECT_IDENTITY_MISMATCH",
    "Database and Storage endpoints must expose the same standard Supabase project reference."
  );
  return {
    database,
    storage,
    projectRefSha256: sha256Hex(storage.projectRef)
  };
}

export function buildRestoreConfirmation({
  targetDatabaseUrl,
  targetSupabaseUrl
}) {
  const {
    database,
    storage,
    projectRefSha256
  } = assertSupabaseProjectPair({
    databaseUrl: targetDatabaseUrl,
    supabaseUrl: targetSupabaseUrl
  });
  const fingerprint = sha256Hex(
    `${database.sha256}\0${storage.sha256}\0${projectRefSha256}`
  ).slice(0, 16);
  return `non-production:${fingerprint}`;
}

export function assertNonProductionRestoreTarget({
  manifest,
  targetDatabaseUrl,
  targetSupabaseUrl,
  targetClass,
  confirmation
}) {
  validateManifest(manifest);
  const {
    database,
    storage,
    projectRefSha256
  } = assertSupabaseProjectPair({
    databaseUrl: targetDatabaseUrl,
    supabaseUrl: targetSupabaseUrl
  });
  invariant(
    database.sha256 !==
      manifest.source.databaseIdentitySha256 &&
      storage.sha256 !==
        manifest.source.storageIdentitySha256 &&
      projectRefSha256 !==
        manifest.source.projectRefSha256,
    "RESTORE_TARGET_MATCHES_SOURCE",
    "Restore target matches the backup source and is blocked."
  );
  invariant(
    targetClass === "non-production",
    "RESTORE_TARGET_NOT_CLASSIFIED",
    "HELDAT_RESTORE_TARGET_CLASS must equal non-production."
  );
  const expected = buildRestoreConfirmation({
    targetDatabaseUrl,
    targetSupabaseUrl
  });
  invariant(
    confirmation === expected,
    "RESTORE_CONFIRMATION_MISMATCH",
    `Restore confirmation mismatch. Review the dry-run plan and supply --confirm-target ${expected}.`
  );
  return {
    databaseIdentitySha256: database.sha256,
    projectRefSha256,
    storageIdentitySha256: storage.sha256,
    confirmation: expected
  };
}

export function selectRetentionCandidates(
  backups,
  {
    keepCount,
    keepDays,
    now = new Date()
  }
) {
  invariant(
    Number.isInteger(keepCount) && keepCount >= 1,
    "INVALID_RETENTION_POLICY",
    "Retention keep-count must be at least one."
  );
  invariant(
    Number.isInteger(keepDays) && keepDays >= 1,
    "INVALID_RETENTION_POLICY",
    "Retention days must be at least one."
  );
  const cutoff =
    now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  const sorted = [...backups].sort(
    (left, right) =>
      Date.parse(right.createdAt) -
      Date.parse(left.createdAt)
  );
  return sorted.filter((backup, index) => {
    if (index < keepCount) {
      return false;
    }
    return Date.parse(backup.createdAt) < cutoff;
  });
}

class LocalBackupHandle {
  constructor(basePath) {
    this.basePath = basePath;
  }

  resolve(relativePath) {
    const safe = assertSafeRelativePath(relativePath);
    const resolved = path.resolve(
      this.basePath,
      ...safe.split("/")
    );
    const relative = path.relative(this.basePath, resolved);
    invariant(
      relative &&
        !relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative),
      "ARTIFACT_PATH_ESCAPE",
      "Artifact path escaped the backup directory."
    );
    return resolved;
  }

  async createWriteStream(relativePath) {
    const resolved = this.resolve(relativePath);
    await mkdir(path.dirname(resolved), {
      recursive: true,
      mode: 0o700
    });
    return createWriteStream(resolved, {
      flags: "wx",
      mode: 0o600
    });
  }

  createReadStream(relativePath) {
    return createReadStream(this.resolve(relativePath));
  }

  async stat(relativePath) {
    return stat(this.resolve(relativePath));
  }

  async readJson(relativePath, maxBytes = MAX_ENVELOPE_BYTES) {
    const filePath = this.resolve(relativePath);
    const fileStat = await stat(filePath);
    invariant(
      fileStat.isFile() && fileStat.size <= maxBytes,
      "INVALID_JSON_ARTIFACT",
      "JSON artifact exceeds its size limit or is not a file."
    );
    let parsed;
    try {
      parsed = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      throw new BackupError(
        "INVALID_JSON_ARTIFACT",
        "JSON artifact could not be parsed.",
        error
      );
    }
    return parsed;
  }

  async writeJson(relativePath, value) {
    const resolved = this.resolve(relativePath);
    await mkdir(path.dirname(resolved), {
      recursive: true,
      mode: 0o700
    });
    await writeFile(
      resolved,
      `${stableJson(value)}\n`,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      }
    );
  }
}

async function syncFileTree(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true
  });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await syncFileTree(entryPath);
      continue;
    }
    invariant(
      entry.isFile(),
      "BACKUP_DESTINATION_ENTRY_INVALID",
      "Backup staging contains an unsupported filesystem entry."
    );
    const handle = await open(entryPath, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  if (process.platform !== "win32") {
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  }
}

/**
 * Destination adapter contract, version 1:
 * - begin(backupId) -> transactional handle with createWriteStream,
 *   createReadStream, stat, readJson, writeJson, commit and abort.
 * - open(backupId) -> immutable read handle.
 * - list() -> authenticated/validated envelope candidates.
 * - remove(backupId) -> delete exactly one committed backup.
 *
 * An R2/S3 adapter must preserve these atomic-commit semantics using a
 * completion marker written last, reject traversal, and expose exact sizes.
 */
export class LocalDestinationAdapter {
  constructor({ destinationRoot, projectRoot }) {
    this.kind = "local-v1";
    this.projectRoot = path.resolve(projectRoot);
    this.root = assertDestinationOutsideProject(
      destinationRoot,
      this.projectRoot
    );
  }

  async initialize({ create = false } = {}) {
    if (create) {
      await mkdir(this.root, {
        recursive: true,
        mode: 0o700
      });
    }
    let destinationRealPath;
    let projectRealPath;
    try {
      [destinationRealPath, projectRealPath] =
        await Promise.all([
          realpath(this.root),
          realpath(this.projectRoot)
        ]);
    } catch (error) {
      throw new BackupError(
        "BACKUP_DESTINATION_NOT_FOUND",
        "Backup destination or project root does not exist.",
        error
      );
    }
    this.root = assertDestinationOutsideProject(
      destinationRealPath,
      projectRealPath
    );
    return this;
  }

  async begin(backupId) {
    assertBackupId(backupId);
    await this.initialize({ create: true });
    const finalPath = path.join(this.root, backupId);
    try {
      await access(finalPath);
      throw new BackupError(
        "BACKUP_ALREADY_EXISTS",
        "Backup identifier already exists at the destination."
      );
    } catch (error) {
      if (
        error instanceof BackupError ||
        (error && error.code !== "ENOENT")
      ) {
        throw error;
      }
    }
    const stagingName = `.partial-${backupId}-${randomBytes(4).toString("hex")}`;
    const stagingPath = path.join(this.root, stagingName);
    await mkdir(stagingPath, { mode: 0o700 });
    const handle = new LocalBackupHandle(stagingPath);
    let closed = false;
    return Object.assign(handle, {
      async commit() {
        invariant(
          !closed,
          "BACKUP_TRANSACTION_CLOSED",
          "Backup transaction is already closed."
        );
        await syncFileTree(stagingPath);
        await rename(stagingPath, finalPath);
        if (process.platform !== "win32") {
          try {
            const rootHandle = await open(
              path.dirname(finalPath),
              "r"
            );
            try {
              await rootHandle.sync();
            } finally {
              await rootHandle.close();
            }
          } catch (error) {
            try {
              await rm(finalPath, {
                recursive: true,
                force: false
              });
            } catch (rollbackError) {
              closed = true;
              throw new BackupError(
                "BACKUP_COMMIT_INDETERMINATE",
                "Backup rename completed, but destination durability and rollback both failed. Quarantine the destination and verify it manually.",
                new AggregateError([
                  error,
                  rollbackError
                ])
              );
            }
            closed = true;
            throw new BackupError(
              "BACKUP_COMMIT_DURABILITY_FAILED",
              "Backup commit was rolled back because the destination directory could not be flushed.",
              error
            );
          }
        }
        closed = true;
        return finalPath;
      },
      async abort() {
        if (!closed) {
          await rm(stagingPath, {
            recursive: true,
            force: true
          });
          closed = true;
        }
      }
    });
  }

  async open(backupId) {
    assertBackupId(backupId);
    await this.initialize();
    const basePath = path.join(this.root, backupId);
    const entry = await stat(basePath);
    invariant(
      entry.isDirectory(),
      "BACKUP_NOT_FOUND",
      "Backup directory is missing."
    );
    return new LocalBackupHandle(basePath);
  }

  async list(key) {
    invariant(
      Buffer.isBuffer(key) && key.length === 32,
      "INVALID_ENCRYPTION_KEY",
      "Listing committed backups requires the encryption key."
    );
    await this.initialize();
    const entries = await readdir(this.root, {
      withFileTypes: true
    });
    const backups = [];
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        !BACKUP_ID_PATTERN.test(entry.name)
      ) {
        continue;
      }
      const handle = await this.open(entry.name);
      const envelope = await handle.readJson("envelope.json");
      verifyEnvelope(envelope, key);
      invariant(
        envelope.backupId === entry.name,
        "INVALID_BACKUP_ENVELOPE",
        "Backup directory and authenticated envelope identifiers differ."
      );
      backups.push({
        backupId: entry.name,
        createdAt: envelope.createdAt
      });
    }
    return backups;
  }

  async remove(backupId, key) {
    assertBackupId(backupId);
    const handle = await this.open(backupId);
    const envelope = await handle.readJson("envelope.json");
    verifyEnvelope(envelope, key);
    invariant(
      envelope?.backupId === backupId &&
        envelope?.status === "complete",
      "INVALID_BACKUP_ENVELOPE",
      "Retention only removes completed backup directories."
    );
    await rm(path.join(this.root, backupId), {
      recursive: true,
      force: false
    });
  }
}

export function parseDestinationSpec(spec, projectRoot) {
  invariant(
    typeof spec === "string" && spec.length > 0,
    "MISSING_DESTINATION",
    "Supply --destination local:<absolute-path> or HELDAT_BACKUP_DESTINATION."
  );
  if (spec.startsWith("local:")) {
    const destinationRoot = spec.slice("local:".length);
    return new LocalDestinationAdapter({
      destinationRoot,
      projectRoot
    });
  }
  if (
    spec.startsWith("s3://") ||
    spec.startsWith("r2://")
  ) {
    throw new BackupError(
      "DESTINATION_ADAPTER_NOT_INSTALLED",
      "R2/S3 destination requested, but only the versioned adapter contract is installed. Configure a reviewed adapter before use."
    );
  }
  throw new BackupError(
    "UNSUPPORTED_DESTINATION",
    "Destination must use an explicit local:, s3://, or r2:// adapter prefix."
  );
}

export function manifestSizeLimit() {
  return MAX_MANIFEST_BYTES;
}
