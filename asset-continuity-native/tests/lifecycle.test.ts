import type { NativeWorkspace } from "@/domain/model";
import {
  assetLifecycleStatus,
  isAssetActive
} from "@/domain/model";
import {
  buildPortfolioSnapshot,
  recordPortfolioValue,
  getPortfolioValueRecords
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import {
  setAssetLifecycle,
  setEvidenceReviewStatus,
  updateAsset
} from "@/domain/workspace";
import {
  createAssetLifecycleOperation,
  createEvidenceReviewOperation
} from "@/state/WorkspaceProvider";

function context(time = "2026-07-27T12:00:00.000Z") {
  let sequence = 0;
  return {
    now: () => time,
    id: (prefix: string) => `${prefix}-${++sequence}`
  };
}

function personalSample(): NativeWorkspace {
  return {
    ...createWorkspace("sample"),
    mode: "personal",
    portfolioValueRecords: []
  };
}

describe("asset and evidence lifecycle", () => {
  it("archives without deleting location, evidence or value history", () => {
    const workspace = personalSample();
    const asset = workspace.assets[0]!;
    const valued = recordPortfolioValue(
      workspace,
      {
        assetId: asset.id,
        amountMinor: 25_000,
        currency: "QAR",
        asOf: "2026-07-27"
      },
      context()
    ).workspace;
    const result = setAssetLifecycle(
      valued,
      {
        assetId: asset.id,
        lifecycleStatus: "archived"
      },
      context("2026-07-27T13:00:00.000Z")
    );

    expect(result.asset).toMatchObject({
      lifecycleStatus: "archived",
      archivedAt: "2026-07-27T13:00:00.000Z",
      version: 2,
      placeId: asset.placeId,
      evidenceIds: asset.evidenceIds
    });
    expect(isAssetActive(result.asset)).toBe(false);
    expect(result.workspace.assets).toHaveLength(workspace.assets.length);
    expect(result.workspace.evidence).toEqual(workspace.evidence);
    expect(getPortfolioValueRecords(result.workspace)).toHaveLength(1);
    expect(result.workspace.activity[0]?.type).toBe("asset_archived");
    expect(buildPortfolioSnapshot(result.workspace).assetCount).toBe(
      workspace.assets.filter(isAssetActive).length - 1
    );
  });

  it("restores the same Passport and records a reversible lifecycle command", () => {
    const workspace = personalSample();
    const archived = setAssetLifecycle(
      workspace,
      {
        assetId: workspace.assets[0]!.id,
        lifecycleStatus: "archived"
      },
      context()
    );
    const restored = setAssetLifecycle(
      archived.workspace,
      {
        assetId: archived.asset.id,
        lifecycleStatus: "active"
      },
      context("2026-07-27T14:00:00.000Z")
    );
    const operation = createAssetLifecycleOperation(
      archived.workspace,
      restored,
      restored.asset.updatedAt,
      {
        operationId: () => "operation-restore",
        idempotencyKey: () => "idempotency-restore"
      }
    );

    expect(assetLifecycleStatus(restored.asset)).toBe("active");
    expect(restored.asset.archivedAt).toBeNull();
    expect(restored.asset.version).toBe(3);
    expect(restored.workspace.activity[0]?.type).toBe("asset_restored");
    expect(operation.command).toMatchObject({
      type: "asset.restore",
      aggregateId: restored.asset.id,
      observedVersion: archived.asset.version,
      payload: {
        lifecycleStatus: "active",
        archivedAt: null
      }
    });
  });

  it("prevents active-record edits until an archived Passport is restored", () => {
    const workspace = personalSample();
    const asset = workspace.assets[0]!;
    const archived = setAssetLifecycle(
      workspace,
      { assetId: asset.id, lifecycleStatus: "archived" },
      context()
    ).workspace;

    expect(() =>
      updateAsset(
        archived,
        {
          assetId: asset.id,
          identity: {
            name: "Changed while archived",
            categoryId: asset.categoryId,
            categoryLabel: asset.categoryLabel
          }
        },
        context()
      )
    ).toThrow("Restore this Asset Passport");
  });

  it("reviews evidence metadata, retains the file and can return it to review", () => {
    const workspace = personalSample();
    const pending = workspace.evidence.find(
      (item) => item.reviewStatus === "pending"
    )!;
    const reviewed = setEvidenceReviewStatus(
      workspace,
      {
        evidenceId: pending.id,
        reviewStatus: "reviewed"
      },
      context()
    );
    const reopened = setEvidenceReviewStatus(
      reviewed.workspace,
      {
        evidenceId: pending.id,
        reviewStatus: "pending"
      },
      context("2026-07-27T13:00:00.000Z")
    );

    expect(reviewed.evidence).toMatchObject({
      reviewStatus: "reviewed",
      reviewedAt: "2026-07-27T12:00:00.000Z",
      version: 2,
      fileName: pending.fileName,
      checksumSha256: pending.checksumSha256
    });
    expect(reviewed.workspace.activity[0]?.type).toBe("evidence_reviewed");
    expect(reopened.evidence).toMatchObject({
      reviewStatus: "pending",
      reviewedAt: null,
      version: 3
    });
    expect(reopened.workspace.activity[0]?.type).toBe("evidence_reopened");
  });

  it("creates a version-aware evidence.review operation", () => {
    const workspace = personalSample();
    const pending = workspace.evidence.find(
      (item) => item.reviewStatus === "pending"
    )!;
    const result = setEvidenceReviewStatus(
      workspace,
      {
        evidenceId: pending.id,
        reviewStatus: "reviewed"
      },
      context()
    );
    const operation = createEvidenceReviewOperation(
      workspace,
      result,
      result.evidence.updatedAt,
      {
        operationId: () => "operation-review",
        idempotencyKey: () => "idempotency-review"
      }
    );

    expect(operation.command).toMatchObject({
      type: "evidence.review",
      aggregateId: pending.id,
      observedVersion: pending.version,
      payload: {
        reviewStatus: "reviewed",
        reviewedAt: "2026-07-27T12:00:00.000Z"
      }
    });
  });

  it("rejects incomplete evidence metadata instead of claiming review", () => {
    const workspace = personalSample();
    const pending = workspace.evidence.find(
      (item) => item.reviewStatus === "pending"
    )!;
    const invalid: NativeWorkspace = {
      ...workspace,
      evidence: workspace.evidence.map((item) =>
        item.id === pending.id ? { ...item, byteSize: 0 } : item
      )
    };

    expect(() =>
      setEvidenceReviewStatus(
        invalid,
        {
          evidenceId: pending.id,
          reviewStatus: "reviewed"
        },
        context()
      )
    ).toThrow("exact stored size");
  });
});
