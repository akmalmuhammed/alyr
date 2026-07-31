import * as SQLite from "expo-sqlite";
import { validateAnalyticsEvent } from "@alyr/analytics";

import type {
  AnalyticsEvent,
  JsonObject,
  SecureKeyStore,
  SyncConflict,
  SyncCursor,
  SyncOperation
} from "@alyr/contracts";

import {
  type NativeWorkspaceCommit,
  type NativeWorkspaceRepository,
  type NativeWorkspaceSyncCommit,
  revisionConflict
} from "./repository";
import {
  getOrCreateDatabaseKey,
  removeDatabaseKey
} from "./secureKeyStore";
import {
  assertValidVaultScope,
  DEVICE_PREVIEW_VAULT_SCOPE,
  type VaultScope,
  type VaultScopeId
} from "./vaultScope";
import {
  ANALYTICS_QUEUE_CAPACITY,
  type AnalyticsQueueStore,
  type QueuedAnalyticsEvent
} from "@/analytics/types";
import { assertRecoveryRestoreCrashJournal } from "@/recovery/crashJournal";
import type {
  RecoveryRestoreCrashJournal,
  RecoveryRestoreJournalPhase
} from "@/recovery/types";

interface SnapshotRow {
  readonly revision: number;
  readonly snapshot_json: string | null;
}

interface OperationRow {
  readonly operation_json: string;
}

interface SyncStateRow {
  readonly cursor_json: string;
  readonly conflicts_json: string;
}

interface CipherVersionRow {
  readonly cipher_version: string;
}

interface RecoveryRestoreJournalRow {
  readonly transaction_id: string;
  readonly journal_json: string;
}

interface AnalyticsEventRow {
  readonly idempotency_key: string;
  readonly dedupe_key: string | null;
  readonly event_json: string;
  readonly created_at: string;
  readonly attempt_count: number;
}

interface CountRow {
  readonly count: number;
}

const RECOVERY_JOURNAL_PHASE_ORDER: Readonly<
  Record<RecoveryRestoreJournalPhase, number>
> = {
  prepared: 0,
  "attachments-installing": 1,
  "attachments-installed": 2,
  "workspace-committed": 3
};

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The production manifest is tested to keep every component in the main app
 * process, making this process-wide gate authoritative for all JS repository
 * instances. Adding `android:process` requires a reviewed native/interprocess
 * lock before this invariant may change.
 */
const databaseOperationTails = new Map<string, Promise<unknown>>();

async function runDatabaseOperationExclusive<T>(
  databaseName: string,
  operation: () => Promise<T>
): Promise<T> {
  const preceding =
    databaseOperationTails.get(databaseName) ?? Promise.resolve();
  const current = preceding.catch(() => undefined).then(operation);
  databaseOperationTails.set(databaseName, current);
  try {
    return await current;
  } finally {
    if (databaseOperationTails.get(databaseName) === current) {
      databaseOperationTails.delete(databaseName);
    }
  }
}

async function applySqlCipherKey(
  database: SQLite.SQLiteDatabase,
  key: Uint8Array
): Promise<void> {
  const keyHex = bytesToHex(key);
  if (!/^[a-f0-9]{64}$/u.test(keyHex)) {
    throw new Error("The generated local database key was invalid.");
  }
  await database.execAsync(`PRAGMA key = "x'${keyHex}'";`);
  const cipher = await database.getFirstAsync<CipherVersionRow>(
    "PRAGMA cipher_version;"
  );
  if (!cipher?.cipher_version) {
    throw new Error(
      "SQLCipher is unavailable; Heldat will not open a plaintext vault."
    );
  }
  // `cipher_version` proves the library is present, while sqlite_master makes
  // SQLCipher authenticate the actual file with this connection-local key.
  await database.getFirstAsync<{ readonly count: number }>(
    "SELECT COUNT(*) AS count FROM sqlite_master;"
  );
  await database.execAsync("PRAGMA foreign_keys = ON;");
}

