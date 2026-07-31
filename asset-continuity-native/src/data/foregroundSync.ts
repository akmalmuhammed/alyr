import type {
  ContractError,
  JsonObject,
  JsonValue,
  SyncChange,
  SyncConflict,
  SyncCursor,
  SyncOperation,
  SyncTransport,
  WorkspaceBootstrapDescriptor
} from "@alyr/contracts";

import type { AttachmentStore } from "@/data/attachmentStore";
import {
  captureConflictContexts,
  conflictReplacementOperationId
} from "@/data/conflictInbox";
import {
  reconcileEvidenceDownloads,
  type EvidenceDownloadPort
} from "@/data/evidenceDownload";
import {
  reconcileEvidenceUploads,
  type EvidenceUploadPort
} from "@/data/evidenceUpload";
import {
  assertSyncExecutionActive,
  runSyncLocalBoundary,
  runSyncProviderBoundary,
  type SyncExecutionControl
} from "@/data/syncExecution";
import type { NativeWorkspaceRepository } from "@/data/repository";
import {
  findCategoryChoice,
  isNativeWorkspace,
  isOwnedPropertyPlace,
  normalizedPlaceKind,
  normalizedPlaceTenure,
  type NativeAsset,
  type NativeEvidence,
  type NativeLiability,
  type NativeLiabilityReview,
  type NativePlace,
  type NativePlaceDocument,
  type NativeRoom,
  type NativeWorkspace
} from "@/domain/model";
import {
  getLiabilities,
  getLiabilityReview,
  getLiabilityTombstones,
  isLiabilityKind,
  liabilityActivityWatermark
} from "@/domain/liabilities";
import {
  getPortfolioValueRecords,
  portfolioValueSubject,
  type PortfolioValueRecord
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";

const INITIAL_CURSOR: SyncCursor = {
  cursorVersion: 1,
  value: null,
  issuedAt: null
};

type SyncFailureKind = "offline" | "needs-attention";

export type ForegroundSyncResult =
  | {
      readonly kind: "idle";
      readonly revision: number;
      readonly workspace: NativeWorkspace | null;
      readonly cursor: SyncCursor;
      readonly conflicts: readonly SyncConflict[];
    }
  | {
      readonly kind: "synced";
      readonly revision: number;
      readonly workspace: NativeWorkspace;
      readonly cursor: SyncCursor;
      readonly conflicts: readonly SyncConflict[];
      readonly acknowledgedOperationIds: readonly string[];
    }
  | {
      readonly kind: SyncFailureKind;
      readonly revision: number;
      readonly workspace: NativeWorkspace | null;
      readonly cursor: SyncCursor;
      readonly conflicts: readonly SyncConflict[];
      readonly error: ContractError;
    };

export interface ForegroundSyncRequest {
  readonly repository: NativeWorkspaceRepository;
  readonly transport: SyncTransport;
  /**
   * Present only in the authenticated signed runtime. Preview mode never
   * materializes plaintext for cloud transfer.
   */
  readonly attachmentStore?: AttachmentStore;
  readonly evidenceUploadPort?: EvidenceUploadPort;
  readonly evidenceDownloadPort?: EvidenceDownloadPort;
  /**
   * Optional bounded-task guard checked at the exact upload plaintext
   * materialization boundary. Foreground callers omit it.
   */
  readonly canMaterializeProtectedAttachment?: () => boolean;
  readonly householdId: string;
  /**
   * Required only when a clean vault must be materialized. The provider
   * supplies a fresh device-scoped UUID and never derives it from an account.
   */
  readonly deviceId?: string;
  /** Used to reject a mismatched signed bootstrap descriptor. */
  readonly accountId?: string;
  readonly now?: () => string;
  readonly execution?: SyncExecutionControl;
}

interface ParsedChangeBody {
  readonly operationId: string;
  readonly command: string;
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly result: Readonly<Record<string, JsonValue>>;
}

class SyncApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncApplyError";
  }
}

function failure(
  code: ContractError["code"],
  message: string,
  retryable: boolean
): ContractError {
  return {
    errorVersion: 1,
    code,
    message,
    retryable
  };
}

function isObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDateTime(value: string): boolean {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}

function requiredString(
  payload: Readonly<Record<string, JsonValue>>,
  key: string,
  maximum = 512
): string {
  const value = payload[key];
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum
  ) {
    throw new SyncApplyError(`The server change has an invalid ${key}.`);
  }
  return value.trim();
}

function nullableString(
  payload: Readonly<Record<string, JsonValue>>,
  key: string,
  maximum = 512
): string | null {
  const value = payload[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maximum) {
    throw new SyncApplyError(`The server change has an invalid ${key}.`);
  }
  return value;
}

function nullableNumber(
  payload: Readonly<Record<string, JsonValue>>,
  key: string
): number | null {
  const value = payload[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SyncApplyError(`The server change has an invalid ${key}.`);
  }
  return value;
}

function integerResult(
  result: Readonly<Record<string, JsonValue>>,
  key: string,
  fallback: number
): number {
  const value = result[key];
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : fallback;
}

function parsedBody(change: SyncChange): ParsedChangeBody {
  if (!isObject(change.body)) {
    throw new SyncApplyError(
      "A non-tombstone server change is missing its command body."
    );
  }
  const operationId = change.body.operationId;
  const command = change.body.command;
  const payload = change.body.payload;
  const result = change.body.result;
  if (
    typeof operationId !== "string" ||
    !operationId ||
    typeof command !== "string" ||
    !command ||
    !isObject(payload) ||
    !isObject(result)
  ) {
    throw new SyncApplyError("The server change body is malformed.");
  }
  if (command.split(".", 1)[0] !== change.entityType) {
    throw new SyncApplyError(
      "The server change command does not match its entity type."
    );
  }
  return { operationId, command, payload, result };
}

function categoryLabel(categoryId: string): string {
  return (
    findCategoryChoice(categoryId)?.label ??
    categoryId
      .split(".")
      .filter(Boolean)
      .at(-1)
      ?.replace(/[-_]/gu, " ") ??
    "Other"
  );
}

function clearLegacyAssetField(
  asset: NativeAsset,
  field: "category" | "primary-photo"
): NativeAsset {
  const remaining = (asset.localOnlyFields ?? []).filter(
    (candidate) => candidate !== field
  );
  if (remaining.length === (asset.localOnlyFields?.length ?? 0)) {
    return asset;
  }
  const {
    localOnlyFields: legacyLocalOnlyFields,
    ...withoutLegacyFields
  } = asset;
  void legacyLocalOnlyFields;
  return {
    ...withoutLegacyFields,
    ...(remaining.length > 0
      ? { localOnlyFields: remaining }
      : {})
  };
}

function placePinFrom(
  payload: Readonly<Record<string, JsonValue>>
): Pick<
  NativePlace,
  | "latitude"
  | "longitude"
  | "locationSource"
  | "precision"
  | "horizontalAccuracyMeters"
  | "observedAt"
  | "confirmedAt"
> {
  const latitude = nullableNumber(payload, "latitude");
  const longitude = nullableNumber(payload, "longitude");
  if ((latitude === null) !== (longitude === null)) {
    throw new SyncApplyError(
      "A server Place must provide both coordinates or neither."
    );
  }
  if (
    latitude !== null &&
    (latitude < -90 ||
      latitude > 90 ||
      longitude! < -180 ||
      longitude! > 180)
  ) {
    throw new SyncApplyError("The server Place coordinates are invalid.");
  }
  const source = payload.locationSource;
  const locationSource =
    source === "device_gps" ||
    source === "user_pin" ||
    source === "manual_coordinates" ||
    source === "not_set"
      ? source
      : "not_set";
  const precisionValue = payload.locationPrecision;
  const precision =
    precisionValue === "exact" ||
    precisionValue === "user_placed" ||
    precisionValue === "approximate" ||
    precisionValue === "locality_only"
      ? precisionValue
      : "locality_only";
  const horizontalAccuracyMeters = nullableNumber(
    payload,
    "horizontalAccuracyM"
  );
  if (
    horizontalAccuracyMeters !== null &&
    horizontalAccuracyMeters < 0
  ) {
    throw new SyncApplyError(
      "The server Place accuracy value is invalid."
    );
  }
  const observedAt = nullableString(payload, "observedAt");
  const confirmedAt = nullableString(payload, "confirmedAt");
  if (
    (observedAt !== null && !isIsoDateTime(observedAt)) ||
    (confirmedAt !== null && !isIsoDateTime(confirmedAt))
  ) {
    throw new SyncApplyError(
      "The server Place provenance timestamp is invalid."
    );
  }
  return {
    latitude,
    longitude,
    locationSource,
    precision,
    horizontalAccuracyMeters,
    observedAt,
    confirmedAt
  };
}

const PLACE_PIN_PAYLOAD_KEYS = [
  "latitude",
  "longitude",
  "locationSource",
  "locationPrecision",
  "horizontalAccuracyM",
  "observedAt",
  "confirmedAt"
] as const;

function hasOwnPayloadKey(
  payload: Readonly<Record<string, JsonValue>>,
  key: string
): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function placeClassificationFromPayload(
  payload: Readonly<Record<string, JsonValue>>
): Readonly<{
  kind: NonNullable<NativePlace["kind"]>;
  tenure: NonNullable<NativePlace["tenure"]>;
}> {
  const kind = nullableString(payload, "kind", 32);
  const tenure = nullableString(payload, "tenure", 32);
  return {
    kind: normalizedPlaceKind(
      kind === null
        ? {}
        : { kind: kind as NonNullable<NativePlace["kind"]> }
    ),
    tenure: normalizedPlaceTenure(
      tenure === null
        ? {}
        : { tenure: tenure as NonNullable<NativePlace["tenure"]> }
    )
  };
}

function assertEntityVersion(
  currentVersion: number,
  changeVersion: number,
  operationId: string,
  localOperationIds: ReadonlySet<string>
): void {
  if (localOperationIds.has(operationId)) return;
  if (changeVersion !== currentVersion + 1) {
    throw new SyncApplyError(
      "A server record version skipped or repeated a local version."
    );
  }
}

