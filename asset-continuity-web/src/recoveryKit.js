import {
  MAX_VAULT_PLAINTEXT_BYTES,
  createOpaqueId,
  decryptVaultBytes,
  encryptVaultBytes,
  sha256Hex,
} from "./securityVault.js";
import { SNAPSHOT_VERSION } from "./domain.js";

export const RECOVERY_KIT_FORMAT = "continuity-encrypted-recovery-kit";
// The outer transport stays on version 1 so the opaque server-side boundary
// can continue validating it without learning anything about the plaintext.
export const RECOVERY_KIT_VERSION = 1;
// Payload v1 did not bind original bytes to canonical workspace evidence
// metadata, so it cannot be restored safely. Payload v2 adds an authenticated,
// one-to-one original manifest.
export const RECOVERY_KIT_PAYLOAD_VERSION = 2;
export const MAX_RECOVERY_KIT_FILE_BYTES = 115 * 1024 * 1024;
export const MAX_RECOVERY_ORIGINALS = 2_000;
export const MAX_SINGLE_RECOVERY_ORIGINAL_BYTES = 25 * 1024 * 1024;
export const MAX_RECOVERY_PLAINTEXT_BYTES = 80 * 1024 * 1024;

const MIN_PASSPHRASE_LENGTH = 12;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ORIGINAL_VERSION_PATTERN = /^ov_[a-f0-9]{64}$/u;
const MIME_TYPE_PATTERN =
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

export class RecoveryKitError extends Error {
  constructor(message, code = "RECOVERY_KIT_ERROR") {
    super(message);
    this.name = "RecoveryKitError";
    this.code = code;
  }
}

function requireObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RecoveryKitError(message, "RECOVERY_KIT_MALFORMED");
  }
  return value;
}

function requireText(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new RecoveryKitError(
      `The recovery kit is missing ${fieldName}.`,
      "RECOVERY_KIT_MALFORMED",
    );
  }
  return normalized;
}

function requireIsoDate(value, fieldName) {
  const normalized = requireText(value, fieldName);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new RecoveryKitError(
      `The recovery kit has an invalid ${fieldName}.`,
      "RECOVERY_KIT_MALFORMED",
    );
  }
  return normalized;
}

function requireExactKeys(value, expectedKeys, fieldName) {
  requireObject(value, `The recovery kit has an invalid ${fieldName}.`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new RecoveryKitError(
      `The recovery kit has unsupported ${fieldName} fields.`,
      "RECOVERY_KIT_MALFORMED",
    );
  }
  return value;
}

function requireSha256(value, fieldName) {
  const checksum = requireText(value, fieldName);
  if (!SHA256_PATTERN.test(checksum)) {
    throw new RecoveryKitError(
      `The recovery kit has an invalid ${fieldName}.`,
      "RECOVERY_KIT_CHECKSUM_REQUIRED",
    );
  }
  return checksum;
}

function requireOriginalVersionId(value) {
  const versionId = requireText(value, "immutable original version identity");
  if (!ORIGINAL_VERSION_PATTERN.test(versionId)) {
    throw new RecoveryKitError(
      "The recovery kit has an invalid immutable original version identity.",
      "RECOVERY_KIT_ORIGINAL_VERSION_INVALID",
    );
  }
  return versionId;
}

function requireFileSize(value, fieldName = "original byte size") {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new RecoveryKitError(
      `The recovery kit has an invalid ${fieldName}.`,
      "RECOVERY_KIT_ORIGINAL_SIZE_MISMATCH",
    );
  }
  return size;
}

function requireMimeType(value, fieldName = "original MIME type") {
  const mimeType = requireText(value, fieldName).toLowerCase();
  if (!MIME_TYPE_PATTERN.test(mimeType)) {
    throw new RecoveryKitError(
      `The recovery kit has an invalid ${fieldName}.`,
      "RECOVERY_KIT_ORIGINAL_TYPE_MISMATCH",
    );
  }
  return mimeType;
}

function optionalText(value) {
  return value == null ? "" : String(value).trim();
}

export async function createOriginalVersionId(evidenceId, checksum) {
  const normalizedEvidenceId = requireText(
    evidenceId,
    "evidence identity",
  );
  const normalizedChecksum = requireSha256(
    checksum,
    "original SHA-256 checksum",
  );
  return `ov_${await sha256Hex(
    `continuity-original-v1\u0000${normalizedEvidenceId}\u0000${normalizedChecksum}`,
  )}`;
}

