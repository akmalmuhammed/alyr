import type {
  EvidenceDescriptor,
  EvidenceKind,
  EvidenceRelation,
  EvidenceVersionDescriptor,
  LocationRevision,
  LocationSpaceSnapshot,
} from "@alyr/contracts";
import {
  createHonestPlacePin,
  evidenceVersionIdForChecksum,
  getFocusedCategory,
  toLocationPlaceSnapshot,
} from "@alyr/domain";
import type {
  FocusedAssetRecord,
  FocusedPlaceRecord,
  FocusedSpaceRecord,
  FocusedWorkspace,
} from "@alyr/domain";

export const FOCUSED_FIXTURE_TIMESTAMP = "2026-07-25T08:00:00.000Z";
export const FOCUSED_FIXTURE_ASSET_TARGET = 25;

interface AssetSeed {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly placeId: string | null;
  readonly spaceId: string | null;
  readonly locationDetail: string | null;
  readonly reference: string | null;
  readonly valueMinor: number | null;
  readonly notes: string | null;
  readonly proofType: string;
}

const ASSET_SEEDS: readonly AssetSeed[] = [
  {
    id: "asset-gmt-watch",
    name: "GMT travel watch",
    categoryId: "lifestyle.watch",
    placeId: "place-west-bay",
    spaceId: "space-study-safe",
    locationDetail: "Watch roll, slot 1",
    reference: "WATCH-001",
    valueMinor: 4_600_000,
    notes: "Synthetic pilot fixture.",
    proofType: "Current photo",
  },
  {
    id: "asset-dress-watch",
    name: "Family dress watch",
    categoryId: "lifestyle.watch",
    placeId: "place-west-bay",
    spaceId: "space-study-safe",
    locationDetail: "Watch roll, slot 2",
    reference: "WATCH-002",
    valueMinor: 1_850_000,
    notes: "Service history should remain linked.",
    proofType: "Service record",
  },
  {
    id: "asset-heirloom-ring",
    name: "Heirloom ring",
    categoryId: "lifestyle.jewelry",
    placeId: "place-west-bay",
    spaceId: "space-study-safe",
    locationDetail: "Jewelry tray",
    reference: "JEWEL-001",
    valueMinor: 725_000,
    notes: "Passed through the family.",
    proofType: "Valuation",
  },
  {
    id: "asset-desert-painting",
    name: "Desert light painting",
    categoryId: "art.painting",
    placeId: "place-west-bay",
    spaceId: "space-study",
    locationDetail: "North wall",
    reference: "ART-007-25",
    valueMinor: 1_800_000,
    notes: "Synthetic edition record.",
    proofType: "Provenance record",
  },
  {
    id: "asset-bronze-sculpture",
    name: "Bronze study sculpture",
    categoryId: "art.collectible",
    placeId: "place-pearl",
    spaceId: "space-pearl-living",
    locationDetail: "Display console",
    reference: "ART-BR-04",
    valueMinor: 940_000,
    notes: "Condition review due annually.",
    proofType: "Current photo",
  },
  {
    id: "asset-family-suv",
    name: "Family SUV",
    categoryId: "vehicle.car",
    placeId: "place-west-bay",
    spaceId: "space-garage",
    locationDetail: "Bay 1",
    reference: "VEHICLE-001",
    valueMinor: 18_000_000,
    notes: "Fixture identifier, not a real registration.",
    proofType: "Registration",
  },
  {
    id: "asset-motorbike",
    name: "Weekend motorbike",
    categoryId: "vehicle.motorcycle",
    placeId: "place-west-bay",
    spaceId: "space-garage",
    locationDetail: "Bay 2",
    reference: "VEHICLE-002",
    valueMinor: 4_200_000,
    notes: "Fixture identifier, not a real registration.",
    proofType: "Insurance policy",
  },
  {
    id: "asset-film-camera",
    name: "Childhood film camera",
    categoryId: "art.collectible",
    placeId: "place-archive",
    spaceId: "space-archive-box-a",
    locationDetail: "Padded camera pouch",
    reference: "CAMERA-1989",
    valueMinor: null,
    notes: "Important for its story rather than market value.",
    proofType: "Current photo",
  },
  {
    id: "asset-work-laptop",
    name: "Personal laptop",
    categoryId: "home.electronics",
    placeId: "place-west-bay",
    spaceId: "space-study",
    locationDetail: "Desk drawer",
    reference: "DEVICE-001",
    valueMinor: 620_000,
    notes: "Never store its password in ALYR.",
    proofType: "Purchase receipt",
  },
  {
    id: "asset-tablet",
    name: "Family tablet",
    categoryId: "home.electronics",
    placeId: "place-pearl",
    spaceId: "space-pearl-living",
    locationDetail: "Media cabinet",
    reference: "DEVICE-002",
    valueMinor: 260_000,
    notes: "Never store its password in ALYR.",
    proofType: "Current photo",
  },
  {
    id: "asset-phone",
    name: "Spare phone",
    categoryId: "home.electronics",
    placeId: "place-west-bay",
    spaceId: "space-study-safe",
    locationDetail: "Electronics pouch",
    reference: "DEVICE-003",
    valueMinor: 180_000,
    notes: "No account credentials included.",
    proofType: "Purchase receipt",
  },
  {
    id: "asset-television",
    name: "Living room television",
    categoryId: "home.electronics",
    placeId: "place-pearl",
    spaceId: "space-pearl-living",
    locationDetail: "Media wall",
    reference: "DEVICE-004",
    valueMinor: 510_000,
    notes: "Model reference is synthetic.",
    proofType: "Current photo",
  },
  {
    id: "asset-sofa",
    name: "Living room sofa",
    categoryId: "home.furniture",
    placeId: "place-west-bay",
    spaceId: "space-living",
    locationDetail: "Window side",
    reference: "FURN-001",
    valueMinor: 780_000,
    notes: "Custom upholstery.",
    proofType: "Purchase receipt",
  },
  {
    id: "asset-dining-table",
    name: "Dining table",
    categoryId: "home.furniture",
    placeId: "place-west-bay",
    spaceId: "space-dining",
    locationDetail: "Center",
    reference: "FURN-002",
    valueMinor: 430_000,
    notes: "Seats eight.",
    proofType: "Current photo",
  },
  {
    id: "asset-handwoven-rug",
    name: "Handwoven rug",
    categoryId: "art.collectible",
    placeId: "place-west-bay",
    spaceId: "space-living",
    locationDetail: "Main seating area",
    reference: "TEXTILE-001",
    valueMinor: 360_000,
    notes: "Care instructions linked as evidence.",
    proofType: "Current photo",
  },
  {
    id: "asset-coffee-set",
    name: "Silver coffee set",
    categoryId: "home.other",
    placeId: "place-west-bay",
    spaceId: "space-dining-cabinet",
    locationDetail: "Upper shelf",
    reference: "HOME-001",
    valueMinor: 290_000,
    notes: "Used for family gatherings.",
    proofType: "Current photo",
  },
  {
    id: "asset-title-deed-copy",
    name: "West Bay title deed copy",
    categoryId: "document.important",
    placeId: null,
    spaceId: null,
    locationDetail: null,
    reference: "DOC-001",
    valueMinor: null,
    notes: "Digital reference only; the original has separate storage.",
    proofType: "Current document copy",
  },
  {
    id: "asset-insurance-archive",
    name: "Household insurance archive",
    categoryId: "document.important",
    placeId: null,
    spaceId: null,
    locationDetail: null,
    reference: "DOC-002",
    valueMinor: null,
    notes: "Policy copies without account credentials.",
    proofType: "Current document copy",
  },
  {
    id: "asset-pearl-apartment",
    name: "Pearl apartment",
    categoryId: "property.apartment",
    placeId: "place-pearl",
    spaceId: null,
    locationDetail: "The Pearl-Qatar",
    reference: "PROPERTY-001",
    valueMinor: 240_000_000,
    notes: "Synthetic property fixture.",
    proofType: "Title deed",
  },
  {
    id: "asset-family-plot",
    name: "Family land plot",
    categoryId: "property.land",
    placeId: "place-archive",
    spaceId: null,
    locationDetail: "Al Wakrah",
    reference: "PROPERTY-002",
    valueMinor: 110_000_000,
    notes: "Synthetic plot fixture.",
    proofType: "Survey or site plan",
  },
  {
    id: "asset-family-domain",
    name: "Family domain name",
    categoryId: "digital.asset",
    placeId: null,
    spaceId: null,
    locationDetail: null,
    reference: "DIGITAL-001",
    valueMinor: null,
    notes: "Provider reference only; never store credentials.",
    proofType: "Ownership record",
  },
  {
    id: "asset-photo-archive",
    name: "Family photo archive",
    categoryId: "digital.asset",
    placeId: null,
    spaceId: null,
    locationDetail: null,
    reference: "DIGITAL-002",
    valueMinor: null,
    notes: "A locator, not a password or recovery key.",
    proofType: "Ownership record",
  },
  {
    id: "asset-coin-collection",
    name: "Inherited coin collection",
    categoryId: "art.collectible",
    placeId: "place-archive",
    spaceId: "space-archive-box-b",
    locationDetail: "Coin tray",
    reference: "COLLECT-001",
    valueMinor: null,
    notes: "Provenance is still being documented.",
    proofType: "Provenance record",
  },
  {
    id: "asset-stamp-album",
    name: "Stamp album",
    categoryId: "art.collectible",
    placeId: "place-archive",
    spaceId: "space-archive-box-b",
    locationDetail: "Archival sleeve",
    reference: "COLLECT-002",
    valueMinor: null,
    notes: "Keep away from humidity.",
    proofType: "Current photo",
  },
  {
    id: "asset-safe-key",
    name: "Archive safe key",
    categoryId: "home.other",
    placeId: "place-west-bay",
    spaceId: "space-study-safe",
    locationDetail: "Sealed key envelope",
    reference: "HOME-KEY-001",
    valueMinor: null,
    notes: "Retrieval record only; no access code is stored.",
    proofType: "Current photo",
  },
];

