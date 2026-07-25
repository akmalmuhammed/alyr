import type {
  AssetReadiness,
  NativeAsset,
  NativeEvidence,
  NativePlace
} from "./model";

export function calculateNativeAssetReadiness(
  asset: NativeAsset,
  places: readonly NativePlace[],
  evidence: readonly NativeEvidence[]
): AssetReadiness {
  const assetEvidence = evidence.filter((item) =>
    asset.evidenceIds.includes(item.id)
  );
  const place = places.find((item) => item.id === asset.placeId);
  const hasDetailedLocation =
    asset.locationStatus === "known" &&
    Boolean(place) &&
    Boolean(asset.roomId || asset.locatorText?.trim());

  const items: AssetReadiness["items"] = [
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
      complete: Boolean(asset.photoUri || asset.photoProtectedUri)
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

  const percent = items.reduce(
    (total, item) => total + (item.complete ? item.weight : 0),
    0
  );

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
