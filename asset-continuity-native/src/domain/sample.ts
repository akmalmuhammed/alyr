import type {
  NativeAsset,
  NativeEvidence,
  NativeMember,
  NativePlace,
  NativePlaceDocument,
  NativeWorkspace,
  WorkspaceMode
} from "./model";
import { WORKSPACE_SCHEMA_VERSION } from "./model";
import type { PortfolioValueRecord } from "./portfolio";

const FIXTURE_TIME = "2026-07-25T09:30:00.000Z";
const SAMPLE_DEVICE_ID = "00000000-0000-4000-8000-000000000001";
const SAMPLE_HOUSEHOLD_ID = "household-sample";

export interface WorkspaceIdentity {
  readonly householdId: string;
  readonly ownerMemberId: string;
  readonly deviceId: string;
}

const DEFAULT_PERSONAL_IDENTITY: WorkspaceIdentity = {
  householdId: "00000000-0000-4000-8000-000000000010",
  ownerMemberId: "00000000-0000-4000-8000-000000000011",
  deviceId: "00000000-0000-4000-8000-000000000012"
};

const samplePlaces: NativePlace[] = [
  {
    id: "place-west-bay",
    householdId: SAMPLE_HOUSEHOLD_ID,
    version: 1,
    name: "West Bay Home",
    kind: "property",
    tenure: "owned",
    addressSummary: "West Bay Lagoon, Doha",
    regionLabel: "Doha",
    latitude: 25.35918,
    longitude: 51.53142,
    locationSource: "device_gps",
    precision: "exact",
    horizontalAccuracyMeters: 6.8,
    observedAt: "2026-07-24T16:08:00.000Z",
    confirmedAt: "2026-07-24T16:09:00.000Z",
    rooms: [
      {
        id: "room-study",
        version: 1,
        name: "Study",
        kind: "room",
        parentRoomId: null
      },
      {
        id: "room-wardrobe",
        version: 1,
        name: "Wardrobe",
        kind: "room",
        parentRoomId: null
      },
      {
        id: "room-garage",
        version: 1,
        name: "Garage",
        kind: "room",
        parentRoomId: null
      },
      {
        id: "room-memory-box",
        version: 1,
        name: "Memory box",
        kind: "container",
        parentRoomId: "room-study"
      }
    ],
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME
  },
  {
    id: "place-pearl",
    householdId: SAMPLE_HOUSEHOLD_ID,
    version: 1,
    name: "Pearl Apartment",
    kind: "property",
    tenure: "owned",
    addressSummary: "The Pearl, Doha",
    regionLabel: "Doha",
    latitude: 25.37064,
    longitude: 51.55018,
    locationSource: "user_pin",
    precision: "user_placed",
    horizontalAccuracyMeters: null,
    observedAt: "2026-07-23T11:45:00.000Z",
    confirmedAt: "2026-07-23T11:48:00.000Z",
    rooms: [
      {
        id: "room-pearl-vault",
        version: 1,
        name: "Secure cabinet",
        kind: "container",
        parentRoomId: null
      }
    ],
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME
  }
];

interface SampleEvidenceInput {
  readonly id: string;
  readonly assetId: string;
  readonly fileName: string;
  readonly kind: NativeEvidence["kind"];
  readonly relation: NativeEvidence["relation"];
  readonly mimeType: string;
  readonly byteSize: number;
  readonly reviewStatus?: NativeEvidence["reviewStatus"];
  readonly expiresAt?: string | null;
  readonly capturedAt?: string;
}

function fixtureChecksum(seed: string): string {
  return Array.from({ length: 64 }, (_, index) => {
    const character = seed.charCodeAt(index % seed.length);
    return ((character + index) % 16).toString(16);
  }).join("");
}

function sampleEvidenceRecord(
  input: SampleEvidenceInput
): NativeEvidence {
  const reviewStatus = input.reviewStatus ?? "reviewed";
  const capturedAt = input.capturedAt ?? FIXTURE_TIME;
  return {
    id: input.id,
    version: 1,
    versionId: `${input.id}-version-1`,
    blobObjectId: `${input.id}-blob-1`,
    householdId: SAMPLE_HOUSEHOLD_ID,
    assetId: input.assetId,
    kind: input.kind,
    relation: input.relation,
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    localUri: null,
    checksumSha256: fixtureChecksum(input.id),
    reviewStatus,
    reviewedAt: reviewStatus === "reviewed" ? FIXTURE_TIME : null,
    expiresAt: input.expiresAt ?? null,
    storageState: "on-device",
    capturedAt,
    updatedAt: FIXTURE_TIME
  };
}

