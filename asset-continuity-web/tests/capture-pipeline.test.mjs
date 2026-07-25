import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSET_LABEL_MEDIA_TYPE,
  CapturePipelineError,
  acknowledgeBackgroundUpload,
  appendDocumentScanPage,
  appendRoomCaptureMedia,
  applyDocumentOcrResult,
  assignAssetLabel,
  claimNextBackgroundUpload,
  commitRoomCaptureSession,
  createBackgroundUploadQueue,
  createDeterministicOcrAdapter,
  createDocumentScanJob,
  createLabelRegistry,
  createNfcAssetLabelRecord,
  createRoomCaptureCheckpoint,
  createRoomCaptureSession,
  createWebCameraFallbackAdapter,
  createWebForegroundUploadAdapter,
  decodeAssetLabel,
  encodeAssetLabel,
  enqueueBackgroundUpload,
  evaluateMovementCommand,
  executeOcrAdapter,
  failBackgroundUpload,
  failDocumentOcr,
  markRoomCaptureReady,
  pauseRoomCaptureSession,
  recoverExpiredBackgroundUploads,
  reorderRoomCaptureMedia,
  resolveAssetLabel,
  resolveMovementConflict,
  restoreRoomCaptureCheckpoint,
  retryDocumentOcr,
  reviewDocumentOcr,
  serializeRoomCaptureCheckpoint,
  startDocumentOcr,
  transferAssetLabel,
  queueDocumentOcr,
} from "../src/capturePipeline.js";

const T0 = "2026-07-25T09:00:00.000Z";
const T1 = "2026-07-25T09:01:00.000Z";
const T2 = "2026-07-25T09:02:00.000Z";
const T3 = "2026-07-25T09:03:00.000Z";
const T4 = "2026-07-25T09:04:00.000Z";
const T5 = "2026-07-25T09:05:00.000Z";

function expectCode(code) {
  return (error) => {
    assert.ok(error instanceof CapturePipelineError);
    assert.equal(error.code, code);
    return true;
  };
}

function scanPage(id, capturedAt = T1) {
  return {
    id,
    mediaId: `media-${id}`,
    mimeType: "image/jpeg",
    checksum: `sha256-${id}`,
    width: 2400,
    height: 3200,
    source: "document-scanner",
    capturedAt,
  };
}

function roomMedia(id, capturedAt = T1) {
  return {
    id,
    localRef: `indexeddb://capture/${id}`,
    kind: "photo",
    mimeType: "image/jpeg",
    checksum: `sha256-${id}`,
    byteSize: 1_024,
    source: "camera",
    capturedAt,
  };
}

function makeProcessingScan() {
  let job = createDocumentScanJob({
    id: "scan-001",
    householdId: "household-001",
    assetId: "asset-001",
    documentType: "purchase-receipt",
    createdAt: T0,
  });
  job = appendDocumentScanPage(job, scanPage("page-001"), T1);
  job = appendDocumentScanPage(job, scanPage("page-002", T2), T2);
  job = queueDocumentOcr(job, {
    adapterId: "ocr-fixture",
    languageHints: ["en", "ar", "EN"],
    queuedAt: T3,
  });
  return startDocumentOcr(job, {
    attemptId: "attempt-001",
    startedAt: T4,
  });
}

