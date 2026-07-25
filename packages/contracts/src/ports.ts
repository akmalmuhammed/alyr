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

export interface WorkspaceCommit<TSnapshot = JsonObject> {
  readonly expectedRevision: number;
  readonly nextRevision: number;
  readonly snapshot: TSnapshot;
  readonly operations: readonly SyncOperation[];
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

export interface SyncTransport {
  push(
    operations: readonly SyncOperation[],
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
  ): Promise<
    Result<{
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
