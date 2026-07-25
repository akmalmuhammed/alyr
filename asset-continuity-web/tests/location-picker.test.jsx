// @vitest-environment jsdom

import React, { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationPicker } from "../src/LocationPicker.jsx";

const EMPTY_LOCATION = {
  locationMethod: "later",
  formattedAddress: "",
  latitude: "",
  longitude: "",
  horizontalAccuracyMeters: "",
  locationSource: "not_set",
  locationPrecision: "locality_only",
  locationCapturedAt: "",
};

const originalGeolocationDescriptor = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  "geolocation",
);

function ControlledLocationPicker({ initialValue = {}, onPatch = vi.fn() }) {
  const [value, setValue] = useState({
    ...EMPTY_LOCATION,
    ...initialValue,
  });

  function handleChange(patch) {
    onPatch(patch);
    setValue((current) => ({ ...current, ...patch }));
  }

  return <LocationPicker value={value} onChange={handleChange} />;
}

function setGeolocation(getCurrentPosition) {
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
}

function restoreGeolocation() {
  if (originalGeolocationDescriptor) {
    Object.defineProperty(
      globalThis.navigator,
      "geolocation",
      originalGeolocationDescriptor,
    );
  } else {
    delete globalThis.navigator.geolocation;
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreGeolocation();
});

