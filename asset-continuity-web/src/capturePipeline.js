export const CAPTURE_PIPELINE_VERSION = 1;

export const DOCUMENT_SCAN_STATES = Object.freeze([
  "draft",
  "capturing",
  "queued-ocr",
  "processing-ocr",
  "needs-review",
  "completed",
  "failed",
  "cancelled",
]);

export const ROOM_CAPTURE_STATES = Object.freeze([
  "draft",
  "capturing",
  "paused",
  "ready",
  "committed",
  "abandoned",
]);

export const UPLOAD_STATES = Object.freeze([
  "queued",
  "uploading",
  "uploaded",
  "needs-attention",
  "cancelled",
]);

const LOCATION_STATES = new Set([
  "known",
  "needs-detail",
  "unknown",
  "virtual",
  "not-applicable",
]);

const MEDIA_SOURCES = new Set([
  "camera",
  "document-scanner",
  "file-picker",
  "share",
  "unknown",
]);

const DOCUMENT_TRANSITIONS = Object.freeze({
  draft: new Set(["capturing", "cancelled"]),
  capturing: new Set(["queued-ocr", "cancelled"]),
  "queued-ocr": new Set(["capturing", "processing-ocr", "failed", "cancelled"]),
  "processing-ocr": new Set(["needs-review", "failed", "cancelled"]),
  "needs-review": new Set(["queued-ocr", "completed", "cancelled"]),
  failed: new Set(["capturing", "queued-ocr", "cancelled"]),
  completed: new Set(),
  cancelled: new Set(),
});

export class CapturePipelineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CapturePipelineError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new CapturePipelineError(code, message, details);
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_ARGUMENT", `${name} must be an object.`, { field: name });
  }
  return value;
}

function requireString(value, name, maxLength = 300) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    fail("INVALID_ARGUMENT", `${name} is required.`, { field: name });
  }
  if (normalized.length > maxLength) {
    fail("INVALID_ARGUMENT", `${name} is too long.`, { field: name });
  }
  return normalized;
}

function optionalString(value, maxLength = 2_000) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    fail("INVALID_ARGUMENT", "Text value is too long.");
  }
  return normalized;
}

function requireId(value, name = "id") {
  const id = requireString(value, name, 200);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    fail(
      "INVALID_ID",
      `${name} must be an opaque identifier without spaces.`,
      { field: name },
    );
  }
  return id;
}

function normalizeIso(value, name = "timestamp") {
  const text = requireString(value, name, 100);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    fail("INVALID_TIMESTAMP", `${name} must be a valid ISO timestamp.`, {
      field: name,
    });
  }
  return new Date(timestamp).toISOString();
}

function normalizeConfidence(value, name = "confidence") {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    fail("INVALID_CONFIDENCE", `${name} must be between 0 and 1.`, {
      field: name,
    });
  }
  return confidence;
}

function normalizeNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    fail("INVALID_ARGUMENT", `${name} must be a non-negative integer.`, {
      field: name,
    });
  }
  return number;
}

function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function evolve(record, patch, at) {
  return {
    ...record,
    ...patch,
    revision: normalizeNonNegativeInteger(record.revision, "revision") + 1,
    updatedAt: normalizeIso(at, "updatedAt"),
  };
}

function transitionDocument(job, nextStatus, at, patch = {}) {
  requireDocumentScanJob(job);
  const allowed = DOCUMENT_TRANSITIONS[job.status];
  if (!allowed?.has(nextStatus)) {
    fail(
      "INVALID_SCAN_TRANSITION",
      `Document scan cannot move from ${job.status} to ${nextStatus}.`,
      { from: job.status, to: nextStatus },
    );
  }
  return evolve(job, { ...patch, status: nextStatus }, at);
}

function requireDocumentScanJob(job) {
  requireObject(job, "job");
  requireId(job.id, "job.id");
  if (!DOCUMENT_SCAN_STATES.includes(job.status)) {
    fail("INVALID_SCAN_JOB", "Document scan status is invalid.");
  }
  if (!Array.isArray(job.pages)) {
    fail("INVALID_SCAN_JOB", "Document scan pages must be an array.");
  }
  return job;
}

function normalizeScanPage(page, ordinal) {
  requireObject(page, "page");
  const width = page.width === undefined ? null : Number(page.width);
  const height = page.height === undefined ? null : Number(page.height);
  if (width !== null && (!Number.isFinite(width) || width <= 0)) {
    fail("INVALID_SCAN_PAGE", "page.width must be a positive number.");
  }
  if (height !== null && (!Number.isFinite(height) || height <= 0)) {
    fail("INVALID_SCAN_PAGE", "page.height must be a positive number.");
  }
  const source = page.source || "unknown";
  if (!MEDIA_SOURCES.has(source)) {
    fail("INVALID_MEDIA_SOURCE", `Unsupported media source: ${source}.`);
  }
  return {
    id: requireId(page.id, "page.id"),
    mediaId: requireId(page.mediaId, "page.mediaId"),
    ordinal,
    mimeType: requireString(page.mimeType, "page.mimeType", 150).toLowerCase(),
    checksum: optionalString(page.checksum, 256),
    width,
    height,
    source,
    capturedAt: normalizeIso(page.capturedAt, "page.capturedAt"),
  };
}

function normalizeProposedField(field, pageIds) {
  requireObject(field, "proposedField");
  const sourcePageIds = [...new Set((field.sourcePageIds || []).map((id) =>
    requireId(id, "sourcePageId"),
  ))];
  if (!sourcePageIds.length) {
    fail(
      "INVALID_OCR_RESULT",
      "Every proposed field must cite at least one source page.",
    );
  }
  const missingPage = sourcePageIds.find((id) => !pageIds.has(id));
  if (missingPage) {
    fail("INVALID_OCR_RESULT", "OCR result cites an unknown scan page.", {
      pageId: missingPage,
    });
  }
  return {
    id: requireId(field.id, "proposedField.id"),
    key: requireString(field.key, "proposedField.key", 120),
    label: optionalString(field.label, 200),
    value: String(field.value ?? ""),
    confidence: normalizeConfidence(field.confidence),
    sourcePageIds,
  };
}

