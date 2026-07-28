export const FOCUSED_TAXONOMY_VERSION = 1 as const;

export type FocusedAssetKind =
  | "physical"
  | "real-estate"
  | "digital"
  | "document";

/**
 * Portfolio values are deliberately opt-in by category.
 *
 * - `asset` categories may carry a dated user-entered item value.
 * - `place` categories are represented by an explicitly owned Place instead
 *   of a duplicate Asset record.
 * - `none` categories remain continuity records and never enter value
 *   coverage or a financial position.
 */
export type PortfolioValueSubjectPolicy = "asset" | "place" | "none";

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
  readonly portfolioValueSubject: PortfolioValueSubjectPolicy;
  readonly recommendedEvidenceTypes: readonly string[];
}

export const FOCUSED_V1_CATEGORIES = [
  {
    id: "vehicle.car",
    label: "Car",
    groupId: "vehicles",
    kind: "physical",
    portfolioValueSubject: "asset",
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
    portfolioValueSubject: "asset",
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
    portfolioValueSubject: "place",
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
    portfolioValueSubject: "place",
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
    portfolioValueSubject: "place",
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
    portfolioValueSubject: "place",
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
    portfolioValueSubject: "asset",
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
    portfolioValueSubject: "asset",
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
    portfolioValueSubject: "asset",
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
    portfolioValueSubject: "asset",
    recommendedEvidenceTypes: ["Current photo", "Provenance record"],
  },
  {
    id: "home.electronics",
    label: "Electronics",
    groupId: "home-storage",
    kind: "physical",
    portfolioValueSubject: "asset",
    recommendedEvidenceTypes: ["Current photo", "Purchase receipt"],
  },
  {
    id: "home.furniture",
    label: "Furniture",
    groupId: "home-storage",
    kind: "physical",
    portfolioValueSubject: "asset",
    recommendedEvidenceTypes: ["Current photo", "Purchase receipt"],
  },
  {
    id: "home.other",
    label: "Physical item",
    groupId: "home-storage",
    kind: "physical",
    portfolioValueSubject: "asset",
    recommendedEvidenceTypes: ["Current photo"],
  },
  {
    id: "digital.asset",
    label: "Digital asset",
    groupId: "digital-records",
    kind: "digital",
    portfolioValueSubject: "asset",
    recommendedEvidenceTypes: ["Ownership record"],
  },
  {
    id: "document.important",
    label: "Important document",
    groupId: "digital-records",
    kind: "document",
    portfolioValueSubject: "none",
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

export interface PortfolioValuePolicy {
  readonly subject: PortfolioValueSubjectPolicy;
  readonly contributesToFinancialPosition: boolean;
}

/**
 * Returns the reviewed value policy for a category.
 *
 * Unknown legacy categories retain the previous item-value behavior rather
 * than silently losing a user's historical value. Known document categories
 * are explicitly non-financial.
 */
export function getPortfolioValuePolicy(
  categoryOrKind: string | FocusedCategory,
): PortfolioValuePolicy {
  const category =
    typeof categoryOrKind === "string"
      ? getFocusedCategory(categoryOrKind)
      : categoryOrKind;
  const subject: PortfolioValueSubjectPolicy =
    category?.portfolioValueSubject ??
    (categoryOrKind === "real-estate"
      ? "place"
      : categoryOrKind === "document"
        ? "none"
        : "asset");

  return {
    subject,
    contributesToFinancialPosition: subject !== "none",
  };
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