function removeTombstone(
  workspace: NativeWorkspace,
  change: SyncChange
): NativeWorkspace {
  if (change.body !== null) {
    throw new SyncApplyError("A tombstone must not include a record body.");
  }
  if (change.entityType === "asset") {
    const asset = workspace.assets.find(
      (candidate) => candidate.id === change.entityId
    );
    if (!asset) return workspace;
    if (change.version < asset.version) {
      throw new SyncApplyError("A stale Asset tombstone was rejected.");
    }
    const evidenceIds = new Set(
      workspace.evidence
        .filter((item) => item.assetId === asset.id)
        .map((item) => item.id)
    );
    return {
      ...workspace,
      assets: workspace.assets.filter((item) => item.id !== asset.id),
      evidence: workspace.evidence.filter(
        (item) => !evidenceIds.has(item.id)
      )
    };
  }
  if (change.entityType === "evidence") {
    return {
      ...workspace,
      evidence: workspace.evidence.filter(
        (item) => item.id !== change.entityId
      ),
      assets: workspace.assets.map((asset) => ({
        ...asset,
        photoEvidenceId:
          asset.photoEvidenceId === change.entityId
            ? null
            : asset.photoEvidenceId,
        evidenceIds: asset.evidenceIds.filter(
          (evidenceId) => evidenceId !== change.entityId
        )
      }))
    };
  }
  if (change.entityType === "place-document") {
    return {
      ...workspace,
      placeDocuments: (workspace.placeDocuments ?? []).filter(
        (document) => document.id !== change.entityId
      )
    };
  }
  if (change.entityType === "place") {
    if (
      workspace.assets.some((asset) => asset.placeId === change.entityId)
    ) {
      throw new SyncApplyError(
        "A Place with linked Assets cannot be tombstoned locally."
      );
    }
    return {
      ...workspace,
      places: workspace.places.filter(
        (place) => place.id !== change.entityId
      )
    };
  }
  if (change.entityType === "space") {
    if (
      workspace.assets.some((asset) => asset.roomId === change.entityId)
    ) {
      throw new SyncApplyError(
        "A space with linked Assets cannot be tombstoned locally."
      );
    }
    return {
      ...workspace,
      places: workspace.places.map((place) => ({
        ...place,
        rooms: place.rooms.filter((room) => room.id !== change.entityId)
      }))
    };
  }
  if (change.entityType === "value") {
    return {
      ...workspace,
      portfolioValueRecords: getPortfolioValueRecords(workspace).filter(
        (record) => record.id !== change.entityId
      )
    };
  }
  if (change.entityType === "liability") {
    const currentTombstones = getLiabilityTombstones(workspace);
    const previousTombstone = currentTombstones.find(
      (record) => record.id === change.entityId
    );
    const tombstoneVersion = Math.max(
      change.version,
      previousTombstone?.version ?? 0
    );
    return {
      ...workspace,
      liabilities: getLiabilities(workspace).filter(
        (record) => record.id !== change.entityId
      ),
      liabilityTombstones: [
        ...currentTombstones.filter(
          (record) => record.id !== change.entityId
        ),
        {
          id: change.entityId,
          householdId: change.householdId,
          version: tombstoneVersion,
          deletedAt:
            previousTombstone &&
            previousTombstone.version > change.version
              ? previousTombstone.deletedAt
              : change.changedAt,
          syncStatus: "synced" as const
        }
      ],
      portfolioValueRecords: getPortfolioValueRecords(workspace).filter(
        (record) => {
          const subject = portfolioValueSubject(record);
          return !(
            subject?.kind === "liability" &&
            subject.liabilityId === change.entityId
          );
        }
      )
    };
  }
  throw new SyncApplyError("This tombstone entity type is unsupported.");
}

function applyPlaceChange(
  workspace: NativeWorkspace,
  change: SyncChange,
  body: ParsedChangeBody,
  localOperationIds: ReadonlySet<string>
): NativeWorkspace {
  const placeIndex = workspace.places.findIndex(
    (place) => place.id === change.entityId
  );
  if (body.command === "place.create") {
    const name = requiredString(body.payload, "name", 120);
    const addressSummary =
      nullableString(body.payload, "addressText", 500) ??
      nullableString(body.payload, "addressSummary", 500);
    const regionLabel =
      nullableString(body.payload, "regionLabel", 120) ??
      addressSummary ??
      "Unspecified region";
    const pin = placePinFrom(body.payload);
    const classification = placeClassificationFromPayload(body.payload);
    if (placeIndex < 0) {
      if (change.version !== 1) {
        throw new SyncApplyError(
          "A new server Place must begin at version one."
        );
      }
      const place: NativePlace = {
        id: change.entityId,
        householdId: change.householdId,
        version: change.version,
        name,
        ...classification,
        addressSummary,
        regionLabel,
        ...pin,
        rooms: [],
        createdAt: change.changedAt,
        updatedAt: change.changedAt
      };
      return { ...workspace, places: [...workspace.places, place] };
    }
    const current = workspace.places[placeIndex]!;
    if (!localOperationIds.has(body.operationId)) {
      throw new SyncApplyError(
        "A remote Place create collided with an existing local Place."
      );
    }
    const places = [...workspace.places];
    places[placeIndex] = {
      ...current,
      name,
      ...classification,
      addressSummary,
      regionLabel,
      ...pin,
      version: Math.max(current.version, change.version),
      updatedAt: change.changedAt
    };
    return { ...workspace, places };
  }

  if (body.command !== "place.update" || placeIndex < 0) {
    throw new SyncApplyError("The server Place change is unsupported.");
  }
  const current = workspace.places[placeIndex]!;
  assertEntityVersion(
    current.version,
    change.version,
    body.operationId,
    localOperationIds
  );
  const metadataPatch: Partial<NativePlace> = {
    ...(hasOwnPayloadKey(body.payload, "name")
      ? { name: requiredString(body.payload, "name", 160) }
      : {}),
    ...(hasOwnPayloadKey(body.payload, "addressSummary")
      ? {
          addressSummary: nullableString(
            body.payload,
            "addressSummary",
            500
          )
        }
      : hasOwnPayloadKey(body.payload, "addressText")
        ? {
            addressSummary: nullableString(
              body.payload,
              "addressText",
              500
            )
          }
        : {}),
    ...(hasOwnPayloadKey(body.payload, "regionLabel")
      ? {
          regionLabel: requiredString(
            body.payload,
            "regionLabel",
            120
          )
        }
      : {}),
    ...(hasOwnPayloadKey(body.payload, "kind") ||
    hasOwnPayloadKey(body.payload, "tenure")
      ? placeClassificationFromPayload({
          kind:
            body.payload.kind ?? current.kind ?? "unknown",
          tenure:
            body.payload.tenure ?? current.tenure ?? "unknown"
        })
      : {})
  };
  const pinPatch = PLACE_PIN_PAYLOAD_KEYS.some((key) =>
    hasOwnPayloadKey(body.payload, key)
  )
    ? placePinFrom(body.payload)
    : {};
  const places = [...workspace.places];
  places[placeIndex] = {
    ...current,
    ...metadataPatch,
    ...pinPatch,
    version: Math.max(current.version, change.version),
    updatedAt: change.changedAt
  };
  return { ...workspace, places };
}

function applySpaceChange(
  workspace: NativeWorkspace,
  change: SyncChange,
  body: ParsedChangeBody,
  localOperationIds: ReadonlySet<string>
): NativeWorkspace {
  if (
    body.command !== "space.create" &&
    body.command !== "space.update"
  ) {
    throw new SyncApplyError("The server space change is unsupported.");
  }
  const placeId = requiredString(body.payload, "placeId");
  const placeIndex = workspace.places.findIndex(
    (place) => place.id === placeId
  );
  if (placeIndex < 0) {
    throw new SyncApplyError(
      "The server space references an unavailable Place."
    );
  }
  const place = workspace.places[placeIndex]!;
  const roomIndex = place.rooms.findIndex(
    (room) => room.id === change.entityId
  );
  const existing = roomIndex < 0 ? undefined : place.rooms[roomIndex]!;
  const kind = body.payload.kind;
  if (kind !== "room" && kind !== "zone" && kind !== "container") {
    throw new SyncApplyError("The server space kind is invalid.");
  }
  const parentRoomId = nullableString(body.payload, "parentSpaceId");
  if (
    parentRoomId &&
    (!place.rooms.some((room) => room.id === parentRoomId) ||
      parentRoomId === change.entityId)
  ) {
    throw new SyncApplyError(
      "The server space parent is not available locally."
    );
  }
  const room: NativeRoom = {
    id: change.entityId,
    version: change.version,
    name: requiredString(body.payload, "name", 120),
    kind,
    parentRoomId
  };
  if (body.command === "space.create") {
    if (change.version !== 1) {
      throw new SyncApplyError(
        "A new server space must begin at version one."
      );
    }
    if (existing) {
      if (localOperationIds.has(body.operationId)) {
        const rooms = [...place.rooms];
        rooms[roomIndex] = { ...existing, ...room };
        const places = [...workspace.places];
        places[placeIndex] = { ...place, rooms };
        return { ...workspace, places };
      }
      throw new SyncApplyError(
        "A remote space create collided with a local space."
      );
    }
    const places = [...workspace.places];
    places[placeIndex] = { ...place, rooms: [...place.rooms, room] };
    return { ...workspace, places };
  }
  if (!existing) {
    throw new SyncApplyError(
      "The server space update references an unavailable space."
    );
  }
  assertEntityVersion(
    existing.version,
    change.version,
    body.operationId,
    localOperationIds
  );
  let cursorId = parentRoomId;
  const visited = new Set<string>();
  while (cursorId) {
    if (cursorId === change.entityId || visited.has(cursorId)) {
      throw new SyncApplyError(
        "The server space hierarchy contains a cycle."
      );
    }
    visited.add(cursorId);
    cursorId =
      place.rooms.find((candidate) => candidate.id === cursorId)
        ?.parentRoomId ?? null;
  }
  const rooms = [...place.rooms];
  rooms[roomIndex] = {
    ...existing,
    ...room,
    version: Math.max(existing.version, change.version)
  };
  const places = [...workspace.places];
  places[placeIndex] = { ...place, rooms };
  return { ...workspace, places };
}

