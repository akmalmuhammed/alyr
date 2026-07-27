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
  /** Last locally observed authoritative record version. */
  readonly version: number;
  readonly name: string;
  readonly kind: "room" | "zone" | "container";
  readonly parentRoomId: string | null;
}

/**
 * Place documents remain separate from Asset Evidence while sharing the same
 * protected BlobObject and immutable-version lifecycle.
 *
 * The optional metadata fields keep schema-v2 snapshots created before cloud
 * Place-document sync readable. Newly captured and cloud-restored records
 * always populate them.
 */
export interface NativePlaceDocument extends JsonObject {
  readonly id: string;
  /** Last locally observed authoritative Place-document metadata version. */
  readonly version?: number;
  /** Current immutable document version number, starting at zero. */
  readonly documentVersionNumber?: number;
  readonly versionId: string;
  readonly blobObjectId: string;
  readonly householdId: string;
  readonly placeId: string;
  readonly kind?: EvidenceKind;
  readonly relation?: EvidenceRelation;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly localUri: string | null;
  readonly checksumSha256: string | null;
  readonly encryptedAtRest: boolean;
  readonly storageState: "on-device" | "queued" | "synced";
  readonly capturedAt: string;
  readonly updatedAt?: string;
}

/**
 * Place classification is deliberately separate from item categories.
 *
 * `kind` says what the location is used as. `tenure` records the household's
 * relationship to a property. Both remain optional on the stored interface so
 * schema-v2 snapshots written before classification shipped still open. Those
 * records normalize to unknown and are never guessed into Portfolio.
 */
export type NativePlaceKind =
  | "home"
  | "property"
  | "storage"
  | "temporary"
  | "other"
  | "unknown";

export type NativePlaceTenure =
  | "owned"
  | "rented"
  | "managed"
  | "borrowed"
  | "unknown";

export type PlaceClassification =
  | "owned_property"
  | "rented_or_managed"
  | "storage"
  | "temporary"
  | "unknown";

export interface NativePlace extends JsonObject {
  readonly id: string;
  readonly householdId: string;
  /** Last locally observed authoritative record version. */
  readonly version: number;
  readonly name: string;
  readonly kind?: NativePlaceKind;
  readonly tenure?: NativePlaceTenure;
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
  /** Last locally observed authoritative record version. */
  readonly version: number;
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
  readonly reviewedAt: string | null;
  /**
   * An optional user-recorded document deadline. This is metadata from the
   * household, not a prediction that a policy or service remains valid.
   */
  readonly expiresAt?: string | null;
  readonly storageState: "on-device" | "queued" | "synced";
  readonly capturedAt: string;
  readonly updatedAt: string;
}

export type AssetVisualKind =
  | "watch"
  | "vehicle"
  | "property"
  | "art"
  | "camera"
  | "heirloom"
  | "childhood"
  | "digital"
  | "other";

export interface NativeAsset extends JsonObject {
  readonly id: string;
  /** Last locally observed authoritative record version. */
  readonly version: number;
  /**
   * Last accepted asset-location revision. Location commands use this
   * independent version for conflict detection while `version` tracks the
   * authoritative Asset record.
   *
   * Optional only for backward-compatible loading of schema-v2 snapshots
   * created before foreground sync was wired.
   */
  readonly locationRevisionVersion?: number;
  readonly householdId: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  /** Optional display hint for a truthful local fallback when no image loads. */
  readonly visualKind?: AssetVisualKind;
  readonly photoUri: string | null;
  readonly photoProtectedUri: string | null;
  readonly photoChecksumSha256: string | null;
  readonly photoEvidenceId: string | null;
  readonly locationStatus: LocationStatus;
  readonly placeId: string | null;
  readonly roomId: string | null;
  readonly locatorText: string | null;
  readonly evidenceIds: string[];
  readonly lifecycleStatus: "active" | "archived";
  readonly archivedAt: string | null;
  /**
   * Fields deliberately retained on this device because the reviewed server
   * command does not yet persist them. This prevents a successful name sync
   * from mislabelling an unsupported category/photo-pointer edit as synced.
   */
  readonly localOnlyFields?: (
    | "category"
    | "primary-photo"
  )[];
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
    | "asset_archived"
    | "asset_restored"
    | "evidence_added"
    | "evidence_reviewed"
    | "evidence_reopened"
    | "place_created"
    | "place_updated";
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
  /**
   * Optional for schema-v2 snapshots created before Place documents existed.
   * New workspaces always write this array.
   */
  readonly placeDocuments?: NativePlaceDocument[];
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

export interface ExistingAssetIdentityInput {
  readonly name: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
}

export interface ExistingAssetLocationInput {
  readonly locationStatus: LocationStatus;
  readonly placeId: string | null;
  readonly roomId: string | null;
  readonly locatorText: string | null;
}

/**
 * A focused patch for an existing Passport. Omitted fields are preserved.
 * Attachments are append-only records; a new primary photo supersedes the
 * pointer on the Asset while the previous EvidenceVersion remains immutable.
 */
export interface ExistingAssetUpdateInput {
  readonly assetId: string;
  readonly identity?: ExistingAssetIdentityInput;
  readonly photo?: CapturedFile;
  readonly location?: ExistingAssetLocationInput;
  readonly evidence?: CapturedFile;
}

export interface AssetLifecycleInput {
  readonly assetId: string;
  readonly lifecycleStatus: "active" | "archived";
}

export interface EvidenceReviewInput {
  readonly evidenceId: string;
  readonly reviewStatus: "pending" | "reviewed";
}

export interface PlacePinInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly source: "device_gps" | "user_pin" | "manual_coordinates";
  readonly precision: "exact" | "user_placed" | "approximate";
  readonly horizontalAccuracyMeters: number | null;
  readonly observedAt: string;
  readonly confirmedAt: string | null;
}

