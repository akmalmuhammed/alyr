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
let mockAuthState: Record<string, any>;
let mockLanguage: "en" | "ar" = "en";
const mockStartWorkspace = jest.fn(async () => undefined);

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthState
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    startWorkspace: mockStartWorkspace,
    workspace: null
  })
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

const review = {
  householdName: "Rahman household",
  role: "viewer" as const,
  expiresAt: "2026-07-30T12:00:00.000Z"
};

function state(overrides: Record<string, unknown> = {}) {
  return {
    acceptPendingHouseholdInvite: jest.fn(),
    bootstrapState: "ready",
    busy: false,
    clearError: jest.fn(),
    deferPendingHouseholdInvite: jest.fn(),
    discardPendingHouseholdInvite: jest.fn(async () => undefined),
    error: null,
    mode: "supabase",
    pendingHouseholdInvite: {
      oneTimeCode: "PRIVATE-INVITE-CODE",
      capturedAt: "2026-07-28T08:00:00.000Z"
    },
    pendingHouseholdInviteReview: null,
    reviewPendingHouseholdInvite: jest.fn(async () => review),
    session: null,
    signOut: jest.fn(async () => true),
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

  it("offers sign-in or account creation without rendering or redeeming the bearer", async () => {
    const screen = await render(<JoinHouseholdScreen />);

    expect(screen.queryByText("PRIVATE-INVITE-CODE")).toBeNull();
    expect(
      mockAuthState.acceptPendingHouseholdInvite
    ).not.toHaveBeenCalled();
    expect(
      mockAuthState.reviewPendingHouseholdInvite
    ).not.toHaveBeenCalled();
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
        "Heldat is moving the one-time code into encrypted storage on this device."
      ).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Joining the household")).toBeNull();
    expect(screen.queryByText("SECRET-STAGING-BEARER")).toBeNull();
    await screen.unmount();
  });

  it("reviews a signed-in invitation without joining, then redeems only after the explicit Join action", async () => {
    const reviewPendingHouseholdInvite = jest.fn(async () => review);
    const acceptPendingHouseholdInvite = jest.fn(async () => ({
      membershipId: "membership-recipient"
    }));
    mockAuthState = state({
      session: {
        identity: { id: "account-recipient" },
        onboarding: "required"
      },
      reviewPendingHouseholdInvite,
      acceptPendingHouseholdInvite
    });
    const screen = await render(<JoinHouseholdScreen />);

    await waitFor(() => {
      expect(reviewPendingHouseholdInvite).toHaveBeenCalledTimes(1);
    });
    expect(acceptPendingHouseholdInvite).not.toHaveBeenCalled();

    mockAuthState = {
      ...mockAuthState,
      pendingHouseholdInviteReview: review
    };
    await screen.rerender(<JoinHouseholdScreen />);
    expect(screen.getByText("Review before you join")).toBeTruthy();
    expect(screen.getByText("Rahman household")).toBeTruthy();
    expect(screen.getByText("Viewer")).toBeTruthy();
    expect(screen.queryByText("PRIVATE-INVITE-CODE")).toBeNull();

    await fireEvent.press(screen.getByText("Join this household"));
    await waitFor(() => {
      expect(acceptPendingHouseholdInvite).toHaveBeenCalledTimes(1);
      expect(screen.getByText("You joined the household")).toBeTruthy();
    });
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/");

    await fireEvent.press(screen.getByText("Open household"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
    await screen.unmount();
  });

  it("keeps a reviewed invitation protected when the recipient chooses Not now", async () => {
    mockAuthState = state({
      session: {
        identity: { id: "account-recipient" },
        onboarding: "required"
      },
      pendingHouseholdInviteReview: review
    });
    const screen = await render(<JoinHouseholdScreen />);

    await fireEvent.press(screen.getByText("Not now"));
    expect(
      mockAuthState.deferPendingHouseholdInvite
    ).toHaveBeenCalledTimes(1);
    expect(
      mockAuthState.discardPendingHouseholdInvite
    ).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/(auth)/household"
    );
    await screen.unmount();
  });

  it("moves a protected invitation across an explicit account switch without putting it back in the URL", async () => {
    mockAuthState = state({
      session: {
        identity: { id: "account-recipient" },
        onboarding: "required"
      },
      pendingHouseholdInviteReview: review
    });
    const screen = await render(<JoinHouseholdScreen />);

    await fireEvent.press(screen.getByText("Use another account"));
    await waitFor(() => {
      expect(mockAuthState.signOut).toHaveBeenCalledTimes(1);
      expect(mockAuthState.stageHouseholdInvite).toHaveBeenCalledWith(
        "PRIVATE-INVITE-CODE"
      );
      expect(mockRouter.replace).toHaveBeenCalledWith(
        "/(auth)/sign-in"
      );
    });
    expect(screen.queryByText("PRIVATE-INVITE-CODE")).toBeNull();
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
    expect(screen.queryByText(/Rahman household/i)).toBeNull();
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
    await fireEvent.press(screen.getByText("Try again"));

    await waitFor(() => {
      expect(stageHouseholdInvite).toHaveBeenCalledTimes(2);
      expect(stageHouseholdInvite).toHaveBeenLastCalledWith(
        "SECRET-RETRY-BEARER"
      );
      expect(mockRouter.replace).toHaveBeenCalledWith("/join");
    });
    await screen.unmount();
  });

  it("retries explicit acceptance while keeping reviewed metadata visible and shows a local receipt on success", async () => {
    const acceptPendingHouseholdInvite = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        membershipId: "membership-recipient"
      });
    mockAuthState = state({
      session: {
        identity: { id: "account-recipient" },
        onboarding: "required"
      },
      pendingHouseholdInviteReview: review,
      acceptPendingHouseholdInvite
    });
    const screen = await render(<JoinHouseholdScreen />);

    await fireEvent.press(screen.getByText("Join this household"));
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
    await fireEvent.press(screen.getByText("Try again"));

    await waitFor(() => {
      expect(acceptPendingHouseholdInvite).toHaveBeenCalledTimes(2);
      expect(screen.getByText("You joined the household")).toBeTruthy();
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
