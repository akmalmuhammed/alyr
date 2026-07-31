import {
  fireEvent,
  render
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn()
};
const mockAuthState = {
  activeHouseholdId: null,
  busy: false,
  clearError: jest.fn(),
  createAccount: jest.fn(),
  error: null,
  householdName: "My household",
  mode: "preview" as "preview" | "supabase",
  refreshSignupMode: jest.fn(async () => "closed_pilot"),
  signupMode: "closed_pilot" as
    | "closed_pilot"
    | "public_email"
    | "public_email_google"
    | null,
  signupModeState: "ready" as
    | "idle"
    | "loading"
    | "ready"
    | "error",
  pendingHouseholdInvite: null as {
    oneTimeCode: string;
    capturedAt: string;
  } | null,
  acceptPendingHouseholdInvite: jest.fn(),
  provisionHousehold: jest.fn(),
  selectHousehold: jest.fn(),
  session: {
    identity: {
      id: "account-owner",
      email: "owner@example.com",
      emailVerified: true
    }
  },
  setHouseholdName: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(async () => true),
  stageHouseholdInvite: jest.fn(async () => true)
};

jest.mock("@/auth/components", () => {
  const actual = jest.requireActual("@/auth/components");
  return {
    ...actual,
    focusFirstInvalidAuthField: jest.fn()
  };
});

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthState
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    startWorkspace: jest.fn(),
    workspace: null
  })
}));

jest.mock("@/i18n/copy", () => ({
  useCopy: () => ({
    language: "en",
    rtl: false,
    text: {}
  })
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

jest.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => mockRouter
}));

import CreateAccountScreen from "../app/(auth)/create-account";
import HouseholdSetupScreen from "../app/(auth)/household";
import SignInScreen from "../app/(auth)/sign-in";
import { focusFirstInvalidAuthField } from "@/auth/components";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { typography } from "@/theme/tokens";

const mockFocusFirstInvalidAuthField =
  focusFirstInvalidAuthField as jest.MockedFunction<
    typeof focusFirstInvalidAuthField
  >;