function applyAssetChange(
  workspace: NativeWorkspace,
  change: SyncChange,
  body: ParsedChangeBody,
  localOperationIds: ReadonlySet<string>
): NativeWorkspace {
  const assetIndex = workspace.assets.findIndex(
    (asset) => asset.id === change.entityId
  );
  if (body.command === "asset.create") {
    const name = requiredString(body.payload, "name", 180);
    const categoryId = requiredString(body.payload, "categoryId", 180);
    if (assetIndex < 0) {
      if (change.version !== 1) {
        throw new SyncApplyError(
          "A new server Asset must begin at version one."
        );
      }
      const asset: NativeAsset = {
        id: change.entityId,
        version: 1,
        locationRevisionVersion: 0,
        householdId: change.householdId,
        name,
        categoryId,
        categoryLabel: categoryLabel(categoryId),
        photoUri: null,
        photoProtectedUri: null,
        photoChecksumSha256: null,
        photoEvidenceId: null,
        locationStatus: "unknown",
        placeId: null,
        roomId: null,
        locatorText: null,
        evidenceIds: [],
        lifecycleStatus: "active",
        archivedAt: null,
        syncStatus: "synced",
        createdAt: change.changedAt,
        updatedAt: change.changedAt
      };
      return { ...workspace, assets: [...workspace.assets, asset] };
    }
    if (!localOperationIds.has(body.operationId)) {
      throw new SyncApplyError(
        "A remote Asset create collided with an existing local Asset."
      );
    }
    const assets = [...workspace.assets];
    const current = assets[assetIndex]!;
    assets[assetIndex] = {
      ...current,
      name,
      categoryId,
      categoryLabel: current.categoryLabel || categoryLabel(categoryId),
      version: Math.max(current.version, change.version),
      updatedAt: change.changedAt
    };
    return { ...workspace, assets };
  }
  if (assetIndex < 0) {
    throw new SyncApplyError(
      "The server Asset change references an unavailable Passport."
    );
  }
  const current = workspace.assets[assetIndex]!;
  assertEntityVersion(
    current.version,
    change.version,
    body.operationId,
    localOperationIds
  );
  let asset: NativeAsset;
  if (body.command === "asset.update") {
    asset = {
      ...current,
      ...(typeof body.payload.name === "string" &&
      body.payload.name.trim()
        ? { name: body.payload.name.trim() }
        : {}),
      version: Math.max(current.version, change.version),
      updatedAt: change.changedAt
    };
  } else if (body.command === "asset.category.set") {
    const categoryId = requiredString(
      body.payload,
      "categoryId",
      180
    );
    asset = {
      ...clearLegacyAssetField(current, "category"),
      categoryId,
      categoryLabel: categoryLabel(categoryId),
      version: Math.max(current.version, change.version),
      updatedAt: change.changedAt
    };
  } else if (body.command === "asset.primary-photo.set") {
    const evidenceId = requiredString(body.payload, "evidenceId");
    const selectedEvidence = workspace.evidence.find(
      (evidence) =>
        evidence.id === evidenceId &&
        evidence.assetId === current.id &&
        evidence.householdId === current.householdId &&
        evidence.kind === "media"
    );
    if (!selectedEvidence) {
      throw new SyncApplyError(
        "The server primary photo references unavailable media Evidence."
      );
    }
    const preserveLocalCopy =
      localOperationIds.has(body.operationId) &&
      current.photoEvidenceId === evidenceId;
    asset = {
      ...clearLegacyAssetField(current, "primary-photo"),
      photoEvidenceId: evidenceId,
      evidenceIds: current.evidenceIds.filter(
        (candidate) => candidate !== evidenceId
      ),
      ...(preserveLocalCopy
        ? {}
        : {
            photoUri: null,
            photoProtectedUri: null,
            photoChecksumSha256: null
          }),
      version: Math.max(current.version, change.version),
      updatedAt: change.changedAt
    };
  } else if (
    body.command === "asset.archive" ||
    body.command === "asset.restore"
  ) {
    const archived = body.command === "asset.archive";
    asset = {
      ...current,
      lifecycleStatus: archived ? "archived" : "active",
      archivedAt: archived
        ? nullableString(body.payload, "archivedAt") ?? change.changedAt
        : null,
      version: Math.max(current.version, change.version),
      updatedAt: change.changedAt
    };
  } else if (body.command === "asset.move") {
    const status = body.payload.status;
    if (
      status !== "known" &&
      status !== "needs-detail" &&
      status !== "unknown"
    ) {
      throw new SyncApplyError(
        "The server Asset location status is invalid."
      );
    }
    const placeId = nullableString(body.payload, "placeId");
    const roomId = nullableString(body.payload, "spaceId");
    const place = placeId
      ? workspace.places.find((candidate) => candidate.id === placeId)
      : null;
    if (placeId && !place) {
      throw new SyncApplyError(
        "The server Asset location references an unavailable Place."
      );
    }
    if (
      roomId &&
      (!place || !place.rooms.some((room) => room.id === roomId))
    ) {
      throw new SyncApplyError(
        "The server Asset location references an unavailable space."
      );
    }
    const locationRevisionVersion = integerResult(
      body.result,
      "locationVersion",
      change.version
    );
    if (
      !localOperationIds.has(body.operationId) &&
      locationRevisionVersion !==
        Math.max(0, current.locationRevisionVersion ?? 0) + 1
    ) {
      throw new SyncApplyError(
        "The server Asset location revision skipped or repeated a version."
      );
    }
    asset = {
      ...current,
      locationStatus: status,
      placeId,
      roomId,
      locatorText: nullableString(body.payload, "locationDetail"),
      locationRevisionVersion: Math.max(
        current.locationRevisionVersion ?? 0,
        locationRevisionVersion
      ),
      version: Math.max(current.version, change.version),
      updatedAt: change.changedAt
    };
  } else {
    throw new SyncApplyError("The server Asset command is unsupported.");
  }
  const assets = [...workspace.assets];
  assets[assetIndex] = asset;
  return { ...workspace, assets };
}

const evidenceKinds = new Set([
  "paper",
  "artifact",
  "media",
  "record",
  "note",
  "link"
]);
const evidenceRelations = new Set([
  "ownership",
  "identity",
  "service",
  "provenance",
  "condition",
  "insurance",
  "valuation",
  "legal",
  "access",
  "context",
  "other"
]);

function applyEvidenceChange(
  workspace: NativeWorkspace,
  change: SyncChange,
  body: ParsedChangeBody,
  localOperationIds: ReadonlySet<string>
): NativeWorkspace {
  if (body.command === "evidence.create") {
    const assetId = requiredString(body.payload, "assetId");
    const assetIndex = workspace.assets.findIndex(
      (asset) => asset.id === assetId
    );
    if (assetIndex < 0) {
      throw new SyncApplyError(
        "The server Evidence references an unavailable Asset."
      );
    }
    const evidenceIndex = workspace.evidence.findIndex(
      (evidence) => evidence.id === change.entityId
    );
    if (evidenceIndex >= 0) {
      if (!localOperationIds.has(body.operationId)) {
        throw new SyncApplyError(
          "A remote Evidence create collided with local Evidence."
        );
      }
      const evidence = [...workspace.evidence];
      evidence[evidenceIndex] = {
        ...evidence[evidenceIndex]!,
        version: Math.max(evidence[evidenceIndex]!.version, change.version),
        updatedAt: change.changedAt
      };
      return { ...workspace, evidence };
    }
    if (change.version !== 1) {
      throw new SyncApplyError(
        "New server Evidence must begin at version one."
      );
    }
    const kind = body.payload.kind;
    const relation = body.payload.relation ?? "other";
    if (
      typeof kind !== "string" ||
      !evidenceKinds.has(kind) ||
      typeof relation !== "string" ||
      !evidenceRelations.has(relation)
    ) {
      throw new SyncApplyError("The server Evidence type is invalid.");
    }
    const title =
      nullableString(body.payload, "title", 255) ??
      "Supporting evidence";
    const evidence: NativeEvidence = {
      id: change.entityId,
      version: 1,
      versionId: `pending:${change.entityId}`,
      blobObjectId: `pending:${change.entityId}`,
      householdId: change.householdId,
      assetId,
      kind: kind as NativeEvidence["kind"],
      relation: relation as NativeEvidence["relation"],
      fileName: title,
      mimeType: "application/octet-stream",
      byteSize: 0,
      localUri: null,
      checksumSha256: null,
      reviewStatus: "pending",
      reviewedAt: null,
      storageState: "queued",
      capturedAt: change.changedAt,
      updatedAt: change.changedAt
    };
    const assets = [...workspace.assets];
    const asset = assets[assetIndex]!;
    const shouldInferLegacyPrimaryPhoto =
      kind === "media" &&
      relation === "condition" &&
      asset.photoEvidenceId === null;
    assets[assetIndex] = {
      ...asset,
      ...(shouldInferLegacyPrimaryPhoto
        ? { photoEvidenceId: evidence.id }
        : { evidenceIds: [...asset.evidenceIds, evidence.id] })
    };
    return {
      ...workspace,
      assets,
      evidence: [...workspace.evidence, evidence]
    };
  }

  const evidenceId =
    body.command === "evidence.version.add"
      ? requiredString(body.payload, "evidenceId")
      : change.entityId;
  const evidenceIndex = workspace.evidence.findIndex(
    (evidence) => evidence.id === evidenceId
  );
  if (evidenceIndex < 0) {
    throw new SyncApplyError(
      "The server Evidence change references an unavailable record."
    );
  }
  const current = workspace.evidence[evidenceIndex]!;
  assertEntityVersion(
    current.version,
    change.version,
    body.operationId,
    localOperationIds
  );
  let evidence: NativeEvidence;
  let clearPrimaryPhotoLocalCopy = false;
  if (body.command === "evidence.review") {
    const reviewStatus = body.payload.reviewStatus;
    if (reviewStatus !== "pending" && reviewStatus !== "reviewed") {
      throw new SyncApplyError(
        "The server Evidence review state is invalid."
      );
    }
    const reviewedAt = nullableString(body.payload, "reviewedAt");
    evidence = {
      ...current,
      version: Math.max(current.version, change.version),
      reviewStatus,
      reviewedAt:
        reviewStatus === "reviewed"
          ? reviewedAt ?? change.changedAt
          : null,
      updatedAt: change.changedAt
    };
  } else if (body.command === "evidence.version.add") {
    const byteSize = body.payload.byteSize;
    const checksum = body.payload.checksumSha256;
    if (
      typeof byteSize !== "number" ||
      !Number.isSafeInteger(byteSize) ||
      byteSize < 1 ||
      byteSize > 10 * 1024 * 1024 ||
      typeof checksum !== "string" ||
      !/^[a-f0-9]{64}$/u.test(checksum)
    ) {
      throw new SyncApplyError(
        "The server Evidence version metadata is invalid."
      );
    }
    const blobObjectId = requiredString(
      body.payload,
      "blobObjectId"
    );
    const fileName = requiredString(body.payload, "fileName", 255);
    const mimeType = requiredString(body.payload, "mimeType", 160);
    const preserveProtectedLocalCopy =
      localOperationIds.has(body.operationId) &&
      current.versionId === change.entityId &&
      current.blobObjectId === blobObjectId &&
      current.fileName === fileName &&
      current.mimeType === mimeType &&
      current.byteSize === byteSize &&
      current.checksumSha256 === checksum;
    clearPrimaryPhotoLocalCopy = !preserveProtectedLocalCopy;
    evidence = {
      ...current,
      version: Math.max(current.version, change.version),
      versionId: change.entityId,
      blobObjectId,
      fileName,
      mimeType,
      byteSize,
      checksumSha256: checksum,
      localUri: preserveProtectedLocalCopy ? current.localUri : null,
      storageState: "synced",
      updatedAt: change.changedAt
    };
  } else {
    throw new SyncApplyError(
      "The server Evidence command is unsupported."
    );
  }
  const evidenceRecords = [...workspace.evidence];
  evidenceRecords[evidenceIndex] = evidence;
  return {
    ...workspace,
    evidence: evidenceRecords,
    assets: clearPrimaryPhotoLocalCopy
      ? workspace.assets.map((asset) =>
          asset.photoEvidenceId === evidence.id
            ? {
                ...asset,
                photoUri: null,
                photoProtectedUri: null,
                photoChecksumSha256: null
              }
            : asset
        )
      : workspace.assets
  };
}