function normalizeOcrResult(result, job) {
  requireObject(result, "result");
  const pageIds = new Set(job.pages.map((page) => page.id));
  const pages = (result.pages || []).map((pageResult) => {
    requireObject(pageResult, "pageResult");
    const pageId = requireId(pageResult.pageId, "pageResult.pageId");
    if (!pageIds.has(pageId)) {
      fail("INVALID_OCR_RESULT", "OCR returned an unknown page.", { pageId });
    }
    return {
      pageId,
      text: String(pageResult.text ?? ""),
      confidence: normalizeConfidence(pageResult.confidence ?? 0),
      language: optionalString(pageResult.language, 30),
    };
  });
  const returnedPageIds = new Set(pages.map((page) => page.pageId));
  if (returnedPageIds.size !== pages.length) {
    fail("INVALID_OCR_RESULT", "OCR returned the same page more than once.");
  }
  if (pages.length !== job.pages.length) {
    fail("INVALID_OCR_RESULT", "OCR must return one result for every scan page.");
  }

  const proposedFields = (result.proposedFields || []).map((field) =>
    normalizeProposedField(field, pageIds),
  );
  const fieldIds = new Set(proposedFields.map((field) => field.id));
  if (fieldIds.size !== proposedFields.length) {
    fail("INVALID_OCR_RESULT", "OCR proposed field IDs must be unique.");
  }
  return {
    adapterId: requireId(result.adapterId, "result.adapterId"),
    adapterVersion: requireString(
      result.adapterVersion,
      "result.adapterVersion",
      100,
    ),
    pages,
    proposedFields,
    warnings: (result.warnings || []).map((warning) =>
      requireString(warning, "warning", 500),
    ),
  };
}

