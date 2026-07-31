import type { JsonObject } from "@alyr/contracts";

import { getLiabilities, isActiveLiability } from "./liabilities";
import type { NativeWorkspace } from "./model";
import {
  assetValueReviewDate,
  liabilityBalanceReviewDate
} from "./netPosition";
import {
  buildPortfolioSnapshot,
  getPortfolioValueRecords,
  normalizePortfolioAsOfDate,
  portfolioValueSubject,
  selectCurrentPortfolioValues
} from "./portfolio";

export const REVIEW_REMINDER_NOTIFICATION_ID =
  "alyr-private-review" as const;

/**
 * Notification copy is intentionally fixed and generic. The payload never
 * carries a household, item, proof, location, balance, currency or date.
 */
export const REVIEW_REMINDER_PAYLOAD = Object.freeze({
  title: "Heldat",
  body: "Open Heldat for a private review.",
  data: Object.freeze({
    kind: "review" as const
  })
});

export type ReviewReminderRuntime =
  | "supabase"
  | "preview"
  | "unavailable";

export interface ReviewReminderPreferences extends JsonObject {
  readonly version: 1;
  readonly enabled: boolean;
  /**
   * Local wall-clock components are persisted instead of an offset-bearing
   * instant. The operating system can therefore preserve the chosen local
   * time when daylight-saving rules change.
   */
  readonly localHour: number;
  readonly localMinute: number;
}

export const DEFAULT_REVIEW_REMINDER_PREFERENCES: ReviewReminderPreferences =
  Object.freeze({
    version: 1,
    enabled: false,
    localHour: 9,
    localMinute: 0
  });

export interface ReviewReminderCalendarTrigger extends JsonObject {
  readonly kind: "local-calendar";
  /** Calendar date in YYYY-MM-DD format. */
  readonly date: string;
  readonly hour: number;
  readonly minute: number;
}

export interface ReviewReminderSelection {
  readonly notificationId: typeof REVIEW_REMINDER_NOTIFICATION_ID;
  /** Earliest private review date, deliberately separated from the payload. */
  readonly reviewDate: string;
  readonly calendarTrigger: ReviewReminderCalendarTrigger;
  readonly payload: typeof REVIEW_REMINDER_PAYLOAD;
}

export interface ReviewReminderSelectionInput {
  readonly workspace: NativeWorkspace;
  readonly runtime: ReviewReminderRuntime;
  readonly preferences: ReviewReminderPreferences;
}

interface ReviewDateCandidate {
  readonly date: string;
  readonly stableKey: string;
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

/**
 * Fails closed on unknown or corrupt stored settings. A storage read never
 * silently opts the user into notifications.
 */
export function normalizeReviewReminderPreferences(
  value: unknown
): ReviewReminderPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_REVIEW_REMINDER_PREFERENCES;
  }
  const candidate = value as Partial<ReviewReminderPreferences>;
  if (
    candidate.version !== 1 ||
    typeof candidate.enabled !== "boolean" ||
    !isIntegerInRange(candidate.localHour, 0, 23) ||
    !isIntegerInRange(candidate.localMinute, 0, 59)
  ) {
    return DEFAULT_REVIEW_REMINDER_PREFERENCES;
  }
  return {
    version: 1,
    enabled: candidate.enabled,
    localHour: candidate.localHour,
    localMinute: candidate.localMinute
  };
}

/**
 * Reads the user-recorded calendar portion without converting through the
 * device timezone. Full ISO evidence timestamps therefore retain the date the
 * record stored, including around DST transitions.
 */
export function storedReviewCalendarDate(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") return null;
  const calendarPart = value.trim().slice(0, 10);
  if (normalizePortfolioAsOfDate(calendarPart) !== calendarPart) {
    return null;
  }
  if (
    value.trim().length > 10 &&
    !Number.isFinite(Date.parse(value.trim()))
  ) {
    return null;
  }
  return calendarPart;
}

function evidenceReviewCandidates(
  workspace: NativeWorkspace
): ReviewDateCandidate[] {
  const activeAssetIds = new Set(
    workspace.assets
      .filter(
        (asset) =>
          asset.householdId === workspace.household.id &&
          asset.lifecycleStatus === "active"
      )
      .map((asset) => asset.id)
  );
  return workspace.evidence.flatMap((evidence) => {
    if (
      evidence.householdId !== workspace.household.id ||
      !activeAssetIds.has(evidence.assetId)
    ) {
      return [];
    }
    const date = storedReviewCalendarDate(evidence.expiresAt);
    return date
      ? [{ date, stableKey: `evidence:${evidence.id}` }]
      : [];
  });
}

function assetValueReviewCandidates(
  workspace: NativeWorkspace
): ReviewDateCandidate[] {
  return buildPortfolioSnapshot(workspace).recordedValues.flatMap(
    (value) => {
      const date = storedReviewCalendarDate(
        assetValueReviewDate(value.asOf)
      );
      return date
        ? [{ date, stableKey: value.subjectKey }]
        : [];
    }
  );
}

function liabilityBalanceReviewCandidates(
  workspace: NativeWorkspace
): ReviewDateCandidate[] {
  const activeLiabilities = getLiabilities(workspace).filter(
    isActiveLiability
  );
  const kindById = new Map(
    activeLiabilities.map((liability) => [
      liability.id,
      liability.kind
    ])
  );
  const selected = selectCurrentPortfolioValues(
    [],
    getPortfolioValueRecords(workspace),
    [],
    activeLiabilities
  );
  return selected.records.flatMap((record) => {
    const subject = portfolioValueSubject(record);
    if (subject?.kind !== "liability") return [];
    const kind = kindById.get(subject.liabilityId);
    if (!kind) return [];
    const date = storedReviewCalendarDate(
      liabilityBalanceReviewDate(record.asOf, kind)
    );
    return date
      ? [
          {
            date,
            stableKey: `liability:${subject.liabilityId}`
          }
        ]
      : [];
  });
}

/**
 * Selects one quiet reminder for the earliest relevant private review.
 *
 * Sample data and session-only previews never create device notifications.
 * Ties are resolved by a non-exported stable key so input order cannot affect
 * the result while subject identifiers remain outside the returned plan.
 */
export function selectReviewReminder(
  input: ReviewReminderSelectionInput
): ReviewReminderSelection | null {
  const { workspace, runtime, preferences } = input;
  if (
    !preferences.enabled ||
    workspace.mode !== "personal" ||
    runtime !== "supabase"
  ) {
    return null;
  }
  const earliest = [
    ...evidenceReviewCandidates(workspace),
    ...assetValueReviewCandidates(workspace),
    ...liabilityBalanceReviewCandidates(workspace)
  ].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.stableKey.localeCompare(right.stableKey)
  )[0];
  if (!earliest) return null;

  return {
    notificationId: REVIEW_REMINDER_NOTIFICATION_ID,
    reviewDate: earliest.date,
    calendarTrigger: {
      kind: "local-calendar",
      date: earliest.date,
      hour: preferences.localHour,
      minute: preferences.localMinute
    },
    payload: REVIEW_REMINDER_PAYLOAD
  };
}
