import { fireEvent, render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AtlasScreen from "../app/atlas";
import { createWorkspace } from "@/domain/sample";

const mockRouter = {
  push: jest.fn()
};
const mockPlayTactileFeedback = jest.fn<
  Promise<void>,
  [string, { readonly reduceMotion: boolean }]
>(async () => undefined);
const sample = createWorkspace("sample");
const mockWorkspace = {
  ...sample,
  places: [
    {
      ...sample.places[0]!,
      latitude: null,
      longitude: null,
      locationSource: "not_set" as const,
      precision: "locality_only" as const,
      observedAt: null,
      confirmedAt: null
    },
    {
      ...sample.places[1]!,
      confirmedAt: null
    }
  ],
  assets: [
    ...sample.assets,
    {
      ...sample.assets.find(
        (asset) => asset.categoryId === "home.other"
      )!,
      id: "asset-unplaced",
      name: "Unplaced keepsake",
      placeId: null,
      roomId: null,
      locatorText: null,
      locationStatus: "unknown" as const
    }
  ]
};
const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 }
};

function SafeAreaTestProvider({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      {children}
    </SafeAreaProvider>
  );
}

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/components/AssetListItem", () => ({
  AssetListItem: () => null
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: () => true,
    workspace: mockWorkspace
  })
}));

jest.mock("@/accessibility/useReduceMotionPreference", () => ({
  useReduceMotionPreference: () => false
}));

jest.mock("@/feedback/tactileFeedback", () => ({
  __esModule: true,
  playTactileFeedback: (
    kind: string,
    options: { readonly reduceMotion: boolean }
  ) => mockPlayTactileFeedback(kind, options)
}));

jest.mock("phosphor-react-native", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  const Icon = (props: Record<string, unknown>) =>
    React.createElement(View, props);

  return {
    ArrowLeft: Icon,
    ArrowRight: Icon,
    GlobeHemisphereWest: Icon,
    ListBullets: Icon,
    MapPin: Icon,
    WarningCircle: Icon
  };
});

jest.mock("react-native-svg", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");
  const Element = ({
    children,
    ...props
  }: PropsWithChildren<Record<string, unknown>>) =>
    React.createElement(View, props, children);

  return {
    __esModule: true,
    default: Element,
    Circle: Element,
    Path: Element
  };
});

describe("Atlas location-work actions", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockPlayTactileFeedback.mockClear();
  });

  it("renders a visible title and exposes stateful Globe and List tabs", async () => {
    const screen = await render(<AtlasScreen />, {
      wrapper: SafeAreaTestProvider
    });
    const globe = screen.getByTestId("atlas-view-tab-globe");
    const list = screen.getByTestId("atlas-view-tab-list");

    expect(screen.getByRole("header", { name: "Atlas" })).toBeTruthy();
    expect(globe.props.accessibilityRole).toBe("tab");
    expect(globe.props.accessibilityState).toEqual({ selected: true });
    expect(list.props.accessibilityRole).toBe("tab");
    expect(list.props.accessibilityState).toEqual({ selected: false });

    await fireEvent.press(list);

    expect(
      screen.getByTestId("atlas-view-tab-globe").props
        .accessibilityState
    ).toEqual({ selected: false });
    expect(
      screen.getByTestId("atlas-view-tab-list").props
        .accessibilityState
    ).toEqual({ selected: true });
  });

  it("opens each truthful debt in its matching filtered register", async () => {
    const screen = await render(<AtlasScreen />, {
      wrapper: SafeAreaTestProvider
    });

    const noPin = screen.getByRole("button", {
      name: "1 Place needs a pin"
    });
    const review = screen.getByRole("button", {
      name: "1 pin needs review"
    });
    const unplaced = screen.getByRole("button", {
      name: "1 item has no Place"
    });

    expect(noPin.props.accessibilityHint).toBe(
      "Opens the matching filtered register"
    );

    await fireEvent.press(noPin);
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      "/assets?view=places&filter=no-pin"
    );

    await fireEvent.press(review);
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      "/assets?view=places&filter=pin-review"
    );

    await fireEvent.press(unplaced);
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      "/assets?view=items&filter=location"
    );
  });

  it("adds optional selection feedback when a mapped Place snaps into focus", async () => {
    const screen = await render(<AtlasScreen />, {
      wrapper: SafeAreaTestProvider
    });
    const place = mockWorkspace.places[1]!;
    const assetCount = mockWorkspace.assets.filter(
      (asset) =>
        asset.lifecycleStatus === "active" &&
        asset.placeId === place.id
    ).length;
    const pin = screen.getByRole("button", {
      name: `${place.name}, ${place.regionLabel}, ${assetCount} ${
        assetCount === 1 ? "item" : "items"
      }`
    });

    await fireEvent.press(pin);

    expect(mockPlayTactileFeedback).toHaveBeenCalledWith(
      "selection",
      { reduceMotion: false }
    );
  });
});
