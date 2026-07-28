import type {
  NativeLiability,
  NativeLiabilityReview,
  NativeWorkspace
} from "./model";
import {
  getLiabilities,
  getLiabilityReview,
  isActiveLiability,
  isLiabilityReviewCurrent
} from "./liabilities";
import {
  buildPortfolioSnapshot,
  getPortfolioValueRecords,
  portfolioValueSubject,
  selectCurrentPortfolioValues,
  type PortfolioSnapshot,
  type PortfolioValueRecord
} from "./portfolio";

export type NetPositionStatus =
  | "empty"
  | "assets-unvalued"
  | "liabilities-unreviewed"
  | "partial"
  | "recorded"
  | "stale"
  | "exact-total-unavailable";

export interface NetPositionCurrencyLine {
  readonly currency: string;
  readonly recordedAssetsMinor: number | null;
  readonly recordedLiabilitiesMinor: number | null;
  readonly recordedNetPositionMinor: number | null;
  readonly assetEntryCount: number;
  readonly liabilityEntryCount: number;
  readonly oldestAsOf: string | null;
  readonly newestAsOf: string | null;
  readonly liabilityCoverage:
    | "recorded"
    | "none-confirmed"
    | "unreviewed";
}

export interface NetPositionSnapshot {
  readonly status: NetPositionStatus;
  readonly portfolio: PortfolioSnapshot;
  readonly byCurrency: readonly NetPositionCurrencyLine[];
  readonly activeLiabilityCount: number;
  readonly valuedLiabilityCount: number;
  readonly unvaluedLiabilityIds: readonly string[];
  readonly staleLiabilityIds: readonly string[];
  readonly staleAssetSubjectKeys: readonly string[];
  readonly assetCoverageComplete: boolean;
  readonly liabilityCoverageComplete: boolean;
  readonly liabilityReview: NativeLiabilityReview | null;
  readonly liabilityReviewExpired: boolean;
  readonly liabilityReviewInvalidated: boolean;
  readonly hasMultipleCurrencies: boolean;
}

const LIABILITY_REFRESH_DAYS: Readonly<
  Record<NativeLiability["kind"], number>
> = {
  mortgage: 90,
  "vehicle-loan": 180,
  "personal-loan": 90,
  "credit-card": 30,
  "education-loan": 90,
  installment: 30,
  tax: 30,
  business: 90,
  "family-debt": 90,
  other: 90
};

function safeSum(
  values: readonly number[]
): number | null {
  let total = 0;
  for (const value of values) {
    const next = total + value;
    if (!Number.isSafeInteger(next)) return null;
    total = next;
  }
  return total;
}

function signedDifference(
  assets: number | null,
  liabilities: number | null
): number | null {
  if (assets === null || liabilities === null) return null;
  const value = assets - liabilities;
  return Number.isSafeInteger(value) ? value : null;
}

function dateRange(
  dates: readonly string[]
): { readonly oldest: string | null; readonly newest: string | null } {
  if (dates.length === 0) return { oldest: null, newest: null };
  const sorted = [...dates].sort();
  return {
    oldest: sorted[0] ?? null,
    newest: sorted.at(-1) ?? null
  };
}

