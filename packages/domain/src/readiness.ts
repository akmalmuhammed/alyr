import type {
  EvidenceDescriptor,
  EvidenceVersionDescriptor,
} from "@alyr/contracts";

import { getLocationPolicy } from "./categories.js";
import { evaluateEvidenceRequirements } from "./evidence.js";
import { isConfirmedPrecisePlacePin } from "./location.js";
import type {
  FocusedAssetRecord,
  FocusedPlaceRecord,
} from "./records.js";

export type ReadinessItemId =
  | "identity"
  | "ownership"
  | "location"
  | "location-detail"
  | "reference"
  | "value"
  | "evidence";

export interface ReadinessItem {
  readonly id: ReadinessItemId;
  readonly label: string;
  readonly weight: number;
  readonly complete: boolean;
}

export interface AssetReadiness {
  readonly percent: number;
  readonly items: readonly ReadinessItem[];
  readonly missing: readonly ReadinessItemId[];
  readonly evidence: ReturnType<typeof evaluateEvidenceRequirements>;
}

export interface CalculateAssetReadinessInput {
  readonly asset: FocusedAssetRecord;
  readonly place: FocusedPlaceRecord | null;
  readonly evidence: readonly EvidenceDescriptor[];
  readonly evidenceVersions: readonly EvidenceVersionDescriptor[];
}

/**
 * A transparent continuity checklist. It is not an appraisal, ownership
 * verification, legal opinion, or AI confidence score.
 */
export function calculateAssetReadiness(
  input: CalculateAssetReadinessInput,
): AssetReadiness {
  const { asset, place } = input;
  const policy = getLocationPolicy(asset.kind);
  const assetEvidence = input.evidence.filter(
    (material) => material.assetId === asset.id,
  );
  const assetEvidenceIds = new Set(
    assetEvidence.map((material) => material.id),
  );
  const assetVersions = input.evidenceVersions.filter((version) =>
    assetEvidenceIds.has(version.evidenceId),
  );
  const evidence = evaluateEvidenceRequirements(
    asset.requiredProofTypes,
    assetEvidence,
    assetVersions,
  );
  const precisePin = isConfirmedPrecisePlacePin(place?.pin);
  const indoorLocator = Boolean(
    asset.spaceId || asset.locationDetail?.trim(),
  );
  const findablePhysicalLocation =
    asset.locationMode === "physical" &&
    asset.locationStatus === "known" &&
    Boolean(place) &&
    (policy.isRealEstate ? precisePin : indoorLocator);
  const truthfulVirtualLocation =
    asset.locationMode === "virtual" && policy.allowsVirtual;
  const truthfulNotApplicable =
    asset.locationMode === "not-applicable" && policy.usesNotApplicable;

  const items: readonly ReadinessItem[] = [
    {
      id: "identity",
      label: "Name and category",
      weight: 20,
      complete: Boolean(asset.name.trim() && asset.categoryId.trim()),
    },
    {
      id: "ownership",
      label: "Owner recorded",
      weight: 10,
      complete: Boolean(asset.ownerMemberId),
    },
    {
      id: "location",
      label: truthfulVirtualLocation
        ? "Virtual location recorded"
        : truthfulNotApplicable
          ? "Location not applicable"
          : policy.isRealEstate
            ? "Property pin confirmed"
            : "Findable location",
      weight: 20,
      complete:
        truthfulVirtualLocation ||
        truthfulNotApplicable ||
        findablePhysicalLocation,
    },
    {
      id: "location-detail",
      label: "Precise location",
      weight: 10,
      complete:
        truthfulVirtualLocation ||
        truthfulNotApplicable ||
        (findablePhysicalLocation && precisePin),
    },
    {
      id: "reference",
      label: "Reference or serial",
      weight: 15,
      complete: Boolean(asset.reference?.trim()),
    },
    {
      id: "value",
      label: "Value or context",
      weight: 5,
      complete: Boolean(asset.value || asset.notes?.trim()),
    },
    {
      id: "evidence",
      label: "Required evidence",
      weight: 20,
      complete: evidence.complete,
    },
  ];
  const percent = items.reduce(
    (total, item) => total + (item.complete ? item.weight : 0),
    0,
  );
  return {
    percent,
    items,
    missing: items
      .filter((item) => !item.complete)
      .map((item) => item.id),
    evidence,
  };
}
