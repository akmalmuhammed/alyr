import { createLiability } from "@/domain/liabilities";
import type {
  NativeAsset,
  NativePlace,
  NativeWorkspace
} from "@/domain/model";
import {
  buildPortfolioSnapshot,
  getPortfolioValueRecords,
  recordPortfolioValue
} from "@/domain/portfolio";
import { calculateNativeAssetReadiness } from "@/domain/readiness";
import { createWorkspace } from "@/domain/sample";
import { buildTodayRegisterHealth } from "@/domain/today";

const NOW = "2026-07-28T10:00:00.000Z";

function ownedProperty(
  overrides: Partial<NativePlace> = {}
): NativePlace {
  const workspace = createWorkspace("personal", NOW);
  return {
    id: "property-home",
    householdId: workspace.household.id,
    version: 1,
    name: "West Bay home",
    kind: "property",
    tenure: "owned",
    addressSummary: "West Bay",
    regionLabel: "Doha",
    latitude: 25.32,
    longitude: 51.53,
    locationSource: "user_pin",
    precision: "user_placed",
    horizontalAccuracyMeters: null,
    observedAt: NOW,
    confirmedAt: NOW,
    rooms: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function withPlaces(
  workspace: NativeWorkspace,
  places: readonly NativePlace[]
): NativeWorkspace {
  return { ...workspace, places: [...places] };
}

describe("Today cross-record register health", () => {
  it("makes a property-first register ready only after a precise pin is confirmed", () => {
    const personal = createWorkspace("personal", NOW);
    const unresolved = withPlaces(personal, [
      ownedProperty({ confirmedAt: null })
    ]);

    expect(
      buildTodayRegisterHealth(unresolved, [], "2026-07-28")
    ).toMatchObject({
      readinessPercent: 0,
      recordCount: 1,
      tasks: [
        expect.objectContaining({
          kind: "property-pin",
          id: "property-pin:property-home"
        })
      ]
    });

    expect(
      buildTodayRegisterHealth(
        withPlaces(personal, [ownedProperty()]),
        [],
        "2026-07-28"
      )
    ).toMatchObject({
      readinessPercent: 100,
      recordCount: 1,
      tasks: []
    });
  });

  it("makes a liability-first register actionable until a current balance exists", () => {
    const created = createLiability(
      createWorkspace("personal", NOW),
      { name: "Home finance", kind: "mortgage" },
      {
        id: () => "liability-home",
        now: () => NOW,
        today: () => "2026-07-28"
      }
    );
    const missing = buildTodayRegisterHealth(
      created.workspace,
      [],
      "2026-07-28"
    );

    expect(missing).toMatchObject({
      readinessPercent: 0,
      recordCount: 1,
      tasks: [
        expect.objectContaining({
          kind: "liability-balance",
          state: "missing"
        })
      ]
    });

    const valued = recordPortfolioValue(
      created.workspace,
      {
        liabilityId: created.liability.id,
        amountMinor: 1_000_000,
        currency: "QAR",
        asOf: "2026-07-28"
      },
      {
        id: () => "balance-home",
        now: () => NOW,
        today: () => "2026-07-28"
      }
    );
    expect(
      buildTodayRegisterHealth(
        valued.workspace,
        getPortfolioValueRecords(valued.workspace),
        "2026-07-28"
      )
    ).toMatchObject({
      readinessPercent: 100,
      recordCount: 1,
      tasks: []
    });
  });

  it("does not count an obsolete no-liabilities acknowledgement beside an active liability", () => {
    const personal = createWorkspace("personal", NOW);
    const withHistoricalReview = {
      ...personal,
      liabilityReview: {
        id: "review-none",
        householdId: personal.household.id,
        version: 1,
        status: "none-confirmed" as const,
        reviewedAt: "2026-01-01",
        expiresAt: "2026-04-01",
        activityWatermark: "old",
        syncStatus: "on-device" as const,
        updatedAt: "2026-01-01T10:00:00.000Z"
      }
    };
    const created = createLiability(
      withHistoricalReview,
      { name: "Home finance", kind: "mortgage" },
      {
        id: () => "liability-home",
        now: () => NOW,
        today: () => "2026-07-28"
      }
    );

    const health = buildTodayRegisterHealth(
      created.workspace,
      [],
      "2026-07-28"
    );
    expect(health.readinessPercent).toBe(0);
    expect(
      health.tasks.filter(
        (task) => task.kind === "liability-review"
      )
    ).toHaveLength(0);
    expect(health.tasks).toEqual([
      expect.objectContaining({
        kind: "liability-balance",
        state: "missing"
      })
    ]);
  });

  it("adds freshness debt only after the household opts into a value", () => {
    const propertyWorkspace = withPlaces(
      createWorkspace("personal", NOW),
      [ownedProperty()]
    );
    const valued = recordPortfolioValue(
      propertyWorkspace,
      {
        placeId: "property-home",
        amountMinor: 300_000_000,
        currency: "QAR",
        asOf: "2025-01-01"
      },
      {
        id: () => "value-home",
        now: () => NOW,
        today: () => "2026-07-28"
      }
    );

    expect(
      buildTodayRegisterHealth(
        valued.workspace,
        getPortfolioValueRecords(valued.workspace),
        "2027-07-28"
      )
    ).toMatchObject({
      readinessPercent: 50,
      recordCount: 1,
      tasks: [
        expect.objectContaining({
          kind: "recorded-value-review",
          name: "West Bay home"
        })
      ]
    });
  });

  it("uses the same confirmed-pin truth for Today Passport and Portfolio location readiness", () => {
    const place = ownedProperty({
      id: "place-home",
      confirmedAt: null,
      rooms: [
        {
          id: "room-study",
          version: 1,
          name: "Study",
          kind: "room",
          parentRoomId: null
        }
      ]
    });
    const workspace = withPlaces(
      createWorkspace("personal", NOW),
      [place]
    );
    const asset: NativeAsset = {
      id: "asset-watch",
      version: 1,
      householdId: workspace.household.id,
      name: "GMT watch",
      categoryId: "collectible.watch",
      categoryLabel: "Watch",
      photoUri: null,
      photoProtectedUri: null,
      photoChecksumSha256: null,
      photoEvidenceId: null,
      locationStatus: "known",
      placeId: place.id,
      roomId: "room-study",
      locatorText: "Top drawer",
      evidenceIds: [],
      lifecycleStatus: "active",
      archivedAt: null,
      syncStatus: "on-device",
      createdAt: NOW,
      updatedAt: NOW
    };
    const unresolved = { ...workspace, assets: [asset] };
    const todayReadiness = calculateNativeAssetReadiness(
      asset,
      unresolved.places,
      []
    );
    const portfolioReadiness = buildPortfolioSnapshot(unresolved, []);

    expect(
      todayReadiness.items.find((item) => item.id === "location")
        ?.complete
    ).toBe(false);
    expect(portfolioReadiness.locationReadyItems.complete).toBe(0);
    expect(portfolioReadiness.locationGapAssetIds).toEqual([
      asset.id
    ]);

    const confirmed = {
      ...unresolved,
      places: [{ ...place, confirmedAt: NOW }]
    };
    expect(
      calculateNativeAssetReadiness(
        asset,
        confirmed.places,
        []
      ).items.find((item) => item.id === "location")?.complete
    ).toBe(true);
    expect(
      buildPortfolioSnapshot(confirmed, []).locationReadyItems.complete
    ).toBe(1);
  });
});
