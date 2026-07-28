import type { JsonObject } from "@alyr/contracts";

import type {
  LiabilityKind,
  NativeLiability,
  NativeLiabilityReview,
  NativeLiabilityTombstone,
  NativeWorkspace
} from "./model";
import {
  getPortfolioValueRecords,
  normalizePortfolioAsOfDate,
  portfolioValueSubject
} from "./portfolio";

export const LIABILITY_KINDS = [
  "mortgage",
  "vehicle-loan",
  "personal-loan",
  "credit-card",
  "education-loan",
  "installment",
  "tax",
  "business",
  "family-debt",
  "other"
] as const satisfies readonly LiabilityKind[];

export interface NewLiabilityInput {
  readonly name: string;
  readonly kind: LiabilityKind;
}

export interface UpdateLiabilityInput extends NewLiabilityInput {
  readonly liabilityId: string;
}

export interface LiabilityLifecycleInput {
  readonly liabilityId: string;
  readonly lifecycleStatus: "active" | "archived";
}

export interface LiabilityMutationContext {
  readonly id: (prefix: string) => string;
  readonly now: () => string;
  readonly today?: () => string;
}

export interface LiabilityMutationResult {
  readonly workspace: NativeWorkspace;
  readonly liability: NativeLiability;
  readonly previousLiability: NativeLiability | null;
}

export interface LiabilityReviewMutationResult {
  readonly workspace: NativeWorkspace;
  readonly review: NativeLiabilityReview;
  readonly previousReview: NativeLiabilityReview | null;
}

const MAX_NAME_LENGTH = 120;

export function isLiabilityKind(
  value: unknown
): value is LiabilityKind {
  return (
    typeof value === "string" &&
    (LIABILITY_KINDS as readonly string[]).includes(value)
  );
}

export function isActiveLiability(
  liability: Pick<NativeLiability, "lifecycleStatus">
): boolean {
  return liability.lifecycleStatus === "active";
}

export function isValidNativeLiability(
  value: unknown
): value is NativeLiability {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<NativeLiability>;
  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    typeof record.householdId === "string" &&
    record.householdId.trim().length > 0 &&
    Number.isSafeInteger(record.version) &&
    (record.version ?? 0) > 0 &&
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    record.name.trim().length <= MAX_NAME_LENGTH &&
    isLiabilityKind(record.kind) &&
    (record.lifecycleStatus === "active" ||
      record.lifecycleStatus === "archived") &&
    (record.archivedAt === null ||
      (typeof record.archivedAt === "string" &&
        Number.isFinite(Date.parse(record.archivedAt)))) &&
    (record.lifecycleStatus !== "archived" ||
      record.archivedAt !== null) &&
    (record.syncStatus === "on-device" ||
      record.syncStatus === "queued" ||
      record.syncStatus === "synced" ||
      record.syncStatus === "needs-attention") &&
    typeof record.createdAt === "string" &&
    Number.isFinite(Date.parse(record.createdAt)) &&
    typeof record.updatedAt === "string" &&
    Number.isFinite(Date.parse(record.updatedAt))
  );
}

export function getLiabilities(
  workspace: NativeWorkspace
): readonly NativeLiability[] {
  const stored = workspace.liabilities;
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(isValidNativeLiability)
    .filter(
      (record) => record.householdId === workspace.household.id
    )
    .sort(
      (left, right) =>
        Number(isActiveLiability(right)) -
          Number(isActiveLiability(left)) ||
        left.name.localeCompare(right.name)
    );
}

export function isValidLiabilityTombstone(
  value: unknown
): value is NativeLiabilityTombstone {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<NativeLiabilityTombstone>;
  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    typeof record.householdId === "string" &&
    record.householdId.trim().length > 0 &&
    Number.isSafeInteger(record.version) &&
    (record.version ?? 0) > 0 &&
    typeof record.deletedAt === "string" &&
    Number.isFinite(Date.parse(record.deletedAt)) &&
    (record.syncStatus === "on-device" ||
      record.syncStatus === "queued" ||
      record.syncStatus === "synced" ||
      record.syncStatus === "needs-attention")
  );
}

export function getLiabilityTombstones(
  workspace: NativeWorkspace
): readonly NativeLiabilityTombstone[] {
  if (!Array.isArray(workspace.liabilityTombstones)) return [];
  return workspace.liabilityTombstones
    .filter(isValidLiabilityTombstone)
    .filter(
      (record) => record.householdId === workspace.household.id
    )
    .sort(
      (left, right) =>
        right.deletedAt.localeCompare(left.deletedAt) ||
        left.id.localeCompare(right.id)
    );
}

