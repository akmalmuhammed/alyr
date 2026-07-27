import type {
  AssetReadiness,
  NativeAsset,
  NativeEvidence,
  NativePlace
} from "./model";
import { getLocationPolicy } from "@alyr/domain";

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
  const hasDetailedLocation =
    asset.locationStatus === "known" &&
    Boolean(place) &&
    Boolean(asset.roomId || asset.locatorText?.trim());
  const requiresPhysicalLocation = getLocationPolicy(
    asset.categoryId
  ).requiresPhysicalLocator;

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
