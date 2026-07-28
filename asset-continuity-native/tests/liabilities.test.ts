import {
  confirmNoLiabilities,
  createLiability,
  deleteLiability,
  getLiabilities,
  getLiabilityReview,
  getLiabilityTombstones,
  setLiabilityLifecycle,
  updateLiability
} from "@/domain/liabilities";
import { isNativeWorkspace } from "@/domain/model";
import { recordPortfolioValue } from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";

const NOW = "2026-07-28T10:00:00.000Z";
const context = {
  id: (prefix: string) => `id-${prefix}`,
  now: () => NOW,
  today: () => "2026-07-28"
};

describe("Liability domain", () => {
  it("keeps schema-v2 workspaces without Liabilities readable", () => {
    const workspace = createWorkspace("personal", NOW);
    const legacy = { ...workspace };
    delete (legacy as { liabilities?: unknown }).liabilities;
    expect(isNativeWorkspace(legacy)).toBe(true);
    expect(getLiabilities(legacy)).toEqual([]);
  });

  it("creates, updates, archives and restores one household Liability", () => {
    const workspace = createWorkspace("personal", NOW);
    const created = createLiability(
      workspace,
      { name: "  Home   finance  ", kind: "mortgage" },
      context
    );
    expect(created.liability).toMatchObject({
      id: "id-liability",
      name: "Home finance",
      kind: "mortgage",
      version: 1,
      lifecycleStatus: "active",
      syncStatus: "queued"
    });

    const updated = updateLiability(
      created.workspace,
      {
        liabilityId: created.liability.id,
        name: "West Bay mortgage",
        kind: "mortgage"
      },
      { ...context, now: () => "2026-07-28T11:00:00.000Z" }
    );
    expect(updated.liability).toMatchObject({
      name: "West Bay mortgage",
      version: 2
    });

    const archived = setLiabilityLifecycle(
      updated.workspace,
      {
        liabilityId: updated.liability.id,
        lifecycleStatus: "archived"
      },
      { ...context, now: () => "2026-07-28T12:00:00.000Z" }
    );
    expect(archived.liability).toMatchObject({
      lifecycleStatus: "archived",
      archivedAt: "2026-07-28T12:00:00.000Z",
      version: 3
    });

    const restored = setLiabilityLifecycle(
      archived.workspace,
      {
        liabilityId: archived.liability.id,
        lifecycleStatus: "active"
      },
      { ...context, now: () => "2026-07-28T13:00:00.000Z" }
    );
    expect(restored.liability).toMatchObject({
      lifecycleStatus: "active",
      archivedAt: null,
      version: 4
    });
  });

  it("records a 90-day no-Liability review only with no active record", () => {
    const workspace = createWorkspace("personal", NOW);
    const confirmed = confirmNoLiabilities(
      workspace,
      "2026-07-28",
      context
    );
    expect(confirmed.review).toMatchObject({
      status: "none-confirmed",
      reviewedAt: "2026-07-28",
      expiresAt: "2026-10-26",
      version: 1,
      activityWatermark: expect.any(String)
    });
    expect(getLiabilityReview(confirmed.workspace)).toEqual(
      confirmed.review
    );

    const created = createLiability(
      confirmed.workspace,
      { name: "Card", kind: "credit-card" },
      { ...context, id: () => "liability-card" }
    );
    expect(() =>
      confirmNoLiabilities(created.workspace, "2026-07-28", context)
    ).toThrow("Archive or remove active liabilities");
  });

  it("deleting a Liability removes its local balance history", () => {
    const workspace = createWorkspace("personal", NOW);
    const created = createLiability(
      workspace,
      { name: "Card", kind: "credit-card" },
      { ...context, id: () => "liability-card" }
    );
    const valued = recordPortfolioValue(
      created.workspace,
      {
        liabilityId: created.liability.id,
        amountMinor: 125_000,
        currency: "QAR",
        asOf: "2026-07-28"
      },
      {
        ...context,
        id: () => "liability-balance"
      }
    );
    const deleted = deleteLiability(
      valued.workspace,
      created.liability.id,
      "2026-07-28T14:00:00.000Z"
    );
    expect(getLiabilities(deleted.workspace)).toEqual([]);
    expect(deleted.workspace.portfolioValueRecords).toEqual([]);
    expect(getLiabilityTombstones(deleted.workspace)).toEqual([
      expect.objectContaining({
        id: created.liability.id,
        version: 2,
        deletedAt: "2026-07-28T14:00:00.000Z",
        syncStatus: "queued"
      })
    ]);
  });
});
