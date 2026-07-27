import {
  fireEvent,
  render,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Alert, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import VaultScreen, {
  isCompactVaultActionWidth
} from "../app/(tabs)/vault";
import FamilyScreen from "../app/(tabs)/family";
import type { AuthSessionDescriptor } from "@/auth/types";
import { createWorkspace } from "@/domain/sample";
import type { NativeWorkspace } from "@/domain/model";
import {
  CORE_JOURNEY_COPY,
  familyMemberSummary,
  formatByteSize,
  householdAccessSummary,
  memberAvatarAccessibilityLabel,
  pendingUpdateSummary,
  proofFileSummary,
  signedAccountExitPrompt
} from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn()
};
const mockSignOut = jest.fn(async () => true);
const mockChangeLanguage = jest.fn(async () => undefined);
const mockReplaceWorkspace = jest.fn(async () => undefined);
const mockSyncNow = jest.fn(async () => undefined);
const mockRefreshHouseholdAccess = jest.fn(async () => true);
const mockCan = jest.fn((_capability: string) => true);
const mockIsSharingAvailable = jest.fn(async () => true);
const mockShare = jest.fn(async () => undefined);

const baseWorkspace = createWorkspace("personal");
const mockWorkspace: NativeWorkspace = {
  ...baseWorkspace,
  household: {
    ...baseWorkspace.household,
    name: "Bayt 7 بيت"
  },
  members: [
    {
      ...baseWorkspace.members[0]!,
      name: "Leila العبدالله",
      initials: "Lع"
    },
    {
      id: "member-invited",
      householdId: baseWorkspace.household.id,
      name: "Omar Smith",
      initials: "OS",
      role: "editor",
      status: "invited",
      lastActiveAt: null
    }
  ]
};
const mockSession: AuthSessionDescriptor = {
  identity: {
    id: "account-1",
    email: "leila+home@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: "2026-07-28T12:00:00.000Z",
  onboarding: "complete",
  activeHouseholdId: mockWorkspace.household.id,
  activeMembershipId: "membership-owner",
  activeHouseholdRole: "owner"
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter
}));

