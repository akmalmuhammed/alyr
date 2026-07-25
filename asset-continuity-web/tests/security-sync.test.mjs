import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_PBKDF2_ITERATIONS,
  MemorySessionStore,
  PERMISSION_CAPABILITIES,
  PermissionDeniedError,
  SessionRequiredError,
  SENSITIVE_FIELD_GROUPS,
  appendAuditEvent,
  assertPermission,
  canonicalJson,
  createPermissionGrant,
  createSafePreviewMetadata,
  decryptVaultBytes,
  encryptVaultBytes,
  hasPermission,
  prepareEncryptedUpload,
  sha256Hex,
  verifyAuditHistory,
  verifyUploadPackage,
} from "../src/securityVault.js";
import {
  DeterministicMemoryTransport,
  MemorySyncQueue,
  NetworkUnavailableError,
  SYNC_QUEUE_STATES,
  SyncEngine,
  createSyncOperation,
  detectVersionConflict,
} from "../src/syncEngine.js";

const NOW = "2026-07-25T10:00:00.000Z";
const EXPIRES = "2035-07-25T10:00:00.000Z";
const SECRET = "violet-cyan-recovery-secret";

function ownerGrant(accountId = "account-owner", householdId = "household-1") {
  return createPermissionGrant({
    grantId: `grant-${accountId}`,
    principalId: accountId,
    householdId,
    role: "owner",
    fieldGroups: SENSITIVE_FIELD_GROUPS,
  });
}

function createSession({
  accountId = "account-owner",
  householdId = "household-1",
  deviceId = "device-a",
  accessToken = "memory-only-token-a",
} = {}) {
  const session = new MemorySessionStore();
  session.start({
    accountId,
    householdId,
    deviceId,
    accessToken,
    expiresAt: EXPIRES,
    authenticatedAt: NOW,
    assurance: "passkey",
  });
  return session;
}

function registerSession(
  transport,
  session,
  grants = ownerGrant(),
) {
  const authorization = session.getAuthorization(NOW);
  transport.registerPrincipal({
    ...authorization,
    grants,
  });
  return authorization;
}

function createEngine({
  transport,
  session = createSession(),
  queue = new MemorySyncQueue(),
} = {}) {
  return new SyncEngine({
    sessionStore: session,
    queue,
    transport,
    now: () => NOW,
  });
}

test("session credentials stay memory-only and expiry is explicit", () => {
  const session = createSession();
  const publicState = session.getState(NOW);

  assert.equal(publicState.status, "authenticated");
  assert.equal(publicState.assurance, "passkey");
  assert.equal("accessToken" in publicState, false);
  assert.doesNotMatch(JSON.stringify(session), /memory-only-token-a/);
  assert.equal(
    session.getAuthorization(NOW).accessToken,
    "memory-only-token-a",
  );

  assert.equal(
    session.getState("2036-01-01T00:00:00.000Z").status,
    "expired",
  );
  assert.throws(
    () => session.getAuthorization("2036-01-01T00:00:00.000Z"),
    SessionRequiredError,
  );
});

test("AES-GCM envelope encryption round-trips and rejects wrong keys or tampering", async () => {
  const context = {
    householdId: "household-1",
    blobId: "blob-photo-1",
    purpose: "evidence-original",
  };
  const plaintext = new TextEncoder().encode(
    "A childhood watch, photographed in the family archive.",
  );
  const envelope = await encryptVaultBytes(plaintext, SECRET, context, {
    iterations: MIN_PBKDF2_ITERATIONS,
    now: NOW,
  });

  assert.equal(envelope.contentCipher.name, "AES-GCM");
  assert.equal(envelope.wrappedKey.scheme, "PBKDF2-AES-GCM");
  assert.equal(envelope.wrappedKey.hash, "SHA-256");
  assert.equal(envelope.plaintextBytes, plaintext.byteLength);
  assert.doesNotMatch(JSON.stringify(envelope), /childhood watch/i);

  const decrypted = await decryptVaultBytes(envelope, SECRET, {
    expectedContext: context,
  });
  assert.deepEqual(decrypted, plaintext);

  await assert.rejects(
    decryptVaultBytes(envelope, "incorrect-recovery-secret", {
      expectedContext: context,
    }),
    { code: "INTEGRITY_FAILED" },
  );
  await assert.rejects(
    decryptVaultBytes(envelope, SECRET, {
      expectedContext: { ...context, blobId: "other-blob" },
    }),
    { code: "INTEGRITY_FAILED" },
  );

  const tampered = structuredClone(envelope);
  tampered.ciphertext = `${tampered.ciphertext[0] === "A" ? "B" : "A"}${tampered.ciphertext.slice(1)}`;
  await assert.rejects(decryptVaultBytes(tampered, SECRET), {
    code: "INTEGRITY_FAILED",
  });

  const workFactorAttack = structuredClone(envelope);
  workFactorAttack.wrappedKey.iterations = 999_999_999;
  await assert.rejects(decryptVaultBytes(workFactorAttack, SECRET), {
    code: "INTEGRITY_FAILED",
  });
});

