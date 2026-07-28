import { fireEvent, render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ItemsScreen from "../app/(tabs)/assets";
import { createWorkspace } from "@/domain/sample";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn()
};
const mockParams = {
  view: "places",
  filter: "no-pin"
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
    sample.places[1]!
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
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter
}));

jest.mock("@/components/AssetPhotoPreview", () => ({
  AssetPhotoPreview: () => null
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: () => true,
    recordedAssetValues: [],
    workspace: mockWorkspace
  })
}));

describe("Place completion filters", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockRouter.setParams.mockClear();
  });

  it("honours a direct no-pin link and exposes every Place debt accessibly", async () => {
    const screen = await render(<ItemsScreen />, {
      wrapper: SafeAreaTestProvider
    });

    expect(screen.getByText("West Bay Home")).toBeTruthy();
    expect(screen.queryByText("Pearl Apartment")).toBeNull();
    expect(screen.getByText("No pin · Recently updated")).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Organize" })
    );

    for (const label of [
      "All Places",
      "Pin needs review",
      "No pin",
      "Missing address",
      "Missing documents"
    ]) {
      expect(screen.getByRole("radio", { name: label })).toBeTruthy();
    }
    expect(
      screen.getByRole("radio", { name: "No pin" }).props
        .accessibilityState
    ).toEqual({ checked: true });

    await fireEvent.press(
      screen.getByRole("radio", { name: "Missing documents" })
    );

    expect(mockRouter.setParams).toHaveBeenLastCalledWith({
      filter: "missing-documents"
    });
    expect(
      screen.getByRole("radio", { name: "Missing documents" }).props
        .accessibilityState
    ).toEqual({ checked: true });
  });
});
