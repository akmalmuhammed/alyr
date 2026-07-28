import type {
  AssetReadiness,
  NativeAsset,
  NativeEvidence,
  NativePlace
} from "./model";
import type { PlacePin } from "@alyr/contracts";
import {
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
  const locationPolicy = getLocationPolicy(asset.categoryId);
  const indoorLocator = Boolean(
    asset.roomId || asset.locatorText?.trim()
  );

  return (
    locationPolicy.requiresPhysicalLocator &&
    asset.locationStatus === "known" &&
    Boolean(place) &&
    (locationPolicy.isRealEstate || indoorLocator) &&
    !hasConfirmedPreciseNativePlacePin(place)
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
  const precisePin = hasConfirmedPreciseNativePlacePin(place);
  const indoorLocator = Boolean(
    asset.roomId || asset.locatorText?.trim()
  );
  const hasDetailedLocation =
    asset.locationStatus === "known" &&
    Boolean(place) &&
    precisePin &&
    (locationPolicy.isRealEstate || indoorLocator);
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
