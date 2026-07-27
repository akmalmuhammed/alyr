import {
  ATLAS_COASTLINES,
  ATLAS_GRATICULE,
  assetsNeedingPhysicalPlace,
  atlasCenter,
  atlasPinDisclosure,
  moveAtlasCenter,
  projectAtlasPolyline,
  projectOnAtlas
} from "@/domain/atlas";
import { createWorkspace } from "@/domain/sample";

describe("Atlas projection", () => {
  it("excludes intentionally unplaced digital records from location work", () => {
    const workspace = createWorkspace("sample");
    const digital = workspace.assets.find(
      (asset) => asset.categoryId === "digital.asset"
    )!;

    expect(digital.placeId).toBeNull();
    expect(
      assetsNeedingPhysicalPlace([digital])
    ).toEqual([]);

    expect(
      assetsNeedingPhysicalPlace([
        {
          ...digital,
          id: "physical-unplaced",
          categoryId: "home.other",
          categoryLabel: "Personal item"
        }
      ]).map((asset) => asset.id)
    ).toEqual(["physical-unplaced"]);
  });

  it("places the selected coordinate at the center of the visible globe", () => {
    const point = { latitude: 25.2854, longitude: 51.531 };

    expect(projectOnAtlas(point, point)).toEqual({
      x: 0,
      y: 0,
      visible: true,
      depth: 1
    });
  });

  it("marks the opposite hemisphere as hidden", () => {
    const projection = projectOnAtlas(
      { latitude: 0, longitude: 180 },
      { latitude: 0, longitude: 0 }
    );

    expect(projection.visible).toBe(false);
    expect(projection.depth).toBeCloseTo(-1);
  });

  it("computes a stable center across the international date line", () => {
    const center = atlasCenter(null, [
      { latitude: 10, longitude: 179 },
      { latitude: 10, longitude: -179 }
    ]);

    expect(center.latitude).toBeCloseTo(10.0015, 3);
    expect(Math.abs(center.longitude)).toBeCloseTo(180, 6);
  });

  it("uses the selected Place rather than an inferred center", () => {
    expect(
      atlasCenter(
        { latitude: -33.8688, longitude: 151.2093 },
        [{ latitude: 25.2854, longitude: 51.531 }]
      )
    ).toEqual({ latitude: -33.8688, longitude: 151.2093 });
  });

  it("fails closed for invalid coordinates", () => {
    expect(() =>
      projectOnAtlas(
        { latitude: 91, longitude: 0 },
        { latitude: 0, longitude: 0 }
      )
    ).toThrow("valid latitude and longitude");
  });

  it("clips offline coastline geometry to the visible hemisphere", () => {
    const center = { latitude: 25.2854, longitude: 51.531 };
    const projected = ATLAS_COASTLINES.flatMap((line) =>
      projectAtlasPolyline(line, center)
    );

    expect(ATLAS_COASTLINES.length).toBeGreaterThanOrEqual(7);
    expect(projected.length).toBeGreaterThan(0);
    expect(
      projected.every(
        (segment) =>
          segment.length >= 2 &&
          segment.every(
            (point) =>
              point.visible &&
              point.depth >= -1e-8 &&
              Math.hypot(point.x, point.y) <= 1.000001
          )
      )
    ).toBe(true);
  });

  it("provides geographic graticules that rotate with the camera", () => {
    const qatarPaths = ATLAS_GRATICULE.flatMap((line) =>
      projectAtlasPolyline(line, {
        latitude: 25.2854,
        longitude: 51.531
      })
    );
    const sydneyPaths = ATLAS_GRATICULE.flatMap((line) =>
      projectAtlasPolyline(line, {
        latitude: -33.8688,
        longitude: 151.2093
      })
    );

    expect(ATLAS_GRATICULE.length).toBeGreaterThan(10);
    expect(qatarPaths.length).toBeGreaterThan(10);
    expect(sydneyPaths.length).toBeGreaterThan(10);
    expect(qatarPaths[0]).not.toEqual(sydneyPaths[0]);
  });

  it("moves the presentation camera without claiming to move a Place pin", () => {
    expect(
      moveAtlasCenter(
        { latitude: 25, longitude: 50 },
        150,
        -100,
        300
      )
    ).toEqual({ latitude: -5, longitude: -40 });

    expect(
      moveAtlasCenter(
        { latitude: 80, longitude: -170 },
        300,
        300,
        300
      )
    ).toEqual({ latitude: 85, longitude: 10 });
  });

  it("labels manual pins without inventing GPS accuracy", () => {
    expect(
      atlasPinDisclosure({
        locationSource: "user_pin",
        precision: "user_placed",
        horizontalAccuracyMeters: 4.2,
        confirmedAt: "2026-07-27T00:00:00.000Z"
      })
    ).toBe("Manually placed pin · no measured GPS accuracy");

    expect(
      atlasPinDisclosure({
        locationSource: "manual_coordinates",
        precision: "exact",
        horizontalAccuracyMeters: null,
        confirmedAt: null
      })
    ).toBe("Manually placed pin · confirmation needed");
  });

  it("discloses measured GPS accuracy only when the source supports it", () => {
    expect(
      atlasPinDisclosure({
        locationSource: "device_gps",
        precision: "exact",
        horizontalAccuracyMeters: 7.6,
        confirmedAt: "2026-07-27T00:00:00.000Z"
      })
    ).toBe("GPS pin confirmed · measured accuracy ±8 m");

    expect(
      atlasPinDisclosure({
        locationSource: "device_gps",
        precision: "approximate",
        horizontalAccuracyMeters: null,
        confirmedAt: "2026-07-27T00:00:00.000Z"
      })
    ).toBe("Approximate GPS pin confirmed · accuracy not recorded");
  });
});
