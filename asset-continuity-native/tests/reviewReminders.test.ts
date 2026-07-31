import type {
  NativeAsset,
  NativeEvidence,
  NativeLiability,
  NativeWorkspace
} from "@/domain/model";
import {
  DEFAULT_REVIEW_REMINDER_PREFERENCES,
  REVIEW_REMINDER_PAYLOAD,
  normalizeReviewReminderPreferences,
  selectReviewReminder,
  storedReviewCalendarDate,
  type ReviewReminderPreferences
} from "@/domain/reviewReminders";
import {
  assetValueReviewDate,
  liabilityBalanceReviewDate
} from "@/domain/netPosition";
import { createWorkspace } from "@/domain/sample";
import {
  REVIEW_REMINDER_SETTINGS_COPY,
  reviewReminderSettingsCopy
} from "@/i18n/reviewReminderCopy";

const enabledPreferences: ReviewReminderPreferences = {
  version: 1,
  enabled: true,
  localHour: 9,
  localMinute: 0
};

function personalWorkspace(): NativeWorkspace {
  return createWorkspace(
    "personal",
    "2026-01-01T09:00:00.000Z",
    {
      householdId: "household-private",
      ownerMemberId: "member-private",
      deviceId: "device-private"
    }
  );
}

function asset(
  workspace: NativeWorkspace,
  overrides: Partial<NativeAsset> = {}
): NativeAsset {
  return {
    id: "asset-private",
    version: 1,
    householdId: workspace.household.id,
    name: "Sensitive heirloom name",
    categoryId: "home.other",
    categoryLabel: "Personal item",
    visualKind: "heirloom",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: null,
    photoEvidenceId: null,
    locationStatus: "unknown",
    placeId: null,
    roomId: null,
    locatorText: "Hidden cabinet location",
    evidenceIds: [],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "synced",
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z",
    ...overrides
  };
}

function evidence(
  workspace: NativeWorkspace,
  assetId: string,
  expiresAt: string
): NativeEvidence {
  return {
    id: "evidence-private",
    version: 1,
    versionId: "evidence-version-private",
    blobObjectId: "blob-private",
    householdId: workspace.household.id,
    assetId,
    kind: "record",
    relation: "ownership",
    fileName: "secret-policy-number.pdf",
    mimeType: "application/pdf",
    byteSize: 1200,
    localUri: null,
    checksumSha256: null,
    reviewStatus: "reviewed",
    reviewedAt: "2026-01-01T09:00:00.000Z",
    expiresAt,
    storageState: "synced",
    capturedAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z"
  };
}

function liability(
  workspace: NativeWorkspace
): NativeLiability {
  return {
    id: "liability-private",
    householdId: workspace.household.id,
    version: 1,
    name: "Sensitive lender name",
    kind: "credit-card",
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "synced",
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z"
  };
}

