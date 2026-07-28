import type { SyncChange } from "@alyr/contracts";

import { applyServerChanges } from "@/data/foregroundSync";
import {
  getLiabilities,
  getLiabilityReview,
  getLiabilityTombstones
} from "@/domain/liabilities";
import { buildNetPositionSnapshot } from "@/domain/netPosition";
import { getPortfolioValueRecords } from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";

const CHANGED_AT = "2026-07-28T08:00:00.000Z";
const LIABILITY_ID = "00000000-0000-4000-8000-000000000701";
const VALUE_ID = "00000000-0000-4000-8000-000000000702";
const REVIEW_ID = "00000000-0000-4000-8000-000000000703";

function change(
  input: Omit<
    SyncChange,
    "sequence" | "householdId" | "changedAt"
  >,
  householdId: string,
  sequence: number
): SyncChange {
  return {
    ...input,
    sequence,
    householdId,
    changedAt: CHANGED_AT
  };
}

function liabilityCreate(householdId: string): SyncChange {
  return change(
    {
      entityType: "liability",
      entityId: LIABILITY_ID,
      version: 1,
      tombstoned: false,
      body: {
        operationId: "remote-liability-create",
        command: "liability.create",
        payload: {
          name: "Home finance",
          kind: "mortgage"
        },
        result: {}
      }
    },
    householdId,
    1
  );
}

function liabilityValue(householdId: string): SyncChange {
  return change(
    {
      entityType: "value",
      entityId: VALUE_ID,
      version: 1,
      tombstoned: false,
      body: {
        operationId: "remote-value-create",
        command: "value.create",
        payload: {
          liabilityId: LIABILITY_ID,
          amountMinor: 215_000_000,
          currency: "QAR",
          asOf: "2026-07-28",
          source: "user-entered"
        },
        result: {}
      }
    },
    householdId,
    2
  );
}

function liabilityReview(
  householdId: string,
  sequence: number
): SyncChange {
  return change(
    {
      entityType: "liability-review",
      entityId: REVIEW_ID,
      version: 1,
      tombstoned: false,
      body: {
        operationId: "remote-liability-review",
        command: "liability-review.set",
        payload: {
          status: "none-confirmed",
          reviewedAt: "2026-07-28",
          expiresAt: "2026-10-26"
        },
        result: {}
      }
    },
    householdId,
    sequence
  );
}

function apply(
  changes: readonly SyncChange[],
  workspace = createWorkspace(
    "personal",
    "2026-07-28T07:00:00.000Z"
  )
) {
  return applyServerChanges(workspace, changes, {
    householdId: workspace.household.id,
    conflictedEntityIds: new Set(),
    localOperationIds: new Set()
  });
}

describe("Liability foreground sync", () => {
  it("reconstructs a Liability before applying its dependent balance", () => {
    const workspace = createWorkspace(
      "personal",
      "2026-07-28T07:00:00.000Z"
    );
    const restored = apply(
      [
        liabilityCreate(workspace.household.id),
        liabilityValue(workspace.household.id)
      ],
      workspace
    );

    expect(getLiabilities(restored)).toEqual([
      expect.objectContaining({
        id: LIABILITY_ID,
        version: 1,
        syncStatus: "synced"
      })
    ]);
    expect(getPortfolioValueRecords(restored)).toEqual([
      expect.objectContaining({
        id: VALUE_ID,
        liabilityId: LIABILITY_ID,
        amountMinor: 215_000_000,
        syncStatus: "synced"
      })
    ]);
  });

  it("rejects a balance delivered before its Liability master record", () => {
    const workspace = createWorkspace(
      "personal",
      "2026-07-28T07:00:00.000Z"
    );
    expect(() =>
      apply([liabilityValue(workspace.household.id)], workspace)
    ).toThrow("unavailable Liability");
  });

  it("retains a versioned tombstone and ignores an older replay", () => {
    const workspace = createWorkspace(
      "personal",
      "2026-07-28T07:00:00.000Z"
    );
    const populated = apply(
      [
        liabilityCreate(workspace.household.id),
        liabilityValue(workspace.household.id)
      ],
      workspace
    );
    const tombstone = change(
      {
        entityType: "liability",
        entityId: LIABILITY_ID,
        version: 2,
        tombstoned: true,
        body: null
      },
      workspace.household.id,
      3
    );
    const deleted = apply([tombstone], populated);

    expect(getLiabilities(deleted)).toEqual([]);
    expect(getPortfolioValueRecords(deleted)).toEqual([]);
    expect(getLiabilityTombstones(deleted)).toEqual([
      expect.objectContaining({
        id: LIABILITY_ID,
        version: 2,
        syncStatus: "synced"
      })
    ]);

    const replayed = apply(
      [liabilityCreate(workspace.household.id)],
      deleted
    );
    expect(getLiabilities(replayed)).toEqual([]);
    expect(getLiabilityTombstones(replayed)).toHaveLength(1);
  });

  it("keeps a foreground review current only until later remote Liability activity", () => {
    const workspace = createWorkspace(
      "personal",
      "2026-07-28T07:00:00.000Z"
    );
    const reviewed = apply(
      [liabilityReview(workspace.household.id, 1)],
      workspace
    );
    expect(getLiabilityReview(reviewed)).toMatchObject({
      id: REVIEW_ID,
      activityWatermark: expect.any(String)
    });
    expect(
      buildNetPositionSnapshot(reviewed, "2026-07-28")
        .liabilityReviewInvalidated
    ).toBe(false);

    const changed = apply(
      [
        {
          ...liabilityCreate(workspace.household.id),
          sequence: 2
        },
        {
          ...liabilityValue(workspace.household.id),
          sequence: 3
        }
      ],
      reviewed
    );
    expect(
      buildNetPositionSnapshot(changed, "2026-07-28")
        .liabilityReviewInvalidated
    ).toBe(true);
  });
});
