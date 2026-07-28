import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import { Alert } from "react-native";

const mockClearError = jest.fn();
const mockConfirmNoLiabilities = jest.fn();
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn()
};
let mockWorkspaceError: string | null = null;

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/components/PortfolioDashboard", () => {
  const React = jest.requireActual("react");
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    PortfolioDashboard: ({
      onConfirmNoLiabilities
    }: {
      readonly onConfirmNoLiabilities?: () => void;
    }) =>
      React.createElement(
        Pressable,
        {
          accessibilityRole: "button",
          onPress: onConfirmNoLiabilities,
          testID: "mock-confirm-none"
        },
        React.createElement(Text, null, "Confirm none")
      )
  };
});

jest.mock("@/i18n/copy", () => ({
  useCopy: () => ({
    language: "en",
    rtl: false
  })
}));

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
      clearError: mockClearError,
      confirmNoLiabilities: mockConfirmNoLiabilities,
      error: mockWorkspaceError,
      loading: false,
      recordedPortfolioValues: [],
      workspace: createWorkspace("personal")
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

describe("Dashboard Liability review failure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceError = null;
    mockConfirmNoLiabilities.mockResolvedValue({
      id: "liability-review"
    });
  });

  it("renders the preserved provider failure as a dismissible accessible alert", async () => {
    mockWorkspaceError =
      "The local vault is unavailable. Nothing was saved.";
    const screen = await render(<DashboardScreen />);

    const alert = screen.getByRole("alert");
    expect(alert.props.children).toBe(mockWorkspaceError);
    await fireEvent.press(screen.getByLabelText("Dismiss message"));
    expect(mockClearError).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("handles a rejected confirmation while the provider publishes its recovery state", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    mockConfirmNoLiabilities.mockRejectedValueOnce(
      new Error("Review commit failed")
    );
    const screen = await render(<DashboardScreen />);

    await fireEvent.press(screen.getByTestId("mock-confirm-none"));
    const buttons = alertSpy.mock.calls[0]?.[2];
    const confirm = buttons?.find(
      (button) => button.style !== "cancel"
    );
    confirm?.onPress?.();

    await waitFor(() => {
      expect(mockConfirmNoLiabilities).toHaveBeenCalledTimes(1);
    });
    await screen.unmount();
  });
});
