import {
  API_ERROR_VERSION,
  type ContractError,
  type LocationStatus,
} from "@alyr/contracts";

import { getFocusedCategory } from "./categories.js";
import { DomainInvariantError } from "./errors.js";

export const MAX_ASSET_CAPTURE_FILE_BYTES = 10 * 1024 * 1024;

export type AssetMutationFileRole = "photo" | "evidence";

export type AssetMutationErrorCode =
  | "ASSET_NAME_REQUIRED"
  | "ASSET_CATEGORY_UNSUPPORTED"
  | "ASSET_LOCATION_STATE_INVALID"
  | "ASSET_PLACE_INVALID"
  | "ASSET_SPACE_INVALID"
  | "ASSET_EXACT_LOCATION_REQUIRED"
  | "ASSET_FILE_METADATA_INVALID"
  | "ASSET_FILE_SIZE_INVALID";

export type AssetMutationField =
  | "name"
  | "category"
  | "location"
  | "place"
  | "space"
  | AssetMutationFileRole;

export interface AssetMutationIssue {
  readonly code: AssetMutationErrorCode;
  readonly field: AssetMutationField;
  readonly fileRole?: AssetMutationFileRole;
}

const ASSET_MUTATION_MESSAGES: Readonly<
  Record<AssetMutationErrorCode, string>
> = {
  ASSET_NAME_REQUIRED: "An item needs a clear name.",
  ASSET_CATEGORY_UNSUPPORTED:
    "Choose a supported item category.",
  ASSET_LOCATION_STATE_INVALID:
    "The item location choice conflicts with its saved details.",
  ASSET_PLACE_INVALID:
    "Choose a Place from the active household.",
  ASSET_SPACE_INVALID:
    "Choose a room, zone, or container inside the selected Place.",
  ASSET_EXACT_LOCATION_REQUIRED:
    "An exact item location needs a Place and an indoor locator.",
  ASSET_FILE_METADATA_INVALID:
    "The attached file metadata is incomplete or invalid.",
  ASSET_FILE_SIZE_INVALID:
    "The attached file must be between 1 byte and 10 MB.",
};

/**
 * One typed validation failure crosses the domain/command/provider boundary.
 * The stable `issue` drives localized recovery copy; provider text is never
 * treated as localization input. The attached ContractError is suitable for a
 * future Result-returning command port without changing the invariant model.
 */
export class AssetMutationValidationError extends DomainInvariantError {
  readonly issue: AssetMutationIssue;
  readonly recoverable = true as const;
  readonly retryable = false as const;
  readonly contract: ContractError;

  constructor(issue: AssetMutationIssue) {
    const message = ASSET_MUTATION_MESSAGES[issue.code];
    super(issue.code, message);
    this.name = "AssetMutationValidationError";
    this.issue = issue;
    this.contract = {
      errorVersion: API_ERROR_VERSION,
      code: "VALIDATION_FAILED",
      message,
      retryable: false,
      details: {
        reason: issue.code,
        field: issue.field,
        recoverable: true,
        ...(issue.fileRole ? { fileRole: issue.fileRole } : {}),
      },
    };
  }
}

export function isAssetMutationValidationError(
  value: unknown,
): value is AssetMutationValidationError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AssetMutationValidationError>;
  const issue = candidate.issue as Partial<AssetMutationIssue> | undefined;
  return (
    candidate.name === "AssetMutationValidationError" &&
    candidate.recoverable === true &&
    candidate.retryable === false &&
    Boolean(
      issue &&
        typeof issue.code === "string" &&
        Object.prototype.hasOwnProperty.call(
          ASSET_MUTATION_MESSAGES,
          issue.code,
        ) &&
        typeof issue.field === "string",
    )
  );
}

export interface AssetMutationFileCandidate {
  readonly localUri?: unknown;
  readonly fileName?: unknown;
  readonly mimeType?: unknown;
  readonly byteSize?: unknown;
  readonly protectedUri?: unknown;
  readonly checksumSha256?: unknown;
  readonly encryptedAtRest?: unknown;
}

export interface FinalAssetMutationCandidate {
  readonly name: unknown;
  readonly categoryId: unknown;
  readonly locationStatus: unknown;
  readonly placeId: unknown;
  readonly spaceId: unknown;
  readonly locationDetail: unknown;
  readonly photo?: unknown;
  readonly evidence?: unknown;
}

export interface AssetMutationPlaceReference {
  readonly id: string;
  readonly householdId: string;
  readonly spaceIds: readonly string[];
}

export interface FinalAssetMutationContext {
  readonly householdId: string;
  readonly supportedCategoryIds: readonly string[];
  readonly places: readonly AssetMutationPlaceReference[];
}

function fail(
  code: AssetMutationErrorCode,
  field: AssetMutationField,
  fileRole?: AssetMutationFileRole,
): never {
  throw new AssetMutationValidationError({
    code,
    field,
    ...(fileRole ? { fileRole } : {}),
  });
}

export function normalizeAssetMutationName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200b-\u200d\u2060\ufeff]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeAssetMutationReference(
  value: unknown,
): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function validMimeType(value: string): boolean {
  return (
    value.length <= 160 &&
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(
      value,
    )
  );
}

function isSupportedMimeType(
  mimeType: string,
  role: AssetMutationFileRole,
): boolean {
  const normalized = mimeType.toLowerCase();
  return role === "photo"
    ? normalized.startsWith("image/")
    : normalized === "application/pdf" ||
        normalized.startsWith("image/");
}

