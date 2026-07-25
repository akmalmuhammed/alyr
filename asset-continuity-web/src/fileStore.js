import { createSafePreviewMetadata } from "./securityVault.js";
import { createOriginalVersionId } from "./recoveryKit.js";
import {
  LOCAL_DEMO_SCOPE_ID,
  isAccountStorageScopeId,
  requireStorageGenerationId,
  requireStorageScopeId,
} from "./storageScope.js";

const DATABASE_NAME = "alyr-continuity-files";
const DATABASE_VERSION = 3;
const FILE_STORE = "evidence-files";
const ORIGINAL_VERSION_STORE = "evidence-original-versions";
const DRAFT_FILE_STORE = "capture-draft-files";
const RECOVERY_STORE = "recovery-generations";
const SCOPED_RECORD_PREFIX = "scope:";
const ORIGINAL_VERSION_RECORD_PREFIX = "original-version:";
const RECOVERY_HEAD_PREFIX = "head:";
const RECOVERY_GENERATION_PREFIX = "generation:";
const WORKSPACE_EVIDENCE_OPERATION_PREFIX =
  "workspace-evidence-operation:";
const MAX_WORKSPACE_EVIDENCE_OPERATION_RECEIPTS = 128;

export const RECOVERY_PERSISTENCE_FORMAT =
  "continuity-indexeddb-recovery";
export const RECOVERY_PERSISTENCE_VERSION = 1;

export const MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;
export { LOCAL_DEMO_SCOPE_ID };
export const LOCAL_DEMO_FILE_SCOPE_ID = LOCAL_DEMO_SCOPE_ID;

const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function indexedDbAvailable() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error || new Error("Browser file storage failed.")),
      { once: true },
    );
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () =>
        reject(
          transaction.error || new Error("Browser file storage was interrupted."),
        ),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () =>
        reject(transaction.error || new Error("Browser file storage failed.")),
      { once: true },
    );
  });
}

let databasePromise = null;

function openDatabase() {
  if (!indexedDbAvailable()) {
    return Promise.reject(
      new Error("This browser does not support durable on-device file storage."),
    );
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(ORIGINAL_VERSION_STORE)) {
        database.createObjectStore(ORIGINAL_VERSION_STORE, {
          keyPath: "id",
        });
      }
      if (!database.objectStoreNames.contains(DRAFT_FILE_STORE)) {
        database.createObjectStore(DRAFT_FILE_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(RECOVERY_STORE)) {
        database.createObjectStore(RECOVERY_STORE, { keyPath: "id" });
      }
    });
    request.addEventListener(
      "success",
      () => {
        const database = request.result;
        if (typeof database.addEventListener === "function") {
          database.addEventListener(
            "versionchange",
            () => {
              database.close();
              databasePromise = null;
            },
            { once: true },
          );
        }
        resolve(database);
      },
      { once: true },
    );
    request.addEventListener(
      "error",
      () => {
        databasePromise = null;
        reject(request.error || new Error("Could not open browser file storage."));
      },
      { once: true },
    );
    request.addEventListener(
      "blocked",
      () => {
        databasePromise = null;
        reject(
          new Error(
            "Browser file storage is busy in another tab. Close the other tab and retry.",
          ),
        );
      },
      { once: true },
    );
  });
  return databasePromise;
}

async function writeRecord(storeName, record) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(record);
  await transactionComplete(transaction);
  return publicRecord(record);
}

async function readRecord(storeName, id, scopeId, generationId = null) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  let result = await requestResult(
    store.get(scopedRecordId(scopeId, id, generationId)),
  );
  if (
    result &&
    (!recordBelongsToScope(result, scopeId) ||
      !recordBelongsToGeneration(result, generationId))
  ) {
    result = null;
  }
  if (
    !result &&
    !generationId &&
    scopeId === LOCAL_DEMO_FILE_SCOPE_ID
  ) {
    const legacy = await requestResult(store.get(id));
    result = isLegacyLocalDemoRecord(legacy) ? legacy : null;
  }
  await transactionComplete(transaction);
  return result ? publicRecord(result) : null;
}

async function deleteRecord(storeName, id, scopeId, generationId = null) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  store.delete(scopedRecordId(scopeId, id, generationId));
  if (
    !generationId &&
    scopeId === LOCAL_DEMO_FILE_SCOPE_ID
  ) {
    const legacy = await requestResult(store.get(id));
    if (isLegacyLocalDemoRecord(legacy)) store.delete(id);
  }
  await transactionComplete(transaction);
}

function normalizeRecordId(value, label = "recordId") {
  const id = String(value || "").trim();
  if (!id || id.length > 512) {
    throw new TypeError(`${label} must be a non-empty identifier.`);
  }
  return id;
}

function normalizeScopeId(value) {
  return requireStorageScopeId(value);
}

function scopeFromOptions(options) {
  if (options === undefined) return LOCAL_DEMO_FILE_SCOPE_ID;
  if (typeof options === "string") return normalizeScopeId(options);
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    !Object.hasOwn(options, "scopeId")
  ) {
    throw new TypeError("Pass an explicit scopeId for scoped file storage.");
  }
  return normalizeScopeId(options.scopeId);
}

function explicitGenerationFromOptions(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    !Object.hasOwn(options, "generationId")
  ) {
    return undefined;
  }
  return options.generationId
    ? requireStorageGenerationId(options.generationId)
    : null;
}

function scopedRecordId(scopeId, logicalId, generationId = null) {
  const generationSegment = generationId
    ? `generation:${encodeURIComponent(
        requireStorageGenerationId(generationId),
      )}:`
    : "";
  return `${SCOPED_RECORD_PREFIX}${encodeURIComponent(
    normalizeScopeId(scopeId),
  )}:${generationSegment}${encodeURIComponent(normalizeRecordId(logicalId))}`;
}

function originalVersionRecordId(
  scopeId,
  evidenceId,
  originalVersionId,
  generationId = null,
) {
  const generationSegment = generationId
    ? `generation:${encodeURIComponent(
        requireStorageGenerationId(generationId),
      )}:`
    : "";
  return `${ORIGINAL_VERSION_RECORD_PREFIX}${encodeURIComponent(
    normalizeScopeId(scopeId),
  )}:${generationSegment}${encodeURIComponent(
    normalizeRecordId(evidenceId, "evidenceId"),
  )}:${encodeURIComponent(
    normalizeOriginalVersionId(originalVersionId),
  )}`;
}

function normalizeOriginalVersionId(value) {
  const originalVersionId = String(value || "").trim();
  if (!/^ov_[a-f0-9]{64}$/u.test(originalVersionId)) {
    throw new TypeError(
      "originalVersionId must be a content-derived immutable identifier.",
    );
  }
  return originalVersionId;
}

function isOriginalVersionRecord(record) {
  return record?.recordKind === "original-version";
}

function isLegacyLocalDemoRecord(record) {
  return Boolean(
    record &&
      !record.scopeId &&
      !record.logicalId &&
      typeof record.id === "string" &&
      !record.id.startsWith(SCOPED_RECORD_PREFIX),
  );
}

function recordLogicalId(record) {
  return normalizeRecordId(
    record?.logicalId || (isLegacyLocalDemoRecord(record) ? record.id : ""),
  );
}

function recordBelongsToScope(record, scopeId) {
  if (record?.scopeId === scopeId) return true;
  return (
    scopeId === LOCAL_DEMO_FILE_SCOPE_ID &&
    isLegacyLocalDemoRecord(record)
  );
}

function recordBelongsToGeneration(record, generationId = null) {
  const recordGenerationId = record?.generationId
    ? requireStorageGenerationId(record.generationId)
    : null;
  return recordGenerationId === (generationId || null);
}

function publicRecord(record) {
  const result = {
    ...record,
    id: recordLogicalId(record),
    scopeId: record.scopeId || LOCAL_DEMO_FILE_SCOPE_ID,
  };
  delete result.logicalId;
  return result;
}

function scopedRecord(scopeId, logicalId, value, generationId = null) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedLogicalId = normalizeRecordId(logicalId);
  const normalizedGenerationId = generationId
    ? requireStorageGenerationId(generationId)
    : null;
  return {
    ...value,
    id: scopedRecordId(
      normalizedScopeId,
      normalizedLogicalId,
      normalizedGenerationId,
    ),
    logicalId: normalizedLogicalId,
    scopeId: normalizedScopeId,
    ...(normalizedGenerationId
      ? { generationId: normalizedGenerationId }
      : {}),
  };
}

function scopedOriginalVersionRecord(currentRecord) {
  const scopeId = normalizeScopeId(currentRecord?.scopeId);
  const evidenceId = recordLogicalId(currentRecord);
  const generationId = currentRecord?.generationId
    ? requireStorageGenerationId(currentRecord.generationId)
    : null;
  const originalVersionId = normalizeOriginalVersionId(
    currentRecord?.originalVersionId,
  );
  return {
    id: originalVersionRecordId(
      scopeId,
      evidenceId,
      originalVersionId,
      generationId,
    ),
    recordKind: "original-version",
    logicalId: evidenceId,
    scopeId,
    ...(generationId ? { generationId } : {}),
    originalVersionId,
    blob: currentRecord.blob,
    fileName: currentRecord.fileName,
    fileType: currentRecord.fileType,
    fileSize: currentRecord.fileSize,
    fileChecksum: currentRecord.fileChecksum,
    storedAt: currentRecord.storedAt,
    ...(currentRecord.claimedFromScopeId
      ? { claimedFromScopeId: currentRecord.claimedFromScopeId }
      : {}),
  };
}

function originalVersionsForEvidence(
  records,
  scopeId,
  evidenceId,
  generationId = null,
) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedEvidenceId = normalizeRecordId(
    evidenceId,
    "evidenceId",
  );
  return (records || []).filter(
    (record) =>
      isOriginalVersionRecord(record) &&
      recordBelongsToScope(record, normalizedScopeId) &&
      recordBelongsToGeneration(record, generationId) &&
      recordLogicalId(record) === normalizedEvidenceId,
  );
}

function assertImmutableVersionMatch(existing, candidate) {
  const fields = [
    "id",
    "logicalId",
    "scopeId",
    "generationId",
    "originalVersionId",
    "fileName",
    "fileType",
    "fileSize",
    "fileChecksum",
  ];
  const matches =
    isOriginalVersionRecord(existing) &&
    fields.every(
      (field) => (existing[field] ?? null) === (candidate[field] ?? null),
    ) &&
    existing.blob instanceof Blob &&
    existing.blob.size === candidate.blob.size &&
    String(existing.blob.type || "").toLowerCase() ===
      String(candidate.blob.type || "").toLowerCase();
  if (!matches) {
    throw integrityError(
      "An immutable original version already exists with conflicting metadata.",
    );
  }
  return existing;
}

