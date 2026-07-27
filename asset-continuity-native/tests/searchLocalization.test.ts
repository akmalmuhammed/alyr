import { assetSearchTerms } from "../app/(tabs)/search";
import { createWorkspace } from "@/domain/sample";

describe("localized asset search", () => {
  it("indexes both the stored category and its Arabic label", () => {
    const workspace = createWorkspace("sample");
    const asset = workspace.assets.find(
      (candidate) => candidate.id === "asset-gmt"
    )!;
    const place = workspace.places.find(
      (candidate) => candidate.id === asset.placeId
    );
    const room = place?.rooms.find(
      (candidate) => candidate.id === asset.roomId
    );

    expect(assetSearchTerms(asset, place, room, "ar")).toEqual(
      expect.arrayContaining(["Watch", "ساعة"])
    );
  });
});
