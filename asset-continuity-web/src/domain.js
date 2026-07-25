import {
  SAMPLE_SNAPSHOT_VERSION,
  createSampleWorkspaceSeed,
  isRetiredLegacySampleAssetId,
} from "./sampleData.js";
import {
  ASSET_TAXONOMY_VERSION,
  getAssetCategory,
  getAssetCategoryPath,
} from "./taxonomy.js";
import {
  applyCollectorCommand,
  collectorProfileIdForAsset,
  reconcileCollectorState,
} from "./collectorWorkspace.js";
import {
  isOwnedPropertyTenure,
  linkPropertyProjection,
  normalizePropertyTenure,
  reconcilePropertyLinks,
  unlinkPropertyProjection,
} from "./propertyLinkage.js";

export const SNAPSHOT_VERSION = SAMPLE_SNAPSHOT_VERSION;
export const STORAGE_KEY = "alyr.asset-continuity.demo";
export const LEGACY_STORAGE_KEYS = [
  `alyr.asset-continuity.demo.v${SAMPLE_SNAPSHOT_VERSION}`,
  ...[4, 3, 2, 1].map(
    (version) => `alyr.asset-continuity.demo.v${version}`,
  ),
].filter((value, index, list) => list.indexOf(value) === index);
export const RECOVERY_STORAGE_KEY = `${STORAGE_KEY}.recovery`;
export const MAX_EXACT_GPS_ACCURACY_METERS = 15;

const LOCATION_STATUSES = new Set(["known", "needs-detail", "unknown"]);
const LOCATION_MODES = new Set([
  "physical",
  "virtual",
  "unknown",
  "not-applicable",
]);
const VIRTUAL_LOCATION_KINDS = new Set([
  "digital",
  "financial",
  "intangible",
  "document",
]);
const LOCATION_SOURCES = new Set([
  "device_gps",
  "user_pin",
  "geocoder",
  "manual_coordinates",
  "user",
  "imported",
  "photo_exif",
  "not_set",
]);
const LOCATION_PRECISIONS = new Set([
  "exact",
  "user_placed",
  "approximate",
  "locality_only",
]);
const LOCATION_CONFIRMATION_STATES = new Set([
  "suggested",
  "user-confirmed",
  "stale",
  "disputed",
]);
const LIFECYCLE_STATUSES = new Set([
  "active",
  "missing",
  "loaned",
  "sold",
  "gifted",
  "archived",
]);
const EVIDENCE_STATUSES = new Set(["pending", "verified", "rejected"]);
const MATERIAL_KINDS = new Set([
  "paper",
  "artifact",
  "media",
  "record",
  "note",
  "link",
]);
const MATERIAL_RELATIONS = new Set([
  "ownership",
  "identity",
  "service",
  "provenance",
  "condition",
  "insurance",
  "valuation",
  "legal",
  "access",
  "context",
  "other",
]);
const MATERIAL_STORAGE_STATUSES = new Set([
  "known",
  "needs_detail",
  "unknown",
  "not_applicable",
  "external_custodian",
]);
const TASK_STATUSES = new Set(["open", "completed", "dismissed"]);
const TASK_PRIORITIES = new Set(["urgent", "high", "normal", "later"]);
const WORKSPACE_MODES = new Set(["unstarted", "sample", "personal"]);
const MEMBER_ROLES = new Set([
  "owner",
  "co-owner",
  "editor",
  "viewer",
  "trusted-contact",
]);

/**
 * Location policy is derived from the canonical taxonomy kind, not a caller's
 * requested mode. This keeps inherently physical records from being made
 * "virtual" simply to satisfy a completeness score.
 */
export function getAssetLocationPolicy(assetLike = {}) {
  const kind = text(assetLike.kind, "physical").toLowerCase();
  const memorySubject = text(
    assetLike.profile?.["memory-subject"],
    "story",
  ).toLowerCase();
  const isPhysicalMemory =
    kind === "memory" && memorySubject === "physical";
  const requiresPhysicalLocator =
    kind === "physical" || kind === "real-estate" || isPhysicalMemory;
  const allowsVirtual = VIRTUAL_LOCATION_KINDS.has(kind);
  const usesNotApplicable =
    kind === "memory" && !isPhysicalMemory;
  return {
    kind,
    isRealEstate: kind === "real-estate",
    requiresPhysicalLocator,
    allowsVirtual,
    usesNotApplicable,
  };
}

export function hasConfirmedExactPlaceLocation(place) {
  if (!place) return false;
  const latitude = finiteNumber(place.coordinates?.lat);
  const longitude = finiteNumber(place.coordinates?.lng);
  if (
    latitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude === null ||
    longitude < -180 ||
    longitude > 180
  ) {
    return false;
  }
  return (
    ["exact", "user_placed"].includes(place.locationPrecision) &&
    Boolean(place.locationConfirmedAt)
  );
}

function normalizeAssetLocationTruth({
  kind,
  profile,
  placeId,
  spaceId,
  locationDetail,
  requestedMode,
  requestedStatus,
  placeById,
}) {
  const policy = getAssetLocationPolicy({ kind, profile });
  const place = placeId ? placeById?.get(placeId) : null;
  const hasIndoorLocator = Boolean(spaceId || nullableText(locationDetail));

  if (placeId && place) {
    const canBeKnown = policy.isRealEstate
      ? hasConfirmedExactPlaceLocation(place)
      : hasIndoorLocator;
    return {
      locationMode: "physical",
      locationStatus:
        requestedStatus === "known" && canBeKnown
          ? "known"
          : requestedStatus === "unknown"
            ? "unknown"
            : "needs-detail",
    };
  }

  if (policy.usesNotApplicable) {
    return {
      locationMode: "not-applicable",
      locationStatus: "unknown",
    };
  }
  if (policy.requiresPhysicalLocator) {
    return {
      locationMode:
        requestedMode === "physical" &&
        requestedStatus === "needs-detail"
          ? "physical"
          : "unknown",
      locationStatus:
        requestedMode === "physical" &&
        requestedStatus === "needs-detail"
          ? "needs-detail"
          : "unknown",
    };
  }
  if (requestedMode === "physical") {
    return {
      locationMode: "physical",
      locationStatus:
        requestedStatus === "needs-detail"
          ? "needs-detail"
          : "unknown",
    };
  }
  return {
    locationMode:
      requestedMode === "unknown"
        ? "unknown"
        : policy.allowsVirtual
          ? "virtual"
          : "unknown",
    locationStatus: "unknown",
  };
}
const COLLECTION_KINDS = new Set([
  "collection",
  "portfolio",
  "memory",
  "archive",
]);
const COLLECTION_VISIBILITIES = new Set([
  "private",
  "household",
  "selected",
  "showcase",
]);
const ASSET_VISIBILITIES = new Set([
  "private",
  "household",
  "selected",
  "showcase",
]);
const LEGACY_INTENTS = new Set([
  "undecided",
  "keep",
  "gift",
  "inherit",
  "sell",
  "donate",
  "archive-story",
]);
const FILE_STATES = new Set([
  "missing_original",
  "ready_local",
  "queued",
  "uploading",
  "processing",
  "ready",
  "failed",
  "quarantined",
]);

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function nullableText(value) {
  const result = text(value);
  return result || null;
}

function finiteNumber(value, fallback = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coordinate(value, minimum, maximum) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : null;
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

function timestamp(value, fallback) {
  if (typeof value !== "string") return fallback;
  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item)).filter(Boolean))];
}

function flatStringRecord(value) {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [text(key), text(item)])
      .filter(([key, item]) => key && item),
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeSampleRecordDefaults(current, canonical) {
  const existing = Array.isArray(current) ? current : [];
  const canonicalById = new Map(
    (Array.isArray(canonical) ? canonical : [])
      .filter((item) => isObject(item) && text(item.id))
      .map((item) => [text(item.id), item]),
  );
  const knownIds = new Set();
  const enriched = existing.map((item) => {
    if (!isObject(item) || !text(item.id)) return item;
    const id = text(item.id);
    knownIds.add(id);
    const defaults = canonicalById.get(id);
    if (!defaults) return item;
    return {
      ...defaults,
      ...item,
      profile: {
        ...(isObject(defaults.profile) ? defaults.profile : {}),
        ...(isObject(item.profile) ? item.profile : {}),
      },
    };
  });
  return [
    ...enriched,
    ...(Array.isArray(canonical) ? canonical : []).filter(
      (item) => isObject(item) && text(item.id) && !knownIds.has(text(item.id)),
    ),
  ];
}