async function ensureOriginalVersionRecord(
  store,
  currentRecord,
  existingById = null,
) {
  const candidate = scopedOriginalVersionRecord(currentRecord);
  const existing = existingById
    ? existingById.get(candidate.id)
    : await requestResult(store.get(candidate.id));
  if (existing) {
    return assertImmutableVersionMatch(existing, candidate);
  }
  store.put(candidate);
  if (existingById) existingById.set(candidate.id, candidate);
  return candidate;
}

function currentRecordFromVersion(currentRecord, versionRecord) {
  return scopedRecord(
    currentRecord.scopeId,
    recordLogicalId(currentRecord),
    {
      recordKind: "original-current",
      blob: versionRecord.blob,
      fileName: versionRecord.fileName,
      fileType: versionRecord.fileType,
      fileSize: versionRecord.fileSize,
      fileChecksum: versionRecord.fileChecksum,
      originalVersionId: versionRecord.originalVersionId,
      storedAt: versionRecord.storedAt,
      ...(currentRecord.claimedFromScopeId
        ? { claimedFromScopeId: currentRecord.claimedFromScopeId }
        : {}),
    },
    currentRecord.generationId || null,
  );
}

function publicOriginalVersionRecord(record, currentVersionId = null) {
  const result =
    record?.logicalId || isLegacyLocalDemoRecord(record)
      ? publicRecord(record)
      : { ...record };
  return Object.freeze({
    ...result,
    isCurrent:
      normalizeOriginalVersionId(result.originalVersionId) ===
      (currentVersionId
        ? normalizeOriginalVersionId(currentVersionId)
        : null),
  });
}

function recordsForScope(records, scopeId, generationId = null) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const byLogicalId = new Map();
  for (const record of records || []) {
    if (isOriginalVersionRecord(record)) continue;
    if (!recordBelongsToScope(record, normalizedScopeId)) continue;
    if (!recordBelongsToGeneration(record, generationId)) continue;
    const logicalId = recordLogicalId(record);
    const current = byLogicalId.get(logicalId);
    if (!current || !isLegacyLocalDemoRecord(record)) {
      byLogicalId.set(logicalId, record);
    }
  }
  return [...byLogicalId.values()];
}

async function getAllRecords(storeName) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const records = await requestResult(
    transaction.objectStore(storeName).getAll(),
  );
  await transactionComplete(transaction);
  return records || [];
}

async function readOriginalVersionRecord(
  evidenceId,
  originalVersionId,
  scopeId,
  generationId = null,
) {
  const database = await openDatabase();
  const transaction = database.transaction(
    ORIGINAL_VERSION_STORE,
    "readonly",
  );
  const record = await requestResult(
    transaction
      .objectStore(ORIGINAL_VERSION_STORE)
      .get(
        originalVersionRecordId(
          scopeId,
          evidenceId,
          originalVersionId,
          generationId,
        ),
      ),
  );
  await transactionComplete(transaction);
  if (
    !record ||
    !isOriginalVersionRecord(record) ||
    !recordBelongsToScope(record, scopeId) ||
    !recordBelongsToGeneration(record, generationId) ||
    recordLogicalId(record) !== evidenceId
  ) {
    return null;
  }
  return record;
}

function deleteScopeRecords(store, records, scopeId) {
  for (const record of records || []) {
    if (recordBelongsToScope(record, scopeId)) store.delete(record.id);
  }
}

function deleteGenerationRecords(
  store,
  records,
  scopeId,
  generationId = null,
) {
  for (const record of records || []) {
    if (
      recordBelongsToScope(record, scopeId) &&
      recordBelongsToGeneration(record, generationId)
    ) {
      store.delete(record.id);
    }
  }
}

function encodedScopeId(scopeId) {
  return encodeURIComponent(normalizeScopeId(scopeId));
}

function recoveryHeadRecordId(scopeId) {
  return `${RECOVERY_HEAD_PREFIX}${encodedScopeId(scopeId)}`;
}

function recoveryGenerationRecordId(scopeId, generationId = null) {
  const generationSegment = generationId
    ? encodeURIComponent(requireStorageGenerationId(generationId))
    : "base";
  return `${RECOVERY_GENERATION_PREFIX}${encodedScopeId(
    scopeId,
  )}:${generationSegment}`;
}

function workspaceEvidenceOperationRecordId(scopeId, operationId) {
  return `${WORKSPACE_EVIDENCE_OPERATION_PREFIX}${encodedScopeId(
    scopeId,
  )}:${encodeURIComponent(
    normalizeRecordId(operationId, "operationId"),
  )}`;
}

function recoveryRecordBelongsToScope(record, scopeId) {
  return record?.scopeId === normalizeScopeId(scopeId);
}

function recoveryError(message, code = "RECOVERY_PERSISTENCE_FAILED") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeRevision(value, label = "revision") {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw recoveryError(
      `${label} must be a non-negative integer.`,
      "RECOVERY_REVISION_INVALID",
    );
  }
  return revision;
}

function normalizePersistenceTimestamp(value, label = "timestamp") {
  try {
    return new Date(value).toISOString();
  } catch {
    throw recoveryError(
      `${label} is invalid.`,
      "RECOVERY_TIMESTAMP_INVALID",
    );
  }
}

function validateRecoveryHead(record, scopeId) {
  if (!record) return null;
  const normalizedScopeId = normalizeScopeId(scopeId);
  const activeGenerationId = record.activeGenerationId
    ? requireStorageGenerationId(record.activeGenerationId)
    : null;
  if (
    record.id !== recoveryHeadRecordId(normalizedScopeId) ||
    record.kind !== "head" ||
    record.format !== RECOVERY_PERSISTENCE_FORMAT ||
    record.version !== RECOVERY_PERSISTENCE_VERSION ||
    record.scopeId !== normalizedScopeId ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw recoveryError(
      "The authoritative recovery head failed validation.",
      "RECOVERY_HEAD_INVALID",
    );
  }
  normalizeRevision(record.revision, "The recovery head revision");
  if (record.rollback) {
    const rollback = record.rollback;
    if (
      rollback.format !== RECOVERY_PERSISTENCE_FORMAT ||
      rollback.version !== RECOVERY_PERSISTENCE_VERSION ||
      rollback.scopeId !== normalizedScopeId ||
      rollback.activatedGenerationId !== activeGenerationId ||
      (rollback.previousGenerationId &&
        requireStorageGenerationId(rollback.previousGenerationId) !==
          rollback.previousGenerationId) ||
      !Number.isFinite(Date.parse(rollback.createdAt))
    ) {
      throw recoveryError(
        "The authoritative recovery rollback record failed validation.",
        "RECOVERY_ROLLBACK_INVALID",
      );
    }
  }
  return record;
}

function validateRecoveryGeneration(record, scopeId, generationId) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedGenerationId = generationId
    ? requireStorageGenerationId(generationId)
    : null;
  if (
    !record ||
    record.id !==
      recoveryGenerationRecordId(
        normalizedScopeId,
        normalizedGenerationId,
      ) ||
    record.kind !== "generation" ||
    record.format !== RECOVERY_PERSISTENCE_FORMAT ||
    record.version !== RECOVERY_PERSISTENCE_VERSION ||
    record.scopeId !== normalizedScopeId ||
    (record.generationId || null) !== normalizedGenerationId ||
    typeof record.workspaceRaw !== "string" ||
    !record.workspaceRaw ||
    !Number.isFinite(Date.parse(record.createdAt))
  ) {
    throw recoveryError(
      "The authoritative workspace generation is missing or invalid.",
      "RECOVERY_GENERATION_INVALID",
    );
  }
  try {
    const workspace = JSON.parse(record.workspaceRaw);
    if (
      !workspace ||
      typeof workspace !== "object" ||
      Array.isArray(workspace) ||
      !String(workspace.household?.id || "").trim()
    ) {
      throw new Error("Missing household identity.");
    }
  } catch {
    throw recoveryError(
      "The authoritative workspace generation is unreadable.",
      "RECOVERY_GENERATION_INVALID",
    );
  }
  return record;
}

function createRecoveryGenerationRecord({
  scopeId,
  generationId = null,
  workspaceRaw,
  createdAt,
}) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedGenerationId = generationId
    ? requireStorageGenerationId(generationId)
    : null;
  if (typeof workspaceRaw !== "string" || !workspaceRaw) {
    throw recoveryError(
      "A serialized workspace is required for this generation.",
      "RECOVERY_WORKSPACE_INVALID",
    );
  }
  const record = {
    id: recoveryGenerationRecordId(
      normalizedScopeId,
      normalizedGenerationId,
    ),
    kind: "generation",
    format: RECOVERY_PERSISTENCE_FORMAT,
    version: RECOVERY_PERSISTENCE_VERSION,
    scopeId: normalizedScopeId,
    generationId: normalizedGenerationId,
    workspaceRaw,
    createdAt: normalizePersistenceTimestamp(
      createdAt,
      "The generation timestamp",
    ),
  };
  return validateRecoveryGeneration(
    record,
    normalizedScopeId,
    normalizedGenerationId,
  );
}

function createRecoveryHeadRecord({
  scopeId,
  revision,
  activeGenerationId = null,
  rollback = null,
  updatedAt,
}) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedGenerationId = activeGenerationId
    ? requireStorageGenerationId(activeGenerationId)
    : null;
  return {
    id: recoveryHeadRecordId(normalizedScopeId),
    kind: "head",
    format: RECOVERY_PERSISTENCE_FORMAT,
    version: RECOVERY_PERSISTENCE_VERSION,
    scopeId: normalizedScopeId,
    revision: normalizeRevision(revision),
    activeGenerationId: normalizedGenerationId,
    rollback,
    updatedAt: normalizePersistenceTimestamp(
      updatedAt,
      "The recovery head timestamp",
    ),
  };
}

function validateWorkspaceEvidenceOperationReceipt(
  record,
  scopeId,
  operationId,
) {
  if (!record) return null;
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedOperationId = normalizeRecordId(
    operationId,
    "operationId",
  );
  const activeGenerationId = record.activeGenerationId
    ? requireStorageGenerationId(record.activeGenerationId)
    : null;
  if (
    record.id !==
      workspaceEvidenceOperationRecordId(
        normalizedScopeId,
        normalizedOperationId,
      ) ||
    record.kind !== "workspace-evidence-operation" ||
    record.format !== RECOVERY_PERSISTENCE_FORMAT ||
    record.version !== RECOVERY_PERSISTENCE_VERSION ||
    record.scopeId !== normalizedScopeId ||
    record.operationId !== normalizedOperationId ||
    typeof record.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/u.test(record.fingerprint) ||
    !Array.isArray(record.records) ||
    !Number.isFinite(Date.parse(record.committedAt))
  ) {
    throw recoveryError(
      "The saved capture-operation receipt failed validation.",
      "CAPTURE_OPERATION_RECEIPT_INVALID",
    );
  }
  normalizeRevision(record.revision, "The capture-operation revision");
  return {
    ...record,
    activeGenerationId,
  };
}

