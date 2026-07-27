import type { JsonObject, JsonValue } from "@alyr/contracts";
import { getLocationPolicy } from "@alyr/domain";

import type {
  NativeAsset,
  NativeEvidence,
  NativePlace,
  NativeWorkspace
} from "./model";
import {
  isAssetActive,
  isOwnedPropertyPlace
} from "./model";

/**
 * The subject is explicit so a real-estate Place can carry a dated value
 * without being duplicated as an Asset. `assetId` remains on asset records for
 * backward compatibility with schema-v2 snapshots and the reviewed sync API.
 */
export type PortfolioValuableSubject =
  | {
      readonly kind: "asset";
      readonly assetId: string;
    }
  | {
      readonly kind: "place";
      readonly placeId: string;
    };

/**
 * Values deliberately live outside both Asset and Place records.
 *
 * A value is a user's dated assertion, not a market quote, appraisal,
 * ownership opinion or verified price. Keeping the view model separate avoids
 * making optional financial data a requirement for continuity capture.
 *
 * New records always include `subject`. Older asset records used only
 * `assetId`; readers normalize those records to an asset subject without a
 * schema reset.
 */
export interface PortfolioValueRecord extends JsonObject {
  readonly id: string;
  readonly householdId?: string;
  readonly subject?: PortfolioValuableSubject;
  readonly assetId?: string;
  readonly placeId?: string;
  readonly version?: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly asOf: string;
  readonly updatedAt: string;
  readonly source: "user-entered";
  readonly syncStatus?:
    | "on-device"
    | "queued"
    | "synced"
    | "needs-attention";
}

interface PortfolioValueInputBase {
  readonly amountMinor: number;
  readonly currency: string;
  /** Calendar date in YYYY-MM-DD format. */
  readonly asOf: string;
}

export type PortfolioValueInput =
  | (PortfolioValueInputBase & {
      readonly assetId: string;
      readonly placeId?: never;
    })
  | (PortfolioValueInputBase & {
      readonly placeId: string;
      readonly assetId?: never;
    });

export interface PortfolioValueMutationContext {
  readonly id: (prefix: string) => string;
  readonly now: () => string;
  /** Local calendar date, supplied by UI runtimes near UTC boundaries. */
  readonly today?: () => string;
}

export interface PortfolioValueMutationResult {
  readonly workspace: NativeWorkspace;
  readonly record: PortfolioValueRecord;
}

export interface PortfolioCurrencyChoice {
  readonly code: string;
  readonly label: string;
}

export type PortfolioMoneyParseErrorCode =
  | "invalid-currency"
  | "unsupported-currency"
  | "empty"
  | "invalid-characters"
  | "fraction-digits"
  | "above-range"
  | "invalid-number";

export type PortfolioMoneyParseResult =
  | {
      readonly ok: true;
      readonly amountMinor: number;
      readonly currency: string;
      readonly fractionDigits: number;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly errorCode: PortfolioMoneyParseErrorCode;
      readonly currency?: string;
      readonly fractionDigits?: number;
    };

const PORTFOLIO_VALUE_RECORDS_KEY = "portfolioValueRecords";

export const DEFAULT_PORTFOLIO_CURRENCY = "QAR";

/**
 * A compact picker for the pilot. Any valid three-letter code can still be
 * entered manually; these choices simply cover the most likely GCC use cases.
 */
export const PORTFOLIO_CURRENCY_CHOICES: readonly PortfolioCurrencyChoice[] = [
  { code: "QAR", label: "Qatari riyal" },
  { code: "USD", label: "US dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British pound" },
  { code: "AED", label: "UAE dirham" },
  { code: "SAR", label: "Saudi riyal" },
  { code: "KWD", label: "Kuwaiti dinar" },
  { code: "BHD", label: "Bahraini dinar" },
  { code: "OMR", label: "Omani rial" },
  { code: "JPY", label: "Japanese yen" }
] as const;

export interface PortfolioRatio {
  readonly complete: number;
  readonly total: number;
  /** Null means there is no applicable denominator; it never means 0%. */
  readonly percent: number | null;
  readonly assetIds: readonly string[];
}

export interface PortfolioPlaceRatio {
  readonly complete: number;
  readonly total: number;
  /** Null means there is no applicable denominator; it never means 0%. */
  readonly percent: number | null;
  readonly placeIds: readonly string[];
}

