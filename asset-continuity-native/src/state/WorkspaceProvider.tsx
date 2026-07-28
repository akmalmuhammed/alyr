import * as Crypto from "expo-crypto";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AppState } from "react-native";

import type {
  ContractError,
  HouseholdRole,
  JsonObject,
  LiabilityCreatePayload,
  LiabilityLifecyclePayload,
  LiabilityReviewPayload,
  LiabilityUpdatePayload,
  PermissionCapability,
  SyncConflict,
  SyncOperation,
  SyncTransport,
  ValueAssertionPayload
} from "@alyr/contracts";

import {
  hasHouseholdCapability,
  requireHouseholdCapabilities
} from "@/auth/capabilityPolicy";
import {
  createDefaultAttachmentStore,
  type AttachmentStore,
  type ScopedAttachmentStore
} from "@/data/attachmentStore";
import { createDefaultRepository } from "@/data/createRepository";
import {
  isLiabilitySyncConflict,
  isLiabilitySyncOperation,
  syncConflictsVisibleToRole,
  type ConflictResolutionChoice
} from "@/data/conflictInbox";
import { resolveDurableSyncConflict } from "@/data/conflictResolution";
import {
  reconcileForeground,
  type ForegroundSyncResult
} from "@/data/foregroundSync";
import type { EvidenceDownloadPort } from "@/data/evidenceDownload";
import type { EvidenceUploadPort } from "@/data/evidenceUpload";
import {
  defaultInstallationDeviceIdentity,
  InstallationDeviceIdentityError,
  isValidInstallationDeviceId,
  type InstallationDeviceIdentity
} from "@/data/installationDeviceIdentity";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type { NativeWorkspaceRepository } from "@/data/repository";
import { createLocalOperation } from "@/data/sync";
import {
  deriveAuthenticatedVaultScope,
  DEVICE_PREVIEW_VAULT_SCOPE,
  type VaultScope
} from "@/data/vaultScope";
import type {
  AssetLifecycleInput,
  EvidenceReviewInput,
  LanguageCode,
  NativeAsset,
  NativeEvidence,
  NativeLiability,
  NativeLiabilityReview,
  NativePlace,
  NativePlaceDocument,
  NativeRoom,
  NativeWorkspace,
  ExistingAssetUpdateInput,
  NewAssetInput,
  NewPlaceDocumentInput,
  NewPlaceInput,
  NewPlaceSpaceInput,
  UpdatePlaceBasicsInput,
  UpdatePlacePinInput,
  UpdatePlaceSpaceInput,
  WorkspaceMode
} from "@/domain/model";
import { isNativeWorkspace } from "@/domain/model";
import {
  confirmNoLiabilities as confirmNoLiabilitiesInWorkspace,
  createLiability as createLiabilityInWorkspace,
  deleteLiability as deleteLiabilityInWorkspace,
  getLiabilities,
  getLiabilityReview,
  setLiabilityLifecycle as setLiabilityLifecycleInWorkspace,
  updateLiability as updateLiabilityInWorkspace,
  type LiabilityLifecycleInput,
  type LiabilityMutationResult,
  type LiabilityReviewMutationResult,
  type NewLiabilityInput,
  type UpdateLiabilityInput
} from "@/domain/liabilities";
import {
  getPortfolioValueRecords,
  portfolioValueSubject,
  recordPortfolioValue as recordPortfolioValueInWorkspace,
  type PortfolioValueInput,
  type PortfolioValueInputBase,
  type PortfolioValueRecord
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import {
  addAsset,
  addPlace,
  addPlaceDocument,
  addPlaceSpace,
  type MutationContext,
  recordRetrieval,
  renameHousehold,
  setAssetLifecycle as setAssetLifecycleRecord,
  setEvidenceReviewStatus as setEvidenceReviewStatusRecord,
  setWorkspaceLanguage,
  updatePlaceBasics as updatePlaceBasicsRecord,
  updatePlacePin as updatePlacePinRecord,
  updatePlaceSpace as updatePlaceSpaceRecord,
  updateAsset as updateAssetRecord,
  type AssetUpdateMutationResult,
  type AssetLifecycleMutationResult,
  type EvidenceReviewMutationResult,
  type PlaceDocumentMutationResult,
  type PlaceSpaceMutationResult,
  type PlaceUpdateMutationResult
} from "@/domain/workspace";
import {
  createSignedRecoveryJourneyRuntime,
  RecoveryJourneyProvider
} from "@/recovery";
import {
  isSessionPreview,
  runtimeProfile
} from "@/runtime/environment";
import { createPersonalWorkspaceReplacement } from "@/state/sampleConversion";

interface RepositoryInfo {
  readonly kind: NativeWorkspaceRepository["kind"];
  readonly durable: boolean;
  readonly encryptedAtRest: boolean;
}

export interface WorkspaceSyncRuntimeState {
  readonly status:
    | "local-only"
    | "idle"
    | "syncing"
    | "offline"
    | "needs-attention";
  readonly conflicts: readonly SyncConflict[];
  readonly lastError: ContractError | null;
  readonly lastAttemptAt: string | null;
  readonly lastSyncedAt: string | null;
}

interface PendingOperationCounts {
  readonly total: number;
  readonly liability: number;
}

export function pendingOperationCountVisibleToRole(
  counts: PendingOperationCounts,
  role: HouseholdRole | null
): number {
  return hasHouseholdCapability(role, "liability.read")
    ? counts.total
    : Math.max(0, counts.total - counts.liability);
}

/**
 * Projects owner-only conflict signals out of render state without mutating
 * the durable conflict inbox. When the sole attention reason is a hidden
 * Liability conflict, the visible status/error return to the role-appropriate
 * baseline rather than revealing that private activity exists.
 */
export function syncRuntimeVisibleToRole(
  sync: WorkspaceSyncRuntimeState,
  workspace: NativeWorkspace | null,
  role: HouseholdRole | null,
  fallbackStatus: "idle" | "local-only"
): WorkspaceSyncRuntimeState {
  if (hasHouseholdCapability(role, "liability.read")) {
    return sync;
  }
  const conflicts = syncConflictsVisibleToRole(
    sync.conflicts,
    workspace,
    false
  );
  const hidesLiabilityConflict =
    conflicts.length !== sync.conflicts.length;
  const liabilityOnlyAttention =
    hidesLiabilityConflict &&
    conflicts.length === 0 &&
    sync.status === "needs-attention";
  return {
    ...sync,
    status: liabilityOnlyAttention ? fallbackStatus : sync.status,
    conflicts,
    // A runtime error is not typed to one conflict. Once any owner-only
    // conflict is projected out, retaining the raw message could disclose its
    // record name or value alongside an otherwise visible Asset conflict.
    lastError: hidesLiabilityConflict ? null : sync.lastError
  };
}

export interface WorkspaceBootstrapRuntimeState {
  readonly status:
    | "locked"
    | "opening"
    | "pulling"
    | "ready"
    | "retryable-error"
    | "access-revoked"
    | "error";
  readonly lastError: ContractError | null;
}

export interface WorkspaceContextValue {
  readonly workspace: NativeWorkspace | null;
  readonly liabilities: readonly NativeLiability[];
  readonly liabilityReview: NativeLiabilityReview | null;
  readonly recordedPortfolioValues: readonly PortfolioValueRecord[];
  /** @deprecated Use recordedPortfolioValues. Kept for route compatibility. */
  readonly recordedAssetValues: readonly PortfolioValueRecord[];
  readonly loading: boolean;
  readonly saving: boolean;
  readonly storageReady: boolean;
  /**
   * The attachment vault opened for the current account + household only.
   * `null` is a deliberate locked/transition state; consumers must not create
   * an unscoped fallback when this value is absent.
   */
  readonly attachmentStore: ScopedAttachmentStore | null;
  readonly error: string | null;
  readonly repository: RepositoryInfo;
  readonly pendingOperationCount: number;
  readonly bootstrap: WorkspaceBootstrapRuntimeState;
  readonly sync: WorkspaceSyncRuntimeState;
  /**
   * Provider-authoritative role for the active household. Preview sessions
   * deliberately act as owners; a missing signed role is fail-closed.
   */
  readonly permissionRole: HouseholdRole | null;
  readonly can: (capability: PermissionCapability) => boolean;
  readonly retryBootstrap: () => Promise<void>;
  readonly syncNow: () => Promise<void>;
  readonly resolveSyncConflict: (
    operationId: string,
    choice: Exclude<ConflictResolutionChoice, "review-manually">
  ) => Promise<"cloud-kept" | "local-reapply-queued">;
  readonly startWorkspace: (mode: WorkspaceMode) => Promise<void>;
  readonly createPlace: (input: NewPlaceInput) => Promise<NativePlace>;
  readonly updatePlaceBasics: (
    input: UpdatePlaceBasicsInput
  ) => Promise<NativePlace>;
  readonly createPlaceSpace: (
    input: NewPlaceSpaceInput
  ) => Promise<NativeRoom>;
  readonly updatePlaceSpace: (
    input: UpdatePlaceSpaceInput
  ) => Promise<NativeRoom>;
  readonly addPlaceDocument: (
    input: NewPlaceDocumentInput
  ) => Promise<NativePlaceDocument>;
  readonly updatePlacePin: (
    input: UpdatePlacePinInput
  ) => Promise<NativePlace>;
  readonly createAsset: (input: NewAssetInput) => Promise<NativeAsset>;
  readonly updateAsset: (
    input: ExistingAssetUpdateInput
  ) => Promise<NativeAsset>;
  readonly recordAssetValue: (
    input: PortfolioValueInput
  ) => Promise<PortfolioValueRecord>;
  readonly recordPortfolioValue: (
    input: PortfolioValueInput
  ) => Promise<PortfolioValueRecord>;
  readonly createLiability: (
    input: NewLiabilityInput & PortfolioValueInputBase
  ) => Promise<NativeLiability>;
  readonly updateLiability: (
    input: UpdateLiabilityInput
  ) => Promise<NativeLiability>;
  readonly setLiabilityLifecycle: (
    input: LiabilityLifecycleInput
  ) => Promise<NativeLiability>;
  readonly deleteLiability: (liabilityId: string) => Promise<void>;
  readonly confirmNoLiabilities: (
    reviewedAt: string
  ) => Promise<NativeLiabilityReview>;
  readonly setAssetLifecycle: (
    input: AssetLifecycleInput
  ) => Promise<NativeAsset>;
  readonly setEvidenceReviewStatus: (
    input: EvidenceReviewInput
  ) => Promise<NativeEvidence>;
  readonly markRetrieved: (assetId: string) => Promise<void>;
  readonly changeLanguage: (language: LanguageCode) => Promise<void>;
  readonly renameHousehold: (name: string) => Promise<void>;
  readonly replaceWithPersonalWorkspace: () => Promise<void>;
  /**
   * Permanently removes the active scoped database, attachment files and keys.
   * Preview reset reopens an empty scope; confirmed cloud account deletion
   * keeps the scope locked until the session boundary unmounts.
   */
  readonly purgeActiveVault: (options?: {
    readonly reopenEmptyPreview?: boolean;
  }) => Promise<void>;
  readonly exportReadableSnapshot: () => string | null;
  readonly clearError: () => void;
}

export type WorkspaceVaultAccess =
  | { readonly kind: "preview" }
  | {
      readonly kind: "authenticated";
      readonly accountId: string;
      readonly householdId: string;
      readonly role: HouseholdRole;
    };

export interface WorkspaceVaultResourceFactory {
  createRepository(scope: VaultScope): Promise<NativeWorkspaceRepository>;
  createAttachmentStore(scope: VaultScope): ScopedAttachmentStore;
}

/**
 * Liability records are owner-only in the pilot. Keep the authoritative
 * encrypted snapshot intact for sync, but project a redacted workspace into
 * UI/export surfaces for every other role. This also covers a rare ownership
 * transfer on a device that still holds the former owner's cached snapshot.
 */
export function workspaceVisibleToRole(
  workspace: NativeWorkspace,
  role: HouseholdRole | null
): NativeWorkspace {
  if (hasHouseholdCapability(role, "liability.read")) {
    return workspace;
  }
  const {
    liabilityReview: _liabilityReview,
    liabilityTombstones: _liabilityTombstones,
    liabilities: _liabilities,
    ...continuityWorkspace
  } = workspace;
  return {
    ...continuityWorkspace,
    liabilities: [],
    liabilityTombstones: [],
    portfolioValueRecords: getPortfolioValueRecords(workspace).filter(
      (record) => portfolioValueSubject(record)?.kind !== "liability"
    )
  };
}

interface WorkspaceProviderProps extends PropsWithChildren {
  readonly repositoryOverride?: NativeWorkspaceRepository;
  readonly attachmentStoreOverride?: ScopedAttachmentStore;
  /**
   * `undefined` preserves the existing preview/test behavior. `null` is a
   * deliberate locked state used by a signed runtime before account and
   * household selection.
   */
  readonly vaultAccess?: WorkspaceVaultAccess | null;
  readonly resourceFactory?: WorkspaceVaultResourceFactory;
  readonly syncTransport?: SyncTransport | null;
  readonly evidenceUploadPort?: EvidenceUploadPort | null;
  readonly evidenceDownloadPort?: EvidenceDownloadPort | null;
  /**
   * Test/runtime seam for the installation-scoped device identifier. Signed
   * builds use the SecureStore-backed default; preview runtimes use one
   * deterministic in-memory identity for the process.
   */
  readonly installationDeviceIdentity?: InstallationDeviceIdentity;
}

const fallbackRepository = new MemoryWorkspaceRepository(
  DEVICE_PREVIEW_VAULT_SCOPE
);
const defaultResourceFactory: WorkspaceVaultResourceFactory = {
  createRepository: createDefaultRepository,
  createAttachmentStore: createDefaultAttachmentStore
};
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export async function vaultScopeForWorkspaceAccess(
  access: WorkspaceVaultAccess
): Promise<VaultScope> {
  return access.kind === "preview"
    ? DEVICE_PREVIEW_VAULT_SCOPE
    : deriveAuthenticatedVaultScope(access.accountId, access.householdId);
}

function id(_prefix: string): string {
  try {
    return Crypto.randomUUID();
  } catch {
    // Web previews served over a LAN IP may expose cryptographic random bytes
    // without exposing `crypto.randomUUID()`. Keep IDs random and RFC 4122
    // shaped so the same preview can be tested from another device.
    const bytes = Crypto.getRandomBytes(16);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join("")
    ].join("-");
  }
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const mutationContext: MutationContext = { id, now };

function createAssetOperations(
  workspace: NativeWorkspace,
  asset: NativeAsset,
  evidence: readonly NativeEvidence[],
  occurredAt: string
): SyncOperation[] {
  const operations: SyncOperation[] = [
    createLocalOperation(workspace, {
      type: "asset.create",
      aggregateId: asset.id,
      payload: {
        name: asset.name,
        categoryId: asset.categoryId,
        categoryPath: asset.categoryId.split("."),
        importance: "ordinary",
        profile: {}
      },
      operationId: id("operation"),
      idempotencyKey: id("idempotency"),
      observedVersion: 0,
      occurredAt
    }),
    createLocalOperation(workspace, {
      type: "asset.move",
      aggregateId: asset.id,
      payload: {
        assignmentId: id("location-revision"),
        placeId: asset.placeId,
        spaceId: asset.roomId,
        status: asset.locationStatus,
        locationDetail: asset.locatorText,
        source: "user"
      },
      operationId: id("operation"),
      idempotencyKey: id("idempotency"),
      observedVersion: 0,
      occurredAt
    })
  ];

  for (const item of evidence) {
    operations.push(
      createLocalOperation(workspace, {
        type: "evidence.create",
        aggregateId: item.id,
        payload: {
          assetId: item.assetId,
          kind: item.kind,
          relation: item.relation,
          title: item.fileName,
          storageState: "on-device"
        },
        operationId: id("operation"),
        idempotencyKey: id("idempotency"),
        observedVersion: 0,
        occurredAt
      })
    );

    if (
      item.checksumSha256 &&
      /^[a-f0-9]{64}$/u.test(item.checksumSha256) &&
      item.byteSize > 0
    ) {
      operations.push(
        createLocalOperation(workspace, {
          type: "evidence.version.add",
          aggregateId: item.versionId,
          payload: {
            evidenceId: item.id,
            blobObjectId: item.blobObjectId,
            fileName: item.fileName,
            mimeType: item.mimeType,
            byteSize: item.byteSize,
            checksumSha256: item.checksumSha256
          },
          operationId: id("operation"),
          idempotencyKey: id("idempotency"),
          observedVersion: 0,
          occurredAt,
          prerequisites: [
            {
              kind: "blob-stored",
              blobObjectId: item.blobObjectId
            }
          ]
        })
      );
    }
  }

  return operations;
}

export function createPlaceDocumentOperations(
  workspace: NativeWorkspace,
  document: NativePlaceDocument,
  occurredAt: string,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation[] {
  const operations: SyncOperation[] = [
    createLocalOperation(workspace, {
      type: "place-document.create",
      aggregateId: document.id,
      payload: {
        placeId: document.placeId,
        kind: document.kind ?? "paper",
        relation: document.relation ?? "other",
        title: document.fileName
      },
      operationId: identity.operationId(),
      idempotencyKey: identity.idempotencyKey(),
      observedVersion: 0,
      occurredAt
    })
  ];

  if (
    document.checksumSha256 &&
    /^[a-f0-9]{64}$/u.test(document.checksumSha256) &&
    document.byteSize > 0
  ) {
    operations.push(
      createLocalOperation(workspace, {
        type: "place-document.version.add",
        aggregateId: document.versionId,
        payload: {
          placeDocumentId: document.id,
          blobObjectId: document.blobObjectId,
          fileName: document.fileName,
          mimeType: document.mimeType,
          byteSize: document.byteSize,
          checksumSha256: document.checksumSha256
        },
        operationId: identity.operationId(),
        idempotencyKey: identity.idempotencyKey(),
        observedVersion: document.documentVersionNumber ?? 0,
        occurredAt,
        prerequisites: [
          {
            kind: "blob-stored",
            blobObjectId: document.blobObjectId
          }
        ]
      })
    );
  }

  return operations;
}

export function createPlacePinUpdateOperation(
  workspace: NativeWorkspace,
  result: PlaceUpdateMutationResult,
  occurredAt: string,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  return createLocalOperation(workspace, {
    type: "place.update",
    aggregateId: result.place.id,
    payload: {
      latitude: result.place.latitude,
      longitude: result.place.longitude,
      locationSource: result.place.locationSource,
      locationPrecision: result.place.precision,
      horizontalAccuracyM: result.place.horizontalAccuracyMeters,
      observedAt: result.place.observedAt,
      confirmedAt: result.place.confirmedAt
    },
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: Math.max(1, result.previousPlace.version ?? 1),
    occurredAt
  });
}

export function createPlaceBasicsUpdateOperation(
  workspace: NativeWorkspace,
  result: PlaceUpdateMutationResult,
  occurredAt: string,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  return createLocalOperation(workspace, {
    type: "place.update",
    aggregateId: result.place.id,
    payload: {
      name: result.place.name,
      regionLabel: result.place.regionLabel,
      addressSummary: result.place.addressSummary,
      kind: result.place.kind ?? "unknown",
      tenure: result.place.tenure ?? "unknown"
    },
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: Math.max(1, result.previousPlace.version),
    occurredAt
  });
}

export function createAssetLifecycleOperation(
  workspace: NativeWorkspace,
  result: AssetLifecycleMutationResult,
  occurredAt: string,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  return createLocalOperation(workspace, {
    type:
      result.asset.lifecycleStatus === "archived"
        ? "asset.archive"
        : "asset.restore",
    aggregateId: result.asset.id,
    payload: {
      lifecycleStatus: result.asset.lifecycleStatus,
      archivedAt: result.asset.archivedAt
    },
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: Math.max(1, result.previousAsset.version ?? 1),
    occurredAt
  });
}

export function createEvidenceReviewOperation(
  workspace: NativeWorkspace,
  result: EvidenceReviewMutationResult,
  occurredAt: string,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  return createLocalOperation(workspace, {
    type: "evidence.review",
    aggregateId: result.evidence.id,
    payload: {
      reviewStatus: result.evidence.reviewStatus,
      reviewedAt: result.evidence.reviewedAt
    },
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: Math.max(1, result.previousEvidence.version ?? 1),
    occurredAt
  });
}

export function createPortfolioValueOperation(
  workspace: NativeWorkspace,
  record: PortfolioValueRecord,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  const subject = portfolioValueSubject(record);
  if (!subject) {
    throw new Error("Choose one item, property or liability.");
  }
  const payload: ValueAssertionPayload = {
    ...(subject.kind === "asset"
      ? { assetId: subject.assetId }
      : subject.kind === "place"
        ? { placeId: subject.placeId }
        : { liabilityId: subject.liabilityId }),
    amountMinor: record.amountMinor,
    currency: record.currency,
    asOf: record.asOf,
    source: record.source
  };
  return createLocalOperation(workspace, {
    type: "value.create",
    aggregateId: record.id,
    payload,
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: 0,
    occurredAt: record.updatedAt
  });
}

export function createLiabilityOperation(
  workspace: NativeWorkspace,
  result: LiabilityMutationResult,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  const creating = result.previousLiability === null;
  const payload: LiabilityCreatePayload | LiabilityUpdatePayload =
    creating
      ? {
          name: result.liability.name,
          kind: result.liability.kind
        }
      : {
          name: result.liability.name,
          kind: result.liability.kind
        };
  return createLocalOperation(workspace, {
    type: creating ? "liability.create" : "liability.update",
    aggregateId: result.liability.id,
    payload,
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: creating
      ? 0
      : result.previousLiability!.version,
    occurredAt: result.liability.updatedAt
  });
}

export function createLiabilityLifecycleOperation(
  workspace: NativeWorkspace,
  result: LiabilityMutationResult,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  if (!result.previousLiability) {
    throw new Error("A Liability lifecycle change needs a prior version.");
  }
  const payload: LiabilityLifecyclePayload = {
    lifecycle: result.liability.lifecycleStatus,
    archivedAt: result.liability.archivedAt
  };
  return createLocalOperation(workspace, {
    type:
      result.liability.lifecycleStatus === "archived"
        ? "liability.archive"
        : "liability.restore",
    aggregateId: result.liability.id,
    payload,
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: result.previousLiability.version,
    occurredAt: result.liability.updatedAt
  });
}

export function createLiabilityDeleteOperation(
  workspace: NativeWorkspace,
  liability: NativeLiability,
  occurredAt: string,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  return createLocalOperation(workspace, {
    type: "liability.delete",
    aggregateId: liability.id,
    payload: {
      name: liability.name,
      kind: liability.kind
    },
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: liability.version,
    occurredAt
  });
}

export function createLiabilityReviewOperation(
  workspace: NativeWorkspace,
  result: LiabilityReviewMutationResult,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  const payload: LiabilityReviewPayload = {
    status: result.review.status,
    reviewedAt: result.review.reviewedAt,
    expiresAt: result.review.expiresAt
  };
  return createLocalOperation(workspace, {
    type: "liability-review.set",
    aggregateId: result.review.id,
    payload,
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: result.previousReview?.version ?? 0,
    occurredAt: result.review.updatedAt
  });
}

export function createPlaceSpaceOperation(
  workspace: NativeWorkspace,
  result: PlaceSpaceMutationResult,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  return createLocalOperation(workspace, {
    type: "space.create",
    aggregateId: result.room.id,
    payload: {
      placeId: result.place.id,
      parentSpaceId: result.room.parentRoomId,
      name: result.room.name,
      kind: result.room.kind,
      ordinal: result.place.rooms.findIndex(
        (room) => room.id === result.room.id
      )
    },
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: 0,
    occurredAt: result.place.updatedAt
  });
}

export function createPlaceSpaceUpdateOperation(
  workspace: NativeWorkspace,
  result: PlaceSpaceMutationResult,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency")
  }
): SyncOperation {
  const previousRoom = result.previousPlace.rooms.find(
    (room) => room.id === result.room.id
  );
  if (!previousRoom) {
    throw new Error("The previous space version is unavailable.");
  }
  if (
    !Number.isSafeInteger(previousRoom.version) ||
    previousRoom.version < 1
  ) {
    throw new Error(
      "Sync this Place before editing a space from an older local snapshot."
    );
  }
  return createLocalOperation(workspace, {
    type: "space.update",
    aggregateId: result.room.id,
    payload: {
      placeId: result.place.id,
      parentSpaceId: result.room.parentRoomId,
      name: result.room.name,
      kind: result.room.kind,
      ordinal: result.place.rooms.findIndex(
        (room) => room.id === result.room.id
      )
    },
    operationId: identity.operationId(),
    idempotencyKey: identity.idempotencyKey(),
    observedVersion: previousRoom.version,
    occurredAt: result.place.updatedAt
  });
}

export function createAssetUpdateOperations(
  workspace: NativeWorkspace,
  result: AssetUpdateMutationResult,
  occurredAt: string,
  identity: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
    readonly locationRevisionId: () => string;
  } = {
    operationId: () => id("operation"),
    idempotencyKey: () => id("idempotency"),
    locationRevisionId: () => id("location-revision")
  }
): SyncOperation[] {
  const operations: SyncOperation[] = [];

  for (const item of result.newEvidence) {
    operations.push(
      createLocalOperation(workspace, {
        type: "evidence.create",
        aggregateId: item.id,
        payload: {
          assetId: item.assetId,
          kind: item.kind,
          relation: item.relation,
          title: item.fileName,
          storageState: "on-device"
        },
        operationId: identity.operationId(),
        idempotencyKey: identity.idempotencyKey(),
        observedVersion: 0,
        occurredAt
      })
    );

    if (
      item.checksumSha256 &&
      /^[a-f0-9]{64}$/u.test(item.checksumSha256) &&
      item.byteSize > 0
    ) {
      operations.push(
        createLocalOperation(workspace, {
          type: "evidence.version.add",
          aggregateId: item.versionId,
          payload: {
            evidenceId: item.id,
            blobObjectId: item.blobObjectId,
            fileName: item.fileName,
            mimeType: item.mimeType,
            byteSize: item.byteSize,
            checksumSha256: item.checksumSha256
          },
          operationId: identity.operationId(),
          idempotencyKey: identity.idempotencyKey(),
          observedVersion: 0,
          occurredAt,
          prerequisites: [
            {
              kind: "blob-stored",
              blobObjectId: item.blobObjectId
            }
          ]
        })
      );
    }
  }

  const nameChanged =
    result.asset.name !== result.previousAsset.name;
  if (nameChanged) {
    operations.push(
      createLocalOperation(workspace, {
        type: "asset.update",
        aggregateId: result.asset.id,
        payload: {
          name: result.asset.name
        },
        operationId: identity.operationId(),
        idempotencyKey: identity.idempotencyKey(),
        observedVersion: Math.max(
          1,
          result.previousAsset.version ?? 1
        ),
        occurredAt
      })
    );
  }

  if (result.changes.location) {
    operations.push(
      createLocalOperation(workspace, {
        type: "asset.move",
        aggregateId: result.asset.id,
        payload: {
          assignmentId: identity.locationRevisionId(),
          placeId: result.asset.placeId,
          spaceId: result.asset.roomId,
          status: result.asset.locationStatus,
          locationDetail: result.asset.locatorText,
          source: "user"
        },
        operationId: identity.operationId(),
        idempotencyKey: identity.idempotencyKey(),
        observedVersion: Math.max(
          0,
          result.previousAsset.locationRevisionVersion ?? 0
        ),
        occurredAt
      })
    );
  }

  return operations;
}

