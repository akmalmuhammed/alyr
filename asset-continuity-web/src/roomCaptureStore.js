import {
  restoreRoomCaptureCheckpoint,
  serializeRoomCaptureCheckpoint,
} from "./capturePipeline.js";

const DATABASE_NAME = "alyr-continuity-room-capture";
const DATABASE_VERSION = 1;
const CHECKPOINT_STORE = "room-capture-checkpoints";
const MEDIA_STORE = "room-capture-media";
const MEDIA_SESSION_INDEX = "by-session";

export const MAX_ROOM_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_ROOM_CAPTURE_BYTES = 250 * 1024 * 1024;
export const ROOM_CAPTURE_IMAGE_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ROOM_CAPTURE_IMAGE_TYPE_SET = new Set(ROOM_CAPTURE_IMAGE_TYPES);

export class RoomCaptureStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RoomCaptureStoreError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new RoomCaptureStoreError(code, message, details);
}

function nowIso() {
  return new Date().toISOString();
}

function requireId(value, name) {
  const id = String(value ?? "").trim();
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    fail(
      "INVALID_CAPTURE_ID",
      `${name} must be an opaque identifier without spaces.`,
      { field: name },
    );
  }
  return id;
}

function requireSession(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    fail("INVALID_CAPTURE_SESSION", "Room capture session is missing.");
  }
  requireId(session.id, "session.id");
  requireId(session.householdId, "session.householdId");
  requireId(session.placeId, "session.placeId");
  requireId(session.spaceId, "session.spaceId");
  if (!Array.isArray(session.media)) {
    fail("INVALID_CAPTURE_SESSION", "Room capture media must be an array.");
  }
  return session;
}

function mediaKey(sessionId, mediaId) {
  return `${requireId(sessionId, "sessionId")}::${requireId(mediaId, "mediaId")}`;
}

function indexedDbAvailable() {
  return typeof globalThis.indexedDB !== "undefined";
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () =>
        reject(
          request.error ||
            new RoomCaptureStoreError(
              "LOCAL_STORAGE_FAILED",
              "On-device room capture storage failed.",
            ),
        ),
      { once: true },
    );
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener(
      "abort",
      () =>
        reject(
          transaction.error ||
            new RoomCaptureStoreError(
              "LOCAL_STORAGE_INTERRUPTED",
              "On-device room capture storage was interrupted.",
            ),
        ),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () =>
        reject(
          transaction.error ||
            new RoomCaptureStoreError(
              "LOCAL_STORAGE_FAILED",
              "On-device room capture storage failed.",
            ),
        ),
      { once: true },
    );
  });
}

let databasePromise = null;

async function openDatabase() {
  if (!indexedDbAvailable()) {
    fail(
      "INDEXEDDB_UNAVAILABLE",
      "This browser cannot keep a recoverable room capture on this device.",
    );
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CHECKPOINT_STORE)) {
        database.createObjectStore(CHECKPOINT_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        const mediaStore = database.createObjectStore(MEDIA_STORE, {
          keyPath: "id",
        });
        mediaStore.createIndex(MEDIA_SESSION_INDEX, "sessionId", {
          unique: false,
        });
      }
    });
    request.addEventListener(
      "success",
      () => {
        const database = request.result;
        database.addEventListener(
          "versionchange",
          () => {
            database.close();
            databasePromise = null;
          },
          { once: true },
        );
        resolve(database);
      },
      { once: true },
    );
    request.addEventListener(
      "error",
      () => {
        databasePromise = null;
        reject(
          request.error ||
            new RoomCaptureStoreError(
              "DATABASE_OPEN_FAILED",
              "Could not open on-device room capture storage.",
            ),
        );
      },
      { once: true },
    );
    request.addEventListener(
      "blocked",
      () => {
        databasePromise = null;
        reject(
          new RoomCaptureStoreError(
            "DATABASE_BLOCKED",
            "Room capture storage is open in another tab. Close it and retry.",
          ),
        );
      },
      { once: true },
    );
  });

  return databasePromise;
}

