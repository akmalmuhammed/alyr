import {
  getEvidenceFile,
  sha256ForBlob,
} from "./fileStore.js";
import {
  MAX_RECOVERY_KIT_FILE_BYTES,
  MAX_RECOVERY_ORIGINALS,
  MAX_RECOVERY_PLAINTEXT_BYTES,
  MAX_SINGLE_RECOVERY_ORIGINAL_BYTES,
  RECOVERY_KIT_FORMAT,
  RECOVERY_KIT_PAYLOAD_VERSION,
  RECOVERY_KIT_VERSION,
  createOriginalVersionId,
} from "./recoveryKit.js";
import {
  DEFAULT_PBKDF2_ITERATIONS,
  VAULT_ENVELOPE_VERSION,
} from "./securityVault.js";
import { roomCaptureStore } from "./roomCaptureStore.js";
import {
  requireStorageScopeId,
  storageKeysForScope,
} from "./storageScope.js";

export const BACKUP_PREFLIGHT_VERSION = 1;

// Vault envelope v1 packages plaintext as:
// magic (6) + plaintext length (8) + SHA-256 (32) + AES-GCM tag (16).
// Keep this projection explicit so it can be revised with the envelope version.
const VAULT_V1_CIPHERTEXT_OVERHEAD_BYTES = 62;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ORIGINAL_VERSION_PATTERN = /^ov_[a-f0-9]{64}$/u;
const textEncoder = new TextEncoder();

function freezeEntries(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze(entry)));
}

function normalizedText(value) {
  return String(value ?? "").trim();
}

function normalizedChecksum(value) {
  const checksum = normalizedText(value).toLowerCase();
  return SHA256_PATTERN.test(checksum) ? checksum : "";
}

function normalizedOriginalVersionId(value) {
  const versionId = normalizedText(value).toLowerCase();
  return ORIGINAL_VERSION_PATTERN.test(versionId) ? versionId : "";
}

function normalizedMimeType(value) {
  return normalizedText(value).toLowerCase();
}

function safePositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function utf8Bytes(value) {
  return textEncoder.encode(value).byteLength;
}

function base64Length(byteLength) {
  return Math.ceil(byteLength / 3) * 4;
}

function evidenceLabel(evidence) {
  return (
    normalizedText(evidence?.fileName) ||
    normalizedText(evidence?.type) ||
    "Unnamed original"
  );
}

function missingEntry(evidence) {
  return {
    evidenceId: normalizedText(evidence?.id) || null,
    fileName: evidenceLabel(evidence),
    reason: "not_stored_on_this_device",
    message:
      "The workspace references this original, but its bytes are not stored in this browser.",
  };
}

function integrityEntry(evidence, reason, message) {
  return {
    evidenceId: normalizedText(evidence?.id) || null,
    fileName: evidenceLabel(evidence),
    reason,
    message,
  };
}

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeCreatedAt(now) {
  const candidate =
    typeof now === "function" ? now() : now || new Date().toISOString();
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Backup preflight requires a valid creation date.");
  }
  return date.toISOString();
}

