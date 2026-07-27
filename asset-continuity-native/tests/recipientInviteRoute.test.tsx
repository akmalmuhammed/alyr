import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn()
};
let mockParams: { code?: string } = {};
let mockAuthState: Record<string, unknown>;

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthState
}));

jest.mock("@/i18n/inviteCopy", () => {
  const actual = jest.requireActual("@/i18n/inviteCopy");
  return {
    ...actual,
    useInviteCopy: () => actual.INVITE_COPY.en
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

import JoinHouseholdScreen from "../app/join";

function state(overrides: Record<string, unknown> = {}) {
  return {
    acceptPendingHouseholdInvite: jest.fn(),
    bootstrapState: "ready",
    busy: false,
    clearError: jest.fn(),
    discardPendingHouseholdInvite: jest.fn(async () => undefined),
    error: null,
    pendingHouseholdInvite: {
      oneTimeCode: "PRIVATE-INVITE-CODE",
      capturedAt: "2026-07-28T08:00:00.000Z"
    },
    session: null,
    stageHouseholdInvite: jest.fn(async () => true),
    ...overrides
  };
}

describe("recipient invitation route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockAuthState = state();
  });

  it("offers sign-in or account creation without rendering the bearer", async () => {
    const screen = await render(<JoinHouseholdScreen />);

    expect(screen.queryByText("PRIVATE-INVITE-CODE")).toBeNull();
    await fireEvent.press(screen.getByText("Sign in to accept"));
    expect(mockRouter.push).toHaveBeenCalledWith("/(auth)/sign-in");
    await fireEvent.press(screen.getByText("Create an account"));
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/(auth)/create-account"
    );
    await screen.unmount();
  });

  it("captures a signed-out deep link and immediately scrubs its route parameter", async () => {
    mockParams = { code: "SECRET-ROUTE-BEARER" };
    mockAuthState = state({ pendingHouseholdInvite: null });
    const screen = await render(<JoinHouseholdScreen />);

    await waitFor(() => {
      expect(mockAuthState.stageHouseholdInvite).toHaveBeenCalledWith(
        "SECRET-ROUTE-BEARER"
      );
      expect(mockRouter.replace).toHaveBeenCalledWith("/join");
    });
    expect(screen.queryByText("SECRET-ROUTE-BEARER")).toBeNull();
    await screen.unmount();
  });

  it("accepts immediately for an existing verified account", async () => {
    const acceptPendingHouseholdInvite = jest.fn(async () => ({
      membershipId: "membership-recipient"
    }));
    mockAuthState = state({
      session: { identity: { id: "account-recipient" } },
      acceptPendingHouseholdInvite
    });
    const screen = await render(<JoinHouseholdScreen />);

    await waitFor(() => {
      expect(acceptPendingHouseholdInvite).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith("/");
    });
    await screen.unmount();
  });

  it("reveals no household metadata for a missing or rejected invitation", async () => {
    mockAuthState = state({
      error: {
        code: "invalid_request",
        message: "invalid",
        retryable: false
      },
      pendingHouseholdInvite: null
    });
    const screen = await render(<JoinHouseholdScreen />);

    expect(
      screen.getByText("This invitation needs a new link")
    ).toBeTruthy();
    expect(screen.queryByText(/household-invited/i)).toBeNull();
    await screen.unmount();
  });
});