function samplePhoto(
  id: string,
  assetId: string,
  fileName: string
): NativeEvidence {
  return sampleEvidenceRecord({
    id,
    assetId,
    fileName,
    kind: "media",
    relation: "condition",
    mimeType: "image/jpeg",
    byteSize: 680_000
  });
}

function samplePlaceDocument(
  id: string,
  placeId: string,
  fileName: string,
  mimeType: string,
  byteSize: number,
  capturedAt = FIXTURE_TIME
): NativePlaceDocument {
  return {
    id,
    versionId: `${id}-version-1`,
    blobObjectId: `${id}-blob-1`,
    householdId: SAMPLE_HOUSEHOLD_ID,
    placeId,
    fileName,
    mimeType,
    byteSize,
    // Sample workspaces are session-only previews. Personal documents are
    // copied into ALYR's encrypted attachment store before this model is saved.
    localUri: `sample://${id}/${encodeURIComponent(fileName)}`,
    checksumSha256: null,
    encryptedAtRest: false,
    storageState: "on-device",
    capturedAt
  };
}

const samplePlaceDocuments: NativePlaceDocument[] = [
  samplePlaceDocument(
    "place-doc-pearl-title",
    "place-pearl",
    "pearl-title-record.pdf",
    "application/pdf",
    772_000,
    "2026-07-23T09:30:00.000Z"
  ),
  samplePlaceDocument(
    "place-doc-pearl-insurance",
    "place-pearl",
    "pearl-home-insurance.pdf",
    "application/pdf",
    438_000,
    "2026-07-24T09:30:00.000Z"
  )
];

const sampleEvidence: NativeEvidence[] = [
  samplePhoto("photo-gmt", "asset-gmt", "gmt-master-overview.jpg"),
  sampleEvidenceRecord({
    id: "evidence-1",
    assetId: "asset-gmt",
    fileName: "gmt-purchase-receipt.pdf",
    kind: "paper",
    relation: "ownership",
    mimeType: "application/pdf",
    byteSize: 284_000
  }),
  sampleEvidenceRecord({
    id: "evidence-gmt-service",
    assetId: "asset-gmt",
    fileName: "gmt-service-record.pdf",
    kind: "record",
    relation: "service",
    mimeType: "application/pdf",
    byteSize: 196_000
  }),
  samplePhoto(
    "photo-heritage",
    "asset-heritage",
    "family-pearl-necklace.jpg"
  ),
  sampleEvidenceRecord({
    id: "evidence-heritage",
    assetId: "asset-heritage",
    fileName: "pearl-necklace-provenance-note.pdf",
    kind: "note",
    relation: "provenance",
    mimeType: "application/pdf",
    byteSize: 91_000
  }),
  samplePhoto(
    "photo-roadster",
    "asset-roadster",
    "roadster-front-three-quarter.jpg"
  ),
  sampleEvidenceRecord({
    id: "evidence-roadster",
    assetId: "asset-roadster",
    fileName: "roadster-registration.pdf",
    kind: "record",
    relation: "identity",
    mimeType: "application/pdf",
    byteSize: 348_000,
    reviewStatus: "pending",
    expiresAt: "2026-08-15T21:00:00.000Z"
  }),
  sampleEvidenceRecord({
    id: "evidence-roadster-service",
    assetId: "asset-roadster",
    fileName: "roadster-service-history.pdf",
    kind: "record",
    relation: "service",
    mimeType: "application/pdf",
    byteSize: 528_000
  }),
  samplePhoto(
    "photo-study-art",
    "asset-study-art",
    "blue-horizon-study.jpg"
  ),
  sampleEvidenceRecord({
    id: "evidence-study-art",
    assetId: "asset-study-art",
    fileName: "blue-horizon-certificate.pdf",
    kind: "artifact",
    relation: "provenance",
    mimeType: "application/pdf",
    byteSize: 242_000
  }),
  samplePhoto(
    "photo-domain",
    "asset-domain",
    "domain-reference-card.jpg"
  ),
  sampleEvidenceRecord({
    id: "evidence-domain",
    assetId: "asset-domain",
    fileName: "domain-ownership-record.pdf",
    kind: "record",
    relation: "ownership",
    mimeType: "application/pdf",
    byteSize: 132_000
  }),
  sampleEvidenceRecord({
    id: "evidence-childhood",
    assetId: "asset-childhood",
    fileName: "childhood-train-story.txt",
    kind: "note",
    relation: "context",
    mimeType: "text/plain",
    byteSize: 4_200
  }),
  samplePhoto(
    "photo-camera",
    "asset-camera",
    "film-camera-condition.jpg"
  ),
  sampleEvidenceRecord({
    id: "evidence-camera",
    assetId: "asset-camera",
    fileName: "film-camera-purchase-receipt.pdf",
    kind: "paper",
    relation: "ownership",
    mimeType: "application/pdf",
    byteSize: 188_000
  })
];

