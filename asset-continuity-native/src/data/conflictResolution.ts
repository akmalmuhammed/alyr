import type { SyncConflict, SyncOperation } from "@alyr/contracts";

import {
  conflictResolutionOptions,
  conflictServerOperationId,
  createConflictReapplyOperation,
  isDurableSyncConflict,
  markConflictReapplying,
  type ConflictResolutionChoice
} from "@/data/conflictInbox";
import { applyServerChanges } from "@/data/foregroundSync";
import type { NativeWorkspaceRepository } from "@/data/repository";
import {
  isNativeWorkspace,
  type NativeWorkspace
} from "@/domain/model";

export interface ConflictResolutionResult {
  readonly outcome: "cloud-kept" | "local-reapply-queued";
  readonly revision: number;
  readonly workspace: NativeWorkspace;
  readonly conflicts: readonly SyncConflict[];
}

export async function resolveDurableSyncConflict(input: {
  readonly repository: NativeWorkspaceRepository;
  readonly householdId: string;
  readonly operationId: string;
  readonly choice: Exclude<
    ConflictResolutionChoice,
    "review-manually"
  >;
  readonly replacementOperationId: () => string;
  readonly now: () => string;
}): Promise<ConflictResolutionResult> {
  const [loaded, syncState] = await Promise.all([
    input.repository.load(),
    input.repository.loadSyncState()
  ]);
  if (
    !loaded.snapshot ||
    !isNativeWorkspace(loaded.snapshot) ||
    loaded.snapshot.household.id !== input.householdId
  ) {
    throw new Error(
      "The active household record is unavailable for conflict review."
    );
  }
  const currentWorkspace = loaded.snapshot;
  const conflict = syncState.conflicts.find(
    (candidate) => candidate.operationId === input.operationId
  );
  if (
    !conflict ||
    !isDurableSyncConflict(conflict, input.householdId)
  ) {
    throw new Error(
      "This sync conflict is no longer available for review."
    );
  }
  if (!conflictResolutionOptions(conflict).includes(input.choice)) {
    throw new Error(
      "This resolution is not valid for the selected conflict."
    );
  }

  const requestedAt = input.now();
  let nextWorkspace = currentWorkspace;
  let nextConflicts: readonly SyncConflict[];
  let operations: readonly SyncOperation[] = [];
  let acknowledgedOperationIds: readonly string[] = [];
  let outcome: ConflictResolutionResult["outcome"];

  if (input.choice === "keep-cloud") {
    const serverChange = conflict.clientContext.serverChange;
    const serverOperationId = conflictServerOperationId(conflict);
    if (!serverChange || !serverOperationId) {
      throw new Error(
        "The verified cloud record is not available for this review."
      );
    }
    nextWorkspace = applyServerChanges(currentWorkspace, [serverChange], {
      householdId: input.householdId,
      localOperationIds: new Set([serverOperationId]),
      conflictedEntityIds: new Set()
    });
    nextConflicts = syncState.conflicts.filter(
      (candidate) => candidate.operationId !== conflict.operationId
    );
    acknowledgedOperationIds = [conflict.operationId];
    outcome = "cloud-kept";
  } else {
    const replacementOperationId = input.replacementOperationId();
    const replacement = createConflictReapplyOperation(
      conflict,
      replacementOperationId,
      requestedAt
    );
    nextConflicts = syncState.conflicts.map((candidate) =>
      candidate.operationId === conflict.operationId
        ? markConflictReapplying(
            conflict,
            replacementOperationId,
            requestedAt
          )
        : candidate
    );
    operations = [replacement];
    outcome = "local-reapply-queued";
  }

  const committedWorkspace: NativeWorkspace = {
    ...nextWorkspace,
    syncStatus:
      nextConflicts.length > 0 ? "needs-attention" : "ready",
    updatedAt: requestedAt
  };
  const committed = await input.repository.commitSync({
    expectedRevision: loaded.revision,
    nextRevision: loaded.revision + 1,
    snapshot: committedWorkspace,
    cursor: syncState.cursor,
    operations,
    acknowledgedOperationIds,
    conflicts: nextConflicts
  });
  if (!committed.ok) {
    throw new Error(committed.error.message);
  }
  return {
    outcome,
    revision: committed.value.revision,
    workspace: committedWorkspace,
    conflicts: nextConflicts
  };
}
