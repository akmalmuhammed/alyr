import {
  act,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import ForgotPasswordScreen from "../app/(auth)/forgot-password";
import ResetPasswordScreen from "../app/(auth)/reset-password";
import SignInScreen from "../app/(auth)/sign-in";
import { isCompactAuthViewport } from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import {
  CORE_JOURNEY_COPY,
  localizeAuthFailure
} from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn()
};

let mockAuthState: Record<string, unknown>;
let mockParams: Record<string, string | string[] | undefined>;

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthState
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

function arabicWrapper({ children }: PropsWithChildren) {
  return (
    <LocaleProvider initialLanguage="ar">
      {children}
    </LocaleProvider>
  );
}

function baseAuthState() {
  return {
    busy: false,
    cancelPasswordRecovery: jest.fn(async () => true),
    checkConfirmedSession: jest.fn(),
    clearError: jest.fn(),
    clearStatus: jest.fn(),
    confirmation: null,
    continuePreview: jest.fn(),
    email: "owner@example.com",
    error: null,
    exchangeConfirmationCode: jest.fn(),
    exchangePasswordRecoveryCode: jest.fn(async () => null),
    mode: "supabase",
    passwordRecovery: null,
    passwordRecoveryGrant: null,
    requestPasswordRecovery: jest.fn(async () => true),
    resendConfirmation: jest.fn(async () => true),
    session: null,
    signIn: jest.fn(),
    signOut: jest.fn(async () => true),
    statusMessage: null,
    updatePassword: jest.fn(async () => true)
  };
}

