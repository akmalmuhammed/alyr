import assert from "node:assert/strict";
import test from "node:test";

import { createSampleWorkspace } from "../src/domain.js";
import {
  FIRST_USEFUL_VAULT_RECORD_TARGET,
  selectFirstUsefulVaultProgress,
} from "../src/firstUsefulVault.js";

function emptyWorkspace() {
  const sample = createSampleWorkspace();
  return {
    ...sample,
    mode: "personal",
    places: [],
    spaces: [],
    assets: [],
    locationAssignments: [],
    evidence: [],
    tasks: [],
    activity: [],
  };
}

test("an empty vault leads with one concrete place action", () => {
  const result = selectFirstUsefulVaultProgress(emptyWorkspace());
  assert.equal(result.complete, false);
  assert.equal(result.percent, 0);
  assert.equal(result.nextStep.id, "place");
  assert.deepEqual(result.nextStep.action, {
    type: "capture-place",
  });
  assert.equal(result.steps.length, 5);
});

test("progress counts real records and chooses the best incomplete passport", () => {
  const sample = createSampleWorkspace();
  const assets = sample.assets
    .filter((asset) => asset.lifecycleStatus !== "archived")
    .slice(0, FIRST_USEFUL_VAULT_RECORD_TARGET);
  const workspace = {
    ...sample,
    mode: "personal",
    assets,
    evidence: sample.evidence.map((evidence) => ({
      ...evidence,
      status: "pending",
      verifiedAt: null,
      verifiedByMemberId: null,
    })),
    activity: [],
  };
  const result = selectFirstUsefulVaultProgress(workspace);
  assert.equal(
    result.steps.find((step) => step.id === "place").complete,
    true,
  );
  assert.equal(
    result.steps.find((step) => step.id === "records").complete,
    true,
  );
  assert.equal(
    result.steps.find((step) => step.id === "proof").complete,
    false,
  );
  assert.ok(["passport", "proof"].includes(result.nextStep.id));
  if (result.nextStep.id === "passport") {
    assert.equal(result.nextStep.action.type, "asset");
    assert.ok(
      assets.some(
        (asset) => asset.id === result.nextStep.action.assetId,
      ),
    );
  }
});

test("all five outcomes complete only after a successful retrieval", () => {
  const sample = createSampleWorkspace();
  const activeAssets = sample.assets.filter(
    (asset) => asset.lifecycleStatus !== "archived",
  );
  const workspace = {
    ...sample,
    mode: "personal",
    assets: activeAssets,
    evidence: sample.evidence.map((evidence, index) => ({
      ...evidence,
      status: index === 0 ? "verified" : evidence.status,
      verifiedAt:
        index === 0
          ? "2026-07-25T10:00:00.000Z"
          : evidence.verifiedAt,
      verifiedByMemberId:
        index === 0
          ? sample.household.ownerMemberId
          : evidence.verifiedByMemberId,
    })),
    activity: [
      ...sample.activity,
      {
        id: "retrieval-1",
        type: "search-retrieval",
        title: "Found GMT Master II",
        entityType: "asset",
        entityId: "gmt-master-ii",
        occurredAt: "2026-07-25T10:05:00.000Z",
      },
    ],
  };
  const result = selectFirstUsefulVaultProgress(workspace);
  const retrieval = result.steps.find(
    (step) => step.id === "retrieval",
  );
  assert.equal(retrieval.complete, true);
  assert.equal(result.completedCount >= 4, true);
  assert.equal(
    result.complete,
    result.steps.every((step) => step.complete),
  );
});

