/**
 * Production-oriented client security primitives.
 *
 * This module is deliberately transport- and UI-agnostic. It provides a
 * browser-compatible contract for memory-only sessions, client-side envelope
 * encryption, upload integrity, safe preview decisions, permission hints, and
 * privacy-scrubbed audit history.
 *
 * It is not a backend, identity provider, malware scanner, or authorization
 * boundary. A production service must authenticate every request, enforce every
 * grant, durably acknowledge encrypted objects, and produce its own audit log.
 */

export const VAULT_ENVELOPE_VERSION = 1;
export const UPLOAD_MANIFEST_VERSION = 1;
export const AUDIT_EVENT_VERSION = 1;
export const DEFAULT_PBKDF2_ITERATIONS = 310_000;
export const MIN_PBKDF2_ITERATIONS = 100_000;
export const MAX_PBKDF2_ITERATIONS = 2_000_000;
export const MAX_VAULT_PLAINTEXT_BYTES = 100 * 1024 * 1024;

const AES_KEY_BITS = 256;
const AES_GCM_IV_BYTES = 12;
const PBKDF2_SALT_BYTES = 16;
const INTERNAL_PACKAGE_MAGIC = new TextEncoder().encode("ALYR01");
const INTERNAL_CHECKSUM_BYTES = 32;
const INTERNAL_LENGTH_BYTES = 8;
const AES_GCM_TAG_BYTES = 16;
const INTERNAL_PACKAGE_OVERHEAD_BYTES =
  INTERNAL_PACKAGE_MAGIC.length +
  INTERNAL_CHECKSUM_BYTES +
  INTERNAL_LENGTH_BYTES +
  AES_GCM_TAG_BYTES;
const MIN_STRING_SECRET_LENGTH = 12;
const MIN_BINARY_SECRET_BYTES = 16;

const INLINE_RASTER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const GENERATED_PREVIEW_TYPES = new Set([
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "video/mp4",
  "video/webm",
]);

const ACTIVE_CONTENT_TYPES = new Set([
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
  "application/xml",
  "text/xml",
]);

const AUDIT_METADATA_ALLOWLIST = new Set([
  "blobId",
  "conflictId",
  "deviceId",
  "operationId",
  "reasonCode",
  "recordVersion",
  "resultCode",
  "sessionAssurance",
]);

export const PERMISSION_CAPABILITIES = Object.freeze({
  READ_RECORD: "record:read",
  WRITE_RECORD: "record:write",
  READ_EVIDENCE: "evidence:read",
  UPLOAD_EVIDENCE: "evidence:upload",
  DOWNLOAD_ORIGINAL: "evidence:download-original",
  MANAGE_MEMBERS: "member:manage",
  MANAGE_GRANTS: "grant:manage",
  EXPORT: "vault:export",
  DELETE: "vault:delete",
});

export const SENSITIVE_FIELD_GROUPS = Object.freeze([
  "location",
  "value",
  "ownership",
  "legal-documents",
  "private-stories",
  "financial-references",
  "export",
]);

const ROLE_CAPABILITIES = Object.freeze({
  owner: new Set(Object.values(PERMISSION_CAPABILITIES)),
  admin: new Set([
    PERMISSION_CAPABILITIES.READ_RECORD,
    PERMISSION_CAPABILITIES.WRITE_RECORD,
    PERMISSION_CAPABILITIES.READ_EVIDENCE,
    PERMISSION_CAPABILITIES.UPLOAD_EVIDENCE,
    PERMISSION_CAPABILITIES.DOWNLOAD_ORIGINAL,
    PERMISSION_CAPABILITIES.MANAGE_MEMBERS,
    PERMISSION_CAPABILITIES.MANAGE_GRANTS,
    PERMISSION_CAPABILITIES.EXPORT,
  ]),
  editor: new Set([
    PERMISSION_CAPABILITIES.READ_RECORD,
    PERMISSION_CAPABILITIES.WRITE_RECORD,
    PERMISSION_CAPABILITIES.READ_EVIDENCE,
    PERMISSION_CAPABILITIES.UPLOAD_EVIDENCE,
    PERMISSION_CAPABILITIES.DOWNLOAD_ORIGINAL,
  ]),
  contributor: new Set([
    PERMISSION_CAPABILITIES.READ_RECORD,
    PERMISSION_CAPABILITIES.WRITE_RECORD,
    PERMISSION_CAPABILITIES.READ_EVIDENCE,
    PERMISSION_CAPABILITIES.UPLOAD_EVIDENCE,
  ]),
  viewer: new Set([
    PERMISSION_CAPABILITIES.READ_RECORD,
    PERMISSION_CAPABILITIES.READ_EVIDENCE,
  ]),
});

