import {
  fireEvent,
  render
} from "@testing-library/react-native";
import { Platform } from "react-native";

import AuthLayout from "../app/(auth)/_layout";
import AuthWelcomeScreen from "../app/(auth)/index";
import {
  authenticatedAuthEntryDestination,
  publicAuthEntryRouteFromSegments
} from "@/auth/routes";
import type { AuthSessionDescriptor } from "@/auth/types";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  push: jest.fn(),
  replace: jest.fn()
};
let mockSegments: string[] = ["(auth)"];
let mockAuthState: Record<string, unknown>;
let mockWorkspaceState: Record<string, unknown>;
let mockAuthStackOptions: Record<string, unknown> | null = null;
let mockReduceMotion = false;
let mockRtl = false;

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const {
    Text,
    View
  } = jest.requireActual("react-native") as typeof import("react-native");
  const Stack = ({
    children,
    screenOptions
  }: {
    readonly children?: import("react").ReactNode;
    readonly screenOptions?: Record<string, unknown>;
  }) => {
    mockAuthStackOptions = screenOptions ?? null;
    return React.createElement(View, { testID: "auth-stack" }, children);
  };
  Stack.Screen = () => null;
  return {
    Redirect: ({ href }: { readonly href: string }) =>
      React.createElement(
        Text,
        { testID: "auth-redirect" },
        href
      ),
    Stack,
    useRouter: () => mockRouter,
    useSegments: () => mockSegments
  };
});

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthState
}));

jest.mock("@/accessibility/useReduceMotionPreference", () => ({
  useReduceMotionPreference: () => mockReduceMotion
}));

jest.mock("@/i18n/LocaleProvider", () => ({
  useLocale: () => ({
    language: mockRtl ? "ar" : "en",
    locale: mockRtl ? "ar-QA" : "en-QA",
    ready: true,
    rtl: mockRtl,
    setLanguage: jest.fn(async () => undefined)
  })
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => mockWorkspaceState
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

const completeSession: AuthSessionDescriptor = {
  identity: {
    id: "account-owner",
    email: "owner@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: "2026-08-01T00:00:00.000Z",
  onboarding: "complete",
  activeHouseholdId: "household-a",
  activeMembershipId: "membership-a",
  activeHouseholdRole: "owner"
};

function authState(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    bootstrapState: "ready",
    busy: false,
    clearError: jest.fn(),
    clearStatus: jest.fn(),
    error: null,
    mode: "supabase",
    passwordRecoverySessionActive: false,
    reset: jest.fn(),
    session: completeSession,
    ...overrides
  };
}

describe("authenticated auth-route hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = ["(auth)"];
    mockAuthStackOptions = null;
    mockReduceMotion = false;
    mockRtl = false;
    mockAuthState = authState();
    mockWorkspaceState = {
      clearError: jest.fn(),
      error: null,
      saving: false,
      startWorkspace: jest.fn(async () => undefined),
      storageReady: true
    };
  });

  it.each([
    [["(auth)"], "Welcome"],
    [["(auth)", "create-account"], "Create account"],
    [["(auth)", "sign-in"], "Sign in"],
    [["(auth)", "forgot-password"], "Forgot password"],
    [["(auth)", "reset-password"], "Reset password"]
  ])(
    "redirects an authenticated complete account away from %s",
    async (segments) => {
      mockSegments = segments;
      const screen = await render(<AuthLayout />);

      expect(screen.getByTestId("auth-redirect").props.children).toBe(
        "/"
      );
      expect(screen.queryByTestId("auth-stack")).toBeNull();
      await screen.unmount();
    }
  );

  it("resumes household setup instead of exposing a public auth form", async () => {
    mockSegments = ["(auth)", "sign-in"];
    mockAuthState = authState({
      session: {
        ...completeSession,
        onboarding: "required",
        activeHouseholdId: null,
        activeMembershipId: null,
        activeHouseholdRole: null
      }
    });
    const screen = await render(<AuthLayout />);

    expect(screen.getByTestId("auth-redirect").props.children).toBe(
      "/(auth)/household"
    );
    await screen.unmount();
  });

  it("keeps provider-granted recovery and every preview route intact", async () => {
    mockSegments = ["(auth)", "reset-password"];
    mockAuthState = authState({
      passwordRecoverySessionActive: true
    });
    const recovery = await render(<AuthLayout />);
    expect(recovery.getByTestId("auth-stack")).toBeTruthy();
    expect(recovery.queryByTestId("auth-redirect")).toBeNull();
    await recovery.unmount();

    mockSegments = ["(auth)", "sign-in"];
    mockAuthState = authState({
      mode: "preview",
      session: {
        ...completeSession,
        assurance: "preview",
        identity: {
          ...completeSession.identity,
          emailVerified: false
        }
      }
    });
    const preview = await render(<AuthLayout />);
    expect(preview.getByTestId("auth-stack")).toBeTruthy();
    expect(preview.queryByTestId("auth-redirect")).toBeNull();
    await preview.unmount();
  });

  it("removes auth motion when the device requests it", async () => {
    mockAuthState = authState({ session: null });
    mockRtl = true;
    mockReduceMotion = true;

    const screen = await render(<AuthLayout />);

    expect(mockAuthStackOptions).toMatchObject({
      animation: "none",
      gestureDirection: "horizontal",
      gestureEnabled: true
    });
    await screen.unmount();
  });

  it("uses the native leading-edge transition for Arabic", async () => {
    mockAuthState = authState({ session: null });
    mockRtl = true;

    const screen = await render(<AuthLayout />);

    expect(mockAuthStackOptions).toMatchObject({
      animation:
        Platform.OS === "ios"
          ? "ios_from_left"
          : "slide_from_left",
      gestureDirection: "horizontal"
    });
    await screen.unmount();
  });

  it("maps only public entry segments and fails closed on partial tuples", () => {
    expect(publicAuthEntryRouteFromSegments(["(auth)"])).toBe(
      "welcome"
    );
    expect(
      publicAuthEntryRouteFromSegments(["(auth)", "privacy"])
    ).toBeNull();
    expect(
      authenticatedAuthEntryDestination({
        bootstrapState: "ready",
        mode: "supabase",
        passwordRecoverySessionActive: false,
        route: "forgotPassword",
        session: {
          ...completeSession,
          activeMembershipId: null
        }
      })
    ).toBe("/(auth)/household");
  });

  it("never clears a live cloud session from Welcome navigation", async () => {
    mockAuthState = authState({ session: null });
    const screen = await render(<AuthWelcomeScreen />);

    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.welcome.createWorkspace)
    );

    expect(mockAuthState.clearError).toHaveBeenCalledTimes(1);
    expect(mockAuthState.clearStatus).toHaveBeenCalledTimes(1);
    expect(mockAuthState.reset).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith(
      "/(auth)/create-account"
    );
    await screen.unmount();
  });

  it("retains the existing session-only reset behavior in preview", async () => {
    mockAuthState = authState({
      mode: "preview",
      session: null
    });
    const screen = await render(<AuthWelcomeScreen />);

    await fireEvent.press(
      screen.getByText(CORE_JOURNEY_COPY.en.welcome.createWorkspace)
    );

    expect(mockAuthState.reset).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });
});
