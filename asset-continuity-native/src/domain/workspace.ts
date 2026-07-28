import {
  categoryLocationTransition,
  unresolvedLocationForCategoryTransition
} from "./assetCategoryLocation";
import { validateNewAssetInput } from "./assetMutationBoundary";
import type {
  AssetLifecycleInput,
  EvidenceReviewInput,
  NativeAsset,
  NativeEvidence,
  NativePlace,
  NativePlaceDocument,
  NativeRoom,
  NativeWorkspace,
  ExistingAssetUpdateInput,
  NewAssetInput,
  NewPlaceDocumentInput,
  NewPlaceInput,
  NewPlaceSpaceInput,
  PlacePinInput,
  UpdatePlaceBasicsInput,
  UpdatePlacePinInput,
  UpdatePlaceSpaceInput,
  WorkspaceActivity
} from "./model";
import {
  placeClassification,
  placeClassificationFields
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

export interface PlaceUpdateMutationResult extends PlaceMutationResult {
  readonly previousPlace: NativePlace;
}

export interface PlaceSpaceMutationResult extends PlaceUpdateMutationResult {
  readonly room: NativeRoom;
}

export interface PlaceDocumentMutationResult {
  readonly workspace: NativeWorkspace;
  readonly document: NativePlaceDocument;
}

export interface AssetUpdateMutationResult extends AssetMutationResult {
  readonly previousAsset: NativeAsset;
  readonly newEvidence: readonly NativeEvidence[];
  readonly changes: {
    readonly identity: boolean;
    readonly photo: boolean;
    readonly location: boolean;
    readonly evidence: boolean;
  };
}

export interface AssetLifecycleMutationResult extends AssetMutationResult {
  readonly previousAsset: NativeAsset;
}

export interface EvidenceReviewMutationResult {
  readonly workspace: NativeWorkspace;
  readonly evidence: NativeEvidence;
  readonly previousEvidence: NativeEvidence;
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
    version: 1,
    name: input.name.trim(),
    ...placeClassificationFields(input.classification),
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
            version: 1,
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

function assertConfirmedPlacePin(pin: PlacePinInput): void {
  if (
    !Number.isFinite(pin.latitude) ||
    pin.latitude < -90 ||
    pin.latitude > 90 ||
    !Number.isFinite(pin.longitude) ||
    pin.longitude < -180 ||
    pin.longitude > 180
  ) {
    throw new Error("Choose valid latitude and longitude coordinates.");
  }
  if (!pin.observedAt || !pin.confirmedAt) {
    throw new Error("Confirm the visible property pin before saving it.");
  }
  if (pin.source === "device_gps") {
    if (
      pin.horizontalAccuracyMeters === null ||
      !Number.isFinite(pin.horizontalAccuracyMeters) ||
      pin.horizontalAccuracyMeters < 0 ||
      !["exact", "approximate"].includes(pin.precision)
    ) {
      throw new Error("The device GPS reading is missing its accuracy.");
    }
    return;
  }
  if (
    pin.precision !== "user_placed" ||
    pin.horizontalAccuracyMeters !== null
  ) {
    throw new Error("A manually placed pin must remain user-placed.");
  }
}

function samePlacePin(place: NativePlace, pin: PlacePinInput | null): boolean {
  if (pin === null) {
    return place.latitude === null && place.longitude === null;
  }
  return (
    place.latitude === pin.latitude &&
    place.longitude === pin.longitude &&
    place.locationSource === pin.source &&
    place.precision === pin.precision &&
    place.horizontalAccuracyMeters === pin.horizontalAccuracyMeters &&
    place.observedAt === pin.observedAt &&
    place.confirmedAt === pin.confirmedAt
  );
}

function findPlaceIndex(
  workspace: NativeWorkspace,
  placeId: string
): number {
  return workspace.places.findIndex(
    (place) =>
      place.id === placeId &&
      place.householdId === workspace.household.id
  );
}

function requirePlace(
  workspace: NativeWorkspace,
  placeId: string
): { readonly index: number; readonly place: NativePlace } {
  const index = findPlaceIndex(workspace, placeId);
  if (index < 0) {
    throw new Error("This Place is not available in the current household.");
  }
  return { index, place: workspace.places[index]! };
}

function normalizedRequired(
  value: string,
  label: string,
  maximumLength: number
): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.length > maximumLength) {
    throw new Error(`${label} must be ${maximumLength} characters or fewer.`);
  }
  return normalized;
}