function createId(prefix, requestedId) {
  const explicit = text(requestedId);
  if (explicit) return explicit;

  try {
    if (
      typeof globalThis.crypto !== "undefined" &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }
  } catch {
    // The deterministic-looking fallback keeps the demo usable in older runtimes.
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function initialsFor(name) {
  return text(name, "Guest")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function slug(value, fallback = "region") {
  return (
    normalizedSearchText(value)
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
      .replace(/(^-|-$)/g, "") || fallback
  );
}

function defaultEvidenceRequirements(category) {
  switch (text(category).toLowerCase()) {
    case "property":
      return ["Title deed", "Insurance policy"];
    case "watch":
    case "camera":
    case "collectible":
    case "jewelry":
      return ["Current photo", "Purchase receipt"];
    case "document":
      return ["Current document copy"];
    case "digital":
      return ["Recovery note"];
    default:
      return ["Current photo"];
  }
}

function inferMaterialKind(type) {
  const value = text(type).toLowerCase();
  if (/photo|image|video|audio/.test(value)) return "media";
  if (/story|memory|note/.test(value)) return "note";
  if (/service|valuation|appraisal|maintenance|inspection/.test(value)) {
    return "record";
  }
  return "paper";
}

function inferMaterialRelation(type) {
  const value = text(type).toLowerCase();
  if (/title|deed|receipt|invoice|policy|insurance/.test(value)) {
    return "ownership";
  }
  if (/service|maintenance|repair/.test(value)) return "service";
  if (/story|memory|provenance/.test(value)) return "provenance";
  if (/photo|image|condition|inspection/.test(value)) return "condition";
  return "context";
}

function isSafeReferenceUrl(value) {
  const candidate = nullableText(value);
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasMaterialStorageSource(materialStorage) {
  if (!isObject(materialStorage)) return false;
  if (materialStorage.status === "known") {
    return Boolean(
      materialStorage.placeId &&
        (materialStorage.spaceId || materialStorage.locatorText),
    );
  }
  if (materialStorage.status === "needs_detail") {
    return Boolean(
      materialStorage.placeId ||
        materialStorage.spaceId ||
        materialStorage.locatorText,
    );
  }
  if (materialStorage.status === "external_custodian") {
    return Boolean(
      materialStorage.custodianMemberId ||
        materialStorage.externalLabel ||
        materialStorage.locatorText,
    );
  }
  return false;
}

function hasMaterialSource(
  kind,
  { fileName, linkUrl, physicalLocation, materialStorage, note },
) {
  if (kind === "paper" || kind === "media") return Boolean(fileName);
  if (kind === "note") return Boolean(note);
  if (kind === "link") return isSafeReferenceUrl(linkUrl);
  if (kind === "artifact") {
    return Boolean(
      fileName ||
        physicalLocation ||
        hasMaterialStorageSource(materialStorage) ||
        note,
    );
  }
  if (kind === "record") {
    return Boolean(
      fileName ||
        linkUrl ||
        physicalLocation ||
        hasMaterialStorageSource(materialStorage) ||
        note,
    );
  }
  return false;
}

export function isReviewableEvidence(evidence) {
  if (!isObject(evidence)) return false;
  if (
    !hasMaterialSource(evidence.kind, {
      fileName: evidence.fileName,
      linkUrl: evidence.linkUrl,
      physicalLocation: evidence.physicalLocation,
      materialStorage: evidence.materialStorage,
      note: evidence.note,
    })
  ) {
    return false;
  }
  if (!evidence.fileName) return true;
  const checksum = text(evidence.fileChecksum).toLowerCase();
  return (
    ["ready_local", "ready"].includes(evidence.fileState) &&
    /^[a-f0-9]{64}$/u.test(checksum) &&
    finiteNumber(evidence.fileSize) !== null &&
    evidence.fileSize > 0
  );
}

function byUniqueId(items, normalize) {
  const seen = new Set();
  const output = [];
  for (const candidate of items) {
    const item = normalize(candidate);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function normalizeRegion(candidate) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const name = text(candidate.name);
  const lat = coordinate(candidate.lat, -90, 90);
  const lng = coordinate(candidate.lng, -180, 180);
  if (!id || !name || lat === null || lng === null) return null;
  return { id, name, lat, lng };
}

function normalizeMember(candidate, householdId, fallbackNow) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const name = text(candidate.name);
  if (!id || !name) return null;
  const role = MEMBER_ROLES.has(candidate.accessRole)
    ? candidate.accessRole
    : "viewer";
  const inviteStatus = ["active", "invited", "revoked"].includes(
    candidate.inviteStatus,
  )
    ? candidate.inviteStatus
    : "invited";
  return {
    id,
    householdId,
    name,
    email: nullableText(candidate.email),
    initials: text(candidate.initials, initialsFor(name)),
    accessRole: role,
    accessScope: text(candidate.accessScope, role === "owner" ? "all" : "selected"),
    inviteStatus,
    joinedAt:
      inviteStatus === "active"
        ? timestamp(candidate.joinedAt, fallbackNow)
        : null,
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizePlace(candidate, householdId, fallbackNow, regionIds = null) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const name = text(candidate.name);
  if (!id || !name) return null;
  const coordinateCandidate = isObject(candidate.coordinates)
    ? candidate.coordinates
    : {};
  const lat = coordinate(coordinateCandidate.lat, -90, 90);
  const lng = coordinate(coordinateCandidate.lng, -180, 180);
  const coordinates =
    lat !== null && lng !== null
      ? { lat, lng }
      : { lat: null, lng: null };
  const hasExactPoint = coordinates.lat !== null && coordinates.lng !== null;
  const requestedLocationSource = LOCATION_SOURCES.has(
    candidate.locationSource,
  )
    ? candidate.locationSource
    : null;
  const locationSource = hasExactPoint
    ? requestedLocationSource && requestedLocationSource !== "not_set"
      ? requestedLocationSource
      : "imported"
    : "not_set";
  let locationPrecision = hasExactPoint
    ? LOCATION_PRECISIONS.has(candidate.locationPrecision)
      ? candidate.locationPrecision
      : "approximate"
    : "locality_only";
  let horizontalAccuracyMeters =
    hasExactPoint &&
    finiteNumber(candidate.horizontalAccuracyMeters) !== null &&
    candidate.horizontalAccuracyMeters >= 0
      ? candidate.horizontalAccuracyMeters
      : null;
  if (locationPrecision === "user_placed") {
    horizontalAccuracyMeters = null;
  }
  if (
    locationSource === "device_gps" &&
    locationPrecision === "exact" &&
    (horizontalAccuracyMeters === null ||
      horizontalAccuracyMeters > MAX_EXACT_GPS_ACCURACY_METERS)
  ) {
    locationPrecision = "approximate";
  }
  const regionId = text(
    candidate.regionId,
    text(candidate.city, "other").toLowerCase(),
  );
  if (regionIds && !regionIds.has(regionId)) return null;
  return {
    id,
    householdId,
    name,
    kind: text(candidate.kind, "place").toLowerCase(),
    tenure: normalizePropertyTenure(candidate.tenure),
    propertyAssetId: nullableText(candidate.propertyAssetId),
    regionId,
    city: text(candidate.city, "Unspecified"),
    countryCode: text(candidate.countryCode).toUpperCase() || null,
    address: nullableText(
      candidate.formattedAddress !== undefined
        ? candidate.formattedAddress
        : candidate.address ?? candidate.addressSummary,
    ),
    coordinates,
    locationSource,
    locationPrecision,
    horizontalAccuracyMeters,
    locationCapturedAt: hasExactPoint && candidate.locationCapturedAt
      ? timestamp(candidate.locationCapturedAt, null)
      : null,
    locationConfirmedAt:
      hasExactPoint && candidate.locationConfirmedAt
        ? timestamp(candidate.locationConfirmedAt, null)
        : null,
    status: candidate.status === "archived" ? "archived" : "active",
    image: nullableText(candidate.image ?? candidate.imagePath),
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizePlaceSnapshot(candidate) {
  if (!isObject(candidate)) return null;
  const coordinateCandidate = isObject(candidate.coordinates)
    ? candidate.coordinates
    : {};
  const lat = coordinate(coordinateCandidate.lat, -90, 90);
  const lng = coordinate(coordinateCandidate.lng, -180, 180);
  const hasExactPoint = lat !== null && lng !== null;
  const locationPrecision = LOCATION_PRECISIONS.has(candidate.locationPrecision)
    ? candidate.locationPrecision
    : "locality_only";
  const horizontalAccuracyMeters =
    locationPrecision === "user_placed"
      ? null
      : finiteNumber(candidate.horizontalAccuracyMeters) !== null &&
          candidate.horizontalAccuracyMeters >= 0
        ? candidate.horizontalAccuracyMeters
        : null;
  return {
    name: text(candidate.name, "Recorded place"),
    formattedAddress: nullableText(
      candidate.formattedAddress !== undefined
        ? candidate.formattedAddress
        : candidate.address,
    ),
    coordinates: hasExactPoint
      ? { lat, lng }
      : { lat: null, lng: null },
    locationSource: LOCATION_SOURCES.has(candidate.locationSource)
      ? candidate.locationSource
      : "not_set",
    locationPrecision,
    horizontalAccuracyMeters,
    capturedAt: candidate.locationCapturedAt
      ? timestamp(candidate.locationCapturedAt, null)
      : candidate.capturedAt
        ? timestamp(candidate.capturedAt, null)
        : null,
  };
}

function normalizeSpacePathSnapshot(candidate, spaceId, spaceById) {
  if (!spaceId) return [];
  if (Array.isArray(candidate) && candidate.length) {
    const normalized = candidate
      .slice(0, 24)
      .map((item) =>
        isObject(item) && text(item.id) && text(item.name)
          ? {
              id: text(item.id),
              name: text(item.name),
              kind: text(item.kind, "zone").toLowerCase(),
            }
          : null,
      )
      .filter(Boolean);
    if (
      normalized.length &&
      normalized[normalized.length - 1].id === spaceId
    ) {
      return normalized;
    }
  }
  const path = [];
  const visited = new Set();
  let cursor = spaceById.get(spaceId);
  while (cursor && !visited.has(cursor.id) && path.length < 24) {
    visited.add(cursor.id);
    path.unshift({
      id: cursor.id,
      name: cursor.name,
      kind: cursor.kind,
    });
    cursor = cursor.parentSpaceId
      ? spaceById.get(cursor.parentSpaceId)
      : null;
  }
  return path;
}

function normalizeRecordedSpacePath(candidate) {
  if (!Array.isArray(candidate)) return [];
  return candidate
    .slice(0, 24)
    .map((item) =>
      isObject(item) && text(item.id) && text(item.name)
        ? {
            id: text(item.id),
            name: text(item.name),
            kind: text(item.kind, "zone").toLowerCase(),
          }
        : null,
    )
    .filter(Boolean);
}

function normalizeEvidencePlacementContext(candidate, fallbackNow) {
  if (!isObject(candidate)) return null;
  return {
    assignmentId: nullableText(candidate.assignmentId),
    mode: LOCATION_MODES.has(candidate.mode) ? candidate.mode : "unknown",
    placeSnapshot: isObject(candidate.placeSnapshot)
      ? normalizePlaceSnapshot(candidate.placeSnapshot)
      : null,
    spacePathSnapshot: normalizeRecordedSpacePath(
      candidate.spacePathSnapshot,
    ),
    locatorText: nullableText(
      candidate.locatorText ?? candidate.locationDetail,
    ),
    recordedAt: timestamp(
      candidate.recordedAt ?? candidate.capturedAt ?? candidate.attachedAt,
      fallbackNow,
    ),
  };
}

function createEvidencePlacementContext(current, assetId, now) {
  const asset = current.assets.find((item) => item.id === assetId);
  let activeAssignment = null;
  for (const assignment of current.locationAssignments) {
    if (assignment.assetId !== assetId || assignment.validTo) continue;
    if (
      !activeAssignment ||
      String(assignment.validFrom).localeCompare(
        String(activeAssignment.validFrom),
      ) > 0
    ) {
      activeAssignment = assignment;
    }
  }
  return normalizeEvidencePlacementContext(
    {
      assignmentId: activeAssignment?.id ?? null,
      mode: activeAssignment?.mode ?? asset?.locationMode ?? "unknown",
      placeSnapshot: activeAssignment?.placeSnapshot ?? null,
      spacePathSnapshot: activeAssignment?.spacePathSnapshot ?? [],
      locatorText: activeAssignment?.locatorText ?? null,
      recordedAt: now,
    },
    now,
  );
}

function defaultMaterialStorageStatus(kind) {
  return ["paper", "artifact", "record"].includes(kind)
    ? "unknown"
    : "not_applicable";
}

function normalizeMaterialStorageEvent(
  candidate,
  {
    evidenceId,
    kind,
    placeIds,
    placeById,
    spaceById,
    memberIds,
    fallbackNow,
    fallbackReason = "Initial storage state",
  },
) {
  if (!isObject(candidate)) return null;
  const id = createId(
    "material-storage",
    candidate.id ?? candidate.assignmentId,
  );
  let status = MATERIAL_STORAGE_STATUSES.has(candidate.status)
    ? candidate.status
    : defaultMaterialStorageStatus(kind);
  let placeId = nullableText(candidate.placeId);
  if (placeId && !placeIds.has(placeId)) placeId = null;
  let spaceId = nullableText(candidate.spaceId);
  if (
    spaceId &&
    (!spaceById.has(spaceId) ||
      !placeId ||
      spaceById.get(spaceId).placeId !== placeId)
  ) {
    spaceId = null;
  }
  let locatorText = nullableText(
    candidate.locatorText ?? candidate.physicalLocation,
  );
  let custodianMemberId = memberIds.has(candidate.custodianMemberId)
    ? candidate.custodianMemberId
    : null;
  let externalLabel = nullableText(
    candidate.externalLabel ?? candidate.custodianLabel,
  );

  if (status === "known") {
    if (!placeId) status = "unknown";
    else if (!spaceId && !locatorText) status = "needs_detail";
  }
  if (status === "external_custodian") {
    placeId = null;
    spaceId = null;
    if (!custodianMemberId && !externalLabel && !locatorText) {
      status = "unknown";
    }
  } else {
    custodianMemberId = null;
    externalLabel = null;
  }
  if (status === "unknown") {
    placeId = null;
    spaceId = null;
  }
  if (status === "not_applicable") {
    placeId = null;
    spaceId = null;
    locatorText = null;
    custodianMemberId = null;
    externalLabel = null;
  }

  const placeSnapshotSource = isObject(candidate.placeSnapshot)
    ? candidate.placeSnapshot
    : placeId
      ? placeById.get(placeId)
      : null;
  return {
    id: id || `material-storage-${evidenceId}-initial`,
    status,
    placeId,
    spaceId,
    placeSnapshot:
      placeId && placeSnapshotSource
        ? normalizePlaceSnapshot(placeSnapshotSource)
        : null,
    spacePathSnapshot: normalizeSpacePathSnapshot(
      candidate.spacePathSnapshot,
      spaceId,
      spaceById,
    ),
    locatorText,
    custodianMemberId,
    externalLabel,
    movedAt: timestamp(
      candidate.movedAt ?? candidate.recordedAt ?? candidate.createdAt,
      fallbackNow,
    ),
    movedByMemberId: memberIds.has(
      candidate.movedByMemberId ?? candidate.createdByMemberId,
    )
      ? candidate.movedByMemberId ?? candidate.createdByMemberId
      : null,
    reason: text(candidate.reason, fallbackReason),
  };
}

function normalizeMaterialStorage(
  candidate,
  {
    evidenceId,
    kind,
    legacyPhysicalLocation,
    placeIds,
    placeById,
    spaceById,
    memberIds,
    fallbackNow,
  },
) {
  const source = isObject(candidate) ? candidate : {};
  const historySource = Array.isArray(source.history)
    ? source.history
    : [];
  let history = byUniqueId(historySource, (event) =>
    normalizeMaterialStorageEvent(event, {
      evidenceId,
      kind,
      placeIds,
      placeById,
      spaceById,
      memberIds,
      fallbackNow,
    }),
  );
  if (!history.length) {
    const migratedLegacyLocation = nullableText(legacyPhysicalLocation);
    const seeded = normalizeMaterialStorageEvent(
      {
        ...source,
        id:
          source.id ||
          source.assignmentId ||
          `material-storage-${evidenceId}-initial`,
        status:
          source.status ||
          (migratedLegacyLocation
            ? "needs_detail"
            : defaultMaterialStorageStatus(kind)),
        locatorText: source.locatorText ?? migratedLegacyLocation,
        movedAt: source.movedAt ?? fallbackNow,
        reason:
          source.reason ||
          (migratedLegacyLocation
            ? "Migrated legacy storage clue"
            : "Initial storage state"),
      },
      {
        evidenceId,
        kind,
        placeIds,
        placeById,
        spaceById,
        memberIds,
        fallbackNow,
        fallbackReason: migratedLegacyLocation
          ? "Migrated legacy storage clue"
          : "Initial storage state",
      },
    );
    if (seeded) history = [seeded];
  }
  const current =
    history[history.length - 1] ||
    normalizeMaterialStorageEvent(
      {
        id: `material-storage-${evidenceId}-initial`,
        status: defaultMaterialStorageStatus(kind),
        movedAt: fallbackNow,
        reason: "Initial storage state",
      },
      {
        evidenceId,
        kind,
        placeIds,
        placeById,
        spaceById,
        memberIds,
        fallbackNow,
      },
    );
  return {
    currentEventId: current.id,
    status: current.status,
    placeId: current.placeId,
    spaceId: current.spaceId,
    placeSnapshot: current.placeSnapshot,
    spacePathSnapshot: current.spacePathSnapshot,
    locatorText: current.locatorText,
    custodianMemberId: current.custodianMemberId,
    externalLabel: current.externalLabel,
    movedAt: current.movedAt,
    movedByMemberId: current.movedByMemberId,
    reason: current.reason,
    history,
  };
}

function normalizeSpace(candidate, placeIds, fallbackNow) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const placeId = text(candidate.placeId);
  const name = text(candidate.name);
  if (!id || !name || !placeIds.has(placeId)) return null;
  return {
    id,
    placeId,
    parentSpaceId: nullableText(candidate.parentSpaceId),
    name,
    kind: text(candidate.kind, "zone").toLowerCase(),
    sortOrder: finiteNumber(candidate.sortOrder, 0),
    note: text(candidate.note),
    lastCapturedAt: candidate.lastCapturedAt
      ? timestamp(candidate.lastCapturedAt, null)
      : null,
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizeAsset(
  candidate,
  householdId,
  placeIds,
  placeById,
  spaceById,
  memberIds,
  fallbackNow,
) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const name = text(candidate.name);
  if (!id || !name) return null;

  let placeId = nullableText(candidate.placeId);
  if (placeId && !placeIds.has(placeId)) placeId = null;
  let spaceId = nullableText(candidate.spaceId);
  if (
    spaceId &&
    (!spaceById.has(spaceId) || spaceById.get(spaceId).placeId !== placeId)
  ) {
    spaceId = null;
  }
  const legacyCategory = text(candidate.category, "Other");
  const resolvedCategory =
    getAssetCategory(candidate.categoryId) ||
    getAssetCategory(legacyCategory) ||
    getAssetCategory("Other");
  const resolvedCategoryPath = resolvedCategory
    ? getAssetCategoryPath(resolvedCategory.id)
    : null;
  const normalizedCategoryPath = resolvedCategoryPath?.ids ?? [];
  const normalizedCategoryId = resolvedCategory?.id ?? null;
  const normalizedKind = text(
    resolvedCategory?.kind,
    text(candidate.kind, "physical"),
  );
  const normalizedProfile = flatStringRecord(candidate.profile);

  const requestedLocationStatus = LOCATION_STATUSES.has(candidate.locationStatus)
    ? candidate.locationStatus
    : placeId
      ? spaceId || nullableText(candidate.locationDetail)
        ? "known"
        : "needs-detail"
      : "unknown";
  const requestedLocationMode = LOCATION_MODES.has(candidate.locationMode)
    ? candidate.locationMode
    : null;
  const { locationMode, locationStatus } =
    normalizeAssetLocationTruth({
      kind: normalizedKind,
      profile: normalizedProfile,
      placeId,
      spaceId,
      locationDetail: candidate.locationDetail,
      requestedMode: requestedLocationMode,
      requestedStatus: requestedLocationStatus,
      placeById,
    });
  const migratedLifecycle =
    candidate.lifecycleStatus === "lost"
      ? "missing"
      : ["disposed", "in-service"].includes(candidate.lifecycleStatus)
        ? candidate.lifecycleStatus === "disposed"
          ? "archived"
          : "active"
        : candidate.lifecycleStatus;
  const lifecycleStatus = LIFECYCLE_STATUSES.has(migratedLifecycle)
    ? migratedLifecycle
    : candidate.archivedAt
      ? "archived"
      : "active";
  const ownerMemberId = memberIds.has(candidate.ownerMemberId)
    ? candidate.ownerMemberId
    : null;
  const custodianMemberId = memberIds.has(candidate.custodianMemberId)
    ? candidate.custodianMemberId
    : ownerMemberId;
  const sourceValue = isObject(candidate.value)
    ? candidate.value
    : finiteNumber(candidate.valueAmount) !== null
      ? {
          amountMinor: Math.round(candidate.valueAmount * 100),
          currency: candidate.valueCurrency,
        }
      : null;
  const value =
    sourceValue && finiteNumber(sourceValue.amountMinor) !== null
      ? {
          amountMinor: Math.round(sourceValue.amountMinor),
          currency: text(sourceValue.currency, "QAR").toUpperCase(),
        }
      : null;
  return {
    id,
    householdId,
    name,
    category: resolvedCategory?.label ?? legacyCategory,
    categoryId: normalizedCategoryId,
    categoryPath: normalizedCategoryPath,
    customCategory: nullableText(candidate.customCategory),
    taxonomyVersion: ASSET_TAXONOMY_VERSION,
    kind: normalizedKind,
    locationMode,
    profile: normalizedProfile,
    notes: text(
      candidate.notes,
      [text(candidate.description), text(candidate.story)]
        .filter(Boolean)
        .join("\n\n"),
    ),
    ownerMemberId,
    custodianMemberId,
    propertyPlaceId: nullableText(candidate.propertyPlaceId),
    placeId,
    spaceId,
    locationStatus,
    locationDetail: nullableText(candidate.locationDetail),
    meaningFacets: uniqueStrings(candidate.meaningFacets),
    sentimentalValue: nullableText(candidate.sentimentalValue),
    legacyIntent: LEGACY_INTENTS.has(candidate.legacyIntent)
      ? candidate.legacyIntent
      : "undecided",
    intendedRecipientMemberId: memberIds.has(
      candidate.intendedRecipientMemberId,
    )
      ? candidate.intendedRecipientMemberId
      : null,
    visibility: ASSET_VISIBILITIES.has(candidate.visibility)
      ? candidate.visibility
      : "private",
    coverImage: nullableText(candidate.coverImage),
    acquiredAt: candidate.acquiredAt
      ? timestamp(candidate.acquiredAt, null)
      : null,
    reference: nullableText(candidate.reference),
    value,
    displayValue: nullableText(candidate.displayValue ?? candidate.valueLabel),
    requiredProofTypes: uniqueStrings(
      candidate.requiredProofTypes ?? candidate.requiredEvidenceTypes,
    ),
    tags: uniqueStrings(candidate.tags),
    lifecycleStatus,
    archivedAt:
      lifecycleStatus === "archived"
        ? timestamp(candidate.archivedAt, fallbackNow)
        : null,
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizeLocationAssignment(
  candidate,
  householdId,
  assetIds,
  placeIds,
  spaceById,
  memberIds,
  fallbackNow,
  placeById = new Map(),
) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const assetId = text(candidate.assetId);
  if (!id || !assetIds.has(assetId)) return null;
  let placeId = nullableText(candidate.placeId);
  if (placeId && !placeIds.has(placeId)) placeId = null;
  let spaceId = nullableText(candidate.spaceId);
  if (
    spaceId &&
    (!spaceById.has(spaceId) || spaceById.get(spaceId).placeId !== placeId)
  ) {
    spaceId = null;
  }
  const mode = placeId
    ? "physical"
    : LOCATION_MODES.has(candidate.mode)
      ? candidate.mode
      : "unknown";
  const validFrom = timestamp(
    candidate.validFrom ?? candidate.observedAt,
    fallbackNow,
  );
  const validTo = candidate.validTo
    ? timestamp(candidate.validTo, null)
    : null;
  const snapshotSource = isObject(candidate.placeSnapshot)
    ? candidate.placeSnapshot
    : placeId
      ? placeById.get(placeId)
      : null;
  const placeSnapshot =
    placeId && snapshotSource
      ? normalizePlaceSnapshot(snapshotSource)
      : null;
  const spacePathSnapshot = normalizeSpacePathSnapshot(
    candidate.spacePathSnapshot,
    spaceId,
    spaceById,
  );
  return {
    id,
    householdId,
    assetId,
    mode,
    placeId,
    spaceId,
    placeSnapshot,
    spacePathSnapshot,
    locatorText: nullableText(
      candidate.locatorText ?? candidate.locationDetail,
    ),
    confirmationState: LOCATION_CONFIRMATION_STATES.has(
      candidate.confirmationState,
    )
      ? candidate.confirmationState
      : "user-confirmed",
    source: LOCATION_SOURCES.has(candidate.source)
      ? candidate.source
      : "imported",
    observedAt: timestamp(candidate.observedAt, validFrom),
    validFrom,
    validTo,
    createdByMemberId: memberIds.has(candidate.createdByMemberId)
      ? candidate.createdByMemberId
      : null,
    reason: nullableText(candidate.reason),
    createdAt: timestamp(candidate.createdAt, validFrom),
  };
}

function normalizeCollection(
  candidate,
  householdId,
  assetIds,
  fallbackNow,
) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const name = text(candidate.name);
  if (!id || !name) return null;
  const collectionAssetIds = uniqueStrings(candidate.assetIds).filter((assetId) =>
    assetIds.has(assetId),
  );
  const requestedCoverAssetId = nullableText(candidate.coverAssetId);
  const coverAssetId =
    requestedCoverAssetId && collectionAssetIds.includes(requestedCoverAssetId)
      ? requestedCoverAssetId
      : collectionAssetIds[0] ?? null;
  return {
    id,
    householdId,
    name,
    description: text(candidate.description),
    kind: COLLECTION_KINDS.has(candidate.kind)
      ? candidate.kind
      : "collection",
    visibility: COLLECTION_VISIBILITIES.has(candidate.visibility)
      ? candidate.visibility
      : "private",
    coverAssetId,
    assetIds: collectionAssetIds,
    featuredAssetIds: uniqueStrings(candidate.featuredAssetIds).filter(
      (assetId) => collectionAssetIds.includes(assetId),
    ),
    curatorNote: text(candidate.curatorNote),
    story: text(candidate.story),
    tags: uniqueStrings(candidate.tags),
    status: candidate.status === "archived" ? "archived" : "active",
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizeEvidence(
  candidate,
  householdId,
  assetIds,
  placeIds,
  placeById,
  spaceById,
  memberIds,
  fallbackNow,
) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const assetId = text(candidate.assetId);
  const type = text(candidate.type);
  if (!id || !assetIds.has(assetId) || !type) return null;
  const status = EVIDENCE_STATUSES.has(candidate.status)
    ? candidate.status
    : "pending";
  const kind = MATERIAL_KINDS.has(candidate.kind)
    ? candidate.kind
    : inferMaterialKind(type);
  const fileName = nullableText(candidate.fileName);
  const originalVersionCandidate = nullableText(
    candidate.originalVersionId,
  );
  const linkUrl = nullableText(candidate.linkUrl);
  const physicalLocation = nullableText(candidate.physicalLocation);
  const note = text(candidate.note);
  const addedAt = timestamp(candidate.addedAt, fallbackNow);
  const materialStorage = normalizeMaterialStorage(
    candidate.materialStorage,
    {
      evidenceId: id,
      kind,
      legacyPhysicalLocation: physicalLocation,
      placeIds,
      placeById,
      spaceById,
      memberIds,
      fallbackNow: addedAt,
    },
  );
  if (
    !hasMaterialSource(kind, {
      fileName,
      linkUrl,
      physicalLocation,
      materialStorage,
      note,
    })
  ) {
    return null;
  }
  const normalized = {
    id,
    householdId,
    assetId,
    type,
    kind,
    relation: MATERIAL_RELATIONS.has(candidate.relation)
      ? candidate.relation
      : inferMaterialRelation(type),
    status,
    addedAt,
    verifiedAt:
      status === "verified"
        ? timestamp(candidate.verifiedAt, fallbackNow)
        : null,
    verifiedByMemberId:
      status === "verified" && memberIds.has(candidate.verifiedByMemberId)
        ? candidate.verifiedByMemberId
        : null,
    fileName,
    fileType: nullableText(candidate.fileType),
    fileSize:
      finiteNumber(candidate.fileSize) !== null && candidate.fileSize >= 0
        ? Math.round(candidate.fileSize)
        : null,
    fileChecksum: nullableText(candidate.fileChecksum),
    originalVersionId:
      originalVersionCandidate &&
      /^ov_[a-f0-9]{64}$/iu.test(originalVersionCandidate)
        ? originalVersionCandidate.toLowerCase()
        : null,
    fileState: FILE_STATES.has(candidate.fileState)
      ? candidate.fileState
      : fileName
        ? "missing_original"
        : null,
    storageScope: ["local-device", "encrypted-cloud"].includes(
      candidate.storageScope,
    )
      ? candidate.storageScope
      : fileName
        ? "local-device"
        : null,
    linkUrl,
    physicalLocation: physicalLocation || materialStorage.locatorText,
    materialStorage,
    note,
    source: text(candidate.source, fileName ? "local-file" : "demo-metadata"),
    placementContext: normalizeEvidencePlacementContext(
      candidate.placementContext,
      addedAt,
    ),
  };
  if (normalized.status === "verified" && !isReviewableEvidence(normalized)) {
    normalized.status = "pending";
    normalized.verifiedAt = null;
    normalized.verifiedByMemberId = null;
  }
  return normalized;
}

function normalizeAssetLabelRegistry(
  candidate,
  householdId,
  assetIds,
  memberIds,
  fallbackNow,
) {
  const source = isObject(candidate) ? candidate : {};
  const assignments = byUniqueId(
    Array.isArray(source.assignments) ? source.assignments : [],
    (item) => {
      if (!isObject(item)) return null;
      const id = text(item.id);
      const labelId = text(item.labelId);
      const assetId = text(item.assetId);
      if (
        !id ||
        !/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u.test(labelId) ||
        !assetIds.has(assetId)
      ) {
        return null;
      }
      return {
        id,
        labelId,
        assetId,
        assignedBy: memberIds.has(item.assignedBy)
          ? item.assignedBy
          : null,
        assignedAt: timestamp(item.assignedAt, fallbackNow),
        endedAt: item.endedAt
          ? timestamp(item.endedAt, fallbackNow)
          : null,
        endedBy: memberIds.has(item.endedBy) ? item.endedBy : null,
        source: ["qr", "nfc", "manual"].includes(item.source)
          ? item.source
          : "manual",
      };
    },
  );
  return {
    schemaVersion: 1,
    householdId,
    assignments,
    revision: Math.max(
      assignments.length,
      Math.trunc(finiteNumber(source.revision, 0)),
    ),
    createdAt: timestamp(source.createdAt, fallbackNow),
    updatedAt: timestamp(source.updatedAt, fallbackNow),
  };
}

function normalizeTask(candidate, householdId, assetIds, placeIds, spaceIds, fallbackNow) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const title = text(candidate.title);
  if (!id || !title) return null;
  return {
    id,
    householdId,
    assetId: assetIds.has(candidate.assetId) ? candidate.assetId : null,
    placeId: placeIds.has(candidate.placeId) ? candidate.placeId : null,
    spaceId: spaceIds.has(candidate.spaceId) ? candidate.spaceId : null,
    type: text(candidate.type, "review"),
    requiredEvidenceType: nullableText(candidate.requiredEvidenceType),
    title,
    description: text(candidate.description),
    ctaLabel: text(candidate.ctaLabel, "Review"),
    status: TASK_STATUSES.has(candidate.status) ? candidate.status : "open",
    priority: TASK_PRIORITIES.has(candidate.priority)
      ? candidate.priority
      : "normal",
    dueAt: candidate.dueAt ? timestamp(candidate.dueAt, null) : null,
    completedAt: candidate.completedAt
      ? timestamp(candidate.completedAt, null)
      : null,
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizeActivity(candidate, memberIds, fallbackNow) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const title = text(candidate.title);
  if (!id || !title) return null;
  return {
    id,
    type: text(candidate.type, "update"),
    title,
    detail: text(candidate.detail),
    memberId: memberIds.has(candidate.memberId) ? candidate.memberId : null,
    entityType: nullableText(candidate.entityType),
    entityId: nullableText(candidate.entityId),
    occurredAt: timestamp(candidate.occurredAt, fallbackNow),
  };
}

export function createSampleWorkspace() {
  return normalizeWorkspace(createSampleWorkspaceSeed());
}

export function selectWorkspaceActorMemberId(workspaceInput, session = null) {
  const workspace = normalizeWorkspace(workspaceInput);
  const activeMembers = workspace.members.filter(
    (member) => member.inviteStatus === "active",
  );
  if (session?.accountId) {
    if (
      session.householdId &&
      session.householdId !== workspace.household.id
    ) {
      return null;
    }
    return (
      activeMembers.find((member) => member.id === session.accountId)?.id ||
      null
    );
  }
  return (
    activeMembers.find(
      (member) => member.id === workspace.household.ownerMemberId,
    )?.id || null
  );
}

/**
 * Repairs a parsed local-storage value into the current serializable schema.
 * Invalid collections fall back independently to sample data; valid empty
 * collections remain empty so a user can start a fresh demo workspace.
 */
export function normalizeWorkspace(value) {
  const fallback = createSampleWorkspaceSeed();
  if (!isObject(value)) value = fallback;
  let incomingVersion = finiteNumber(
    value.version,
    finiteNumber(value.schemaVersion),
  );
  if (
    incomingVersion !== null &&
    incomingVersion > SNAPSHOT_VERSION
  ) {
    value = fallback;
    incomingVersion = SNAPSHOT_VERSION;
  }

  const mode = WORKSPACE_MODES.has(value.mode)
    ? value.mode
    : value.mode === "demo-local"
      ? "sample"
      : "sample";
  const isPersonal = mode === "personal";
  const shouldUpgradeSample =
    !isPersonal &&
    (incomingVersion === null || incomingVersion < SNAPSHOT_VERSION);
  const fallbackNow = timestamp(value?.meta?.updatedAt, fallback.meta.updatedAt);
  const householdCandidate = isObject(value.household)
    ? value.household
    : isPersonal
      ? {
          id: "household-personal-recovered",
          name: "My household",
          ownerMemberId: "member-personal-recovered",
          locale: fallback.household.locale,
          currency: fallback.household.currency,
          createdAt: fallbackNow,
        }
      : fallback.household;
  const householdId = text(householdCandidate.id, fallback.household.id);
  const household = {
    id: householdId,
    name: text(householdCandidate.name, fallback.household.name),
    ownerMemberId: nullableText(householdCandidate.ownerMemberId),
    locale: text(householdCandidate.locale, fallback.household.locale),
    currency: text(householdCandidate.currency, fallback.household.currency).toUpperCase(),
    demoOnly: householdCandidate.demoOnly !== false,
    createdAt: timestamp(householdCandidate.createdAt, fallback.household.createdAt),
    updatedAt: fallbackNow,
  };

  const personalMemberFallback = [
    {
      id: text(
        householdCandidate.ownerMemberId,
        "member-personal-recovered",
      ),
      householdId,
      name: "Workspace owner",
      initials: "WO",
      accessRole: "owner",
      accessScope: "all",
      inviteStatus: "active",
      joinedAt: fallbackNow,
      createdAt: fallbackNow,
      updatedAt: fallbackNow,
    },
  ];
  const memberFallback = isPersonal
    ? personalMemberFallback
    : fallback.members;
  const memberSource = Array.isArray(value.members)
    ? value.members
    : memberFallback;
  const normalizedMembers = byUniqueId(memberSource, (candidate) =>
    normalizeMember(candidate, householdId, fallbackNow),
  );
  const members = normalizedMembers.length
    ? normalizedMembers
    : isPersonal
      ? byUniqueId(personalMemberFallback, (candidate) =>
          normalizeMember(candidate, householdId, fallbackNow),
        )
      : memberSource.length === 0
        ? []
        : clone(fallback.members);
  const memberIds = new Set(members.map((item) => item.id));
  household.ownerMemberId = memberIds.has(household.ownerMemberId)
    ? household.ownerMemberId
    : members.find((item) => item.accessRole === "owner")?.id ?? null;

  const regionSource = Array.isArray(value.regions)
    ? value.regions
    : isPersonal
      ? []
      : fallback.regions;
  const regions = byUniqueId(regionSource, normalizeRegion);
  const regionIds = new Set(regions.map((item) => item.id));

  const incomingPlaceSource = Array.isArray(value.places)
    ? value.places
    : isPersonal
      ? []
      : fallback.places;
  const placeSource = shouldUpgradeSample
    ? mergeSampleRecordDefaults(
        incomingPlaceSource,
        fallback.places,
      ).map((place) => {
        if (place?.id === "pearl-apartment-place") {
          return {
            ...place,
            kind: "apartment",
            tenure: "owned",
            propertyAssetId: "pearl-apartment",
          };
        }
        if (place?.id === "dubai-storage") {
          return {
            ...place,
            tenure: "rented",
            propertyAssetId: null,
          };
        }
        return place;
      })
    : incomingPlaceSource;
  let places = byUniqueId(placeSource, (candidate) =>
    normalizePlace(candidate, householdId, fallbackNow, regionIds),
  );
  const placeIds = new Set(places.map((item) => item.id));
  const activePlaceIds = new Set(
    places
      .filter((item) => item.status !== "archived")
      .map((item) => item.id),
  );
  const activePlaceById = new Map(
    places
      .filter((item) => item.status !== "archived")
      .map((item) => [item.id, item]),
  );

  const spaceSource = Array.isArray(value.spaces)
    ? value.spaces
    : isPersonal
      ? []
      : fallback.spaces;
  const initialSpaces = byUniqueId(spaceSource, (candidate) =>
    normalizeSpace(candidate, placeIds, fallbackNow),
  );
  const spaces = initialSpaces.map((space) => ({ ...space }));
  const repairSpaceById = new Map(spaces.map((item) => [item.id, item]));
  for (const space of spaces) {
    const parent = repairSpaceById.get(space.parentSpaceId);
    if (
      !parent ||
      parent.placeId !== space.placeId ||
      parent.id === space.id
    ) {
      space.parentSpaceId = null;
    }
  }
  const spaceVisitState = new Map();
  function repairSpaceCycle(space) {
    spaceVisitState.set(space.id, "visiting");
    const parent = repairSpaceById.get(space.parentSpaceId);
    if (parent) {
      const parentState = spaceVisitState.get(parent.id);
      if (parentState === "visiting") {
        // Break only the back edge. Valid ancestors and descendants remain intact.
        space.parentSpaceId = null;
      } else if (parentState !== "visited") {
        repairSpaceCycle(parent);
      }
    }
    spaceVisitState.set(space.id, "visited");
  }
  for (const space of spaces) {
    if (!spaceVisitState.has(space.id)) repairSpaceCycle(space);
  }
  const spaceById = new Map(spaces.map((item) => [item.id, item]));
  const activeSpaceById = new Map(
    spaces
      .filter((item) => activePlaceIds.has(item.placeId))
      .map((item) => [item.id, item]),
  );

  const incomingAssetSource = Array.isArray(value.assets)
    ? value.assets
    : isPersonal
      ? []
      : fallback.assets;
  // Sample snapshots can survive an interrupted upgrade with the newest
  // version number but still contain retired scale fixtures. Keep pruning
  // deterministic and id-based on every normalization pass. Personal
  // workspaces are never touched by this sample-only cleanup.
  const activeIncomingAssetSource = isPersonal
    ? incomingAssetSource
    : incomingAssetSource.filter(
        (asset) => !isRetiredLegacySampleAssetId(asset?.id),
      );
  const assetSource = shouldUpgradeSample
    ? mergeSampleRecordDefaults(
        activeIncomingAssetSource,
        fallback.assets,
      ).map((asset) =>
        asset?.id === "pearl-apartment"
          ? {
              ...asset,
              category: "Apartment",
              categoryId: "property.apartment",
              kind: "real-estate",
              propertyPlaceId: "pearl-apartment-place",
            }
          : asset,
      )
    : activeIncomingAssetSource;
  let assets = byUniqueId(assetSource, (candidate) =>
    normalizeAsset(
      candidate,
      householdId,
      activePlaceIds,
      activePlaceById,
      activeSpaceById,
      memberIds,
      fallbackNow,
    ),
  );
  const propertyReconciliation = reconcilePropertyLinks({ places, assets });
  places = propertyReconciliation.places;
  assets = propertyReconciliation.assets;
  const assetIds = new Set(assets.map((item) => item.id));

  const assignmentSource = Array.isArray(value.locationAssignments)
    ? value.locationAssignments
    : assets.map((asset) => ({
        id: `location-${asset.id}-initial`,
        householdId,
        assetId: asset.id,
        mode: asset.locationMode,
        placeId: asset.placeId,
        spaceId: asset.spaceId,
        locatorText: asset.locationDetail,
        confirmationState:
          asset.locationStatus === "known" ? "user-confirmed" : "suggested",
        source: "imported",
        observedAt: asset.updatedAt || asset.createdAt || fallbackNow,
        validFrom: asset.createdAt || fallbackNow,
        validTo: null,
        createdByMemberId: asset.ownerMemberId,
        reason: "Initial migrated location",
        createdAt: asset.createdAt || fallbackNow,
      }));
  const locationAssignments = byUniqueId(assignmentSource, (candidate) =>
    normalizeLocationAssignment(
      candidate,
      householdId,
      assetIds,
      activePlaceIds,
      activeSpaceById,
      memberIds,
      fallbackNow,
      activePlaceById,
    ),
  );

  const incomingEvidenceSource = Array.isArray(value.evidence)
    ? value.evidence
    : isPersonal
      ? []
      : fallback.evidence;
  const evidenceSource = shouldUpgradeSample
    ? mergeSampleRecordDefaults(incomingEvidenceSource, fallback.evidence)
    : incomingEvidenceSource;
  const evidence = byUniqueId(evidenceSource, (candidate) =>
    normalizeEvidence(
      candidate,
      householdId,
      assetIds,
      activePlaceIds,
      activePlaceById,
      activeSpaceById,
      memberIds,
      fallbackNow,
    ),
  );

  const incomingCollectionSource = Array.isArray(value.collections)
    ? value.collections
    : isPersonal
      ? []
      : Array.isArray(fallback.collections)
        ? fallback.collections
        : [];
  const collectionSource = shouldUpgradeSample
    ? mergeSampleRecordDefaults(
        incomingCollectionSource,
        fallback.collections,
      )
    : incomingCollectionSource;
  const collections = byUniqueId(collectionSource, (candidate) =>
    normalizeCollection(candidate, householdId, assetIds, fallbackNow),
  );

  const taskSource = Array.isArray(value.tasks)
    ? value.tasks
    : isPersonal
      ? []
      : fallback.tasks;
  const tasks = byUniqueId(taskSource, (candidate) =>
    normalizeTask(
      candidate,
      householdId,
      assetIds,
      activePlaceIds,
      new Set(activeSpaceById.keys()),
      fallbackNow,
    ),
  );

  const activitySource = Array.isArray(value.activity)
    ? value.activity
    : isPersonal
      ? []
      : fallback.activity;
  const activity = byUniqueId(activitySource, (candidate) =>
    normalizeActivity(candidate, memberIds, fallbackNow),
  );
  const assetLabelRegistry = normalizeAssetLabelRegistry(
    value.assetLabelRegistry,
    householdId,
    assetIds,
    memberIds,
    fallbackNow,
  );
  const collector = reconcileCollectorState(value.collector, {
    householdId,
    collections,
    assets,
    evidence,
    now: fallbackNow,
  });

  return {
    version: SNAPSHOT_VERSION,
    mode,
    privacyNotice:
      "Demo metadata is stored locally in this browser. This prototype does not provide encryption, backup, or secure file storage.",
    meta: {
      id: text(value?.meta?.id, fallback.meta.id),
      revision: Math.max(
        0,
        Math.trunc(finiteNumber(value?.meta?.revision, 0)),
      ),
      createdAt: timestamp(value?.meta?.createdAt, fallback.meta.createdAt),
      updatedAt: fallbackNow,
      lastResetAt: timestamp(value?.meta?.lastResetAt, fallback.meta.lastResetAt),
    },
    household,
    regions,
    places,
    spaces,
    assets,
    locationAssignments,
    collections,
    collector,
    evidence,
    assetLabelRegistry,
    members,
    tasks,
    activity,
  };
}

function isUsableWorkspace(state) {
  return (
    isObject(state) &&
    state.version === SNAPSHOT_VERSION &&
    isObject(state.meta) &&
    isObject(state.household) &&
    Array.isArray(state.regions) &&
    Array.isArray(state.places) &&
    Array.isArray(state.spaces) &&
    Array.isArray(state.assets) &&
    Array.isArray(state.locationAssignments) &&
    Array.isArray(state.collections) &&
    isObject(state.collector) &&
    Array.isArray(state.evidence) &&
    isObject(state.assetLabelRegistry) &&
    Array.isArray(state.members) &&
    Array.isArray(state.tasks) &&
    Array.isArray(state.activity)
  );
}

function actionNow(action) {
  return timestamp(action.now, new Date().toISOString());
}

function bumped(state, changes, now) {
  const next = {
    ...state,
    ...changes,
    meta: {
      ...state.meta,
      revision: state.meta.revision + 1,
      updatedAt: now,
    },
    household: {
      ...state.household,
      updatedAt: now,
    },
  };
  return {
    ...next,
    collector: reconcileCollectorState(next.collector, {
      householdId: next.household.id,
      collections: next.collections,
      assets: next.assets,
      evidence: next.evidence,
      now,
    }),
  };
}

function equalRecordExcept(left, right, ignoredKeys = []) {
  const ignored = new Set(ignoredKeys);
  const keys = new Set([
    ...Object.keys(left ?? {}),
    ...Object.keys(right ?? {}),
  ]);
  return [...keys].every(
    (key) =>
      ignored.has(key) ||
      JSON.stringify(left?.[key]) === JSON.stringify(right?.[key]),
  );
}

function sanitizeChanges(changes) {
  if (!isObject(changes)) return {};
  const allowed = new Set([
    "name",
    "category",
    "categoryId",
    "categoryPath",
    "customCategory",
    "taxonomyVersion",
    "kind",
    "profile",
    "notes",
    "ownerMemberId",
    "custodianMemberId",
    "meaningFacets",
    "sentimentalValue",
    "legacyIntent",
    "intendedRecipientMemberId",
    "visibility",
    "coverImage",
    "acquiredAt",
    "reference",
    "value",
    "displayValue",
    "requiredProofTypes",
    "tags",
  ]);
  return Object.fromEntries(
    Object.entries(changes).filter(
      ([key, value]) => allowed.has(key) && value !== undefined,
    ),
  );
}

const ACTION_ALIASES = {
  resetDemo: "RESET_DEMO",
  addPlace: "ADD_PLACE",
  updatePlace: "UPDATE_PLACE",
  linkPropertyProjection: "LINK_PROPERTY_PROJECTION",
  unlinkPropertyProjection: "UNLINK_PROPERTY_PROJECTION",
  addSpace: "ADD_SPACE",
  updateSpace: "UPDATE_SPACE",
  addAsset: "ADD_ASSET",
  addEvidence: "ADD_EVIDENCE",
  verifyEvidence: "VERIFY_EVIDENCE",
  setEvidenceFileState: "SET_EVIDENCE_FILE_STATE",
  moveMaterialStorage: "MOVE_MATERIAL_STORAGE",
  recordRetrieval: "RECORD_RETRIEVAL",
  moveAsset: "MOVE_ASSET",
  updateAsset: "UPDATE_ASSET",
  archiveAsset: "ARCHIVE_ASSET",
  addCollection: "ADD_COLLECTION",
  updateCollection: "UPDATE_COLLECTION",
  addCollectionMember: "ADD_COLLECTION_MEMBER",
  removeCollectionMember: "REMOVE_COLLECTION_MEMBER",
  setCollectionCover: "SET_COLLECTION_COVER",
  setAssetLabelRegistry: "SET_ASSET_LABEL_REGISTRY",
  inviteMember: "INVITE_MEMBER",
};

function personalWorkspaceFrom(state, action, now) {
  const householdInput = isObject(action.household) ? action.household : {};
  const memberInput = isObject(action.member) ? action.member : {};
  const ownerName = text(memberInput.name, "Workspace owner");
  const ownerId = createId("member", memberInput.id);
  const householdId = createId("household", householdInput.id);
  return normalizeWorkspace({
    version: SNAPSHOT_VERSION,
    mode: "personal",
    meta: {
      id: createId("workspace", action.workspaceId),
      revision: 0,
      createdAt: now,
      updatedAt: now,
      lastResetAt: now,
    },
    household: {
      id: householdId,
      name: text(householdInput.name, "My household"),
      ownerMemberId: ownerId,
      locale: text(householdInput.locale, state.household.locale),
      currency: text(householdInput.currency, state.household.currency),
      demoOnly: true,
      createdAt: now,
      updatedAt: now,
    },
    regions: [],
    places: [],
    spaces: [],
    assets: [],
    locationAssignments: [],
    collections: [],
    evidence: [],
    members: [
      {
        id: ownerId,
        householdId,
        name: ownerName,
        email: nullableText(memberInput.email),
        initials: initialsFor(ownerName),
        accessRole: "owner",
        accessScope: "all",
        inviteStatus: "active",
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    tasks: [],
    activity: [],
  });
}

function reviseActiveLocationAssignments(
  current,
  {
    places = current.places,
    spaces = current.spaces,
    now,
    shouldRevise,
    reason,
    source,
    createdByMemberId,
  },
) {
  const activePlaces = places.filter((item) => item.status !== "archived");
  const placeIds = new Set(activePlaces.map((item) => item.id));
  const placeById = new Map(activePlaces.map((item) => [item.id, item]));
  const spaceById = new Map(spaces.map((item) => [item.id, item]));
  const assetIds = new Set(current.assets.map((item) => item.id));
  const memberIds = new Set(current.members.map((item) => item.id));
  const output = [];
  const revisions = [];
  for (const assignment of current.locationAssignments) {
    if (assignment.validTo || !shouldRevise(assignment, spaceById)) {
      output.push(assignment);
      continue;
    }
    output.push({ ...assignment, validTo: now });
    const revision = normalizeLocationAssignment(
      {
        ...assignment,
        id: createId("location-assignment"),
        placeSnapshot: null,
        spacePathSnapshot: null,
        source: source || assignment.source,
        observedAt: now,
        validFrom: now,
        validTo: null,
        createdByMemberId,
        reason,
        createdAt: now,
      },
      current.household.id,
      assetIds,
      placeIds,
      spaceById,
      memberIds,
      now,
      placeById,
    );
    if (revision) revisions.push(revision);
  }
  return [...output, ...revisions];
}

function actionActorMemberId(current, action) {
  const actorWasSupplied = Object.prototype.hasOwnProperty.call(
    action,
    "memberId",
  );
  const requestedMemberId = actorWasSupplied
    ? text(action.memberId)
    : current.household.ownerMemberId;
  return (
    current.members.find(
      (member) =>
        member.id === requestedMemberId &&
        member.inviteStatus === "active",
    )?.id || null
  );
}

/**
 * Reducer commands are intentionally local and synchronous. They model demo
 * behaviour only; a production client must send commands to an authenticated
 * service and reconcile server versions.
 */
export function workspaceReducer(state, action) {
  const current = isUsableWorkspace(state) ? state : normalizeWorkspace(state);
  if (!isObject(action) || !text(action.type)) return current;
  const now = actionNow(action);
  const actionType = ACTION_ALIASES[action.type] ?? action.type;

  switch (actionType) {
    case "REPLACE_WORKSPACE":
      return normalizeWorkspace(action.workspace);

    case "APPLY_COLLECTOR_COMMAND": {
      if (!isObject(action.command) || !text(action.command.type)) {
        return current;
      }
      const collector = applyCollectorCommand(
        current.collector,
        { ...action.command, now: action.command.now ?? now },
        {
          householdId: current.household.id,
          collections: current.collections,
          assets: current.assets,
          evidence: current.evidence,
          now,
        },
      );
      if (JSON.stringify(collector) === JSON.stringify(current.collector)) {
        return current;
      }
      return bumped(current, { collector }, now);
    }

    case "SET_MODE": {
      if (!WORKSPACE_MODES.has(action.mode) || action.mode === current.mode) {
        return current;
      }
      return bumped(current, { mode: action.mode }, now);
    }

    case "RECORD_RETRIEVAL": {
      const memberId = actionActorMemberId(current, action);
      const entityType = text(action.entityType);
      const entityId = text(action.entityId);
      const title = text(action.title);
      if (!memberId || !entityType || !entityId || !title) {
        return current;
      }
      if (
        current.activity.some(
          (entry) =>
            entry.type === "search-retrieval" &&
            entry.entityType === entityType &&
            entry.entityId === entityId,
        )
      ) {
        return current;
      }
      const record = normalizeActivity(
        {
          id: createId("activity", action.id),
          type: "search-retrieval",
          title,
          detail: "Opened from private workspace Search.",
          memberId,
          entityType,
          entityId,
          occurredAt: now,
        },
        new Set(current.members.map((member) => member.id)),
        now,
      );
      if (!record) return current;
      return bumped(
        current,
        {
          activity: [record, ...current.activity].slice(0, 100),
        },
        now,
      );
    }

    case "SET_ASSET_LABEL_REGISTRY": {
      const registry = normalizeAssetLabelRegistry(
        action.registry,
        current.household.id,
        new Set(current.assets.map((item) => item.id)),
        new Set(current.members.map((item) => item.id)),
        now,
      );
      if (
        JSON.stringify(registry) ===
        JSON.stringify(current.assetLabelRegistry)
      ) {
        return current;
      }
      return bumped(current, { assetLabelRegistry: registry }, now);
    }

    case "START_PERSONAL":
      return personalWorkspaceFrom(current, action, now);

    case "RESET_DEMO":
      return createSampleWorkspace();

    case "ADD_PLACE": {
      const input = isObject(action.place) ? action.place : {};
      const name = text(input.name);
      if (!name) return current;
      const createPropertyAsset = action.createPropertyAsset === true;
      const createdByMemberId = createPropertyAsset
        ? actionActorMemberId(current, action)
        : null;
      if (createPropertyAsset && !createdByMemberId) return current;
      const id = createId("place", input.id ?? action.id);
      if (current.places.some((item) => item.id === id)) return current;
      const coordinateInput = isObject(input.coordinates)
        ? input.coordinates
        : {
            lat: input.lat,
            lng: input.lng,
          };
      const requestedRegionId = text(
        input.regionId,
        slug(input.city || input.regionName || name),
      );
      let regions = current.regions;
      if (!regions.some((item) => item.id === requestedRegionId)) {
        const regionCoordinateInput = isObject(input.regionCoordinates)
          ? input.regionCoordinates
          : coordinateInput;
        const region = normalizeRegion({
          id: requestedRegionId,
          name: text(input.regionName, text(input.city, name)),
          lat: regionCoordinateInput.lat,
          lng: regionCoordinateInput.lng,
        });
        if (region) regions = [...regions, region];
      }
      const candidate = normalizePlace(
        {
          ...input,
          id,
          name,
          regionId: requestedRegionId,
          coordinates: coordinateInput,
          propertyAssetId: null,
          createdAt: input.createdAt ?? now,
          updatedAt: now,
        },
        current.household.id,
        now,
        new Set(regions.map((item) => item.id)),
      );
      if (!candidate) return current;
      if (createPropertyAsset) {
        if (!isOwnedPropertyTenure(candidate.tenure)) return current;
        const propertyInput = isObject(action.propertyAsset)
          ? action.propertyAsset
          : {};
        const propertyAssetId = createId(
          "asset",
          propertyInput.id ?? action.propertyAssetId,
        );
        if (
          current.assets.some((item) => item.id === propertyAssetId)
        ) {
          return current;
        }
        const defaultCategoryId =
          {
            home: "property.house",
            house: "property.house",
            villa: "property.house",
            apartment: "property.apartment",
            unit: "property.apartment",
            condo: "property.apartment",
            plot: "property.land",
            land: "property.land",
            farm: "property.farm",
            office: "property.commercial",
            commercial: "property.commercial",
            storage: "property.commercial",
            warehouse: "property.commercial",
          }[candidate.kind] || "property.other";
        const propertyCategory = getAssetCategory(
          propertyInput.categoryId || defaultCategoryId,
        );
        if (
          !propertyCategory ||
          !propertyCategory.id.startsWith("property.")
        ) {
          return current;
        }
        const propertyAsset = normalizeAsset(
          {
            ...propertyInput,
            id: propertyAssetId,
            name: text(
              propertyInput.name,
              `${candidate.name} property passport`,
            ),
            category: propertyCategory.label,
            categoryId: propertyCategory.id,
            kind: "real-estate",
            propertyPlaceId: null,
            placeId: candidate.id,
            spaceId: null,
            locationMode: "physical",
            locationStatus: "known",
            requiredProofTypes: Array.isArray(
              propertyInput.requiredProofTypes,
            )
              ? propertyInput.requiredProofTypes
              : propertyCategory.recommendedEvidenceTypes,
            ownerMemberId:
              propertyInput.ownerMemberId ?? createdByMemberId,
            custodianMemberId:
              propertyInput.custodianMemberId ?? createdByMemberId,
            createdAt: propertyInput.createdAt ?? now,
            updatedAt: now,
          },
          current.household.id,
          new Set([
            ...current.places
              .filter((item) => item.status !== "archived")
              .map((item) => item.id),
            candidate.id,
          ]),
          new Map([
            ...current.places
              .filter((item) => item.status !== "archived")
              .map((item) => [item.id, item]),
            [candidate.id, candidate],
          ]),
          new Map(current.spaces.map((item) => [item.id, item])),
          new Set(current.members.map((item) => item.id)),
          now,
        );
        if (!propertyAsset) return current;
        const linked = linkPropertyProjection(
          {
            ...current,
            places: [...current.places, candidate],
            assets: [...current.assets, propertyAsset],
          },
          {
            placeId: candidate.id,
            assetId: propertyAsset.id,
          },
        );
        if (!linked.ok) return current;
        const assignment = normalizeLocationAssignment(
          {
            id: createId(
              "location-assignment",
              propertyInput.locationAssignmentId,
            ),
            assetId: propertyAsset.id,
            mode: propertyAsset.locationMode,
            placeId: propertyAsset.placeId,
            spaceId: null,
            locatorText: propertyAsset.locationDetail,
            confirmationState: "user-confirmed",
            source: "user",
            observedAt: now,
            validFrom: now,
            createdByMemberId,
            reason: "Linked property passport created",
            createdAt: now,
          },
          current.household.id,
          new Set([
            ...current.assets.map((item) => item.id),
            propertyAsset.id,
          ]),
          new Set(
            linked.workspace.places
              .filter((item) => item.status !== "archived")
              .map((item) => item.id),
          ),
          new Map(current.spaces.map((item) => [item.id, item])),
          new Set(current.members.map((item) => item.id)),
          now,
          new Map(
            linked.workspace.places
              .filter((item) => item.status !== "archived")
              .map((item) => [item.id, item]),
          ),
        );
        return bumped(
          current,
          {
            regions,
            places: linked.workspace.places,
            assets: linked.workspace.assets,
            locationAssignments: assignment
              ? [...current.locationAssignments, assignment]
              : current.locationAssignments,
          },
          now,
        );
      }
      return bumped(
        current,
        { regions, places: [...current.places, candidate] },
        now,
      );
    }

    case "UPDATE_PLACE": {
      const placeId = text(action.placeId ?? action.id);
      const index = current.places.findIndex(
        (item) => item.id === placeId && item.status !== "archived",
      );
      if (index < 0) return current;
      const correctedByMemberId = actionActorMemberId(current, action);
      if (!correctedByMemberId) return current;
      const prior = current.places[index];
      const input = isObject(action.changes) ? action.changes : {};
      const name = text(input.name, prior.name);
      if (!name) return current;
      const coordinateInput = isObject(input.coordinates)
        ? input.coordinates
        : {
            lat: input.lat ?? prior.coordinates?.lat,
            lng: input.lng ?? prior.coordinates?.lng,
          };
      const requestedRegionId = text(input.regionId, prior.regionId);
      let regions = current.regions;
      if (!regions.some((item) => item.id === requestedRegionId)) {
        const regionCoordinateInput = isObject(input.regionCoordinates)
          ? input.regionCoordinates
          : coordinateInput;
        const region = normalizeRegion({
          id: requestedRegionId,
          name: text(input.regionName, text(input.city, name)),
          lat: regionCoordinateInput.lat,
          lng: regionCoordinateInput.lng,
        });
        if (!region) return current;
        regions = [...regions, region];
      }
      const candidate = normalizePlace(
        {
          ...prior,
          ...input,
          id: prior.id,
          name,
          regionId: requestedRegionId,
          coordinates: coordinateInput,
          propertyAssetId: prior.propertyAssetId,
          createdAt: prior.createdAt,
          updatedAt: now,
        },
        current.household.id,
        now,
        new Set(regions.map((item) => item.id)),
      );
      if (!candidate) return current;
      const unchanged =
        JSON.stringify(candidate) === JSON.stringify(prior) &&
        regions === current.regions;
      if (unchanged) return current;
      const changedPlaces = current.places.map((item, itemIndex) =>
        itemIndex === index ? candidate : item,
      );
      const reconciled = reconcilePropertyLinks({
        places: changedPlaces,
        assets: current.assets,
      });
      const places = reconciled.places;
      const assets = reconciled.assets;
      const placeSnapshotChanged =
        JSON.stringify(normalizePlaceSnapshot(candidate)) !==
        JSON.stringify(normalizePlaceSnapshot(prior));
      const locationAssignments = placeSnapshotChanged
        ? reviseActiveLocationAssignments(current, {
            places,
            now,
            shouldRevise: (assignment) =>
              assignment.placeId === placeId,
            reason: "Place pin or address corrected",
            source: candidate.locationSource,
            createdByMemberId: correctedByMemberId,
          })
        : current.locationAssignments;
      return bumped(
        current,
        { regions, places, assets, locationAssignments },
        now,
      );
    }

    case "CREATE_PROPERTY_PROJECTION": {
      const memberId = actionActorMemberId(current, action);
      if (!memberId) return current;
      const placeId = text(action.placeId);
      const place = current.places.find(
        (item) =>
          item.id === placeId &&
          item.status !== "archived",
      );
      if (
        !place ||
        !isOwnedPropertyTenure(place.tenure) ||
        place.propertyAssetId
      ) {
        return current;
      }
      const propertyInput = isObject(action.propertyAsset)
        ? action.propertyAsset
        : {};
      const propertyAssetId = createId(
        "asset",
        propertyInput.id ?? action.propertyAssetId,
      );
      if (
        current.assets.some((item) => item.id === propertyAssetId)
      ) {
        return current;
      }
      const defaultCategoryId =
        {
          home: "property.house",
          house: "property.house",
          villa: "property.house",
          apartment: "property.apartment",
          unit: "property.apartment",
          condo: "property.apartment",
          plot: "property.land",
          land: "property.land",
          farm: "property.farm",
          office: "property.commercial",
          commercial: "property.commercial",
          storage: "property.commercial",
          warehouse: "property.commercial",
        }[place.kind] || "property.other";
      const propertyCategory = getAssetCategory(
        propertyInput.categoryId || defaultCategoryId,
      );
      if (
        !propertyCategory ||
        !propertyCategory.id.startsWith("property.")
      ) {
        return current;
      }
      const activePlaces = current.places.filter(
        (item) => item.status !== "archived",
      );
      const propertyAsset = normalizeAsset(
        {
          ...propertyInput,
          id: propertyAssetId,
          name: text(
            propertyInput.name,
            `${place.name} property passport`,
          ),
          category: propertyCategory.label,
          categoryId: propertyCategory.id,
          kind: "real-estate",
          propertyPlaceId: null,
          placeId: place.id,
          spaceId: null,
          locationMode: "physical",
          locationStatus: "known",
          requiredProofTypes: Array.isArray(
            propertyInput.requiredProofTypes,
          )
            ? propertyInput.requiredProofTypes
            : propertyCategory.recommendedEvidenceTypes,
          ownerMemberId:
            propertyInput.ownerMemberId ?? memberId,
          custodianMemberId:
            propertyInput.custodianMemberId ?? memberId,
          createdAt: propertyInput.createdAt ?? now,
          updatedAt: now,
        },
        current.household.id,
        new Set(activePlaces.map((item) => item.id)),
        new Map(activePlaces.map((item) => [item.id, item])),
        new Map(current.spaces.map((item) => [item.id, item])),
        new Set(current.members.map((item) => item.id)),
        now,
      );
      if (!propertyAsset) return current;
      const linked = linkPropertyProjection(
        {
          ...current,
          places: current.places.map((item) =>
            item.id === place.id
              ? { ...item, updatedAt: now }
              : item,
          ),
          assets: [...current.assets, propertyAsset],
        },
        {
          placeId: place.id,
          assetId: propertyAsset.id,
        },
      );
      if (!linked.ok) return current;
      const assignment = normalizeLocationAssignment(
        {
          id: createId(
            "location-assignment",
            propertyInput.locationAssignmentId ??
              action.locationAssignmentId,
          ),
          assetId: propertyAsset.id,
          mode: propertyAsset.locationMode,
          placeId: propertyAsset.placeId,
          spaceId: null,
          locatorText: propertyAsset.locationDetail,
          confirmationState:
            propertyAsset.locationStatus === "known"
              ? "user-confirmed"
              : "suggested",
          source: place.locationSource || "user",
          observedAt: now,
          validFrom: now,
          validTo: null,
          createdByMemberId: memberId,
          reason: "Property passport created from an existing Place",
          createdAt: now,
        },
        current.household.id,
        new Set([
          ...current.assets.map((item) => item.id),
          propertyAsset.id,
        ]),
        new Set(activePlaces.map((item) => item.id)),
        new Map(current.spaces.map((item) => [item.id, item])),
        new Set(current.members.map((item) => item.id)),
        now,
        new Map(activePlaces.map((item) => [item.id, item])),
      );
      return bumped(
        current,
        {
          places: linked.workspace.places,
          assets: linked.workspace.assets,
          locationAssignments: assignment
            ? [...current.locationAssignments, assignment]
            : current.locationAssignments,
        },
        now,
      );
    }

    case "LINK_PROPERTY_PROJECTION": {
      const memberId = actionActorMemberId(current, action);
      if (!memberId) return current;
      const placeId = text(action.placeId);
      const assetId = text(action.assetId);
      const linked = linkPropertyProjection(current, {
        placeId,
        assetId,
      });
      if (!linked.ok) return current;
      return bumped(
        current,
        {
          places: linked.workspace.places.map((place) =>
            place.id === placeId ? { ...place, updatedAt: now } : place,
          ),
          assets: linked.workspace.assets.map((asset) =>
            asset.id === assetId ? { ...asset, updatedAt: now } : asset,
          ),
        },
        now,
      );
    }

    case "UNLINK_PROPERTY_PROJECTION": {
      const memberId = actionActorMemberId(current, action);
      if (!memberId) return current;
      const placeId = text(action.placeId);
      const assetId = text(action.assetId);
      const unlinked = unlinkPropertyProjection(current, {
        placeId,
        assetId,
      });
      if (!unlinked.ok) return current;
      return bumped(
        current,
        {
          places: unlinked.workspace.places.map((place) =>
            place.id === placeId ? { ...place, updatedAt: now } : place,
          ),
          assets: unlinked.workspace.assets.map((asset) =>
            asset.id === assetId ? { ...asset, updatedAt: now } : asset,
          ),
        },
        now,
      );
    }

    case "ADD_SPACE": {
      const input = isObject(action.space) ? action.space : {};
      const name = text(input.name);
      const placeId = text(input.placeId);
      if (
        !name ||
        !current.places.some(
          (item) =>
            item.id === placeId &&
            item.status !== "archived",
        )
      ) {
        return current;
      }
      const id = createId("space", input.id ?? action.id);
      if (current.spaces.some((item) => item.id === id)) return current;
      let parentSpaceId = nullableText(input.parentSpaceId);
      if (
        parentSpaceId &&
        !current.spaces.some(
          (item) => item.id === parentSpaceId && item.placeId === placeId,
        )
      ) {
        parentSpaceId = null;
      }
      const candidate = normalizeSpace(
        {
          ...input,
          id,
          name,
          placeId,
          parentSpaceId,
          createdAt: input.createdAt ?? now,
          updatedAt: now,
        },
        new Set(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => item.id),
        ),
        now,
      );
      if (!candidate) return current;
      return bumped(current, { spaces: [...current.spaces, candidate] }, now);
    }

    case "UPDATE_SPACE": {
      const spaceId = text(action.spaceId ?? action.id);
      const index = current.spaces.findIndex((item) => item.id === spaceId);
      if (index < 0) return current;
      const correctedByMemberId = actionActorMemberId(current, action);
      if (!correctedByMemberId) return current;
      const prior = current.spaces[index];
      if (
        !current.places.some(
          (place) =>
            place.id === prior.placeId && place.status !== "archived",
        )
      ) {
        return current;
      }
      const input = isObject(action.changes)
        ? action.changes
        : isObject(action.space)
          ? action.space
          : {};
      const name = text(input.name, prior.name);
      if (!name) return current;
      let parentSpaceId =
        input.parentSpaceId === undefined
          ? prior.parentSpaceId
          : nullableText(input.parentSpaceId);
      if (parentSpaceId === prior.id) return current;
      if (parentSpaceId) {
        const parent = current.spaces.find(
          (item) =>
            item.id === parentSpaceId &&
            item.placeId === prior.placeId,
        );
        if (!parent) return current;
        const parentById = new Map(
          current.spaces.map((item) => [item.id, item]),
        );
        let cursor = parent;
        const visited = new Set();
        while (cursor && !visited.has(cursor.id)) {
          if (cursor.id === prior.id) return current;
          visited.add(cursor.id);
          cursor = cursor.parentSpaceId
            ? parentById.get(cursor.parentSpaceId)
            : null;
        }
      }
      const candidate = normalizeSpace(
        {
          ...prior,
          ...input,
          id: prior.id,
          placeId: prior.placeId,
          parentSpaceId,
          name,
          createdAt: prior.createdAt,
          updatedAt: now,
        },
        new Set(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => item.id),
        ),
        now,
      );
      if (!candidate || JSON.stringify(candidate) === JSON.stringify(prior)) {
        return current;
      }
      const spaces = current.spaces.map((item, itemIndex) =>
        itemIndex === index ? candidate : item,
      );
      const locationAssignments = reviseActiveLocationAssignments(current, {
        spaces,
        now,
        shouldRevise: (assignment, nextSpaceById) =>
          Boolean(assignment.spaceId) &&
          JSON.stringify(assignment.spacePathSnapshot || []) !==
            JSON.stringify(
              normalizeSpacePathSnapshot(
                null,
                assignment.spaceId,
                nextSpaceById,
              ),
            ),
        reason: "Room or container path corrected",
        source: "user",
        createdByMemberId: correctedByMemberId,
      });
      return bumped(current, { spaces, locationAssignments }, now);
    }

    case "ADD_ASSET": {
      const createdByMemberId = actionActorMemberId(current, action);
      if (!createdByMemberId) return current;
      const input = isObject(action.asset) ? action.asset : {};
      const name = text(input.name);
      if (!name) return current;
      const id = createId("asset", input.id ?? action.id);
      if (current.assets.some((item) => item.id === id)) return current;
      const category = text(input.category, "Other");
      const taxonomyCategory = getAssetCategory(
        input.categoryId || category,
      );
      const candidate = normalizeAsset(
        {
          ...input,
          id,
          name,
          category,
          requiredProofTypes: Array.isArray(input.requiredProofTypes)
            ? input.requiredProofTypes
            : taxonomyCategory?.recommendedEvidenceTypes ||
              defaultEvidenceRequirements(category),
          ownerMemberId: input.ownerMemberId ?? current.household.ownerMemberId,
          custodianMemberId:
            input.custodianMemberId ?? current.household.ownerMemberId,
          propertyPlaceId: null,
          createdAt: input.createdAt ?? now,
          updatedAt: now,
        },
        current.household.id,
        new Set(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => item.id),
        ),
        new Map(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => [item.id, item]),
        ),
        new Map(
          current.spaces
            .filter((item) =>
              current.places.some(
                (place) =>
                  place.id === item.placeId &&
                  place.status !== "archived",
              ),
            )
            .map((item) => [item.id, item]),
        ),
        new Set(current.members.map((item) => item.id)),
        now,
      );
      if (!candidate) return current;
      const assignment = normalizeLocationAssignment(
        {
          id: createId("location-assignment", input.locationAssignmentId),
          assetId: candidate.id,
          mode: candidate.locationMode,
          placeId: candidate.placeId,
          spaceId: candidate.spaceId,
          locatorText: candidate.locationDetail,
          confirmationState:
            candidate.locationStatus === "known"
              ? "user-confirmed"
              : "suggested",
          source: LOCATION_SOURCES.has(input.locationSource)
            ? input.locationSource
            : "imported",
          observedAt: now,
          validFrom: now,
          createdByMemberId,
          reason: "Asset created",
          createdAt: now,
        },
        current.household.id,
        new Set([...current.assets.map((item) => item.id), candidate.id]),
        new Set(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => item.id),
        ),
        new Map(current.spaces.map((item) => [item.id, item])),
        new Set(current.members.map((item) => item.id)),
        now,
        new Map(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => [item.id, item]),
        ),
      );
      return bumped(
        current,
        {
          assets: [...current.assets, candidate],
          locationAssignments: assignment
            ? [...current.locationAssignments, assignment]
            : current.locationAssignments,
        },
        now,
      );
    }

    case "ADD_EVIDENCE": {
      const addedByMemberId = actionActorMemberId(current, action);
      if (!addedByMemberId) return current;
      const input = isObject(action.evidence) ? action.evidence : {};
      const assetId = text(input.assetId ?? action.assetId);
      const type = text(input.type ?? action.evidenceType);
      const parentAsset = current.assets.find((item) => item.id === assetId);
      if (
        !type ||
        !parentAsset ||
        parentAsset.lifecycleStatus === "archived"
      ) {
        return current;
      }
      const id = createId("evidence", input.id ?? action.id);
      if (current.evidence.some((item) => item.id === id)) return current;
      const candidate = normalizeEvidence(
        {
          ...input,
          id,
          assetId,
          type,
          status: "pending",
          addedAt: input.addedAt ?? now,
          verifiedAt: null,
          verifiedByMemberId: null,
          source:
            input.fileState === "ready_local" ? "local-file" : "demo-metadata",
          placementContext: createEvidencePlacementContext(
            current,
            assetId,
            now,
          ),
          materialStorage: {
            ...(isObject(input.materialStorage)
              ? input.materialStorage
              : {}),
            history: [],
            movedAt: now,
            movedByMemberId: addedByMemberId,
            reason: "Original material added",
          },
        },
        current.household.id,
        new Set(current.assets.map((item) => item.id)),
        new Set(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => item.id),
        ),
        new Map(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => [item.id, item]),
        ),
        new Map(
          current.spaces.filter((space) =>
            current.places.some(
              (place) =>
                place.id === space.placeId &&
                place.status !== "archived",
            ),
          ).map((item) => [item.id, item]),
        ),
        new Set(current.members.map((item) => item.id)),
        now,
      );
      if (!candidate) return current;
      return bumped(
        current,
        { evidence: [...current.evidence, candidate] },
        now,
      );
    }

    case "SET_EVIDENCE_FILE_STATE": {
      const evidenceId = text(action.evidenceId);
      const index = current.evidence.findIndex((item) => item.id === evidenceId);
      if (index < 0) return current;
      const prior = current.evidence[index];
      const fileState = FILE_STATES.has(action.fileState)
        ? action.fileState
        : prior.fileState;
      const nextFileIdentity = {
        fileName:
          action.fileName === undefined ? prior.fileName : action.fileName,
        fileType:
          action.fileType === undefined ? prior.fileType : action.fileType,
        fileSize:
          action.fileSize === undefined ? prior.fileSize : action.fileSize,
        fileChecksum:
          action.fileChecksum === undefined
            ? prior.fileChecksum
            : action.fileChecksum,
        originalVersionId:
          action.originalVersionId === undefined
            ? prior.originalVersionId
            : action.originalVersionId,
      };
      const fileIdentityChanged = [
        "fileName",
        "fileType",
        "fileSize",
        "fileChecksum",
        "originalVersionId",
      ].some(
        (key) =>
          JSON.stringify(nextFileIdentity[key]) !==
          JSON.stringify(prior[key]),
      );
      const revokesReview =
        prior.status === "verified" &&
        (fileIdentityChanged ||
          ["missing_original", "failed", "quarantined"].includes(fileState));
      const candidate = normalizeEvidence(
        {
          ...prior,
          fileState,
          status: revokesReview ? "pending" : prior.status,
          verifiedAt: revokesReview ? null : prior.verifiedAt,
          verifiedByMemberId: revokesReview
            ? null
            : prior.verifiedByMemberId,
          ...nextFileIdentity,
          storageScope:
            action.storageScope === undefined
              ? prior.storageScope
              : action.storageScope,
          source:
            fileState === "ready_local"
              ? "local-file"
              : prior.source,
        },
        current.household.id,
        new Set(current.assets.map((item) => item.id)),
        new Set(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => item.id),
        ),
        new Map(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => [item.id, item]),
        ),
        new Map(
          current.spaces
            .filter((space) =>
              current.places.some(
                (place) =>
                  place.id === space.placeId &&
                  place.status !== "archived",
              ),
            )
            .map((item) => [item.id, item]),
        ),
        new Set(current.members.map((item) => item.id)),
        now,
      );
      if (!candidate) return current;
      if (
        equalRecordExcept(candidate, current.evidence[index], ["updatedAt"])
      ) {
        return current;
      }
      const evidence = current.evidence.map((item, itemIndex) =>
        itemIndex === index ? candidate : item,
      );
      const hasAnotherReviewedMatch = evidence.some(
        (item) =>
          item.id !== evidenceId &&
          item.assetId === candidate.assetId &&
          item.type === candidate.type &&
          item.status === "verified" &&
          isReviewableEvidence(item),
      );
      const tasks =
        revokesReview && !hasAnotherReviewedMatch
          ? current.tasks.map((task) =>
              task.assetId === candidate.assetId &&
              task.requiredEvidenceType === candidate.type &&
              task.status === "completed"
                ? {
                    ...task,
                    status: "open",
                    completedAt: null,
                    updatedAt: now,
                  }
                : task,
            )
          : current.tasks;
      return bumped(current, { evidence, tasks }, now);
    }

    case "MOVE_MATERIAL_STORAGE": {
      const evidenceId = text(action.evidenceId);
      const index = current.evidence.findIndex(
        (item) => item.id === evidenceId,
      );
      if (index < 0) return current;
      const prior = current.evidence[index];
      const parentAsset = current.assets.find(
        (item) => item.id === prior.assetId,
      );
      if (!parentAsset || parentAsset.lifecycleStatus === "archived") {
        return current;
      }
      const movedByMemberId = actionActorMemberId(current, action);
      if (!movedByMemberId) return current;
      const activePlaces = current.places.filter(
        (item) => item.status !== "archived",
      );
      const placeIds = new Set(activePlaces.map((item) => item.id));
      const placeById = new Map(
        activePlaces.map((item) => [item.id, item]),
      );
      const spaceById = new Map(
        current.spaces
          .filter((space) => placeIds.has(space.placeId))
          .map((item) => [item.id, item]),
      );
      const memberIds = new Set(current.members.map((item) => item.id));
      const nextEvent = normalizeMaterialStorageEvent(
        {
          id: action.assignmentId,
          status: action.status,
          placeId: action.placeId,
          spaceId: action.spaceId,
          locatorText: action.locatorText,
          custodianMemberId: action.custodianMemberId,
          externalLabel: action.externalLabel,
          movedAt: now,
          movedByMemberId,
          reason: action.reason,
        },
        {
          evidenceId,
          kind: prior.kind,
          placeIds,
          placeById,
          spaceById,
          memberIds,
          fallbackNow: now,
          fallbackReason: "Original material storage corrected",
        },
      );
      if (!nextEvent) return current;
      const currentStorage = prior.materialStorage;
      const comparableKeys = [
        "status",
        "placeId",
        "spaceId",
        "locatorText",
        "custodianMemberId",
        "externalLabel",
      ];
      if (
        comparableKeys.every(
          (key) =>
            JSON.stringify(nextEvent[key]) ===
            JSON.stringify(currentStorage?.[key] ?? null),
        )
      ) {
        return current;
      }
      const candidate = normalizeEvidence(
        {
          ...prior,
          physicalLocation: nextEvent.locatorText,
          materialStorage: {
            ...currentStorage,
            history: [
              ...(Array.isArray(currentStorage?.history)
                ? currentStorage.history
                : []),
              nextEvent,
            ],
          },
        },
        current.household.id,
        new Set(current.assets.map((item) => item.id)),
        placeIds,
        placeById,
        spaceById,
        memberIds,
        now,
      );
      if (!candidate) return current;
      return bumped(
        current,
        {
          evidence: current.evidence.map((item, itemIndex) =>
            itemIndex === index ? candidate : item,
          ),
        },
        now,
      );
    }

    case "VERIFY_EVIDENCE": {
      const evidenceId = text(action.evidenceId);
      const index = current.evidence.findIndex((item) => item.id === evidenceId);
      if (index < 0 || current.evidence[index].status === "verified") {
        return current;
      }
      const record = current.evidence[index];
      const parentAsset = current.assets.find(
        (item) => item.id === record.assetId,
      );
      if (!parentAsset || parentAsset.lifecycleStatus === "archived") {
        return current;
      }
      if (
        !isReviewableEvidence(record) ||
        (record.fileName &&
          (action.integrityVerified !== true ||
            text(action.integrityChecksum).toLowerCase() !==
              text(record.fileChecksum).toLowerCase()))
      ) {
        return current;
      }
      const verifiedByMemberId = actionActorMemberId(current, action);
      if (!verifiedByMemberId) return current;
      const evidence = current.evidence.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              status: "verified",
              verifiedAt: now,
              verifiedByMemberId,
            }
          : item,
      );
      const tasks = current.tasks.map((task) =>
        task.status === "open" &&
        task.assetId === record.assetId &&
        task.requiredEvidenceType === record.type
          ? {
              ...task,
              status: "completed",
              completedAt: now,
              updatedAt: now,
            }
          : task,
      );
      return bumped(current, { evidence, tasks }, now);
    }

    case "MOVE_ASSET": {
      const assetId = text(action.assetId);
      const index = current.assets.findIndex((item) => item.id === assetId);
      if (
        index < 0 ||
        current.assets[index].lifecycleStatus === "archived"
      ) {
        return current;
      }
      const movedByMemberId = actionActorMemberId(current, action);
      if (!movedByMemberId) return current;
      let placeId = nullableText(action.placeId);
      if (
        placeId &&
        !current.places.some(
          (item) =>
            item.id === placeId &&
            item.status !== "archived",
        )
      ) {
        return current;
      }
      let spaceId = nullableText(action.spaceId);
      if (spaceId) {
        const space = current.spaces.find((item) => item.id === spaceId);
        if (!space || (placeId && space.placeId !== placeId)) return current;
        placeId = space.placeId;
      }
      const locationDetail = nullableText(action.locationDetail);
      const requestedStatus = LOCATION_STATUSES.has(action.locationStatus)
        ? action.locationStatus
        : null;
      const requestedMode = LOCATION_MODES.has(action.locationMode)
        ? action.locationMode
        : null;
      const prior = current.assets[index];
      const { locationMode, locationStatus } =
        normalizeAssetLocationTruth({
          kind: prior.kind,
          profile: prior.profile,
          placeId,
          spaceId,
          locationDetail,
          requestedMode,
          requestedStatus:
            requestedStatus ??
            (placeId
              ? spaceId || locationDetail
                ? "known"
                : "needs-detail"
              : "unknown"),
          placeById: new Map(
            current.places
              .filter((item) => item.status !== "archived")
              .map((item) => [item.id, item]),
          ),
        });
      if (
        prior.placeId === placeId &&
        prior.spaceId === spaceId &&
        prior.locationDetail === locationDetail &&
        prior.locationStatus === locationStatus &&
        prior.locationMode === locationMode
      ) {
        return current;
      }
      const assets = current.assets.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              placeId,
              spaceId,
              locationDetail,
              locationStatus,
              locationMode,
              updatedAt: now,
            }
          : item,
      );
      const closedAssignments = current.locationAssignments.map((item) =>
        item.assetId === assetId && !item.validTo
          ? { ...item, validTo: now }
          : item,
      );
      const nextAssignment = normalizeLocationAssignment(
        {
          id: createId("location-assignment", action.assignmentId),
          assetId,
          mode: locationMode,
          placeId,
          spaceId,
          locatorText: locationDetail,
          confirmationState: LOCATION_CONFIRMATION_STATES.has(
            action.confirmationState,
          )
            ? action.confirmationState
            : locationStatus === "known"
              ? "user-confirmed"
              : "suggested",
          source: LOCATION_SOURCES.has(action.source)
            ? action.source
            : "user_pin",
          observedAt: action.observedAt ?? now,
          validFrom: now,
          validTo: null,
          createdByMemberId: movedByMemberId,
          reason: action.reason ?? "Location updated",
          createdAt: now,
        },
        current.household.id,
        new Set(current.assets.map((item) => item.id)),
        new Set(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => item.id),
        ),
        new Map(current.spaces.map((item) => [item.id, item])),
        new Set(current.members.map((item) => item.id)),
        now,
        new Map(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => [item.id, item]),
        ),
      );
      return bumped(
        current,
        {
          assets,
          locationAssignments: nextAssignment
            ? [...closedAssignments, nextAssignment]
            : closedAssignments,
        },
        now,
      );
    }

    case "UPDATE_ASSET": {
      const assetId = text(action.assetId);
      const index = current.assets.findIndex((item) => item.id === assetId);
      if (
        index < 0 ||
        current.assets[index].lifecycleStatus === "archived"
      ) {
        return current;
      }
      const changes = sanitizeChanges(action.changes);
      if (!Object.keys(changes).length) return current;
      const candidate = normalizeAsset(
        {
          ...current.assets[index],
          ...changes,
          id: assetId,
          placeId: current.assets[index].placeId,
          spaceId: current.assets[index].spaceId,
          updatedAt: now,
        },
        current.household.id,
        new Set(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => item.id),
        ),
        new Map(
          current.places
            .filter((item) => item.status !== "archived")
            .map((item) => [item.id, item]),
        ),
        new Map(
          current.spaces
            .filter((item) =>
              current.places.some(
                (place) =>
                  place.id === item.placeId &&
                  place.status !== "archived",
              ),
            )
            .map((item) => [item.id, item]),
        ),
        new Set(current.members.map((item) => item.id)),
        now,
      );
      if (!candidate) return current;
      if (
        equalRecordExcept(candidate, current.assets[index], ["updatedAt"])
      ) {
        return current;
      }
      const changedAssets = current.assets.map((item, itemIndex) =>
        itemIndex === index ? candidate : item,
      );
      const reconciledProperties = reconcilePropertyLinks({
        places: current.places,
        assets: changedAssets,
      });
      return bumped(
        current,
        {
          places: reconciledProperties.places,
          assets: reconciledProperties.assets,
        },
        now,
      );
    }

    case "ARCHIVE_ASSET": {
      const assetId = text(action.assetId);
      const index = current.assets.findIndex((item) => item.id === assetId);
      if (index < 0 || current.assets[index].lifecycleStatus === "archived") {
        return current;
      }
      const archivedAssets = current.assets.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              lifecycleStatus: "archived",
              archivedAt: now,
              updatedAt: now,
            }
          : item,
      );
      const reconciledProperties = reconcilePropertyLinks({
        places: current.places,
        assets: archivedAssets,
      });
      const places = reconciledProperties.places;
      const assets = reconciledProperties.assets;
      const tasks = current.tasks.map((task) =>
        task.assetId === assetId && task.status === "open"
          ? {
              ...task,
              status: "dismissed",
              completedAt: now,
              updatedAt: now,
            }
          : task,
      );
      const locationAssignments = current.locationAssignments.map((item) =>
        item.assetId === assetId && !item.validTo
          ? { ...item, validTo: now }
          : item,
      );
      const collections = current.collections.map((collection) => {
        if (collection.coverAssetId !== assetId) return collection;
        const fallbackCover =
          collection.assetIds.find((candidateId) => {
            if (candidateId === assetId) return false;
            const candidate = assets.find(
              (item) =>
                item.id === candidateId &&
                item.lifecycleStatus !== "archived",
            );
            return (
              candidate &&
              candidate.kind !== "financial" &&
              !String(candidate.categoryId || "").startsWith("financial.")
            );
          }) ?? null;
        return {
          ...collection,
          coverAssetId: fallbackCover,
          updatedAt: now,
        };
      });
      return bumped(
        current,
        { places, assets, tasks, locationAssignments, collections },
        now,
      );
    }

    case "ADD_COLLECTION": {
      const input = isObject(action.collection) ? action.collection : {};
      const name = text(input.name);
      if (!name) return current;
      const id = createId("collection", input.id ?? action.id);
      if (current.collections.some((item) => item.id === id)) return current;
      const candidate = normalizeCollection(
        {
          ...input,
          id,
          name,
          createdAt: input.createdAt ?? now,
          updatedAt: now,
        },
        current.household.id,
        new Set(
          current.assets
            .filter((item) => item.lifecycleStatus !== "archived")
            .map((item) => item.id),
        ),
        now,
      );
      if (!candidate) return current;
      return bumped(
        current,
        { collections: [...current.collections, candidate] },
        now,
      );
    }

    case "UPDATE_COLLECTION": {
      const collectionId = text(action.collectionId);
      const index = current.collections.findIndex(
        (item) => item.id === collectionId && item.status !== "archived",
      );
      if (index < 0 || !isObject(action.changes)) return current;
      const allowed = new Set([
        "name",
        "description",
        "kind",
        "visibility",
        "curatorNote",
        "story",
        "tags",
        "featuredAssetIds",
      ]);
      const changes = Object.fromEntries(
        Object.entries(action.changes).filter(
          ([key, value]) => allowed.has(key) && value !== undefined,
        ),
      );
      if (!Object.keys(changes).length) return current;
      const candidate = normalizeCollection(
        {
          ...current.collections[index],
          ...changes,
          id: collectionId,
          updatedAt: now,
        },
        current.household.id,
        new Set(
          current.assets
            .filter((item) => item.lifecycleStatus !== "archived")
            .map((item) => item.id),
        ),
        now,
      );
      if (!candidate) return current;
      if (
        equalRecordExcept(candidate, current.collections[index], ["updatedAt"])
      ) {
        return current;
      }
      const collections = current.collections.map((item, itemIndex) =>
        itemIndex === index ? candidate : item,
      );
      return bumped(current, { collections }, now);
    }

    case "ADD_COLLECTION_MEMBER": {
      const collectionId = text(action.collectionId);
      const assetId = text(action.assetId);
      const collection = current.collections.find(
        (item) => item.id === collectionId && item.status !== "archived",
      );
      const asset = current.assets.find(
        (item) => item.id === assetId && item.lifecycleStatus !== "archived",
      );
      if (!collection || !asset || collection.assetIds.includes(assetId)) {
        return current;
      }
      const financial =
        asset.kind === "financial" ||
        String(asset.categoryId || "").startsWith("financial.");
      const collections = current.collections.map((item) =>
        item.id === collectionId
          ? {
              ...item,
              assetIds: [...item.assetIds, assetId],
              coverAssetId:
                item.coverAssetId || financial
                  ? item.coverAssetId
                  : assetId,
              updatedAt: now,
            }
          : item,
      );
      return bumped(current, { collections }, now);
    }

    case "REMOVE_COLLECTION_MEMBER": {
      const collectionId = text(action.collectionId);
      const assetId = text(action.assetId);
      const collection = current.collections.find(
        (item) => item.id === collectionId && item.status !== "archived",
      );
      if (!collection || !collection.assetIds.includes(assetId)) return current;
      const nextAssetIds = collection.assetIds.filter((id) => id !== assetId);
      const nextCoverAssetId =
        collection.coverAssetId === assetId
          ? nextAssetIds.find((id) => {
              const asset = current.assets.find((item) => item.id === id);
              return (
                asset &&
                asset.kind !== "financial" &&
                !String(asset.categoryId || "").startsWith("financial.")
              );
            }) ?? null
          : collection.coverAssetId;
      const collections = current.collections.map((item) =>
        item.id === collectionId
          ? {
              ...item,
              assetIds: nextAssetIds,
              featuredAssetIds: item.featuredAssetIds.filter(
                (id) => id !== assetId,
              ),
              coverAssetId: nextCoverAssetId,
              updatedAt: now,
            }
          : item,
      );
      return bumped(current, { collections }, now);
    }

    case "SET_COLLECTION_COVER": {
      const collectionId = text(action.collectionId);
      const assetId = nullableText(action.assetId);
      const collection = current.collections.find(
        (item) => item.id === collectionId && item.status !== "archived",
      );
      if (!collection) return current;
      if (assetId) {
        const asset = current.assets.find((item) => item.id === assetId);
        const financial =
          asset?.kind === "financial" ||
          String(asset?.categoryId || "").startsWith("financial.");
        if (!asset || !collection.assetIds.includes(assetId) || financial) {
          return current;
        }
      }
      if (collection.coverAssetId === assetId) return current;
      const collections = current.collections.map((item) =>
        item.id === collectionId
          ? { ...item, coverAssetId: assetId, updatedAt: now }
          : item,
      );
      return bumped(current, { collections }, now);
    }

    case "INVITE_MEMBER": {
      const input = isObject(action.member) ? action.member : {};
      const email = nullableText(input.email);
      const name = text(input.name, email?.split("@")[0] ?? "");
      if (!name) return current;
      if (
        email &&
        current.members.some(
          (item) => item.email?.toLowerCase() === email.toLowerCase(),
        )
      ) {
        return current;
      }
      const id = createId("member", input.id ?? action.id);
      if (current.members.some((item) => item.id === id)) return current;
      const member = normalizeMember(
        {
          ...input,
          id,
          name,
          email,
          accessRole: MEMBER_ROLES.has(input.accessRole)
            ? input.accessRole
            : "viewer",
          inviteStatus: "invited",
          joinedAt: null,
          createdAt: input.createdAt ?? now,
          updatedAt: now,
        },
        current.household.id,
        now,
      );
      if (!member) return current;
      return bumped(current, { members: [...current.members, member] }, now);
    }

    default:
      return current;
  }
}