export interface PortfolioCurrencyTotal {
  readonly currency: string;
  /**
   * Null means the exact integer total exceeded JavaScript's safe range.
   * Individual records remain visible, but ALYR must not show a rounded total.
   */
  readonly amountMinor: number | null;
  /** Asset count is retained for compatibility with existing exports. */
  readonly assetCount: number;
  readonly placeCount?: number;
  readonly entryCount?: number;
  readonly latestAsOf: string;
}

export interface PortfolioValuedItem {
  readonly subject: PortfolioValuableSubject;
  readonly subjectKey: string;
  readonly subjectKind: PortfolioValuableSubject["kind"];
  readonly assetId?: string;
  readonly placeId?: string;
  /** Compatibility alias used by the first Portfolio UI implementation. */
  readonly assetName: string;
  readonly name: string;
  readonly categoryId?: string;
  readonly categoryLabel: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly asOf: string;
  readonly syncStatus: NonNullable<PortfolioValueRecord["syncStatus"]>;
}

export type PortfolioLocationBucketKind =
  | "place"
  | "needs-confirmation"
  | "not-physically-located";

export interface PortfolioLocationBucket {
  readonly id: string;
  readonly kind: PortfolioLocationBucketKind;
  readonly label: string;
  readonly count: number;
  readonly percent: number;
  readonly assetIds: readonly string[];
}

export interface PortfolioSnapshot {
  /** Item Assets only; legacy real-estate Asset fixtures are excluded. */
  readonly assetCount: number;
  /**
   * Only Places explicitly classified as household-owned property enter this
   * count. Unknown, rented, storage and temporary Places remain location
   * structure rather than value subjects.
   */
  readonly propertyCount: number;
  readonly valuableCount: number;
  readonly documentedItems: PortfolioRatio;
  readonly locationReadyItems: PortfolioRatio;
  readonly propertyPinsConfirmed: PortfolioPlaceRatio;
  readonly propertyPinGapPlaceIds: readonly string[];
  readonly valuedItems: PortfolioRatio;
  readonly valuedPlaces: PortfolioPlaceRatio;
  readonly valuedEntryCount: number;
  readonly proofGapAssetIds: readonly string[];
  readonly locationGapAssetIds: readonly string[];
  readonly unvaluedAssetIds: readonly string[];
  readonly unvaluedPlaceIds: readonly string[];
  readonly pendingProofReviewCount: number;
  readonly pendingProofReviewAssetIds: readonly string[];
  readonly currencyTotals: readonly PortfolioCurrencyTotal[];
  /**
   * Grouped by currency before amount sorting. Items are never ranked across
   * currencies because doing so would imply an exchange rate.
   */
  readonly recordedValues: readonly PortfolioValuedItem[];
  readonly locationDistribution: readonly PortfolioLocationBucket[];
  readonly ignoredValueRecordCount: number;
  readonly uncalculableCurrencyCount: number;
}

interface CurrentValueSelection {
  readonly records: readonly PortfolioValueRecord[];
  readonly ignoredCount: number;
}

function ratio(
  assetIds: readonly string[],
  total: number
): PortfolioRatio {
  return {
    complete: assetIds.length,
    total,
    percent:
      total === 0 ? null : Math.round((assetIds.length / total) * 100),
    assetIds
  };
}

export function normalizePortfolioCurrency(
  currency: string
): string | null {
  const candidate = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(candidate) ? candidate : null;
}

