import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_DEMO_FILE_SCOPE_ID,
  canPreviewFileType,
  copyEvidenceFilesBetweenScopes,
  deleteCaptureDraftFile,
  deleteEvidenceFile,
  describeEvidenceOriginal,
  describeLocalFile,
  getCaptureDraftFile,
  getEvidenceFile,
  getEvidenceOriginalVersion,
  listEvidenceOriginalVersions,
  purgeFileScope,
  putCaptureDraftFile,
  putEvidenceFile,
  putEvidenceFilesWithRollback,
  purgeEvidenceFileGeneration,
  replaceEvidenceFiles,
  sha256ForBlob,
  stageEvidenceFileGeneration,
  validateLocalFile,
  verifyEvidenceFileRecord,
} from "../src/fileStore.js";
import { storageKeysForScope } from "../src/storageScope.js";
import {
  persistActiveRecoveryWorkspace,
  persistActiveRecoveryWorkspaceWithFiles,
  readRecoveryRollback,
  readRecoveryGenerationState,
  resetRecoveryGenerationScope,
  rollbackRecoveryGeneration,
  stageAndActivateRecoveryGeneration,
} from "../src/restoreGeneration.js";

class MemoryEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = {}) {
    const entries = this.listeners.get(type) || [];
    entries.push({ listener, once: Boolean(options?.once) });
    this.listeners.set(type, entries);
  }

  emit(type) {
    const entries = [...(this.listeners.get(type) || [])];
    for (const entry of entries) {
      entry.listener({ type, target: this });
      if (entry.once) {
        const current = this.listeners.get(type) || [];
        this.listeners.set(
          type,
          current.filter((candidate) => candidate !== entry),
        );
      }
    }
  }
}

class MemoryRequest extends MemoryEventTarget {
  result = undefined;
  error = null;
}

class MemoryTransaction extends MemoryEventTarget {
  constructor(database, storeNames, mode = "readonly") {
    super();
    this.database = database;
    this.storeNames = new Set(
      Array.isArray(storeNames) ? storeNames : [storeNames],
    );
    this.error = null;
    this.pending = 0;
    this.completeTimer = null;
    this.completed = false;
    this.mode = mode;
    this.snapshots =
      mode === "readwrite"
        ? new Map(
            [...this.storeNames].map((name) => [
              name,
              new Map(database.stores.get(name) || []),
            ]),
          )
        : null;
  }

  objectStore(name) {
    if (!this.storeNames.has(name) || !this.database.stores.has(name)) {
      throw new Error(`Unknown object store: ${name}`);
    }
    const records = this.database.stores.get(name);
    const request = (operation) => {
      const result = new MemoryRequest();
      this.pending += 1;
      queueMicrotask(() => {
        try {
          result.result = operation();
          result.emit("success");
        } catch (error) {
          result.error = error;
          this.error = error;
          this.restoreSnapshots();
          this.completed = true;
          result.emit("error");
          this.emit("error");
        } finally {
          this.pending -= 1;
          this.scheduleCompletion();
        }
      });
      return result;
    };
    return {
      put: (record) =>
        request(() => {
          if (!record?.id) throw new Error("A key is required.");
          const putFailure = this.database.consumePutFailure(name);
          if (putFailure) throw putFailure;
          records.set(record.id, record);
          return record.id;
        }),
      get: (id) => request(() => records.get(id)),
      getAll: () => request(() => [...records.values()]),
      delete: (id) => request(() => records.delete(id)),
      clear: () =>
        request(() => {
          records.clear();
        }),
    };
  }

  scheduleCompletion() {
    if (this.completed || this.completeTimer) return;
    this.completeTimer = setTimeout(() => {
      this.completeTimer = null;
      if (this.pending) {
        this.scheduleCompletion();
        return;
      }
      this.completed = true;
      this.emit("complete");
    }, 0);
  }

  restoreSnapshots() {
    if (!this.snapshots) return;
    for (const [name, records] of this.snapshots) {
      this.database.stores.set(name, new Map(records));
    }
  }

  abort() {
    if (this.completed) throw new Error("Transaction already completed.");
    this.restoreSnapshots();
    this.completed = true;
    this.emit("abort");
  }
}

class MemoryDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.stores = new Map();
    this.putFailures = new Map();
    this.objectStoreNames = {
      contains: (storeName) => this.stores.has(storeName),
    };
  }

  createObjectStore(name) {
    this.stores.set(name, new Map());
    return {};
  }

  transaction(storeNames, mode) {
    return new MemoryTransaction(this, storeNames, mode);
  }

  failPutAfter(storeName, successfulPuts, error) {
    this.putFailures.set(storeName, {
      remaining: successfulPuts,
      error,
    });
  }

  consumePutFailure(storeName) {
    const failure = this.putFailures.get(storeName);
    if (!failure) return null;
    if (failure.remaining > 0) {
      failure.remaining -= 1;
      return null;
    }
    this.putFailures.delete(storeName);
    return failure.error;
  }
}

function createMemoryIndexedDb() {
  const databases = new Map();
  return {
    open(name, version) {
      const request = new MemoryRequest();
      queueMicrotask(() => {
        let database = databases.get(name);
        const upgrading = !database;
        if (!database) {
          database = new MemoryDatabase(name, version);
          databases.set(name, database);
        }
        request.result = database;
        if (upgrading) request.emit("upgradeneeded");
        queueMicrotask(() => request.emit("success"));
      });
      return request;
    },
    seed(databaseName, storeName, record) {
      const database = databases.get(databaseName);
      if (!database?.stores.has(storeName)) {
        throw new Error("Open the test database before seeding a legacy record.");
      }
      database.stores.get(storeName).set(record.id, record);
    },
    failPutAfter(databaseName, storeName, successfulPuts, error) {
      const database = databases.get(databaseName);
      if (!database?.stores.has(storeName)) {
        throw new Error("Open the test database before configuring a write failure.");
      }
      database.failPutAfter(storeName, successfulPuts, error);
    },
    updateWhere(databaseName, storeName, predicate, update) {
      const database = databases.get(databaseName);
      const records = database?.stores.get(storeName);
      if (!records) {
        throw new Error("Open the test database before updating a record.");
      }
      for (const [id, record] of records) {
        if (predicate(record)) records.set(id, update(record));
      }
    },
  };
}

const memoryIndexedDb = createMemoryIndexedDb();
function createMemoryLocalStorage() {
  const values = new Map();
  let nextFailure = null;
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (nextFailure?.key === key) {
        const error = nextFailure.error;
        nextFailure = null;
        throw error;
      }
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    failNextSet(key, error = new Error("Simulated storage quota failure.")) {
      nextFailure = { key, error };
    },
  };
}

const memoryLocalStorage = createMemoryLocalStorage();
globalThis.window = {
  indexedDB: memoryIndexedDb,
  localStorage: memoryLocalStorage,
};

const ACCOUNT_SCOPE_A = "account:acct-a:household-a";
const ACCOUNT_SCOPE_B = "account:acct-b:household-b";
const ACCOUNT_SCOPE_C = "account:acct-c:household-c";
const ACCOUNT_SCOPE_D = "account:acct-d:household-d";
const ACCOUNT_SCOPE_E = "account:acct-e:household-e";
const ACCOUNT_SCOPE_F = "account:acct-f:household-f";
const ACCOUNT_SCOPE_G = "account:acct-g:household-g";
const ACCOUNT_SCOPE_H = "account:acct-h:household-h";
const ACCOUNT_SCOPE_I = "account:acct-i:household-i";
const ACCOUNT_SCOPE_J = "account:acct-j:household-j";
const ACCOUNT_SCOPE_K = "account:acct-k:household-k";
const ACCOUNT_SCOPE_L = "account:acct-l:household-l";
const ACCOUNT_SCOPE_M = "account:acct-m:household-m";
const ACCOUNT_SCOPE_N = "account:acct-n:household-n";
const ACCOUNT_SCOPE_O = "account:account-metadata:household-metadata";

