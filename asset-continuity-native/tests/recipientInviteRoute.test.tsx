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
let mockLanguage: "en" | "ar" = "en";

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
    useInviteCopy: () => actual.INVITE_COPY[mockLanguage]
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
    mockLanguage = "en";
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

  it("announces secure staging rather than household acceptance while signed out", async () => {
    mockParams = { code: "SECRET-STAGING-BEARER" };
    mockAuthState = state({
      pendingHouseholdInvite: null,
      stageHouseholdInvite: jest.fn(
        () => new Promise<boolean>(() => undefined)
      )
    });
    const screen = await render(<JoinHouseholdScreen />);

    expect(screen.getByText("Protecting the invitation")).toBeTruthy();
    expect(
      screen.getAllByText(
        "ALYR is moving the one-time code into encrypted storage on this device."
      ).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Joining the household")).toBeNull();
    expect(screen.queryByText("SECRET-STAGING-BEARER")).toBeNull();
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

  it("retries secure staging in place without revealing the bearer or provider detail", async () => {
    const stageHouseholdInvite = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mockParams = { code: "SECRET-RETRY-BEARER" };
    mockAuthState = state({
      pendingHouseholdInvite: null,
      stageHouseholdInvite
    });
    const screen = await render(<JoinHouseholdScreen />);

    await waitFor(() => {
      expect(stageHouseholdInvite).toHaveBeenCalledTimes(1);
    });
    mockAuthState = {
      ...mockAuthState,
      error: {
        code: "unexpected",
        message:
          "PRIVATE_PROVIDER_STORAGE_DETAIL SECRET-RETRY-BEARER",
        retryable: true
      }
    };
    await screen.rerender(<JoinHouseholdScreen />);

    expect(
      screen.getByText("Secure setup needs another try")
    ).toBeTruthy();
    expect(screen.queryByText("SECRET-RETRY-BEARER")).toBeNull();
    expect(
      screen.queryByText(/PRIVATE_PROVIDER_STORAGE_DETAIL/u)
    ).toBeNull();
    fireEvent.press(screen.getByText("Try again"));

    await waitFor(() => {
      expect(stageHouseholdInvite).toHaveBeenCalledTimes(2);
      expect(stageHouseholdInvite).toHaveBeenLastCalledWith(
        "SECRET-RETRY-BEARER"
      );
      expect(mockRouter.replace).toHaveBeenCalledWith("/join");
    });
    await screen.unmount();
  });

  it("retries a protected invitation after a retryable acceptance failure", async () => {
    const acceptPendingHouseholdInvite = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        membershipId: "membership-recipient"
      });
    mockAuthState = state({
      session: { identity: { id: "account-recipient" } },
      acceptPendingHouseholdInvite
    });
    const screen = await render(<JoinHouseholdScreen />);

    await waitFor(() => {
      expect(acceptPendingHouseholdInvite).toHaveBeenCalledTimes(1);
    });
    mockAuthState = {
      ...mockAuthState,
      error: {
        code: "unexpected",
        message:
          "PRIVATE_PROVIDER_REFRESH_DETAIL PRIVATE-INVITE-CODE",
        retryable: true
      }
    };
    await screen.rerender(<JoinHouseholdScreen />);

    expect(
      screen.getByText("Finishing the invitation needs another try")
    ).toBeTruthy();
    expect(screen.queryByText("PRIVATE-INVITE-CODE")).toBeNull();
    expect(
      screen.queryByText(/PRIVATE_PROVIDER_REFRESH_DETAIL/u)
    ).toBeNull();
    fireEvent.press(screen.getByText("Try again"));

    await waitFor(() => {
      expect(acceptPendingHouseholdInvite).toHaveBeenCalledTimes(2);
      expect(mockRouter.replace).toHaveBeenCalledWith("/");
    });
    expect(
      mockAuthState.discardPendingHouseholdInvite
    ).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("localizes the secure-staging retry action in Arabic", async () => {
    const stageHouseholdInvite = jest.fn(async () => false);
    mockLanguage = "ar";
    mockParams = { code: "SECRET-ARABIC-BEARER" };
    mockAuthState = state({
      pendingHouseholdInvite: null,
      stageHouseholdInvite
    });
    const screen = await render(<JoinHouseholdScreen />);

    await waitFor(() => {
      expect(stageHouseholdInvite).toHaveBeenCalledTimes(1);
    });
    mockAuthState = {
      ...mockAuthState,
      error: {
        code: "unexpected",
        message: "private detail",
        retryable: true
      }
    };
    await screen.rerender(<JoinHouseholdScreen />);

    expect(screen.getByText("حاول مرة أخرى")).toBeTruthy();
    expect(screen.queryByText("SECRET-ARABIC-BEARER")).toBeNull();
    await screen.unmount();
  });
});
