import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  canonicalStringify,
  concatBytes,
  encodeUtf8,
  hasOnlyKeys,
  isPlainRecord,
  parseCanonicalJson,
  readUint16,
  readUint32,
  timingSafeHexEqual,
  writeUint16,
  writeUint32
} from "./bytes";
import type {
  CreateRecoveryKitRequest,
  RecoveredAttachment,
  RecoveredKit,
  RecoveryAttachmentSource,
  RecoveryCryptoPort,
  RecoveryKdfParameters,
  RecoveryKitArtifact,
  RecoveryProtectedAttachmentReadPort
} from "./types";
import { RecoveryKitError } from "./types";

export const RECOVERY_KIT_MIME_TYPE =
  "application/vnd.alyr.recovery-kit" as const;
export const RECOVERY_KIT_EXTENSION = ".alyrkit" as const;
export const RECOVERY_KIT_CONTAINER_VERSION = 1 as const;

export const RECOVERY_KIT_LIMITS = Object.freeze({
  maxEncryptedKitBytes: 64 * 1024 * 1024,
  maxPayloadBytes: 48 * 1024 * 1024,
  maxHeaderBytes: 32 * 1024,
  maxManifestBytes: 256 * 1024,
  maxWorkspaceBytes: 8 * 1024 * 1024,
  maxAttachmentCount: 256,
  maxProtectedAttachmentBytes: 10 * 1024 * 1024 + 256,
  maxPlaintextAttachmentBytes: 10 * 1024 * 1024,
  minPassphraseCodePoints: 12,
  maxPassphraseUtf8Bytes: 1024
});

const MAGIC = Uint8Array.of(0x41, 0x4c, 0x59, 0x52, 0x4b, 0x49, 0x54, 0);
const PREAMBLE_BYTES = 18;
const GCM_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
const KDF_SALT_BYTES = 16;
const ATTACHMENT_VAULT_KEY_BYTES = 32;
const AAD_DOMAIN = encodeUtf8("ALYR-RECOVERY-KIT-AAD-V1");
const PROTECTED_ATTACHMENT_FORMAT =
  "expo-aes-gcm-combined-v1" as const;

const DEFAULT_KDF = Object.freeze({
  algorithm: "argon2id" as const,
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
  keyBytes: 32 as const
});

const KDF_LIMITS = Object.freeze({
  minMemoryKiB: 65_536,
  maxMemoryKiB: 262_144,
  minIterations: 3,
  maxIterations: 10,
  minParallelism: 1,
  maxParallelism: 4
});

interface ContainerHeader {
  readonly format: "alyr-recovery-kit";
  readonly containerVersion: 1;
  readonly payloadByteLength: number;
  readonly cipher: {
    readonly algorithm: "aes-256-gcm";
    readonly nonce: string;
    readonly tagBytes: 16;
  };
  readonly kdf: {
    readonly algorithm: "argon2id";
    readonly salt: string;
    readonly memoryKiB: number;
    readonly iterations: number;
    readonly parallelism: number;
    readonly keyBytes: 32;
  };
}

interface ManifestEntry {
  readonly offset: number;
  readonly length: number;
  readonly sha256: string;
}

interface AttachmentManifestEntry extends ManifestEntry {
  readonly id: string;
  readonly evidenceId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly plaintextByteSize: number;
  readonly plaintextChecksumSha256: string | null;
  readonly protectedFormat: typeof PROTECTED_ATTACHMENT_FORMAT;
}

interface RecoveryManifest {
  readonly manifestVersion: 1;
  readonly kitId: string;
  readonly createdAt: string;
  readonly workspace: ManifestEntry & {
    readonly schemaVersion: number;
  };
  readonly attachmentVaultKey: (ManifestEntry & {
    readonly algorithm: "aes-256";
  }) | null;
  readonly attachments: readonly AttachmentManifestEntry[];
}