const sampleAssets: NativeAsset[] = [
  {
    id: "asset-gmt",
    version: 1,
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "GMT-Master II",
    categoryId: "lifestyle.watch",
    categoryLabel: "Watch",
    visualKind: "watch",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: fixtureChecksum("photo-gmt"),
    photoEvidenceId: "photo-gmt",
    locationStatus: "known",
    placeId: "place-west-bay",
    roomId: "room-wardrobe",
    locatorText: "Upper watch drawer",
    evidenceIds: ["evidence-1", "evidence-gmt-service"],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "on-device",
    createdAt: "2026-07-24T09:30:00.000Z",
    updatedAt: FIXTURE_TIME
  },
  {
    id: "asset-heritage",
    version: 1,
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "Family pearl necklace",
    categoryId: "home.other",
    categoryLabel: "Personal item",
    visualKind: "heirloom",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: fixtureChecksum("photo-heritage"),
    photoEvidenceId: "photo-heritage",
    locationStatus: "known",
    placeId: "place-pearl",
    roomId: "room-pearl-vault",
    locatorText: "Blue case",
    evidenceIds: ["evidence-heritage"],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "on-device",
    createdAt: "2026-07-22T09:30:00.000Z",
    updatedAt: FIXTURE_TIME
  },
  {
    id: "asset-roadster",
    version: 1,
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "Roadster",
    categoryId: "vehicle.car",
    categoryLabel: "Car",
    visualKind: "vehicle",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: fixtureChecksum("photo-roadster"),
    photoEvidenceId: "photo-roadster",
    locationStatus: "known",
    placeId: "place-west-bay",
    roomId: "room-garage",
    locatorText: "Bay 2",
    evidenceIds: [
      "evidence-roadster",
      "evidence-roadster-service"
    ],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "on-device",
    createdAt: "2026-07-21T09:30:00.000Z",
    updatedAt: FIXTURE_TIME
  },
  {
    id: "asset-study-art",
    version: 1,
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "Blue horizon study",
    categoryId: "art.painting",
    categoryLabel: "Art",
    visualKind: "art",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: fixtureChecksum("photo-study-art"),
    photoEvidenceId: "photo-study-art",
    locationStatus: "known",
    placeId: "place-west-bay",
    roomId: "room-study",
    locatorText: "North wall",
    evidenceIds: ["evidence-study-art"],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "on-device",
    createdAt: "2026-07-20T09:30:00.000Z",
    updatedAt: FIXTURE_TIME
  },
  {
    id: "asset-domain",
    version: 1,
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "Family domain reference",
    categoryId: "digital.asset",
    categoryLabel: "Digital reference",
    visualKind: "digital",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: fixtureChecksum("photo-domain"),
    photoEvidenceId: "photo-domain",
    locationStatus: "known",
    placeId: null,
    roomId: null,
    locatorText: null,
    evidenceIds: ["evidence-domain"],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "on-device",
    createdAt: "2026-07-19T09:30:00.000Z",
    updatedAt: FIXTURE_TIME
  },
  {
    id: "asset-childhood",
    version: 1,
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "Childhood train set",
    categoryId: "home.other",
    categoryLabel: "Personal item",
    visualKind: "childhood",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: null,
    photoEvidenceId: null,
    locationStatus: "known",
    placeId: "place-west-bay",
    roomId: "room-memory-box",
    locatorText: "Red archive box",
    evidenceIds: ["evidence-childhood"],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "on-device",
    createdAt: "2026-07-18T09:30:00.000Z",
    updatedAt: FIXTURE_TIME
  },
  {
    id: "asset-camera",
    version: 2,
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "Film camera",
    categoryId: "home.other",
    categoryLabel: "Personal item",
    visualKind: "camera",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: fixtureChecksum("photo-camera"),
    photoEvidenceId: "photo-camera",
    locationStatus: "known",
    placeId: "place-west-bay",
    roomId: "room-study",
    locatorText: "Lower equipment cabinet",
    evidenceIds: ["evidence-camera"],
    lifecycleStatus: "archived",
    archivedAt: "2026-07-24T14:00:00.000Z",
    syncStatus: "on-device",
    createdAt: "2026-07-17T09:30:00.000Z",
    updatedAt: "2026-07-24T14:00:00.000Z"
  }
];

