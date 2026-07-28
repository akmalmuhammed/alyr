import type { NativeWorkspace } from "@/domain/model";
import {
  formatPortfolioMoney,
  getPortfolioValueHistory,
  getPortfolioValueRecords,
  parsePortfolioMoney,
  portfolioMinorUnitsToInput,
  recordPortfolioValue,
  selectCurrentPortfolioValues
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";

function context(
  now = "2026-07-27T12:00:00.000Z"
) {
  let sequence = 0;
  return {
    now: () => now,
    id: () => `value-${++sequence}`
  };
}

describe("recorded asset value domain", () => {
  it("parses decimal input into exact QAR minor units", () => {
    expect(parsePortfolioMoney("123456789.09", "qar")).toEqual({
      ok: true,
      amountMinor: 12_345_678_909,
      currency: "QAR",
      fractionDigits: 2
    });
    expect(parsePortfolioMoney("١٢٣٤٫٥٠", "QAR")).toEqual({
      ok: true,
      amountMinor: 123_450,
      currency: "QAR",
      fractionDigits: 2
    });
  });

  it("uses each currency's minor-unit contract without floating point", () => {
    expect(parsePortfolioMoney("1.234", "KWD")).toMatchObject({
      ok: true,
      amountMinor: 1234,
      fractionDigits: 3
    });
    expect(parsePortfolioMoney("1234", "JPY")).toMatchObject({
      ok: true,
      amountMinor: 1234,
      fractionDigits: 0
    });
    expect(parsePortfolioMoney("1.2", "QAR")).toMatchObject({
      ok: true,
      amountMinor: 120
    });
  });

  it("rejects ambiguous, over-precise and inexact values", () => {
    expect(parsePortfolioMoney("1,234.50", "QAR")).toMatchObject({
      ok: false,
      errorCode: "invalid-characters"
    });
    expect(parsePortfolioMoney("1.001", "QAR")).toMatchObject({
      ok: false,
      errorCode: "fraction-digits",
      currency: "QAR",
      fractionDigits: 2
    });
    expect(parsePortfolioMoney("1.00", "JPY")).toMatchObject({
      ok: false
    });
    expect(parsePortfolioMoney("-1", "QAR")).toMatchObject({
      ok: false
    });
    expect(parsePortfolioMoney("1e3", "QAR")).toMatchObject({
      ok: false
    });
    expect(
      parsePortfolioMoney("90071992547409.92", "QAR")
    ).toMatchObject({ ok: false });
  });

  it("round-trips the exact maximum supported minor-unit integer", () => {
    const parsed = parsePortfolioMoney(
      "90071992547409.91",
      "QAR"
    );
    expect(parsed).toEqual({
      ok: true,
      amountMinor: Number.MAX_SAFE_INTEGER,
      currency: "QAR",
      fractionDigits: 2
    });
    expect(
      portfolioMinorUnitsToInput(Number.MAX_SAFE_INTEGER, "QAR")
    ).toBe("90071992547409.91");
    expect(
      formatPortfolioMoney(Number.MAX_SAFE_INTEGER, "QAR", "en-QA")
    ).toBe("QAR 90,071,992,547,409.91");
  });

  it("appends replacement assertions and retains the complete history", () => {
    const workspace: NativeWorkspace = {
      ...createWorkspace("sample"),
      portfolioValueRecords: []
    };
    const asset = workspace.assets[0]!;
    const ids = context();
    const first = recordPortfolioValue(
      workspace,
      {
        assetId: asset.id,
        amountMinor: 125_000,
        currency: "qar",
        asOf: "2026-07-20"
      },
      ids
    );
    const second = recordPortfolioValue(
      first.workspace,
      {
        assetId: asset.id,
        amountMinor: 130_000,
        currency: "QAR",
        asOf: "2026-07-27"
      },
      {
        now: () => "2026-07-27T13:00:00.000Z",
        id: () => "value-current"
      }
    );

    expect(getPortfolioValueRecords(second.workspace)).toHaveLength(2);
    expect(
      getPortfolioValueHistory(second.workspace, asset.id).map(
        (record) => record.amountMinor
      )
    ).toEqual([130_000, 125_000]);
    expect(
      selectCurrentPortfolioValues(
        second.workspace.assets,
        getPortfolioValueRecords(second.workspace)
      ).records[0]
    ).toMatchObject({
      id: "value-current",
      amountMinor: 130_000
    });
  });

  it("survives JSON persistence without requiring a schema reset", () => {
    const workspace = createWorkspace("personal");
    const sampleAsset = createWorkspace("sample").assets[0]!;
    const seeded: NativeWorkspace = {
      ...workspace,
      assets: [
        {
          ...sampleAsset,
          householdId: workspace.household.id
        }
      ]
    };
    const result = recordPortfolioValue(
      seeded,
      {
        assetId: sampleAsset.id,
        amountMinor: 42_500,
        currency: "QAR",
        asOf: "2026-07-27"
      },
      context()
    );
    const restored = JSON.parse(
      JSON.stringify(result.workspace)
    ) as NativeWorkspace;

    expect(restored.schemaVersion).toBe(workspace.schemaVersion);
    expect(getPortfolioValueRecords(restored)).toEqual([
      expect.objectContaining({
        assetId: sampleAsset.id,
        amountMinor: 42_500,
        source: "user-entered"
      })
    ]);
  });

  it("rejects future dates and assets outside the current household", () => {
    const workspace = createWorkspace("sample");
    expect(() =>
      recordPortfolioValue(
        workspace,
        {
          assetId: workspace.assets[0]!.id,
          amountMinor: 100,
          currency: "QAR",
          asOf: "2026-07-28"
        },
        context()
      )
    ).toThrow("cannot be in the future");
    expect(() =>
      recordPortfolioValue(
        workspace,
        {
          assetId: "missing-asset",
          amountMinor: 100,
          currency: "QAR",
          asOf: "2026-07-27"
        },
        context()
      )
    ).toThrow("current household");
  });

  it("does not create a financial assertion for an important document", () => {
    const personal = createWorkspace("personal");
    const basis = createWorkspace("sample").assets[0]!;
    const workspace: NativeWorkspace = {
      ...personal,
      assets: [
        {
          ...basis,
          id: "asset-important-document",
          householdId: personal.household.id,
          name: "Family certificate",
          categoryId: "document.important",
          categoryLabel: "Important document",
          locationStatus: "known",
          placeId: null,
          roomId: null,
          locatorText: null
        }
      ]
    };

    expect(() =>
      recordPortfolioValue(
        workspace,
        {
          assetId: "asset-important-document",
          amountMinor: 100,
          currency: "QAR",
          asOf: "2026-07-27"
        },
        context()
      )
    ).toThrow("does not use a portfolio value");
    expect(getPortfolioValueRecords(workspace)).toEqual([]);
  });
});