function isIsoDate(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function nonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function portfolioSubjectKey(
  subject: PortfolioValuableSubject
): string {
  return subject.kind === "asset"
    ? `asset:${subject.assetId}`
    : `place:${subject.placeId}`;
}

/**
 * Returns the one canonical subject represented by a value record.
 *
 * Legacy records with only `assetId` are accepted. Ambiguous records,
 * mismatched aliases and records with both IDs are rejected rather than
 * guessed into a total.
 */
export function portfolioValueSubject(
  value: Pick<
    PortfolioValueRecord,
    "subject" | "assetId" | "placeId"
  >
): PortfolioValuableSubject | null {
  const assetId = nonEmptyId(value.assetId)
    ? value.assetId.trim()
    : null;
  const placeId = nonEmptyId(value.placeId)
    ? value.placeId.trim()
    : null;
  if (assetId && placeId) {
    return null;
  }
  if (value.subject?.kind === "asset") {
    const subjectAssetId = nonEmptyId(value.subject.assetId)
      ? value.subject.assetId.trim()
      : null;
    return subjectAssetId &&
      !placeId &&
      (!assetId || assetId === subjectAssetId)
      ? { kind: "asset", assetId: subjectAssetId }
      : null;
  }
  if (value.subject?.kind === "place") {
    const subjectPlaceId = nonEmptyId(value.subject.placeId)
      ? value.subject.placeId.trim()
      : null;
    return subjectPlaceId &&
      !assetId &&
      (!placeId || placeId === subjectPlaceId)
      ? { kind: "place", placeId: subjectPlaceId }
      : null;
  }
  if (value.subject !== undefined) {
    return null;
  }
  return assetId ? { kind: "asset", assetId } : null;
}

export function isValidPortfolioValueRecord(
  value: unknown
): value is PortfolioValueRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<PortfolioValueRecord>;
  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    portfolioValueSubject(record) !== null &&
    (record.householdId === undefined ||
      (typeof record.householdId === "string" &&
        record.householdId.trim().length > 0)) &&
    (record.version === undefined ||
      (Number.isSafeInteger(record.version) && record.version >= 1)) &&
    record.source === "user-entered" &&
    typeof record.amountMinor === "number" &&
    Number.isSafeInteger(record.amountMinor) &&
    record.amountMinor >= 0 &&
    typeof record.currency === "string" &&
    normalizePortfolioCurrency(record.currency) !== null &&
    typeof record.asOf === "string" &&
    isIsoDate(record.asOf) &&
    typeof record.updatedAt === "string" &&
    isIsoDate(record.updatedAt)
  );
}

/**
 * Reads only structurally valid assertions from the workspace. Older
 * workspaces simply have no value book, so this is backward compatible with
 * the current workspace schema.
 */
export function getPortfolioValueRecords(
  workspace: NativeWorkspace
): readonly PortfolioValueRecord[] {
  const stored = workspace[PORTFOLIO_VALUE_RECORDS_KEY];
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored.filter(isValidPortfolioValueRecord);
}

export function getPortfolioValueHistory(
  workspace: NativeWorkspace,
  subjectOrLegacyAssetId: PortfolioValuableSubject | string
): readonly PortfolioValueRecord[] {
  const subject =
    typeof subjectOrLegacyAssetId === "string"
      ? {
          kind: "asset" as const,
          assetId: subjectOrLegacyAssetId
        }
      : subjectOrLegacyAssetId;
  const key = portfolioSubjectKey(subject);
  return getPortfolioValueRecords(workspace)
    .filter((record) => {
      const recordSubject = portfolioValueSubject(record);
      return recordSubject
        ? portfolioSubjectKey(recordSubject) === key
        : false;
    })
    .sort((left, right) => {
      const asOfDifference =
        Date.parse(right.asOf) - Date.parse(left.asOf);
      const updatedDifference =
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      return (
        asOfDifference ||
        updatedDifference ||
        right.id.localeCompare(left.id)
      );
    });
}

export function normalizePortfolioAsOfDate(value: string): string | null {
  const candidate = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(candidate);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? candidate
    : null;
}

/**
 * Appends a replacement assertion instead of mutating the previous one.
 * Historical entries remain in the encrypted workspace snapshot while
 * portfolio selectors use only the latest assertion per asset.
 */