function appendPlaceUpdate(
  workspace: NativeWorkspace,
  placeIndex: number,
  previousPlace: NativePlace,
  patch: Partial<NativePlace>,
  context: MutationContext,
  bumpAuthoritativeVersion = true
): PlaceUpdateMutationResult {
  const occurredAt = context.now();
  const place: NativePlace = {
    ...previousPlace,
    ...patch,
    version: bumpAuthoritativeVersion
      ? Math.max(1, previousPlace.version ?? 1) + 1
      : Math.max(1, previousPlace.version ?? 1),
    updatedAt: occurredAt
  };
  const places = [...workspace.places];
  places[placeIndex] = place;
  const activity: WorkspaceActivity = {
    id: context.id("activity"),
    type: "place_updated",
    assetId: null,
    placeId: place.id,
    occurredAt
  };
  return {
    previousPlace,
    place,
    workspace: {
      ...workspace,
      places,
      activity: [activity, ...workspace.activity],
      updatedAt: occurredAt
    }
  };
}

export function updatePlaceBasics(
  workspace: NativeWorkspace,
  input: UpdatePlaceBasicsInput,
  context: MutationContext
): PlaceUpdateMutationResult {
  const { index, place: previousPlace } = requirePlace(
    workspace,
    input.placeId
  );
  const name = normalizedRequired(input.name, "Place name", 80);
  const regionLabel = normalizedRequired(input.regionLabel, "Region", 80);
  const addressSummary = input.addressSummary?.trim() || null;
  const classification =
    input.classification === undefined
      ? placeClassification(previousPlace)
      : input.classification;
  const classificationFields =
    placeClassificationFields(classification);
  if (addressSummary && addressSummary.length > 240) {
    throw new Error("Address summary must be 240 characters or fewer.");
  }
  if (
    name === previousPlace.name &&
    regionLabel === previousPlace.regionLabel &&
    addressSummary === previousPlace.addressSummary &&
    classificationFields.kind === previousPlace.kind &&
    classificationFields.tenure === previousPlace.tenure
  ) {
    return {
      previousPlace,
      place: previousPlace,
      workspace
    };
  }
  return appendPlaceUpdate(
    workspace,
    index,
    previousPlace,
    {
      name,
      regionLabel,
      addressSummary,
      ...classificationFields
    },
    context,
    false
  );
}

function assertRoomParent(
  place: NativePlace,
  parentRoomId: string | null,
  roomId: string | null
): void {
  if (parentRoomId === null) return;
  const parent = place.rooms.find((room) => room.id === parentRoomId);
  if (!parent) {
    throw new Error("Choose a parent space inside this Place.");
  }
  if (roomId === null) return;

  let cursor: NativeRoom | undefined = parent;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor.id === roomId) {
      throw new Error(
        "A space cannot sit inside itself or one of its children."
      );
    }
    if (visited.has(cursor.id)) {
      throw new Error("The current space hierarchy contains a cycle.");
    }
    visited.add(cursor.id);
    const nextParentId: string | null = cursor.parentRoomId;
    cursor = nextParentId
      ? place.rooms.find((room) => room.id === nextParentId)
      : undefined;
  }
}

export function addPlaceSpace(
  workspace: NativeWorkspace,
  input: NewPlaceSpaceInput,
  context: MutationContext
): PlaceSpaceMutationResult {
  const { index, place: previousPlace } = requirePlace(
    workspace,
    input.placeId
  );
  const name = normalizedRequired(input.name, "Space name", 80);
  assertRoomParent(previousPlace, input.parentRoomId, null);
  const room: NativeRoom = {
    id: context.id("room"),
    version: 1,
    name,
    kind: input.kind,
    parentRoomId: input.parentRoomId
  };
  const result = appendPlaceUpdate(
    workspace,
    index,
    previousPlace,
    { rooms: [...previousPlace.rooms, room] },
    context,
    false
  );
  return { ...result, room };
}