function createPlaces(): readonly FocusedPlaceRecord[] {
  return [
    {
      id: "place-west-bay",
      householdId: "household-focused-pilot",
      name: "West Bay Home",
      addressSummary: "West Bay, Doha",
      pin: createHonestPlacePin({
        latitude: 25.3285,
        longitude: 51.5317,
        source: "user_pin",
        observedAt: FOCUSED_FIXTURE_TIMESTAMP,
        confirmedAt: FOCUSED_FIXTURE_TIMESTAMP,
      }),
      status: "active",
      createdAt: FOCUSED_FIXTURE_TIMESTAMP,
      updatedAt: FOCUSED_FIXTURE_TIMESTAMP,
    },
    {
      id: "place-pearl",
      householdId: "household-focused-pilot",
      name: "Pearl Apartment",
      addressSummary: "The Pearl-Qatar, Doha",
      pin: createHonestPlacePin({
        latitude: 25.3684,
        longitude: 51.551,
        source: "user_pin",
        observedAt: FOCUSED_FIXTURE_TIMESTAMP,
        confirmedAt: FOCUSED_FIXTURE_TIMESTAMP,
      }),
      status: "active",
      createdAt: FOCUSED_FIXTURE_TIMESTAMP,
      updatedAt: FOCUSED_FIXTURE_TIMESTAMP,
    },
    {
      id: "place-archive",
      householdId: "household-focused-pilot",
      name: "Family Archive",
      addressSummary: "Al Wakrah, Qatar",
      pin: createHonestPlacePin({
        latitude: 25.1715,
        longitude: 51.6034,
        source: "device_gps",
        horizontalAccuracyMeters: 12,
        observedAt: FOCUSED_FIXTURE_TIMESTAMP,
        confirmedAt: FOCUSED_FIXTURE_TIMESTAMP,
      }),
      status: "active",
      createdAt: FOCUSED_FIXTURE_TIMESTAMP,
      updatedAt: FOCUSED_FIXTURE_TIMESTAMP,
    },
  ];
}

