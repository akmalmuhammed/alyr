import { calculateNativeAssetReadiness, workspaceProgress } from "@/domain/readiness";
import { createWorkspace } from "@/domain/sample";
import {
  addAsset,
  addPlace,
  recordRetrieval,
  updateAsset,
  updatePlacePin
} from "@/domain/workspace";
import { classifyRuntime } from "@/runtime/environment";

function context() {
  let sequence = 0;
  return {
    now: () => "2026-07-25T10:00:00.000Z",
    id: (prefix: string) => `${prefix}-${++sequence}`
  };
}

describe("native Quick Passport domain", () => {
  it("keeps Expo Go in preview while signed native builds remain secure", () => {
    expect(
      classifyRuntime({
        expoGo: true,
        platform: "ios",
        test: false
      })
    ).toBe("expo-go-preview");
    expect(
      classifyRuntime({
        expoGo: false,
        platform: "ios",
        test: false
      })
    ).toBe("native-secure");
  });

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

  it("updates a property pin with provenance and a monotonic record version", () => {
    const initial = createWorkspace("sample");
    const previous = initial.places[0]!;
    const result = updatePlacePin(
      initial,
      {
        placeId: previous.id,
        pin: {
          latitude: 25.2854,
          longitude: 51.531,
          source: "user_pin",
          precision: "user_placed",
          horizontalAccuracyMeters: null,
          observedAt: "2026-07-25T09:59:00.000Z",
          confirmedAt: "2026-07-25T10:00:00.000Z"
        }
      },
      context()
    );

    expect(result.previousPlace).toBe(previous);
    expect(result.place).toMatchObject({
      version: previous.version + 1,
      latitude: 25.2854,
      longitude: 51.531,
      locationSource: "user_pin",
      precision: "user_placed",
      horizontalAccuracyMeters: null
    });
    expect(result.workspace.activity[0]).toMatchObject({
      type: "place_updated",
      placeId: previous.id
    });
  });

  it("requires explicit pin confirmation and can intentionally clear a pin", () => {
    const initial = createWorkspace("sample");
    const previous = initial.places[0]!;

    expect(() =>
      updatePlacePin(
        initial,
        {
          placeId: previous.id,
          pin: {
            latitude: 25.2854,
            longitude: 51.531,
            source: "manual_coordinates",
            precision: "user_placed",
            horizontalAccuracyMeters: null,
            observedAt: "2026-07-25T09:59:00.000Z",
            confirmedAt: null
          }
        },
        context()
      )
    ).toThrow("Confirm the visible property pin");

    const cleared = updatePlacePin(
      initial,
      { placeId: previous.id, pin: null },
      context()
    );
    expect(cleared.place).toMatchObject({
      latitude: null,
      longitude: null,
      locationSource: "not_set",
      precision: "locality_only",
      confirmedAt: null
    });
  });

  it("keeps an unknown physical location as a visible readiness gap", () => {
    const initial = createWorkspace("personal");
    const assetResult = addAsset(
      initial,
      {
        name: "Heirloom ring",
        categoryId: "lifestyle.jewelry",
        categoryLabel: "Jewelry",
        photo: {
          localUri: "file:///ring.jpg",
          fileName: "ring.jpg",
          mimeType: "image/jpeg",
          byteSize: 1200
        },
        locationStatus: "unknown",
        placeId: null,
        roomId: null,
        locatorText: null,
        evidence: {
          localUri: "file:///valuation.pdf",
          fileName: "valuation.pdf",
          mimeType: "application/pdf",
          byteSize: 2400
        }
      },
      context()
    );
    const readiness = calculateNativeAssetReadiness(
      assetResult.asset,
      assetResult.workspace.places,
      assetResult.workspace.evidence
    );
    expect(readiness.percent).toBe(70);
    expect(readiness.items.map((item) => item.id)).toContain("location");
    expect(readiness.nextItem?.id).toBe("location");
  });

  it("does not require a physical location for a digital asset", () => {
    const initial = createWorkspace("personal");
    const assetResult = addAsset(
      initial,
      {
        name: "Domain ownership record",
        categoryId: "digital.asset",
        categoryLabel: "Digital reference",
        photo: {
          localUri: "file:///domain.jpg",
          fileName: "domain.jpg",
          mimeType: "image/jpeg",
          byteSize: 1200
        },
        locationStatus: "unknown",
        placeId: null,
        roomId: null,
        locatorText: null,
        evidence: {
          localUri: "file:///ownership.pdf",
          fileName: "ownership.pdf",
          mimeType: "application/pdf",
          byteSize: 2400
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
    expect(readiness.items.map((item) => item.id)).toEqual([
      "identity",
      "photo",
      "evidence"
    ]);
    expect(readiness.nextItem).toBeNull();

    const withoutEvidence = calculateNativeAssetReadiness(
      assetResult.asset,
      assetResult.workspace.places,
      []
    );
    expect(withoutEvidence.percent).toBe(64);
    expect(withoutEvidence.nextItem?.id).toBe("evidence");
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

  it("updates one existing Passport and appends immutable proof records", () => {
    const initial = createWorkspace("sample");
    const original = initial.assets.find((asset) => asset.id === "asset-gmt")!;
    const originalEvidenceCount = initial.evidence.length;
    const result = updateAsset(
      initial,
      {
        assetId: original.id,
        photo: {
          localUri: "file:///gmt.jpg",
          fileName: "gmt.jpg",
          mimeType: "image/jpeg",
          byteSize: 1800,
          protectedUri: "file:///protected-gmt.alyrblob",
          checksumSha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          encryptedAtRest: true
        },
        evidence: {
          localUri: "file:///gmt-appraisal.pdf",
          fileName: "gmt-appraisal.pdf",
          mimeType: "application/pdf",
          byteSize: 3200,
          protectedUri: "file:///protected-appraisal.alyrblob",
          checksumSha256:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          encryptedAtRest: true
        }
      },
      context()
    );

    expect(result.workspace.assets).toHaveLength(initial.assets.length);
    expect(result.asset.id).toBe(original.id);
    expect(result.asset.photoUri).toBeNull();
    expect(result.asset.photoProtectedUri).toBe(
      "file:///protected-gmt.alyrblob"
    );
    expect(result.asset.evidenceIds).toHaveLength(
      original.evidenceIds.length + 1
    );
    expect(result.workspace.evidence).toHaveLength(originalEvidenceCount + 2);
    expect(result.workspace.evidence.slice(-originalEvidenceCount)).toEqual(
      initial.evidence
    );
    expect(result.newEvidence.map((item) => item.relation)).toEqual([
      "condition",
      "identity"
    ]);
    expect(result.changes).toEqual({
      identity: false,
      photo: true,
      location: false,
      evidence: true
    });
  });

  it("updates identity and retrieval location without creating a second asset", () => {
    const initial = createWorkspace("sample");
    const original = initial.assets.find(
      (asset) => asset.id === "asset-heritage"
    )!;
    const place = initial.places.find(
      (item) => item.id === "place-west-bay"
    )!;
    const room = place.rooms.find((item) => item.id === "room-study")!;
    const result = updateAsset(
      initial,
      {
        assetId: original.id,
        identity: {
          name: "Family pearl heirloom",
          categoryId: "home.other",
          categoryLabel: "Personal item"
        },
        location: {
          locationStatus: "known",
          placeId: place.id,
          roomId: room.id,
          locatorText: "Archive cabinet · shelf 2"
        }
      },
      context()
    );

    expect(result.workspace.assets).toHaveLength(initial.assets.length);
    expect(result.asset).toMatchObject({
      id: original.id,
      name: "Family pearl heirloom",
      placeId: place.id,
      roomId: room.id,
      locatorText: "Archive cabinet · shelf 2"
    });
    expect(result.changes.identity).toBe(true);
    expect(result.changes.location).toBe(true);
    expect(result.newEvidence).toEqual([]);
  });

  it("clears an item's physical location link when its category becomes digital", () => {
    const initial = createWorkspace("sample");
    const original = initial.assets.find(
      (asset) => asset.id === "asset-gmt"
    )!;
    const linkedPlace = initial.places.find(
      (place) => place.id === original.placeId
    )!;
    const result = updateAsset(
      initial,
      {
        assetId: original.id,
        identity: {
          name: original.name,
          categoryId: "digital.asset",
          categoryLabel: "Digital reference"
        }
      },
      context()
    );

    expect(result.asset).toMatchObject({
      categoryId: "digital.asset",
      locationStatus: "unknown",
      placeId: null,
      roomId: null,
      locatorText: null
    });
    expect(result.changes).toMatchObject({
      identity: true,
      location: true
    });
    expect(
      result.workspace.places.find((place) => place.id === linkedPlace.id)
    ).toEqual(linkedPlace);
  });

  it("resets a digital item to unresolved when its category becomes physical", () => {
    const initial = createWorkspace("sample");
    const original = initial.assets.find(
      (asset) => asset.id === "asset-domain"
    )!;
    const place = initial.places.find(
      (item) => item.id === "place-west-bay"
    )!;
    const room = place.rooms[0]!;
    const result = updateAsset(
      initial,
      {
        assetId: original.id,
        identity: {
          name: original.name,
          categoryId: "home.other",
          categoryLabel: "Personal item"
        },
        // A category-boundary transition deliberately wins over a bundled
        // location patch so a stale or accidental assignment cannot survive.
        location: {
          locationStatus: "known",
          placeId: place.id,
          roomId: room.id,
          locatorText: "Old location"
        }
      },
      context()
    );

    expect(result.asset).toMatchObject({
      categoryId: "home.other",
      locationStatus: "unknown",
      placeId: null,
      roomId: null,
      locatorText: null
    });
    expect(result.changes).toMatchObject({
      identity: true,
      location: true
    });
  });

  it("rejects a retrieval space outside the selected Place", () => {
    const initial = createWorkspace("sample");
    const original = initial.assets[0]!;
    expect(() =>
      updateAsset(
        initial,
        {
          assetId: original.id,
          location: {
            locationStatus: "known",
            placeId: "place-pearl",
            roomId: "room-study",
            locatorText: null
          }
        },
        context()
      )
    ).toThrow("Choose a space inside the selected Place.");
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
