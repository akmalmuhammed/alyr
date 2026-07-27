import type {
  JsonObject,
  Result,
  SyncConflict,
  SyncCursor,
  SyncOperation,
  WorkspaceCommit,
  WorkspaceRepository,
  WorkspaceSyncCommit,
  WorkspaceSyncState
} from "@alyr/contracts";
import type { VaultScopeId } from "./vaultScope";

export type RepositoryKind = "sqlite-sqlcipher" | "memory-preview";

export interface NativeWorkspaceRepository
  extends WorkspaceRepository<JsonObject> {
  readonly kind: RepositoryKind;
  readonly durable: boolean;
  readonly encryptedAtRest: boolean;
  readonly scopeId: VaultScopeId;
  close(): Promise<void>;
  lock(): Promise<void>;
  purge(): Promise<void>;
}

export function storageFailure(
  message: string,
  retryable = true
): Result<never> {
  return {
    ok: false,
    error: {
      errorVersion: 1,
      code: "STORAGE_UNAVAILABLE",
      message,
      retryable
    }
  };
}

export function revisionConflict(
  expectedRevision: number,
  actualRevision: number
): Result<never> {
  return {
    ok: false,
    error: {
      errorVersion: 1,
      code: "CONFLICT_REQUIRES_REVIEW",
      message: "The local workspace changed before this update could be saved.",
      retryable: true,
      details: {
        expectedRevision,
        actualRevision
      }
    }
  };
}

export type NativeWorkspaceCommit = WorkspaceCommit<JsonObject>;
export type NativeWorkspaceSyncCommit = WorkspaceSyncCommit<JsonObject>;
export type NativeWorkspaceSyncState = WorkspaceSyncState;
export type PendingSyncOperation = SyncOperation;
export type DurableSyncConflict = SyncConflict;
export type DurableSyncCursor = SyncCursor;
