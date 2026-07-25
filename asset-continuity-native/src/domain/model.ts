import type {
  EvidenceKind,
  EvidenceRelation,
  HouseholdRole,
  JsonObject,
  LocationStatus,
  SyncStatus
} from "@alyr/contracts";
import { FOCUSED_V1_CATEGORIES } from "@alyr/domain";

export const WORKSPACE_SCHEMA_VERSION = 2 as const;

export type WorkspaceMode = "sample" | "personal";
export type LanguageCode = "en" | "ar";

export interface NativeHousehold extends JsonObject {
  readonly id: string;
  readonly name: string;
}

export interface NativeRoom extends JsonObject {
  readonly id: string;
  readonly name: string;
  readonly kind: "room" | "zone" | "container";
  readonly parentRoomId: string | null;
}

export interface NativePlace extends JsonObject {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  readonly addressSummary: string | null;
  readonly regionLabel: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly locationSource:
    | "device_gps"
    | "user_pin"
    | "manual_coordinates"
    | "not_set";
  readonly precision: "exact" | "user_placed" | "approximate" | "locality_only";
  readonly horizontalAccuracyMeters: number | null;
  readonly observedAt: string | null;
  readonly confirmedAt: string | null;
  readonly rooms: NativeRoom[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NativeEvidence extends JsonObject {
  readonly id: string;
  readonly versionId: string;
  readonly blobObjectId: string;
  readonly householdId: string;
  readonly assetId: string;
  readonly kind: EvidenceKind;
  readonly relation: EvidenceRelation;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly localUri: string | null;
  readonly checksumSha256: string | null;
  readonly reviewStatus: "pending" | "reviewed";
  readonly storageState: "on-device" | "queued" | "synced";
  readonly capturedAt: string;
}

export interface NativeAsset extends JsonObject {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly photoUri: string | null;
  readonly photoProtectedUri: string | null;
  readonly photoChecksumSha256: string | null;
  readonly photoEvidenceId: string | null;
  readonly locationStatus: LocationStatus;
  readonly placeId: string | null;
  readonly roomId: string | null;
  readonly locatorText: string | null;
  readonly evidenceIds: string[];
  readonly syncStatus: SyncStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NativeMember extends JsonObject {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  readonly initials: string;
  readonly role: HouseholdRole;
  readonly status: "active" | "invited";
  readonly lastActiveAt: string | null;
}

export interface WorkspaceActivity extends JsonObject {
  readonly id: string;
  readonly type:
    | "asset_created"
    | "asset_retrieved"
    | "evidence_added"
    | "place_created";
  readonly assetId: string | null;
  readonly placeId: string | null;
  readonly occurredAt: string;
}

export interface NativeWorkspace extends JsonObject {
  readonly schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  readonly deviceId: string;
  readonly mode: WorkspaceMode;
  readonly language: LanguageCode;
  readonly household: NativeHousehold;
  readonly places: NativePlace[];
  readonly assets: NativeAsset[];
  readonly evidence: NativeEvidence[];
  readonly members: NativeMember[];
  readonly activity: WorkspaceActivity[];
  readonly syncStatus: "local-only" | "ready" | "syncing" | "needs-attention";
  readonly lastSyncedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CapturedFile {
  readonly localUri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly protectedUri?: string | null;
  readonly checksumSha256?: string | null;
  readonly encryptedAtRest?: boolean;
}

export interface NewAssetInput {
  readonly name: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly photo: CapturedFile | null;
  readonly locationStatus: LocationStatus;
  readonly placeId: string | null;
  readonly roomId: string | null;
  readonly locatorText: string | null;
  readonly evidence: CapturedFile | null;
}

export interface NewPlaceInput {
  readonly name: string;
  readonly addressSummary: string | null;
  readonly regionLabel: string;
  readonly roomName: string | null;
  readonly pin: {
    readonly latitude: number;
    readonly longitude: number;
    readonly source: "device_gps" | "user_pin" | "manual_coordinates";
    readonly precision: "exact" | "user_placed" | "approximate";
    readonly horizontalAccuracyMeters: number | null;
    readonly observedAt: string;
    readonly confirmedAt: string | null;
  } | null;
}

export interface AssetReadinessItem {
  readonly id: "identity" | "photo" | "location" | "evidence";
  readonly label: string;
  readonly weight: number;
  readonly complete: boolean;
}

export interface AssetReadiness {
  readonly percent: number;
  readonly items: readonly AssetReadinessItem[];
  readonly nextItem: AssetReadinessItem | null;
}

const QUICK_CATEGORY_IDS = [
  "lifestyle.watch",
  "vehicle.car",
  "property.house",
  "art.painting",
  "home.other",
  "digital.asset"
] as const;

export const CATEGORY_CHOICES = QUICK_CATEGORY_IDS.map((categoryId) => {
  const category = FOCUSED_V1_CATEGORIES.find(
    (item) => item.id === categoryId
  );
  if (!category) {
    throw new Error(`Shared category contract is missing ${categoryId}.`);
  }
  return {
    id: category.id,
    label:
      category.id === "property.house"
        ? "Real estate"
        : category.id === "home.other"
          ? "Personal item"
          : category.id === "digital.asset"
            ? "Digital reference"
            : category.label,
    supportsPhysicalLocation:
      category.kind === "physical" || category.kind === "real-estate"
  };
});

export function isNativeWorkspace(value: unknown): value is NativeWorkspace {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<NativeWorkspace>;
  return (
    record.schemaVersion === WORKSPACE_SCHEMA_VERSION &&
    typeof record.deviceId === "string" &&
    (record.mode === "sample" || record.mode === "personal") &&
    Array.isArray(record.places) &&
    Array.isArray(record.assets) &&
    Array.isArray(record.evidence) &&
    Array.isArray(record.members)
  );
}
