import type { SecureKeyStore } from "@alyr/contracts";

const mockDatabaseKeys = new Map<string, string>();
interface MockDatabaseState {
  revision: number;
  snapshotJson: string | null;
  readonly operations: Map<string, string>;
}

function mockFreshDatabaseState(): MockDatabaseState {
  return {
    revision: 0,
    snapshotJson: null,
    operations: new Map<string, string>()
  };
}

function mockCloneDatabaseState(
  state: MockDatabaseState
): MockDatabaseState {
  return {
    revision: state.revision,
    snapshotJson: state.snapshotJson,
    operations: new Map(state.operations)
  };
}

function mockCommitDatabaseState(
  target: MockDatabaseState,
  source: MockDatabaseState
): void {
  target.revision = source.revision;
  target.snapshotJson = source.snapshotJson;
  target.operations.clear();
  for (const [operationId, operationJson] of source.operations) {
    target.operations.set(operationId, operationJson);
  }
}

const mockDatabaseStates = new Map<string, MockDatabaseState>();
const mockConnectionEvents: string[] = [];
const mockOpenedHandles: Array<{
  readonly withExclusiveTransactionAsync: jest.Mock;
}> = [];
let mockConnectionCounter = 0;
let mockRandomSeed = 0;
let mockWriteFailure: Error | null = null;
let mockWriteFailureSql: string | null = null;
let mockWritePause: {
  readonly sqlIncludes: string;
  readonly started: () => void;
  readonly release: Promise<void>;
} | null = null;
let mockRollbackFailure: Error | null = null;
let mockCloseFailure: Error | null = null;
let mockDeleteFailure: Error | null = null;
let mockOpenFailure: Error | null = null;