export function selectEvidenceRequirementSatisfaction(assetOrId, state) {
  const asset =
    typeof assetOrId === "string"
      ? state.assets.find((item) => item.id === assetOrId)
      : assetOrId;
  if (!asset) {
    return {
      requirements: [],
      satisfiedCount: 0,
      total: 0,
      percentage: 0,
      complete: false,
    };
  }
  const requirements = asset.requiredProofTypes.map((type) => {
    const matches = state.evidence.filter(
      (item) =>
        item.assetId === asset.id &&
        item.type.toLowerCase() === type.toLowerCase(),
    );
    const verified = matches.filter(
      (item) =>
        item.status === "verified" && isReviewableEvidence(item),
    );
    return {
      type,
      satisfied: verified.length > 0,
      evidenceIds: verified.map((item) => item.id),
      pendingEvidenceIds: matches
        .filter((item) => item.status === "pending")
        .map((item) => item.id),
    };
  });
  const satisfiedCount = requirements.filter((item) => item.satisfied).length;
  const total = requirements.length;
  return {
    requirements,
    satisfiedCount,
    total,
    percentage: total ? Math.round((satisfiedCount / total) * 100) : 100,
    complete: total === 0 || satisfiedCount === total,
  };
}

/**
 * A transparent checklist, not an appraisal, legal opinion, or AI confidence
 * score. The returned `items` explain every point in the percentage.
 */