export class VaultSecurityError extends Error {
  constructor(message, code = "VAULT_SECURITY_ERROR") {
    super(message);
    this.name = "VaultSecurityError";
    this.code = code;
  }
}

export class SessionRequiredError extends VaultSecurityError {
  constructor(message = "Sign in again to continue.") {
    super(message, "SESSION_REQUIRED");
    this.name = "SessionRequiredError";
  }
}

export class PermissionDeniedError extends VaultSecurityError {
  constructor(message = "This action is not available with your current access.") {
    super(message, "PERMISSION_DENIED");
    this.name = "PermissionDeniedError";
  }
}

export class IntegrityError extends VaultSecurityError {
  constructor(message = "The encrypted item did not pass integrity validation.") {
    super(message, "INTEGRITY_FAILED");
    this.name = "IntegrityError";
  }
}

function requireCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== "function") {
    throw new VaultSecurityError(
      "Web Crypto is required for encrypted vault operations.",
      "WEB_CRYPTO_UNAVAILABLE",
    );
  }
  return cryptoApi;
}

function requireNonEmptyString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new TypeError(`${fieldName} is required.`);
  }
  return normalized;
}

function normalizeIsoDate(value, fieldName) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${fieldName} must be an ISO date.`);
  }
  return date.toISOString();
}

function nowIso(now) {
  return normalizeIsoDate(
    typeof now === "function" ? now() : now || new Date().toISOString(),
    "now",
  );
}

function clonePlain(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  requireCrypto().getRandomValues(bytes);
  return bytes;
}

export function createOpaqueId(prefix = "id") {
  const cryptoApi = requireCrypto();
  if (typeof cryptoApi.randomUUID === "function") {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  return `${prefix}-${bytesToHex(randomBytes(16))}`;
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input).toString("base64");
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < input.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...input.subarray(offset, Math.min(input.length, offset + chunkSize)),
    );
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(value) {
  const normalized = requireNonEmptyString(value, "base64 value");
  try {
    if (typeof Buffer !== "undefined") {
      const decoded = Buffer.from(normalized, "base64");
      if (
        decoded.length === 0 ||
        decoded.toString("base64").replace(/=+$/u, "") !==
          normalized.replace(/=+$/u, "")
      ) {
        throw new Error("Invalid base64.");
      }
      return new Uint8Array(decoded);
    }
    const binary = globalThis.atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new IntegrityError("Encrypted data is malformed.");
  }
}

function concatenateBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

async function valueToBytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }
  if (value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  throw new TypeError(
    "Vault content must be a Blob, string, ArrayBuffer, or typed array.",
  );
}

function normalizeSecret(secret) {
  if (typeof secret === "string") {
    if (secret.length < MIN_STRING_SECRET_LENGTH) {
      throw new VaultSecurityError(
        "The wrapping secret must contain at least 12 characters.",
        "WRAPPING_SECRET_TOO_WEAK",
      );
    }
    return new TextEncoder().encode(secret);
  }
  if (secret instanceof Uint8Array && secret.byteLength >= MIN_BINARY_SECRET_BYTES) {
    return new Uint8Array(secret);
  }
  throw new VaultSecurityError(
    "Use a high-entropy recovery secret or a passphrase of at least 12 characters.",
    "WRAPPING_SECRET_TOO_WEAK",
  );
}

function encodeUint64(value) {
  const numeric = BigInt(value);
  const bytes = new Uint8Array(INTERNAL_LENGTH_BYTES);
  new DataView(bytes.buffer).setBigUint64(0, numeric, false);
  return bytes;
}

function decodeUint64(bytes) {
  const value = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getBigUint64(0, false);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new IntegrityError();
  }
  return Number(value);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

export function canonicalJson(value) {
  function normalize(input) {
    if (input === null || typeof input !== "object") {
      if (
        typeof input === "number" &&
        (!Number.isFinite(input) || Number.isNaN(input))
      ) {
        throw new TypeError("Canonical JSON cannot contain non-finite numbers.");
      }
      if (
        typeof input === "string" ||
        typeof input === "number" ||
        typeof input === "boolean" ||
        input === null
      ) {
        return input;
      }
      throw new TypeError("Canonical JSON supports plain JSON values only.");
    }
    if (Array.isArray(input)) return input.map(normalize);
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON supports plain objects only.");
    }
    return Object.keys(input)
      .filter((key) => input[key] !== undefined)
      .sort()
      .reduce((result, key) => {
        result[key] = normalize(input[key]);
        return result;
      }, {});
  }
  return JSON.stringify(normalize(value));
}

export async function sha256Hex(value) {
  const bytes = await valueToBytes(value);
  const digest = await requireCrypto().subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function sha256Bytes(value) {
  const bytes = await valueToBytes(value);
  return new Uint8Array(
    await requireCrypto().subtle.digest("SHA-256", bytes),
  );
}

function normalizeEnvelopeContext(context) {
  return Object.freeze({
    householdId: requireNonEmptyString(context?.householdId, "householdId"),
    blobId: requireNonEmptyString(context?.blobId, "blobId"),
    purpose: requireNonEmptyString(context?.purpose || "evidence-original", "purpose"),
  });
}

function contextBytes(context) {
  return new TextEncoder().encode(
    canonicalJson({
      version: VAULT_ENVELOPE_VERSION,
      ...normalizeEnvelopeContext(context),
    }),
  );
}

function wrappingAadBytes(context) {
  return new TextEncoder().encode(
    canonicalJson({
      version: VAULT_ENVELOPE_VERSION,
      purpose: "alyr-content-key-wrap",
      context: normalizeEnvelopeContext(context),
    }),
  );
}

async function deriveWrappingKey(secret, salt, iterations, usages) {
  if (
    !Number.isInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new VaultSecurityError(
      `PBKDF2 iterations must be between ${MIN_PBKDF2_ITERATIONS} and ${MAX_PBKDF2_ITERATIONS}.`,
      "PBKDF2_ITERATIONS_OUT_OF_RANGE",
    );
  }
  const cryptoApi = requireCrypto();
  const baseKey = await cryptoApi.subtle.importKey(
    "raw",
    normalizeSecret(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    usages,
  );
}

async function packPlaintext(bytes) {
  const checksum = await sha256Bytes(bytes);
  return concatenateBytes(
    INTERNAL_PACKAGE_MAGIC,
    checksum,
    encodeUint64(bytes.byteLength),
    bytes,
  );
}

async function unpackPlaintext(packageBytes) {
  const minimumLength =
    INTERNAL_PACKAGE_MAGIC.length +
    INTERNAL_CHECKSUM_BYTES +
    INTERNAL_LENGTH_BYTES;
  if (packageBytes.length < minimumLength) throw new IntegrityError();

  const magic = packageBytes.subarray(0, INTERNAL_PACKAGE_MAGIC.length);
  if (!constantTimeEqual(magic, INTERNAL_PACKAGE_MAGIC)) {
    throw new IntegrityError();
  }
  const checksumStart = INTERNAL_PACKAGE_MAGIC.length;
  const checksumEnd = checksumStart + INTERNAL_CHECKSUM_BYTES;
  const expectedChecksum = packageBytes.subarray(checksumStart, checksumEnd);
  const lengthEnd = checksumEnd + INTERNAL_LENGTH_BYTES;
  const expectedLength = decodeUint64(
    packageBytes.subarray(checksumEnd, lengthEnd),
  );
  const plaintext = packageBytes.subarray(lengthEnd);
  if (plaintext.length !== expectedLength) throw new IntegrityError();
  const actualChecksum = await sha256Bytes(plaintext);
  if (!constantTimeEqual(expectedChecksum, actualChecksum)) {
    throw new IntegrityError();
  }
  return new Uint8Array(plaintext);
}

/**
 * Encrypts bytes with a random content key, then wraps that key with a
 * PBKDF2-derived AES-GCM key. The original checksum is inside the ciphertext;
 * the upload-visible checksum covers only ciphertext.
 */
export async function encryptVaultBytes(
  value,
  secret,
  context,
  {
    iterations = DEFAULT_PBKDF2_ITERATIONS,
    now,
  } = {},
) {
  const cryptoApi = requireCrypto();
  const normalizedContext = normalizeEnvelopeContext(context);
  const plaintext = await valueToBytes(value);
  if (plaintext.byteLength > MAX_VAULT_PLAINTEXT_BYTES) {
    throw new VaultSecurityError(
      "The encrypted item exceeds the 100 MB client foundation limit.",
      "VAULT_ITEM_TOO_LARGE",
    );
  }
  const packageBytes = await packPlaintext(plaintext);
  const contentIv = randomBytes(AES_GCM_IV_BYTES);
  const wrapIv = randomBytes(AES_GCM_IV_BYTES);
  const salt = randomBytes(PBKDF2_SALT_BYTES);
  const contentKey = await cryptoApi.subtle.generateKey(
    { name: "AES-GCM", length: AES_KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
  const ciphertext = new Uint8Array(
    await cryptoApi.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: contentIv,
        additionalData: contextBytes(normalizedContext),
        tagLength: 128,
      },
      contentKey,
      packageBytes,
    ),
  );
  const wrappingKey = await deriveWrappingKey(
    secret,
    salt,
    iterations,
    ["wrapKey", "unwrapKey"],
  );
  const wrappedContentKey = new Uint8Array(
    await cryptoApi.subtle.wrapKey(
      "raw",
      contentKey,
      wrappingKey,
      {
        name: "AES-GCM",
        iv: wrapIv,
        additionalData: wrappingAadBytes(normalizedContext),
        tagLength: 128,
      },
    ),
  );

  return Object.freeze({
    version: VAULT_ENVELOPE_VERSION,
    context: normalizedContext,
    contentCipher: Object.freeze({
      name: "AES-GCM",
      keyBits: AES_KEY_BITS,
      tagBits: 128,
      iv: bytesToBase64(contentIv),
    }),
    wrappedKey: Object.freeze({
      scheme: "PBKDF2-AES-GCM",
      hash: "SHA-256",
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(wrapIv),
      data: bytesToBase64(wrappedContentKey),
    }),
    ciphertext: bytesToBase64(ciphertext),
    ciphertextSha256: await sha256Hex(ciphertext),
    ciphertextBytes: ciphertext.byteLength,
    plaintextBytes: plaintext.byteLength,
    createdAt: nowIso(now),
  });
}

function validateEnvelopeShape(envelope) {
  try {
    if (!envelope || envelope.version !== VAULT_ENVELOPE_VERSION) {
      throw new IntegrityError("Encrypted data uses an unsupported version.");
    }
    if (
      envelope.contentCipher?.name !== "AES-GCM" ||
      envelope.contentCipher?.keyBits !== AES_KEY_BITS ||
      envelope.contentCipher?.tagBits !== 128 ||
      envelope.wrappedKey?.scheme !== "PBKDF2-AES-GCM" ||
      envelope.wrappedKey?.hash !== "SHA-256"
    ) {
      throw new IntegrityError("Encrypted data uses an unsupported algorithm.");
    }
    normalizeEnvelopeContext(envelope.context);
    if (
      !Number.isInteger(envelope.ciphertextBytes) ||
      envelope.ciphertextBytes < INTERNAL_PACKAGE_OVERHEAD_BYTES ||
      !Number.isInteger(envelope.plaintextBytes) ||
      envelope.plaintextBytes < 0 ||
      envelope.plaintextBytes > MAX_VAULT_PLAINTEXT_BYTES ||
      envelope.ciphertextBytes !==
        envelope.plaintextBytes + INTERNAL_PACKAGE_OVERHEAD_BYTES
    ) {
      throw new IntegrityError("Encrypted data has invalid size metadata.");
    }
    if (
      !Number.isInteger(envelope.wrappedKey.iterations) ||
      envelope.wrappedKey.iterations < MIN_PBKDF2_ITERATIONS ||
      envelope.wrappedKey.iterations > MAX_PBKDF2_ITERATIONS ||
      !/^[a-f0-9]{64}$/u.test(String(envelope.ciphertextSha256 || "")) ||
      base64ToBytes(envelope.contentCipher.iv).byteLength !== AES_GCM_IV_BYTES ||
      base64ToBytes(envelope.wrappedKey.salt).byteLength !== PBKDF2_SALT_BYTES ||
      base64ToBytes(envelope.wrappedKey.iv).byteLength !== AES_GCM_IV_BYTES ||
      base64ToBytes(envelope.wrappedKey.data).byteLength !==
        AES_KEY_BITS / 8 + AES_GCM_TAG_BYTES
    ) {
      throw new IntegrityError("Encrypted data has invalid key metadata.");
    }
    normalizeIsoDate(envelope.createdAt, "createdAt");
  } catch (error) {
    if (error instanceof IntegrityError) throw error;
    throw new IntegrityError("Encrypted data is malformed.");
  }
}

export async function decryptVaultBytes(
  envelope,
  secret,
  { expectedContext } = {},
) {
  validateEnvelopeShape(envelope);
  const normalizedContext = normalizeEnvelopeContext(envelope.context);
  if (
    expectedContext &&
    canonicalJson(normalizeEnvelopeContext(expectedContext)) !==
      canonicalJson(normalizedContext)
  ) {
    throw new IntegrityError("Encrypted data belongs to another vault context.");
  }

  try {
    const ciphertext = base64ToBytes(envelope.ciphertext);
    if (
      ciphertext.byteLength !== envelope.ciphertextBytes ||
      (await sha256Hex(ciphertext)) !== envelope.ciphertextSha256
    ) {
      throw new IntegrityError();
    }
    const wrappingKey = await deriveWrappingKey(
      secret,
      base64ToBytes(envelope.wrappedKey.salt),
      envelope.wrappedKey.iterations,
      ["wrapKey", "unwrapKey"],
    );
    const contentKey = await requireCrypto().subtle.unwrapKey(
      "raw",
      base64ToBytes(envelope.wrappedKey.data),
      wrappingKey,
      {
        name: "AES-GCM",
        iv: base64ToBytes(envelope.wrappedKey.iv),
        additionalData: wrappingAadBytes(normalizedContext),
        tagLength: 128,
      },
      { name: "AES-GCM", length: AES_KEY_BITS },
      false,
      ["decrypt"],
    );
    const packageBytes = new Uint8Array(
      await requireCrypto().subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64ToBytes(envelope.contentCipher.iv),
          additionalData: contextBytes(normalizedContext),
          tagLength: 128,
        },
        contentKey,
        ciphertext,
      ),
    );
    const plaintext = await unpackPlaintext(packageBytes);
    if (plaintext.byteLength !== envelope.plaintextBytes) {
      throw new IntegrityError();
    }
    return plaintext;
  } catch (error) {
    if (error instanceof IntegrityError) throw error;
    throw new IntegrityError(
      "The item could not be decrypted or did not pass integrity validation.",
    );
  }
}

/**
 * Returns preview behavior only. It never creates a trusted preview.
 * "generated-rendition" requires a separately stored, access-checked,
 * sanitized/transcoded object from a production processing service.
 */
export function createSafePreviewMetadata({
  mediaType,
  fileName = "attachment",
  sourceBytes,
  renditionBlobId = null,
} = {}) {
  const type = String(mediaType || "application/octet-stream")
    .trim()
    .toLowerCase();
  const normalizedName = String(fileName || "attachment")
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .slice(0, 180) || "attachment";
  const bytes = Number(sourceBytes);
  const validBytes = Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;

  if (INLINE_RASTER_TYPES.has(type)) {
    return Object.freeze({
      version: 1,
      mode: "inline-original",
      mediaType: type,
      displayName: normalizedName,
      sourceBytes: validBytes,
      originalInlineAllowed: true,
      requiresAccessCheck: true,
      activeContent: false,
      renditionBlobId: null,
    });
  }

  if (GENERATED_PREVIEW_TYPES.has(type)) {
    return Object.freeze({
      version: 1,
      mode: renditionBlobId ? "generated-rendition" : "download-only",
      mediaType: type,
      displayName: normalizedName,
      sourceBytes: validBytes,
      originalInlineAllowed: false,
      requiresAccessCheck: true,
      activeContent: false,
      renditionBlobId: renditionBlobId
        ? String(renditionBlobId)
        : null,
    });
  }

  return Object.freeze({
    version: 1,
    mode: "download-only",
    mediaType: type,
    displayName: normalizedName,
    sourceBytes: validBytes,
    originalInlineAllowed: false,
    requiresAccessCheck: true,
    activeContent: ACTIVE_CONTENT_TYPES.has(type),
    renditionBlobId: null,
  });
}

function validatePreviewPolicy(preview) {
  const type = String(preview?.mediaType || "").toLowerCase();
  const validBase =
    preview?.version === 1 &&
    preview.requiresAccessCheck === true &&
    typeof preview.originalInlineAllowed === "boolean" &&
    typeof preview.activeContent === "boolean" &&
    ["inline-original", "generated-rendition", "download-only"].includes(
      preview.mode,
    );
  if (!validBase) return false;
  if (preview.mode === "inline-original") {
    return (
      INLINE_RASTER_TYPES.has(type) &&
      preview.originalInlineAllowed === true &&
      preview.activeContent === false &&
      preview.renditionBlobId === null
    );
  }
  if (preview.originalInlineAllowed !== false) return false;
  if (preview.mode === "generated-rendition") {
    return (
      GENERATED_PREVIEW_TYPES.has(type) &&
      typeof preview.renditionBlobId === "string" &&
      preview.renditionBlobId.length > 0
    );
  }
  return preview.renditionBlobId === null;
}

function manifestBody(manifest) {
  const { manifestSha256: _ignored, ...body } = manifest;
  return body;
}

/**
 * Upload-visible metadata intentionally omits original file names and plaintext
 * checksums. The object is transported as application/octet-stream.
 */
export async function createUploadManifest({
  envelope,
  mediaType = "application/octet-stream",
  fileName = "attachment",
  renditionBlobId = null,
  createdByDeviceId,
} = {}) {
  validateEnvelopeShape(envelope);
  const preview = createSafePreviewMetadata({
    mediaType,
    fileName,
    sourceBytes: envelope.plaintextBytes,
    renditionBlobId,
  });
  const {
    displayName: _localDisplayName,
    sourceBytes: _localSourceBytes,
    ...uploadPreviewPolicy
  } = preview;
  const body = {
    version: UPLOAD_MANIFEST_VERSION,
    blobId: envelope.context.blobId,
    householdId: envelope.context.householdId,
    purpose: envelope.context.purpose,
    objectContentType: "application/octet-stream",
    ciphertextSha256: envelope.ciphertextSha256,
    ciphertextBytes: envelope.ciphertextBytes,
    envelopeVersion: envelope.version,
    createdAt: envelope.createdAt,
    createdByDeviceId: requireNonEmptyString(
      createdByDeviceId,
      "createdByDeviceId",
    ),
    preview: uploadPreviewPolicy,
  };
  return Object.freeze({
    ...body,
    manifestSha256: await sha256Hex(canonicalJson(body)),
  });
}

export async function verifyUploadPackage({ manifest, envelope } = {}) {
  try {
    if (!manifest || manifest.version !== UPLOAD_MANIFEST_VERSION) {
      throw new IntegrityError("Upload manifest uses an unsupported version.");
    }
    validateEnvelopeShape(envelope);
    if (
      !/^[a-f0-9]{64}$/u.test(String(manifest.manifestSha256 || "")) ||
      !/^[a-f0-9]{64}$/u.test(String(manifest.ciphertextSha256 || "")) ||
      !validatePreviewPolicy(manifest.preview) ||
      !String(manifest.createdByDeviceId || "").trim()
    ) {
      throw new IntegrityError("Upload manifest contains invalid metadata.");
    }
    normalizeIsoDate(manifest.createdAt, "manifest.createdAt");
    const expectedManifestHash = await sha256Hex(
      canonicalJson(manifestBody(manifest)),
    );
    if (expectedManifestHash !== manifest.manifestSha256) {
      throw new IntegrityError(
        "Upload manifest did not pass integrity validation.",
      );
    }
    const ciphertext = base64ToBytes(envelope.ciphertext);
    const actualCiphertextHash = await sha256Hex(ciphertext);
    const sameContext =
      manifest.blobId === envelope.context.blobId &&
      manifest.householdId === envelope.context.householdId &&
      manifest.purpose === envelope.context.purpose;
    if (
      !sameContext ||
      manifest.envelopeVersion !== envelope.version ||
      manifest.ciphertextBytes !== ciphertext.byteLength ||
      manifest.ciphertextBytes !== envelope.ciphertextBytes ||
      manifest.ciphertextSha256 !== actualCiphertextHash ||
      envelope.ciphertextSha256 !== actualCiphertextHash
    ) {
      throw new IntegrityError(
        "Encrypted upload did not pass integrity validation.",
      );
    }
    if (
      manifest.objectContentType !== "application/octet-stream" ||
      manifest.preview?.requiresAccessCheck !== true
    ) {
      throw new IntegrityError(
        "Upload manifest contains an unsafe delivery policy.",
      );
    }
    return true;
  } catch (error) {
    if (error instanceof IntegrityError) throw error;
    throw new IntegrityError("Encrypted upload is malformed.");
  }
}

export async function prepareEncryptedUpload({
  value,
  secret,
  context,
  mediaType,
  fileName,
  renditionBlobId,
  createdByDeviceId,
  iterations,
  now,
} = {}) {
  const envelope = await encryptVaultBytes(value, secret, context, {
    iterations,
    now,
  });
  const manifest = await createUploadManifest({
    envelope,
    mediaType,
    fileName,
    renditionBlobId,
    createdByDeviceId,
  });
  return Object.freeze({ envelope, manifest });
}

/**
 * Memory-only session holder. Long-lived credentials must not be placed in
 * localStorage, IndexedDB, URL state, logs, or serialized app snapshots.
 */
export class MemorySessionStore {
  #credential = null;
  #publicState = Object.freeze({ status: "anonymous" });

  start({
    accountId,
    householdId,
    deviceId,
    accessToken,
    expiresAt,
    authenticatedAt = new Date().toISOString(),
    assurance = "authenticated",
  } = {}) {
    const normalizedExpiresAt = normalizeIsoDate(expiresAt, "expiresAt");
    if (new Date(normalizedExpiresAt).getTime() <= Date.now()) {
      throw new SessionRequiredError("The supplied session has already expired.");
    }
    const credential = {
      accountId: requireNonEmptyString(accountId, "accountId"),
      householdId: requireNonEmptyString(householdId, "householdId"),
      deviceId: requireNonEmptyString(deviceId, "deviceId"),
      accessToken: requireNonEmptyString(accessToken, "accessToken"),
      expiresAt: normalizedExpiresAt,
      authenticatedAt: normalizeIsoDate(authenticatedAt, "authenticatedAt"),
      assurance: requireNonEmptyString(assurance, "assurance"),
    };
    this.#credential = Object.freeze(credential);
    this.#publicState = Object.freeze({
      status: "authenticated",
      accountId: credential.accountId,
      householdId: credential.householdId,
      deviceId: credential.deviceId,
      expiresAt: credential.expiresAt,
      authenticatedAt: credential.authenticatedAt,
      assurance: credential.assurance,
    });
    return this.getState();
  }

  getState(at = new Date().toISOString()) {
    if (
      this.#credential &&
      new Date(this.#credential.expiresAt).getTime() <=
        new Date(normalizeIsoDate(at, "at")).getTime()
    ) {
      const expiredState = Object.freeze({
        ...this.#publicState,
        status: "expired",
      });
      this.#credential = null;
      this.#publicState = expiredState;
    }
    return clonePlain(this.#publicState);
  }

  getAuthorization(at = new Date().toISOString()) {
    const state = this.getState(at);
    if (state.status !== "authenticated" || !this.#credential) {
      throw new SessionRequiredError();
    }
    return { ...this.#credential };
  }

  end(reason = "signed-out") {
    this.#credential = null;
    this.#publicState = Object.freeze({
      status: "anonymous",
      reason: String(reason || "signed-out").slice(0, 80),
    });
    return this.getState();
  }

  toJSON() {
    return this.getState();
  }
}

function normalizeStringList(values, fieldName) {
  if (values == null) return [];
  if (!Array.isArray(values)) {
    throw new TypeError(`${fieldName} must be an array.`);
  }
  return [...new Set(values.map((value) => requireNonEmptyString(value, fieldName)))].sort();
}

export function createPermissionGrant({
  grantId = createOpaqueId("grant"),
  principalId,
  householdId,
  role = "viewer",
  recordIds = [],
  placeIds = [],
  collectionIds = [],
  fieldGroups = [],
  status = "active",
  expiresAt = null,
} = {}) {
  if (!ROLE_CAPABILITIES[role]) throw new TypeError("Unknown permission role.");
  if (!["active", "suspended", "revoked"].includes(status)) {
    throw new TypeError("Unknown permission grant status.");
  }
  const normalizedFieldGroups = normalizeStringList(fieldGroups, "fieldGroups");
  for (const fieldGroup of normalizedFieldGroups) {
    if (!SENSITIVE_FIELD_GROUPS.includes(fieldGroup)) {
      throw new TypeError(`Unknown field group: ${fieldGroup}`);
    }
  }
  return Object.freeze({
    version: 1,
    grantId: requireNonEmptyString(grantId, "grantId"),
    principalId: requireNonEmptyString(principalId, "principalId"),
    householdId: requireNonEmptyString(householdId, "householdId"),
    role,
    recordIds: normalizeStringList(recordIds, "recordIds"),
    placeIds: normalizeStringList(placeIds, "placeIds"),
    collectionIds: normalizeStringList(collectionIds, "collectionIds"),
    fieldGroups: normalizedFieldGroups,
    status,
    expiresAt: expiresAt ? normalizeIsoDate(expiresAt, "expiresAt") : null,
  });
}

export function hasPermission(
  grant,
  capability,
  {
    principalId,
    householdId,
    recordId = null,
    placeId = null,
    collectionId = null,
    fieldGroup = null,
    at = new Date().toISOString(),
  } = {},
) {
  if (!grant || grant.status !== "active") return false;
  if (
    grant.expiresAt &&
    new Date(grant.expiresAt).getTime() <=
      new Date(normalizeIsoDate(at, "at")).getTime()
  ) {
    return false;
  }
  if (
    grant.principalId !== String(principalId || "") ||
    grant.householdId !== String(householdId || "")
  ) {
    return false;
  }
  if (!ROLE_CAPABILITIES[grant.role]?.has(capability)) return false;
  if (grant.recordIds.length && (!recordId || !grant.recordIds.includes(recordId))) {
    return false;
  }
  if (grant.placeIds.length && (!placeId || !grant.placeIds.includes(placeId))) {
    return false;
  }
  if (
    grant.collectionIds.length &&
    (!collectionId || !grant.collectionIds.includes(collectionId))
  ) {
    return false;
  }
  if (fieldGroup && !grant.fieldGroups.includes(fieldGroup)) return false;
  return true;
}

export function assertPermission(grants, capability, context) {
  const list = Array.isArray(grants) ? grants : [grants];
  if (list.some((grant) => hasPermission(grant, capability, context))) {
    return true;
  }
  // This neutral error intentionally does not reveal whether a record exists.
  throw new PermissionDeniedError();
}

function sanitizeAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return Object.keys(metadata)
    .filter((key) => AUDIT_METADATA_ALLOWLIST.has(key))
    .sort()
    .reduce((result, key) => {
      const value = metadata[key];
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        result[key] =
          typeof value === "string" ? value.slice(0, 180) : value;
      }
      return result;
    }, {});
}

function auditEventBody(event) {
  const { eventHash: _ignored, ...body } = event;
  return body;
}

/**
 * Appends a hash-chained, privacy-scrubbed client audit event. This is useful
 * local evidence, not a substitute for a server-controlled append-only log.
 */
export async function appendAuditEvent(
  history,
  {
    eventId = createOpaqueId("audit"),
    actorId,
    householdId,
    action,
    resourceType,
    resourceId,
    outcome = "success",
    metadata = {},
    at,
  } = {},
) {
  const existing = Array.isArray(history) ? history : [];
  if (existing.length && !(await verifyAuditHistory(existing))) {
    throw new IntegrityError(
      "Audit history did not pass integrity validation.",
    );
  }
  const previous = existing.at(-1);
  const event = {
    version: AUDIT_EVENT_VERSION,
    eventId: requireNonEmptyString(eventId, "eventId"),
    actorId: requireNonEmptyString(actorId, "actorId"),
    householdId: requireNonEmptyString(householdId, "householdId"),
    action: requireNonEmptyString(action, "action"),
    resourceType: requireNonEmptyString(resourceType, "resourceType"),
    resourceId: requireNonEmptyString(resourceId, "resourceId"),
    outcome: requireNonEmptyString(outcome, "outcome"),
    metadata: sanitizeAuditMetadata(metadata),
    at: nowIso(at),
    previousHash: previous?.eventHash || null,
  };
  const completed = Object.freeze({
    ...event,
    eventHash: await sha256Hex(canonicalJson(event)),
  });
  return Object.freeze([...existing.map(clonePlain), completed]);
}

export async function verifyAuditHistory(history) {
  if (!Array.isArray(history)) return false;
  let previousHash = null;
  for (const event of history) {
    if (
      !event ||
      event.version !== AUDIT_EVENT_VERSION ||
      event.previousHash !== previousHash
    ) {
      return false;
    }
    const expectedHash = await sha256Hex(
      canonicalJson(auditEventBody(event)),
    );
    if (event.eventHash !== expectedHash) return false;
    previousHash = event.eventHash;
  }
  return true;
}
