/**
 * Canonical demo data for the web prototype.
 *
 * This is intentionally plain, serializable data. It is not a security model,
 * does not contain real files, and makes no claim that browser storage is
 * encrypted. The same entity shapes can later be transported through an API.
 */

export const SAMPLE_SNAPSHOT_VERSION = 5;

const HOUSEHOLD_ID = "household-al-hamad-demo";
const OWNER_ID = "member-akmal";
const SAMPLE_NOW = "2026-07-24T09:42:00.000Z";

const regions = [
  { id: "doha", name: "Doha", lat: 25.2854, lng: 51.531 },
  { id: "london", name: "London", lat: 51.5074, lng: -0.1278 },
  { id: "dubai", name: "Dubai", lat: 25.2048, lng: 55.2708 },
];

const members = [
  {
    id: OWNER_ID,
    householdId: HOUSEHOLD_ID,
    name: "Akmal H.",
    email: "akmal@example.test",
    initials: "AH",
    accessRole: "owner",
    accessScope: "all",
    inviteStatus: "active",
    joinedAt: "2026-07-01T08:00:00.000Z",
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "member-sara",
    householdId: HOUSEHOLD_ID,
    name: "Sara H.",
    email: "sara@example.test",
    initials: "SH",
    accessRole: "co-owner",
    accessScope: "home-and-family",
    inviteStatus: "active",
    joinedAt: "2026-07-03T11:20:00.000Z",
    createdAt: "2026-07-03T11:20:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "member-nadia",
    householdId: HOUSEHOLD_ID,
    name: "Nadia A.",
    email: "nadia@example.test",
    initials: "NA",
    accessRole: "trusted-contact",
    accessScope: "emergency-preview",
    inviteStatus: "active",
    joinedAt: "2026-07-18T15:00:00.000Z",
    createdAt: "2026-07-10T15:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
];

const places = [
  {
    id: "west-bay-home",
    householdId: HOUSEHOLD_ID,
    name: "West Bay Home",
    kind: "home",
    regionId: "doha",
    city: "Doha",
    countryCode: "QA",
    address: "West Bay, Doha",
    coordinates: { lat: 25.3295, lng: 51.5309 },
    locationSource: "user_pin",
    locationPrecision: "exact",
    horizontalAccuracyMeters: null,
    locationCapturedAt: "2026-07-01T08:00:00.000Z",
    locationConfirmedAt: "2026-07-01T08:00:00.000Z",
    status: "active",
    image: "/assets/west-bay-home.png",
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "pearl-apartment-place",
    householdId: HOUSEHOLD_ID,
    name: "Pearl apartment",
    kind: "apartment",
    tenure: "owned",
    propertyAssetId: "pearl-apartment",
    regionId: "doha",
    city: "Doha",
    countryCode: "QA",
    address: "The Pearl-Qatar, Doha",
    coordinates: { lat: 25.3718, lng: 51.5517 },
    locationSource: "geocoder",
    locationPrecision: "approximate",
    horizontalAccuracyMeters: null,
    locationCapturedAt: "2026-07-02T09:30:00.000Z",
    locationConfirmedAt: null,
    status: "active",
    image: null,
    createdAt: "2026-07-02T09:30:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "family-archive",
    householdId: HOUSEHOLD_ID,
    name: "Family archive",
    kind: "archive",
    regionId: "london",
    city: "London",
    countryCode: "GB",
    address: "London, United Kingdom",
    coordinates: { lat: 51.5074, lng: -0.1278 },
    locationSource: "geocoder",
    locationPrecision: "locality_only",
    horizontalAccuracyMeters: null,
    locationCapturedAt: "2026-07-04T13:00:00.000Z",
    locationConfirmedAt: null,
    status: "active",
    image: null,
    createdAt: "2026-07-04T13:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "dubai-storage",
    householdId: HOUSEHOLD_ID,
    name: "Storage suite",
    kind: "storage",
    tenure: "rented",
    propertyAssetId: null,
    regionId: "dubai",
    city: "Dubai",
    countryCode: "AE",
    address: "Dubai, United Arab Emirates",
    coordinates: { lat: 25.2048, lng: 55.2708 },
    locationSource: "geocoder",
    locationPrecision: "locality_only",
    horizontalAccuracyMeters: null,
    locationCapturedAt: "2026-07-06T10:15:00.000Z",
    locationConfirmedAt: null,
    status: "active",
    image: null,
    createdAt: "2026-07-06T10:15:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
];

const spaces = [
  {
    id: "study",
    placeId: "west-bay-home",
    parentSpaceId: null,
    name: "Study",
    kind: "room",
    sortOrder: 10,
    note: "One receipt and a wide room photo would complete this room.",
    lastCapturedAt: "2026-07-20T16:30:00.000Z",
    createdAt: "2026-07-01T08:20:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "study-safe",
    placeId: "west-bay-home",
    parentSpaceId: "study",
    name: "Study safe",
    kind: "container",
    sortOrder: 11,
    note: "Private container label; no access details are stored in this demo.",
    lastCapturedAt: "2026-07-20T16:30:00.000Z",
    createdAt: "2026-07-01T08:25:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "wardrobe",
    placeId: "west-bay-home",
    parentSpaceId: null,
    name: "Wardrobe",
    kind: "room",
    sortOrder: 20,
    note: "High-value bags and jewelry need closer photos.",
    lastCapturedAt: "2026-07-18T14:10:00.000Z",
    createdAt: "2026-07-01T08:30:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "garage",
    placeId: "west-bay-home",
    parentSpaceId: null,
    name: "Garage",
    kind: "room",
    sortOrder: 30,
    note: "Add serial numbers for tools and the bicycle.",
    lastCapturedAt: "2026-07-12T10:00:00.000Z",
    createdAt: "2026-07-01T08:35:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "pearl-residence",
    placeId: "pearl-apartment-place",
    parentSpaceId: null,
    name: "Residence",
    kind: "zone",
    sortOrder: 10,
    note: "Property-level records and household contents.",
    lastCapturedAt: "2026-07-19T12:00:00.000Z",
    createdAt: "2026-07-02T09:40:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "archive-boxes",
    placeId: "family-archive",
    parentSpaceId: null,
    name: "Archive boxes",
    kind: "container",
    sortOrder: 10,
    note: "Family memories and inherited objects.",
    lastCapturedAt: "2026-07-15T12:00:00.000Z",
    createdAt: "2026-07-04T13:10:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "storage-vault",
    placeId: "dubai-storage",
    parentSpaceId: null,
    name: "Storage vault",
    kind: "zone",
    sortOrder: 10,
    note: "Managed storage suite.",
    lastCapturedAt: "2026-07-16T12:00:00.000Z",
    createdAt: "2026-07-06T10:20:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
];

function asset({
  id,
  name,
  category,
  categoryId = null,
  kind = "physical",
  placeId = null,
  spaceId = null,
  locationStatus = placeId ? "known" : "unknown",
  locationDetail = null,
  locationMode = null,
  reference = null,
  valueAmount = null,
  valueCurrency = "QAR",
  valueLabel = null,
  requiredEvidenceTypes = [],
  description = "",
  tags = [],
  story = null,
  meaningFacets = [],
  sentimentalValue = null,
  legacyIntent = "undecided",
  visibility = "private",
  coverImage = null,
  acquiredAt = null,
  profile = {},
  propertyPlaceId = null,
}) {
  return {
    id,
    householdId: HOUSEHOLD_ID,
    name,
    category,
    categoryId,
    kind,
    notes: [description, story].filter(Boolean).join("\n\n"),
    ownerMemberId: OWNER_ID,
    custodianMemberId: OWNER_ID,
    placeId,
    spaceId,
    locationMode,
    locationStatus,
    locationDetail,
    profile,
    propertyPlaceId,
    meaningFacets,
    sentimentalValue,
    legacyIntent,
    visibility,
    coverImage,
    acquiredAt,
    reference,
    value:
      valueAmount === null
        ? null
        : {
            amountMinor: Math.round(valueAmount * 100),
            currency: valueCurrency,
          },
    displayValue: valueLabel,
    requiredProofTypes: requiredEvidenceTypes,
    tags,
    lifecycleStatus: "active",
    archivedAt: null,
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  };
}

const featuredAssets = [
  asset({
    id: "gmt-master-ii",
    name: "GMT-Master II",
    category: "Watch",
    placeId: "west-bay-home",
    spaceId: "study-safe",
    locationDetail: "Watch roll",
    reference: "126710BLNR",
    valueAmount: 46000,
    valueLabel: "QAR 46,000",
    requiredEvidenceTypes: ["Service record"],
    description: "Personal watch with purchase and identity records.",
    tags: ["watch", "gmt", "priority"],
    meaningFacets: ["collectible", "investment", "personal-style"],
    coverImage: "/assets/samples/watch-collection-cover.png",
    acquiredAt: "2020-06-18T00:00:00.000Z",
  }),
  asset({
    id: "desert-light-study",
    name: "Desert Light, No. 3",
    category: "Art",
    placeId: "west-bay-home",
    spaceId: "study",
    locationDetail: "North wall",
    reference: "Edition 7/25",
    valueAmount: 18000,
    valueLabel: "QAR 18,000 estimate",
    requiredEvidenceTypes: [
      "Provenance record",
      "Current photo",
      "Condition report",
    ],
    description:
      "A contemporary mixed-media study collected in Doha and displayed at home.",
    story:
      "The first artwork chosen together for the home; the changing light feels different every morning.",
    tags: ["art", "doha", "edition", "collected"],
    meaningFacets: ["collectible", "art", "investment", "memory"],
    sentimentalValue:
      "It marks the moment the house began to feel like our own.",
    legacyIntent: "inherit",
    coverImage: "/assets/samples/art-collection-cover.png",
    acquiredAt: "2021-11-04T00:00:00.000Z",
    profile: {
      creator: "Layla Al-Mansoori",
      "title-model": "Desert Light, No. 3",
      "production-year": "2018",
      edition: "7/25",
      "provenance-summary":
        "Acquired from a Doha gallery in 2021; supporting records remain attached to the Asset Passport.",
    },
  }),
  asset({
    id: "pearl-apartment",
    name: "Pearl apartment",
    category: "Property",
    categoryId: "property.apartment",
    kind: "real-estate",
    propertyPlaceId: "pearl-apartment-place",
    placeId: "pearl-apartment-place",
    spaceId: null,
    locationDetail: "The Pearl-Qatar",
    reference: "QA-PROP-PEARL-DEMO",
    valueAmount: 2400000,
    valueLabel: "QAR 2.4M",
    requiredEvidenceTypes: ["Insurance policy"],
    description: "Property passport with ownership, service, and insurance records.",
    tags: ["property", "doha", "insurance"],
  }),
  asset({
    id: "west-bay-title-deed",
    name: "West Bay title deed",
    category: "Document",
    kind: "document",
    placeId: "west-bay-home",
    spaceId: "study-safe",
    locationDetail: "Property records folder",
    reference: "QA-DEED-WB-DEMO",
    valueLabel: "Verified",
    requiredEvidenceTypes: ["Current document copy"],
    description: "Demo metadata for the current title deed copy.",
    tags: ["document", "deed", "property"],
  }),
  asset({
    id: "childhood-film-camera",
    name: "Childhood film camera",
    category: "Collectible",
    kind: "memory",
    placeId: "family-archive",
    spaceId: "archive-boxes",
    locationStatus: "needs-detail",
    locationDetail: null,
    valueLabel: "Story added",
    requiredEvidenceTypes: ["Current photo"],
    story: "A childhood camera remembered through a family story.",
    tags: ["childhood", "camera", "memory"],
    meaningFacets: ["collectible", "heirloom", "memory"],
    sentimentalValue: "A first camera and a reminder of learning to notice small moments.",
    legacyIntent: "inherit",
    coverImage: "/assets/samples/family-memory-cover.png",
    profile: {
      origin: "A gift from Uncle Yusuf",
      "date-period": "Childhood · 1999",
      people: "Yusuf and Akmal",
      story:
        "The camera used on early family trips and the beginning of a lifelong habit of noticing small details.",
    },
  }),
  asset({
    id: "inherited-coin-box",
    name: "Inherited coin box",
    category: "Collectible",
    kind: "memory",
    valueLabel: "Story added",
    requiredEvidenceTypes: ["Current photo"],
    story: "Inherited family keepsake; its current location is not confirmed.",
    tags: ["inherited", "coins", "memory"],
    meaningFacets: ["collectible", "heirloom", "memory"],
    sentimentalValue: "Connected to a loved person and the stories they carried.",
    legacyIntent: "inherit",
    profile: {
      origin: "Grandfather Yusuf's study",
      "date-period": "1940s–1980s",
      people: "Yusuf and family",
      story:
        "A small box of coins collected through travel, with several places and dates still waiting to be identified.",
    },
  }),
  asset({
    id: "family-photo-album",
    name: "Family photo album",
    category: "Personal",
    kind: "memory",
    valueLabel: "24 memories",
    requiredEvidenceTypes: ["Current photo"],
    story: "A remembered album with family photographs.",
    tags: ["family", "photos", "memory"],
    meaningFacets: ["memory", "family-history"],
    sentimentalValue: "The people and places in these photographs matter more than a price.",
    legacyIntent: "archive-story",
    coverImage: "/assets/samples/family-memory-cover.png",
    profile: {
      origin: "Grandmother Mariam's home",
      "date-period": "1968–1998",
      people: "Mariam, Yusuf, Sara, and family",
      story:
        "A family album that connects several generations through ordinary days, celebrations, and travel.",
    },
  }),
  asset({
    id: "qnb-family-reserve",
    name: "Family reserve account",
    category: "Bank",
    kind: "financial",
    locationMode: "virtual",
    locationStatus: "unknown",
    reference: "•••• 8421",
    valueAmount: 380000,
    valueLabel: "Recorded estimate",
    requiredEvidenceTypes: ["Recovery note"],
    description:
      "Heldat reference only. Credentials, PINs, and full account numbers are never stored here.",
    tags: ["bank", "reserve", "private-reference"],
    meaningFacets: ["financial-continuity"],
    visibility: "private",
    profile: {
      institution: "QNB",
      "account-reference": "8421",
      "ownership-share": "100",
      "opened-on": "2017-03-12",
    },
  }),
  asset({
    id: "qib-long-term-portfolio",
    name: "Long-term investment portfolio",
    category: "Investment",
    kind: "financial",
    locationMode: "virtual",
    locationStatus: "unknown",
    reference: "Portfolio •• 2719",
    valueAmount: 650000,
    valueLabel: "Recorded estimate",
    requiredEvidenceTypes: ["Beneficiary note"],
    description:
      "A private investment reference for continuity planning, not a trading or performance dashboard.",
    tags: ["investment", "long-term", "private-reference"],
    meaningFacets: ["investment", "financial-continuity"],
    visibility: "private",
    profile: {
      institution: "QInvest",
      "account-reference": "2719",
      "ownership-share": "100",
      "opened-on": "2022-09-05",
    },
  }),
  asset({
    id: "dubai-storage-agreement",
    name: "Storage agreement",
    category: "Document",
    kind: "document",
    placeId: "dubai-storage",
    spaceId: "storage-vault",
    locationDetail: "Digital document folder",
    reference: "DXB-STORAGE-DEMO",
    valueLabel: "Verified",
    requiredEvidenceTypes: ["Current document copy"],
    tags: ["document", "storage", "agreement"],
  }),
  asset({
    id: "leica-q3",
    name: "Leica Q3",
    category: "Camera",
    placeId: "dubai-storage",
    spaceId: "storage-vault",
    locationDetail: "Shelf A",
    reference: "LEICA-Q3-DEMO",
    valueAmount: 24000,
    valueLabel: "QAR 24,000",
    requiredEvidenceTypes: ["Purchase receipt"],
    tags: ["camera", "leica"],
  }),
  asset({
    id: "travel-jewelry-case",
    name: "Travel jewelry case",
    category: "Personal",
    placeId: "dubai-storage",
    spaceId: "storage-vault",
    locationDetail: "Shelf B",
    valueLabel: "Value not set",
    requiredEvidenceTypes: ["Current photo"],
    tags: ["jewelry", "travel"],
  }),
];

function numberedAsset(placeId, spaceIds, index, total, label) {
  const number = String(index + 1).padStart(2, "0");
  const categoryCycle = ["Personal", "Collectible", "Electronics", "Furniture"];
  const category = categoryCycle[index % categoryCycle.length];
  const hasReference = index % 3 !== 0;
  const requiresProof = index % 5 !== 0;
  const spaceId = spaceIds[index % spaceIds.length];
  return asset({
    id: `${placeId}-item-${number}`,
    name: `${label} item ${number}`,
    category,
    placeId,
    spaceId,
    locationDetail: `Captured group ${Math.floor(index / 8) + 1}`,
    reference: hasReference ? `${placeId.toUpperCase()}-${number}` : null,
    valueAmount: index % 4 === 0 ? 1500 + index * 25 : null,
    valueLabel: index % 4 === 0 ? `QAR ${1500 + index * 25}` : "Value not set",
    requiredEvidenceTypes: requiresProof ? ["Current photo"] : [],
    description: `Representative record ${index + 1} of ${total} in the sample workspace.`,
    tags: ["sample inventory", placeId, category.toLowerCase()],
  });
}

const generatedAssets = [
  numberedAsset(
    "west-bay-home",
    ["study", "wardrobe", "garage"],
    5,
    6,
    "West Bay",
  ),
  numberedAsset(
    "family-archive",
    ["archive-boxes"],
    0,
    7,
    "Archive",
  ),
  numberedAsset(
    "family-archive",
    ["archive-boxes"],
    1,
    7,
    "Archive",
  ),
  numberedAsset(
    "family-archive",
    ["archive-boxes"],
    2,
    7,
    "Archive",
  ),
  numberedAsset(
    "family-archive",
    ["archive-boxes"],
    6,
    7,
    "Archive",
  ),
];

const RETAINED_CURATED_SAMPLE_ASSET_IDS = new Set(
  generatedAssets.map((item) => item.id),
);

export function isRetiredLegacySampleAssetId(value) {
  const id = String(value || "").trim();
  if (!id || RETAINED_CURATED_SAMPLE_ASSET_IDS.has(id)) return false;
  const generatedMatch = id.match(
    /^(west-bay-home|pearl-apartment-place|family-archive)-item-(\d{2})$/,
  );
  if (generatedMatch) {
    const index = Number(generatedMatch[2]);
    const maximum =
      generatedMatch[1] === "west-bay-home"
        ? 83
        : generatedMatch[1] === "pearl-apartment-place"
          ? 40
          : 7;
    return index >= 1 && index <= maximum;
  }
  const digitalMatch = id.match(/^digital-record-(\d{2})$/);
  return Boolean(
    digitalMatch &&
      Number(digitalMatch[1]) >= 1 &&
      Number(digitalMatch[1]) <= 4,
  );
}

const assets = [...featuredAssets, ...generatedAssets];

const collections = [
  {
    id: "collection-watches",
    householdId: HOUSEHOLD_ID,
    name: "Watches I chose carefully",
    description:
      "A small private collection of watches, their proof, service history, and the moments attached to them.",
    kind: "collection",
    visibility: "private",
    coverAssetId: "gmt-master-ii",
    assetIds: ["gmt-master-ii"],
    featuredAssetIds: ["gmt-master-ii"],
    curatorNote: "Begin with the piece that made the collection feel intentional.",
    story: "Collected slowly, one meaningful reference at a time.",
    tags: ["watches", "horology", "personal"],
    status: "active",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "collection-family-stories",
    householdId: HOUSEHOLD_ID,
    name: "Objects that remember us",
    description:
      "Cameras, photographs, coins, and ordinary belongings whose stories should survive.",
    kind: "memory",
    visibility: "household",
    coverAssetId: "childhood-film-camera",
    assetIds: [
      "childhood-film-camera",
      "inherited-coin-box",
      "family-photo-album",
      "family-archive-item-01",
      "family-archive-item-02",
      "family-archive-item-03",
    ],
    featuredAssetIds: [
      "childhood-film-camera",
      "inherited-coin-box",
      "family-photo-album",
    ],
    curatorNote: "Tell the beginning before cataloguing every detail.",
    story:
      "Not everything important is expensive. These objects hold people, places, and stories.",
    tags: ["family", "memories", "heirlooms"],
    status: "active",
    createdAt: "2026-07-11T08:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "collection-art",
    householdId: HOUSEHOLD_ID,
    name: "Art that made home feel ours",
    description:
      "A private exhibition of artworks, their provenance, condition, and the memories formed around them.",
    kind: "collection",
    visibility: "private",
    coverAssetId: "desert-light-study",
    assetIds: ["desert-light-study"],
    featuredAssetIds: ["desert-light-study"],
    curatorNote:
      "Preserve why each work was chosen alongside the facts that protect it.",
    story:
      "The collection began with one work selected for feeling, not status.",
    tags: ["art", "home", "provenance", "story"],
    status: "active",
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-24T09:50:00.000Z",
  },
  {
    id: "collection-cameras",
    householdId: HOUSEHOLD_ID,
    name: "Cameras and seeing",
    description:
      "The cameras that changed how I looked at the world, from childhood film to a modern daily camera.",
    kind: "collection",
    visibility: "private",
    coverAssetId: "leica-q3",
    assetIds: ["childhood-film-camera", "leica-q3"],
    featuredAssetIds: ["childhood-film-camera", "leica-q3"],
    curatorNote: "Add one photograph made with each camera.",
    story: "A collection about seeing, not just equipment.",
    tags: ["camera", "photography", "story"],
    status: "active",
    createdAt: "2026-07-12T08:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
];

function evidence({
  id,
  assetId,
  type,
  status = "verified",
  addedAt = "2026-07-20T12:00:00.000Z",
  verifiedAt = status === "verified" ? "2026-07-20T12:05:00.000Z" : null,
  fileName = null,
  note = "",
}) {
  const fileType = fileName
    ? fileName.endsWith(".pdf")
      ? "application/pdf"
      : fileName.endsWith(".jpg")
        ? "image/jpeg"
        : "text/plain"
    : null;
  return {
    id,
    householdId: HOUSEHOLD_ID,
    assetId,
    type,
    status,
    addedAt,
    verifiedAt,
    verifiedByMemberId: status === "verified" ? OWNER_ID : null,
    fileName,
    fileType,
    fileSize: null,
    fileChecksum: null,
    fileState: fileName ? "missing_original" : null,
    storageScope: fileName ? "local-device" : null,
    note,
    source: fileName ? "sample-fixture" : "demo-metadata",
  };
}

const featuredEvidence = [
  evidence({
    id: "evidence-gmt-receipt",
    assetId: "gmt-master-ii",
    type: "Purchase receipt",
    fileName: "gmt-purchase-receipt-demo.pdf",
  }),
  evidence({
    id: "evidence-gmt-photo",
    assetId: "gmt-master-ii",
    type: "Current photo",
    fileName: "gmt-current-photo-demo.jpg",
  }),
  evidence({
    id: "evidence-desert-light-provenance",
    assetId: "desert-light-study",
    type: "Provenance record",
    fileName: "desert-light-provenance-demo.pdf",
  }),
  evidence({
    id: "evidence-desert-light-photo",
    assetId: "desert-light-study",
    type: "Current photo",
    fileName: "desert-light-current-demo.jpg",
  }),
  evidence({
    id: "evidence-desert-light-condition",
    assetId: "desert-light-study",
    type: "Condition report",
    status: "pending",
    verifiedAt: null,
    fileName: "desert-light-condition-demo.pdf",
  }),
  evidence({
    id: "evidence-pearl-title",
    assetId: "pearl-apartment",
    type: "Title deed",
    fileName: "pearl-title-demo.pdf",
  }),
  evidence({
    id: "evidence-pearl-valuation",
    assetId: "pearl-apartment",
    type: "Valuation",
    fileName: "pearl-valuation-demo.pdf",
  }),
  evidence({
    id: "evidence-pearl-photo",
    assetId: "pearl-apartment",
    type: "Current photo",
    fileName: "pearl-photo-demo.jpg",
  }),
  evidence({
    id: "evidence-west-bay-deed",
    assetId: "west-bay-title-deed",
    type: "Current document copy",
    fileName: "west-bay-title-deed-demo.pdf",
  }),
  evidence({
    id: "evidence-film-camera-story",
    assetId: "childhood-film-camera",
    type: "Family story",
    fileName: null,
    note: "Story captured from a family conversation.",
  }),
  evidence({
    id: "evidence-storage-agreement",
    assetId: "dubai-storage-agreement",
    type: "Current document copy",
    fileName: "dubai-storage-agreement-demo.pdf",
  }),
  evidence({
    id: "evidence-leica-photo",
    assetId: "leica-q3",
    type: "Current photo",
    fileName: "leica-q3-demo.jpg",
  }),
];

const generatedEvidence = [
  evidence({
    id: "evidence-family-archive-item-03",
    assetId: "family-archive-item-03",
    type: "Current photo",
    fileName: "family-archive-item-03-demo.jpg",
  }),
  evidence({
    id: "evidence-family-archive-item-07",
    assetId: "family-archive-item-07",
    type: "Current photo",
    fileName: "family-archive-item-07-demo.jpg",
  }),
];

const tasks = [
  {
    id: "task-pearl-insurance",
    householdId: HOUSEHOLD_ID,
    assetId: "pearl-apartment",
    placeId: "pearl-apartment-place",
    spaceId: null,
    type: "evidence-review",
    requiredEvidenceType: "Insurance policy",
    title: "Pearl apartment insurance",
    description: "Review the policy and add current proof of coverage.",
    ctaLabel: "Review insurance",
    status: "open",
    priority: "urgent",
    dueAt: "2026-07-31T18:00:00.000Z",
    completedAt: null,
    createdAt: "2026-07-20T09:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "task-gmt-service",
    householdId: HOUSEHOLD_ID,
    assetId: "gmt-master-ii",
    placeId: "west-bay-home",
    spaceId: "study-safe",
    type: "add-evidence",
    requiredEvidenceType: "Service record",
    title: "GMT service record",
    description: "Add proof of the last service.",
    ctaLabel: "Add service record",
    status: "open",
    priority: "normal",
    dueAt: null,
    completedAt: null,
    createdAt: "2026-07-20T09:10:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  {
    id: "task-study-proof",
    householdId: HOUSEHOLD_ID,
    assetId: null,
    placeId: "west-bay-home",
    spaceId: "study",
    type: "room-evidence",
    requiredEvidenceType: null,
    title: "Study proof",
    description: "Gather receipts and documents for the Study.",
    ctaLabel: "Capture Study",
    status: "open",
    priority: "later",
    dueAt: null,
    completedAt: null,
    createdAt: "2026-07-20T09:20:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
];

const activity = [
  {
    id: "activity-emergency-pack",
    type: "continuity-review",
    title: "Emergency pack is ready",
    detail: "Reviewed by you",
    memberId: OWNER_ID,
    entityType: "household",
    entityId: HOUSEHOLD_ID,
    occurredAt: SAMPLE_NOW,
  },
  {
    id: "activity-sara-west-bay",
    type: "access-preview",
    title: "Sara viewed West Bay Home",
    detail: "Family access preview",
    memberId: "member-sara",
    entityType: "place",
    entityId: "west-bay-home",
    occurredAt: "2026-07-21T14:10:00.000Z",
  },
  {
    id: "activity-nadia-recovery",
    type: "recovery-confirmation",
    title: "Nadia confirmed recovery access",
    detail: "Trusted contact",
    memberId: "member-nadia",
    entityType: "member",
    entityId: "member-nadia",
    occurredAt: "2026-07-18T15:00:00.000Z",
  },
];

const sampleWorkspace = {
  version: SAMPLE_SNAPSHOT_VERSION,
  mode: "sample",
  privacyNotice:
    "Demo metadata is stored locally in this browser. This prototype does not provide encryption, backup, or secure file storage.",
  meta: {
    id: "workspace-al-hamad-demo",
    revision: 0,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: SAMPLE_NOW,
    lastResetAt: SAMPLE_NOW,
  },
  household: {
    id: HOUSEHOLD_ID,
    name: "Al Hamad household",
    ownerMemberId: OWNER_ID,
    locale: "en-QA",
    currency: "QAR",
    demoOnly: true,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: SAMPLE_NOW,
  },
  regions,
  places,
  spaces,
  assets,
  collections,
  evidence: [...featuredEvidence, ...generatedEvidence],
  members,
  tasks,
  activity,
};

export function createSampleWorkspaceSeed() {
  return JSON.parse(JSON.stringify(sampleWorkspace));
}
