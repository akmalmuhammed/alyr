import type {
  ContractError,
  DomainCommandType,
  JsonObject,
  SyncOperation
} from "@alyr/contracts";

import type { NativeWorkspace } from "@/domain/model";

export interface OperationFactoryInput {
  readonly type: DomainCommandType;
  readonly aggregateId: string | null;
  readonly payload: JsonObject;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly observedVersion: number;
  readonly occurredAt: string;
  readonly prerequisites?: SyncOperation["prerequisites"];
}

export function createLocalOperation(
  workspace: NativeWorkspace,
  input: OperationFactoryInput
): SyncOperation {
  const actorMemberId =
    workspace.members.find((member) => member.role === "owner")?.id ??
    "00000000-0000-4000-8000-000000000099";
  return {
    operationVersion: 1,
    operationId: input.operationId,
    householdId: workspace.household.id,
    command: {
      commandVersion: 1,
      commandId: input.operationId,
      idempotencyKey: input.idempotencyKey,
      householdId: workspace.household.id,
      actorMemberId,
      deviceId: workspace.deviceId,
      type: input.type,
      aggregateId: input.aggregateId,
      observedVersion: input.observedVersion,
      occurredAt: input.occurredAt,
      payload: input.payload
    },
    prerequisites: input.prerequisites ?? [],
    status: "on-device",
    attemptCount: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt
  };
}

export function selectPushableOperations(
  operations: readonly SyncOperation[],
  storedBlobObjectIds: ReadonlySet<string>
): SyncOperation[] {
  return operations.filter((operation) =>
    operation.prerequisites.every(
      (prerequisite) =>
        prerequisite.kind === "blob-stored" &&
        storedBlobObjectIds.has(prerequisite.blobObjectId)
    )
  );
}

export interface SyncDiagnostic {
  readonly mode: "local-only" | "cloud-ready";
  readonly queuedOperationCount: number;
  readonly lastSyncedAt: string | null;
  readonly message: string;
}

export function syncUnavailableError(): ContractError {
  return {
    errorVersion: 1,
    code: "OFFLINE",
    message:
      "Cloud sync is not configured. Your committed records remain on this device.",
    retryable: true
  };
}