test("document scan lifecycle keeps OCR as reviewable proposals", () => {
  const processing = makeProcessingScan();
  assert.equal(processing.status, "processing-ocr");
  assert.deepEqual(processing.ocrRequest.languageHints, ["en", "ar"]);
  assert.deepEqual(
    processing.pages.map((page) => page.ordinal),
    [1, 2],
  );

  const extracted = applyDocumentOcrResult(processing, {
    attemptId: "attempt-001",
    completedAt: T5,
    result: {
      adapterId: "ocr-fixture",
      adapterVersion: "1.0.0",
      pages: [
        {
          pageId: "page-001",
          text: "Gallery receipt",
          confidence: 0.98,
          language: "en",
        },
        {
          pageId: "page-002",
          text: "QAR 12500",
          confidence: 0.95,
          language: "en",
        },
      ],
      proposedFields: [
        {
          id: "field-seller",
          key: "seller",
          value: "Gallery 7",
          confidence: 0.91,
          sourcePageIds: ["page-001"],
        },
        {
          id: "field-price",
          key: "purchase-price",
          value: "12500",
          confidence: 0.88,
          sourcePageIds: ["page-002"],
        },
        {
          id: "field-note",
          key: "note",
          value: "unclear",
          confidence: 0.3,
          sourcePageIds: ["page-002"],
        },
      ],
      warnings: ["Handwritten note may be incomplete."],
    },
  });

  assert.equal(extracted.status, "needs-review");
  assert.deepEqual(extracted.acceptedFields, []);
  assert.throws(
    () =>
      reviewDocumentOcr(extracted, {
        decisions: [{ fieldId: "field-seller", action: "accept" }],
        reviewedBy: "member-owner",
        reviewedAt: "2026-07-25T09:06:00.000Z",
      }),
    expectCode("INCOMPLETE_OCR_REVIEW"),
  );

  const completed = reviewDocumentOcr(extracted, {
    decisions: [
      { fieldId: "field-seller", action: "accept" },
      { fieldId: "field-price", action: "edit", value: "12500.00" },
      { fieldId: "field-note", action: "reject" },
    ],
    reviewedBy: "member-owner",
    reviewedAt: "2026-07-25T09:06:00.000Z",
  });

  assert.equal(completed.status, "completed");
  assert.equal(completed.acceptedFields.length, 2);
  assert.equal(completed.acceptedFields[1].value, "12500.00");
  assert.ok(
    completed.acceptedFields.every(
      (field) => field.source === "user-confirmed-ocr",
    ),
  );
});

test("OCR attempts reject stale results and retry only retryable failures", () => {
  const processing = makeProcessingScan();
  assert.throws(
    () =>
      applyDocumentOcrResult(processing, {
        attemptId: "attempt-stale",
        completedAt: T5,
        result: {},
      }),
    expectCode("STALE_OCR_ATTEMPT"),
  );

  const failed = failDocumentOcr(processing, {
    attemptId: "attempt-001",
    code: "ENGINE_UNAVAILABLE",
    message: "Worker stopped.",
    retryable: true,
    failedAt: T5,
  });
  const retried = retryDocumentOcr(failed, {
    queuedAt: "2026-07-25T09:06:00.000Z",
  });
  assert.equal(retried.status, "queued-ocr");
  assert.equal(retried.retryCount, 1);

  const terminal = failDocumentOcr(
    startDocumentOcr(retried, {
      attemptId: "attempt-002",
      startedAt: "2026-07-25T09:07:00.000Z",
    }),
    {
      attemptId: "attempt-002",
      code: "UNSUPPORTED_FORMAT",
      message: "Rescan the page.",
      retryable: false,
      failedAt: "2026-07-25T09:08:00.000Z",
    },
  );
  assert.throws(
    () =>
      retryDocumentOcr(terminal, {
        queuedAt: "2026-07-25T09:09:00.000Z",
      }),
    expectCode("OCR_FAILURE_NOT_RETRYABLE"),
  );
});

test("OCR adapter boundary is deterministic and injects adapter identity", async () => {
  const adapter = createDeterministicOcrAdapter({
    id: "fixture-ocr",
    version: "2026.07",
    extract: ({ pages }) => ({
      pages: pages.map((page) => ({
        pageId: page.id,
        text: `text:${page.id}`,
        confidence: 1,
      })),
      proposedFields: [],
    }),
  });
  const result = await executeOcrAdapter(adapter, {
    jobId: "scan-002",
    attemptId: "attempt-002",
    pages: [
      {
        id: "page-003",
        mediaId: "media-page-003",
        mimeType: "image/png",
        checksum: "abc",
      },
    ],
    languageHints: ["en"],
  });

  assert.equal(result.adapterId, "fixture-ocr");
  assert.equal(result.adapterVersion, "2026.07");
  assert.equal(result.pages[0].text, "text:page-003");
});

