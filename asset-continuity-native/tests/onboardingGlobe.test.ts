import {
  DEFAULT_ONBOARDING_GLOBE_CENTER,
  DEFAULT_ONBOARDING_GLOBE_MARKERS,
  estimateWorldlineOrbitLength,
  projectWorldlineMarkers,
  worldlineMarkerTiming,
  worldlineOrbitPath
} from "@/onboarding/worldlineMotion";

describe("Worldline onboarding globe model", () => {
  it("keeps every bundled example visibly on the selected hemisphere", () => {
    const markers = projectWorldlineMarkers(
      DEFAULT_ONBOARDING_GLOBE_MARKERS,
      DEFAULT_ONBOARDING_GLOBE_CENTER,
      320,
      16
    );

    expect(markers.map((marker) => marker.id)).toEqual([
      "example-watch",
      "example-home",
      "example-document"
    ]);
    expect(markers.every((marker) => marker.visible)).toBe(true);
    expect(markers[0]!.originPoint).toEqual({
      x: 25.6,
      y: 236.8
    });
    expect(
      markers.every(
        (marker) =>
          marker.destination.x >= 16 &&
          marker.destination.x <= 304 &&
          marker.destination.y >= 16 &&
          marker.destination.y <= 304
      )
    ).toBe(true);
  });

  it("builds deterministic one-shot timing with a shared calm finish", () => {
    const timings = [0, 1, 2].map((index) =>
      worldlineMarkerTiming(index, 3)
    );

    expect(timings[0]!.depart).toBeLessThan(timings[1]!.depart);
    expect(timings[1]!.depart).toBeLessThan(timings[2]!.depart);
    expect(
      timings.every(
        (timing) =>
          timing.depart < timing.arrive &&
          timing.arrive < timing.settle &&
          timing.settle <= 0.92
      )
    ).toBe(true);
  });

  it("keeps the orbit decorative and bounded to stable visual geometry", () => {
    expect(worldlineOrbitPath(320, 16)).toBe(
      "M -9.60 96.00 C 38.40 6.40, 144.00 16.00, 211.20 76.80 C 294.40 144.00, 300.80 230.40, 214.40 265.60 C 144.00 294.40, 67.20 252.80, 57.60 188.80"
    );
    expect(estimateWorldlineOrbitLength(320)).toBeCloseTo(838.4);
  });

  it("rejects malformed presentation geometry instead of drawing silently", () => {
    expect(() =>
      projectWorldlineMarkers(
        DEFAULT_ONBOARDING_GLOBE_MARKERS,
        DEFAULT_ONBOARDING_GLOBE_CENTER,
        20,
        10
      )
    ).toThrow("valid inset");
    expect(() => worldlineMarkerTiming(3, 3)).toThrow("valid index");
    expect(() => estimateWorldlineOrbitLength(0)).toThrow(
      "positive canvas"
    );
    expect(() =>
      projectWorldlineMarkers(
        [
          {
            ...DEFAULT_ONBOARDING_GLOBE_MARKERS[0]!,
            origin: { x: 1.1, y: 0.5 }
          }
        ],
        DEFAULT_ONBOARDING_GLOBE_CENTER,
        320,
        16
      )
    ).toThrow("unit-canvas coordinate");
  });
});