function publicWorkspaceEvidenceOperationResult(
  receipt,
  idempotent,
) {
  return Object.freeze({
    scopeId: receipt.scopeId,
    operationId: receipt.operationId,
    revision: receipt.revision,
    activeGenerationId: receipt.activeGenerationId,
    records: Object.freeze(
      receipt.records.map((record) => Object.freeze({ ...record })),
    ),
    committedAt: receipt.committedAt,
    idempotent: Boolean(idempotent),
  });
}

async function abortTransaction(transaction, completion) {
  if (typeof transaction.abort === "function") {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have aborted because of a failed request.
    }
  }
  try {
    await completion;
  } catch {
    // The caller receives the more specific domain error.
  }
}

async function workspaceEvidenceOperationFingerprint(
  workspaceRaw,
  preparedRecords,
) {
  const signature = preparedRecords.map((record) => ({
    evidenceId: recordLogicalId(record),
    fileName: record.fileName,
    fileType: record.fileType,
    fileSize: record.fileSize,
    fileChecksum: record.fileChecksum,
    originalVersionId: record.originalVersionId,
  }));
  return sha256ForBlob(
    new Blob(
      [
        JSON.stringify({
          workspaceRaw,
          records: signature,
        }),
      ],
      { type: "text/plain" },
    ),
  );
}

function assertWorkspaceReferencesPreparedEvidence(
  workspaceRaw,
  preparedRecords,
) {
  let workspace;
  try {
    workspace = JSON.parse(workspaceRaw);
  } catch {
    throw recoveryError(
      "The capture workspace is unreadable.",
      "CAPTURE_WORKSPACE_INVALID",
    );
  }
  const evidence = Array.isArray(workspace?.evidence)
    ? workspace.evidence
    : [];
  const evidenceById = new Map(
    evidence.map((item) => [String(item?.id || "").trim(), item]),
  );
  for (const record of preparedRecords) {
    const evidenceId = recordLogicalId(record);
    const item = evidenceById.get(evidenceId);
    if (!item) {
      throw recoveryError(
        `The capture workspace does not reference original ${evidenceId}.`,
        "CAPTURE_EVIDENCE_REFERENCE_MISSING",
      );
    }
    const matches =
      item.fileState === "ready_local" &&
      String(item.fileName || "").trim() === record.fileName &&
      String(item.fileType || "").trim().toLowerCase() ===
        record.fileType &&
      Number(item.fileSize) === Number(record.fileSize) &&
      String(item.fileChecksum || "").trim().toLowerCase() ===
        record.fileChecksum &&
      String(item.originalVersionId || "").trim() ===
        record.originalVersionId;
    if (!matches) {
      throw recoveryError(
        `The capture workspace metadata for ${evidenceId} does not match its verified original.`,
        "CAPTURE_EVIDENCE_METADATA_MISMATCH",
      );
    }
  }
  return workspace;
}

export async function readRecoveryPersistenceState(scopeId) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const database = await openDatabase();
  const transaction = database.transaction(RECOVERY_STORE, "readonly");
  const store = transaction.objectStore(RECOVERY_STORE);
  const head = validateRecoveryHead(
    await requestResult(store.get(recoveryHeadRecordId(normalizedScopeId))),
    normalizedScopeId,
  );
  if (!head) {
    await transactionComplete(transaction);
    return null;
  }
  const generation = validateRecoveryGeneration(
    await requestResult(
      store.get(
        recoveryGenerationRecordId(
          normalizedScopeId,
          head.activeGenerationId,
        ),
      ),
    ),
    normalizedScopeId,
    head.activeGenerationId,
  );
  let rollbackWorkspaceRaw = null;
  if (head.rollback) {
    rollbackWorkspaceRaw = validateRecoveryGeneration(
      await requestResult(
        store.get(
          recoveryGenerationRecordId(
            normalizedScopeId,
            head.rollback.previousGenerationId ?? null,
          ),
        ),
      ),
      normalizedScopeId,
      head.rollback.previousGenerationId ?? null,
    ).workspaceRaw;
  }
  await transactionComplete(transaction);
  return Object.freeze({
    scopeId: normalizedScopeId,
    revision: head.revision,
    activeGenerationId: head.activeGenerationId,
    workspaceRaw: generation.workspaceRaw,
    rollback: head.rollback ? Object.freeze({ ...head.rollback }) : null,
    rollbackWorkspaceRaw,
    updatedAt: head.updatedAt,
  });
}

async function readActiveEvidenceGenerationId(scopeId) {
  return (await readRecoveryPersistenceState(scopeId))
    ?.activeGenerationId ?? null;
}

async function activeGenerationFromRecoveryStore(store, scopeId) {
  const head = validateRecoveryHead(
    await requestResult(store.get(recoveryHeadRecordId(scopeId))),
    scopeId,
  );
  return head?.activeGenerationId ?? null;
}

async function readActiveEvidenceRecord(logicalId, scopeId) {
  const database = await openDatabase();
  const transaction = database.transaction(
    [FILE_STORE, ORIGINAL_VERSION_STORE, RECOVERY_STORE],
    "readonly",
  );
  const completion = transactionComplete(transaction);
  const fileStore = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(ORIGINAL_VERSION_STORE);
  const recoveryStore = transaction.objectStore(RECOVERY_STORE);
  try {
    const generationId = await activeGenerationFromRecoveryStore(
      recoveryStore,
      scopeId,
    );
    let result = await requestResult(
      fileStore.get(scopedRecordId(scopeId, logicalId, generationId)),
    );
    if (
      result &&
      (!recordBelongsToScope(result, scopeId) ||
        !recordBelongsToGeneration(result, generationId))
    ) {
      result = null;
    }
    if (
      !result &&
      !generationId &&
      scopeId === LOCAL_DEMO_FILE_SCOPE_ID
    ) {
      const legacy = await requestResult(fileStore.get(logicalId));
      result = isLegacyLocalDemoRecord(legacy) ? legacy : null;
    }
    if (result?.originalVersionId) {
      const immutableVersion = await requestResult(
        versionStore.get(
          originalVersionRecordId(
            scopeId,
            logicalId,
            result.originalVersionId,
            generationId,
          ),
        ),
      );
      if (immutableVersion) result = immutableVersion;
    }
    await completion;
    return result ? publicRecord(result) : null;
  } catch (error) {
    await abortTransaction(transaction, completion);
    throw error;
  }
}

async function verifyStoredRecordForCopy(record) {
  if (!(record?.blob instanceof Blob)) {
    throw integrityError("A local original selected for claiming is missing.");
  }
  const checksum = normalizedChecksum(record.fileChecksum);
  const actualChecksum = await sha256ForBlob(record.blob);
  if (!checksum || checksum !== actualChecksum) {
    throw integrityError(
      "A local original selected for claiming failed its SHA-256 integrity check.",
    );
  }
  const originalVersionId = await createOriginalVersionId(
    recordLogicalId(record),
    actualChecksum,
  );
  if (
    record.originalVersionId &&
    record.originalVersionId !== originalVersionId
  ) {
    throw integrityError(
      "A local original selected for claiming failed its immutable version check.",
    );
  }
  if (
    !Number.isSafeInteger(Number(record.fileSize)) ||
    Number(record.fileSize) !== record.blob.size
  ) {
    throw integrityError(
      "A local original selected for claiming failed its size check.",
    );
  }
  const fileName = String(record.fileName || "").trim();
  const fileType = String(record.fileType || "").trim().toLowerCase();
  const blobType = String(record.blob.type || "").trim().toLowerCase();
  if (!fileName || !fileType || (blobType && blobType !== fileType)) {
    throw integrityError(
      "A local original selected for claiming failed its file metadata check.",
    );
  }
  return Object.freeze({
    ...record,
    originalVersionId,
  });
}

export function validateLocalFile(file) {
  if (!(file instanceof Blob)) {
    return "Choose a file to continue.";
  }
  if (!file.size) {
    return "That file is empty. Choose another file.";
  }
  if (file.size > MAX_LOCAL_FILE_BYTES) {
    return "This local prototype accepts files up to 25 MB.";
  }
  const type = String(file.type || "").toLowerCase();
  if (type && !ALLOWED_FILE_TYPES.has(type)) {
    return "Use a PDF, photo, MP4/MOV video, audio, text, Word, or Excel file.";
  }
  return "";
}

export function canPreviewFileType(type) {
  return (
    createSafePreviewMetadata({ mediaType: type }).mode === "inline-original"
  );
}