test("upload manifests prove ciphertext integrity without exposing file names or plaintext", async () => {
  const uploadPackage = await prepareEncryptedUpload({
    value: new Blob(["private deed bytes"], { type: "application/pdf" }),
    secret: SECRET,
    context: {
      householdId: "household-1",
      blobId: "blob-deed-1",
      purpose: "property-document",
    },
    mediaType: "application/pdf",
    fileName: "Pearl apartment deed.pdf",
    createdByDeviceId: "device-a",
    iterations: MIN_PBKDF2_ITERATIONS,
    now: NOW,
  });

  assert.equal(await verifyUploadPackage(uploadPackage), true);
  assert.equal(
    uploadPackage.manifest.objectContentType,
    "application/octet-stream",
  );
  assert.equal(uploadPackage.manifest.preview.mode, "download-only");
  assert.equal(
    uploadPackage.manifest.preview.originalInlineAllowed,
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(uploadPackage.manifest),
    /Pearl apartment deed|private deed bytes/i,
  );

  const altered = structuredClone(uploadPackage);
  altered.manifest.ciphertextBytes += 1;
  await assert.rejects(verifyUploadPackage(altered), {
    code: "INTEGRITY_FAILED",
  });

  const unsafePolicy = structuredClone(uploadPackage);
  unsafePolicy.manifest.preview = {
    version: 1,
    mode: "inline-original",
    mediaType: "image/svg+xml",
    originalInlineAllowed: true,
    requiresAccessCheck: true,
    activeContent: false,
    renditionBlobId: null,
  };
  const { manifestSha256: _oldHash, ...unsafeBody } = unsafePolicy.manifest;
  unsafePolicy.manifest.manifestSha256 = await sha256Hex(
    canonicalJson(unsafeBody),
  );
  await assert.rejects(verifyUploadPackage(unsafePolicy), {
    code: "INTEGRITY_FAILED",
  });
});

test("preview policy permits inert raster images and blocks active originals", () => {
  const photo = createSafePreviewMetadata({
    mediaType: "image/jpeg",
    fileName: "watch.jpg",
    sourceBytes: 42,
  });
  assert.equal(photo.mode, "inline-original");
  assert.equal(photo.originalInlineAllowed, true);
  assert.equal(photo.requiresAccessCheck, true);

  const svg = createSafePreviewMetadata({
    mediaType: "image/svg+xml",
    fileName: "unknown.svg",
    sourceBytes: 42,
  });
  assert.equal(svg.mode, "download-only");
  assert.equal(svg.originalInlineAllowed, false);
  assert.equal(svg.activeContent, true);

  const pdfRendition = createSafePreviewMetadata({
    mediaType: "application/pdf",
    fileName: "policy.pdf",
    sourceBytes: 42,
    renditionBlobId: "rendition-1",
  });
  assert.equal(pdfRendition.mode, "generated-rendition");
  assert.equal(pdfRendition.originalInlineAllowed, false);
});

test("permission grants are deny-by-default for capability, scope, and fields", () => {
  const viewer = createPermissionGrant({
    grantId: "grant-viewer",
    principalId: "account-viewer",
    householdId: "household-1",
    role: "viewer",
    recordIds: ["asset-visible"],
    fieldGroups: ["private-stories"],
  });
  const baseContext = {
    principalId: "account-viewer",
    householdId: "household-1",
    recordId: "asset-visible",
    at: NOW,
  };

  assert.equal(
    hasPermission(
      viewer,
      PERMISSION_CAPABILITIES.READ_RECORD,
      baseContext,
    ),
    true,
  );
  assert.equal(
    hasPermission(viewer, PERMISSION_CAPABILITIES.READ_RECORD, {
      ...baseContext,
      recordId: "asset-hidden",
    }),
    false,
  );
  assert.equal(
    hasPermission(viewer, PERMISSION_CAPABILITIES.READ_RECORD, {
      ...baseContext,
      fieldGroup: "location",
    }),
    false,
  );
  assert.throws(
    () =>
      assertPermission(
        viewer,
        PERMISSION_CAPABILITIES.UPLOAD_EVIDENCE,
        baseContext,
      ),
    (error) =>
      error instanceof PermissionDeniedError &&
      !/asset-visible/u.test(error.message),
  );
});