interface LoadedAttachment {
  readonly source: RecoveryAttachmentSource;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

function invalid(message: string): never {
  throw new RecoveryKitError("INVALID_INPUT", message);
}

function corrupt(message: string): never {
  throw new RecoveryKitError("CORRUPT_CONTAINER", message);
}

function isSafeIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function normalizePassphrase(passphrase: string): Uint8Array {
  if (typeof passphrase !== "string") {
    throw new RecoveryKitError(
      "INVALID_PASSPHRASE",
      "Enter a Recovery Kit passphrase."
    );
  }
  const normalized = passphrase.normalize("NFC");
  const codePoints = Array.from(normalized);
  const bytes = encodeUtf8(normalized);
  if (
    codePoints.length < RECOVERY_KIT_LIMITS.minPassphraseCodePoints ||
    normalized.trim().length === 0
  ) {
    bytes.fill(0);
    throw new RecoveryKitError(
      "INVALID_PASSPHRASE",
      "Use a Recovery Kit passphrase with at least 12 characters."
    );
  }
  if (bytes.byteLength > RECOVERY_KIT_LIMITS.maxPassphraseUtf8Bytes) {
    bytes.fill(0);
    throw new RecoveryKitError(
      "INVALID_PASSPHRASE",
      "The Recovery Kit passphrase is too long."
    );
  }
  return bytes;
}

function assertIsoTimestamp(value: string, source: "input" | "container"): void {
  const valid =
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
  if (!valid) {
    if (source === "container") {
      corrupt("Recovery Kit contains an invalid creation timestamp.");
    }
    invalid("Recovery Kit creation time must be a canonical UTC timestamp.");
  }
}

function assertIdentifier(
  value: unknown,
  label: string,
  source: "input" | "container"
): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
  ) {
    if (source === "container") {
      corrupt(`Recovery Kit contains an invalid ${label}.`);
    }
    invalid(`Recovery Kit ${label} is invalid.`);
  }
}

function assertDisplayFileName(
  value: unknown,
  source: "input" | "container"
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 255 ||
    /[\u0000-\u001f\u007f/\\]/u.test(value) ||
    value === "." ||
    value === ".."
  ) {
    if (source === "container") {
      corrupt("Recovery Kit contains an invalid attachment display name.");
    }
    invalid("Attachment display name is invalid.");
  }
}

function assertMimeType(
  value: unknown,
  source: "input" | "container"
): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/iu.test(
      value
    )
  ) {
    if (source === "container") {
      corrupt("Recovery Kit contains an invalid attachment MIME type.");
    }
    invalid("Attachment MIME type is invalid.");
  }
}

function assertSha256(
  value: unknown,
  allowNull: boolean,
  source: "input" | "container"
): asserts value is string | null {
  if (
    (allowNull && value === null) ||
    (typeof value === "string" && /^[a-f0-9]{64}$/u.test(value))
  ) {
    return;
  }
  if (source === "container") {
    corrupt("Recovery Kit contains invalid checksum metadata.");
  }
  invalid("Attachment checksum metadata is invalid.");
}

async function sha256Bytes(
  crypto: RecoveryCryptoPort,
  value: Uint8Array
): Promise<Uint8Array> {
  let result: Uint8Array;
  try {
    result = await crypto.sha256(value);
  } catch (error) {
    if (error instanceof RecoveryKitError) {
      throw error;
    }
    throw new RecoveryKitError(
      "CRYPTO_UNAVAILABLE",
      "SHA-256 is unavailable for Recovery Kit verification."
    );
  }
  if (!(result instanceof Uint8Array) || result.byteLength !== 32) {
    throw new RecoveryKitError(
      "CRYPTO_UNAVAILABLE",
      "The Recovery Kit SHA-256 provider returned invalid output."
    );
  }
  return result;
}

async function sha256Hex(
  crypto: RecoveryCryptoPort,
  value: Uint8Array
): Promise<string> {
  const digest = await sha256Bytes(crypto, value);
  const hex = bytesToHex(digest);
  digest.fill(0);
  return hex;
}

async function randomExact(
  crypto: RecoveryCryptoPort,
  length: number
): Promise<Uint8Array> {
  let value: Uint8Array;
  try {
    value = await crypto.randomBytes(length);
  } catch (error) {
    if (error instanceof RecoveryKitError) {
      throw error;
    }
    throw new RecoveryKitError(
      "CRYPTO_UNAVAILABLE",
      "Secure random bytes are unavailable for Recovery Kit export."
    );
  }
  if (!(value instanceof Uint8Array) || value.byteLength !== length) {
    throw new RecoveryKitError(
      "CRYPTO_UNAVAILABLE",
      "The Recovery Kit random provider returned invalid output."
    );
  }
  return value;
}

function createPreamble(
  headerByteLength: number,
  ciphertextByteLength: number
): Uint8Array {
  return concatBytes([
    MAGIC,
    writeUint16(RECOVERY_KIT_CONTAINER_VERSION),
    writeUint32(headerByteLength),
    writeUint32(ciphertextByteLength)
  ]);
}

function createAad(
  preamble: Uint8Array,
  headerBytes: Uint8Array
): Uint8Array {
  return concatBytes([AAD_DOMAIN, preamble, headerBytes]);
}

