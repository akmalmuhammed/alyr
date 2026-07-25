import type {
  JsonObject,
  Result,
  SyncOperation,
  WorkspaceCommit,
  WorkspaceRepository
} from "@alyr/contracts";

export type RepositoryKind = "sqlite-sqlcipher" | "memory-preview";

export interface NativeWorkspaceRepository
  extends WorkspaceRepository<JsonObject> {
  readonly kind: RepositoryKind;
  readonly durable: boolean;
  readonly encryptedAtRest: boolean;
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
export type PendingSyncOperation = SyncOperation;
