import type {
  ContractError,
  EvidenceId,
  HouseholdId,
  IsoDateTime,
  JsonObject,
  Result,
} from "./core.js";
import type { SyncChange, SyncConflict, SyncCursor, SyncOperation } from "./sync.js";

export const CONTRACT_API_VERSION = 1 as const;

export interface SyncPushRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly operations: readonly SyncOperation[];
}

export interface SyncPushResponse {
  readonly acknowledgedOperationIds: readonly string[];
  readonly conflicts: readonly SyncConflict[];
  readonly cursor: SyncCursor;
}

export interface SyncPullResponse {
  readonly changes: readonly SyncChange[];
  readonly cursor: SyncCursor;
}

export interface UploadIntentRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly householdId: HouseholdId;
  readonly evidenceId: EvidenceId;
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

export interface InviteAcceptRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly oneTimeCode: string;
}

export interface ExportCreateRequest {
  readonly apiVersion: typeof CONTRACT_API_VERSION;
  readonly householdId: HouseholdId;
  readonly format: "pdf" | "json-manifest";
  readonly assetIds: readonly string[];
  readonly redacted: boolean;
}

export interface ExportStatusResponse {
  readonly exportId: string;
  readonly status: "queued" | "processing" | "ready" | "failed" | "expired";
  readonly blobObjectId: string | null;
  readonly expiresAt: IsoDateTime | null;
  readonly error: ContractError | null;
}

export type ApiResult<T> = Result<T, ContractError>;
