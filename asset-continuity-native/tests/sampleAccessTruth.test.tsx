import {
  cleanup,
  fireEvent,
  render
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type {
  ContractError,
  HouseholdAccessSnapshot
} from "@alyr/contracts";

import FamilyScreen from "../app/(tabs)/family";
import { VaultScreen } from "../app/(tabs)/vault";
import ExportCreateScreen from "../app/export-create";
import { AUTH_ROUTES } from "@/auth/routes";
import type { AuthSessionDescriptor } from "@/auth/types";
import { createWorkspace } from "@/domain/sample";
import {
  CORE_JOURNEY_COPY,
  householdAccessSummary,
  sampleHouseholdAccessSummary
} from "@/i18n/coreJourneyCopy";
import { HOUSEHOLD_ADMIN_COPY } from "@/i18n/householdAdminCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn()
};
const mockRefreshHouseholdAccess = jest.fn(async () => false);
const mockGetRuntimeCloudExportPort = jest.fn();
const mockWorkspace = createWorkspace("sample");
const mockOfflineAccessError: ContractError = {
  errorVersion: 1,
  code: "OFFLINE",
  message: "A cloud roster request failed.",
  retryable: true
};
const mockAuthFlow: {
  busy: boolean;
  mode: "supabase";
  session: AuthSessionDescriptor | null;
  signOut: () => Promise<boolean>;
  householdAccessStatus: "idle" | "refreshing" | "ready" | "error";
  householdAccessError: ContractError | null;
  refreshHouseholdAccess: () => Promise<boolean>;
  householdAccessSnapshot: HouseholdAccessSnapshot | null;
} = {
  busy: false,
  mode: "supabase",
  session: null,
  signOut: jest.fn(async () => true),
  householdAccessStatus: "error",
  householdAccessError: mockOfflineAccessError,
  refreshHouseholdAccess: mockRefreshHouseholdAccess,
  householdAccessSnapshot: null
};
const mockWorkspaceFlow = {
  can: jest.fn(() => true),
  workspace: mockWorkspace,
  attachmentStore: null,
  repository: {
    encryptedAtRest: true
  },
  pendingOperationCount: 0,
  sync: {
    status: "local-only" as const,
    conflicts: [],
    lastError: null,
    lastAttemptAt: null,
    lastSyncedAt: null
  },
  syncNow: jest.fn(async () => undefined),
  changeLanguage: jest.fn(async () => undefined),
  exportReadableSnapshot: () => "{}",
  trackContinuitySnapshotExported: jest.fn(async () => undefined)
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => mockAuthFlow
}));

jest.mock("@/runtime/cloudServices", () => ({
  getRuntimeCloudExportPort: () => mockGetRuntimeCloudExportPort()
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => mockWorkspaceFlow
}));

