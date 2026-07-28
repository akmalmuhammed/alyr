import {
  fireEvent,
  render
} from "@testing-library/react-native";

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
  pendingHouseholdInvite: null as {
    oneTimeCode: string;
    capturedAt: string;
  } | null,
  acceptPendingHouseholdInvite: jest.fn(),
  selectHousehold: jest.fn(),
  session: {
    identity: {
      id: "account-owner",
      email: "owner@example.com",
      emailVerified: true
    }
  },
  setHouseholdName: jest.fn(),
  signIn: jest.fn()
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

const mockFocusFirstInvalidAuthField =
  focusFirstInvalidAuthField as jest.MockedFunction<
    typeof focusFirstInvalidAuthField
  >;

describe("auth form first-invalid-field wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.mode = "preview";
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
    expect(screen.queryByLabelText("Pilot access code")).toBeNull();
    await screen.unmount();
  });

  it("requires pilot access in signed mode before creating an account", async () => {
    mockAuthState.mode = "supabase";
    const screen = await render(<CreateAccountScreen />);
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

    expect(screen.getByText("Enter your pilot access code.")).toBeTruthy();
    expect(mockAuthState.createAccount).not.toHaveBeenCalled();
    expect(
      mockFocusFirstInvalidAuthField.mock.calls[0]?.[0].map(
        (target) => target.error
      )
    ).toEqual([
      undefined,
      "Enter your pilot access code.",
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
      screen.getByLabelText("Pilot access code"),
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
    expect(screen.queryByLabelText("Pilot access code")).toBeNull();
    expect(
      screen.getByText(
        /one-time household invitation replaces the operator pilot code/i
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

  it("focuses the household name when setup validation fails", async () => {
    const screen = await render(<HouseholdSetupScreen />);
    const householdName = screen.getByLabelText("Household name");

    expect(householdName.props.value).toBe("");
    expect(householdName.props.placeholder).toBe("e.g. Family home");

    await fireEvent.press(screen.getByText("Continue"));

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
});