export function validateRoomCaptureImage(file) {
  if (
    typeof Blob === "undefined" ||
    !(file instanceof Blob)
  ) {
    return "Choose one or more photos to continue.";
  }
  if (!file.size) {
    return `${file.name || "That photo"} is empty. Choose another photo.`;
  }
  if (file.size > MAX_ROOM_IMAGE_BYTES) {
    return `${file.name || "That photo"} is larger than the 25 MB local limit.`;
  }
  const type = String(file.type || "").toLowerCase();
  if (!ROOM_CAPTURE_IMAGE_TYPE_SET.has(type)) {
    return `${file.name || "That file"} is not a supported JPG, PNG, or WebP photo.`;
  }
  return "";
}

export async function sha256RoomCaptureBlob(blob) {
  if (!globalThis.crypto?.subtle) {
    fail(
      "CHECKSUM_UNAVAILABLE",
      "This browser cannot create the checksum required for a recoverable capture.",
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function describeRoomCaptureImage(file) {
  const validation = validateRoomCaptureImage(file);
  if (validation) {
    fail("INVALID_ROOM_IMAGE", validation);
  }
  return {
    fileName: String(file.name || "room-photo"),
    mimeType: String(file.type).toLowerCase(),
    byteSize: file.size,
    checksum: await sha256RoomCaptureBlob(file),
  };
}

export function createRoomCaptureLocalRef(sessionId, mediaId) {
  return `indexeddb://room-capture/${requireId(
    sessionId,
    "sessionId",
  )}/${requireId(mediaId, "mediaId")}`;
}

export function createRoomCaptureSessionId({
  householdId,
  placeId,
  spaceId,
  createdBy = null,
}) {
  const hash = (value) => {
    let result = 0x811c9dc5;
    for (const character of value) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 0x01000193);
    }
    return (result >>> 0).toString(36);
  };
  const actorSuffix = createdBy
    ? `-${hash(requireId(createdBy, "createdBy"))}`
    : "";
  return `room-capture-${hash(requireId(householdId, "householdId"))}-${hash(
    requireId(placeId, "placeId"),
  )}-${hash(requireId(spaceId, "spaceId"))}${actorSuffix}`;
}

export function createCheckpointRecord(session, checkpointAt = nowIso()) {
  requireSession(session);
  const checkpoint = serializeRoomCaptureCheckpoint(session, checkpointAt);
  const parsed = JSON.parse(checkpoint);
  const totalBytes = session.media.reduce(
    (sum, item) => sum + (Number(item.byteSize) || 0),
    0,
  );
  if (totalBytes > MAX_ROOM_CAPTURE_BYTES) {
    fail(
      "ROOM_CAPTURE_TOO_LARGE",
      "This room capture is over the 250 MB on-device limit. Finish this batch, then start another.",
      { totalBytes, limit: MAX_ROOM_CAPTURE_BYTES },
    );
  }
  return {
    id: session.id,
    sessionId: session.id,
    householdId: session.householdId,
    placeId: session.placeId,
    spaceId: session.spaceId,
    status: session.status,
    checkpointAt: parsed.checkpointAt,
    digest: parsed.digest,
    itemCount: session.media.length,
    totalBytes,
    checkpoint,
  };
}

function createMediaRecord(session, media, file, description, storedAt) {
  return {
    id: mediaKey(session.id, media.id),
    sessionId: session.id,
    mediaId: media.id,
    blob: file,
    fileName: description.fileName,
    mimeType: description.mimeType,
    byteSize: description.byteSize,
    checksum: description.checksum,
    capturedAt: media.capturedAt,
    storedAt,
  };
}

async function prepareMediaRecords(session, captures, describeFile) {
  requireSession(session);
  if (!Array.isArray(captures) || !captures.length) {
    fail("EMPTY_CAPTURE_BATCH", "Choose at least one photo to add.");
  }
  const seen = new Set();
  const storedAt = nowIso();
  const records = [];
  for (const capture of captures) {
    const mediaId = requireId(capture?.mediaId, "capture.mediaId");
    if (seen.has(mediaId)) {
      fail("DUPLICATE_CAPTURE_MEDIA", "The same photo was added twice.");
    }
    seen.add(mediaId);
    const media = session.media.find((item) => item.id === mediaId);
    if (!media) {
      fail(
        "CAPTURE_MEDIA_NOT_FOUND",
        "The capture session does not contain that photo.",
        { mediaId },
      );
    }
    const description =
      capture.description || (await describeFile(capture.file));
    const validation = validateRoomCaptureImage(capture.file);
    if (validation) fail("INVALID_ROOM_IMAGE", validation);
    if (!description?.checksum) {
      fail(
        "CHECKSUM_REQUIRED",
        "Every room photo needs a checksum before it can be saved.",
        { mediaId },
      );
    }
    if (
      description.byteSize !== capture.file.size ||
      description.mimeType !== String(capture.file.type).toLowerCase()
    ) {
      fail(
        "CAPTURE_METADATA_MISMATCH",
        "Photo metadata changed before it could be saved.",
        { mediaId },
      );
    }
    if (
      media.checksum !== description.checksum ||
      media.byteSize !== description.byteSize ||
      media.mimeType !== description.mimeType
    ) {
      fail(
        "CAPTURE_METADATA_MISMATCH",
        "Photo metadata changed before it could be saved.",
        { mediaId },
      );
    }
    records.push(
      createMediaRecord(session, media, capture.file, description, storedAt),
    );
  }
  return records;
}

function assertRecoveredContext(session, expected = {}) {
  const fields = [
    ["householdId", expected.householdId],
    ["placeId", expected.placeId],
    ["spaceId", expected.spaceId],
    ["createdBy", expected.createdBy],
  ];
  for (const [field, value] of fields) {
    if (value && session[field] !== value) {
      fail(
        "CAPTURE_CONTEXT_MISMATCH",
        "This saved capture belongs to a different member, place, or room.",
        { field, expected: value, received: session[field] },
      );
    }
  }
}

async function verifyRecoveredMedia(session, records, describeFile) {
  const byMediaId = new Map(records.map((record) => [record.mediaId, record]));
  const recovered = [];
  for (const media of session.media) {
    const record = byMediaId.get(media.id);
    if (!record?.blob) {
      fail(
        "RECOVERY_MEDIA_MISSING",
        "A saved room photo is missing from this device. The draft was not opened.",
        { mediaId: media.id },
      );
    }
    const description = await describeFile(record.blob);
    if (
      description.checksum !== media.checksum ||
      description.checksum !== record.checksum ||
      description.byteSize !== media.byteSize ||
      description.byteSize !== record.byteSize ||
      description.mimeType !== media.mimeType ||
      description.mimeType !== record.mimeType
    ) {
      fail(
        "RECOVERY_MEDIA_CORRUPT",
        "A saved room photo failed its checksum. The draft was not opened.",
        { mediaId: media.id },
      );
    }
    recovered.push({
      ...record,
      fileName: record.fileName || description.fileName,
      blob: record.blob,
    });
  }
  return recovered;
}

async function saveCheckpointIndexedDb(session, checkpointAt = nowIso()) {
  const database = await openDatabase();
  const transaction = database.transaction(CHECKPOINT_STORE, "readwrite");
  const completed = transactionComplete(transaction);
  const record = createCheckpointRecord(session, checkpointAt);
  transaction.objectStore(CHECKPOINT_STORE).put(record);
  await completed;
  return record;
}

async function addMediaIndexedDb(
  session,
  captures,
  checkpointAt = nowIso(),
) {
  const records = await prepareMediaRecords(
    session,
    captures,
    describeRoomCaptureImage,
  );
  const checkpointRecord = createCheckpointRecord(session, checkpointAt);
  const database = await openDatabase();
  const transaction = database.transaction(
    [CHECKPOINT_STORE, MEDIA_STORE],
    "readwrite",
  );
  const completed = transactionComplete(transaction);
  const mediaStore = transaction.objectStore(MEDIA_STORE);
  records.forEach((record) => mediaStore.put(record));
  transaction.objectStore(CHECKPOINT_STORE).put(checkpointRecord);
  await completed;
  return { checkpoint: checkpointRecord, files: records };
}

async function removeMediaIndexedDb(
  session,
  removedMediaId,
  checkpointAt = nowIso(),
) {
  requireSession(session);
  const mediaId = requireId(removedMediaId, "removedMediaId");
  const checkpointRecord = createCheckpointRecord(session, checkpointAt);
  const database = await openDatabase();
  const transaction = database.transaction(
    [CHECKPOINT_STORE, MEDIA_STORE],
    "readwrite",
  );
  const completed = transactionComplete(transaction);
  transaction
    .objectStore(MEDIA_STORE)
    .delete(mediaKey(session.id, mediaId));
  transaction.objectStore(CHECKPOINT_STORE).put(checkpointRecord);
  await completed;
  return checkpointRecord;
}

async function loadSessionIndexedDb(sessionId, expectedContext = {}) {
  const id = requireId(sessionId, "sessionId");
  const database = await openDatabase();
  const transaction = database.transaction(
    [CHECKPOINT_STORE, MEDIA_STORE],
    "readonly",
  );
  const completed = transactionComplete(transaction);
  const [checkpointRecord, records] = await Promise.all([
    requestResult(transaction.objectStore(CHECKPOINT_STORE).get(id)),
    requestResult(
      transaction
        .objectStore(MEDIA_STORE)
        .index(MEDIA_SESSION_INDEX)
        .getAll(id),
    ),
  ]);
  await completed;
  if (!checkpointRecord) return null;
  let session;
  try {
    session = restoreRoomCaptureCheckpoint(checkpointRecord.checkpoint);
  } catch (error) {
    fail(
      "RECOVERY_CHECKPOINT_INVALID",
      "The saved room checkpoint failed its integrity check and was not opened.",
      { cause: error?.code || error?.message },
    );
  }
  assertRecoveredContext(session, expectedContext);
  if (
    checkpointRecord.digest !== JSON.parse(checkpointRecord.checkpoint).digest
  ) {
    fail(
      "RECOVERY_CHECKPOINT_INVALID",
      "The saved room checkpoint metadata does not match its contents.",
    );
  }
  const files = await verifyRecoveredMedia(
    session,
    records || [],
    describeRoomCaptureImage,
  );
  return {
    session,
    files,
    checkpointAt: checkpointRecord.checkpointAt,
    digest: checkpointRecord.digest,
  };
}

async function listRecoverableIndexedDb(context = {}) {
  const database = await openDatabase();
  const transaction = database.transaction(CHECKPOINT_STORE, "readonly");
  const completed = transactionComplete(transaction);
  const records = await requestResult(
    transaction.objectStore(CHECKPOINT_STORE).getAll(),
  );
  await completed;
  return records
    .filter(
      (record) =>
        (!context.householdId ||
          record.householdId === context.householdId) &&
        (!context.placeId || record.placeId === context.placeId) &&
        (!context.spaceId || record.spaceId === context.spaceId),
    )
    .sort((left, right) =>
      String(right.checkpointAt).localeCompare(String(left.checkpointAt)),
    )
    .map(
      ({
        checkpoint,
        ...metadata
      }) => metadata,
    );
}

async function clearSessionIndexedDb(sessionId) {
  const id = requireId(sessionId, "sessionId");
  const database = await openDatabase();
  const transaction = database.transaction(
    [CHECKPOINT_STORE, MEDIA_STORE],
    "readwrite",
  );
  const completed = transactionComplete(transaction);
  transaction.objectStore(CHECKPOINT_STORE).delete(id);
  const cursorRequest = transaction
    .objectStore(MEDIA_STORE)
    .index(MEDIA_SESSION_INDEX)
    .openCursor(id);
  cursorRequest.addEventListener("success", () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  });
  await completed;
}