function textFile(body, name = "record.txt") {
  return new File([body], name, { type: "text/plain" });
}

function recoveryWorkspace(householdId, marker, evidence = []) {
  return {
    version: 8,
    household: {
      id: householdId,
      name: `Household ${householdId}`,
    },
    meta: { id: `workspace-${marker}`, updatedAt: marker },
    assets: [{ id: `asset-${marker}` }],
    evidence,
  };
}

async function atomicCaptureFixture({
  householdId,
  marker,
  evidenceId,
  body = "verified capture bytes",
  fileName = "capture.txt",
}) {
  const file = textFile(body, fileName);
  const metadata = await describeEvidenceOriginal(evidenceId, file);
  return {
    file,
    metadata,
    workspace: recoveryWorkspace(householdId, marker, [
      {
        id: evidenceId,
        assetId: `asset-${marker}`,
        kind: "paper",
        type: "Receipt",
        status: "pending",
        fileState: "ready_local",
        ...metadata,
      },
    ]),
  };
}

test("local originals require a non-empty supported file", () => {
  assert.match(validateLocalFile(new Blob([])), /empty/i);
  assert.match(
    validateLocalFile(new Blob(["<svg/>"], { type: "image/svg+xml" })),
    /PDF, photo, MP4\/MOV video/i,
  );
});

test("local original metadata always includes a SHA-256 checksum", async () => {
  const file = new File(["continuity"], "note.txt", {
    type: "text/plain",
  });
  const metadata = await describeLocalFile(file);

  assert.equal(metadata.fileName, "note.txt");
  assert.match(metadata.fileChecksum, /^[a-f0-9]{64}$/);
  assert.equal(
    metadata.fileChecksum,
    await sha256ForBlob(file),
  );
});

test("replacing a current original retains exact immutable version history", async () => {
  const first = await putEvidenceFile(
    "history-replacement",
    textFile("first immutable bytes", "history-first.txt"),
    { scopeId: ACCOUNT_SCOPE_I },
  );
  const second = await putEvidenceFile(
    "history-replacement",
    textFile("second immutable bytes", "history-second.txt"),
    { scopeId: ACCOUNT_SCOPE_I },
  );

  assert.notEqual(first.originalVersionId, second.originalVersionId);
  const current = await getEvidenceFile("history-replacement", {
    scopeId: ACCOUNT_SCOPE_I,
  });
  assert.equal(current.originalVersionId, second.originalVersionId);
  assert.equal(await current.blob.text(), "second immutable bytes");

  const history = await listEvidenceOriginalVersions(
    "history-replacement",
    { scopeId: ACCOUNT_SCOPE_I },
  );
  assert.equal(history.length, 2);
  assert.deepEqual(
    new Set(history.map((version) => version.originalVersionId)),
    new Set([first.originalVersionId, second.originalVersionId]),
  );
  assert.equal(
    history.find(
      (version) =>
        version.originalVersionId === first.originalVersionId,
    ).isCurrent,
    false,
  );
  assert.equal(
    history.find(
      (version) =>
        version.originalVersionId === second.originalVersionId,
    ).isCurrent,
    true,
  );

  const exactFirst = await getEvidenceOriginalVersion(
    "history-replacement",
    first.originalVersionId,
    { scopeId: ACCOUNT_SCOPE_I },
  );
  assert.equal(await exactFirst.blob.text(), "first immutable bytes");
  assert.equal(
    exactFirst.fileChecksum,
    await sha256ForBlob(exactFirst.blob),
  );
  assert.equal(exactFirst.isCurrent, false);
});

test("retrying identical original bytes is idempotent and never duplicates history", async () => {
  const file = textFile("one stable original", "stable.txt");
  const first = await putEvidenceFile("history-idempotent", file, {
    scopeId: ACCOUNT_SCOPE_I,
  });
  const retried = await putEvidenceFile(
    "history-idempotent",
    textFile("one stable original", "stable.txt"),
    { scopeId: ACCOUNT_SCOPE_I },
  );

  assert.equal(retried.originalVersionId, first.originalVersionId);
  assert.equal(retried.storedAt, first.storedAt);
  const history = await listEvidenceOriginalVersions(
    "history-idempotent",
    { scopeId: ACCOUNT_SCOPE_I },
  );
  assert.equal(history.length, 1);
  assert.equal(history[0].originalVersionId, first.originalVersionId);
  assert.equal(history[0].isCurrent, true);
});

test("deterministic document and room retries roll back the entire failed transaction", async () => {
  await putEvidenceFile(
    "retry-existing",
    textFile("committed original", "committed.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  await putEvidenceFile(
    "retry-existing",
    textFile("other account original", "other-account.txt"),
    { scopeId: ACCOUNT_SCOPE_B },
  );
  const committedBefore = await getEvidenceFile("retry-existing", {
    scopeId: ACCOUNT_SCOPE_A,
  });

  memoryIndexedDb.failPutAfter(
    "alyr-continuity-files",
    "evidence-files",
    2,
    new Error("Simulated quota failure on the third batch write."),
  );

  await assert.rejects(
    putEvidenceFilesWithRollback(
      [
        {
          evidenceId: "retry-existing",
          file: textFile("retry replacement", "replacement.txt"),
        },
        {
          evidenceId: "retry-new-partial",
          file: textFile("new partial", "new-partial.txt"),
        },
        {
          evidenceId: "retry-fails",
          file: textFile("fails", "fails.txt"),
        },
      ],
      { scopeId: ACCOUNT_SCOPE_A },
    ),
    /batch transaction was rolled back, so no partial originals were kept/u,
  );

  const committedAfter = await getEvidenceFile("retry-existing", {
    scopeId: ACCOUNT_SCOPE_A,
  });
  assert.equal(await committedAfter.blob.text(), "committed original");
  assert.equal(committedAfter.fileName, committedBefore.fileName);
  assert.equal(committedAfter.fileChecksum, committedBefore.fileChecksum);
  assert.equal(committedAfter.storedAt, committedBefore.storedAt);
  assert.equal(
    await getEvidenceFile("retry-new-partial", {
      scopeId: ACCOUNT_SCOPE_A,
    }),
    null,
  );
  assert.equal(
    await getEvidenceFile("retry-fails", { scopeId: ACCOUNT_SCOPE_A }),
    null,
  );
  assert.equal(
    await (
      await getEvidenceFile("retry-existing", {
        scopeId: ACCOUNT_SCOPE_B,
      })
    ).blob.text(),
    "other account original",
  );
});

test("a deterministic retry verifies its prior original before overwriting anything", async () => {
  await putEvidenceFile(
    "retry-corrupt-prior",
    textFile("prior bytes", "prior.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  memoryIndexedDb.updateWhere(
    "alyr-continuity-files",
    "evidence-files",
    (record) =>
      record.scopeId === ACCOUNT_SCOPE_A &&
      record.logicalId === "retry-corrupt-prior",
    (record) => ({ ...record, fileChecksum: "0".repeat(64) }),
  );

  await assert.rejects(
    putEvidenceFilesWithRollback(
      [
        {
          evidenceId: "retry-corrupt-prior",
          file: textFile("replacement bytes", "replacement.txt"),
        },
        {
          evidenceId: "retry-must-not-start",
          file: textFile("new bytes", "new.txt"),
        },
      ],
      { scopeId: ACCOUNT_SCOPE_A },
    ),
    /failed its SHA-256 integrity check/u,
  );

  assert.equal(
    await (
      await getEvidenceFile("retry-corrupt-prior", {
        scopeId: ACCOUNT_SCOPE_A,
      })
    ).blob.text(),
    "prior bytes",
  );
  assert.equal(
    await getEvidenceFile("retry-must-not-start", {
      scopeId: ACCOUNT_SCOPE_A,
    }),
    null,
  );
});

test("original capture fails closed when secure checksums are unavailable", async () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined,
  });
  try {
    await assert.rejects(
      () =>
        describeLocalFile(
          new File(["continuity"], "note.txt", { type: "text/plain" }),
        ),
      /secure checksum is unavailable/i,
    );
  } finally {
    if (cryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    } else {
      delete globalThis.crypto;
    }
  }
});

