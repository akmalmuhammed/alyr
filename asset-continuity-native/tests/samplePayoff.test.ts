import { assetFallbackKind } from "@/components/AssetArtwork";
import { isAssetActive } from "@/domain/model";
import {
  buildPortfolioSnapshot,
  getPortfolioValueRecords
} from "@/domain/portfolio";
import { calculateNativeAssetReadiness } from "@/domain/readiness";
import {
  createWorkspace,
  SAMPLE_PORTFOLIO_VALUES
} from "@/domain/sample";

describe("sample workspace payoff", () => {
  it("opens with a varied, privacy-safe continuity register", () => {
    const workspace = createWorkspace("sample");
    const activeAssets = workspace.assets.filter(isAssetActive);
    const archivedAssets = workspace.assets.filter(
      (asset) => !isAssetActive(asset)
    );

    expect(workspace.assets.length).toBeGreaterThanOrEqual(7);
    expect(workspace.assets.length).toBeLessThanOrEqual(9);
    expect(activeAssets).toHaveLength(6);
    expect(archivedAssets).toEqual([
      expect.objectContaining({
        id: "asset-camera",
        lifecycleStatus: "archived"
      })
    ]);
    expect(
      workspace.assets.find((asset) => asset.id === "asset-childhood")
    ).toMatchObject({
      name: "Childhood train set",
      visualKind: "childhood",
      locatorText: "Red archive box"
    });
    expect(JSON.stringify(workspace)).not.toMatch(/https?:\/\//u);
    expect(
      workspace.evidence.every((evidence) => evidence.localUri === null)
    ).toBe(true);
    expect(
      workspace.assets.some((asset) =>
        asset.categoryId.startsWith("property.")
      )
    ).toBe(false);
    expect(
      workspace.evidence.some((evidence) => evidence.assetId === "asset-title")
    ).toBe(false);
  });

  it("demonstrates measured GPS and a user-adjusted property pin honestly", () => {
    const workspace = createWorkspace("sample");
    const measured = workspace.places.find(
      (place) => place.id === "place-west-bay"
    );
    const adjusted = workspace.places.find(
      (place) => place.id === "place-pearl"
    );

    expect(measured).toMatchObject({
      locationSource: "device_gps",
      precision: "exact",
      horizontalAccuracyMeters: 6.8
    });
    expect(adjusted).toMatchObject({
      locationSource: "user_pin",
      precision: "user_placed",
      horizontalAccuracyMeters: null
    });
    expect(measured?.confirmedAt).toBeTruthy();
    expect(adjusted?.confirmedAt).toBeTruthy();
  });

  it("has complete Passports, item proof, property documents, and one photo task", () => {
    const workspace = createWorkspace("sample");
    const activeAssets = workspace.assets.filter(isAssetActive);
    const readiness = activeAssets.map((asset) => ({
      asset,
      readiness: calculateNativeAssetReadiness(
        asset,
        workspace.places,
        workspace.evidence
      )
    }));
    const photoTasks = readiness.filter(
      (item) => item.readiness.nextItem?.id === "photo"
    );
    const complete = readiness.filter(
      (item) => item.readiness.percent === 100
    );

    expect(photoTasks).toEqual([
      expect.objectContaining({
        asset: expect.objectContaining({ id: "asset-childhood" })
      })
    ]);
    expect(complete).toHaveLength(5);
    expect(
      complete.find((item) => item.asset.id === "asset-gmt")?.readiness
    ).toMatchObject({ percent: 100, nextItem: null });
    expect(
      workspace.evidence.some(
        (item) =>
          item.relation === "ownership" &&
          item.fileName.includes("receipt")
      )
    ).toBe(true);
    expect(workspace.placeDocuments).toEqual([
      expect.objectContaining({
        id: "place-doc-pearl-title",
        placeId: "place-pearl",
        fileName: "pearl-title-record.pdf",
        storageState: "on-device"
      }),
      expect.objectContaining({
        id: "place-doc-pearl-insurance",
        placeId: "place-pearl",
        fileName: "pearl-home-insurance.pdf",
        storageState: "on-device"
      })
    ]);
    expect(
      workspace.evidence.find((item) => item.id === "evidence-roadster")
    ).toMatchObject({
      reviewStatus: "pending",
      expiresAt: "2026-08-15T21:00:00.000Z"
    });
  });

  it("shows exact QAR and USD sample assertions as separate totals", () => {
    const workspace = createWorkspace("sample");
    const values = getPortfolioValueRecords(workspace);
    const snapshot = buildPortfolioSnapshot(workspace);

    expect(values).toEqual(SAMPLE_PORTFOLIO_VALUES);
    expect(new Set(values.map((value) => value.currency))).toEqual(
      new Set(["QAR", "USD"])
    );
    expect(snapshot.currencyTotals).toEqual([
      {
        currency: "QAR",
        amountMinor: 719_750_000,
        assetCount: 3,
        placeCount: 1,
        entryCount: 4,
        latestAsOf: "2026-07-21T00:00:00.000Z"
      },
      {
        currency: "USD",
        amountMinor: 1_370_000,
        assetCount: 2,
        placeCount: 0,
        entryCount: 2,
        latestAsOf: "2026-07-22T00:00:00.000Z"
      }
    ]);
    expect(snapshot.valuedItems).toMatchObject({
      complete: 5,
      total: 6,
      percent: 83
    });
    expect(snapshot.valuedPlaces).toMatchObject({
      complete: 1,
      total: 2,
      percent: 50
    });
    expect(snapshot.valuedEntryCount).toBe(6);
  });

  it("uses deliberate category artwork when source images are unavailable", () => {
    const workspace = createWorkspace("sample");
    const byId = new Map(
      workspace.assets.map((asset) => [asset.id, asset])
    );

    expect(assetFallbackKind(byId.get("asset-gmt")!)).toBe("watch");
    expect(assetFallbackKind(byId.get("asset-heritage")!)).toBe(
      "heirloom"
    );
    expect(assetFallbackKind(byId.get("asset-childhood")!)).toBe(
      "childhood"
    );
    expect(assetFallbackKind(byId.get("asset-camera")!)).toBe("camera");
  });

  it("preserves the truly empty personal starting state", () => {
    const workspace = createWorkspace("personal");

    expect(workspace.assets).toEqual([]);
    expect(workspace.places).toEqual([]);
    expect(workspace.evidence).toEqual([]);
    expect(getPortfolioValueRecords(workspace)).toEqual([]);
    expect(buildPortfolioSnapshot(workspace).assetCount).toBe(0);
  });
});
