import type {
  AssetReadiness,
  NativeAsset,
  NativeEvidence,
  NativePlace
} from "./model";
import type { LocationStatus, PlacePin } from "@alyr/contracts";
import {
  deriveLocationTruth,
  getLocationPolicy,
  isConfirmedPrecisePlacePin
} from "@alyr/domain";

/**
 * Adapts the legacy native Place shape to the shared location contract.
 * A malformed or locality-only native record must not become a precise pin
 * merely because it carries confirmation metadata.
 */
export function placePinFromNativePlace(
  place: NativePlace | null | undefined
): PlacePin | null {
  if (
    !place ||
    place.latitude === null ||
    place.longitude === null ||
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude) ||
    place.latitude < -90 ||
    place.latitude > 90 ||
    place.longitude < -180 ||
    place.longitude > 180 ||
    !place.observedAt
  ) {
    return null;
  }

  return {
    latitude: place.latitude,
    longitude: place.longitude,
    source: place.locationSource,
    precision: place.precision,
    horizontalAccuracyMeters:
      place.horizontalAccuracyMeters !== null &&
      Number.isFinite(place.horizontalAccuracyMeters) &&
      place.horizontalAccuracyMeters >= 0
        ? place.horizontalAccuracyMeters
        : null,
    observedAt: place.observedAt,
    confirmedAt: place.confirmedAt
  };
}

export function hasConfirmedPreciseNativePlacePin(
  place: NativePlace | null | undefined
): boolean {
  return isConfirmedPrecisePlacePin(placePinFromNativePlace(place));
}

export interface NativeAssetLocationTruth {
  readonly status: LocationStatus;
  readonly hasPlace: boolean;
  readonly hasConfirmedPlacePin: boolean;
  readonly hasIndoorLocator: boolean;
}

/**
 * Keeps the Place coordinate claim separate from the item's indoor retrieval
 * clue. A room/container never upgrades an unresolved Place pin into a known
 * physical location.
 */
export function deriveNativeAssetLocationTruth(input: {
  readonly categoryId: string;
  readonly requestedStatus: LocationStatus;
  readonly place: NativePlace | null | undefined;
  readonly roomId: string | null;
  readonly locatorText: string | null;
}): NativeAssetLocationTruth {
  const policy = getLocationPolicy(input.categoryId);
  const hasPlace = Boolean(input.place);
  const hasConfirmedPlacePin =
    hasConfirmedPreciseNativePlacePin(input.place);
  const hasIndoorLocator = Boolean(
    input.roomId || input.locatorText?.trim()
  );

  if (!policy.requiresPhysicalLocator) {
    return {
      status: input.requestedStatus,
      hasPlace,
      hasConfirmedPlacePin,
      hasIndoorLocator
    };
  }

  const truth = deriveLocationTruth({
    requiresPhysicalLocator: policy.requiresPhysicalLocator,
    allowsVirtual: policy.allowsVirtual,
    isRealEstate: policy.isRealEstate,
    requestedMode: "physical",
    requestedStatus: input.requestedStatus,
    hasPlace,
    hasIndoorLocator,
    placePin: placePinFromNativePlace(input.place)
  });
  return {
    status: truth.status,
    hasPlace,
    hasConfirmedPlacePin,
    hasIndoorLocator
  };
}

/**
 * Identifies the narrow location-completion case where the item already has
 * every non-pin detail it needs and the owning Place pin is the only debt.
 * Screens use this to route the user to the actionable Place-pin editor rather
 * than back through a generic item-location form.
 */
export function nativeAssetLocationNeedsConfirmedPin(
  asset: NativeAsset,
  place: NativePlace | null | undefined
): boolean {
  const truth = deriveNativeAssetLocationTruth({
    categoryId: asset.categoryId,
    requestedStatus: asset.locationStatus,
    place,
    roomId: asset.roomId,
    locatorText: asset.locatorText
  });

  return (
    getLocationPolicy(asset.categoryId).requiresPhysicalLocator &&
    truth.hasPlace &&
    truth.hasIndoorLocator &&
    !truth.hasConfirmedPlacePin
  );
}

export function calculateNativeAssetReadiness(
  asset: NativeAsset,
  places: readonly NativePlace[],
  evidence: readonly NativeEvidence[]
): AssetReadiness {
  const assetEvidence = evidence.filter((item) =>
    asset.evidenceIds.includes(item.id)
  );
  const primaryPhotoEvidence = asset.photoEvidenceId
    ? evidence.find(
        (item) =>
          item.id === asset.photoEvidenceId &&
          item.assetId === asset.id &&
          item.kind === "media"
      )
    : null;
  const place = places.find((item) => item.id === asset.placeId);
  const locationPolicy = getLocationPolicy(asset.categoryId);
  const locationTruth = deriveNativeAssetLocationTruth({
    categoryId: asset.categoryId,
    requestedStatus: asset.locationStatus,
    place,
    roomId: asset.roomId,
    locatorText: asset.locatorText
  });
  const hasDetailedLocation =
    locationTruth.status === "known";
  const requiresPhysicalLocation =
    locationPolicy.requiresPhysicalLocator;

  const candidateItems: AssetReadiness["items"] = [
    {
      id: "identity",
      label: "Identity recorded",
      weight: 25,
      complete: Boolean(asset.name.trim() && asset.categoryId)
    },
    {
      id: "photo",
      label: "Primary photo attached",
      weight: 20,
      complete: Boolean(
        asset.photoUri ||
          asset.photoProtectedUri ||
          primaryPhotoEvidence
      )
    },
    {
      id: "location",
      label: "Retrieval location confirmed",
      weight: 30,
      complete: hasDetailedLocation
    },
    {
      id: "evidence",
      label: "Supporting material attached",
      weight: 25,
      complete: assetEvidence.length > 0
    }
  ];
  const items = candidateItems.filter(
    (item) => item.id !== "location" || requiresPhysicalLocation
  );

  const availableWeight = items.reduce(
    (total, item) => total + item.weight,
    0
  );
  const completedWeight = items.reduce(
    (total, item) => total + (item.complete ? item.weight : 0),
    0
  );
  const percent =
    availableWeight === 0
      ? 0
      : Math.round((completedWeight / availableWeight) * 100);

  return {
    percent,
    items,
    nextItem: items.find((item) => !item.complete) ?? null
  };
}

export function workspaceProgress(
  assets: readonly NativeAsset[],
  target = 25
): {
  readonly captured: number;
  readonly target: number;
  readonly percent: number;
} {
  const captured = Math.min(assets.length, target);
  return {
    captured,
    target,
    percent: Math.round((captured / target) * 100)
  };
}