export function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "Unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export async function sha256ForBlob(blob) {
  if (
    typeof globalThis.crypto === "undefined" ||
    !globalThis.crypto.subtle
  ) {
    const error = new Error(
      "A secure checksum is unavailable in this browser. The original was not saved.",
    );
    error.code = "CHECKSUM_UNAVAILABLE";
    throw error;
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function integrityError(message) {
  const error = new Error(message);
  error.code = "FILE_INTEGRITY_FAILED";
  return error;
}

function normalizedChecksum(value) {
  const checksum = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/u.test(checksum) ? checksum : "";
}

/**
 * Verifies a stored original against both its IndexedDB metadata and its
 * canonical evidence record before any preview or download URL is exposed.
 */
export async function verifyEvidenceFileRecord(record, evidence) {
  if (!record?.blob || !(record.blob instanceof Blob)) {
    throw integrityError("The stored original is missing.");
  }
  const evidenceId = String(evidence?.id || "").trim();
  if (!evidenceId || String(record.id || "") !== evidenceId) {
    throw integrityError("The stored original belongs to a different record.");
  }

  const actualChecksum = await sha256ForBlob(record.blob);
  const storedChecksum = normalizedChecksum(record.fileChecksum);
  const evidenceChecksum = normalizedChecksum(evidence.fileChecksum);
  if (!storedChecksum || !evidenceChecksum) {
    throw integrityError(
      "The original does not have complete SHA-256 integrity metadata.",
    );
  }
  if (
    actualChecksum !== storedChecksum ||
    actualChecksum !== evidenceChecksum
  ) {
    throw integrityError(
      "The original failed its SHA-256 integrity check and was blocked.",
    );
  }

  const blobSize = Number(record.blob.size);
  const storedSize = Number(record.fileSize);
  const evidenceSize = Number(evidence.fileSize);
  if (
    !Number.isSafeInteger(blobSize) ||
    !Number.isSafeInteger(storedSize) ||
    !Number.isSafeInteger(evidenceSize) ||
    blobSize !== storedSize ||
    blobSize !== evidenceSize
  ) {
    throw integrityError(
      "The original size does not match its recorded metadata.",
    );
  }

  const blobType = String(record.blob.type || "").trim().toLowerCase();
  const storedType = String(record.fileType || "").trim().toLowerCase();
  const evidenceType = String(evidence.fileType || "").trim().toLowerCase();
  if (
    !storedType ||
    !evidenceType ||
    storedType !== evidenceType ||
    (blobType && blobType !== storedType)
  ) {
    throw integrityError(
      "The original file type does not match its recorded metadata.",
    );
  }

  const storedName = String(record.fileName || "").trim();
  const evidenceName = String(evidence.fileName || "").trim();
  if (!storedName || !evidenceName || storedName !== evidenceName) {
    throw integrityError(
      "The original filename does not match its recorded metadata.",
    );
  }

  const expectedOriginalVersionId = await createOriginalVersionId(
    evidenceId,
    actualChecksum,
  );
  const storedOriginalVersionId = String(
    record.originalVersionId || "",
  ).trim();
  const evidenceOriginalVersionId = String(
    evidence.originalVersionId || "",
  ).trim();
  if (
    (storedOriginalVersionId || evidenceOriginalVersionId) &&
    (storedOriginalVersionId !== expectedOriginalVersionId ||
      evidenceOriginalVersionId !== expectedOriginalVersionId)
  ) {
    throw integrityError(
      "The original version identity does not match its recorded evidence.",
    );
  }

  return Object.freeze({
    checksum: actualChecksum,
    originalVersionId:
      storedOriginalVersionId || evidenceOriginalVersionId || null,
    fileName: storedName,
    fileType: storedType,
    fileSize: blobSize,
  });
}

export async function describeLocalFile(file) {
  const validation = validateLocalFile(file);
  if (validation) throw new Error(validation);
  return {
    fileName: String(file.name || "attachment"),
    fileType: String(file.type || "application/octet-stream"),
    fileSize: file.size,
    fileChecksum: await sha256ForBlob(file),
  };
}

export async function describeEvidenceOriginal(evidenceId, file) {
  const logicalId = normalizeRecordId(evidenceId, "evidenceId");
  const metadata = await describeLocalFile(file);
  return Object.freeze({
    ...metadata,
    originalVersionId: await createOriginalVersionId(
      logicalId,
      metadata.fileChecksum,
    ),
  });
}

export async function putEvidenceFile(evidenceId, file, options) {
  const scopeId = scopeFromOptions(options);
  const logicalId = normalizeRecordId(evidenceId, "evidenceId");
  const metadata = await describeLocalFile(file);
  const originalVersionId = await createOriginalVersionId(
    logicalId,
    metadata.fileChecksum,
  );
  const value = {
    recordKind: "original-current",
    blob: file,
    ...metadata,
    originalVersionId,
    storedAt: new Date().toISOString(),
  };
  const explicitGenerationId = explicitGenerationFromOptions(options);
  const baseline =
    explicitGenerationId === undefined
      ? await readRecoveryPersistenceState(scopeId)
      : null;
  const generationId =
    explicitGenerationId === undefined
      ? baseline?.activeGenerationId ?? null
      : explicitGenerationId;
  const priorRecords = await snapshotEvidenceFilesForRollback(
    [logicalId],
    scopeId,
    generationId,
  );
  const record = scopedRecord(
    scopeId,
    logicalId,
    value,
    generationId,
  );

  const database = await openDatabase();
  const storeNames =
    explicitGenerationId === undefined
      ? [FILE_STORE, ORIGINAL_VERSION_STORE, RECOVERY_STORE]
      : [FILE_STORE, ORIGINAL_VERSION_STORE];
  const transaction = database.transaction(storeNames, "readwrite");
  const completion = transactionComplete(transaction);
  const fileStore = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(ORIGINAL_VERSION_STORE);
  try {
    if (explicitGenerationId === undefined) {
      const head = validateRecoveryHead(
        await requestResult(
          transaction
            .objectStore(RECOVERY_STORE)
            .get(recoveryHeadRecordId(scopeId)),
        ),
        scopeId,
      );
      assertExpectedRecoveryHead(
        head,
        baseline?.revision ?? 0,
        generationId,
      );
    }
    const allCurrent = await requestResult(fileStore.getAll());
    const current = recordsForScope(
      allCurrent,
      scopeId,
      generationId,
    ).find((candidate) => recordLogicalId(candidate) === logicalId) || null;
    const prior = priorRecords.get(logicalId) || null;
    if (!sameCurrentOriginal(prior, current)) {
      throw recoveryError(
        "This original changed in another tab. Retry from the latest version.",
        "EVIDENCE_WRITE_STALE",
      );
    }
    if (prior) {
      await ensureOriginalVersionRecord(
        versionStore,
        scopedRecord(
          scopeId,
          logicalId,
          {
            ...prior,
            recordKind: "original-current",
          },
          generationId,
        ),
      );
    }
    const immutableVersion = await ensureOriginalVersionRecord(
      versionStore,
      record,
    );
    const currentRecord = currentRecordFromVersion(
      record,
      immutableVersion,
    );
    fileStore.put(currentRecord);
    await completion;
    return publicRecord(immutableVersion);
  } catch (error) {
    await abortTransaction(transaction, completion);
    throw error;
  }
}

async function snapshotEvidenceFilesForRollback(
  evidenceIds,
  scopeId,
  generationId,
) {
  const allRecords = await getAllRecords(FILE_STORE);
  const recordsById = new Map(
    recordsForScope(allRecords, scopeId, generationId).map((record) => [
      recordLogicalId(record),
      record,
    ]),
  );
  const snapshot = new Map();
  for (const evidenceId of evidenceIds) {
    const record = recordsById.get(evidenceId);
    if (!record) continue;
    const verified = await verifyStoredRecordForCopy(record);
    snapshot.set(evidenceId, verified);
  }
  return snapshot;
}

function sameCurrentOriginal(left, right) {
  if (!left || !right) return !left && !right;
  return (
    recordLogicalId(left) === recordLogicalId(right) &&
    left.fileChecksum === right.fileChecksum &&
    left.fileName === right.fileName &&
    left.fileType === right.fileType &&
    Number(left.fileSize) === Number(right.fileSize) &&
    String(left.storedAt || "") === String(right.storedAt || "") &&
    (!left.originalVersionId ||
      !right.originalVersionId ||
      left.originalVersionId === right.originalVersionId)
  );
}

async function canonicalCurrentRecord(
  record,
  scopeId,
  evidenceId,
  generationId,
) {
  if (!record) return null;
  return verifyStoredRecordForCopy(
    scopedRecord(
      scopeId,
      evidenceId,
      {
        ...record,
        recordKind: "original-current",
      },
      generationId,
    ),
  );
}

/**
 * Persists a deterministic document/room batch in one IndexedDB transaction.
 * Existing originals are verified before the transaction and compared again
 * inside it. A restore/head change or competing retry fails closed, and native
 * transaction rollback prevents every partial-file state.
 */
export async function putEvidenceFilesWithRollback(inputs = [], options) {
  if (!Array.isArray(inputs) || !inputs.length) {
    throw new TypeError("Choose one or more evidence originals to save.");
  }
  const scopeId = scopeFromOptions(options);
  const prepared = inputs.map((input) => ({
    evidenceId: normalizeRecordId(input?.evidenceId, "evidenceId"),
    file: input?.file,
  }));
  const evidenceIds = prepared.map((item) => item.evidenceId);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new TypeError("Evidence originals in one batch must have unique identities.");
  }
  const explicitGenerationId = explicitGenerationFromOptions(options);
  const baseline =
    explicitGenerationId === undefined
      ? await readRecoveryPersistenceState(scopeId)
      : null;
  const generationId =
    explicitGenerationId === undefined
      ? baseline?.activeGenerationId ?? null
      : explicitGenerationId;
  const priorRecords = await snapshotEvidenceFilesForRollback(
    evidenceIds,
    scopeId,
    generationId,
  );
  const records = await prepareEvidenceFileRecords(
    prepared,
    scopeId,
    generationId,
  );
  const database = await openDatabase();
  const storeNames =
    explicitGenerationId === undefined
      ? [FILE_STORE, ORIGINAL_VERSION_STORE, RECOVERY_STORE]
      : [FILE_STORE, ORIGINAL_VERSION_STORE];
  const transaction = database.transaction(storeNames, "readwrite");
  const completion = transactionComplete(transaction);
  const fileStore = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(ORIGINAL_VERSION_STORE);
  try {
    if (explicitGenerationId === undefined) {
      const head = validateRecoveryHead(
        await requestResult(
          transaction
            .objectStore(RECOVERY_STORE)
            .get(recoveryHeadRecordId(scopeId)),
        ),
        scopeId,
      );
      assertExpectedRecoveryHead(
        head,
        baseline?.revision ?? 0,
        generationId,
      );
    }
    const currentRecords = await requestResult(fileStore.getAll());
    const currentById = new Map(
      recordsForScope(currentRecords, scopeId, generationId).map(
        (record) => [recordLogicalId(record), record],
      ),
    );
    for (const evidenceId of evidenceIds) {
      const prior = priorRecords.get(evidenceId) || null;
      const current = currentById.get(evidenceId) || null;
      if (!sameCurrentOriginal(prior, current)) {
        throw recoveryError(
          "An original in this batch changed in another tab. Nothing was saved.",
          "EVIDENCE_BATCH_STALE",
        );
      }
    }
    for (const prior of priorRecords.values()) {
      await ensureOriginalVersionRecord(
        versionStore,
        scopedRecord(
          scopeId,
          recordLogicalId(prior),
          {
            ...prior,
            recordKind: "original-current",
          },
          generationId,
        ),
      );
    }
    const savedVersions = [];
    for (const record of records) {
      const immutableVersion = await ensureOriginalVersionRecord(
        versionStore,
        record,
      );
      fileStore.put(
        currentRecordFromVersion(record, immutableVersion),
      );
      savedVersions.push(immutableVersion);
    }
    await completion;
    return savedVersions.map(publicRecord);
  } catch (error) {
    await abortTransaction(transaction, completion);
    const failure = new Error(
      `${error?.message || "The browser could not save every original."} The batch transaction was rolled back, so no partial originals were kept.`,
    );
    failure.code = error?.code || "EVIDENCE_BATCH_WRITE_FAILED";
    failure.cause = error;
    throw failure;
  }
}

