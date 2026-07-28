import type {
  AssetReadiness,
  AssetReadinessItem,
  NativeAsset,
  NativeLiability,
  NativePlace,
  NativeWorkspace
} from "./model";
import {
  isAssetActive,
  isOwnedPropertyPlace
} from "./model";
import {
  getLiabilities,
  isActiveLiability
} from "./liabilities";
import { buildNetPositionSnapshot } from "./netPosition";
import {
  buildPortfolioSnapshot,
  getPortfolioValueRecords,
  type PortfolioValuableSubject,
  type PortfolioValueRecord
} from "./portfolio";
import {
  calculateNativeAssetReadiness,
  hasConfirmedPreciseNativePlacePin
} from "./readiness";

export type TodayCommandState = "empty" | "incomplete" | "ready";
export type TodayPinConfirmation = "confirmed" | "confirmation-needed";

export interface TodayPlacePin {
  readonly place: NativePlace;
  readonly latitude: number;
  readonly longitude: number;
  readonly confirmation: TodayPinConfirmation;
}

export interface TodayPlacePinStatus {
  readonly pins: readonly TodayPlacePin[];
  readonly confirmedCount: number;
  readonly confirmationNeededCount: number;
}

export interface TodayPlaceOverview {
  readonly placeCount: number;
  readonly regions: readonly string[];
  readonly confirmedCount: number;
  readonly confirmationNeededCount: number;
  readonly missingPinCount: number;
  readonly reviewCount: number;
}

export interface TodayAttentionEntry {
  readonly asset: NativeAsset;
  readonly readiness: AssetReadiness;
}

export type TodayAttentionTask =
  | {
      readonly id: string;
      readonly kind: "asset-gap";
      readonly asset: NativeAsset;
      readonly readiness: AssetReadiness & {
        readonly nextItem: AssetReadinessItem;
      };
    }
  | {
      readonly id: string;
      readonly kind: "property-pin";
      readonly place: NativePlace;
    }
  | {
      readonly id: string;
      readonly kind: "liability-balance";
      readonly liability: NativeLiability;
      readonly state: "missing" | "stale";
    }
  | {
      readonly id: string;
      readonly kind: "liability-review";
      readonly state: "expired" | "changed";
    }
  | {
      readonly id: string;
      readonly kind: "recorded-value-review";
      readonly asOf: string;
      readonly name: string;
      readonly subject: PortfolioValuableSubject;
    };

export interface TodayRegisterHealth {
  /**
   * Core record coverage, not a valuation score. Optional values enter the
   * denominator only after the household chooses to record them.
   */
  readonly readinessPercent: number;
  readonly recordCount: number;
  readonly tasks: readonly TodayAttentionTask[];
}

const ATTENTION_GAP_PRIORITY: Readonly<
  Record<AssetReadinessItem["id"], number>
> = {
  location: 4,
  evidence: 3,
  photo: 2,
  identity: 1
};

/**
 * Produces one stable "next best action" queue instead of inheriting database
 * insertion order. Lower readiness comes first; ties favor retrieval location,
 * then proof, then photo and identity. Older records win the remaining tie so
 * one newly edited item does not continually displace long-standing gaps.
 */
export function rankTodayAttention(
  entries: readonly TodayAttentionEntry[]
): readonly TodayAttentionEntry[] {
  return entries
    .filter(
      (
        entry
      ): entry is TodayAttentionEntry & {
        readonly readiness: AssetReadiness & {
          readonly nextItem: AssetReadinessItem;
        };
      } => entry.readiness.nextItem !== null
    )
    .sort(
      (left, right) =>
        left.readiness.percent - right.readiness.percent ||
        ATTENTION_GAP_PRIORITY[right.readiness.nextItem.id] -
          ATTENTION_GAP_PRIORITY[left.readiness.nextItem.id] ||
        Date.parse(left.asset.updatedAt) -
          Date.parse(right.asset.updatedAt) ||
        left.asset.id.localeCompare(right.asset.id)
    );
}

const TODAY_TASK_PRIORITY: Readonly<
  Record<TodayAttentionTask["kind"], number>
> = {
  "property-pin": 800,
  "liability-balance": 700,
  "liability-review": 700,
  "recorded-value-review": 500,
  "asset-gap": 0
};