export function selectAssetReadiness(assetOrId, state) {
  const asset =
    typeof assetOrId === "string"
      ? state.assets.find((item) => item.id === assetOrId)
      : assetOrId;
  if (!asset) return { percent: 0, items: [], missing: ["asset"] };
  const requirement = selectEvidenceRequirementSatisfaction(asset, state);
  const place = state.places.find((item) => item.id === asset.placeId);
  const locationPolicy = getAssetLocationPolicy(asset);
  const hasPrecisePlacePin = hasConfirmedExactPlaceLocation(place);
  const hasIndoorLocator = Boolean(
    asset.spaceId || nullableText(asset.locationDetail),
  );
  const hasFindablePhysicalLocation =
    asset.locationMode === "physical" &&
    asset.locationStatus === "known" &&
    Boolean(place) &&
    (locationPolicy.isRealEstate
      ? hasPrecisePlacePin
      : hasIndoorLocator);
  const hasTruthfulVirtualLocation =
    asset.locationMode === "virtual" &&
    locationPolicy.allowsVirtual;
  const hasTruthfulNotApplicableLocation =
    asset.locationMode === "not-applicable" &&
    locationPolicy.usesNotApplicable;
  const items = [
    {
      id: "identity",
      label: "Name and category",
      weight: 20,
      complete: Boolean(asset.name && asset.category),
    },
    {
      id: "ownership",
      label: "Owner recorded",
      weight: 10,
      complete: Boolean(asset.ownerMemberId),
    },
    {
      id: "location",
      label:
        hasTruthfulVirtualLocation
          ? "Virtual location recorded"
          : hasTruthfulNotApplicableLocation
            ? "Location not applicable"
            : locationPolicy.isRealEstate
              ? "Property pin confirmed"
              : "Findable location",
      weight: 20,
      complete:
        hasTruthfulVirtualLocation ||
        hasTruthfulNotApplicableLocation ||
        hasFindablePhysicalLocation,
    },
    {
      id: "location-detail",
      label: "Precise location",
      weight: 10,
      complete:
        hasTruthfulVirtualLocation ||
        hasTruthfulNotApplicableLocation ||
        (hasFindablePhysicalLocation &&
          hasPrecisePlacePin),
    },
    {
      id: "reference",
      label: "Reference or serial",
      weight: 15,
      complete: Boolean(asset.reference),
    },
    {
      id: "value",
      label: "Value or context",
      weight: 5,
      complete: Boolean(
        asset.value !== null ||
          asset.displayValue ||
          asset.notes,
      ),
    },
    {
      id: "evidence",
      label: "Required evidence",
      weight: 20,
      complete: requirement.complete,
    },
  ];
  const percent = items.reduce(
    (total, item) => total + (item.complete ? item.weight : 0),
    0,
  );
  return {
    percent,
    items,
    missing: items.filter((item) => !item.complete).map((item) => item.id),
    evidence: requirement,
  };
}