test("client audit history is hash chained and strips unsafe metadata", async () => {
  let history = await appendAuditEvent([], {
    eventId: "audit-1",
    actorId: "account-owner",
    householdId: "household-1",
    action: "sync.operation-queued",
    resourceType: "asset",
    resourceId: "asset-1",
    metadata: {
      operationId: "operation-1",
      assetName: "Secret inherited watch",
      query: "bank account",
    },
    at: NOW,
  });
  history = await appendAuditEvent(history, {
    eventId: "audit-2",
    actorId: "account-owner",
    householdId: "household-1",
    action: "sync.operation-acknowledged",
    resourceType: "asset",
    resourceId: "asset-1",
    metadata: { recordVersion: 2 },
    at: "2026-07-25T10:01:00.000Z",
  });

  assert.equal(await verifyAuditHistory(history), true);
  assert.deepEqual(history[0].metadata, { operationId: "operation-1" });
  assert.doesNotMatch(JSON.stringify(history), /Secret inherited watch|bank account/i);

  const tampered = structuredClone(history);
  tampered[0].outcome = "failure";
  assert.equal(await verifyAuditHistory(tampered), false);
});

test("offline operations remain queued and flush after connectivity returns", async () => {
  const transport = new DeterministicMemoryTransport({ now: () => NOW });
  const session = createSession();
  registerSession(transport, session);
  const engine = createEngine({ transport, session });

  await engine.queueMutation({
    operationId: "operation-offline-1",
    idempotencyKey: "idempotency-offline-1",
    entityType: "asset",
    entityId: "asset-watch-1",
    changedFields: ["story"],
    baseVersion: 0,
    encryptedPayload: { version: 1, ciphertext: "opaque-story-patch" },
  });

  transport.setOnline(false);
  const offline = await engine.flush();
  assert.equal(offline.status, "offline");
  assert.equal(offline.failed[0].code, "NETWORK_UNAVAILABLE");
  assert.equal(offline.queue[0].state, SYNC_QUEUE_STATES.QUEUED);
  assert.equal(offline.queue[0].attempts, 1);
  assert.equal("encryptedPayload" in offline.queue[0], false);

  transport.setOnline(true);
  const synced = await engine.flush();
  assert.equal(synced.status, "complete");
  assert.equal(synced.accepted[0].durableAcknowledgement, true);
  assert.deepEqual(synced.queue, []);
  assert.equal(
    transport.getRecordVersionForTest(
      "household-1",
      "asset",
      "asset-watch-1",
    ),
    1,
  );
});

test("idempotency prevents duplicate mutations and disjoint stale edits auto-merge", async () => {
  const transport = new DeterministicMemoryTransport({ now: () => NOW });
  const sessionA = createSession();
  const authorizationA = registerSession(transport, sessionA);
  const sessionB = createSession({
    deviceId: "device-b",
    accessToken: "memory-only-token-b",
  });
  const authorizationB = registerSession(transport, sessionB);

  const first = createSyncOperation({
    operationId: "operation-idempotent-1",
    idempotencyKey: "idempotency-shared-1",
    householdId: "household-1",
    deviceId: "device-a",
    entityType: "asset",
    entityId: "asset-art-1",
    changedFields: ["name"],
    baseVersion: 0,
    encryptedPayload: "encrypted-name-patch",
    createdAt: NOW,
  });
  const firstResult = await transport.pushOperation({
    authorization: authorizationA,
    operation: first,
  });
  const retryResult = await transport.pushOperation({
    authorization: authorizationA,
    operation: first,
  });
  assert.deepEqual(retryResult, firstResult);
  assert.equal(
    transport.getRecordVersionForTest(
      "household-1",
      "asset",
      "asset-art-1",
    ),
    1,
  );

  const disjoint = createSyncOperation({
    operationId: "operation-disjoint-1",
    idempotencyKey: "idempotency-disjoint-1",
    householdId: "household-1",
    deviceId: "device-b",
    entityType: "asset",
    entityId: "asset-art-1",
    changedFields: ["story"],
    baseVersion: 0,
    encryptedPayload: "encrypted-story-patch",
    createdAt: NOW,
  });
  const merged = await transport.pushOperation({
    authorization: authorizationB,
    operation: disjoint,
  });
  assert.equal(merged.status, "accepted");
  assert.equal(merged.serverVersion, 2);
  assert.equal(merged.mergedConcurrently, true);
});