test("room batch capture preserves explicit order and resumes from a checkpoint", () => {
  let session = createRoomCaptureSession({
    id: "room-capture-001",
    householdId: "household-001",
    placeId: "west-bay-home",
    spaceId: "study",
    createdBy: "member-owner",
    createdAt: T0,
  });
  session = appendRoomCaptureMedia(session, roomMedia("photo-001"), T1);
  session = appendRoomCaptureMedia(session, roomMedia("photo-002", T2), T2);
  session = reorderRoomCaptureMedia(
    session,
    ["photo-002", "photo-001"],
    T3,
  );
  session = pauseRoomCaptureSession(session, T4);

  const serialized = serializeRoomCaptureCheckpoint(session, T5);
  const restored = restoreRoomCaptureCheckpoint(serialized);
  assert.deepEqual(restored, session);
  assert.deepEqual(
    restored.media.map((item) => [item.id, item.ordinal]),
    [
      ["photo-002", 1],
      ["photo-001", 2],
    ],
  );

  const ready = markRoomCaptureReady(restored, "2026-07-25T09:06:00.000Z");
  const committed = commitRoomCaptureSession(ready, {
    commitId: "commit-room-001",
    committedAt: "2026-07-25T09:07:00.000Z",
  });
  assert.equal(committed.status, "committed");
  assert.strictEqual(
    commitRoomCaptureSession(committed, {
      commitId: "commit-room-001",
      committedAt: "2026-07-25T09:08:00.000Z",
    }),
    committed,
  );
});

test("room checkpoints detect corruption and ready state requires checksums", () => {
  let session = createRoomCaptureSession({
    id: "room-capture-002",
    householdId: "household-001",
    placeId: "west-bay-home",
    spaceId: "garage",
    createdBy: "member-owner",
    createdAt: T0,
  });
  session = appendRoomCaptureMedia(
    session,
    { ...roomMedia("photo-003"), checksum: null },
    T1,
  );
  assert.throws(
    () => markRoomCaptureReady(session, T2),
    expectCode("MEDIA_CHECKSUM_REQUIRED"),
  );

  const checkpoint = createRoomCaptureCheckpoint(session, T2);
  checkpoint.session.spaceId = "wardrobe";
  assert.throws(
    () => restoreRoomCaptureCheckpoint(checkpoint),
    expectCode("CAPTURE_CHECKPOINT_CORRUPT"),
  );
});

test("QR and NFC labels share a minimal checksummed opaque payload", () => {
  const labelId = "lbl_Q7w9x2K4";
  const encoded = encodeAssetLabel(labelId);
  assert.deepEqual(decodeAssetLabel(encoded), {
    schemaVersion: 1,
    labelId,
    payload: encoded,
  });

  const nfc = createNfcAssetLabelRecord(labelId);
  assert.equal(nfc.mediaType, ASSET_LABEL_MEDIA_TYPE);
  assert.equal(decodeAssetLabel(nfc).labelId, labelId);

  const tampered = `${encoded.slice(0, -1)}0`;
  assert.throws(
    () => decodeAssetLabel(tampered),
    expectCode("LABEL_CHECKSUM_MISMATCH"),
  );
  assert.doesNotMatch(encoded, /asset-watch|household-|West Bay|Rolex/i);
});

test("label assignment is idempotent, conflict-safe, and append-only on transfer", () => {
  let registry = createLabelRegistry({
    householdId: "household-001",
    createdAt: T0,
  });
  registry = assignAssetLabel(registry, {
    assignmentId: "label-assignment-001",
    labelId: "lbl_Q7w9x2K4",
    assetId: "asset-watch-001",
    assignedBy: "member-owner",
    assignedAt: T1,
    source: "qr",
  });
  const same = assignAssetLabel(registry, {
    assignmentId: "label-assignment-001",
    labelId: "lbl_Q7w9x2K4",
    assetId: "asset-watch-001",
    assignedBy: "member-owner",
    assignedAt: T2,
    source: "qr",
  });
  assert.strictEqual(same, registry);
  assert.throws(
    () =>
      assignAssetLabel(registry, {
        assignmentId: "label-assignment-002",
        labelId: "lbl_Q7w9x2K4",
        assetId: "asset-art-001",
        assignedBy: "member-owner",
        assignedAt: T2,
      }),
    expectCode("LABEL_ALREADY_ASSIGNED"),
  );

  registry = transferAssetLabel(registry, {
    assignmentId: "label-assignment-003",
    labelId: "lbl_Q7w9x2K4",
    expectedAssetId: "asset-watch-001",
    nextAssetId: "asset-art-001",
    transferredBy: "member-owner",
    transferredAt: T3,
    source: "nfc",
  });
  assert.equal(registry.assignments.length, 2);
  assert.equal(registry.assignments[0].endedAt, T3);
  assert.equal(
    resolveAssetLabel(registry, "lbl_Q7w9x2K4").assetId,
    "asset-art-001",
  );
});