export async function getEvidenceFile(evidenceId, options) {
  const scopeId = scopeFromOptions(options);
  const logicalId = normalizeRecordId(evidenceId, "evidenceId");
  const explicitGenerationId = explicitGenerationFromOptions(options);
  if (explicitGenerationId === undefined) {
    return readActiveEvidenceRecord(logicalId, scopeId);
  }
  const current = await readRecord(
    FILE_STORE,
    logicalId,
    scopeId,
    explicitGenerationId,
  );
  if (!current?.originalVersionId) return current;
  const immutableVersion = await readOriginalVersionRecord(
      logicalId,
      current.originalVersionId,
      scopeId,
      explicitGenerationId,
    );
  return immutableVersion ? publicRecord(immutableVersion) : current;
}

/**
 * Returns immutable metadata for every locally retained original of one
 * evidence item. The current pointer is reported explicitly; listing history
 * never changes which bytes getEvidenceFile returns.
 */
export async function listEvidenceOriginalVersions(
  evidenceId,
  options,
) {
  const scopeId = scopeFromOptions(options);
  const logicalId = normalizeRecordId(evidenceId, "evidenceId");
  const explicitGenerationId = explicitGenerationFromOptions(options);
  const generationId =
    explicitGenerationId === undefined
      ? await readActiveEvidenceGenerationId(scopeId)
      : explicitGenerationId;
  const current = await canonicalCurrentRecord(
    await getEvidenceFile(logicalId, {
      scopeId,
      generationId,
    }),
    scopeId,
    logicalId,
    generationId,
  );
  const records = originalVersionsForEvidence(
    await getAllRecords(ORIGINAL_VERSION_STORE),
    scopeId,
    logicalId,
    generationId,
  );
  if (
    current &&
    !records.some(
      (record) =>
        record.originalVersionId === current.originalVersionId,
    )
  ) {
    records.push(
      scopedOriginalVersionRecord(
        scopedRecord(
          scopeId,
          logicalId,
          {
            ...current,
            recordKind: "original-current",
          },
          generationId,
        ),
      ),
    );
  }
  return Object.freeze(
    records
      .sort(
        (left, right) =>
          String(right.storedAt || "").localeCompare(
            String(left.storedAt || ""),
          ) ||
          right.originalVersionId.localeCompare(left.originalVersionId),
      )
      .map((record) => {
        const { blob: _blob, ...metadata } =
          publicOriginalVersionRecord(
            record,
        current?.originalVersionId || null,
          );
        return Object.freeze(metadata);
      }),
  );
}

/**
 * Reads and verifies one exact immutable original version. This is the only
 * history API that returns prior bytes.
 */
export async function getEvidenceOriginalVersion(
  evidenceId,
  originalVersionId,
  options,
) {
  const scopeId = scopeFromOptions(options);
  const logicalId = normalizeRecordId(evidenceId, "evidenceId");
  const normalizedVersionId =
    normalizeOriginalVersionId(originalVersionId);
  const explicitGenerationId = explicitGenerationFromOptions(options);
  const generationId =
    explicitGenerationId === undefined
      ? await readActiveEvidenceGenerationId(scopeId)
      : explicitGenerationId;
  const current = await canonicalCurrentRecord(
    await getEvidenceFile(logicalId, {
      scopeId,
      generationId,
    }),
    scopeId,
    logicalId,
    generationId,
  );
  let record = await readOriginalVersionRecord(
    logicalId,
    normalizedVersionId,
    scopeId,
    generationId,
  );
  if (
    !record &&
    current?.originalVersionId === normalizedVersionId
  ) {
    record = current;
  }
  if (!record) return null;
  const verified = await verifyStoredRecordForCopy(record);
  if (verified.originalVersionId !== normalizedVersionId) {
    throw integrityError(
      "The requested immutable original version failed identity validation.",
    );
  }
  return publicOriginalVersionRecord(
    verified,
    current?.originalVersionId || null,
  );
}

export async function deleteEvidenceFile(evidenceId, options) {
  const scopeId = scopeFromOptions(options);
  const logicalId = normalizeRecordId(evidenceId, "evidenceId");
  const explicitGenerationId = explicitGenerationFromOptions(options);
  const baseline =
    explicitGenerationId === undefined
      ? await readRecoveryPersistenceState(scopeId)
      : null;
  const generationId =
    explicitGenerationId === undefined
      ? baseline?.activeGenerationId ?? null
      : explicitGenerationId;
  const database = await openDatabase();
  const storeNames =
    explicitGenerationId === undefined
      ? [FILE_STORE, ORIGINAL_VERSION_STORE, RECOVERY_STORE]
      : [FILE_STORE, ORIGINAL_VERSION_STORE];
  const transaction = database.transaction(storeNames, "readwrite");
  const completion = transactionComplete(transaction);
  const fileStore = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(ORIGINAL_VERSION_STORE);
  try {
    if (explicitGenerationId === undefined) {
      const head = validateRecoveryHead(
        await requestResult(
          transaction
            .objectStore(RECOVERY_STORE)
            .get(recoveryHeadRecordId(scopeId)),
        ),
        scopeId,
      );
      assertExpectedRecoveryHead(
        head,
        baseline?.revision ?? 0,
        generationId,
      );
    }
    fileStore.delete(scopedRecordId(scopeId, logicalId, generationId));
    if (!generationId && scopeId === LOCAL_DEMO_FILE_SCOPE_ID) {
      const legacy = await requestResult(fileStore.get(logicalId));
      if (isLegacyLocalDemoRecord(legacy)) fileStore.delete(logicalId);
    }
    const versions = await requestResult(versionStore.getAll());
    for (const version of originalVersionsForEvidence(
      versions,
      scopeId,
      logicalId,
      generationId,
    )) {
      versionStore.delete(version.id);
    }
    await completion;
  } catch (error) {
    await abortTransaction(transaction, completion);
    throw error;
  }
}

/**
 * Replaces every locally stored evidence original in one IndexedDB
 * transaction. Validation and checksums happen before the transaction opens,
 * so a failure cannot clear the current originals or leave a partial restore.
 */
async function prepareEvidenceFileRecords(
  inputs,
  scopeId,
  generationId,
) {
  if (!Array.isArray(inputs)) {
    throw new Error("Choose a valid set of recovery originals.");
  }
  const seenIds = new Set();
  const records = [];
  for (const input of inputs) {
    const evidenceId = normalizeRecordId(input?.evidenceId, "evidenceId");
    if (!evidenceId || seenIds.has(evidenceId)) {
      throw new Error("Recovery originals must have unique evidence identities.");
    }
    seenIds.add(evidenceId);
    const file = input?.file;
    const metadata = await describeLocalFile(file);
    const originalVersionId = await createOriginalVersionId(
      evidenceId,
      metadata.fileChecksum,
    );
    if (
      input.expectedFileName &&
      metadata.fileName !== input.expectedFileName
    ) {
      throw new Error(`${metadata.fileName} has an unexpected filename.`);
    }
    if (
      input.expectedFileType &&
      metadata.fileType !== input.expectedFileType
    ) {
      throw new Error(`${metadata.fileName} has an unexpected file type.`);
    }
    if (
      Number.isFinite(input.expectedFileSize) &&
      metadata.fileSize !== input.expectedFileSize
    ) {
      throw new Error(`${metadata.fileName} failed size validation.`);
    }
    if (
      input.expectedFileChecksum &&
      metadata.fileChecksum &&
      metadata.fileChecksum !== input.expectedFileChecksum
    ) {
      throw new Error(`${metadata.fileName} failed checksum validation.`);
    }
    if (
      input.originalVersionId &&
      input.originalVersionId !== originalVersionId
    ) {
      throw new Error(
        `${metadata.fileName} failed immutable version validation.`,
      );
    }
    records.push(
      scopedRecord(scopeId, evidenceId, {
        recordKind: "original-current",
        blob: file,
        ...metadata,
        originalVersionId,
        storedAt: new Date().toISOString(),
      }, generationId),
    );
  }
  return records;
}

export async function replaceEvidenceFiles(inputs = [], options) {
  const scopeId = scopeFromOptions(options);
  const explicitGenerationId = explicitGenerationFromOptions(options);
  const baseline =
    explicitGenerationId === undefined
      ? await readRecoveryPersistenceState(scopeId)
      : null;
  const generationId =
    explicitGenerationId === undefined
      ? baseline?.activeGenerationId ?? null
      : explicitGenerationId;
  const records = await prepareEvidenceFileRecords(
    inputs,
    scopeId,
    generationId,
  );

  const database = await openDatabase();
  const storeNames =
    explicitGenerationId === undefined
      ? [FILE_STORE, ORIGINAL_VERSION_STORE, RECOVERY_STORE]
      : [FILE_STORE, ORIGINAL_VERSION_STORE];
  const transaction = database.transaction(storeNames, "readwrite");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(ORIGINAL_VERSION_STORE);
  try {
    if (explicitGenerationId === undefined) {
      const head = validateRecoveryHead(
        await requestResult(
          transaction
            .objectStore(RECOVERY_STORE)
            .get(recoveryHeadRecordId(scopeId)),
        ),
        scopeId,
      );
      assertExpectedRecoveryHead(
        head,
        baseline?.revision ?? 0,
        generationId,
      );
    }
    const existing = await requestResult(store.getAll());
    const existingVersions = await requestResult(
      versionStore.getAll(),
    );
    deleteGenerationRecords(store, existing, scopeId, generationId);
    deleteGenerationRecords(
      versionStore,
      existingVersions,
      scopeId,
      generationId,
    );
    const savedVersions = [];
    for (const record of records) {
      const immutableVersion = await ensureOriginalVersionRecord(
        versionStore,
        record,
      );
      store.put(currentRecordFromVersion(record, immutableVersion));
      savedVersions.push(immutableVersion);
    }
    await completion;
    return savedVersions.map(publicRecord);
  } catch (error) {
    await abortTransaction(transaction, completion);
    throw error;
  }
}

/**
 * Prepares a complete inactive evidence generation. Nothing in the currently
 * active generation is deleted or hidden until the caller atomically switches
 * the storage-generation pointer after verifying its workspace snapshot.
 */
export async function stageEvidenceFileGeneration(
  inputs = [],
  { scopeId, generationId } = {},
) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedGenerationId = requireStorageGenerationId(generationId);
  const activeGenerationId =
    await readActiveEvidenceGenerationId(normalizedScopeId);
  if (activeGenerationId === normalizedGenerationId) {
    throw new Error(
      "Choose a new inactive generation before staging recovery originals.",
    );
  }
  return replaceEvidenceFiles(inputs, {
    scopeId: normalizedScopeId,
    generationId: normalizedGenerationId,
  });
}

