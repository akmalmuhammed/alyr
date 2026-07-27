import {
  buildPortfolioSnapshot,
  formatPortfolioMoney,
  formatPortfolioMoneyCompact,
  isValidPortfolioValueRecord,
  selectCurrentPortfolioValues,
  type PortfolioValueRecord
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";

const VALUE_TIME = "2026-07-27T10:00:00.000Z";

function value(
  id: string,
  assetId: string,
  amountMinor: number,
  currency: string,
  updatedAt = VALUE_TIME,
  asOf = "2026-07-27T00:00:00.000Z"
): PortfolioValueRecord {
  return {
    id,
    assetId,
    amountMinor,
    currency,
    asOf,
    updatedAt,
    source: "user-entered"
  };
}

describe("portfolio truth model", () => {
  it("reports an empty register as not applicable instead of zero percent", () => {
    const workspace = createWorkspace("personal");
    const snapshot = buildPortfolioSnapshot(workspace);

    expect(snapshot.assetCount).toBe(0);
    expect(snapshot.documentedItems).toEqual({
      complete: 0,
      total: 0,
      percent: null,
      assetIds: []
    });
    expect(snapshot.locationReadyItems.percent).toBeNull();
    expect(snapshot.currencyTotals).toEqual([]);
    expect(snapshot.locationDistribution).toEqual([]);
  });

  it("derives documentation, proof and location coverage from real records", () => {
    const workspace = createWorkspace("sample");
    const snapshot = buildPortfolioSnapshot(workspace);

    expect(snapshot.assetCount).toBe(6);
    expect(snapshot.propertyCount).toBe(2);
    expect(snapshot.valuableCount).toBe(8);
    expect(snapshot.documentedItems.complete).toBe(6);
    expect(snapshot.documentedItems.percent).toBe(100);
    expect(snapshot.proofGapAssetIds).toEqual([]);
    expect(snapshot.locationReadyItems).toMatchObject({
      complete: 5,
      total: 5,
      percent: 100
    });
    expect(snapshot.propertyPinsConfirmed).toMatchObject({
      complete: 2,
      total: 2,
      percent: 100
    });
    expect(snapshot.propertyPinGapPlaceIds).toEqual([]);
    expect(snapshot.pendingProofReviewCount).toBe(1);
    expect(snapshot.pendingProofReviewAssetIds).toEqual(["asset-roadster"]);
    expect(
      snapshot.locationDistribution.map((bucket) => [
        bucket.label,
        bucket.count
      ])
    ).toEqual([
      ["West Bay Home", 4],
      ["Pearl Apartment", 1],
      ["No physical place required", 1]
    ]);
  });

  it("excludes legacy, rented, storage and temporary Places until ownership is explicit", () => {
    const workspace = createWorkspace("sample");
    const [westBay, pearl] = workspace.places;
    const {
      kind: _legacyKind,
      tenure: _legacyTenure,
      ...legacyWestBay
    } = westBay!;
    const snapshot = buildPortfolioSnapshot({
      ...workspace,
      places: [
        legacyWestBay,
        {
          ...pearl!,
          kind: "property",
          tenure: "rented"
        },
        {
          ...pearl!,
          id: "place-storage",
          kind: "storage",
          tenure: "unknown"
        },
        {
          ...pearl!,
          id: "place-temporary",
          kind: "temporary",
          tenure: "unknown"
        }
      ]
    });

    expect(snapshot.propertyCount).toBe(0);
    expect(snapshot.valuableCount).toBe(snapshot.assetCount);
    expect(snapshot.propertyPinsConfirmed).toEqual({
      complete: 0,
      total: 0,
      percent: null,
      placeIds: []
    });
    expect(snapshot.valuedPlaces).toEqual({
      complete: 0,
      total: 0,
      percent: null,
      placeIds: []
    });
    expect(snapshot.recordedValues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectKind: "place" })
      ])
    );
    expect(snapshot.ignoredValueRecordCount).toBeGreaterThanOrEqual(1);
  });

  it("counts only the one Place the household confirmed as owned", () => {
    const workspace = createWorkspace("sample");
    const snapshot = buildPortfolioSnapshot({
      ...workspace,
      places: workspace.places.map((place) =>
        place.id === "place-pearl"
          ? { ...place, tenure: "rented" as const }
          : place
      )
    });

    expect(snapshot.propertyCount).toBe(1);
    expect(snapshot.propertyPinsConfirmed).toMatchObject({
      complete: 1,
      total: 1,
      percent: 100,
      placeIds: ["place-west-bay"]
    });
    expect(snapshot.unvaluedPlaceIds).toEqual([]);
  });

  it("keeps unconfirmed property pins visible as a separate truth gap", () => {
    const workspace = createWorkspace("sample");
    const pearl = workspace.places.find(
      (place) => place.id === "place-pearl"
    );
    expect(pearl).toBeDefined();

    const snapshot = buildPortfolioSnapshot({
      ...workspace,
      places: workspace.places.map((place) =>
        place.id === pearl?.id
          ? {
              ...place,
              confirmedAt: null
            }
          : place
      )
    });

    expect(snapshot.propertyPinsConfirmed).toMatchObject({
      complete: 1,
      total: 2,
      percent: 50,
      placeIds: ["place-west-bay"]
    });
    expect(snapshot.propertyPinGapPlaceIds).toEqual([
      "place-pearl"
    ]);
  });

  it("uses only the latest user-entered value and keeps currencies separate", () => {
    const workspace = createWorkspace("sample");
    const values = [
      value(
        "gmt-old",
        "asset-gmt",
        900_000,
        "USD",
        "2026-07-26T10:00:00.000Z"
      ),
      value("gmt-current", "asset-gmt", 123_450, "qar"),
      value("heritage-current", "asset-heritage", 500_000, "QAR"),
      value("car-current", "asset-roadster", 2_000_000, "USD")
    ];
    const snapshot = buildPortfolioSnapshot(workspace, values);

    expect(snapshot.valuedItems.complete).toBe(3);
    expect(snapshot.unvaluedAssetIds).toHaveLength(3);
    expect(snapshot.currencyTotals).toEqual([
      {
        currency: "QAR",
        amountMinor: 623_450,
        assetCount: 2,
        placeCount: 0,
        entryCount: 2,
        latestAsOf: "2026-07-27T00:00:00.000Z"
      },
      {
        currency: "USD",
        amountMinor: 2_000_000,
        assetCount: 1,
        placeCount: 0,
        entryCount: 1,
        latestAsOf: "2026-07-27T00:00:00.000Z"
      }
    ]);
    expect(snapshot.recordedValues.map((item) => item.currency)).toEqual([
      "QAR",
      "QAR",
      "USD"
    ]);
    expect(
      snapshot.recordedValues.find(
        (item) => item.assetId === "asset-gmt"
      )?.amountMinor
    ).toBe(123_450);
  });

  it("excludes invalid, non-user and deleted-asset values from every total", () => {
    const workspace = createWorkspace("sample");
    const invalid = [
      {
        ...value("negative", "asset-gmt", 10_000, "QAR"),
        amountMinor: -1
      },
      value("orphan", "deleted-asset", 10_000, "QAR"),
      {
        ...value("market", "asset-heritage", 20_000, "QAR"),
        source: "market-feed"
      }
    ] as unknown as PortfolioValueRecord[];
    const valid = value("valid", "asset-gmt", 30_000, "QAR");
    const snapshot = buildPortfolioSnapshot(workspace, [
      ...invalid,
      valid
    ]);

    expect(snapshot.ignoredValueRecordCount).toBe(3);
    expect(snapshot.currencyTotals).toEqual([
      expect.objectContaining({
        currency: "QAR",
        amountMinor: 30_000,
        assetCount: 1
      })
    ]);
  });

  it("does not display an inexact currency total after safe-integer overflow", () => {
    const workspace = createWorkspace("sample");
    const snapshot = buildPortfolioSnapshot(workspace, [
      value("one", "asset-gmt", Number.MAX_SAFE_INTEGER, "QAR"),
      value("two", "asset-heritage", 1, "QAR")
    ]);

    expect(snapshot.currencyTotals[0]?.amountMinor).toBeNull();
    expect(snapshot.uncalculableCurrencyCount).toBe(1);
    expect(snapshot.recordedValues).toHaveLength(2);
  });

  it("normalizes currency and resolves same-time edits deterministically", () => {
    const workspace = createWorkspace("sample");
    const selected = selectCurrentPortfolioValues(workspace.assets, [
      value("a", "asset-gmt", 10_000, " qar "),
      value("b", "asset-gmt", 11_000, "QAR")
    ]);

    expect(selected.ignoredCount).toBe(0);
    expect(selected.records).toEqual([
      expect.objectContaining({
        id: "b",
        amountMinor: 11_000,
        currency: "QAR"
      })
    ]);
  });

  it("selects the latest dated value even when an older appraisal is entered later", () => {
    const workspace = createWorkspace("sample");
    const selected = selectCurrentPortfolioValues(workspace.assets, [
      value(
        "newer-as-of",
        "asset-gmt",
        15_000,
        "QAR",
        "2026-07-26T08:00:00.000Z",
        "2026-07-25T00:00:00.000Z"
      ),
      value(
        "older-as-of-entered-later",
        "asset-gmt",
        10_000,
        "QAR",
        "2026-07-27T08:00:00.000Z",
        "2026-07-20T00:00:00.000Z"
      )
    ]);

    expect(selected.records).toEqual([
      expect.objectContaining({
        id: "newer-as-of",
        amountMinor: 15_000,
        asOf: "2026-07-25T00:00:00.000Z"
      })
    ]);
  });

  it("validates serializable value records and formats currency minor units", () => {
    expect(isValidPortfolioValueRecord(value("valid", "asset-gmt", 0, "QAR"))).toBe(
      true
    );
    expect(
      isValidPortfolioValueRecord({
        ...value("fraction", "asset-gmt", 1, "QAR"),
        amountMinor: 1.25
      })
    ).toBe(false);

    const qar = formatPortfolioMoney(123_450, "QAR", "en-QA");
    expect(qar).toContain("QAR");
    expect(qar).toContain("1,234.50");

    const jpy = formatPortfolioMoney(1234, "JPY", "en");
    expect(jpy).toContain("JPY");
    expect(jpy).toContain("1,234");
    expect(jpy).not.toContain(".00");

    const compact = formatPortfolioMoneyCompact(
      719_750_000,
      "QAR",
      "en-QA"
    );
    expect(compact).toContain("QAR");
    expect(compact).toContain("7.2M");
  });
});
