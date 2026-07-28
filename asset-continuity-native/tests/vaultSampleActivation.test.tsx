import {
  fireEvent,
  render
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { VaultScreen } from "../app/(tabs)/vault";
import { AUTH_ROUTES } from "@/auth/routes";
import type {
  AuthGatewayMode,
  AuthSessionDescriptor
} from "@/auth/types";
import { createWorkspace } from "@/domain/sample";
import type { NativeWorkspace } from "@/domain/model";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn()
};
const mockSignOut = jest.fn(async () => true);
const mockCan = jest.fn((_capability: string) => true);
const mockReplaceWorkspace = jest.fn(async () => undefined);
const mockChangeLanguage = jest.fn(async () => undefined);
const mockSyncNow = jest.fn(async () => undefined);
let mockMode: AuthGatewayMode = "supabase";
let mockSession: AuthSessionDescriptor | null = null;
let mockWorkspace: NativeWorkspace = createWorkspace("sample");

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => ({
    busy: false,
    mode: mockMode,
    session: mockSession,
    signOut: mockSignOut
  })
}));

jest.mock("@/deviceAuth", () => ({
  useDeviceAuth: () => ({
    lockNow: jest.fn(),
    previewBypass: true,
    requiresUnlock: false
  })
}));

jest.mock("@/recovery", () => ({
  useRecoveryJourney: () => ({
    capability: {
      kind: "unavailable"
    }
  })
}));

jest.mock("@/notifications/ReviewReminderProvider", () => ({
  useReviewReminder: () => ({
    status: "unavailable",
    enabled: false,
    available: false,
    busy: false,
    scheduledAt: null,
    permission: null,
    enable: jest.fn(async () => "unavailable"),
    disable: jest.fn(async () => "unavailable")
  })
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined)
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: mockCan,
    workspace: mockWorkspace,
    attachmentStore: null,
    repository: {
      encryptedAtRest: true
    },
    pendingOperationCount: 0,
    sync: {
      status: "local-only",
      conflicts: [],
      lastError: null,
      lastAttemptAt: null,
      lastSyncedAt: null
    },
    syncNow: mockSyncNow,
    changeLanguage: mockChangeLanguage,
    exportReadableSnapshot: () => "{}",
    replaceWithPersonalWorkspace: mockReplaceWorkspace
  })
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 }
};

function localeWrapper(language: "en" | "ar") {
  return function TestLocaleWrapper({ children }: PropsWithChildren) {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <LocaleProvider initialLanguage={language}>
          {children}
        </LocaleProvider>
      </SafeAreaProvider>
    );
  };
}

describe("Settings sample activation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCan.mockReturnValue(true);
    mockMode = "supabase";
    mockSession = null;
    mockWorkspace = createWorkspace("sample");
  });

  it("sends a signed-out cloud sample to account creation without mutating its local vault", async () => {
    const screen = await render(<VaultScreen surface="settings" />, {
      wrapper: localeWrapper("en")
    });

    fireEvent.press(
      screen.getByRole("button", {
        name: CORE_JOURNEY_COPY.en.vault.createMyPrivateHousehold
      })
    );

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith(
      AUTH_ROUTES.createAccount
    );
    expect(mockRouter.push).not.toHaveBeenCalledWith("/personal-start");
    expect(mockReplaceWorkspace).not.toHaveBeenCalled();
  });

  it("keeps the localized Arabic preview action on confirmed local conversion", async () => {
    mockMode = "preview";
    const screen = await render(<VaultScreen surface="settings" />, {
      wrapper: localeWrapper("ar")
    });
    const label =
      CORE_JOURNEY_COPY.ar.vault.createMyPrivateHousehold;

    expect(screen.getByRole("button", { name: label })).toBeTruthy();
    expect(
      screen.queryByText(
        CORE_JOURNEY_COPY.en.vault.createMyPrivateHousehold
      )
    ).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: label }));

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith("/personal-start");
    expect(mockRouter.push).not.toHaveBeenCalledWith(
      AUTH_ROUTES.createAccount
    );
    expect(mockReplaceWorkspace).not.toHaveBeenCalled();
  });

  it("does not offer sample activation inside an authenticated cloud session", async () => {
    mockSession = {
      identity: {
        id: "account-owner",
        email: "owner@example.com",
        emailVerified: true
      },
      assurance: "verified-email",
      expiresAt: "2026-07-29T12:00:00.000Z",
      onboarding: "complete",
      activeHouseholdId: "household-owner",
      activeMembershipId: "membership-owner",
      activeHouseholdRole: "owner"
    };
    const screen = await render(<VaultScreen surface="settings" />, {
      wrapper: localeWrapper("en")
    });

    expect(
      screen.queryByRole("button", {
        name: CORE_JOURNEY_COPY.en.vault.createMyPrivateHousehold
      })
    ).toBeNull();
  });

  it("does not offer activation for a personal workspace or without household management", async () => {
    mockWorkspace = createWorkspace("personal");
    const personal = await render(<VaultScreen surface="settings" />, {
      wrapper: localeWrapper("en")
    });
    const label =
      CORE_JOURNEY_COPY.en.vault.createMyPrivateHousehold;

    expect(
      personal.queryByRole("button", { name: label })
    ).toBeNull();
    await personal.unmount();

    mockWorkspace = createWorkspace("sample");
    mockCan.mockImplementation(
      (capability) => capability !== "household.manage"
    );
    const denied = await render(<VaultScreen surface="settings" />, {
      wrapper: localeWrapper("en")
    });

    expect(denied.queryByRole("button", { name: label })).toBeNull();
  });
});