async function verifyStoredOriginal(evidence, record, hashBlob) {
  if (!(record?.blob instanceof Blob) || !record.blob.size) {
    return {
      failure: integrityEntry(
        evidence,
        "stored_original_invalid",
        "A local original record exists, but its bytes are missing or empty.",
      ),
    };
  }

  const evidenceId = normalizedText(evidence?.id);
  const recordId = normalizedText(record.id || record.evidenceId);
  if (recordId && recordId !== evidenceId) {
    return {
      failure: integrityEntry(
        evidence,
        "record_identity_mismatch",
        "The stored original belongs to a different evidence record.",
      ),
    };
  }

  let actualChecksum;
  try {
    actualChecksum = normalizedChecksum(await hashBlob(record.blob));
  } catch {
    return {
      failure: integrityEntry(
        evidence,
        "checksum_unavailable",
        "The browser could not calculate the SHA-256 checksum required for backup.",
      ),
    };
  }
  const evidenceChecksum = normalizedChecksum(evidence?.fileChecksum);
  const storedChecksum = normalizedChecksum(record.fileChecksum);
  if (!actualChecksum || !evidenceChecksum || !storedChecksum) {
    return {
      failure: integrityEntry(
        evidence,
        "checksum_metadata_incomplete",
        "This original does not have complete SHA-256 integrity metadata.",
      ),
    };
  }
  if (
    actualChecksum !== evidenceChecksum ||
    actualChecksum !== storedChecksum
  ) {
    return {
      failure: integrityEntry(
        evidence,
        "checksum_mismatch",
        "The stored bytes failed their SHA-256 integrity check.",
      ),
    };
  }

  const actualSize = safePositiveInteger(record.blob.size);
  const evidenceSize = safePositiveInteger(evidence?.fileSize);
  const storedSize = safePositiveInteger(record.fileSize);
  if (
    !actualSize ||
    actualSize !== evidenceSize ||
    actualSize !== storedSize
  ) {
    return {
      failure: integrityEntry(
        evidence,
        "size_mismatch",
        "The original byte size does not match its recorded metadata.",
      ),
    };
  }

  const evidenceType = normalizedMimeType(evidence?.fileType);
  const storedType = normalizedMimeType(record.fileType);
  const blobType = normalizedMimeType(record.blob.type);
  if (
    !evidenceType ||
    !storedType ||
    evidenceType !== storedType ||
    (blobType && blobType !== storedType)
  ) {
    return {
      failure: integrityEntry(
        evidence,
        "type_mismatch",
        "The original file type does not match its recorded metadata.",
      ),
    };
  }

  const evidenceName = normalizedText(evidence?.fileName);
  const storedName = normalizedText(record.fileName);
  if (!evidenceName || !storedName || evidenceName !== storedName) {
    return {
      failure: integrityEntry(
        evidence,
        "name_mismatch",
        "The original filename does not match its recorded metadata.",
      ),
    };
  }

  let expectedOriginalVersionId;
  try {
    expectedOriginalVersionId = await createOriginalVersionId(
      evidenceId,
      actualChecksum,
    );
  } catch {
    return {
      failure: integrityEntry(
        evidence,
        "version_identity_unavailable",
        "The immutable original version identity could not be calculated.",
      ),
    };
  }
  const evidenceVersion = normalizedOriginalVersionId(
    evidence?.originalVersionId,
  );
  const storedVersion = normalizedOriginalVersionId(record.originalVersionId);
  if (
    (evidence?.originalVersionId && !evidenceVersion) ||
    (record.originalVersionId && !storedVersion) ||
    (evidenceVersion && evidenceVersion !== expectedOriginalVersionId) ||
    (storedVersion && storedVersion !== expectedOriginalVersionId)
  ) {
    return {
      failure: integrityEntry(
        evidence,
        "version_mismatch",
        "The immutable original version identity does not match these bytes.",
      ),
    };
  }

  return {
    original: Object.freeze({
      evidenceId,
      originalVersionId: expectedOriginalVersionId,
      fileName: evidenceName,
      fileType: evidenceType,
      fileSize: actualSize,
      fileChecksum: actualChecksum,
      blob: record.blob,
    }),
  };
}

