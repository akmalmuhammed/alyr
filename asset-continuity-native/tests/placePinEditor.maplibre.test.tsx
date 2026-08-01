import { act, render } from "@testing-library/react-native";
import {
  useNetworkState,
  type NetworkState
} from "expo-network";
import type { PropsWithChildren } from "react";
import { AccessibilityInfo, Platform } from "react-native";

import {
  MAP_LOAD_TIMEOUT_MS,
  OPENFREEMAP_LIBERTY_STYLE_URL,
  PlacePinEditor
} from "@/components/PlacePinEditor";
import { createManualPlacePin } from "@/components/PlacePinEditor/contract";

jest.mock("expo-network", () => ({
  useNetworkState: jest.fn()
}));

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
  const GeoJSONSource = ({
    children,
    id,
    ...props
  }: PropsWithChildren<Record<string, unknown> & { id?: string }>) =>
    React.createElement(View, { ...props, id, testID: id }, children);
  const Layer = ({
    id,
    ...props
  }: Record<string, unknown> & { id?: string }) =>
    React.createElement(View, { ...props, id, testID: id });
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
  return { Camera, GeoJSONSource, Layer, Map, ViewAnnotation };
});

const initial = createManualPlacePin(
  25.2854,
  51.531,
  "2026-08-01T10:00:00.000Z"
);
const mockUseNetworkState = jest.mocked(useNetworkState);
let networkState: NetworkState;

function editor(
  onChange = jest.fn(),
  language: "en" | "ar" = "en"
) {
  return (
    <PlacePinEditor
      language={language}
      now={() => "2026-08-01T10:05:00.000Z"}
      onChange={onChange}
      onConfirm={jest.fn()}
      value={initial}
    />
  );
}

async function renderEditor(
  onChange = jest.fn(),
  language: "en" | "ar" = "en"
) {
  const screen = await render(editor(onChange, language));
  return { onChange, screen };
}

describe("PlacePinEditor MapLibre pilot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    networkState = {
      isConnected: true,
      isInternetReachable: true
    };
    mockUseNetworkState.mockImplementation(() => networkState);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it("renders and moves the Android pin visual without replacing native drag semantics", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      Platform,
      "OS"
    );
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android"
    });

    try {
      const { screen } = await renderEditor();
      const visualSource = screen.getByTestId(
        "place-pin-editor-pin-visual-source"
      );
      const outer = screen.getByTestId(
        "place-pin-editor-pin-visual-outer"
      );
      const core = screen.getByTestId(
        "place-pin-editor-pin-visual-core"
      );

      expect(visualSource.props.data.geometry.coordinates).toEqual([
        51.531,
        25.2854
      ]);
      expect(outer.props.paint).toEqual({
        "circle-color": "#15171A",
        "circle-radius": 19,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 3
      });
      expect(core.props.paint).toEqual({
        "circle-color": "#B7F34A",
        "circle-radius": 4.5
      });

      await act(async () => {
        screen.getByTestId("property-pin-annotation").props.onDrag({
          nativeEvent: {
            id: "property-pin",
            lngLat: [51.6, 25.4],
            point: [100, 100]
          }
        });
      });

      expect(
        screen.getByTestId("place-pin-editor-pin-visual-source").props
          .data.geometry.coordinates
      ).toEqual([51.6, 25.4]);
      expect(
        screen.getByTestId("property-pin-annotation").props.draggable
      ).toBe(true);
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(Platform, "OS", platformDescriptor);
      }
    }
  });

  it("keeps iOS on the native end-of-drag path without Android GL layers", async () => {
    expect(Platform.OS).toBe("ios");
    const onChange = jest.fn();
    const { screen } = await renderEditor(onChange);
    const annotation = screen.getByTestId("property-pin-annotation");

    expect(annotation.props.onDrag).toBeUndefined();
    expect(annotation.props.onDragEnd).toEqual(expect.any(Function));
    expect(
      screen.queryByTestId("place-pin-editor-pin-visual-source")
    ).toBeNull();
    expect(
      screen.queryByTestId("place-pin-editor-pin-visual-outer")
    ).toBeNull();
    expect(
      screen.queryByTestId("place-pin-editor-pin-visual-core")
    ).toBeNull();

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

  it("uses the Expo listener hook without tile polling or prefetch calls", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/src/components/PlacePinEditor/index.native.tsx`,
      "utf8"
    );

    expect(source).toContain("useNetworkState()");
    expect(source).not.toMatch(/\bsetInterval\s*\(/u);
    expect(source).not.toMatch(
      /\b(?:prefetch|downloadOfflineRegion|OfflineManager)\s*\(/u
    );
  });

  it("switches a ready map immediately to a latched coordinate fallback when connectivity is lost", async () => {
    const { screen } = await renderEditor();
    const map = screen.getByTestId("place-pin-editor-native-map");

    await act(async () => {
      map.props.onDidFinishRenderingMapFully();
    });
    expect(screen.getByTestId("place-pin-editor-native-map")).toBeTruthy();

    networkState = {
      isConnected: false,
      isInternetReachable: false
    };
    await screen.rerender(editor());

    expect(screen.queryByTestId("place-pin-editor-native-map")).toBeNull();
    expect(screen.getByTestId("place-pin-editor-map-fallback")).toBeTruthy();
    expect(
      screen.getByTestId("place-pin-editor-map-fallback-coordinates")
        .props.children
    ).toBe("25.28540, 51.53100");

    networkState = {
      isConnected: true,
      isInternetReachable: true
    };
    await screen.rerender(editor());

    expect(screen.getByTestId("place-pin-editor-map-fallback")).toBeTruthy();
    expect(screen.queryByTestId("place-pin-editor-native-map")).toBeNull();
  });

  it("treats an unknown initial network state as neutral rather than offline", async () => {
    networkState = {};
    const { screen } = await renderEditor();

    expect(screen.getByTestId("place-pin-editor-native-map")).toBeTruthy();
    expect(screen.queryByTestId("place-pin-editor-map-fallback")).toBeNull();

    await act(async () => {
      screen
        .getByTestId("place-pin-editor-native-map")
        .props.onDidFinishRenderingMapFully();
    });

    expect(screen.getByTestId("place-pin-editor-native-map")).toBeTruthy();
  });

  it("announces an asynchronous iOS fallback once and suppresses duplicate announcements", async () => {
    expect(Platform.OS).toBe("ios");
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    const { screen } = await renderEditor();

    await act(async () => {
      screen
        .getByTestId("place-pin-editor-native-map")
        .props.onDidFinishRenderingMapFully();
    });
    expect(announce).not.toHaveBeenCalled();

    networkState = {
      isConnected: false,
      isInternetReachable: false
    };
    await screen.rerender(editor());

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith(
      "Map unavailable. Map tiles could not load. The coordinates below remain editable and authoritative; return to the Places list to continue without the map. 25.28540, 51.53100"
    );
    expect(
      screen.getByTestId("place-pin-editor-map-fallback").props
        .accessibilityLiveRegion
    ).toBe("polite");

    await screen.rerender(editor());
    await act(async () => {
      jest.advanceTimersByTime(MAP_LOAD_TIMEOUT_MS);
    });

    expect(announce).toHaveBeenCalledTimes(1);
  });
});