export function recordPortfolioValue(
  workspace: NativeWorkspace,
  input: PortfolioValueInput,
  context: PortfolioValueMutationContext
): PortfolioValueMutationResult {
  const subject: PortfolioValuableSubject =
    "placeId" in input && nonEmptyId(input.placeId)
      ? { kind: "place", placeId: input.placeId.trim() }
      : "assetId" in input && nonEmptyId(input.assetId)
        ? { kind: "asset", assetId: input.assetId.trim() }
        : (() => {
            throw new Error("Choose one item or property.");
          })();
  const targetAvailable =
    subject.kind === "asset"
      ? workspace.assets.some(
          (candidate) =>
            candidate.id === subject.assetId &&
            candidate.householdId === workspace.household.id &&
            isAssetActive(candidate) &&
            !getLocationPolicy(candidate.categoryId).isRealEstate
        )
      : workspace.places.some(
          (candidate) =>
            candidate.id === subject.placeId &&
            candidate.householdId === workspace.household.id &&
            isOwnedPropertyPlace(candidate)
        );
  if (!targetAvailable) {
    throw new Error(
      subject.kind === "asset"
        ? "This item is not available in the current household."
        : "This property is not available in the current household."
    );
  }
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 0
  ) {
    throw new Error("Enter an exact value within the supported range.");
  }
  const currency = normalizePortfolioCurrency(input.currency);
  if (!currency) {
    throw new Error("Use a three-letter currency code such as QAR.");
  }
  const asOf = normalizePortfolioAsOfDate(input.asOf);
  if (!asOf) {
    throw new Error("Use a valid as-of date in YYYY-MM-DD format.");
  }
  const updatedAt = context.now();
  if (!isIsoDate(updatedAt)) {
    throw new Error("The device time was unavailable. Nothing was saved.");
  }
  const currentDate =
    normalizePortfolioAsOfDate(context.today?.() ?? "") ??
    updatedAt.slice(0, 10);
  if (asOf > currentDate) {
    throw new Error("The as-of date cannot be in the future.");
  }
  const recordId = context.id("portfolio-value");
  if (!recordId.trim()) {
    throw new Error("The value record could not be identified.");
  }
  const record: PortfolioValueRecord = {
    id: recordId,
    householdId: workspace.household.id,
    subject,
    ...(subject.kind === "asset"
      ? { assetId: subject.assetId }
      : { placeId: subject.placeId }),
    version: 1,
    amountMinor: input.amountMinor,
    currency,
    asOf,
    updatedAt,
    source: "user-entered",
    // The assertion remains on-device until the durable outbox receives a
    // server acknowledgement. Signed personal workspaces enqueue both Asset
    // and owned-Property subjects atomically with this snapshot.
    syncStatus: "on-device"
  };
  const stored = workspace[PORTFOLIO_VALUE_RECORDS_KEY];
  const preserved: JsonValue[] = Array.isArray(stored) ? stored : [];

  return {
    record,
    workspace: {
      ...workspace,
      [PORTFOLIO_VALUE_RECORDS_KEY]: [...preserved, record],
      updatedAt
    }
  };
}

/**
 * Selects one current user-entered value per existing item or property.
 *
 * Invalid, deleted-subject and non-user records are ignored rather than being
 * coerced into a financial total. Same-time edits resolve by stable record ID
 * so every runtime produces the same snapshot.
 */
export function selectCurrentPortfolioValues(
  assets: readonly NativeAsset[],
  values: readonly PortfolioValueRecord[],
  places: readonly NativePlace[] = []
): CurrentValueSelection {
  const assetIds = new Set(
    assets
      .filter(
        (asset) =>
          isAssetActive(asset) &&
          !getLocationPolicy(asset.categoryId).isRealEstate
      )
      .map((asset) => asset.id)
  );
  const placeIds = new Set(
    places
      .filter(isOwnedPropertyPlace)
      .map((place) => place.id)
  );
  const current = new Map<string, PortfolioValueRecord>();
  let ignoredCount = 0;

  for (const candidate of values as readonly unknown[]) {
    if (!isValidPortfolioValueRecord(candidate)) {
      ignoredCount += 1;
      continue;
    }
    const subject = portfolioValueSubject(candidate)!;
    const available =
      subject.kind === "asset"
        ? assetIds.has(subject.assetId)
        : placeIds.has(subject.placeId);
    if (!available) {
      ignoredCount += 1;
      continue;
    }
    const normalized: PortfolioValueRecord = {
      ...candidate,
      subject,
      ...(subject.kind === "asset"
        ? { assetId: subject.assetId }
        : { placeId: subject.placeId }),
      currency: normalizePortfolioCurrency(candidate.currency)!
    };
    const key = portfolioSubjectKey(subject);
    const previous = current.get(key);
    if (!previous) {
      current.set(key, normalized);
      continue;
    }
    const asOfDifference =
      Date.parse(normalized.asOf) - Date.parse(previous.asOf);
    const editTimeDifference =
      Date.parse(normalized.updatedAt) - Date.parse(previous.updatedAt);
    if (
      asOfDifference > 0 ||
      (asOfDifference === 0 &&
        (editTimeDifference > 0 ||
          (editTimeDifference === 0 &&
            normalized.id.localeCompare(previous.id) > 0)))
    ) {
      current.set(key, normalized);
    }
  }

  return {
    records: [...current.values()].sort((left, right) =>
      portfolioSubjectKey(portfolioValueSubject(left)!).localeCompare(
        portfolioSubjectKey(portfolioValueSubject(right)!)
      )
    ),
    ignoredCount
  };
}