function createSpaces(): readonly FocusedSpaceRecord[] {
  const base = {
    householdId: "household-focused-pilot",
    createdAt: FOCUSED_FIXTURE_TIMESTAMP,
    updatedAt: FOCUSED_FIXTURE_TIMESTAMP,
  } as const;
  return [
    { ...base, id: "space-study", placeId: "place-west-bay", parentSpaceId: null, name: "Study", kind: "room" },
    { ...base, id: "space-study-safe", placeId: "place-west-bay", parentSpaceId: "space-study", name: "Study safe", kind: "container" },
    { ...base, id: "space-garage", placeId: "place-west-bay", parentSpaceId: null, name: "Garage", kind: "room" },
    { ...base, id: "space-living", placeId: "place-west-bay", parentSpaceId: null, name: "Living room", kind: "room" },
    { ...base, id: "space-dining", placeId: "place-west-bay", parentSpaceId: null, name: "Dining room", kind: "room" },
    { ...base, id: "space-dining-cabinet", placeId: "place-west-bay", parentSpaceId: "space-dining", name: "Display cabinet", kind: "container" },
    { ...base, id: "space-pearl-living", placeId: "place-pearl", parentSpaceId: null, name: "Living room", kind: "room" },
    { ...base, id: "space-archive-room", placeId: "place-archive", parentSpaceId: null, name: "Archive room", kind: "room" },
    { ...base, id: "space-archive-box-a", placeId: "place-archive", parentSpaceId: "space-archive-room", name: "Archive box A", kind: "container" },
    { ...base, id: "space-archive-box-b", placeId: "place-archive", parentSpaceId: "space-archive-room", name: "Archive box B", kind: "container" },
  ];
}