describe("LocationPicker", () => {
  it("records a device fix at 15 metres as exact and requests high accuracy", async () => {
    const onPatch = vi.fn();
    const getCurrentPosition = vi.fn((success) => {
      success({
        coords: {
          latitude: 25.2854,
          longitude: 51.531,
          accuracy: 15,
        },
        timestamp: Date.parse("2026-07-25T09:30:00.000Z"),
      });
    });
    setGeolocation(getCurrentPosition);
    const { container } = render(
      <ControlledLocationPicker
        initialValue={{ locationMethod: "current" }}
        onPatch={onPatch}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /^Use my location$/i }),
    );

    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      },
    );
    expect(onPatch).toHaveBeenLastCalledWith({
      locationMethod: "current",
      latitude: 25.2854,
      longitude: 51.531,
      horizontalAccuracyMeters: 15,
      locationSource: "device_gps",
      locationPrecision: "exact",
      locationCapturedAt: "2026-07-25T09:30:00.000Z",
    });
    await waitFor(() => {
      expect(
        container.querySelector(".location-confidence")?.textContent,
      ).toMatch(/Device estimate .*15 m/);
    });
    expect(
      container.querySelector(".location-confidence")?.classList.contains(
        "is-exact",
      ),
    ).toBe(true);
  });

  it("records a device fix over 15 metres as approximate", async () => {
    const onPatch = vi.fn();
    setGeolocation(
      vi.fn((success) => {
        success({
          coords: {
            latitude: 25.2854,
            longitude: 51.531,
            accuracy: 15.01,
          },
          timestamp: Date.parse("2026-07-25T09:31:00.000Z"),
        });
      }),
    );
    const { container } = render(
      <ControlledLocationPicker
        initialValue={{ locationMethod: "current" }}
        onPatch={onPatch}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /^Use my location$/i }),
    );

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        horizontalAccuracyMeters: 15.01,
        locationSource: "device_gps",
        locationPrecision: "approximate",
      }),
    );
    await waitFor(() => {
      expect(
        container.querySelector(".location-confidence")?.classList.contains(
          "is-approximate",
        ),
      ).toBe(true);
    });
  });

  it.each([
    { label: "missing accuracy", accuracy: undefined },
    { label: "null accuracy", accuracy: null },
    { label: "NaN accuracy", accuracy: Number.NaN },
    { label: "infinite accuracy", accuracy: Number.POSITIVE_INFINITY },
    { label: "negative accuracy", accuracy: -1 },
  ])(
    "keeps $label unknown and never promotes the device fix to exact",
    async ({ accuracy }) => {
      const onPatch = vi.fn();
      setGeolocation(
        vi.fn((success) => {
          success({
            coords: {
              latitude: 25.2854,
              longitude: 51.531,
              accuracy,
            },
            timestamp: Date.parse("2026-07-25T09:32:00.000Z"),
          });
        }),
      );
      const { container } = render(
        <ControlledLocationPicker
          initialValue={{ locationMethod: "current" }}
          onPatch={onPatch}
        />,
      );
      const user = userEvent.setup();

      await user.click(
        screen.getByRole("button", { name: /^Use my location$/i }),
      );

      expect(onPatch).toHaveBeenLastCalledWith({
        locationMethod: "current",
        latitude: 25.2854,
        longitude: 51.531,
        horizontalAccuracyMeters: "",
        locationSource: "device_gps",
        locationPrecision: "approximate",
        locationCapturedAt: "2026-07-25T09:32:00.000Z",
      });
      await waitFor(() => {
        expect(
          container.querySelector(".location-confidence")?.textContent,
        ).toMatch(/Device accuracy unavailable.*approximate/i);
      });
      expect(
        container.querySelector(".location-confidence")?.classList.contains(
          "is-approximate",
        ),
      ).toBe(true);
    },
  );

  it.each([
    {
      code: 1,
      copy:
        /Location permission was not granted.*address, pin, or coordinates instead/i,
    },
    {
      code: 2,
      copy:
        /A reliable device location was not available.*choose another method/i,
    },
  ])("shows honest device error copy for geolocation code $code", async ({
    code,
    copy,
  }) => {
    setGeolocation(
      vi.fn((_success, error) => {
        error({ code });
      }),
    );
    render(
      <ControlledLocationPicker initialValue={{ locationMethod: "current" }} />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /^Use my location$/i }),
    );

    expect(await screen.findByText(copy)).toBeTruthy();
  });

  it("explains the fallback when device geolocation is unsupported", async () => {
    restoreGeolocation();
    render(
      <ControlledLocationPicker initialValue={{ locationMethod: "current" }} />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /^Use my location$/i }),
    );

    expect(
      await screen.findByText(
        /This browser cannot provide a device location.*address, pin, or coordinates/i,
      ),
    ).toBeTruthy();
  });

  it("searches an address and records the selected result as approximate", async () => {
    const onPatch = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          place_id: 934,
          display_name: "West Bay, Doha, Qatar",
          lat: "25.3242",
          lon: "51.5311",
        },
        {
          place_id: 935,
          display_name: "",
          lat: "not-a-coordinate",
          lon: "51.5",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ControlledLocationPicker
        initialValue={{ locationMethod: "address" }}
        onPatch={onPatch}
      />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByPlaceholderText("Building, street, area, city"),
      "West Bay Doha",
    );
    await user.click(screen.getByRole("button", { name: /^Search$/i }));
    await user.click(
      await screen.findByRole("button", {
        name: /West Bay, Doha, Qatar/i,
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toContain("q=West%20Bay%20Doha");
    expect(request).toEqual({
      headers: {
        Accept: "application/json",
      },
    });
    expect(onPatch).toHaveBeenLastCalledWith({
      locationMethod: "address",
      formattedAddress: "West Bay, Doha, Qatar",
      latitude: 25.3242,
      longitude: 51.5311,
      horizontalAccuracyMeters: "",
      locationSource: "geocoder",
      locationPrecision: "approximate",
      locationCapturedAt: expect.any(String),
    });
  });

  it("keeps the draft safe and offers alternatives when address search fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unavailable")),
    );
    render(
      <ControlledLocationPicker initialValue={{ locationMethod: "address" }} />,
    );
    const user = userEvent.setup();

    await user.type(
      screen.getByPlaceholderText("Building, street, area, city"),
      "Pearl Island",
    );
    await user.click(screen.getByRole("button", { name: /^Search$/i }));

    expect(
      await screen.findByText(
        /Address search could not connect.*draft is safe.*coordinates or a map pin/i,
      ),
    ).toBeTruthy();
  });

  it("does not send an empty address query", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ControlledLocationPicker initialValue={{ locationMethod: "address" }} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^Search$/i }));

    expect(
      screen.getByText(/Enter an address, building, or area to search/i),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records keyboard coordinates as user-placed without measured accuracy", async () => {
    const onPatch = vi.fn();
    const { container } = render(
      <ControlledLocationPicker onPatch={onPatch} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Coordinates/i }));
    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "25.2854");
    await user.clear(screen.getByLabelText("Longitude"));
    await user.type(screen.getByLabelText("Longitude"), "51.531");

    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: "25.2854",
        formattedAddress: "",
        locationSource: "manual_coordinates",
        locationPrecision: "user_placed",
        horizontalAccuracyMeters: "",
      }),
    );
    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        longitude: "51.531",
        formattedAddress: "",
        locationSource: "manual_coordinates",
        locationPrecision: "user_placed",
        horizontalAccuracyMeters: "",
      }),
    );
    await waitFor(() => {
      expect(
        container.querySelector(".location-confidence")?.textContent,
      ).toMatch(/User-entered coordinates.*accuracy not measured/i);
    });
    expect(
      container.querySelector(".location-confidence")?.classList.contains(
        "is-user_placed",
      ),
    ).toBe(true);
  });

  it("offers a keyboard fallback and clears a stale geocoder address when the pin moves", async () => {
    const onPatch = vi.fn();
    const { container } = render(
      <ControlledLocationPicker
        initialValue={{
          locationMethod: "address",
          formattedAddress: "Old geocoder address",
          latitude: 25.31,
          longitude: 51.52,
          locationSource: "geocoder",
          locationPrecision: "approximate",
        }}
        onPatch={onPatch}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Drop a pin/i }));
    expect(screen.getByLabelText("Adjustable map pin")).toBeTruthy();
    expect(
      screen.getByText(/Coordinates remain available as a keyboard-friendly alternative/i),
    ).toBeTruthy();

    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "25.2854");
    await user.clear(screen.getByLabelText("Longitude"));
    await user.type(screen.getByLabelText("Longitude"), "51.531");

    expect(onPatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        longitude: "51.531",
        formattedAddress: "",
        locationSource: "user_pin",
        locationPrecision: "user_placed",
        horizontalAccuracyMeters: "",
      }),
    );
    await waitFor(() => {
      expect(
        container.querySelector(".location-confidence")?.textContent,
      ).toMatch(/User-placed pin.*accuracy not measured/i);
    });
  });
});