export interface NewPlaceInput {
  readonly name: string;
  /**
   * Optional only for backward-compatible callers. New UI always supplies an
   * explicit answer; omitted values are saved as unknown.
   */
  readonly classification?: PlaceClassification;
  readonly addressSummary: string | null;
  readonly regionLabel: string;
  readonly roomName: string | null;
  readonly pin: PlacePinInput | null;
}

export interface UpdatePlacePinInput {
  readonly placeId: string;
  readonly pin: PlacePinInput | null;
}

export interface UpdatePlaceBasicsInput {
  readonly placeId: string;
  readonly name: string;
  readonly classification?: PlaceClassification;
  readonly addressSummary: string | null;
  readonly regionLabel: string;
}

export interface NewPlaceSpaceInput {
  readonly placeId: string;
  readonly name: string;
  readonly kind: NativeRoom["kind"];
  readonly parentRoomId: string | null;
}

export interface UpdatePlaceSpaceInput extends NewPlaceSpaceInput {
  readonly roomId: string;
}

export interface NewPlaceDocumentInput {
  readonly placeId: string;
  readonly file: CapturedFile;
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

/**
 * Quick Passport creates item records. Real estate remains a Place so a home,
 * apartment, plot, or commercial property can own rooms, exact pins, and
 * property documents without also masquerading as an item.
 */
function nativeCategoryChoice(
  category: (typeof FOCUSED_V1_CATEGORIES)[number]
) {
  return {
    id: category.id,
    label:
      category.id === "home.other"
        ? "Personal item"
        : category.id === "digital.asset"
          ? "Digital reference"
          : category.id === "property.house"
            ? "Real estate"
            : category.label,
    groupId: category.groupId,
    supportsPhysicalLocation:
      category.kind === "physical" || category.kind === "real-estate"
  };
}

const ALL_CATEGORY_CHOICES = FOCUSED_V1_CATEGORIES.map(
  nativeCategoryChoice
);

export const CATEGORY_CHOICES = FOCUSED_V1_CATEGORIES.filter(
  (category) => category.kind !== "real-estate"
).map(nativeCategoryChoice);

/**
 * Reads legacy records without reintroducing property options to item
 * selectors. Existing pilot fixtures can still be opened and migrated.
 */
export function findCategoryChoice(categoryId: string) {
  return (
    ALL_CATEGORY_CHOICES.find((category) => category.id === categoryId) ??
    null
  );
}

export function assetLifecycleStatus(
  asset: NativeAsset
): NativeAsset["lifecycleStatus"] {
  return asset.lifecycleStatus === "archived" ? "archived" : "active";
}

export function isAssetActive(asset: NativeAsset): boolean {
  return assetLifecycleStatus(asset) === "active";
}

export function normalizedPlaceKind(
  place: Pick<NativePlace, "kind">
): NativePlaceKind {
  switch (place.kind) {
    case "home":
    case "property":
    case "storage":
    case "temporary":
    case "other":
      return place.kind;
    default:
      return "unknown";
  }
}

export function normalizedPlaceTenure(
  place: Pick<NativePlace, "tenure">
): NativePlaceTenure {
  switch (place.tenure) {
    case "owned":
    case "rented":
    case "managed":
    case "borrowed":
      return place.tenure;
    default:
      return "unknown";
  }
}

export function placeClassification(
  place: Pick<NativePlace, "kind" | "tenure">
): PlaceClassification {
  const kind = normalizedPlaceKind(place);
  const tenure = normalizedPlaceTenure(place);
  if (kind === "storage") return "storage";
  if (kind === "temporary") return "temporary";
  if (kind === "home" || kind === "property") {
    if (tenure === "owned") return "owned_property";
    if (["rented", "managed", "borrowed"].includes(tenure)) {
      return "rented_or_managed";
    }
  }
  return "unknown";
}

export function placeClassificationFields(
  classification: PlaceClassification | undefined
): Readonly<{
  kind: NativePlaceKind;
  tenure: NativePlaceTenure;
}> {
  switch (classification) {
    case "owned_property":
      return { kind: "property", tenure: "owned" };
    case "rented_or_managed":
      return { kind: "property", tenure: "rented" };
    case "storage":
      return { kind: "storage", tenure: "unknown" };
    case "temporary":
      return { kind: "temporary", tenure: "unknown" };
    default:
      return { kind: "unknown", tenure: "unknown" };
  }
}

/**
 * The only Place eligible for property counts and value subjects is one the
 * household explicitly marked as owned property. Missing/legacy fields,
 * rented homes, storage locations and temporary Places all remain excluded.
 */
export function isOwnedPropertyPlace(
  place: Pick<NativePlace, "kind" | "tenure">
): boolean {
  return placeClassification(place) === "owned_property";
}

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
    (record.placeDocuments === undefined ||
      Array.isArray(record.placeDocuments)) &&
    Array.isArray(record.assets) &&
    Array.isArray(record.evidence) &&
    Array.isArray(record.members)
  );
}