test("only inert raster originals are eligible for inline preview", () => {
  for (const type of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
  ]) {
    assert.equal(canPreviewFileType(type), true, type);
  }
  for (const type of [
    "application/pdf",
    "audio/mpeg",
    "video/mp4",
    "image/svg+xml",
    "text/html",
    "application/xml",
  ]) {
    assert.equal(canPreviewFileType(type), false, type);
  }
});

test("stored originals must match canonical identity, metadata, and SHA-256", async () => {
  const file = new File(["continuity"], "receipt.pdf", {
    type: "application/pdf",
  });
  const metadata = await describeLocalFile(file);
  const record = {
    id: "evidence-001",
    blob: file,
    ...metadata,
  };
  const evidence = {
    id: record.id,
    ...metadata,
  };

  const verified = await verifyEvidenceFileRecord(record, evidence);
  assert.equal(verified.checksum, metadata.fileChecksum);

  await assert.rejects(
    () =>
      verifyEvidenceFileRecord(
        { ...record, fileChecksum: "0".repeat(64) },
        evidence,
      ),
    /integrity check.*blocked/i,
  );
  await assert.rejects(
    () =>
      verifyEvidenceFileRecord(record, {
        ...evidence,
        fileChecksum: null,
      }),
    /complete SHA-256 integrity metadata/i,
  );
  await assert.rejects(
    () =>
      verifyEvidenceFileRecord(record, {
        ...evidence,
        fileSize: evidence.fileSize + 1,
      }),
    /size does not match/i,
  );
});