export async function purgeEvidenceFileGeneration(
  scopeId,
  generationId,
) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedGenerationId = requireStorageGenerationId(generationId);
  if (
    (await readActiveEvidenceGenerationId(normalizedScopeId)) ===
    normalizedGenerationId
  ) {
    throw new Error("The active evidence generation cannot be purged.");
  }
  const database = await openDatabase();
  const transaction = database.transaction(
    [FILE_STORE, ORIGINAL_VERSION_STORE],
    "readwrite",
  );
  const store = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(
    ORIGINAL_VERSION_STORE,
  );
  const [records, versions] = await Promise.all([
    requestResult(store.getAll()),
    requestResult(versionStore.getAll()),
  ]);
  deleteGenerationRecords(
    store,
    records,
    normalizedScopeId,
    normalizedGenerationId,
  );
  deleteGenerationRecords(
    versionStore,
    versions,
    normalizedScopeId,
    normalizedGenerationId,
  );
  await transactionComplete(transaction);
}

function normalizedOptionalGenerationId(value) {
  return value ? requireStorageGenerationId(value) : null;
}

function assertExpectedRecoveryHead(
  head,
  expectedRevision,
  expectedGenerationId,
) {
  const actualRevision = head?.revision ?? 0;
  const actualGenerationId = head?.activeGenerationId ?? null;
  if (
    actualRevision !== normalizeRevision(expectedRevision) ||
    actualGenerationId !==
      normalizedOptionalGenerationId(expectedGenerationId)
  ) {
    throw recoveryError(
      "The active workspace changed in another tab. The recovery was not applied.",
      "RECOVERY_HEAD_STALE",
    );
  }
}

/**
 * Commits a fully validated recovery generation. IndexedDB serializes this
 * read/write transaction, so the head revision comparison is a true CAS:
 * either workspace + originals + rollback + head all commit, or none do.
 */
export async function commitRecoveryGeneration({
  scopeId,
  generationId,
  currentWorkspaceRaw,
  recoveredWorkspaceRaw,
  files = [],
  expectedRevision,
  expectedGenerationId = null,
  createdAt,
} = {}) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedGenerationId = requireStorageGenerationId(generationId);
  const normalizedExpectedGenerationId =
    normalizedOptionalGenerationId(expectedGenerationId);
  const normalizedExpectedRevision = normalizeRevision(expectedRevision);
  const normalizedCreatedAt = normalizePersistenceTimestamp(
    createdAt,
    "The recovery timestamp",
  );
  if (typeof currentWorkspaceRaw !== "string" || !currentWorkspaceRaw) {
    throw recoveryError(
      "The current workspace snapshot is unavailable.",
      "RECOVERY_CURRENT_WORKSPACE_INVALID",
    );
  }
  if (typeof recoveredWorkspaceRaw !== "string" || !recoveredWorkspaceRaw) {
    throw recoveryError(
      "The recovered workspace snapshot is unavailable.",
      "RECOVERY_WORKSPACE_INVALID",
    );
  }
  if (normalizedGenerationId === normalizedExpectedGenerationId) {
    throw recoveryError(
      "A recovery must use a new generation identity.",
      "RECOVERY_GENERATION_COLLISION",
    );
  }
  const preparedRecords = await prepareEvidenceFileRecords(
    files,
    normalizedScopeId,
    normalizedGenerationId,
  );
  const database = await openDatabase();
  const transaction = database.transaction(
    [FILE_STORE, ORIGINAL_VERSION_STORE, RECOVERY_STORE],
    "readwrite",
  );
  const completion = transactionComplete(transaction);
  const fileStore = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(
    ORIGINAL_VERSION_STORE,
  );
  const recoveryStore = transaction.objectStore(RECOVERY_STORE);
  try {
    const head = validateRecoveryHead(
      await requestResult(
        recoveryStore.get(recoveryHeadRecordId(normalizedScopeId)),
      ),
      normalizedScopeId,
    );
    assertExpectedRecoveryHead(
      head,
      normalizedExpectedRevision,
      normalizedExpectedGenerationId,
    );
    if (head) {
      validateRecoveryGeneration(
        await requestResult(
          recoveryStore.get(
            recoveryGenerationRecordId(
              normalizedScopeId,
              head.activeGenerationId,
            ),
          ),
        ),
        normalizedScopeId,
        head.activeGenerationId,
      );
    }
    const generationCollision = await requestResult(
      recoveryStore.get(
        recoveryGenerationRecordId(
          normalizedScopeId,
          normalizedGenerationId,
        ),
      ),
    );
    if (generationCollision) {
      throw recoveryError(
        "That recovery generation already exists.",
        "RECOVERY_GENERATION_COLLISION",
      );
    }

    const [allEvidence, allVersions] = await Promise.all([
      requestResult(fileStore.getAll()),
      requestResult(versionStore.getAll()),
    ]);
    const obsoleteRollbackGenerationId = head?.rollback
      ? head.rollback.previousGenerationId ?? null
      : undefined;
    if (
      obsoleteRollbackGenerationId !== undefined &&
      obsoleteRollbackGenerationId !== normalizedExpectedGenerationId
    ) {
      deleteGenerationRecords(
        fileStore,
        allEvidence,
        normalizedScopeId,
        obsoleteRollbackGenerationId,
      );
      deleteGenerationRecords(
        versionStore,
        allVersions,
        normalizedScopeId,
        obsoleteRollbackGenerationId,
      );
      recoveryStore.delete(
        recoveryGenerationRecordId(
          normalizedScopeId,
          obsoleteRollbackGenerationId,
        ),
      );
    }
    deleteGenerationRecords(
      fileStore,
      allEvidence,
      normalizedScopeId,
      normalizedGenerationId,
    );
    deleteGenerationRecords(
      versionStore,
      allVersions,
      normalizedScopeId,
      normalizedGenerationId,
    );

    recoveryStore.put(
      createRecoveryGenerationRecord({
        scopeId: normalizedScopeId,
        generationId: normalizedExpectedGenerationId,
        workspaceRaw: currentWorkspaceRaw,
        createdAt: normalizedCreatedAt,
      }),
    );
    recoveryStore.put(
      createRecoveryGenerationRecord({
        scopeId: normalizedScopeId,
        generationId: normalizedGenerationId,
        workspaceRaw: recoveredWorkspaceRaw,
        createdAt: normalizedCreatedAt,
      }),
    );
    const savedVersions = [];
    for (const record of preparedRecords) {
      const immutableVersion = await ensureOriginalVersionRecord(
        versionStore,
        record,
      );
      fileStore.put(
        currentRecordFromVersion(record, immutableVersion),
      );
      savedVersions.push(immutableVersion);
    }

    const rollback = {
      format: RECOVERY_PERSISTENCE_FORMAT,
      version: RECOVERY_PERSISTENCE_VERSION,
      scopeId: normalizedScopeId,
      activatedGenerationId: normalizedGenerationId,
      previousGenerationId: normalizedExpectedGenerationId,
      createdAt: normalizedCreatedAt,
    };
    const nextHead = createRecoveryHeadRecord({
      scopeId: normalizedScopeId,
      revision: normalizedExpectedRevision + 1,
      activeGenerationId: normalizedGenerationId,
      rollback,
      updatedAt: normalizedCreatedAt,
    });
    recoveryStore.put(nextHead);
    await completion;
    return Object.freeze({
      scopeId: normalizedScopeId,
      revision: nextHead.revision,
      activeGenerationId: normalizedGenerationId,
      rollback: Object.freeze({ ...rollback }),
      records: Object.freeze(savedVersions.map(publicRecord)),
    });
  } catch (error) {
    await abortTransaction(transaction, completion);
    throw error;
  }
}

/**
 * Rolls the authoritative head back one generation and deletes the undone
 * generation in the same transaction. A stale revision never mutates data.
 */
export async function rollbackRecoveryGenerationCommit({
  scopeId,
  expectedRevision,
  updatedAt,
} = {}) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedExpectedRevision = normalizeRevision(expectedRevision);
  const database = await openDatabase();
  const transaction = database.transaction(
    [FILE_STORE, ORIGINAL_VERSION_STORE, RECOVERY_STORE],
    "readwrite",
  );
  const completion = transactionComplete(transaction);
  const fileStore = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(
    ORIGINAL_VERSION_STORE,
  );
  const recoveryStore = transaction.objectStore(RECOVERY_STORE);
  try {
    const head = validateRecoveryHead(
      await requestResult(
        recoveryStore.get(recoveryHeadRecordId(normalizedScopeId)),
      ),
      normalizedScopeId,
    );
    if (!head?.rollback) {
      throw recoveryError(
        "There is no recent restore to undo.",
        "RECOVERY_ROLLBACK_UNAVAILABLE",
      );
    }
    if (head.revision !== normalizedExpectedRevision) {
      throw recoveryError(
        "The active workspace changed in another tab. The restore was not undone.",
        "RECOVERY_HEAD_STALE",
      );
    }
    if (
      head.activeGenerationId !==
      head.rollback.activatedGenerationId
    ) {
      throw recoveryError(
        "The saved rollback no longer matches the active generation.",
        "RECOVERY_ROLLBACK_STALE",
      );
    }
    const previousGenerationId =
      head.rollback.previousGenerationId ?? null;
    const previousGeneration = validateRecoveryGeneration(
      await requestResult(
        recoveryStore.get(
          recoveryGenerationRecordId(
            normalizedScopeId,
            previousGenerationId,
          ),
        ),
      ),
      normalizedScopeId,
      previousGenerationId,
    );
    const [allEvidence, allVersions] = await Promise.all([
      requestResult(fileStore.getAll()),
      requestResult(versionStore.getAll()),
    ]);
    deleteGenerationRecords(
      fileStore,
      allEvidence,
      normalizedScopeId,
      head.activeGenerationId,
    );
    deleteGenerationRecords(
      versionStore,
      allVersions,
      normalizedScopeId,
      head.activeGenerationId,
    );
    recoveryStore.delete(
      recoveryGenerationRecordId(
        normalizedScopeId,
        head.activeGenerationId,
      ),
    );
    const nextHead = createRecoveryHeadRecord({
      scopeId: normalizedScopeId,
      revision: head.revision + 1,
      activeGenerationId: previousGenerationId,
      rollback: null,
      updatedAt,
    });
    recoveryStore.put(nextHead);
    await completion;
    return Object.freeze({
      scopeId: normalizedScopeId,
      revision: nextHead.revision,
      activeGenerationId: previousGenerationId,
      removedGenerationId: head.activeGenerationId,
      workspaceRaw: previousGeneration.workspaceRaw,
    });
  } catch (error) {
    await abortTransaction(transaction, completion);
    throw error;
  }
}