async function inspectOriginalCoverage({
  workspace,
  loadRecord,
  hashBlob,
  initialIntegrityFailures = [],
}) {
  const missing = [];
  const integrityFailures = [...initialIntegrityFailures];
  const originals = [];
  const seenEvidenceIds = new Set();
  const evidence = Array.isArray(workspace?.evidence)
    ? workspace.evidence
    : null;

  if (
    !workspace ||
    typeof workspace !== "object" ||
    Array.isArray(workspace) ||
    !normalizedText(workspace?.household?.id)
  ) {
    integrityFailures.push(
      integrityEntry(
        null,
        "workspace_identity_missing",
        "The workspace does not have a stable household identity.",
      ),
    );
  }

  if (!evidence) {
    integrityFailures.push(
      integrityEntry(
        null,
        "workspace_evidence_invalid",
        "The workspace does not contain a valid evidence list.",
      ),
    );
    return { referencedOriginalCount: 0, originals, missing, integrityFailures };
  }

  const canonicalEvidenceIds = new Set();
  for (const candidate of evidence) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      integrityFailures.push(
        integrityEntry(
          candidate,
          "workspace_evidence_invalid",
          "The workspace contains an invalid evidence record.",
        ),
      );
      continue;
    }
    const evidenceId = normalizedText(candidate.id);
    if (!evidenceId) {
      integrityFailures.push(
        integrityEntry(
          candidate,
          "evidence_identity_missing",
          "An evidence record does not have a stable identity.",
        ),
      );
      continue;
    }
    if (canonicalEvidenceIds.has(evidenceId)) {
      integrityFailures.push(
        integrityEntry(
          candidate,
          "duplicate_evidence_identity",
          "The workspace contains the same evidence identity more than once.",
        ),
      );
      continue;
    }
    canonicalEvidenceIds.add(evidenceId);
  }

  let referencedOriginalCount = 0;
  for (const candidate of evidence) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      continue;
    }
    if (!normalizedText(candidate?.fileName)) continue;
    referencedOriginalCount += 1;
    const evidenceId = normalizedText(candidate?.id);
    if (!evidenceId) {
      continue;
    }
    if (seenEvidenceIds.has(evidenceId)) {
      continue;
    }
    seenEvidenceIds.add(evidenceId);

    let record;
    try {
      record = await loadRecord(candidate);
    } catch {
      integrityFailures.push(
        integrityEntry(
          candidate,
          "storage_read_failed",
          "The browser could not read this local original. Nothing was silently omitted.",
        ),
      );
      continue;
    }
    if (!record) {
      missing.push(missingEntry(candidate));
      continue;
    }
    const inspected = await verifyStoredOriginal(candidate, record, hashBlob);
    if (inspected.failure) {
      integrityFailures.push(inspected.failure);
      continue;
    }
    originals.push(inspected.original);
  }

  return {
    referencedOriginalCount,
    originals,
    missing,
    integrityFailures,
  };
}

function sanitizeProjectedWorkspace(workspace, originals) {
  const cloned = cloneSerializable(workspace);
  const manifestByEvidenceId = new Map(
    originals.map((original) => [original.evidenceId, original]),
  );
  if (!Array.isArray(cloned.evidence)) cloned.evidence = [];
  cloned.evidence = cloned.evidence.map((evidence) => {
    if (!normalizedText(evidence?.fileName)) return evidence;
    const original = manifestByEvidenceId.get(evidence.id);
    if (!original) {
      return {
        ...evidence,
        originalVersionId: null,
        fileState: "missing_original",
        storageScope: "local-device",
      };
    }
    return {
      ...evidence,
      originalVersionId: original.originalVersionId,
      fileName: original.fileName,
      fileType: original.fileType,
      fileSize: original.fileSize,
      fileChecksum: original.fileChecksum,
      fileState: "ready_local",
      storageScope: "local-device",
    };
  });
  return cloned;
}