function activeAssets(state) {
  return state.assets.filter((item) => item.lifecycleStatus !== "archived");
}

export function selectSpacePath(state, spaceId) {
  const byId = new Map(state.spaces.map((item) => [item.id, item]));
  const path = [];
  const seen = new Set();
  let current = byId.get(spaceId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentSpaceId
      ? byId.get(current.parentSpaceId)
      : null;
  }
  return path;
}

export function selectAssetLocationHistory(state, assetId) {
  return state.locationAssignments
    .filter((item) => item.assetId === assetId)
    .sort((left, right) =>
      String(right.validFrom).localeCompare(String(left.validFrom)),
    );
}

export function selectCollectionSummary(state, collectionId) {
  const collection = state.collections.find(
    (item) => item.id === collectionId && item.status !== "archived",
  );
  if (!collection) return null;
  const assets = collection.assetIds
    .map((id) => state.assets.find((item) => item.id === id))
    .filter((item) => item && item.lifecycleStatus !== "archived");
  const photographedCount = assets.filter(
    (asset) =>
      asset.coverImage ||
      state.evidence.some(
        (item) =>
          item.assetId === asset.id &&
          item.kind === "media" &&
          ["ready_local", "ready"].includes(item.fileState),
      ),
  ).length;
  const storyCount = assets.filter(
    (asset) =>
      asset.notes ||
      asset.sentimentalValue ||
      asset.meaningFacets?.includes("memory"),
  ).length;
  const locatedCount = assets.filter(
    (asset) =>
      asset.locationMode === "not-applicable" ||
      asset.locationMode === "virtual" ||
      asset.locationStatus === "known",
  ).length;
  const nonFinancialAssets = assets.filter(
    (asset) =>
      asset.kind !== "financial" &&
      !String(asset.categoryId || "").startsWith("financial."),
  );
  const coverAsset =
    nonFinancialAssets.find((item) => item.id === collection.coverAssetId) ||
    nonFinancialAssets[0] ||
    null;
  return {
    collection,
    assets,
    coverAsset,
    assetCount: assets.length,
    photographedCount,
    storyCount,
    locatedCount,
    featuredCount: collection.featuredAssetIds.filter((id) =>
      assets.some((asset) => asset.id === id),
    ).length,
    curation: {
      findable: assets.length
        ? Math.round((locatedCount / assets.length) * 100)
        : 0,
      documented: assets.length
        ? Math.round((photographedCount / assets.length) * 100)
        : 0,
      personal: assets.length
        ? Math.round((storyCount / assets.length) * 100)
        : collection.story
          ? 100
          : 0,
    },
  };
}

