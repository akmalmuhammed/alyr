import { createWorkspace } from "@/domain/sample";
import { REGISTER_COPY } from "@/i18n/registerCopy";
import {
  filterRegisterPlaces,
  groupRegisterAssets,
  groupRegisterPlaces,
  initialAssetFilter,
  initialCollectionView,
  initialItemGroup,
  initialItemSort,
  initialPlaceFilter,
  initialPlaceGroup,
  initialPlaceSort,
  placeHasPin,
  placeNeedsPinReview,
  sortRegisterAssets,
  sortRegisterPlaces
} from "@/register/browse";

describe("scalable register browsing", () => {
  it("normalizes direct-link parameters without accepting unknown state", () => {
    expect(initialCollectionView("places")).toBe("places");
    expect(initialCollectionView("unknown")).toBe("items");
    expect(initialAssetFilter("evidence")).toBe("evidence");
    expect(initialAssetFilter("unknown")).toBe("all");
    expect(initialPlaceFilter("value")).toBe("value");
    expect(initialPlaceFilter("pin-review")).toBe("pin-review");
    expect(initialPlaceFilter("no-pin")).toBe("no-pin");
    expect(initialPlaceFilter("missing-address")).toBe(
      "missing-address"
    );
    expect(initialPlaceFilter("missing-documents")).toBe(
      "missing-documents"
    );
    expect(initialPlaceFilter("evidence")).toBe("all");
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

  it("filters every Place-completion debt without guessing pin truth", () => {
    const workspace = createWorkspace("sample");
    const complete = {
      ...workspace.places[0]!,
      id: "place-complete"
    };
    const pinReview = {
      ...complete,
      id: "place-pin-review",
      confirmedAt: null
    };
    const approximatePin = {
      ...complete,
      id: "place-approximate",
      precision: "approximate" as const
    };
    const noPin = {
      ...complete,
      id: "place-no-pin",
      latitude: null,
      longitude: null,
      locationSource: "not_set" as const,
      precision: "locality_only" as const,
      observedAt: null,
      confirmedAt: null
    };
    const missingAddress = {
      ...complete,
      id: "place-missing-address",
      addressSummary: " "
    };
    const missingDocuments = {
      ...complete,
      id: "place-missing-documents"
    };
    const rented = {
      ...complete,
      id: "place-rented",
      tenure: "rented" as const
    };
    const places = [
      complete,
      pinReview,
      approximatePin,
      noPin,
      missingAddress,
      missingDocuments,
      rented
    ];
    const sourceDocument = workspace.placeDocuments![0]!;
    const documents = places
      .filter((place) => place.id !== missingDocuments.id)
      .map((place, index) => ({
        ...sourceDocument,
        id: `document-${index}`,
        placeId: place.id
      }));

    expect(placeHasPin(complete)).toBe(true);
    expect(placeHasPin(noPin)).toBe(false);
    expect(placeNeedsPinReview(complete)).toBe(false);
    expect(placeNeedsPinReview(pinReview)).toBe(true);
    expect(placeNeedsPinReview(approximatePin)).toBe(true);
    expect(
      filterRegisterPlaces(places, "pin-review", documents).map(
        (place) => place.id
      )
    ).toEqual(["place-pin-review", "place-approximate"]);
    expect(
      filterRegisterPlaces(places, "no-pin", documents).map(
        (place) => place.id
      )
    ).toEqual(["place-no-pin"]);
    expect(
      filterRegisterPlaces(
        places,
        "missing-address",
        documents
      ).map((place) => place.id)
    ).toEqual(["place-missing-address"]);
    expect(
      filterRegisterPlaces(
        places,
        "missing-documents",
        documents
      ).map((place) => place.id)
    ).toEqual(["place-missing-documents"]);
    expect(
      filterRegisterPlaces(
        places,
        "value",
        documents,
        new Set(["place-complete", "place-no-pin", "place-rented"])
      ).map((place) => place.id)
    ).toEqual(["place-complete", "place-no-pin"]);
  });

  it("keeps the register organizer complete in English and Arabic", () => {
    expect(Object.keys(REGISTER_COPY.ar).sort()).toEqual(
      Object.keys(REGISTER_COPY.en).sort()
    );
    for (const key of [
      "filters",
      "placeFilters",
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
    expect(REGISTER_COPY.en.placeFilters["pin-review"]).toBe(
      "Pin needs review"
    );
    expect(REGISTER_COPY.en.placeFilters.value).toBe(
      "Needs property value"
    );
    expect(REGISTER_COPY.ar.placeFilters["no-pin"]).toBe(
      "من دون دبوس"
    );
    expect(REGISTER_COPY.ar.placeFilters.value).toBe(
      "تنقصه قيمة العقار"
    );
    expect(REGISTER_COPY.ar.returnToPortfolio).not.toBe(
      REGISTER_COPY.en.returnToPortfolio
    );
  });
});
