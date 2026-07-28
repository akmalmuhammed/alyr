import { createWorkspace } from "@/domain/sample";
import { REGISTER_COPY } from "@/i18n/registerCopy";
import {
  groupRegisterAssets,
  groupRegisterPlaces,
  initialAssetFilter,
  initialCollectionView,
  initialItemGroup,
  initialItemSort,
  initialPlaceGroup,
  initialPlaceSort,
  sortRegisterAssets,
  sortRegisterPlaces
} from "@/register/browse";

describe("scalable register browsing", () => {
  it("normalizes direct-link parameters without accepting unknown state", () => {
    expect(initialCollectionView("places")).toBe("places");
    expect(initialCollectionView("unknown")).toBe("items");
    expect(initialAssetFilter("evidence")).toBe("evidence");
    expect(initialAssetFilter("unknown")).toBe("all");
    expect(initialItemSort("oldest")).toBe("oldest");
    expect(initialItemSort("item-count")).toBe("recent");
    expect(initialItemGroup("category")).toBe("category");
    expect(initialItemGroup("region")).toBe("none");
    expect(initialPlaceSort("item-count")).toBe("item-count");
    expect(initialPlaceSort("oldest")).toBe("recent");
    expect(initialPlaceGroup("region")).toBe("region");
    expect(initialPlaceGroup("place")).toBe("none");
  });

  it("sorts items deterministically without mutating the workspace", () => {
    const workspace = createWorkspace("sample");
    const source = workspace.assets.slice(0, 3).map((asset, index) => ({
      ...asset,
      createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
      updatedAt: `2026-07-${String(10 - index).padStart(2, "0")}T09:00:00.000Z`
    }));
    const originalIds = source.map((asset) => asset.id);

    expect(
      sortRegisterAssets(source, "recent", "en").map(
        (asset) => asset.id
      )
    ).toEqual(originalIds);
    expect(
      sortRegisterAssets(source, "oldest", "en").map(
        (asset) => asset.id
      )
    ).toEqual(originalIds);
    expect(
      sortRegisterAssets(source, "name", "en").map(
        (asset) => asset.name
      )
    ).toEqual([
      "Family pearl necklace",
      "GMT-Master II",
      "Roadster"
    ]);
    expect(source.map((asset) => asset.id)).toEqual(originalIds);
  });

  it("groups items by truthful Place and leaves unassigned records last", () => {
    const workspace = createWorkspace("sample");
    const assigned = workspace.assets[0]!;
    const unassigned = {
      ...workspace.assets[1]!,
      placeId: null,
      roomId: null
    };

    const sections = groupRegisterAssets(
      [unassigned, assigned],
      "place",
      "en",
      workspace.places,
      "No Place assigned"
    );

    expect(sections.map((section) => section.label)).toEqual([
      "West Bay Home",
      "No Place assigned"
    ]);
    expect(sections.flatMap((section) => section.records)).toHaveLength(2);
  });

  it("sorts Places by active item count and groups repeated regions once", () => {
    const workspace = createWorkspace("sample");
    const counts = new Map<string, number>([
      [workspace.places[0]!.id, 2],
      [workspace.places[1]!.id, 5]
    ]);

    const sorted = sortRegisterPlaces(
      workspace.places,
      "item-count",
      "en",
      counts
    );
    expect(sorted.map((place) => place.name)).toEqual([
      "Pearl Apartment",
      "West Bay Home"
    ]);

    const sections = groupRegisterPlaces(
      sorted,
      "region",
      "en",
      "Region not recorded"
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]?.label).toBe("Doha");
    expect(sections[0]?.records).toHaveLength(2);
  });

  it("keeps the register organizer complete in English and Arabic", () => {
    expect(Object.keys(REGISTER_COPY.ar).sort()).toEqual(
      Object.keys(REGISTER_COPY.en).sort()
    );
    for (const key of [
      "filters",
      "itemSorts",
      "itemGroups",
      "placeSorts",
      "placeGroups"
    ] as const) {
      expect(Object.keys(REGISTER_COPY.ar[key]).sort()).toEqual(
        Object.keys(REGISTER_COPY.en[key]).sort()
      );
    }
    expect(REGISTER_COPY.ar.organize).toBe("تنظيم");
    expect(REGISTER_COPY.ar.itemGroups.place).toBe("المكان");
    expect(REGISTER_COPY.ar.placeGroups.region).toBe("المنطقة");
  });
});