async function deriveKey(
  crypto: RecoveryCryptoPort,
  passphraseBytes: Uint8Array,
  parameters: RecoveryKdfParameters
): Promise<Uint8Array> {
  let key: Uint8Array;
  try {
    key = await crypto.deriveKey(passphraseBytes, parameters);
  } catch (error) {
    if (error instanceof RecoveryKitError) {
      throw error;
    }
    throw new RecoveryKitError(
      "CRYPTO_UNAVAILABLE",
      "A signed build with an audited Argon2id provider is required."
    );
  }
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) {
    throw new RecoveryKitError(
      "CRYPTO_UNAVAILABLE",
      "The Recovery Kit KDF returned an invalid key."
    );
  }
  return key;
}

function validateWorkspaceForExport(
  workspace: unknown,
  schemaVersion: number
): Uint8Array {
  if (!isSafeIntegerInRange(schemaVersion, 1, 0xffff_ffff)) {
    invalid("Workspace schema version is invalid.");
  }
  if (
    !isPlainRecord(workspace) ||
    workspace.schemaVersion !== schemaVersion
  ) {
    invalid("Workspace schema version does not match its snapshot.");
  }
  let bytes: Uint8Array;
  try {
    bytes = encodeUtf8(canonicalStringify(workspace));
  } catch (error) {
    if (error instanceof RecoveryKitError) {
      throw error;
    }
    invalid("Workspace snapshot is not valid JSON.");
  }
  if (bytes.byteLength > RECOVERY_KIT_LIMITS.maxWorkspaceBytes) {
    bytes.fill(0);
    throw new RecoveryKitError(
      "LIMIT_EXCEEDED",
      "Workspace metadata exceeds the 8 MB Recovery Kit limit."
    );
  }
  return bytes;
}

function validateAttachmentSource(
  source: RecoveryAttachmentSource
): void {
  assertIdentifier(source.id, "attachment identifier", "input");
  assertIdentifier(source.evidenceId, "evidence identifier", "input");
  if (
    typeof source.protectedReference !== "string" ||
    source.protectedReference.length < 1 ||
    source.protectedReference.length > 4096
  ) {
    invalid("Attachment protected reference is invalid.");
  }
  assertDisplayFileName(source.fileName, "input");
  assertMimeType(source.mimeType, "input");
  if (
    !isSafeIntegerInRange(
      source.plaintextByteSize,
      0,
      RECOVERY_KIT_LIMITS.maxPlaintextAttachmentBytes
    )
  ) {
    invalid("Attachment plaintext size metadata is invalid.");
  }
  if (
    !isSafeIntegerInRange(
      source.protectedByteSize,
      GCM_NONCE_BYTES + GCM_TAG_BYTES,
      RECOVERY_KIT_LIMITS.maxProtectedAttachmentBytes
    )
  ) {
    invalid("Protected attachment size metadata is invalid.");
  }
  assertSha256(source.plaintextChecksumSha256, true, "input");
}

async function loadAttachments(
  sources: readonly RecoveryAttachmentSource[],
  crypto: RecoveryCryptoPort,
  reader: RecoveryProtectedAttachmentReadPort,
  totalProtectedByteBudget: number
): Promise<readonly LoadedAttachment[]> {
  if (sources.length > RECOVERY_KIT_LIMITS.maxAttachmentCount) {
    throw new RecoveryKitError(
      "LIMIT_EXCEEDED",
      "Recovery Kit supports at most 256 protected attachments."
    );
  }
  const sorted = [...sources].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  );
  const seenIds = new Set<string>();
  const seenEvidenceIds = new Set<string>();
  const loaded: LoadedAttachment[] = [];
  let declaredProtectedBytes = 0;
  for (const source of sorted) {
    validateAttachmentSource(source);
    if (seenIds.has(source.id) || seenEvidenceIds.has(source.evidenceId)) {
      invalid("Recovery Kit attachment identifiers must be unique.");
    }
    seenIds.add(source.id);
    seenEvidenceIds.add(source.evidenceId);
    declaredProtectedBytes += source.protectedByteSize;
    if (declaredProtectedBytes > totalProtectedByteBudget) {
      throw new RecoveryKitError(
        "LIMIT_EXCEEDED",
        "Protected attachments exceed the Recovery Kit in-memory limit."
      );
    }
  }

  seenIds.clear();
  seenEvidenceIds.clear();
  for (const source of sorted) {
    let bytes: Uint8Array;
    try {
      bytes = await reader.readProtectedAttachment(
        source.protectedReference,
        RECOVERY_KIT_LIMITS.maxProtectedAttachmentBytes
      );
    } catch (error) {
      if (error instanceof RecoveryKitError) {
        throw error;
      }
      throw new RecoveryKitError(
        "STORAGE_FAILED",
        "A protected attachment could not be read for export."
      );
    }
    if (!(bytes instanceof Uint8Array)) {
      throw new RecoveryKitError(
        "STORAGE_FAILED",
        "The protected attachment reader returned invalid bytes."
      );
    }
    if (
      bytes.byteLength !== source.protectedByteSize ||
      bytes.byteLength > RECOVERY_KIT_LIMITS.maxProtectedAttachmentBytes
    ) {
      throw new RecoveryKitError(
        "CORRUPT_CONTAINER",
        "A protected attachment does not match its saved size."
      );
    }
    loaded.push({
      source,
      bytes,
      sha256: await sha256Hex(crypto, bytes)
    });
  }
  return loaded;
}