function hasPrimaryPhoto(
  asset: NativeAsset,
  evidenceById: ReadonlyMap<string, NativeEvidence>
): boolean {
  return Boolean(
    asset.photoUri ||
      asset.photoProtectedUri ||
      (asset.photoEvidenceId && evidenceById.has(asset.photoEvidenceId))
  );
}

function supportingEvidenceFor(
  asset: NativeAsset,
  evidenceById: ReadonlyMap<string, NativeEvidence>
): NativeEvidence[] {
  return asset.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is NativeEvidence => Boolean(item));
}

function isLocationReady(
  asset: NativeAsset,
  placeById: ReadonlyMap<string, NativePlace>
): boolean {
  const policy = getLocationPolicy(asset.categoryId);
  if (!policy.requiresPhysicalLocator) {
    return true;
  }
  if (asset.locationStatus !== "known" || !asset.placeId) {
    return false;
  }
  const place = placeById.get(asset.placeId);
  if (!place) {
    return false;
  }
  if (policy.isRealEstate) {
    return Boolean(
      place.latitude !== null &&
        place.longitude !== null &&
        place.confirmedAt
    );
  }
  return Boolean(asset.roomId || asset.locatorText?.trim());
}

function locationDistribution(
  assets: readonly NativeAsset[],
  places: readonly NativePlace[]
): PortfolioLocationBucket[] {
  if (assets.length === 0) {
    return [];
  }
  const placeById = new Map(places.map((place) => [place.id, place]));
  const mutable = new Map<
    string,
    {
      kind: PortfolioLocationBucketKind;
      label: string;
      assetIds: string[];
    }
  >();

  const add = (
    id: string,
    kind: PortfolioLocationBucketKind,
    label: string,
    assetId: string
  ) => {
    const existing = mutable.get(id);
    if (existing) {
      existing.assetIds.push(assetId);
      return;
    }
    mutable.set(id, { kind, label, assetIds: [assetId] });
  };

  for (const asset of assets) {
    const policy = getLocationPolicy(asset.categoryId);
    if (!policy.requiresPhysicalLocator) {
      add(
        "not-physically-located",
        "not-physically-located",
        "No physical place required",
        asset.id
      );
      continue;
    }
    const place =
      asset.locationStatus === "known" && asset.placeId
        ? placeById.get(asset.placeId)
        : undefined;
    if (place) {
      add(`place:${place.id}`, "place", place.name, asset.id);
    } else {
      add(
        "needs-confirmation",
        "needs-confirmation",
        "Location needs confirmation",
        asset.id
      );
    }
  }

  return [...mutable.entries()]
    .map(([id, item]) => ({
      id,
      kind: item.kind,
      label: item.label,
      count: item.assetIds.length,
      percent: Math.round((item.assetIds.length / assets.length) * 100),
      assetIds: item.assetIds
    }))
    .sort((left, right) => {
      if (left.kind === "place" && right.kind !== "place") return -1;
      if (left.kind !== "place" && right.kind === "place") return 1;
      return (
        right.count - left.count ||
        left.label.localeCompare(right.label)
      );
    });
}