function projectedOuterPackageBytes({
  plaintextBytes,
  householdId,
  createdAt,
}) {
  const ciphertextBytes =
    plaintextBytes + VAULT_V1_CIPHERTEXT_OVERHEAD_BYTES;
  const kitWithoutCiphertext = {
    format: RECOVERY_KIT_FORMAT,
    version: RECOVERY_KIT_VERSION,
    createdAt,
    envelope: {
      version: VAULT_ENVELOPE_VERSION,
      context: {
        householdId,
        blobId:
          "recovery-kit-00000000-0000-4000-8000-000000000000",
        purpose: "portable-recovery-kit",
      },
      contentCipher: {
        name: "AES-GCM",
        keyBits: 256,
        tagBits: 128,
        iv: "A".repeat(16),
      },
      wrappedKey: {
        scheme: "PBKDF2-AES-GCM",
        hash: "SHA-256",
        iterations: DEFAULT_PBKDF2_ITERATIONS,
        salt: "A".repeat(24),
        iv: "A".repeat(16),
        data: "A".repeat(64),
      },
      ciphertext: "",
      ciphertextSha256: "a".repeat(64),
      ciphertextBytes,
      plaintextBytes,
      createdAt,
    },
  };
  return (
    utf8Bytes(JSON.stringify(kitWithoutCiphertext)) +
    base64Length(ciphertextBytes)
  );
}

/**
 * Projects the exact payload/base64 shape used by recovery-kit v2 before any
 * original bytes are read into one encryption buffer. It intentionally does
 * not claim compression or streaming support.
 */
export function projectRecoveryKitCapacity({
  workspace,
  originals = [],
  now,
} = {}) {
  const blockingReasons = [];
  const oversizedOriginals = [];
  let projectedPlaintextBytes = null;
  let projectedPackageBytes = null;
  let originalDataBase64Bytes = null;
  let createdAt = null;

  if (!Array.isArray(originals)) {
    blockingReasons.push({
      reason: "original_list_invalid",
      message: "The selected originals are not a valid backup list.",
    });
  } else {
    if (originals.length > MAX_RECOVERY_ORIGINALS) {
      blockingReasons.push({
        reason: "original_count_limit_exceeded",
        actual: originals.length,
        limit: MAX_RECOVERY_ORIGINALS,
        message: `One recovery kit can include at most ${MAX_RECOVERY_ORIGINALS} originals.`,
      });
    }
    for (const original of originals) {
      const fileSize = safePositiveInteger(original?.fileSize);
      if (!fileSize) {
        blockingReasons.push({
          reason: "original_size_invalid",
          evidenceId: normalizedText(original?.evidenceId) || null,
          fileName: normalizedText(original?.fileName) || "Unnamed original",
          message: "An included original does not have a valid byte size.",
        });
      } else if (fileSize > MAX_SINGLE_RECOVERY_ORIGINAL_BYTES) {
        oversizedOriginals.push({
          evidenceId: normalizedText(original?.evidenceId) || null,
          fileName: normalizedText(original?.fileName) || "Unnamed original",
          actual: fileSize,
          limit: MAX_SINGLE_RECOVERY_ORIGINAL_BYTES,
        });
      }
    }
    if (oversizedOriginals.length) {
      blockingReasons.push({
        reason: "single_original_limit_exceeded",
        files: freezeEntries(oversizedOriginals),
        message: "At least one original is larger than the 25 MB recovery-kit limit.",
      });
    }
  }

  try {
    createdAt = normalizeCreatedAt(now);
    const safeOriginals = Array.isArray(originals) ? originals : [];
    const originalManifest = safeOriginals.map((original) => ({
      evidenceId: original.evidenceId,
      originalVersionId: original.originalVersionId,
      fileName: original.fileName,
      fileType: original.fileType,
      fileSize: original.fileSize,
      fileChecksum: original.fileChecksum,
    }));
    const encodedOriginals = safeOriginals.map((original) => ({
      originalVersionId: original.originalVersionId,
      data: "",
    }));
    const projectedPayload = {
      format: RECOVERY_KIT_FORMAT,
      version: RECOVERY_KIT_PAYLOAD_VERSION,
      createdAt,
      workspace: sanitizeProjectedWorkspace(workspace, safeOriginals),
      originalManifest,
      originals: encodedOriginals,
    };
    originalDataBase64Bytes = safeOriginals.reduce((total, original) => {
      const fileSize = safePositiveInteger(original?.fileSize);
      return fileSize ? total + base64Length(fileSize) : total;
    }, 0);
    projectedPlaintextBytes =
      utf8Bytes(JSON.stringify(projectedPayload)) +
      originalDataBase64Bytes;
    projectedPackageBytes = projectedOuterPackageBytes({
      plaintextBytes: projectedPlaintextBytes,
      householdId: normalizedText(workspace?.household?.id),
      createdAt,
    });
    if (projectedPlaintextBytes > MAX_RECOVERY_PLAINTEXT_BYTES) {
      blockingReasons.push({
        reason: "plaintext_limit_exceeded",
        actual: projectedPlaintextBytes,
        limit: MAX_RECOVERY_PLAINTEXT_BYTES,
        message:
          "The projected recovery payload is larger than the 80 MB encryption limit.",
      });
    }
    if (projectedPackageBytes > MAX_RECOVERY_KIT_FILE_BYTES) {
      blockingReasons.push({
        reason: "package_limit_exceeded",
        actual: projectedPackageBytes,
        limit: MAX_RECOVERY_KIT_FILE_BYTES,
        message:
          "The projected encrypted recovery file is larger than the 115 MB package limit.",
      });
    }
  } catch {
    blockingReasons.push({
      reason: "workspace_not_serializable",
      message: "The workspace cannot be serialized into a recovery kit.",
    });
  }

  return Object.freeze({
    status: blockingReasons.length ? "blocked" : "ready",
    projectedPlaintextBytes,
    projectedPackageBytes,
    originalDataBase64Bytes,
    includedOriginalCount: Array.isArray(originals) ? originals.length : 0,
    limits: Object.freeze({
      maxOriginalCount: MAX_RECOVERY_ORIGINALS,
      maxSingleOriginalBytes: MAX_SINGLE_RECOVERY_ORIGINAL_BYTES,
      maxPlaintextBytes: MAX_RECOVERY_PLAINTEXT_BYTES,
      maxPackageBytes: MAX_RECOVERY_KIT_FILE_BYTES,
    }),
    blockingReasons: freezeEntries(blockingReasons),
  });
}

