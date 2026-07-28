jest.mock("expo-crypto", () => {
  let randomSeed = 20;
  function digest64(value: string): string {
    let state = 2_166_136_261;
    let result = "";
    for (let round = 0; round < 8; round += 1) {
      for (let index = 0; index < value.length; index += 1) {
        state ^= value.charCodeAt(index) + round;
        state = Math.imul(state, 16_777_619);
      }
      result += (state >>> 0).toString(16).padStart(8, "0");
      state ^= 0x9e3779b9 + round;
    }
    return result;
  }
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { HEX: "hex" },
    digestStringAsync: jest.fn(
      async (_algorithm: string, value: string) => digest64(value)
    ),
    getRandomBytes: jest.fn((length: number) => {
      randomSeed += 1;
      return new Uint8Array(length).fill(randomSeed);
    })
  };
});

jest.mock("expo-sqlite", () => {
  const states = new Map<
    string,
    {
      revision: number;
      snapshotJson: string | null;
      readonly operations: Map<string, string>;
      cursorJson: string;
      conflictsJson: string;
      recoveryJournalTransactionId: string | null;
      recoveryJournalJson: string | null;
      readonly analytics: Map<
        string,
        {
          dedupeKey: string | null;
          eventJson: string;
          createdAt: string;
          attemptCount: number;
          acknowledgedAt: string | null;
        }
      >;
    }
  >();
  const opened: string[] = [];
  const deleted: string[] = [];

  function stateFor(name: string) {
    const existing = states.get(name);
    if (existing) {
      return existing;
    }
    const created = {
      revision: 0,
      snapshotJson: null as string | null,
      operations: new Map<string, string>(),
      cursorJson:
        '{"cursorVersion":1,"value":null,"issuedAt":null}',
      conflictsJson: "[]",
      recoveryJournalTransactionId: null,
      recoveryJournalJson: null,
      analytics: new Map()
    };
    states.set(name, created);
    return created;
  }

  function databaseFor(name: string) {
    const state = stateFor(name);
    const getFirstAsync = jest.fn(
      async (sql: string, ...parameters: unknown[]) => {
      if (sql.includes("cipher_version")) {
        return { cipher_version: "4.6.1" };
      }
      if (sql.includes("workspace_snapshot")) {
        return {
          revision: state.revision,
          snapshot_json: state.snapshotJson
        };
      }
      if (sql.includes("sync_state")) {
        return {
          cursor_json: state.cursorJson,
          conflicts_json: state.conflictsJson
        };
      }
      if (sql.includes("recovery_restore_journal")) {
        return state.recoveryJournalJson &&
          state.recoveryJournalTransactionId
          ? {
              transaction_id: state.recoveryJournalTransactionId,
              journal_json: state.recoveryJournalJson
            }
          : null;
      }
      if (sql.includes("analytics_outbox")) {
        if (sql.includes("COUNT(*)")) {
          return {
            count: [...state.analytics.values()].filter(
              (entry) => entry.acknowledgedAt === null
            ).length
          };
        }
        const idempotencyKey = String(parameters[0]);
        const dedupeKey =
          parameters[1] === null || parameters[1] === undefined
            ? null
            : String(parameters[1]);
        const matched = [...state.analytics.entries()].find(
          ([key, entry]) =>
            key === idempotencyKey ||
            (dedupeKey !== null && entry.dedupeKey === dedupeKey)
        );
        return matched
          ? {
              idempotency_key: matched[0],
              dedupe_key: matched[1].dedupeKey,
              event_json: matched[1].eventJson,
              created_at: matched[1].createdAt,
              attempt_count: matched[1].attemptCount
            }
          : null;
      }
      if (sql.includes("sync_outbox")) {
        const operation = state.operations.get(String(parameters[0]));
        return operation ? { operation_json: operation } : null;
      }
      return null;
      }
    );
    const runAsync = jest.fn(
      async (sql: string, ...parameters: unknown[]) => {
        if (sql.includes("UPDATE workspace_snapshot")) {
          const expectedRevision = Number(parameters[3]);
          if (state.revision === expectedRevision) {
            state.revision = Number(parameters[0]);
            state.snapshotJson = String(parameters[1]);
          }
        } else if (sql.includes("INSERT OR IGNORE INTO sync_outbox")) {
          const operationId = String(parameters[0]);
          if (!state.operations.has(operationId)) {
            state.operations.set(operationId, String(parameters[1]));
          }
        } else if (sql.includes("DELETE FROM sync_outbox")) {
          state.operations.delete(String(parameters[0]));
        } else if (sql.includes("UPDATE sync_outbox")) {
          state.operations.set(
            String(parameters[3]),
            String(parameters[0])
          );
        } else if (sql.includes("UPDATE sync_state")) {
          state.cursorJson = String(parameters[0]);
          state.conflictsJson = String(parameters[1]);
        } else if (
          sql.includes("INSERT INTO recovery_restore_journal")
        ) {
          state.recoveryJournalTransactionId = String(parameters[0]);
          state.recoveryJournalJson = String(parameters[1]);
        } else if (
          sql.includes("UPDATE recovery_restore_journal")
        ) {
          state.recoveryJournalJson = String(parameters[0]);
        } else if (
          sql.includes("DELETE FROM recovery_restore_journal")
        ) {
          state.recoveryJournalTransactionId = null;
          state.recoveryJournalJson = null;
        } else if (sql.includes("INSERT INTO analytics_outbox")) {
          state.analytics.set(String(parameters[0]), {
            dedupeKey:
              parameters[1] === null ? null : String(parameters[1]),
            eventJson: String(parameters[2]),
            createdAt: String(parameters[3]),
            attemptCount: 0,
            acknowledgedAt: null
          });
        } else if (
          sql.includes("UPDATE analytics_outbox") &&
          sql.includes("attempt_count")
        ) {
          const entry = state.analytics.get(String(parameters[1]));
          if (entry) entry.attemptCount += 1;
        } else if (sql.includes("UPDATE analytics_outbox")) {
          const entry = state.analytics.get(String(parameters[1]));
          if (entry) entry.acknowledgedAt = String(parameters[0]);
        } else if (sql.includes("DELETE FROM analytics_outbox")) {
          state.analytics.delete(String(parameters[0]));
        }
      }
    );
    const transaction = { getFirstAsync, runAsync };
    const database = {
      closeAsync: jest.fn(async () => undefined),
      execAsync: jest.fn(async () => undefined),
      getFirstAsync,
      getAllAsync: jest.fn(async (sql: string) =>
        sql.includes("analytics_outbox")
          ? [...state.analytics.entries()]
              .filter(([, entry]) => entry.acknowledgedAt === null)
              .map(([idempotencyKey, entry]) => ({
                idempotency_key: idempotencyKey,
                dedupe_key: entry.dedupeKey,
                event_json: entry.eventJson,
                created_at: entry.createdAt,
                attempt_count: entry.attemptCount
              }))
          : [...state.operations.values()].map((operation_json) => ({
              operation_json
            }))
      ),
      runAsync,
      withExclusiveTransactionAsync: jest.fn(
        async (
          callback: (
            scopedTransaction: typeof transaction
          ) => Promise<void>
        ) => callback(transaction)
      )
    };
    return database;
  }

  return {
    openDatabaseAsync: jest.fn(async (name: string) => {
      opened.push(name);
      return databaseFor(name);
    }),
    deleteDatabaseAsync: jest.fn(async (name: string) => {
      deleted.push(name);
      states.delete(name);
    }),
    __states: states,
    __opened: opened,
    __deleted: deleted
  };
});

