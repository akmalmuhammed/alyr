import {
  act,
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import { Text } from "react-native";

import { AuthBootstrapBoundary } from "@/auth/AuthBootstrapBoundary";
import { AuthFlowProvider } from "@/auth/AuthFlowProvider";
import { createUnavailableAuthGateway } from "@/auth/adapters/unavailable";
import { createPasswordRecoverySessionMarkerStore } from "@/auth/passwordRecoverySessionMarker";
import { createRecoveryProtectedAuthGateway } from "@/auth/recoveryProtectedAuthGateway";
import type {
  AccountAuthGateway,
  AuthSessionDescriptor
} from "@/auth/types";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

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

const EXCHANGE_ID = "00000000-0000-4000-8000-000000000102";
const STARTED_AT = "2026-07-28T12:00:00.000Z";
const restoredRecoverySession: AuthSessionDescriptor = {
  identity: {
    id: "account-recovery-process",
    email: "recovery@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: "2026-07-28T13:00:00.000Z",
  onboarding: "complete",
  activeHouseholdId: "household-private",
  activeMembershipId: "membership-private",
  activeHouseholdRole: "owner"
};

function recoveryRestartHarness() {
  const values = new Map<string, string>();
  const markerStore = createPasswordRecoverySessionMarkerStore({
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    }
  });
  let session: AuthSessionDescriptor | null =
    restoredRecoverySession;
  let cleanupCanSucceed = false;
  const cancelPasswordRecovery = jest.fn(async () => {
    if (!cleanupCanSucceed) {
      return {
        ok: false as const,
        error: {
          code: "network_unavailable" as const,
          message: "Provider cleanup detail stays private.",
          retryable: true
        }
      };
    }
    session = null;
    return { ok: true as const, value: undefined };
  });
  const fallback = createUnavailableAuthGateway();
  const base: AccountAuthGateway = {
    ...fallback,
    mode: "supabase",
    currentSession: jest.fn(async () => ({
      ok: true as const,
      value: session
    })),
    onSessionChanged: jest.fn(() => () => undefined),
    cancelPasswordRecovery,
    signOut: jest.fn(async () => {
      session = null;
      return { ok: true as const, value: undefined };
    })
  };
  const gateway = createRecoveryProtectedAuthGateway(base, {
    markerStore,
    createExchangeId: () => EXCHANGE_ID,
    now: () => new Date(STARTED_AT)
  });
  return {
    gateway,
    markerStore,
    cancelPasswordRecovery,
    allowCleanup() {
      cleanupCanSucceed = true;
    }
  };
}

async function markInterruptedRecovery(
  harness: ReturnType<typeof recoveryRestartHarness>
) {
  await harness.markerStore.begin(EXCHANGE_ID, STARTED_AT);
  await harness.markerStore.bindAccount(
    EXCHANGE_ID,
    restoredRecoverySession.identity.id
  );
}

describe("localized recovery-session process-death gate", () => {
  it("keeps English private routes sealed and releases them only after retry cleanup", async () => {
    const harness = recoveryRestartHarness();
    await markInterruptedRecovery(harness);
    const screen = await render(
      <LocaleProvider initialLanguage="en">
        <AuthFlowProvider gateway={harness.gateway}>
          <AuthBootstrapBoundary>
            <Text testID="private-vault">Private vault</Text>
          </AuthBootstrapBoundary>
        </AuthFlowProvider>
      </LocaleProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("auth-bootstrap-error")).toBeTruthy()
    );
    expect(screen.queryByTestId("private-vault")).toBeNull();
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.authErrors.network_unavailable
      )
    ).toBeTruthy();
    expect(
      screen.queryByText("Provider cleanup detail stays private.")
    ).toBeNull();

    harness.allowCleanup();
    await act(async () => {
      fireEvent.press(screen.getByText("Try again"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("private-vault")).toBeTruthy()
    );
    expect(harness.cancelPasswordRecovery).toHaveBeenCalledTimes(2);
    await expect(harness.markerStore.read()).resolves.toBeNull();
    await screen.unmount();
  });

  it("renders Arabic recovery actions and supports explicit signed cleanup", async () => {
    const harness = recoveryRestartHarness();
    await markInterruptedRecovery(harness);
    const screen = await render(
      <LocaleProvider initialLanguage="ar">
        <AuthFlowProvider gateway={harness.gateway}>
          <AuthBootstrapBoundary>
            <Text testID="private-vault">Private vault</Text>
          </AuthBootstrapBoundary>
        </AuthFlowProvider>
      </LocaleProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("auth-bootstrap-error")).toBeTruthy()
    );
    expect(screen.queryByTestId("private-vault")).toBeNull();
    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.ar.authErrors.network_unavailable
      )
    ).toBeTruthy();
    expect(screen.getByText("حاول مرة أخرى")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText("تسجيل الخروج"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("private-vault")).toBeTruthy()
    );
    await expect(harness.markerStore.read()).resolves.toBeNull();
    await screen.unmount();
  });
});
