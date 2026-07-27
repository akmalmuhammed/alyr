import type { NativeWorkspace } from "@/domain/model";
import {
  buildPortfolioSnapshot,
  getPortfolioValueHistory,
  isValidPortfolioValueRecord,
  portfolioValueSubject,
  recordPortfolioValue,
  selectCurrentPortfolioValues,
  type PortfolioValueRecord
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import { createPortfolioValueOperation } from "@/state/WorkspaceProvider";

const NOW = "2026-07-27T12:00:00.000Z";

function context(id: string, now = NOW) {
  return {
    id: () => id,
    now: () => now,
    today: () => "2026-07-27"
  };
}

describe("property Portfolio value assertions", () => {
  it("records a Place as a discriminated on-device subject", () => {
    const workspace: NativeWorkspace = {
      ...createWorkspace("sample"),
      portfolioValueRecords: []
    };
    const place = workspace.places[0]!;
    const result = recordPortfolioValue(
      workspace,
      {
        placeId: place.id,
        amountMinor: 675_000_000,
        currency: "qar",
        asOf: "2026-07-18"
      },
      context("place-value")
    );

    expect(result.record).toMatchObject({
      id: "place-value",
      subject: { kind: "place", placeId: place.id },
      placeId: place.id,
      amountMinor: 675_000_000,
      currency: "QAR",
      source: "user-entered",
      syncStatus: "on-device"
    });
    expect(result.record.assetId).toBeUndefined();
    expect(portfolioValueSubject(result.record)).toEqual({
      kind: "place",
      placeId: place.id
    });
    expect(isValidPortfolioValueRecord(result.record)).toBe(true);
  });

  it("builds a durable property-value operation with one explicit subject", () => {
    const workspace: NativeWorkspace = {
      ...createWorkspace("sample"),
      mode: "personal",
      portfolioValueRecords: []
    };
    const place = workspace.places[0]!;
    const result = recordPortfolioValue(
      workspace,
      {
        placeId: place.id,
        amountMinor: 675_000_000,
        currency: "QAR",
        asOf: "2026-07-18"
      },
      context("property-value-operation")
    );

    const operation = createPortfolioValueOperation(
      workspace,
      result.record,
      {
        operationId: () => "operation-property-value",
        idempotencyKey: () => "idempotency-property-value"
      }
    );

    expect(operation).toMatchObject({
      operationId: "operation-property-value",
      householdId: workspace.household.id,
      status: "on-device",
      command: {
        type: "value.create",
        aggregateId: result.record.id,
        observedVersion: 0,
        idempotencyKey: "idempotency-property-value",
        payload: {
          placeId: place.id,
          amountMinor: 675_000_000,
          currency: "QAR",
          asOf: "2026-07-18",
          source: "user-entered"
        }
      }
    });
    expect(operation.command.payload).not.toHaveProperty("assetId");
  });

  it("keeps property history and selects the latest as-of date", () => {
    const workspace: NativeWorkspace = {
      ...createWorkspace("sample"),
      portfolioValueRecords: []
    };
    const place = workspace.places[0]!;
    const first = recordPortfolioValue(
      workspace,
      {
        placeId: place.id,
        amountMinor: 600_000_000,
        currency: "QAR",
        asOf: "2026-07-20"
      },
      context("place-old", "2026-07-26T09:00:00.000Z")
    );
    const second = recordPortfolioValue(
      first.workspace,
      {
        placeId: place.id,
        amountMinor: 590_000_000,
        currency: "QAR",
        asOf: "2026-07-18"
      },
      context("place-entered-later", NOW)
    );

    expect(
      getPortfolioValueHistory(second.workspace, {
        kind: "place",
        placeId: place.id
      }).map((record) => record.id)
    ).toEqual(["place-old", "place-entered-later"]);
    expect(
      selectCurrentPortfolioValues(
        [],
        second.workspace.portfolioValueRecords as PortfolioValueRecord[],
        [place]
      ).records[0]
    ).toMatchObject({
      id: "place-old",
      amountMinor: 600_000_000,
      asOf: "2026-07-20"
    });
  });

  it("counts properties independently and never mixes currencies", () => {
    const sample = createWorkspace("sample");
    const workspace: NativeWorkspace = {
      ...sample,
      portfolioValueRecords: []
    };
    const place = workspace.places[0]!;
    const asset = workspace.assets.find(
      (candidate) => candidate.id === "asset-gmt"
    )!;
    const propertyValue = recordPortfolioValue(
      workspace,
      {
        placeId: place.id,
        amountMinor: 650_000_000,
        currency: "QAR",
        asOf: "2026-07-20"
      },
      context("property-qar")
    );
    const itemValue = recordPortfolioValue(
      propertyValue.workspace,
      {
        assetId: asset.id,
        amountMinor: 12_500_000,
        currency: "USD",
        asOf: "2026-07-21"
      },
      context("item-usd")
    );
    const snapshot = buildPortfolioSnapshot(itemValue.workspace);

    expect(snapshot.propertyCount).toBe(2);
    expect(snapshot.valuedPlaces).toMatchObject({
      complete: 1,
      total: 2,
      percent: 50,
      placeIds: [place.id]
    });
    expect(snapshot.valuedEntryCount).toBe(2);
    expect(snapshot.currencyTotals).toEqual([
      {
        currency: "QAR",
        amountMinor: 650_000_000,
        assetCount: 0,
        placeCount: 1,
        entryCount: 1,
        latestAsOf: "2026-07-20"
      },
      {
        currency: "USD",
        amountMinor: 12_500_000,
        assetCount: 1,
        placeCount: 0,
        entryCount: 1,
        latestAsOf: "2026-07-21"
      }
    ]);
    expect(snapshot.recordedValues.map((entry) => entry.subjectKind)).toEqual([
      "place",
      "asset"
    ]);
  });

  it("rejects ambiguous subjects, mismatched aliases and legacy property Assets", () => {
    const workspace = createWorkspace("sample");
    const place = workspace.places[0]!;
    const legacyPropertyAsset = {
      ...workspace.assets[0]!,
      id: "legacy-property-asset",
      name: "Legacy property fixture",
      categoryId: "property.house",
      categoryLabel: "Real estate",
      visualKind: "property" as const,
      placeId: workspace.places[1]!.id,
      roomId: null,
      locatorText: "Legacy confirmed pin"
    };
    const workspaceWithLegacyProperty: NativeWorkspace = {
      ...workspace,
      assets: [...workspace.assets, legacyPropertyAsset]
    };
    const ambiguous = {
      id: "ambiguous",
      subject: { kind: "place", placeId: place.id },
      placeId: place.id,
      assetId: workspace.assets[0]!.id,
      amountMinor: 1,
      currency: "QAR",
      asOf: "2026-07-20",
      updatedAt: NOW,
      source: "user-entered"
    };
    const mismatched = {
      ...ambiguous,
      id: "mismatch",
      assetId: undefined,
      placeId: workspace.places[1]!.id
    };

    expect(isValidPortfolioValueRecord(ambiguous)).toBe(false);
    expect(isValidPortfolioValueRecord(mismatched)).toBe(false);
    expect(() =>
      recordPortfolioValue(
        workspaceWithLegacyProperty,
        {
          assetId: legacyPropertyAsset.id,
          amountMinor: 1,
          currency: "QAR",
          asOf: "2026-07-20"
        },
        context("legacy-property")
      )
    ).toThrow("current household");
  });

  it("rejects new value assertions for unconfirmed and non-owned Places", () => {
    const workspace = createWorkspace("sample");
    const owned = workspace.places[0]!;
    const {
      kind: _legacyKind,
      tenure: _legacyTenure,
      ...legacyPlace
    } = owned;
    const candidates = [
      legacyPlace,
      { ...owned, kind: "property" as const, tenure: "rented" as const },
      { ...owned, kind: "storage" as const, tenure: "unknown" as const },
      { ...owned, kind: "temporary" as const, tenure: "unknown" as const }
    ];

    for (const candidate of candidates) {
      const scoped: NativeWorkspace = {
        ...workspace,
        places: [candidate]
      };
      expect(() =>
        recordPortfolioValue(
          scoped,
          {
            placeId: candidate.id,
            amountMinor: 1_000_000,
            currency: "QAR",
            asOf: "2026-07-20"
          },
          context(`value-${candidate.kind ?? "legacy"}`)
        )
      ).toThrow("property is not available");
    }
  });

  it("ignores a retained value when an owned Place becomes non-owned", () => {
    const workspace = createWorkspace("sample");
    const place = workspace.places[0]!;
    const recorded = recordPortfolioValue(
      {
        ...workspace,
        portfolioValueRecords: []
      },
      {
        placeId: place.id,
        amountMinor: 650_000_000,
        currency: "QAR",
        asOf: "2026-07-20"
      },
      context("owned-value")
    );
    const rentedPlace = {
      ...place,
      kind: "property" as const,
      tenure: "rented" as const
    };

    const selected = selectCurrentPortfolioValues(
      [],
      recorded.workspace
        .portfolioValueRecords as PortfolioValueRecord[],
      [rentedPlace]
    );

    expect(selected.records).toEqual([]);
    expect(selected.ignoredCount).toBe(1);
  });
});
