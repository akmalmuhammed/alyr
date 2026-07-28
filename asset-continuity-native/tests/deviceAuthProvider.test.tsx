import {
  act,
  render,
  waitFor
} from "@testing-library/react-native";
import { Text, AppState, type AppStateStatus } from "react-native";

import {
  DeviceAuthProvider,
  useDeviceAuth
} from "@/deviceAuth/DeviceAuthProvider";
import {
  createOnboardingHandoffStore,
  type OnboardingHandoffStore
} from "@/deviceAuth/onboardingHandoffStore";
import type {
  DeviceAuthPort,
  OnboardingFirstRecordIntent
} from "@/deviceAuth/types";
import { resolveFirstRecordHandoff } from "@/auth/firstRecordHandoff";
import { LocaleProvider } from "@/i18n/LocaleProvider";

let latestGate: ReturnType<typeof useDeviceAuth> | null = null;

function Probe() {
  latestGate = useDeviceAuth();
  return (
    <>
      <Text testID="gate-state">
        {latestGate.state.phase}:
        {latestGate.vaultReleased ? "released" : "sealed"}:
        {latestGate.previewBypass ? "preview" : "native"}
      </Text>
      <Text testID="preflight-state">
        {latestGate.onboardingPreflight.phase}:
        {latestGate.onboardingPreflight.intent ?? "none"}:
        {latestGate.pendingFirstRecordIntent ?? "none"}
      </Text>
    </>
  );
}

function memoryHandoffStore() {
  let value: string | null = null;
  return {
    store: createOnboardingHandoffStore({
      get: jest.fn(async () => value),
      set: jest.fn(async (_key, nextValue) => {
        value = nextValue;
      }),
      remove: jest.fn(async () => {
        value = null;
      })
    }),
    value: () => value
  };
}

