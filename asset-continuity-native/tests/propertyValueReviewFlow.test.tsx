import { fireEvent, render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ItemsScreen from "../app/(tabs)/assets";
import {
  getPortfolioValueRecords,
  recordPortfolioValue
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import { REGISTER_COPY } from "@/i18n/registerCopy";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn()
};
const mockParams = {
  view: "places",
  filter: "value"
};
const mockSample = createWorkspace("sample");
let mockWorkspace = mockSample;
let mockRecordedValues = getPortfolioValueRecords(mockWorkspace);

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
    recordedAssetValues: mockRecordedValues,
    workspace: mockWorkspace
  })
}));

describe("property value review journey", () => {
  beforeEach(() => {
    mockWorkspace = mockSample;
    mockRecordedValues = getPortfolioValueRecords(mockWorkspace);
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockRouter.setParams.mockClear();
  });

  it("preserves the URL cohort and opens the exact unvalued property", async () => {
    const screen = await render(<ItemsScreen />, {
      wrapper: SafeAreaTestProvider
    });

    expect(screen.getByText("Pearl Apartment")).toBeTruthy();
    expect(screen.queryByText("West Bay Home")).toBeNull();
    expect(
      screen.getByText("No property value recorded")
    ).toBeTruthy();

    const pearl = screen.getByRole("button", {
      name: /Pearl Apartment\. Needs property value\./u
    });
    expect(pearl.props.accessibilityHint).toBe(
      REGISTER_COPY.en.openPropertyValueHint
    );

    await fireEvent.press(pearl);
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/place/place-pearl"
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Organize" })
    );
    expect(
      screen.getByRole("radio", {
        name: "Needs property value"
      }).props.accessibilityState
    ).toEqual({ checked: true });
  });

  it("shows a truthful completed state with both recovery paths", async () => {
    const valued = recordPortfolioValue(
      mockSample,
      {
        placeId: "place-pearl",
        amountMinor: 2_000_000,
        currency: "QAR",
        asOf: "2026-07-27"
      },
      {
        id: () => "value-place-pearl-test",
        now: () => "2026-07-28T09:00:00.000Z"
      }
    );
    mockWorkspace = valued.workspace;
    mockRecordedValues = getPortfolioValueRecords(valued.workspace);

    const screen = await render(<ItemsScreen />, {
      wrapper: SafeAreaTestProvider
    });

    expect(
      screen.getByTestId("property-value-review-empty")
    ).toBeTruthy();
    expect(
      screen.getByText("No property values to review")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "There are no household-owned properties without a recorded value. Return to Portfolio or review every Place."
      )
    ).toBeTruthy();

    await fireEvent.press(screen.getByText("Return to Portfolio"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/dashboard");

    await fireEvent.press(screen.getByText("Review all Places"));
    expect(mockRouter.setParams).toHaveBeenCalledWith({
      filter: undefined
    });
  });

  it("provides independently authored Arabic copy and assistive guidance", () => {
    expect(REGISTER_COPY.ar.placeFilters.value).toBe(
      "تنقصه قيمة العقار"
    );
    expect(REGISTER_COPY.ar.noPropertyValuesTitle).toBe(
      "لا توجد قيم عقارية للمراجعة"
    );
    expect(REGISTER_COPY.ar.propertyValueMissing).toBe(
      "لم تُسجّل قيمة للعقار"
    );
    expect(REGISTER_COPY.ar.openPropertyValueHint).toMatch(
      /[\u0600-\u06ff]/u
    );
    expect(REGISTER_COPY.ar.openPropertyValueHint).not.toBe(
      REGISTER_COPY.en.openPropertyValueHint
    );
  });
});
