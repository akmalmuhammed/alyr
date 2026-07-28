import {
  act,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import {
  AppState,
  StyleSheet,
  type AppStateStatus
} from "react-native";

import ConfirmEmailScreen, {
  isolateLtrEmail
} from "../app/(auth)/confirm-email";
import ForgotPasswordScreen from "../app/(auth)/forgot-password";
import ResetPasswordScreen from "../app/(auth)/reset-password";
import SignInScreen from "../app/(auth)/sign-in";
import { isCompactAuthViewport } from "@/auth/components";
import {
  AUTH_ROUTES,
  CONFIRM_EMAIL_ROUTES,
  confirmEmailReturnRoute
} from "@/auth/routes";
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
    pendingHouseholdInvite: null,
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
        CONFIRM_EMAIL_ROUTES.signIn
      );
    });
  });

  it("preserves Sign In as the confirmation return path", async () => {
    mockParams = { from: "sign-in" };
    mockAuthState = {
      ...baseAuthState(),
      acceptPendingHouseholdInvite: jest.fn(),
      confirmation: {
        delivery: "none"
      },
      mode: "preview",
      pendingHouseholdInvite: null
    };
    const screen = await render(<ConfirmEmailScreen />);
    expect(screen.queryByRole("progressbar")).toBeNull();

    await fireEvent.press(
      screen.getByLabelText(CORE_JOURNEY_COPY.en.common.back)
    );
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      AUTH_ROUTES.signIn
    );

    await fireEvent.press(
      screen.getByText(
        CORE_JOURNEY_COPY.en.confirmEmail.differentEmail
      )
    );
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      AUTH_ROUTES.signIn
    );
  });

  it("routes a newly confirmed recipient to invitation review without redeeming it", async () => {
    const acceptPendingHouseholdInvite = jest.fn();
    const checkConfirmedSession = jest.fn(async () => ({
      identity: {
        id: "account-recipient",
        email: "recipient@example.com",
        emailVerified: true
      },
      assurance: "verified-email",
      expiresAt: "2026-08-01T00:00:00.000Z",
      onboarding: "required",
      activeHouseholdId: null,
      activeMembershipId: null,
      activeHouseholdRole: null
    }));
    mockAuthState = {
      ...baseAuthState(),
      acceptPendingHouseholdInvite,
      checkConfirmedSession,
      confirmation: {
        delivery: "requested"
      },
      pendingHouseholdInvite: {
        oneTimeCode: "INVITE-RECIPIENT-03",
        capturedAt: "2026-07-28T08:20:00.000Z"
      }
    };
    const screen = await render(<ConfirmEmailScreen />);
    expect(
      screen.getByRole("progressbar", {
        name: CORE_JOURNEY_COPY.en.activationProgress.label
      }).props.accessibilityValue.text
    ).toBe("Verify account. Activation stage 1 of 3.");

    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.confirmEmail.confirmed)
    );
    await waitFor(() => {
      expect(checkConfirmedSession).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith("/join");
    });
    expect(acceptPendingHouseholdInvite).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("checks once when the live app returns and opens private-record setup", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const checkConfirmedSession = jest.fn(async () => ({
      identity: {
        id: "account-owner",
        email: "owner@example.com",
        emailVerified: true
      },
      assurance: "verified-email" as const,
      expiresAt: "2026-08-01T00:00:00.000Z",
      onboarding: "required" as const,
      activeHouseholdId: null,
      activeMembershipId: null,
      activeHouseholdRole: null
    }));
    mockAuthState = {
      ...baseAuthState(),
      checkConfirmedSession,
      confirmation: {
        delivery: "requested"
      }
    };
    const screen = await render(<ConfirmEmailScreen />);

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
      appStateListener?.("active");
    });

    await waitFor(() => {
      expect(checkConfirmedSession).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith(
        AUTH_ROUTES.household
      );
    });
    await screen.unmount();
  });

  it("checks a returning recipient once and opens invitation review without joining", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const acceptPendingHouseholdInvite = jest.fn();
    const checkConfirmedSession = jest.fn(async () => ({
      identity: {
        id: "account-recipient",
        email: "recipient@example.com",
        emailVerified: true
      },
      assurance: "verified-email" as const,
      expiresAt: "2026-08-01T00:00:00.000Z",
      onboarding: "required" as const,
      activeHouseholdId: null,
      activeMembershipId: null,
      activeHouseholdRole: null
    }));
    mockAuthState = {
      ...baseAuthState(),
      acceptPendingHouseholdInvite,
      checkConfirmedSession,
      confirmation: {
        delivery: "requested"
      },
      pendingHouseholdInvite: {
        oneTimeCode: "INVITE-RECIPIENT-04",
        capturedAt: "2026-07-28T08:30:00.000Z"
      }
    };
    const screen = await render(<ConfirmEmailScreen />);

    await act(async () => {
      appStateListener?.("inactive");
      appStateListener?.("active");
    });

    await waitFor(() => {
      expect(checkConfirmedSession).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith(
        AUTH_ROUTES.join
      );
    });
    expect(acceptPendingHouseholdInvite).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("queues one foreground check while another account action is busy", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const checkConfirmedSession = jest.fn(async () => null);
    mockAuthState = {
      ...baseAuthState(),
      busy: true,
      checkConfirmedSession,
      confirmation: {
        delivery: "requested"
      }
    };
    const screen = await render(<ConfirmEmailScreen />);

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });
    expect(checkConfirmedSession).not.toHaveBeenCalled();

    mockAuthState = {
      ...mockAuthState,
      busy: false
    };
    await screen.rerender(<ConfirmEmailScreen />);

    await waitFor(() => {
      expect(checkConfirmedSession).toHaveBeenCalledTimes(1);
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("serializes one check for each foreground transition", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    let finishFirstCheck: (
      session: Record<string, unknown> | null
    ) => void = () => undefined;
    const checkConfirmedSession = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown> | null>((resolve) => {
            finishFirstCheck = resolve;
          })
      )
      .mockResolvedValueOnce(null);
    mockAuthState = {
      ...baseAuthState(),
      checkConfirmedSession,
      confirmation: {
        delivery: "requested"
      }
    };
    const screen = await render(<ConfirmEmailScreen />);

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });
    await waitFor(() => {
      expect(checkConfirmedSession).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });
    expect(checkConfirmedSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishFirstCheck(null);
    });
    await waitFor(() => {
      expect(checkConfirmedSession).toHaveBeenCalledTimes(2);
    });
    await screen.unmount();
  });

  it("keeps preview confirmation manual and announces a live foreground check", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    let finishCheck: (
      session: Record<string, unknown> | null
    ) => void = () => undefined;
    const checkConfirmedSession = jest.fn(
      () =>
        new Promise<Record<string, unknown> | null>((resolve) => {
          finishCheck = resolve;
        })
    );
    mockAuthState = {
      ...baseAuthState(),
      checkConfirmedSession,
      confirmation: {
        delivery: "requested"
      }
    };
    const screen = await render(<ConfirmEmailScreen />);

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
      appStateListener?.("active");
    });
    const checkingCopy =
      CORE_JOURNEY_COPY.en.confirmEmail.foregroundChecking;
    await waitFor(() => {
      expect(checkConfirmedSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText(checkingCopy)).toBeTruthy();
    });
    expect(
      screen.getByText(checkingCopy).parent?.props
        .accessibilityLiveRegion
    ).toBe("polite");

    await act(async () => {
      finishCheck(null);
    });
    await waitFor(() => {
      expect(screen.queryByText(checkingCopy)).toBeNull();
    });

    const continuePreview = jest.fn();
    mockAuthState = {
      ...baseAuthState(),
      confirmation: {
        delivery: "none"
      },
      continuePreview,
      mode: "preview"
    };
    await screen.rerender(<ConfirmEmailScreen />);
    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });
    expect(continuePreview).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("keeps the manual confirmation check available after an automatic miss", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const checkConfirmedSession = jest.fn(async () => null);
    mockAuthState = {
      ...baseAuthState(),
      checkConfirmedSession,
      confirmation: {
        delivery: "requested"
      }
    };
    const screen = await render(<ConfirmEmailScreen />);

    await act(async () => {
      appStateListener?.("background");
      appStateListener?.("active");
    });
    await waitFor(() => {
      expect(checkConfirmedSession).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.confirmEmail.confirmed)
    );
    await waitFor(() => {
      expect(checkConfirmedSession).toHaveBeenCalledTimes(2);
    });
    await screen.unmount();
  });

  it("fails closed to Create Account for an unknown confirmation origin", () => {
    expect(confirmEmailReturnRoute(undefined)).toBe(
      AUTH_ROUTES.createAccount
    );
    expect(confirmEmailReturnRoute("unexpected")).toBe(
      AUTH_ROUTES.createAccount
    );
    expect(confirmEmailReturnRoute(["sign-in", "ignored"])).toBe(
      AUTH_ROUTES.signIn
    );
    expect(confirmEmailReturnRoute(["", "sign-in"])).toBe(
      AUTH_ROUTES.createAccount
    );
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

  it("right-aligns and directionally isolates the confirmation email in Arabic", async () => {
    mockAuthState = {
      ...baseAuthState(),
      acceptPendingHouseholdInvite: jest.fn(),
      confirmation: {
        delivery: "none"
      },
      continuePreview: jest.fn(),
      mode: "preview",
      pendingHouseholdInvite: null
    };
    const maskedEmail = "ow•••@example.com";
    const screen = await render(<ConfirmEmailScreen />, {
      wrapper: arabicWrapper
    });

    const destination = screen.getByLabelText(maskedEmail);
    const destinationStyle = StyleSheet.flatten(destination.props.style);
    const labelStyle = StyleSheet.flatten(
      screen.getByText(
        CORE_JOURNEY_COPY.ar.confirmEmail.testEmail
      ).props.style
    );

    expect(destination.props.children).toBe(
      isolateLtrEmail(maskedEmail)
    );
    expect(destinationStyle.writingDirection).toBe("ltr");
    expect(destinationStyle.textAlign).toBe("right");
    expect(labelStyle.fontSize).toBe(12);
  });

  it("keeps an unconfirmed return recoverable in Arabic", async () => {
    mockAuthState = {
      ...baseAuthState(),
      confirmation: {
        delivery: "requested"
      },
      error: {
        code: "session_missing",
        message: "provider detail",
        retryable: true
      }
    };
    const screen = await render(<ConfirmEmailScreen />, {
      wrapper: arabicWrapper
    });

    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.ar.confirmEmail.notConfirmedYet
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(
        CORE_JOURNEY_COPY.ar.authErrors.session_missing
      )
    ).toBeNull();
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

  it.each([
    ["en", undefined],
    ["ar", arabicWrapper]
  ] as const)(
    "keeps an invalid or consumed recovery code fail-closed in %s",
    async (language, wrapper) => {
      mockParams = { code: "already-consumed-recovery-code" };
      mockAuthState = {
        ...baseAuthState(),
        error: {
          code: "invalid_request",
          message: "provider detail",
          retryable: false
        },
        exchangePasswordRecoveryCode: jest.fn(async () => null),
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

      const screen = await render(
        <ResetPasswordScreen />,
        wrapper ? { wrapper } : undefined
      );

      await waitFor(() => {
        expect(
          mockAuthState.exchangePasswordRecoveryCode
        ).toHaveBeenCalledWith("already-consumed-recovery-code");
        expect(
          screen.getByTestId("auth-reset-password-incomplete")
        ).toBeTruthy();
      });
      expect(
        screen.queryByLabelText(
          CORE_JOURNEY_COPY[language].resetPassword.password
        )
      ).toBeNull();
      expect(mockAuthState.updatePassword).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          CORE_JOURNEY_COPY[language].resetPassword.incomplete
        )
      ).toBeTruthy();
      expect(
        screen.getByRole("alert").props.children
      ).toBe(CORE_JOURNEY_COPY[language].authErrors.invalid_request);
    }
  );

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

  it("disables iOS gestures where a screen owns a stateful exit", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const authLayout = readFileSync(
      `${process.cwd()}/app/(auth)/_layout.tsx`,
      "utf8"
    );
    expect(authLayout).toContain('name="reset-password"');
    expect(authLayout).toContain('name="confirm-email"');
    expect(authLayout).toContain('name="household"');
    const householdRoute = authLayout.slice(
      authLayout.indexOf('name="household"'),
      authLayout.indexOf('name="reset-password"')
    );
    expect(householdRoute).toContain("gestureEnabled: false");
  });
});