function buildManifest(
  request: CreateRecoveryKitRequest,
  kitId: string,
  workspaceBytes: Uint8Array,
  workspaceSha256: string,
  loadedAttachments: readonly LoadedAttachment[],
  attachmentVaultKeySha256: string | null
): { readonly manifest: RecoveryManifest; readonly dataBytes: Uint8Array } {
  let offset = 0;
  const workspace: RecoveryManifest["workspace"] = {
    schemaVersion: request.workspaceSchemaVersion,
    offset,
    length: workspaceBytes.byteLength,
    sha256: workspaceSha256
  };
  offset += workspaceBytes.byteLength;

  const attachmentVaultKey =
    loadedAttachments.length > 0 && request.attachmentVaultKey
      ? {
          algorithm: "aes-256" as const,
          offset,
          length: request.attachmentVaultKey.byteLength,
          sha256: attachmentVaultKeySha256!
        }
      : null;
  if (attachmentVaultKey) {
    offset += attachmentVaultKey.length;
  }

  const attachments = loadedAttachments.map(({ source, bytes, sha256 }) => {
    const entry: AttachmentManifestEntry = {
      id: source.id,
      evidenceId: source.evidenceId,
      fileName: source.fileName,
      mimeType: source.mimeType,
      plaintextByteSize: source.plaintextByteSize,
      plaintextChecksumSha256: source.plaintextChecksumSha256,
      protectedFormat: PROTECTED_ATTACHMENT_FORMAT,
      offset,
      length: bytes.byteLength,
      sha256
    };
    offset += bytes.byteLength;
    return entry;
  });

  const chunks: Uint8Array[] = [workspaceBytes];
  if (attachmentVaultKey && request.attachmentVaultKey) {
    chunks.push(request.attachmentVaultKey);
  }
  chunks.push(...loadedAttachments.map((item) => item.bytes));

  return {
    manifest: {
      manifestVersion: 1,
      kitId,
      createdAt: request.createdAt,
      workspace,
      attachmentVaultKey,
      attachments
    },
    dataBytes: concatBytes(chunks, offset)
  };
}

/**
 * Creates one authenticated `.alyrkit` in memory. The only bytes handed to a
 * file writer are the final encrypted container; workspace plaintext, vault
 * key, and attachment metadata are never written to a temporary file.
 */
