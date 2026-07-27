import type {
  DeviceId,
  EntityId,
  HouseholdId,
  IsoDateTime,
  JsonObject,
  MemberId,
  PlaceDocumentId,
  PlaceId,
} from "./core.js";
import type { EvidenceKind, EvidenceRelation } from "./evidence.js";

export type SyncStatus =
  | "on-device"
  | "queued"
  | "uploading"
  | "processing"
  | "synced"
  | "needs-attention";

export const DOMAIN_COMMAND_TYPES = [
  "place.create",
  "place.update",
  "space.create",
  "space.update",
  "asset.create",
  "asset.update",
  "asset.move",
  "asset.archive",
  "asset.restore",
  "evidence.create",
  "evidence.version.add",
  "evidence.review",
  "place-document.create",
  "place-document.version.add",
  "value.create",
  "value.update",
  "value.delete",
] as const;

export type DomainCommandType = (typeof DOMAIN_COMMAND_TYPES)[number];

/**
 * One dated, user-entered Portfolio assertion targets exactly one subject.
 * A Place subject is accepted only after the server confirms that the
 * household explicitly classifies it as an owned Property.
 */
export type ValueAssertionPayload = {
  readonly amountMinor: number;
  readonly currency: string;
  readonly asOf: string;
  readonly source: "user-entered";
} & (
  | {
      readonly assetId: EntityId;
      readonly placeId?: never;
    }
  | {
      readonly placeId: EntityId;
      readonly assetId?: never;
    }
);

/**
 * Creates the durable metadata record before bytes are uploaded. Place
 * documents use the same private BlobObject and immutable version lifecycle
 * as asset Evidence while retaining an explicit Place parent.
 */
export interface PlaceDocumentCreatePayload extends JsonObject {
  readonly placeId: PlaceId;
  readonly kind: EvidenceKind;
  readonly relation: EvidenceRelation;
  readonly title: string;
}

/**
 * Binds one byte-verified, already-stored BlobObject to the next immutable
 * version of a Place document. `observedVersion` on the command is the current
 * immutable document-version number, starting at zero.
 */
export interface PlaceDocumentVersionAddPayload extends JsonObject {
  readonly placeDocumentId: PlaceDocumentId;
  readonly blobObjectId: EntityId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
}

export type PlaceDocumentCreateCommand = DomainCommand<
  "place-document.create",
  PlaceDocumentCreatePayload
>;

export type PlaceDocumentVersionAddCommand = DomainCommand<
  "place-document.version.add",
  PlaceDocumentVersionAddPayload
>;

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
