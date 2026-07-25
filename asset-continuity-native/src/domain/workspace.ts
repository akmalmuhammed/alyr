import type {
  NativeAsset,
  NativeEvidence,
  NativePlace,
  NativeWorkspace,
  NewAssetInput,
  NewPlaceInput,
  WorkspaceActivity
} from "./model";

export interface MutationContext {
  readonly now: () => string;
  readonly id: (prefix: string) => string;
}

export interface AssetMutationResult {
  readonly workspace: NativeWorkspace;
  readonly asset: NativeAsset;
}

export interface PlaceMutationResult {
  readonly workspace: NativeWorkspace;
  readonly place: NativePlace;
}

export function addPlace(
  workspace: NativeWorkspace,
  input: NewPlaceInput,
  context: MutationContext
): PlaceMutationResult {
  const now = context.now();
  const roomId = input.roomName?.trim() ? context.id("room") : null;
  const place: NativePlace = {
    id: context.id("place"),
    householdId: workspace.household.id,
    name: input.name.trim(),
    addressSummary: input.addressSummary?.trim() || null,
    regionLabel: input.regionLabel.trim() || "Unspecified region",
    latitude: null,
    longitude: null,
    locationSource: "not_set",
    precision: "locality_only",
    horizontalAccuracyMeters: null,
    observedAt: null,
    confirmedAt: null,
    rooms: roomId
      ? [
          {
            id: roomId,
            name: input.roomName!.trim(),
            kind: "room",
            parentRoomId: null
          }
        ]
      : [],
    createdAt: now,
    updatedAt: now
  };
  const pinnedPlace: NativePlace = input.pin
    ? {
        ...place,
        latitude: input.pin.latitude,
        longitude: input.pin.longitude,
        locationSource: input.pin.source,
        precision: input.pin.precision,
        horizontalAccuracyMeters: input.pin.horizontalAccuracyMeters,
        observedAt: input.pin.observedAt,
        confirmedAt: input.pin.confirmedAt
      }
    : place;
  const activity: WorkspaceActivity = {
    id: context.id("activity"),
    type: "place_created",
    assetId: null,
    placeId: pinnedPlace.id,
    occurredAt: now
  };
  return {
    place: pinnedPlace,
    workspace: {
      ...workspace,
      places: [...workspace.places, pinnedPlace],
      activity: [activity, ...workspace.activity],
      updatedAt: now
    }
  };
}

export function addAsset(
  workspace: NativeWorkspace,
  input: NewAssetInput,
  context: MutationContext
): AssetMutationResult {
  const now = context.now();
  const assetId = context.id("asset");
  const photoEvidenceId = input.photo ? context.id("evidence") : null;
  const evidenceId = input.evidence ? context.id("evidence") : null;
  const photoEvidence: NativeEvidence | null =
    input.photo && photoEvidenceId
      ? {
          id: photoEvidenceId,
          versionId: context.id("evidence-version"),
          blobObjectId: context.id("blob"),
          householdId: workspace.household.id,
          assetId,
          kind: "media",
          relation: "condition",
          fileName: input.photo.fileName,
          mimeType: input.photo.mimeType,
          byteSize: input.photo.byteSize,
          localUri: input.photo.protectedUri ?? input.photo.localUri,
          checksumSha256: input.photo.checksumSha256 ?? null,
          reviewStatus: "pending",
          storageState: "on-device",
          capturedAt: now
        }
      : null;
  const supportingEvidence: NativeEvidence | null =
    input.evidence && evidenceId
      ? {
          id: evidenceId,
          versionId: context.id("evidence-version"),
          blobObjectId: context.id("blob"),
          householdId: workspace.household.id,
          assetId,
          kind: "paper",
          relation: "identity",
          fileName: input.evidence.fileName,
          mimeType: input.evidence.mimeType,
          byteSize: input.evidence.byteSize,
          localUri:
            input.evidence.protectedUri ?? input.evidence.localUri,
          checksumSha256: input.evidence.checksumSha256 ?? null,
          reviewStatus: "pending",
          storageState: "on-device",
          capturedAt: now
        }
      : null;
  const asset: NativeAsset = {
    id: assetId,
    householdId: workspace.household.id,
    name: input.name.trim(),
    categoryId: input.categoryId,
    categoryLabel: input.categoryLabel,
    photoUri:
      input.photo?.encryptedAtRest ? null : input.photo?.localUri ?? null,
    photoProtectedUri:
      input.photo?.protectedUri ?? null,
    photoChecksumSha256:
      input.photo?.checksumSha256 ?? null,
    photoEvidenceId,
    locationStatus: input.locationStatus,
    placeId: input.placeId,
    roomId: input.roomId,
    locatorText: input.locatorText?.trim() || null,
    evidenceIds: evidenceId ? [evidenceId] : [],
    syncStatus: "on-device",
    createdAt: now,
    updatedAt: now
  };
  const activity: WorkspaceActivity = {
    id: context.id("activity"),
    type: "asset_created",
    assetId,
    placeId: input.placeId,
    occurredAt: now
  };

  return {
    asset,
    workspace: {
      ...workspace,
      assets: [asset, ...workspace.assets],
      evidence: [
        ...[photoEvidence, supportingEvidence].filter(
          (item): item is NativeEvidence => item !== null
        ),
        ...workspace.evidence
      ],
      activity: [activity, ...workspace.activity],
      updatedAt: now
    }
  };
}

export function recordRetrieval(
  workspace: NativeWorkspace,
  assetId: string,
  context: MutationContext
): NativeWorkspace {
  const asset = workspace.assets.find((item) => item.id === assetId);
  if (!asset) {
    return workspace;
  }
  const occurredAt = context.now();
  const activity: WorkspaceActivity = {
    id: context.id("activity"),
    type: "asset_retrieved",
    assetId,
    placeId: asset.placeId,
    occurredAt
  };
  return {
    ...workspace,
    activity: [activity, ...workspace.activity],
    updatedAt: occurredAt
  };
}

export function setWorkspaceLanguage(
  workspace: NativeWorkspace,
  language: NativeWorkspace["language"],
  now: string
): NativeWorkspace {
  return {
    ...workspace,
    language,
    updatedAt: now
  };
}