function addDays(
  isoDate: string,
  days: number
): string {
  const value = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function liabilityValues(
  workspace: NativeWorkspace,
  activeLiabilities: readonly NativeLiability[]
): readonly PortfolioValueRecord[] {
  const values = getPortfolioValueRecords(workspace).filter(
    (record) =>
      portfolioValueSubject(record)?.kind === "liability"
  );
  return selectCurrentPortfolioValues(
    [],
    values,
    [],
    activeLiabilities
  ).records;
}

export function buildNetPositionSnapshot(
  workspace: NativeWorkspace,
  today = new Date().toISOString().slice(0, 10)
): NetPositionSnapshot {
  const portfolio = buildPortfolioSnapshot(workspace);
  const activeLiabilities = getLiabilities(workspace).filter(
    isActiveLiability
  );
  const currentLiabilityValues = liabilityValues(
    workspace,
    activeLiabilities
  );
  const valueByLiability = new Map(
    currentLiabilityValues.flatMap((record) => {
      const subject = portfolioValueSubject(record);
      return subject?.kind === "liability"
        ? [[subject.liabilityId, record] as const]
        : [];
    })
  );
  const review = getLiabilityReview(workspace);
  const liabilityReviewExpired = Boolean(
    review && review.expiresAt < today
  );
  const liabilityReviewInvalidated = Boolean(
    review && !isLiabilityReviewCurrent(workspace, review)
  );
  const noneConfirmed = Boolean(
    review &&
      !liabilityReviewExpired &&
      !liabilityReviewInvalidated &&
      activeLiabilities.length === 0
  );
  const unvaluedLiabilityIds = activeLiabilities
    .filter((liability) => !valueByLiability.has(liability.id))
    .map((liability) => liability.id);
  const staleLiabilityIds = activeLiabilities
    .filter((liability) => {
      const value = valueByLiability.get(liability.id);
      return Boolean(
        value &&
          addDays(
            value.asOf,
            LIABILITY_REFRESH_DAYS[liability.kind]
          ) < today
      );
    })
    .map((liability) => liability.id);
  const staleAssetSubjectKeys = portfolio.recordedValues
    .filter((value) => addDays(value.asOf, 365) < today)
    .map((value) => value.subjectKey);
  const liabilityGroups = new Map<
    string,
    PortfolioValueRecord[]
  >();
  for (const value of currentLiabilityValues) {
    const current = liabilityGroups.get(value.currency) ?? [];
    current.push(value);
    liabilityGroups.set(value.currency, current);
  }
  const assetGroups = new Map(
    portfolio.currencyTotals.map((total) => [total.currency, total])
  );
  const currencies = [
    ...new Set([
      ...assetGroups.keys(),
      ...liabilityGroups.keys()
    ])
  ].sort();
  const byCurrency = currencies.map(
    (currency): NetPositionCurrencyLine => {
      const asset = assetGroups.get(currency);
      const liabilities = liabilityGroups.get(currency) ?? [];
      const liabilityCoverage = liabilities.length > 0
        ? "recorded"
        : noneConfirmed
          ? "none-confirmed"
          : "unreviewed";
      const recordedAssetsMinor = asset?.amountMinor ?? 0;
      const recordedLiabilitiesMinor =
        liabilityCoverage === "unreviewed"
          ? null
          : safeSum(
              liabilities.map((value) => value.amountMinor)
            );
      const dates = [
        ...(asset?.latestAsOf ? [asset.latestAsOf] : []),
        ...liabilities.map((value) => value.asOf),
        ...(liabilityCoverage === "none-confirmed" && review
          ? [review.reviewedAt]
          : [])
      ];
      const range = dateRange(dates);
      return {
        currency,
        recordedAssetsMinor,
        recordedLiabilitiesMinor,
        recordedNetPositionMinor: signedDifference(
          recordedAssetsMinor,
          recordedLiabilitiesMinor
        ),
        assetEntryCount: asset?.entryCount ?? 0,
        liabilityEntryCount: liabilities.length,
        oldestAsOf: range.oldest,
        newestAsOf: range.newest,
        liabilityCoverage
      };
    }
  );
  const assetCoverageComplete =
    portfolio.valuedEntryCount === portfolio.valuableCount;
  const liabilityCoverageComplete =
    noneConfirmed ||
    (activeLiabilities.length > 0 &&
      unvaluedLiabilityIds.length === 0 &&
      portfolio.currencyTotals.every((total) =>
        liabilityGroups.has(total.currency)
      ));
  const exactUnavailable = byCurrency.some(
    (line) =>
      line.recordedAssetsMinor === null ||
      (line.liabilityCoverage !== "unreviewed" &&
        (line.recordedLiabilitiesMinor === null ||
          line.recordedNetPositionMinor === null))
  );
  const hasAnyFinancialRecord =
    portfolio.valuedEntryCount > 0 ||
    activeLiabilities.length > 0 ||
    noneConfirmed;
  let status: NetPositionStatus;
  if (liabilityReviewInvalidated) {
    status = "liabilities-unreviewed";
  } else if (!hasAnyFinancialRecord && portfolio.valuableCount === 0) {
    status = "empty";
  } else if (
    portfolio.valuableCount > 0 &&
    portfolio.valuedEntryCount === 0
  ) {
    status = "assets-unvalued";
  } else if (!liabilityCoverageComplete) {
    status = "liabilities-unreviewed";
  } else if (exactUnavailable) {
    status = "exact-total-unavailable";
  } else if (
    staleAssetSubjectKeys.length > 0 ||
    staleLiabilityIds.length > 0 ||
    liabilityReviewExpired
  ) {
    status = "stale";
  } else if (!assetCoverageComplete) {
    status = "partial";
  } else {
    status = "recorded";
  }

  return {
    status,
    portfolio,
    byCurrency,
    activeLiabilityCount: activeLiabilities.length,
    valuedLiabilityCount:
      activeLiabilities.length - unvaluedLiabilityIds.length,
    unvaluedLiabilityIds,
    staleLiabilityIds,
    staleAssetSubjectKeys,
    assetCoverageComplete,
    liabilityCoverageComplete,
    liabilityReview: review,
    liabilityReviewExpired,
    liabilityReviewInvalidated,
    hasMultipleCurrencies: byCurrency.length > 1
  };
}