function bytesToBase64(value) {
  const bytes =
    value instanceof Uint8Array ? value : new Uint8Array(value || 0);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)),
    );
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(value) {
  const encoded = requireText(value, "original file data");
  try {
    if (typeof Buffer !== "undefined") {
      const decoded = Buffer.from(encoded, "base64");
      if (
        decoded.toString("base64").replace(/=+$/u, "") !==
        encoded.replace(/=+$/u, "")
      ) {
        throw new Error("Invalid base64.");
      }
      return new Uint8Array(decoded);
    }
    const binary = globalThis.atob(encoded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new RecoveryKitError(
      "An original file inside the recovery kit is malformed.",
      "RECOVERY_KIT_MALFORMED",
    );
  }
}

function cloneSerializable(value, message) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new RecoveryKitError(message, "RECOVERY_KIT_NOT_SERIALIZABLE");
  }
}

function validatePassphrase(passphrase) {
  if (
    typeof passphrase !== "string" ||
    passphrase.length < MIN_PASSPHRASE_LENGTH
  ) {
    throw new RecoveryKitError(
      "Use a passphrase with at least 12 characters.",
      "RECOVERY_KIT_WEAK_PASSPHRASE",
    );
  }
}

function recoveryContext(workspace, blobId) {
  return {
    householdId: requireText(workspace?.household?.id, "household identity"),
    blobId,
    purpose: "portable-recovery-kit",
  };
}

function workspaceEvidenceMap(workspace) {
  if (!Array.isArray(workspace.evidence)) {
    throw new RecoveryKitError(
      "The workspace has an invalid evidence list.",
      "RECOVERY_KIT_MALFORMED",
    );
  }
  const evidenceById = new Map();
  for (const candidate of workspace.evidence) {
    const evidence = requireObject(
      candidate,
      "The workspace contains invalid evidence.",
    );
    const evidenceId = requireText(evidence.id, "evidence identity");
    if (evidenceById.has(evidenceId)) {
      throw new RecoveryKitError(
        "The workspace contains duplicate evidence identities.",
        "RECOVERY_KIT_DUPLICATE_EVIDENCE",
      );
    }
    evidenceById.set(evidenceId, evidence);
  }
  return evidenceById;
}

function sanitizeWorkspaceFileStates(workspace, manifestByEvidenceId) {
  const cloned = cloneSerializable(
    workspace,
    "The workspace could not be prepared for recovery.",
  );
  if (!Array.isArray(cloned.evidence)) cloned.evidence = [];
  cloned.evidence = cloned.evidence.map((item) => {
    if (!item?.fileName) return item;
    const manifest = manifestByEvidenceId.get(item.id);
    if (!manifest) {
      return {
        ...item,
        originalVersionId: null,
        fileState: "missing_original",
        storageScope: "local-device",
      };
    }
    return {
      ...item,
      originalVersionId: manifest.originalVersionId,
      fileName: manifest.fileName,
      fileType: manifest.fileType,
      fileSize: manifest.fileSize,
      fileChecksum: manifest.fileChecksum,
      fileState: "ready_local",
      storageScope: "local-device",
    };
  });
  return cloned;
}

function throwIdentityMismatch(message, code) {
  throw new RecoveryKitError(message, code);
}

function validateOptionalOriginalMetadata(item, manifest) {
  if (
    item.fileName != null &&
    requireText(item.fileName, "original filename") !== manifest.fileName
  ) {
    throwIdentityMismatch(
      "An original filename does not match its workspace evidence.",
      "RECOVERY_KIT_ORIGINAL_NAME_MISMATCH",
    );
  }
  if (
    item.fileType != null &&
    requireMimeType(item.fileType) !== manifest.fileType
  ) {
    throwIdentityMismatch(
      "An original MIME type does not match its workspace evidence.",
      "RECOVERY_KIT_ORIGINAL_TYPE_MISMATCH",
    );
  }
  if (
    item.fileSize != null &&
    requireFileSize(item.fileSize) !== manifest.fileSize
  ) {
    throwIdentityMismatch(
      "An original byte size does not match its workspace evidence.",
      "RECOVERY_KIT_ORIGINAL_SIZE_MISMATCH",
    );
  }
  if (
    item.fileChecksum != null &&
    requireSha256(item.fileChecksum, "original SHA-256 checksum") !==
      manifest.fileChecksum
  ) {
    throwIdentityMismatch(
      "An original checksum does not match its bytes.",
      "RECOVERY_KIT_ORIGINAL_CHECKSUM_MISMATCH",
    );
  }
  if (
    item.originalVersionId != null &&
    requireOriginalVersionId(item.originalVersionId) !==
      manifest.originalVersionId
  ) {
    throwIdentityMismatch(
      "An immutable original version identity does not match its bytes.",
      "RECOVERY_KIT_ORIGINAL_VERSION_MISMATCH",
    );
  }
}

