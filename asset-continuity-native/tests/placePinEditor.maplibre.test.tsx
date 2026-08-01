import { act, render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import {
  MAP_LOAD_TIMEOUT_MS,
  OPENFREEMAP_LIBERTY_STYLE_URL,
  PlacePinEditor
} from "@/components/PlacePinEditor";
import { createManualPlacePin } from "@/components/PlacePinEditor/contract";

jest.mock("@maplibre/maplibre-react-native", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual(
    "react-native"
  ) as typeof import("react-native");
  const Map = ({
    children,
    ...props
  }: PropsWithChildren<Record<string, unknown>>) =>
    React.createElement(View, props, children);
  const Camera = (props: Record<string, unknown>) =>
    React.createElement(View, props);
  const ViewAnnotation = ({
    children,
    id,
    ...props
  }: PropsWithChildren<Record<string, unknown> & { id?: string }>) =>
    React.createElement(
      View,
      { ...props, testID: `${id ?? "map"}-annotation` },
      children
    );
  return { Camera, Map, ViewAnnotation };
});

const initial = createManualPlacePin(
  25.2854,
  51.531,
  "2026-08-01T10:00:00.000Z"
);

async function renderEditor(
  onChange = jest.fn(),
  language: "en" | "ar" = "en"
) {
  const screen = await render(
      <PlacePinEditor
        language={language}
        now={() => "2026-08-01T10:05:00.000Z"}
        onChange={onChange}
        onConfirm={jest.fn()}
        value={initial}
      />
    );
  return { onChange, screen };
}

describe("PlacePinEditor MapLibre pilot", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("uses the OpenFreeMap liberty style with visible attribution and the same test IDs", async () => {
    const { screen } = await renderEditor();
    const map = screen.getByTestId("place-pin-editor-native-map");

    expect(map.props.mapStyle).toBe(OPENFREEMAP_LIBERTY_STYLE_URL);
    expect(map.props.attribution).toBe(true);
    expect(map.props.logo).toBe(false);
    expect(map.props.androidView).toBe("texture");
    expect(
      screen.getByTestId("place-pin-editor-native-camera").props
        .initialViewState
    ).toEqual({ center: [51.531, 25.2854], zoom: 16 });
    expect(
      screen.getByTestId("place-pin-editor-native-marker").props
        .accessibilityLabel
    ).toBe("Draggable property pin");
    expect(
      screen.getByTestId("place-pin-editor-map-attribution")
    ).toBeTruthy();
  });

  it("preserves coordinate order, provenance, and confirmation reset after drag", async () => {
    const onChange = jest.fn();
    const { screen } = await renderEditor(onChange);
    const annotation = screen.getByTestId("property-pin-annotation");

    await act(async () => {
      annotation.props.onDragEnd({
        nativeEvent: {
          id: "property-pin",
          lngLat: [51.6, 25.4],
          point: [100, 100]
        }
      });
    });

    expect(onChange).toHaveBeenCalledWith({
      ...initial,
      latitude: 25.4,
      longitude: 51.6,
      source: "user_pin",
      precision: "user_placed",
      horizontalAccuracyMeters: null,
      observedAt: "2026-08-01T10:05:00.000Z",
      confirmedAt: null
    });
  });

  it("falls back to authoritative coordinates and the Places-list path on map failure", async () => {
    const { screen } = await renderEditor();
    const map = screen.getByTestId("place-pin-editor-native-map");

    await act(async () => {
      map.props.onDidFailLoadingMap({ nativeEvent: null });
    });

    expect(screen.getByTestId("place-pin-editor-map-fallback")).toBeTruthy();
    expect(
      screen.getByTestId("place-pin-editor-map-fallback-coordinates")
        .props.children
    ).toBe("25.28540, 51.53100");
    expect(screen.getByText(/Places list/u)).toBeTruthy();
    expect(
      screen.queryByTestId("place-pin-editor-native-map")
    ).toBeNull();
    expect(screen.getByTestId("place-pin-editor-coordinate-fields")).toBeTruthy();
  });

  it("uses the same truthful fallback when tile/style loading stalls", async () => {
    const { screen } = await renderEditor();

    await act(async () => {
      jest.advanceTimersByTime(MAP_LOAD_TIMEOUT_MS);
    });

    expect(screen.getByTestId("place-pin-editor-map-fallback")).toBeTruthy();
    expect(screen.getByText(/coordinates below remain editable/u)).toBeTruthy();
  });
});