/**
 * Creates or updates the authoritative active workspace snapshot. Consumers
 * can pass an expected revision to avoid overwriting a newer tab.
 */
export async function writeActiveRecoveryWorkspace({
  scopeId,
  workspaceRaw,
  expectedRevision,
  updatedAt,
} = {}) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  if (typeof workspaceRaw !== "string" || !workspaceRaw) {
    throw recoveryError(
      "A serialized workspace is required.",
      "RECOVERY_WORKSPACE_INVALID",
    );
  }
  const database = await openDatabase();
  const transaction = database.transaction(RECOVERY_STORE, "readwrite");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(RECOVERY_STORE);
  try {
    const head = validateRecoveryHead(
      await requestResult(store.get(recoveryHeadRecordId(normalizedScopeId))),
      normalizedScopeId,
    );
    const actualRevision = head?.revision ?? 0;
    if (
      expectedRevision !== undefined &&
      actualRevision !== normalizeRevision(expectedRevision)
    ) {
      throw recoveryError(
        "The active workspace changed in another tab.",
        "RECOVERY_HEAD_STALE",
      );
    }
    const activeGenerationId = head?.activeGenerationId ?? null;
    store.put(
      createRecoveryGenerationRecord({
        scopeId: normalizedScopeId,
        generationId: activeGenerationId,
        workspaceRaw,
        createdAt: updatedAt,
      }),
    );
    const nextHead = createRecoveryHeadRecord({
      scopeId: normalizedScopeId,
      revision: actualRevision + 1,
      activeGenerationId,
      rollback: head?.rollback ?? null,
      updatedAt,
    });
    store.put(nextHead);
    await completion;
    return Object.freeze({
      scopeId: normalizedScopeId,
      revision: nextHead.revision,
      activeGenerationId,
      rollback: nextHead.rollback
        ? Object.freeze({ ...nextHead.rollback })
        : null,
    });
  } catch (error) {
    await abortTransaction(transaction, completion);
    throw error;
  }
}

/**
 * Atomically commits one workspace transition and the local originals it
 * references. A stable operationId makes a response-lost retry idempotent.
 * The active workspace, evidence current pointers, immutable versions, head
 * revision, and operation receipt either all commit or all roll back.
 */
export async function commitWorkspaceWithEvidenceFiles({
  scopeId,
  operationId,
  workspaceRaw,
  files = [],
  expectedRevision,
  expectedGenerationId = null,
  committedAt = new Date().toISOString(),
} = {}) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const normalizedOperationId = normalizeRecordId(
    operationId,
    "operationId",
  );
  const normalizedExpectedRevision = normalizeRevision(
    expectedRevision,
    "The expected workspace revision",
  );
  const normalizedExpectedGenerationId =
    normalizedOptionalGenerationId(expectedGenerationId);
  const normalizedCommittedAt = normalizePersistenceTimestamp(
    committedAt,
    "The capture commit timestamp",
  );
  if (typeof workspaceRaw !== "string" || !workspaceRaw) {
    throw recoveryError(
      "A serialized workspace is required for the capture commit.",
      "CAPTURE_WORKSPACE_INVALID",
    );
  }
  createRecoveryGenerationRecord({
    scopeId: normalizedScopeId,
    generationId: normalizedExpectedGenerationId,
    workspaceRaw,
    createdAt: normalizedCommittedAt,
  });
  if (!Array.isArray(files)) {
    throw recoveryError(
      "Choose a valid set of originals for the atomic capture commit.",
      "CAPTURE_FILES_INVALID",
    );
  }
  const preparedRecords = await prepareEvidenceFileRecords(
    files,
    normalizedScopeId,
    normalizedExpectedGenerationId,
  );
  assertWorkspaceReferencesPreparedEvidence(
    workspaceRaw,
    preparedRecords,
  );
  const fingerprint =
    await workspaceEvidenceOperationFingerprint(
      workspaceRaw,
      preparedRecords,
    );
  const operationRecordId =
    workspaceEvidenceOperationRecordId(
      normalizedScopeId,
      normalizedOperationId,
    );
  const database = await openDatabase();
  const transaction = database.transaction(
    [FILE_STORE, ORIGINAL_VERSION_STORE, RECOVERY_STORE],
    "readwrite",
  );
  const completion = transactionComplete(transaction);
  const fileStore = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(
    ORIGINAL_VERSION_STORE,
  );
  const recoveryStore = transaction.objectStore(RECOVERY_STORE);
  try {
    const [receiptRecord, head, recoveryRecords] = await Promise.all([
      requestResult(recoveryStore.get(operationRecordId)),
      requestResult(
        recoveryStore.get(recoveryHeadRecordId(normalizedScopeId)),
      ),
      requestResult(recoveryStore.getAll()),
    ]);
    const validatedHead = validateRecoveryHead(
      head,
      normalizedScopeId,
    );
    const priorReceipt =
      validateWorkspaceEvidenceOperationReceipt(
        receiptRecord,
        normalizedScopeId,
        normalizedOperationId,
      );
    if (priorReceipt) {
      if (priorReceipt.fingerprint !== fingerprint) {
        throw recoveryError(
          "That capture operation identity was already used for different content.",
          "CAPTURE_OPERATION_CONFLICT",
        );
      }
      if (
        priorReceipt.activeGenerationId !==
          (validatedHead?.activeGenerationId ?? null)
      ) {
        throw recoveryError(
          "That capture operation belongs to a generation that is no longer active.",
          "CAPTURE_OPERATION_NOT_ACTIVE",
        );
      }
      await completion;
      return publicWorkspaceEvidenceOperationResult(
        priorReceipt,
        true,
      );
    }

    try {
      assertExpectedRecoveryHead(
        validatedHead,
        normalizedExpectedRevision,
        normalizedExpectedGenerationId,
      );
    } catch (error) {
      throw recoveryError(
        "The active workspace changed in another tab. Nothing from this capture was saved.",
        error?.code === "RECOVERY_HEAD_STALE"
          ? "CAPTURE_COMMIT_STALE"
          : error?.code,
      );
    }
    if (validatedHead) {
      validateRecoveryGeneration(
        await requestResult(
          recoveryStore.get(
            recoveryGenerationRecordId(
              normalizedScopeId,
              normalizedExpectedGenerationId,
            ),
          ),
        ),
        normalizedScopeId,
        normalizedExpectedGenerationId,
      );
    }

    const currentRecords = recordsForScope(
      await requestResult(fileStore.getAll()),
      normalizedScopeId,
      normalizedExpectedGenerationId,
    );
    const currentById = new Map(
      currentRecords.map((record) => [
        recordLogicalId(record),
        record,
      ]),
    );
    const expectedById = new Map(
      files.map((input) => [
        normalizeRecordId(input?.evidenceId, "evidenceId"),
        Object.hasOwn(input || {}, "expectedCurrentOriginalVersionId")
          ? input.expectedCurrentOriginalVersionId || null
          : undefined,
      ]),
    );
    for (const record of preparedRecords) {
      const evidenceId = recordLogicalId(record);
      const expectedCurrentVersionId = expectedById.get(evidenceId);
      const current = currentById.get(evidenceId) || null;
      if (
        expectedCurrentVersionId !== undefined &&
        (current?.originalVersionId || null) !==
          expectedCurrentVersionId
      ) {
        throw recoveryError(
          "An original changed in another tab. Nothing from this capture was saved.",
          "CAPTURE_ORIGINAL_STALE",
        );
      }
    }

    const savedVersions = [];
    for (const record of preparedRecords) {
      const evidenceId = recordLogicalId(record);
      const current = currentById.get(evidenceId);
      if (current) {
        await ensureOriginalVersionRecord(
          versionStore,
          scopedRecord(
            normalizedScopeId,
            evidenceId,
            {
              ...current,
              recordKind: "original-current",
            },
            normalizedExpectedGenerationId,
          ),
        );
      }
      const immutableVersion = await ensureOriginalVersionRecord(
        versionStore,
        record,
      );
      fileStore.put(
        currentRecordFromVersion(record, immutableVersion),
      );
      savedVersions.push(immutableVersion);
    }

    recoveryStore.put(
      createRecoveryGenerationRecord({
        scopeId: normalizedScopeId,
        generationId: normalizedExpectedGenerationId,
        workspaceRaw,
        createdAt: normalizedCommittedAt,
      }),
    );
    const nextHead = createRecoveryHeadRecord({
      scopeId: normalizedScopeId,
      revision: normalizedExpectedRevision + 1,
      activeGenerationId: normalizedExpectedGenerationId,
      rollback: validatedHead?.rollback ?? null,
      updatedAt: normalizedCommittedAt,
    });
    recoveryStore.put(nextHead);
    const recordSummaries = savedVersions.map((record) =>
      Object.freeze({
        evidenceId: recordLogicalId(record),
        fileName: record.fileName,
        fileType: record.fileType,
        fileSize: record.fileSize,
        fileChecksum: record.fileChecksum,
        originalVersionId: record.originalVersionId,
        storedAt: record.storedAt,
      }),
    );
    const receipt = {
      id: operationRecordId,
      kind: "workspace-evidence-operation",
      format: RECOVERY_PERSISTENCE_FORMAT,
      version: RECOVERY_PERSISTENCE_VERSION,
      scopeId: normalizedScopeId,
      operationId: normalizedOperationId,
      fingerprint,
      revision: nextHead.revision,
      activeGenerationId: normalizedExpectedGenerationId,
      records: recordSummaries,
      committedAt: normalizedCommittedAt,
    };
    recoveryStore.put(receipt);

    const existingReceipts = (recoveryRecords || [])
      .filter(
        (record) =>
          record?.kind === "workspace-evidence-operation" &&
          recoveryRecordBelongsToScope(
            record,
            normalizedScopeId,
          ) &&
          record.id !== operationRecordId,
      )
      .sort((left, right) =>
        String(right.committedAt || "").localeCompare(
          String(left.committedAt || ""),
        ),
      );
    for (const staleReceipt of existingReceipts.slice(
      MAX_WORKSPACE_EVIDENCE_OPERATION_RECEIPTS - 1,
    )) {
      recoveryStore.delete(staleReceipt.id);
    }

    await completion;
    return publicWorkspaceEvidenceOperationResult(
      receipt,
      false,
    );
  } catch (error) {
    await abortTransaction(transaction, completion);
    throw error;
  }
}

/**
 * Copies verified legacy/local-demo originals into one explicit account scope.
 * The source remains intact until the caller explicitly purges it after
 * completing its own claim verification.
 */