export function selectPlaceSummary(state, placeId) {
  const place = state.places.find(
    (item) =>
      item.id === placeId &&
      item.status !== "archived",
  );
  if (!place) return null;
  const assets = activeAssets(state).filter((item) => item.placeId === placeId);
  const readinessValues = assets.map(
    (item) => selectAssetReadiness(item, state).percent,
  );
  const evidenceGapCount = assets.filter(
    (item) => !selectEvidenceRequirementSatisfaction(item, state).complete,
  ).length;
  const pendingEvidenceCount = state.evidence.filter(
    (item) =>
      item.status === "pending" &&
      assets.some((asset) => asset.id === item.assetId),
  ).length;
  return {
    place,
    assetCount: assets.length,
    spaceCount: state.spaces.filter((item) => item.placeId === placeId).length,
    documentCount: assets.filter(
      (item) => item.kind === "document" || item.category === "Document",
    ).length,
    evidenceGapCount,
    pendingEvidenceCount,
    needsLocationDetailCount: assets.filter(
      (item) => item.locationStatus === "needs-detail",
    ).length,
    readiness: readinessValues.length
      ? Math.round(
          readinessValues.reduce((total, value) => total + value, 0) /
            readinessValues.length,
        )
      : 0,
  };
}

export function selectPortfolioSummary(state) {
  const assets = activeAssets(state);
  const activeAssetIds = new Set(assets.map((item) => item.id));
  const readinessValues = assets.map(
    (item) => selectAssetReadiness(item, state).percent,
  );
  const unknownLocationCount = assets.filter(
    (item) =>
      item.locationMode !== "virtual" &&
      item.locationMode !== "not-applicable" &&
      item.locationStatus === "unknown",
  ).length;
  const needsLocationDetailCount = assets.filter(
    (item) => item.locationStatus === "needs-detail",
  ).length;
  const verifiedEvidenceCount = state.evidence.filter(
    (item) =>
      item.status === "verified" &&
      activeAssetIds.has(item.assetId),
  ).length;
  const fullPassportCount = readinessValues.filter((value) => value === 100).length;
  return {
    assetCount: assets.length,
    archivedAssetCount: state.assets.length - assets.length,
    placeCount: state.places.filter((item) => item.status !== "archived").length,
    collectionCount: state.collections.filter(
      (item) => item.status !== "archived",
    ).length,
    spaceCount: state.spaces.filter((space) =>
      state.places.some(
        (place) =>
          place.id === space.placeId &&
          place.status !== "archived",
      ),
    ).length,
    documentCount: assets.filter(
      (item) => item.kind === "document" || item.category === "Document",
    ).length,
    locatedAssetCount: assets.length - unknownLocationCount,
    unknownLocationCount,
    needsLocationDetailCount,
    evidenceGapCount: assets.filter(
      (item) => !selectEvidenceRequirementSatisfaction(item, state).complete,
    ).length,
    pendingEvidenceCount: state.evidence.filter(
      (item) =>
        item.status === "pending" &&
        activeAssetIds.has(item.assetId),
    ).length,
    verifiedEvidenceCount,
    fullPassportCount,
    readiness: readinessValues.length
      ? Math.round(
          readinessValues.reduce((total, value) => total + value, 0) /
            readinessValues.length,
        )
      : 0,
    firstUsefulVault: {
      account: Boolean(state.household.id),
      place: state.places.some((item) => item.status !== "archived"),
      records: assets.length >= 5,
      fullPassport: fullPassportCount >= 1,
      proof: verifiedEvidenceCount >= 1,
      complete:
        Boolean(state.household.id) &&
        state.places.some((item) => item.status !== "archived") &&
        assets.length >= 5 &&
        fullPassportCount >= 1 &&
        verifiedEvidenceCount >= 1,
    },
    places: state.places
      .map((place) => selectPlaceSummary(state, place.id))
      .filter(Boolean),
  };
}