export async function prepareExistingAssetUpdate(
  workspace: NativeWorkspace,
  input: ExistingAssetUpdateInput,
  attachmentStore: AttachmentStore,
  context: MutationContext,
  occurredAt: string,
  operationIdentity?: {
    readonly operationId: () => string;
    readonly idempotencyKey: () => string;
    readonly locationRevisionId: () => string;
  }
): Promise<{
  readonly result: AssetUpdateMutationResult;
  readonly operations: readonly SyncOperation[];
}> {
  const [protectedPhoto, protectedEvidence] = await Promise.all([
    input.photo
      ? attachmentStore.ingest(input.photo)
      : Promise.resolve(undefined),
    input.evidence
      ? attachmentStore.ingest(input.evidence)
      : Promise.resolve(undefined)
  ]);
  const localResult = updateAssetRecord(
    workspace,
    {
      ...input,
      ...(protectedPhoto ? { photo: protectedPhoto } : {}),
      ...(protectedEvidence ? { evidence: protectedEvidence } : {})
    },
    context
  );
  const supportedNameChange =
    localResult.asset.name !== localResult.previousAsset.name;
  const authoritativeVersion =
    Math.max(1, localResult.previousAsset.version ?? 1) +
    (supportedNameChange ? 1 : 0) +
    (localResult.changes.location ? 1 : 0);
  const locationRevisionVersion =
    Math.max(
      0,
      localResult.previousAsset.locationRevisionVersion ?? 0
    ) + (localResult.changes.location ? 1 : 0);
  const localOnlyFields = new Set(
    localResult.previousAsset.localOnlyFields ?? []
  );
  if (
    localResult.changes.identity &&
    localResult.asset.categoryId !==
      localResult.previousAsset.categoryId
  ) {
    localOnlyFields.add("category");
  }
  if (localResult.changes.photo) {
    localOnlyFields.add("primary-photo");
  }
  const authoritativeAsset: NativeAsset =
    localResult.workspace === workspace
      ? localResult.asset
      : {
          ...localResult.asset,
          version: authoritativeVersion,
          locationRevisionVersion,
          ...(localOnlyFields.size > 0
            ? { localOnlyFields: [...localOnlyFields] }
            : {})
        };
  const result: AssetUpdateMutationResult =
    localResult.workspace === workspace
      ? localResult
      : {
          ...localResult,
          asset: authoritativeAsset,
          workspace: {
            ...localResult.workspace,
            assets: localResult.workspace.assets.map((asset) =>
              asset.id === authoritativeAsset.id
                ? authoritativeAsset
                : asset
            )
          }
        };
  return {
    result,
    operations:
      workspace.mode === "sample" || result.workspace === workspace
        ? []
        : createAssetUpdateOperations(
            workspace,
            result,
            occurredAt,
            operationIdentity
          )
  };
}

