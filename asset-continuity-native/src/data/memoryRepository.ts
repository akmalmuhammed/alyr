import type {
  JsonObject,
  SyncConflict,
  SyncCursor,
  SyncOperation
} from "@alyr/contracts";

import type {
  NativeWorkspaceCommit,
  NativeWorkspaceRepository,
  NativeWorkspaceSyncCommit
} from "./repository";
import { revisionConflict } from "./repository";
import {
  assertValidVaultScope,
  DEVICE_PREVIEW_VAULT_SCOPE,
  type VaultScope,
  type VaultScopeId
} from "./vaultScope";

export class MemoryWorkspaceRepository implements NativeWorkspaceRepository {
  readonly kind = "memory-preview" as const;
  readonly durable = false;
  readonly encryptedAtRest = false;
  readonly scopeId: VaultScopeId;

  private revision = 0;
  private snapshot: JsonObject | null = null;
  private readonly operations = new Map<string, SyncOperation>();
  private cursor: SyncCursor = {
    cursorVersion: 1,
    value: null,
    issuedAt: null
  };
  private conflicts: readonly SyncConflict[] = [];
  private locked = false;

  constructor(scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE) {
    this.scopeId = assertValidVaultScope(scope).scopeId;
  }

  async initialize(): Promise<void> {
    this.assertUnlocked();
  }

  async load(): Promise<{
    readonly revision: number;
    readonly snapshot: JsonObject | null;
  }> {
    this.assertUnlocked();
    return {
      revision: this.revision,
      snapshot: this.snapshot ? structuredClone(this.snapshot) : null
    };
  }

  async commit(commit: NativeWorkspaceCommit) {
    this.assertUnlocked();
    if (commit.expectedRevision !== this.revision) {
      return revisionConflict(commit.expectedRevision, this.revision);
    }
    this.snapshot = structuredClone(commit.snapshot);
    this.revision = commit.nextRevision;
    for (const operation of commit.operations) {
      this.operations.set(operation.operationId, operation);
    }
    return {
      ok: true as const,
      value: {
        revision: this.revision
      }
    };
  }

  async listPendingOperations(
    limit: number
  ): Promise<readonly SyncOperation[]> {
    this.assertUnlocked();
    return [...this.operations.values()]
      .filter((operation) =>
        ["on-device", "queued"].includes(operation.status)
      )
      .slice(0, Math.max(0, limit))
      .map((operation) => structuredClone(operation));
  }

  async acknowledgeOperation(operationId: string): Promise<void> {
    this.assertUnlocked();
    this.operations.delete(operationId);
  }

  async loadSyncState() {
    this.assertUnlocked();
    return {
      cursor: structuredClone(this.cursor),
      conflicts: structuredClone(this.conflicts)
    };
  }

  async commitSync(commit: NativeWorkspaceSyncCommit) {
    this.assertUnlocked();
    if (commit.expectedRevision !== this.revision) {
      return revisionConflict(commit.expectedRevision, this.revision);
    }

    const nextOperations = new Map(this.operations);
    for (const operation of commit.operations ?? []) {
      if (!nextOperations.has(operation.operationId)) {
        nextOperations.set(
          operation.operationId,
          structuredClone(operation)
        );
      }
    }
    for (const operationId of commit.acknowledgedOperationIds) {
      nextOperations.delete(operationId);
    }
    const retainedConflictOperationIds = new Set(
      commit.conflicts.map((conflict) => conflict.operationId)
    );
    for (const previousConflict of this.conflicts) {
      if (!retainedConflictOperationIds.has(previousConflict.operationId)) {
        nextOperations.delete(previousConflict.operationId);
      }
    }
    const conflictedOperationIds = new Set(
      commit.conflicts.map((conflict) => conflict.operationId)
    );
    for (const operationId of conflictedOperationIds) {
      const operation = nextOperations.get(operationId);
      if (!operation || operation.status === "needs-attention") {
        continue;
      }
      nextOperations.set(operationId, {
        ...operation,
        status: "needs-attention",
        attemptCount: operation.attemptCount + 1,
        nextAttemptAt: null,
        lastErrorCode: "CONFLICT_REQUIRES_REVIEW",
        updatedAt: commit.cursor.issuedAt ?? operation.updatedAt
      });
    }

    this.snapshot = structuredClone(commit.snapshot);
    this.revision = commit.nextRevision;
    this.cursor = structuredClone(commit.cursor);
    this.conflicts = structuredClone(commit.conflicts);
    this.operations.clear();
    for (const [operationId, operation] of nextOperations) {
      this.operations.set(operationId, operation);
    }
    return {
      ok: true as const,
      value: {
        revision: this.revision
      }
    };
  }

  async close(): Promise<void> {}

  async lock(): Promise<void> {
    this.locked = true;
  }

  async purge(): Promise<void> {
    await this.lock();
    this.revision = 0;
    this.snapshot = null;
    this.operations.clear();
    this.cursor = {
      cursorVersion: 1,
      value: null,
      issuedAt: null
    };
    this.conflicts = [];
  }

  private assertUnlocked(): void {
    if (this.locked) {
      throw new Error("This local preview vault is locked.");
    }
  }
}
