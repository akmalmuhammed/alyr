import type {
  ContractError,
  EvidenceId,
  HouseholdId,
  HouseholdRole,
  IsoDateTime,
  JsonObject,
  Result,
} from "./core.js";
import type { SyncChange, SyncConflict, SyncCursor, SyncOperation } from "./sync.js";

export const CONTRACT_API_VERSION = 1 as const;

/**
 * Caller-stable household provisioning intent.
 *
 * The operation identity is persisted before the request leaves the device
 * and reused until the provider-authoritative owner tuple is reconciled.
 * Reusing an identity with a different name is an idempotency conflict.
 */
export interface CreateHouseholdRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly operationId: string;
  /**
   * Client-generated once with the durable operation. It makes recovery
   * specific to the intended household even when an account may own several.
   */
  readonly householdId: HouseholdId;
  readonly name: string;
}

export interface SyncPushRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly operations: readonly SyncOperation[];
}

export interface SyncPushResponse {
  readonly acknowledgedOperationIds: readonly string[];
  readonly conflicts: readonly SyncConflict[];
  readonly cursor: SyncCursor;
}

/**
 * The minimum signed, server-authoritative identity needed to materialize a
 * household on a clean device. A response is issued only for an active
 * membership; revoked access is represented by an authorization error rather
 * than a descriptor with stale data.
 */
export interface WorkspaceBootstrapDescriptor {
  readonly householdId: HouseholdId;
  readonly householdName: string;
  readonly householdVersion: number;
  readonly householdCreatedAt: IsoDateTime;
  readonly membershipId: string;
  readonly accountId: string;
  readonly role: HouseholdRole;
  readonly membershipVersion: number;
}

export interface SyncPullResponse {
  readonly workspace: WorkspaceBootstrapDescriptor;
  readonly changes: readonly SyncChange[];
  readonly cursor: SyncCursor;
}

export interface UploadIntentRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly householdId: HouseholdId;
  /**
   * Asset Evidence ID, or Place Document ID for a
   * `place-document.version.add` upload.
   */
  readonly evidenceId: EvidenceId;
  /** Asset Evidence Version ID or Place Document Version ID. */
  readonly evidenceVersionId: string;
  readonly blobId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
}

export interface UploadIntentResponse {
  readonly uploadId: string;
  readonly blobObjectId: string;
  readonly expiresAt: IsoDateTime;
  readonly uploadTarget: JsonObject;
}

export interface UploadCompletionRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly checksumSha256: string;
  readonly byteSize: number;
}

export interface UploadCompletionResponse {
  readonly upload: {
    readonly id: string;
    readonly objectKey: string;
    readonly status: "stored";
  };
  readonly note: string;
}

/**
 * Provider-neutral request for one immutable EvidenceVersion's bytes.
 * The server resolves the active storage provider only after authenticating
 * the caller and verifying household membership plus the complete metadata
 * tuple. Clients verify the returned bytes again before local persistence.
 */
export interface EvidenceDownloadRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly householdId: HouseholdId;
  /** Asset Evidence ID or Place Document ID. */
  readonly evidenceId: EvidenceId;
  /** Asset Evidence Version ID or Place Document Version ID. */
  readonly evidenceVersionId: string;
  readonly blobId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
}

export interface InviteAcceptRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly oneTimeCode: string;
}

/**
 * Public preflight for a signed-out household recipient. The server binds the
 * bearer invitation to this normalized email and returns no household
 * metadata. A successful grant enrolls identity creation with zero authority
 * to create another household.
 */
export interface HouseholdInviteSignupPreflightRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly email: string;
  readonly oneTimeCode: string;
}

export interface SignupEnrollmentGrantResponse {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly enrollmentGrant: string;
  readonly expiresAt: IsoDateTime;
}

export interface HouseholdMemberDescriptor {
  readonly membershipId: string;
  readonly householdId: HouseholdId;
  readonly accountId: string;
  readonly displayName: string;
  /**
   * Owners may see the account email needed to distinguish members. Other
   * members receive it only for their own row.
   */
  readonly email: string | null;
  readonly role: HouseholdRole;
  readonly status: "active";
  readonly version: number;
  readonly joinedAt: IsoDateTime;
  readonly isCurrentUser: boolean;
}

export interface PendingHouseholdInviteDescriptor {
  readonly inviteId: string;
  readonly householdId: HouseholdId;
  readonly role: Exclude<HouseholdRole, "owner">;
  readonly status: "pending";
  readonly version: number;
  readonly createdAt: IsoDateTime;
  readonly expiresAt: IsoDateTime;
}

/**
 * An active-membership-only view. The server returns no names, counts, or
 * pending invitation metadata after access is revoked.
 */
export interface HouseholdAccessSnapshot {
  readonly householdId: HouseholdId;
  readonly householdName: string;
  readonly householdVersion: number;
  readonly currentMembershipId: string;
  readonly currentAccountId: string;
  readonly currentRole: HouseholdRole;
  readonly members: readonly HouseholdMemberDescriptor[];
  readonly pendingInvites: readonly PendingHouseholdInviteDescriptor[];
  readonly refreshedAt: IsoDateTime;
}

export interface HouseholdAccessMutationReceipt {
  readonly operationId: string;
  readonly kind:
    | "membership.role_changed"
    | "membership.revoked"
    | "invite.cancelled"
    | "ownership.transferred";
}

export interface ExportCreateRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly householdId: HouseholdId;
  readonly format: "pdf" | "json-manifest";
  readonly assetIds: readonly string[];
  readonly redacted: boolean;
  /**
   * Caller-stable across retries of this exact snapshot request. Reusing it
   * with a different scope is a contract conflict.
   */
  readonly idempotencyKey: string;
}

export interface ExportStatusResponse {
  readonly exportId: string;
  readonly status: "queued" | "processing" | "ready" | "failed" | "expired";
  readonly blobObjectId: string | null;
  readonly fileName: string | null;
  readonly mimeType: "application/json" | "application/pdf" | null;
  readonly byteSize: number | null;
  readonly checksumSha256: string | null;
  readonly expiresAt: IsoDateTime | null;
  readonly completedAt: IsoDateTime | null;
  readonly error: ContractError | null;
}

/**
 * Destructive account removal is deliberately server-reviewed rather than a
 * direct auth-provider call from the client. The server re-authenticates the
 * password, verifies the selected household tuple, and refuses deletion when
 * ownership must be transferred to another active household member.
 */
export interface AccountDeletionRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly expectedAccountId: string;
  readonly expectedActiveHouseholdId: HouseholdId;
  readonly expectedActiveHouseholdRole: HouseholdRole;
  readonly confirmationEmail: string;
  readonly password: string;
  readonly acknowledgeIrreversibleDeletion: true;
}

export interface AccountDeletionReceipt {
  readonly accountId: string;
  /**
   * Sole-member households owned by the deleted account. Their records and
   * private evidence objects are removed with the account.
   */
  readonly deletedHouseholdIds: readonly HouseholdId[];
  /**
   * Households the account joined as an editor or viewer. Their records stay
   * with the remaining household owner.
   */
  readonly departedHouseholdIds: readonly HouseholdId[];
  readonly deletedAt: IsoDateTime;
}

export type ApiResult<T> = Result<T, ContractError>;