export async function preparePlaceDocumentAddition(
  workspace: NativeWorkspace,
  input: NewPlaceDocumentInput,
  attachmentStore: AttachmentStore,
  context: MutationContext
): Promise<PlaceDocumentMutationResult> {
  const place = workspace.places.find(
    (item) =>
      item.id === input.placeId &&
      item.householdId === workspace.household.id
  );
  if (!place) {
    throw new Error("This Place is not available in the current household.");
  }
  if (
    !input.file.localUri ||
    !input.file.fileName.trim() ||
    input.file.fileName.trim().length > 180 ||
    !input.file.mimeType.trim() ||
    input.file.mimeType.trim().length > 120 ||
    !Number.isSafeInteger(input.file.byteSize) ||
    input.file.byteSize < 0 ||
    input.file.byteSize > 10 * 1024 * 1024
  ) {
    throw new Error("Choose a valid Place document up to 10 MB.");
  }
  const protectedFile = await attachmentStore.ingest(input.file);
  return addPlaceDocument(
    workspace,
    { ...input, file: protectedFile },
    context
  );
}

export function WorkspaceProvider({
  children,
  repositoryOverride,
  attachmentStoreOverride,
  vaultAccess,
  resourceFactory = defaultResourceFactory,
  syncTransport = null,
  evidenceUploadPort = null,
  evidenceDownloadPort = null,
  installationDeviceIdentity = defaultInstallationDeviceIdentity
}: WorkspaceProviderProps) {
  const resolvedVaultAccess: WorkspaceVaultAccess | null =
    vaultAccess === undefined ? { kind: "preview" } : vaultAccess;
  const accessKind = resolvedVaultAccess?.kind ?? "locked";
  const accountId =
    resolvedVaultAccess?.kind === "authenticated"
      ? resolvedVaultAccess.accountId
      : null;
  const boundHouseholdId =
    resolvedVaultAccess?.kind === "authenticated"
      ? resolvedVaultAccess.householdId
      : null;
  const permissionRole: HouseholdRole | null =
    resolvedVaultAccess?.kind === "preview"
      ? "owner"
      : resolvedVaultAccess?.kind === "authenticated"
        ? resolvedVaultAccess.role
        : null;
  const vaultBindingKey = JSON.stringify([
    accessKind,
    accountId,
    boundHouseholdId,
    permissionRole
  ]);
  const [workspace, setWorkspace] = useState<NativeWorkspace | null>(null);
  const [loading, setLoading] = useState(resolvedVaultAccess !== null);
  const [saving, setSaving] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOperationCounts, setPendingOperationCounts] =
    useState<PendingOperationCounts>({
      total: 0,
      liability: 0
    });
  const [bootstrap, setBootstrap] =
    useState<WorkspaceBootstrapRuntimeState>({
      status: resolvedVaultAccess === null ? "locked" : "opening",
      lastError: null
    });
  const [sync, setSync] = useState<WorkspaceSyncRuntimeState>({
    status:
      syncTransport && accessKind === "authenticated"
        ? "idle"
        : "local-only",
    conflicts: [],
    lastError: null,
    lastAttemptAt: null,
    lastSyncedAt: null
  });
  const [repository, setRepository] = useState<NativeWorkspaceRepository>(
    repositoryOverride ?? fallbackRepository
  );
  const [openedAttachmentStore, setOpenedAttachmentStore] = useState<{
    readonly bindingKey: string;
    readonly store: ScopedAttachmentStore;
  } | null>(null);
  const [resourceEpoch, setResourceEpoch] = useState(0);

  const repositoryRef = useRef<NativeWorkspaceRepository>(
    repositoryOverride ?? fallbackRepository
  );
  const workspaceRef = useRef<NativeWorkspace | null>(null);
  const revisionRef = useRef(0);
  const storageReadyRef = useRef(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const attachmentStoreRef = useRef<ScopedAttachmentStore | null>(null);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const syncRequestedRef = useRef(false);
  const mountedRef = useRef(true);
  const vaultGenerationRef = useRef(0);
  const installationDeviceIdRef = useRef<string | null>(null);

  const requireOpenAttachmentStore = useCallback((): ScopedAttachmentStore => {
    const activeStore = attachmentStoreRef.current;
    if (!storageReadyRef.current || !activeStore) {
      throw new Error(
        "The household attachment vault is locked. Nothing was opened or saved."
      );
    }
    return activeStore;
  }, []);

  const can = useCallback(
    (capability: PermissionCapability): boolean =>
      hasHouseholdCapability(permissionRole, capability),
    [permissionRole]
  );

  const requireCapabilities = useCallback(
    (...capabilities: readonly PermissionCapability[]): void => {
      requireHouseholdCapabilities(permissionRole, capabilities);
    },
    [permissionRole]
  );

  const refreshPendingCount = useCallback(
    async (activeRepository: NativeWorkspaceRepository) => {
      const operations = await activeRepository.listPendingOperations(1000);
      setPendingOperationCounts({
        total: operations.length,
        liability: operations.filter((operation) =>
          isLiabilitySyncOperation(
            operation,
            workspaceRef.current
          )
        ).length
      });
    },
    []
  );

  useEffect(
    () => () => {
      mountedRef.current = false;
      vaultGenerationRef.current += 1;
    },
    []
  );

  const publishSyncResult = useCallback(
    async (
      result: ForegroundSyncResult,
      generation: number,
      activeRepository: NativeWorkspaceRepository
    ): Promise<void> => {
      if (
        !mountedRef.current ||
        generation !== vaultGenerationRef.current
      ) {
        return;
      }
      const accessRevoked =
        result.kind === "needs-attention" &&
        (result.error.code === "AUTHORIZATION_DENIED" ||
          result.error.code === "NOT_FOUND");
      if (accessRevoked) {
        // Keep the encrypted files intact for a possible server-side access
        // correction, but immediately remove the stale household from every
        // render and protected route.
        workspaceRef.current = null;
        setWorkspace(null);
        setBootstrap({
          status: "access-revoked",
          lastError: result.error
        });
      } else if (result.workspace) {
        revisionRef.current = result.revision;
        workspaceRef.current = result.workspace;
        setWorkspace(result.workspace);
        setBootstrap({ status: "ready", lastError: null });
      } else if (result.kind === "offline") {
        setBootstrap({
          status: "retryable-error",
          lastError: result.error
        });
      } else if (result.kind === "needs-attention") {
        setBootstrap({
          status:
            result.error.retryable
              ? "retryable-error"
              : "error",
          lastError: result.error
        });
      }
      await refreshPendingCount(activeRepository);
      if (
        !mountedRef.current ||
        generation !== vaultGenerationRef.current
      ) {
        return;
      }
      if (result.kind === "synced") {
        setSync({
          status:
            result.conflicts.length > 0
              ? "needs-attention"
              : "idle",
          conflicts: result.conflicts,
          lastError: null,
          lastAttemptAt: now(),
          lastSyncedAt: result.workspace.lastSyncedAt
        });
      } else if (result.kind === "idle") {
        setSync((current) => ({
          ...current,
          status: "idle",
          conflicts: result.conflicts,
          lastError: null,
          lastAttemptAt: now()
        }));
      } else {
        setSync({
          status: result.kind,
          conflicts: result.conflicts,
          lastError: result.error,
          lastAttemptAt: now(),
          lastSyncedAt: result.workspace?.lastSyncedAt ?? null
        });
      }
    },
    [refreshPendingCount]
  );

  const runForegroundSync = useCallback(async (): Promise<void> => {
    if (
      !syncTransport ||
      accessKind !== "authenticated" ||
      !boundHouseholdId ||
      !storageReadyRef.current
    ) {
      if (mountedRef.current) {
        if (
          accessKind === "authenticated" &&
          workspaceRef.current === null
        ) {
          const unavailable: ContractError = {
            errorVersion: 1,
            code: "STORAGE_UNAVAILABLE",
            message:
              "Cloud restore is not configured for this signed build.",
            retryable: true
          };
          setBootstrap({
            status: "retryable-error",
            lastError: unavailable
          });
        }
        setSync((current) => ({
          ...current,
          status: "local-only",
          lastError: null
        }));
      }
      return;
    }
    const installationDeviceId = installationDeviceIdRef.current;
    if (!installationDeviceId) {
      const unavailable: ContractError = {
        errorVersion: 1,
        code: "STORAGE_UNAVAILABLE",
        message:
          "The protected installation identity is unavailable. Device sync remains locked.",
        retryable: true
      };
      if (mountedRef.current) {
        setBootstrap({
          status: "retryable-error",
          lastError: unavailable
        });
        setSync((current) => ({
          ...current,
          status: "needs-attention",
          lastError: unavailable,
          lastAttemptAt: now()
        }));
      }
      return;
    }
    const generation = vaultGenerationRef.current;
    const activeRepository = repositoryRef.current;
    if (mountedRef.current) {
      if (workspaceRef.current === null) {
        setBootstrap({ status: "pulling", lastError: null });
      }
      setSync((current) => ({
        ...current,
        status: "syncing",
        lastError: null,
        lastAttemptAt: now()
      }));
    }
    try {
      const result = await reconcileForeground({
        repository: activeRepository,
        transport: syncTransport,
        ...(attachmentStoreRef.current && evidenceUploadPort
          ? {
              attachmentStore: attachmentStoreRef.current,
              evidenceUploadPort,
              ...(evidenceDownloadPort
                ? { evidenceDownloadPort }
                : {})
            }
          : attachmentStoreRef.current && evidenceDownloadPort
            ? {
                attachmentStore: attachmentStoreRef.current,
                evidenceDownloadPort
              }
            : {}),
        householdId: boundHouseholdId,
        ...(accountId ? { accountId } : {}),
        deviceId: installationDeviceId,
        now
      });
      await publishSyncResult(result, generation, activeRepository);
    } catch {
      if (
        mountedRef.current &&
        generation === vaultGenerationRef.current
      ) {
        setSync((current) => ({
          ...current,
          status: "offline",
          lastError: {
            errorVersion: 1,
            code: "OFFLINE",
            message:
              "Foreground sync was interrupted. Local changes remain queued.",
            retryable: true
          },
          lastAttemptAt: now()
        }));
        if (workspaceRef.current === null) {
          const interrupted: ContractError = {
            errorVersion: 1,
            code: "OFFLINE",
            message:
              "Workspace restore was interrupted. Reconnect and try again.",
            retryable: true
          };
          setBootstrap({
            status: "retryable-error",
            lastError: interrupted
          });
        }
      }
    }
  }, [
    accessKind,
    accountId,
    boundHouseholdId,
    evidenceDownloadPort,
    evidenceUploadPort,
    publishSyncResult,
    syncTransport
  ]);

  const syncNow = useCallback(async (): Promise<void> => {
    syncRequestedRef.current = true;
    if (syncInFlightRef.current) {
      return syncInFlightRef.current;
    }
    let task: Promise<void>;
    task = (async () => {
      do {
        syncRequestedRef.current = false;
        await runForegroundSync();
      } while (syncRequestedRef.current && mountedRef.current);
    })().finally(() => {
      if (syncInFlightRef.current === task) {
        syncInFlightRef.current = null;
      }
    });
    syncInFlightRef.current = task;
    return task;
  }, [runForegroundSync]);

  const retryBootstrap = useCallback(async (): Promise<void> => {
    if (workspaceRef.current !== null) return;
    if (!storageReadyRef.current) {
      setLoading(true);
      setBootstrap({ status: "opening", lastError: null });
      setResourceEpoch((current) => current + 1);
      return;
    }
    await syncNow();
  }, [syncNow]);

  useEffect(() => {
    let active = true;
    const generation = vaultGenerationRef.current + 1;
    vaultGenerationRef.current = generation;
    let openedRepository: NativeWorkspaceRepository | null = null;
    let openedStoreForEffect: ScopedAttachmentStore | null = null;

    storageReadyRef.current = false;
    attachmentStoreRef.current = null;
    installationDeviceIdRef.current = null;
    workspaceRef.current = null;
    revisionRef.current = 0;
    setStorageReady(false);
    setOpenedAttachmentStore(null);
    setWorkspace(null);
    setPendingOperationCounts({ total: 0, liability: 0 });
    setError(null);
    setBootstrap({
      status: accessKind === "locked" ? "locked" : "opening",
      lastError: null
    });
    setSync({
      status:
        syncTransport && accessKind === "authenticated"
          ? "idle"
          : "local-only",
      conflicts: [],
      lastError: null,
      lastAttemptAt: null,
      lastSyncedAt: null
    });

    if (accessKind === "locked") {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void (async () => {
      try {
        const resolvedInstallationDeviceId =
          await installationDeviceIdentity.getOrCreate();
        if (
          !isValidInstallationDeviceId(resolvedInstallationDeviceId)
        ) {
          throw new Error(
            "The protected installation identity is invalid. Device sync remains locked."
          );
        }
        if (
          !active ||
          generation !== vaultGenerationRef.current
        ) {
          return;
        }
        const installationDeviceId =
          resolvedInstallationDeviceId.toLowerCase();
        installationDeviceIdRef.current = installationDeviceId;
        const access: WorkspaceVaultAccess =
          accessKind === "preview"
            ? { kind: "preview" }
            : {
                kind: "authenticated",
                accountId: accountId!,
                householdId: boundHouseholdId!,
                role: permissionRole!
              };
        const scope = await vaultScopeForWorkspaceAccess(access);
        const nextRepository =
          repositoryOverride ??
          (await resourceFactory.createRepository(scope));
        openedRepository = nextRepository;
        const nextAttachmentStore =
          attachmentStoreOverride ??
          resourceFactory.createAttachmentStore(scope);
        openedStoreForEffect = nextAttachmentStore;
        if (
          nextRepository.scopeId !== scope.scopeId ||
          nextAttachmentStore.scopeId !== scope.scopeId
        ) {
          throw new Error(
            "The local database and attachment vault scopes do not match the active account."
          );
        }
        await nextRepository.initialize();
        const [loaded, loadedSyncState] = await Promise.all([
          nextRepository.load(),
          nextRepository.loadSyncState()
        ]);
        let loadedRevision = loaded.revision;
        let loadedSnapshot = loaded.snapshot;
        if (
          !active ||
          generation !== vaultGenerationRef.current
        ) {
          await Promise.allSettled([
            nextRepository.lock(),
            nextAttachmentStore.lock()
          ]);
          return;
        }
        if (loadedSnapshot !== null) {
          if (!isNativeWorkspace(loadedSnapshot)) {
            throw new Error(
              "This local vault contains an unsupported workspace. Nothing was overwritten."
            );
          }
          if (
            boundHouseholdId !== null &&
            loadedSnapshot.household.id !== boundHouseholdId
          ) {
            throw new Error(
              "The local workspace does not belong to the selected household."
            );
          }
          if (
            installationDeviceIdentity.scope === "installation" &&
            loadedSnapshot.deviceId !== installationDeviceId
          ) {
            const reboundSnapshot: NativeWorkspace = {
              ...loadedSnapshot,
              deviceId: installationDeviceId
            };
            const rebound = await nextRepository.commit({
              expectedRevision: loadedRevision,
              nextRevision: loadedRevision + 1,
              snapshot: reboundSnapshot,
              operations: []
            });
            if (!rebound.ok) {
              throw new Error(
                "The local workspace could not be bound to this installation identity."
              );
            }
            loadedRevision = rebound.value.revision;
            loadedSnapshot = reboundSnapshot;
          }
        }
        const validatedSnapshot =
          loadedSnapshot as NativeWorkspace | null;
        repositoryRef.current = nextRepository;
        attachmentStoreRef.current = nextAttachmentStore;
        setRepository(nextRepository);
        setOpenedAttachmentStore({
          bindingKey: vaultBindingKey,
          store: nextAttachmentStore
        });
        storageReadyRef.current = true;
        setStorageReady(true);
        revisionRef.current = loadedRevision;
        if (validatedSnapshot !== null) {
          workspaceRef.current = validatedSnapshot;
          setWorkspace(validatedSnapshot);
          setBootstrap({ status: "ready", lastError: null });
        } else if (accessKind === "preview") {
          setBootstrap({ status: "ready", lastError: null });
        }
        setSync({
          status:
            loadedSyncState.conflicts.length > 0
              ? "needs-attention"
              : syncTransport && accessKind === "authenticated"
                ? "idle"
                : "local-only",
          conflicts: loadedSyncState.conflicts,
          lastError: null,
          lastAttemptAt: null,
          lastSyncedAt:
            validatedSnapshot?.lastSyncedAt ?? null
        });
        await refreshPendingCount(nextRepository);
        if (syncTransport && accessKind === "authenticated") {
          if (validatedSnapshot === null) {
            await syncNow();
          } else {
            void syncNow();
          }
        } else if (
          accessKind === "authenticated" &&
          validatedSnapshot === null
        ) {
          const unavailable: ContractError = {
            errorVersion: 1,
            code: "STORAGE_UNAVAILABLE",
            message:
              "Cloud restore is not configured for this signed build.",
            retryable: true
          };
          setBootstrap({
            status: "retryable-error",
            lastError: unavailable
          });
        }
      } catch (caught) {
        await Promise.allSettled([
          openedRepository?.lock(),
          openedStoreForEffect?.lock()
        ]);
        if (active) {
          attachmentStoreRef.current = null;
          setOpenedAttachmentStore(null);
          const installationIdentityFailure =
            caught instanceof InstallationDeviceIdentityError
              ? caught
              : null;
          const openingError =
            installationIdentityFailure
              ? installationIdentityFailure.message
              : caught instanceof Error &&
            caught.message.includes("selected household")
              ? caught.message
              : isSessionPreview
                ? "The preview store could not be opened. Nothing was overwritten."
                : "The encrypted vault could not be opened. Saving is blocked so ALYR never falls back to plaintext storage.";
          setError(openingError);
          setBootstrap({
            status:
              installationIdentityFailure?.retryable === true
                ? "retryable-error"
                : "error",
            lastError: {
              errorVersion: 1,
              code: "STORAGE_UNAVAILABLE",
              message: openingError,
              retryable:
                installationIdentityFailure?.retryable === true
            }
          });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
      vaultGenerationRef.current += 1;
      storageReadyRef.current = false;
      installationDeviceIdRef.current = null;
      if (attachmentStoreRef.current === openedStoreForEffect) {
        attachmentStoreRef.current = null;
      }
      void Promise.allSettled([
        openedRepository?.lock(),
        openedStoreForEffect?.lock()
      ]);
    };
  }, [
    accessKind,
    accountId,
    attachmentStoreOverride,
    boundHouseholdId,
    installationDeviceIdentity,
    permissionRole,
    refreshPendingCount,
    repositoryOverride,
    resourceFactory,
    syncNow,
    syncTransport,
    vaultBindingKey,
    resourceEpoch
  ]);

  useEffect(() => {
    if (!syncTransport || accessKind !== "authenticated") {
      return;
    }
    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          void syncNow();
        }
      }
    );
    return () => subscription.remove();
  }, [accessKind, syncNow, syncTransport]);

  const commitWorkspace = useCallback(
    async (
      nextWorkspace: NativeWorkspace,
      operations: readonly SyncOperation[]
    ): Promise<void> => {
      if (!storageReadyRef.current) {
        throw new Error(
          "The local vault is unavailable. Nothing was saved."
        );
      }
      const expectedRevision = revisionRef.current;
      const nextRevision = expectedRevision + 1;
      const activeRepository = repositoryRef.current;
      const result = await activeRepository.commit({
        expectedRevision,
        nextRevision,
        snapshot: nextWorkspace,
        operations
      });
      if (!result.ok) {
        const latest = await activeRepository.load();
        revisionRef.current = latest.revision;
        if (latest.snapshot && isNativeWorkspace(latest.snapshot)) {
          workspaceRef.current = latest.snapshot;
          setWorkspace(latest.snapshot);
        }
        throw new Error(result.error.message);
      }
      revisionRef.current = result.value.revision;
      workspaceRef.current = nextWorkspace;
      setWorkspace(nextWorkspace);
      await refreshPendingCount(activeRepository);
      // Local durability is the success boundary. Foreground reconciliation
      // starts after the commit and never delays the user's offline action.
      void syncNow();
    },
    [refreshPendingCount, syncNow]
  );

  const enqueue = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> => {
      setSaving(true);
      const run = queueRef.current.then(work, work);
      queueRef.current = run.catch(() => undefined);
      try {
        return await run;
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The update could not be saved."
        );
        throw caught;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const resolveSyncConflict = useCallback(
    async (
      operationId: string,
      choice: Exclude<ConflictResolutionChoice, "review-manually">
    ): Promise<"cloud-kept" | "local-reapply-queued"> =>
      enqueue(async () => {
        await (syncInFlightRef.current ?? Promise.resolve());
        const activeRepository = repositoryRef.current;
        const householdId =
          boundHouseholdId ?? workspaceRef.current?.household.id;
        if (!householdId) {
          throw new Error(
            "The active household record is unavailable for conflict review."
          );
        }
        const storedSyncState = await activeRepository.loadSyncState();
        const selectedConflict = storedSyncState.conflicts.find(
          (candidate) => candidate.operationId === operationId
        );
        if (
          selectedConflict &&
          isLiabilitySyncConflict(
            selectedConflict,
            workspaceRef.current
          ) &&
          !hasHouseholdCapability(permissionRole, "liability.read")
        ) {
          throw new Error(
            "This conflict is not available for the current household role."
          );
        }
        const result = await resolveDurableSyncConflict({
          repository: activeRepository,
          householdId,
          operationId,
          choice,
          replacementOperationId: () => id("conflict-resolution"),
          now
        });
        revisionRef.current = result.revision;
        workspaceRef.current = result.workspace;
        setWorkspace(result.workspace);
        setSync((current) => ({
          ...current,
          status:
            result.conflicts.length > 0
              ? "needs-attention"
              : result.outcome === "local-reapply-queued"
                ? "syncing"
                : "idle",
          conflicts: result.conflicts,
          lastError: null,
          lastAttemptAt: now()
        }));
        await refreshPendingCount(activeRepository);
        void syncNow();
        return result.outcome;
      }),
    [
      boundHouseholdId,
      enqueue,
      permissionRole,
      refreshPendingCount,
      syncNow
    ]
  );

  const purgeActiveVault = useCallback(
    async (options?: {
      readonly reopenEmptyPreview?: boolean;
    }): Promise<void> => {
      const reopenEmptyPreview =
        options?.reopenEmptyPreview === true && accessKind === "preview";
      const activeRepository = repositoryRef.current;
      const activeAttachmentStore = attachmentStoreRef.current;

      // Stop new writes and hide every record before waiting for an in-flight
      // mutation/sync task to settle. The generation bump prevents late sync
      // results from republishing a deleted workspace.
      vaultGenerationRef.current += 1;
      storageReadyRef.current = false;
      syncRequestedRef.current = false;
      workspaceRef.current = null;
      revisionRef.current = 0;
      setStorageReady(false);
      setOpenedAttachmentStore(null);
      setWorkspace(null);
      setPendingOperationCounts({ total: 0, liability: 0 });
      setSaving(false);
      setError(null);
      setLoading(reopenEmptyPreview);
      setBootstrap({
        status: reopenEmptyPreview ? "opening" : "locked",
        lastError: null
      });
      setSync({
        status: "local-only",
        conflicts: [],
        lastError: null,
        lastAttemptAt: null,
        lastSyncedAt: null
      });

      await Promise.allSettled([
        queueRef.current,
        syncInFlightRef.current ?? Promise.resolve()
      ]);
      const purgeResults = await Promise.allSettled([
        activeRepository.purge(),
        activeAttachmentStore?.purge() ?? Promise.resolve()
      ]);
      if (attachmentStoreRef.current === activeAttachmentStore) {
        attachmentStoreRef.current = null;
      }
      if (purgeResults.some((result) => result.status === "rejected")) {
        setLoading(false);
        throw new Error(
          "The protected vault did not finish clearing on this device."
        );
      }

      if (reopenEmptyPreview) {
        setResourceEpoch((current) => current + 1);
      }
    },
    [accessKind]
  );

  const startWorkspace = useCallback(
    async (mode: WorkspaceMode): Promise<void> =>
      enqueue(async () => {
        requireCapabilities("household.manage");
        if (boundHouseholdId !== null && mode === "sample") {
          throw new Error(
            "A sample workspace cannot replace an authenticated household vault."
          );
        }
        const installationDeviceId =
          installationDeviceIdRef.current;
        if (!installationDeviceId) {
          throw new Error(
            "The protected installation identity is unavailable. Nothing was saved."
          );
        }
        const current = workspaceRef.current;
        const createdAt = now();
        const identity = {
          householdId: boundHouseholdId ?? id("household"),
          ownerMemberId: id("member"),
          deviceId: installationDeviceId
        };
        const nextWorkspace =
          mode === "personal" && current?.mode === "sample"
            ? createPersonalWorkspaceReplacement(
                current,
                createdAt,
                identity
              )
            : createWorkspace(mode, createdAt, identity);
        await commitWorkspace(nextWorkspace, []);
      }),
    [boundHouseholdId, commitWorkspace, enqueue, requireCapabilities]
  );

  const createPlace = useCallback(
    async (input: NewPlaceInput): Promise<NativePlace> =>
      enqueue(async () => {
        requireCapabilities("place.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error("Choose a workspace before adding a Place.");
        }
        const result = addPlace(current, input, mutationContext);
        const occurredAt = now();
        const operations =
          current.mode === "sample"
            ? []
            : [
                createLocalOperation(current, {
                  type: "place.create",
                  aggregateId: result.place.id,
                  payload: {
                    name: result.place.name,
                    kind: result.place.kind ?? "unknown",
                    tenure: result.place.tenure ?? "unknown",
                    addressText: result.place.addressSummary,
                    regionLabel: result.place.regionLabel,
                    latitude: result.place.latitude,
                    longitude: result.place.longitude,
                    locationSource: result.place.locationSource,
                    locationPrecision: result.place.precision,
                    horizontalAccuracyM:
                      result.place.horizontalAccuracyMeters,
                    observedAt: result.place.observedAt,
                    confirmedAt: result.place.confirmedAt
                  },
                  operationId: id("operation"),
                  idempotencyKey: id("idempotency"),
                  observedVersion: 0,
                  occurredAt
                }),
                ...result.place.rooms.map((room, ordinal) =>
                  createLocalOperation(current, {
                    type: "space.create",
                    aggregateId: room.id,
                    payload: {
                      placeId: result.place.id,
                      parentSpaceId: room.parentRoomId,
                      name: room.name,
                      kind: room.kind,
                      ordinal
                    },
                    operationId: id("operation"),
                    idempotencyKey: id("idempotency"),
                    observedVersion: 0,
                    occurredAt
                  })
                )
              ];
        await commitWorkspace(result.workspace, operations);
        return result.place;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const updatePlaceBasics = useCallback(
    async (input: UpdatePlaceBasicsInput): Promise<NativePlace> =>
      enqueue(async () => {
        requireCapabilities("place.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error("Choose a workspace before updating a Place.");
        }
        const result = updatePlaceBasicsRecord(
          current,
          input,
          mutationContext
        );
        if (result.workspace === current) {
          return result.place;
        }
        const operations =
          current.mode === "sample"
            ? []
            : [
                createPlaceBasicsUpdateOperation(
                  current,
                  result,
                  result.place.updatedAt
                )
              ];
        await commitWorkspace(result.workspace, operations);
        return result.place;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const createPlaceSpace = useCallback(
    async (input: NewPlaceSpaceInput): Promise<NativeRoom> =>
      enqueue(async () => {
        requireCapabilities("place.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error("Choose a workspace before adding a space.");
        }
        const result = addPlaceSpace(current, input, mutationContext);
        const operations =
          current.mode === "sample"
            ? []
            : [
                createPlaceSpaceOperation(current, result)
              ];
        await commitWorkspace(result.workspace, operations);
        return result.room;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const updatePlaceSpace = useCallback(
    async (input: UpdatePlaceSpaceInput): Promise<NativeRoom> =>
      enqueue(async () => {
        requireCapabilities("place.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error("Choose a workspace before updating a space.");
        }
        const result = updatePlaceSpaceRecord(
          current,
          input,
          mutationContext
        );
        if (result.workspace === current) {
          return result.room;
        }
        const operations =
          current.mode === "sample"
            ? []
            : [createPlaceSpaceUpdateOperation(current, result)];
        await commitWorkspace(result.workspace, operations);
        return result.room;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const addDocumentToPlace = useCallback(
    async (input: NewPlaceDocumentInput): Promise<NativePlaceDocument> =>
      enqueue(async () => {
        requireCapabilities("place.write", "evidence.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error(
            "Choose a workspace before attaching a Place document."
          );
        }
        const result = await preparePlaceDocumentAddition(
          current,
          input,
          requireOpenAttachmentStore(),
          mutationContext
        );
        const operations =
          current.mode === "sample"
            ? []
            : createPlaceDocumentOperations(
                current,
                result.document,
                result.document.capturedAt
              );
        await commitWorkspace(result.workspace, operations);
        return result.document;
      }),
    [
      commitWorkspace,
      enqueue,
      requireCapabilities,
      requireOpenAttachmentStore
    ]
  );

  const createAsset = useCallback(
    async (input: NewAssetInput): Promise<NativeAsset> =>
      enqueue(async () => {
        requireCapabilities(
          "asset.write",
          ...(input.photo || input.evidence
            ? (["evidence.write"] as const)
            : [])
        );
        const current = workspaceRef.current;
        if (!current) {
          throw new Error("Choose a workspace before adding an asset.");
        }
        const [protectedPhoto, protectedEvidence] = await Promise.all([
          input.photo
            ? requireOpenAttachmentStore().ingest(input.photo)
            : Promise.resolve(null),
          input.evidence
            ? requireOpenAttachmentStore().ingest(input.evidence)
            : Promise.resolve(null)
        ]);
        const result = addAsset(
          current,
          {
            ...input,
            photo: protectedPhoto,
            evidence: protectedEvidence
          },
          mutationContext
        );
        const occurredAt = now();
        const newEvidence = result.workspace.evidence.filter(
          (item) => item.assetId === result.asset.id
        );
        const operations =
          current.mode === "sample"
            ? []
            : createAssetOperations(
                current,
                result.asset,
                newEvidence,
                occurredAt
              );
        await commitWorkspace(result.workspace, operations);
        return result.asset;
      }),
    [
      commitWorkspace,
      enqueue,
      requireCapabilities,
      requireOpenAttachmentStore
    ]
  );

  const updatePlacePin = useCallback(
    async (input: UpdatePlacePinInput): Promise<NativePlace> =>
      enqueue(async () => {
        requireCapabilities("place.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error("Choose a workspace before updating a Place.");
        }
        const result = updatePlacePinRecord(
          current,
          input,
          mutationContext
        );
        if (result.workspace === current) {
          return result.place;
        }
        const occurredAt = result.place.updatedAt;
        const operations =
          current.mode === "sample"
            ? []
            : [
                createPlacePinUpdateOperation(
                  current,
                  result,
                  occurredAt
                )
              ];
        await commitWorkspace(result.workspace, operations);
        return result.place;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const updateAsset = useCallback(
    async (input: ExistingAssetUpdateInput): Promise<NativeAsset> =>
      enqueue(async () => {
        requireCapabilities(
          "asset.write",
          ...(input.photo || input.evidence
            ? (["evidence.write"] as const)
            : [])
        );
        const current = workspaceRef.current;
        if (!current) {
          throw new Error("Choose a workspace before updating an asset.");
        }
        const prepared = await prepareExistingAssetUpdate(
          current,
          input,
          requireOpenAttachmentStore(),
          mutationContext,
          now()
        );
        const { result, operations } = prepared;
        if (result.workspace === current) {
          return result.asset;
        }
        await commitWorkspace(result.workspace, operations);
        return result.asset;
      }),
    [
      commitWorkspace,
      enqueue,
      requireCapabilities,
      requireOpenAttachmentStore
    ]
  );

  const setAssetLifecycle = useCallback(
    async (input: AssetLifecycleInput): Promise<NativeAsset> =>
      enqueue(async () => {
        requireCapabilities("asset.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error(
            "Choose a workspace before changing an Asset Passport."
          );
        }
        const result = setAssetLifecycleRecord(
          current,
          input,
          mutationContext
        );
        if (result.workspace === current) {
          return result.asset;
        }
        const operations =
          current.mode === "sample"
            ? []
            : [
                createAssetLifecycleOperation(
                  current,
                  result,
                  result.asset.updatedAt
                )
              ];
        await commitWorkspace(result.workspace, operations);
        return result.asset;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const setEvidenceReviewStatus = useCallback(
    async (input: EvidenceReviewInput): Promise<NativeEvidence> =>
      enqueue(async () => {
        requireCapabilities("evidence.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error(
            "Choose a workspace before reviewing evidence."
          );
        }
        const result = setEvidenceReviewStatusRecord(
          current,
          input,
          mutationContext
        );
        if (result.workspace === current) {
          return result.evidence;
        }
        const operations =
          current.mode === "sample"
            ? []
            : [
                createEvidenceReviewOperation(
                  current,
                  result,
                  result.evidence.updatedAt
                )
              ];
        await commitWorkspace(result.workspace, operations);
        return result.evidence;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const recordAssetValue = useCallback(
    async (input: PortfolioValueInput): Promise<PortfolioValueRecord> =>
      enqueue(async () => {
        requireCapabilities(
          "liabilityId" in input && input.liabilityId
            ? "liability.write"
            : "placeId" in input && input.placeId
            ? "place.write"
            : "asset.write"
        );
        const current = workspaceRef.current;
        if (!current) {
          throw new Error(
            "Choose a workspace before recording a value."
          );
        }
        const result = recordPortfolioValueInWorkspace(
          current,
          input,
          { ...mutationContext, today }
        );
        const operations =
          current.mode === "sample"
            ? []
            : [createPortfolioValueOperation(current, result.record)];
        await commitWorkspace(result.workspace, operations);
        return result.record;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const createLiability = useCallback(
    async (
      input: NewLiabilityInput & PortfolioValueInputBase
    ): Promise<NativeLiability> =>
      enqueue(async () => {
        requireCapabilities("liability.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error(
            "Choose a workspace before recording a liability."
          );
        }
        const created = createLiabilityInWorkspace(
          current,
          { name: input.name, kind: input.kind },
          { ...mutationContext, today }
        );
        const valued = recordPortfolioValueInWorkspace(
          created.workspace,
          {
            liabilityId: created.liability.id,
            amountMinor: input.amountMinor,
            currency: input.currency,
            asOf: input.asOf
          },
          { ...mutationContext, today }
        );
        const operations =
          current.mode === "sample"
            ? []
            : [
                createLiabilityOperation(current, created),
                createPortfolioValueOperation(
                  created.workspace,
                  valued.record
                )
              ];
        await commitWorkspace(valued.workspace, operations);
        return created.liability;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const updateLiability = useCallback(
    async (input: UpdateLiabilityInput): Promise<NativeLiability> =>
      enqueue(async () => {
        requireCapabilities("liability.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error(
            "Choose a workspace before updating a liability."
          );
        }
        const result = updateLiabilityInWorkspace(
          current,
          input,
          { ...mutationContext, today }
        );
        const operations =
          current.mode === "sample"
            ? []
            : [createLiabilityOperation(current, result)];
        await commitWorkspace(result.workspace, operations);
        return result.liability;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const setLiabilityLifecycle = useCallback(
    async (
      input: LiabilityLifecycleInput
    ): Promise<NativeLiability> =>
      enqueue(async () => {
        requireCapabilities("liability.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error(
            "Choose a workspace before changing a liability."
          );
        }
        const result = setLiabilityLifecycleInWorkspace(
          current,
          input,
          { ...mutationContext, today }
        );
        if (result.workspace === current) return result.liability;
        const operations =
          current.mode === "sample"
            ? []
            : [createLiabilityLifecycleOperation(current, result)];
        await commitWorkspace(result.workspace, operations);
        return result.liability;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const deleteLiability = useCallback(
    async (liabilityId: string): Promise<void> =>
      enqueue(async () => {
        requireCapabilities("liability.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error(
            "Choose a workspace before deleting a liability."
          );
        }
        const occurredAt = now();
        const result = deleteLiabilityInWorkspace(
          current,
          liabilityId,
          occurredAt
        );
        const operations =
          current.mode === "sample"
            ? []
            : [
                createLiabilityDeleteOperation(
                  current,
                  result.liability,
                  occurredAt
                )
              ];
        await commitWorkspace(result.workspace, operations);
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const confirmNoLiabilities = useCallback(
    async (reviewedAt: string): Promise<NativeLiabilityReview> =>
      enqueue(async () => {
        requireCapabilities("liability.write");
        const current = workspaceRef.current;
        if (!current) {
          throw new Error(
            "Choose a workspace before reviewing liabilities."
          );
        }
        const result = confirmNoLiabilitiesInWorkspace(
          current,
          reviewedAt,
          { ...mutationContext, today }
        );
        const operations =
          current.mode === "sample"
            ? []
            : [createLiabilityReviewOperation(current, result)];
        await commitWorkspace(result.workspace, operations);
        return result.review;
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const markRetrieved = useCallback(
    async (assetId: string): Promise<void> =>
      enqueue(async () => {
        requireCapabilities("asset.write");
        const current = workspaceRef.current;
        if (!current) {
          return;
        }
        const next = recordRetrieval(current, assetId, mutationContext);
        await commitWorkspace(next, []);
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const changeLanguage = useCallback(
    async (language: LanguageCode): Promise<void> =>
      enqueue(async () => {
        requireCapabilities("household.manage");
        const current = workspaceRef.current;
        if (!current) {
          return;
        }
        const next = setWorkspaceLanguage(current, language, now());
        await commitWorkspace(next, []);
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const renameCurrentHousehold = useCallback(
    async (name: string): Promise<void> =>
      enqueue(async () => {
        requireCapabilities("household.manage");
        const current = workspaceRef.current;
        if (!current) return;
        const next = renameHousehold(current, name, now());
        await commitWorkspace(next, []);
      }),
    [commitWorkspace, enqueue, requireCapabilities]
  );

  const replaceWithPersonalWorkspace = useCallback(
    async (): Promise<void> => startWorkspace("personal"),
    [startWorkspace]
  );

  const exportReadableSnapshot = useCallback((): string | null => {
    if (!can("export.create")) {
      return null;
    }
    const current = workspaceRef.current;
    if (!current) {
      return null;
    }
    return JSON.stringify(
      {
        format: "alyr-readable-snapshot",
        version: 1,
        exportedAt: now(),
        warning:
          "Readable JSON is not an encrypted Recovery Kit or automatic backup.",
        workspace: workspaceVisibleToRole(current, permissionRole)
      },
      null,
      2
    );
  }, [can, permissionRole]);

  const visibleWorkspace = useMemo(
    () =>
      workspace
        ? workspaceVisibleToRole(workspace, permissionRole)
        : null,
    [permissionRole, workspace]
  );
  const pendingOperationCount = useMemo(
    () =>
      pendingOperationCountVisibleToRole(
        pendingOperationCounts,
        permissionRole
      ),
    [pendingOperationCounts, permissionRole]
  );
  const visibleSync = useMemo(
    () =>
      syncRuntimeVisibleToRole(
        sync,
        workspace,
        permissionRole,
        syncTransport && accessKind === "authenticated"
          ? "idle"
          : "local-only"
      ),
    [
      accessKind,
      permissionRole,
      sync,
      syncTransport,
      workspace
    ]
  );
  const recordedPortfolioValues = useMemo(
    () =>
      visibleWorkspace
        ? getPortfolioValueRecords(visibleWorkspace)
        : [],
    [visibleWorkspace]
  );
  const recordedAssetValues = recordedPortfolioValues;
  const liabilities = useMemo(
    () => (visibleWorkspace ? getLiabilities(visibleWorkspace) : []),
    [visibleWorkspace]
  );
  const liabilityReview = useMemo(
    () =>
      visibleWorkspace
        ? getLiabilityReview(visibleWorkspace)
        : null,
    [visibleWorkspace]
  );
  const attachmentStore =
    storageReady &&
    openedAttachmentStore?.bindingKey === vaultBindingKey
      ? openedAttachmentStore.store
      : null;
  const recoveryVaultReady =
    accessKind === "authenticated" &&
    Boolean(workspace) &&
    storageReady;
  const runRecoveryExclusive = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> =>
      enqueue(async () => {
        // Let an already-running foreground reconciliation settle before
        // Recovery Kit preflight snapshots the repository revision. A later
        // sync still loses its revision race rather than overwriting restore.
        await (syncInFlightRef.current ?? Promise.resolve());
        return work();
      }),
    [enqueue]
  );
  const publishRecoveredWorkspace = useCallback(
    (restored: NativeWorkspace, revision: number): void => {
      revisionRef.current = revision;
      workspaceRef.current = restored;
      setWorkspace(restored);
      setPendingOperationCounts({ total: 0, liability: 0 });
      setError(null);
      setBootstrap({ status: "ready", lastError: null });
      setSync({
        status:
          syncTransport && accessKind === "authenticated"
            ? "idle"
            : "local-only",
        conflicts: [],
        lastError: null,
        lastAttemptAt: null,
        lastSyncedAt: null
      });
    },
    [accessKind, syncTransport]
  );
  const recoveryRuntime = useMemo(
    () =>
      createSignedRecoveryJourneyRuntime({
        profile: runtimeProfile,
        repository,
        attachmentStore: recoveryVaultReady
          ? attachmentStore
          : null,
        currentWorkspace: () => {
          const current = workspaceRef.current;
          return current
            ? workspaceVisibleToRole(current, permissionRole)
            : null;
        },
        currentHouseholdId: () => boundHouseholdId,
        currentDeviceId: () => installationDeviceIdRef.current,
        runExclusive: runRecoveryExclusive,
        onRestored: publishRecoveredWorkspace
      }),
    [
      attachmentStore,
      boundHouseholdId,
      publishRecoveredWorkspace,
      permissionRole,
      recoveryVaultReady,
      repository,
      runRecoveryExclusive
    ]
  );

  useEffect(
    () => () => {
      recoveryRuntime.clearPreview();
    },
    [recoveryRuntime]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace: visibleWorkspace,
      liabilities,
      liabilityReview,
      recordedPortfolioValues,
      recordedAssetValues,
      loading,
      saving,
      storageReady,
      attachmentStore,
      error,
      repository: {
        kind: repository.kind,
        durable: repository.durable,
        encryptedAtRest: repository.encryptedAtRest
      },
      pendingOperationCount,
      bootstrap,
      sync: visibleSync,
      permissionRole,
      can,
      retryBootstrap,
      syncNow,
      resolveSyncConflict,
      startWorkspace,
      createPlace,
      updatePlaceBasics,
      createPlaceSpace,
      updatePlaceSpace,
      addPlaceDocument: addDocumentToPlace,
      updatePlacePin,
      createAsset,
      updateAsset,
      setAssetLifecycle,
      setEvidenceReviewStatus,
      recordAssetValue,
      recordPortfolioValue: recordAssetValue,
      createLiability,
      updateLiability,
      setLiabilityLifecycle,
      deleteLiability,
      confirmNoLiabilities,
      markRetrieved,
      changeLanguage,
      renameHousehold: renameCurrentHousehold,
      replaceWithPersonalWorkspace,
      purgeActiveVault,
      exportReadableSnapshot,
      clearError: () => setError(null)
    }),
    [
      changeLanguage,
      addDocumentToPlace,
      attachmentStore,
      bootstrap,
      can,
      confirmNoLiabilities,
      createAsset,
      createLiability,
      createPlace,
      createPlaceSpace,
      error,
      deleteLiability,
      exportReadableSnapshot,
      loading,
      liabilities,
      liabilityReview,
      markRetrieved,
      pendingOperationCount,
      permissionRole,
      recordAssetValue,
      recordedAssetValues,
      recordedPortfolioValues,
      retryBootstrap,
      resolveSyncConflict,
      replaceWithPersonalWorkspace,
      purgeActiveVault,
      repository,
      renameCurrentHousehold,
      saving,
      setAssetLifecycle,
      setLiabilityLifecycle,
      setEvidenceReviewStatus,
      visibleSync,
      syncNow,
      storageReady,
      startWorkspace,
      updateAsset,
      updateLiability,
      updatePlaceBasics,
      updatePlacePin,
      updatePlaceSpace,
      visibleWorkspace
    ]
  );

  return (
    <RecoveryJourneyProvider runtime={recoveryRuntime}>
      <WorkspaceContext.Provider value={value}>
        {children}
      </WorkspaceContext.Provider>
    </RecoveryJourneyProvider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return context;
}

export function workspaceAsJson(workspace: NativeWorkspace): JsonObject {
  return workspace;
}