describe("private review reminder selection", () => {
  it("returns no reminder when preferences are off or there is no review date", () => {
    const workspace = personalWorkspace();

    expect(
      selectReviewReminder({
        workspace,
        runtime: "supabase",
        preferences: DEFAULT_REVIEW_REMINDER_PREFERENCES
      })
    ).toBeNull();
    expect(
      selectReviewReminder({
        workspace,
        runtime: "supabase",
        preferences: enabledPreferences
      })
    ).toBeNull();
  });

  it("selects the earliest date across proof, Asset values and Liability balances", () => {
    const base = personalWorkspace();
    const privateAsset = asset(base, {
      evidenceIds: ["evidence-private"]
    });
    const privateLiability = liability(base);
    const workspace: NativeWorkspace = {
      ...base,
      assets: [privateAsset],
      evidence: [
        evidence(
          base,
          privateAsset.id,
          "2026-10-01T23:30:00-04:00"
        )
      ],
      liabilities: [privateLiability],
      portfolioValueRecords: [
        {
          id: "value-asset",
          householdId: base.household.id,
          subject: {
            kind: "asset" as const,
            assetId: privateAsset.id
          },
          assetId: privateAsset.id,
          version: 1,
          amountMinor: 88_000_000,
          currency: "QAR",
          asOf: "2025-01-01",
          updatedAt: "2026-01-01T09:00:00.000Z",
          source: "user-entered" as const,
          syncStatus: "synced" as const
        },
        {
          id: "value-liability",
          householdId: base.household.id,
          subject: {
            kind: "liability" as const,
            liabilityId: privateLiability.id
          },
          liabilityId: privateLiability.id,
          version: 1,
          amountMinor: 315_099,
          currency: "QAR",
          asOf: "2026-04-15",
          updatedAt: "2026-04-15T09:00:00.000Z",
          source: "user-entered" as const,
          syncStatus: "synced" as const
        }
      ]
    };

    expect(
      selectReviewReminder({
        workspace,
        runtime: "supabase",
        preferences: enabledPreferences
      })
    ).toEqual({
      notificationId: "alyr-private-review",
      reviewDate: "2026-01-01",
      calendarTrigger: {
        kind: "local-calendar",
        date: "2026-01-01",
        hour: 9,
        minute: 0
      },
      payload: {
        title: "Heldat",
        body: "Open Heldat for a private review.",
        data: { kind: "review" }
      }
    });
  });

  it.each([
    {
      label: "proof expiry",
      evidenceExpiry: "2026-02-01",
      assetAsOf: "2025-06-01",
      liabilityAsOf: "2026-05-01",
      expected: "2026-02-01"
    },
    {
      label: "Liability balance review",
      evidenceExpiry: "2026-10-01",
      assetAsOf: "2025-09-01",
      liabilityAsOf: "2026-01-01",
      expected: "2026-01-31"
    }
  ])("lets $label win when it is earliest", ({
    evidenceExpiry,
    assetAsOf,
    liabilityAsOf,
    expected
  }) => {
    const base = personalWorkspace();
    const privateAsset = asset(base, {
      evidenceIds: ["evidence-private"]
    });
    const privateLiability = liability(base);
    const selection = selectReviewReminder({
      workspace: {
        ...base,
        assets: [privateAsset],
        evidence: [
          evidence(base, privateAsset.id, evidenceExpiry)
        ],
        liabilities: [privateLiability],
        portfolioValueRecords: [
          {
            id: "value-asset",
            householdId: base.household.id,
            subject: {
              kind: "asset" as const,
              assetId: privateAsset.id
            },
            assetId: privateAsset.id,
            version: 1,
            amountMinor: 88_000_000,
            currency: "QAR",
            asOf: assetAsOf,
            updatedAt: "2026-01-01T09:00:00.000Z",
            source: "user-entered" as const,
            syncStatus: "synced" as const
          },
          {
            id: "value-liability",
            householdId: base.household.id,
            subject: {
              kind: "liability" as const,
              liabilityId: privateLiability.id
            },
            liabilityId: privateLiability.id,
            version: 1,
            amountMinor: 315_099,
            currency: "QAR",
            asOf: liabilityAsOf,
            updatedAt: "2026-01-01T09:00:00.000Z",
            source: "user-entered" as const,
            syncStatus: "synced" as const
          }
        ]
      },
      runtime: "supabase",
      preferences: enabledPreferences
    });

    expect(selection?.reviewDate).toBe(expected);
    expect(selection?.calendarTrigger.date).toBe(expected);
  });

  it("keeps stored calendar dates and local trigger components stable across DST boundaries", () => {
    expect(
      storedReviewCalendarDate("2026-11-01T23:30:00-05:00")
    ).toBe("2026-11-01");
    expect(
      storedReviewCalendarDate("2026-03-08T00:30:00-08:00")
    ).toBe("2026-03-08");
    expect(assetValueReviewDate("2025-03-09")).toBe("2026-03-09");
    expect(
      liabilityBalanceReviewDate("2026-03-08", "credit-card")
    ).toBe("2026-04-07");

    const base = personalWorkspace();
    const privateAsset = asset(base, {
      evidenceIds: ["evidence-private"]
    });
    const selection = selectReviewReminder({
      workspace: {
        ...base,
        assets: [privateAsset],
        evidence: [
          evidence(
            base,
            privateAsset.id,
            "2026-11-01T23:30:00-05:00"
          )
        ]
      },
      runtime: "supabase",
      preferences: {
        ...enabledPreferences,
        localHour: 8,
        localMinute: 45
      }
    });
    const stored = JSON.parse(JSON.stringify(selection)) as typeof selection;

    expect(stored?.reviewDate).toBe("2026-11-01");
    expect(stored?.calendarTrigger).toEqual({
      kind: "local-calendar",
      date: "2026-11-01",
      hour: 8,
      minute: 45
    });
    expect(stored).not.toHaveProperty("scheduledAt");
  });

  it("excludes sample and personal preview workspaces", () => {
    expect(
      selectReviewReminder({
        workspace: createWorkspace("sample"),
        runtime: "supabase",
        preferences: enabledPreferences
      })
    ).toBeNull();

    const base = personalWorkspace();
    const privateAsset = asset(base, {
      evidenceIds: ["evidence-private"]
    });
    expect(
      selectReviewReminder({
        workspace: {
          ...base,
          assets: [privateAsset],
          evidence: [
            evidence(base, privateAsset.id, "2026-10-01")
          ]
        },
        runtime: "preview",
        preferences: enabledPreferences
      })
    ).toBeNull();
    expect(
      selectReviewReminder({
        workspace: {
          ...base,
          assets: [privateAsset],
          evidence: [
            evidence(base, privateAsset.id, "2026-10-01")
          ]
        },
        runtime: "unavailable",
        preferences: enabledPreferences
      })
    ).toBeNull();
  });

  it("emits only the fixed generic payload and no sensitive record copy", () => {
    const base = personalWorkspace();
    const privateAsset = asset(base, {
      evidenceIds: ["evidence-private"]
    });
    const workspace = {
      ...base,
      household: {
        ...base.household,
        name: "Private family name"
      },
      assets: [privateAsset],
      evidence: [
        evidence(base, privateAsset.id, "2026-10-01")
      ]
    };
    const selection = selectReviewReminder({
      workspace,
      runtime: "supabase",
      preferences: enabledPreferences
    });
    const serializedPayload = JSON.stringify(selection?.payload);
    const serializedSelection = JSON.stringify(selection);

    expect(selection?.payload).toBe(REVIEW_REMINDER_PAYLOAD);
    expect(Object.keys(selection?.payload ?? {})).toEqual([
      "title",
      "body",
      "data"
    ]);
    expect(Object.keys(selection?.payload.data ?? {})).toEqual([
      "kind"
    ]);
    for (const sensitive of [
      "Private family name",
      "Sensitive heirloom name",
      "Hidden cabinet location",
      "secret-policy-number.pdf",
      "QAR",
      "88000000"
    ]) {
      expect(serializedPayload).not.toContain(sensitive);
      expect(serializedSelection).not.toContain(sensitive);
    }
  });

  it("fails corrupt stored preferences closed and provides complete English and Arabic settings copy", () => {
    expect(
      normalizeReviewReminderPreferences({
        version: 1,
        enabled: true,
        localHour: 25,
        localMinute: 0
      })
    ).toBe(DEFAULT_REVIEW_REMINDER_PREFERENCES);
    expect(
      normalizeReviewReminderPreferences({
        version: 1,
        enabled: true,
        localHour: 20,
        localMinute: 30
      })
    ).toEqual({
      version: 1,
      enabled: true,
      localHour: 20,
      localMinute: 30
    });

    expect(reviewReminderSettingsCopy("en")).toBe(
      REVIEW_REMINDER_SETTINGS_COPY.en
    );
    expect(reviewReminderSettingsCopy("ar")).toBe(
      REVIEW_REMINDER_SETTINGS_COPY.ar
    );
    expect(REVIEW_REMINDER_SETTINGS_COPY.en.toggleHint).toContain(
      "Names, values and locations stay out"
    );
    expect(REVIEW_REMINDER_SETTINGS_COPY.ar.toggleHint).toContain(
      "الأسماء"
    );
    expect(REVIEW_REMINDER_SETTINGS_COPY.ar.localTime).toContain(
      "٩:٠٠"
    );
  });
});