function defaultStorageEstimator() {
  const estimate = globalThis.navigator?.storage?.estimate;
  return typeof estimate === "function"
    ? () => estimate.call(globalThis.navigator.storage)
    : null;
}

/**
 * Browser quota is only an advisory signal. Downloads, memory pressure, and
 * browser eviction policies are not represented by StorageManager.estimate().
 */
export async function assessBrowserStorageCapacity({
  requiredBytes,
  estimateStorage = defaultStorageEstimator(),
} = {}) {
  const required = safePositiveInteger(requiredBytes);
  if (!required) {
    return Object.freeze({
      status: "unknown",
      reason: "required_size_unknown",
      requiredBytes: null,
      quotaBytes: null,
      usageBytes: null,
      availableBytes: null,
      advisory: true,
    });
  }
  if (typeof estimateStorage !== "function") {
    return Object.freeze({
      status: "unknown",
      reason: "storage_estimate_unavailable",
      requiredBytes: required,
      quotaBytes: null,
      usageBytes: null,
      availableBytes: null,
      advisory: true,
    });
  }

  try {
    const estimate = await estimateStorage();
    const quota = Number(estimate?.quota);
    const usage = Number(estimate?.usage);
    if (
      !Number.isFinite(quota) ||
      quota < 0 ||
      !Number.isFinite(usage) ||
      usage < 0
    ) {
      throw new TypeError("Invalid storage estimate.");
    }
    const quotaBytes = Math.floor(quota);
    const usageBytes = Math.floor(usage);
    const availableBytes = Math.max(0, quotaBytes - usageBytes);
    const adequate = availableBytes >= required;
    return Object.freeze({
      status: adequate ? "adequate" : "insufficient",
      reason: adequate
        ? "estimated_capacity_available"
        : "estimated_capacity_shortfall",
      requiredBytes: required,
      quotaBytes,
      usageBytes,
      availableBytes,
      advisory: true,
    });
  } catch {
    return Object.freeze({
      status: "unknown",
      reason: "storage_estimate_failed",
      requiredBytes: required,
      quotaBytes: null,
      usageBytes: null,
      availableBytes: null,
      advisory: true,
    });
  }
}

