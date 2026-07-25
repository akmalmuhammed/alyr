import { createHash } from "node:crypto";

export const RECOVERY_KIT_FORMAT = "continuity-encrypted-recovery-kit";
export const RECOVERY_KIT_VERSION = 1;
export const MAX_RECOVERY_KIT_BYTES = 115 * 1024 * 1024;
export const MAX_RECOVERY_REQUEST_BYTES =
  MAX_RECOVERY_KIT_BYTES + 2 * 1024 * 1024;

const MAX_VAULT_PLAINTEXT_BYTES = 100 * 1024 * 1024;
const INTERNAL_PACKAGE_OVERHEAD_BYTES = 6 + 32 + 8 + 16;
const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 2_000_000;

export class RecoveryKitBoundaryError extends Error {
  constructor(message, code = "INVALID_RECOVERY_KIT") {
    super(message);
    this.name = "RecoveryKitBoundaryError";
    this.code = code;
    this.status = 422;
  }
}

function reject(message, code = "INVALID_RECOVERY_KIT") {
  throw new RecoveryKitBoundaryError(message, code);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, expected, label) {
  if (!isObject(value)) reject(`${label} must be an object.`);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    keys.length !== wanted.length ||
    keys.some((key, index) => key !== wanted[index])
  ) {
    reject(`${label} contains unsupported fields.`);
  }
}