function applyPlaceDocumentChange(
  workspace: NativeWorkspace,
  change: SyncChange,
  body: ParsedChangeBody,
  localOperationIds: ReadonlySet<string>
): NativeWorkspace {
  if (body.command === "place-document.create") {
    const placeId = requiredString(body.payload, "placeId");
    if (
      !workspace.places.some(
        (place) =>
          place.id === placeId &&
          place.householdId === workspace.household.id
      )
    ) {
      throw new SyncApplyError(
        "The server Place document references an unavailable Place."
      );
    }
    const kind = body.payload.kind;
    const relation = body.payload.relation;
    if (
      typeof kind !== "string" ||
      !evidenceKinds.has(kind) ||
      typeof relation !== "string" ||
      !evidenceRelations.has(relation)
    ) {
      throw new SyncApplyError(
        "The server Place document type is invalid."
      );
    }
    const title = requiredString(body.payload, "title", 180);
    const documents = [...(workspace.placeDocuments ?? [])];
    const documentIndex = documents.findIndex(
      (document) => document.id === change.entityId
    );
    if (documentIndex >= 0) {
      if (!localOperationIds.has(body.operationId)) {
        throw new SyncApplyError(
          "A remote Place document create collided with a local document."
        );
      }
      const current = documents[documentIndex]!;
      if (
        current.householdId !== change.householdId ||
        current.placeId !== placeId ||
        current.fileName !== title ||
        (current.kind !== undefined && current.kind !== kind) ||
        (current.relation !== undefined &&
          current.relation !== relation)
      ) {
        throw new SyncApplyError(
          "The acknowledged Place document does not match its local record."
        );
      }
      documents[documentIndex] = {
        ...current,
        version: Math.max(current.version ?? 1, change.version),
        kind:
          kind as NonNullable<NativePlaceDocument["kind"]>,
        relation:
          relation as NonNullable<
            NativePlaceDocument["relation"]
          >,
        updatedAt: change.changedAt
      };
      return { ...workspace, placeDocuments: documents };
    }
    if (change.version !== 1) {
      throw new SyncApplyError(
        "A new server Place document must begin at version one."
      );
    }
    const document: NativePlaceDocument = {
      id: change.entityId,
      version: 1,
      documentVersionNumber: 0,
      versionId: `pending:${change.entityId}`,
      blobObjectId: `pending:${change.entityId}`,
      householdId: change.householdId,
      placeId,
      kind: kind as NonNullable<NativePlaceDocument["kind"]>,
      relation:
        relation as NonNullable<
          NativePlaceDocument["relation"]
        >,
      fileName: title,
      mimeType: "application/octet-stream",
      byteSize: 0,
      localUri: null,
      checksumSha256: null,
      encryptedAtRest: false,
      storageState: "queued",
      capturedAt: change.changedAt,
      updatedAt: change.changedAt
    };
    return {
      ...workspace,
      placeDocuments: [...documents, document]
    };
  }

  if (body.command !== "place-document.version.add") {
    throw new SyncApplyError(
      "The server Place document command is unsupported."
    );
  }
  const placeDocumentId = requiredString(
    body.payload,
    "placeDocumentId"
  );
  const documents = [...(workspace.placeDocuments ?? [])];
  const documentIndex = documents.findIndex(
    (document) => document.id === placeDocumentId
  );
  if (documentIndex < 0) {
    throw new SyncApplyError(
      "The server Place document version references an unavailable record."
    );
  }
  const current = documents[documentIndex]!;
  assertEntityVersion(
    current.version ?? 1,
    change.version,
    body.operationId,
    localOperationIds
  );
  const byteSize = body.payload.byteSize;
  const checksum = body.payload.checksumSha256;
  if (
    typeof byteSize !== "number" ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > 10 * 1024 * 1024 ||
    typeof checksum !== "string" ||
    !/^[a-f0-9]{64}$/u.test(checksum)
  ) {
    throw new SyncApplyError(
      "The server Place document version metadata is invalid."
    );
  }
  const blobObjectId = requiredString(body.payload, "blobObjectId");
  const fileName = requiredString(body.payload, "fileName", 255);
  const mimeType = requiredString(body.payload, "mimeType", 160);
  const preserveProtectedLocalCopy =
    localOperationIds.has(body.operationId) &&
    current.versionId === change.entityId &&
    current.blobObjectId === blobObjectId &&
    current.fileName === fileName &&
    current.mimeType === mimeType &&
    current.byteSize === byteSize &&
    current.checksumSha256 === checksum;
  const previousDocumentVersion =
    current.documentVersionNumber ?? 0;
  const documentVersionNumber = integerResult(
    body.result,
    "documentVersionNumber",
    previousDocumentVersion + 1
  );
  if (
    !localOperationIds.has(body.operationId) &&
    documentVersionNumber !== previousDocumentVersion + 1
  ) {
    throw new SyncApplyError(
      "The server Place document version skipped or repeated an immutable version."
    );
  }
  documents[documentIndex] = {
    ...current,
    version: Math.max(current.version ?? 1, change.version),
    documentVersionNumber: Math.max(
      previousDocumentVersion,
      documentVersionNumber
    ),
    versionId: change.entityId,
    blobObjectId,
    fileName,
    mimeType,
    byteSize,
    checksumSha256: checksum,
    localUri: preserveProtectedLocalCopy ? current.localUri : null,
    encryptedAtRest: preserveProtectedLocalCopy
      ? current.encryptedAtRest
      : false,
    storageState: "synced",
    updatedAt: change.changedAt
  };
  return { ...workspace, placeDocuments: documents };
}

function liabilityDetails(
  payload: Readonly<Record<string, JsonValue>>
): Pick<NativeLiability, "name" | "kind"> {
  const name = requiredString(payload, "name", 120);
  const kind = payload.kind;
  if (!isLiabilityKind(kind)) {
    throw new SyncApplyError(
      "The server Liability category is invalid."
    );
  }
  return { name, kind };
}

function applyLiabilityChange(
  workspace: NativeWorkspace,
  change: SyncChange,
  body: ParsedChangeBody,
  localOperationIds: ReadonlySet<string>
): NativeWorkspace {
  const tombstone = getLiabilityTombstones(workspace).find(
    (candidate) => candidate.id === change.entityId
  );
  if (tombstone) {
    if (change.version <= tombstone.version) {
      return workspace;
    }
    throw new SyncApplyError(
      "A newer Liability change follows a local deletion marker."
    );
  }
  const liabilities = [...getLiabilities(workspace)];
  const index = liabilities.findIndex(
    (candidate) => candidate.id === change.entityId
  );
  if (body.command === "liability.create") {
    const details = liabilityDetails(body.payload);
    if (index < 0) {
      if (change.version !== 1) {
        throw new SyncApplyError(
          "A new Liability must begin at version one."
        );
      }
      liabilities.push({
        id: change.entityId,
        householdId: change.householdId,
        version: 1,
        ...details,
        lifecycleStatus: "active",
        archivedAt: null,
        syncStatus: "synced",
        createdAt: change.changedAt,
        updatedAt: change.changedAt
      });
    } else {
      if (!localOperationIds.has(body.operationId)) {
        throw new SyncApplyError(
          "A remote Liability collided with a local record."
        );
      }
      liabilities[index] = {
        ...liabilities[index]!,
        ...details,
        version: Math.max(
          liabilities[index]!.version,
          change.version
        ),
        syncStatus: "synced",
        updatedAt: change.changedAt
      };
    }
    return { ...workspace, liabilities };
  }
  if (
    body.command !== "liability.update" &&
    body.command !== "liability.archive" &&
    body.command !== "liability.restore"
  ) {
    throw new SyncApplyError(
      "The server Liability command is unsupported."
    );
  }
  if (index < 0) {
    throw new SyncApplyError(
      "The server Liability change references an unavailable record."
    );
  }
  const current = liabilities[index]!;
  assertEntityVersion(
    current.version,
    change.version,
    body.operationId,
    localOperationIds
  );
  if (body.command === "liability.update") {
    const details = liabilityDetails(body.payload);
    liabilities[index] = {
      ...current,
      ...details,
      version: Math.max(current.version, change.version),
      syncStatus: "synced",
      updatedAt: change.changedAt
    };
  } else {
    const lifecycleStatus =
      body.command === "liability.archive" ? "archived" : "active";
    const archivedAt =
      lifecycleStatus === "archived"
        ? nullableString(body.payload, "archivedAt", 40) ??
          change.changedAt
        : null;
    if (archivedAt !== null && !isIsoDateTime(archivedAt)) {
      throw new SyncApplyError(
        "The server Liability archive date is invalid."
      );
    }
    liabilities[index] = {
      ...current,
      version: Math.max(current.version, change.version),
      lifecycleStatus,
      archivedAt,
      syncStatus: "synced",
      updatedAt: change.changedAt
    };
  }
  return { ...workspace, liabilities };
}