const PRIORITY_ORDER = {
  urgent: 0,
  high: 1,
  normal: 2,
  later: 3,
};

export function selectNextAction(state) {
  const currentAssets = activeAssets(state);
  const activeAssetIds = new Set(currentAssets.map((item) => item.id));
  const currentPlaces = state.places.filter(
    (item) => item.status !== "archived",
  );
  const openTask = state.tasks
    .filter(
      (item) =>
        item.status === "open" &&
        (!item.assetId || activeAssetIds.has(item.assetId)),
    )
    .sort((left, right) => {
      const priority =
        PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      if (priority) return priority;
      if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt);
      if (left.dueAt) return -1;
      if (right.dueAt) return 1;
      return left.createdAt.localeCompare(right.createdAt);
    })[0];
  if (openTask) {
    const destination =
      openTask.type === "add-evidence" && openTask.assetId
        ? { type: "capture-material", assetId: openTask.assetId }
        : openTask.spaceId && openTask.placeId
          ? {
              type: "space",
              placeId: openTask.placeId,
              spaceId: openTask.spaceId,
            }
          : openTask.assetId
            ? { type: "asset", assetId: openTask.assetId }
            : openTask.placeId
              ? { type: "place", placeId: openTask.placeId }
              : { type: "assets" };
    return {
      kind: "task",
      id: openTask.id,
      title: openTask.title,
      description: openTask.description,
      ctaLabel: openTask.ctaLabel,
      priority: openTask.priority,
      dueAt: openTask.dueAt,
      assetId: openTask.assetId,
      placeId: openTask.placeId,
      spaceId: openTask.spaceId,
      destination,
    };
  }

  const pending = state.evidence.find(
    (item) =>
      item.status === "pending" &&
      activeAssetIds.has(item.assetId),
  );
  if (pending) {
    const asset = state.assets.find((item) => item.id === pending.assetId);
    return {
      kind: "verify-evidence",
      id: pending.id,
      title: `Review ${pending.type}`,
      description: asset ? `Review the material added to ${asset.name}.` : "Review the new material.",
      ctaLabel: "Review material",
      assetId: pending.assetId,
      evidenceId: pending.id,
      destination: { type: "asset", assetId: pending.assetId },
    };
  }

  const needsLocation = activeAssets(state)
    .filter(
      (item) =>
        item.locationMode !== "virtual" &&
        item.locationMode !== "not-applicable" &&
        item.locationStatus !== "known",
    )
    .sort(
      (left, right) =>
        selectAssetReadiness(left, state).percent -
        selectAssetReadiness(right, state).percent,
    )[0];
  if (needsLocation) {
    return {
      kind: "set-location",
      id: needsLocation.id,
      title: `Confirm where ${needsLocation.name} is kept`,
      description: "Add a place, room, shelf, box, or location note.",
      ctaLabel: "Set location",
      assetId: needsLocation.id,
      destination: { type: "asset", assetId: needsLocation.id },
    };
  }

  const proofGap = activeAssets(state)
    .filter(
      (item) => !selectEvidenceRequirementSatisfaction(item, state).complete,
    )
    .sort(
      (left, right) =>
        selectAssetReadiness(left, state).percent -
        selectAssetReadiness(right, state).percent,
    )[0];
  if (proofGap) {
    return {
      kind: "add-evidence",
      id: proofGap.id,
      title: `Add supporting material to ${proofGap.name}`,
      description: selectEvidenceRequirementSatisfaction(proofGap, state)
        .requirements.filter((item) => !item.satisfied)
        .map((item) => item.type)
        .join(", "),
      ctaLabel: "Add material",
      assetId: proofGap.id,
      destination: { type: "capture-material", assetId: proofGap.id },
    };
  }

  if (currentAssets.length === 0) {
    const firstPlace = currentPlaces[0];
    if (firstPlace) {
      return {
        kind: "add-first-asset",
        id: `first-asset-${firstPlace.id}`,
        title: `Add the first asset in ${firstPlace.name}`,
        description:
          "Start with one item, property record, vehicle, watch, digital asset, or memory.",
        ctaLabel: "Add first asset",
        placeId: firstPlace.id,
        destination: {
          type: "capture-asset",
          placeId: firstPlace.id,
        },
      };
    }
    return {
      kind: "add-first-place",
      id: "first-place",
      title: "Add your first place",
      description:
        "Begin with a home, property, plot, storage space, or family archive.",
      ctaLabel: "Add place",
      destination: { type: "capture-place" },
    };
  }

  return {
    kind: "review",
    id: "portfolio-review",
    title: "Review your continuity map",
    description: "Priority records are current in this demo workspace.",
    ctaLabel: "Open assets",
    destination: { type: "assets" },
  };
}