function currentLocation() {
  return {
    id: "location-001",
    assetId: "asset-watch-001",
    status: "known",
    placeId: "west-bay-home",
    spaceId: "study",
    locationDetail: "Display cabinet",
    revision: 3,
    startedAt: T0,
    endedAt: null,
  };
}

function movementCommand(overrides = {}) {
  return {
    id: "move-command-001",
    assetId: "asset-watch-001",
    expectedAssignmentId: "location-001",
    expectedRevision: 3,
    to: {
      status: "known",
      placeId: "pearl-apartment",
      spaceId: "safe",
      locationDetail: "Watch roll",
    },
    proposedBy: "member-owner",
    deviceId: "device-web-001",
    proposedAt: T2,
    newAssignmentId: "location-002",
    ...overrides,
  };
}

test("movement applies only against the expected assignment revision", () => {
  const applied = evaluateMovementCommand(
    currentLocation(),
    movementCommand(),
  );
  assert.equal(applied.kind, "apply");
  assert.equal(applied.closedCurrent.endedAt, T2);
  assert.equal(applied.nextAssignment.revision, 4);
  assert.equal(applied.nextAssignment.spaceId, "safe");

  const duplicate = evaluateMovementCommand(
    currentLocation(),
    movementCommand(),
    ["move-command-001"],
  );
  assert.equal(duplicate.kind, "idempotent");

  const satisfied = evaluateMovementCommand(
    applied.nextAssignment,
    movementCommand({
      id: "move-command-002",
      expectedRevision: 1,
      expectedAssignmentId: "stale-location",
    }),
  );
  assert.equal(satisfied.kind, "already-satisfied");
});

test("concurrent movement creates an explicit conflict instead of timestamp wins", () => {
  const result = evaluateMovementCommand(
    currentLocation(),
    movementCommand({
      expectedRevision: 2,
      expectedAssignmentId: "location-older",
    }),
  );
  assert.equal(result.kind, "conflict");
  assert.equal(result.conflict.status, "open");
  assert.equal(result.conflict.current.spaceId, "study");
  assert.equal(result.conflict.proposed.to.spaceId, "safe");

  const resolved = resolveMovementConflict(result.conflict, {
    choice: "apply-proposed",
    resolvedBy: "member-owner",
    resolvedAt: T4,
  });
  assert.equal(resolved.conflict.status, "resolved");
  assert.equal(resolved.outcome.nextAssignment.spaceId, "safe");
  assert.equal(resolved.outcome.nextAssignment.source, "conflict-resolution");

  const replay = resolveMovementConflict(resolved.conflict, {
    choice: "keep-current",
    resolvedBy: "another-member",
    resolvedAt: T5,
  });
  assert.deepEqual(replay.outcome, resolved.outcome);
});

test("background queue claims deterministically and verifies server checksum", () => {
  let queue = createBackgroundUploadQueue({
    id: "upload-queue-001",
    householdId: "household-001",
    createdAt: T0,
  });
  queue = enqueueBackgroundUpload(queue, {
    taskId: "upload-001",
    mediaId: "photo-001",
    localRef: "indexeddb://capture/photo-001",
    contentChecksum: "sha256-photo-001",
    byteSize: 1_024,
    createdAt: T1,
  });
  const same = enqueueBackgroundUpload(queue, {
    taskId: "upload-001",
    mediaId: "photo-001",
    localRef: "indexeddb://capture/photo-001",
    contentChecksum: "sha256-photo-001",
    byteSize: 1_024,
    createdAt: T2,
  });
  assert.strictEqual(same, queue);

  const claimed = claimNextBackgroundUpload(queue, {
    leaseId: "lease-001",
    claimedAt: T2,
    leaseExpiresAt: T4,
  });
  assert.equal(claimed.task.status, "uploading");
  queue = acknowledgeBackgroundUpload(claimed.queue, {
    taskId: "upload-001",
    leaseId: "lease-001",
    remoteRef: "blob://remote/photo-001",
    serverChecksum: "sha256-photo-001",
    acknowledgedAt: T3,
  });
  assert.equal(queue.tasks[0].status, "uploaded");
  assert.equal(queue.tasks[0].remoteRef, "blob://remote/photo-001");
});

