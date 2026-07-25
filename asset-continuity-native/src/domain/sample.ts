import type {
  NativeAsset,
  NativeEvidence,
  NativeMember,
  NativePlace,
  NativeWorkspace,
  WorkspaceMode
} from "./model";
import { WORKSPACE_SCHEMA_VERSION } from "./model";

const FIXTURE_TIME = "2026-07-25T09:30:00.000Z";
const SAMPLE_DEVICE_ID = "00000000-0000-4000-8000-000000000001";

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
    householdId: "household-sample",
    name: "West Bay Home",
    addressSummary: "West Bay Lagoon, Doha",
    regionLabel: "Doha",
    latitude: 25.359,
    longitude: 51.531,
    locationSource: "user_pin",
    precision: "user_placed",
    horizontalAccuracyMeters: null,
    observedAt: FIXTURE_TIME,
    confirmedAt: FIXTURE_TIME,
    rooms: [
      {
        id: "room-study",
        name: "Study",
        kind: "room",
        parentRoomId: null
      },
      {
        id: "room-wardrobe",
        name: "Wardrobe",
        kind: "room",
        parentRoomId: null
      },
      {
        id: "room-garage",
        name: "Garage",
        kind: "room",
        parentRoomId: null
      }
    ],
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME
  },
  {
    id: "place-pearl",
    householdId: "household-sample",
    name: "Pearl Apartment",
    addressSummary: "The Pearl, Doha",
    regionLabel: "Doha",
    latitude: 25.37,
    longitude: 51.55,
    locationSource: "user_pin",
    precision: "user_placed",
    horizontalAccuracyMeters: null,
    observedAt: FIXTURE_TIME,
    confirmedAt: FIXTURE_TIME,
    rooms: [
      {
        id: "room-pearl-vault",
        name: "Secure cabinet",
        kind: "container",
        parentRoomId: null
      }
    ],
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME
  }
];

const assetSeed = [
  [
    "asset-gmt",
    "GMT-Master II",
    "lifestyle.watch",
    "Watch",
    "place-west-bay",
    "room-wardrobe",
    "Upper watch drawer",
    true
  ],
  [
    "asset-title",
    "West Bay title record",
    "property.house",
    "Real estate",
    "place-west-bay",
    "room-study",
    "Fire safe · folder A",
    true
  ],
  [
    "asset-heritage",
    "Family pearl necklace",
    "home.other",
    "Personal item",
    "place-pearl",
    "room-pearl-vault",
    "Blue case",
    false
  ],
  [
    "asset-roadster",
    "Roadster",
    "vehicle.car",
    "Car",
    "place-west-bay",
    "room-garage",
    "Bay 2",
    true
  ],
  [
    "asset-study-art",
    "Blue horizon study",
    "art.painting",
    "Art",
    "place-west-bay",
    "room-study",
    "North wall",
    false
  ],
  [
    "asset-camera",
    "Leica camera",
    "home.other",
    "Personal item",
    "place-west-bay",
    "room-study",
    "Lower equipment cabinet",
    false
  ],
  [
    "asset-domain",
    "Family domain reference",
    "digital.asset",
    "Digital reference",
    null,
    null,
    null,
    true
  ]
] as const;

const sampleEvidence: NativeEvidence[] = assetSeed
  .filter((item) => item[7])
  .map((item, index) => ({
    id: `evidence-${index + 1}`,
    versionId: `evidence-version-${index + 1}`,
    blobObjectId: `blob-${index + 1}`,
    householdId: "household-sample",
    assetId: item[0],
    kind: "paper" as const,
    relation: "identity" as const,
    fileName: `${item[1].toLowerCase().replaceAll(" ", "-")}.pdf`,
    mimeType: "application/pdf",
    byteSize: 420_000 + index * 31_000,
    localUri: null,
    checksumSha256: `sample-${item[0]}`,
    reviewStatus: index < 2 ? ("reviewed" as const) : ("pending" as const),
    storageState: "on-device" as const,
    capturedAt: FIXTURE_TIME
  }));

const sampleAssets: NativeAsset[] = assetSeed.map((item, index) => {
  const evidence = sampleEvidence.find((proof) => proof.assetId === item[0]);
  return {
    id: item[0],
    householdId: "household-sample",
    name: item[1],
    categoryId: item[2],
    categoryLabel: item[3],
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: null,
    photoEvidenceId: null,
    locationStatus: item[2].startsWith("digital") ? "known" : "known",
    placeId: item[4],
    roomId: item[5],
    locatorText: item[6],
    evidenceIds: evidence ? [evidence.id] : [],
    syncStatus: "on-device",
    createdAt: new Date(Date.parse(FIXTURE_TIME) - index * 86_400_000).toISOString(),
    updatedAt: FIXTURE_TIME
  };
});

const sampleMembers: NativeMember[] = [
  {
    id: "member-owner",
    householdId: "household-sample",
    name: "Amina Hassan",
    initials: "AH",
    role: "owner",
    status: "active",
    lastActiveAt: FIXTURE_TIME
  },
  {
    id: "member-editor",
    householdId: "household-sample",
    name: "Omar Hassan",
    initials: "OH",
    role: "editor",
    status: "active",
    lastActiveAt: "2026-07-24T16:20:00.000Z"
  },
  {
    id: "member-viewer",
    householdId: "household-sample",
    name: "Layla Hassan",
    initials: "LH",
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
        id: "household-sample",
        name: "Hassan household · sample"
      },
      places: samplePlaces,
      assets: sampleAssets,
      evidence: sampleEvidence,
      members: sampleMembers,
      activity: [],
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