function requireIsoDate(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    reject(`${label} is required.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    reject(`${label} must be a canonical ISO date.`);
  }
  return value;
}

function decodeBase64(value, expectedBytes, label) {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  ) {
    reject(`${label} is not valid base64.`);
  }
  const bytes = Buffer.from(value, "base64");
  if (expectedBytes != null && bytes.byteLength !== expectedBytes) {
    reject(`${label} has an invalid byte length.`);
  }
  return bytes;
}

function requireHexSha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    reject(`${label} must be a lowercase SHA-256 checksum.`);
  }
  return value;
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateEnvelope(envelope, { householdId, createdAt }) {
  requireExactKeys(
    envelope,
    [
      "version",
      "context",
      "contentCipher",
      "wrappedKey",
      "ciphertext",
      "ciphertextSha256",
      "ciphertextBytes",
      "plaintextBytes",
      "createdAt",
    ],
    "Encrypted envelope",
  );
  if (envelope.version !== 1) {
    reject("The recovery kit uses an unsupported envelope version.");
  }

  requireExactKeys(
    envelope.context,
    ["householdId", "blobId", "purpose"],
    "Encrypted context",
  );
  if (
    envelope.context.householdId !== householdId ||
    envelope.context.purpose !== "portable-recovery-kit" ||
    typeof envelope.context.blobId !== "string" ||
    !envelope.context.blobId.trim() ||
    envelope.context.blobId.length > 180
  ) {
    reject(
      "The encrypted recovery kit does not belong to this household.",
      "RECOVERY_KIT_CONTEXT_MISMATCH",
    );
  }

  requireExactKeys(
    envelope.contentCipher,
    ["name", "keyBits", "tagBits", "iv"],
    "Content cipher",
  );
  if (
    envelope.contentCipher.name !== "AES-GCM" ||
    envelope.contentCipher.keyBits !== 256 ||
    envelope.contentCipher.tagBits !== 128
  ) {
    reject("The recovery kit uses an unsupported content cipher.");
  }
  decodeBase64(envelope.contentCipher.iv, 12, "Content cipher IV");

  requireExactKeys(
    envelope.wrappedKey,
    ["scheme", "hash", "iterations", "salt", "iv", "data"],
    "Wrapped key",
  );
  if (
    envelope.wrappedKey.scheme !== "PBKDF2-AES-GCM" ||
    envelope.wrappedKey.hash !== "SHA-256" ||
    !Number.isInteger(envelope.wrappedKey.iterations) ||
    envelope.wrappedKey.iterations < MIN_PBKDF2_ITERATIONS ||
    envelope.wrappedKey.iterations > MAX_PBKDF2_ITERATIONS
  ) {
    reject("The recovery kit uses unsupported key metadata.");
  }
  decodeBase64(envelope.wrappedKey.salt, 16, "Wrapped key salt");
  decodeBase64(envelope.wrappedKey.iv, 12, "Wrapped key IV");
  decodeBase64(envelope.wrappedKey.data, 48, "Wrapped key data");

  if (
    !Number.isInteger(envelope.plaintextBytes) ||
    envelope.plaintextBytes < 0 ||
    envelope.plaintextBytes > MAX_VAULT_PLAINTEXT_BYTES ||
    !Number.isInteger(envelope.ciphertextBytes) ||
    envelope.ciphertextBytes !==
      envelope.plaintextBytes + INTERNAL_PACKAGE_OVERHEAD_BYTES
  ) {
    reject("The recovery kit has inconsistent encrypted size metadata.");
  }
  const ciphertext = decodeBase64(
    envelope.ciphertext,
    envelope.ciphertextBytes,
    "Recovery ciphertext",
  );
  const expectedCiphertextChecksum = requireHexSha256(
    envelope.ciphertextSha256,
    "Ciphertext checksum",
  );
  if (sha256Hex(ciphertext) !== expectedCiphertextChecksum) {
    reject(
      "The recovery ciphertext did not pass checksum validation.",
      "RECOVERY_KIT_CHECKSUM_MISMATCH",
    );
  }
  if (requireIsoDate(envelope.createdAt, "Envelope creation date") !== createdAt) {
    reject("The recovery-kit creation date failed validation.");
  }
}

export function validateEncryptedRecoveryKitUpload(input, { householdId } = {}) {
  requireExactKeys(
    input,
    ["payload", "checksum", "byteLength", "createdAt"],
    "Backup request",
  );
  if (typeof householdId !== "string" || !householdId) {
    reject("A household context is required.");
  }
  if (typeof input.payload !== "string" || !input.payload.trim()) {
    reject("Encrypted recovery-kit payload is required.");
  }
  const payloadBytes = Buffer.from(input.payload, "utf8");
  if (
    payloadBytes.byteLength === 0 ||
    payloadBytes.byteLength > MAX_RECOVERY_KIT_BYTES
  ) {
    const error = new RecoveryKitBoundaryError(
      "Encrypted recovery kits must be 115 MB or smaller.",
      "RECOVERY_KIT_TOO_LARGE",
    );
    error.status = 413;
    throw error;
  }
  if (
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength !== payloadBytes.byteLength
  ) {
    reject(
      "The recovery-kit byte length did not match the uploaded payload.",
      "RECOVERY_KIT_SIZE_MISMATCH",
    );
  }
  const checksum = requireHexSha256(input.checksum, "Backup checksum");
  if (sha256Hex(payloadBytes) !== checksum) {
    reject(
      "The recovery-kit checksum did not match the uploaded payload.",
      "RECOVERY_KIT_CHECKSUM_MISMATCH",
    );
  }
  const createdAt = requireIsoDate(input.createdAt, "Backup creation date");

  let kit;
  try {
    kit = JSON.parse(input.payload);
  } catch {
    reject("The encrypted recovery kit is not valid JSON.");
  }
  requireExactKeys(
    kit,
    ["format", "version", "createdAt", "envelope"],
    "Recovery kit",
  );
  if (
    kit.format !== RECOVERY_KIT_FORMAT ||
    kit.version !== RECOVERY_KIT_VERSION
  ) {
    reject("The recovery-kit format or version is not supported.");
  }
  if (requireIsoDate(kit.createdAt, "Recovery-kit creation date") !== createdAt) {
    reject("The backup and recovery-kit creation dates do not match.");
  }
  validateEnvelope(kit.envelope, { householdId, createdAt });

  return Object.freeze({
    payload: input.payload,
    payloadBytes,
    checksum,
    byteLength: payloadBytes.byteLength,
    createdAt,
    blobId: kit.envelope.context.blobId,
    ciphertextChecksum: kit.envelope.ciphertextSha256,
  });
}

