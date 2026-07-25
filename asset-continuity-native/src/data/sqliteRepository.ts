import * as SQLite from "expo-sqlite";

import type {
  JsonObject,
  SecureKeyStore,
  SyncOperation
} from "@alyr/contracts";

import {
  type NativeWorkspaceCommit,
  type NativeWorkspaceRepository,
  revisionConflict
} from "./repository";
import { getOrCreateDatabaseKey } from "./secureKeyStore";

interface SnapshotRow {
  readonly revision: number;
  readonly snapshot_json: string | null;
}

interface OperationRow {
  readonly operation_json: string;
}

interface CipherVersionRow {
  readonly cipher_version: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class SQLiteWorkspaceRepository implements NativeWorkspaceRepository {
  readonly kind = "sqlite-sqlcipher" as const;
  readonly durable = true;
  readonly encryptedAtRest = true;

  private database: SQLite.SQLiteDatabase | null = null;

  constructor(private readonly keyStore: SecureKeyStore) {}

  async initialize(): Promise<void> {
    if (this.database) {
      return;
    }
    const key = await getOrCreateDatabaseKey(this.keyStore);
    const keyHex = bytesToHex(key);
    if (!/^[a-f0-9]{64}$/u.test(keyHex)) {
      throw new Error("The generated local database key was invalid.");
    }

    const database = await SQLite.openDatabaseAsync("alyr-continuity.db");
    await database.execAsync(`PRAGMA key = "x'${keyHex}'";`);
    const cipher = await database.getFirstAsync<CipherVersionRow>(
      "PRAGMA cipher_version;"
    );
    if (!cipher?.cipher_version) {
      await database.closeAsync();
      throw new Error(
        "SQLCipher is unavailable; ALYR will not open a plaintext vault."
      );
    }
    await database.execAsync("PRAGMA foreign_keys = ON;");
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
      INSERT OR IGNORE INTO workspace_snapshot
        (id, revision, snapshot_json, updated_at)
      VALUES
        (1, 0, NULL, '1970-01-01T00:00:00.000Z');
    `);
    this.database = database;
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

  async commit(commit: NativeWorkspaceCommit) {
    const database = this.requireDatabase();
    let actualRevision = commit.expectedRevision;
    let committed = false;

    await database.withExclusiveTransactionAsync(async (transaction) => {
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
       WHERE status IN ('on-device', 'queued', 'needs-attention')
       ORDER BY created_at ASC
       LIMIT ?`,
      Math.max(0, limit)
    );
    return rows.map(
      (row) => JSON.parse(row.operation_json) as SyncOperation
    );
  }

  async acknowledgeOperation(operationId: string): Promise<void> {
    const database = this.requireDatabase();
    await database.runAsync(
      "DELETE FROM sync_outbox WHERE operation_id = ?",
      operationId
    );
  }

  private requireDatabase(): SQLite.SQLiteDatabase {
    if (!this.database) {
      throw new Error("Repository must be initialized before use.");
    }
    return this.database;
  }
}