function calculateCurrencyTotals(
  values: readonly PortfolioValueRecord[]
): {
  readonly totals: readonly PortfolioCurrencyTotal[];
  readonly uncalculableCurrencyCount: number;
} {
  const grouped = new Map<
    string,
    {
      amountMinor: number | null;
      assetCount: number;
      placeCount: number;
      latestAsOf: string;
    }
  >();

  for (const value of values) {
    const subject = portfolioValueSubject(value);
    if (!subject) {
      continue;
    }
    const current = grouped.get(value.currency);
    if (!current) {
      grouped.set(value.currency, {
        amountMinor: value.amountMinor,
        assetCount: subject.kind === "asset" ? 1 : 0,
        placeCount: subject.kind === "place" ? 1 : 0,
        latestAsOf: value.asOf
      });
      continue;
    }
    const candidateTotal =
      current.amountMinor === null
        ? null
        : current.amountMinor + value.amountMinor;
    current.amountMinor =
      candidateTotal !== null && Number.isSafeInteger(candidateTotal)
        ? candidateTotal
        : null;
    if (subject.kind === "asset") {
      current.assetCount += 1;
    } else {
      current.placeCount += 1;
    }
    if (Date.parse(value.asOf) > Date.parse(current.latestAsOf)) {
      current.latestAsOf = value.asOf;
    }
  }

  const totals = [...grouped.entries()]
    .map(([currency, total]) => ({
      currency,
      ...total,
      entryCount: total.assetCount + total.placeCount
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
  return {
    totals,
    uncalculableCurrencyCount: totals.filter(
      (total) => total.amountMinor === null
    ).length
  };
}

export function buildPortfolioSnapshot(
  workspace: NativeWorkspace,
  valueRecords: readonly PortfolioValueRecord[] =
    getPortfolioValueRecords(workspace)
): PortfolioSnapshot {
  const activeAssets = workspace.assets.filter(
    (asset) =>
      isAssetActive(asset) &&
      !getLocationPolicy(asset.categoryId).isRealEstate
  );
  const properties = workspace.places.filter(
    (place) =>
      place.householdId === workspace.household.id &&
      isOwnedPropertyPlace(place)
  );
  const evidenceById = new Map(
    workspace.evidence.map((item) => [item.id, item])
  );
  const placeById = new Map(
    workspace.places.map((item) => [item.id, item])
  );
  const physicalAssets = activeAssets.filter((asset) =>
    getLocationPolicy(asset.categoryId).requiresPhysicalLocator
  );
  const documentedAssetIds: string[] = [];
  const locationReadyAssetIds: string[] = [];
  const proofGapAssetIds: string[] = [];
  const locationGapAssetIds: string[] = [];
  const pendingProofReviewAssetIds = new Set<string>();
  let pendingProofReviewCount = 0;

  for (const asset of activeAssets) {
    const supportingEvidence = supportingEvidenceFor(asset, evidenceById);
    if (
      hasPrimaryPhoto(asset, evidenceById) ||
      supportingEvidence.length > 0
    ) {
      documentedAssetIds.push(asset.id);
    }
    if (supportingEvidence.length === 0) {
      proofGapAssetIds.push(asset.id);
    }
    for (const evidence of supportingEvidence) {
      if (evidence.reviewStatus === "pending") {
        pendingProofReviewCount += 1;
        pendingProofReviewAssetIds.add(asset.id);
      }
    }
    if (getLocationPolicy(asset.categoryId).requiresPhysicalLocator) {
      if (isLocationReady(asset, placeById)) {
        locationReadyAssetIds.push(asset.id);
      } else {
        locationGapAssetIds.push(asset.id);
      }
    }
  }
  const confirmedPropertyPinIds = properties
    .filter(
      (place) =>
        place.confirmedAt !== null &&
        place.latitude !== null &&
        Number.isFinite(place.latitude) &&
        place.longitude !== null &&
        Number.isFinite(place.longitude)
    )
    .map((place) => place.id);
  const confirmedPropertyPinSet = new Set(confirmedPropertyPinIds);
  const propertyPinGapPlaceIds = properties
    .filter((place) => !confirmedPropertyPinSet.has(place.id))
    .map((place) => place.id);

  const selected = selectCurrentPortfolioValues(
    activeAssets,
    valueRecords,
    properties
  );
  const currentBySubject = new Map(
    selected.records.map((record) => [
      portfolioSubjectKey(portfolioValueSubject(record)!),
      record
    ])
  );
  const valuedAssetIds = activeAssets
    .filter((asset) =>
      currentBySubject.has(
        portfolioSubjectKey({ kind: "asset", assetId: asset.id })
      )
    )
    .map((asset) => asset.id);
  const unvaluedAssetIds = activeAssets
    .filter(
      (asset) =>
        !currentBySubject.has(
          portfolioSubjectKey({ kind: "asset", assetId: asset.id })
        )
    )
    .map((asset) => asset.id);
  const valuedPlaceIds = properties
    .filter((place) =>
      currentBySubject.has(
        portfolioSubjectKey({ kind: "place", placeId: place.id })
      )
    )
    .map((place) => place.id);
  const unvaluedPlaceIds = properties
    .filter(
      (place) =>
        !currentBySubject.has(
          portfolioSubjectKey({ kind: "place", placeId: place.id })
        )
    )
    .map((place) => place.id);
  const assetById = new Map(
    activeAssets.map((asset) => [asset.id, asset])
  );
  const propertyById = new Map(
    properties.map((place) => [place.id, place])
  );
  const { totals, uncalculableCurrencyCount } =
    calculateCurrencyTotals(selected.records);
  const recordedValues = selected.records
    .map((record): PortfolioValuedItem => {
      const subject = portfolioValueSubject(record)!;
      if (subject.kind === "asset") {
        const asset = assetById.get(subject.assetId)!;
        return {
          subject,
          subjectKey: portfolioSubjectKey(subject),
          subjectKind: "asset",
          assetId: asset.id,
          assetName: asset.name,
          name: asset.name,
          categoryId: asset.categoryId,
          categoryLabel: asset.categoryLabel,
          amountMinor: record.amountMinor,
          currency: record.currency,
          asOf: record.asOf,
          syncStatus: record.syncStatus ?? "on-device"
        };
      }
      const property = propertyById.get(subject.placeId)!;
      return {
        subject,
        subjectKey: portfolioSubjectKey(subject),
        subjectKind: "place",
        placeId: property.id,
        assetName: property.name,
        name: property.name,
        categoryLabel: "Property",
        amountMinor: record.amountMinor,
        currency: record.currency,
        asOf: record.asOf,
        syncStatus: "on-device"
      };
    })
    .sort(
      (left, right) =>
        left.currency.localeCompare(right.currency) ||
        right.amountMinor - left.amountMinor ||
        left.name.localeCompare(right.name)
    );

  return {
    assetCount: activeAssets.length,
    propertyCount: properties.length,
    valuableCount: activeAssets.length + properties.length,
    documentedItems: ratio(
      documentedAssetIds,
      activeAssets.length
    ),
    locationReadyItems: ratio(
      locationReadyAssetIds,
      physicalAssets.length
    ),
    propertyPinsConfirmed: {
      complete: confirmedPropertyPinIds.length,
      total: properties.length,
      percent:
        properties.length === 0
          ? null
          : Math.round(
              (confirmedPropertyPinIds.length / properties.length) * 100
            ),
      placeIds: confirmedPropertyPinIds
    },
    propertyPinGapPlaceIds,
    valuedItems: ratio(valuedAssetIds, activeAssets.length),
    valuedPlaces: {
      complete: valuedPlaceIds.length,
      total: properties.length,
      percent:
        properties.length === 0
          ? null
          : Math.round((valuedPlaceIds.length / properties.length) * 100),
      placeIds: valuedPlaceIds
    },
    valuedEntryCount: valuedAssetIds.length + valuedPlaceIds.length,
    proofGapAssetIds,
    locationGapAssetIds,
    unvaluedAssetIds,
    unvaluedPlaceIds,
    pendingProofReviewCount,
    pendingProofReviewAssetIds: [...pendingProofReviewAssetIds],
    currencyTotals: totals,
    recordedValues,
    locationDistribution: locationDistribution(
      activeAssets,
      workspace.places
    ),
    ignoredValueRecordCount: selected.ignoredCount,
    uncalculableCurrencyCount
  };
}

export function portfolioCurrencyMinorUnitDigits(
  currency: string
): number | null {
  const normalized = normalizePortfolioCurrency(currency);
  if (!normalized) {
    return null;
  }
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalized
    }).resolvedOptions().maximumFractionDigits ?? 2;
    return Number.isInteger(digits) && digits >= 0 && digits <= 6
      ? digits
      : null;
  } catch {
    return null;
  }
}