/**
 * Explicit, dated sample assertions. They are never presented as market
 * prices, and currencies remain separate rather than implying conversion.
 */
export const SAMPLE_PORTFOLIO_VALUES: PortfolioValueRecord[] = [
  {
    id: "sample-value-gmt",
    assetId: "asset-gmt",
    amountMinor: 5_250_000,
    currency: "QAR",
    asOf: "2026-07-20T00:00:00.000Z",
    updatedAt: FIXTURE_TIME,
    source: "user-entered"
  },
  {
    id: "sample-value-west-bay",
    subject: {
      kind: "place",
      placeId: "place-west-bay"
    },
    placeId: "place-west-bay",
    amountMinor: 675_000_000,
    currency: "QAR",
    asOf: "2026-07-18T00:00:00.000Z",
    updatedAt: FIXTURE_TIME,
    source: "user-entered",
    syncStatus: "on-device"
  },
  {
    id: "sample-value-heritage",
    assetId: "asset-heritage",
    amountMinor: 8_000_000,
    currency: "QAR",
    asOf: "2026-07-19T00:00:00.000Z",
    updatedAt: FIXTURE_TIME,
    source: "user-entered"
  },
  {
    id: "sample-value-roadster",
    assetId: "asset-roadster",
    amountMinor: 31_500_000,
    currency: "QAR",
    asOf: "2026-07-21T00:00:00.000Z",
    updatedAt: FIXTURE_TIME,
    source: "user-entered"
  },
  {
    id: "sample-value-study-art",
    assetId: "asset-study-art",
    amountMinor: 1_250_000,
    currency: "USD",
    asOf: "2026-07-16T00:00:00.000Z",
    updatedAt: FIXTURE_TIME,
    source: "user-entered"
  },
  {
    id: "sample-value-domain",
    assetId: "asset-domain",
    amountMinor: 120_000,
    currency: "USD",
    asOf: "2026-07-22T00:00:00.000Z",
    updatedAt: FIXTURE_TIME,
    source: "user-entered"
  }
];

const sampleMembers: NativeMember[] = [
  {
    id: "member-owner",
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "Maya Rahman",
    initials: "MR",
    role: "owner",
    status: "active",
    lastActiveAt: FIXTURE_TIME
  },
  {
    id: "member-editor",
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "Omar Rahman",
    initials: "OR",
    role: "editor",
    status: "active",
    lastActiveAt: "2026-07-24T16:20:00.000Z"
  },
  {
    id: "member-viewer",
    householdId: SAMPLE_HOUSEHOLD_ID,
    name: "Leena Rahman",
    initials: "LR",
    role: "viewer",
    status: "invited",
    lastActiveAt: null
  }
];

export function createWorkspace(
  mode: WorkspaceMode,
  now = new Date().toISOString(),
  identity: WorkspaceIdentity = DEFAULT_PERSONAL_IDENTITY
): NativeWorkspace {
  if (mode === "sample") {
    return {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      deviceId: SAMPLE_DEVICE_ID,
      mode,
      language: "en",
      household: {
        id: SAMPLE_HOUSEHOLD_ID,
        name: "Rahman household · sample"
      },
      places: samplePlaces,
      placeDocuments: samplePlaceDocuments,
      assets: sampleAssets,
      evidence: sampleEvidence,
      members: sampleMembers,
      activity: [],
      portfolioValueRecords: SAMPLE_PORTFOLIO_VALUES,
      syncStatus: "local-only",
      lastSyncedAt: null,
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME
    };
  }

  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    deviceId: identity.deviceId,
    mode,
    language: "en",
    household: {
      id: identity.householdId,
      name: "My household"
    },
    places: [],
    placeDocuments: [],
    assets: [],
    evidence: [],
    members: [
      {
        id: identity.ownerMemberId,
        householdId: identity.householdId,
        name: "You",
        initials: "YO",
        role: "owner",
        status: "active",
        lastActiveAt: now
      }
    ],
    activity: [],
    syncStatus: "local-only",
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now
  };
}