export function isValidLiabilityReview(
  value: unknown
): value is NativeLiabilityReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const review = value as Partial<NativeLiabilityReview>;
  return (
    typeof review.id === "string" &&
    review.id.trim().length > 0 &&
    typeof review.householdId === "string" &&
    review.householdId.trim().length > 0 &&
    Number.isSafeInteger(review.version) &&
    (review.version ?? 0) > 0 &&
    review.status === "none-confirmed" &&
    typeof review.reviewedAt === "string" &&
    normalizePortfolioAsOfDate(review.reviewedAt) ===
      review.reviewedAt &&
    typeof review.expiresAt === "string" &&
    normalizePortfolioAsOfDate(review.expiresAt) ===
      review.expiresAt &&
    review.expiresAt >= review.reviewedAt &&
    (review.activityWatermark === undefined ||
      (typeof review.activityWatermark === "string" &&
        review.activityWatermark.length > 0)) &&
    (review.syncStatus === "on-device" ||
      review.syncStatus === "queued" ||
      review.syncStatus === "synced" ||
      review.syncStatus === "needs-attention") &&
    typeof review.updatedAt === "string" &&
    Number.isFinite(Date.parse(review.updatedAt))
  );
}

export function getLiabilityReview(
  workspace: NativeWorkspace
): NativeLiabilityReview | null {
  const review = workspace.liabilityReview;
  return isValidLiabilityReview(review) &&
    review.householdId === workspace.household.id
    ? review
    : null;
}

/**
 * Produces a deterministic semantic watermark without timestamps or sync
 * status. A server acknowledgement of the same operation therefore keeps the
 * review current, while a real master, lifecycle, tombstone or balance
 * revision changes it. The payload is not a security digest and never leaves
 * the encrypted workspace.
 */