export class SQLiteWorkspaceRepository
  implements NativeWorkspaceRepository, AnalyticsQueueStore {
  readonly kind = "sqlite-sqlcipher" as const;
  readonly durable = true;
  readonly encryptedAtRest = true;

  private database: SQLite.SQLiteDatabase | null = null;
  private databaseKey: Uint8Array | null = null;
  private locked = false;
  private readonly vaultScope: VaultScope;

  constructor(
    private readonly keyStore: SecureKeyStore,
    scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
  ) {
    this.vaultScope = assertValidVaultScope(scope);
  }

  get scopeId(): VaultScopeId {
    return this.vaultScope.scopeId;
  }

  get databaseName(): string {
    return this.vaultScope.databaseName;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  async initialize(): Promise<void> {
    if (this.locked) {
      throw new Error(
        "This local vault is locked. Create a new authenticated vault session to reopen it."
      );
    }
    if (this.database) {
      return;
    }
    await runDatabaseOperationExclusive(
      this.vaultScope.databaseName,
      async () => {
        if (this.locked) {
          throw new Error("The local vault is locked.");
        }
        if (this.database) return;
        const key = await getOrCreateDatabaseKey(
          this.keyStore,
          this.vaultScope
        );
        let database: SQLite.SQLiteDatabase | null = null;
        let didFail = false;
        let failure: unknown;
        try {
          database = await SQLite.openDatabaseAsync(
            this.vaultScope.databaseName
          );
          await applySqlCipherKey(database, key);
          await database.execAsync("PRAGMA journal_mode = WAL;");
          await database.execAsync(`
        CREATE TABLE IF NOT EXISTS workspace_snapshot (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          revision INTEGER NOT NULL,
          snapshot_json TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_outbox (
          operation_id TEXT PRIMARY KEY,
          operation_json TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          cursor_json TEXT NOT NULL,
          conflicts_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS recovery_restore_journal (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          transaction_id TEXT NOT NULL UNIQUE,
          journal_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS analytics_outbox (
          idempotency_key TEXT PRIMARY KEY,
          dedupe_key TEXT UNIQUE,
          event_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_attempt_at TEXT,
          acknowledged_at TEXT
        );
        INSERT OR IGNORE INTO workspace_snapshot
          (id, revision, snapshot_json, updated_at)
        VALUES
          (1, 0, NULL, '1970-01-01T00:00:00.000Z');
        INSERT OR IGNORE INTO sync_state
          (id, cursor_json, conflicts_json, updated_at)
        VALUES
          (
            1,
            '{"cursorVersion":1,"value":null,"issuedAt":null}',
            '[]',
            '1970-01-01T00:00:00.000Z'
          );
          `);
          this.databaseKey = new Uint8Array(key);
          this.database = database;
        } catch (error) {
          didFail = true;
          failure = error;
        } finally {
          key.fill(0);
          if (didFail && database) {
            try {
              await database.closeAsync();
            } catch {
              // Preserve the opening, keying, or schema error that explains
              // why the vault could not initialize.
            }
          }
        }
        if (didFail) throw failure;
      }
    );
  }

  /**
   * Closes the current SQLCipher handle but keeps the scope reopenable. This is
   * useful for app lifecycle pressure; sign-out/account-switch code should use
   * `lock()` instead.
   */
  async close(): Promise<void> {
    await runDatabaseOperationExclusive(
      this.vaultScope.databaseName,
      async () => {
        const database = this.database;
        const key = this.databaseKey;
        this.database = null;
        this.databaseKey = null;
        try {
          if (database) await database.closeAsync();
        } finally {
          key?.fill(0);
        }
      }
    );
  }

  /**
   * Irreversibly locks this repository instance. A freshly authenticated
   * session must construct a new scoped repository, preventing stale callers
   * from reopening the previous household after sign-out.
   */
  async lock(): Promise<void> {
    this.locked = true;
    await this.close();
  }

  /**
   * Destructively removes this scope's database and device-bound database key.
   * Attachment files/keys are purged by the matching scoped attachment store.
   */
  async purge(): Promise<void> {
    this.locked = true;
    await runDatabaseOperationExclusive(
      this.vaultScope.databaseName,
      async () => {
        const database = this.database;
        const key = this.databaseKey;
        this.database = null;
        this.databaseKey = null;
        try {
          if (database) await database.closeAsync();
        } finally {
          key?.fill(0);
        }

        // Delete encrypted bytes first. If deletion fails, retain the matching
        // SecureStore key so a later retry can still authenticate the file.
        await SQLite.deleteDatabaseAsync(this.vaultScope.databaseName);
        await removeDatabaseKey(this.keyStore, this.vaultScope);
      }
    );
  }

  async load(): Promise<{
    readonly revision: number;
    readonly snapshot: JsonObject | null;
  }> {
    const database = this.requireDatabase();
    const row = await database.getFirstAsync<SnapshotRow>(
      "SELECT revision, snapshot_json FROM workspace_snapshot WHERE id = 1"
    );
    if (!row) {
      return {
        revision: 0,
        snapshot: null
      };
    }
    return {
      revision: row.revision,
      snapshot: row.snapshot_json
        ? (JSON.parse(row.snapshot_json) as JsonObject)
        : null
    };
  }

  async loadRecoveryRestoreJournal(): Promise<RecoveryRestoreCrashJournal | null> {
    const database = this.requireDatabase();
    const row =
      await database.getFirstAsync<RecoveryRestoreJournalRow>(
        `SELECT transaction_id, journal_json
         FROM recovery_restore_journal
         WHERE id = 1`
      );
    if (!row) return null;
    let journal: unknown;
    try {
      journal = JSON.parse(row.journal_json);
    } catch {
      throw new Error("The encrypted Recovery Kit journal is corrupt.");
    }
    assertRecoveryRestoreCrashJournal(journal);
    if (journal.transactionId !== row.transaction_id) {
      throw new Error("The encrypted Recovery Kit journal identity is corrupt.");
    }
    return journal;
  }

  async createRecoveryRestoreJournal(
    journal: RecoveryRestoreCrashJournal
  ): Promise<void> {
    assertRecoveryRestoreCrashJournal(journal);
    await this.withKeyedExclusiveTransaction(async (transaction) => {
      const existing =
        await transaction.getFirstAsync<RecoveryRestoreJournalRow>(
          `SELECT transaction_id, journal_json
           FROM recovery_restore_journal
           WHERE id = 1`
        );
      if (existing) {
        throw new Error(
          "An interrupted Recovery Kit must be resolved before another restore."
        );
      }
      await transaction.runAsync(
        `INSERT INTO recovery_restore_journal
          (id, transaction_id, journal_json, updated_at)
         VALUES (1, ?, ?, ?)`,
        journal.transactionId,
        JSON.stringify(journal),
        journal.updatedAt
      );
    });
  }

  async transitionRecoveryRestoreJournal(
    transactionId: string,
    expectedPhase: RecoveryRestoreJournalPhase,
    nextPhase: RecoveryRestoreJournalPhase,
    updatedAt: string
  ): Promise<void> {
    const expectedOrder = RECOVERY_JOURNAL_PHASE_ORDER[expectedPhase];
    const nextOrder = RECOVERY_JOURNAL_PHASE_ORDER[nextPhase];
    if (
      !/^[a-f0-9]{32}$/u.test(transactionId) ||
      !Number.isFinite(Date.parse(updatedAt)) ||
      typeof expectedOrder !== "number" ||
      typeof nextOrder !== "number" ||
      nextOrder <= expectedOrder
    ) {
      throw new Error("The Recovery Kit journal transition is invalid.");
    }
    await this.withKeyedExclusiveTransaction(async (transaction) => {
      const row =
        await transaction.getFirstAsync<RecoveryRestoreJournalRow>(
          `SELECT transaction_id, journal_json
           FROM recovery_restore_journal
           WHERE id = 1`
        );
      if (!row) {
        throw new Error("The Recovery Kit journal is missing.");
      }
      const journal = JSON.parse(row.journal_json) as unknown;
      assertRecoveryRestoreCrashJournal(journal);
      if (
        row.transaction_id !== transactionId ||
        journal.transactionId !== transactionId ||
        journal.phase !== expectedPhase
      ) {
        throw new Error(
          "The Recovery Kit journal changed before its phase transition."
        );
      }
      const next: RecoveryRestoreCrashJournal = {
        ...journal,
        phase: nextPhase,
        updatedAt
      };
      await transaction.runAsync(
        `UPDATE recovery_restore_journal
         SET journal_json = ?, updated_at = ?
         WHERE id = 1 AND transaction_id = ?`,
        JSON.stringify(next),
        updatedAt,
        transactionId
      );
    });
  }

  async clearRecoveryRestoreJournal(transactionId: string): Promise<void> {
    if (!/^[a-f0-9]{32}$/u.test(transactionId)) {
      throw new Error("The Recovery Kit journal identity is invalid.");
    }
    await this.withKeyedExclusiveTransaction(async (transaction) => {
      const row =
        await transaction.getFirstAsync<RecoveryRestoreJournalRow>(
          `SELECT transaction_id, journal_json
           FROM recovery_restore_journal
           WHERE id = 1`
        );
      if (!row) return;
      if (row.transaction_id !== transactionId) {
        throw new Error(
          "A different Recovery Kit journal is active."
        );
      }
      await transaction.runAsync(
        `DELETE FROM recovery_restore_journal
         WHERE id = 1 AND transaction_id = ?`,
        transactionId
      );
    });
  }

  async commit(commit: NativeWorkspaceCommit) {
    let actualRevision = commit.expectedRevision;
    let committed = false;

    await this.withKeyedExclusiveTransaction(async (transaction) => {
      const row = await transaction.getFirstAsync<SnapshotRow>(
        "SELECT revision, snapshot_json FROM workspace_snapshot WHERE id = 1"
      );
      actualRevision = row?.revision ?? 0;
      if (actualRevision !== commit.expectedRevision) {
        return;
      }

      await transaction.runAsync(
        `UPDATE workspace_snapshot
         SET revision = ?, snapshot_json = ?, updated_at = ?
         WHERE id = 1 AND revision = ?`,
        commit.nextRevision,
        JSON.stringify(commit.snapshot),
        new Date().toISOString(),
        commit.expectedRevision
      );
      for (const operation of commit.operations) {
        await transaction.runAsync(
          `INSERT OR IGNORE INTO sync_outbox
           (operation_id, operation_json, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          operation.operationId,
          JSON.stringify(operation),
          operation.status,
          operation.createdAt,
          operation.updatedAt
        );
      }
      committed = true;
    });

    if (!committed) {
      return revisionConflict(commit.expectedRevision, actualRevision);
    }
    return {
      ok: true as const,
      value: {
        revision: commit.nextRevision
      }
    };
  }

  async listPendingOperations(
    limit: number
  ): Promise<readonly SyncOperation[]> {
    const database = this.requireDatabase();
    const rows = await database.getAllAsync<OperationRow>(
      `SELECT operation_json
       FROM sync_outbox
       WHERE status IN ('on-device', 'queued')
       ORDER BY created_at ASC, rowid ASC
       LIMIT ?`,
      Math.max(0, limit)
    );
    return rows.map(
      (row) => JSON.parse(row.operation_json) as SyncOperation
    );
  }

  async acknowledgeOperation(operationId: string): Promise<void> {
    await this.withKeyedExclusiveTransaction(async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM sync_outbox WHERE operation_id = ?",
        operationId
      );
    });
  }

  async enqueueAnalyticsEvent(
    entry: Omit<QueuedAnalyticsEvent, "attemptCount">
  ): Promise<"queued" | "duplicate"> {
    const errors = validateAnalyticsEvent(entry.event);
    if (errors.length > 0) throw errors[0];
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        entry.idempotencyKey
      ) ||
      !Number.isFinite(Date.parse(entry.createdAt)) ||
      (entry.dedupeKey !== null &&
        !/^[a-z0-9][a-z0-9:_-]{0,79}$/u.test(entry.dedupeKey))
    ) {
      throw new Error("The analytics queue entry is invalid.");
    }

    let outcome: "queued" | "duplicate" = "duplicate";
    await this.withKeyedExclusiveTransaction(async (transaction) => {
      const existing = await transaction.getFirstAsync<AnalyticsEventRow>(
        `SELECT idempotency_key, dedupe_key, event_json, created_at,
                attempt_count
         FROM analytics_outbox
         WHERE idempotency_key = ?
            OR (? IS NOT NULL AND dedupe_key = ?)
         LIMIT 1`,
        entry.idempotencyKey,
        entry.dedupeKey,
        entry.dedupeKey
      );
      if (existing) {
        if (
          existing.idempotency_key === entry.idempotencyKey &&
          (existing.dedupe_key !== entry.dedupeKey ||
            existing.event_json !== JSON.stringify(entry.event))
        ) {
          throw new Error(
            "The analytics idempotency key was reused for another event."
          );
        }
        outcome = "duplicate";
        return;
      }
      const count = await transaction.getFirstAsync<CountRow>(
        `SELECT COUNT(*) AS count
         FROM analytics_outbox
         WHERE acknowledged_at IS NULL`
      );
      if ((count?.count ?? 0) >= ANALYTICS_QUEUE_CAPACITY) {
        throw new Error(
          "The encrypted analytics queue reached its bounded capacity."
        );
      }
      await transaction.runAsync(
        `INSERT INTO analytics_outbox
         (idempotency_key, dedupe_key, event_json, created_at,
          attempt_count, last_attempt_at, acknowledged_at)
         VALUES (?, ?, ?, ?, 0, NULL, NULL)`,
        entry.idempotencyKey,
        entry.dedupeKey,
        JSON.stringify(entry.event),
        entry.createdAt
      );
      outcome = "queued";
    });
    return outcome;
  }

  async listPendingAnalyticsEvents(
    limit: number
  ): Promise<readonly QueuedAnalyticsEvent[]> {
    const database = this.requireDatabase();
    const rows = await database.getAllAsync<AnalyticsEventRow>(
      `SELECT idempotency_key, dedupe_key, event_json, created_at,
              attempt_count
       FROM analytics_outbox
       WHERE acknowledged_at IS NULL
       ORDER BY created_at ASC, rowid ASC
       LIMIT ?`,
      Math.max(0, Math.min(ANALYTICS_QUEUE_CAPACITY, limit))
    );
    return rows.map((row) => {
      const event = JSON.parse(row.event_json) as AnalyticsEvent;
      const errors = validateAnalyticsEvent(event);
      if (errors.length > 0) throw errors[0];
      return {
        idempotencyKey: row.idempotency_key,
        dedupeKey: row.dedupe_key,
        event,
        createdAt: row.created_at,
        attemptCount: row.attempt_count
      };
    });
  }

  async recordAnalyticsAttempt(
    idempotencyKey: string,
    attemptedAt: string
  ): Promise<void> {
    await this.withKeyedExclusiveTransaction(async (transaction) => {
      await transaction.runAsync(
        `UPDATE analytics_outbox
         SET attempt_count = attempt_count + 1, last_attempt_at = ?
         WHERE idempotency_key = ?`,
        attemptedAt,
        idempotencyKey
      );
    });
  }

  async acknowledgeAnalyticsEvent(
    idempotencyKey: string
  ): Promise<void> {
    await this.withKeyedExclusiveTransaction(async (transaction) => {
      const row = await transaction.getFirstAsync<{
        readonly dedupe_key: string | null;
      }>(
        `SELECT dedupe_key
         FROM analytics_outbox
         WHERE idempotency_key = ?`,
        idempotencyKey
      );
      if (!row) return;
      if (row.dedupe_key === null) {
        await transaction.runAsync(
          "DELETE FROM analytics_outbox WHERE idempotency_key = ?",
          idempotencyKey
        );
        return;
      }
      await transaction.runAsync(
        `UPDATE analytics_outbox
         SET acknowledged_at = ?
         WHERE idempotency_key = ?`,
        new Date().toISOString(),
        idempotencyKey
      );
    });
  }

  async loadSyncState(): Promise<{
    readonly cursor: SyncCursor;
    readonly conflicts: readonly SyncConflict[];
  }> {
    const database = this.requireDatabase();
    const row = await database.getFirstAsync<SyncStateRow>(
      "SELECT cursor_json, conflicts_json FROM sync_state WHERE id = 1"
    );
    if (!row) {
      return {
        cursor: {
          cursorVersion: 1,
          value: null,
          issuedAt: null
        },
        conflicts: []
      };
    }
    return {
      cursor: JSON.parse(row.cursor_json) as SyncCursor,
      conflicts: JSON.parse(row.conflicts_json) as readonly SyncConflict[]
    };
  }

  async commitSync(commit: NativeWorkspaceSyncCommit) {
    let actualRevision = commit.expectedRevision;
    let committed = false;

    await this.withKeyedExclusiveTransaction(async (transaction) => {
      const row = await transaction.getFirstAsync<SnapshotRow>(
        "SELECT revision, snapshot_json FROM workspace_snapshot WHERE id = 1"
      );
      actualRevision = row?.revision ?? 0;
      if (actualRevision !== commit.expectedRevision) {
        return;
      }

      const updatedAt =
        commit.cursor.issuedAt ?? new Date().toISOString();
      await transaction.runAsync(
        `UPDATE workspace_snapshot
         SET revision = ?, snapshot_json = ?, updated_at = ?
         WHERE id = 1 AND revision = ?`,
        commit.nextRevision,
        JSON.stringify(commit.snapshot),
        updatedAt,
        commit.expectedRevision
      );
      for (const operationId of commit.acknowledgedOperationIds) {
        await transaction.runAsync(
          "DELETE FROM sync_outbox WHERE operation_id = ?",
          operationId
        );
      }
      for (const operation of commit.operations ?? []) {
        await transaction.runAsync(
          `INSERT OR IGNORE INTO sync_outbox
           (operation_id, operation_json, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          operation.operationId,
          JSON.stringify(operation),
          operation.status,
          operation.createdAt,
          operation.updatedAt
        );
      }
      const previousSyncState =
        await transaction.getFirstAsync<SyncStateRow>(
          "SELECT cursor_json, conflicts_json FROM sync_state WHERE id = 1"
        );
      const retainedConflictOperationIds = new Set(
        commit.conflicts.map((conflict) => conflict.operationId)
      );
      const previousConflicts = previousSyncState
        ? (JSON.parse(
            previousSyncState.conflicts_json
          ) as readonly SyncConflict[])
        : [];
      for (const previousConflict of previousConflicts) {
        if (
          !retainedConflictOperationIds.has(previousConflict.operationId)
        ) {
          await transaction.runAsync(
            "DELETE FROM sync_outbox WHERE operation_id = ?",
            previousConflict.operationId
          );
        }
      }
      const conflictedOperationIds = new Set(
        commit.conflicts.map((conflict) => conflict.operationId)
      );
      for (const operationId of conflictedOperationIds) {
        const operationRow =
          await transaction.getFirstAsync<OperationRow>(
            `SELECT operation_json
             FROM sync_outbox
             WHERE operation_id = ?`,
            operationId
          );
        if (!operationRow) continue;
        const operation = JSON.parse(
          operationRow.operation_json
        ) as SyncOperation;
        if (operation.status === "needs-attention") continue;
        const needsAttention: SyncOperation = {
          ...operation,
          status: "needs-attention",
          attemptCount: operation.attemptCount + 1,
          nextAttemptAt: null,
          lastErrorCode: "CONFLICT_REQUIRES_REVIEW",
          updatedAt
        };
        await transaction.runAsync(
          `UPDATE sync_outbox
           SET operation_json = ?, status = ?, updated_at = ?
           WHERE operation_id = ?`,
          JSON.stringify(needsAttention),
          needsAttention.status,
          updatedAt,
          operationId
        );
      }
      await transaction.runAsync(
        `UPDATE sync_state
         SET cursor_json = ?, conflicts_json = ?, updated_at = ?
         WHERE id = 1`,
        JSON.stringify(commit.cursor),
        JSON.stringify(commit.conflicts),
        updatedAt
      );
      committed = true;
    });

    if (!committed) {
      return revisionConflict(commit.expectedRevision, actualRevision);
    }
    return {
      ok: true as const,
      value: {
        revision: commit.nextRevision
      }
    };
  }

  private requireDatabase(): SQLite.SQLiteDatabase {
    if (this.locked) {
      throw new Error("The local vault is locked.");
    }
    if (!this.database) {
      throw new Error("Repository must be initialized before use.");
    }
    return this.database;
  }

  /**
   * Expo SQLite's `withExclusiveTransactionAsync` opens a separate native
   * connection. SQLCipher keys are connection-local, so that connection sees
   * encrypted bytes before any key is applied and rejects its first prepared
   * statement. Open the exclusive connection ourselves, key and authenticate
   * it before BEGIN, and always rollback/close it on failure.
   */
  private async withKeyedExclusiveTransaction<T>(
    operation: (transaction: SQLite.SQLiteDatabase) => Promise<T>
  ): Promise<T> {
    return runDatabaseOperationExclusive(
      this.vaultScope.databaseName,
      async () => {
        this.requireDatabase();
        if (!this.databaseKey) {
          throw new Error("The local database key is unavailable.");
        }
        const key = new Uint8Array(this.databaseKey);
        let transaction: SQLite.SQLiteDatabase | null = null;
        let transactionStarted = false;
        let committed = false;
        let result: T | undefined;
        let didFail = false;
        let failure: unknown;
        try {
          transaction = await SQLite.openDatabaseAsync(
            this.vaultScope.databaseName,
            { useNewConnection: true }
          );
          await applySqlCipherKey(transaction, key);
          await transaction.execAsync("BEGIN IMMEDIATE;");
          transactionStarted = true;
          result = await operation(transaction);
          await transaction.execAsync("COMMIT;");
          transactionStarted = false;
          committed = true;
        } catch (error) {
          didFail = true;
          failure = error;
          if (transaction && transactionStarted) {
            try {
              await transaction.execAsync("ROLLBACK;");
            } catch {
              // Preserve the original database/operation error. Closing the
              // isolated connection below is the final containment boundary.
            }
          }
        } finally {
          key.fill(0);
          if (transaction) {
            try {
              await transaction.closeAsync();
            } catch (closeError) {
              if (!didFail && !committed) {
                didFail = true;
                failure = closeError;
              }
              // Once COMMIT has been acknowledged, the write is durable.
              // Reporting an isolated-handle cleanup error as a failed write
              // would invite a duplicate retry. This repository has no
              // non-recursive diagnostics channel, so a close-only error is
              // contained here; the next operation opens a fresh connection.
            }
          }
        }
        if (didFail) throw failure;
        return result as T;
      }
    );
  }
}