export function createRoomCaptureCommitPayload(session, files) {
  requireSession(session);
  const byMediaId = new Map(
    (files || []).map((record) => [record.mediaId, record]),
  );
  return {
    schemaVersion: session.schemaVersion,
    sessionId: session.id,
    commitId: session.commitId,
    localOnly: true,
    storage: {
      kind: "indexeddb-local",
      cloudBackedUp: false,
      crossDeviceAvailable: false,
    },
    householdId: session.householdId,
    placeId: session.placeId,
    roomId: session.spaceId,
    createdBy: session.createdBy,
    createdAt: session.createdAt,
    committedAt: session.committedAt,
    media: session.media.map((media) => {
      const stored = byMediaId.get(media.id);
      if (!stored?.blob) {
        fail(
          "COMMIT_MEDIA_MISSING",
          "A room photo is missing from local storage and cannot be committed.",
          { mediaId: media.id },
        );
      }
      return {
        ...media,
        fileName: stored.fileName,
        blob: stored.blob,
      };
    }),
  };
}

export const roomCaptureStore = Object.freeze({
  isAvailable: indexedDbAvailable,
  describeFile: describeRoomCaptureImage,
  saveCheckpoint: saveCheckpointIndexedDb,
  addMedia: addMediaIndexedDb,
  removeMedia: removeMediaIndexedDb,
  loadSession: loadSessionIndexedDb,
  listRecoverable: listRecoverableIndexedDb,
  clearSession: clearSessionIndexedDb,
});

