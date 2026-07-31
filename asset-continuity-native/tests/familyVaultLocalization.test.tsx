import {
  fireEvent,
  render,
  within,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import {
  AccessibilityInfo,
  Alert,
  Platform,
  StyleSheet
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  VaultScreen,
  isCompactVaultActionWidth,
  localProofStorageSummary
} from "../app/(tabs)/vault";
import FamilyScreen from "../app/(tabs)/family";
import type { AuthSessionDescriptor } from "@/auth/types";
import { createWorkspace } from "@/domain/sample";
import type { NativeWorkspace } from "@/domain/model";
import type {
  NativeEvidence,
  NativePlaceDocument
} from "@/domain/model";
import {
  CORE_JOURNEY_COPY,
  familyMemberSummary,
  formatByteSize,
  formatLocalizedDate,
  householdAccessSummary,
  memberAvatarAccessibilityLabel,
  pendingUpdateSummary,
  proofFileSummary,
  signedAccountExitPrompt
} from "@/i18n/coreJourneyCopy";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import type { LocalRecoveryKitRecord } from "@/recovery";

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
const mockRecoveryListRecent = jest.fn(
  async (): Promise<readonly LocalRecoveryKitRecord[]> => []
);
const mockRecoveryJourney = {
  capability: {
    kind: "unavailable"
  } as
    | { kind: "unavailable" }
    | {
        kind: "available";
        protection: "argon2id-aes-256-gcm";
      },
  listRecent: mockRecoveryListRecent
};

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
  useRouter: () => mockRouter,
  useFocusEffect: (callback: () => void) =>
    jest.requireActual<typeof import("react")>("react").useEffect(
      callback,
      [callback]
    )
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
  useRecoveryJourney: () => mockRecoveryJourney
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
    mockRecoveryJourney.capability = { kind: "unavailable" };
    mockRecoveryListRecent.mockResolvedValue([]);
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

  it("keeps Vault focused on protection, proof and recovery in Arabic", async () => {
    const screen = await render(<VaultScreen />, {
      wrapper: localeWrapper("ar")
    });
    const copy = CORE_JOURNEY_COPY.ar.vault;

    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(screen.getByText(copy.backupRecovery)).toBeTruthy();
    expect(screen.getByText(copy.recentProof)).toBeTruthy();
    expect(screen.getByText(copy.dataPortability)).toBeTruthy();
    expect(screen.getByText(copy.settingsTitle)).toBeTruthy();
    expect(screen.getAllByText(copy.signedBuildNeeded)).toHaveLength(2);
    expect(screen.queryByText(copy.householdAccess)).toBeNull();
    expect(screen.queryByText(copy.account)).toBeNull();
    expect(screen.queryByText(copy.signOutSwitch)).toBeNull();
    expect(screen.queryByText(copy.language)).toBeNull();
    expect(
      screen.queryByText(CORE_JOURNEY_COPY.en.vault.backupRecovery)
    ).toBeNull();

    await fireEvent.press(
      screen.getByRole("button", {
        name: new RegExp(copy.settingsTitle, "u")
      })
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/settings");
  });

  it("uses one archive-status masthead before proof and numbered rule-led chapters", async () => {
    const screen = await render(<VaultScreen />, {
      wrapper: localeWrapper("en")
    });
    const copy = CORE_JOURNEY_COPY.en.vault;
    const archive = within(screen.getByTestId("vault-archive-status"));
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/vault.tsx`,
      "utf8"
    );

    expect(archive.getByText(copy.archiveStatus)).toBeTruthy();
    expect(archive.getByTestId("sync-truth")).toBeTruthy();
    expect(archive.getByTestId("vault-local-proof-storage")).toBeTruthy();
    expect(archive.getByTestId("vault-cloud-storage-usage")).toBeTruthy();
    expect(
      within(screen.getByTestId("vault-chapter-recovery")).getByText(
        "02",
        { includeHiddenElements: true }
      )
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("vault-chapter-portability")).getByText(
        "03",
        { includeHiddenElements: true }
      )
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("vault-chapter-settings")).getByText(
        "04",
        { includeHiddenElements: true }
      )
    ).toBeTruthy();

    const masthead = source.indexOf("<ArchiveStatusMasthead");
    const proof = source.indexOf("<VaultRecentProof");
    const recovery = source.indexOf('testID="vault-chapter-recovery"');
    const portability = source.indexOf('testID="vault-chapter-portability"');
    const settings = source.indexOf('testID="vault-chapter-settings"');

    expect(masthead).toBeGreaterThan(-1);
    expect(masthead).toBeLessThan(proof);
    expect(proof).toBeLessThan(recovery);
    expect(recovery).toBeLessThan(portability);
    expect(portability).toBeLessThan(settings);
    expect(source).not.toContain("<SyncTruth");
    expect(source).not.toContain("storageTruthGroup");
  });

  it("separates device proof size from unknown cloud usage in English and Arabic", async () => {
    const english = await render(<VaultScreen />, {
      wrapper: localeWrapper("en")
    });
    const englishCopy = CORE_JOURNEY_COPY.en.vault;
    const englishLocal = english.getByTestId(
      "vault-local-proof-storage"
    );
    const englishCloud = english.getByTestId(
      "vault-cloud-storage-usage"
    );

    expect(englishLocal.props.accessible).toBe(true);
    expect(englishLocal.props.accessibilityLabel).toContain(
      englishCopy.localProofStorageDescription
    );
    expect(
      within(englishCloud).getByText(englishCopy.cloudUsageUnknown)
    ).toBeTruthy();
    expect(
      within(englishCloud).getByText(
        `${englishCopy.cloudPilotAllowance}: ${englishCopy.cloudAllowanceUnknown}`
      )
    ).toBeTruthy();
    expect(englishCloud.props.accessibilityLabel).toBe(
      [
        englishCopy.cloudPilotStorage,
        englishCopy.cloudUsageUnknown,
        `${englishCopy.cloudPilotAllowance}: ${englishCopy.cloudAllowanceUnknown}`,
        englishCopy.cloudUsageUnknownDescription
      ].join(". ")
    );
    expect(englishCloud.props.accessibilityLiveRegion).toBe("polite");
    expect(
      within(englishCloud).queryByText(formatByteSize(0, "en"))
    ).toBeNull();
    await english.unmount();

    const arabic = await render(<VaultScreen />, {
      wrapper: localeWrapper("ar")
    });
    const arabicCopy = CORE_JOURNEY_COPY.ar.vault;
    const arabicCloud = arabic.getByTestId(
      "vault-cloud-storage-usage"
    );

    expect(
      within(arabicCloud).getByText(arabicCopy.cloudUsageUnknown)
    ).toBeTruthy();
    expect(
      within(arabicCloud).getByText(
        `${arabicCopy.cloudPilotAllowance}: ${arabicCopy.cloudAllowanceUnknown}`
      )
    ).toBeTruthy();
    expect(arabicCloud.props.accessibilityLabel).toContain(
      arabicCopy.cloudUsageUnknownDescription
    );
    expect(
      within(arabicCloud).queryByText(englishCopy.cloudUsageUnknown)
    ).toBeNull();
    const arabicHeadingStyle = StyleSheet.flatten(
      within(arabicCloud).getByText(arabicCopy.cloudPilotStorage)
        .props.style
    );
    expect(arabicHeadingStyle.writingDirection).toBe("rtl");
  });

  it("shows recent local kits and the truthful next backup action", async () => {
    mockRecoveryJourney.capability = {
      kind: "available",
      protection: "argon2id-aes-256-gcm"
    };
    mockRecoveryListRecent.mockResolvedValue([
      {
        reference: "file:///Heldat-Recovery-2026-07-28.alyrkit",
        fileName: "Heldat-Recovery-2026-07-28.alyrkit",
        byteSize: 2048,
        createdAt: "2026-07-28T08:00:00.000Z",
        externalBackupConfirmedAt: null
      },
      {
        reference: "file:///Heldat-Recovery-2026-07-27.alyrkit",
        fileName: "Heldat-Recovery-2026-07-27.alyrkit",
        byteSize: 1024,
        createdAt: "2026-07-27T08:00:00.000Z",
        externalBackupConfirmedAt: "2026-07-27T08:05:00.000Z"
      }
    ]);
    const screen = await render(<VaultScreen />, {
      wrapper: localeWrapper("en")
    });
    const copy = CORE_JOURNEY_COPY.en.vault;

    await waitFor(() =>
      expect(screen.getByTestId("vault-recent-recovery-kits")).toBeTruthy()
    );
    expect(screen.getByText(copy.recentRecoveryKitsDescription)).toBeTruthy();
    expect(screen.getByText(copy.localKitNeedsCopy)).toBeTruthy();
    expect(screen.getByText(copy.externalCopyConfirmed)).toBeTruthy();
    expect(screen.queryByText(/SHA-256/iu)).toBeNull();

    await fireEvent.press(
      screen.getByRole("button", {
        name: new RegExp("Heldat-Recovery-2026-07-28", "u")
      })
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/recovery-create");
  });

  it("surfaces a local Recovery Kit listing failure and retries device storage", async () => {
    mockRecoveryJourney.capability = {
      kind: "available",
      protection: "argon2id-aes-256-gcm"
    };
    mockRecoveryListRecent
      .mockRejectedValueOnce(new Error("device storage unavailable"))
      .mockResolvedValueOnce([]);
    const screen = await render(<VaultScreen />, {
      wrapper: localeWrapper("en")
    });
    const copy = CORE_JOURNEY_COPY.en.vault;

    expect(
      await screen.findByText(copy.recoveryHistoryUnavailable)
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", {
        name: new RegExp(copy.recentRecoveryKits, "u")
      })
    );

    await waitFor(() =>
      expect(mockRecoveryListRecent).toHaveBeenCalledTimes(2)
    );
    await waitFor(() =>
      expect(
        screen.queryByText(copy.recoveryHistoryUnavailable)
      ).toBeNull()
    );
  });

  it("labels a server-confirmed cloud measurement as authoritative", async () => {
    const measuredAt = "2026-07-28T08:00:00.000Z";
    const screen = await render(
      <VaultScreen
        authoritativeCloudStorageUsage={{
          householdId: mockWorkspace.household.id,
          source: "server-confirmed",
          usedBytes: 2 * 1024 * 1024,
          allowanceBytes: 48 * 1024 * 1024,
          measuredAt
        }}
      />,
      { wrapper: localeWrapper("en") }
    );
    const copy = CORE_JOURNEY_COPY.en.vault;
    const cloud = screen.getByTestId("vault-cloud-storage-usage");
    const confirmedDescription = `${
      copy.cloudUsageConfirmedDescription
    } ${formatLocalizedDate(measuredAt, "en")}. ${
      copy.cloudAllowanceDescription
    }`;

    expect(
      within(cloud).getByText(
        `${formatByteSize(2 * 1024 * 1024, "en")} ${copy.cloudUsed}`
      )
    ).toBeTruthy();
    expect(within(cloud).getByText(confirmedDescription)).toBeTruthy();
    expect(cloud.props.accessibilityLabel).toContain(
      confirmedDescription
    );
    expect(
      within(cloud).queryByText(copy.cloudUsageUnknown)
    ).toBeNull();
  });

  it("announces an asynchronously confirmed cloud measurement on iOS", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      Platform,
      "OS"
    );
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios"
    });
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);

    try {
      const screen = await render(<VaultScreen />, {
        wrapper: localeWrapper("en")
      });
      expect(announce).not.toHaveBeenCalled();

      await screen.rerender(
        <VaultScreen
          authoritativeCloudStorageUsage={{
            householdId: mockWorkspace.household.id,
            source: "server-confirmed",
            usedBytes: 3 * 1024 * 1024,
            allowanceBytes: 48 * 1024 * 1024,
            measuredAt: "2026-07-28T08:00:00.000Z"
          }}
        />
      );
      const cloud = screen.getByTestId("vault-cloud-storage-usage");
      expect(announce).toHaveBeenCalledWith(
        cloud.props.accessibilityLabel
      );
    } finally {
      announce.mockRestore();
      if (platformDescriptor) {
        Object.defineProperty(Platform, "OS", platformDescriptor);
      }
    }
  });

  it("keeps account, household, language and diagnostics on Settings in Arabic", async () => {
    const screen = await render(<VaultScreen surface="settings" />, {
      wrapper: localeWrapper("ar")
    });
    const copy = CORE_JOURNEY_COPY.ar.vault;

    expect(screen.getByText(copy.settingsTitle)).toBeTruthy();
    expect(screen.getByText(copy.settingsIntro)).toBeTruthy();
    expect(screen.getByText(copy.privacySupport)).toBeTruthy();
    expect(screen.getByText(copy.householdAccess)).toBeTruthy();
    expect(screen.getByText(copy.account)).toBeTruthy();
    expect(screen.getByText(copy.signOutSwitch)).toBeTruthy();
    expect(screen.getByText(copy.language)).toBeTruthy();
    expect(screen.queryByText(copy.backupRecovery)).toBeNull();
    expect(screen.queryByText(copy.recentProof)).toBeNull();
    expect(screen.queryByText(copy.dataPortability)).toBeNull();

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

  it("counts only proof originals that are actually present on this device", () => {
    const summary = localProofStorageSummary(
      [
        {
          localUri: "file:///local-proof.pdf",
          byteSize: 1_024
        } as NativeEvidence,
        {
          localUri: null,
          byteSize: 8_192
        } as NativeEvidence
      ],
      [
        {
          localUri: "file:///local-place-proof.pdf",
          byteSize: 2_048
        } as NativePlaceDocument,
        {
          localUri: null,
          byteSize: 16_384
        } as NativePlaceDocument
      ]
    );

    expect(summary).toEqual({
      fileCount: 2,
      byteSize: 3_072
    });
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
    expect(householdAccessSummary(2, 1, "ar")).toContain(
      "دعوة معلّقة واحدة"
    );
    expect(householdAccessSummary(2, 0, "en")).toBe(
      "2 people · no pending invitations"
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