export function liabilityActivityWatermark(
  workspace: NativeWorkspace
): string {
  const liabilities = getLiabilities(workspace)
    .map((liability) => [
      liability.id,
      liability.version,
      liability.kind,
      liability.lifecycleStatus
    ] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
  const tombstones = getLiabilityTombstones(workspace)
    .map((tombstone) => [
      tombstone.id,
      tombstone.version
    ] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
  const balances = getPortfolioValueRecords(workspace)
    .flatMap((record) => {
      const subject = portfolioValueSubject(record);
      return subject?.kind === "liability"
        ? [[
            record.id,
            record.version ?? 1,
            subject.liabilityId,
            record.amountMinor,
            record.currency,
            record.asOf
          ] as const]
        : [];
    })
    .sort((left, right) => left[0].localeCompare(right[0]));

  return JSON.stringify({ liabilities, tombstones, balances });
}

export function isLiabilityReviewCurrent(
  workspace: NativeWorkspace,
  review = getLiabilityReview(workspace)
): boolean {
  return Boolean(
    review?.activityWatermark &&
      review.activityWatermark === liabilityActivityWatermark(workspace)
  );
}

function normalizedDetails(
  input: NewLiabilityInput
): NewLiabilityInput {
  const name = input.name.trim().replace(/\s+/gu, " ");
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    throw new Error("Enter a liability name between 1 and 120 characters.");
  }
  if (!isLiabilityKind(input.kind)) {
    throw new Error("Choose a supported liability category.");
  }
  return { name, kind: input.kind };
}

export function createLiability(
  workspace: NativeWorkspace,
  input: NewLiabilityInput,
  context: LiabilityMutationContext
): LiabilityMutationResult {
  const normalized = normalizedDetails(input);
  const liabilities = [...getLiabilities(workspace)];
  const id = context.id("liability");
  if (!id.trim() || liabilities.some((item) => item.id === id)) {
    throw new Error("This liability identifier is already in use.");
  }
  const timestamp = context.now();
  const liability: NativeLiability = {
    id,
    householdId: workspace.household.id,
    version: 1,
    ...normalized,
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus:
      workspace.mode === "sample" ? "on-device" : "queued",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return {
    workspace: {
      ...workspace,
      liabilities: [...liabilities, liability],
      updatedAt: timestamp
    },
    liability,
    previousLiability: null
  };
}

export function confirmNoLiabilities(
  workspace: NativeWorkspace,
  reviewedAtInput: string,
  context: LiabilityMutationContext
): LiabilityReviewMutationResult {
  if (getLiabilities(workspace).some(isActiveLiability)) {
    throw new Error(
      "Archive or remove active liabilities before confirming none."
    );
  }
  const reviewedAt = normalizePortfolioAsOfDate(reviewedAtInput);
  if (!reviewedAt) {
    throw new Error("Choose a valid liability review date.");
  }
  const timestamp = context.now();
  const today =
    normalizePortfolioAsOfDate(context.today?.() ?? "") ??
    timestamp.slice(0, 10);
  if (reviewedAt > today) {
    throw new Error("The liability review date cannot be in the future.");
  }
  const expiry = new Date(`${reviewedAt}T00:00:00.000Z`);
  expiry.setUTCDate(expiry.getUTCDate() + 90);
  const previousReview = getLiabilityReview(workspace);
  const review: NativeLiabilityReview = {
    id: previousReview?.id ?? context.id("liability-review"),
    householdId: workspace.household.id,
    version: (previousReview?.version ?? 0) + 1,
    status: "none-confirmed",
    reviewedAt,
    expiresAt: expiry.toISOString().slice(0, 10),
    activityWatermark: liabilityActivityWatermark(workspace),
    syncStatus:
      workspace.mode === "sample" ? "on-device" : "queued",
    updatedAt: timestamp
  };
  return {
    workspace: {
      ...workspace,
      liabilityReview: review,
      updatedAt: timestamp
    },
    review,
    previousReview
  };
}

export function updateLiability(
  workspace: NativeWorkspace,
  input: UpdateLiabilityInput,
  context: LiabilityMutationContext
): LiabilityMutationResult {
  const normalized = normalizedDetails(input);
  const liabilities = [...getLiabilities(workspace)];
  const index = liabilities.findIndex(
    (item) => item.id === input.liabilityId
  );
  if (index < 0) {
    throw new Error("This liability is not available in the household.");
  }
  const previousLiability = liabilities[index]!;
  const timestamp = context.now();
  const liability: NativeLiability = {
    ...previousLiability,
    ...normalized,
    version: previousLiability.version + 1,
    syncStatus:
      workspace.mode === "sample" ? "on-device" : "queued",
    updatedAt: timestamp
  };
  liabilities[index] = liability;
  return {
    workspace: {
      ...workspace,
      liabilities,
      updatedAt: timestamp
    },
    liability,
    previousLiability
  };
}

export function setLiabilityLifecycle(
  workspace: NativeWorkspace,
  input: LiabilityLifecycleInput,
  context: LiabilityMutationContext
): LiabilityMutationResult {
  const liabilities = [...getLiabilities(workspace)];
  const index = liabilities.findIndex(
    (item) => item.id === input.liabilityId
  );
  if (index < 0) {
    throw new Error("This liability is not available in the household.");
  }
  const previousLiability = liabilities[index]!;
  if (previousLiability.lifecycleStatus === input.lifecycleStatus) {
    return {
      workspace,
      liability: previousLiability,
      previousLiability
    };
  }
  const timestamp = context.now();
  const liability: NativeLiability = {
    ...previousLiability,
    version: previousLiability.version + 1,
    lifecycleStatus: input.lifecycleStatus,
    archivedAt:
      input.lifecycleStatus === "archived" ? timestamp : null,
    syncStatus:
      workspace.mode === "sample" ? "on-device" : "queued",
    updatedAt: timestamp
  };
  liabilities[index] = liability;
  return {
    workspace: {
      ...workspace,
      liabilities,
      updatedAt: timestamp
    },
    liability,
    previousLiability
  };
}

export interface LiabilityDeleteResult extends JsonObject {
  readonly workspace: NativeWorkspace;
  readonly liability: NativeLiability;
  readonly tombstone: NativeLiabilityTombstone;
}

export function deleteLiability(
  workspace: NativeWorkspace,
  liabilityId: string,
  now: string
): LiabilityDeleteResult {
  const liabilities = [...getLiabilities(workspace)];
  const liability = liabilities.find((item) => item.id === liabilityId);
  if (!liability) {
    throw new Error("This liability is not available in the household.");
  }
  const priorTombstones = getLiabilityTombstones(workspace);
  const tombstone: NativeLiabilityTombstone = {
    id: liability.id,
    householdId: workspace.household.id,
    version: liability.version + 1,
    deletedAt: now,
    syncStatus:
      workspace.mode === "sample" ? "on-device" : "queued"
  };
  const remainingValues = Array.isArray(workspace.portfolioValueRecords)
    ? workspace.portfolioValueRecords.filter((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return true;
        }
        return value.liabilityId !== liabilityId;
      })
    : undefined;
  return {
    workspace: {
      ...workspace,
      liabilities: liabilities.filter(
        (item) => item.id !== liabilityId
      ),
      liabilityTombstones: [
        ...priorTombstones.filter((item) => item.id !== liabilityId),
        tombstone
      ],
      ...(remainingValues
        ? { portfolioValueRecords: remainingValues }
        : {}),
      updatedAt: now
    },
    liability,
    tombstone
  };
}
