import type { JsonObject, SyncOperation } from "@alyr/contracts";

import type {
  NativeWorkspaceCommit,
  NativeWorkspaceRepository
} from "./repository";
import { revisionConflict } from "./repository";

export class MemoryWorkspaceRepository implements NativeWorkspaceRepository {
  readonly kind = "memory-preview" as const;
  readonly durable = false;
  readonly encryptedAtRest = false;

  private revision = 0;
  private snapshot: JsonObject | null = null;
  private readonly operations = new Map<string, SyncOperation>();

  async initialize(): Promise<void> {
    return undefined;
  }

  async load(): Promise<{
    readonly revision: number;
    readonly snapshot: JsonObject | null;
  }> {
    return {
      revision: this.revision,
      snapshot: this.snapshot ? structuredClone(this.snapshot) : null
    };
  }

  async commit(commit: NativeWorkspaceCommit) {
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
    return [...this.operations.values()]
      .filter((operation) =>
        ["on-device", "queued", "needs-attention"].includes(operation.status)
      )
      .slice(0, Math.max(0, limit))
      .map((operation) => structuredClone(operation));
  }

  async acknowledgeOperation(operationId: string): Promise<void> {
    this.operations.delete(operationId);
  }
}