async function discoverUnfinishedDrafts({
  workspace,
  storageScopeId,
  storage,
  listRoomDrafts,
}) {
  let captureDraftCount = 0;
  let roomDraftCount = 0;
  let fileCount = 0;
  let knownBytes = 0;
  let unknownFileBytes = 0;
  const discoveryFailures = [];
  let discoveredSources = 0;

  if (storage?.getItem) {
    try {
      const raw = storage.getItem(
        storageKeysForScope(storageScopeId).captureDraft,
      );
      if (raw) {
        captureDraftCount = 1;
        try {
          const draft = JSON.parse(raw);
          if (draft?.hasFile) {
            fileCount += 1;
            unknownFileBytes += 1;
          }
        } catch {
          discoveryFailures.push({
            source: "asset_capture",
            reason: "draft_metadata_unreadable",
          });
        }
      }
      discoveredSources += 1;
    } catch {
      discoveryFailures.push({
        source: "asset_capture",
        reason: "draft_storage_unavailable",
      });
    }
  } else {
    discoveryFailures.push({
      source: "asset_capture",
      reason: "draft_storage_unsupported",
    });
  }

  if (typeof listRoomDrafts === "function") {
    try {
      const records = await listRoomDrafts({
        householdId: normalizedText(workspace?.household?.id) || undefined,
      });
      const unfinished = (Array.isArray(records) ? records : []).filter(
        (record) => normalizedText(record?.status) !== "committed",
      );
      roomDraftCount = unfinished.length;
      for (const record of unfinished) {
        const itemCount = Number(record?.itemCount);
        const totalBytes = Number(record?.totalBytes);
        if (Number.isSafeInteger(itemCount) && itemCount > 0) {
          fileCount += itemCount;
        }
        if (Number.isSafeInteger(totalBytes) && totalBytes >= 0) {
          knownBytes += totalBytes;
        } else if (itemCount > 0) {
          unknownFileBytes += itemCount;
        }
      }
      discoveredSources += 1;
    } catch {
      discoveryFailures.push({
        source: "room_capture",
        reason: "draft_storage_unavailable",
      });
    }
  } else {
    discoveryFailures.push({
      source: "room_capture",
      reason: "draft_storage_unsupported",
    });
  }

  return Object.freeze({
    status:
      discoveredSources === 2
        ? discoveryFailures.length
          ? "partial"
          : "known"
        : discoveredSources
          ? "partial"
          : "unknown",
    excluded: captureDraftCount + roomDraftCount > 0,
    totalDraftCount: captureDraftCount + roomDraftCount,
    captureDraftCount,
    roomDraftCount,
    fileCount,
    knownBytes,
    unknownFileBytes,
    discoveryFailures: freezeEntries(discoveryFailures),
  });
}

function coverageResult({
  referencedOriginalCount,
  originals,
  missing,
  integrityFailures,
}) {
  const status = integrityFailures.length
    ? "blocked"
    : missing.length
      ? "partial"
      : "ready";
  return Object.freeze({
    status,
    referencedOriginalCount,
    includedOriginalCount: originals.length,
    missingOriginalCount: missing.length,
    integrityFailureCount: integrityFailures.length,
    originalBytes: originals.reduce(
      (total, original) => total + original.fileSize,
      0,
    ),
    originalVersionIds: Object.freeze(
      originals.map((original) => original.originalVersionId),
    ),
    missing: freezeEntries(missing),
    integrityFailures: freezeEntries(integrityFailures),
  });
}

