import { fireEvent, render } from "@testing-library/react-native";

import type {
  AuthGatewayMode,
  AuthSessionDescriptor
} from "@/auth/types";
import { createWorkspace } from "@/domain/sample";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";

const mockRouter = {
  push: jest.fn()
};
let mockMode: AuthGatewayMode = "supabase";
let mockSession: AuthSessionDescriptor | null = null;
const mockSampleWorkspace = createWorkspace("sample");

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => ({
    mode: mockMode,
    session: mockSession
  })
}));

jest.mock("@/i18n/coreJourneyCopy", () => {
  const actual = jest.requireActual("@/i18n/coreJourneyCopy");
  return {
    ...actual,
    useCoreJourneyCopy: () => ({
      copy: actual.CORE_JOURNEY_COPY.en,
      language: "en",
      rtl: false
    })
  };
});

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: () => true,
    pendingOperationCount: 0,
    recordedPortfolioValues:
      jest.requireActual("@/domain/portfolio").getPortfolioValueRecords(
        mockSampleWorkspace
      ),
    sync: {
      conflicts: [],
      lastSuccessfulSyncAt: null,
      lastSyncError: null,
      phase: "idle"
    },
    workspace: mockSampleWorkspace
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

import HomeScreen, {
  shouldPromoteSyncTruth
} from "../app/(tabs)/index";

describe("Today sample activation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMode = "supabase";
    mockSession = null;
  });

  it("promotes account creation without merging sample entries", async () => {
    const screen = await render(<HomeScreen />);

    expect(screen.getByTestId("today-sample-activation")).toBeTruthy();
    expect(screen.getAllByTestId("today-primary-action")).toHaveLength(1);
    expect(
      screen.getByTestId("today-secondary-command-action")
    ).toBeTruthy();
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.today.sampleNextTitle)
    ).toBeTruthy();
    fireEvent.press(
      screen.getByText(
        CORE_JOURNEY_COPY.en.vault.createMyPrivateHousehold
      )
    );

    expect(mockRouter.push).toHaveBeenCalledWith(
      "/(auth)/create-account"
    );
  });

  it("uses the confirmed local conversion route in Expo Go preview", async () => {
    mockMode = "preview";
    const screen = await render(<HomeScreen />);

    fireEvent.press(
      screen.getByText(
        CORE_JOURNEY_COPY.en.vault.createMyPrivateHousehold
      )
    );

    expect(mockRouter.push).toHaveBeenCalledWith("/personal-start");
  });

  it("promotes only conflicts and concrete sync errors above the next action", () => {
    const quiet = {
      conflicts: [],
      lastError: null,
      status: "idle" as const
    };

    expect(shouldPromoteSyncTruth(quiet)).toBe(false);
    expect(
      shouldPromoteSyncTruth({
        ...quiet,
        status: "local-only"
      })
    ).toBe(false);
    expect(
      shouldPromoteSyncTruth({
        ...quiet,
        status: "syncing"
      })
    ).toBe(false);
    expect(
      shouldPromoteSyncTruth({
        ...quiet,
        status: "offline"
      })
    ).toBe(false);
    expect(
      shouldPromoteSyncTruth({
        ...quiet,
        status: "needs-attention"
      })
    ).toBe(true);
    expect(
      shouldPromoteSyncTruth({
        ...quiet,
        conflicts: [{} as never]
      })
    ).toBe(true);
    expect(
      shouldPromoteSyncTruth({
        ...quiet,
        lastError: {
          errorVersion: 1,
          code: "OFFLINE",
          message: "The cloud could not be reached.",
          retryable: true
        }
      })
    ).toBe(true);
  });
});
