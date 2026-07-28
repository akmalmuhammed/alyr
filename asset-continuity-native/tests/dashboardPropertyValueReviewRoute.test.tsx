import { fireEvent, render } from "@testing-library/react-native";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn()
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/components/PortfolioDashboard", () => {
  const React = jest.requireActual("react");
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    PortfolioDashboard: ({
      onReviewPropertyValues
    }: {
      readonly onReviewPropertyValues?: () => void;
    }) =>
      React.createElement(
        Pressable,
        {
          accessibilityRole: "button",
          onPress: onReviewPropertyValues,
          testID: "mock-review-property-values"
        },
        React.createElement(Text, null, "Review property values")
      )
  };
});

jest.mock("@/i18n/secondarySurfaceCopy", () => ({
  useSecondarySurfaceCopy: () => ({
    copy: {
      portfolio: {
        preparing: "Preparing",
        preparingDetail: "Preparing detail",
        unavailableTitle: "Unavailable",
        unavailableDetail: "Unavailable detail",
        unavailablePreserved: "Preserved",
        continueSetup: "Continue setup"
      }
    },
    language: "en",
    rtl: false
  })
}));

jest.mock("@/privacy/PortfolioPrivacyProvider", () => ({
  usePortfolioPrivacy: () => ({
    amountsHidden: true,
    setAmountsHidden: jest.fn()
  })
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => {
    const { createWorkspace } = jest.requireActual("@/domain/sample");
    return {
      can: () => true,
      clearError: jest.fn(),
      confirmNoLiabilities: jest.fn(),
      error: null,
      loading: false,
      recordedPortfolioValues: [],
      workspace: createWorkspace("sample")
    };
  }
}));

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

import DashboardScreen from "../app/dashboard";

describe("Dashboard property-value review routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens the URL-backed missing-property-value cohort instead of Atlas", async () => {
    const screen = await render(<DashboardScreen />);

    await fireEvent.press(
      screen.getByTestId("mock-review-property-values")
    );

    expect(mockRouter.push).toHaveBeenCalledWith(
      "/assets?view=places&filter=value"
    );
    expect(mockRouter.push).not.toHaveBeenCalledWith("/atlas");
  });
});