/**
 * Produces the complete, user-reviewable backup input. Callers must only pass
 * `result.originals` to encryption when `result.status !== "blocked"`.
 */
export async function runBackupPreflight({
  workspace,
  storageScopeId,
  storage = globalThis.window?.localStorage,
  loadEvidenceFile = getEvidenceFile,
  hashBlob = sha256ForBlob,
  listRoomDrafts = roomCaptureStore.listRecoverable,
  estimateStorage = defaultStorageEstimator(),
  now,
} = {}) {
  const scopeId = requireStorageScopeId(storageScopeId);
  if (typeof loadEvidenceFile !== "function") {
    throw new TypeError("Backup preflight requires an evidence-file reader.");
  }
  if (typeof hashBlob !== "function") {
    throw new TypeError("Backup preflight requires a SHA-256 file verifier.");
  }

  const inspected = await inspectOriginalCoverage({
    workspace,
    hashBlob,
    loadRecord: (evidence) =>
      loadEvidenceFile(evidence.id, { scopeId }),
  });
  const coverage = coverageResult(inspected);
  const capacity = projectRecoveryKitCapacity({
    workspace,
    originals: inspected.originals,
    now,
  });
  const drafts = await discoverUnfinishedDrafts({
    workspace,
    storageScopeId: scopeId,
    storage,
    listRoomDrafts,
  });
  const browserStorage = await assessBrowserStorageCapacity({
    requiredBytes: capacity.projectedPackageBytes,
    estimateStorage,
  });
  const status =
    coverage.status === "blocked" || capacity.status === "blocked"
      ? "blocked"
      : coverage.status === "partial" || drafts.excluded
        ? "partial"
        : "ready";

  return Object.freeze({
    version: BACKUP_PREFLIGHT_VERSION,
    kind: "backup",
    status,
    coverage,
    capacity,
    browserStorage,
    drafts,
    originals: Object.freeze(inspected.originals),
  });
}

function compareRestoreDeclaration(recovered, coverage, originals) {
  const failures = [];
  const manifest = Array.isArray(recovered?.manifest)
    ? recovered.manifest
    : [];
  const manifestByEvidenceId = new Map();
  for (const item of manifest) {
    const evidenceId = normalizedText(item?.evidenceId);
    if (!evidenceId || manifestByEvidenceId.has(evidenceId)) {
      failures.push(
        integrityEntry(
          item,
          "restore_manifest_identity_invalid",
          "The restore manifest contains a missing or duplicate evidence identity.",
        ),
      );
      continue;
    }
    manifestByEvidenceId.set(evidenceId, item);
  }
  for (const original of originals) {
    const declared = manifestByEvidenceId.get(original.evidenceId);
    if (
      !declared ||
      normalizedOriginalVersionId(declared.originalVersionId) !==
        original.originalVersionId ||
      normalizedChecksum(declared.fileChecksum) !== original.fileChecksum ||
      normalizedText(declared.fileName) !== original.fileName ||
      normalizedMimeType(declared.fileType) !== original.fileType ||
      safePositiveInteger(declared.fileSize) !== original.fileSize
    ) {
      failures.push(
        integrityEntry(
          original,
          "restore_manifest_mismatch",
          "A restored original no longer matches its authenticated manifest.",
        ),
      );
    }
  }
  if (manifest.length !== originals.length) {
    failures.push(
      integrityEntry(
        null,
        "restore_manifest_count_mismatch",
        "The restore manifest and restored originals have different counts.",
      ),
    );
  }

  const declaredCoverage = recovered?.coverage;
  const declaredVersionIds = Array.isArray(
    declaredCoverage?.originalVersionIds,
  )
    ? declaredCoverage.originalVersionIds
        .map(normalizedOriginalVersionId)
        .sort()
    : null;
  const actualVersionIds = originals
    .map((original) => original.originalVersionId)
    .sort();
  if (
    !declaredCoverage ||
    Number(declaredCoverage.referencedOriginalCount) !==
      coverage.referencedOriginalCount ||
    Number(declaredCoverage.includedOriginalCount) !==
      coverage.includedOriginalCount ||
    Number(declaredCoverage.missingOriginalCount) !==
      coverage.missingOriginalCount ||
    Number(declaredCoverage.originalBytes) !== coverage.originalBytes ||
    !declaredVersionIds ||
    declaredVersionIds.length !== actualVersionIds.length ||
    declaredVersionIds.some(
      (versionId, index) => versionId !== actualVersionIds[index],
    )
  ) {
    failures.push(
      integrityEntry(
        null,
        "restore_coverage_mismatch",
        "The restore coverage summary does not match its actual contents.",
      ),
    );
  }
  return failures;
}