export async function createRecoveryKit(
  request: CreateRecoveryKitRequest,
  passphrase: string,
  crypto: RecoveryCryptoPort,
  attachmentReader: RecoveryProtectedAttachmentReadPort
): Promise<RecoveryKitArtifact> {
  assertIsoTimestamp(request.createdAt, "input");
  const passphraseBytes = normalizePassphrase(passphrase);
  const workspaceBytes = validateWorkspaceForExport(
    request.workspace,
    request.workspaceSchemaVersion
  );
  let payload: Uint8Array | null = null;
  let dataBytes: Uint8Array | null = null;
  let key: Uint8Array | null = null;
  let loadedAttachments: readonly LoadedAttachment[] = [];

  try {
    if (
      request.attachments.length > 0 &&
      (!request.attachmentVaultKey ||
        request.attachmentVaultKey.byteLength !==
          ATTACHMENT_VAULT_KEY_BYTES)
    ) {
      invalid(
        "A 32-byte attachment vault key is required to recover protected attachments."
      );
    }
    if (
      request.attachments.length === 0 &&
      request.attachmentVaultKey !== null &&
      request.attachmentVaultKey.byteLength !==
        ATTACHMENT_VAULT_KEY_BYTES
    ) {
      invalid("Attachment vault key must contain exactly 32 bytes.");
    }

    const [kitIdBytes, salt, nonce] = await Promise.all([
      randomExact(crypto, 16),
      randomExact(crypto, KDF_SALT_BYTES),
      randomExact(crypto, GCM_NONCE_BYTES)
    ]);
    const kitId = bytesToHex(kitIdBytes);
    kitIdBytes.fill(0);
    key = await deriveKey(crypto, passphraseBytes, {
      ...DEFAULT_KDF,
      salt
    });

    const protectedByteBudget =
      RECOVERY_KIT_LIMITS.maxPayloadBytes -
      4 -
      RECOVERY_KIT_LIMITS.maxManifestBytes -
      workspaceBytes.byteLength -
      (request.attachments.length > 0
        ? ATTACHMENT_VAULT_KEY_BYTES
        : 0);
    loadedAttachments = await loadAttachments(
      request.attachments,
      crypto,
      attachmentReader,
      protectedByteBudget
    );

    const workspaceSha256 = await sha256Hex(crypto, workspaceBytes);
    const attachmentVaultKeySha256 =
      loadedAttachments.length > 0 && request.attachmentVaultKey
        ? await sha256Hex(crypto, request.attachmentVaultKey)
        : null;
    const built = buildManifest(
      request,
      kitId,
      workspaceBytes,
      workspaceSha256,
      loadedAttachments,
      attachmentVaultKeySha256
    );
    dataBytes = built.dataBytes;
    const manifestBytes = encodeUtf8(canonicalStringify(built.manifest));
    if (
      manifestBytes.byteLength >
      RECOVERY_KIT_LIMITS.maxManifestBytes
    ) {
      throw new RecoveryKitError(
        "LIMIT_EXCEEDED",
        "Recovery Kit manifest exceeds 256 KB."
      );
    }
    payload = concatBytes([
      writeUint32(manifestBytes.byteLength),
      manifestBytes,
      dataBytes
    ]);
    manifestBytes.fill(0);
    dataBytes.fill(0);
    dataBytes = null;
    loadedAttachments.forEach((attachment) => attachment.bytes.fill(0));
    workspaceBytes.fill(0);
    if (payload.byteLength > RECOVERY_KIT_LIMITS.maxPayloadBytes) {
      throw new RecoveryKitError(
        "LIMIT_EXCEEDED",
        "Recovery Kit payload exceeds the 48 MB in-memory pilot limit."
      );
    }

    const header: ContainerHeader = {
      format: "alyr-recovery-kit",
      containerVersion: 1,
      payloadByteLength: payload.byteLength,
      cipher: {
        algorithm: "aes-256-gcm",
        nonce: bytesToBase64(nonce),
        tagBytes: GCM_TAG_BYTES
      },
      kdf: {
        ...DEFAULT_KDF,
        salt: bytesToBase64(salt)
      }
    };
    const headerBytes = encodeUtf8(canonicalStringify(header));
    if (headerBytes.byteLength > RECOVERY_KIT_LIMITS.maxHeaderBytes) {
      throw new RecoveryKitError(
        "LIMIT_EXCEEDED",
        "Recovery Kit header exceeds its fixed limit."
      );
    }
    const ciphertextLength = payload.byteLength + GCM_TAG_BYTES;
    const preamble = createPreamble(
      headerBytes.byteLength,
      ciphertextLength
    );
    const aad = createAad(preamble, headerBytes);

    let ciphertextAndTag: Uint8Array;
    try {
      ciphertextAndTag = await crypto.sealAes256Gcm({
        plaintext: payload,
        key,
        nonce,
        additionalData: aad
      });
    } catch (error) {
      if (error instanceof RecoveryKitError) {
        throw error;
      }
      throw new RecoveryKitError(
        "CRYPTO_UNAVAILABLE",
        "AES-256-GCM is unavailable for Recovery Kit export."
      );
    }
    if (
      !(ciphertextAndTag instanceof Uint8Array) ||
      ciphertextAndTag.byteLength !== ciphertextLength
    ) {
      throw new RecoveryKitError(
        "CRYPTO_UNAVAILABLE",
        "The Recovery Kit AES-GCM provider returned invalid output."
      );
    }
    const bytes = concatBytes([preamble, headerBytes, ciphertextAndTag]);
    if (bytes.byteLength > RECOVERY_KIT_LIMITS.maxEncryptedKitBytes) {
      bytes.fill(0);
      throw new RecoveryKitError(
        "LIMIT_EXCEEDED",
        "Encrypted Recovery Kit exceeds the 64 MB file limit."
      );
    }
    const checksum = await sha256Hex(crypto, bytes);
    return {
      bytes,
      fileName: `ALYR-Recovery-${request.createdAt.slice(0, 10)}${RECOVERY_KIT_EXTENSION}`,
      mimeType: RECOVERY_KIT_MIME_TYPE,
      byteSize: bytes.byteLength,
      sha256: checksum,
      attachmentCount: loadedAttachments.length
    };
  } finally {
    passphraseBytes.fill(0);
    workspaceBytes.fill(0);
    payload?.fill(0);
    dataBytes?.fill(0);
    loadedAttachments.forEach((attachment) => attachment.bytes.fill(0));
    key?.fill(0);
  }
}