test("overlapping sensitive edits become visible conflicts rather than last-write-wins", async () => {
  const state = detectVersionConflict({
    baseVersion: 1,
    serverVersion: 2,
    localChangedFields: ["value", "story"],
    serverChangedFields: ["value", "name"],
  });
  assert.equal(state.stale, true);
  assert.equal(state.canAutoMerge, false);
  assert.deepEqual(state.overlappingFields, ["value"]);
  assert.deepEqual(state.sensitiveFields, ["value"]);

  const transport = new DeterministicMemoryTransport({ now: () => NOW });
  const sessionA = createSession();
  registerSession(transport, sessionA);
  const sessionB = createSession({
    deviceId: "device-b",
    accessToken: "memory-only-token-b",
  });
  registerSession(transport, sessionB);
  const engineA = createEngine({ transport, session: sessionA });
  const engineB = createEngine({ transport, session: sessionB });

  await engineA.queueMutation({
    operationId: "operation-value-a",
    idempotencyKey: "idempotency-value-a",
    entityType: "asset",
    entityId: "asset-investment-1",
    changedFields: ["value"],
    baseVersion: 0,
    encryptedPayload: "encrypted-value-a",
  });
  await engineB.queueMutation({
    operationId: "operation-value-b",
    idempotencyKey: "idempotency-value-b",
    entityType: "asset",
    entityId: "asset-investment-1",
    changedFields: ["value"],
    baseVersion: 0,
    encryptedPayload: "encrypted-value-b",
  });

  assert.equal((await engineA.flush()).status, "complete");
  const conflicted = await engineB.flush();
  assert.equal(conflicted.status, "needs-attention");
  assert.deepEqual(conflicted.conflicts[0].sensitiveFields, ["value"]);
  assert.equal(
    conflicted.queue[0].state,
    SYNC_QUEUE_STATES.NEEDS_ATTENTION,
  );
  assert.equal(
    transport.getRecordVersionForTest(
      "household-1",
      "asset",
      "asset-investment-1",
    ),
    1,
  );
});

test("revoked write access quarantines queued work without exposing its payload", async () => {
  const transport = new DeterministicMemoryTransport({ now: () => NOW });
  const session = createSession();
  const authorization = registerSession(transport, session);
  const engine = createEngine({ transport, session });

  await engine.queueMutation({
    operationId: "operation-revoked-1",
    idempotencyKey: "idempotency-revoked-1",
    entityType: "asset",
    entityId: "asset-private-1",
    changedFields: ["privateStories"],
    baseVersion: 0,
    encryptedPayload: "very-private-encrypted-patch",
  });
  transport.replaceGrants(
    authorization.accessToken,
    createPermissionGrant({
      grantId: "grant-read-only",
      principalId: authorization.accountId,
      householdId: authorization.householdId,
      role: "viewer",
    }),
  );

  const result = await engine.flush();
  assert.equal(result.status, "needs-attention");
  assert.equal(result.accessRevoked[0].code, "PERMISSION_DENIED");
  assert.equal(result.queue[0].state, SYNC_QUEUE_STATES.ACCESS_REVOKED);
  assert.equal("encryptedPayload" in result.queue[0], false);
  assert.doesNotMatch(JSON.stringify(result), /very-private-encrypted-patch/);
});

test("encrypted uploads survive an outage, acknowledge once, and retrieve on another device", async () => {
  const transport = new DeterministicMemoryTransport({ now: () => NOW });
  const sessionA = createSession();
  registerSession(transport, sessionA);
  const sessionB = createSession({
    deviceId: "device-b",
    accessToken: "memory-only-token-b",
  });
  registerSession(transport, sessionB);
  const engineA = createEngine({ transport, session: sessionA });
  const engineB = createEngine({ transport, session: sessionB });
  const original = new TextEncoder().encode(
    "immutable proof bytes for a family painting",
  );
  const uploadPackage = await prepareEncryptedUpload({
    value: original,
    secret: SECRET,
    context: {
      householdId: "household-1",
      blobId: "blob-painting-proof",
      purpose: "evidence-original",
    },
    mediaType: "image/jpeg",
    fileName: "painting provenance.jpg",
    createdByDeviceId: "device-a",
    iterations: MIN_PBKDF2_ITERATIONS,
    now: NOW,
  });

  const queued = await engineA.queueEncryptedUpload(
    "asset-painting-1",
    uploadPackage,
  );
  assert.equal(queued.state, SYNC_QUEUE_STATES.QUEUED);
  assert.equal("uploadPackage" in queued, false);

  transport.setOnline(false);
  const offline = await engineA.flushEncryptedUploads();
  assert.equal(offline.status, "offline");
  assert.equal(offline.queue[0].state, SYNC_QUEUE_STATES.QUEUED);
  assert.equal("uploadPackage" in offline.queue[0], false);

  transport.setOnline(true);
  const uploadResult = await engineA.flushEncryptedUploads();
  const acknowledged = uploadResult.acknowledged[0];
  assert.equal(acknowledged.status, "stored");
  assert.equal(acknowledged.durableAcknowledgement, true);
  assert.deepEqual(uploadResult.queue, []);

  const retry = await engineA.uploadEncryptedPackage(
    "asset-painting-1",
    uploadPackage,
  );
  assert.deepEqual(retry, acknowledged);

  const retrieved = await engineB.retrieveEncryptedPackage(
    "asset-painting-1",
    "blob-painting-proof",
  );
  const decrypted = await decryptVaultBytes(retrieved.envelope, SECRET, {
    expectedContext: uploadPackage.envelope.context,
  });
  assert.deepEqual(decrypted, original);

  transport.corruptBlobForTest("blob-painting-proof");
  await assert.rejects(
    engineB.retrieveEncryptedPackage(
      "asset-painting-1",
      "blob-painting-proof",
    ),
    { code: "INTEGRITY_FAILED" },
  );
});