import { createPrivacySafeEvent } from "@alyr/analytics";
import type { SecureKeyStore } from "@alyr/contracts";

import { captureConflictContexts } from "@/data/conflictInbox";
import { SQLiteWorkspaceRepository } from "@/data/sqliteRepository";
import { createLocalOperation } from "@/data/sync";
import {
  deriveAuthenticatedVaultScope,
  SIGNED_OUT_SAMPLE_VAULT_SCOPE
} from "@/data/vaultScope";
import { createWorkspace } from "@/domain/sample";

interface MockSQLiteModule {
  readonly __states: Map<string, unknown>;
  readonly __opened: string[];
  readonly __deleted: string[];
}

function inMemoryKeyStore(): SecureKeyStore & {
  readonly values: Map<string, Uint8Array>;
} {
  const values = new Map<string, Uint8Array>();
  return {
    values,
    async get(key) {
      const value = values.get(key);
      return value ? new Uint8Array(value) : null;
    },
    async set(key, value) {
      values.set(key, new Uint8Array(value));
    },
    async remove(key) {
      values.delete(key);
    }
  };
}

describe("scoped SQLCipher workspace repository", () => {
  it("keeps privacy-safe analytics pending across restart and isolated by authenticated vault", async () => {
    const keyStore = inMemoryKeyStore();
    const scopeA = await deriveAuthenticatedVaultScope(
      "account-analytics",
      "household-analytics-a"
    );
    const scopeB = await deriveAuthenticatedVaultScope(
      "account-analytics",
      "household-analytics-b"
    );
    const repository = new SQLiteWorkspaceRepository(keyStore, scopeA);
    const otherHousehold = new SQLiteWorkspaceRepository(
      keyStore,
      scopeB
    );
    await repository.initialize();
    await otherHousehold.initialize();
    const event = createPrivacySafeEvent(
      "first_asset_passport_created",
      {
        schemaVersion: 1,
        platform: "ios",
        appVersion: "0.1.0",
        locale: "ar",
        occurredOffline: true,
        captureSource: "camera",
        elapsedTimeBand: "under-5-minutes"
      }
    );
    const idempotencyKey =
      "93000000-0000-4000-8000-000000000001";
    await expect(
      repository.enqueueAnalyticsEvent({
        idempotencyKey,
        dedupeKey: "milestone:first-asset-passport",
        event,
        createdAt: "2026-07-28T13:00:00.000Z"
      })
    ).resolves.toBe("queued");
    await repository.close();

    const reopened = new SQLiteWorkspaceRepository(keyStore, scopeA);
    await reopened.initialize();
    await expect(reopened.listPendingAnalyticsEvents(25)).resolves.toEqual(
      [
        {
          idempotencyKey,
          dedupeKey: "milestone:first-asset-passport",
          event,
          createdAt: "2026-07-28T13:00:00.000Z",
          attemptCount: 0
        }
      ]
    );
    await expect(
      otherHousehold.listPendingAnalyticsEvents(25)
    ).resolves.toEqual([]);

    await reopened.acknowledgeAnalyticsEvent(idempotencyKey);
    await expect(reopened.listPendingAnalyticsEvents(25)).resolves.toEqual(
      []
    );
    await expect(
      reopened.enqueueAnalyticsEvent({
        idempotencyKey:
          "93000000-0000-4000-8000-000000000002",
        dedupeKey: "milestone:first-asset-passport",
        event,
        createdAt: "2026-07-28T13:05:00.000Z"
      })
    ).resolves.toBe("duplicate");
  });

  it("reopens a durable encrypted signed-out sample without entering an authenticated scope", async () => {
    const keyStore = inMemoryKeyStore();
    const authenticatedScope = await deriveAuthenticatedVaultScope(
      "account-sample-check",
      "household-private"
    );
    const sampleRepository = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    const authenticatedRepository = new SQLiteWorkspaceRepository(
      keyStore,
      authenticatedScope
    );
    await sampleRepository.initialize();
    await authenticatedRepository.initialize();

    expect(sampleRepository.kind).toBe("sqlite-sqlcipher");
    expect(sampleRepository.durable).toBe(true);
    expect(sampleRepository.encryptedAtRest).toBe(true);
    expect(sampleRepository.scopeId).toBe(
      SIGNED_OUT_SAMPLE_VAULT_SCOPE.scopeId
    );
    expect(sampleRepository.scopeId).not.toBe(
      authenticatedRepository.scopeId
    );

    const sample = createWorkspace(
      "sample",
      "2026-07-28T12:00:00.000Z"
    );
    await sampleRepository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: sample,
      operations: []
    });
    await sampleRepository.close();

    const reopenedSample = new SQLiteWorkspaceRepository(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    await reopenedSample.initialize();
    await expect(reopenedSample.load()).resolves.toEqual({
      revision: 1,
      snapshot: sample
    });
    await expect(authenticatedRepository.load()).resolves.toEqual({
      revision: 0,
      snapshot: null
    });
    expect(
      keyStore.values.has(
        SIGNED_OUT_SAMPLE_VAULT_SCOPE.databaseKeyName
      )
    ).toBe(true);
    expect(keyStore.values.has(authenticatedScope.databaseKeyName)).toBe(
      true
    );
  });

  it("persists one compare-and-transition Recovery Kit crash journal across reopen", async () => {
    const keyStore = inMemoryKeyStore();
    const scope = await deriveAuthenticatedVaultScope(
      "account-recovery",
      "household-recovery"
    );
    const repository = new SQLiteWorkspaceRepository(keyStore, scope);
    await repository.initialize();
    const targetWorkspace = {
      ...createWorkspace("personal", "2026-07-28T10:00:00.000Z", {
        householdId: "household-recovery",
        ownerMemberId: "member-owner",
        deviceId: "device-recovery"
      }),
      syncStatus: "local-only" as const,
      lastSyncedAt: null
    };
    const transactionId = "c".repeat(32);
    const journal = {
      journalVersion: 1 as const,
      transactionId,
      kitId: transactionId,
      householdId: targetWorkspace.household.id,
      workspaceSchemaVersion: targetWorkspace.schemaVersion,
      expectedRevision: 4,
      targetRevision: 5,
      targetWorkspace,
      attachments: {
        journalVersion: 1 as const,
        vaultScopeId: scope.scopeId,
        stagingDirectoryReference:
          "file:///cache/alyr-recovery-stage-0123456789abcdef0123456789abcdef",
        vaultKeyDisposition: "preserve" as const,
        pendingVaultKeyHex: null,
        expectedVaultKeyHex: null,
        files: []
      },
      phase: "prepared" as const,
      createdAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T10:00:00.000Z"
    };

    await repository.createRecoveryRestoreJournal(journal);
    await expect(
      repository.createRecoveryRestoreJournal(journal)
    ).rejects.toThrow("must be resolved");
    await repository.transitionRecoveryRestoreJournal(
      transactionId,
      "prepared",
      "attachments-installing",
      "2026-07-28T10:00:01.000Z"
    );
    await repository.close();

    const reopened = new SQLiteWorkspaceRepository(keyStore, scope);
    await reopened.initialize();
    await expect(reopened.loadRecoveryRestoreJournal()).resolves.toEqual(
      expect.objectContaining({
        transactionId,
        phase: "attachments-installing",
        targetWorkspace
      })
    );
    await expect(
      reopened.transitionRecoveryRestoreJournal(
        transactionId,
        "prepared",
        "attachments-installed",
        "2026-07-28T10:00:02.000Z"
      )
    ).rejects.toThrow("changed before");
    await reopened.clearRecoveryRestoreJournal(transactionId);
    await expect(
      reopened.loadRecoveryRestoreJournal()
    ).resolves.toBeNull();
  });

  it("isolates snapshots and outboxes and locks stale account sessions", async () => {
    const sqlite = jest.requireMock<MockSQLiteModule>("expo-sqlite");
    const keyStore = inMemoryKeyStore();
    const scopeA = await deriveAuthenticatedVaultScope(
      "account-a",
      "household-a"
    );
    const scopeB = await deriveAuthenticatedVaultScope(
      "account-a",
      "household-b"
    );
    const repositoryA = new SQLiteWorkspaceRepository(keyStore, scopeA);
    const repositoryB = new SQLiteWorkspaceRepository(keyStore, scopeB);
    await repositoryA.initialize();
    await repositoryB.initialize();

    expect(sqlite.__opened).toEqual(
      expect.arrayContaining([scopeA.databaseName, scopeB.databaseName])
    );
    expect(scopeA.databaseName).not.toBe(scopeB.databaseName);
    expect(keyStore.values.has(scopeA.databaseKeyName)).toBe(true);
    expect(keyStore.values.has(scopeB.databaseKeyName)).toBe(true);

    const workspaceA = createWorkspace("personal");
    const operationA = createLocalOperation(workspaceA, {
      type: "asset.create",
      aggregateId: "asset-a",
      payload: { assetId: "asset-a" },
      operationId: "operation-a",
      idempotencyKey: "idempotency-a",
      observedVersion: 0,
      occurredAt: "2026-07-27T00:00:00.000Z"
    });
    await repositoryA.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspaceA,
      operations: [operationA]
    });

    expect((await repositoryA.load()).revision).toBe(1);
    expect(await repositoryA.listPendingOperations(10)).toEqual([
      operationA
    ]);
    expect(await repositoryB.load()).toEqual({
      revision: 0,
      snapshot: null
    });
    expect(await repositoryB.listPendingOperations(10)).toEqual([]);

    const syncCommit = await repositoryA.commitSync({
      expectedRevision: 1,
      nextRevision: 2,
      snapshot: workspaceA,
      cursor: {
        cursorVersion: 1,
        value: "42",
        issuedAt: "2026-07-27T01:00:00.000Z"
      },
      acknowledgedOperationIds: [operationA.operationId],
      conflicts: []
    });
    expect(syncCommit).toEqual({
      ok: true,
      value: { revision: 2 }
    });
    expect(await repositoryA.listPendingOperations(10)).toEqual([]);
    const conflictOperation = createLocalOperation(workspaceA, {
      type: "asset.update",
      aggregateId: "asset-a",
      payload: { assetId: "asset-a", name: "Local name" },
      operationId: "operation-conflict",
      idempotencyKey: "operation-conflict",
      observedVersion: 1,
      occurredAt: "2026-07-27T01:10:00.000Z"
    });
    await repositoryA.commit({
      expectedRevision: 2,
      nextRevision: 3,
      snapshot: workspaceA,
      operations: [conflictOperation]
    });
    const [durableConflict] = captureConflictContexts(
      [
        {
          operationId: conflictOperation.operationId,
          entityId: "asset-a",
          conflictKind: "lifecycle",
          serverVersion: 2,
          message: "Changed on another device."
        }
      ],
      [conflictOperation],
      [
        {
          sequence: 43,
          entityType: "asset",
          entityId: "asset-a",
          householdId: workspaceA.household.id,
          version: 2,
          tombstoned: false,
          body: {
            operationId: "operation-cloud",
            command: "asset.update",
            payload: { assetId: "asset-a", name: "Cloud name" },
            result: {}
          },
          changedAt: "2026-07-27T01:11:00.000Z"
        }
      ],
      workspaceA.household.id,
      "2026-07-27T01:11:00.000Z"
    );
    await repositoryA.commitSync({
      expectedRevision: 3,
      nextRevision: 4,
      snapshot: workspaceA,
      cursor: {
        cursorVersion: 1,
        value: "43",
        issuedAt: "2026-07-27T01:11:00.000Z"
      },
      acknowledgedOperationIds: [],
      conflicts: [durableConflict!]
    });
    await repositoryA.close();
    const reopenedA = new SQLiteWorkspaceRepository(keyStore, scopeA);
    await reopenedA.initialize();
    expect(await reopenedA.loadSyncState()).toEqual({
      cursor: {
        cursorVersion: 1,
        value: "43",
        issuedAt: "2026-07-27T01:11:00.000Z"
      },
      conflicts: [durableConflict]
    });
    await reopenedA.commitSync({
      expectedRevision: 4,
      nextRevision: 5,
      snapshot: workspaceA,
      cursor: {
        cursorVersion: 1,
        value: "44",
        issuedAt: "2026-07-27T01:12:00.000Z"
      },
      acknowledgedOperationIds: [conflictOperation.operationId],
      conflicts: []
    });
    expect((await reopenedA.loadSyncState()).conflicts).toEqual([]);
    await reopenedA.close();

    await repositoryA.lock();
    await expect(repositoryA.initialize()).rejects.toThrow("locked");
    await expect(repositoryA.load()).rejects.toThrow("locked");
    expect(await repositoryB.load()).toEqual({
      revision: 0,
      snapshot: null
    });

    await repositoryA.purge();
    expect(sqlite.__deleted).toContain(scopeA.databaseName);
    expect(sqlite.__states.has(scopeA.databaseName)).toBe(false);
    expect(sqlite.__states.has(scopeB.databaseName)).toBe(true);
    expect(keyStore.values.has(scopeA.databaseKeyName)).toBe(false);
    expect(keyStore.values.has(scopeB.databaseKeyName)).toBe(true);

    const freshA = new SQLiteWorkspaceRepository(keyStore, scopeA);
    await freshA.initialize();
    expect(await freshA.load()).toEqual({
      revision: 0,
      snapshot: null
    });
  });
});