jest.mock("expo-crypto", () => ({
  getRandomBytes: jest.fn((length: number) => {
    mockRandomSeed += 1;
    return new Uint8Array(length).fill(mockRandomSeed);
  })
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(
    async (name: string, options?: { useNewConnection?: boolean }) => {
      mockConnectionCounter += 1;
      const connection = `connection-${mockConnectionCounter}`;
      const state =
        mockDatabaseStates.get(name) ?? mockFreshDatabaseState();
      mockDatabaseStates.set(name, state);
      let activeKeyHex: string | null = null;
      let transactionState: MockDatabaseState | null = null;
      mockConnectionEvents.push(
        `${connection}:open:${options?.useNewConnection === true ? "new" : "cached"}`
      );
      if (mockOpenFailure) {
        const failure = mockOpenFailure;
        mockOpenFailure = null;
        throw failure;
      }

      const assertReadable = () => {
        const persisted = mockDatabaseKeys.get(name);
        if (persisted === undefined) {
          if (!activeKeyHex) throw new Error("SQLCipher key was not applied.");
          mockDatabaseKeys.set(name, activeKeyHex);
          return;
        }
        if (persisted !== activeKeyHex) {
          throw new Error("file is not a database");
        }
      };
      const currentState = () => transactionState ?? state;

      const handle = {
        execAsync: jest.fn(async (sql: string) => {
          const key = /PRAGMA key = "x'([a-f0-9]{64})'";/u.exec(sql);
          if (key) {
            activeKeyHex = key[1] ?? null;
            mockConnectionEvents.push(`${connection}:key`);
            return;
          }
          assertReadable();
          if (sql === "BEGIN IMMEDIATE;") {
            if (transactionState) {
              throw new Error("A transaction is already active.");
            }
            transactionState = mockCloneDatabaseState(state);
            mockConnectionEvents.push(`${connection}:begin`);
          } else if (sql === "COMMIT;") {
            mockConnectionEvents.push(`${connection}:commit`);
            if (!transactionState) {
              throw new Error("No transaction is active.");
            }
            mockCommitDatabaseState(state, transactionState);
            transactionState = null;
          } else if (sql === "ROLLBACK;") {
            mockConnectionEvents.push(`${connection}:rollback`);
            transactionState = null;
            if (mockRollbackFailure) {
              const failure = mockRollbackFailure;
              mockRollbackFailure = null;
              throw failure;
            }
          } else {
            mockConnectionEvents.push(`${connection}:exec`);
          }
        }),
        getFirstAsync: jest.fn(
          async (sql: string, ..._parameters: unknown[]) => {
            assertReadable();
            if (sql.includes("cipher_version")) {
              mockConnectionEvents.push(`${connection}:cipher-version`);
              return { cipher_version: "4.6.1" };
            }
            if (sql.includes("sqlite_master")) {
              mockConnectionEvents.push(`${connection}:file-verified`);
              return { count: 5 };
            }
            if (sql.includes("workspace_snapshot")) {
              mockConnectionEvents.push(`${connection}:prepare-snapshot`);
              const readable = currentState();
              return {
                revision: readable.revision,
                snapshot_json: readable.snapshotJson
              };
            }
            return null;
          }
        ),
        getAllAsync: jest.fn(async (sql: string) => {
          assertReadable();
          if (sql.includes("sync_outbox")) {
            return [...currentState().operations.values()].map(
              (operation_json) => ({ operation_json })
            );
          }
          return [];
        }),
        runAsync: jest.fn(
          async (sql: string, ...parameters: unknown[]) => {
            assertReadable();
            mockConnectionEvents.push(`${connection}:write`);
            const pause = mockWritePause;
            if (pause && sql.includes(pause.sqlIncludes)) {
              mockWritePause = null;
              pause.started();
              await pause.release;
            }
            if (
              mockWriteFailure &&
              (mockWriteFailureSql === null ||
                sql.includes(mockWriteFailureSql))
            ) {
              const failure = mockWriteFailure;
              mockWriteFailure = null;
              mockWriteFailureSql = null;
              throw failure;
            }
            const writable = currentState();
            if (sql.includes("UPDATE workspace_snapshot")) {
              writable.revision = Number(parameters[0]);
              writable.snapshotJson = String(parameters[1]);
            } else if (
              sql.includes("INSERT OR IGNORE INTO sync_outbox")
            ) {
              const operationId = String(parameters[0]);
              if (!writable.operations.has(operationId)) {
                writable.operations.set(
                  operationId,
                  String(parameters[1])
                );
              }
            } else if (sql.includes("DELETE FROM sync_outbox")) {
              writable.operations.delete(String(parameters[0]));
            }
          }
        ),
        closeAsync: jest.fn(async () => {
          mockConnectionEvents.push(`${connection}:close`);
          // SQLite rolls back an uncommitted transaction when its isolated
          // connection closes, including when explicit ROLLBACK reported an
          // error.
          transactionState = null;
          if (mockCloseFailure) {
            const failure = mockCloseFailure;
            mockCloseFailure = null;
            throw failure;
          }
        }),
        withExclusiveTransactionAsync: jest.fn(async () => {
          throw new Error("Expo opened an unkeyed exclusive connection.");
        })
      };
      mockOpenedHandles.push(handle);
      return handle;
    }
  ),
  deleteDatabaseAsync: jest.fn(async (name: string) => {
    mockConnectionEvents.push("database:delete");
    if (mockDeleteFailure) {
      const failure = mockDeleteFailure;
      mockDeleteFailure = null;
      throw failure;
    }
    mockDatabaseKeys.delete(name);
    mockDatabaseStates.delete(name);
  })
}));

import {
  getOrCreateAttachmentKey,
  getOrCreateDatabaseKey
} from "@/data/secureKeyStore";
import { SQLiteWorkspaceRepository } from "@/data/sqliteRepository";
import { createLocalOperation } from "@/data/sync";
import { SIGNED_OUT_SAMPLE_VAULT_SCOPE } from "@/data/vaultScope";
import { createWorkspace } from "@/domain/sample";

