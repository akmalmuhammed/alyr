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
import type { DeviceAuthPort } from "@/deviceAuth/types";
import { LocaleProvider } from "@/i18n/LocaleProvider";

let latestGate: ReturnType<typeof useDeviceAuth> | null = null;

function Probe() {
  latestGate = useDeviceAuth();
  return (
    <Text testID="gate-state">
      {latestGate.state.phase}:
      {latestGate.vaultReleased ? "released" : "sealed"}:
      {latestGate.previewBypass ? "preview" : "native"}
    </Text>
  );
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
    expect(port.assess).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