function parseContainerHeader(value: unknown): ContainerHeader {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, [
      "format",
      "containerVersion",
      "payloadByteLength",
      "cipher",
      "kdf"
    ]) ||
    value.format !== "alyr-recovery-kit" ||
    value.containerVersion !== 1 ||
    !isSafeIntegerInRange(
      value.payloadByteLength,
      1,
      RECOVERY_KIT_LIMITS.maxPayloadBytes
    ) ||
    !isPlainRecord(value.cipher) ||
    !hasOnlyKeys(value.cipher, ["algorithm", "nonce", "tagBytes"]) ||
    value.cipher.algorithm !== "aes-256-gcm" ||
    typeof value.cipher.nonce !== "string" ||
    value.cipher.tagBytes !== GCM_TAG_BYTES ||
    !isPlainRecord(value.kdf) ||
    !hasOnlyKeys(value.kdf, [
      "algorithm",
      "salt",
      "memoryKiB",
      "iterations",
      "parallelism",
      "keyBytes"
    ]) ||
    value.kdf.algorithm !== "argon2id" ||
    typeof value.kdf.salt !== "string" ||
    value.kdf.keyBytes !== 32 ||
    !isSafeIntegerInRange(
      value.kdf.memoryKiB,
      KDF_LIMITS.minMemoryKiB,
      KDF_LIMITS.maxMemoryKiB
    ) ||
    !isSafeIntegerInRange(
      value.kdf.iterations,
      KDF_LIMITS.minIterations,
      KDF_LIMITS.maxIterations
    ) ||
    !isSafeIntegerInRange(
      value.kdf.parallelism,
      KDF_LIMITS.minParallelism,
      KDF_LIMITS.maxParallelism
    )
  ) {
    corrupt("Recovery Kit header is invalid or uses unsupported parameters.");
  }
  return value as unknown as ContainerHeader;
}

function parseManifestEntry(
  value: unknown,
  extraKeys: readonly string[]
): ManifestEntry & Record<string, unknown> {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ["offset", "length", "sha256", ...extraKeys]) ||
    !isSafeIntegerInRange(
      value.offset,
      0,
      RECOVERY_KIT_LIMITS.maxPayloadBytes
    ) ||
    !isSafeIntegerInRange(
      value.length,
      0,
      RECOVERY_KIT_LIMITS.maxPayloadBytes
    )
  ) {
    corrupt("Recovery Kit manifest contains an invalid byte range.");
  }
  assertSha256(value.sha256, false, "container");
  return value as ManifestEntry & Record<string, unknown>;
}

function parseManifest(value: unknown): RecoveryManifest {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, [
      "manifestVersion",
      "kitId",
      "createdAt",
      "workspace",
      "attachmentVaultKey",
      "attachments"
    ]) ||
    value.manifestVersion !== 1 ||
    typeof value.kitId !== "string" ||
    !/^[a-f0-9]{32}$/u.test(value.kitId) ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.attachments) ||
    value.attachments.length > RECOVERY_KIT_LIMITS.maxAttachmentCount
  ) {
    corrupt("Recovery Kit manifest is invalid.");
  }
  assertIsoTimestamp(value.createdAt, "container");

  const workspace = parseManifestEntry(value.workspace, [
    "schemaVersion"
  ]);
  if (
    !isSafeIntegerInRange(workspace.schemaVersion, 1, 0xffff_ffff) ||
    workspace.length > RECOVERY_KIT_LIMITS.maxWorkspaceBytes
  ) {
    corrupt("Recovery Kit workspace entry is invalid.");
  }

  let attachmentVaultKey: RecoveryManifest["attachmentVaultKey"] = null;
  if (value.attachmentVaultKey !== null) {
    const parsed = parseManifestEntry(value.attachmentVaultKey, [
      "algorithm"
    ]);
    if (
      parsed.algorithm !== "aes-256" ||
      parsed.length !== ATTACHMENT_VAULT_KEY_BYTES
    ) {
      corrupt("Recovery Kit attachment vault key entry is invalid.");
    }
    attachmentVaultKey = parsed as unknown as NonNullable<
      RecoveryManifest["attachmentVaultKey"]
    >;
  }

  const seenIds = new Set<string>();
  const seenEvidenceIds = new Set<string>();
  let previousId: string | null = null;
  const attachments = value.attachments.map((item) => {
    const parsed = parseManifestEntry(item, [
      "id",
      "evidenceId",
      "fileName",
      "mimeType",
      "plaintextByteSize",
      "plaintextChecksumSha256",
      "protectedFormat"
    ]);
    assertIdentifier(parsed.id, "attachment identifier", "container");
    assertIdentifier(parsed.evidenceId, "evidence identifier", "container");
    assertDisplayFileName(parsed.fileName, "container");
    assertMimeType(parsed.mimeType, "container");
    assertSha256(parsed.plaintextChecksumSha256, true, "container");
    if (
      parsed.protectedFormat !== PROTECTED_ATTACHMENT_FORMAT ||
      !isSafeIntegerInRange(
        parsed.plaintextByteSize,
        0,
        RECOVERY_KIT_LIMITS.maxPlaintextAttachmentBytes
      ) ||
      parsed.length <
        GCM_NONCE_BYTES + GCM_TAG_BYTES ||
      parsed.length > RECOVERY_KIT_LIMITS.maxProtectedAttachmentBytes ||
      seenIds.has(parsed.id) ||
      seenEvidenceIds.has(parsed.evidenceId) ||
      (previousId !== null &&
        previousId >= parsed.id)
    ) {
      corrupt("Recovery Kit protected attachment entry is invalid.");
    }
    seenIds.add(parsed.id);
    seenEvidenceIds.add(parsed.evidenceId);
    previousId = parsed.id;
    return parsed as unknown as AttachmentManifestEntry;
  });

  if (
    (attachments.length > 0 && attachmentVaultKey === null) ||
    (attachments.length === 0 && attachmentVaultKey !== null)
  ) {
    corrupt("Recovery Kit attachment vault metadata is inconsistent.");
  }
  return {
    manifestVersion: 1,
    kitId: value.kitId,
    createdAt: value.createdAt,
    workspace: workspace as unknown as RecoveryManifest["workspace"],
    attachmentVaultKey,
    attachments
  };
}