export function createMemoryRoomCaptureStore({
  describeFile = describeRoomCaptureImage,
} = {}) {
  const checkpoints = new Map();
  const mediaRecords = new Map();

  async function saveCheckpoint(session, checkpointAt = nowIso()) {
    const record = createCheckpointRecord(session, checkpointAt);
    checkpoints.set(session.id, structuredClone(record));
    return structuredClone(record);
  }

  async function addMedia(session, captures, checkpointAt = nowIso()) {
    const records = await prepareMediaRecords(
      session,
      captures,
      describeFile,
    );
    const checkpoint = createCheckpointRecord(session, checkpointAt);
    records.forEach((record) => mediaRecords.set(record.id, record));
    checkpoints.set(session.id, structuredClone(checkpoint));
    return {
      checkpoint: structuredClone(checkpoint),
      files: records.map((record) => ({ ...record })),
    };
  }

  async function removeMedia(session, removedMediaId, checkpointAt = nowIso()) {
    mediaRecords.delete(mediaKey(session.id, removedMediaId));
    return saveCheckpoint(session, checkpointAt);
  }

  async function loadSession(sessionId, expectedContext = {}) {
    const record = checkpoints.get(requireId(sessionId, "sessionId"));
    if (!record) return null;
    const session = restoreRoomCaptureCheckpoint(record.checkpoint);
    assertRecoveredContext(session, expectedContext);
    const records = [...mediaRecords.values()].filter(
      (item) => item.sessionId === session.id,
    );
    const files = await verifyRecoveredMedia(session, records, describeFile);
    return {
      session,
      files,
      checkpointAt: record.checkpointAt,
      digest: record.digest,
    };
  }

  async function listRecoverable(context = {}) {
    return [...checkpoints.values()]
      .filter(
        (record) =>
          (!context.householdId ||
            record.householdId === context.householdId) &&
          (!context.placeId || record.placeId === context.placeId) &&
          (!context.spaceId || record.spaceId === context.spaceId),
      )
      .sort((left, right) =>
        String(right.checkpointAt).localeCompare(String(left.checkpointAt)),
      )
      .map(({ checkpoint, ...metadata }) => structuredClone(metadata));
  }

  async function clearSession(sessionId) {
    const id = requireId(sessionId, "sessionId");
    checkpoints.delete(id);
    for (const [key, record] of mediaRecords) {
      if (record.sessionId === id) mediaRecords.delete(key);
    }
  }

  return Object.freeze({
    isAvailable: () => true,
    describeFile,
    saveCheckpoint,
    addMedia,
    removeMedia,
    loadSession,
    listRecoverable,
    clearSession,
  });
}