function applyLiabilityReviewChange(
  workspace: NativeWorkspace,
  change: SyncChange,
  body: ParsedChangeBody,
  localOperationIds: ReadonlySet<string>
): NativeWorkspace {
  if (
    body.command !== "liability-review.set" ||
    body.payload.status !== "none-confirmed"
  ) {
    throw new SyncApplyError(
      "The server Liability review command is unsupported."
    );
  }
  const reviewedAt = requiredString(
    body.payload,
    "reviewedAt",
    10
  );
  const expiresAt = requiredString(
    body.payload,
    "expiresAt",
    10
  );
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(reviewedAt) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(expiresAt) ||
    !Number.isFinite(Date.parse(`${reviewedAt}T00:00:00.000Z`)) ||
    !Number.isFinite(Date.parse(`${expiresAt}T00:00:00.000Z`)) ||
    expiresAt < reviewedAt
  ) {
    throw new SyncApplyError(
      "The server Liability review dates are invalid."
    );
  }
  const current = getLiabilityReview(workspace);
  if (current) {
    assertEntityVersion(
      current.version,
      change.version,
      body.operationId,
      localOperationIds
    );
  } else if (change.version !== 1) {
    throw new SyncApplyError(
      "A new Liability review must begin at version one."
    );
  }
  const review: NativeLiabilityReview = {
    id: change.entityId,
    householdId: change.householdId,
    version: change.version,
    status: "none-confirmed",
    reviewedAt,
    expiresAt,
    activityWatermark: liabilityActivityWatermark(workspace),
    syncStatus: "synced",
    updatedAt: change.changedAt
  };
  return { ...workspace, liabilityReview: review };
}

function valuePayload(
  payload: Readonly<Record<string, JsonValue>>
): ({
  readonly subject: {
    readonly kind: "asset";
    readonly assetId: string;
  };
  readonly assetId: string;
  readonly placeId?: never;
  readonly liabilityId?: never;
} | {
  readonly subject: {
    readonly kind: "place";
    readonly placeId: string;
  };
  readonly placeId: string;
  readonly assetId?: never;
  readonly liabilityId?: never;
} | {
  readonly subject: {
    readonly kind: "liability";
    readonly liabilityId: string;
  };
  readonly liabilityId: string;
  readonly assetId?: never;
  readonly placeId?: never;
}) & {
  readonly amountMinor: number;
  readonly currency: string;
  readonly asOf: string;
  readonly source: "user-entered";
} {
  const assetId =
    typeof payload.assetId === "string" && payload.assetId.trim()
      ? payload.assetId.trim()
      : null;
  const placeId =
    typeof payload.placeId === "string" && payload.placeId.trim()
      ? payload.placeId.trim()
      : null;
  const liabilityId =
    typeof payload.liabilityId === "string" &&
    payload.liabilityId.trim()
      ? payload.liabilityId.trim()
      : null;
  const amountMinor = payload.amountMinor;
  const currency = payload.currency;
  const asOf = payload.asOf;
  const source = payload.source ?? "user-entered";
  if (
    [assetId, placeId, liabilityId].filter(
      (value) => value !== null
    ).length !== 1 ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/u.test(currency) ||
    typeof asOf !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(asOf) ||
    !Number.isFinite(Date.parse(`${asOf}T00:00:00.000Z`)) ||
    source !== "user-entered"
  ) {
    throw new SyncApplyError(
      "The server value assertion payload is invalid."
    );
  }
  const common = { amountMinor, currency, asOf, source } as const;
  if (assetId) {
    return {
        ...common,
        subject: { kind: "asset", assetId } as const,
        assetId
      };
  }
  if (placeId) {
    return {
        ...common,
        subject: { kind: "place", placeId } as const,
        placeId
      };
  }
  return {
    ...common,
    subject: {
      kind: "liability",
      liabilityId: liabilityId!
    } as const,
    liabilityId: liabilityId!
  };
}

function applyValueChange(
  workspace: NativeWorkspace,
  change: SyncChange,
  body: ParsedChangeBody,
  localOperationIds: ReadonlySet<string>
): NativeWorkspace {
  if (
    body.command !== "value.create" &&
    body.command !== "value.update"
  ) {
    throw new SyncApplyError(
      "The server value assertion command is unsupported."
    );
  }
  const payload = valuePayload(body.payload);
  const subjectAvailable =
    payload.subject.kind === "asset"
      ? workspace.assets.some(
          (candidate) =>
            candidate.id === payload.assetId &&
            candidate.householdId === change.householdId
        )
      : payload.subject.kind === "place"
        ? workspace.places.some(
          (candidate) =>
            candidate.id === payload.placeId &&
            candidate.householdId === change.householdId &&
            isOwnedPropertyPlace(candidate)
          )
        : getLiabilities(workspace).some(
            (candidate) =>
              candidate.id === payload.liabilityId &&
              candidate.householdId === change.householdId &&
              candidate.lifecycleStatus === "active"
          );
  if (!subjectAvailable) {
    throw new SyncApplyError(
      payload.subject.kind === "asset"
        ? "The server value assertion references an unavailable Asset."
        : payload.subject.kind === "place"
          ? "The server value assertion references an unavailable owned Property."
          : "The server value assertion references an unavailable Liability."
    );
  }
  const records = [...getPortfolioValueRecords(workspace)];
  const recordIndex = records.findIndex(
    (record) => record.id === change.entityId
  );
  const subjectFields =
    payload.subject.kind === "asset"
      ? {
          subject: payload.subject,
          assetId: payload.subject.assetId
        }
      : payload.subject.kind === "place"
        ? {
          subject: payload.subject,
          placeId: payload.subject.placeId
          }
        : {
            subject: payload.subject,
            liabilityId: payload.subject.liabilityId
          };
  const valueFields = {
    amountMinor: payload.amountMinor,
    currency: payload.currency,
    asOf: payload.asOf,
    source: payload.source
  } as const;
  if (body.command === "value.create") {
    if (recordIndex < 0) {
      if (change.version !== 1) {
        throw new SyncApplyError(
          "A new value assertion must begin at version one."
        );
      }
      records.push({
        id: change.entityId,
        householdId: change.householdId,
        ...subjectFields,
        version: 1,
        ...valueFields,
        updatedAt: change.changedAt,
        syncStatus: "synced"
      });
    } else {
      if (!localOperationIds.has(body.operationId)) {
        throw new SyncApplyError(
          "A remote value assertion collided with a local record."
        );
      }
      records[recordIndex] = {
        ...records[recordIndex]!,
        householdId: change.householdId,
        ...subjectFields,
        version: Math.max(
          records[recordIndex]!.version ?? 1,
          change.version
        ),
        ...valueFields,
        updatedAt: change.changedAt,
        syncStatus: "synced"
      };
    }
  } else {
    if (recordIndex < 0) {
      throw new SyncApplyError(
        "The server value update references an unavailable assertion."
      );
    }
    const current = records[recordIndex]!;
    assertEntityVersion(
      current.version ?? 1,
      change.version,
      body.operationId,
      localOperationIds
    );
    records[recordIndex] = {
      ...current,
      householdId: change.householdId,
      ...subjectFields,
      version: Math.max(current.version ?? 1, change.version),
      ...valueFields,
      updatedAt: change.changedAt,
      syncStatus: "synced"
    };
  }
  return { ...workspace, portfolioValueRecords: records };
}

export function applyServerChanges(
  workspace: NativeWorkspace,
  changes: readonly SyncChange[],
  options: {
    readonly householdId: string;
    readonly localOperationIds: ReadonlySet<string>;
    readonly conflictedEntityIds: ReadonlySet<string>;
  }
): NativeWorkspace {
  if (workspace.household.id !== options.householdId) {
    throw new SyncApplyError(
      "The local workspace does not match the active household."
    );
  }
  let next = workspace;
  let previousSequence = 0;
  for (const change of changes) {
    if (
      !Number.isSafeInteger(change.sequence) ||
      change.sequence < 1 ||
      change.sequence <= previousSequence ||
      change.householdId !== options.householdId ||
      !Number.isSafeInteger(change.version) ||
      change.version < 1 ||
      !isIsoDateTime(change.changedAt)
    ) {
      throw new SyncApplyError(
        "The server returned an invalid or out-of-order change."
      );
    }
    previousSequence = change.sequence;
    if (options.conflictedEntityIds.has(change.entityId)) {
      continue;
    }
    if (change.tombstoned) {
      next = removeTombstone(next, change);
      continue;
    }
    const body = parsedBody(change);
    if (options.conflictedEntityIds.has(change.entityId)) continue;
    if (change.entityType === "place") {
      next = applyPlaceChange(
        next,
        change,
        body,
        options.localOperationIds
      );
    } else if (change.entityType === "space") {
      next = applySpaceChange(
        next,
        change,
        body,
        options.localOperationIds
      );
    } else if (change.entityType === "asset") {
      next = applyAssetChange(
        next,
        change,
        body,
        options.localOperationIds
      );
    } else if (change.entityType === "evidence") {
      next = applyEvidenceChange(
        next,
        change,
        body,
        options.localOperationIds
      );
    } else if (change.entityType === "place-document") {
      next = applyPlaceDocumentChange(
        next,
        change,
        body,
        options.localOperationIds
      );
    } else if (change.entityType === "value") {
      next = applyValueChange(
        next,
        change,
        body,
        options.localOperationIds
      );
    } else if (change.entityType === "liability") {
      next = applyLiabilityChange(
        next,
        change,
        body,
        options.localOperationIds
      );
    } else if (change.entityType === "liability-review") {
      next = applyLiabilityReviewChange(
        next,
        change,
        body,
        options.localOperationIds
      );
    } else {
      throw new SyncApplyError(
        `The server entity type ${change.entityType} is unsupported.`
      );
    }
  }
  return next;
}