export function updatePlaceSpace(
  workspace: NativeWorkspace,
  input: UpdatePlaceSpaceInput,
  context: MutationContext
): PlaceSpaceMutationResult {
  const { index, place: previousPlace } = requirePlace(
    workspace,
    input.placeId
  );
  const roomIndex = previousPlace.rooms.findIndex(
    (room) => room.id === input.roomId
  );
  if (roomIndex < 0) {
    throw new Error("This space is not available inside the selected Place.");
  }
  const previousRoom = previousPlace.rooms[roomIndex]!;
  const name = normalizedRequired(input.name, "Space name", 80);
  assertRoomParent(previousPlace, input.parentRoomId, previousRoom.id);
  if (
    name === previousRoom.name &&
    input.kind === previousRoom.kind &&
    input.parentRoomId === previousRoom.parentRoomId
  ) {
    return {
      previousPlace,
      place: previousPlace,
      room: previousRoom,
      workspace
    };
  }
  const room: NativeRoom = {
    ...previousRoom,
    name,
    kind: input.kind,
    parentRoomId: input.parentRoomId
  };
  const rooms = [...previousPlace.rooms];
  rooms[roomIndex] = room;
  const result = appendPlaceUpdate(
    workspace,
    index,
    previousPlace,
    { rooms },
    context,
    false
  );
  return { ...result, room };
}

export function addPlaceDocument(
  workspace: NativeWorkspace,
  input: NewPlaceDocumentInput,
  context: MutationContext
): PlaceDocumentMutationResult {
  requirePlace(workspace, input.placeId);
  const fileName = normalizedRequired(input.file.fileName, "File name", 180);
  const mimeType = normalizedRequired(input.file.mimeType, "File type", 120);
  if (
    !input.file.localUri ||
    !Number.isSafeInteger(input.file.byteSize) ||
    input.file.byteSize < 0 ||
    input.file.byteSize > 10 * 1024 * 1024
  ) {
    throw new Error("Choose a valid Place document up to 10 MB.");
  }
  const encryptedAtRest = input.file.encryptedAtRest === true;
  if (
    encryptedAtRest &&
    (!input.file.protectedUri ||
      !input.file.checksumSha256 ||
      !/^[a-f0-9]{64}$/iu.test(input.file.checksumSha256))
  ) {
    throw new Error("The protected Place document metadata is incomplete.");
  }
  const occurredAt = context.now();
  const document: NativePlaceDocument = {
    id: context.id("place-document"),
    version: 1,
    documentVersionNumber: 0,
    versionId: context.id("place-document-version"),
    blobObjectId: context.id("blob"),
    householdId: workspace.household.id,
    placeId: input.placeId,
    kind: "paper",
    relation: "other",
    fileName,
    mimeType,
    byteSize: input.file.byteSize,
    localUri: input.file.protectedUri ?? input.file.localUri,
    checksumSha256: input.file.checksumSha256?.toLowerCase() ?? null,
    encryptedAtRest,
    storageState: "on-device",
    capturedAt: occurredAt,
    updatedAt: occurredAt
  };
  const activity: WorkspaceActivity = {
    id: context.id("activity"),
    type: "place_updated",
    assetId: null,
    placeId: input.placeId,
    occurredAt
  };
  return {
    document,
    workspace: {
      ...workspace,
      placeDocuments: [
        document,
        ...(workspace.placeDocuments ?? [])
      ],
      activity: [activity, ...workspace.activity],
      updatedAt: occurredAt
    }
  };
}

export function updatePlacePin(
  workspace: NativeWorkspace,
  input: UpdatePlacePinInput,
  context: MutationContext
): PlaceUpdateMutationResult {
  const { index: placeIndex, place: previousPlace } = requirePlace(
    workspace,
    input.placeId
  );
  if (input.pin) {
    assertConfirmedPlacePin(input.pin);
  }
  if (samePlacePin(previousPlace, input.pin)) {
    return {
      previousPlace,
      place: previousPlace,
      workspace
    };
  }

  return appendPlaceUpdate(
    workspace,
    placeIndex,
    previousPlace,
    {
      latitude: input.pin?.latitude ?? null,
      longitude: input.pin?.longitude ?? null,
      locationSource: input.pin?.source ?? "not_set",
      precision: input.pin?.precision ?? "locality_only",
      horizontalAccuracyMeters:
        input.pin?.horizontalAccuracyMeters ?? null,
      observedAt: input.pin?.observedAt ?? null,
      confirmedAt: input.pin?.confirmedAt ?? null
    },
    context
  );
}

