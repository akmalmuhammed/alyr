import { fireEvent, render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AtlasScreen from "../app/atlas";
import { createWorkspace } from "@/domain/sample";

const mockRouter = {
  push: jest.fn()
};
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
});