test("background upload mismatch, retry, and expired leases remain recoverable", () => {
  let queue = createBackgroundUploadQueue({
    id: "upload-queue-002",
    householdId: "household-001",
    createdAt: T0,
  });
  queue = enqueueBackgroundUpload(queue, {
    taskId: "upload-002",
    mediaId: "photo-002",
    localRef: "indexeddb://capture/photo-002",
    contentChecksum: "expected-checksum",
    byteSize: 2_048,
    createdAt: T1,
  });
  let claim = claimNextBackgroundUpload(queue, {
    leaseId: "lease-002",
    claimedAt: T2,
    leaseExpiresAt: T3,
  });
  queue = acknowledgeBackgroundUpload(claim.queue, {
    taskId: "upload-002",
    leaseId: "lease-002",
    remoteRef: "blob://wrong",
    serverChecksum: "wrong-checksum",
    acknowledgedAt: T3,
  });
  assert.equal(queue.tasks[0].status, "needs-attention");
  assert.equal(queue.tasks[0].lastError.code, "CHECKSUM_MISMATCH");

  let retryQueue = createBackgroundUploadQueue({
    id: "upload-queue-003",
    householdId: "household-001",
    createdAt: T0,
  });
  retryQueue = enqueueBackgroundUpload(retryQueue, {
    taskId: "upload-003",
    mediaId: "photo-003",
    localRef: "indexeddb://capture/photo-003",
    contentChecksum: "sha256-photo-003",
    byteSize: 3_072,
    createdAt: T1,
  });
  claim = claimNextBackgroundUpload(retryQueue, {
    leaseId: "lease-003",
    claimedAt: T2,
    leaseExpiresAt: T4,
  });
  retryQueue = failBackgroundUpload(claim.queue, {
    taskId: "upload-003",
    leaseId: "lease-003",
    code: "OFFLINE",
    message: "Connection lost.",
    retryable: true,
    retryAfter: T5,
    failedAt: T3,
  });
  assert.equal(retryQueue.tasks[0].status, "queued");
  assert.equal(
    claimNextBackgroundUpload(retryQueue, {
      leaseId: "lease-too-early",
      claimedAt: T4,
      leaseExpiresAt: T5,
    }).task,
    null,
  );

  claim = claimNextBackgroundUpload(retryQueue, {
    leaseId: "lease-004",
    claimedAt: T5,
    leaseExpiresAt: "2026-07-25T09:06:00.000Z",
  });
  const recovered = recoverExpiredBackgroundUploads(
    claim.queue,
    "2026-07-25T09:07:00.000Z",
  );
  assert.equal(recovered.tasks[0].status, "queued");
  assert.equal(recovered.tasks[0].lastError.code, "UPLOAD_LEASE_EXPIRED");
});

test("web camera fallback uses caller-issued IDs and exposes honest capabilities", async () => {
  const picked = [
    { name: "room-1.jpg", type: "image/jpeg", size: 123 },
    { name: "room-2.jpg", type: "image/jpeg", size: 456 },
  ];
  const adapter = createWebCameraFallbackAdapter({
    pickFiles: async () => picked,
  });
  assert.equal(adapter.kind, "web-fallback");
  assert.equal(adapter.getCapabilities().documentEdgeDetection, false);

  const captured = await adapter.capture({
    mediaIds: ["capture-media-001", "capture-media-002"],
    capturedAt: T1,
    multiple: true,
  });
  assert.deepEqual(
    captured.map((item) => item.id),
    ["capture-media-001", "capture-media-002"],
  );
  assert.equal(captured[0].file, picked[0]);
  assert.equal(captured[0].source, "file-picker");
});

test("web upload fallback is foreground-only and returns server acknowledgement", async () => {
  const adapter = createWebForegroundUploadAdapter({
    transport: async (task) => ({
      remoteRef: `blob://remote/${task.mediaId}`,
      serverChecksum: task.contentChecksum,
    }),
  });
  assert.equal(adapter.kind, "web-foreground-fallback");
  assert.equal(adapter.getCapabilities().backgroundExecution, false);

  const response = await adapter.upload({
    id: "upload-004",
    mediaId: "photo-004",
    status: "uploading",
    contentChecksum: "sha256-photo-004",
  });
  assert.deepEqual(response, {
    remoteRef: "blob://remote/photo-004",
    serverChecksum: "sha256-photo-004",
  });
  await assert.rejects(
    () =>
      adapter.upload({
        id: "upload-not-claimed",
        mediaId: "photo-005",
        status: "queued",
      }),
    expectCode("UPLOAD_NOT_CLAIMED"),
  );
});