function normalizeDecimalDigits(value: string): string {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  const easternArabic = "۰۱۲۳۴۵۶۷۸۹";
  return [...value]
    .map((character) => {
      const arabicIndex = arabicIndic.indexOf(character);
      if (arabicIndex >= 0) return String(arabicIndex);
      const easternIndex = easternArabic.indexOf(character);
      if (easternIndex >= 0) return String(easternIndex);
      return character === "٫" ? "." : character;
    })
    .join("");
}

/**
 * Parses a human-entered decimal without ever converting the decimal string
 * to a floating-point number.
 */
export function parsePortfolioMoney(
  input: string,
  currencyInput: string
): PortfolioMoneyParseResult {
  const currency = normalizePortfolioCurrency(currencyInput);
  if (!currency) {
    return {
      ok: false,
      errorCode: "invalid-currency",
      error: "Use a three-letter currency code such as QAR."
    };
  }
  const fractionDigits = portfolioCurrencyMinorUnitDigits(currency);
  if (fractionDigits === null) {
    return {
      ok: false,
      errorCode: "unsupported-currency",
      currency,
      error: "This currency code is not supported on this device."
    };
  }
  const candidate = normalizeDecimalDigits(input.trim());
  if (!candidate) {
    return {
      ok: false,
      errorCode: "empty",
      error: "Enter a recorded value."
    };
  }
  if (!/^\d+(?:\.\d+)?$/u.test(candidate)) {
    return {
      ok: false,
      errorCode: "invalid-characters",
      error:
        "Use digits and a decimal point only; leave out grouping commas."
    };
  }
  const [whole = "0", fraction = ""] = candidate.split(".");
  if (fraction.length > fractionDigits) {
    return {
      ok: false,
      errorCode: "fraction-digits",
      currency,
      fractionDigits,
      error:
        fractionDigits === 0
          ? `${currency} is recorded without decimal places.`
          : `${currency} supports up to ${fractionDigits} decimal ${
              fractionDigits === 1 ? "place" : "places"
            }.`
    };
  }

  try {
    const scale = 10n ** BigInt(fractionDigits);
    const fractionalMinor = fraction
      ? BigInt(fraction.padEnd(fractionDigits, "0"))
      : 0n;
    const amountMinor = BigInt(whole) * scale + fractionalMinor;
    if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
      return {
        ok: false,
        errorCode: "above-range",
        error: "This value is above the exact supported range."
      };
    }
    return {
      ok: true,
      amountMinor: Number(amountMinor),
      currency,
      fractionDigits
    };
  } catch {
    return {
      ok: false,
      errorCode: "invalid-number",
      error: "Enter a recorded value using digits only."
    };
  }
}