test("evidence and capture drafts are isolated by explicit account scope", async () => {
  await putEvidenceFile(
    "shared-evidence",
    textFile("account A", "a.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  await putEvidenceFile(
    "shared-evidence",
    textFile("account B", "b.txt"),
    { scopeId: ACCOUNT_SCOPE_B },
  );
  await putCaptureDraftFile(
    "active-draft",
    textFile("draft A", "draft-a.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  await putCaptureDraftFile(
    "active-draft",
    textFile("draft B", "draft-b.txt"),
    { scopeId: ACCOUNT_SCOPE_B },
  );

  assert.equal(
    await (
      await getEvidenceFile("shared-evidence", { scopeId: ACCOUNT_SCOPE_A })
    ).blob.text(),
    "account A",
  );
  assert.equal(
    await (
      await getEvidenceFile("shared-evidence", { scopeId: ACCOUNT_SCOPE_B })
    ).blob.text(),
    "account B",
  );
  assert.equal(await getEvidenceFile("shared-evidence"), null);
  assert.equal(
    await (
      await getCaptureDraftFile("active-draft", {
        scopeId: ACCOUNT_SCOPE_A,
      })
    ).blob.text(),
    "draft A",
  );
  assert.equal(
    await (
      await getCaptureDraftFile("active-draft", {
        scopeId: ACCOUNT_SCOPE_B,
      })
    ).blob.text(),
    "draft B",
  );

  await deleteEvidenceFile("shared-evidence", { scopeId: ACCOUNT_SCOPE_A });
  await deleteCaptureDraftFile("active-draft", {
    scopeId: ACCOUNT_SCOPE_A,
  });
  assert.equal(
    await getEvidenceFile("shared-evidence", { scopeId: ACCOUNT_SCOPE_A }),
    null,
  );
  assert.equal(
    await getCaptureDraftFile("active-draft", {
      scopeId: ACCOUNT_SCOPE_A,
    }),
    null,
  );
  assert.equal(
    await (
      await getEvidenceFile("shared-evidence", { scopeId: ACCOUNT_SCOPE_B })
    ).blob.text(),
    "account B",
  );
  assert.equal(
    await (
      await getCaptureDraftFile("active-draft", {
        scopeId: ACCOUNT_SCOPE_B,
      })
    ).blob.text(),
    "draft B",
  );
});

test("legacy raw IDs are visible only to local-demo compatibility reads", async () => {
  await putEvidenceFile("open-database", textFile("open"));
  const legacyFile = textFile("legacy local", "legacy.txt");
  const legacyMetadata = await describeLocalFile(legacyFile);
  memoryIndexedDb.seed("alyr-continuity-files", "evidence-files", {
    id: "legacy-evidence",
    blob: legacyFile,
    ...legacyMetadata,
    storedAt: "2026-07-25T00:00:00.000Z",
  });

  const localRecord = await getEvidenceFile("legacy-evidence");
  assert.equal(localRecord.scopeId, LOCAL_DEMO_FILE_SCOPE_ID);
  assert.equal(await localRecord.blob.text(), "legacy local");
  assert.equal(
    await getEvidenceFile("legacy-evidence", { scopeId: ACCOUNT_SCOPE_A }),
    null,
  );
  assert.equal(
    await getEvidenceFile("legacy-evidence", { scopeId: ACCOUNT_SCOPE_B }),
    null,
  );

  await putEvidenceFile(
    "account-physical-id-probe",
    textFile("account only", "account-only.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  const physicalAccountKey = `scope:${encodeURIComponent(
    ACCOUNT_SCOPE_A,
  )}:${encodeURIComponent("account-physical-id-probe")}`;
  assert.equal(await getEvidenceFile(physicalAccountKey), null);
  await deleteEvidenceFile(physicalAccountKey);
  assert.equal(
    await (
      await getEvidenceFile("account-physical-id-probe", {
        scopeId: ACCOUNT_SCOPE_A,
      })
    ).blob.text(),
    "account only",
  );
});

test("scoped replacement clears only the active evidence scope", async () => {
  await putEvidenceFile(
    "replace-a-old",
    textFile("old A", "old-a.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  await putEvidenceFile(
    "replace-b-keep",
    textFile("keep B", "keep-b.txt"),
    { scopeId: ACCOUNT_SCOPE_B },
  );
  await putEvidenceFile(
    "replace-local-keep",
    textFile("keep local", "keep-local.txt"),
  );

  const replacement = textFile("new A", "new-a.txt");
  const metadata = await describeLocalFile(replacement);
  const saved = await replaceEvidenceFiles(
    [
      {
        evidenceId: "replace-a-new",
        file: replacement,
        expectedFileName: metadata.fileName,
        expectedFileType: metadata.fileType,
        expectedFileSize: metadata.fileSize,
        expectedFileChecksum: metadata.fileChecksum,
      },
    ],
    { scopeId: ACCOUNT_SCOPE_A },
  );

  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, "replace-a-new");
  assert.equal(saved[0].scopeId, ACCOUNT_SCOPE_A);
  assert.equal(
    await getEvidenceFile("replace-a-old", { scopeId: ACCOUNT_SCOPE_A }),
    null,
  );
  assert.equal(
    await (
      await getEvidenceFile("replace-a-new", { scopeId: ACCOUNT_SCOPE_A })
    ).blob.text(),
    "new A",
  );
  assert.equal(
    await (
      await getEvidenceFile("replace-b-keep", { scopeId: ACCOUNT_SCOPE_B })
    ).blob.text(),
    "keep B",
  );
  assert.equal(
    await (await getEvidenceFile("replace-local-keep")).blob.text(),
    "keep local",
  );
});

test("inactive recovery generations ignore localStorage pointer tampering", async () => {
  const keys = storageKeysForScope(ACCOUNT_SCOPE_A);
  const generationId = "restore-generation-001";
  await putEvidenceFile(
    "generation-evidence",
    textFile("current bytes", "current.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  const nextFile = textFile("recovered bytes", "recovered.txt");
  const nextMetadata = await describeLocalFile(nextFile);

  await stageEvidenceFileGeneration(
    [
      {
        evidenceId: "generation-evidence",
        file: nextFile,
        expectedFileName: nextMetadata.fileName,
        expectedFileType: nextMetadata.fileType,
        expectedFileSize: nextMetadata.fileSize,
        expectedFileChecksum: nextMetadata.fileChecksum,
      },
    ],
    { scopeId: ACCOUNT_SCOPE_A, generationId },
  );

  assert.equal(
    await (
      await getEvidenceFile("generation-evidence", {
        scopeId: ACCOUNT_SCOPE_A,
      })
    ).blob.text(),
    "current bytes",
  );
  assert.equal(
    await (
      await getEvidenceFile("generation-evidence", {
        scopeId: ACCOUNT_SCOPE_A,
        generationId,
      })
    ).blob.text(),
    "recovered bytes",
  );

  memoryLocalStorage.setItem(keys.activeGeneration, generationId);
  const activated = await getEvidenceFile("generation-evidence", {
    scopeId: ACCOUNT_SCOPE_A,
  });
  assert.equal(await activated.blob.text(), "current bytes");
  assert.match(
    (
      await getEvidenceFile("generation-evidence", {
        scopeId: ACCOUNT_SCOPE_A,
        generationId,
      })
    ).originalVersionId,
    /^ov_[a-f0-9]{64}$/u,
  );

  memoryLocalStorage.removeItem(keys.activeGeneration);
  assert.equal(
    await (
      await getEvidenceFile("generation-evidence", {
        scopeId: ACCOUNT_SCOPE_A,
      })
    ).blob.text(),
    "current bytes",
  );
  await purgeEvidenceFileGeneration(ACCOUNT_SCOPE_A, generationId);
  assert.equal(
    await getEvidenceFile("generation-evidence", {
      scopeId: ACCOUNT_SCOPE_A,
      generationId,
    }),
    null,
  );
});

test("immutable histories are isolated by scope and recovery generation", async () => {
  const evidenceId = "history-isolation";
  const generationId = "history-isolated-generation-001";
  const activeA = await putEvidenceFile(
    evidenceId,
    textFile("active account A", "active-a.txt"),
    { scopeId: ACCOUNT_SCOPE_I },
  );
  const activeB = await putEvidenceFile(
    evidenceId,
    textFile("active account B", "active-b.txt"),
    { scopeId: ACCOUNT_SCOPE_J },
  );
  const stagedFirst = await putEvidenceFile(
    evidenceId,
    textFile("staged first", "staged-first.txt"),
    { scopeId: ACCOUNT_SCOPE_I, generationId },
  );
  const stagedSecond = await putEvidenceFile(
    evidenceId,
    textFile("staged second", "staged-second.txt"),
    { scopeId: ACCOUNT_SCOPE_I, generationId },
  );

  assert.deepEqual(
    (
      await listEvidenceOriginalVersions(evidenceId, {
        scopeId: ACCOUNT_SCOPE_I,
      })
    ).map((version) => version.originalVersionId),
    [activeA.originalVersionId],
  );
  assert.deepEqual(
    (
      await listEvidenceOriginalVersions(evidenceId, {
        scopeId: ACCOUNT_SCOPE_J,
      })
    ).map((version) => version.originalVersionId),
    [activeB.originalVersionId],
  );
  assert.deepEqual(
    new Set(
      (
        await listEvidenceOriginalVersions(evidenceId, {
          scopeId: ACCOUNT_SCOPE_I,
          generationId,
        })
      ).map((version) => version.originalVersionId),
    ),
    new Set([
      stagedFirst.originalVersionId,
      stagedSecond.originalVersionId,
    ]),
  );
  assert.equal(
    await getEvidenceOriginalVersion(
      evidenceId,
      stagedFirst.originalVersionId,
      { scopeId: ACCOUNT_SCOPE_I },
    ),
    null,
  );
  assert.equal(
    await getEvidenceOriginalVersion(
      evidenceId,
      stagedFirst.originalVersionId,
      { scopeId: ACCOUNT_SCOPE_J, generationId },
    ),
    null,
  );
});

test("recovery activation switches workspace and originals together and keeps one rollback", async () => {
  const keys = storageKeysForScope(ACCOUNT_SCOPE_A);
  const currentWorkspace = {
    version: 8,
    household: { id: "household-a", name: "Current household" },
    meta: { id: "workspace-current" },
    assets: [{ id: "asset-current" }],
    evidence: [{ id: "restore-evidence", fileName: "current.txt" }],
  };
  const recoveredWorkspace = {
    ...currentWorkspace,
    meta: { id: "workspace-recovered" },
    assets: [{ id: "asset-recovered" }],
    evidence: [{ id: "restore-evidence", fileName: "recovered.txt" }],
  };
  memoryLocalStorage.setItem(keys.workspace, JSON.stringify(currentWorkspace));
  await putEvidenceFile(
    "restore-evidence",
    textFile("current bytes", "current.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  const recoveredFile = textFile("recovered bytes", "recovered.txt");
  const recoveredMetadata = await describeLocalFile(recoveredFile);

  const activated = await stageAndActivateRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_A,
    currentWorkspace,
    recoveredWorkspace,
    files: [
      {
        evidenceId: "restore-evidence",
        file: recoveredFile,
        expectedFileName: recoveredMetadata.fileName,
        expectedFileType: recoveredMetadata.fileType,
        expectedFileSize: recoveredMetadata.fileSize,
        expectedFileChecksum: recoveredMetadata.fileChecksum,
      },
    ],
    now: "2026-07-25T09:00:00.000Z",
    storage: memoryLocalStorage,
  });

  assert.equal(
    memoryLocalStorage.getItem(keys.activeGeneration),
    activated.generationId,
  );
  assert.equal(
    JSON.parse(
      memoryLocalStorage.getItem(
        keys.workspaceForGeneration(activated.generationId),
      ),
    ).meta.id,
    "workspace-recovered",
  );
  assert.equal(
    await (
      await getEvidenceFile("restore-evidence", {
        scopeId: ACCOUNT_SCOPE_A,
      })
    ).blob.text(),
    "recovered bytes",
  );
  assert.equal(
    readRecoveryRollback(ACCOUNT_SCOPE_A, memoryLocalStorage)
      .previousGenerationId,
    null,
  );

  const rolledBack = await rollbackRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_A,
    storage: memoryLocalStorage,
  });
  assert.equal(rolledBack.workspace.meta.id, "workspace-current");
  assert.equal(memoryLocalStorage.getItem(keys.activeGeneration), null);
  assert.equal(
    await (
      await getEvidenceFile("restore-evidence", {
        scopeId: ACCOUNT_SCOPE_A,
      })
    ).blob.text(),
    "current bytes",
  );
  assert.equal(
    readRecoveryRollback(ACCOUNT_SCOPE_A, memoryLocalStorage),
    null,
  );
});

test("recovery rollback restores the prior current version and garbage-collects undone history", async () => {
  const evidenceId = "history-rollback";
  const currentWorkspace = recoveryWorkspace(
    "household-j",
    "history-before-restore",
    [{ id: evidenceId, fileName: "base-second.txt" }],
  );
  await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_J,
    workspace: currentWorkspace,
    now: "2026-07-25T09:20:00.000Z",
    storage: memoryLocalStorage,
  });
  const baseFirst = await putEvidenceFile(
    evidenceId,
    textFile("base first bytes", "base-first.txt"),
    { scopeId: ACCOUNT_SCOPE_J },
  );
  const baseSecond = await putEvidenceFile(
    evidenceId,
    textFile("base second bytes", "base-second.txt"),
    { scopeId: ACCOUNT_SCOPE_J },
  );
  const recoveredFile = textFile(
    "recovered current bytes",
    "recovered-current.txt",
  );
  const recoveredMetadata = await describeLocalFile(recoveredFile);
  const recoveredWorkspace = recoveryWorkspace(
    "household-j",
    "history-after-restore",
    [{ id: evidenceId, fileName: recoveredMetadata.fileName }],
  );
  const activated = await stageAndActivateRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_J,
    currentWorkspace,
    recoveredWorkspace,
    files: [
      {
        evidenceId,
        file: recoveredFile,
        expectedFileName: recoveredMetadata.fileName,
        expectedFileType: recoveredMetadata.fileType,
        expectedFileSize: recoveredMetadata.fileSize,
        expectedFileChecksum: recoveredMetadata.fileChecksum,
      },
    ],
    now: "2026-07-25T09:21:00.000Z",
    storage: memoryLocalStorage,
  });
  const recoveredCurrent = await getEvidenceFile(evidenceId, {
    scopeId: ACCOUNT_SCOPE_J,
  });
  assert.equal(await recoveredCurrent.blob.text(), "recovered current bytes");
  assert.equal(
    (
      await listEvidenceOriginalVersions(evidenceId, {
        scopeId: ACCOUNT_SCOPE_J,
      })
    ).length,
    1,
  );
  assert.deepEqual(
    new Set(
      (
        await listEvidenceOriginalVersions(evidenceId, {
          scopeId: ACCOUNT_SCOPE_J,
          generationId: null,
        })
      ).map((version) => version.originalVersionId),
    ),
    new Set([
      baseFirst.originalVersionId,
      baseSecond.originalVersionId,
    ]),
  );

  await rollbackRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_J,
    expectedHeadRevision: activated.revision,
    now: "2026-07-25T09:22:00.000Z",
    storage: memoryLocalStorage,
  });

  const restoredCurrent = await getEvidenceFile(evidenceId, {
    scopeId: ACCOUNT_SCOPE_J,
  });
  assert.equal(restoredCurrent.originalVersionId, baseSecond.originalVersionId);
  assert.equal(await restoredCurrent.blob.text(), "base second bytes");
  assert.equal(
    (
      await listEvidenceOriginalVersions(evidenceId, {
        scopeId: ACCOUNT_SCOPE_J,
      })
    ).length,
    2,
  );
  assert.equal(
    (
      await listEvidenceOriginalVersions(evidenceId, {
        scopeId: ACCOUNT_SCOPE_J,
        generationId: activated.generationId,
      })
    ).length,
    0,
  );
  assert.equal(
    await getEvidenceOriginalVersion(
      evidenceId,
      recoveredCurrent.originalVersionId,
      {
        scopeId: ACCOUNT_SCOPE_J,
        generationId: activated.generationId,
      },
    ),
    null,
  );
});

test("a failed cache pointer write cannot undo an IndexedDB activation", async () => {
  const keys = storageKeysForScope(ACCOUNT_SCOPE_B);
  const currentWorkspace = {
    version: 8,
    household: { id: "household-b", name: "Current household" },
    meta: { id: "workspace-current-b" },
    assets: [],
    evidence: [],
  };
  const recoveredWorkspace = {
    ...currentWorkspace,
    meta: { id: "workspace-recovered-b" },
  };
  memoryLocalStorage.setItem(keys.workspace, JSON.stringify(currentWorkspace));
  await putEvidenceFile(
    "keep-current-b",
    textFile("keep current", "keep.txt"),
    { scopeId: ACCOUNT_SCOPE_B },
  );
  memoryLocalStorage.failNextSet(
    keys.activeGeneration,
    new Error("Simulated active pointer quota failure."),
  );

  const activated = await stageAndActivateRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_B,
    currentWorkspace,
    recoveredWorkspace,
    files: [],
    now: "2026-07-25T09:10:00.000Z",
    storage: memoryLocalStorage,
  });

  assert.equal(memoryLocalStorage.getItem(keys.activeGeneration), null);
  assert.equal(
    JSON.parse(memoryLocalStorage.getItem(keys.workspace)).meta.id,
    "workspace-current-b",
  );
  assert.equal(
    (await readRecoveryGenerationState(
      ACCOUNT_SCOPE_B,
      memoryLocalStorage,
    )).workspace.meta.id,
    "workspace-recovered-b",
  );
  assert.equal(
    await getEvidenceFile("keep-current-b", {
      scopeId: ACCOUNT_SCOPE_B,
    }),
    null,
  );
  assert.equal(activated.workspace.meta.id, "workspace-recovered-b");
  assert.ok(readRecoveryRollback(ACCOUNT_SCOPE_B, memoryLocalStorage));
  await rollbackRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_B,
    storage: memoryLocalStorage,
  });
});

test("a stale recovery head revision rejects a concurrent activation without writes", async () => {
  const current = recoveryWorkspace("household-c", "c-current");
  const firstRecovered = recoveryWorkspace(
    "household-c",
    "c-first",
  );
  const staleRecovered = recoveryWorkspace(
    "household-c",
    "c-stale",
  );
  const first = await stageAndActivateRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_C,
    currentWorkspace: current,
    recoveredWorkspace: firstRecovered,
    files: [],
    expectedHeadRevision: 0,
    now: "2026-07-25T10:00:00.000Z",
    storage: memoryLocalStorage,
  });

  await assert.rejects(
    () =>
      stageAndActivateRecoveryGeneration({
        scopeId: ACCOUNT_SCOPE_C,
        currentWorkspace: firstRecovered,
        recoveredWorkspace: staleRecovered,
        files: [],
        expectedHeadRevision: 0,
        now: "2026-07-25T10:01:00.000Z",
        storage: memoryLocalStorage,
      }),
    (error) => error?.code === "RECOVERY_HEAD_STALE",
  );

  const state = await readRecoveryGenerationState(
    ACCOUNT_SCOPE_C,
    memoryLocalStorage,
  );
  assert.equal(state.revision, first.revision);
  assert.equal(state.activeGenerationId, first.generationId);
  assert.equal(state.workspace.meta.id, "workspace-c-first");
});

test("simultaneous restores serialize through the IndexedDB head CAS", async () => {
  const current = recoveryWorkspace("household-g", "g-current");
  const attempts = await Promise.allSettled([
    stageAndActivateRecoveryGeneration({
      scopeId: ACCOUNT_SCOPE_G,
      currentWorkspace: current,
      recoveredWorkspace: recoveryWorkspace(
        "household-g",
        "g-first",
      ),
      files: [],
      now: "2026-07-25T10:05:00.000Z",
      storage: memoryLocalStorage,
    }),
    stageAndActivateRecoveryGeneration({
      scopeId: ACCOUNT_SCOPE_G,
      currentWorkspace: current,
      recoveredWorkspace: recoveryWorkspace(
        "household-g",
        "g-second",
      ),
      files: [],
      now: "2026-07-25T10:05:01.000Z",
      storage: memoryLocalStorage,
    }),
  ]);
  const fulfilled = attempts.filter(
    (attempt) => attempt.status === "fulfilled",
  );
  const rejected = attempts.filter(
    (attempt) => attempt.status === "rejected",
  );
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason?.code, "RECOVERY_HEAD_STALE");
  const state = await readRecoveryGenerationState(
    ACCOUNT_SCOPE_G,
    memoryLocalStorage,
  );
  assert.equal(state.revision, 1);
  assert.equal(
    state.activeGenerationId,
    fulfilled[0].value.generationId,
  );
});

test("failed recovery prevalidation leaves the authoritative head and originals exact", async () => {
  const current = recoveryWorkspace(
    "household-d",
    "d-current",
    [{ id: "d-original", fileName: "current.txt" }],
  );
  await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_D,
    workspace: current,
    now: "2026-07-25T10:10:00.000Z",
    storage: memoryLocalStorage,
  });
  await putEvidenceFile(
    "d-original",
    textFile("current exact bytes", "current.txt"),
    { scopeId: ACCOUNT_SCOPE_D },
  );
  const before = await readRecoveryGenerationState(
    ACCOUNT_SCOPE_D,
    memoryLocalStorage,
  );
  const invalidRecovered = recoveryWorkspace(
    "household-d",
    "d-invalid",
    [{ id: "d-original", fileName: "invalid.txt" }],
  );

  await assert.rejects(
    () =>
      stageAndActivateRecoveryGeneration({
        scopeId: ACCOUNT_SCOPE_D,
        currentWorkspace: current,
        recoveredWorkspace: invalidRecovered,
        files: [
          {
            evidenceId: "d-original",
            file: textFile("candidate bytes", "invalid.txt"),
            expectedFileChecksum: "0".repeat(64),
          },
        ],
        now: "2026-07-25T10:11:00.000Z",
        storage: memoryLocalStorage,
      }),
    /failed checksum validation/u,
  );

  const after = await readRecoveryGenerationState(
    ACCOUNT_SCOPE_D,
    memoryLocalStorage,
  );
  assert.equal(after.revision, before.revision);
  assert.equal(after.activeGenerationId, before.activeGenerationId);
  assert.equal(after.workspace.meta.id, "workspace-d-current");
  assert.equal(
    await (
      await getEvidenceFile("d-original", {
        scopeId: ACCOUNT_SCOPE_D,
      })
    ).blob.text(),
    "current exact bytes",
  );
});

test("restore refuses a stale caller workspace instead of weakening the rollback snapshot", async () => {
  const authoritative = recoveryWorkspace(
    "household-h",
    "h-authoritative",
  );
  await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_H,
    workspace: authoritative,
    now: "2026-07-25T10:15:00.000Z",
    storage: memoryLocalStorage,
  });
  const staleCaller = {
    ...authoritative,
    assets: [{ id: "asset-unsaved-local-change" }],
  };
  await assert.rejects(
    () =>
      stageAndActivateRecoveryGeneration({
        scopeId: ACCOUNT_SCOPE_H,
        currentWorkspace: staleCaller,
        recoveredWorkspace: recoveryWorkspace(
          "household-h",
          "h-recovered",
        ),
        files: [],
        now: "2026-07-25T10:16:00.000Z",
        storage: memoryLocalStorage,
      }),
    (error) =>
      error?.code === "RESTORE_CURRENT_WORKSPACE_STALE",
  );
  const state = await readRecoveryGenerationState(
    ACCOUNT_SCOPE_H,
    memoryLocalStorage,
  );
  assert.equal(
    state.workspace.meta.id,
    "workspace-h-authoritative",
  );
  assert.deepEqual(state.workspace.assets, [
    { id: "asset-h-authoritative" },
  ]);
  assert.equal(state.rollback, null);
});

test("a second restore retains exactly one rollback generation and garbage-collects the older one", async () => {
  const base = recoveryWorkspace(
    "household-e",
    "e-base",
    [{ id: "e-original", fileName: "base.txt" }],
  );
  await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_E,
    workspace: base,
    now: "2026-07-25T10:20:00.000Z",
    storage: memoryLocalStorage,
  });
  await putEvidenceFile(
    "e-original",
    textFile("base bytes", "base.txt"),
    { scopeId: ACCOUNT_SCOPE_E },
  );
  const firstFile = textFile("first bytes", "first.txt");
  const firstMetadata = await describeLocalFile(firstFile);
  const firstWorkspace = recoveryWorkspace(
    "household-e",
    "e-first",
    [{ id: "e-original", fileName: "first.txt" }],
  );
  const first = await stageAndActivateRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_E,
    currentWorkspace: base,
    recoveredWorkspace: firstWorkspace,
    files: [
      {
        evidenceId: "e-original",
        file: firstFile,
        expectedFileChecksum: firstMetadata.fileChecksum,
      },
    ],
    now: "2026-07-25T10:21:00.000Z",
    storage: memoryLocalStorage,
  });
  const secondFile = textFile("second bytes", "second.txt");
  const secondMetadata = await describeLocalFile(secondFile);
  const secondWorkspace = recoveryWorkspace(
    "household-e",
    "e-second",
    [{ id: "e-original", fileName: "second.txt" }],
  );
  const second = await stageAndActivateRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_E,
    currentWorkspace: firstWorkspace,
    recoveredWorkspace: secondWorkspace,
    files: [
      {
        evidenceId: "e-original",
        file: secondFile,
        expectedFileChecksum: secondMetadata.fileChecksum,
      },
    ],
    now: "2026-07-25T10:22:00.000Z",
    storage: memoryLocalStorage,
  });

  assert.equal(
    await getEvidenceFile("e-original", {
      scopeId: ACCOUNT_SCOPE_E,
      generationId: null,
    }),
    null,
  );
  assert.equal(
    await (
      await getEvidenceFile("e-original", {
        scopeId: ACCOUNT_SCOPE_E,
        generationId: first.generationId,
      })
    ).blob.text(),
    "first bytes",
  );
  assert.equal(
    await (
      await getEvidenceFile("e-original", {
        scopeId: ACCOUNT_SCOPE_E,
      })
    ).blob.text(),
    "second bytes",
  );

  const rollback = await rollbackRecoveryGeneration({
    scopeId: ACCOUNT_SCOPE_E,
    expectedHeadRevision: second.revision,
    now: "2026-07-25T10:23:00.000Z",
    storage: memoryLocalStorage,
  });
  assert.equal(rollback.workspace.meta.id, "workspace-e-first");
  assert.equal(
    await getEvidenceFile("e-original", {
      scopeId: ACCOUNT_SCOPE_E,
      generationId: second.generationId,
    }),
    null,
  );
  assert.equal(
    await (
      await getEvidenceFile("e-original", {
        scopeId: ACCOUNT_SCOPE_E,
      })
    ).blob.text(),
    "first bytes",
  );
  assert.equal(
    (
      await readRecoveryGenerationState(
        ACCOUNT_SCOPE_E,
        memoryLocalStorage,
      )
    ).rollback,
    null,
  );
});

test("authoritative reset is isolated to the requested recovery scope", async () => {
  const workspaceE = recoveryWorkspace(
    "household-e",
    "e-before-reset",
  );
  await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_E,
    workspace: workspaceE,
    storage: memoryLocalStorage,
  });
  const workspaceF = recoveryWorkspace("household-f", "f-keep");
  await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_F,
    workspace: workspaceF,
    storage: memoryLocalStorage,
  });
  const resetHistoryFirst = await putEvidenceFile(
    "scope-isolation",
    textFile("remove E", "e.txt"),
    { scopeId: ACCOUNT_SCOPE_E },
  );
  await putEvidenceFile(
    "scope-isolation",
    textFile("remove E replacement", "e-replacement.txt"),
    { scopeId: ACCOUNT_SCOPE_E },
  );
  await putEvidenceFile(
    "scope-isolation",
    textFile("keep F", "f.txt"),
    { scopeId: ACCOUNT_SCOPE_F },
  );

  await resetRecoveryGenerationScope({
    scopeId: ACCOUNT_SCOPE_E,
    storage: memoryLocalStorage,
  });

  assert.equal(
    await readRecoveryGenerationState(
      ACCOUNT_SCOPE_E,
      memoryLocalStorage,
    ),
    null,
  );
  assert.equal(
    await getEvidenceFile("scope-isolation", {
      scopeId: ACCOUNT_SCOPE_E,
    }),
    null,
  );
  assert.equal(
    await getEvidenceOriginalVersion(
      "scope-isolation",
      resetHistoryFirst.originalVersionId,
      { scopeId: ACCOUNT_SCOPE_E },
    ),
    null,
  );
  assert.equal(
    (
      await readRecoveryGenerationState(
        ACCOUNT_SCOPE_F,
        memoryLocalStorage,
      )
    ).workspace.meta.id,
    "workspace-f-keep",
  );
  assert.equal(
    await (
      await getEvidenceFile("scope-isolation", {
        scopeId: ACCOUNT_SCOPE_F,
      })
    ).blob.text(),
    "keep F",
  );
});

test("explicit claim copies verified local originals without exposing account scopes", async () => {
  await putEvidenceFile(
    "claim-one",
    textFile("local one", "claim-one.txt"),
  );
  await putEvidenceFile(
    "claim-two",
    textFile("local two", "claim-two.txt"),
  );
  await putEvidenceFile(
    "account-a-private",
    textFile("private A", "private-a.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );

  const copied = await copyEvidenceFilesBetweenScopes({
    fromScopeId: LOCAL_DEMO_FILE_SCOPE_ID,
    toScopeId: ACCOUNT_SCOPE_B,
    evidenceIds: ["claim-one", "claim-two"],
  });
  assert.deepEqual(
    copied.map((record) => record.id),
    ["claim-one", "claim-two"],
  );
  assert.ok(copied.every((record) => record.scopeId === ACCOUNT_SCOPE_B));
  assert.equal(
    await (
      await getEvidenceFile("claim-one", { scopeId: ACCOUNT_SCOPE_B })
    ).blob.text(),
    "local one",
  );
  assert.equal(
    await getEvidenceFile("account-a-private", {
      scopeId: ACCOUNT_SCOPE_B,
    }),
    null,
  );
  assert.equal(
    await (
      await getEvidenceFile("account-a-private", {
        scopeId: ACCOUNT_SCOPE_A,
      })
    ).blob.text(),
    "private A",
  );
  assert.equal(
    await (await getEvidenceFile("claim-one")).blob.text(),
    "local one",
  );

  await assert.rejects(
    () =>
      copyEvidenceFilesBetweenScopes({
        fromScopeId: ACCOUNT_SCOPE_A,
        toScopeId: ACCOUNT_SCOPE_B,
      }),
    /Only the local-demo scope/i,
  );
  await assert.rejects(
    () =>
      copyEvidenceFilesBetweenScopes({
        toScopeId: ACCOUNT_SCOPE_B,
        evidenceIds: ["claim-one"],
      }),
    /already contains original/i,
  );
});

test("scope claim copies complete immutable history and preserves its current pointer", async () => {
  const evidenceId = "claim-version-history";
  const first = await putEvidenceFile(
    evidenceId,
    textFile("claim history first", "claim-history-first.txt"),
  );
  const second = await putEvidenceFile(
    evidenceId,
    textFile("claim history second", "claim-history-second.txt"),
  );

  await copyEvidenceFilesBetweenScopes({
    toScopeId: ACCOUNT_SCOPE_I,
    evidenceIds: [evidenceId],
  });

  const targetCurrent = await getEvidenceFile(evidenceId, {
    scopeId: ACCOUNT_SCOPE_I,
  });
  assert.equal(targetCurrent.originalVersionId, second.originalVersionId);
  assert.equal(await targetCurrent.blob.text(), "claim history second");
  const targetHistory = await listEvidenceOriginalVersions(evidenceId, {
    scopeId: ACCOUNT_SCOPE_I,
  });
  assert.deepEqual(
    new Set(
      targetHistory.map((version) => version.originalVersionId),
    ),
    new Set([first.originalVersionId, second.originalVersionId]),
  );
  assert.equal(
    await (
      await getEvidenceOriginalVersion(
        evidenceId,
        first.originalVersionId,
        { scopeId: ACCOUNT_SCOPE_I },
      )
    ).blob.text(),
    "claim history first",
  );
  assert.equal(
    (
      await listEvidenceOriginalVersions(evidenceId)
    ).length,
    2,
  );
});

test("generation garbage collection removes every immutable version in only that generation", async () => {
  const evidenceId = "history-generation-gc";
  const generationId = "history-gc-generation-001";
  const first = await putEvidenceFile(
    evidenceId,
    textFile("gc first", "gc-first.txt"),
    { scopeId: ACCOUNT_SCOPE_I, generationId },
  );
  await putEvidenceFile(
    evidenceId,
    textFile("gc second", "gc-second.txt"),
    { scopeId: ACCOUNT_SCOPE_I, generationId },
  );
  assert.equal(
    (
      await listEvidenceOriginalVersions(evidenceId, {
        scopeId: ACCOUNT_SCOPE_I,
        generationId,
      })
    ).length,
    2,
  );

  await purgeEvidenceFileGeneration(ACCOUNT_SCOPE_I, generationId);

  assert.equal(
    (
      await listEvidenceOriginalVersions(evidenceId, {
        scopeId: ACCOUNT_SCOPE_I,
        generationId,
      })
    ).length,
    0,
  );
  assert.equal(
    await getEvidenceOriginalVersion(
      evidenceId,
      first.originalVersionId,
      { scopeId: ACCOUNT_SCOPE_I, generationId },
    ),
    null,
  );
});

test("purging one scope removes its evidence and drafts without touching another scope", async () => {
  const purgeHistoryFirst = await putEvidenceFile(
    "purge-history",
    textFile("purge history first", "purge-history-first.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  await putEvidenceFile(
    "purge-history",
    textFile("purge history second", "purge-history-second.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  await putEvidenceFile(
    "purge-shared",
    textFile("purge A", "purge-a.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  await putEvidenceFile(
    "purge-shared",
    textFile("keep B", "purge-b.txt"),
    { scopeId: ACCOUNT_SCOPE_B },
  );
  await putCaptureDraftFile(
    "purge-draft",
    textFile("draft A", "purge-draft-a.txt"),
    { scopeId: ACCOUNT_SCOPE_A },
  );
  await putCaptureDraftFile(
    "purge-draft",
    textFile("draft B", "purge-draft-b.txt"),
    { scopeId: ACCOUNT_SCOPE_B },
  );

  await purgeFileScope(ACCOUNT_SCOPE_A);
  assert.equal(
    await getEvidenceFile("purge-shared", { scopeId: ACCOUNT_SCOPE_A }),
    null,
  );
  assert.equal(
    await getCaptureDraftFile("purge-draft", {
      scopeId: ACCOUNT_SCOPE_A,
    }),
    null,
  );
  assert.equal(
    await getEvidenceOriginalVersion(
      "purge-history",
      purgeHistoryFirst.originalVersionId,
      { scopeId: ACCOUNT_SCOPE_A },
    ),
    null,
  );
  assert.equal(
    await (
      await getEvidenceFile("purge-shared", { scopeId: ACCOUNT_SCOPE_B })
    ).blob.text(),
    "keep B",
  );
  assert.equal(
    await (
      await getCaptureDraftFile("purge-draft", {
        scopeId: ACCOUNT_SCOPE_B,
      })
    ).blob.text(),
    "draft B",
  );

  await putCaptureDraftFile(
    "local-purge-draft",
    textFile("local draft", "local-draft.txt"),
  );
  await purgeFileScope(LOCAL_DEMO_FILE_SCOPE_ID);
  assert.equal(await getEvidenceFile("claim-one"), null);
  assert.equal(await getEvidenceFile("legacy-evidence"), null);
  assert.equal(await getCaptureDraftFile("local-purge-draft"), null);
  assert.equal(
    await (
      await getEvidenceFile("purge-shared", { scopeId: ACCOUNT_SCOPE_B })
    ).blob.text(),
    "keep B",
  );
});

test("one atomic capture commit persists workspace metadata and its exact original together", async () => {
  const householdId = "household-k";
  const initial = recoveryWorkspace(householdId, "atomic-base");
  const baseline = await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_K,
    workspace: initial,
    now: "2026-07-25T10:00:00.000Z",
  });
  const capture = await atomicCaptureFixture({
    householdId,
    marker: "atomic-next",
    evidenceId: "atomic-evidence",
  });

  const committed = await persistActiveRecoveryWorkspaceWithFiles({
    scopeId: ACCOUNT_SCOPE_K,
    operationId: "capture-operation-atomic",
    workspace: capture.workspace,
    files: [
      {
        evidenceId: "atomic-evidence",
        file: capture.file,
        expectedCurrentOriginalVersionId: null,
      },
    ],
    expectedRevision: baseline.revision,
    now: "2026-07-25T10:01:00.000Z",
  });

  assert.equal(committed.idempotent, false);
  assert.equal(committed.revision, baseline.revision + 1);
  assert.equal(
    committed.records[0].originalVersionId,
    capture.metadata.originalVersionId,
  );
  const state = await readRecoveryGenerationState(ACCOUNT_SCOPE_K);
  assert.equal(state.workspace.meta.id, "workspace-atomic-next");
  assert.equal(state.workspace.evidence[0].id, "atomic-evidence");
  const original = await getEvidenceFile("atomic-evidence", {
    scopeId: ACCOUNT_SCOPE_K,
  });
  assert.equal(await original.blob.text(), "verified capture bytes");
  assert.equal(
    original.originalVersionId,
    capture.metadata.originalVersionId,
  );
});

test("a metadata-only capture uses the same atomic idempotent receipt", async () => {
  const householdId = "household-metadata";
  const baseline = await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_O,
    workspace: recoveryWorkspace(
      householdId,
      "metadata-base",
    ),
    now: "2026-07-25T10:05:00.000Z",
  });
  const input = {
    scopeId: ACCOUNT_SCOPE_O,
    operationId: "capture-operation-metadata-only",
    workspace: recoveryWorkspace(
      householdId,
      "metadata-next",
    ),
    files: [],
    expectedRevision: baseline.revision,
    now: "2026-07-25T10:06:00.000Z",
  };

  const committed =
    await persistActiveRecoveryWorkspaceWithFiles(input);
  const retried =
    await persistActiveRecoveryWorkspaceWithFiles(input);
  assert.equal(committed.idempotent, false);
  assert.equal(retried.idempotent, true);
  assert.equal(retried.revision, committed.revision);
  assert.deepEqual(committed.records, []);
  assert.deepEqual(retried.records, []);
  assert.equal(
    (
      await readRecoveryGenerationState(input.scopeId)
    ).workspace.meta.id,
    "workspace-metadata-next",
  );
});

test("a response-lost retry returns the same atomic capture receipt without duplicating bytes or revision", async () => {
  const householdId = "household-l";
  const baseline = await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_L,
    workspace: recoveryWorkspace(householdId, "retry-base"),
    now: "2026-07-25T10:10:00.000Z",
  });
  const capture = await atomicCaptureFixture({
    householdId,
    marker: "retry-next",
    evidenceId: "retry-evidence",
  });
  const input = {
    scopeId: ACCOUNT_SCOPE_L,
    operationId: "capture-operation-retry",
    workspace: capture.workspace,
    files: [
      {
        evidenceId: "retry-evidence",
        file: capture.file,
        expectedCurrentOriginalVersionId: null,
      },
    ],
    expectedRevision: baseline.revision,
    now: "2026-07-25T10:11:00.000Z",
  };

  const first = await persistActiveRecoveryWorkspaceWithFiles(input);
  const retried = await persistActiveRecoveryWorkspaceWithFiles(input);
  assert.equal(first.idempotent, false);
  assert.equal(retried.idempotent, true);
  assert.equal(retried.revision, first.revision);
  assert.deepEqual(retried.records, first.records);
  assert.equal(
    (await readRecoveryGenerationState(ACCOUNT_SCOPE_L)).revision,
    first.revision,
  );
  assert.equal(
    (
      await listEvidenceOriginalVersions("retry-evidence", {
        scopeId: ACCOUNT_SCOPE_L,
      })
    ).length,
    1,
  );
});

test("reusing an atomic capture identity for different content fails closed", async () => {
  const state = await readRecoveryGenerationState(ACCOUNT_SCOPE_L);
  const changed = await atomicCaptureFixture({
    householdId: "household-l",
    marker: "retry-changed",
    evidenceId: "retry-evidence",
    body: "different bytes",
  });
  await assert.rejects(
    persistActiveRecoveryWorkspaceWithFiles({
      scopeId: ACCOUNT_SCOPE_L,
      operationId: "capture-operation-retry",
      workspace: changed.workspace,
      files: [
        {
          evidenceId: "retry-evidence",
          file: changed.file,
          expectedCurrentOriginalVersionId:
            state.workspace.evidence[0].originalVersionId,
        },
      ],
      expectedRevision: state.revision,
      now: "2026-07-25T10:12:00.000Z",
    }),
    (error) => error?.code === "CAPTURE_OPERATION_CONFLICT",
  );
  assert.equal(
    await (
      await getEvidenceFile("retry-evidence", {
        scopeId: ACCOUNT_SCOPE_L,
      })
    ).blob.text(),
    "verified capture bytes",
  );
});

test("an interrupted atomic capture transaction leaves neither orphan bytes nor metadata", async () => {
  const householdId = "household-m";
  const baseline = await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_M,
    workspace: recoveryWorkspace(householdId, "abort-base"),
    now: "2026-07-25T10:20:00.000Z",
  });
  const capture = await atomicCaptureFixture({
    householdId,
    marker: "abort-next",
    evidenceId: "abort-evidence",
  });
  memoryIndexedDb.failPutAfter(
    "alyr-continuity-files",
    "recovery-generations",
    0,
    new Error("Simulated recovery-store interruption."),
  );

  await assert.rejects(
    persistActiveRecoveryWorkspaceWithFiles({
      scopeId: ACCOUNT_SCOPE_M,
      operationId: "capture-operation-abort",
      workspace: capture.workspace,
      files: [
        {
          evidenceId: "abort-evidence",
          file: capture.file,
          expectedCurrentOriginalVersionId: null,
        },
      ],
      expectedRevision: baseline.revision,
      now: "2026-07-25T10:21:00.000Z",
    }),
    /interruption/u,
  );
  const state = await readRecoveryGenerationState(ACCOUNT_SCOPE_M);
  assert.equal(state.workspace.meta.id, "workspace-abort-base");
  assert.equal(state.revision, baseline.revision);
  assert.equal(
    await getEvidenceFile("abort-evidence", {
      scopeId: ACCOUNT_SCOPE_M,
    }),
    null,
  );
  assert.deepEqual(
    await listEvidenceOriginalVersions("abort-evidence", {
      scopeId: ACCOUNT_SCOPE_M,
    }),
    [],
  );
});

test("atomic capture rejects stale heads and workspace/file metadata contradictions before mutation", async () => {
  const householdId = "household-n";
  const baseline = await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_N,
    workspace: recoveryWorkspace(householdId, "stale-base"),
    now: "2026-07-25T10:30:00.000Z",
  });
  const advanced = await persistActiveRecoveryWorkspace({
    scopeId: ACCOUNT_SCOPE_N,
    workspace: recoveryWorkspace(householdId, "stale-newer"),
    expectedRevision: baseline.revision,
    now: "2026-07-25T10:31:00.000Z",
  });
  const capture = await atomicCaptureFixture({
    householdId,
    marker: "stale-capture",
    evidenceId: "stale-evidence",
  });

  await assert.rejects(
    persistActiveRecoveryWorkspaceWithFiles({
      scopeId: ACCOUNT_SCOPE_N,
      operationId: "capture-operation-stale",
      workspace: capture.workspace,
      files: [
        {
          evidenceId: "stale-evidence",
          file: capture.file,
          expectedCurrentOriginalVersionId: null,
        },
      ],
      expectedRevision: baseline.revision,
      now: "2026-07-25T10:32:00.000Z",
    }),
    (error) => error?.code === "CAPTURE_COMMIT_STALE",
  );
  assert.equal(
    (await readRecoveryGenerationState(ACCOUNT_SCOPE_N)).revision,
    advanced.revision,
  );
  assert.equal(
    await getEvidenceFile("stale-evidence", {
      scopeId: ACCOUNT_SCOPE_N,
    }),
    null,
  );

  const contradictedWorkspace = {
    ...capture.workspace,
    evidence: [
      {
        ...capture.workspace.evidence[0],
        fileChecksum: "0".repeat(64),
      },
    ],
  };
  await assert.rejects(
    persistActiveRecoveryWorkspaceWithFiles({
      scopeId: ACCOUNT_SCOPE_N,
      operationId: "capture-operation-contradiction",
      workspace: contradictedWorkspace,
      files: [
        {
          evidenceId: "stale-evidence",
          file: capture.file,
          expectedCurrentOriginalVersionId: null,
        },
      ],
      expectedRevision: advanced.revision,
      now: "2026-07-25T10:33:00.000Z",
    }),
    (error) =>
      error?.code === "CAPTURE_EVIDENCE_METADATA_MISMATCH",
  );
  assert.equal(
    (await readRecoveryGenerationState(ACCOUNT_SCOPE_N)).revision,
    advanced.revision,
  );
});