function assertContiguousRanges(
  manifest: RecoveryManifest,
  dataByteLength: number
): void {
  let expectedOffset = 0;
  const entries: readonly ManifestEntry[] = [
    manifest.workspace,
    ...(manifest.attachmentVaultKey
      ? [manifest.attachmentVaultKey]
      : []),
    ...manifest.attachments
  ];
  for (const entry of entries) {
    if (
      entry.offset !== expectedOffset ||
      entry.length > dataByteLength - entry.offset
    ) {
      corrupt("Recovery Kit manifest contains overlapping or missing bytes.");
    }
    expectedOffset += entry.length;
  }
  if (expectedOffset !== dataByteLength) {
    corrupt("Recovery Kit contains unreferenced payload bytes.");
  }
}

async function verifyEntry(
  crypto: RecoveryCryptoPort,
  data: Uint8Array,
  entry: ManifestEntry
): Promise<Uint8Array> {
  const bytes = data.slice(entry.offset, entry.offset + entry.length);
  const actual = await sha256Hex(crypto, bytes);
  if (!timingSafeHexEqual(actual, entry.sha256)) {
    bytes.fill(0);
    corrupt("Recovery Kit payload checksum verification failed.");
  }
  return bytes;
}

/**
 * Authenticates, decrypts, and verifies one `.alyrkit`. Wrong passphrases and
 * modified ciphertext intentionally share one error code. No result is exposed
 * until every manifest range and SHA-256 checksum has passed.
 */
