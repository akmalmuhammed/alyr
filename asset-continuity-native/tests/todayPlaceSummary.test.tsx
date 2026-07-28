import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import type { LanguageCode, NativeWorkspace } from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import {
  CORE_JOURNEY_COPY,
  placeCount,
  todayPlaceLocationSummary,
  todayRegionSummary
} from "@/i18n/coreJourneyCopy";
import { colors } from "@/theme/tokens";

const mockRouter = {
  push: jest.fn()
};
let mockLanguage: LanguageCode = "en";
let mockWorkspace: NativeWorkspace = createWorkspace("sample");

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => ({
    mode: "preview",
    session: null
  })
}));

jest.mock("@/i18n/coreJourneyCopy", () => {
  const actual = jest.requireActual("@/i18n/coreJourneyCopy");
  return {
    ...actual,
    useCoreJourneyCopy: () => ({
      copy: actual.CORE_JOURNEY_COPY[mockLanguage],
      language: mockLanguage,
      rtl: mockLanguage === "ar"
    })
  };
});

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: () => true,
    pendingOperationCount: 0,
    recordedPortfolioValues:
      jest.requireActual("@/domain/portfolio").getPortfolioValueRecords(
        mockWorkspace
      ),
    sync: {
      conflicts: [],
      lastSuccessfulSyncAt: null,
      lastSyncError: null,
      phase: "idle"
    },
    workspace: mockWorkspace
  })
}));

jest.mock("@/components/SyncTruth", () => {
  const { View } = jest.requireActual("react-native");
  return {
    SyncTruth: () => <View testID="sync-truth-stub" />
  };
});

jest.mock("@/components/AssetPhotoPreview", () => {
  const { View } = jest.requireActual("react-native");
  return {
    AssetPhotoPreview: () => (
      <View testID="asset-photo-preview-stub" />
    )
  };
});

jest.mock("@/components/AssetListItem", () => {
  const { View } = jest.requireActual("react-native");
  return {
    AssetListItem: () => <View testID="asset-list-item-stub" />
  };
});

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    })
  };
});

import HomeScreen from "../app/(tabs)/index";

function personalWorkspaceWithLocationDebt(): NativeWorkspace {
  const sample = createWorkspace("sample");
  const [first, second] = sample.places;
  return {
    ...createWorkspace("personal"),
    places: [
      {
        ...first!,
        id: "confirmed-doha",
        householdId: "household-personal",
        regionLabel: "Doha"
      },
      {
        ...second!,
        id: "pending-lusail",
        householdId: "household-personal",
        regionLabel: "Lusail",
        confirmedAt: null
      },
      {
        ...second!,
        id: "missing-doha",
        householdId: "household-personal",
        regionLabel: "Doha",
        latitude: null,
        longitude: null,
        locationSource: "not_set",
        precision: "locality_only",
        horizontalAccuracyMeters: null,
        observedAt: null,
        confirmedAt: null
      }
    ]
  };
}

describe("Today Place summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = "en";
    mockWorkspace = createWorkspace("sample");
  });

  it("shows persisted sample Place facts and opens Atlas", async () => {
    const screen = await render(<HomeScreen />);
    const entry = screen.getByTestId("today-atlas-entry");

    expect(
      screen.getByText(placeCount(2, "en"))
    ).toBeTruthy();
    expect(
      screen.getByText(todayRegionSummary(["Doha"], "en"))
    ).toBeTruthy();
    expect(
      screen.getByText(
        todayPlaceLocationSummary(2, 0, 0, "en")
      )
    ).toBeTruthy();
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.today.openAtlas)
    ).toBeTruthy();
    expect(entry.props.accessibilityLabel).toContain("2 Places");
    expect(entry.props.accessibilityLabel).toContain("Doha");
    expect(StyleSheet.flatten(entry.props.style)).toMatchObject({
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.borderStrong
    });
    expect(StyleSheet.flatten(entry.props.style)).not.toHaveProperty(
      "borderRadius"
    );
    expect(StyleSheet.flatten(entry.props.style)).not.toHaveProperty(
      "backgroundColor"
    );

    fireEvent.press(entry);

    expect(mockRouter.push).toHaveBeenCalledWith("/atlas");
  });

  it("keeps an empty personal register truthful and actionable", async () => {
    mockWorkspace = createWorkspace("personal");
    const screen = await render(<HomeScreen />);
    const entry = screen.getByTestId("today-atlas-entry");

    expect(
      screen.getByText(placeCount(0, "en"))
    ).toBeTruthy();
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.today.addPlaceDetail
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(
        todayPlaceLocationSummary(0, 0, 0, "en")
      )
    ).toBeNull();

    fireEvent.press(entry);

    expect(mockRouter.push).toHaveBeenCalledWith("/atlas");
  });

  it("exposes confirmation and missing-pin debt without inventing geography", async () => {
    mockWorkspace = personalWorkspaceWithLocationDebt();
    const screen = await render(<HomeScreen />);
    const locationSummary = todayPlaceLocationSummary(
      1,
      1,
      1,
      "en"
    );

    expect(
      screen.getByText(placeCount(3, "en"))
    ).toBeTruthy();
    expect(
      screen.getByText(
        todayRegionSummary(["Doha", "Lusail"], "en")
      )
    ).toBeTruthy();
    expect(screen.getByText(locationSummary)).toBeTruthy();
    expect(
      screen.getByTestId("today-atlas-entry").props
        .accessibilityLabel
    ).toContain(locationSummary);
  });

  it("localizes the same factual hierarchy for Arabic RTL", async () => {
    mockLanguage = "ar";
    mockWorkspace = personalWorkspaceWithLocationDebt();
    const screen = await render(<HomeScreen />);
    const locationSummary = todayPlaceLocationSummary(
      1,
      1,
      1,
      "ar"
    );
    const entry = screen.getByTestId("today-atlas-entry");

    expect(
      screen.getByText(placeCount(3, "ar"))
    ).toBeTruthy();
    expect(
      screen.getByText(
        todayRegionSummary(["Doha", "Lusail"], "ar")
      )
    ).toBeTruthy();
    expect(screen.getByText(locationSummary)).toBeTruthy();
    expect(entry.props.accessibilityLabel).toContain(
      CORE_JOURNEY_COPY.ar.stack.atlas
    );
    expect(entry.props.accessibilityHint).toBe(
      CORE_JOURNEY_COPY.ar.today.atlasHint
    );
  });
});