export function portfolioMinorUnitsToInput(
  amountMinor: number,
  currency: string
): string {
  const fractionDigits = portfolioCurrencyMinorUnitDigits(currency);
  if (
    fractionDigits === null ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0
  ) {
    return "";
  }
  const scale = 10n ** BigInt(fractionDigits);
  const amount = BigInt(amountMinor);
  const whole = amount / scale;
  if (fractionDigits === 0) {
    return whole.toString();
  }
  const fraction = (amount % scale)
    .toString()
    .padStart(fractionDigits, "0");
  return `${whole}.${fraction}`;
}

function decimalSeparator(locale: string): string {
  try {
    return (
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      })
        .formatToParts(1.1)
        .find((part) => part.type === "decimal")?.value ?? "."
    );
  } catch {
    return ".";
  }
}

/**
 * Formats an exact minor-unit integer and always includes the currency code.
 * Financial totals never rely on a locale's ambiguous currency symbol alone.
 */
export function formatPortfolioMoney(
  amountMinor: number,
  currency: string,
  locale = "en"
): string {
  const normalized =
    normalizePortfolioCurrency(currency) ?? currency.trim().toUpperCase();
  const digits = portfolioCurrencyMinorUnitDigits(normalized);
  if (
    digits === null ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0
  ) {
    return `${normalized} —`;
  }
  const scale = 10n ** BigInt(digits);
  const amount = BigInt(amountMinor);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(digits, "0");
  let formattedWhole = whole.toString();
  try {
    formattedWhole = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      useGrouping: true
    }).format(whole);
  } catch {
    // The exact BigInt string remains a truthful fallback.
  }
  return digits === 0
    ? `${normalized} ${formattedWhole}`
    : `${normalized} ${formattedWhole}${decimalSeparator(locale)}${fraction}`;
}

/**
 * Compact display for small summary surfaces such as Today.
 *
 * This is intentionally presentation-only. The exact integer-backed value
 * remains available in Portfolio and exports, while the compact label avoids
 * forcing multiple currencies into one wrapped sentence.
 */
export function formatPortfolioMoneyCompact(
  amountMinor: number,
  currency: string,
  locale = "en"
): string {
  const normalized =
    normalizePortfolioCurrency(currency) ?? currency.trim().toUpperCase();
  const digits = portfolioCurrencyMinorUnitDigits(normalized);
  if (
    digits === null ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0
  ) {
    return `${normalized} —`;
  }

  const majorAmount = amountMinor / 10 ** digits;
  try {
    const compact = new Intl.NumberFormat(locale, {
      compactDisplay: "short",
      maximumFractionDigits: majorAmount >= 1_000_000 ? 2 : 1,
      notation: "compact",
      useGrouping: true
    }).format(majorAmount);
    return `${normalized} ${compact}`;
  } catch {
    return formatPortfolioMoney(amountMinor, normalized, locale);
  }
}