function protectedMetadataIsConsistent(
  file: AssetMutationFileCandidate,
): boolean {
  const protectedUri = normalizeAssetMutationReference(file.protectedUri);
  const checksum =
    typeof file.checksumSha256 === "string"
      ? file.checksumSha256.trim()
      : null;
  const claimsProtection =
    file.encryptedAtRest === true ||
    protectedUri !== null ||
    checksum !== null;

  if (!claimsProtection) {
    return (
      (file.encryptedAtRest === undefined ||
        file.encryptedAtRest === false) &&
      (file.protectedUri === undefined ||
        file.protectedUri === null) &&
      (file.checksumSha256 === undefined ||
        file.checksumSha256 === null)
    );
  }

  return Boolean(
    file.encryptedAtRest === true &&
      protectedUri &&
      protectedUri.length <= 4_096 &&
      checksum &&
      /^[a-f0-9]{64}$/iu.test(checksum),
  );
}

export function assetMutationFileIssue(
  value: unknown,
  role: AssetMutationFileRole,
): AssetMutationIssue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      code: "ASSET_FILE_METADATA_INVALID",
      field: role,
      fileRole: role,
    };
  }
  const file = value as AssetMutationFileCandidate;
  const localUri = normalizeAssetMutationReference(file.localUri);
  const fileName =
    typeof file.fileName === "string" ? file.fileName.trim() : "";
  const mimeType =
    typeof file.mimeType === "string" ? file.mimeType.trim() : "";

  if (
    !localUri ||
    localUri.length > 4_096 ||
    !fileName ||
    fileName.length > 255 ||
    /[\\/\u0000-\u001f\u007f]/u.test(fileName) ||
    !mimeType ||
    !validMimeType(mimeType) ||
    !isSupportedMimeType(mimeType, role) ||
    !protectedMetadataIsConsistent(file)
  ) {
    return {
      code: "ASSET_FILE_METADATA_INVALID",
      field: role,
      fileRole: role,
    };
  }

  if (
    typeof file.byteSize !== "number" ||
    !Number.isSafeInteger(file.byteSize) ||
    file.byteSize < 1 ||
    file.byteSize > MAX_ASSET_CAPTURE_FILE_BYTES
  ) {
    return {
      code: "ASSET_FILE_SIZE_INVALID",
      field: role,
      fileRole: role,
    };
  }

  return null;
}

export function assertValidAssetMutationFile(
  value: unknown,
  role: AssetMutationFileRole,
): asserts value is AssetMutationFileCandidate {
  const issue = assetMutationFileIssue(value, role);
  if (issue) throw new AssetMutationValidationError(issue);
}

function assertOptionalFile(
  value: unknown,
  role: AssetMutationFileRole,
): void {
  if (value === undefined || value === null) return;
  assertValidAssetMutationFile(value, role);
}

function isLocationStatus(value: unknown): value is LocationStatus {
  return (
    value === "known" ||
    value === "needs-detail" ||
    value === "unknown"
  );
}

/**
 * Validates the final state which will be committed, rather than trusting the
 * screen step that produced it. This keeps restored drafts, deep links, tests,
 * and future command callers behind the same invariant boundary.
 */
export function assertValidFinalAssetMutation(
  candidate: FinalAssetMutationCandidate,
  context: FinalAssetMutationContext,
): void {
  const name =
    typeof candidate.name === "string"
      ? normalizeAssetMutationName(candidate.name)
      : "";
  if (!name) fail("ASSET_NAME_REQUIRED", "name");

  const categoryId =
    typeof candidate.categoryId === "string"
      ? candidate.categoryId.trim()
      : "";
  const category = getFocusedCategory(categoryId);
  if (
    !category ||
    category.kind === "real-estate" ||
    !context.supportedCategoryIds.includes(categoryId)
  ) {
    fail("ASSET_CATEGORY_UNSUPPORTED", "category");
  }

  if (!isLocationStatus(candidate.locationStatus)) {
    fail("ASSET_LOCATION_STATE_INVALID", "location");
  }

  const placeId = normalizeAssetMutationReference(candidate.placeId);
  const spaceId = normalizeAssetMutationReference(candidate.spaceId);
  const detail = normalizeAssetMutationReference(
    candidate.locationDetail,
  );
  const requiresPhysicalLocation = category.kind === "physical";

  if (!requiresPhysicalLocation) {
    if (
      placeId ||
      spaceId ||
      detail ||
      candidate.locationStatus === "needs-detail"
    ) {
      fail("ASSET_LOCATION_STATE_INVALID", "location");
    }
  } else if (candidate.locationStatus === "unknown") {
    if (placeId || spaceId || detail) {
      fail("ASSET_LOCATION_STATE_INVALID", "location");
    }
  } else {
    if (!placeId) {
      fail(
        candidate.locationStatus === "known"
          ? "ASSET_EXACT_LOCATION_REQUIRED"
          : "ASSET_PLACE_INVALID",
        candidate.locationStatus === "known" ? "location" : "place",
      );
    }

    const place = context.places.find(
      (item) =>
        item.id === placeId &&
        item.householdId === context.householdId,
    );
    if (!place) fail("ASSET_PLACE_INVALID", "place");
    if (spaceId && !place.spaceIds.includes(spaceId)) {
      fail("ASSET_SPACE_INVALID", "space");
    }
    if (
      candidate.locationStatus === "needs-detail" &&
      (spaceId || detail)
    ) {
      fail("ASSET_LOCATION_STATE_INVALID", "location");
    }
    if (
      candidate.locationStatus === "known" &&
      !spaceId &&
      !detail
    ) {
      fail("ASSET_EXACT_LOCATION_REQUIRED", "location");
    }
  }

  if (!placeId && spaceId) {
    fail("ASSET_LOCATION_STATE_INVALID", "location");
  }

  assertOptionalFile(candidate.photo, "photo");
  assertOptionalFile(candidate.evidence, "evidence");
}
