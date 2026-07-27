import {
  confirmPlacePin,
  createDraggedPlacePin,
  createManualPlacePin,
  describePlacePin,
  formatCoordinateReadout,
  hasValidCoordinates,
  normalizeCoordinateInput,
  normalizeDevicePlacePin,
  parseCoordinateInput,
  placePinEditorLabels
} from "@/components/PlacePinEditor/contract";

const NOW = "2026-07-27T00:00:00.000Z";
const labels = placePinEditorLabels("en");

describe("PlacePinEditor contract", () => {
  it("rejects malformed and out-of-range manual coordinates", () => {
    expect(parseCoordinateInput("north", "51.531", labels)).toEqual({
      ok: false,
      errors: {
        latitude: labels.invalidNumber,
        longitude: null
      }
    });
    expect(parseCoordinateInput("91", "-181", labels)).toEqual({
      ok: false,
      errors: {
        latitude: labels.latitudeRange,
        longitude: labels.longitudeRange
      }
    });
  });

  it("creates a truthful unconfirmed manual pin", () => {
    const parsed = parseCoordinateInput("25.2854", "51.5310", labels);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected valid coordinates");

    const value = createManualPlacePin(
      parsed.latitude,
      parsed.longitude,
      NOW
    );
    expect(value).toMatchObject({
      source: "manual_coordinates",
      precision: "user_placed",
      horizontalAccuracyMeters: null,
      confirmedAt: null
    });
    expect(hasValidCoordinates(value)).toBe(true);
  });

  it("accepts Arabic-Indic coordinates and localized punctuation", () => {
    expect(normalizeCoordinateInput("−٢٥٫٢٨٥٤")).toBe("-25.2854");
    expect(normalizeCoordinateInput("۵۱٫۵۳۱۰")).toBe("51.5310");

    expect(
      parseCoordinateInput("٢٥٫٢٨٥٤", "٥١٫٥٣١٠", labels)
    ).toEqual({
      ok: true,
      latitude: 25.2854,
      longitude: 51.531
    });
  });

  it("clears GPS accuracy and prior confirmation after a drag", () => {
    const dragged = createDraggedPlacePin(
      {
        latitude: 25.28,
        longitude: 51.53,
        source: "device_gps",
        precision: "approximate",
        horizontalAccuracyMeters: 7.4,
        observedAt: "2026-07-26T23:59:00.000Z",
        confirmedAt: "2026-07-26T23:59:10.000Z"
      },
      25.2854,
      51.531,
      NOW
    );

    expect(dragged).toMatchObject({
      source: "user_pin",
      precision: "user_placed",
      horizontalAccuracyMeters: null,
      confirmedAt: null,
      observedAt: NOW
    });
  });

  it("normalizes device readings without claiming property precision", () => {
    const reading = normalizeDevicePlacePin(
      {
        latitude: 25.2854,
        longitude: 51.531,
        source: "manual_coordinates",
        precision: "exact",
        horizontalAccuracyMeters: 6.7,
        observedAt: NOW,
        confirmedAt: NOW
      },
      NOW
    );

    expect(reading).toEqual({
      latitude: 25.2854,
      longitude: 51.531,
      source: "device_gps",
      precision: "approximate",
      horizontalAccuracyMeters: 6.7,
      observedAt: NOW,
      confirmedAt: null
    });
  });

  it("only adds confirmation through the explicit confirmation helper", () => {
    const draft = createManualPlacePin(25.2854, 51.531, NOW);
    const confirmed = confirmPlacePin(
      draft,
      "2026-07-27T00:01:00.000Z"
    );

    expect(confirmed.confirmedAt).toBe("2026-07-27T00:01:00.000Z");
    expect(confirmed.precision).toBe("user_placed");
    expect(describePlacePin(confirmed, labels)).toMatchObject({
      isConfirmed: true,
      sourceLabel: labels.manualCoordinates
    });
  });

  it("does not convert an approximate GPS reading into user-placed precision", () => {
    const gps = normalizeDevicePlacePin(
      {
        latitude: 25.2854,
        longitude: 51.531,
        source: "device_gps",
        precision: "approximate",
        horizontalAccuracyMeters: 8,
        observedAt: NOW,
        confirmedAt: null
      },
      NOW
    );
    if (!gps) throw new Error("expected a valid GPS reading");

    expect(confirmPlacePin(gps, NOW)).toMatchObject({
      source: "device_gps",
      precision: "approximate",
      horizontalAccuracyMeters: 8,
      confirmedAt: NOW
    });
  });

  it("does not display unmeasured or approximate pins at sub-metre precision", () => {
    const userPlaced = createManualPlacePin(25.285412, 51.531087, NOW);
    expect(formatCoordinateReadout(userPlaced.latitude, userPlaced)).toBe(
      "25.28541"
    );

    const gps = normalizeDevicePlacePin(
      {
        latitude: 25.285412,
        longitude: 51.531087,
        source: "device_gps",
        precision: "approximate",
        horizontalAccuracyMeters: 8,
        observedAt: NOW,
        confirmedAt: null
      },
      NOW
    );
    if (!gps) throw new Error("expected a valid GPS reading");

    expect(formatCoordinateReadout(gps.latitude, gps)).toBe("25.2854");
  });

  it("treats absent or invalid coordinates as no renderable pin", () => {
    expect(hasValidCoordinates(null)).toBe(false);
    expect(
      hasValidCoordinates({
        latitude: Number.NaN,
        longitude: 51.531,
        source: "user_pin",
        precision: "user_placed",
        horizontalAccuracyMeters: null,
        observedAt: NOW,
        confirmedAt: null
      })
    ).toBe(false);
  });

  it("ships a complete Arabic contract instead of mixed-language fallbacks", () => {
    const arabic = placePinEditorLabels("ar");
    expect(Object.keys(arabic).sort()).toEqual(Object.keys(labels).sort());
    expect(arabic.confirmPin).toMatch(/[\u0600-\u06ff]/);
    expect(arabic.locationUnavailable).toMatch(/[\u0600-\u06ff]/);
  });
});
