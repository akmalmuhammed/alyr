/**
 * Versioned sync and encrypted-object transport contracts.
 *
 * The concrete transport in this file is a deterministic in-memory test double.
 * It proves client behavior but is not durable, networked, multi-tenant
 * infrastructure. A production adapter must provide authenticated requests,
 * server-enforced authorization, durable object storage, opaque cursors,
 * transactional versions, retention, and an append-only server audit log.
 */

import {
  IntegrityError,
  PERMISSION_CAPABILITIES,
  PermissionDeniedError,
  SessionRequiredError,
  appendAuditEvent,
  assertPermission,
  canonicalJson,
  createOpaqueId,
  hasPermission,
  sha256Hex,
  verifyUploadPackage,
} from "./securityVault.js";

export const SYNC_OPERATION_VERSION = 1;

export const SYNC_QUEUE_STATES = Object.freeze({
  QUEUED: "queued",
  UPLOADING: "uploading",
  NEEDS_ATTENTION: "needs-attention",
  ACCESS_REVOKED: "access-revoked",
});

export const SENSITIVE_CONFLICT_FIELDS = Object.freeze([
  "ownership",
  "permissions",
  "value",
  "reference",
  "identifier",
  "lifecycleStatus",
  "location",
  "placeId",
  "spaceId",
]);

export class SyncError extends Error {
  constructor(message, code = "SYNC_ERROR") {
    super(message);
    this.name = "SyncError";
    this.code = code;
  }
}

export class NetworkUnavailableError extends SyncError {
  constructor(message = "The sync service is currently unavailable.") {
    super(message, "NETWORK_UNAVAILABLE");
    this.name = "NetworkUnavailableError";
  }
}

export class VersionConflictError extends SyncError {
  constructor(conflict) {
    super("This record changed elsewhere and needs review.", "VERSION_CONFLICT");
    this.name = "VersionConflictError";
    this.conflict = conflict;
  }
}