function mergeConflicts(
  existing: readonly SyncConflict[],
  incoming: readonly SyncConflict[]
): readonly SyncConflict[] {
  const merged = new Map(
    existing.map((conflict) => [conflict.operationId, conflict])
  );
  for (const conflict of incoming) {
    merged.set(conflict.operationId, conflict);
  }
  return [...merged.values()];
}

function validatePushResponse(
  pushed: readonly SyncOperation[],
  acknowledgedOperationIds: readonly string[],
  conflicts: readonly SyncConflict[]
): void {
  const pushedIds = new Set(
    pushed.map((operation) => operation.operationId)
  );
  const acknowledged = new Set<string>();
  for (const operationId of acknowledgedOperationIds) {
    if (!pushedIds.has(operationId) || acknowledged.has(operationId)) {
      throw new SyncApplyError(
        "The sync service acknowledged an operation that was not pushed."
      );
    }
    acknowledged.add(operationId);
  }
  const conflicted = new Set<string>();
  for (const conflict of conflicts) {
    if (
      !pushedIds.has(conflict.operationId) ||
      acknowledged.has(conflict.operationId) ||
      conflicted.has(conflict.operationId)
    ) {
      throw new SyncApplyError(
        "The sync service returned an invalid conflict ledger."
      );
    }
    conflicted.add(conflict.operationId);
  }
}

function runtimeFailureKind(error: ContractError): SyncFailureKind {
  return error.code === "OFFLINE" || error.code === "RATE_LIMITED"
    ? "offline"
    : "needs-attention";
}

async function hydrateCloudEvidence(
  request: ForegroundSyncRequest,
  workspace: NativeWorkspace
): Promise<{
  readonly workspace: NativeWorkspace;
  readonly error: ContractError | null;
}> {
  const needsDownload = workspace.evidence.some(
    (evidence) =>
      evidence.storageState === "synced" && evidence.localUri === null
  ) || (workspace.placeDocuments ?? []).some(
    (document) =>
      document.storageState === "synced" &&
      document.localUri === null
  );
  if (!needsDownload) {
    return { workspace, error: null };
  }
  if (!request.attachmentStore || !request.evidenceDownloadPort) {
    return {
      workspace,
      error: failure(
        "STORAGE_UNAVAILABLE",
        "Signed Evidence download is not configured. Cloud metadata remains available for retry.",
        true
      )
    };
  }

  const hydrated = await reconcileEvidenceDownloads({
    workspace,
    attachmentStore: request.attachmentStore,
    downloadPort: request.evidenceDownloadPort,
    ...(request.execution ? { execution: request.execution } : {})
  });
  return hydrated.ok
    ? { workspace: hydrated.workspace, error: null }
    : { workspace: hydrated.workspace, error: hydrated.error };
}

function prerequisitesSatisfied(
  operation: SyncOperation,
  storedBlobObjectIds: ReadonlySet<string>
): boolean {
  return operation.prerequisites.every(
    (prerequisite) =>
      prerequisite.kind === "blob-stored" &&
      storedBlobObjectIds.has(prerequisite.blobObjectId)
  );
}

function operationOrderingKey(operation: SyncOperation): string {
  const command = operation.command;
  if (
    command.type === "evidence.version.add" &&
    typeof command.payload.evidenceId === "string"
  ) {
    return `evidence:${command.payload.evidenceId}`;
  }
  if (
    command.type === "place-document.version.add" &&
    typeof command.payload.placeDocumentId === "string"
  ) {
    return `place-document:${command.payload.placeDocumentId}`;
  }
  return `${command.type.split(".", 1)[0]}:${command.aggregateId ?? operation.operationId}`;
}

/**
 * Preserves per-record command order when an earlier operation is waiting on
 * verified bytes. Independent records may continue syncing, but a later
 * Asset command can never overtake its pending primary-photo selection and
 * manufacture a version conflict.
 */
export function selectPushableOperations(
  operations: readonly SyncOperation[],
  storedBlobObjectIds: ReadonlySet<string>,
  limit = 100
): readonly SyncOperation[] {
  const blockedOrderingKeys = new Set<string>();
  const pushable: SyncOperation[] = [];
  for (const operation of operations) {
    if (pushable.length >= limit) break;
    const orderingKey = operationOrderingKey(operation);
    if (blockedOrderingKeys.has(orderingKey)) continue;
    if (!prerequisitesSatisfied(operation, storedBlobObjectIds)) {
      blockedOrderingKeys.add(orderingKey);
      continue;
    }
    pushable.push(operation);
  }
  return pushable;
}

function validateBootstrapDescriptor(
  descriptor: WorkspaceBootstrapDescriptor,
  request: Pick<ForegroundSyncRequest, "householdId" | "accountId">
): void {
  if (
    descriptor.householdId !== request.householdId ||
    (request.accountId !== undefined &&
      descriptor.accountId !== request.accountId) ||
    !descriptor.householdName.trim() ||
    descriptor.householdName.length > 120 ||
    !Number.isSafeInteger(descriptor.householdVersion) ||
    descriptor.householdVersion < 1 ||
    !isIsoDateTime(descriptor.householdCreatedAt) ||
    !descriptor.membershipId ||
    !descriptor.accountId ||
    (descriptor.role !== "owner" &&
      descriptor.role !== "editor" &&
      descriptor.role !== "viewer") ||
    !Number.isSafeInteger(descriptor.membershipVersion) ||
    descriptor.membershipVersion < 1
  ) {
    throw new SyncApplyError(
      "The server workspace identity does not match this signed session."
    );
  }
}

export function createWorkspaceFromBootstrap(
  descriptor: WorkspaceBootstrapDescriptor,
  deviceId: string,
  timestamp: string
): NativeWorkspace {
  if (!deviceId.trim() || deviceId.length > 512) {
    throw new SyncApplyError(
      "A valid device identity is required to restore this workspace."
    );
  }
  const base = createWorkspace(
    "personal",
    descriptor.householdCreatedAt,
    {
      householdId: descriptor.householdId,
      ownerMemberId: descriptor.membershipId,
      deviceId
    }
  );
  return {
    ...base,
    household: {
      id: descriptor.householdId,
      name: descriptor.householdName.trim()
    },
    members: [
      {
        ...base.members[0]!,
        id: descriptor.membershipId,
        householdId: descriptor.householdId,
        role: descriptor.role,
        lastActiveAt: timestamp
      }
    ],
    syncStatus: "syncing",
    createdAt: descriptor.householdCreatedAt,
    updatedAt: timestamp
  };
}

function refreshWorkspaceIdentity(
  workspace: NativeWorkspace,
  descriptor: WorkspaceBootstrapDescriptor,
  timestamp: string
): NativeWorkspace {
  const currentMember = {
    id: descriptor.membershipId,
    householdId: descriptor.householdId,
    name: "You",
    initials: "YO",
    role: descriptor.role,
    status: "active" as const,
    lastActiveAt: timestamp
  };
  const membershipIndex = workspace.members.findIndex(
    (member) => member.id === descriptor.membershipId
  );
  const placeholderIndex =
    membershipIndex >= 0
      ? membershipIndex
      : workspace.members.findIndex(
          (member) =>
            member.householdId === descriptor.householdId &&
            member.name === "You"
        );
  const members =
    placeholderIndex >= 0
      ? workspace.members.map((member, index) =>
          index === placeholderIndex ? currentMember : member
        )
      : [...workspace.members, currentMember];
  return {
    ...workspace,
    household: {
      id: descriptor.householdId,
      name: descriptor.householdName.trim()
    },
    members,
    updatedAt: timestamp
  };
}