async function encodeOriginal(input, evidenceById) {
  const item = requireObject(
    input,
    "The recovery kit contains an invalid original file.",
  );
  const evidenceId = requireText(item.evidenceId, "evidence identity");
  const evidence = evidenceById.get(evidenceId);
  if (!evidence) {
    throw new RecoveryKitError(
      "An original file is not linked to workspace evidence.",
      "RECOVERY_KIT_ORPHAN_ORIGINAL",
    );
  }
  if (!(item.blob instanceof Blob) || !item.blob.size) {
    throw new RecoveryKitError(
      "An original file could not be read.",
      "RECOVERY_KIT_INVALID_ORIGINAL",
    );
  }
  if (item.blob.size > MAX_SINGLE_RECOVERY_ORIGINAL_BYTES) {
    throw new RecoveryKitError(
      "Recovery-kit originals must each be 25 MB or smaller.",
      "RECOVERY_KIT_ORIGINAL_TOO_LARGE",
    );
  }
  const bytes = new Uint8Array(await item.blob.arrayBuffer());
  const actualChecksum = await sha256Hex(bytes);
  const fileName = requireText(evidence.fileName, "workspace evidence filename");
  const fileType = requireMimeType(
    evidence.fileType,
    "workspace evidence MIME type",
  );
  const fileSize = requireFileSize(
    evidence.fileSize,
    "workspace evidence byte size",
  );
  const evidenceChecksum = requireSha256(
    evidence.fileChecksum,
    "workspace evidence SHA-256 checksum",
  );
  if (fileSize !== bytes.byteLength) {
    throwIdentityMismatch(
      "An original byte size does not match its workspace evidence.",
      "RECOVERY_KIT_ORIGINAL_SIZE_MISMATCH",
    );
  }
  if (evidenceChecksum !== actualChecksum) {
    throwIdentityMismatch(
      "An original checksum does not match its workspace evidence.",
      "RECOVERY_KIT_ORIGINAL_CHECKSUM_MISMATCH",
    );
  }
  const blobType = optionalText(item.blob.type).toLowerCase();
  if (blobType && requireMimeType(blobType) !== fileType) {
    throwIdentityMismatch(
      "An original MIME type does not match its workspace evidence.",
      "RECOVERY_KIT_ORIGINAL_TYPE_MISMATCH",
    );
  }
  const blobName = optionalText(item.blob.name);
  if (blobName && blobName !== fileName) {
    throwIdentityMismatch(
      "An original filename does not match its workspace evidence.",
      "RECOVERY_KIT_ORIGINAL_NAME_MISMATCH",
    );
  }
  const originalVersionId = await createOriginalVersionId(
    evidenceId,
    actualChecksum,
  );
  const manifest = Object.freeze({
    evidenceId,
    originalVersionId,
    fileName,
    fileType,
    fileSize: bytes.byteLength,
    fileChecksum: actualChecksum,
  });
  validateOptionalOriginalMetadata(item, manifest);
  return {
    manifest,
    original: Object.freeze({
      originalVersionId,
      data: bytesToBase64(bytes),
    }),
  };
}

/**
 * Creates one portable file containing the serializable workspace and any
 * originals currently present in IndexedDB. Everything below `envelope` is
 * authenticated ciphertext; no asset names, filenames, or file bytes are
 * exposed in the outer JSON.
 */
