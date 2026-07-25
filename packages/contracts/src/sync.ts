import type {
  DeviceId,
  EntityId,
  HouseholdId,
  IsoDateTime,
  JsonObject,
  MemberId,
} from "./core.js";

export type SyncStatus =
  | "on-device"
  | "queued"
  | "uploading"
  | "processing"
  | "synced"
  | "needs-attention";

export type DomainCommandType =
  | "place.create"
  | "space.create"
  | "asset.create"
  | "asset.update"
  | "asset.move"
  | "asset.archive"
  | "evidence.create"
  | "evidence.version.add"
  | "evidence.review";

export interface DomainCommand<
  TType extends DomainCommandType = DomainCommandType,
  TPayload = JsonObject,
> {
  readonly commandVersion: 1;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly householdId: HouseholdId;
  readonly actorMemberId: MemberId;
  readonly deviceId: DeviceId;
  readonly type: TType;
  readonly aggregateId: EntityId | null;
  readonly observedVersion: number | null;
  readonly occurredAt: IsoDateTime;
  readonly payload: TPayload;
}

export interface SyncOperation {
  readonly operationVersion: 1;
  readonly operationId: string;
  readonly householdId: HouseholdId;
  readonly command: DomainCommand;
  readonly prerequisites: readonly SyncPrerequisite[];
  readonly status: SyncStatus;
  readonly attemptCount: number;
  readonly nextAttemptAt: IsoDateTime | null;
  readonly lastErrorCode: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export type SyncPrerequisite = {
  readonly kind: "blob-stored";
  readonly blobObjectId: EntityId;
};

/**
 * Provider-neutral opaque cursor. Consumers may persist `value`, but must not
 * inspect it or treat a provider URL as record identity.
 */
export interface SyncCursor {
  readonly cursorVersion: 1;
  readonly value: string | null;
  readonly issuedAt: IsoDateTime | null;
}

export interface SyncChange {
  readonly sequence: number;
  readonly entityType: string;
  readonly entityId: EntityId;
  readonly householdId: HouseholdId;
  readonly version: number;
  readonly tombstoned: boolean;
  readonly body: JsonObject | null;
  readonly changedAt: IsoDateTime;
}

export interface SyncConflict {
  readonly operationId: string;
  readonly entityId: EntityId;
  readonly conflictKind:
    | "location"
    | "ownership"
    | "permission"
    | "value"
    | "identifier"
    | "lifecycle";
  readonly serverVersion: number;
  readonly message: string;
}