function bytesToHex(value: Uint8Array): string {
  return [...value]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function freshRaceStore(): SecureKeyStore & {
  readonly values: Map<string, Uint8Array>;
  readonly firstReadStarted: Promise<void>;
  releaseFirstRead(): void;
  readonly getCalls: jest.Mock;
  readonly setCalls: jest.Mock;
} {
  const values = new Map<string, Uint8Array>();
  const firstReadStarted = deferred();
  const releaseFirstRead = deferred();
  let readCount = 0;
  const getCalls = jest.fn(async (key: string) => {
    const snapshot = values.get(key);
    readCount += 1;
    if (readCount === 1) {
      firstReadStarted.resolve();
      await releaseFirstRead.promise;
    }
    return snapshot ? new Uint8Array(snapshot) : null;
  });
  const setCalls = jest.fn(async (key: string, value: Uint8Array) => {
    mockConnectionEvents.push("secure-store:set");
    values.set(key, new Uint8Array(value));
  });
  return {
    values,
    firstReadStarted: firstReadStarted.promise,
    releaseFirstRead: () => releaseFirstRead.resolve(),
    getCalls,
    setCalls,
    get: getCalls,
    set: setCalls,
    async remove(key) {
      values.delete(key);
    }
  };
}

function inMemoryKeyStore(): SecureKeyStore & {
  readonly values: Map<string, Uint8Array>;
  readonly removeCalls: jest.Mock;
} {
  const values = new Map<string, Uint8Array>();
  const removeCalls = jest.fn(async (key: string) => {
    mockConnectionEvents.push("secure-store:remove");
    values.delete(key);
  });
  return {
    values,
    removeCalls,
    async get(key) {
      const value = values.get(key);
      return value ? new Uint8Array(value) : null;
    },
    async set(key, value) {
      mockConnectionEvents.push("secure-store:set");
      values.set(key, new Uint8Array(value));
    },
    remove: removeCalls
  };
}

function independentWrapperRace(): {
  readonly first: SecureKeyStore;
  readonly second: SecureKeyStore;
  readonly values: Map<string, Uint8Array>;
  readonly firstReadStarted: Promise<void>;
  releaseFirstRead(): void;
  readonly setCalls: jest.Mock;
} {
  const values = new Map<string, Uint8Array>();
  const firstReadStarted = deferred();
  const releaseFirstRead = deferred();
  const setCalls = jest.fn(async (key: string, value: Uint8Array) => {
    values.set(key, new Uint8Array(value));
  });
  const first: SecureKeyStore = {
    async get(key) {
      const snapshot = values.get(key);
      firstReadStarted.resolve();
      await releaseFirstRead.promise;
      return snapshot ? new Uint8Array(snapshot) : null;
    },
    set: setCalls,
    async remove(key) {
      values.delete(key);
    }
  };
  const second: SecureKeyStore = {
    async get(key) {
      const value = values.get(key);
      return value ? new Uint8Array(value) : null;
    },
    set: setCalls,
    async remove(key) {
      values.delete(key);
    }
  };
  return {
    first,
    second,
    values,
    firstReadStarted: firstReadStarted.promise,
    releaseFirstRead: () => releaseFirstRead.resolve(),
    setCalls
  };
}

function expectNoExpoExclusiveTransaction(): void {
  for (const handle of mockOpenedHandles) {
    expect(handle.withExclusiveTransactionAsync).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  mockDatabaseKeys.clear();
  mockDatabaseStates.clear();
  mockConnectionEvents.splice(0);
  mockOpenedHandles.splice(0);
  mockConnectionCounter = 0;
  mockRandomSeed = 0;
  mockWriteFailure = null;
  mockWriteFailureSql = null;
  mockWritePause = null;
  mockRollbackFailure = null;
  mockCloseFailure = null;
  mockDeleteFailure = null;
  mockOpenFailure = null;
});

describe("device-bound vault key creation", () => {
  it("opens concurrent sample repositories with one key and keys the first commit connection", async () => {
    const keyStore = freshRaceStore();
    const firstRepository = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    const secondRepository = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );

    const firstInitialization = firstRepository.initialize();
    await keyStore.firstReadStarted;
    const secondInitialization = secondRepository.initialize();
    await Promise.resolve();
    keyStore.releaseFirstRead();

    await expect(
      Promise.all([firstInitialization, secondInitialization])
    ).resolves.toEqual([undefined, undefined]);
    expect(keyStore.setCalls).toHaveBeenCalledTimes(1);
    expect(keyStore.getCalls).toHaveBeenCalledTimes(2);
    const stored = keyStore.values.get(
      SIGNED_OUT_SAMPLE_VAULT_SCOPE.databaseKeyName
    );
    expect(stored).toHaveLength(32);
    expect(
      mockDatabaseKeys.get(SIGNED_OUT_SAMPLE_VAULT_SCOPE.databaseName)
    ).toBe(bytesToHex(stored!));
    const keySetIndex = mockConnectionEvents.indexOf("secure-store:set");
    const firstOpenIndex = mockConnectionEvents.findIndex((event) =>
      event.endsWith(":open:cached")
    );
    expect(keySetIndex).toBeGreaterThanOrEqual(0);
    expect(firstOpenIndex).toBeGreaterThan(keySetIndex);

    const eventStart = mockConnectionEvents.length;
    const result = await firstRepository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: createWorkspace("sample"),
      operations: []
    });
    expect(result).toEqual({ ok: true, value: { revision: 1 } });

    const transactionEvents = mockConnectionEvents.slice(eventStart);
    expect(transactionEvents[0]).toMatch(/:open:new$/u);
    const keyIndex = transactionEvents.findIndex((event) =>
      event.endsWith(":key")
    );
    const verificationIndex = transactionEvents.findIndex((event) =>
      event.endsWith(":file-verified")
    );
    const beginIndex = transactionEvents.findIndex((event) =>
      event.endsWith(":begin")
    );
    const prepareIndex = transactionEvents.findIndex((event) =>
      event.endsWith(":prepare-snapshot")
    );
    expect(keyIndex).toBeGreaterThan(0);
    expect(verificationIndex).toBeGreaterThan(keyIndex);
    expect(beginIndex).toBeGreaterThan(verificationIndex);
    expect(prepareIndex).toBeGreaterThan(beginIndex);
    expect(transactionEvents).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/:commit$/u),
        expect.stringMatching(/:close$/u)
      ])
    );
    expectNoExpoExclusiveTransaction();
  });

  it("preserves the operation error while rollback and close also fail", async () => {
    const keyStore = inMemoryKeyStore();
    const repository = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await repository.initialize();
    mockConnectionEvents.splice(0);
    mockWriteFailure = new Error("primary write failure");
    mockRollbackFailure = new Error("rollback failure");
    mockCloseFailure = new Error("close failure");

    await expect(
      repository.commit({
        expectedRevision: 0,
        nextRevision: 1,
        snapshot: createWorkspace("sample"),
        operations: []
      })
    ).rejects.toThrow("primary write failure");
    expect(mockConnectionEvents).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/:begin$/u),
        expect.stringMatching(/:rollback$/u),
        expect.stringMatching(/:close$/u)
      ])
    );
    expect(mockConnectionEvents).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/:commit$/u)])
    );
    expectNoExpoExclusiveTransaction();

    // A process restart reconstructs both the repository and retained key
    // state. The failed transaction must not become a durable snapshot.
    const restarted = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await restarted.initialize();
    await expect(restarted.load()).resolves.toEqual({
      revision: 0,
      snapshot: null
    });
  });

  it("rolls back a snapshot write when the following outbox write fails", async () => {
    const keyStore = inMemoryKeyStore();
    const repository = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await repository.initialize();
    const workspace = createWorkspace("sample");
    const operation = createLocalOperation(workspace, {
      type: "asset.create",
      aggregateId: "asset-rollback-regression",
      payload: { assetId: "asset-rollback-regression" },
      operationId: "operation-rollback-regression",
      idempotencyKey: "idempotency-rollback-regression",
      observedVersion: 0,
      occurredAt: "2026-07-31T10:00:00.000Z"
    });
    mockConnectionEvents.splice(0);
    mockWriteFailure = new Error("outbox write failure");
    mockWriteFailureSql = "INSERT OR IGNORE INTO sync_outbox";

    await expect(
      repository.commit({
        expectedRevision: 0,
        nextRevision: 1,
        snapshot: workspace,
        operations: [operation]
      })
    ).rejects.toThrow("outbox write failure");
    expect(mockConnectionEvents).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/:prepare-snapshot$/u),
        expect.stringMatching(/:rollback$/u),
        expect.stringMatching(/:close$/u)
      ])
    );
    expect(
      mockConnectionEvents.filter((event) => event.endsWith(":write"))
    ).toHaveLength(2);

    const restarted = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await restarted.initialize();
    await expect(restarted.load()).resolves.toEqual({
      revision: 0,
      snapshot: null
    });
    await expect(restarted.listPendingOperations(10)).resolves.toEqual(
      []
    );
  });

  it("does not report a durable commit as failed when only close fails", async () => {
    const repository = new SQLiteWorkspaceRepository(
      inMemoryKeyStore(),
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await repository.initialize();
    mockConnectionEvents.splice(0);
    mockCloseFailure = new Error("transaction close failure");

    await expect(
      repository.commit({
        expectedRevision: 0,
        nextRevision: 1,
        snapshot: createWorkspace("sample"),
        operations: []
      })
    ).resolves.toEqual({ ok: true, value: { revision: 1 } });
    await expect(repository.load()).resolves.toEqual({
      revision: 1,
      snapshot: expect.objectContaining({ mode: "sample" })
    });
    expect(mockConnectionEvents).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/:commit$/u),
        expect.stringMatching(/:close$/u)
      ])
    );
    expect(mockConnectionEvents).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/:rollback$/u)])
    );
    expectNoExpoExclusiveTransaction();
  });

  it("serializes formerly direct writes behind an active keyed transaction", async () => {
    const repository = new SQLiteWorkspaceRepository(
      inMemoryKeyStore(),
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await repository.initialize();
    const workspace = createWorkspace("sample");
    const operation = createLocalOperation(workspace, {
      type: "asset.create",
      aggregateId: "asset-lock-regression",
      payload: { assetId: "asset-lock-regression" },
      operationId: "operation-lock-regression",
      idempotencyKey: "idempotency-lock-regression",
      observedVersion: 0,
      occurredAt: "2026-07-31T10:05:00.000Z"
    });
    const pausedWriteStarted = deferred();
    const releasePausedWrite = deferred();
    mockWritePause = {
      sqlIncludes: "UPDATE workspace_snapshot",
      started: () => pausedWriteStarted.resolve(),
      release: releasePausedWrite.promise
    };
    mockConnectionEvents.splice(0);

    const commit = repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: [operation]
    });
    await pausedWriteStarted.promise;
    let acknowledgeSettled = false;
    let attemptSettled = false;
    const acknowledge = repository
      .acknowledgeOperation(operation.operationId)
      .then(() => {
        acknowledgeSettled = true;
      });
    const recordAttempt = repository
      .recordAnalyticsAttempt(
        "analytics-lock-regression",
        "2026-07-31T10:05:01.000Z"
      )
      .then(() => {
        attemptSettled = true;
      });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(acknowledgeSettled).toBe(false);
    expect(attemptSettled).toBe(false);
    expect(
      mockConnectionEvents.filter((event) => event.endsWith(":open:new"))
    ).toHaveLength(1);

    releasePausedWrite.resolve();
    await expect(commit).resolves.toEqual({
      ok: true,
      value: { revision: 1 }
    });
    await Promise.all([acknowledge, recordAttempt]);
    expect(acknowledgeSettled).toBe(true);
    expect(attemptSettled).toBe(true);
    await expect(repository.listPendingOperations(10)).resolves.toEqual(
      []
    );

    const openIndexes = mockConnectionEvents
      .map((event, index) =>
        event.endsWith(":open:new") ? index : -1
      )
      .filter((index) => index >= 0);
    const closeIndexes = mockConnectionEvents
      .map((event, index) => (event.endsWith(":close") ? index : -1))
      .filter((index) => index >= 0);
    expect(openIndexes).toHaveLength(3);
    expect(closeIndexes).toHaveLength(3);
    expect(openIndexes[1]).toBeGreaterThan(closeIndexes[0]!);
    expect(openIndexes[2]).toBeGreaterThan(closeIndexes[1]!);
    expectNoExpoExclusiveTransaction();
  });

  it("serializes concurrent attachment-key creation on the same fresh scope", async () => {
    const keyStore = freshRaceStore();
    const first = getOrCreateAttachmentKey(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await keyStore.firstReadStarted;
    const second = getOrCreateAttachmentKey(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await Promise.resolve();
    keyStore.releaseFirstRead();

    const [firstKey, secondKey] = await Promise.all([first, second]);
    expect(firstKey).toEqual(secondKey);
    expect(keyStore.setCalls).toHaveBeenCalledTimes(1);
    expect(keyStore.getCalls).toHaveBeenCalledTimes(2);
  });

  it("serializes database-key creation across independent native-store wrappers", async () => {
    const race = independentWrapperRace();
    const first = getOrCreateDatabaseKey(
      race.first,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await race.firstReadStarted;
    const second = getOrCreateDatabaseKey(
      race.second,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await Promise.resolve();
    race.releaseFirstRead();

    const [firstKey, secondKey] = await Promise.all([first, second]);
    expect(firstKey).toEqual(secondKey);
    expect(race.setCalls).toHaveBeenCalledTimes(1);
    expect(
      race.values.get(SIGNED_OUT_SAMPLE_VAULT_SCOPE.databaseKeyName)
    ).toEqual(firstKey);
  });

  it("retains the SQLCipher key when encrypted database deletion fails", async () => {
    const keyStore = inMemoryKeyStore();
    const repository = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await repository.initialize();
    expect(
      keyStore.values.has(
        SIGNED_OUT_SAMPLE_VAULT_SCOPE.databaseKeyName
      )
    ).toBe(true);
    mockDeleteFailure = new Error("database delete failure");

    await expect(repository.purge()).rejects.toThrow(
      "database delete failure"
    );
    expect(keyStore.removeCalls).not.toHaveBeenCalled();
    expect(
      keyStore.values.has(
        SIGNED_OUT_SAMPLE_VAULT_SCOPE.databaseKeyName
      )
    ).toBe(true);
  });

  it("persists the new key before opening SQLite and reuses it after an open failure", async () => {
    const keyStore = inMemoryKeyStore();
    mockOpenFailure = new Error("database open failure");
    const interrupted = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );

    await expect(interrupted.initialize()).rejects.toThrow(
      "database open failure"
    );
    const persistedKey = keyStore.values.get(
      SIGNED_OUT_SAMPLE_VAULT_SCOPE.databaseKeyName
    );
    expect(persistedKey).toHaveLength(32);
    expect(mockConnectionEvents.indexOf("secure-store:set")).toBeLessThan(
      mockConnectionEvents.findIndex((event) =>
        event.endsWith(":open:cached")
      )
    );

    const restarted = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await expect(restarted.initialize()).resolves.toBeUndefined();
    expect(
      mockDatabaseKeys.get(SIGNED_OUT_SAMPLE_VAULT_SCOPE.databaseName)
    ).toBe(bytesToHex(persistedKey!));
    expect(
      mockConnectionEvents.filter(
        (event) => event === "secure-store:set"
      )
    ).toHaveLength(1);
  });

  it("deletes encrypted bytes before removing the matching key", async () => {
    const keyStore = inMemoryKeyStore();
    const repository = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await repository.initialize();
    mockConnectionEvents.splice(0);

    await repository.purge();

    const deleteIndex = mockConnectionEvents.indexOf("database:delete");
    const removeIndex = mockConnectionEvents.indexOf(
      "secure-store:remove"
    );
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(removeIndex).toBeGreaterThan(deleteIndex);
    expect(
      keyStore.values.has(
        SIGNED_OUT_SAMPLE_VAULT_SCOPE.databaseKeyName
      )
    ).toBe(false);
  });
});