describe("premium auth recovery lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockAuthState = baseAuthState();
  });

  it("uses compact spacing at 320×568 and large type, not at 390×844", () => {
    expect(
      isCompactAuthViewport({
        width: 320,
        height: 568,
        fontScale: 1
      })
    ).toBe(true);
    expect(
      isCompactAuthViewport({
        width: 390,
        height: 844,
        fontScale: 1
      })
    ).toBe(false);
    expect(
      isCompactAuthViewport({
        width: 390,
        height: 844,
        fontScale: 1.4
      })
    ).toBe(true);
  });

  it("keeps normal auth actions sticky and compact actions in the scroll flow", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const authComponents = readFileSync(
      `${process.cwd()}/src/auth/components.tsx`,
      "utf8"
    );
    const sharedUi = readFileSync(
      `${process.cwd()}/src/components/ui.tsx`,
      "utf8"
    );

    expect(authComponents).toContain(
      "...(footer && !compact ? { footer } : {})"
    );
    expect(authComponents).toContain("compact && footer");
    expect(authComponents).toContain('testID="auth-inline-footer"');
    expect(sharedUi).toContain(
      'behavior={Platform.OS === "ios" ? "padding" : undefined}'
    );
    expect(sharedUi).toContain(
      'automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}'
    );
  });

  it("offers an explicit resend after an unconfirmed sign-in", async () => {
    mockAuthState = {
      ...baseAuthState(),
      error: {
        code: "confirmation_required",
        message: "provider detail",
        retryable: false
      }
    };
    const screen = await render(<SignInScreen />);

    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.authErrors.confirmation_required
      )
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.confirmEmail.requestAgain)
    );
    await waitFor(() => {
      expect(mockAuthState.resendConfirmation).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith(
        AUTH_ROUTES.confirmEmail
      );
    });
  });

  it("shows a masked, non-enumerating sent state in Arabic RTL", async () => {
    mockAuthState = {
      ...baseAuthState(),
      passwordRecovery: {
        destination: "owner@example.com",
        requestedAt: "2026-07-27T10:00:00.000Z",
        delivery: "requested"
      }
    };
    const screen = await render(<ForgotPasswordScreen />, {
      wrapper: arabicWrapper
    });

    expect(screen.getByText("ow•••@example.com")).toBeTruthy();
    expect(screen.queryByText("owner@example.com")).toBeNull();
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.ar.forgotPassword.destinationNote
      )
    ).toBeTruthy();
    expect(
      localizeAuthFailure(
        {
          code: "network_unavailable",
          message: "provider detail",
          retryable: true
        },
        "ar"
      )
    ).toBe(
      CORE_JOURNEY_COPY.ar.authErrors.network_unavailable
    );
  });

  it("completes a truthful preview reset without cloud-delivery language", async () => {
    mockAuthState = {
      ...baseAuthState(),
      mode: "preview",
      passwordRecovery: {
        destination: "owner@example.com",
        requestedAt: "2026-07-27T10:00:00.000Z",
        delivery: "none"
      }
    };
    const screen = await render(<ResetPasswordScreen />);

    expect(
      screen.getByText(CORE_JOURNEY_COPY.en.resetPassword.previewNotice)
    ).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText(CORE_JOURNEY_COPY.en.resetPassword.password),
      "new private password"
    );
    await fireEvent.changeText(
      screen.getByLabelText(
        CORE_JOURNEY_COPY.en.resetPassword.confirmPassword
      ),
      "new private password"
    );
    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.resetPassword.submit)
    );

    await waitFor(() => {
      expect(mockAuthState.updatePassword).toHaveBeenCalledWith(
        "new private password"
      );
      expect(
        screen.getByText(
          CORE_JOURNEY_COPY.en.resetPassword.previewCompleteTitle
        )
      ).toBeTruthy();
    });
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.resetPassword.previewCompleteDetail
      )
    ).toBeTruthy();
  });

  it("does not unlock a signed reset form for an ordinary active session", async () => {
    mockAuthState = {
      ...baseAuthState(),
      session: {
        identity: {
          id: "account-owner",
          email: "owner@example.com",
          emailVerified: true
        },
        assurance: "verified-email",
        expiresAt: null,
        onboarding: "complete",
        activeHouseholdId: "household-a"
      }
    };

    const screen = await render(<ResetPasswordScreen />);
    await waitFor(() => {
      expect(
        screen.getByTestId("auth-reset-password-incomplete")
      ).toBeTruthy();
    });
    expect(
      screen.queryByLabelText(
        CORE_JOURNEY_COPY.en.resetPassword.password
      )
    ).toBeNull();
    expect(mockAuthState.updatePassword).not.toHaveBeenCalled();
  });

  it("enables the signed form only when a provider recovery grant exists", async () => {
    mockAuthState = {
      ...baseAuthState(),
      passwordRecoveryGrant: {
        id: "password-recovery-1",
        grantedAt: "2026-07-27T10:00:00.000Z"
      }
    };

    const screen = await render(<ResetPasswordScreen />);
    await waitFor(() => {
      expect(
        screen.getByTestId("auth-reset-password-screen")
      ).toBeTruthy();
    });
    expect(
      screen.getByLabelText(
        CORE_JOURNEY_COPY.en.resetPassword.password
      )
    ).toBeTruthy();
  });

  it("stays on the completed reset screen when provider sign-out fails", async () => {
    mockAuthState = {
      ...baseAuthState(),
      cancelPasswordRecovery: jest.fn(async () => false),
      passwordRecoveryGrant: {
        id: "password-recovery-1",
        grantedAt: "2026-07-27T10:00:00.000Z"
      }
    };
    const screen = await render(<ResetPasswordScreen />);
    await waitFor(() =>
      expect(
        screen.getByTestId("auth-reset-password-screen")
      ).toBeTruthy()
    );
    await fireEvent.changeText(
      screen.getByLabelText(CORE_JOURNEY_COPY.en.resetPassword.password),
      "new private password"
    );
    await fireEvent.changeText(
      screen.getByLabelText(
        CORE_JOURNEY_COPY.en.resetPassword.confirmPassword
      ),
      "new private password"
    );
    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.resetPassword.submit)
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("auth-reset-password-complete")
      ).toBeTruthy()
    );

    await fireEvent.press(
      screen.getByText(
        CORE_JOURNEY_COPY.en.resetPassword.backToSignIn
      )
    );
    await waitFor(() =>
      expect(
        mockAuthState.cancelPasswordRecovery
      ).toHaveBeenCalledTimes(1)
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("auth-reset-password-complete")
    ).toBeTruthy();
  });

  it("cancels recovery before leaving a pending deep-link exchange", async () => {
    mockParams = { code: "recovery-pkce-code" };
    const exchangeControl: { finish?: () => void } = {};
    mockAuthState = {
      ...baseAuthState(),
      exchangePasswordRecoveryCode: jest.fn(
        () =>
          new Promise<null>((resolve) => {
            exchangeControl.finish = () => resolve(null);
          })
      )
    };
    const screen = await render(<ResetPasswordScreen />);
    expect(
      screen.getByTestId("auth-reset-password-checking")
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByLabelText(CORE_JOURNEY_COPY.en.common.back)
    );
    await waitFor(() =>
      expect(
        mockAuthState.cancelPasswordRecovery
      ).toHaveBeenCalledTimes(1)
    );
    expect(mockRouter.replace).toHaveBeenCalledWith(
      AUTH_ROUTES.signIn
    );
    await act(async () => {
      exchangeControl.finish?.();
      await Promise.resolve();
    });
  });

  it("disables the iOS reset gesture so cleanup owns every exit", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const authLayout = readFileSync(
      `${process.cwd()}/app/(auth)/_layout.tsx`,
      "utf8"
    );
    expect(authLayout).toContain('name="reset-password"');
    expect(authLayout).toContain("gestureEnabled: false");
  });
});