async function bootstrapCleanWorkspace(
  request: ForegroundSyncRequest,
  loadedRevision: number,
  existingConflicts: readonly SyncConflict[]
): Promise<ForegroundSyncResult> {
  if (!request.deviceId) {
    return {
      kind: "needs-attention",
      revision: loadedRevision,
      workspace: null,
      cursor: INITIAL_CURSOR,
      conflicts: existingConflicts,
      error: failure(
        "VALIDATION_FAILED",
        "A device identity is required to restore this household.",
        false
      )
    };
  }

  let cursor = INITIAL_CURSOR;
  let descriptor: WorkspaceBootstrapDescriptor | null = null;
  const changes: SyncChange[] = [];
  // The endpoint currently returns at most 500 changes. Continue from each
  // durable cursor until an empty page proves the clean-device snapshot is
  // complete; never expose a partially restored household.
  for (let page = 0; page < 40; page += 1) {
    const pulled = await runSyncProviderBoundary(
      request.execution,
      (context) =>
        request.transport.pull(
          request.householdId,
          cursor,
          context
        )
    );
    if (!pulled.ok) {
      return {
        kind: runtimeFailureKind(pulled.error),
        revision: loadedRevision,
        workspace: null,
        cursor: INITIAL_CURSOR,
        conflicts: existingConflicts,
        error: pulled.error
      };
    }
    try {
      validateBootstrapDescriptor(pulled.value.workspace, request);
      if (
        descriptor !== null &&
        (descriptor.householdId !==
          pulled.value.workspace.householdId ||
          descriptor.membershipId !==
            pulled.value.workspace.membershipId ||
          descriptor.membershipVersion !==
            pulled.value.workspace.membershipVersion)
      ) {
        throw new SyncApplyError(
          "Household access changed while the workspace was restoring."
        );
      }
    } catch (caught) {
      return {
        kind: "needs-attention",
        revision: loadedRevision,
        workspace: null,
        cursor: INITIAL_CURSOR,
        conflicts: existingConflicts,
        error: failure(
          "VALIDATION_FAILED",
          caught instanceof Error
            ? caught.message
            : "The server workspace identity is invalid.",
          false
        )
      };
    }
    descriptor = pulled.value.workspace;
    if (
      pulled.value.cursor.cursorVersion !== 1 ||
      (pulled.value.changes.length > 0 &&
        pulled.value.cursor.value === cursor.value)
    ) {
      return {
        kind: "needs-attention",
        revision: loadedRevision,
        workspace: null,
        cursor: INITIAL_CURSOR,
        conflicts: existingConflicts,
        error: failure(
          "INVALID_CURSOR",
          "The sync service did not advance the workspace restore cursor.",
          false
        )
      };
    }
    changes.push(...pulled.value.changes);
    cursor = pulled.value.cursor;
    if (pulled.value.changes.length === 0) break;
    if (page === 39) {
      return {
        kind: "needs-attention",
        revision: loadedRevision,
        workspace: null,
        cursor: INITIAL_CURSOR,
        conflicts: existingConflicts,
        error: failure(
          "INVALID_CURSOR",
          "The workspace restore exceeded its safe page limit.",
          true
        )
      };
    }
  }

  if (descriptor === null) {
    return {
      kind: "needs-attention",
      revision: loadedRevision,
      workspace: null,
      cursor: INITIAL_CURSOR,
      conflicts: existingConflicts,
      error: failure(
        "VALIDATION_FAILED",
        "The sync service did not identify the active household.",
        false
      )
    };
  }

  const timestamp = request.now?.() ?? new Date().toISOString();
  let workspace: NativeWorkspace;
  try {
    workspace = applyServerChanges(
      createWorkspaceFromBootstrap(
        descriptor,
        request.deviceId,
        timestamp
      ),
      changes,
      {
        householdId: request.householdId,
        localOperationIds: new Set(),
        conflictedEntityIds: new Set()
      }
    );
  } catch (caught) {
    return {
      kind: "needs-attention",
      revision: loadedRevision,
      workspace: null,
      cursor: INITIAL_CURSOR,
      conflicts: existingConflicts,
      error: failure(
        "VALIDATION_FAILED",
        caught instanceof Error
          ? caught.message
          : "The server workspace could not be restored.",
        false
      )
    };
  }

  const restoredMetadata: NativeWorkspace = {
    ...workspace,
    assets: workspace.assets.map((asset) => ({
      ...asset,
      syncStatus:
        (asset.localOnlyFields?.length ?? 0) > 0
          ? "on-device"
          : "synced"
    })),
    portfolioValueRecords: getPortfolioValueRecords(workspace).map(
      (record) => ({
        ...record,
        syncStatus: "synced"
      })
    ),
    liabilities: getLiabilities(workspace).map((liability) => ({
      ...liability,
      syncStatus: "synced"
    })),
    liabilityTombstones: getLiabilityTombstones(workspace).map(
      (tombstone) => ({
        ...tombstone,
        syncStatus: "synced"
      })
    ),
    ...(getLiabilityReview(workspace)
      ? {
          liabilityReview: {
            ...getLiabilityReview(workspace)!,
            syncStatus: "synced" as const
          }
        }
      : {}),
    syncStatus: "ready",
    lastSyncedAt: timestamp,
    updatedAt: changes.at(-1)?.changedAt ?? timestamp
  };
  const hydration = await hydrateCloudEvidence(
    request,
    restoredMetadata
  );
  const restored = hydration.workspace;
  const committed = await runSyncLocalBoundary(
    request.execution,
    () =>
      request.repository.commitSync({
        expectedRevision: loadedRevision,
        nextRevision: loadedRevision + 1,
        snapshot: restored,
        cursor,
        acknowledgedOperationIds: [],
        conflicts: existingConflicts
      })
  );
  if (!committed.ok) {
    return {
      kind: "needs-attention",
      revision: loadedRevision,
      workspace: null,
      cursor: INITIAL_CURSOR,
      conflicts: existingConflicts,
      error: committed.error
    };
  }
  if (hydration.error) {
    return {
      kind: runtimeFailureKind(hydration.error),
      revision: committed.value.revision,
      workspace: restored,
      cursor,
      conflicts: existingConflicts,
      error: hydration.error
    };
  }
  return {
    kind: "synced",
    revision: committed.value.revision,
    workspace: restored,
    cursor,
    conflicts: existingConflicts,
    acknowledgedOperationIds: []
  };
}