export async function createEncryptedRecoveryKit({
  workspace,
  originals = [],
  passphrase,
  now,
  iterations,
} = {}) {
  validatePassphrase(passphrase);
  requireObject(workspace, "Choose a workspace to protect.");
  if (!Array.isArray(originals) || originals.length > MAX_RECOVERY_ORIGINALS) {
    throw new RecoveryKitError(
      `A recovery kit can contain at most ${MAX_RECOVERY_ORIGINALS} originals.`,
      "RECOVERY_KIT_TOO_MANY_ORIGINALS",
    );
  }

  const evidenceById = workspaceEvidenceMap(workspace);
  const originalManifest = [];
  const encodedOriginals = [];
  const seenEvidenceIds = new Set();
  const seenOriginalVersionIds = new Set();
  for (const original of originals) {
    const encoded = await encodeOriginal(original, evidenceById);
    if (seenEvidenceIds.has(encoded.manifest.evidenceId)) {
      throw new RecoveryKitError(
        "The recovery kit contains the same original more than once.",
        "RECOVERY_KIT_DUPLICATE_ORIGINAL",
      );
    }
    if (
      seenOriginalVersionIds.has(encoded.manifest.originalVersionId)
    ) {
      throw new RecoveryKitError(
        "The recovery kit contains a duplicate immutable original version.",
        "RECOVERY_KIT_DUPLICATE_ORIGINAL_VERSION",
      );
    }
    seenEvidenceIds.add(encoded.manifest.evidenceId);
    seenOriginalVersionIds.add(encoded.manifest.originalVersionId);
    originalManifest.push(encoded.manifest);
    encodedOriginals.push(encoded.original);
  }

  const createdAt = now
    ? new Date(now).toISOString()
    : new Date().toISOString();
  const payload = {
    format: RECOVERY_KIT_FORMAT,
    version: RECOVERY_KIT_PAYLOAD_VERSION,
    createdAt,
    workspace: sanitizeWorkspaceFileStates(workspace, new Map(
      originalManifest.map((item) => [item.evidenceId, item]),
    )),
    originalManifest,
    originals: encodedOriginals,
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  if (
    plaintext.byteLength > MAX_RECOVERY_PLAINTEXT_BYTES ||
    plaintext.byteLength > MAX_VAULT_PLAINTEXT_BYTES
  ) {
    throw new RecoveryKitError(
      "This workspace is too large for one recovery kit. Remove large originals and try again.",
      "RECOVERY_KIT_TOO_LARGE",
    );
  }
  const blobId = createOpaqueId("recovery-kit");
  const envelope = await encryptVaultBytes(
    plaintext,
    passphrase,
    recoveryContext(workspace, blobId),
    {
      now: createdAt,
      ...(iterations ? { iterations } : {}),
    },
  );
  return Object.freeze({
    format: RECOVERY_KIT_FORMAT,
    version: RECOVERY_KIT_VERSION,
    createdAt,
    envelope,
  });
}

async function inputToText(input) {
  if (input instanceof Blob) {
    if (!input.size || input.size > MAX_RECOVERY_KIT_FILE_BYTES) {
      throw new RecoveryKitError(
        "Choose a valid encrypted recovery kit under 115 MB.",
        "RECOVERY_KIT_FILE_SIZE",
      );
    }
    return input.text();
  }
  if (input instanceof Uint8Array) {
    if (
      !input.byteLength ||
      input.byteLength > MAX_RECOVERY_KIT_FILE_BYTES
    ) {
      throw new RecoveryKitError(
        "Choose a valid encrypted recovery kit under 115 MB.",
        "RECOVERY_KIT_FILE_SIZE",
      );
    }
    return new TextDecoder().decode(input);
  }
  if (typeof input === "string") {
    if (
      !input.trim() ||
      new TextEncoder().encode(input).byteLength >
        MAX_RECOVERY_KIT_FILE_BYTES
    ) {
      throw new RecoveryKitError(
        "Choose a valid encrypted recovery kit under 115 MB.",
        "RECOVERY_KIT_FILE_SIZE",
      );
    }
    return input;
  }
  throw new RecoveryKitError(
    "Choose a Heldat recovery-kit file.",
    "RECOVERY_KIT_FILE_REQUIRED",
  );
}

export async function parseEncryptedRecoveryKit(input) {
  let parsed;
  try {
    parsed = JSON.parse(await inputToText(input));
  } catch (error) {
    if (error instanceof RecoveryKitError) throw error;
    throw new RecoveryKitError(
      "That file is not a valid Heldat recovery kit.",
      "RECOVERY_KIT_MALFORMED",
    );
  }
  requireObject(parsed, "That file is not a valid Heldat recovery kit.");
  if (
    parsed.format !== RECOVERY_KIT_FORMAT ||
    parsed.version !== RECOVERY_KIT_VERSION
  ) {
    throw new RecoveryKitError(
      "This recovery-kit version is not supported.",
      "RECOVERY_KIT_UNSUPPORTED",
    );
  }
  requireIsoDate(parsed.createdAt, "creation date");
  requireObject(parsed.envelope, "The encrypted recovery envelope is missing.");
  if (parsed.envelope.createdAt !== parsed.createdAt) {
    throw new RecoveryKitError(
      "The recovery-kit creation date failed validation.",
      "RECOVERY_KIT_CONTEXT_MISMATCH",
    );
  }
  if (parsed.envelope.context?.purpose !== "portable-recovery-kit") {
    throw new RecoveryKitError(
      "This encrypted file is not a portable recovery kit.",
      "RECOVERY_KIT_WRONG_PURPOSE",
    );
  }
  return parsed;
}

function validateManifestEntry(input) {
  const item = requireExactKeys(
    input,
    [
      "evidenceId",
      "originalVersionId",
      "fileName",
      "fileType",
      "fileSize",
      "fileChecksum",
    ],
    "original manifest entry",
  );
  return Object.freeze({
    evidenceId: requireText(item.evidenceId, "evidence identity"),
    originalVersionId: requireOriginalVersionId(item.originalVersionId),
    fileName: requireText(item.fileName, "original filename"),
    fileType: requireMimeType(item.fileType),
    fileSize: requireFileSize(item.fileSize),
    fileChecksum: requireSha256(
      item.fileChecksum,
      "original SHA-256 checksum",
    ),
  });
}

function validateOriginalDataEntry(input) {
  const item = requireExactKeys(
    input,
    ["originalVersionId", "data"],
    "encrypted original entry",
  );
  return Object.freeze({
    originalVersionId: requireOriginalVersionId(item.originalVersionId),
    data: requireText(item.data, "original file data"),
  });
}

function assertLinkedField(actual, expected, message, code) {
  if (actual !== expected) {
    throw new RecoveryKitError(message, code);
  }
}

function validateWorkspaceManifestLinkage(
  evidenceById,
  manifestByEvidenceId,
) {
  for (const [evidenceId, evidence] of evidenceById) {
    const manifest = manifestByEvidenceId.get(evidenceId);
    const fileName = optionalText(evidence.fileName);
    const originalVersionId = optionalText(evidence.originalVersionId);
    const declaresReadyOriginal = evidence.fileState === "ready_local";

    if (!fileName) {
      if (manifest || originalVersionId || declaresReadyOriginal) {
        throw new RecoveryKitError(
          "Workspace evidence declares a local original without file identity.",
          "RECOVERY_KIT_WORKSPACE_LINK_MISMATCH",
        );
      }
      continue;
    }

    if (
      !["ready_local", "missing_original"].includes(evidence.fileState) ||
      evidence.storageScope !== "local-device"
    ) {
      throw new RecoveryKitError(
        "Workspace evidence has an invalid recovery file state.",
        "RECOVERY_KIT_WORKSPACE_LINK_MISMATCH",
      );
    }

    if (!manifest) {
      if (declaresReadyOriginal || originalVersionId) {
        throw new RecoveryKitError(
          "Workspace evidence references an original that is missing from the recovery kit.",
          "RECOVERY_KIT_MISSING_ORIGINAL",
        );
      }
      continue;
    }

    if (!declaresReadyOriginal) {
      throw new RecoveryKitError(
        "An original is linked to workspace evidence marked as missing.",
        "RECOVERY_KIT_WORKSPACE_LINK_MISMATCH",
      );
    }
    assertLinkedField(
      requireOriginalVersionId(evidence.originalVersionId),
      manifest.originalVersionId,
      "The workspace and manifest use different immutable original versions.",
      "RECOVERY_KIT_ORIGINAL_VERSION_MISMATCH",
    );
    assertLinkedField(
      requireText(evidence.fileName, "workspace evidence filename"),
      manifest.fileName,
      "The workspace and manifest use different original filenames.",
      "RECOVERY_KIT_ORIGINAL_NAME_MISMATCH",
    );
    assertLinkedField(
      requireMimeType(evidence.fileType, "workspace evidence MIME type"),
      manifest.fileType,
      "The workspace and manifest use different original MIME types.",
      "RECOVERY_KIT_ORIGINAL_TYPE_MISMATCH",
    );
    assertLinkedField(
      requireFileSize(evidence.fileSize, "workspace evidence byte size"),
      manifest.fileSize,
      "The workspace and manifest use different original byte sizes.",
      "RECOVERY_KIT_ORIGINAL_SIZE_MISMATCH",
    );
    assertLinkedField(
      requireSha256(
        evidence.fileChecksum,
        "workspace evidence SHA-256 checksum",
      ),
      manifest.fileChecksum,
      "The workspace and manifest use different original checksums.",
      "RECOVERY_KIT_ORIGINAL_CHECKSUM_MISMATCH",
    );
  }

  for (const evidenceId of manifestByEvidenceId.keys()) {
    if (!evidenceById.has(evidenceId)) {
      throw new RecoveryKitError(
        "The recovery kit contains an original not linked to workspace evidence.",
        "RECOVERY_KIT_ORPHAN_ORIGINAL",
      );
    }
  }
}

async function decodeOriginal(manifest, dataEntry) {
  const bytes = base64ToBytes(dataEntry.data);
  if (
    bytes.byteLength !== manifest.fileSize ||
    bytes.byteLength > MAX_SINGLE_RECOVERY_ORIGINAL_BYTES
  ) {
    throw new RecoveryKitError(
      "An original file failed byte-size validation.",
      "RECOVERY_KIT_ORIGINAL_SIZE_MISMATCH",
    );
  }
  const actualChecksum = await sha256Hex(bytes);
  if (actualChecksum !== manifest.fileChecksum) {
    throw new RecoveryKitError(
      "An original file failed its SHA-256 integrity check.",
      "RECOVERY_KIT_ORIGINAL_CHECKSUM_MISMATCH",
    );
  }
  const expectedOriginalVersionId = await createOriginalVersionId(
    manifest.evidenceId,
    actualChecksum,
  );
  if (manifest.originalVersionId !== expectedOriginalVersionId) {
    throw new RecoveryKitError(
      "An original file failed immutable version identity validation.",
      "RECOVERY_KIT_ORIGINAL_VERSION_MISMATCH",
    );
  }
  return Object.freeze({
    ...manifest,
    blob: new Blob([bytes], { type: manifest.fileType }),
  });
}

export async function decryptEncryptedRecoveryKit(
  input,
  passphrase,
) {
  validatePassphrase(passphrase);
  const kit =
    input?.format === RECOVERY_KIT_FORMAT
      ? await parseEncryptedRecoveryKit(JSON.stringify(input))
      : await parseEncryptedRecoveryKit(input);
  const plaintext = await decryptVaultBytes(kit.envelope, passphrase, {
    expectedContext: kit.envelope.context,
  });

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new RecoveryKitError(
      "The decrypted recovery payload is malformed.",
      "RECOVERY_KIT_PAYLOAD_MALFORMED",
    );
  }
  requireObject(payload, "The decrypted recovery payload is malformed.");
  if (payload.format !== RECOVERY_KIT_FORMAT) {
    throw new RecoveryKitError(
      "The decrypted recovery payload uses an unsupported format.",
      "RECOVERY_KIT_UNSUPPORTED",
    );
  }
  if (payload.version !== RECOVERY_KIT_PAYLOAD_VERSION) {
    throw new RecoveryKitError(
      payload.version === 1
        ? "This legacy recovery-kit version cannot verify immutable originals safely. Create a new recovery kit on the source device."
        : "The decrypted recovery payload uses an unsupported version.",
      "RECOVERY_KIT_PAYLOAD_VERSION",
    );
  }
  requireExactKeys(
    payload,
    [
      "format",
      "version",
      "createdAt",
      "workspace",
      "originalManifest",
      "originals",
    ],
    "decrypted recovery payload",
  );
  const workspace = requireObject(
    payload.workspace,
    "The decrypted recovery kit does not contain a workspace.",
  );
  const workspaceVersion = Number(
    workspace.version ?? workspace.schemaVersion,
  );
  if (workspaceVersion !== SNAPSHOT_VERSION) {
    throw new RecoveryKitError(
      "This kit uses an unsupported workspace version and was not opened.",
      "RECOVERY_KIT_WORKSPACE_VERSION",
    );
  }
  if (
    String(workspace.household?.id || "") !==
    kit.envelope.context.householdId
  ) {
    throw new RecoveryKitError(
      "The decrypted workspace does not match the encrypted vault context.",
      "RECOVERY_KIT_CONTEXT_MISMATCH",
    );
  }
  if (
    !Array.isArray(payload.originalManifest) ||
    payload.originalManifest.length > MAX_RECOVERY_ORIGINALS ||
    !Array.isArray(payload.originals) ||
    payload.originals.length > MAX_RECOVERY_ORIGINALS
  ) {
    throw new RecoveryKitError(
      "The decrypted recovery kit has an invalid original manifest.",
      "RECOVERY_KIT_MALFORMED",
    );
  }
  const evidenceById = workspaceEvidenceMap(workspace);
  const manifestByEvidenceId = new Map();
  const manifestByVersionId = new Map();
  for (const candidate of payload.originalManifest) {
    const manifest = validateManifestEntry(candidate);
    if (manifestByEvidenceId.has(manifest.evidenceId)) {
      throw new RecoveryKitError(
        "The decrypted recovery kit contains duplicate originals for one evidence record.",
        "RECOVERY_KIT_DUPLICATE_ORIGINAL",
      );
    }
    if (manifestByVersionId.has(manifest.originalVersionId)) {
      throw new RecoveryKitError(
        "The decrypted recovery kit contains duplicate immutable original versions.",
        "RECOVERY_KIT_DUPLICATE_ORIGINAL_VERSION",
      );
    }
    manifestByEvidenceId.set(manifest.evidenceId, manifest);
    manifestByVersionId.set(manifest.originalVersionId, manifest);
  }

  const dataByVersionId = new Map();
  for (const candidate of payload.originals) {
    const dataEntry = validateOriginalDataEntry(candidate);
    if (dataByVersionId.has(dataEntry.originalVersionId)) {
      throw new RecoveryKitError(
        "The decrypted recovery kit contains duplicate original bytes.",
        "RECOVERY_KIT_DUPLICATE_ORIGINAL_VERSION",
      );
    }
    dataByVersionId.set(dataEntry.originalVersionId, dataEntry);
  }

  validateWorkspaceManifestLinkage(evidenceById, manifestByEvidenceId);
  for (const versionId of dataByVersionId.keys()) {
    if (!manifestByVersionId.has(versionId)) {
      throw new RecoveryKitError(
        "The decrypted recovery kit contains original bytes without a manifest entry.",
        "RECOVERY_KIT_ORPHAN_ORIGINAL",
      );
    }
  }
  for (const versionId of manifestByVersionId.keys()) {
    if (!dataByVersionId.has(versionId)) {
      throw new RecoveryKitError(
        "The decrypted recovery kit manifest references missing original bytes.",
        "RECOVERY_KIT_MISSING_ORIGINAL",
      );
    }
  }

  const seenEvidenceIds = new Set();
  const originals = [];
  for (const manifestCandidate of payload.originalManifest) {
    const evidenceId = String(manifestCandidate.evidenceId);
    const manifest = manifestByEvidenceId.get(evidenceId);
    if (!manifest || seenEvidenceIds.has(evidenceId)) {
      throw new RecoveryKitError(
        "The decrypted recovery kit contains duplicate originals.",
        "RECOVERY_KIT_DUPLICATE_ORIGINAL",
      );
    }
    seenEvidenceIds.add(evidenceId);
    originals.push(
      await decodeOriginal(
        manifest,
        dataByVersionId.get(manifest.originalVersionId),
      ),
    );
  }

  const payloadCreatedAt = requireIsoDate(payload.createdAt, "creation date");
  if (payloadCreatedAt !== kit.createdAt) {
    throw new RecoveryKitError(
      "The decrypted recovery date does not match its envelope.",
      "RECOVERY_KIT_CONTEXT_MISMATCH",
    );
  }
  const referencedOriginalCount = [...evidenceById.values()].filter(
    (evidence) => Boolean(optionalText(evidence.fileName)),
  ).length;
  const manifest = Object.freeze(
    payload.originalManifest.map((candidate) =>
      manifestByEvidenceId.get(String(candidate.evidenceId)),
    ),
  );
  const coverage = Object.freeze({
    referencedOriginalCount,
    includedOriginalCount: originals.length,
    missingOriginalCount: referencedOriginalCount - originals.length,
    originalBytes: originals.reduce(
      (total, original) => total + original.fileSize,
      0,
    ),
    originalVersionIds: Object.freeze(
      originals.map((original) => original.originalVersionId),
    ),
  });
  return {
    createdAt: payloadCreatedAt,
    workspace,
    manifest,
    coverage,
    originals,
  };
}
