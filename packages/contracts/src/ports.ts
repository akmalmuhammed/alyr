import type {
  ContractError,
  HouseholdId,
  HouseholdRole,
  IsoDateTime,
  JsonObject,
  MemberId,
  Result,
} from "./core.js";
import type { AnalyticsEvent } from "./analytics.js";
import type { Coordinates, PlacePin } from "./location.js";
import type {
  SyncChange,
  SyncConflict,
  SyncCursor,
  SyncOperation,
} from "./sync.js";
import type {
  AccountDeletionReceipt,
  AccountDeletionRequest,
  CreateHouseholdRequest,
  HouseholdAccessMutationReceipt,
  HouseholdAccessSnapshot,
  HouseholdStorageUsageResponse,
  WorkspaceBootstrapDescriptor,
} from "./api.js";

export interface AuthSession {
  readonly accountId: string;
  readonly memberId: MemberId;
  readonly householdId: HouseholdId;
  readonly role: HouseholdRole;
  readonly expiresAt: IsoDateTime;
}

export interface AuthPort {
  currentSession(): Promise<AuthSession | null>;
  signIn(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<Result<AuthSession>>;
  signOut(): Promise<void>;
  refreshSession(): Promise<Result<AuthSession>>;
}

export interface HouseholdInvite {
  readonly inviteId: string;
  /**
   * Returned once at creation time for deliberate out-of-band sharing.
   * Clients must not place this code in analytics or long-lived logs.
   */
  readonly oneTimeCode: string;
  readonly role: Exclude<HouseholdRole, "owner">;
  readonly expiresAt: IsoDateTime;
}

/**
 * Privacy-scoped invitation details shown to the authenticated recipient
 * before the one-time code is redeemed.
 *
 * This deliberately excludes household identifiers, member counts, account
 * identifiers, and any other record data. A valid review never creates or
 * changes membership.
 */
export interface HouseholdInviteReview {
  readonly householdName: string;
  readonly role: Exclude<HouseholdRole, "owner">;
  readonly expiresAt: IsoDateTime;
}

export interface HouseholdMembership {
  readonly membershipId: string;
  readonly householdId: HouseholdId;
  readonly accountId: string;
  readonly role: HouseholdRole;
  readonly status: "active" | "revoked";
  readonly version: number;
}

export interface HouseholdWorkspace {
  readonly householdId: HouseholdId;
  readonly name: string;
  readonly version: number;
  readonly createdAt: IsoDateTime;
}

export interface HouseholdCreationReceipt {
  readonly operationId: string;
  readonly household: HouseholdWorkspace;
}

export interface HouseholdAccessPort {
  createHousehold(
    request: CreateHouseholdRequest,
  ): Promise<Result<HouseholdCreationReceipt>>;
  completeOnboarding(
    householdId: HouseholdId,
  ): Promise<
    Result<{
      readonly householdId: HouseholdId;
      readonly onboarding: "complete";
    }>
  >;
  createInvite(input: {
    readonly householdId: HouseholdId;
    readonly role: Exclude<HouseholdRole, "owner">;
    readonly expiresInHours: number;
  }): Promise<Result<HouseholdInvite>>;
  previewInvite(oneTimeCode: string): Promise<Result<HouseholdInviteReview>>;
  acceptInvite(oneTimeCode: string): Promise<Result<HouseholdMembership>>;
  getAccessSnapshot(
    householdId: HouseholdId,
  ): Promise<Result<HouseholdAccessSnapshot>>;
  changeMemberRole(input: {
    readonly householdId: HouseholdId;
    readonly membershipId: string;
    readonly expectedVersion: number;
    readonly role: Exclude<HouseholdRole, "owner">;
    readonly operationId: string;
  }): Promise<
    Result<{
      readonly receipt: HouseholdAccessMutationReceipt;
      readonly snapshot: HouseholdAccessSnapshot;
    }>
  >;
  revokeMember(input: {
    readonly householdId: HouseholdId;
    readonly membershipId: string;
    readonly expectedVersion: number;
    readonly operationId: string;
  }): Promise<
    Result<{
      readonly receipt: HouseholdAccessMutationReceipt;
      readonly snapshot: HouseholdAccessSnapshot;
    }>
  >;
  cancelInvite(input: {
    readonly householdId: HouseholdId;
    readonly inviteId: string;
    readonly expectedVersion: number;
    readonly operationId: string;
  }): Promise<
    Result<{
      readonly receipt: HouseholdAccessMutationReceipt;
      readonly snapshot: HouseholdAccessSnapshot;
    }>
  >;
  transferOwnership(input: {
    readonly householdId: HouseholdId;
    readonly targetMembershipId: string;
    readonly expectedOwnerVersion: number;
    readonly expectedTargetVersion: number;
    readonly operationId: string;
    readonly acknowledgeOwnerTransfer: true;
  }): Promise<
    Result<{
      readonly receipt: HouseholdAccessMutationReceipt;
      readonly snapshot: HouseholdAccessSnapshot;
    }>
  >;
}

/**
 * Reads the narrow server-confirmed cloud-usage projection for the selected
 * household. Authorization denial carries no household-existence or storage
 * metadata.
 */
export interface HouseholdStorageUsagePort {
  getUsage(
    householdId: HouseholdId,
    context?: ProviderRequestContext,
  ): Promise<Result<HouseholdStorageUsageResponse>>;
}

export interface AccountDeletionPort {
  deleteAccount(
    input: AccountDeletionRequest,
  ): Promise<Result<AccountDeletionReceipt>>;
}

export interface WorkspaceCommit<TSnapshot = JsonObject> {
  readonly expectedRevision: number;
  readonly nextRevision: number;
  readonly snapshot: TSnapshot;
  readonly operations: readonly SyncOperation[];
}

export interface WorkspaceSyncState {
  readonly cursor: SyncCursor;
  /**
   * Conflicts stay durable until a reviewed resolution flow replaces or
   * dismisses them.
   */
  readonly conflicts: readonly SyncConflict[];
}

/**
 * Advances the local snapshot, pull cursor, server-confirmed
 * acknowledgements and conflict ledger in one transaction.
 */
export interface WorkspaceSyncCommit<TSnapshot = JsonObject> {
  readonly expectedRevision: number;
  readonly nextRevision: number;
  readonly snapshot: TSnapshot;
  readonly cursor: SyncCursor;
  /**
   * New local operations created while reviewing a durable conflict. Keeping
   * these in the same transaction as the conflict ledger prevents a restart
   * from losing the reviewed resolution intent.
   */
  readonly operations?: readonly SyncOperation[];
  readonly acknowledgedOperationIds: readonly string[];
  readonly conflicts: readonly SyncConflict[];
}

export interface WorkspaceRepository<TSnapshot = JsonObject> {
  initialize(): Promise<void>;
  load(): Promise<{
    readonly revision: number;
    readonly snapshot: TSnapshot | null;
  }>;
  commit(
    commit: WorkspaceCommit<TSnapshot>,
  ): Promise<Result<{ readonly revision: number }>>;
  listPendingOperations(limit: number): Promise<readonly SyncOperation[]>;
  acknowledgeOperation(operationId: string): Promise<void>;
  loadSyncState(): Promise<WorkspaceSyncState>;
  commitSync(
    commit: WorkspaceSyncCommit<TSnapshot>,
  ): Promise<Result<{ readonly revision: number }>>;
}

export interface BinarySource {
  readonly byteSize: number;
  open(): Promise<AsyncIterable<Uint8Array>>;
}

export interface BlobWriteRequest {
  readonly blobObjectId: string;
  readonly householdId: HouseholdId;
  readonly mimeType: string;
  readonly checksumSha256: string;
  readonly source: BinarySource;
}

export interface BlobStore {
  put(request: BlobWriteRequest): Promise<Result<void>>;
  get(blobObjectId: string): Promise<Result<BinarySource>>;
  has(blobObjectId: string): Promise<boolean>;
  remove(blobObjectId: string): Promise<Result<void>>;
}

/**
 * Cancellation/deadline context for one provider boundary.
 *
 * Implementations must stop reading caller-owned buffers or file references
 * after `signal` aborts. `deadlineAtMs` is an absolute Unix timestamp and is a
 * second guard for runtimes whose fetch implementation does not propagate an
 * abort promptly. Implementations must settle their returned promise after
 * abort/finally cleanup; a never-settling provider blocks secure vault
 * transition by contract.
 */
export interface ProviderRequestContext {
  readonly signal: AbortSignal;
  readonly deadlineAtMs: number;
}

export interface SyncTransport {
  push(
    operations: readonly SyncOperation[],
    context?: ProviderRequestContext,
  ): Promise<
    Result<{
      readonly acknowledgedOperationIds: readonly string[];
      readonly conflicts: readonly SyncConflict[];
      readonly cursor: SyncCursor;
    }>
  >;
  pull(
    householdId: HouseholdId,
    cursor: SyncCursor,
    context?: ProviderRequestContext,
  ): Promise<
    Result<{
      readonly workspace: WorkspaceBootstrapDescriptor;
      readonly changes: readonly SyncChange[];
      readonly cursor: SyncCursor;
    }>
  >;
}

export interface SecureKeyStore {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface CaptureResult {
  readonly localUri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly capturedAt: IsoDateTime;
}

export interface CapturePort {
  takePhoto(): Promise<Result<CaptureResult>>;
  chooseImage(): Promise<Result<CaptureResult>>;
  chooseDocument(): Promise<Result<CaptureResult>>;
}

export interface LocationReading extends Coordinates {
  readonly horizontalAccuracyMeters: number | null;
  readonly observedAt: IsoDateTime;
}

export interface LocationPort {
  currentPosition(): Promise<Result<LocationReading>>;
  choosePin(initial: PlacePin | null): Promise<Result<PlacePin>>;
}

export interface NotificationRequest {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly scheduledAt: IsoDateTime;
  readonly deepLink: string | null;
}

export interface NotificationPort {
  schedule(request: NotificationRequest): Promise<Result<void>>;
  cancel(id: string): Promise<void>;
}

export interface AnalyticsPort {
  track(event: AnalyticsEvent): Promise<void>;
  flush(): Promise<Result<void>>;
}

export interface RenderedExport {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface ExportRenderer<TInput = JsonObject> {
  render(input: TInput): Promise<Result<RenderedExport, ContractError>>;
}