test("pull returns only authorized encrypted changes with a resumable cursor", async () => {
  const transport = new DeterministicMemoryTransport({ now: () => NOW });
  const ownerSession = createSession();
  registerSession(transport, ownerSession);
  const ownerEngine = createEngine({ transport, session: ownerSession });

  await ownerEngine.queueMutation({
    operationId: "operation-visible-1",
    idempotencyKey: "idempotency-visible-1",
    entityType: "asset",
    entityId: "asset-visible",
    changedFields: ["story"],
    baseVersion: 0,
    encryptedPayload: "encrypted-visible-story",
  });
  await ownerEngine.queueMutation({
    operationId: "operation-hidden-1",
    idempotencyKey: "idempotency-hidden-1",
    entityType: "asset",
    entityId: "asset-hidden",
    changedFields: ["story"],
    baseVersion: 0,
    encryptedPayload: "encrypted-hidden-story",
  });
  await ownerEngine.flush();

  const viewerSession = createSession({
    accountId: "account-viewer",
    deviceId: "device-viewer",
    accessToken: "memory-only-token-viewer",
  });
  const viewerGrant = createPermissionGrant({
    grantId: "grant-visible-only",
    principalId: "account-viewer",
    householdId: "household-1",
    role: "viewer",
    recordIds: ["asset-visible"],
  });
  registerSession(transport, viewerSession, viewerGrant);
  const viewerEngine = createEngine({
    transport,
    session: viewerSession,
  });

  const firstPull = await viewerEngine.pull();
  assert.equal(firstPull.changes.length, 1);
  assert.equal(firstPull.changes[0].entityId, "asset-visible");
  assert.equal(firstPull.changes[0].encryptedPayload, "encrypted-visible-story");
  assert.match(firstPull.nextCursor, /^cursor-\d+$/u);

  const secondPull = await viewerEngine.pull();
  assert.deepEqual(secondPull.changes, []);
  assert.equal(secondPull.nextCursor, firstPull.nextCursor);
});

test("a transport outage uses a typed recoverable error", async () => {
  const transport = new DeterministicMemoryTransport({ now: () => NOW });
  const session = createSession();
  const authorization = registerSession(transport, session);
  transport.setOnline(false);

  await assert.rejects(
    transport.pullChanges({ authorization, cursor: "cursor-0" }),
    (error) =>
      error instanceof NetworkUnavailableError &&
      error.code === "NETWORK_UNAVAILABLE",
  );
});

test("server session rejection returns an in-flight mutation to its recoverable queue", async () => {
  const transport = new DeterministicMemoryTransport({ now: () => NOW });
  const session = createSession();
  const engine = createEngine({ transport, session });

  await engine.queueMutation({
    operationId: "operation-session-retry",
    idempotencyKey: "idempotency-session-retry",
    entityType: "asset",
    entityId: "asset-session-retry",
    changedFields: ["story"],
    baseVersion: 0,
    encryptedPayload: "encrypted-session-retry",
  });

  await assert.rejects(engine.flush(), SessionRequiredError);
  assert.equal(engine.getQueueState()[0].state, SYNC_QUEUE_STATES.QUEUED);
  assert.equal(
    engine.getQueueState()[0].lastErrorCode,
    "SESSION_REQUIRED",
  );
});