function clonePlain(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function requireString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${fieldName} is required.`);
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

function normalizeChangedFields(changedFields) {
  if (!Array.isArray(changedFields) || changedFields.length === 0) {
    throw new TypeError("changedFields must contain at least one field.");
  }
  return [
    ...new Set(
      changedFields.map((field) => requireString(field, "changedFields")),
    ),
  ].sort();
}

function normalizeEncryptedPayload(encryptedPayload) {
  if (
    typeof encryptedPayload !== "string" &&
    (!encryptedPayload ||
      typeof encryptedPayload !== "object" ||
      Array.isArray(encryptedPayload))
  ) {
    throw new TypeError(
      "encryptedPayload must be an opaque ciphertext string or envelope object.",
    );
  }
  return clonePlain(encryptedPayload);
}

function validateBaseVersion(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError("baseVersion must be a non-negative integer.");
  }
  return value;
}

function validateSyncOperation(operation) {
  if (!operation || operation.version !== SYNC_OPERATION_VERSION) {
    throw new SyncError("Unsupported sync operation.", "INVALID_OPERATION");
  }
  requireString(operation.operationId, "operationId");
  requireString(operation.idempotencyKey, "idempotencyKey");
  requireString(operation.householdId, "householdId");
  requireString(operation.deviceId, "deviceId");
  requireString(operation.entityType, "entityType");
  requireString(operation.entityId, "entityId");
  requireString(operation.kind, "kind");
  normalizeChangedFields(operation.changedFields);
  validateBaseVersion(operation.baseVersion);
  normalizeEncryptedPayload(operation.encryptedPayload);
  normalizeIsoDate(operation.createdAt, "createdAt");
  return true;
}

export function createSyncOperation({
  operationId = createOpaqueId("operation"),
  idempotencyKey = createOpaqueId("idempotency"),
  householdId,
  deviceId,
  entityType,
  entityId,
  kind = "patch",
  changedFields,
  baseVersion,
  encryptedPayload,
  createdAt,
} = {}) {
  const operation = Object.freeze({
    version: SYNC_OPERATION_VERSION,
    operationId: requireString(operationId, "operationId"),
    idempotencyKey: requireString(idempotencyKey, "idempotencyKey"),
    householdId: requireString(householdId, "householdId"),
    deviceId: requireString(deviceId, "deviceId"),
    entityType: requireString(entityType, "entityType"),
    entityId: requireString(entityId, "entityId"),
    kind: requireString(kind, "kind"),
    changedFields: Object.freeze(normalizeChangedFields(changedFields)),
    baseVersion: validateBaseVersion(baseVersion),
    encryptedPayload: normalizeEncryptedPayload(encryptedPayload),
    createdAt: nowIso(createdAt),
  });
  validateSyncOperation(operation);
  return operation;
}

function publicQueueItem(item) {
  return {
    operationId: item.operation.operationId,
    entityType: item.operation.entityType,
    entityId: item.operation.entityId,
    kind: item.operation.kind,
    changedFields: [...item.operation.changedFields],
    baseVersion: item.operation.baseVersion,
    createdAt: item.operation.createdAt,
    state: item.state,
    attempts: item.attempts,
    lastErrorCode: item.lastErrorCode,
    conflict: item.conflict ? clonePlain(item.conflict) : null,
  };
}

/**
 * Test/default queue adapter. It keeps encrypted operations in memory only.
 * Production implements the same methods with an account-scoped encrypted
 * durable store so tab/app termination cannot discard queued work.
 */
export class MemorySyncQueue {
  #items = new Map();

  enqueue(operation) {
    validateSyncOperation(operation);
    const existing = this.#items.get(operation.operationId);
    if (existing) {
      if (canonicalJson(existing.operation) !== canonicalJson(operation)) {
        throw new SyncError(
          "An operation ID cannot be reused for different content.",
          "OPERATION_ID_REUSED",
        );
      }
      return publicQueueItem(existing);
    }
    const item = {
      operation: clonePlain(operation),
      state: SYNC_QUEUE_STATES.QUEUED,
      attempts: 0,
      lastErrorCode: null,
      conflict: null,
    };
    this.#items.set(operation.operationId, item);
    return publicQueueItem(item);
  }

  list({ states } = {}) {
    const allowedStates = states ? new Set(states) : null;
    return [...this.#items.values()]
      .filter((item) => !allowedStates || allowedStates.has(item.state))
      .map((item) => ({
        operation: clonePlain(item.operation),
        state: item.state,
        attempts: item.attempts,
        lastErrorCode: item.lastErrorCode,
        conflict: item.conflict ? clonePlain(item.conflict) : null,
      }));
  }

  listPublic() {
    return [...this.#items.values()].map(publicQueueItem);
  }

  get(operationId) {
    const item = this.#items.get(operationId);
    return item
      ? {
          operation: clonePlain(item.operation),
          state: item.state,
          attempts: item.attempts,
          lastErrorCode: item.lastErrorCode,
          conflict: item.conflict ? clonePlain(item.conflict) : null,
        }
      : null;
  }

  mark(
    operationId,
    {
      state,
      incrementAttempts = false,
      lastErrorCode = null,
      conflict = null,
    } = {},
  ) {
    const item = this.#items.get(operationId);
    if (!item) throw new SyncError("Queued operation was not found.", "QUEUE_MISS");
    if (!Object.values(SYNC_QUEUE_STATES).includes(state)) {
      throw new TypeError("Unknown sync queue state.");
    }
    item.state = state;
    if (incrementAttempts) item.attempts += 1;
    item.lastErrorCode = lastErrorCode;
    item.conflict = conflict ? clonePlain(conflict) : null;
    return publicQueueItem(item);
  }

  remove(operationId) {
    return this.#items.delete(operationId);
  }

  clearForAccountChange() {
    this.#items.clear();
  }
}

function publicUploadQueueItem(item) {
  return {
    blobId: item.uploadPackage.manifest.blobId,
    recordId: item.recordId,
    ciphertextSha256: item.uploadPackage.manifest.ciphertextSha256,
    ciphertextBytes: item.uploadPackage.manifest.ciphertextBytes,
    state: item.state,
    attempts: item.attempts,
    lastErrorCode: item.lastErrorCode,
  };
}

/**
 * Test/default encrypted-original queue. The public view never contains the
 * envelope or ciphertext. Production replaces this with an account-scoped,
 * encrypted, crash-safe queue and resumable chunk state.
 */
export class MemoryEncryptedUploadQueue {
  #items = new Map();

  async enqueue(recordId, uploadPackage) {
    await verifyUploadPackage(uploadPackage);
    const normalizedRecordId = requireString(recordId, "recordId");
    const blobId = uploadPackage.manifest.blobId;
    const existing = this.#items.get(blobId);
    if (existing) {
      if (
        existing.recordId !== normalizedRecordId ||
        existing.uploadPackage.manifest.manifestSha256 !==
          uploadPackage.manifest.manifestSha256
      ) {
        throw new SyncError(
          "A blob ID cannot be reused for different encrypted content.",
          "BLOB_ID_REUSED",
        );
      }
      return publicUploadQueueItem(existing);
    }
    const item = {
      recordId: normalizedRecordId,
      uploadPackage: clonePlain(uploadPackage),
      state: SYNC_QUEUE_STATES.QUEUED,
      attempts: 0,
      lastErrorCode: null,
    };
    this.#items.set(blobId, item);
    return publicUploadQueueItem(item);
  }

  list({ states } = {}) {
    const allowedStates = states ? new Set(states) : null;
    return [...this.#items.values()]
      .filter((item) => !allowedStates || allowedStates.has(item.state))
      .map((item) => ({
        recordId: item.recordId,
        uploadPackage: clonePlain(item.uploadPackage),
        state: item.state,
        attempts: item.attempts,
        lastErrorCode: item.lastErrorCode,
      }));
  }

  listPublic() {
    return [...this.#items.values()].map(publicUploadQueueItem);
  }

  mark(
    blobId,
    {
      state,
      incrementAttempts = false,
      lastErrorCode = null,
    } = {},
  ) {
    const item = this.#items.get(blobId);
    if (!item) throw new SyncError("Queued upload was not found.", "QUEUE_MISS");
    if (!Object.values(SYNC_QUEUE_STATES).includes(state)) {
      throw new TypeError("Unknown upload queue state.");
    }
    item.state = state;
    if (incrementAttempts) item.attempts += 1;
    item.lastErrorCode = lastErrorCode;
    return publicUploadQueueItem(item);
  }

  remove(blobId) {
    return this.#items.delete(blobId);
  }

  clearForAccountChange() {
    this.#items.clear();
  }
}

function changedFieldsSince(record, baseVersion) {
  return [
    ...new Set(
      record.mutations
        .filter((mutation) => mutation.version > baseVersion)
        .flatMap((mutation) => mutation.changedFields),
    ),
  ].sort();
}

export function detectVersionConflict({
  baseVersion,
  serverVersion,
  localChangedFields,
  serverChangedFields,
} = {}) {
  validateBaseVersion(baseVersion);
  validateBaseVersion(serverVersion);
  const local = normalizeChangedFields(localChangedFields);
  const remote = new Set(serverChangedFields || []);
  const overlappingFields = local.filter((field) => remote.has(field));
  return Object.freeze({
    stale: baseVersion !== serverVersion,
    canAutoMerge:
      baseVersion < serverVersion && overlappingFields.length === 0,
    overlappingFields: Object.freeze(overlappingFields),
    sensitiveFields: Object.freeze(
      overlappingFields.filter((field) =>
        SENSITIVE_CONFLICT_FIELDS.includes(field),
      ),
    ),
  });
}

function recordKey(householdId, entityType, entityId) {
  return `${householdId}\u001f${entityType}\u001f${entityId}`;
}

function parseCursor(value) {
  if (value == null || value === "") return 0;
  const match = /^cursor-(\d+)$/u.exec(String(value));
  if (!match) throw new SyncError("Sync cursor is invalid.", "INVALID_CURSOR");
  return Number(match[1]);
}

function toCursor(value) {
  return `cursor-${value}`;
}

/**
 * Deterministic server-shaped test double. It never decrypts record mutations
 * or evidence objects. Use one shared instance to simulate multiple devices.
 */
export class DeterministicMemoryTransport {
  #online = true;
  #now;
  #principals = new Map();
  #records = new Map();
  #blobs = new Map();
  #idempotency = new Map();
  #changesByHousehold = new Map();
  #changeSequence = 0;
  #auditHistory = [];

  constructor({ now = () => new Date().toISOString() } = {}) {
    this.#now = now;
  }

  setOnline(online) {
    this.#online = Boolean(online);
  }

  registerPrincipal({
    accessToken,
    accountId,
    householdId,
    deviceId = null,
    expiresAt,
    grants,
  } = {}) {
    const normalizedToken = requireString(accessToken, "accessToken");
    const principal = {
      accountId: requireString(accountId, "accountId"),
      householdId: requireString(householdId, "householdId"),
      deviceId: deviceId ? requireString(deviceId, "deviceId") : null,
      expiresAt: normalizeIsoDate(expiresAt, "expiresAt"),
      grants: (Array.isArray(grants) ? grants : [grants])
        .filter(Boolean)
        .map(clonePlain),
    };
    this.#principals.set(normalizedToken, principal);
    return {
      accountId: principal.accountId,
      householdId: principal.householdId,
      deviceId: principal.deviceId,
      expiresAt: principal.expiresAt,
      grantCount: principal.grants.length,
    };
  }

  replaceGrants(accessToken, grants) {
    const principal = this.#principals.get(accessToken);
    if (!principal) throw new SessionRequiredError();
    principal.grants = (Array.isArray(grants) ? grants : [grants])
      .filter(Boolean)
      .map(clonePlain);
  }

  #requireOnline() {
    if (!this.#online) throw new NetworkUnavailableError();
  }

  #authenticate(authorization) {
    this.#requireOnline();
    const principal = this.#principals.get(authorization?.accessToken);
    if (
      !principal ||
      principal.accountId !== authorization.accountId ||
      principal.householdId !== authorization.householdId ||
      (principal.deviceId && principal.deviceId !== authorization.deviceId) ||
      new Date(principal.expiresAt).getTime() <=
        new Date(nowIso(this.#now)).getTime()
    ) {
      throw new SessionRequiredError();
    }
    return principal;
  }

  #authorize(authorization, capability, context = {}) {
    const principal = this.#authenticate(authorization);
    assertPermission(principal.grants, capability, {
      principalId: principal.accountId,
      householdId: principal.householdId,
      ...context,
      at: nowIso(this.#now),
    });
    return principal;
  }

  async #appendServerAudit({
    principal,
    action,
    resourceType,
    resourceId,
    outcome,
    metadata,
  }) {
    this.#auditHistory = await appendAuditEvent(this.#auditHistory, {
      actorId: principal.accountId,
      householdId: principal.householdId,
      action,
      resourceType,
      resourceId,
      outcome,
      metadata,
      at: nowIso(this.#now),
    });
  }

  async pushOperation({ authorization, operation } = {}) {
    validateSyncOperation(operation);
    const principal = this.#authorize(
      authorization,
      PERMISSION_CAPABILITIES.WRITE_RECORD,
      { recordId: operation.entityId },
    );
    if (
      operation.householdId !== principal.householdId ||
      operation.deviceId !== authorization.deviceId
    ) {
      throw new PermissionDeniedError();
    }

    const operationDigest = await sha256Hex(canonicalJson(operation));
    const idempotencyKey = `${operation.householdId}\u001f${operation.idempotencyKey}`;
    const prior = this.#idempotency.get(idempotencyKey);
    if (prior) {
      if (prior.operationDigest !== operationDigest) {
        throw new SyncError(
          "An idempotency key cannot be reused for different content.",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      return clonePlain(prior.result);
    }

    const key = recordKey(
      operation.householdId,
      operation.entityType,
      operation.entityId,
    );
    const current = this.#records.get(key) || {
      householdId: operation.householdId,
      entityType: operation.entityType,
      entityId: operation.entityId,
      version: 0,
      mutations: [],
    };
    if (operation.baseVersion > current.version) {
      throw new SyncError(
        "The client base version is ahead of the server.",
        "INVALID_BASE_VERSION",
      );
    }

    const remoteFields = changedFieldsSince(current, operation.baseVersion);
    const conflictState = detectVersionConflict({
      baseVersion: operation.baseVersion,
      serverVersion: current.version,
      localChangedFields: operation.changedFields,
      serverChangedFields: remoteFields,
    });
    if (conflictState.stale && !conflictState.canAutoMerge) {
      const conflict = {
        conflictId: createOpaqueId("conflict"),
        operationId: operation.operationId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        baseVersion: operation.baseVersion,
        serverVersion: current.version,
        overlappingFields: [...conflictState.overlappingFields],
        sensitiveFields: [...conflictState.sensitiveFields],
        resolution: "user-review-required",
      };
      const result = { status: "conflict", conflict };
      this.#idempotency.set(idempotencyKey, {
        operationDigest,
        result: clonePlain(result),
      });
      await this.#appendServerAudit({
        principal,
        action: "sync.operation-conflicted",
        resourceType: operation.entityType,
        resourceId: operation.entityId,
        outcome: "needs-attention",
        metadata: {
          operationId: operation.operationId,
          conflictId: conflict.conflictId,
          recordVersion: current.version,
          resultCode: "VERSION_CONFLICT",
        },
      });
      return result;
    }

    const nextVersion = current.version + 1;
    const mutation = {
      version: nextVersion,
      operationId: operation.operationId,
      kind: operation.kind,
      changedFields: [...operation.changedFields],
      encryptedPayload: clonePlain(operation.encryptedPayload),
      deviceId: operation.deviceId,
      createdAt: operation.createdAt,
      receivedAt: nowIso(this.#now),
    };
    current.version = nextVersion;
    current.mutations.push(mutation);
    this.#records.set(key, current);

    this.#changeSequence += 1;
    const change = {
      cursor: this.#changeSequence,
      householdId: operation.householdId,
      entityType: operation.entityType,
      entityId: operation.entityId,
      version: nextVersion,
      operationId: operation.operationId,
      kind: operation.kind,
      changedFields: [...operation.changedFields],
      encryptedPayload: clonePlain(operation.encryptedPayload),
      receivedAt: mutation.receivedAt,
    };
    const householdChanges =
      this.#changesByHousehold.get(operation.householdId) || [];
    householdChanges.push(change);
    this.#changesByHousehold.set(operation.householdId, householdChanges);

    const result = {
      status: "accepted",
      operationId: operation.operationId,
      serverVersion: nextVersion,
      mergedConcurrently: operation.baseVersion < nextVersion - 1,
      durableAcknowledgement: true,
      receivedAt: mutation.receivedAt,
    };
    this.#idempotency.set(idempotencyKey, {
      operationDigest,
      result: clonePlain(result),
    });
    await this.#appendServerAudit({
      principal,
      action: "sync.operation-accepted",
      resourceType: operation.entityType,
      resourceId: operation.entityId,
      outcome: "success",
      metadata: {
        operationId: operation.operationId,
        recordVersion: nextVersion,
        resultCode: "ACCEPTED",
      },
    });
    return result;
  }

  async pullChanges({ authorization, cursor = "cursor-0" } = {}) {
    const principal = this.#authenticate(authorization);
    const parsedCursor = parseCursor(cursor);
    const allChanges =
      this.#changesByHousehold.get(principal.householdId) || [];
    const visibleChanges = allChanges
      .filter((change) => change.cursor > parsedCursor)
      .filter((change) =>
        principal.grants.some((grant) =>
          hasPermission(
            grant,
            PERMISSION_CAPABILITIES.READ_RECORD,
            {
              principalId: principal.accountId,
              householdId: principal.householdId,
              recordId: change.entityId,
              at: nowIso(this.#now),
            },
          ),
        ),
      )
      .map(({ cursor: _internalCursor, ...change }) => clonePlain(change));
    const latestCursor = allChanges.length
      ? allChanges.at(-1).cursor
      : parsedCursor;
    await this.#appendServerAudit({
      principal,
      action: "sync.changes-read",
      resourceType: "household",
      resourceId: principal.householdId,
      outcome: "success",
      metadata: { deviceId: authorization.deviceId, resultCode: "PULL_OK" },
    });
    return {
      changes: visibleChanges,
      nextCursor: toCursor(latestCursor),
      durableAcknowledgement: true,
    };
  }

  async uploadEncryptedPackage({
    authorization,
    recordId,
    uploadPackage,
  } = {}) {
    const normalizedRecordId = requireString(recordId, "recordId");
    const principal = this.#authorize(
      authorization,
      PERMISSION_CAPABILITIES.UPLOAD_EVIDENCE,
      { recordId: normalizedRecordId },
    );
    await verifyUploadPackage(uploadPackage);
    const { manifest } = uploadPackage;
    if (manifest.householdId !== principal.householdId) {
      throw new PermissionDeniedError();
    }
    const existing = this.#blobs.get(manifest.blobId);
    if (existing) {
      if (
        existing.manifest.ciphertextSha256 !== manifest.ciphertextSha256 ||
        existing.recordId !== normalizedRecordId
      ) {
        throw new IntegrityError(
          "An encrypted original is immutable after acknowledgement.",
        );
      }
      return clonePlain(existing.acknowledgement);
    }
    const storedAt = nowIso(this.#now);
    const acknowledgement = {
      status: "stored",
      blobId: manifest.blobId,
      ciphertextSha256: manifest.ciphertextSha256,
      storedAt,
      serverVersion: 1,
      durableAcknowledgement: true,
    };
    this.#blobs.set(manifest.blobId, {
      householdId: principal.householdId,
      recordId: normalizedRecordId,
      manifest: clonePlain(manifest),
      envelope: clonePlain(uploadPackage.envelope),
      acknowledgement,
    });
    await this.#appendServerAudit({
      principal,
      action: "evidence.encrypted-original-stored",
      resourceType: "evidence-blob",
      resourceId: manifest.blobId,
      outcome: "success",
      metadata: {
        blobId: manifest.blobId,
        recordVersion: 1,
        resultCode: "STORED",
      },
    });
    return clonePlain(acknowledgement);
  }

  async downloadEncryptedPackage({
    authorization,
    recordId,
    blobId,
  } = {}) {
    const normalizedRecordId = requireString(recordId, "recordId");
    const principal = this.#authorize(
      authorization,
      PERMISSION_CAPABILITIES.DOWNLOAD_ORIGINAL,
      { recordId: normalizedRecordId },
    );
    assertPermission(
      principal.grants,
      PERMISSION_CAPABILITIES.READ_EVIDENCE,
      {
        principalId: principal.accountId,
        householdId: principal.householdId,
        recordId: normalizedRecordId,
        at: nowIso(this.#now),
      },
    );
    const stored = this.#blobs.get(blobId);
    if (
      !stored ||
      stored.householdId !== principal.householdId ||
      stored.recordId !== normalizedRecordId
    ) {
      // Same response for missing and inaccessible objects.
      throw new PermissionDeniedError("Encrypted item is unavailable.");
    }
    const uploadPackage = {
      manifest: clonePlain(stored.manifest),
      envelope: clonePlain(stored.envelope),
    };
    await verifyUploadPackage(uploadPackage);
    await this.#appendServerAudit({
      principal,
      action: "evidence.encrypted-original-read",
      resourceType: "evidence-blob",
      resourceId: blobId,
      outcome: "success",
      metadata: { blobId, resultCode: "DOWNLOAD_OK" },
    });
    return uploadPackage;
  }

  getRecordVersionForTest(householdId, entityType, entityId) {
    return (
      this.#records.get(recordKey(householdId, entityType, entityId))
        ?.version || 0
    );
  }

  corruptBlobForTest(blobId) {
    const stored = this.#blobs.get(blobId);
    if (!stored) return false;
    const ciphertext = stored.envelope.ciphertext;
    const first = ciphertext[0] === "A" ? "B" : "A";
    stored.envelope.ciphertext = `${first}${ciphertext.slice(1)}`;
    return true;
  }

  getAuditHistoryForTest() {
    return clonePlain(this.#auditHistory);
  }
}

export class SyncEngine {
  #sessionStore;
  #queue;
  #uploadQueue;
  #transport;
  #cursor = "cursor-0";
  #auditHistory = [];
  #now;

  constructor({
    sessionStore,
    queue = new MemorySyncQueue(),
    uploadQueue = new MemoryEncryptedUploadQueue(),
    transport,
    now = () => new Date().toISOString(),
  } = {}) {
    if (
      !sessionStore?.getAuthorization ||
      !queue?.enqueue ||
      !queue?.list ||
      !uploadQueue?.enqueue ||
      !uploadQueue?.list ||
      !transport?.pushOperation
    ) {
      throw new TypeError(
        "SyncEngine requires session, queue, and transport adapters.",
      );
    }
    this.#sessionStore = sessionStore;
    this.#queue = queue;
    this.#uploadQueue = uploadQueue;
    this.#transport = transport;
    this.#now = now;
  }

  async #appendClientAudit({
    authorization,
    action,
    resourceType,
    resourceId,
    outcome,
    metadata,
  }) {
    this.#auditHistory = await appendAuditEvent(this.#auditHistory, {
      actorId: authorization.accountId,
      householdId: authorization.householdId,
      action,
      resourceType,
      resourceId,
      outcome,
      metadata,
      at: nowIso(this.#now),
    });
  }

  async queueMutation(input) {
    const authorization = this.#sessionStore.getAuthorization(nowIso(this.#now));
    const operation = createSyncOperation({
      ...input,
      householdId: authorization.householdId,
      deviceId: authorization.deviceId,
      createdAt: input?.createdAt || nowIso(this.#now),
    });
    const queued = this.#queue.enqueue(operation);
    await this.#appendClientAudit({
      authorization,
      action: "sync.operation-queued",
      resourceType: operation.entityType,
      resourceId: operation.entityId,
      outcome: "queued",
      metadata: { operationId: operation.operationId },
    });
    return queued;
  }

  getQueueState() {
    return this.#queue.listPublic();
  }

  getUploadQueueState() {
    return this.#uploadQueue.listPublic();
  }

  async flush() {
    const authorization = this.#sessionStore.getAuthorization(nowIso(this.#now));
    const candidates = this.#queue.list({
      states: [SYNC_QUEUE_STATES.QUEUED],
    });
    const summary = {
      accepted: [],
      conflicts: [],
      accessRevoked: [],
      failed: [],
      status: candidates.length ? "syncing" : "idle",
    };

    for (const item of candidates) {
      const { operation } = item;
      this.#queue.mark(operation.operationId, {
        state: SYNC_QUEUE_STATES.UPLOADING,
        incrementAttempts: true,
      });
      try {
        const result = await this.#transport.pushOperation({
          authorization,
          operation,
        });
        if (result.status === "accepted") {
          this.#queue.remove(operation.operationId);
          summary.accepted.push(result);
          await this.#appendClientAudit({
            authorization,
            action: "sync.operation-acknowledged",
            resourceType: operation.entityType,
            resourceId: operation.entityId,
            outcome: "success",
            metadata: {
              operationId: operation.operationId,
              recordVersion: result.serverVersion,
              resultCode: "ACCEPTED",
            },
          });
        } else if (result.status === "conflict") {
          this.#queue.mark(operation.operationId, {
            state: SYNC_QUEUE_STATES.NEEDS_ATTENTION,
            lastErrorCode: "VERSION_CONFLICT",
            conflict: result.conflict,
          });
          summary.conflicts.push(result.conflict);
          await this.#appendClientAudit({
            authorization,
            action: "sync.operation-needs-attention",
            resourceType: operation.entityType,
            resourceId: operation.entityId,
            outcome: "needs-attention",
            metadata: {
              operationId: operation.operationId,
              conflictId: result.conflict.conflictId,
              resultCode: "VERSION_CONFLICT",
            },
          });
        } else {
          throw new SyncError(
            "Transport returned an unknown result.",
            "UNKNOWN_TRANSPORT_RESULT",
          );
        }
      } catch (error) {
        if (error instanceof NetworkUnavailableError) {
          this.#queue.mark(operation.operationId, {
            state: SYNC_QUEUE_STATES.QUEUED,
            lastErrorCode: error.code,
          });
          summary.failed.push({
            operationId: operation.operationId,
            code: error.code,
          });
          summary.status = "offline";
          break;
        }
        if (error instanceof PermissionDeniedError) {
          this.#queue.mark(operation.operationId, {
            state: SYNC_QUEUE_STATES.ACCESS_REVOKED,
            lastErrorCode: error.code,
          });
          summary.accessRevoked.push({
            operationId: operation.operationId,
            code: error.code,
          });
          await this.#appendClientAudit({
            authorization,
            action: "sync.operation-access-revoked",
            resourceType: operation.entityType,
            resourceId: operation.entityId,
            outcome: "denied",
            metadata: {
              operationId: operation.operationId,
              resultCode: "PERMISSION_DENIED",
            },
          });
          continue;
        }
        if (error instanceof SessionRequiredError) {
          this.#queue.mark(operation.operationId, {
            state: SYNC_QUEUE_STATES.QUEUED,
            lastErrorCode: error.code,
          });
          throw error;
        }
        this.#queue.mark(operation.operationId, {
          state: SYNC_QUEUE_STATES.QUEUED,
          lastErrorCode: error.code || "SYNC_ERROR",
        });
        summary.failed.push({
          operationId: operation.operationId,
          code: error.code || "SYNC_ERROR",
        });
      }
    }

    if (summary.status !== "offline") {
      summary.status =
        summary.conflicts.length || summary.accessRevoked.length
          ? "needs-attention"
          : "complete";
    }
    return {
      ...summary,
      queue: this.getQueueState(),
    };
  }

  async supersedeConflict(
    operationId,
    {
      baseVersion,
      encryptedPayload,
      changedFields,
      operationId: nextOperationId,
      idempotencyKey,
    } = {},
  ) {
    const prior = this.#queue.get(operationId);
    if (!prior || prior.state !== SYNC_QUEUE_STATES.NEEDS_ATTENTION) {
      throw new VersionConflictError(prior?.conflict || null);
    }
    const replacement = await this.queueMutation({
      operationId: nextOperationId,
      idempotencyKey,
      entityType: prior.operation.entityType,
      entityId: prior.operation.entityId,
      kind: prior.operation.kind,
      changedFields: changedFields || prior.operation.changedFields,
      baseVersion,
      encryptedPayload,
    });
    this.#queue.remove(operationId);
    return replacement;
  }

  async pull() {
    const authorization = this.#sessionStore.getAuthorization(nowIso(this.#now));
    const result = await this.#transport.pullChanges({
      authorization,
      cursor: this.#cursor,
    });
    this.#cursor = result.nextCursor;
    return clonePlain(result);
  }

  async uploadEncryptedPackage(recordId, uploadPackage) {
    const authorization = this.#sessionStore.getAuthorization(nowIso(this.#now));
    await verifyUploadPackage(uploadPackage);
    const result = await this.#transport.uploadEncryptedPackage({
      authorization,
      recordId,
      uploadPackage,
    });
    if (!result.durableAcknowledgement) {
      throw new SyncError(
        "The server did not durably acknowledge the encrypted original.",
        "DURABLE_ACKNOWLEDGEMENT_MISSING",
      );
    }
    return result;
  }

  async queueEncryptedUpload(recordId, uploadPackage) {
    const authorization = this.#sessionStore.getAuthorization(nowIso(this.#now));
    const queued = await this.#uploadQueue.enqueue(recordId, uploadPackage);
    await this.#appendClientAudit({
      authorization,
      action: "evidence.encrypted-upload-queued",
      resourceType: "evidence-blob",
      resourceId: queued.blobId,
      outcome: "queued",
      metadata: { blobId: queued.blobId },
    });
    return queued;
  }

  async flushEncryptedUploads() {
    const authorization = this.#sessionStore.getAuthorization(nowIso(this.#now));
    const candidates = this.#uploadQueue.list({
      states: [SYNC_QUEUE_STATES.QUEUED],
    });
    const summary = {
      acknowledged: [],
      accessRevoked: [],
      failed: [],
      status: candidates.length ? "uploading" : "idle",
    };

    for (const item of candidates) {
      const blobId = item.uploadPackage.manifest.blobId;
      this.#uploadQueue.mark(blobId, {
        state: SYNC_QUEUE_STATES.UPLOADING,
        incrementAttempts: true,
      });
      try {
        const acknowledgement =
          await this.#transport.uploadEncryptedPackage({
            authorization,
            recordId: item.recordId,
            uploadPackage: item.uploadPackage,
          });
        if (!acknowledgement.durableAcknowledgement) {
          throw new SyncError(
            "The server did not durably acknowledge the encrypted original.",
            "DURABLE_ACKNOWLEDGEMENT_MISSING",
          );
        }
        this.#uploadQueue.remove(blobId);
        summary.acknowledged.push(acknowledgement);
        await this.#appendClientAudit({
          authorization,
          action: "evidence.encrypted-upload-acknowledged",
          resourceType: "evidence-blob",
          resourceId: blobId,
          outcome: "success",
          metadata: { blobId, resultCode: "STORED" },
        });
      } catch (error) {
        if (error instanceof NetworkUnavailableError) {
          this.#uploadQueue.mark(blobId, {
            state: SYNC_QUEUE_STATES.QUEUED,
            lastErrorCode: error.code,
          });
          summary.failed.push({ blobId, code: error.code });
          summary.status = "offline";
          break;
        }
        if (error instanceof PermissionDeniedError) {
          this.#uploadQueue.mark(blobId, {
            state: SYNC_QUEUE_STATES.ACCESS_REVOKED,
            lastErrorCode: error.code,
          });
          summary.accessRevoked.push({ blobId, code: error.code });
          continue;
        }
        if (error instanceof SessionRequiredError) {
          this.#uploadQueue.mark(blobId, {
            state: SYNC_QUEUE_STATES.QUEUED,
            lastErrorCode: error.code,
          });
          throw error;
        }
        this.#uploadQueue.mark(blobId, {
          state: SYNC_QUEUE_STATES.NEEDS_ATTENTION,
          lastErrorCode: error.code || "UPLOAD_FAILED",
        });
        summary.failed.push({
          blobId,
          code: error.code || "UPLOAD_FAILED",
        });
      }
    }
    if (summary.status !== "offline") {
      summary.status =
        summary.failed.length || summary.accessRevoked.length
          ? "needs-attention"
          : "complete";
    }
    return {
      ...summary,
      queue: this.getUploadQueueState(),
    };
  }

  async retrieveEncryptedPackage(recordId, blobId) {
    const authorization = this.#sessionStore.getAuthorization(nowIso(this.#now));
    const uploadPackage = await this.#transport.downloadEncryptedPackage({
      authorization,
      recordId,
      blobId,
    });
    await verifyUploadPackage(uploadPackage);
    return uploadPackage;
  }

  getAuditHistory() {
    return clonePlain(this.#auditHistory);
  }
}