export async function openRecoveryKit(
  container: Uint8Array,
  passphrase: string,
  crypto: RecoveryCryptoPort
): Promise<RecoveredKit> {
  if (!(container instanceof Uint8Array)) {
    corrupt("Recovery Kit input must be binary data.");
  }
  if (
    container.byteLength < PREAMBLE_BYTES + GCM_TAG_BYTES + 2 ||
    container.byteLength > RECOVERY_KIT_LIMITS.maxEncryptedKitBytes
  ) {
    throw new RecoveryKitError(
      "LIMIT_EXCEEDED",
      "Recovery Kit file is outside the supported 64 MB limit."
    );
  }
  for (let index = 0; index < MAGIC.byteLength; index += 1) {
    if (container[index] !== MAGIC[index]) {
      corrupt("Recovery Kit file signature is invalid.");
    }
  }
  const version = readUint16(container, MAGIC.byteLength);
  if (version !== RECOVERY_KIT_CONTAINER_VERSION) {
    throw new RecoveryKitError(
      "UNSUPPORTED_VERSION",
      "This Recovery Kit version is not supported by this build."
    );
  }
  const headerLength = readUint32(container, MAGIC.byteLength + 2);
  const ciphertextLength = readUint32(container, MAGIC.byteLength + 6);
  if (
    headerLength < 2 ||
    headerLength > RECOVERY_KIT_LIMITS.maxHeaderBytes ||
    ciphertextLength < GCM_TAG_BYTES + 1 ||
    PREAMBLE_BYTES + headerLength + ciphertextLength !==
      container.byteLength
  ) {
    corrupt("Recovery Kit lengths are invalid.");
  }

  const headerBytes = container.slice(
    PREAMBLE_BYTES,
    PREAMBLE_BYTES + headerLength
  );
  const header = parseContainerHeader(parseCanonicalJson(headerBytes));
  if (
    ciphertextLength !== header.payloadByteLength + GCM_TAG_BYTES
  ) {
    corrupt("Recovery Kit encrypted payload length is inconsistent.");
  }
  const salt = base64ToBytes(header.kdf.salt);
  const nonce = base64ToBytes(header.cipher.nonce);
  if (
    salt.byteLength !== KDF_SALT_BYTES ||
    nonce.byteLength !== GCM_NONCE_BYTES
  ) {
    corrupt("Recovery Kit KDF salt or AES-GCM nonce is invalid.");
  }

  const passphraseBytes = normalizePassphrase(passphrase);
  const preamble = container.slice(0, PREAMBLE_BYTES);
  const aad = createAad(preamble, headerBytes);
  const ciphertextAndTag = container.subarray(
    PREAMBLE_BYTES + headerLength
  );
  let key: Uint8Array | null = null;
  let plaintext: Uint8Array | null = null;
  try {
    key = await deriveKey(crypto, passphraseBytes, {
      algorithm: "argon2id",
      salt,
      memoryKiB: header.kdf.memoryKiB,
      iterations: header.kdf.iterations,
      parallelism: header.kdf.parallelism,
      keyBytes: 32
    });
    try {
      plaintext = await crypto.openAes256Gcm({
        ciphertextAndTag,
        key,
        nonce,
        additionalData: aad
      });
    } catch (error) {
      if (
        error instanceof RecoveryKitError &&
        error.code === "CRYPTO_UNAVAILABLE"
      ) {
        throw error;
      }
      throw new RecoveryKitError(
        "AUTHENTICATION_FAILED",
        "Recovery Kit passphrase or authenticated data did not verify."
      );
    }
    if (
      !(plaintext instanceof Uint8Array) ||
      plaintext.byteLength !== header.payloadByteLength
    ) {
      corrupt("Recovery Kit decrypted payload length is invalid.");
    }
    if (plaintext.byteLength < 6) {
      corrupt("Recovery Kit payload is truncated.");
    }

    const manifestLength = readUint32(plaintext, 0);
    if (
      manifestLength < 2 ||
      manifestLength > RECOVERY_KIT_LIMITS.maxManifestBytes ||
      4 + manifestLength > plaintext.byteLength
    ) {
      corrupt("Recovery Kit manifest length is invalid.");
    }
    const manifest = parseManifest(
      parseCanonicalJson(plaintext.slice(4, 4 + manifestLength))
    );
    const data = plaintext.subarray(4 + manifestLength);
    assertContiguousRanges(manifest, data.byteLength);

    const workspaceBytes = await verifyEntry(
      crypto,
      data,
      manifest.workspace
    );
    let workspace: unknown;
    try {
      workspace = parseCanonicalJson(workspaceBytes);
    } finally {
      workspaceBytes.fill(0);
    }
    if (
      !isPlainRecord(workspace) ||
      workspace.schemaVersion !== manifest.workspace.schemaVersion
    ) {
      corrupt("Recovery Kit workspace schema version does not match.");
    }

    const attachmentVaultKey = manifest.attachmentVaultKey
      ? await verifyEntry(crypto, data, manifest.attachmentVaultKey)
      : null;
    const attachments: RecoveredAttachment[] = [];
    try {
      for (const entry of manifest.attachments) {
        const protectedBytes = await verifyEntry(crypto, data, entry);
        attachments.push({
          id: entry.id,
          evidenceId: entry.evidenceId,
          fileName: entry.fileName,
          mimeType: entry.mimeType,
          plaintextByteSize: entry.plaintextByteSize,
          plaintextChecksumSha256: entry.plaintextChecksumSha256,
          protectedFormat: entry.protectedFormat,
          protectedBytes,
          protectedSha256: entry.sha256
        });
      }
    } catch (error) {
      attachmentVaultKey?.fill(0);
      attachments.forEach((attachment) =>
        attachment.protectedBytes.fill(0)
      );
      throw error;
    }

    const containerSha256 = await sha256Hex(crypto, container);
    return {
      kitId: manifest.kitId,
      createdAt: manifest.createdAt,
      workspaceSchemaVersion: manifest.workspace.schemaVersion,
      workspace,
      attachmentVaultKey,
      attachments,
      containerSha256
    };
  } finally {
    passphraseBytes.fill(0);
    key?.fill(0);
    plaintext?.fill(0);
    salt.fill(0);
    nonce.fill(0);
  }
}
