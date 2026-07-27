import {
  categoryLocationTransition,
  unresolvedLocationForCategoryTransition
} from "@/domain/assetCategoryLocation";
import { ASSET_EDIT_COPY } from "@/i18n/assetEditCopy";

describe("asset category location boundary", () => {
  it("classifies both category directions and returns a fully unresolved location", () => {
    expect(
      categoryLocationTransition("lifestyle.watch", "digital.asset")
    ).toBe("physical-to-virtual");
    expect(
      categoryLocationTransition("digital.asset", "home.other")
    ).toBe("virtual-to-physical");
    expect(
      categoryLocationTransition("lifestyle.watch", "vehicle.car")
    ).toBeNull();
    expect(
      unresolvedLocationForCategoryTransition("physical-to-virtual")
    ).toEqual({
      locationStatus: "unknown",
      placeId: null,
      roomId: null,
      locatorText: null
    });
  });

  it("keeps the destructive category consequence visible and confirmable", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/asset-edit.tsx`,
      "utf8"
    );

    expect(
      ASSET_EDIT_COPY.en.transition["physical-to-virtual"].message
    ).toContain(
      "Saving clears its Place, space, retrieval clue"
    );
    expect(
      ASSET_EDIT_COPY.en.transition["physical-to-virtual"].message
    ).toContain("property-pin link");
    expect(
      ASSET_EDIT_COPY.ar.transition["physical-to-virtual"].title
    ).toBe("إزالة الموقع المادي لهذا الغرض؟");
    expect(source).toContain("Alert.alert(notice.title, notice.message");
    expect(source).toContain("text: copy.changeCategory");
    expect(source).toContain(
      "categoryTransitionNotice(locationTransition, language)"
    );
    expect(source).toContain('accessibilityRole="alert"');
  });
});