/**
 * Rechecks decrypted recovery inputs immediately before staging. Decryption is
 * still the authentication boundary; this catches mutated in-memory inputs and
 * keeps partial coverage explicit at the restore confirmation step.
 */
export async function runRestorePreflight({
  recovered,
  hashBlob = sha256ForBlob,
  estimateStorage = defaultStorageEstimator(),
} = {}) {
  const workspace = recovered?.workspace;
  const suppliedOriginals = Array.isArray(recovered?.originals)
    ? recovered.originals
    : [];
  const referencedEvidenceIds = new Set(
    (Array.isArray(workspace?.evidence) ? workspace.evidence : [])
      .filter((evidence) => normalizedText(evidence?.fileName))
      .map((evidence) => normalizedText(evidence?.id))
      .filter(Boolean),
  );
  const recordsByEvidenceId = new Map();
  const initialIntegrityFailures = [];
  for (const original of suppliedOriginals) {
    const evidenceId = normalizedText(original?.evidenceId);
    if (!evidenceId || recordsByEvidenceId.has(evidenceId)) {
      initialIntegrityFailures.push(
        integrityEntry(
          original,
          "restore_original_identity_invalid",
          "The restore contains a missing or duplicate original identity.",
        ),
      );
      continue;
    }
    if (!referencedEvidenceIds.has(evidenceId)) {
      initialIntegrityFailures.push(
        integrityEntry(
          original,
          "restore_original_orphaned",
          "The restore contains an original that is not linked to workspace evidence.",
        ),
      );
      continue;
    }
    recordsByEvidenceId.set(evidenceId, {
      ...original,
      id: evidenceId,
    });
  }

  const inspected = await inspectOriginalCoverage({
    workspace,
    hashBlob,
    initialIntegrityFailures,
    loadRecord: (evidence) =>
      Promise.resolve(recordsByEvidenceId.get(evidence.id) || null),
  });
  let coverage = coverageResult(inspected);
  const declarationFailures = compareRestoreDeclaration(
    recovered,
    coverage,
    inspected.originals,
  );
  if (declarationFailures.length) {
    coverage = coverageResult({
      ...inspected,
      integrityFailures: [
        ...inspected.integrityFailures,
        ...declarationFailures,
      ],
    });
  }

  let workspaceBytes = null;
  try {
    workspaceBytes = utf8Bytes(JSON.stringify(workspace));
  } catch {
    // Coverage already blocks malformed workspace evidence; quota stays honest.
  }
  const requiredStagingBytes =
    workspaceBytes == null ? null : workspaceBytes + coverage.originalBytes;
  const browserStorage = await assessBrowserStorageCapacity({
    requiredBytes: requiredStagingBytes,
    estimateStorage,
  });

  return Object.freeze({
    version: BACKUP_PREFLIGHT_VERSION,
    kind: "restore",
    status: coverage.status,
    coverage,
    requiredStagingBytes,
    browserStorage,
    originals: Object.freeze(inspected.originals),
  });
}