export function createDocumentScanJob({
  id,
  householdId,
  assetId = null,
  documentType = null,
  createdAt,
}) {
  const timestamp = normalizeIso(createdAt, "createdAt");
  return {
    schemaVersion: CAPTURE_PIPELINE_VERSION,
    id: requireId(id),
    householdId: requireId(householdId, "householdId"),
    assetId: assetId ? requireId(assetId, "assetId") : null,
    documentType: optionalString(documentType, 120),
    status: "draft",
    pages: [],
    ocrRequest: null,
    activeAttempt: null,
    extraction: null,
    reviewDecisions: [],
    acceptedFields: [],
    lastError: null,
    retryCount: 0,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function beginDocumentScan(job, at) {
  if (job.status === "capturing") return job;
  return transitionDocument(job, "capturing", at, {
    lastError: null,
  });
}

export function appendDocumentScanPage(job, page, at) {
  requireDocumentScanJob(job);
  if (!["draft", "capturing"].includes(job.status)) {
    fail(
      "SCAN_PAGES_LOCKED",
      "Return the job to capture before changing its pages.",
    );
  }
  if (job.pages.some((item) => item.id === page.id || item.mediaId === page.mediaId)) {
    fail("DUPLICATE_SCAN_PAGE", "That scan page has already been added.");
  }
  const normalized = normalizeScanPage(page, job.pages.length + 1);
  return evolve(
    job,
    {
      status: "capturing",
      pages: [...job.pages, normalized],
      extraction: null,
      reviewDecisions: [],
      acceptedFields: [],
      lastError: null,
    },
    at,
  );
}

export function removeDocumentScanPage(job, pageId, at) {
  requireDocumentScanJob(job);
  if (job.status !== "capturing") {
    fail("SCAN_PAGES_LOCKED", "Pages can only be removed while capturing.");
  }
  const id = requireId(pageId, "pageId");
  if (!job.pages.some((page) => page.id === id)) {
    fail("SCAN_PAGE_NOT_FOUND", "Scan page was not found.", { pageId: id });
  }
  const pages = job.pages
    .filter((page) => page.id !== id)
    .map((page, index) => ({ ...page, ordinal: index + 1 }));
  return evolve(
    job,
    {
      pages,
      extraction: null,
      reviewDecisions: [],
      acceptedFields: [],
    },
    at,
  );
}

export function queueDocumentOcr(
  job,
  { adapterId, languageHints = [], queuedAt },
) {
  requireDocumentScanJob(job);
  if (!["capturing", "failed", "needs-review"].includes(job.status)) {
    fail("INVALID_SCAN_TRANSITION", "This scan is not ready to queue for OCR.");
  }
  if (!job.pages.length) {
    fail("SCAN_HAS_NO_PAGES", "Add at least one page before starting OCR.");
  }
  const uniqueLanguageHints = [...new Set(languageHints.map((language) =>
    requireString(language, "languageHint", 30).toLowerCase(),
  ))];
  return transitionDocument(job, "queued-ocr", queuedAt, {
    ocrRequest: {
      adapterId: requireId(adapterId, "adapterId"),
      languageHints: uniqueLanguageHints,
      queuedAt: normalizeIso(queuedAt, "queuedAt"),
    },
    activeAttempt: null,
    extraction: null,
    reviewDecisions: [],
    acceptedFields: [],
    lastError: null,
  });
}

export function startDocumentOcr(job, { attemptId, startedAt }) {
  requireDocumentScanJob(job);
  if (job.status !== "queued-ocr") {
    fail("INVALID_SCAN_TRANSITION", "Only a queued scan can start OCR.");
  }
  return transitionDocument(job, "processing-ocr", startedAt, {
    activeAttempt: {
      id: requireId(attemptId, "attemptId"),
      adapterId: job.ocrRequest.adapterId,
      startedAt: normalizeIso(startedAt, "startedAt"),
    },
  });
}

export function applyDocumentOcrResult(
  job,
  { attemptId, result, completedAt },
) {
  requireDocumentScanJob(job);
  if (job.status !== "processing-ocr") {
    fail("INVALID_SCAN_TRANSITION", "This scan is not processing OCR.");
  }
  const id = requireId(attemptId, "attemptId");
  if (job.activeAttempt?.id !== id) {
    fail("STALE_OCR_ATTEMPT", "OCR result belongs to a stale attempt.", {
      expectedAttemptId: job.activeAttempt?.id || null,
      receivedAttemptId: id,
    });
  }
  const extraction = normalizeOcrResult(result, job);
  if (extraction.adapterId !== job.activeAttempt.adapterId) {
    fail("OCR_ADAPTER_MISMATCH", "OCR result came from a different adapter.");
  }
  return transitionDocument(job, "needs-review", completedAt, {
    extraction: {
      ...extraction,
      attemptId: id,
      completedAt: normalizeIso(completedAt, "completedAt"),
    },
    activeAttempt: null,
    reviewDecisions: [],
    acceptedFields: [],
    lastError: null,
  });
}

export function failDocumentOcr(
  job,
  { attemptId, code, message, retryable = true, failedAt },
) {
  requireDocumentScanJob(job);
  if (!["queued-ocr", "processing-ocr"].includes(job.status)) {
    fail("INVALID_SCAN_TRANSITION", "This scan has no OCR attempt to fail.");
  }
  if (
    job.status === "processing-ocr" &&
    job.activeAttempt?.id !== requireId(attemptId, "attemptId")
  ) {
    fail("STALE_OCR_ATTEMPT", "Failure belongs to a stale OCR attempt.");
  }
  return transitionDocument(job, "failed", failedAt, {
    activeAttempt: null,
    lastError: {
      code: requireString(code, "code", 100),
      message: requireString(message, "message", 500),
      retryable: Boolean(retryable),
      failedAt: normalizeIso(failedAt, "failedAt"),
    },
  });
}

export function retryDocumentOcr(
  job,
  { adapterId = null, languageHints = null, queuedAt },
) {
  requireDocumentScanJob(job);
  if (job.status !== "failed") {
    fail("INVALID_SCAN_TRANSITION", "Only a failed OCR job can be retried.");
  }
  if (job.lastError && !job.lastError.retryable) {
    fail("OCR_FAILURE_NOT_RETRYABLE", "This OCR failure requires a new scan.");
  }
  const request = {
    adapterId: adapterId || job.ocrRequest?.adapterId,
    languageHints: languageHints || job.ocrRequest?.languageHints || [],
    queuedAt,
  };
  const queued = queueDocumentOcr(job, request);
  return {
    ...queued,
    retryCount: job.retryCount + 1,
  };
}

export function reviewDocumentOcr(
  job,
  { decisions, reviewedBy, reviewedAt },
) {
  requireDocumentScanJob(job);
  if (job.status !== "needs-review" || !job.extraction) {
    fail("OCR_NOT_READY_FOR_REVIEW", "OCR proposals are not ready for review.");
  }
  if (!Array.isArray(decisions)) {
    fail("INVALID_REVIEW", "decisions must be an array.");
  }
  const proposedById = new Map(
    job.extraction.proposedFields.map((field) => [field.id, field]),
  );
  const normalized = decisions.map((decision) => {
    requireObject(decision, "decision");
    const fieldId = requireId(decision.fieldId, "decision.fieldId");
    const field = proposedById.get(fieldId);
    if (!field) {
      fail("UNKNOWN_OCR_FIELD", "Review cites an unknown OCR field.", {
        fieldId,
      });
    }
    if (!["accept", "edit", "reject"].includes(decision.action)) {
      fail("INVALID_REVIEW", "Review action must be accept, edit, or reject.");
    }
    if (decision.action === "edit" && decision.value === undefined) {
      fail("INVALID_REVIEW", "Edited OCR fields require a replacement value.");
    }
    return {
      fieldId,
      action: decision.action,
      value:
        decision.action === "accept"
          ? field.value
          : decision.action === "edit"
            ? String(decision.value)
            : null,
    };
  });
  if (new Set(normalized.map((decision) => decision.fieldId)).size !== normalized.length) {
    fail("INVALID_REVIEW", "Each OCR field can be reviewed only once.");
  }
  if (normalized.length !== proposedById.size) {
    fail(
      "INCOMPLETE_OCR_REVIEW",
      "Accept, edit, or reject every OCR proposal before completing review.",
      { expected: proposedById.size, received: normalized.length },
    );
  }
  const actor = requireId(reviewedBy, "reviewedBy");
  const timestamp = normalizeIso(reviewedAt, "reviewedAt");
  const acceptedFields = normalized
    .filter((decision) => decision.action !== "reject")
    .map((decision) => {
      const proposal = proposedById.get(decision.fieldId);
      return {
        key: proposal.key,
        value: decision.value,
        source: "user-confirmed-ocr",
        sourceFieldId: proposal.id,
        sourcePageIds: proposal.sourcePageIds,
        confirmedBy: actor,
        confirmedAt: timestamp,
      };
    });
  return transitionDocument(job, "completed", timestamp, {
    reviewDecisions: normalized.map((decision) => ({
      ...decision,
      reviewedBy: actor,
      reviewedAt: timestamp,
    })),
    acceptedFields,
    completedAt: timestamp,
  });
}

export function cancelDocumentScan(job, { cancelledBy, cancelledAt }) {
  requireDocumentScanJob(job);
  if (["completed", "cancelled"].includes(job.status)) {
    if (job.status === "cancelled") return job;
    fail("INVALID_SCAN_TRANSITION", "A completed scan cannot be cancelled.");
  }
  return transitionDocument(job, "cancelled", cancelledAt, {
    cancelledBy: requireId(cancelledBy, "cancelledBy"),
    cancelledAt: normalizeIso(cancelledAt, "cancelledAt"),
    activeAttempt: null,
  });
}

export const OCR_ADAPTER_CONTRACT = Object.freeze({
  version: 1,
  requiredProperties: ["id", "version"],
  requiredMethods: ["extract"],
});

export function assertOcrAdapter(adapter) {
  requireObject(adapter, "adapter");
  requireId(adapter.id, "adapter.id");
  requireString(adapter.version, "adapter.version", 100);
  if (typeof adapter.extract !== "function") {
    fail("INVALID_OCR_ADAPTER", "OCR adapter must implement extract(request).");
  }
  return adapter;
}

export async function executeOcrAdapter(adapter, request) {
  assertOcrAdapter(adapter);
  requireObject(request, "request");
  const jobId = requireId(request.jobId, "request.jobId");
  const attemptId = requireId(request.attemptId, "request.attemptId");
  if (!Array.isArray(request.pages) || !request.pages.length) {
    fail("INVALID_OCR_REQUEST", "OCR request needs at least one page.");
  }
  const normalizedRequest = {
    jobId,
    attemptId,
    pages: request.pages.map((page) => ({
      id: requireId(page.id, "page.id"),
      mediaId: requireId(page.mediaId, "page.mediaId"),
      mimeType: requireString(page.mimeType, "page.mimeType", 150),
      checksum: optionalString(page.checksum, 256),
    })),
    languageHints: (request.languageHints || []).map((language) =>
      requireString(language, "languageHint", 30),
    ),
  };
  const result = await adapter.extract(copyJson(normalizedRequest));
  return {
    ...requireObject(result, "OCR adapter result"),
    adapterId: adapter.id,
    adapterVersion: adapter.version,
  };
}

export function createDeterministicOcrAdapter({
  id = "deterministic-ocr",
  version = "1",
  extract,
}) {
  if (typeof extract !== "function") {
    fail(
      "INVALID_OCR_ADAPTER",
      "Deterministic OCR adapter requires an extract function.",
    );
  }
  return Object.freeze({
    id: requireId(id, "adapter.id"),
    version: requireString(version, "adapter.version", 100),
    extract: async (request) => copyJson(await extract(copyJson(request))),
  });
}

function requireRoomCaptureSession(session) {
  requireObject(session, "session");
  requireId(session.id, "session.id");
  if (!ROOM_CAPTURE_STATES.includes(session.status)) {
    fail("INVALID_ROOM_SESSION", "Room capture status is invalid.");
  }
  if (!Array.isArray(session.media)) {
    fail("INVALID_ROOM_SESSION", "Room capture media must be an array.");
  }
  const ordinals = session.media.map((item) => item.ordinal);
  if (
    ordinals.some((ordinal) => !Number.isInteger(ordinal) || ordinal < 1) ||
    ordinals.some((ordinal, index) => ordinal !== index + 1)
  ) {
    fail("INVALID_ROOM_SESSION", "Room capture media order is invalid.");
  }
  return session;
}

function normalizeRoomMedia(media, ordinal) {
  requireObject(media, "media");
  const source = media.source || "unknown";
  if (!MEDIA_SOURCES.has(source)) {
    fail("INVALID_MEDIA_SOURCE", `Unsupported media source: ${source}.`);
  }
  const byteSize =
    media.byteSize === undefined
      ? null
      : normalizeNonNegativeInteger(media.byteSize, "media.byteSize");
  return {
    id: requireId(media.id, "media.id"),
    localRef: requireString(media.localRef, "media.localRef", 500),
    ordinal,
    kind: requireString(media.kind, "media.kind", 60),
    mimeType: requireString(media.mimeType, "media.mimeType", 150).toLowerCase(),
    checksum: optionalString(media.checksum, 256),
    byteSize,
    source,
    capturedAt: normalizeIso(media.capturedAt, "media.capturedAt"),
    note: optionalString(media.note, 1_000),
  };
}

export function createRoomCaptureSession({
  id,
  householdId,
  placeId,
  spaceId,
  createdBy,
  createdAt,
}) {
  const timestamp = normalizeIso(createdAt, "createdAt");
  return {
    schemaVersion: CAPTURE_PIPELINE_VERSION,
    id: requireId(id),
    householdId: requireId(householdId, "householdId"),
    placeId: requireId(placeId, "placeId"),
    spaceId: requireId(spaceId, "spaceId"),
    createdBy: requireId(createdBy, "createdBy"),
    status: "draft",
    media: [],
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    pausedAt: null,
    committedAt: null,
    commitId: null,
  };
}

export function beginRoomCaptureSession(session, at) {
  requireRoomCaptureSession(session);
  if (session.status === "capturing") return session;
  if (session.status !== "draft") {
    fail("INVALID_ROOM_TRANSITION", "Only a draft session can begin capture.");
  }
  return evolve(session, { status: "capturing" }, at);
}

export function appendRoomCaptureMedia(session, media, at) {
  requireRoomCaptureSession(session);
  if (!["draft", "capturing"].includes(session.status)) {
    fail(
      "ROOM_SESSION_NOT_CAPTURING",
      "Resume the room capture before adding media.",
    );
  }
  if (session.media.some((item) => item.id === media.id)) {
    fail("DUPLICATE_CAPTURE_MEDIA", "That media item is already in the session.");
  }
  const normalized = normalizeRoomMedia(media, session.media.length + 1);
  return evolve(
    session,
    {
      status: "capturing",
      media: [...session.media, normalized],
      pausedAt: null,
    },
    at,
  );
}

export function removeRoomCaptureMedia(session, mediaId, at) {
  requireRoomCaptureSession(session);
  if (session.status !== "capturing") {
    fail(
      "ROOM_SESSION_NOT_CAPTURING",
      "Media can only be removed while capturing.",
    );
  }
  const id = requireId(mediaId, "mediaId");
  if (!session.media.some((item) => item.id === id)) {
    fail("CAPTURE_MEDIA_NOT_FOUND", "Capture media was not found.", {
      mediaId: id,
    });
  }
  const media = session.media
    .filter((item) => item.id !== id)
    .map((item, index) => ({ ...item, ordinal: index + 1 }));
  return evolve(session, { media }, at);
}

export function reorderRoomCaptureMedia(session, orderedMediaIds, at) {
  requireRoomCaptureSession(session);
  if (session.status !== "capturing") {
    fail(
      "ROOM_SESSION_NOT_CAPTURING",
      "Media can only be reordered while capturing.",
    );
  }
  if (!Array.isArray(orderedMediaIds)) {
    fail("INVALID_MEDIA_ORDER", "orderedMediaIds must be an array.");
  }
  const ids = orderedMediaIds.map((id) => requireId(id, "mediaId"));
  if (
    ids.length !== session.media.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !session.media.some((item) => item.id === id))
  ) {
    fail(
      "INVALID_MEDIA_ORDER",
      "Media order must include every item exactly once.",
    );
  }
  const byId = new Map(session.media.map((item) => [item.id, item]));
  const media = ids.map((id, index) => ({
    ...byId.get(id),
    ordinal: index + 1,
  }));
  return evolve(session, { media }, at);
}

export function pauseRoomCaptureSession(session, at) {
  requireRoomCaptureSession(session);
  if (session.status === "paused") return session;
  if (session.status !== "capturing") {
    fail("INVALID_ROOM_TRANSITION", "Only an active capture can be paused.");
  }
  const timestamp = normalizeIso(at, "pausedAt");
  return evolve(session, { status: "paused", pausedAt: timestamp }, timestamp);
}

export function resumeRoomCaptureSession(session, at) {
  requireRoomCaptureSession(session);
  if (session.status === "capturing") return session;
  if (session.status !== "paused") {
    fail("INVALID_ROOM_TRANSITION", "Only a paused capture can be resumed.");
  }
  return evolve(session, { status: "capturing", pausedAt: null }, at);
}

export function markRoomCaptureReady(session, at) {
  requireRoomCaptureSession(session);
  if (!["capturing", "paused"].includes(session.status)) {
    fail("INVALID_ROOM_TRANSITION", "This room capture cannot be marked ready.");
  }
  if (!session.media.length) {
    fail("EMPTY_ROOM_CAPTURE", "Capture at least one item before finishing.");
  }
  const missingChecksum = session.media.find((item) => !item.checksum);
  if (missingChecksum) {
    fail(
      "MEDIA_CHECKSUM_REQUIRED",
      "Every room capture item needs a checksum before it is ready.",
      { mediaId: missingChecksum.id },
    );
  }
  return evolve(session, { status: "ready", pausedAt: null }, at);
}

export function commitRoomCaptureSession(session, { commitId, committedAt }) {
  requireRoomCaptureSession(session);
  if (session.status === "committed") {
    if (session.commitId === commitId) return session;
    fail("ROOM_ALREADY_COMMITTED", "Room capture was already committed.");
  }
  if (session.status !== "ready") {
    fail("INVALID_ROOM_TRANSITION", "Only a ready room capture can be committed.");
  }
  const timestamp = normalizeIso(committedAt, "committedAt");
  return evolve(
    session,
    {
      status: "committed",
      commitId: requireId(commitId, "commitId"),
      committedAt: timestamp,
    },
    timestamp,
  );
}

export function abandonRoomCaptureSession(
  session,
  { abandonedBy, abandonedAt },
) {
  requireRoomCaptureSession(session);
  if (session.status === "abandoned") return session;
  if (session.status === "committed") {
    fail("INVALID_ROOM_TRANSITION", "A committed capture cannot be abandoned.");
  }
  return evolve(
    session,
    {
      status: "abandoned",
      abandonedBy: requireId(abandonedBy, "abandonedBy"),
      abandonedAt: normalizeIso(abandonedAt, "abandonedAt"),
    },
    abandonedAt,
  );
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function checksumText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createRoomCaptureCheckpoint(session, checkpointAt) {
  requireRoomCaptureSession(session);
  const body = {
    schemaVersion: CAPTURE_PIPELINE_VERSION,
    checkpointAt: normalizeIso(checkpointAt, "checkpointAt"),
    session: copyJson(session),
  };
  return {
    ...body,
    digest: checksumText(stableStringify(body)),
  };
}

export function serializeRoomCaptureCheckpoint(session, checkpointAt) {
  return stableStringify(createRoomCaptureCheckpoint(session, checkpointAt));
}

export function restoreRoomCaptureCheckpoint(value) {
  let checkpoint;
  try {
    checkpoint = typeof value === "string" ? JSON.parse(value) : copyJson(value);
  } catch {
    fail("INVALID_CAPTURE_CHECKPOINT", "Capture checkpoint is not valid JSON.");
  }
  requireObject(checkpoint, "checkpoint");
  if (checkpoint.schemaVersion !== CAPTURE_PIPELINE_VERSION) {
    fail(
      "UNSUPPORTED_CAPTURE_CHECKPOINT",
      "Capture checkpoint version is not supported.",
      { version: checkpoint.schemaVersion },
    );
  }
  const body = {
    schemaVersion: checkpoint.schemaVersion,
    checkpointAt: normalizeIso(checkpoint.checkpointAt, "checkpointAt"),
    session: checkpoint.session,
  };
  const expectedDigest = checksumText(stableStringify(body));
  if (checkpoint.digest !== expectedDigest) {
    fail(
      "CAPTURE_CHECKPOINT_CORRUPT",
      "Capture checkpoint failed its integrity check.",
    );
  }
  requireRoomCaptureSession(checkpoint.session);
  return copyJson(checkpoint.session);
}

export const ASSET_LABEL_MEDIA_TYPE = "application/vnd.alyr.asset-label";
const ASSET_LABEL_PREFIX = "alyr:asset-label:v1";

function normalizeLabelId(value) {
  const id = requireString(value, "labelId", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id)) {
    fail(
      "INVALID_LABEL_ID",
      "Label ID must be an opaque 8–128 character identifier.",
    );
  }
  return id;
}

export function encodeAssetLabel(labelId) {
  const id = normalizeLabelId(labelId);
  const checksum = checksumText(`${ASSET_LABEL_PREFIX}:${id}`);
  return `${ASSET_LABEL_PREFIX}:${id}:${checksum}`;
}

export function createNfcAssetLabelRecord(labelId) {
  return {
    recordType: "mime",
    mediaType: ASSET_LABEL_MEDIA_TYPE,
    data: encodeAssetLabel(labelId),
  };
}

export function decodeAssetLabel(value) {
  let payload = value;
  if (value && typeof value === "object") {
    if (
      value.mediaType &&
      String(value.mediaType).toLowerCase() !== ASSET_LABEL_MEDIA_TYPE
    ) {
      fail("UNSUPPORTED_LABEL_RECORD", "NFC record has the wrong media type.");
    }
    payload = value.data;
  }
  const text = requireString(payload, "label payload", 300);
  const match = /^alyr:asset-label:v1:([A-Za-z0-9][A-Za-z0-9_-]{7,127}):([a-f0-9]{8})$/.exec(
    text,
  );
  if (!match) {
    fail("INVALID_LABEL_PAYLOAD", "This is not a supported Heldat asset label.");
  }
  const [, labelId, checksum] = match;
  const expected = checksumText(`${ASSET_LABEL_PREFIX}:${labelId}`);
  if (checksum !== expected) {
    fail("LABEL_CHECKSUM_MISMATCH", "Asset label checksum does not match.");
  }
  return {
    schemaVersion: 1,
    labelId,
    payload: text,
  };
}

function requireLabelRegistry(registry) {
  requireObject(registry, "registry");
  requireId(registry.householdId, "registry.householdId");
  if (!Array.isArray(registry.assignments)) {
    fail("INVALID_LABEL_REGISTRY", "Label assignments must be an array.");
  }
  return registry;
}

export function createLabelRegistry({ householdId, createdAt }) {
  const timestamp = normalizeIso(createdAt, "createdAt");
  return {
    schemaVersion: CAPTURE_PIPELINE_VERSION,
    householdId: requireId(householdId, "householdId"),
    assignments: [],
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function resolveAssetLabel(registry, labelOrPayload) {
  requireLabelRegistry(registry);
  const labelId =
    typeof labelOrPayload === "string" &&
    labelOrPayload.startsWith(`${ASSET_LABEL_PREFIX}:`)
      ? decodeAssetLabel(labelOrPayload).labelId
      : normalizeLabelId(labelOrPayload);
  return (
    registry.assignments.find(
      (assignment) => assignment.labelId === labelId && !assignment.endedAt,
    ) || null
  );
}

export function assignAssetLabel(
  registry,
  {
    assignmentId,
    labelId,
    assetId,
    assignedBy,
    assignedAt,
    source = "manual",
  },
) {
  requireLabelRegistry(registry);
  const id = requireId(assignmentId, "assignmentId");
  const normalizedLabelId = normalizeLabelId(labelId);
  const normalizedAssetId = requireId(assetId, "assetId");
  if (!["qr", "nfc", "manual"].includes(source)) {
    fail("INVALID_LABEL_SOURCE", "Label source must be qr, nfc, or manual.");
  }
  const sameOperation = registry.assignments.find(
    (assignment) => assignment.id === id,
  );
  if (sameOperation) {
    if (
      sameOperation.labelId === normalizedLabelId &&
      sameOperation.assetId === normalizedAssetId
    ) {
      return registry;
    }
    fail(
      "ASSIGNMENT_ID_REUSED",
      "Assignment ID was already used for a different label operation.",
    );
  }
  const active = resolveAssetLabel(registry, normalizedLabelId);
  if (active) {
    if (active.assetId === normalizedAssetId) return registry;
    fail("LABEL_ALREADY_ASSIGNED", "Label is already assigned to another asset.", {
      labelId: normalizedLabelId,
      currentAssetId: active.assetId,
    });
  }
  const timestamp = normalizeIso(assignedAt, "assignedAt");
  return evolve(
    registry,
    {
      assignments: [
        ...registry.assignments,
        {
          id,
          labelId: normalizedLabelId,
          assetId: normalizedAssetId,
          assignedBy: requireId(assignedBy, "assignedBy"),
          assignedAt: timestamp,
          endedAt: null,
          endedBy: null,
          source,
        },
      ],
    },
    timestamp,
  );
}

export function unassignAssetLabel(
  registry,
  { labelId, expectedAssetId, endedBy, endedAt },
) {
  requireLabelRegistry(registry);
  const normalizedLabelId = normalizeLabelId(labelId);
  const active = resolveAssetLabel(registry, normalizedLabelId);
  if (!active) return registry;
  const expected = requireId(expectedAssetId, "expectedAssetId");
  if (active.assetId !== expected) {
    fail(
      "LABEL_ASSIGNMENT_CHANGED",
      "Label assignment changed before it could be removed.",
      { currentAssetId: active.assetId },
    );
  }
  const timestamp = normalizeIso(endedAt, "endedAt");
  return evolve(
    registry,
    {
      assignments: registry.assignments.map((assignment) =>
        assignment.id === active.id
          ? {
              ...assignment,
              endedAt: timestamp,
              endedBy: requireId(endedBy, "endedBy"),
            }
          : assignment,
      ),
    },
    timestamp,
  );
}

export function transferAssetLabel(
  registry,
  {
    assignmentId,
    labelId,
    expectedAssetId,
    nextAssetId,
    transferredBy,
    transferredAt,
    source = "manual",
  },
) {
  requireLabelRegistry(registry);
  const normalizedLabelId = normalizeLabelId(labelId);
  const active = resolveAssetLabel(registry, normalizedLabelId);
  if (!active) {
    fail("LABEL_NOT_ASSIGNED", "Assign this label before transferring it.");
  }
  if (active.assetId !== requireId(expectedAssetId, "expectedAssetId")) {
    fail(
      "LABEL_ASSIGNMENT_CHANGED",
      "Label assignment changed before transfer.",
      { currentAssetId: active.assetId },
    );
  }
  const timestamp = normalizeIso(transferredAt, "transferredAt");
  const actor = requireId(transferredBy, "transferredBy");
  const next = requireId(nextAssetId, "nextAssetId");
  if (next === active.assetId) return registry;
  const nextAssignmentId = requireId(assignmentId, "assignmentId");
  if (registry.assignments.some((assignment) => assignment.id === nextAssignmentId)) {
    fail("ASSIGNMENT_ID_REUSED", "Assignment ID has already been used.");
  }
  return evolve(
    registry,
    {
      assignments: [
        ...registry.assignments.map((assignment) =>
          assignment.id === active.id
            ? { ...assignment, endedAt: timestamp, endedBy: actor }
            : assignment,
        ),
        {
          id: nextAssignmentId,
          labelId: normalizedLabelId,
          assetId: next,
          assignedBy: actor,
          assignedAt: timestamp,
          endedAt: null,
          endedBy: null,
          source,
        },
      ],
    },
    timestamp,
  );
}

function normalizeLocation(value) {
  requireObject(value, "location");
  const status = value.status || "known";
  if (!LOCATION_STATES.has(status)) {
    fail("INVALID_LOCATION", `Unsupported location status: ${status}.`);
  }
  let placeId = value.placeId ? requireId(value.placeId, "placeId") : null;
  let spaceId = value.spaceId ? requireId(value.spaceId, "spaceId") : null;
  let locationDetail = optionalString(value.locationDetail, 500);
  if (status === "known" && !placeId) {
    fail("INVALID_LOCATION", "A known location requires a Place.");
  }
  if (spaceId && !placeId) {
    fail("INVALID_LOCATION", "An indoor space requires a Place.");
  }
  if (["unknown", "virtual", "not-applicable"].includes(status)) {
    placeId = null;
    spaceId = null;
    if (status !== "virtual") locationDetail = null;
  }
  return { status, placeId, spaceId, locationDetail };
}

function sameLocation(left, right) {
  if (!left || !right) return left === right;
  const a = normalizeLocation(left);
  const b = normalizeLocation(right);
  return (
    a.status === b.status &&
    a.placeId === b.placeId &&
    a.spaceId === b.spaceId &&
    a.locationDetail === b.locationDetail
  );
}

function normalizeCurrentAssignment(assignment) {
  if (assignment === null || assignment === undefined) return null;
  requireObject(assignment, "currentAssignment");
  return {
    ...assignment,
    id: requireId(assignment.id, "currentAssignment.id"),
    assetId: requireId(assignment.assetId, "currentAssignment.assetId"),
    revision: normalizeNonNegativeInteger(
      assignment.revision,
      "currentAssignment.revision",
    ),
    ...normalizeLocation(assignment),
  };
}

export function evaluateMovementCommand(
  currentAssignment,
  command,
  appliedCommandIds = [],
) {
  const current = normalizeCurrentAssignment(currentAssignment);
  requireObject(command, "command");
  const commandId = requireId(command.id, "command.id");
  const assetId = requireId(command.assetId, "command.assetId");
  const target = normalizeLocation(command.to);
  const proposedAt = normalizeIso(command.proposedAt, "command.proposedAt");
  if (appliedCommandIds.includes(commandId)) {
    return { kind: "idempotent", commandId, currentAssignment: current };
  }
  if (current && current.assetId !== assetId) {
    fail("MOVEMENT_ASSET_MISMATCH", "Movement command targets another asset.");
  }
  if (current && sameLocation(current, target)) {
    return {
      kind: "already-satisfied",
      commandId,
      currentAssignment: current,
    };
  }

  const expectedAssignmentId =
    command.expectedAssignmentId === null
      ? null
      : requireId(command.expectedAssignmentId, "command.expectedAssignmentId");
  const expectedRevision = normalizeNonNegativeInteger(
    command.expectedRevision,
    "command.expectedRevision",
  );
  const expectationMatches =
    (current?.id || null) === expectedAssignmentId &&
    (current?.revision || 0) === expectedRevision;

  const proposed = {
    commandId,
    assetId,
    expectedAssignmentId,
    expectedRevision,
    to: target,
    proposedBy: requireId(command.proposedBy, "command.proposedBy"),
    deviceId: requireId(command.deviceId, "command.deviceId"),
    proposedAt,
    newAssignmentId: requireId(
      command.newAssignmentId,
      "command.newAssignmentId",
    ),
  };

  if (!expectationMatches) {
    const fingerprint = checksumText(
      stableStringify({
        commandId,
        currentId: current?.id || null,
        currentRevision: current?.revision || 0,
      }),
    );
    return {
      kind: "conflict",
      conflict: {
        schemaVersion: CAPTURE_PIPELINE_VERSION,
        id: `movement-conflict:${assetId}:${fingerprint}`,
        type: "concurrent-location-change",
        status: "open",
        assetId,
        current,
        proposed,
        detectedAt: proposedAt,
        resolution: null,
      },
    };
  }

  return {
    kind: "apply",
    commandId,
    closedCurrent: current
      ? { ...current, endedAt: proposedAt, endedByCommandId: commandId }
      : null,
    nextAssignment: {
      id: proposed.newAssignmentId,
      assetId,
      ...target,
      revision: (current?.revision || 0) + 1,
      startedAt: proposedAt,
      endedAt: null,
      source: "user",
      commandId,
      movedBy: proposed.proposedBy,
      deviceId: proposed.deviceId,
    },
  };
}

export function resolveMovementConflict(
  conflict,
  {
    choice,
    resolvedBy,
    resolvedAt,
    customLocation = null,
    newAssignmentId = null,
  },
) {
  requireObject(conflict, "conflict");
  if (conflict.type !== "concurrent-location-change") {
    fail("INVALID_MOVEMENT_CONFLICT", "Unsupported movement conflict type.");
  }
  if (conflict.status === "resolved") {
    return { conflict, outcome: conflict.resolution.outcome };
  }
  if (conflict.status !== "open") {
    fail("INVALID_MOVEMENT_CONFLICT", "Movement conflict is not open.");
  }
  if (!["keep-current", "apply-proposed", "custom"].includes(choice)) {
    fail(
      "INVALID_CONFLICT_RESOLUTION",
      "Choose keep-current, apply-proposed, or custom.",
    );
  }
  const actor = requireId(resolvedBy, "resolvedBy");
  const timestamp = normalizeIso(resolvedAt, "resolvedAt");
  let outcome;

  if (choice === "keep-current") {
    outcome = {
      kind: "resolved",
      choice,
      closedCurrent: null,
      nextAssignment: conflict.current,
    };
  } else {
    const target =
      choice === "custom"
        ? normalizeLocation(customLocation)
        : normalizeLocation(conflict.proposed.to);
    const assignmentId = requireId(
      newAssignmentId || conflict.proposed.newAssignmentId,
      "newAssignmentId",
    );
    outcome = {
      kind: "resolved",
      choice,
      closedCurrent: conflict.current
        ? {
            ...conflict.current,
            endedAt: timestamp,
            endedByConflictId: conflict.id,
          }
        : null,
      nextAssignment: {
        id: assignmentId,
        assetId: conflict.assetId,
        ...target,
        revision: (conflict.current?.revision || 0) + 1,
        startedAt: timestamp,
        endedAt: null,
        source: "conflict-resolution",
        conflictId: conflict.id,
        movedBy: actor,
      },
    };
  }
  const resolution = {
    choice,
    resolvedBy: actor,
    resolvedAt: timestamp,
    outcome,
  };
  return {
    conflict: { ...conflict, status: "resolved", resolution },
    outcome,
  };
}

export const CAMERA_ADAPTER_CONTRACT = Object.freeze({
  version: 1,
  requiredProperties: ["id", "kind"],
  requiredMethods: ["getCapabilities", "capture"],
});

export function assertCameraAdapter(adapter) {
  requireObject(adapter, "adapter");
  requireId(adapter.id, "adapter.id");
  if (!["native", "web-fallback"].includes(adapter.kind)) {
    fail("INVALID_CAMERA_ADAPTER", "Camera adapter kind is invalid.");
  }
  if (
    typeof adapter.getCapabilities !== "function" ||
    typeof adapter.capture !== "function"
  ) {
    fail(
      "INVALID_CAMERA_ADAPTER",
      "Camera adapter must implement getCapabilities() and capture(request).",
    );
  }
  const capabilities = adapter.getCapabilities();
  requireObject(capabilities, "camera capabilities");
  return adapter;
}

export function createWebCameraFallbackAdapter({
  id = "web-file-picker",
  pickFiles,
}) {
  if (typeof pickFiles !== "function") {
    fail(
      "INVALID_CAMERA_ADAPTER",
      "Web camera fallback requires a pickFiles function.",
    );
  }
  return Object.freeze({
    id: requireId(id, "adapter.id"),
    kind: "web-fallback",
    getCapabilities() {
      return {
        camera: true,
        documentEdgeDetection: false,
        multiPageScan: true,
        rawCapture: false,
        backgroundCapture: false,
      };
    },
    async capture(request) {
      requireObject(request, "capture request");
      const mediaIds = (request.mediaIds || []).map((mediaId) =>
        requireId(mediaId, "mediaId"),
      );
      if (!mediaIds.length) {
        fail(
          "CAPTURE_MEDIA_IDS_REQUIRED",
          "Stable media IDs are required before opening the picker.",
        );
      }
      const capturedAt = normalizeIso(request.capturedAt, "capturedAt");
      const files = await pickFiles({
        accept: request.accept || "image/*,application/pdf",
        multiple: request.multiple !== false,
        captureHint: request.captureHint || "environment",
      });
      if (!Array.isArray(files)) {
        fail("INVALID_CAMERA_RESULT", "File picker must return an array.");
      }
      if (files.length > mediaIds.length) {
        fail(
          "CAPTURE_MEDIA_IDS_REQUIRED",
          "Provide one stable media ID for every selected file.",
        );
      }
      return files.map((file, index) => ({
        id: mediaIds[index],
        file,
        fileName: requireString(file.name || `capture-${index + 1}`, "file.name"),
        mimeType: requireString(
          file.type || "application/octet-stream",
          "file.type",
          150,
        ),
        byteSize: normalizeNonNegativeInteger(file.size ?? 0, "file.size"),
        source: "file-picker",
        capturedAt,
      }));
    },
  });
}

function requireUploadQueue(queue) {
  requireObject(queue, "queue");
  requireId(queue.id, "queue.id");
  if (!Array.isArray(queue.tasks)) {
    fail("INVALID_UPLOAD_QUEUE", "Upload tasks must be an array.");
  }
  return queue;
}

export function createBackgroundUploadQueue({ id, householdId, createdAt }) {
  const timestamp = normalizeIso(createdAt, "createdAt");
  return {
    schemaVersion: CAPTURE_PIPELINE_VERSION,
    id: requireId(id),
    householdId: requireId(householdId, "householdId"),
    tasks: [],
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function enqueueBackgroundUpload(
  queue,
  {
    taskId,
    mediaId,
    localRef,
    contentChecksum,
    byteSize,
    createdAt,
  },
) {
  requireUploadQueue(queue);
  const id = requireId(taskId, "taskId");
  const existing = queue.tasks.find((task) => task.id === id);
  if (existing) {
    if (
      existing.mediaId === mediaId &&
      existing.contentChecksum === contentChecksum
    ) {
      return queue;
    }
    fail("UPLOAD_TASK_ID_REUSED", "Upload task ID has already been used.");
  }
  const timestamp = normalizeIso(createdAt, "createdAt");
  const task = {
    id,
    mediaId: requireId(mediaId, "mediaId"),
    localRef: requireString(localRef, "localRef", 500),
    contentChecksum: requireString(
      contentChecksum,
      "contentChecksum",
      256,
    ),
    byteSize: normalizeNonNegativeInteger(byteSize, "byteSize"),
    status: "queued",
    attemptCount: 0,
    retryAfter: null,
    lease: null,
    remoteRef: null,
    serverChecksum: null,
    lastError: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return evolve(queue, { tasks: [...queue.tasks, task] }, timestamp);
}

export function selectNextBackgroundUpload(queue, at) {
  requireUploadQueue(queue);
  const timestamp = normalizeIso(at, "at");
  const time = Date.parse(timestamp);
  return (
    [...queue.tasks]
      .filter(
        (task) =>
          task.status === "queued" &&
          (!task.retryAfter || Date.parse(task.retryAfter) <= time),
      )
      .sort(
        (left, right) =>
          Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
          left.id.localeCompare(right.id),
      )[0] || null
  );
}

export function claimNextBackgroundUpload(
  queue,
  { leaseId, claimedAt, leaseExpiresAt },
) {
  requireUploadQueue(queue);
  const next = selectNextBackgroundUpload(queue, claimedAt);
  if (!next) return { queue, task: null };
  const claimed = normalizeIso(claimedAt, "claimedAt");
  const expires = normalizeIso(leaseExpiresAt, "leaseExpiresAt");
  if (Date.parse(expires) <= Date.parse(claimed)) {
    fail("INVALID_UPLOAD_LEASE", "Upload lease must expire after it starts.");
  }
  const lease = {
    id: requireId(leaseId, "leaseId"),
    claimedAt: claimed,
    expiresAt: expires,
  };
  const task = {
    ...next,
    status: "uploading",
    attemptCount: next.attemptCount + 1,
    lease,
    updatedAt: claimed,
  };
  return {
    queue: evolve(
      queue,
      {
        tasks: queue.tasks.map((item) => (item.id === task.id ? task : item)),
      },
      claimed,
    ),
    task,
  };
}

function requireLeasedUpload(queue, taskId, leaseId) {
  requireUploadQueue(queue);
  const task = queue.tasks.find(
    (item) => item.id === requireId(taskId, "taskId"),
  );
  if (!task) fail("UPLOAD_TASK_NOT_FOUND", "Upload task was not found.");
  if (
    task.status !== "uploading" ||
    task.lease?.id !== requireId(leaseId, "leaseId")
  ) {
    fail("STALE_UPLOAD_LEASE", "Upload result belongs to a stale lease.");
  }
  return task;
}

export function acknowledgeBackgroundUpload(
  queue,
  { taskId, leaseId, remoteRef, serverChecksum, acknowledgedAt },
) {
  const task = requireLeasedUpload(queue, taskId, leaseId);
  const timestamp = normalizeIso(acknowledgedAt, "acknowledgedAt");
  const checksum = requireString(serverChecksum, "serverChecksum", 256);
  const matches = checksum === task.contentChecksum;
  const updated = {
    ...task,
    status: matches ? "uploaded" : "needs-attention",
    remoteRef: matches ? requireString(remoteRef, "remoteRef", 500) : null,
    serverChecksum: checksum,
    lease: null,
    lastError: matches
      ? null
      : {
          code: "CHECKSUM_MISMATCH",
          message: "Uploaded bytes do not match the local original.",
          retryable: false,
          occurredAt: timestamp,
        },
    updatedAt: timestamp,
  };
  return evolve(
    queue,
    {
      tasks: queue.tasks.map((item) => (item.id === task.id ? updated : item)),
    },
    timestamp,
  );
}

export function failBackgroundUpload(
  queue,
  {
    taskId,
    leaseId,
    code,
    message,
    retryable = true,
    retryAfter = null,
    failedAt,
  },
) {
  const task = requireLeasedUpload(queue, taskId, leaseId);
  const timestamp = normalizeIso(failedAt, "failedAt");
  const updated = {
    ...task,
    status: retryable ? "queued" : "needs-attention",
    retryAfter: retryable
      ? normalizeIso(retryAfter || timestamp, "retryAfter")
      : null,
    lease: null,
    lastError: {
      code: requireString(code, "code", 100),
      message: requireString(message, "message", 500),
      retryable: Boolean(retryable),
      occurredAt: timestamp,
    },
    updatedAt: timestamp,
  };
  return evolve(
    queue,
    {
      tasks: queue.tasks.map((item) => (item.id === task.id ? updated : item)),
    },
    timestamp,
  );
}

export function recoverExpiredBackgroundUploads(queue, recoveredAt) {
  requireUploadQueue(queue);
  const timestamp = normalizeIso(recoveredAt, "recoveredAt");
  const currentTime = Date.parse(timestamp);
  let changed = false;
  const tasks = queue.tasks.map((task) => {
    if (
      task.status !== "uploading" ||
      !task.lease ||
      Date.parse(task.lease.expiresAt) > currentTime
    ) {
      return task;
    }
    changed = true;
    return {
      ...task,
      status: "queued",
      lease: null,
      retryAfter: timestamp,
      lastError: {
        code: "UPLOAD_LEASE_EXPIRED",
        message: "Upload was interrupted and can be resumed.",
        retryable: true,
        occurredAt: timestamp,
      },
      updatedAt: timestamp,
    };
  });
  return changed ? evolve(queue, { tasks }, timestamp) : queue;
}

export const BACKGROUND_UPLOAD_ADAPTER_CONTRACT = Object.freeze({
  version: 1,
  requiredProperties: ["id", "kind"],
  requiredMethods: ["getCapabilities", "upload"],
});

export function assertBackgroundUploadAdapter(adapter) {
  requireObject(adapter, "adapter");
  requireId(adapter.id, "adapter.id");
  if (!["native", "web-foreground-fallback"].includes(adapter.kind)) {
    fail("INVALID_UPLOAD_ADAPTER", "Upload adapter kind is invalid.");
  }
  if (
    typeof adapter.getCapabilities !== "function" ||
    typeof adapter.upload !== "function"
  ) {
    fail(
      "INVALID_UPLOAD_ADAPTER",
      "Upload adapter must implement getCapabilities() and upload(task).",
    );
  }
  requireObject(adapter.getCapabilities(), "upload capabilities");
  return adapter;
}

export function createWebForegroundUploadAdapter({
  id = "web-foreground-upload",
  transport,
}) {
  if (typeof transport !== "function") {
    fail(
      "INVALID_UPLOAD_ADAPTER",
      "Web upload fallback requires a transport function.",
    );
  }
  return Object.freeze({
    id: requireId(id, "adapter.id"),
    kind: "web-foreground-fallback",
    getCapabilities() {
      return {
        backgroundExecution: false,
        resumableChunks: false,
        survivesProcessDeath: false,
        requiresForeground: true,
      };
    },
    async upload(task, options = {}) {
      requireObject(task, "upload task");
      if (task.status !== "uploading") {
        fail("UPLOAD_NOT_CLAIMED", "Claim the upload before sending it.");
      }
      const result = await transport(copyJson(task), options);
      requireObject(result, "transport result");
      return {
        remoteRef: requireString(result.remoteRef, "remoteRef", 500),
        serverChecksum: requireString(
          result.serverChecksum,
          "serverChecksum",
          256,
        ),
      };
    },
  });
}