function normalizedSearchText(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function matchesTokens(haystack, tokens) {
  const normalized = normalizedSearchText(haystack);
  return tokens.every((token) => normalized.includes(token));
}

function scoreMatch(title, haystack, query) {
  if (!query) return 1;
  const normalizedTitle = normalizedSearchText(title);
  if (normalizedTitle === query) return 100;
  if (normalizedTitle.startsWith(query)) return 80;
  if (normalizedTitle.includes(query)) return 60;
  return matchesTokens(haystack, query.split(/\s+/).filter(Boolean)) ? 30 : 0;
}

/**
 * Searches all major entities. Filters may include `types`, `placeId`,
 * `category`, semantic `location`, legacy `locationStatus`, and
 * `includeArchived`.
 */
export function searchWorkspace(state, query, filters = {}) {
  const q = normalizedSearchText(query);
  const requestedTypes = new Set(
    uniqueStrings(filters.types ?? (filters.type ? [filters.type] : [])).map(
      (item) => item.toLowerCase(),
    ),
  );
  const includesType = (type) =>
    requestedTypes.size === 0 || requestedTypes.has(type);
  const placeById = new Map(state.places.map((item) => [item.id, item]));
  const spaceById = new Map(state.spaces.map((item) => [item.id, item]));
  const collectorProfileById = new Map(
    (state.collector?.itemProfiles || []).map((item) => [item.id, item]),
  );
  const collectorPersonById = new Map(
    (state.collector?.people || []).map((item) => [item.id, item]),
  );
  const memoryPeopleByProfileId = (
    state.collector?.memoryPersonLinks || []
  ).reduce((index, link) => {
    const person = collectorPersonById.get(link.personId);
    if (!person) return index;
    const people = index.get(link.itemProfileId) || [];
    people.push(person);
    index.set(link.itemProfileId, people);
    return index;
  }, new Map());
  const results = [];

  if (includesType("asset")) {
    for (const item of state.assets) {
      if (
        item.lifecycleStatus === "archived" &&
        filters.includeArchived !== true
      ) {
        continue;
      }
      if (filters.placeId && item.placeId !== filters.placeId) continue;
      if (
        filters.category &&
        ![item.category, item.categoryId, ...(item.categoryPath ?? [])].some(
          (value) =>
            normalizedSearchText(value) ===
            normalizedSearchText(filters.category),
        )
      ) {
        continue;
      }
      if (
        filters.locationStatus &&
        item.locationStatus !== filters.locationStatus
      ) {
        continue;
      }
      if (filters.location) {
        const matchesLocation =
          filters.location === "known"
            ? item.locationMode === "physical" &&
              item.locationStatus === "known"
            : filters.location === "needs-detail"
              ? item.locationMode === "physical" &&
                item.locationStatus === "needs-detail"
              : filters.location === "unknown"
                ? item.locationMode === "unknown" ||
                  (item.locationMode === "physical" &&
                    item.locationStatus === "unknown")
                : filters.location === "no-physical"
                  ? item.locationMode === "virtual" ||
                    item.locationMode === "not-applicable"
                  : true;
        if (!matchesLocation) continue;
      }
      const place = placeById.get(item.placeId);
      const space = spaceById.get(item.spaceId);
      const collectorProfile = collectorProfileById.get(
        collectorProfileIdForAsset(item.id),
      );
      const linkedMemoryPeople =
        memoryPeopleByProfileId.get(collectorProfile?.id) || [];
      const locationSearchTerms =
        item.locationMode === "virtual"
          ? "virtual no physical location"
          : item.locationMode === "not-applicable"
            ? "no physical location location not applicable"
            : item.locationMode === "unknown" ||
                item.locationStatus === "unknown"
              ? "unknown location location unknown"
              : item.locationStatus === "needs-detail"
                ? "physical location needs detail"
                : "known physical location located";
      const haystack = [
        item.name,
        item.category,
        item.categoryId,
        ...(item.categoryPath ?? []),
        item.customCategory,
        item.kind,
        item.notes,
        item.sentimentalValue,
        ...(item.meaningFacets ?? []),
        item.reference,
        item.locationDetail,
        locationSearchTerms,
        ...Object.values(item.profile ?? {}),
        collectorProfile?.story?.headline,
        collectorProfile?.story?.publicExcerpt,
        ...linkedMemoryPeople.flatMap((person) => [
          person.displayName,
          person.relationship,
        ]),
        place?.name,
        place?.city,
        space?.name,
        ...item.tags,
      ]
        .filter(Boolean)
        .join(" ");
      const score = scoreMatch(item.name, haystack, q);
      if (score) {
        results.push({
          type: "asset",
          id: item.id,
          title: item.name,
          subtitle: [
            item.category,
            space?.name ?? place?.name ?? "Location needed",
          ].join(" · "),
          score,
          placeId: item.placeId,
          assetId: item.id,
          entity: item,
        });
      }
    }
  }

  if (includesType("place")) {
    for (const item of state.places) {
      if (
        item.status === "archived" &&
        filters.includeArchived !== true
      ) {
        continue;
      }
      if (filters.placeId && item.id !== filters.placeId) continue;
      const haystack = [
        item.name,
        item.kind,
        item.city,
        item.countryCode,
        item.address,
      ]
        .filter(Boolean)
        .join(" ");
      const score = scoreMatch(item.name, haystack, q);
      if (score) {
        results.push({
          type: "place",
          id: item.id,
          title: item.name,
          subtitle: [item.kind, item.city].filter(Boolean).join(" · "),
          score,
          placeId: item.id,
          entity: item,
        });
      }
    }
  }

  if (includesType("space")) {
    for (const item of state.spaces) {
      const place = placeById.get(item.placeId);
      if (
        !place ||
        (place.status === "archived" &&
          filters.includeArchived !== true)
      ) {
        continue;
      }
      if (filters.placeId && item.placeId !== filters.placeId) continue;
      const haystack = [item.name, item.kind, item.note, place?.name]
        .filter(Boolean)
        .join(" ");
      const score = scoreMatch(item.name, haystack, q);
      if (score) {
        results.push({
          type: "space",
          id: item.id,
          title: item.name,
          subtitle: [item.kind, place?.name].filter(Boolean).join(" · "),
          score,
          placeId: item.placeId,
          entity: item,
        });
      }
    }
  }

  if (includesType("evidence")) {
    for (const item of state.evidence) {
      const asset = state.assets.find((candidate) => candidate.id === item.assetId);
      if (
        !asset ||
        (asset.lifecycleStatus === "archived" &&
          filters.includeArchived !== true)
      ) {
        continue;
      }
      if (filters.placeId && asset?.placeId !== filters.placeId) continue;
      const title = item.fileName || item.type;
      const haystack = [
        title,
        item.type,
        item.kind,
        item.relation,
        item.note,
        item.linkUrl,
        item.physicalLocation,
        item.materialStorage?.placeSnapshot?.name,
        ...(item.materialStorage?.spacePathSnapshot || []).map(
          (space) => space.name,
        ),
        item.materialStorage?.locatorText,
        item.materialStorage?.externalLabel,
        state.members.find(
          (member) =>
            member.id === item.materialStorage?.custodianMemberId,
        )?.name,
        asset?.name,
      ]
        .filter(Boolean)
        .join(" ");
      const score = scoreMatch(title, haystack, q);
      if (score) {
        results.push({
          type: "evidence",
          id: item.id,
          title,
          subtitle: [item.type, asset?.name, item.status]
            .filter(Boolean)
            .join(" · "),
          score,
          placeId: asset?.placeId ?? null,
          assetId: item.assetId,
          entity: item,
        });
      }
    }
  }

  if (includesType("collection")) {
    for (const item of state.collections) {
      if (
        item.status === "archived" &&
        filters.includeArchived !== true
      ) {
        continue;
      }
      const memberNames = item.assetIds
        .map((assetId) =>
          state.assets.find((asset) => asset.id === assetId)?.name,
        )
        .filter(Boolean);
      const haystack = [
        item.name,
        item.description,
        item.story,
        item.curatorNote,
        item.kind,
        ...item.tags,
        ...memberNames,
      ]
        .filter(Boolean)
        .join(" ");
      const score = scoreMatch(item.name, haystack, q);
      if (score) {
        results.push({
          type: "collection",
          id: item.id,
          title: item.name,
          subtitle: [item.kind, `${item.assetIds.length} items`].join(" · "),
          score,
          placeId: null,
          entity: item,
        });
      }
    }
  }

  if (includesType("member")) {
    for (const item of state.members) {
      const haystack = [
        item.name,
        item.email,
        item.accessRole,
        item.accessScope,
      ]
        .filter(Boolean)
        .join(" ");
      const score = scoreMatch(item.name, haystack, q);
      if (score) {
        results.push({
          type: "member",
          id: item.id,
          title: item.name,
          subtitle: [item.accessRole, item.inviteStatus].join(" · "),
          score,
          placeId: null,
          entity: item,
        });
      }
    }
  }

  if (includesType("task")) {
    for (const item of state.tasks) {
      const haystack = [item.title, item.description, item.type, item.priority]
        .filter(Boolean)
        .join(" ");
      const score = scoreMatch(item.title, haystack, q);
      if (score) {
        results.push({
          type: "task",
          id: item.id,
          title: item.title,
          subtitle: [item.priority, item.status].join(" · "),
          score,
          placeId: item.placeId,
          assetId: item.assetId,
          entity: item,
        });
      }
    }
  }

  const typeOrder = {
    asset: 0,
    collection: 1,
    place: 2,
    space: 3,
    evidence: 4,
    task: 5,
    member: 6,
  };
  return results.sort(
    (left, right) =>
      right.score - left.score ||
      typeOrder[left.type] - typeOrder[right.type] ||
      left.title.localeCompare(right.title),
  );
}
