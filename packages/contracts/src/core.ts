export type IsoDateTime = string;
export type EntityId = string;
export type HouseholdId = EntityId;
export type MemberId = EntityId;
export type DeviceId = EntityId;
export type PlaceId = EntityId;
export type SpaceId = EntityId;
export type AssetId = EntityId;
export type EvidenceId = EntityId;
export type EvidenceVersionId = EntityId;
export type PlaceDocumentId = EntityId;
export type PlaceDocumentVersionId = EntityId;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export type HouseholdRole = "owner" | "editor" | "viewer";

export type PermissionCapability =
  | "household.read"
  | "household.manage"
  | "place.read"
  | "place.write"
  | "asset.read"
  | "asset.write"
  | "evidence.read"
  | "evidence.write"
  | "member.manage"
  | "export.create"
  | "audit.read";

export const ROLE_CAPABILITIES = {
  owner: [
    "household.read",
    "household.manage",
    "place.read",
    "place.write",
    "asset.read",
    "asset.write",
    "evidence.read",
    "evidence.write",
    "member.manage",
    "export.create",
    "audit.read",
  ],
  editor: [
    "household.read",
    "place.read",
    "place.write",
    "asset.read",
    "asset.write",
    "evidence.read",
    "evidence.write",
    "export.create",
  ],
  viewer: [
    "household.read",
    "place.read",
    "asset.read",
    "evidence.read",
  ],
} as const satisfies Record<HouseholdRole, readonly PermissionCapability[]>;

export type TombstoneState = "active" | "tombstoned";

export interface VersionedHouseholdRecord {
  readonly id: EntityId;
  readonly householdId: HouseholdId;
  readonly version: number;
  readonly tombstoneState: TombstoneState;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export type Result<TValue, TError = ContractError> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };

export const API_ERROR_VERSION = 1 as const;

export type ApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_DENIED"
  | "CONFLICT_REQUIRES_REVIEW"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_COMMAND"
  | "INVALID_CURSOR"
  | "INVALID_FILE"
  | "NOT_FOUND"
  | "OFFLINE"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "SESSION_EXPIRED"
  | "STORAGE_UNAVAILABLE"
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "VALIDATION_FAILED";

export interface ContractError {
  readonly errorVersion: typeof API_ERROR_VERSION;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, JsonPrimitive>>;
}