function createSpacePath(
  spaces: readonly FocusedSpaceRecord[],
  spaceId: string | null,
): readonly LocationSpaceSnapshot[] {
  if (!spaceId) return [];
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const path: FocusedSpaceRecord[] = [];
  const seen = new Set<string>();
  let current = byId.get(spaceId);
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parentSpaceId
      ? byId.get(current.parentSpaceId)
      : undefined;
  }
  return path.map((space) => ({
    id: space.id,
    name: space.name,
    kind: space.kind,
  }));
}

function relationForProofType(type: string): EvidenceRelation {
  const value = type.toLowerCase();
  if (value.includes("insurance")) return "insurance";
  if (value.includes("service")) return "service";
  if (value.includes("provenance")) return "provenance";
  if (value.includes("condition") || value.includes("photo")) {
    return "condition";
  }
  if (
    value.includes("title") ||
    value.includes("ownership") ||
    value.includes("registration")
  ) {
    return "ownership";
  }
  if (value.includes("valuation")) return "valuation";
  return "context";
}

function evidenceKindForProofType(type: string): EvidenceKind {
  return type.toLowerCase().includes("photo") ? "media" : "paper";
}

export function createFocusedHouseholdFixture(): FocusedWorkspace {
  const places = createPlaces();
  const spaces = createSpaces();
  const placeById = new Map(places.map((place) => [place.id, place]));
  const assets: FocusedAssetRecord[] = [];
  const evidence: EvidenceDescriptor[] = [];
  const evidenceVersions: EvidenceVersionDescriptor[] = [];
  const locationRevisions: LocationRevision[] = [];

  for (const [index, seed] of ASSET_SEEDS.entries()) {
    const category = getFocusedCategory(seed.categoryId);
    if (!category) {
      throw new Error(`Fixture category is missing: ${seed.categoryId}`);
    }
    const isVirtual =
      category.kind === "digital" || category.kind === "document";
    const place = seed.placeId ? placeById.get(seed.placeId) ?? null : null;
    const asset: FocusedAssetRecord = {
      id: seed.id,
      householdId: "household-focused-pilot",
      name: seed.name,
      categoryId: category.id,
      categoryLabel: category.label,
      kind: category.kind,
      ownerMemberId: "member-owner",
      custodianMemberId: "member-owner",
      locationMode: isVirtual ? "virtual" : place ? "physical" : "unknown",
      locationStatus: isVirtual ? "unknown" : place ? "known" : "unknown",
      placeId: seed.placeId,
      spaceId: seed.spaceId,
      locationDetail: seed.locationDetail,
      reference: seed.reference,
      value:
        seed.valueMinor === null
          ? null
          : { amountMinor: seed.valueMinor, currency: "QAR" },
      notes: seed.notes,
      requiredProofTypes: [seed.proofType],
      lifecycleStatus: "active",
      createdAt: FOCUSED_FIXTURE_TIMESTAMP,
      updatedAt: FOCUSED_FIXTURE_TIMESTAMP,
    };
    assets.push(asset);

    if (!isVirtual && place) {
      locationRevisions.push({
        id: `location-${String(index + 1).padStart(2, "0")}`,
        householdId: "household-focused-pilot",
        assetId: asset.id,
        mode: "physical",
        status: "known",
        placeId: place.id,
        spaceId: seed.spaceId,
        placeSnapshot: toLocationPlaceSnapshot(place),
        spacePathSnapshot: createSpacePath(spaces, seed.spaceId),
        locatorText: seed.locationDetail,
        confirmationState: "user-confirmed",
        source: "imported",
        observedAt: FOCUSED_FIXTURE_TIMESTAMP,
        validFrom: FOCUSED_FIXTURE_TIMESTAMP,
        validTo: null,
        createdByMemberId: "member-owner",
        reason: "Synthetic pilot fixture",
        createdAt: FOCUSED_FIXTURE_TIMESTAMP,
      });
    }

    const evidenceId = `evidence-${String(index + 1).padStart(2, "0")}`;
    const checksum = (index + 1).toString(16).padStart(64, "0");
    const versionId = evidenceVersionIdForChecksum(checksum);
    const reviewed = index < 15;
    evidence.push({
      id: evidenceId,
      householdId: "household-focused-pilot",
      assetId: asset.id,
      type: seed.proofType,
      kind: evidenceKindForProofType(seed.proofType),
      relation: relationForProofType(seed.proofType),
      reviewStatus: reviewed ? "reviewed" : "pending",
      currentVersionId: versionId,
      linkUrl: null,
      note: null,
      materialStorage: null,
      reviewedAt: reviewed ? FOCUSED_FIXTURE_TIMESTAMP : null,
      reviewedByMemberId: reviewed ? "member-owner" : null,
      createdAt: FOCUSED_FIXTURE_TIMESTAMP,
      updatedAt: FOCUSED_FIXTURE_TIMESTAMP,
    });
    evidenceVersions.push({
      id: versionId,
      householdId: "household-focused-pilot",
      evidenceId,
      blobObjectId: `blob-${String(index + 1).padStart(2, "0")}`,
      fileName: `${evidenceId}.${evidenceKindForProofType(seed.proofType) === "media" ? "jpg" : "pdf"}`,
      mimeType:
        evidenceKindForProofType(seed.proofType) === "media"
          ? "image/jpeg"
          : "application/pdf",
      byteSize: 1024 + index,
      checksumSha256: checksum,
      storageState: "on-device",
      capturedAt: FOCUSED_FIXTURE_TIMESTAMP,
      createdByMemberId: "member-owner",
      createdAt: FOCUSED_FIXTURE_TIMESTAMP,
    });
  }

  return {
    household: {
      id: "household-focused-pilot",
      name: "ALYR Pilot Household",
      locale: "en",
      defaultCurrency: "QAR",
      createdAt: FOCUSED_FIXTURE_TIMESTAMP,
    },
    members: [
      {
        id: "member-owner",
        householdId: "household-focused-pilot",
        displayName: "Household owner",
        role: "owner",
        createdAt: FOCUSED_FIXTURE_TIMESTAMP,
      },
      {
        id: "member-viewer",
        householdId: "household-focused-pilot",
        displayName: "Trusted viewer",
        role: "viewer",
        createdAt: FOCUSED_FIXTURE_TIMESTAMP,
      },
    ],
    places,
    spaces,
    assets,
    evidence,
    evidenceVersions,
    locationRevisions,
  };
}

function deepFreeze<T>(value: T): T {
  if (
    value !== null &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const FOCUSED_HOUSEHOLD_FIXTURE = deepFreeze(
  createFocusedHouseholdFixture(),
);
