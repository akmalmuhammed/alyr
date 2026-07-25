import { calculateNativeAssetReadiness, workspaceProgress } from "@/domain/readiness";
import { createWorkspace } from "@/domain/sample";
import { addAsset, addPlace, recordRetrieval } from "@/domain/workspace";

function context() {
  let sequence = 0;
  return {
    now: () => "2026-07-25T10:00:00.000Z",
    id: (prefix: string) => `${prefix}-${++sequence}`
  };
}

describe("native Quick Passport domain", () => {
  it("creates a Place and Asset Passport without inventing location precision", () => {
    const initial = createWorkspace("personal", "2026-07-25T09:00:00.000Z");
    const placeResult = addPlace(
      initial,
      {
        name: "West Bay Home",
        addressSummary: "West Bay, Doha",
        regionLabel: "Doha",
        roomName: "Study",
        pin: null
      },
      context()
    );
    expect(placeResult.place.precision).toBe("locality_only");
    expect(placeResult.place.locationSource).toBe("not_set");

    const room = placeResult.place.rooms[0]!;
    const assetResult = addAsset(
      placeResult.workspace,
      {
        name: "GMT-Master II",
        categoryId: "lifestyle.watch",
        categoryLabel: "Watch",
        photo: {
          localUri: "file:///photo.jpg",
          fileName: "photo.jpg",
          mimeType: "image/jpeg",
          byteSize: 1200,
          protectedUri: "file:///protected-photo.alyrblob",
          checksumSha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          encryptedAtRest: true
        },
        locationStatus: "known",
        placeId: placeResult.place.id,
        roomId: room.id,
        locatorText: "Upper drawer",
        evidence: {
          localUri: "file:///receipt.pdf",
          fileName: "receipt.pdf",
          mimeType: "application/pdf",
          byteSize: 2400,
          protectedUri: "file:///protected-receipt.alyrblob",
          checksumSha256:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          encryptedAtRest: true
        }
      },
      context()
    );

    const readiness = calculateNativeAssetReadiness(
      assetResult.asset,
      assetResult.workspace.places,
      assetResult.workspace.evidence
    );
    expect(readiness.percent).toBe(100);
    expect(assetResult.workspace.evidence[0]?.reviewStatus).toBe("pending");
    expect(assetResult.asset.syncStatus).toBe("on-device");
  });

  it("keeps an unknown location as a visible readiness gap", () => {
    const initial = createWorkspace("personal");
    const assetResult = addAsset(
      initial,
      {
        name: "Heirloom ring",
        categoryId: "lifestyle.jewelry",
        categoryLabel: "Jewelry",
        photo: null,
        locationStatus: "unknown",
        placeId: null,
        roomId: null,
        locatorText: null,
        evidence: null
      },
      context()
    );
    const readiness = calculateNativeAssetReadiness(
      assetResult.asset,
      assetResult.workspace.places,
      assetResult.workspace.evidence
    );
    expect(readiness.percent).toBe(25);
    expect(readiness.nextItem?.id).toBe("photo");
  });

  it("records a retrieval without storing query text", () => {
    const initial = createWorkspace("sample");
    const target = initial.assets[0]!;
    const next = recordRetrieval(initial, target.id, context());
    expect(next.activity[0]).toMatchObject({
      type: "asset_retrieved",
      assetId: target.id
    });
    expect(JSON.stringify(next.activity[0])).not.toContain("query");
  });

  it("caps activation progress at the 25-item target", () => {
    const sample = createWorkspace("sample");
    expect(workspaceProgress(sample.assets)).toEqual({
      captured: 7,
      target: 25,
      percent: 28
    });
  });
});