describe("auth form first-invalid-field wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.mode = "preview";
    mockAuthState.signupMode = "closed_pilot";
    mockAuthState.signupModeState = "ready";
    mockAuthState.householdName = "";
    mockAuthState.pendingHouseholdInvite = null;
  });

  it("orders create-account fields from email through confirmation", async () => {
    const screen = await render(<CreateAccountScreen />);

    expect(
      screen.getAllByRole("button", { name: "Show password" })
    ).toHaveLength(2);
    await fireEvent.press(screen.getByText("Create account"));

    expect(mockFocusFirstInvalidAuthField).toHaveBeenCalledTimes(1);
    expect(
      mockFocusFirstInvalidAuthField.mock.calls[0]?.[0].map(
        (target) => target.error
      )
    ).toEqual([
      expect.stringMatching(/email/i),
      expect.stringMatching(/password/i),
      expect.stringMatching(/password/i)
    ]);
    expect(mockAuthState.createAccount).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Early access code")).toBeNull();
    await screen.unmount();
  });

  it("requires pilot access in signed mode before creating an account", async () => {
    mockAuthState.mode = "supabase";
    const screen = await render(<CreateAccountScreen />);
    const pilotCodeStyle = StyleSheet.flatten(
      screen.getByLabelText("Early access code").props.style
    );
    expect(pilotCodeStyle.fontFamily).toBe(typography.bodyBold);
    expect(pilotCodeStyle.textAlign).toBe("left");
    expect(pilotCodeStyle.writingDirection).toBe("ltr");
    await fireEvent.changeText(
      screen.getByLabelText("Email"),
      "owner@example.com"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Password"),
      "correct horse battery staple"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "correct horse battery staple"
    );

    await fireEvent.press(
      screen.getByText("Verify access and create account")
    );

    expect(
      screen.getByText("Enter your early access code.")
    ).toBeTruthy();
    expect(mockAuthState.createAccount).not.toHaveBeenCalled();
    expect(
      mockFocusFirstInvalidAuthField.mock.calls[0]?.[0].map(
        (target) => target.error
      )
    ).toEqual([
      undefined,
      "Enter your early access code.",
      undefined,
      undefined
    ]);
    await screen.unmount();
  });

  it("passes the canonical pilot code only in signed mode", async () => {
    mockAuthState.mode = "supabase";
    const screen = await render(<CreateAccountScreen />);
    await fireEvent.changeText(
      screen.getByLabelText("Email"),
      " OWNER@EXAMPLE.COM "
    );
    await fireEvent.changeText(
      screen.getByLabelText("Early access code"),
      "alyr-aaaa-bbbb-cccc"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Password"),
      "correct horse battery staple"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "correct horse battery staple"
    );

    await fireEvent.press(
      screen.getByText("Verify access and create account")
    );

    expect(mockAuthState.createAccount).toHaveBeenCalledWith(
      "owner@example.com",
      "correct horse battery staple",
      "ALYRAAAABBBBCCCC"
    );
    await screen.unmount();
  });

  it("removes the operator code and uses public signup copy only for a trusted public mode", async () => {
    mockAuthState.mode = "supabase";
    mockAuthState.signupMode = "public_email";
    const screen = await render(<CreateAccountScreen />);

    expect(screen.queryByLabelText("Early access code")).toBeNull();
    expect(
      screen.getByText(
        "Registration is open. Create your private account with your email."
      )
    ).toBeTruthy();
    await fireEvent.changeText(
      screen.getByLabelText("Email"),
      "owner@example.com"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Password"),
      "correct horse battery staple"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "correct horse battery staple"
    );
    await fireEvent.press(screen.getByText("Create account"));

    expect(mockAuthState.createAccount).toHaveBeenCalledWith(
      "owner@example.com",
      "correct horse battery staple",
      undefined
    );
    await screen.unmount();
  });

  it("rerenders the required operator field after public signup closes", async () => {
    mockAuthState.mode = "supabase";
    mockAuthState.signupMode = "public_email";
    const screen = await render(<CreateAccountScreen />);
    expect(screen.queryByLabelText("Early access code")).toBeNull();

    mockAuthState.signupMode = "closed_pilot";
    await screen.rerender(<CreateAccountScreen />);

    expect(screen.getByLabelText("Early access code")).toBeTruthy();
    expect(
      screen.getByText(
        "Heldat is in limited early access. We verify your email and access code before creating an account."
      )
    ).toBeTruthy();
    await screen.unmount();
  });

  it("fails closed and offers a retry when launch mode is unavailable", async () => {
    mockAuthState.mode = "supabase";
    mockAuthState.signupMode = null;
    mockAuthState.signupModeState = "error";
    const screen = await render(<CreateAccountScreen />);

    expect(screen.queryByLabelText("Early access code")).toBeNull();
    expect(
      screen.getByText(
        "Registration availability could not be verified. Check your connection and try again."
      )
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByText("Check availability again")
    );

    expect(mockAuthState.refreshSignupMode).toHaveBeenCalledTimes(1);
    expect(mockAuthState.createAccount).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("replaces the operator field with a protected recipient invitation", async () => {
    mockAuthState.mode = "supabase";
    mockAuthState.pendingHouseholdInvite = {
      oneTimeCode: "INVITE-RECIPIENT-01",
      capturedAt: "2026-07-28T08:00:00.000Z"
    };
    mockAuthState.createAccount.mockResolvedValue({
      kind: "confirmation-required"
    });
    const screen = await render(<CreateAccountScreen />);
    expect(screen.queryByLabelText("Early access code")).toBeNull();
    expect(
      screen.getByText(
        /one-time household invitation already grants access/i
      )
    ).toBeTruthy();

    await fireEvent.changeText(
      screen.getByLabelText("Email"),
      "recipient@example.com"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Password"),
      "correct horse battery staple"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "correct horse battery staple"
    );
    await fireEvent.press(
      screen.getByText("Create account and continue")
    );

    expect(mockAuthState.createAccount).toHaveBeenCalledWith(
      "recipient@example.com",
      "correct horse battery staple",
      undefined
    );
    await screen.unmount();
  });

  it("orders sign-in fields with email first", async () => {
    const screen = await render(<SignInScreen />);

    expect(screen.getByTestId("auth-sign-in-email")).toBeTruthy();
    expect(screen.getByTestId("auth-sign-in-password")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Show password" })
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Sign in"));

    expect(mockFocusFirstInvalidAuthField).toHaveBeenCalledTimes(1);
    expect(
      mockFocusFirstInvalidAuthField.mock.calls[0]?.[0].map(
        (target) => target.error
      )
    ).toEqual([
      expect.stringMatching(/email/i),
      expect.stringMatching(/password/i)
    ]);
    expect(mockAuthState.signIn).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("routes a signed-in recipient to invitation review without auto-accepting", async () => {
    mockAuthState.mode = "supabase";
    mockAuthState.pendingHouseholdInvite = {
      oneTimeCode: "INVITE-RECIPIENT-01",
      capturedAt: "2026-07-28T08:00:00.000Z"
    };
    mockAuthState.signIn.mockResolvedValue({
      kind: "authenticated",
      session: {
        ...mockAuthState.session,
        onboarding: "required"
      }
    });
    const screen = await render(<SignInScreen />);

    await fireEvent.changeText(
      screen.getByLabelText("Email"),
      "recipient@example.com"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Password"),
      "correct horse battery staple"
    );
    await fireEvent.press(screen.getByText("Sign in"));

    expect(mockRouter.replace).toHaveBeenCalledWith("/join");
    expect(
      mockAuthState.acceptPendingHouseholdInvite
    ).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("routes an immediately authenticated new recipient to invitation review", async () => {
    mockAuthState.mode = "supabase";
    mockAuthState.pendingHouseholdInvite = {
      oneTimeCode: "INVITE-RECIPIENT-02",
      capturedAt: "2026-07-28T08:10:00.000Z"
    };
    mockAuthState.createAccount.mockResolvedValue({
      kind: "authenticated",
      session: {
        ...mockAuthState.session,
        onboarding: "required"
      }
    });
    const screen = await render(<CreateAccountScreen />);

    await fireEvent.changeText(
      screen.getByLabelText("Email"),
      "recipient@example.com"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Password"),
      "correct horse battery staple"
    );
    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "correct horse battery staple"
    );
    await fireEvent.press(
      screen.getByText("Create account and continue")
    );

    expect(mockRouter.replace).toHaveBeenCalledWith("/join");
    expect(
      mockAuthState.acceptPendingHouseholdInvite
    ).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("focuses the household name when setup validation fails", async () => {
    const screen = await render(<HouseholdSetupScreen />);
    const householdName = screen.getByLabelText("Record name");

    expect(screen.queryByLabelText("Back")).toBeNull();
    expect(householdName.props.value).toBe("My record");
    expect(householdName.props.placeholder).toBe("e.g. Family home");
    await fireEvent.changeText(householdName, "");

    await fireEvent.press(screen.getByText("Create private record"));

    expect(mockFocusFirstInvalidAuthField).toHaveBeenCalledTimes(1);
    expect(
      mockFocusFirstInvalidAuthField.mock.calls[0]?.[0]
    ).toEqual([
      expect.objectContaining({
        error: expect.stringMatching(/household name/i)
      })
    ]);
    expect(mockAuthState.setHouseholdName).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("does not offer a Back action that redirects a verified account into the same private-record screen", async () => {
    mockAuthState.mode = "supabase";
    const screen = await render(<HouseholdSetupScreen />);

    expect(screen.queryByLabelText("Back")).toBeNull();
    expect(screen.getByTestId("auth-activation-progress")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Use another account" })
    ).toBeTruthy();
    await screen.unmount();
  });

  it("creates the suggested private record in one action", async () => {
    mockAuthState.householdName = "";
    mockAuthState.provisionHousehold.mockResolvedValue(
      "household-personal"
    );
    const screen = await render(<HouseholdSetupScreen />);

    await fireEvent.press(
      screen.getByText("Create private record")
    );

    expect(mockAuthState.provisionHousehold).toHaveBeenCalledWith(
      "My record"
    );
    expect(mockAuthState.setHouseholdName).toHaveBeenCalledWith(
      "My record"
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/(auth)/privacy");
    await screen.unmount();
  });

  it("keeps private-record creation primary and reveals invitation entry only on request", async () => {
    const screen = await render(<HouseholdSetupScreen />);

    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByLabelText("Invitation code")).toBeNull();
    expect(screen.getByText("Create private record")).toBeTruthy();
    const disclosure = screen.getByTestId(
      "household-invitation-disclosure"
    );
    expect(disclosure.props.accessibilityState).toEqual({
      disabled: false,
      expanded: false
    });

    await fireEvent.press(disclosure);

    expect(screen.getByLabelText("Invitation code")).toBeTruthy();
    expect(screen.getByText("Review invitation")).toBeTruthy();
    expect(
      screen.getByTestId("household-invitation-disclosure").props
        .accessibilityState
    ).toEqual({
      disabled: false,
      expanded: true
    });
    await screen.unmount();
  });

  it("stages a manually entered invitation for explicit review without accepting it", async () => {
    const screen = await render(<HouseholdSetupScreen />);
    await fireEvent.press(
      screen.getByTestId("household-invitation-disclosure")
    );
    await fireEvent.changeText(
      screen.getByLabelText("Invitation code"),
      "  invite-recipient-05  "
    );
    await fireEvent.press(screen.getByText("Review invitation"));

    expect(mockAuthState.stageHouseholdInvite).toHaveBeenCalledWith(
      "INVITE-RECIPIENT-05"
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/join");
    expect(
      mockAuthState.acceptPendingHouseholdInvite
    ).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("focuses the optional invitation field before any invitation is staged", async () => {
    const screen = await render(<HouseholdSetupScreen />);
    await fireEvent.press(
      screen.getByTestId("household-invitation-disclosure")
    );
    await fireEvent.press(screen.getByText("Review invitation"));

    expect(mockFocusFirstInvalidAuthField).toHaveBeenCalledWith([
      expect.objectContaining({
        error: "Invitation code required"
      })
    ]);
    expect(mockAuthState.stageHouseholdInvite).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalledWith("/join");
    await screen.unmount();
  });

  it("localizes the quiet invitation disclosure and its expanded field in Arabic", async () => {
    const screen = await render(
      <LocaleProvider initialLanguage="ar">
        <HouseholdSetupScreen />
      </LocaleProvider>
    );
    const disclosure = screen.getByText("لديّ رمز دعوة");
    expect(screen.queryByLabelText("رمز الدعوة")).toBeNull();

    await fireEvent.press(disclosure);

    expect(screen.getByLabelText("رمز الدعوة")).toBeTruthy();
    expect(screen.getByText("مراجعة الدعوة")).toBeTruthy();
    expect(
      screen.getByTestId("household-invitation-disclosure").props
        .accessibilityState.expanded
    ).toBe(true);
    await screen.unmount();
  });

  it("opens the explicit review screen for a protected invitation during household setup", async () => {
    mockAuthState.pendingHouseholdInvite = {
      oneTimeCode: "INVITE-RECIPIENT-04",
      capturedAt: "2026-07-28T08:30:00.000Z"
    };
    const screen = await render(<HouseholdSetupScreen />);

    expect(
      mockAuthState.acceptPendingHouseholdInvite
    ).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Record name")).toBeNull();
    await fireEvent.press(screen.getByText("Review invitation"));
    expect(mockRouter.replace).toHaveBeenCalledWith("/join");
    expect(
      mockAuthState.acceptPendingHouseholdInvite
    ).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