export function addAsset(
  workspace: NativeWorkspace,
  input: NewAssetInput,
  context: MutationContext
): AssetMutationResult {
  const validatedInput = validateNewAssetInput(workspace, input);
  const now = context.now();
  const assetId = context.id("asset");
  const photoEvidenceId = validatedInput.photo
    ? context.id("evidence")
    : null;
  const evidenceId = validatedInput.evidence
    ? context.id("evidence")
    : null;
  const photoEvidence: NativeEvidence | null =
    validatedInput.photo && photoEvidenceId
      ? {
          id: photoEvidenceId,
          version: 1,
          versionId: context.id("evidence-version"),
          blobObjectId: context.id("blob"),
          householdId: workspace.household.id,
          assetId,
          kind: "media",
          relation: "condition",
          fileName: validatedInput.photo.fileName,
          mimeType: validatedInput.photo.mimeType,
          byteSize: validatedInput.photo.byteSize,
          localUri:
            validatedInput.photo.protectedUri ??
            validatedInput.photo.localUri,
          checksumSha256:
            validatedInput.photo.checksumSha256 ?? null,
          reviewStatus: "pending",
          reviewedAt: null,
          storageState: "on-device",
          capturedAt: now,
          updatedAt: now
        }
      : null;
  const supportingEvidence: NativeEvidence | null =
    validatedInput.evidence && evidenceId
      ? {
          id: evidenceId,
          version: 1,
          versionId: context.id("evidence-version"),
          blobObjectId: context.id("blob"),
          householdId: workspace.household.id,
          assetId,
          kind: "paper",
          relation: "identity",
          fileName: validatedInput.evidence.fileName,
          mimeType: validatedInput.evidence.mimeType,
          byteSize: validatedInput.evidence.byteSize,
          localUri:
            validatedInput.evidence.protectedUri ??
            validatedInput.evidence.localUri,
          checksumSha256:
            validatedInput.evidence.checksumSha256 ?? null,
          reviewStatus: "pending",
          reviewedAt: null,
          storageState: "on-device",
          capturedAt: now,
          updatedAt: now
        }
      : null;
  const asset: NativeAsset = {
    id: assetId,
    // A new Passport is represented remotely by asset.create followed by its
    // initial asset.move (including an explicit unknown location). Project
    // both accepted versions locally so later offline commands observe the
    // versions the ordered outbox will establish.
    version: 2,
    locationRevisionVersion: 1,
    householdId: workspace.household.id,
    name: validatedInput.name,
    categoryId: validatedInput.categoryId,
    categoryLabel: validatedInput.categoryLabel,
    photoUri:
      validatedInput.photo?.encryptedAtRest
        ? null
        : validatedInput.photo?.localUri ?? null,
    photoProtectedUri:
      validatedInput.photo?.protectedUri ?? null,
    photoChecksumSha256:
      validatedInput.photo?.checksumSha256 ?? null,
    photoEvidenceId,
    locationStatus: validatedInput.locationStatus,
    placeId: validatedInput.placeId,
    roomId: validatedInput.roomId,
    locatorText: validatedInput.locatorText,
    evidenceIds: evidenceId ? [evidenceId] : [],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "on-device",
    createdAt: now,
    updatedAt: now
  };
  const activity: WorkspaceActivity = {
    id: context.id("activity"),
    type: "asset_created",
    assetId,
    placeId: validatedInput.placeId,
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

function createEvidence(
  workspace: NativeWorkspace,
  assetId: string,
  file: NonNullable<ExistingAssetUpdateInput["photo"]>,
  kind: NativeEvidence["kind"],
  relation: NativeEvidence["relation"],
  now: string,
  context: MutationContext
): NativeEvidence {
  return {
    id: context.id("evidence"),
    version: 1,
    versionId: context.id("evidence-version"),
    blobObjectId: context.id("blob"),
    householdId: workspace.household.id,
    assetId,
    kind,
    relation,
    fileName: file.fileName,
    mimeType: file.mimeType,
    byteSize: file.byteSize,
    localUri: file.protectedUri ?? file.localUri,
    checksumSha256: file.checksumSha256 ?? null,
    reviewStatus: "pending",
    reviewedAt: null,
    storageState: "on-device",
    capturedAt: now,
    updatedAt: now
  };
}

export function updateAsset(
  workspace: NativeWorkspace,
  input: ExistingAssetUpdateInput,
  context: MutationContext
): AssetUpdateMutationResult {
  const assetIndex = workspace.assets.findIndex(
    (item) => item.id === input.assetId
  );
  if (assetIndex < 0) {
    throw new Error("The Asset Passport is not available in this household.");
  }

  const previousAsset = workspace.assets[assetIndex]!;
  if (previousAsset.householdId !== workspace.household.id) {
    throw new Error("The Asset Passport belongs to another household.");
  }
  if (previousAsset.lifecycleStatus === "archived") {
    throw new Error(
      "Restore this Asset Passport before changing its active record."
    );
  }

  const identity = input.identity
    ? {
        name: input.identity.name.trim(),
        categoryId: input.identity.categoryId.trim(),
        categoryLabel: input.identity.categoryLabel.trim()
      }
    : null;
  if (
    identity &&
    (!identity.name || !identity.categoryId || !identity.categoryLabel)
  ) {
    throw new Error("An item needs both a name and category.");
  }

  const locationTransition = identity
    ? categoryLocationTransition(
        previousAsset.categoryId,
        identity.categoryId
      )
    : null;
  let nextLocation =
    unresolvedLocationForCategoryTransition(locationTransition) ??
    input.location ??
    null;
  if (nextLocation?.locationStatus === "unknown") {
    nextLocation = {
      locationStatus: "unknown",
      placeId: null,
      roomId: null,
      locatorText: null
    };
  }
  if (nextLocation?.placeId) {
    const place = workspace.places.find(
      (item) => item.id === nextLocation!.placeId
    );
    if (!place || place.householdId !== workspace.household.id) {
      throw new Error("Choose a Place from this household.");
    }
    if (
      nextLocation.roomId &&
      !place.rooms.some((room) => room.id === nextLocation!.roomId)
    ) {
      throw new Error("Choose a space inside the selected Place.");
    }
  } else if (nextLocation?.roomId) {
    throw new Error("A space cannot be saved without its Place.");
  }

  const identityChanged = Boolean(
    identity &&
      (identity.name !== previousAsset.name ||
        identity.categoryId !== previousAsset.categoryId ||
        identity.categoryLabel !== previousAsset.categoryLabel)
  );
  const locationChanged = Boolean(
    nextLocation &&
      (nextLocation.locationStatus !== previousAsset.locationStatus ||
        nextLocation.placeId !== previousAsset.placeId ||
        nextLocation.roomId !== previousAsset.roomId ||
        (nextLocation.locatorText?.trim() || null) !==
          previousAsset.locatorText)
  );
  const now = context.now();
  const photoEvidence = input.photo
    ? createEvidence(
        workspace,
        previousAsset.id,
        input.photo,
        "media",
        "condition",
        now,
        context
      )
    : null;
  const supportingEvidence = input.evidence
    ? createEvidence(
        workspace,
        previousAsset.id,
        input.evidence,
        "paper",
        "identity",
        now,
        context
      )
    : null;
  const newEvidence = [photoEvidence, supportingEvidence].filter(
    (item): item is NativeEvidence => item !== null
  );
  const changed =
    identityChanged ||
    locationChanged ||
    photoEvidence !== null ||
    supportingEvidence !== null;

  const asset: NativeAsset = changed
    ? {
        ...previousAsset,
        version: Math.max(1, previousAsset.version ?? 1) + 1,
        ...(identityChanged ? identity! : {}),
        ...(photoEvidence && input.photo
          ? {
              photoUri: input.photo.encryptedAtRest
                ? null
                : input.photo.localUri,
              photoProtectedUri: input.photo.protectedUri ?? null,
              photoChecksumSha256: input.photo.checksumSha256 ?? null,
              photoEvidenceId: photoEvidence.id
            }
          : {}),
        ...(locationChanged && nextLocation
          ? {
              locationStatus: nextLocation.locationStatus,
              placeId: nextLocation.placeId,
              roomId: nextLocation.roomId,
              locatorText: nextLocation.locatorText?.trim() || null
            }
          : {}),
        evidenceIds: supportingEvidence
          ? [...previousAsset.evidenceIds, supportingEvidence.id]
          : previousAsset.evidenceIds,
        syncStatus: "on-device",
        updatedAt: now
      }
    : previousAsset;
  const activities: WorkspaceActivity[] = newEvidence.map((item) => ({
    id: context.id("activity"),
    type: "evidence_added",
    assetId: previousAsset.id,
    placeId: asset.placeId,
    occurredAt: item.capturedAt
  }));
  const assets = [...workspace.assets];
  assets[assetIndex] = asset;

  return {
    previousAsset,
    asset,
    newEvidence,
    changes: {
      identity: identityChanged,
      photo: photoEvidence !== null,
      location: locationChanged,
      evidence: supportingEvidence !== null
    },
    workspace: changed
      ? {
          ...workspace,
          assets,
          evidence: [...newEvidence, ...workspace.evidence],
          activity: [...activities, ...workspace.activity],
          updatedAt: now
        }
      : workspace
  };
}

export function setAssetLifecycle(
  workspace: NativeWorkspace,
  input: AssetLifecycleInput,
  context: MutationContext
): AssetLifecycleMutationResult {
  const assetIndex = workspace.assets.findIndex(
    (item) => item.id === input.assetId
  );
  if (assetIndex < 0) {
    throw new Error("The Asset Passport is not available in this household.");
  }
  const previousAsset = workspace.assets[assetIndex]!;
  if (previousAsset.householdId !== workspace.household.id) {
    throw new Error("The Asset Passport belongs to another household.");
  }
  const previousStatus =
    previousAsset.lifecycleStatus === "archived"
      ? "archived"
      : "active";
  if (previousStatus === input.lifecycleStatus) {
    return {
      previousAsset,
      asset: previousAsset,
      workspace
    };
  }

  const occurredAt = context.now();
  const asset: NativeAsset = {
    ...previousAsset,
    version: Math.max(1, previousAsset.version ?? 1) + 1,
    lifecycleStatus: input.lifecycleStatus,
    archivedAt:
      input.lifecycleStatus === "archived" ? occurredAt : null,
    syncStatus: "on-device",
    updatedAt: occurredAt
  };
  const assets = [...workspace.assets];
  assets[assetIndex] = asset;
  const activity: WorkspaceActivity = {
    id: context.id("activity"),
    type:
      input.lifecycleStatus === "archived"
        ? "asset_archived"
        : "asset_restored",
    assetId: asset.id,
    placeId: asset.placeId,
    occurredAt
  };

  return {
    previousAsset,
    asset,
    workspace: {
      ...workspace,
      assets,
      activity: [activity, ...workspace.activity],
      updatedAt: occurredAt
    }
  };
}

export function setEvidenceReviewStatus(
  workspace: NativeWorkspace,
  input: EvidenceReviewInput,
  context: MutationContext
): EvidenceReviewMutationResult {
  const evidenceIndex = workspace.evidence.findIndex(
    (item) => item.id === input.evidenceId
  );
  if (evidenceIndex < 0) {
    throw new Error("This evidence record is not available.");
  }
  const previousEvidence = workspace.evidence[evidenceIndex]!;
  if (previousEvidence.householdId !== workspace.household.id) {
    throw new Error("This evidence belongs to another household.");
  }
  const asset = workspace.assets.find(
    (item) => item.id === previousEvidence.assetId
  );
  if (!asset || asset.householdId !== workspace.household.id) {
    throw new Error("The linked Asset Passport is not available.");
  }
  if (
    !previousEvidence.fileName.trim() ||
    !previousEvidence.mimeType.trim() ||
    !Number.isSafeInteger(previousEvidence.byteSize) ||
    previousEvidence.byteSize <= 0
  ) {
    throw new Error(
      "Review requires a file name, type and exact stored size."
    );
  }
  if (previousEvidence.reviewStatus === input.reviewStatus) {
    return {
      previousEvidence,
      evidence: previousEvidence,
      workspace
    };
  }

  const occurredAt = context.now();
  const evidence: NativeEvidence = {
    ...previousEvidence,
    version: Math.max(1, previousEvidence.version ?? 1) + 1,
    reviewStatus: input.reviewStatus,
    reviewedAt:
      input.reviewStatus === "reviewed" ? occurredAt : null,
    updatedAt: occurredAt
  };
  const evidenceRecords = [...workspace.evidence];
  evidenceRecords[evidenceIndex] = evidence;
  const activity: WorkspaceActivity = {
    id: context.id("activity"),
    type:
      input.reviewStatus === "reviewed"
        ? "evidence_reviewed"
        : "evidence_reopened",
    assetId: asset.id,
    placeId: asset.placeId,
    occurredAt
  };

  return {
    previousEvidence,
    evidence,
    workspace: {
      ...workspace,
      evidence: evidenceRecords,
      activity: [activity, ...workspace.activity],
      updatedAt: occurredAt
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

export function renameHousehold(
  workspace: NativeWorkspace,
  name: string,
  now: string
): NativeWorkspace {
  const normalized = name.trim();
  if (!normalized) {
    return workspace;
  }
  return {
    ...workspace,
    household: {
      ...workspace.household,
      name: normalized
    },
    updatedAt: now
  };
}
