import {
  act,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";

import PrivacyAndCaptureScreen from "../app/(auth)/privacy";
import { Linking, StyleSheet } from "react-native";

import { onboardingDevicePreflightCopy } from "@/deviceAuth/copy";
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
  firstCaptureIntent: "item" | "place" | null = "place"
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
      onboarding: "required",
      activeHouseholdId: "household-a",
      activeMembershipId: "membership-owner",
      activeHouseholdRole: "owner"
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps protection detail compact until the user asks for it", async () => {
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );
    const disclosure = screen.getByRole("button", {
      name: "Private by default"
    });

    expect(disclosure.props.accessibilityState).toEqual({
      expanded: false
    });
    expect(screen.queryByText("Location by intent")).toBeNull();
    expect(screen.queryByText("Access is deliberate")).toBeNull();
    expect(
      screen.queryByText(
        "The device record is created first. Cloud protection is shown as active only after a confirmed sync."
      )
    ).toBeNull();

    await fireEvent.press(disclosure);

    expect(
      screen.getByRole("button", {
        name: "Private by default"
      }).props.accessibilityState
    ).toEqual({ expanded: true });
    expect(screen.getByText("Location by intent")).toBeTruthy();
    expect(screen.getByText("Access is deliberate")).toBeTruthy();
    expect(
      screen.getByText(
        "The device record is created first. Cloud protection is shown as active only after a confirmed sync."
      )
    ).toBeTruthy();
    await screen.unmount();
  });

  it("defaults a new verified household to an Item only after handoff restoration is ready", async () => {
    mockAuthState = makeAuthState(null);
    const setFirstCaptureIntent = jest.fn(
      (intent: "item" | "place") => {
        mockAuthState.firstCaptureIntent = intent;
        mockAuthState.createCompletion = jest.fn(() => ({
          householdName: "My household",
          firstCaptureIntent: intent,
          session: {}
        }));
      }
    );
    mockAuthState.setFirstCaptureIntent = setFirstCaptureIntent;
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    await waitFor(() =>
      expect(setFirstCaptureIntent).toHaveBeenCalledWith("item")
    );
    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );
    expect(
      screen.getAllByRole("radio")[0]!.props.accessibilityState
        .checked
    ).toBe(true);
    expect(
      screen.getByRole("button", {
        name: "Verify and add my first item"
      })
    ).toBeTruthy();
    expect(
      mockDeviceAuthState.clearOnboardingAuthorization
    ).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("does not overwrite a first-record intent while durable handoff restoration is unresolved", async () => {
    mockAuthState = makeAuthState(null);
    const setFirstCaptureIntent = jest.fn();
    mockAuthState.setFirstCaptureIntent = setFirstCaptureIntent;
    mockDeviceAuthState = {
      ...makeDeviceAuthState(),
      onboardingHandoffRestoreState: "loading"
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    expect(setFirstCaptureIntent).not.toHaveBeenCalled();
    await screen.unmount();
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
    const openSettings = jest
      .spyOn(Linking, "openSettings")
      .mockResolvedValue();
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
    const warning = screen.getByTestId("auth-status-row-warning");
    expect(warning.props.accessibilityRole).toBeUndefined();
    expect(warning.props.accessibilityLiveRegion).toBe("polite");
    expect(warning.props.accessibilityState).toEqual({ busy: false });
    expect(screen.getByTestId("auth-status-glyph-warning")).toBeTruthy();
    const settingsAction = screen.getByTestId(
      "onboarding-open-device-settings"
    );
    expect(settingsAction.props.accessibilityRole).toBe("button");
    expect(settingsAction.props.accessibilityLabel).toBe(
      "Open device Settings"
    );
    expect(settingsAction.props.accessibilityHint).toBe(
      "Opens device security settings so you can set a passcode"
    );
    await fireEvent.press(settingsAction);
    expect(openSettings).toHaveBeenCalledTimes(1);
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

  it("keeps the passcode recovery visible when device Settings do not open", async () => {
    jest
      .spyOn(Linking, "openSettings")
      .mockRejectedValue(new Error("settings unavailable"));
    mockDeviceAuthState = makeDeviceAuthState("unavailable");
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    await fireEvent.press(
      screen.getByTestId("onboarding-open-device-settings")
    );

    expect(
      await screen.findByText(
        onboardingDevicePreflightCopy(
          "en",
          availablePreflight("unavailable").capability
        ).openSettingsError
      )
    ).toBeTruthy();
    await screen.unmount();
  });

  it("distinguishes checking, ready, success and restore-error protection states", async () => {
    mockDeviceAuthState = {
      ...makeDeviceAuthState("idle"),
      onboardingPreflight: {
        ...availablePreflight("idle"),
        phase: "checking"
      }
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    const checking = screen.getByTestId("auth-status-row-checking");
    expect(checking.props.accessibilityLiveRegion).toBe("polite");
    expect(checking.props.accessibilityState).toEqual({ busy: true });
    expect(screen.getByTestId("auth-status-glyph-checking")).toBeTruthy();

    mockDeviceAuthState = makeDeviceAuthState("ready");
    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );
    const ready = screen.getByTestId("auth-status-row-ready");
    expect(ready.props.accessibilityRole).toBeUndefined();
    expect(ready.props.accessibilityState).toEqual({ busy: false });
    expect(screen.getByTestId("auth-status-glyph-ready")).toBeTruthy();
    expect(screen.getByText("Face ID is ready")).toBeTruthy();

    mockDeviceAuthState = {
      ...makeDeviceAuthState("ready"),
      onboardingPreflight: {
        ...availablePreflight("ready"),
        phase: "authorized",
        intent: "place"
      }
    };
    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );
    const success = screen.getByTestId("auth-status-row-success");
    expect(success.props.accessibilityRole).toBeUndefined();
    expect(success.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByTestId("auth-status-glyph-success")).toBeTruthy();
    expect(screen.getByText("Device verified")).toBeTruthy();

    mockDeviceAuthState = {
      ...makeDeviceAuthState("ready"),
      onboardingHandoffRestoreState: "error"
    };
    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );
    const error = screen.getByTestId("auth-status-row-error");
    expect(error.props.accessibilityRole).toBe("alert");
    expect(error.props.accessibilityLiveRegion).toBe("assertive");
    expect(error.props.accessibilityState).toEqual({ busy: false });
    expect(screen.getByTestId("auth-status-glyph-error")).toBeTruthy();
    expect(
      screen.getByText("Resume details need another check.")
    ).toBeTruthy();

    await screen.unmount();
  });

  it("keeps warning semantics and localized status text in Arabic RTL", async () => {
    mockDeviceAuthState = makeDeviceAuthState("unavailable");
    const screen = await render(
      <LocaleProvider initialLanguage="ar">
        <PrivacyAndCaptureScreen />
      </LocaleProvider>
    );

    const warning = screen.getByTestId("auth-status-row-warning");
    expect(warning.props.accessibilityLiveRegion).toBe("polite");
    expect(warning.props.accessibilityState).toEqual({ busy: false });
    expect(
      screen.getByText("يلزم تعيين رمز دخول للجهاز")
    ).toBeTruthy();
    expect(
      screen.getByTestId("auth-status-glyph-warning")
    ).toBeTruthy();
    const settingsAction = screen.getByTestId(
      "onboarding-open-device-settings"
    );
    const arabicCopy = onboardingDevicePreflightCopy(
      "ar",
      availablePreflight("unavailable").capability
    );
    expect(settingsAction.props.accessibilityLabel).toBe(
      arabicCopy.openSettingsAction
    );
    expect(settingsAction.props.accessibilityHint).toBe(
      arabicCopy.openSettingsHint
    );
    expect(
      StyleSheet.flatten(settingsAction.props.style).flexDirection
    ).toBe("row-reverse");

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