export async function copyEvidenceFilesBetweenScopes({
  fromScopeId = LOCAL_DEMO_FILE_SCOPE_ID,
  toScopeId,
  evidenceIds = null,
} = {}) {
  const sourceScopeId = normalizeScopeId(fromScopeId);
  const targetScopeId = normalizeScopeId(toScopeId);
  if (sourceScopeId !== LOCAL_DEMO_FILE_SCOPE_ID) {
    throw new TypeError(
      "Only the local-demo scope can be claimed into an account scope.",
    );
  }
  if (targetScopeId === LOCAL_DEMO_FILE_SCOPE_ID) {
    throw new TypeError("Choose a distinct account scope for the claim.");
  }
  if (!isAccountStorageScopeId(targetScopeId)) {
    throw new TypeError("Choose a valid account scope for the claim.");
  }
  const [sourceBaseline, targetBaseline] = await Promise.all([
    readRecoveryPersistenceState(sourceScopeId),
    readRecoveryPersistenceState(targetScopeId),
  ]);
  const sourceGenerationId =
    sourceBaseline?.activeGenerationId ?? null;
  const targetGenerationId =
    targetBaseline?.activeGenerationId ?? null;
  if (evidenceIds !== null && !Array.isArray(evidenceIds)) {
    throw new TypeError("evidenceIds must be an array when provided.");
  }

  const requestedIds =
    evidenceIds === null
      ? null
      : evidenceIds.map((value) => normalizeRecordId(value, "evidenceId"));
  if (requestedIds && new Set(requestedIds).size !== requestedIds.length) {
    throw new TypeError("evidenceIds must not contain duplicates.");
  }

  const [allRecords, allVersionRecords] = await Promise.all([
    getAllRecords(FILE_STORE),
    getAllRecords(ORIGINAL_VERSION_STORE),
  ]);
  const sourceById = new Map(
    recordsForScope(
      allRecords,
      sourceScopeId,
      sourceGenerationId,
    ).map((record) => [
      recordLogicalId(record),
      record,
    ]),
  );
  const selectedIds = requestedIds || [...sourceById.keys()].sort();
  const selected = selectedIds.map((evidenceId) => {
    const record = sourceById.get(evidenceId);
    if (!record) {
      throw new Error(
        `Local original ${evidenceId} is unavailable and was not claimed.`,
      );
    }
    return record;
  });
  const verifiedSelected = await Promise.all(
    selected.map(verifyStoredRecordForCopy),
  );
  const sourceVersionsByEvidence = new Map();
  for (const verifiedCurrent of verifiedSelected) {
    const evidenceId = recordLogicalId(verifiedCurrent);
    const storedVersions = originalVersionsForEvidence(
      allVersionRecords,
      sourceScopeId,
      evidenceId,
      sourceGenerationId,
    );
    const verifiedVersions = await Promise.all(
      storedVersions.map(verifyStoredRecordForCopy),
    );
    if (
      !verifiedVersions.some(
        (version) =>
          version.originalVersionId ===
          verifiedCurrent.originalVersionId,
      )
    ) {
      verifiedVersions.push(
        scopedOriginalVersionRecord(
          scopedRecord(
            sourceScopeId,
            evidenceId,
            {
              ...verifiedCurrent,
              recordKind: "original-current",
            },
            sourceGenerationId,
          ),
        ),
      );
    }
    sourceVersionsByEvidence.set(evidenceId, verifiedVersions);
  }

  const database = await openDatabase();
  const transaction = database.transaction(
    [FILE_STORE, ORIGINAL_VERSION_STORE, RECOVERY_STORE],
    "readwrite",
  );
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(
    ORIGINAL_VERSION_STORE,
  );
  const recoveryStore = transaction.objectStore(RECOVERY_STORE);
  try {
    const [sourceHead, targetHead] = await Promise.all([
      requestResult(
        recoveryStore.get(recoveryHeadRecordId(sourceScopeId)),
      ),
      requestResult(
        recoveryStore.get(recoveryHeadRecordId(targetScopeId)),
      ),
    ]);
    assertExpectedRecoveryHead(
      validateRecoveryHead(sourceHead, sourceScopeId),
      sourceBaseline?.revision ?? 0,
      sourceGenerationId,
    );
    assertExpectedRecoveryHead(
      validateRecoveryHead(targetHead, targetScopeId),
      targetBaseline?.revision ?? 0,
      targetGenerationId,
    );
    const currentRecords = await requestResult(store.getAll());
    const currentVersionRecords = await requestResult(
      versionStore.getAll(),
    );
    const destinationIds = new Set(
      recordsForScope(
        currentRecords,
        targetScopeId,
        targetGenerationId,
      ).map(recordLogicalId),
    );
    const collision = selectedIds.find((id) => destinationIds.has(id));
    if (collision) {
      throw new Error(
        `Account scope already contains original ${collision}; nothing was copied.`,
      );
    }
    const currentSourceById = new Map(
      recordsForScope(
        currentRecords,
        sourceScopeId,
        sourceGenerationId,
      ).map((record) => [
        recordLogicalId(record),
        record,
      ]),
    );
    const copiedAt = new Date().toISOString();
    const copies = [];
    for (const verifiedRecord of verifiedSelected) {
      const logicalId = recordLogicalId(verifiedRecord);
      const current = currentSourceById.get(logicalId);
      if (
        !current ||
        current.fileChecksum !== verifiedRecord.fileChecksum ||
        current.fileSize !== verifiedRecord.fileSize ||
        current.fileName !== verifiedRecord.fileName ||
        current.fileType !== verifiedRecord.fileType ||
        (current.originalVersionId &&
          current.originalVersionId !==
            verifiedRecord.originalVersionId)
      ) {
        throw new Error(
          `Local original ${logicalId} changed during the claim and was not copied.`,
        );
      }
      const snapshottedVersions =
        sourceVersionsByEvidence.get(logicalId) || [];
      const currentSourceVersions = new Map(
        originalVersionsForEvidence(
          currentVersionRecords,
          sourceScopeId,
          logicalId,
          sourceGenerationId,
        ).map((version) => [version.originalVersionId, version]),
      );
      for (const version of snapshottedVersions) {
        const stillCurrent = currentSourceVersions.get(
          version.originalVersionId,
        );
        if (
          !stillCurrent &&
          version.originalVersionId !==
            verifiedRecord.originalVersionId
        ) {
          throw new Error(
            `Local original ${logicalId} history changed during the claim and was not copied.`,
          );
        }
        if (
          stillCurrent &&
          (stillCurrent.fileChecksum !== version.fileChecksum ||
            stillCurrent.fileName !== version.fileName ||
            stillCurrent.fileType !== version.fileType ||
            Number(stillCurrent.fileSize) !==
              Number(version.fileSize))
        ) {
          throw new Error(
            `Local original ${logicalId} history changed during the claim and was not copied.`,
          );
        }
        const targetVersionPointer = scopedRecord(
          targetScopeId,
          logicalId,
          {
            recordKind: "original-current",
            blob: version.blob,
            fileName: version.fileName,
            fileType: version.fileType,
            fileSize: version.fileSize,
            fileChecksum: version.fileChecksum,
            originalVersionId: version.originalVersionId,
            storedAt: version.storedAt,
            claimedFromScopeId: LOCAL_DEMO_FILE_SCOPE_ID,
          },
          targetGenerationId,
        );
        await ensureOriginalVersionRecord(
          versionStore,
          targetVersionPointer,
        );
      }
      const targetCurrent = scopedRecord(
        targetScopeId,
        logicalId,
        {
          recordKind: "original-current",
          blob: current.blob,
          fileName: current.fileName,
          fileType: current.fileType,
          fileSize: current.fileSize,
          fileChecksum: current.fileChecksum,
          originalVersionId: verifiedRecord.originalVersionId,
          storedAt: copiedAt,
          claimedFromScopeId: LOCAL_DEMO_FILE_SCOPE_ID,
        },
        targetGenerationId,
      );
      const targetCurrentVersion = await ensureOriginalVersionRecord(
        versionStore,
        targetCurrent,
      );
      copies.push(
        currentRecordFromVersion(
          targetCurrent,
          targetCurrentVersion,
        ),
      );
    }
    for (const record of copies) store.put(record);
    await completion;
    return copies.map(publicRecord);
  } catch (error) {
    await abortTransaction(transaction, completion);
    throw error;
  }
}

/**
 * Deletes evidence and capture-draft files only from the requested scope.
 * The local-demo scope also owns legacy unscoped records from schema v1.
 */
export async function purgeFileScope(scopeId) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const database = await openDatabase();
  const transaction = database.transaction(
    [
      FILE_STORE,
      ORIGINAL_VERSION_STORE,
      DRAFT_FILE_STORE,
      RECOVERY_STORE,
    ],
    "readwrite",
  );
  const evidenceStore = transaction.objectStore(FILE_STORE);
  const versionStore = transaction.objectStore(
    ORIGINAL_VERSION_STORE,
  );
  const draftStore = transaction.objectStore(DRAFT_FILE_STORE);
  const recoveryStore = transaction.objectStore(RECOVERY_STORE);
  const [
    evidenceRecords,
    versionRecords,
    draftRecords,
    recoveryRecords,
  ] = await Promise.all([
    requestResult(evidenceStore.getAll()),
    requestResult(versionStore.getAll()),
    requestResult(draftStore.getAll()),
    requestResult(recoveryStore.getAll()),
  ]);
  deleteScopeRecords(evidenceStore, evidenceRecords, normalizedScopeId);
  deleteScopeRecords(versionStore, versionRecords, normalizedScopeId);
  deleteScopeRecords(draftStore, draftRecords, normalizedScopeId);
  for (const record of recoveryRecords || []) {
    if (recoveryRecordBelongsToScope(record, normalizedScopeId)) {
      recoveryStore.delete(record.id);
    }
  }
  await transactionComplete(transaction);
}

export async function putCaptureDraftFile(draftId, file, options) {
  const scopeId = scopeFromOptions(options);
  const logicalId = normalizeRecordId(draftId, "draftId");
  const metadata = await describeLocalFile(file);
  return writeRecord(
    DRAFT_FILE_STORE,
    scopedRecord(scopeId, logicalId, {
      blob: file,
      ...metadata,
      storedAt: new Date().toISOString(),
    }),
  );
}

export async function getCaptureDraftFile(draftId, options) {
  return readRecord(
    DRAFT_FILE_STORE,
    normalizeRecordId(draftId, "draftId"),
    scopeFromOptions(options),
  );
}

export async function deleteCaptureDraftFile(draftId, options) {
  return deleteRecord(
    DRAFT_FILE_STORE,
    normalizeRecordId(draftId, "draftId"),
    scopeFromOptions(options),
  );
}
