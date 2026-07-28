import {
  act,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import AuthCallbackScreen from "../app/(auth)/callback";
import HouseholdSetupScreen from "../app/(auth)/household";
import PrivacyAndCaptureScreen from "../app/(auth)/privacy";
import { AUTH_ROUTES } from "@/auth/routes";
import type { AuthSessionDescriptor } from "@/auth/types";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  push: jest.fn(),
  replace: jest.fn()
};

let mockParams: { code?: string | string[] } = {};
let mockAuthState: Record<string, unknown>;
let mockWorkspaceState: Record<string, unknown>;
let mockDeviceAuthState: Record<string, unknown>;

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } =
    jest.requireActual("react-native") as typeof import("react-native");
  return {
    Redirect: ({ href }: { readonly href: string }) =>
      React.createElement(Text, { testID: "auth-redirect" }, href),
    useLocalSearchParams: () => mockParams,
    useRouter: () => mockRouter
  };
});

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthState
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => mockWorkspaceState
}));

jest.mock("@/deviceAuth", () => {
  const copy =
    jest.requireActual("@/deviceAuth/copy") as typeof import("@/deviceAuth/copy");
  return {
    ...copy,
    useDeviceAuth: () => mockDeviceAuthState
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

const verifiedIncompleteSession: AuthSessionDescriptor = {
  identity: {
    id: "account-owner",
    email: "owner@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: null,
  onboarding: "required",
  activeHouseholdId: null,
  activeMembershipId: null,
  activeHouseholdRole: null
};

function authState(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    acceptHouseholdInvite: jest.fn(),
    acceptPendingHouseholdInvite: jest.fn(),
    activeHouseholdId: null,
    busy: false,
    checkConfirmedSession: jest.fn(),
    clearError: jest.fn(),
    completeOnboarding: jest.fn(async () => true),
    confirmation: null,
    continuePreview: jest.fn(),
    createCompletion: jest.fn(() => ({
      householdName: "Rahman household",
      firstCaptureIntent: "item",
      session: verifiedIncompleteSession
    })),
    email: "",
    error: null,
    exchangeConfirmationCode: jest.fn(async () => null),
    firstCaptureIntent: "item",
    householdName: "",
    mode: "supabase",
    pendingHouseholdInvite: null,
    provisionHousehold: jest.fn(),
    resendConfirmation: jest.fn(async () => true),
    session: verifiedIncompleteSession,
    setFirstCaptureIntent: jest.fn(),
    setHouseholdName: jest.fn(),
    signOut: jest.fn(async () => true),
    statusMessage: null,
    ...overrides
  };
}

function workspaceState(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    clearError: jest.fn(),
    error: null,
    renameHousehold: jest.fn(async () => undefined),
    retryBootstrap: jest.fn(async () => undefined),
    saving: false,
    startWorkspace: jest.fn(async () => undefined),
    storageReady: true,
    workspace: null,
    ...overrides
  };
}

function deviceAuthState(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    authorizeOnboarding: jest.fn(async (intent) => ({
      kind: "authorized",
      intent
    })),
    checkOnboardingProtection: jest.fn(async () => null),
    clearOnboardingAuthorization: jest.fn(),
    onboardingHandoffRestoreState: "ready",
    onboardingPreflight: {
      phase: "ready",
      capability: {
        kind: "available",
        method: "face",
        biometricEnrolled: true
      },
      intent: null,
      notice: null
    },
    pendingFirstRecordIntent: null,
    retryOnboardingHandoffRestore: jest.fn(),
    ...overrides
  };
}

function wrapper(language: "en" | "ar") {
  return function TestLocale({ children }: PropsWithChildren) {
    return (
      <LocaleProvider initialLanguage={language}>
        {children}
      </LocaleProvider>
    );
  };
}

describe("confirmation recovery and incomplete-onboarding account exit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockRouter.canGoBack.mockReturnValue(false);
    mockAuthState = authState();
    mockWorkspaceState = workspaceState();
    mockDeviceAuthState = deviceAuthState();
  });

  it("exchanges a confirmation code from cold state before continuing", async () => {
    let finishExchange:
      | ((session: AuthSessionDescriptor) => void)
      | undefined;
    mockParams = { code: "confirmation-pkce-code" };
    mockAuthState = authState({
      email: "",
      session: null,
      exchangeConfirmationCode: jest.fn(
        () =>
          new Promise<AuthSessionDescriptor>((resolve) => {
            finishExchange = resolve;
          })
      )
    });

    const screen = await render(<AuthCallbackScreen />, {
      wrapper: wrapper("en")
    });

    expect(screen.getByTestId("auth-callback-checking")).toBeTruthy();
    expect(
      screen.getByLabelText(
        CORE_JOURNEY_COPY.en.callback.checkingLabel
      )
    ).toBeTruthy();

    await act(async () => {
      finishExchange?.(verifiedIncompleteSession);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId("auth-callback-complete")).toBeTruthy()
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.continue)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith(
      AUTH_ROUTES.household
    );
    await screen.unmount();
  });

  it("keeps retry, sign-in, resend and recovery actions after dismissing an exchange error", async () => {
    mockParams = { code: "expired-confirmation-code" };
    mockAuthState = authState({
      email: "",
      session: null,
      error: {
        code: "session_missing",
        message: "Provider detail",
        retryable: true
      }
    });

    const screen = await render(<AuthCallbackScreen />, {
      wrapper: wrapper("en")
    });

    await waitFor(() =>
      expect(screen.getByTestId("auth-callback-failed")).toBeTruthy()
    );
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.retry)
    ).toBeTruthy();
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.signIn)
    ).toBeTruthy();
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.callback.signInToResend
      )
    ).toBeTruthy();
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.recover)
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Dismiss message" })
    );

    expect(mockAuthState.clearError).toHaveBeenCalled();
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.retry)
    ).toBeTruthy();
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.callback.signInToResend
      )
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByText(
        CORE_JOURNEY_COPY.en.callback.signInToResend
      )
    );
    expect(mockAuthState.resendConfirmation).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith(
      AUTH_ROUTES.signIn
    );

    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.recover)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith(
      AUTH_ROUTES.forgotPassword
    );
    await screen.unmount();
  });

  it("retries the same callback and exposes the complete state after verification", async () => {
    const exchange = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(verifiedIncompleteSession);
    mockParams = { code: "retryable-confirmation-code" };
    mockAuthState = authState({
      session: null,
      exchangeConfirmationCode: exchange
    });

    const screen = await render(<AuthCallbackScreen />, {
      wrapper: wrapper("en")
    });
    await waitFor(() =>
      expect(screen.getByTestId("auth-callback-failed")).toBeTruthy()
    );

    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.retry)
    );

    await waitFor(() =>
      expect(screen.getByTestId("auth-callback-complete")).toBeTruthy()
    );
    expect(exchange).toHaveBeenCalledTimes(2);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.continue)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith(
      AUTH_ROUTES.household
    );
    await screen.unmount();
  });

  it("maps a rejected confirmation exchange and keeps every recovery action available", async () => {
    const exchange = jest.fn().mockRejectedValue(
      new TypeError("Network request failed")
    );
    mockParams = { code: "rejected-confirmation-code" };
    mockAuthState = authState({
      email: "owner@example.com",
      session: null,
      exchangeConfirmationCode: exchange
    });

    const screen = await render(<AuthCallbackScreen />, {
      wrapper: wrapper("en")
    });

    await waitFor(() =>
      expect(screen.getByTestId("auth-callback-failed")).toBeTruthy()
    );
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.authErrors.network_unavailable
      )
    ).toBeTruthy();
    const retry = screen.getByText(
      CORE_JOURNEY_COPY.en.callback.retry
    );
    expect(retry.parent?.parent?.props.accessibilityRole).toBe(
      "button"
    );
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.signIn)
    ).toBeTruthy();
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.resend)
    ).toBeTruthy();
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.recover)
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Dismiss message" })
    );
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.retry)
    ).toBeTruthy();
    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.resend)
    ).toBeTruthy();
    await screen.unmount();
  });

  it("retries only pending-invite acceptance when it rejects after a successful exchange", async () => {
    const exchange = jest.fn(async () => verifiedIncompleteSession);
    const acceptPendingHouseholdInvite = jest
      .fn()
      .mockRejectedValueOnce({
        code: "network_unavailable",
        message: "Provider detail",
        retryable: true
      })
      .mockResolvedValueOnce({
        membershipId: "membership-recipient",
        householdId: "household-invited"
      });
    mockParams = { code: "confirmed-before-invite-code" };
    mockAuthState = authState({
      acceptPendingHouseholdInvite,
      email: "owner@example.com",
      exchangeConfirmationCode: exchange,
      pendingHouseholdInvite: {
        oneTimeCode: "INVITE-RECIPIENT-01",
        capturedAt: "2026-07-28T08:00:00.000Z"
      },
      session: null
    });

    const screen = await render(<AuthCallbackScreen />, {
      wrapper: wrapper("en")
    });
    await waitFor(() =>
      expect(screen.getByTestId("auth-callback-failed")).toBeTruthy()
    );

    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.callback.inviteFailedTitle
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.authErrors.network_unavailable
      )
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByText(
        CORE_JOURNEY_COPY.en.callback.retryInvite
      )
    );

    await waitFor(() =>
      expect(screen.getByTestId("auth-callback-complete")).toBeTruthy()
    );
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(acceptPendingHouseholdInvite).toHaveBeenCalledTimes(2);
    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.callback.continue)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
    await screen.unmount();
  });

  it("keeps rejected confirmation recovery localized and accessible in Arabic", async () => {
    mockParams = { code: "rejected-arabic-confirmation-code" };
    mockAuthState = authState({
      email: "owner@example.com",
      exchangeConfirmationCode: jest.fn().mockRejectedValue({
        code: "rate_limited",
        message: "Provider detail",
        retryable: true
      }),
      session: null
    });

    const screen = await render(<AuthCallbackScreen />, {
      wrapper: wrapper("ar")
    });
    await waitFor(() =>
      expect(screen.getByTestId("auth-callback-failed")).toBeTruthy()
    );

    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.ar.authErrors.rate_limited
      )
    ).toBeTruthy();
    const retry = screen.getByText(
      CORE_JOURNEY_COPY.ar.callback.retry
    );
    expect(retry.parent?.parent?.props.accessibilityRole).toBe(
      "button"
    );
    expect(
      screen.getByText(CORE_JOURNEY_COPY.ar.callback.signIn)
    ).toBeTruthy();
    expect(
      screen.getByText(CORE_JOURNEY_COPY.ar.callback.resend)
    ).toBeTruthy();
    await screen.unmount();
  });

  it("exits a cold-start incomplete Household through the signed account boundary", async () => {
    const signOut = jest.fn(async () => true);
    mockAuthState = authState({ signOut });

    const screen = await render(<HouseholdSetupScreen />, {
      wrapper: wrapper("en")
    });
    const exitLabel = screen.getByText(
      CORE_JOURNEY_COPY.en.common.useAnotherAccount
    );
    const exit = exitLabel.parent;

    expect(exit?.props.accessibilityRole).toBe("button");
    expect(exit?.props.accessibilityState).toEqual(
      expect.objectContaining({
        busy: false,
        disabled: false
      })
    );
    await fireEvent.press(exitLabel);

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(mockRouter.replace).toHaveBeenCalledWith(
      AUTH_ROUTES.welcome
    );
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(
      mockRouter.replace.mock.invocationCallOrder[0] ?? Infinity
    );
    await screen.unmount();
  });

  it("clears the first-record handoff before exiting incomplete Privacy", async () => {
    const callOrder: string[] = [];
    const signOut = jest.fn(async () => {
      callOrder.push("sign-out");
      return true;
    });
    const clearOnboardingAuthorization = jest.fn(() => {
      callOrder.push("clear-handoff");
    });
    mockAuthState = authState({
      activeHouseholdId: "household-a",
      householdName: "Rahman household",
      session: {
        ...verifiedIncompleteSession,
        activeHouseholdId: "household-a",
        activeMembershipId: "membership-owner",
        activeHouseholdRole: "owner"
      },
      signOut
    });
    mockDeviceAuthState = deviceAuthState({
      clearOnboardingAuthorization
    });

    const screen = await render(<PrivacyAndCaptureScreen />, {
      wrapper: wrapper("en")
    });
    await fireEvent.press(
      screen.getByText(
        CORE_JOURNEY_COPY.en.common.useAnotherAccount
      )
    );

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(callOrder).toEqual(["clear-handoff", "sign-out"]);
    expect(mockRouter.replace).toHaveBeenCalledWith(
      AUTH_ROUTES.welcome
    );
    await screen.unmount();
  });

  it("exposes the account exit as a localized Arabic button", async () => {
    const screen = await render(<HouseholdSetupScreen />, {
      wrapper: wrapper("ar")
    });

    const exitLabel = screen.getByText(
      CORE_JOURNEY_COPY.ar.common.useAnotherAccount
    );
    expect(exitLabel.parent?.props.accessibilityRole).toBe("button");
    expect(exitLabel.parent?.props.accessibilityState).toEqual(
      expect.objectContaining({
        busy: false,
        disabled: false
      })
    );
    await screen.unmount();
  });
});