jest.mock("@/deviceAuth", () => ({
  useDeviceAuth: () => ({
    lockNow: jest.fn(),
    previewBypass: false,
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

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 }
};

function localeWrapper(language: "en" | "ar") {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <LocaleProvider initialLanguage={language}>
          {children}
        </LocaleProvider>
      </SafeAreaProvider>
    );
  };
}

describe("signed-out sample access truth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceFlow.can.mockReturnValue(true);
    mockAuthFlow.session = null;
    mockAuthFlow.householdAccessStatus = "error";
    mockAuthFlow.householdAccessError = mockOfflineAccessError;
    mockAuthFlow.householdAccessSnapshot = null;
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    [
      "en" as const,
      HOUSEHOLD_ADMIN_COPY.en.previewTitle,
      HOUSEHOLD_ADMIN_COPY.en.refreshFailedTitle
    ],
    [
      "ar" as const,
      HOUSEHOLD_ADMIN_COPY.ar.previewTitle,
      HOUSEHOLD_ADMIN_COPY.ar.refreshFailedTitle
    ]
  ])(
    "uses the isolated local Family roster in %s without a false cloud error",
    async (language, sampleTitle, refreshErrorTitle) => {
      const screen = await render(<FamilyScreen />, {
        wrapper: localeWrapper(language)
      });

      expect(screen.getByText("Maya Rahman")).toBeTruthy();
      expect(screen.getByText("Omar Rahman")).toBeTruthy();
      expect(screen.getByText(sampleTitle)).toBeTruthy();
      expect(screen.queryByText(refreshErrorTitle)).toBeNull();
      expect(
        screen.queryByText("A cloud roster request failed.")
      ).toBeNull();
      expect(mockRefreshHouseholdAccess).not.toHaveBeenCalled();
    }
  );

  it("routes the signed-out Vault cloud feature to account activation", async () => {
    const vault = await render(<VaultScreen />, {
      wrapper: localeWrapper("en")
    });

    expect(vault.getByText("Create account")).toBeTruthy();
    fireEvent.press(vault.getByText("Create account"));
    expect(mockRouter.push).toHaveBeenCalledWith(
      AUTH_ROUTES.createAccount
    );
  });

  it("omits local sample member counts from Settings", async () => {
    const settings = await render(<VaultScreen surface="settings" />, {
      wrapper: localeWrapper("en")
    });
    expect(
      settings.getByText(
        sampleHouseholdAccessSummary(
          mockWorkspace.members.length,
          "en"
        )
      )
    ).toBeTruthy();
    expect(
      settings.queryByText(
        householdAccessSummary(mockWorkspace.members.length, 0, "en")
      )
    ).toBeNull();
  });

  it("omits names and counts while verified cloud access is not ready", async () => {
    mockAuthFlow.session = {
      identity: {
        id: "account-owner",
        email: "owner@example.com",
        emailVerified: true
      },
      assurance: "verified-email",
      expiresAt: "2026-08-01T00:00:00.000Z",
      onboarding: "complete",
      activeHouseholdId: mockWorkspace.household.id,
      activeMembershipId: "membership-owner",
      activeHouseholdRole: "owner"
    };
    mockAuthFlow.householdAccessStatus = "refreshing";
    mockAuthFlow.householdAccessError = null;

    const screen = await render(<VaultScreen surface="settings" />, {
      wrapper: localeWrapper("en")
    });

    expect(
      screen.getByText(
        CORE_JOURNEY_COPY.en.vault.householdAccessPending
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(
        sampleHouseholdAccessSummary(
          mockWorkspace.members.length,
          "en"
        )
      )
    ).toBeNull();
  });

  it("uses the verified roster and pending invitations for the Settings summary", async () => {
    mockAuthFlow.session = {
      identity: {
        id: "account-owner",
        email: "owner@example.com",
        emailVerified: true
      },
      assurance: "verified-email",
      expiresAt: "2026-08-01T00:00:00.000Z",
      onboarding: "complete",
      activeHouseholdId: mockWorkspace.household.id,
      activeMembershipId: "membership-owner",
      activeHouseholdRole: "owner"
    };
    mockAuthFlow.householdAccessStatus = "ready";
    mockAuthFlow.householdAccessError = null;
    mockAuthFlow.householdAccessSnapshot = {
      householdId: mockWorkspace.household.id,
      householdName: "Verified household",
      householdVersion: 1,
      currentMembershipId: "membership-owner",
      currentAccountId: "account-owner",
      currentRole: "owner",
      members: [
        {
          membershipId: "membership-owner",
          householdId: mockWorkspace.household.id,
          accountId: "account-owner",
          displayName: "Owner",
          email: "owner@example.com",
          role: "owner",
          status: "active",
          version: 1,
          joinedAt: "2026-07-01T00:00:00.000Z",
          isCurrentUser: true
        },
        {
          membershipId: "membership-editor",
          householdId: mockWorkspace.household.id,
          accountId: "account-editor",
          displayName: "Editor",
          email: "editor@example.com",
          role: "editor",
          status: "active",
          version: 1,
          joinedAt: "2026-07-02T00:00:00.000Z",
          isCurrentUser: false
        }
      ],
      pendingInvites: [
        {
          inviteId: "invite-editor",
          householdId: mockWorkspace.household.id,
          role: "editor",
          status: "pending",
          version: 1,
          createdAt: "2026-07-27T00:00:00.000Z",
          expiresAt: "2026-07-30T00:00:00.000Z"
        },
        {
          inviteId: "invite-viewer",
          householdId: mockWorkspace.household.id,
          role: "viewer",
          status: "pending",
          version: 1,
          createdAt: "2026-07-27T00:00:00.000Z",
          expiresAt: "2026-07-30T00:00:00.000Z"
        }
      ],
      refreshedAt: "2026-07-28T00:00:00.000Z"
    };

    const screen = await render(<VaultScreen surface="settings" />, {
      wrapper: localeWrapper("en")
    });

    expect(
      screen.getByText(householdAccessSummary(2, 2, "en"))
    ).toBeTruthy();
    expect(
      screen.queryByText(
        householdAccessSummary(mockWorkspace.members.length, 0, "en")
      )
    ).toBeNull();
  });

  it.each([
    ["en" as const, "Activate cloud continuity", "Create my account"],
    ["ar" as const, "فعّل الاستمرارية السحابية", "إنشاء حسابي"]
  ])(
    "keeps the deep-linked export account-gated in %s",
    async (language, title, action) => {
      const screen = await render(<ExportCreateScreen />, {
        wrapper: localeWrapper(language)
      });

      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(action)).toBeTruthy();
      expect(mockGetRuntimeCloudExportPort).not.toHaveBeenCalled();

      fireEvent.press(screen.getByText(action));
      expect(mockRouter.replace).toHaveBeenCalledWith(
        AUTH_ROUTES.createAccount
      );
    }
  );
});