function assetGapPriority(gap: AssetReadinessItem["id"]): number {
  return {
    location: 800,
    evidence: 600,
    photo: 400,
    identity: 300
  }[gap];
}

function taskPriority(task: TodayAttentionTask): number {
  if (task.kind === "asset-gap") {
    return assetGapPriority(task.readiness.nextItem.id);
  }
  if (task.kind === "liability-balance") {
    return task.state === "missing" ? 750 : 700;
  }
  return TODAY_TASK_PRIORITY[task.kind];
}

function taskAge(task: TodayAttentionTask): number {
  if (task.kind === "asset-gap") {
    return Date.parse(task.asset.updatedAt);
  }
  if (task.kind === "property-pin") {
    return Date.parse(task.place.updatedAt);
  }
  if (task.kind === "liability-balance") {
    return Date.parse(task.liability.updatedAt);
  }
  if (task.kind === "recorded-value-review") {
    return Date.parse(task.asOf);
  }
  return 0;
}

function stableTime(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Builds one cross-record queue for Today. Retrieval truth wins first, then a
 * missing/current Liability balance, proof, an opted-in stale value, photo and
 * identity. Stable IDs settle every remaining tie so local and cloud order do
 * not change the visible next action.
 */
export function rankTodayTasks(
  tasks: readonly TodayAttentionTask[]
): readonly TodayAttentionTask[] {
  return [...tasks].sort(
    (left, right) =>
      taskPriority(right) - taskPriority(left) ||
      stableTime(taskAge(left)) - stableTime(taskAge(right)) ||
      left.id.localeCompare(right.id)
  );
}

/**
 * Gives property-first and Liability-first households a truthful readiness
 * state without making optional valuation a prerequisite:
 *
 * - each active Item contributes its existing weighted Passport readiness;
 * - each owned Property contributes one confirmed precise-pin requirement;
 * - each active Liability contributes one current-balance requirement;
 * - a value contributes freshness only after the household records it;
 * - a "no liabilities" acknowledgement contributes only after it exists.
 */
export function buildTodayRegisterHealth(
  workspace: NativeWorkspace,
  valueRecords: readonly PortfolioValueRecord[] =
    getPortfolioValueRecords(workspace),
  today = new Date().toISOString().slice(0, 10)
): TodayRegisterHealth {
  const activeAssets = workspace.assets.filter(isAssetActive);
  const assetEntries = activeAssets.map((asset) => ({
    asset,
    readiness: calculateNativeAssetReadiness(
      asset,
      workspace.places,
      workspace.evidence
    )
  }));
  const portfolio = buildPortfolioSnapshot(workspace, valueRecords);
  const netPosition = buildNetPositionSnapshot(
    {
      ...workspace,
      portfolioValueRecords: [...valueRecords]
    },
    today
  );
  const properties = workspace.places.filter(
    (place) =>
      place.householdId === workspace.household.id &&
      isOwnedPropertyPlace(place)
  );
  const activeLiabilities = getLiabilities(workspace).filter(
    isActiveLiability
  );
  const staleLiabilityIds = new Set(
    netPosition.staleLiabilityIds
  );
  const unvaluedLiabilityIds = new Set(
    netPosition.unvaluedLiabilityIds
  );
  const staleValueSubjectKeys = new Set(
    netPosition.staleAssetSubjectKeys
  );

  let completedPoints = assetEntries.reduce(
    (total, entry) => total + entry.readiness.percent,
    0
  );
  let totalPoints = assetEntries.length * 100;
  const tasks: TodayAttentionTask[] = rankTodayAttention(
    assetEntries
  ).map((entry) => ({
    id: `asset-gap:${entry.asset.id}:${entry.readiness.nextItem!.id}`,
    kind: "asset-gap",
    asset: entry.asset,
    readiness: entry.readiness as AssetReadiness & {
      readonly nextItem: AssetReadinessItem;
    }
  }));

  for (const place of properties) {
    totalPoints += 100;
    if (hasConfirmedPreciseNativePlacePin(place)) {
      completedPoints += 100;
    } else {
      tasks.push({
        id: `property-pin:${place.id}`,
        kind: "property-pin",
        place
      });
    }
  }

  for (const liability of activeLiabilities) {
    totalPoints += 100;
    if (unvaluedLiabilityIds.has(liability.id)) {
      tasks.push({
        id: `liability-balance:${liability.id}:missing`,
        kind: "liability-balance",
        liability,
        state: "missing"
      });
    } else if (staleLiabilityIds.has(liability.id)) {
      tasks.push({
        id: `liability-balance:${liability.id}:stale`,
        kind: "liability-balance",
        liability,
        state: "stale"
      });
    } else {
      completedPoints += 100;
    }
  }

  for (const value of portfolio.recordedValues) {
    totalPoints += 100;
    if (staleValueSubjectKeys.has(value.subjectKey)) {
      tasks.push({
        id: `recorded-value-review:${value.subjectKey}`,
        kind: "recorded-value-review",
        asOf: value.asOf,
        name: value.name,
        subject: value.subject
      });
    } else {
      completedPoints += 100;
    }
  }

  if (
    netPosition.liabilityReview &&
    activeLiabilities.length === 0
  ) {
    totalPoints += 100;
    if (netPosition.liabilityReviewInvalidated) {
      tasks.push({
        id: "liability-review:changed",
        kind: "liability-review",
        state: "changed"
      });
    } else if (netPosition.liabilityReviewExpired) {
      tasks.push({
        id: "liability-review:expired",
        kind: "liability-review",
        state: "expired"
      });
    } else {
      completedPoints += 100;
    }
  }

  return {
    readinessPercent:
      totalPoints === 0
        ? 0
        : Math.round((completedPoints / totalPoints) * 100),
    recordCount:
      activeAssets.length +
      properties.length +
      activeLiabilities.length +
      (netPosition.liabilityReview &&
      activeLiabilities.length === 0
        ? 1
        : 0),
    tasks: rankTodayTasks(tasks)
  };
}

export function selectTodayCommandState(
  activeAssetCount: number,
  incompleteAssetCount: number
): TodayCommandState {
  if (activeAssetCount === 0) return "empty";
  return incompleteAssetCount > 0 ? "incomplete" : "ready";
}

/**
 * Selects every displayable coordinate once and derives both labels from that
 * same set. A coordinate is confirmed only after the user confirmation time
 * has been persisted.
 */
export function selectTodayPlacePinStatus(
  places: readonly NativePlace[]
): TodayPlacePinStatus {
  const pins = places
    .filter(
      (
        place
      ): place is NativePlace & {
        readonly latitude: number;
        readonly longitude: number;
      } =>
        place.latitude !== null &&
        Number.isFinite(place.latitude) &&
        place.latitude >= -90 &&
        place.latitude <= 90 &&
        place.longitude !== null &&
        Number.isFinite(place.longitude) &&
        place.longitude >= -180 &&
        place.longitude <= 180
    )
    .map((place): TodayPlacePin => ({
      place,
      latitude: place.latitude,
      longitude: place.longitude,
      confirmation: hasConfirmedPreciseNativePlacePin(place)
        ? "confirmed"
        : "confirmation-needed"
    }));

  return {
    pins,
    confirmedCount: pins.filter(
      (pin) => pin.confirmation === "confirmed"
    ).length,
    confirmationNeededCount: pins.filter(
      (pin) => pin.confirmation === "confirmation-needed"
    ).length
  };
}

/**
 * Summarises only persisted Place facts for Today. A missing coordinate and an
 * unconfirmed coordinate are separate, visible review debts; neither is
 * promoted to a mapped or confirmed location.
 */
export function selectTodayPlaceOverview(
  places: readonly NativePlace[]
): TodayPlaceOverview {
  const pinStatus = selectTodayPlacePinStatus(places);
  const regions = [
    ...new Set(
      places
        .map((place) => place.regionLabel.trim())
        .filter((region) => region.length > 0)
    )
  ].sort((left, right) => left.localeCompare(right));
  const missingPinCount = places.length - pinStatus.pins.length;
  const reviewCount =
    pinStatus.confirmationNeededCount + missingPinCount;

  return {
    placeCount: places.length,
    regions,
    confirmedCount: pinStatus.confirmedCount,
    confirmationNeededCount:
      pinStatus.confirmationNeededCount,
    missingPinCount,
    reviewCount
  };
}
