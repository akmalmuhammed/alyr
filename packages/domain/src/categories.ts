export const FOCUSED_TAXONOMY_VERSION = 1 as const;

export type FocusedAssetKind =
  | "physical"
  | "real-estate"
  | "digital"
  | "document";

export interface FocusedCategory {
  readonly id: string;
  readonly label: string;
  readonly groupId:
    | "vehicles"
    | "real-estate-land"
    | "lifestyle-personal"
    | "art-collectibles"
    | "home-storage"
    | "digital-records";
  readonly kind: FocusedAssetKind;
  readonly recommendedEvidenceTypes: readonly string[];
}

export const FOCUSED_V1_CATEGORIES = [
  {
    id: "vehicle.car",
    label: "Car",
    groupId: "vehicles",
    kind: "physical",
    recommendedEvidenceTypes: [
      "Current photo",
      "Registration",
      "Insurance policy",
    ],
  },
  {
    id: "vehicle.motorcycle",
    label: "Motorbike",
    groupId: "vehicles",
    kind: "physical",
    recommendedEvidenceTypes: [
      "Current photo",
      "Registration",
      "Insurance policy",
    ],
  },
  {
    id: "property.house",
    label: "House",
    groupId: "real-estate-land",
    kind: "real-estate",
    recommendedEvidenceTypes: [
      "Title deed",
      "Insurance policy",
      "Current photo",
    ],
  },
  {
    id: "property.apartment",
    label: "Apartment or unit",
    groupId: "real-estate-land",
    kind: "real-estate",
    recommendedEvidenceTypes: [
      "Title deed",
      "Insurance policy",
      "Current photo",
    ],
  },
  {
    id: "property.land",
    label: "Plot or land",
    groupId: "real-estate-land",
    kind: "real-estate",
    recommendedEvidenceTypes: [
      "Title deed",
      "Survey or site plan",
      "Current photo",
    ],
  },
  {
    id: "property.commercial",
    label: "Commercial property",
    groupId: "real-estate-land",
    kind: "real-estate",
    recommendedEvidenceTypes: [
      "Title deed",
      "Insurance policy",
      "Lease record",
    ],
  },
  {
    id: "lifestyle.watch",
    label: "Watch",
    groupId: "lifestyle-personal",
    kind: "physical",
    recommendedEvidenceTypes: [
      "Current photo",
      "Purchase receipt",
      "Service record",
    ],
  },
  {
    id: "lifestyle.jewelry",
    label: "Jewelry",
    groupId: "lifestyle-personal",
    kind: "physical",
    recommendedEvidenceTypes: [
      "Current photo",
      "Purchase receipt",
      "Valuation",
    ],
  },
  {
    id: "art.painting",
    label: "Painting",
    groupId: "art-collectibles",
    kind: "physical",
    recommendedEvidenceTypes: [
      "Current photo",
      "Provenance record",
      "Condition report",
    ],
  },
  {
    id: "art.collectible",
    label: "Collectible",
    groupId: "art-collectibles",
    kind: "physical",
    recommendedEvidenceTypes: ["Current photo", "Provenance record"],
  },
  {
    id: "home.electronics",
    label: "Electronics",
    groupId: "home-storage",
    kind: "physical",
    recommendedEvidenceTypes: ["Current photo", "Purchase receipt"],
  },
  {
    id: "home.furniture",
    label: "Furniture",
    groupId: "home-storage",
    kind: "physical",
    recommendedEvidenceTypes: ["Current photo", "Purchase receipt"],
  },
  {
    id: "home.other",
    label: "Physical item",
    groupId: "home-storage",
    kind: "physical",
    recommendedEvidenceTypes: ["Current photo"],
  },
  {
    id: "digital.asset",
    label: "Digital asset",
    groupId: "digital-records",
    kind: "digital",
    recommendedEvidenceTypes: ["Ownership record"],
  },
  {
    id: "document.important",
    label: "Important document",
    groupId: "digital-records",
    kind: "document",
    recommendedEvidenceTypes: ["Current document copy"],
  },
] as const satisfies readonly FocusedCategory[];

const CATEGORIES_BY_ID = new Map<string, FocusedCategory>(
  FOCUSED_V1_CATEGORIES.map((category) => [category.id, category]),
);

export function getFocusedCategory(
  categoryId: string,
): FocusedCategory | null {
  return CATEGORIES_BY_ID.get(categoryId) ?? null;
}

export interface LocationPolicy {
  readonly kind: FocusedAssetKind;
  readonly isRealEstate: boolean;
  readonly requiresPhysicalLocator: boolean;
  readonly allowsVirtual: boolean;
  readonly usesNotApplicable: boolean;
}

export function getLocationPolicy(
  categoryOrKind: string | FocusedCategory,
): LocationPolicy {
  const category =
    typeof categoryOrKind === "string"
      ? getFocusedCategory(categoryOrKind)
      : categoryOrKind;
  const kind: FocusedAssetKind =
    category?.kind ??
    (categoryOrKind === "real-estate" ||
    categoryOrKind === "digital" ||
    categoryOrKind === "document"
      ? categoryOrKind
      : "physical");

  return {
    kind,
    isRealEstate: kind === "real-estate",
    requiresPhysicalLocator: kind === "physical" || kind === "real-estate",
    allowsVirtual: kind === "digital" || kind === "document",
    usesNotApplicable: false,
  };
}