describe("signed device-auth provider", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    latestGate = null;
  });

  it("releases only after verification and seals again after background timeout", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    let clock = 1_000;
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "device-passcode" as const,
        biometricEnrolled: false
      })),
      authenticate: jest.fn(async () => ({
        success: true as const
      })),
      cancel: jest.fn(async () => undefined)
    };

    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          now={() => clock}
          port={port}
          profile="native-secure"
          protectionRequired
          relockTimeoutMs={120_000}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("gate-state").props.children.join(""))
        .toBe("locked:sealed:native");
    });
    await act(async () => {
      await latestGate!.unlock();
    });
    expect(screen.getByTestId("gate-state").props.children.join(""))
      .toBe("unlocked:released:native");

    await act(async () => {
      appStateListener?.("background");
    });
    clock += 120_001;
    await act(async () => {
      appStateListener?.("active");
    });

    await waitFor(() => {
      expect(screen.getByTestId("gate-state").props.children.join(""))
        .toBe("locked:sealed:native");
    });
    await screen.unmount();
  });

  it("bypasses native authentication in Expo Go preview", async () => {
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "unavailable" as const,
        reason: "check-failed" as const
      })),
      authenticate: jest.fn(async () => ({
        success: false as const,
        error: "not_available" as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="ar">
        <DeviceAuthProvider
          port={port}
          profile="expo-go-preview"
          protectionRequired
          subjectId="preview"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("gate-state").props.children.join("")
      ).toBe("bypassed:released:preview")
    );
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("bypassed:none:none");
    expect(port.assess).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("pre-authorizes the exact first-record intent without a post-setup lock flash", async () => {
    const assess = jest.fn(async () => ({
      kind: "available" as const,
      method: "face" as const,
      biometricEnrolled: true
    }));
    const authenticate = jest.fn(async () => ({
      success: true as const
    }));
    const port: DeviceAuthPort = {
      assess,
      authenticate,
      cancel: jest.fn(async () => undefined)
    };
    const child = (
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    const screen = await render(child);

    await act(async () => {
      await latestGate!.checkOnboardingProtection();
    });
    expect(
      screen.getByTestId("preflight-state").props.children.join("")
    ).toBe("ready:none:none");

    let authorization:
      | Awaited<
          ReturnType<
            NonNullable<typeof latestGate>["authorizeOnboarding"]
          >
        >
      | undefined;
    await act(async () => {
      authorization = await latestGate!.authorizeOnboarding("place");
    });
    expect(authorization).toEqual({
      kind: "authorized",
      intent: "place"
    });
    expect(
      screen.getByTestId("preflight-state").props.children.join("")
    ).toBe("authorized:place:place");

    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          port={port}
          profile="native-secure"
          protectionRequired
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );

    expect(
      screen.getByTestId("gate-state").props.children.join("")
    ).not.toContain("sealed");
    await waitFor(() => {
      expect(
        screen.getByTestId("gate-state").props.children.join("")
      ).toBe("unlocked:released:native");
    });
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("authorized:place:place");
    expect(assess).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledTimes(1);

    await act(async () => {
      latestGate!.completeOnboardingHandoff("place");
    });
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("idle:none:none");
    await screen.unmount();
  });

  it("blocks onboarding before mutation when the device has no passcode", async () => {
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "unavailable" as const,
        reason: "passcode-not-set" as const
      })),
      authenticate: jest.fn(async () => ({
        success: true as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );

    let authorization: unknown;
    await act(async () => {
      authorization = await latestGate!.authorizeOnboarding("item");
    });

    expect(authorization).toBeNull();
    expect(
      screen.getByTestId("preflight-state").props.children.join("")
    ).toBe("unavailable:none:none");
    expect(port.authenticate).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("keeps the selected intent visible when verification is cancelled", async () => {
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "face" as const,
        biometricEnrolled: true
      })),
      authenticate: jest.fn(async () => ({
        success: false as const,
        error: "user_cancel" as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );

    await act(async () => {
      await latestGate!.authorizeOnboarding("item");
    });
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("ready:item:none");
    expect(latestGate!.onboardingPreflight.notice).toBe("cancelled");
    await screen.unmount();
  });

  it("discards a stale verification result after the selection is cleared", async () => {
    let settleAuthentication:
      | ((value: { readonly success: true }) => void)
      | null = null;
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "face" as const,
        biometricEnrolled: true
      })),
      authenticate: jest.fn(
        () =>
          new Promise<{ readonly success: true }>((resolve) => {
            settleAuthentication = resolve;
          })
      ),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );

    let pending: Promise<unknown> | undefined;
    await act(async () => {
      pending = latestGate!.authorizeOnboarding("place");
      await Promise.resolve();
    });
    await act(async () => {
      latestGate!.clearOnboardingAuthorization();
      settleAuthentication?.({ success: true });
    });
    await expect(pending).resolves.toBeNull();
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("ready:none:none");
    await screen.unmount();
  });

  it("preserves an exact preview intent without invoking native security", async () => {
    const port: DeviceAuthPort = {
      assess: jest.fn(),
      authenticate: jest.fn(),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="ar">
        <DeviceAuthProvider
          port={port}
          profile="expo-go-preview"
          protectionRequired={false}
          subjectId={null}
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );

    await act(async () => {
      await expect(
        latestGate!.authorizeOnboarding("place")
      ).resolves.toEqual({
        kind: "bypassed",
        intent: "place"
      });
    });
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("bypassed:place:place");
    expect(port.assess).not.toHaveBeenCalled();
    expect(port.authenticate).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("invalidates a preflight grant when the account-household subject changes", async () => {
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "device-passcode" as const,
        biometricEnrolled: false
      })),
      authenticate: jest.fn(async () => ({
        success: true as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    await act(async () => {
      await latestGate!.authorizeOnboarding("item");
    });

    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          port={port}
          profile="native-secure"
          protectionRequired
          subjectId="account-a:household-b"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    expect(
      screen.getByTestId("gate-state").props.children.join("")
    ).not.toContain("released");
    await waitFor(() => {
      expect(
        screen.getByTestId("gate-state").props.children.join("")
      ).toBe("locked:sealed:native");
    });
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("idle:none:none");
    expect(port.authenticate).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("resumes the exact intent after an expired preflight requires a fresh unlock", async () => {
    let clock = 1_000;
    const now = () => clock;
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "device-passcode" as const,
        biometricEnrolled: false
      })),
      authenticate: jest.fn(async () => ({
        success: true as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          now={now}
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    await act(async () => {
      await latestGate!.authorizeOnboarding("place");
    });

    clock += 120_001;
    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          now={now}
          port={port}
          profile="native-secure"
          protectionRequired
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("gate-state").props.children.join("")
      ).toBe("locked:sealed:native");
    });
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("authorized:place:place");

    await act(async () => {
      await latestGate!.unlock();
    });
    expect(screen.getByTestId("gate-state").props.children.join(""))
      .toBe("unlocked:released:native");
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("authorized:place:place");
    expect(port.authenticate).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  it("invalidates an onboarding grant on background, keeps the intent, and permits fresh verification", async () => {
    let appStateListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "face" as const,
        biometricEnrolled: true
      })),
      authenticate: jest.fn(async () => ({
        success: true as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    await act(async () => {
      await latestGate!.authorizeOnboarding("item");
    });
    await act(async () => {
      appStateListener?.("background");
    });

    expect(
      screen.getByTestId("gate-state").props.children.join("")
    ).toBe("bypassed:sealed:native");
    expect(
      screen.getByTestId("preflight-state").props.children.join("")
    ).toBe("ready:item:item");

    await act(async () => {
      await latestGate!.authorizeOnboarding("item");
    });
    expect(
      screen.getByTestId("gate-state").props.children.join("")
    ).toBe("bypassed:released:native");
    expect(
      screen.getByTestId("preflight-state").props.children.join("")
    ).toBe("authorized:item:item");
    expect(port.authenticate).toHaveBeenCalledTimes(2);

    await screen.rerender(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          port={port}
          profile="native-secure"
          protectionRequired
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("gate-state").props.children.join("")
      ).toBe("unlocked:released:native");
    });
    expect(screen.getByTestId("preflight-state").props.children.join(""))
      .toBe("authorized:item:item");
    await screen.unmount();
  });

  it("returns an expired onboarding grant to a re-verifiable state without losing the durable intent", async () => {
    jest.useFakeTimers();
    let clock = 10_000;
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "device-passcode" as const,
        biometricEnrolled: false
      })),
      authenticate: jest.fn(async () => ({
        success: true as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          now={() => clock}
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    await act(async () => {
      await latestGate!.authorizeOnboarding("place");
    });
    clock += 120_001;
    await act(async () => {
      jest.advanceTimersByTime(120_001);
    });

    expect(
      screen.getByTestId("gate-state").props.children.join("")
    ).toBe("bypassed:sealed:native");
    expect(
      screen.getByTestId("preflight-state").props.children.join("")
    ).toBe("ready:place:place");
    await act(async () => {
      await latestGate!.authorizeOnboarding("place");
    });
    expect(
      screen.getByTestId("gate-state").props.children.join("")
    ).toBe("bypassed:released:native");
    expect(port.authenticate).toHaveBeenCalledTimes(2);
    await screen.unmount();
    jest.useRealTimers();
  });

  it("restores the exact subject-scoped intent after process restart and resumes it after unlock", async () => {
    const persisted = memoryHandoffStore();
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "face" as const,
        biometricEnrolled: true
      })),
      authenticate: jest.fn(async () => ({
        success: true as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const firstProcess = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          onboardingHandoffStore={persisted.store}
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    await act(async () => {
      await latestGate!.authorizeOnboarding("place");
    });
    expect(persisted.value()).toContain('"intent":"place"');
    await firstProcess.unmount();
    latestGate = null;

    const restarted = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          onboardingHandoffStore={persisted.store}
          port={port}
          profile="native-secure"
          protectionRequired
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    await waitFor(() => {
      expect(
        restarted
          .getByTestId("preflight-state")
          .props.children.join("")
      ).toBe("idle:none:place");
      expect(
        restarted.getByTestId("gate-state").props.children.join("")
      ).toBe("locked:sealed:native");
    });

    await act(async () => {
      await latestGate!.unlock();
    });
    expect(
      resolveFirstRecordHandoff({
        dataRoutesReady: true,
        onboardingFinished: true,
        vaultReleased: latestGate!.vaultReleased,
        intent: latestGate!.pendingFirstRecordIntent
      })
    ).toBe("/capture?intent=place");
    expect(port.authenticate).toHaveBeenCalledTimes(2);
    await restarted.unmount();
  });

  it("keeps the workspace sealed after a restore read failure and retries the same subject in place", async () => {
    let loadAttempts = 0;
    const store: OnboardingHandoffStore = {
      load: jest.fn(async () => {
        loadAttempts += 1;
        if (loadAttempts === 1) {
          throw new Error("transient keychain read");
        }
        return "item";
      }),
      save: jest.fn(async () => undefined),
      clear: jest.fn(async () => undefined)
    };
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "device-passcode" as const,
        biometricEnrolled: false
      })),
      authenticate: jest.fn(async () => ({
        success: true as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          onboardingHandoffStore={store}
          port={port}
          profile="native-secure"
          protectionRequired
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );
    await waitFor(() => {
      expect(
        latestGate!.onboardingHandoffRestoreState
      ).toBe("error");
    });
    expect(latestGate!.vaultReleased).toBe(false);
    expect(latestGate!.pendingFirstRecordIntent).toBeNull();
    await act(async () => {
      await expect(
        latestGate!.authorizeOnboarding("place")
      ).resolves.toBeNull();
    });
    expect(store.save).not.toHaveBeenCalled();
    expect(port.authenticate).not.toHaveBeenCalled();

    await act(async () => {
      latestGate!.retryOnboardingHandoffRestore();
    });
    await waitFor(() => {
      expect(
        latestGate!.onboardingHandoffRestoreState
      ).toBe("ready");
      expect(latestGate!.pendingFirstRecordIntent).toBe("item");
    });
    expect(latestGate!.vaultReleased).toBe(false);
    await act(async () => {
      await latestGate!.unlock();
    });
    expect(latestGate!.vaultReleased).toBe(true);
    expect(
      resolveFirstRecordHandoff({
        dataRoutesReady: true,
        onboardingFinished: true,
        vaultReleased: latestGate!.vaultReleased,
        intent: latestGate!.pendingFirstRecordIntent
      })
    ).toBe("/capture");
    expect(store.load).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  it("fails closed before onboarding mutation when the durable handoff cannot be saved", async () => {
    const store: OnboardingHandoffStore = {
      load: jest.fn(async () => null),
      save: jest.fn(
        async (
          _subjectId: string,
          _intent: OnboardingFirstRecordIntent,
          _createdAt: number
        ) => {
          throw new Error("storage unavailable");
        }
      ),
      clear: jest.fn(async () => undefined)
    };
    const port: DeviceAuthPort = {
      assess: jest.fn(async () => ({
        kind: "available" as const,
        method: "device-passcode" as const,
        biometricEnrolled: false
      })),
      authenticate: jest.fn(async () => ({
        success: true as const
      })),
      cancel: jest.fn(async () => undefined)
    };
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <DeviceAuthProvider
          onboardingHandoffStore={store}
          port={port}
          profile="native-secure"
          protectionRequired={false}
          subjectId="account-a:household-a"
        >
          <Probe />
        </DeviceAuthProvider>
      </LocaleProvider>
    );

    let authorization: unknown;
    await act(async () => {
      authorization =
        await latestGate!.authorizeOnboarding("item");
    });
    expect(authorization).toBeNull();
    expect(latestGate!.vaultReleased).toBe(false);
    expect(latestGate!.pendingFirstRecordIntent).toBeNull();
    expect(latestGate!.onboardingPreflight.notice).toBe("failed");
    expect(
      screen.getByTestId("preflight-state").props.children.join("")
    ).toBe("ready:item:none");
    await screen.unmount();
  });
});
