import {
  act,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";

import PrivacyAndCaptureScreen from "../app/(auth)/privacy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  replace: jest.fn()
};
let mockAuthState: Record<string, unknown>;
let mockWorkspaceState: Record<string, unknown>;
let mockDeviceAuthState: Record<string, unknown>;

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Text } =
    jest.requireActual("react-native") as typeof import("react-native");
  return {
    Redirect: ({ href }: { readonly href: string }) =>
      React.createElement(
        Text,
        { testID: "auth-redirect" },
        href
      ),
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
  const copy = jest.requireActual("@/deviceAuth/copy") as typeof import("@/deviceAuth/copy");
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

function availablePreflight(
  phase: "idle" | "ready" | "unavailable" = "ready"
) {
  return {
    phase,
    capability:
      phase === "unavailable"
        ? {
            kind: "unavailable" as const,
            reason: "passcode-not-set" as const
          }
        : phase === "idle"
          ? null
          : {
              kind: "available" as const,
              method: "face" as const,
              biometricEnrolled: true
            },
    intent: null,
    notice: null
  };
}

function makeAuthState(
  firstCaptureIntent: "item" | "place" = "place"
): Record<string, unknown> {
  return {
    activeHouseholdId: "household-a",
    busy: false,
    clearError: jest.fn(),
    completeOnboarding: jest.fn(async () => true),
    createCompletion: jest.fn(() => ({
      householdName: "My household",
      firstCaptureIntent,
      session: {}
    })),
    error: null,
    firstCaptureIntent,
    householdName: "My household",
    mode: "supabase",
    session: {
      onboarding: "required"
    },
    setFirstCaptureIntent: jest.fn()
  };
}

function makeWorkspaceState(): Record<string, unknown> {
  return {
    clearError: jest.fn(),
    error: null,
    renameHousehold: jest.fn(async () => undefined),
    retryBootstrap: jest.fn(async () => undefined),
    saving: false,
    startWorkspace: jest.fn(async () => undefined),
    storageReady: true,
    workspace: null
  };
}

function makeDeviceAuthState(
  phase: "idle" | "ready" | "unavailable" = "ready"
): Record<string, unknown> {
  return {
    authorizeOnboarding: jest.fn(async (intent) => ({
      kind: "authorized",
      intent
    })),
    checkOnboardingProtection: jest.fn(async () => null),
    clearOnboardingAuthorization: jest.fn(),
    onboardingHandoffRestoreState: "ready",
    onboardingPreflight: availablePreflight(phase),
    pendingFirstRecordIntent: null,
    retryOnboardingHandoffRestore: jest.fn()
  };
}

describe("device-security onboarding preflight", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = makeAuthState();
    mockWorkspaceState = makeWorkspaceState();
    mockDeviceAuthState = makeDeviceAuthState();
  });

  it("verifies the exact Place intent before any local or cloud onboarding mutation", async () => {
    const calls: string[] = [];
    mockDeviceAuthState.authorizeOnboarding = jest.fn(
      async (intent) => {
        calls.push(`authorize:${intent}`);
        return { kind: "authorized", intent };
      }
    );
    mockWorkspaceState.startWorkspace = jest.fn(async () => {
      calls.push("start-workspace");
    });
    mockWorkspaceState.renameHousehold = jest.fn(async () => {
      calls.push("rename-household");
    });
    mockAuthState.completeOnboarding = jest.fn(async () => {
      calls.push("complete-onboarding");
      return true;
    });

    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Verify and add my first Place"
      })
    );

    await waitFor(() =>
      expect(calls).toEqual([
        "authorize:place",
        "start-workspace",
        "rename-household",
        "complete-onboarding"
      ])
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("keeps setup uncommitted when device protection is unavailable", async () => {
    mockDeviceAuthState = makeDeviceAuthState("unavailable");
    mockDeviceAuthState.authorizeOnboarding = jest.fn(
      async () => null
    );
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    expect(
      screen.getByText("Device passcode required")
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Check device again"
      })
    );

    await waitFor(() =>
      expect(
        mockDeviceAuthState.authorizeOnboarding
      ).toHaveBeenCalledWith("place")
    );
    expect(mockWorkspaceState.startWorkspace).not.toHaveBeenCalled();
    expect(mockWorkspaceState.renameHousehold).not.toHaveBeenCalled();
    expect(mockAuthState.completeOnboarding).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("keeps Verify available while the subject vault is sealed, then commits only after that authorized vault opens", async () => {
    const calls: string[] = [];
    mockWorkspaceState = {
      ...makeWorkspaceState(),
      storageReady: false
    };
    mockDeviceAuthState.authorizeOnboarding = jest.fn(
      async (intent) => {
        calls.push(`authorize:${intent}`);
        return { kind: "authorized", intent };
      }
    );
    mockWorkspaceState.startWorkspace = jest.fn(async () => {
      calls.push("start-workspace");
    });
    mockWorkspaceState.renameHousehold = jest.fn(async () => {
      calls.push("rename-household");
    });
    mockAuthState.completeOnboarding = jest.fn(async () => {
      calls.push("complete-onboarding");
      return true;
    });

    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );
    const verify = screen.getByRole("button", {
      name: "Verify and add my first Place"
    });
    expect(verify.props.accessibilityState?.disabled).not.toBe(true);

    await fireEvent.press(verify);
    await waitFor(() =>
      expect(calls).toEqual(["authorize:place"])
    );
    expect(mockWorkspaceState.startWorkspace).not.toHaveBeenCalled();
    expect(mockWorkspaceState.renameHousehold).not.toHaveBeenCalled();
    expect(mockAuthState.completeOnboarding).not.toHaveBeenCalled();

    mockDeviceAuthState = {
      ...mockDeviceAuthState,
      onboardingPreflight: {
        ...availablePreflight("ready"),
        phase: "authorized",
        intent: "place"
      },
      pendingFirstRecordIntent: "place"
    };
    mockWorkspaceState = {
      ...mockWorkspaceState,
      storageReady: true
    };
    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    await waitFor(() =>
      expect(calls).toEqual([
        "authorize:place",
        "start-workspace",
        "rename-household",
        "complete-onboarding"
      ])
    );
    await screen.unmount();
  });

  it("locks intent and Back navigation while an authorized onboarding commit is in flight", async () => {
    let settleCompletion: ((value: boolean) => void) | null = null;
    mockAuthState.completeOnboarding = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settleCompletion = resolve;
        })
    );
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Verify and add my first Place"
      })
    );
    await waitFor(() =>
      expect(
        mockAuthState.completeOnboarding
      ).toHaveBeenCalledTimes(1)
    );

    const radios = screen.getAllByRole("radio");
    expect(radios[0]!.props.accessibilityState.disabled).toBe(true);
    expect(radios[1]!.props.accessibilityState.disabled).toBe(true);
    const back = screen.getByRole("button", { name: "Back" });
    expect(back.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(radios[0]!);
    await fireEvent.press(back);
    expect(
      mockDeviceAuthState.clearOnboardingAuthorization
    ).not.toHaveBeenCalled();
    expect(mockAuthState.setFirstCaptureIntent).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      settleCompletion?.(true);
    });
    await screen.unmount();
  });

  it("retries an unresolved subject handoff before permitting Verify to overwrite it", async () => {
    mockDeviceAuthState = {
      ...makeDeviceAuthState(),
      onboardingHandoffRestoreState: "error"
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    expect(
      screen.getByText("Resume details need another check.")
    ).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios[0]!.props.accessibilityState.disabled).toBe(true);
    expect(radios[1]!.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Try device storage again"
      })
    );

    expect(
      mockDeviceAuthState.retryOnboardingHandoffRestore
    ).toHaveBeenCalledTimes(1);
    expect(
      mockDeviceAuthState.authorizeOnboarding
    ).not.toHaveBeenCalled();
    expect(mockWorkspaceState.startWorkspace).not.toHaveBeenCalled();
    expect(mockWorkspaceState.renameHousehold).not.toHaveBeenCalled();
    expect(mockAuthState.completeOnboarding).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("checks capability on entry without prompting for authentication", async () => {
    mockDeviceAuthState = makeDeviceAuthState("idle");
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    await waitFor(() =>
      expect(
        mockDeviceAuthState.checkOnboardingProtection
      ).toHaveBeenCalledTimes(1)
    );
    expect(
      mockDeviceAuthState.authorizeOnboarding
    ).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("invalidates an earlier authorization when the selected record changes", async () => {
    const setFirstCaptureIntent = jest.fn();
    mockAuthState.setFirstCaptureIntent = setFirstCaptureIntent;
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    await fireEvent.press(
      screen.getAllByRole("radio")[0]!
    );

    expect(
      mockDeviceAuthState.clearOnboardingAuthorization
    ).toHaveBeenCalledTimes(1);
    expect(setFirstCaptureIntent).toHaveBeenCalledWith("item");
    await screen.unmount();
  });
});