jest.mock("@/auth/AuthFlowProvider", () => ({
  useAuthFlow: () => ({
    busy: false,
    mode: "supabase",
    session: mockSession,
    signOut: mockSignOut,
    householdAccessStatus: "ready",
    householdAccessError: null,
    refreshHouseholdAccess: mockRefreshHouseholdAccess,
    householdAccessSnapshot: {
      householdId: mockWorkspace.household.id,
      householdName: mockWorkspace.household.name,
      householdVersion: 1,
      currentMembershipId: "membership-owner",
      currentAccountId: "account-1",
      currentRole: "owner",
      members: [
        {
          membershipId: "membership-owner",
          householdId: mockWorkspace.household.id,
          accountId: "account-1",
          displayName:
            "Leila \u0627\u0644\u0639\u0628\u062f\u0627\u0644\u0644\u0647",
          email: "leila+home@example.com",
          role: "owner",
          status: "active",
          version: 1,
          joinedAt: "2026-07-20T12:00:00.000Z",
          isCurrentUser: true
        },
        {
          membershipId: "membership-editor",
          householdId: mockWorkspace.household.id,
          accountId: "account-2",
          displayName: "Omar Smith",
          email: "omar@example.com",
          role: "editor",
          status: "active",
          version: 1,
          joinedAt: "2026-07-21T12:00:00.000Z",
          isCurrentUser: false
        }
      ],
      pendingInvites: [],
      refreshedAt: "2026-07-27T12:00:00.000Z"
    }
  })
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

jest.mock("expo-sharing", () => ({
  isAvailableAsync: () => mockIsSharingAvailable(),
  shareAsync: mockShare
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: mockCan,
    workspace: mockWorkspace,
    attachmentStore: null,
    repository: {
      encryptedAtRest: true
    },
    pendingOperationCount: 2,
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

const metrics320 = {
  frame: { x: 0, y: 0, width: 320, height: 700 },
  insets: { top: 20, right: 0, bottom: 16, left: 0 }
};

function localeWrapper(language: "en" | "ar") {
  return function TestLocaleWrapper({ children }: PropsWithChildren) {
    return (
      <SafeAreaProvider initialMetrics={metrics320}>
        <LocaleProvider initialLanguage={language}>
          {children}
        </LocaleProvider>
      </SafeAreaProvider>
    );
  };
}

describe("Family and Vault localization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCan.mockReturnValue(true);
    mockIsSharingAvailable.mockResolvedValue(true);
  });

  it("keeps every canonical Stack title behind the bilingual copy contract", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/_layout.tsx`,
      "utf8"
    );

    for (const key of Object.keys(CORE_JOURNEY_COPY.en.stack)) {
      expect(source).toContain(`copy.stack.${key}`);
    }
    expect(source).not.toMatch(/\btitle:\s*["'`]/u);
    expect(CORE_JOURNEY_COPY.ar.family.title).toBe("الأسرة");
    expect(CORE_JOURNEY_COPY.ar.stack.restoreRecoveryKit).toBe(
      "الاستعادة من حزمة"
    );
  });

  it("renders Family in English and Arabic without an English fallback", async () => {
    const english = await render(<FamilyScreen />, {
      wrapper: localeWrapper("en")
    });
    expect(
      english.getByText(CORE_JOURNEY_COPY.en.family.intro)
    ).toBeTruthy();
    expect(english.getByText(CORE_JOURNEY_COPY.en.family.owner)).toBeTruthy();
    await english.unmount();

    const arabic = await render(<FamilyScreen />, {
      wrapper: localeWrapper("ar")
    });
    expect(
      arabic.getByText(CORE_JOURNEY_COPY.ar.family.intro)
    ).toBeTruthy();
    expect(
      arabic.queryByText(CORE_JOURNEY_COPY.en.family.peopleSection)
    ).toBeNull();
    expect(
      arabic.getByLabelText(
        memberAvatarAccessibilityLabel("Leila العبدالله", "ar")
      )
    ).toBeTruthy();

    const roleStyle = StyleSheet.flatten(
      arabic.getByText(CORE_JOURNEY_COPY.ar.family.owner).props.style
    );
    expect(roleStyle.fontFamily).toBe("IBMPlexSansArabic_600SemiBold");
    expect(roleStyle.writingDirection).toBe("rtl");

    const mixedNameStyle = StyleSheet.flatten(
      arabic.getByText("Leila العبدالله").props.style
    );
    expect(mixedNameStyle.writingDirection).toBe("auto");
    expect(mixedNameStyle.textAlign).toBe("right");
  });

  it("renders the complete Vault surface in Arabic, including status and account actions", async () => {
    const screen = await render(<VaultScreen />, {
      wrapper: localeWrapper("ar")
    });
    const copy = CORE_JOURNEY_COPY.ar.vault;

    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(screen.getByText(copy.backupRecovery)).toBeTruthy();
    expect(screen.getByText(copy.recentProof)).toBeTruthy();
    expect(screen.getByText(copy.dataPortability)).toBeTruthy();
    expect(screen.getByText(copy.householdAccess)).toBeTruthy();
    expect(screen.getByText(copy.account)).toBeTruthy();
    expect(screen.getByText(copy.signOutSwitch)).toBeTruthy();
    expect(screen.getAllByText(copy.signedBuildNeeded)).toHaveLength(2);
    expect(
      screen.queryByText(CORE_JOURNEY_COPY.en.vault.backupRecovery)
    ).toBeNull();

    const emailStyle = StyleSheet.flatten(
      screen.getByText("leila+home@example.com").props.style
    );
    expect(emailStyle.writingDirection).toBe("ltr");
    expect(emailStyle.textAlign).toBe("right");

    await fireEvent.press(
      screen.getByRole("button", {
        name: new RegExp(copy.advancedDiagnostics, "u")
      })
    );
    expect(screen.getByText(pendingUpdateSummary(2, "ar"))).toBeTruthy();
    expect(screen.getByText(copy.waiting)).toBeTruthy();
  });

  it("does not reveal proof counts when proof read access is absent", async () => {
    mockCan.mockImplementation(
      (capability) => capability !== "evidence.read"
    );
    const screen = await render(<VaultScreen />, {
      wrapper: localeWrapper("en")
    });

    expect(screen.getByTestId("vault-proof-view-denied")).toBeTruthy();
    expect(
      screen.queryByText(CORE_JOURNEY_COPY.en.vault.recentProof)
    ).toBeNull();
    expect(
      screen.queryByText(
        proofFileSummary(
          mockWorkspace.evidence.length,
          true,
          "en"
        )
      )
    ).toBeNull();
  });

  it("shows localized recovery when the readable Vault export fails", async () => {
    mockIsSharingAvailable.mockRejectedValueOnce(
      new Error("Share service failed")
    );
    const alert = jest.spyOn(Alert, "alert").mockImplementation();
    const screen = await render(<VaultScreen />, {
      wrapper: localeWrapper("ar")
    });
    const copy = CORE_JOURNEY_COPY.ar.vault;

    await fireEvent.press(
      screen.getByRole("button", {
        name: new RegExp(copy.exportReadable, "u")
      })
    );

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        copy.exportFailedTitle,
        copy.exportFailedBody,
        expect.arrayContaining([
          expect.objectContaining({ text: copy.cancel }),
          expect.objectContaining({ text: copy.exportTryAgain })
        ])
      )
    );
    alert.mockRestore();
  });

  it("uses natural localized counts, units and bidi isolation", () => {
    expect(familyMemberSummary(2, 1, "en")).toBe(
      "2 people · 1 active"
    );
    expect(familyMemberSummary(2, 1, "ar")).toBe(
      "فردان · فرد نشط"
    );
    expect(householdAccessSummary(2, "ar")).toContain(
      "الأدوار والدعوات"
    );
    expect(proofFileSummary(2, true, "ar")).toBe(
      "ملفا إثبات على هذا الجهاز. كل ملف مشفّر عند التخزين."
    );
    expect(formatByteSize(1536, "ar")).toMatch(/٢|۲/u);

    const prompt = signedAccountExitPrompt(
      "leila+home@example.com",
      "Bayt 7 بيت",
      "ar"
    );
    expect(prompt).toContain("\u2068leila+home@example.com\u2069");
    expect(prompt).toContain("\u2068Bayt 7 بيت\u2069");
  });

  it("switches Vault actions to the stacked contract at 320 px", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/vault.tsx`,
      "utf8"
    );

    expect(isCompactVaultActionWidth(320)).toBe(true);
    expect(isCompactVaultActionWidth(360)).toBe(true);
    expect(isCompactVaultActionWidth(361)).toBe(false);
    expect(source).toContain("compact={compactActions}");
    expect(source).toContain("compact && styles.statusRowCompact");
    expect(source).toContain('flexDirection: "column"');
    expect(source).toContain('width: "100%"');
  });
});
