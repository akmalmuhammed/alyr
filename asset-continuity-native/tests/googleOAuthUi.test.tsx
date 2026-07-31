import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";

import SignInScreen from "../app/(auth)/sign-in";

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  push: jest.fn(),
  replace: jest.fn()
};
let mockAuthState: Record<string, unknown>;

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthState
}));

jest.mock("@/i18n/LocaleProvider", () => ({
  useLocale: () => ({
    language: "en",
    locale: "en-QA",
    ready: true,
    rtl: false,
    setLanguage: jest.fn()
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

function signedAuthState(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    beginGoogleSignIn: jest.fn(async () => "pkce-ui-code"),
    busy: false,
    clearError: jest.fn(),
    error: null,
    googleOAuthInProgress: false,
    mode: "supabase",
    pendingHouseholdInvite: null,
    resendConfirmation: jest.fn(),
    signIn: jest.fn(),
    ...overrides
  };
}

describe("Google OAuth sign-in entry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = signedAuthState();
  });

  it("offers a localized signed-build entry and continues through the existing callback", async () => {
    const screen = await render(<SignInScreen />);

    expect(screen.getByText("Continue with Google")).toBeTruthy();
    fireEvent.press(screen.getByText("Continue with Google"));

    await waitFor(() => {
      expect(mockAuthState.beginGoogleSignIn).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: "/(auth)/callback",
        params: { code: "pkce-ui-code" }
      });
    });
  });

  it("keeps the provider entry out of the session-only preview", async () => {
    mockAuthState = signedAuthState({ mode: "preview" });
    const screen = await render(<SignInScreen />);

    expect(screen.queryByText("Continue with Google")).toBeNull();
  });
});
