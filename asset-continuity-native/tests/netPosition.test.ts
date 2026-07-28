import {
  confirmNoLiabilities,
  createLiability,
  deleteLiability,
  liabilityActivityWatermark,
  updateLiability,
  setLiabilityLifecycle
} from "@/domain/liabilities";
import { buildNetPositionSnapshot } from "@/domain/netPosition";
import {
  formatSignedPortfolioMoney,
  getPortfolioValueRecords
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";

describe("recorded net position", () => {
  it("subtracts current Liability balances per currency in the sample", () => {
    const workspace = createWorkspace("sample");
    const snapshot = buildNetPositionSnapshot(
      workspace,
      "2026-07-28"
    );

    expect(snapshot.status).toBe("partial");
    expect(snapshot.activeLiabilityCount).toBe(2);
    expect(snapshot.valuedLiabilityCount).toBe(2);
    expect(snapshot.byCurrency).toEqual([
      expect.objectContaining({
        currency: "QAR",
        recordedAssetsMinor: 719_750_000,
        recordedLiabilitiesMinor: 215_000_000,
        recordedNetPositionMinor: 504_750_000,
        liabilityCoverage: "recorded"
      }),
      expect.objectContaining({
        currency: "USD",
        recordedAssetsMinor: 1_370_000,
        recordedLiabilitiesMinor: 350_000,
        recordedNetPositionMinor: 1_020_000,
        liabilityCoverage: "recorded"
      })
    ]);
  });

  it("does not treat an absent Liability record as a zero balance", () => {
    const sample = createWorkspace("sample");
    const withoutLiabilities = {
      ...sample,
      liabilities: [],
      portfolioValueRecords: getPortfolioValueRecords(sample).filter(
        (record) => record.subject?.kind !== "liability"
      )
    };
    const snapshot = buildNetPositionSnapshot(
      withoutLiabilities,
      "2026-07-28"
    );
    expect(snapshot.status).toBe("liabilities-unreviewed");
    expect(snapshot.byCurrency.every((line) =>
      line.recordedNetPositionMinor === null
    )).toBe(true);
    expect(snapshot.byCurrency.every((line) =>
      line.liabilityCoverage === "unreviewed"
    )).toBe(true);
  });

  it("uses a current explicit none-confirmed review without inventing debt", () => {
    const sample = createWorkspace("sample");
    let workspace = sample;
    for (const liability of sample.liabilities ?? []) {
      workspace = setLiabilityLifecycle(
        workspace,
        {
          liabilityId: liability.id,
          lifecycleStatus: "archived"
        },
        {
          id: () => "unused",
          now: () => "2026-07-28T10:00:00.000Z"
        }
      ).workspace;
    }
    workspace = {
      ...workspace,
      portfolioValueRecords: getPortfolioValueRecords(workspace).filter(
        (record) => record.subject?.kind !== "liability"
      )
    };
    const confirmed = confirmNoLiabilities(
      workspace,
      "2026-07-28",
      {
        id: () => "review-none",
        now: () => "2026-07-28T10:00:00.000Z",
        today: () => "2026-07-28"
      }
    );
    const snapshot = buildNetPositionSnapshot(
      confirmed.workspace,
      "2026-07-28"
    );
    expect(snapshot.status).toBe("partial");
    expect(snapshot.byCurrency).toEqual([
      expect.objectContaining({
        currency: "QAR",
        recordedNetPositionMinor: 719_750_000,
        liabilityCoverage: "none-confirmed"
      }),
      expect.objectContaining({
        currency: "USD",
        recordedNetPositionMinor: 1_370_000,
        liabilityCoverage: "none-confirmed"
      })
    ]);
  });

  it("supersedes a none-confirmed review after every later Liability lifecycle mutation and reuses its cloud identity", () => {
    const context = {
      id: (prefix: string) => `id-${prefix}`,
      now: () => "2026-07-28T08:00:00.000Z",
      today: () => "2026-07-28"
    };
    const firstReview = confirmNoLiabilities(
      createWorkspace("personal"),
      "2026-07-28",
      context
    );
    expect(
      buildNetPositionSnapshot(firstReview.workspace, "2026-07-28")
        .liabilityReviewInvalidated
    ).toBe(false);

    const created = createLiability(
      firstReview.workspace,
      { name: "Home finance", kind: "mortgage" },
      { ...context, id: () => "liability-home" }
    );
    expect(
      buildNetPositionSnapshot(created.workspace, "2026-07-28")
        .liabilityReviewInvalidated
    ).toBe(true);

    const archived = setLiabilityLifecycle(
      created.workspace,
      {
        liabilityId: created.liability.id,
        lifecycleStatus: "archived"
      },
      { ...context, now: () => "2026-07-28T09:00:00.000Z" }
    );
    expect(
      buildNetPositionSnapshot(archived.workspace, "2026-07-28").status
    ).toBe("liabilities-unreviewed");

    const secondReview = confirmNoLiabilities(
      archived.workspace,
      "2026-07-28",
      { ...context, now: () => "2026-07-28T10:00:00.000Z" }
    );
    expect(secondReview.review).toMatchObject({
      id: firstReview.review.id,
      version: 2
    });
    expect(secondReview.review.activityWatermark).toBe(
      liabilityActivityWatermark(secondReview.workspace)
    );

    const updated = updateLiability(
      secondReview.workspace,
      {
        liabilityId: created.liability.id,
        name: "Updated home finance",
        kind: "mortgage"
      },
      { ...context, now: () => "2026-07-28T11:00:00.000Z" }
    );
    expect(
      buildNetPositionSnapshot(updated.workspace, "2026-07-28")
        .liabilityReviewInvalidated
    ).toBe(true);

    const thirdReview = confirmNoLiabilities(
      updated.workspace,
      "2026-07-28",
      { ...context, now: () => "2026-07-28T12:00:00.000Z" }
    );
    const restored = setLiabilityLifecycle(
      thirdReview.workspace,
      {
        liabilityId: created.liability.id,
        lifecycleStatus: "active"
      },
      { ...context, now: () => "2026-07-28T13:00:00.000Z" }
    );
    const rearchived = setLiabilityLifecycle(
      restored.workspace,
      {
        liabilityId: created.liability.id,
        lifecycleStatus: "archived"
      },
      { ...context, now: () => "2026-07-28T14:00:00.000Z" }
    );
    expect(
      buildNetPositionSnapshot(rearchived.workspace, "2026-07-28")
        .liabilityReviewInvalidated
    ).toBe(true);

    const fourthReview = confirmNoLiabilities(
      rearchived.workspace,
      "2026-07-28",
      { ...context, now: () => "2026-07-28T15:00:00.000Z" }
    );
    const deleted = deleteLiability(
      fourthReview.workspace,
      created.liability.id,
      "2026-07-28T16:00:00.000Z"
    );
    const afterDelete = buildNetPositionSnapshot(
      deleted.workspace,
      "2026-07-28"
    );
    expect(afterDelete.activeLiabilityCount).toBe(0);
    expect(afterDelete.liabilityReviewInvalidated).toBe(true);
    expect(afterDelete.status).toBe("liabilities-unreviewed");
  });

  it("supersedes a none-confirmed review when later Liability balance history appears", () => {
    const confirmed = confirmNoLiabilities(
      createWorkspace("personal"),
      "2026-07-28",
      {
        id: () => "review-none",
        now: () => "2026-07-28T08:00:00.000Z",
        today: () => "2026-07-28"
      }
    );
    const withLaterHistory = {
      ...confirmed.workspace,
      portfolioValueRecords: [
        {
          id: "historical-liability-balance",
          householdId: confirmed.workspace.household.id,
          subject: {
            kind: "liability" as const,
            liabilityId: "historical-liability"
          },
          liabilityId: "historical-liability",
          version: 1,
          amountMinor: 0,
          currency: "QAR",
          asOf: "2026-07-28",
          updatedAt: "2026-07-28T09:00:00.000Z",
          source: "user-entered" as const,
          syncStatus: "synced" as const
        }
      ]
    };

    const snapshot = buildNetPositionSnapshot(
      withLaterHistory,
      "2026-07-28"
    );
    expect(snapshot.activeLiabilityCount).toBe(0);
    expect(snapshot.liabilityReviewInvalidated).toBe(true);
    expect(snapshot.liabilityCoverageComplete).toBe(false);
    expect(snapshot.status).toBe("liabilities-unreviewed");
  });

  it("keeps currencies separate and formats a negative position exactly", () => {
    expect(formatSignedPortfolioMoney(-125_050, "QAR", "en-QA")).toBe(
      "QAR −1,250.50"
    );
  });

  it("marks a stale credit-card balance after 30 days", () => {
    const workspace = createWorkspace("sample");
    const snapshot = buildNetPositionSnapshot(
      workspace,
      "2026-09-01"
    );
    expect(snapshot.status).toBe("stale");
    expect(snapshot.staleLiabilityIds).toContain("liability-card");
  });

  it("keeps dated Asset values visible but marks them last-known after one year", () => {
    const workspace = createWorkspace("sample");
    const snapshot = buildNetPositionSnapshot(
      workspace,
      "2027-08-01"
    );
    expect(snapshot.status).toBe("stale");
    expect(snapshot.staleAssetSubjectKeys.length).toBeGreaterThan(0);
  });
});