export async function reconcileForeground(
  request: ForegroundSyncRequest
): Promise<ForegroundSyncResult> {
  assertSyncExecutionActive(request.execution);
  const [loaded, syncState] = await runSyncLocalBoundary(
    request.execution,
    () =>
      Promise.all([
        request.repository.load(),
        request.repository.loadSyncState()
      ])
  );
  const cursor = syncState.cursor ?? INITIAL_CURSOR;
  if (loaded.snapshot === null) {
    const pending = await runSyncLocalBoundary(
      request.execution,
      () => request.repository.listPendingOperations(1)
    );
    if (pending.length > 0) {
      return {
        kind: "needs-attention",
        revision: loaded.revision,
        workspace: null,
        cursor,
        conflicts: syncState.conflicts,
        error: failure(
          "CONFLICT_REQUIRES_REVIEW",
          "The clean vault contains an outbox without a workspace snapshot.",
          false
        )
      };
    }
    return bootstrapCleanWorkspace(
      request,
      loaded.revision,
      syncState.conflicts
    );
  }
  if (
    !isNativeWorkspace(loaded.snapshot) ||
    loaded.snapshot.household.id !== request.householdId
  ) {
    return {
      kind: "needs-attention",
      revision: loaded.revision,
      workspace: null,
      cursor,
      conflicts: syncState.conflicts,
      error: failure(
        "CONFLICT_REQUIRES_REVIEW",
        "The local workspace does not match the selected household.",
        false
      )
    };
  }
  let initialWorkspace: NativeWorkspace = loaded.snapshot;

  const allPending = await runSyncLocalBoundary(
    request.execution,
    () => request.repository.listPendingOperations(1000)
  );
  const hasEvidenceUploadPrerequisites = allPending.some(
    (operation) =>
      (operation.command.type === "evidence.version.add" ||
        operation.command.type === "place-document.version.add") &&
      operation.prerequisites.some(
        (prerequisite) => prerequisite.kind === "blob-stored"
      )
  );
  let uploadError: ContractError | null = null;
  let storedBlobObjectIds: ReadonlySet<string> = new Set([
    ...initialWorkspace.evidence
      .filter((evidence) => evidence.storageState === "synced")
      .map((evidence) => evidence.blobObjectId),
    ...(initialWorkspace.placeDocuments ?? [])
      .filter((document) => document.storageState === "synced")
      .map((document) => document.blobObjectId)
  ]);
  if (hasEvidenceUploadPrerequisites) {
    if (request.attachmentStore && request.evidenceUploadPort) {
      const uploadResult = await reconcileEvidenceUploads({
        workspace: initialWorkspace,
        operations: allPending,
        attachmentStore: request.attachmentStore,
        uploadPort: request.evidenceUploadPort,
        ...(request.canMaterializeProtectedAttachment
          ? {
              canMaterializeProtectedAttachment:
                request.canMaterializeProtectedAttachment
            }
          : {}),
        ...(request.now ? { now: request.now } : {}),
        ...(request.execution ? { execution: request.execution } : {})
      });
      storedBlobObjectIds = uploadResult.storedBlobObjectIds;
      if (!uploadResult.ok) uploadError = uploadResult.error;
    } else {
      uploadError = failure(
        "STORAGE_UNAVAILABLE",
        "Signed Evidence upload is not configured. The protected file remains queued on this device.",
        true
      );
    }
  }
  const pushable = selectPushableOperations(
    allPending,
    storedBlobObjectIds,
    100
  );
  let acknowledgedOperationIds: readonly string[] = [];
  let incomingConflicts: readonly SyncConflict[] = [];
  if (pushable.length > 0) {
    const pushed = await runSyncProviderBoundary(
      request.execution,
      (context) => request.transport.push(pushable, context)
    );
    if (!pushed.ok) {
      return {
        kind: runtimeFailureKind(pushed.error),
        revision: loaded.revision,
        workspace: initialWorkspace,
        cursor,
        conflicts: syncState.conflicts,
        error: pushed.error
      };
    }
    try {
      validatePushResponse(
        pushable,
        pushed.value.acknowledgedOperationIds,
        pushed.value.conflicts
      );
    } catch (caught) {
      return {
        kind: "needs-attention",
        revision: loaded.revision,
        workspace: initialWorkspace,
        cursor,
        conflicts: syncState.conflicts,
        error: failure(
          "VALIDATION_FAILED",
          caught instanceof Error
            ? caught.message
            : "The sync acknowledgement was invalid.",
          false
        )
      };
    }
    acknowledgedOperationIds = pushed.value.acknowledgedOperationIds;
    incomingConflicts = pushed.value.conflicts;
    // Never advance from the push cursor: it may skip earlier operations from
    // another device. Only a pull from the durable cursor can advance safely.
  }

  const pulled = await runSyncProviderBoundary(
    request.execution,
    (context) =>
      request.transport.pull(request.householdId, cursor, context)
  );
  if (!pulled.ok) {
    // A push may already have reached the server. Keep every operation in the
    // outbox and retry the same idempotency keys from the durable cursor.
    return {
      kind: runtimeFailureKind(pulled.error),
      revision: loaded.revision,
      workspace: initialWorkspace,
      cursor,
      conflicts: syncState.conflicts,
      error: pulled.error
    };
  }
  if (
    pulled.value.cursor.cursorVersion !== 1 ||
    (pulled.value.changes.length > 0 &&
      pulled.value.cursor.value === cursor.value)
  ) {
    return {
      kind: "needs-attention",
      revision: loaded.revision,
      workspace: initialWorkspace,
      cursor,
      conflicts: syncState.conflicts,
      error: failure(
        "INVALID_CURSOR",
        "The sync service did not advance an applied change cursor.",
        false
      )
    };
  }
  try {
    validateBootstrapDescriptor(pulled.value.workspace, request);
  } catch (caught) {
    return {
      kind: "needs-attention",
      revision: loaded.revision,
      workspace: initialWorkspace,
      cursor,
      conflicts: syncState.conflicts,
      error: failure(
        "VALIDATION_FAILED",
        caught instanceof Error
          ? caught.message
          : "The server workspace identity is invalid.",
        false
      )
    };
  }
  const timestamp = request.now?.() ?? new Date().toISOString();
  initialWorkspace = refreshWorkspaceIdentity(
    initialWorkspace,
    pulled.value.workspace,
    timestamp
  );

  let capturedIncomingConflicts: readonly SyncConflict[];
  try {
    capturedIncomingConflicts = captureConflictContexts(
      incomingConflicts,
      pushable,
      pulled.value.changes,
      request.householdId,
      timestamp
    );
  } catch (caught) {
    return {
      kind: "needs-attention",
      revision: loaded.revision,
      workspace: initialWorkspace,
      cursor,
      conflicts: syncState.conflicts,
      error: failure(
        "VALIDATION_FAILED",
        caught instanceof Error
          ? caught.message
          : "The conflict provenance was invalid.",
        false
      )
    };
  }
  const acknowledged = new Set(acknowledgedOperationIds);
  const incomingConflictOperationIds = new Set(
    capturedIncomingConflicts.map((conflict) => conflict.operationId)
  );
  const resolvedConflictOperationIds: string[] = [];
  const retainedExistingConflicts = syncState.conflicts.filter(
    (conflict) => {
      const replacementOperationId =
        conflictReplacementOperationId(conflict);
      if (
        replacementOperationId !== null &&
        (acknowledged.has(replacementOperationId) ||
          incomingConflictOperationIds.has(replacementOperationId))
      ) {
        resolvedConflictOperationIds.push(conflict.operationId);
        return false;
      }
      return true;
    }
  );
  const conflicts = mergeConflicts(
    retainedExistingConflicts,
    capturedIncomingConflicts
  );
  const durablyAcknowledgedOperationIds = [
    ...acknowledgedOperationIds,
    ...resolvedConflictOperationIds
  ];
  const localOperationIds = new Set(
    allPending.map((operation) => operation.operationId)
  );
  const conflictedEntityIds = new Set(
    conflicts.map((conflict) => conflict.entityId)
  );
  let applied: NativeWorkspace;
  try {
    applied = applyServerChanges(initialWorkspace, pulled.value.changes, {
      householdId: request.householdId,
      localOperationIds,
      conflictedEntityIds
    });
  } catch (caught) {
    return {
      kind: "needs-attention",
      revision: loaded.revision,
      workspace: initialWorkspace,
      cursor,
      conflicts: syncState.conflicts,
      error: failure(
        "VALIDATION_FAILED",
        caught instanceof Error
          ? caught.message
          : "A server change could not be applied.",
        false
      )
    };
  }

  const conflictedOperationIds = new Set(
    incomingConflicts.map((conflict) => conflict.operationId)
  );
  const remaining = allPending.filter(
    (operation) =>
      !acknowledged.has(operation.operationId) &&
      !conflictedOperationIds.has(operation.operationId)
  );
  const directlyPendingAssetIds = new Set(
    remaining
      .filter((operation) => operation.command.type.startsWith("asset."))
      .map((operation) => operation.command.aggregateId)
      .filter((assetId): assetId is string => assetId !== null)
  );
  const directlyAcknowledgedAssetIds = new Set(
    allPending
      .filter(
        (operation) =>
          acknowledged.has(operation.operationId) &&
          operation.command.type.startsWith("asset.")
      )
      .map((operation) => operation.command.aggregateId)
      .filter((assetId): assetId is string => assetId !== null)
  );
  const conflictedAssetIds = new Set(
    conflicts
      .filter((conflict) =>
        initialWorkspace.assets.some(
          (asset) => asset.id === conflict.entityId
        )
      )
      .map((conflict) => conflict.entityId)
  );
  const changedAssetIds = new Set(
    pulled.value.changes
      .filter((change) => change.entityType === "asset")
      .map((change) => change.entityId)
  );
  const pendingValueIds = new Set(
    remaining
      .filter((operation) => operation.command.type.startsWith("value."))
      .map((operation) => operation.command.aggregateId)
      .filter((valueId): valueId is string => valueId !== null)
  );
  const acknowledgedValueIds = new Set(
    allPending
      .filter(
        (operation) =>
          acknowledged.has(operation.operationId) &&
          operation.command.type.startsWith("value.")
      )
      .map((operation) => operation.command.aggregateId)
      .filter((valueId): valueId is string => valueId !== null)
  );
  const conflictedValueIds = new Set(
    conflicts
      .filter((conflict) =>
        getPortfolioValueRecords(initialWorkspace).some(
          (record) => record.id === conflict.entityId
        )
      )
      .map((conflict) => conflict.entityId)
  );
  const changedValueIds = new Set(
    pulled.value.changes
      .filter((change) => change.entityType === "value")
      .map((change) => change.entityId)
  );
  const pendingLiabilityIds = new Set(
    remaining
      .filter((operation) =>
        operation.command.type.startsWith("liability.")
      )
      .map((operation) => operation.command.aggregateId)
      .filter((value): value is string => value !== null)
  );
  const acknowledgedLiabilityIds = new Set(
    allPending
      .filter(
        (operation) =>
          acknowledged.has(operation.operationId) &&
          operation.command.type.startsWith("liability.")
      )
      .map((operation) => operation.command.aggregateId)
      .filter((value): value is string => value !== null)
  );
  const conflictedLiabilityIds = new Set(
    conflicts.flatMap((conflict) => {
      const operation = allPending.find(
        (candidate) =>
          candidate.operationId === conflict.operationId
      );
      return operation?.command.type.startsWith("liability.")
        ? [conflict.entityId]
        : [];
    })
  );
  const changedLiabilityIds = new Set(
    pulled.value.changes
      .filter((change) => change.entityType === "liability")
      .map((change) => change.entityId)
  );
  const pendingReviewIds = new Set(
    remaining
      .filter(
        (operation) =>
          operation.command.type === "liability-review.set"
      )
      .map((operation) => operation.command.aggregateId)
      .filter((value): value is string => value !== null)
  );
  const acknowledgedReviewIds = new Set(
    allPending
      .filter(
        (operation) =>
          acknowledged.has(operation.operationId) &&
          operation.command.type === "liability-review.set"
      )
      .map((operation) => operation.command.aggregateId)
      .filter((value): value is string => value !== null)
  );
  const conflictedReviewIds = new Set(
    conflicts.flatMap((conflict) => {
      const operation = allPending.find(
        (candidate) =>
          candidate.operationId === conflict.operationId
      );
      return operation?.command.type === "liability-review.set"
        ? [conflict.entityId]
        : [];
    })
  );
  const changedReviewIds = new Set(
    pulled.value.changes
      .filter(
        (change) => change.entityType === "liability-review"
      )
      .map((change) => change.entityId)
  );
  const nextWorkspaceMetadata: NativeWorkspace = {
    ...applied,
    assets: applied.assets.map((asset) => ({
      ...asset,
      syncStatus: conflictedAssetIds.has(asset.id)
        ? "needs-attention"
        : directlyPendingAssetIds.has(asset.id)
          ? "queued"
          : (asset.localOnlyFields?.length ?? 0) > 0
            ? "on-device"
            : directlyAcknowledgedAssetIds.has(asset.id) ||
                changedAssetIds.has(asset.id)
              ? "synced"
              : asset.syncStatus
    })),
    portfolioValueRecords: getPortfolioValueRecords(applied).map(
      (record) => ({
        ...record,
        syncStatus: conflictedValueIds.has(record.id)
          ? "needs-attention"
          : pendingValueIds.has(record.id)
            ? "queued"
            : acknowledgedValueIds.has(record.id) ||
                changedValueIds.has(record.id)
              ? "synced"
              : record.syncStatus ?? "on-device"
      })
    ),
    liabilities: getLiabilities(applied).map((liability) => ({
      ...liability,
      syncStatus: conflictedLiabilityIds.has(liability.id)
        ? "needs-attention"
        : pendingLiabilityIds.has(liability.id)
          ? "queued"
          : acknowledgedLiabilityIds.has(liability.id) ||
              changedLiabilityIds.has(liability.id)
            ? "synced"
            : liability.syncStatus
    })),
    liabilityTombstones: getLiabilityTombstones(applied).map(
      (tombstone) => ({
        ...tombstone,
        syncStatus: conflictedLiabilityIds.has(tombstone.id)
          ? "needs-attention"
          : pendingLiabilityIds.has(tombstone.id)
            ? "queued"
            : acknowledgedLiabilityIds.has(tombstone.id) ||
                changedLiabilityIds.has(tombstone.id)
              ? "synced"
              : tombstone.syncStatus
      })
    ),
    ...(getLiabilityReview(applied)
      ? {
          liabilityReview: {
            ...getLiabilityReview(applied)!,
            syncStatus: conflictedReviewIds.has(
              getLiabilityReview(applied)!.id
            )
              ? "needs-attention" as const
              : pendingReviewIds.has(
                  getLiabilityReview(applied)!.id
                )
                ? "queued" as const
                : acknowledgedReviewIds.has(
                      getLiabilityReview(applied)!.id
                    ) ||
                    changedReviewIds.has(
                      getLiabilityReview(applied)!.id
                    )
                  ? "synced" as const
                  : getLiabilityReview(applied)!.syncStatus
          }
        }
      : {}),
    syncStatus:
      conflicts.length > 0 ? "needs-attention" : "ready",
    lastSyncedAt: timestamp,
    updatedAt:
      pulled.value.changes.at(-1)?.changedAt ?? applied.updatedAt
  };
  const hydration = await hydrateCloudEvidence(
    request,
    nextWorkspaceMetadata
  );
  const nextWorkspace = hydration.workspace;

  const committed = await runSyncLocalBoundary(
    request.execution,
    () =>
      request.repository.commitSync({
        expectedRevision: loaded.revision,
        nextRevision: loaded.revision + 1,
        snapshot: nextWorkspace,
        cursor: pulled.value.cursor,
        acknowledgedOperationIds: durablyAcknowledgedOperationIds,
        conflicts
      })
  );
  if (!committed.ok) {
    return {
      kind: "needs-attention",
      revision: loaded.revision,
      workspace: initialWorkspace,
      cursor,
      conflicts: syncState.conflicts,
      error: committed.error
    };
  }
  if (uploadError) {
    return {
      kind: runtimeFailureKind(uploadError),
      revision: committed.value.revision,
      workspace: nextWorkspace,
      cursor: pulled.value.cursor,
      conflicts,
      error: uploadError
    };
  }
  if (hydration.error) {
    return {
      kind: runtimeFailureKind(hydration.error),
      revision: committed.value.revision,
      workspace: nextWorkspace,
      cursor: pulled.value.cursor,
      conflicts,
      error: hydration.error
    };
  }
  return {
    kind: "synced",
    revision: committed.value.revision,
    workspace: nextWorkspace,
    cursor: pulled.value.cursor,
    conflicts,
    acknowledgedOperationIds: durablyAcknowledgedOperationIds
  };
}
