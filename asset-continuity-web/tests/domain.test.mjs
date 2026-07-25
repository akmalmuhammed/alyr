import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGACY_STORAGE_KEYS,
  SNAPSHOT_VERSION,
  STORAGE_KEY,
  createSampleWorkspace,
  normalizeWorkspace,
  searchWorkspace,
  selectAssetLocationHistory,
  selectAssetReadiness,
  selectSpacePath,
  selectEvidenceRequirementSatisfaction,
  selectNextAction,
  selectPlaceSummary,
  selectPortfolioSummary,
  selectWorkspaceActorMemberId,
  workspaceReducer,
} from "../src/domain.js";

const NOW = "2026-07-24T12:00:00.000Z";
const SHA256_A = "a".repeat(64);
const SHA256_B = "b".repeat(64);
const ORIGINAL_VERSION_A = `ov_${"a".repeat(64)}`;
const ORIGINAL_VERSION_B = `ov_${"b".repeat(64)}`;

test("sample snapshot is versioned, serializable, and derives portfolio counts", () => {
  const state = createSampleWorkspace();
  const summary = selectPortfolioSummary(state);

  assert.equal(state.version, SNAPSHOT_VERSION);
  assert.equal(STORAGE_KEY, "alyr.asset-continuity.demo");
  assert.ok(LEGACY_STORAGE_KEYS.some((key) => /\.v1$/.test(key)));
  assert.equal(state.mode, "sample");
  assert.equal(state.household.demoOnly, true);
  assert.equal(state.regions.length, 3);
  assert.equal(state.activity.length, 3);
  assert.deepEqual(state.assets[0].value, {
    amountMinor: 4_600_000,
    currency: "QAR",
  });
  assert.deepEqual(state.assets[0].requiredProofTypes, ["Service record"]);
  assert.match(state.privacyNotice, /does not provide encryption/i);
  assert.doesNotThrow(() => JSON.stringify(state));

  assert.equal(summary.assetCount, 17);
  assert.equal(summary.placeCount, 4);
  assert.equal(summary.unknownLocationCount, 2);
  assert.equal(summary.needsLocationDetailCount, 2);
  assert.equal(summary.locatedAssetCount, 15);
  assert.ok(summary.readiness >= 60 && summary.readiness <= 100);
  assert.equal(summary.readiness, 66);
  assert.equal(summary.firstUsefulVault.complete, true);

  assert.equal(selectPlaceSummary(state, "west-bay-home").assetCount, 4);
  assert.equal(
    selectPlaceSummary(state, "pearl-apartment-place").assetCount,
    1,
  );
  assert.equal(selectPlaceSummary(state, "family-archive").assetCount, 5);
  assert.equal(selectPlaceSummary(state, "dubai-storage").assetCount, 3);
  assert.equal(selectPlaceSummary(state, "missing"), null);
});

test("pending proof does not satisfy a requirement and verification is idempotent", () => {
  const base = createSampleWorkspace();
  const withPending = workspaceReducer(base, {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "evidence-gmt-service-new",
      assetId: "gmt-master-ii",
      type: "Service record",
      status: "verified",
      fileName: "service-demo.pdf",
      fileType: "application/pdf",
      fileSize: 128,
      fileChecksum: SHA256_A,
      fileState: "ready_local",
    },
    now: NOW,
  });

  const pending = withPending.evidence.find(
    (item) => item.id === "evidence-gmt-service-new",
  );
  assert.equal(pending.status, "pending");
  assert.equal(pending.verifiedAt, null);
  assert.equal(
    selectEvidenceRequirementSatisfaction("gmt-master-ii", withPending)
      .complete,
    false,
  );

  const blockedWithoutIntegrity = workspaceReducer(withPending, {
    type: "VERIFY_EVIDENCE",
    evidenceId: "evidence-gmt-service-new",
    integrityVerified: true,
    now: "2026-07-24T12:04:00.000Z",
  });
  assert.equal(
    blockedWithoutIntegrity.evidence.find(
      (item) => item.id === "evidence-gmt-service-new",
    ).status,
    "pending",
  );

  const verified = workspaceReducer(blockedWithoutIntegrity, {
    type: "VERIFY_EVIDENCE",
    evidenceId: "evidence-gmt-service-new",
    integrityVerified: true,
    integrityChecksum: SHA256_A,
    now: "2026-07-24T12:05:00.000Z",
  });
  assert.equal(
    verified.evidence.find(
      (item) => item.id === "evidence-gmt-service-new",
    ).status,
    "verified",
  );
  assert.equal(
    selectEvidenceRequirementSatisfaction("gmt-master-ii", verified).complete,
    true,
  );
  assert.equal(
    verified.tasks.find((item) => item.id === "task-gmt-service").status,
    "completed",
  );
  assert.ok(
    selectAssetReadiness("gmt-master-ii", verified).percent >
      selectAssetReadiness("gmt-master-ii", withPending).percent,
  );

  const verifiedAgain = workspaceReducer(verified, {
    type: "VERIFY_EVIDENCE",
    evidenceId: "evidence-gmt-service-new",
    now: "2026-07-24T12:10:00.000Z",
  });
  assert.strictEqual(verifiedAgain, verified);
});

test("evidence review attributes the active workspace member and only falls back for local use", () => {
  const base = createSampleWorkspace();
  const withPending = workspaceReducer(base, {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "evidence-actor-review",
      assetId: "gmt-master-ii",
      type: "Family review note",
      kind: "note",
      relation: "supports",
      note: "Reviewed directly in the workspace.",
    },
    now: NOW,
  });
  const review = (state, memberId) =>
    workspaceReducer(state, {
      type: "VERIFY_EVIDENCE",
      evidenceId: "evidence-actor-review",
      ...(memberId === undefined ? {} : { memberId }),
      now: "2026-07-24T12:05:00.000Z",
    });
  const reviewedBy = (state) =>
    state.evidence.find((item) => item.id === "evidence-actor-review")
      .verifiedByMemberId;

  assert.equal(
    selectWorkspaceActorMemberId(withPending, {
      accountId: "member-akmal",
      householdId: "household-al-hamad-demo",
    }),
    "member-akmal",
  );
  assert.equal(
    selectWorkspaceActorMemberId(withPending, {
      accountId: "member-sara",
      householdId: "household-al-hamad-demo",
    }),
    "member-sara",
  );
  assert.equal(
    selectWorkspaceActorMemberId(withPending, {
      accountId: "member-outsider",
      householdId: "household-al-hamad-demo",
    }),
    null,
  );
  assert.equal(
    selectWorkspaceActorMemberId(withPending, {
      accountId: "member-sara",
      householdId: "household-other",
    }),
    null,
  );
  assert.equal(selectWorkspaceActorMemberId(withPending, null), "member-akmal");

  assert.equal(reviewedBy(review(withPending, "member-akmal")), "member-akmal");
  assert.equal(reviewedBy(review(withPending, "member-sara")), "member-sara");

  const rejected = review(withPending, "member-outsider");
  assert.strictEqual(rejected, withPending);
  assert.equal(
    rejected.evidence.find((item) => item.id === "evidence-actor-review")
      .status,
    "pending",
  );
  assert.strictEqual(review(withPending, null), withPending);

  const withRevokedActor = normalizeWorkspace({
    ...withPending,
    members: withPending.members.map((member) =>
      member.id === "member-sara"
        ? { ...member, inviteStatus: "revoked" }
        : member,
    ),
  });
  assert.equal(
    selectWorkspaceActorMemberId(withRevokedActor, {
      accountId: "member-sara",
      householdId: "household-al-hamad-demo",
    }),
    null,
  );
  assert.strictEqual(review(withRevokedActor, "member-sara"), withRevokedActor);

  assert.equal(reviewedBy(review(withPending, undefined)), "member-akmal");
});

test("asset creation records the active non-owner actor without changing ownership", () => {
  const base = createSampleWorkspace();
  const created = workspaceReducer(base, {
    type: "ADD_ASSET",
    memberId: "member-sara",
    asset: {
      id: "room-capture-by-sara",
      name: "Study inventory",
      category: "Room inventory session",
      categoryId: "custom.other",
      kind: "physical",
      placeId: "west-bay-home",
      spaceId: "study",
      locationMode: "physical",
      locationStatus: "known",
      locationDetail: "Study",
    },
    now: NOW,
  });
  const asset = created.assets.find(
    (item) => item.id === "room-capture-by-sara",
  );
  const assignment = created.locationAssignments.find(
    (item) => item.assetId === asset?.id && !item.validTo,
  );

  assert.equal(asset.ownerMemberId, "member-akmal");
  assert.equal(assignment.createdByMemberId, "member-sara");
  assert.strictEqual(
    workspaceReducer(base, {
      type: "ADD_ASSET",
      memberId: "member-outsider",
      asset: {
        id: "room-capture-by-outsider",
        name: "Blocked inventory",
      },
      now: NOW,
    }),
    base,
  );
});

test("new material snapshots its active placement context without following later moves", () => {
  const base = createSampleWorkspace();
  const materialKinds = [
    {
      kind: "paper",
      type: "Placement document",
      source: {
        fileName: "paper.pdf",
        fileType: "application/pdf",
        fileSize: 128,
        fileChecksum: SHA256_A,
        fileState: "ready_local",
      },
    },
    {
      kind: "media",
      type: "Placement photo",
      source: {
        fileName: "media.jpg",
        fileType: "image/jpeg",
        fileSize: 129,
        fileChecksum: SHA256_A,
        fileState: "ready_local",
      },
    },
    {
      kind: "artifact",
      type: "Placement artifact",
      source: { physicalLocation: "Archive box 2" },
    },
    {
      kind: "note",
      type: "Placement story",
      source: { note: "Recorded beside the watch roll." },
    },
    {
      kind: "link",
      type: "Placement reference",
      source: { linkUrl: "https://example.test/watch" },
    },
    {
      kind: "record",
      type: "Placement record",
      source: { note: "Structured service context." },
    },
  ];
  const withMaterials = materialKinds.reduce(
    (state, { kind, type, source }) =>
      workspaceReducer(state, {
        type: "ADD_EVIDENCE",
        evidence: {
          id: `placement-context-${kind}`,
          assetId: "gmt-master-ii",
          type,
          kind,
          ...source,
        },
        now: NOW,
      }),
    base,
  );

  const capturedContexts = new Map();
  for (const { kind } of materialKinds) {
    const evidence = withMaterials.evidence.find(
      (item) => item.id === `placement-context-${kind}`,
    );
    assert.ok(evidence);
    assert.equal(
      evidence.placementContext.assignmentId,
      "location-gmt-master-ii-initial",
    );
    assert.equal(evidence.placementContext.mode, "physical");
    assert.equal(evidence.placementContext.placeSnapshot.name, "West Bay Home");
    assert.deepEqual(evidence.placementContext.placeSnapshot.coordinates, {
      lat: 25.3295,
      lng: 51.5309,
    });
    assert.deepEqual(
      evidence.placementContext.spacePathSnapshot.map((item) => item.name),
      ["Study", "Study safe"],
    );
    assert.equal(evidence.placementContext.locatorText, "Watch roll");
    assert.equal(evidence.placementContext.recordedAt, NOW);
    capturedContexts.set(
      evidence.id,
      structuredClone(evidence.placementContext),
    );
  }

  const moved = workspaceReducer(withMaterials, {
    type: "MOVE_ASSET",
    assetId: "gmt-master-ii",
    placeId: "dubai-storage",
    spaceId: "storage-vault",
    locationStatus: "known",
    locationMode: "physical",
    locationDetail: "Shelf B",
    now: "2026-07-25T09:00:00.000Z",
  });
  for (const [evidenceId, capturedContext] of capturedContexts) {
    assert.deepEqual(
      moved.evidence.find((item) => item.id === evidenceId).placementContext,
      capturedContext,
    );
  }

  const restored = normalizeWorkspace(JSON.parse(JSON.stringify(moved)));
  for (const [evidenceId, capturedContext] of capturedContexts) {
    assert.deepEqual(
      restored.evidence.find((item) => item.id === evidenceId).placementContext,
      capturedContext,
    );
  }
});

test("material storage is independent, migrates legacy clues, and appends actor-attributed corrections", () => {
  const base = createSampleWorkspace();
  const legacyInput = structuredClone(base);
  const legacyArtifact = legacyInput.evidence[0];
  legacyArtifact.physicalLocation = "Old blue archive box";
  delete legacyArtifact.materialStorage;
  const migrated = normalizeWorkspace(legacyInput);
  const migratedArtifact = migrated.evidence.find(
    (item) => item.id === legacyArtifact.id,
  );

  assert.equal(migratedArtifact.materialStorage.status, "needs_detail");
  assert.equal(
    migratedArtifact.materialStorage.locatorText,
    "Old blue archive box",
  );
  assert.equal(migratedArtifact.materialStorage.history.length, 1);
  assert.equal(
    migratedArtifact.materialStorage.history[0].reason,
    "Migrated legacy storage clue",
  );

  const withMaterial = workspaceReducer(base, {
    type: "ADD_EVIDENCE",
    memberId: "member-sara",
    evidence: {
      id: "material-storage-contract",
      assetId: "gmt-master-ii",
      type: "Original warranty card",
      kind: "artifact",
      materialStorage: {
        status: "known",
        placeId: "west-bay-home",
        spaceId: "study-safe",
        locatorText: "Document wallet A",
      },
    },
    now: NOW,
  });
  const initial = withMaterial.evidence.find(
    (item) => item.id === "material-storage-contract",
  );
  const initialEvent = structuredClone(initial.materialStorage.history[0]);
  assert.equal(initial.materialStorage.status, "known");
  assert.equal(initial.materialStorage.placeId, "west-bay-home");
  assert.deepEqual(
    initial.materialStorage.spacePathSnapshot.map((item) => item.name),
    ["Study", "Study safe"],
  );
  assert.equal(initial.materialStorage.movedByMemberId, "member-sara");
  assert.notEqual(
    initial.materialStorage.currentEventId,
    initial.placementContext.assignmentId,
  );

  const corrected = workspaceReducer(withMaterial, {
    type: "MOVE_MATERIAL_STORAGE",
    evidenceId: initial.id,
    memberId: "member-sara",
    status: "external_custodian",
    custodianMemberId: "member-akmal",
    externalLabel: "Family lawyer",
    locatorText: "Estate file",
    reason: "Transferred for estate review",
    now: "2026-07-25T10:00:00.000Z",
  });
  const current = corrected.evidence.find(
    (item) => item.id === initial.id,
  );
  assert.equal(current.materialStorage.status, "external_custodian");
  assert.equal(
    current.materialStorage.custodianMemberId,
    "member-akmal",
  );
  assert.equal(current.materialStorage.externalLabel, "Family lawyer");
  assert.equal(current.materialStorage.placeId, null);
  assert.equal(current.materialStorage.history.length, 2);
  assert.deepEqual(current.materialStorage.history[0], initialEvent);
  assert.equal(
    current.materialStorage.history[1].movedByMemberId,
    "member-sara",
  );
  assert.equal(
    current.materialStorage.history[1].reason,
    "Transferred for estate review",
  );
  assert.deepEqual(
    normalizeWorkspace(JSON.parse(JSON.stringify(corrected))).evidence.find(
      (item) => item.id === initial.id,
    ).materialStorage,
    current.materialStorage,
  );
  assert.strictEqual(
    workspaceReducer(corrected, {
      type: "MOVE_MATERIAL_STORAGE",
      evidenceId: initial.id,
      memberId: "member-outsider",
      status: "unknown",
      reason: "Untrusted correction",
      now: "2026-07-25T10:05:00.000Z",
    }),
    corrected,
  );
});

test("asset, Place, and nested-space corrections attribute the active command actor", () => {
  const base = createSampleWorkspace();
  const moved = workspaceReducer(base, {
    type: "MOVE_ASSET",
    assetId: "gmt-master-ii",
    memberId: "member-sara",
    placeId: "dubai-storage",
    spaceId: "storage-vault",
    locationStatus: "known",
    locationDetail: "Shelf C",
    reason: "Sara moved the watch",
    now: "2026-07-25T11:00:00.000Z",
  });
  assert.equal(
    moved.locationAssignments.find(
      (item) => item.assetId === "gmt-master-ii" && !item.validTo,
    ).createdByMemberId,
    "member-sara",
  );
  assert.strictEqual(
    workspaceReducer(moved, {
      type: "MOVE_ASSET",
      assetId: "gmt-master-ii",
      memberId: "member-outsider",
      locationMode: "unknown",
      locationStatus: "unknown",
      now: "2026-07-25T11:01:00.000Z",
    }),
    moved,
  );

  const placeCorrected = workspaceReducer(base, {
    type: "UPDATE_PLACE",
    placeId: "west-bay-home",
    memberId: "member-sara",
    changes: {
      formattedAddress: "Corrected West Bay address",
    },
    now: "2026-07-25T11:05:00.000Z",
  });
  assert.equal(
    placeCorrected.locationAssignments.find(
      (item) => item.assetId === "gmt-master-ii" && !item.validTo,
    ).createdByMemberId,
    "member-sara",
  );
  assert.strictEqual(
    workspaceReducer(base, {
      type: "UPDATE_PLACE",
      placeId: "west-bay-home",
      memberId: "member-outsider",
      changes: { formattedAddress: "Untrusted address" },
      now: "2026-07-25T11:06:00.000Z",
    }),
    base,
  );

  const spaceCorrected = workspaceReducer(base, {
    type: "UPDATE_SPACE",
    spaceId: "study",
    memberId: "member-sara",
    changes: { name: "Family study" },
    now: "2026-07-25T11:10:00.000Z",
  });
  assert.equal(
    spaceCorrected.locationAssignments.find(
      (item) => item.assetId === "gmt-master-ii" && !item.validTo,
    ).createdByMemberId,
    "member-sara",
  );
  assert.deepEqual(
    spaceCorrected.locationAssignments
      .find(
        (item) => item.assetId === "gmt-master-ii" && !item.validTo,
      )
      .spacePathSnapshot.map((item) => item.name),
    ["Family study", "Study safe"],
  );
});

test("file-backed review requires a canonical SHA-256 that matches the verified original", () => {
  const base = createSampleWorkspace();
  const withMalformedChecksum = workspaceReducer(base, {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "evidence-integrity-contract",
      assetId: "gmt-master-ii",
      type: "Service record",
      fileName: "service-integrity.pdf",
      fileType: "application/pdf",
      fileSize: 256,
      fileChecksum: "not-a-sha256",
      fileState: "ready_local",
    },
    now: NOW,
  });

  const malformedReview = workspaceReducer(withMalformedChecksum, {
    type: "VERIFY_EVIDENCE",
    evidenceId: "evidence-integrity-contract",
    integrityVerified: true,
    integrityChecksum: "not-a-sha256",
    now: "2026-07-24T12:01:00.000Z",
  });
  assert.equal(
    malformedReview.evidence.find(
      (item) => item.id === "evidence-integrity-contract",
    ).status,
    "pending",
  );

  const withCanonicalChecksum = workspaceReducer(malformedReview, {
    type: "SET_EVIDENCE_FILE_STATE",
    evidenceId: "evidence-integrity-contract",
    fileState: "ready_local",
    fileChecksum: SHA256_A,
    now: "2026-07-24T12:02:00.000Z",
  });
  const mismatchedReview = workspaceReducer(withCanonicalChecksum, {
    type: "VERIFY_EVIDENCE",
    evidenceId: "evidence-integrity-contract",
    integrityVerified: true,
    integrityChecksum: SHA256_B,
    now: "2026-07-24T12:03:00.000Z",
  });
  assert.equal(
    mismatchedReview.evidence.find(
      (item) => item.id === "evidence-integrity-contract",
    ).status,
    "pending",
  );

  const verified = workspaceReducer(mismatchedReview, {
    type: "VERIFY_EVIDENCE",
    evidenceId: "evidence-integrity-contract",
    integrityVerified: true,
    integrityChecksum: SHA256_A.toUpperCase(),
    now: "2026-07-24T12:04:00.000Z",
  });
  assert.equal(
    verified.evidence.find(
      (item) => item.id === "evidence-integrity-contract",
    ).status,
    "verified",
  );
});

test("changing a ready local file identity revokes review and reopens its proof task", () => {
  const withEvidence = workspaceReducer(createSampleWorkspace(), {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "evidence-identity-change",
      assetId: "gmt-master-ii",
      type: "Service record",
      fileName: "service-record.pdf",
      fileType: "application/pdf",
      fileSize: 256,
      fileChecksum: SHA256_A,
      originalVersionId: ORIGINAL_VERSION_A,
      fileState: "ready_local",
    },
    now: NOW,
  });
  const verified = workspaceReducer(withEvidence, {
    type: "VERIFY_EVIDENCE",
    evidenceId: "evidence-identity-change",
    integrityVerified: true,
    integrityChecksum: SHA256_A,
    now: "2026-07-24T12:01:00.000Z",
  });
  assert.equal(
    verified.evidence.find((item) => item.id === "evidence-identity-change")
      .status,
    "verified",
  );
  assert.equal(
    verified.tasks.find((item) => item.id === "task-gmt-service").status,
    "completed",
  );

  for (const [label, change] of [
    ["filename", { fileName: "replacement-service-record.pdf" }],
    ["media type", { fileType: "image/png" }],
    ["byte length", { fileSize: 257 }],
    ["checksum", { fileChecksum: SHA256_B }],
    ["immutable original version", { originalVersionId: ORIGINAL_VERSION_B }],
  ]) {
    const changed = workspaceReducer(verified, {
      type: "SET_EVIDENCE_FILE_STATE",
      evidenceId: "evidence-identity-change",
      fileState: "ready_local",
      ...change,
      now: "2026-07-24T12:02:00.000Z",
    });
    const evidence = changed.evidence.find(
      (item) => item.id === "evidence-identity-change",
    );
    assert.equal(evidence.status, "pending", `${label} must revoke review`);
    assert.equal(evidence.verifiedAt, null, `${label} must clear review time`);
    assert.equal(
      evidence.verifiedByMemberId,
      null,
      `${label} must clear reviewer`,
    );
    assert.equal(
      changed.tasks.find((item) => item.id === "task-gmt-service").status,
      "open",
      `${label} must reopen the proof task`,
    );
  }
});

test("immutable original version identities survive normalization and malformed values fail closed", () => {
  const base = createSampleWorkspace();
  const withCanonicalVersion = workspaceReducer(base, {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "evidence-original-version-normalization",
      assetId: "gmt-master-ii",
      type: "Service record",
      fileName: "service-record.pdf",
      fileType: "application/pdf",
      fileSize: 256,
      fileChecksum: SHA256_A,
      originalVersionId: ORIGINAL_VERSION_A.toUpperCase(),
      fileState: "ready_local",
    },
    now: NOW,
  });
  assert.equal(
    withCanonicalVersion.evidence.find(
      (item) => item.id === "evidence-original-version-normalization",
    ).originalVersionId,
    ORIGINAL_VERSION_A,
  );

  const withMalformedVersion = workspaceReducer(base, {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "evidence-malformed-original-version",
      assetId: "gmt-master-ii",
      type: "Service record",
      fileName: "service-record.pdf",
      fileType: "application/pdf",
      fileSize: 256,
      fileChecksum: SHA256_A,
      originalVersionId: "original-version-not-content-derived",
      fileState: "ready_local",
    },
    now: NOW,
  });
  assert.equal(
    withMalformedVersion.evidence.find(
      (item) => item.id === "evidence-malformed-original-version",
    ).originalVersionId,
    null,
  );
});

test("add, update, move, archive, and search preserve unknown-location rules", () => {
  const base = createSampleWorkspace();
  const added = workspaceReducer(base, {
    type: "ADD_ASSET",
    asset: {
      id: "asset-test-synth",
      name: "Childhood synthesizer",
      category: "Collectible",
      story: "Remembered from school.",
      tags: ["music", "childhood"],
    },
    now: NOW,
  });
  const newAsset = added.assets.find((item) => item.id === "asset-test-synth");
  assert.equal(newAsset.placeId, null);
  assert.equal(newAsset.spaceId, null);
  assert.equal(newAsset.locationStatus, "unknown");
  assert.equal(selectPortfolioSummary(added).unknownLocationCount, 3);
  assert.equal(searchWorkspace(added, "synthesizer")[0].id, newAsset.id);
  assert.equal(searchWorkspace(added, "music")[0].id, newAsset.id);

  const updated = workspaceReducer(added, {
    type: "UPDATE_ASSET",
    assetId: newAsset.id,
    changes: {
      name: "Childhood blue synthesizer",
      reference: "SYNTH-DEMO",
      id: "attempted-id-change",
      placeId: "dubai-storage",
    },
    now: "2026-07-24T12:01:00.000Z",
  });
  assert.equal(
    updated.assets.find((item) => item.id === newAsset.id).name,
    "Childhood blue synthesizer",
  );
  assert.equal(
    updated.assets.find((item) => item.id === newAsset.id).placeId,
    null,
  );
  assert.equal(
    updated.assets.some((item) => item.id === "attempted-id-change"),
    false,
  );

  const moved = workspaceReducer(updated, {
    type: "MOVE_ASSET",
    assetId: newAsset.id,
    placeId: "west-bay-home",
    spaceId: "study",
    locationDetail: "Cabinet 2",
    now: "2026-07-24T12:02:00.000Z",
  });
  const movedAsset = moved.assets.find((item) => item.id === newAsset.id);
  assert.equal(movedAsset.placeId, "west-bay-home");
  assert.equal(movedAsset.spaceId, "study");
  assert.equal(movedAsset.locationStatus, "known");
  assert.equal(selectPortfolioSummary(moved).unknownLocationCount, 2);
  assert.equal(
    searchWorkspace(moved, "Study", { types: ["asset"] }).some(
      (item) => item.id === newAsset.id,
    ),
    true,
  );

  const archived = workspaceReducer(moved, {
    type: "ARCHIVE_ASSET",
    assetId: newAsset.id,
    now: "2026-07-24T12:03:00.000Z",
  });
  assert.equal(
    archived.assets.find((item) => item.id === newAsset.id).lifecycleStatus,
    "archived",
  );
  assert.equal(selectPortfolioSummary(archived).assetCount, 17);
  assert.equal(searchWorkspace(archived, "blue synthesizer").length, 0);
  assert.equal(
    searchWorkspace(archived, "blue synthesizer", {
      includeArchived: true,
    })[0].id,
    newAsset.id,
  );
  assert.strictEqual(
    workspaceReducer(archived, {
      type: "ARCHIVE_ASSET",
      assetId: newAsset.id,
      now: "2026-07-24T12:04:00.000Z",
    }),
    archived,
  );
});

test("UPDATE_ASSET cannot mutate location truth or bypass assignment history", () => {
  const base = createSampleWorkspace();
  const beforeAsset = base.assets.find((item) => item.id === "gmt-master-ii");
  const beforeHistory = selectAssetLocationHistory(base, beforeAsset.id);

  const updated = workspaceReducer(base, {
    type: "UPDATE_ASSET",
    assetId: beforeAsset.id,
    changes: {
      name: "GMT-Master II — catalogued",
      placeId: "dubai-storage",
      spaceId: null,
      locationMode: "virtual",
      locationStatus: "unknown",
      locationDetail: "Untracked shortcut",
    },
    now: "2026-07-24T12:15:00.000Z",
  });
  const afterAsset = updated.assets.find((item) => item.id === beforeAsset.id);

  assert.equal(afterAsset.name, "GMT-Master II — catalogued");
  for (const key of [
    "placeId",
    "spaceId",
    "locationMode",
    "locationStatus",
    "locationDetail",
  ]) {
    assert.deepEqual(
      afterAsset[key],
      beforeAsset[key],
      `${key} must only change through MOVE_ASSET`,
    );
  }
  assert.deepEqual(
    selectAssetLocationHistory(updated, beforeAsset.id),
    beforeHistory,
  );
  assert.deepEqual(updated.locationAssignments, base.locationAssignments);
});

test("memory search includes meaning and canonically linked people", () => {
  let state = createSampleWorkspace();
  state = workspaceReducer(state, {
    type: "ADD_ASSET",
    asset: {
      id: "memory-search-record",
      name: "Ordinary afternoon",
      categoryId: "legacy.story-memory",
      kind: "memory",
      locationMode: "not-applicable",
      locationStatus: "unknown",
      sentimentalValue: "The saffron ribbon made everyone laugh.",
      meaningFacets: ["memory", "family-history"],
      profile: {
        "memory-subject": "moment",
        "people-model": "canonical-v1",
      },
    },
    now: "2026-07-25T15:00:00.000Z",
  });
  state = workspaceReducer(state, {
    type: "APPLY_COLLECTOR_COMMAND",
    command: {
      type: "UPSERT_PERSON",
      person: {
        id: "person-hessa-search",
        displayName: "Hessa",
        relationship: "Aunt",
      },
    },
    now: "2026-07-25T15:01:00.000Z",
  });
  state = workspaceReducer(state, {
    type: "APPLY_COLLECTOR_COMMAND",
    command: {
      type: "UPSERT_MEMORY_PERSON_LINK",
      link: {
        id: "link-hessa-search",
        itemProfileId: "collector-profile-memory-search-record",
        personId: "person-hessa-search",
        relationshipType: "shared-memory",
      },
    },
    now: "2026-07-25T15:02:00.000Z",
  });

  assert.equal(
    searchWorkspace(state, "saffron ribbon", { types: ["asset"] })[0]
      .id,
    "memory-search-record",
  );
  assert.equal(
    searchWorkspace(state, "Hessa", { types: ["asset"] })[0].id,
    "memory-search-record",
  );
});

test("place, space, and invited-member commands validate relationships", () => {
  const base = createSampleWorkspace();
  const withPlace = workspaceReducer(base, {
    type: "ADD_PLACE",
    place: {
      id: "al-waab-home",
      name: "Al Waab family home",
      kind: "home",
      city: "Doha",
      countryCode: "qa",
      coordinates: { lat: 25.25, lng: 51.43 },
    },
    now: NOW,
  });
  assert.equal(withPlace.places.at(-1).countryCode, "QA");

  const withSpace = workspaceReducer(withPlace, {
    type: "ADD_SPACE",
    space: {
      id: "al-waab-majlis",
      placeId: "al-waab-home",
      name: "Majlis",
      kind: "room",
    },
    now: "2026-07-24T12:01:00.000Z",
  });
  assert.equal(withSpace.spaces.at(-1).placeId, "al-waab-home");

  const invalidSpace = workspaceReducer(withSpace, {
    type: "ADD_SPACE",
    space: {
      id: "orphan-room",
      placeId: "missing-place",
      name: "Orphan",
    },
    now: "2026-07-24T12:02:00.000Z",
  });
  assert.strictEqual(invalidSpace, withSpace);

  const invited = workspaceReducer(withSpace, {
    type: "INVITE_MEMBER",
    member: {
      id: "member-omar",
      name: "Omar H.",
      email: "omar@example.test",
      accessRole: "viewer",
      accessScope: "west-bay-home",
    },
    now: "2026-07-24T12:03:00.000Z",
  });
  assert.equal(invited.members.at(-1).inviteStatus, "invited");
  assert.equal(invited.members.at(-1).joinedAt, null);
  assert.strictEqual(
    workspaceReducer(invited, {
      type: "INVITE_MEMBER",
      member: {
        id: "member-omar-copy",
        name: "Omar duplicate",
        email: "OMAR@example.test",
      },
      now: "2026-07-24T12:04:00.000Z",
    }),
    invited,
  );
});

test("room and container corrections preserve links and reject hierarchy cycles", () => {
  const base = createSampleWorkspace();
  const renamed = workspaceReducer(base, {
    type: "UPDATE_SPACE",
    spaceId: "study",
    changes: { name: "Library study" },
    now: "2026-07-25T16:00:00.000Z",
  });

  assert.equal(
    renamed.spaces.find((space) => space.id === "study").name,
    "Library study",
  );
  assert.equal(
    renamed.assets.find((asset) => asset.id === "gmt-master-ii").spaceId,
    "study-safe",
  );
  assert.deepEqual(
    selectSpacePath(renamed, "study-safe").map((space) => space.name),
    ["Library study", "Study safe"],
  );

  const cycleAttempt = workspaceReducer(renamed, {
    type: "UPDATE_SPACE",
    spaceId: "study",
    changes: { parentSpaceId: "study-safe" },
    now: "2026-07-25T16:01:00.000Z",
  });
  assert.strictEqual(cycleAttempt, renamed);
});

test("normalization repairs malformed snapshots without orphan references", () => {
  const normalized = normalizeWorkspace({
    version: 1,
    mode: "personal",
    privacyNotice: "encrypted",
    meta: {
      id: "workspace-tampered",
      revision: -20,
      createdAt: "not-a-date",
      updatedAt: NOW,
    },
    household: {
      id: "household-test",
      name: 42,
      ownerMemberId: "missing-member",
      demoOnly: false,
    },
    members: [
      {
        id: "member-test",
        name: "Test Owner",
        accessRole: "not-a-role",
        inviteStatus: "active",
      },
      { id: "member-test", name: "Duplicate" },
      null,
    ],
    regions: [
      {
        id: "region-test",
        name: "Test region",
        lat: 25.28,
        lng: 51.53,
      },
    ],
    places: [
      {
        id: "place-test",
        name: "Test Place",
        regionId: "region-test",
        coordinates: { lat: "bad", lng: 51 },
      },
      { id: "place-test", name: "Duplicate place" },
      { id: "", name: "Invalid" },
    ],
    spaces: [
      {
        id: "space-test",
        placeId: "place-test",
        parentSpaceId: "space-test",
        name: "Test room",
      },
      {
        id: "space-orphan",
        placeId: "missing-place",
        name: "Orphan",
      },
    ],
    assets: [
      {
        id: "asset-test",
        name: "Test asset",
        category: "Watch",
        placeId: "missing-place",
        spaceId: "space-test",
        locationStatus: "known",
        ownerMemberId: "missing-member",
        lifecycleStatus: "invented",
      },
      { id: "asset-test", name: "Duplicate asset" },
      { id: "invalid-no-name" },
    ],
    evidence: [
      {
        id: "evidence-test",
        assetId: "asset-test",
        type: "Receipt",
        status: "invented",
        fileName: "receipt.pdf",
      },
      {
        id: "evidence-orphan",
        assetId: "missing-asset",
        type: "Receipt",
      },
    ],
    tasks: [
      {
        id: "task-test",
        title: "Test task",
        assetId: "missing-asset",
        placeId: "missing-place",
        status: "invented",
        priority: "invented",
      },
      { id: "", title: "Invalid" },
    ],
  });

  assert.equal(normalized.version, SNAPSHOT_VERSION);
  assert.equal(normalized.mode, "personal");
  assert.equal(normalized.household.demoOnly, false);
  assert.equal(normalized.meta.revision, 0);
  assert.equal(normalized.members.length, 1);
  assert.equal(normalized.places.length, 1);
  assert.equal(normalized.spaces.length, 1);
  assert.equal(normalized.spaces[0].parentSpaceId, null);
  assert.equal(normalized.assets.length, 1);
  assert.equal(normalized.assets[0].placeId, null);
  assert.equal(normalized.assets[0].spaceId, null);
  assert.equal(normalized.assets[0].locationStatus, "unknown");
  assert.equal(normalized.evidence.length, 1);
  assert.equal(normalized.evidence[0].status, "pending");
  assert.equal(normalized.tasks.length, 1);
  assert.equal(normalized.tasks[0].assetId, null);
  assert.equal(normalized.tasks[0].placeId, null);
  assert.doesNotThrow(() => JSON.stringify(normalized));

  const fromGarbage = normalizeWorkspace("not an object");
  assert.equal(selectPortfolioSummary(fromGarbage).assetCount, 17);
  assert.equal(
    normalizeWorkspace({ version: 999 }).version,
    SNAPSHOT_VERSION,
  );
});

test("next action honors open task priority and reset restores the sample", () => {
  const base = createSampleWorkspace();
  const next = selectNextAction(base);
  assert.equal(next.kind, "task");
  assert.equal(next.id, "task-pearl-insurance");
  assert.equal(next.ctaLabel, "Review insurance");

  const changed = workspaceReducer(base, {
    type: "ARCHIVE_ASSET",
    assetId: "gmt-master-ii",
    now: NOW,
  });
  assert.equal(selectPortfolioSummary(changed).assetCount, 16);
  const reset = workspaceReducer(changed, { type: "RESET_DEMO" });
  assert.equal(selectPortfolioSummary(reset).assetCount, 17);
  assert.equal(reset.meta.revision, 0);
  assert.notStrictEqual(reset, base);
});

test("v4 sample upgrades prune retired scale fixtures but preserve user records", () => {
  const current = createSampleWorkspace();
  const legacy = {
    ...current,
    version: 4,
    places: current.places.map((place) =>
      place.id === "pearl-apartment-place"
        ? {
            ...place,
            kind: "property",
            tenure: "unknown",
            propertyAssetId: null,
          }
        : place.id === "dubai-storage"
          ? {
              ...place,
              tenure: "unknown",
            }
          : place,
    ),
    assets: [
      ...current.assets.map((asset) =>
        asset.id === "pearl-apartment"
          ? {
              ...asset,
              categoryId: "property.other",
              propertyPlaceId: null,
            }
          : asset,
      ),
      ...[
        "west-bay-home-item-83",
        "pearl-apartment-place-item-40",
        "family-archive-item-06",
        "digital-record-04",
        "my-user-created-sample-record",
      ].map((id) => ({
        id,
        name: id,
        categoryId: "custom.other",
        category: "Other",
        locationMode: "unknown",
        locationStatus: "unknown",
        ownerMemberId: current.household.ownerMemberId,
        lifecycleStatus: "active",
      })),
    ],
  };

  const upgraded = normalizeWorkspace(legacy);
  assert.equal(upgraded.version, SNAPSHOT_VERSION);
  for (const retiredId of [
    "west-bay-home-item-83",
    "pearl-apartment-place-item-40",
    "family-archive-item-06",
    "digital-record-04",
  ]) {
    assert.equal(
      upgraded.assets.some((asset) => asset.id === retiredId),
      false,
    );
  }
  assert.equal(
    upgraded.assets.some(
      (asset) => asset.id === "my-user-created-sample-record",
    ),
    true,
  );
  const pearlPlace = upgraded.places.find(
    (place) => place.id === "pearl-apartment-place",
  );
  const pearlAsset = upgraded.assets.find(
    (asset) => asset.id === "pearl-apartment",
  );
  assert.equal(pearlPlace.tenure, "owned");
  assert.equal(pearlPlace.propertyAssetId, pearlAsset.id);
  assert.equal(pearlAsset.categoryId, "property.apartment");
  assert.equal(pearlAsset.propertyPlaceId, pearlPlace.id);
  assert.equal(
    upgraded.places.find((place) => place.id === "dubai-storage")
      .tenure,
    "rented",
  );
});

test("current sample snapshots still prune interrupted-upgrade scale fixtures", () => {
  const current = createSampleWorkspace();
  const retiredFixture = {
    ...current.assets[0],
    id: "west-bay-home-item-83",
    name: "Retired scale fixture",
  };
  const userRecord = {
    ...current.assets[0],
    id: "my-current-version-user-record",
    name: "My added record",
  };

  const normalizedSample = normalizeWorkspace({
    ...current,
    version: SNAPSHOT_VERSION,
    assets: [...current.assets, retiredFixture, userRecord],
  });
  assert.equal(
    normalizedSample.assets.some((asset) => asset.id === retiredFixture.id),
    false,
  );
  assert.equal(
    normalizedSample.assets.some((asset) => asset.id === userRecord.id),
    true,
  );

  const normalizedPersonal = normalizeWorkspace({
    ...current,
    mode: "personal",
    version: SNAPSHOT_VERSION,
    assets: [...current.assets, retiredFixture],
  });
  assert.equal(
    normalizedPersonal.assets.some((asset) => asset.id === retiredFixture.id),
    true,
  );
});

test("workspace mode commands create a clean personal workspace and replace safely", () => {
  const sample = createSampleWorkspace();
  const unstarted = workspaceReducer(sample, {
    type: "SET_MODE",
    mode: "unstarted",
    now: NOW,
  });
  assert.equal(unstarted.mode, "unstarted");
  assert.equal(unstarted.assets.length, 17);
  assert.strictEqual(
    workspaceReducer(unstarted, {
      type: "SET_MODE",
      mode: "not-a-mode",
      now: NOW,
    }),
    unstarted,
  );

  const personal = workspaceReducer(unstarted, {
    type: "START_PERSONAL",
    workspaceId: "workspace-personal-test",
    household: {
      id: "household-personal-test",
      name: "My test household",
      locale: "ar-QA",
      currency: "QAR",
    },
    member: {
      id: "member-personal-owner",
      name: "Personal Owner",
      email: "owner@example.test",
    },
    now: NOW,
  });
  assert.equal(personal.mode, "personal");
  assert.equal(personal.meta.id, "workspace-personal-test");
  assert.equal(personal.household.id, "household-personal-test");
  assert.equal(personal.household.locale, "ar-QA");
  assert.equal(personal.members.length, 1);
  assert.equal(personal.members[0].accessRole, "owner");
  assert.equal(personal.places.length, 0);
  assert.equal(personal.spaces.length, 0);
  assert.equal(personal.assets.length, 0);
  assert.equal(personal.evidence.length, 0);
  assert.equal(personal.tasks.length, 0);
  assert.equal(personal.activity.length, 0);

  const replacement = workspaceReducer(sample, {
    type: "REPLACE_WORKSPACE",
    workspace: personal,
  });
  assert.deepEqual(replacement, personal);
  const replacementFromGarbage = workspaceReducer(personal, {
    type: "REPLACE_WORKSPACE",
    workspace: null,
  });
  assert.equal(replacementFromGarbage.mode, "sample");
  assert.equal(replacementFromGarbage.assets.length, 17);
});

test("stable taxonomy, virtual location, and universal materials survive normalization", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withDigital = workspaceReducer(personal, {
    type: "ADD_ASSET",
    asset: {
      id: "digital-domain-record",
      name: "Family domain",
      categoryId: "digital.domain-website",
      category: "Domain or website",
      kind: "digital",
      locationMode: "virtual",
      locationDetail: "Registrar account alias",
      profile: {
        provider: "Example registrar",
        "renewal-date": "2027-07-24",
      },
    },
    now: "2026-07-24T12:20:00.000Z",
  });
  const asset = withDigital.assets.find((item) => item.id === "digital-domain-record");

  assert.equal(asset.categoryId, "digital.domain-website");
  assert.deepEqual(asset.categoryPath, ["digital-financial", "digital.domain-website"]);
  assert.equal(asset.locationMode, "virtual");
  assert.equal(asset.placeId, null);
  assert.equal(selectPortfolioSummary(withDigital).unknownLocationCount, 0);
  assert.equal(
    selectAssetReadiness(asset, withDigital).items.find(
      (item) => item.id === "location",
    ).complete,
    true,
  );

  const withStory = workspaceReducer(withDigital, {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "material-domain-story",
      assetId: asset.id,
      type: "Why this domain matters",
      kind: "note",
      relation: "context",
      note: "Created for the first family business.",
    },
    now: "2026-07-24T12:21:00.000Z",
  });
  const material = withStory.evidence.find(
    (item) => item.id === "material-domain-story",
  );
  assert.equal(material.kind, "note");
  assert.equal(material.relation, "context");
  assert.equal(material.status, "pending");
  assert.equal(material.fileName, null);
});

test("personal snapshot recovery never imports sample collections", () => {
  const recovered = normalizeWorkspace({
    version: SNAPSHOT_VERSION,
    mode: "personal",
    meta: { id: "damaged-personal", updatedAt: NOW },
    household: {
      id: "household-damaged",
      name: "Recovered household",
      ownerMemberId: "owner-damaged",
    },
  });

  assert.equal(recovered.mode, "personal");
  assert.equal(recovered.members.length, 1);
  assert.equal(recovered.members[0].accessRole, "owner");
  for (const collection of [
    "regions",
    "places",
    "spaces",
    "assets",
    "evidence",
    "tasks",
    "activity",
  ]) {
    assert.deepEqual(recovered[collection], []);
  }
});

test("sample upgrades add new canonical context without overwriting sample edits", () => {
  const sample = createSampleWorkspace();
  const prior = {
    ...sample,
    version: SNAPSHOT_VERSION - 1,
    assets: sample.assets.map((asset) =>
      asset.id === "childhood-film-camera"
        ? {
            ...asset,
            name: "My edited sample camera",
            profile: {},
          }
        : asset,
    ),
  };

  const upgraded = normalizeWorkspace(prior);
  const memory = upgraded.assets.find(
    (asset) => asset.id === "childhood-film-camera",
  );

  assert.equal(upgraded.version, SNAPSHOT_VERSION);
  assert.equal(memory.name, "My edited sample camera");
  assert.equal(memory.profile.people, "Yusuf and Akmal");
  assert.equal(memory.profile["date-period"], "Childhood · 1999");
});

test("taxonomy normalization repairs stale IDs, paths, and versions", () => {
  const normalized = normalizeWorkspace({
    version: SNAPSHOT_VERSION,
    mode: "personal",
    meta: { id: "taxonomy-repair", updatedAt: NOW },
    household: { id: "household-taxonomy", name: "Taxonomy household" },
    members: [],
    regions: [],
    places: [],
    spaces: [],
    evidence: [],
    tasks: [],
    activity: [],
    assets: [
      {
        id: "legacy-watch",
        name: "Legacy watch",
        categoryId: "legacy.watch",
        category: "Watch",
        categoryPath: ["digital-financial", "digital.domain-website"],
        taxonomyVersion: 999,
      },
    ],
  });

  const asset = normalized.assets[0];
  assert.equal(asset.categoryId, "lifestyle.watch");
  assert.deepEqual(asset.categoryPath, [
    "lifestyle-personal",
    "lifestyle.watch",
  ]);
  assert.equal(asset.taxonomyVersion, 1);
});

test("domain rejects empty materials and accepts valid sources for every kind", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withAsset = workspaceReducer(personal, {
    type: "ADD_ASSET",
    asset: {
      id: "materials-asset",
      name: "Materials test",
      categoryId: "custom.other",
      category: "Other",
      requiredProofTypes: [],
    },
    now: NOW,
  });

  for (const evidence of [
    { id: "bad-paper", kind: "paper", type: "Paper" },
    { id: "bad-media", kind: "media", type: "Photo" },
    { id: "bad-note", kind: "note", type: "Story" },
    { id: "bad-link", kind: "link", type: "Reference", linkUrl: "javascript:alert(1)" },
    { id: "bad-artifact", kind: "artifact", type: "Keepsake" },
    { id: "bad-record", kind: "record", type: "Service entry" },
  ]) {
    assert.strictEqual(
      workspaceReducer(withAsset, {
        type: "ADD_EVIDENCE",
        evidence: { ...evidence, assetId: "materials-asset" },
        now: NOW,
      }),
      withAsset,
    );
  }

  const validMaterials = [
    { id: "paper", kind: "paper", type: "Paper", fileName: "paper.pdf" },
    { id: "media", kind: "media", type: "Photo", fileName: "photo.jpg" },
    { id: "note", kind: "note", type: "Story", note: "Family context" },
    { id: "link", kind: "link", type: "Reference", linkUrl: "https://example.test/item" },
    { id: "artifact", kind: "artifact", type: "Keepsake", physicalLocation: "Blue box" },
    {
      id: "record",
      kind: "record",
      type: "Service entry",
      note: "Service date recorded from the owner's log.",
    },
  ];
  const result = validMaterials.reduce(
    (state, evidence, index) =>
      workspaceReducer(state, {
        type: "ADD_EVIDENCE",
        evidence: { ...evidence, assetId: "materials-asset" },
        now: `2026-07-24T12:${30 + index}:00.000Z`,
      }),
    withAsset,
  );

  assert.deepEqual(
    result.evidence.map((item) => item.kind),
    ["paper", "media", "note", "link", "artifact", "record"],
  );
});

test("next action ignores completed location modes and archived materials", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withVirtual = workspaceReducer(personal, {
    type: "ADD_ASSET",
    asset: {
      id: "virtual-asset",
      name: "Family domain",
      categoryId: "digital.domain-website",
      category: "Domain or website",
      kind: "digital",
      locationMode: "virtual",
      requiredProofTypes: [],
    },
    now: NOW,
  });
  assert.equal(selectNextAction(withVirtual).kind, "review");

  const withPending = workspaceReducer(withVirtual, {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "archived-note",
      assetId: "virtual-asset",
      type: "Context note",
      kind: "note",
      note: "Context",
    },
    now: NOW,
  });
  assert.equal(selectNextAction(withPending).kind, "verify-evidence");

  const archived = workspaceReducer(withPending, {
    type: "ARCHIVE_ASSET",
    assetId: "virtual-asset",
    now: NOW,
  });
  assert.equal(selectNextAction(archived).kind, "add-first-place");
  assert.equal(selectPortfolioSummary(archived).pendingEvidenceCount, 0);
});

test("no-op updates are idempotent and commands without now advance time", () => {
  const base = createSampleWorkspace();
  const asset = base.assets[0];
  assert.strictEqual(
    workspaceReducer(base, {
      type: "UPDATE_ASSET",
      assetId: asset.id,
      changes: { name: asset.name },
      now: NOW,
    }),
    base,
  );

  const changed = workspaceReducer(base, {
    type: "ADD_ASSET",
    asset: {
      id: "implicit-time",
      name: "Implicit timestamp",
      categoryId: "custom.other",
      category: "Other",
    },
  });
  assert.notEqual(changed.meta.updatedAt, base.meta.updatedAt);
  assert.ok(Date.parse(changed.meta.updatedAt));
});

test("a new place cannot retain an orphan region", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const invalid = workspaceReducer(personal, {
    type: "ADD_PLACE",
    place: {
      id: "orphan-place",
      name: "Orphan place",
      regionId: "missing-region",
      city: "Missing",
    },
    now: NOW,
  });
  assert.strictEqual(invalid, personal);
});

test("physical moves reject virtual shortcuts and require a findable indoor clue", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withPlace = workspaceReducer(personal, {
    type: "ADD_PLACE",
    place: {
      id: "location-home",
      name: "Location home",
      regionId: "location-region",
      regionName: "Doha",
      city: "Doha",
      coordinates: { lat: 25.2854, lng: 51.531 },
    },
    now: NOW,
  });
  const withAsset = workspaceReducer(withPlace, {
    type: "ADD_ASSET",
    asset: {
      id: "location-asset",
      name: "Location asset",
      categoryId: "custom.other",
      category: "Other",
      requiredProofTypes: [],
      locationMode: "unknown",
      locationStatus: "unknown",
    },
    now: NOW,
  });

  const states = [
    {
      action: {
        locationMode: "physical",
        locationStatus: "needs-detail",
        placeId: null,
      },
      expected: ["physical", "needs-detail", null],
    },
    {
      action: {
        locationMode: "physical",
        locationStatus: "known",
        placeId: "location-home",
        locationDetail: "Top shelf",
      },
      expected: ["physical", "known", "location-home"],
    },
    {
      action: {
        locationMode: "physical",
        locationStatus: "known",
        placeId: "location-home",
        locationDetail: null,
      },
      expected: ["physical", "needs-detail", "location-home"],
    },
    {
      action: {
        locationMode: "virtual",
        locationStatus: "unknown",
        placeId: null,
      },
      expected: ["unknown", "unknown", null],
    },
    {
      action: {
        locationMode: "not-applicable",
        locationStatus: "unknown",
        placeId: null,
      },
      expected: ["unknown", "unknown", null],
    },
    {
      action: {
        locationMode: "unknown",
        locationStatus: "unknown",
        placeId: null,
      },
      expected: ["unknown", "unknown", null],
    },
  ];

  let state = withAsset;
  for (const [index, item] of states.entries()) {
    state = workspaceReducer(state, {
      type: "MOVE_ASSET",
      assetId: "location-asset",
      ...item.action,
      now: `2026-07-24T13:${String(index).padStart(2, "0")}:00.000Z`,
    });
    const asset = state.assets.find((candidate) => candidate.id === "location-asset");
    assert.deepEqual(
      [asset.locationMode, asset.locationStatus, asset.placeId],
      item.expected,
    );
  }
});

test("readiness never calls a suggested place or approximate property pin precise", () => {
  const state = createSampleWorkspace();
  const needsDetail = selectAssetReadiness("childhood-film-camera", state);
  const approximateProperty = selectAssetReadiness(
    "pearl-apartment",
    state,
  );
  const exactNestedItem = selectAssetReadiness("gmt-master-ii", state);

  assert.equal(
    needsDetail.items.find((item) => item.id === "location").complete,
    false,
  );
  assert.equal(
    needsDetail.items.find((item) => item.id === "location-detail")
      .complete,
    false,
  );
  assert.equal(
    approximateProperty.items.find(
      (item) => item.id === "location-detail",
    ).complete,
    false,
  );
  assert.equal(
    exactNestedItem.items.find((item) => item.id === "location").complete,
    true,
  );
  assert.equal(
    exactNestedItem.items.find(
      (item) => item.id === "location-detail",
    ).complete,
    true,
  );
});

test("a confirmed user-placed point satisfies precise-location readiness without measured accuracy", () => {
  const base = createSampleWorkspace();
  const withConfirmedUserPlacedPoint = {
    ...base,
    places: base.places.map((place) =>
      place.id === "west-bay-home"
        ? {
            ...place,
            locationSource: "user_pin",
            locationPrecision: "user_placed",
            horizontalAccuracyMeters: null,
            locationConfirmedAt: "2026-07-25T10:00:00.000Z",
          }
        : place,
    ),
  };
  const confirmed = selectAssetReadiness(
    "gmt-master-ii",
    withConfirmedUserPlacedPoint,
  );
  assert.equal(
    confirmed.items.find((item) => item.id === "location-detail").complete,
    true,
  );

  const withoutConfirmation = {
    ...withConfirmedUserPlacedPoint,
    places: withConfirmedUserPlacedPoint.places.map((place) =>
      place.id === "west-bay-home"
        ? { ...place, locationConfirmedAt: null }
        : place,
    ),
  };
  const unconfirmed = selectAssetReadiness(
    "gmt-master-ii",
    withoutConfirmation,
  );
  assert.equal(
    unconfirmed.items.find((item) => item.id === "location-detail").complete,
    false,
  );
});

test("archived assets are immutable and hide their linked materials by default", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withAsset = workspaceReducer(personal, {
    type: "ADD_ASSET",
    asset: {
      id: "archived-record",
      name: "Archived record",
      categoryId: "custom.other",
      category: "Other",
      requiredProofTypes: [],
    },
    now: NOW,
  });
  const withEvidence = workspaceReducer(withAsset, {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "archived-material",
      assetId: "archived-record",
      type: "Archive note",
      kind: "note",
      note: "Preserved context",
    },
    now: NOW,
  });
  const archived = workspaceReducer(withEvidence, {
    type: "ARCHIVE_ASSET",
    assetId: "archived-record",
    now: NOW,
  });

  const commands = [
    {
      type: "ADD_EVIDENCE",
      evidence: {
        assetId: "archived-record",
        type: "Late note",
        kind: "note",
        note: "Should be rejected",
      },
    },
    { type: "VERIFY_EVIDENCE", evidenceId: "archived-material" },
    {
      type: "MOVE_ASSET",
      assetId: "archived-record",
      locationMode: "unknown",
    },
    {
      type: "UPDATE_ASSET",
      assetId: "archived-record",
      changes: { name: "Changed after archive" },
    },
  ];
  for (const command of commands) {
    assert.strictEqual(
      workspaceReducer(archived, { ...command, now: NOW }),
      archived,
    );
  }

  assert.equal(
    searchWorkspace(archived, "Archive note", {
      types: ["evidence"],
    }).length,
    0,
  );
  assert.equal(
    searchWorkspace(archived, "Archive note", {
      types: ["evidence"],
      includeArchived: true,
    }).length,
    1,
  );
});

test("semantic location filters keep unknown separate from no physical location", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const fixtures = [
    [
      "unknown-item",
      "Unknown item",
      "custom.other",
      "unknown",
      "unknown",
      {},
    ],
    [
      "virtual-item",
      "Virtual item",
      "digital.domain-website",
      "virtual",
      "unknown",
      {},
    ],
    [
      "memory-item",
      "Memory item",
      "legacy.story-memory",
      "not-applicable",
      "unknown",
      { "memory-subject": "story" },
    ],
    [
      "detail-item",
      "Detail item",
      "custom.other",
      "physical",
      "needs-detail",
      {},
    ],
  ];
  const state = fixtures.reduce(
    (
      current,
      [
        id,
        name,
        categoryId,
        locationMode,
        locationStatus,
        profile,
      ],
    ) =>
      workspaceReducer(current, {
        type: "ADD_ASSET",
        asset: {
          id,
          name,
          categoryId,
          category: "Other",
          profile,
          requiredProofTypes: [],
          locationMode,
          locationStatus,
        },
        now: NOW,
      }),
    personal,
  );

  assert.deepEqual(
    searchWorkspace(state, "", {
      types: ["asset"],
      location: "unknown",
    }).map((result) => result.id),
    ["unknown-item"],
  );
  assert.deepEqual(
    searchWorkspace(state, "", {
      types: ["asset"],
      location: "no-physical",
    }).map((result) => result.id).sort(),
    ["memory-item", "virtual-item"],
  );
  assert.deepEqual(
    searchWorkspace(state, "unknown location", {
      types: ["asset"],
    }).map((result) => result.id),
    ["unknown-item"],
  );
});

test("next actions expose an explicit, client-independent destination", () => {
  const sample = createSampleWorkspace();
  const addEvidenceTask = sample.tasks.find(
    (task) => task.type === "add-evidence",
  );
  assert.ok(addEvidenceTask);
  const isolatedTask = {
    ...sample,
    tasks: sample.tasks.map((task) => ({
      ...task,
      status: task.id === addEvidenceTask.id ? "open" : "completed",
    })),
  };
  assert.deepEqual(selectNextAction(isolatedTask).destination, {
    type: "capture-material",
    assetId: addEvidenceTask.assetId,
  });

  const withoutTasks = {
    ...sample,
    tasks: sample.tasks.map((task) => ({ ...task, status: "completed" })),
  };
  assert.ok(selectNextAction(withoutTasks).destination?.type);
});

test("taxonomy IDs provide the same proof defaults to every client", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withProperty = workspaceReducer(personal, {
    type: "ADD_ASSET",
    asset: {
      id: "property-defaults",
      name: "Family house",
      categoryId: "property.house",
      category: "House",
    },
    now: NOW,
  });
  const property = withProperty.assets.find(
    (asset) => asset.id === "property-defaults",
  );
  assert.deepEqual(property.requiredProofTypes, [
    "Title deed",
    "Insurance policy",
    "Current photo",
  ]);
});

test("generic asset updates cannot bypass lifecycle commands", () => {
  const sample = createSampleWorkspace();
  const asset = sample.assets.find((item) => item.id === "pearl-apartment");
  const openTask = sample.tasks.find(
    (task) => task.assetId === asset.id && task.status === "open",
  );
  assert.ok(openTask);
  const attempted = workspaceReducer(sample, {
    type: "UPDATE_ASSET",
    assetId: asset.id,
    changes: { lifecycleStatus: "archived" },
    now: NOW,
  });
  assert.strictEqual(attempted, sample);
  assert.equal(
    attempted.tasks.find((task) => task.id === openTask.id).status,
    "open",
  );
});

test("archived places cannot receive new relationships or leak into search", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withPlace = workspaceReducer(personal, {
    type: "ADD_PLACE",
    place: {
      id: "retired-place",
      name: "Retired place",
      regionId: "retired-region",
      regionName: "Doha",
      city: "Doha",
      coordinates: { lat: 25.2854, lng: 51.531 },
    },
    now: NOW,
  });
  const archivedPlace = normalizeWorkspace({
    ...withPlace,
    places: withPlace.places.map((place) => ({
      ...place,
      status: "archived",
    })),
  });

  assert.strictEqual(
    workspaceReducer(archivedPlace, {
      type: "ADD_SPACE",
      space: {
        name: "Impossible room",
        placeId: "retired-place",
      },
      now: NOW,
    }),
    archivedPlace,
  );
  assert.equal(
    searchWorkspace(archivedPlace, "Retired place", {
      types: ["place", "space"],
    }).length,
    0,
  );
  assert.equal(
    searchWorkspace(archivedPlace, "Retired place", {
      types: ["place"],
      includeArchived: true,
    }).length,
    1,
  );
});

test("a place with no records routes the next action into first asset capture", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withPlace = workspaceReducer(personal, {
    type: "ADD_PLACE",
    place: {
      id: "first-home",
      name: "First home",
      regionId: "first-region",
      regionName: "Doha",
      city: "Doha",
      coordinates: { lat: 25.2854, lng: 51.531 },
    },
    now: NOW,
  });
  assert.deepEqual(selectNextAction(withPlace).destination, {
    type: "capture-asset",
    placeId: "first-home",
  });
});

test("v1 snapshots migrate scalar asset locations into active history", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withPlace = workspaceReducer(personal, {
    type: "ADD_PLACE",
    place: {
      id: "legacy-home",
      name: "Legacy home",
      regionId: "legacy-region",
      regionName: "Doha",
      city: "Doha",
      coordinates: { lat: 25.2854, lng: 51.531 },
    },
    now: NOW,
  });
  const withSpace = workspaceReducer(withPlace, {
    type: "ADD_SPACE",
    space: {
      id: "legacy-cabinet",
      placeId: "legacy-home",
      name: "Cabinet",
      kind: "container",
    },
    now: "2026-07-24T12:01:00.000Z",
  });
  const withAsset = workspaceReducer(withSpace, {
    type: "ADD_ASSET",
    asset: {
      id: "legacy-camera",
      name: "Legacy camera",
      categoryId: "collectibles.cameras",
      category: "Camera",
      placeId: "legacy-home",
      spaceId: "legacy-cabinet",
      locationDetail: "Top shelf",
      requiredProofTypes: [],
    },
    now: "2026-07-24T12:02:00.000Z",
  });
  const {
    locationAssignments: _discardedHistory,
    collections: _discardedCollections,
    ...legacySnapshot
  } = withAsset;

  const migrated = normalizeWorkspace({
    ...legacySnapshot,
    version: 1,
  });

  assert.equal(migrated.version, SNAPSHOT_VERSION);
  assert.deepEqual(migrated.collections, []);
  assert.equal(migrated.locationAssignments.length, 1);
  assert.deepEqual(
    migrated.locationAssignments.map((assignment) => ({
      assetId: assignment.assetId,
      placeId: assignment.placeId,
      spaceId: assignment.spaceId,
      locatorText: assignment.locatorText,
      source: assignment.source,
      confirmationState: assignment.confirmationState,
      validTo: assignment.validTo,
    })),
    [
      {
        assetId: "legacy-camera",
        placeId: "legacy-home",
        spaceId: "legacy-cabinet",
        locatorText: "Top shelf",
        source: "imported",
        confirmationState: "user-confirmed",
        validTo: null,
      },
    ],
  );
});

test("place normalization preserves valid accuracy and removes impossible claims", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const capturedAt = "2026-07-24T11:59:00.000Z";
  const normalized = normalizeWorkspace({
    ...personal,
    regions: [
      { id: "valid-region", name: "Valid region", lat: 25, lng: 51 },
      { id: "invalid-region", name: "Invalid region", lat: 91, lng: 51 },
    ],
    places: [
      {
        id: "boundary-place",
        name: "Boundary place",
        regionId: "valid-region",
        coordinates: { lat: 90, lng: -180 },
        locationSource: "device_gps",
        locationPrecision: "exact",
        horizontalAccuracyMeters: 4.5,
        locationCapturedAt: capturedAt,
        locationConfirmedAt: capturedAt,
      },
      {
        id: "invalid-point",
        name: "Invalid point",
        regionId: "valid-region",
        coordinates: { lat: 90.0001, lng: 51 },
        locationSource: "device_gps",
        locationPrecision: "exact",
        horizontalAccuracyMeters: 3,
        locationCapturedAt: capturedAt,
        locationConfirmedAt: capturedAt,
      },
      {
        id: "partial-point",
        name: "Partial point",
        regionId: "valid-region",
        coordinates: { lat: 25.2 },
        locationSource: "geocoder",
        locationPrecision: "approximate",
        horizontalAccuracyMeters: 100,
      },
      {
        id: "unknown-source",
        name: "Unknown source",
        regionId: "valid-region",
        coordinates: { lat: 25.2, lng: 51.4 },
        locationSource: "not_set",
        locationPrecision: "exact",
      },
      {
        id: "user-placed-point",
        name: "User-placed point",
        regionId: "valid-region",
        coordinates: { lat: 25.25, lng: 51.45 },
        locationSource: "user_pin",
        locationPrecision: "user_placed",
        horizontalAccuracyMeters: 1,
        locationCapturedAt: capturedAt,
        locationConfirmedAt: capturedAt,
      },
    ],
    spaces: [],
    assets: [],
    evidence: [],
    tasks: [],
    activity: [],
  });

  assert.deepEqual(
    normalized.regions.map((region) => region.id),
    ["valid-region"],
  );
  const boundary = normalized.places.find(
    (place) => place.id === "boundary-place",
  );
  assert.deepEqual(boundary.coordinates, { lat: 90, lng: -180 });
  assert.equal(boundary.locationSource, "device_gps");
  assert.equal(boundary.locationPrecision, "exact");
  assert.equal(boundary.horizontalAccuracyMeters, 4.5);
  assert.equal(boundary.locationCapturedAt, capturedAt);
  assert.equal(boundary.locationConfirmedAt, capturedAt);

  for (const id of ["invalid-point", "partial-point"]) {
    const place = normalized.places.find((candidate) => candidate.id === id);
    assert.deepEqual(place.coordinates, { lat: null, lng: null });
    assert.equal(place.locationSource, "not_set");
    assert.equal(place.locationPrecision, "locality_only");
    assert.equal(place.horizontalAccuracyMeters, null);
    assert.equal(place.locationCapturedAt, null);
    assert.equal(place.locationConfirmedAt, null);
  }
  assert.equal(
    normalized.places.find((place) => place.id === "unknown-source")
      .locationSource,
    "imported",
  );
  const userPlaced = normalized.places.find(
    (place) => place.id === "user-placed-point",
  );
  assert.equal(userPlaced.locationPrecision, "user_placed");
  assert.equal(userPlaced.horizontalAccuracyMeters, null);
  assert.equal(userPlaced.locationConfirmedAt, capturedAt);
});

test("device GPS pins over 15 metres are recorded as approximate", () => {
  const base = createSampleWorkspace();
  const atThreshold = workspaceReducer(base, {
    type: "ADD_PLACE",
    place: {
      id: "gps-at-threshold",
      name: "GPS at threshold",
      regionId: "doha",
      coordinates: { lat: 25.2854, lng: 51.531 },
      locationSource: "device_gps",
      locationPrecision: "exact",
      horizontalAccuracyMeters: 15,
    },
    now: NOW,
  });
  const overThreshold = workspaceReducer(atThreshold, {
    type: "ADD_PLACE",
    place: {
      id: "gps-over-threshold",
      name: "GPS over threshold",
      regionId: "doha",
      coordinates: { lat: 25.2855, lng: 51.5311 },
      locationSource: "device_gps",
      locationPrecision: "exact",
      horizontalAccuracyMeters: 15.01,
    },
    now: "2026-07-24T12:01:00.000Z",
  });

  assert.equal(
    overThreshold.places.find((place) => place.id === "gps-at-threshold")
      .locationPrecision,
    "exact",
  );
  assert.equal(
    overThreshold.places.find((place) => place.id === "gps-over-threshold")
      .locationPrecision,
    "approximate",
  );
});

test("moving an asset closes the active assignment and preserves ordered history", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withFirstPlace = workspaceReducer(personal, {
    type: "ADD_PLACE",
    place: {
      id: "history-home",
      name: "History home",
      regionId: "history-home-region",
      regionName: "Doha",
      coordinates: { lat: 25.2854, lng: 51.531 },
    },
    now: NOW,
  });
  const withSecondPlace = workspaceReducer(withFirstPlace, {
    type: "ADD_PLACE",
    place: {
      id: "history-store",
      name: "History store",
      regionId: "history-store-region",
      regionName: "Al Rayyan",
      coordinates: { lat: 25.2919, lng: 51.4244 },
    },
    now: "2026-07-24T12:01:00.000Z",
  });
  const withAsset = workspaceReducer(withSecondPlace, {
    type: "ADD_ASSET",
    asset: {
      id: "history-watch",
      name: "History watch",
      categoryId: "collectibles.watches",
      category: "Watch",
      placeId: "history-home",
      locationDetail: "Bedside drawer",
      requiredProofTypes: [],
    },
    now: "2026-07-24T12:02:00.000Z",
  });
  const firstMoveAt = "2026-07-24T12:03:00.000Z";
  const moved = workspaceReducer(withAsset, {
    type: "MOVE_ASSET",
    assetId: "history-watch",
    placeId: "history-store",
    locationDetail: "Locker 8",
    assignmentId: "history-move-one",
    source: "user_pin",
    now: firstMoveAt,
  });

  const firstHistory = selectAssetLocationHistory(moved, "history-watch");
  assert.equal(firstHistory.length, 2);
  assert.equal(firstHistory[0].id, "history-move-one");
  assert.equal(firstHistory[0].validTo, null);
  assert.equal(firstHistory[0].placeId, "history-store");
  assert.equal(firstHistory[1].validTo, firstMoveAt);
  assert.equal(
    firstHistory.filter((assignment) => assignment.validTo === null).length,
    1,
  );

  const secondMoveAt = "2026-07-24T12:04:00.000Z";
  const unknown = workspaceReducer(moved, {
    type: "MOVE_ASSET",
    assetId: "history-watch",
    placeId: null,
    locationMode: "unknown",
    locationStatus: "unknown",
    assignmentId: "history-move-two",
    source: "imported",
    now: secondMoveAt,
  });
  const secondHistory = selectAssetLocationHistory(unknown, "history-watch");
  assert.equal(secondHistory.length, 3);
  assert.equal(secondHistory[0].id, "history-move-two");
  assert.equal(secondHistory[0].validTo, null);
  assert.equal(secondHistory[1].id, "history-move-one");
  assert.equal(secondHistory[1].validTo, secondMoveAt);
  assert.equal(
    secondHistory.filter((assignment) => assignment.validTo === null).length,
    1,
  );
  assert.strictEqual(
    workspaceReducer(unknown, {
      type: "MOVE_ASSET",
      assetId: "history-watch",
      placeId: null,
      locationMode: "unknown",
      locationStatus: "unknown",
      now: "2026-07-24T12:05:00.000Z",
    }),
    unknown,
  );
});

test("nested space paths survive normalization while cycles lose one edge", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const normalized = normalizeWorkspace({
    ...personal,
    regions: [
      { id: "space-region", name: "Space region", lat: 25, lng: 51 },
    ],
    places: [
      {
        id: "space-home",
        name: "Space home",
        regionId: "space-region",
        coordinates: { lat: 25, lng: 51 },
      },
      {
        id: "space-store",
        name: "Space store",
        regionId: "space-region",
        coordinates: { lat: 25.1, lng: 51.1 },
      },
    ],
    spaces: [
      { id: "room", placeId: "space-home", name: "Room" },
      {
        id: "cabinet",
        placeId: "space-home",
        parentSpaceId: "room",
        name: "Cabinet",
      },
      {
        id: "drawer",
        placeId: "space-home",
        parentSpaceId: "cabinet",
        name: "Drawer",
      },
      {
        id: "other-root",
        placeId: "space-store",
        name: "Other root",
      },
      {
        id: "cross-place",
        placeId: "space-home",
        parentSpaceId: "other-root",
        name: "Cross place",
      },
      {
        id: "self-cycle",
        placeId: "space-home",
        parentSpaceId: "self-cycle",
        name: "Self cycle",
      },
      {
        id: "cycle-a",
        placeId: "space-home",
        parentSpaceId: "cycle-b",
        name: "Cycle A",
      },
      {
        id: "cycle-b",
        placeId: "space-home",
        parentSpaceId: "cycle-c",
        name: "Cycle B",
      },
      {
        id: "cycle-c",
        placeId: "space-home",
        parentSpaceId: "cycle-a",
        name: "Cycle C",
      },
      {
        id: "cycle-tail",
        placeId: "space-home",
        parentSpaceId: "cycle-a",
        name: "Cycle tail",
      },
    ],
    assets: [],
    evidence: [],
    tasks: [],
    activity: [],
  });

  assert.deepEqual(
    selectSpacePath(normalized, "drawer").map((space) => space.id),
    ["room", "cabinet", "drawer"],
  );
  assert.equal(
    normalized.spaces.find((space) => space.id === "cross-place")
      .parentSpaceId,
    null,
  );
  assert.equal(
    normalized.spaces.find((space) => space.id === "self-cycle")
      .parentSpaceId,
    null,
  );
  assert.equal(
    normalized.spaces.find((space) => space.id === "cycle-c").parentSpaceId,
    null,
  );
  assert.deepEqual(
    selectSpacePath(normalized, "cycle-tail").map((space) => space.id),
    ["cycle-c", "cycle-b", "cycle-a", "cycle-tail"],
  );
  assert.equal(
    new Set(selectSpacePath(normalized, "cycle-tail").map((space) => space.id))
      .size,
    4,
  );
});

test("collection normalization and membership commands keep asset IDs unique", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const withFirstAsset = workspaceReducer(personal, {
    type: "ADD_ASSET",
    asset: {
      id: "collection-camera",
      name: "Collection camera",
      categoryId: "collectibles.cameras",
      category: "Camera",
      requiredProofTypes: [],
    },
    now: NOW,
  });
  const withAssets = workspaceReducer(withFirstAsset, {
    type: "ADD_ASSET",
    asset: {
      id: "collection-watch",
      name: "Collection watch",
      categoryId: "collectibles.watches",
      category: "Watch",
      requiredProofTypes: [],
    },
    now: "2026-07-24T12:01:00.000Z",
  });
  const withCollection = workspaceReducer(withAssets, {
    type: "ADD_COLLECTION",
    collection: {
      id: "collection-favorites",
      name: "Favorites",
      assetIds: [
        "collection-camera",
        "collection-camera",
        "missing-asset",
      ],
      featuredAssetIds: [
        "collection-camera",
        "collection-camera",
        "missing-asset",
      ],
      coverAssetId: "missing-asset",
    },
    now: "2026-07-24T12:02:00.000Z",
  });
  const collection = withCollection.collections.find(
    (item) => item.id === "collection-favorites",
  );
  assert.deepEqual(collection.assetIds, ["collection-camera"]);
  assert.deepEqual(collection.featuredAssetIds, ["collection-camera"]);
  assert.equal(collection.coverAssetId, "collection-camera");
  assert.strictEqual(
    workspaceReducer(withCollection, {
      type: "ADD_COLLECTION_MEMBER",
      collectionId: collection.id,
      assetId: "collection-camera",
      now: "2026-07-24T12:03:00.000Z",
    }),
    withCollection,
  );

  const added = workspaceReducer(withCollection, {
    type: "ADD_COLLECTION_MEMBER",
    collectionId: collection.id,
    assetId: "collection-watch",
    now: "2026-07-24T12:03:00.000Z",
  });
  assert.deepEqual(
    added.collections.find((item) => item.id === collection.id).assetIds,
    ["collection-camera", "collection-watch"],
  );
  assert.strictEqual(
    workspaceReducer(added, {
      type: "ADD_COLLECTION_MEMBER",
      collectionId: collection.id,
      assetId: "collection-watch",
      now: "2026-07-24T12:04:00.000Z",
    }),
    added,
  );

  const removed = workspaceReducer(added, {
    type: "REMOVE_COLLECTION_MEMBER",
    collectionId: collection.id,
    assetId: "collection-camera",
    now: "2026-07-24T12:05:00.000Z",
  });
  const afterRemoval = removed.collections.find(
    (item) => item.id === collection.id,
  );
  assert.deepEqual(afterRemoval.assetIds, ["collection-watch"]);
  assert.equal(afterRemoval.coverAssetId, "collection-watch");
});

test("place pins can be set exactly after save and cleared back to later", () => {
  const base = createSampleWorkspace();
  const createdAt = "2026-07-24T13:00:00.000Z";
  const addedLater = workspaceReducer(base, {
    type: "ADD_PLACE",
    place: {
      id: "pin-later-place",
      name: "Pin later place",
      kind: "storage",
      regionId: "doha",
      city: "Doha",
      formattedAddress: "Doha",
      coordinates: { lat: null, lng: null },
      locationSource: "not_set",
      locationPrecision: "locality_only",
      horizontalAccuracyMeters: null,
      locationCapturedAt: createdAt,
      locationConfirmedAt: null,
    },
    now: createdAt,
  });
  const laterPlace = addedLater.places.find(
    (place) => place.id === "pin-later-place",
  );
  assert.ok(laterPlace);
  assert.deepEqual(laterPlace.coordinates, { lat: null, lng: null });
  assert.equal(laterPlace.locationSource, "not_set");
  assert.equal(laterPlace.locationPrecision, "locality_only");
  assert.equal(laterPlace.horizontalAccuracyMeters, null);
  assert.equal(laterPlace.locationCapturedAt, null);
  assert.equal(laterPlace.locationConfirmedAt, null);

  const pinnedAt = "2026-07-24T13:05:00.000Z";
  const pinned = workspaceReducer(addedLater, {
    type: "UPDATE_PLACE",
    placeId: laterPlace.id,
    changes: {
      coordinates: { lat: 25.3176, lng: 51.5008 },
      formattedAddress: "Al Dafna, Doha",
      locationSource: "user_pin",
      locationPrecision: "exact",
      horizontalAccuracyMeters: 2.5,
      locationCapturedAt: pinnedAt,
      locationConfirmedAt: pinnedAt,
    },
    now: pinnedAt,
  });
  const exactPlace = pinned.places.find(
    (place) => place.id === laterPlace.id,
  );
  assert.deepEqual(exactPlace.coordinates, {
    lat: 25.3176,
    lng: 51.5008,
  });
  assert.equal(exactPlace.locationSource, "user_pin");
  assert.equal(exactPlace.locationPrecision, "exact");
  assert.equal(exactPlace.horizontalAccuracyMeters, 2.5);
  assert.equal(exactPlace.locationCapturedAt, pinnedAt);
  assert.equal(exactPlace.locationConfirmedAt, pinnedAt);
  assert.equal(exactPlace.address, "Al Dafna, Doha");
  assert.equal(exactPlace.createdAt, laterPlace.createdAt);
  assert.equal(exactPlace.updatedAt, pinnedAt);

  const clearedAt = "2026-07-24T13:10:00.000Z";
  const cleared = workspaceReducer(pinned, {
    type: "UPDATE_PLACE",
    placeId: exactPlace.id,
    changes: {
      coordinates: { lat: null, lng: null },
      formattedAddress: "Doha",
      locationSource: "not_set",
      locationPrecision: "locality_only",
      // Stale sensor metadata must not survive clearing the exact pin.
      horizontalAccuracyMeters: exactPlace.horizontalAccuracyMeters,
      locationCapturedAt: exactPlace.locationCapturedAt,
      locationConfirmedAt: null,
    },
    now: clearedAt,
  });
  const clearedPlace = cleared.places.find(
    (place) => place.id === exactPlace.id,
  );
  assert.deepEqual(clearedPlace.coordinates, { lat: null, lng: null });
  assert.equal(clearedPlace.locationSource, "not_set");
  assert.equal(clearedPlace.locationPrecision, "locality_only");
  assert.equal(clearedPlace.horizontalAccuracyMeters, null);
  assert.equal(clearedPlace.locationCapturedAt, null);
  assert.equal(clearedPlace.locationConfirmedAt, null);
  assert.equal(clearedPlace.address, "Doha");
  assert.equal(clearedPlace.createdAt, laterPlace.createdAt);
  assert.equal(clearedPlace.updatedAt, clearedAt);
});

test("a user-placed point can explicitly clear a stale geocoder address", () => {
  const movedAt = "2026-07-25T10:30:00.000Z";
  const moved = workspaceReducer(createSampleWorkspace(), {
    type: "UPDATE_PLACE",
    placeId: "family-archive",
    changes: {
      coordinates: { lat: 51.5007, lng: -0.1246 },
      formattedAddress: null,
      locationSource: "user_pin",
      locationPrecision: "user_placed",
      horizontalAccuracyMeters: null,
      locationCapturedAt: movedAt,
      locationConfirmedAt: movedAt,
    },
    now: movedAt,
  });
  const place = moved.places.find((item) => item.id === "family-archive");

  assert.equal(place.address, null);
  assert.equal(place.locationPrecision, "user_placed");
  assert.equal(place.horizontalAccuracyMeters, null);
  assert.equal(place.locationConfirmedAt, movedAt);
  const activeAssignment = moved.locationAssignments.find(
    (item) => item.placeId === "family-archive" && !item.validTo,
  );
  assert.equal(activeAssignment.placeSnapshot.locationPrecision, "user_placed");
  assert.equal(activeAssignment.placeSnapshot.horizontalAccuracyMeters, null);
});

test("location history snapshots preserve former pins and follow active Place corrections", () => {
  const base = createSampleWorkspace();
  const initialAssignment = base.locationAssignments.find(
    (item) => item.assetId === "gmt-master-ii" && !item.validTo,
  );
  assert.deepEqual(initialAssignment.placeSnapshot.coordinates, {
    lat: 25.3295,
    lng: 51.5309,
  });
  assert.equal(initialAssignment.placeSnapshot.name, "West Bay Home");

  const movedAt = "2026-07-24T13:20:00.000Z";
  const moved = workspaceReducer(base, {
    type: "MOVE_ASSET",
    assetId: "gmt-master-ii",
    placeId: "dubai-storage",
    locationStatus: "needs-detail",
    confirmationState: "suggested",
    now: movedAt,
  });
  const formerAssignment = moved.locationAssignments.find(
    (item) =>
      item.assetId === "gmt-master-ii" &&
      item.placeId === "west-bay-home" &&
      item.validTo === movedAt,
  );
  const activeAssignment = moved.locationAssignments.find(
    (item) =>
      item.assetId === "gmt-master-ii" &&
      item.placeId === "dubai-storage" &&
      !item.validTo,
  );
  assert.deepEqual(formerAssignment.placeSnapshot.coordinates, {
    lat: 25.3295,
    lng: 51.5309,
  });
  assert.deepEqual(activeAssignment.placeSnapshot.coordinates, {
    lat: 25.2048,
    lng: 55.2708,
  });

  const correctedFormerPlace = workspaceReducer(moved, {
    type: "UPDATE_PLACE",
    placeId: "west-bay-home",
    changes: {
      coordinates: { lat: 25.33, lng: 51.531 },
      formattedAddress: "Corrected West Bay pin",
      locationSource: "user_pin",
      locationPrecision: "exact",
    },
    now: "2026-07-24T13:25:00.000Z",
  });
  const preservedFormerAssignment =
    correctedFormerPlace.locationAssignments.find(
      (item) => item.id === formerAssignment.id,
    );
  assert.deepEqual(preservedFormerAssignment.placeSnapshot.coordinates, {
    lat: 25.3295,
    lng: 51.5309,
  });
  assert.equal(
    preservedFormerAssignment.placeSnapshot.formattedAddress,
    "West Bay, Doha",
  );

  const correctedCurrentPlace = workspaceReducer(correctedFormerPlace, {
    type: "UPDATE_PLACE",
    placeId: "dubai-storage",
    changes: {
      coordinates: { lat: 25.2051, lng: 55.2712 },
      formattedAddress: "Corrected Dubai storage pin",
      locationSource: "user_pin",
      locationPrecision: "exact",
      horizontalAccuracyMeters: 3,
    },
    now: "2026-07-24T13:30:00.000Z",
  });
  const closedActiveAssignment =
    correctedCurrentPlace.locationAssignments.find(
      (item) => item.id === activeAssignment.id,
    );
  assert.equal(
    closedActiveAssignment.validTo,
    "2026-07-24T13:30:00.000Z",
  );
  assert.deepEqual(closedActiveAssignment.placeSnapshot.coordinates, {
    lat: 25.2048,
    lng: 55.2708,
  });
  const correctedActiveAssignment =
    correctedCurrentPlace.locationAssignments.find(
      (item) =>
        item.assetId === "gmt-master-ii" &&
        item.placeId === "dubai-storage" &&
        !item.validTo,
    );
  assert.notEqual(correctedActiveAssignment.id, activeAssignment.id);
  assert.equal(
    correctedActiveAssignment.reason,
    "Place pin or address corrected",
  );
  assert.deepEqual(correctedActiveAssignment.placeSnapshot.coordinates, {
    lat: 25.2051,
    lng: 55.2712,
  });
  assert.equal(
    correctedActiveAssignment.placeSnapshot.formattedAddress,
    "Corrected Dubai storage pin",
  );
  assert.equal(
    correctedActiveAssignment.placeSnapshot.horizontalAccuracyMeters,
    3,
  );
});

test("successful Search retrieval is actor-attributed, private, and idempotent per record", () => {
  const sample = createSampleWorkspace();
  const retrieved = workspaceReducer(sample, {
    type: "RECORD_RETRIEVAL",
    id: "activity-search-gmt",
    memberId: "member-sara",
    entityType: "asset",
    entityId: "gmt-master-ii",
    title: "Retrieved GMT Master II through Search",
    now: "2026-07-25T12:00:00.000Z",
  });
  assert.equal(retrieved.activity.length, sample.activity.length + 1);
  assert.deepEqual(retrieved.activity[0], {
    id: "activity-search-gmt",
    type: "search-retrieval",
    title: "Retrieved GMT Master II through Search",
    detail: "Opened from private workspace Search.",
    memberId: "member-sara",
    entityType: "asset",
    entityId: "gmt-master-ii",
    occurredAt: "2026-07-25T12:00:00.000Z",
  });
  assert.strictEqual(
    workspaceReducer(retrieved, {
      type: "RECORD_RETRIEVAL",
      memberId: "member-sara",
      entityType: "asset",
      entityId: "gmt-master-ii",
      title: "Retrieved the same record again",
      now: "2026-07-25T12:01:00.000Z",
    }),
    retrieved,
  );
  assert.strictEqual(
    workspaceReducer(retrieved, {
      type: "RECORD_RETRIEVAL",
      memberId: "member-outsider",
      entityType: "place",
      entityId: "west-bay-home",
      title: "Invalid actor retrieval",
      now: "2026-07-25T12:02:00.000Z",
    }),
    retrieved,
  );
});

test("asset-label assignments persist in the canonical workspace snapshot", () => {
  const sample = createSampleWorkspace();
  const ownerId = sample.household.ownerMemberId;
  const withLabel = workspaceReducer(sample, {
    type: "SET_ASSET_LABEL_REGISTRY",
    registry: {
      schemaVersion: 1,
      householdId: sample.household.id,
      assignments: [
        {
          id: "label-assignment-01",
          labelId: "lbl_0123456789abcdef",
          assetId: "gmt-master-ii",
          assignedBy: ownerId,
          assignedAt: NOW,
          endedAt: null,
          endedBy: null,
          source: "qr",
        },
      ],
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    now: NOW,
  });

  assert.equal(withLabel.assetLabelRegistry.assignments.length, 1);
  assert.equal(
    withLabel.assetLabelRegistry.assignments[0].assetId,
    "gmt-master-ii",
  );
  const rehydrated = normalizeWorkspace(
    JSON.parse(JSON.stringify(withLabel)),
  );
  assert.deepEqual(
    rehydrated.assetLabelRegistry.assignments,
    withLabel.assetLabelRegistry.assignments,
  );
});

test("canonical workspace reconciliation keeps one eligible mutual property projection", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const ownerMemberId = personal.household.ownerMemberId;
  const normalized = normalizeWorkspace({
    ...personal,
    regions: [
      {
        id: "doha",
        name: "Doha",
        lat: 25.2854,
        lng: 51.531,
      },
    ],
    places: [
      {
        id: "owned-home",
        name: "Owned home",
        kind: "home",
        regionId: "doha",
        tenure: "co-owner",
        propertyAssetId: "home-passport",
      },
      {
        id: "competing-home",
        name: "Competing claim",
        kind: "home",
        regionId: "doha",
        tenure: "owned",
        propertyAssetId: "home-passport",
      },
      {
        id: "rented-home",
        name: "Rented home",
        kind: "apartment",
        regionId: "doha",
        tenure: "rented",
        propertyAssetId: "rented-passport",
      },
    ],
    assets: [
      {
        id: "home-passport",
        name: "Owned home passport",
        categoryId: "property.house",
        kind: "real-estate",
        placeId: "owned-home",
        propertyPlaceId: "owned-home",
        ownerMemberId,
        lifecycleStatus: "active",
      },
      {
        id: "rented-passport",
        name: "Invalid rented passport",
        categoryId: "property.apartment",
        kind: "real-estate",
        placeId: "rented-home",
        propertyPlaceId: "rented-home",
        ownerMemberId,
        lifecycleStatus: "active",
      },
    ],
    locationAssignments: [],
  });

  assert.equal(
    normalized.places.find((place) => place.id === "owned-home").tenure,
    "co_owned",
  );
  assert.equal(
    normalized.places.find((place) => place.id === "owned-home")
      .propertyAssetId,
    "home-passport",
  );
  assert.equal(
    normalized.assets.find((asset) => asset.id === "home-passport")
      .propertyPlaceId,
    "owned-home",
  );
  assert.equal(
    normalized.places.find((place) => place.id === "competing-home")
      .propertyAssetId,
    null,
  );
  assert.equal(
    normalized.places.find((place) => place.id === "rented-home")
      .propertyAssetId,
    null,
  );
  assert.equal(
    normalized.assets.find((asset) => asset.id === "rented-passport")
      .propertyPlaceId,
    null,
  );
});

test("owned Place creation atomically creates exactly one linked property passport", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const ownerMemberId = personal.household.ownerMemberId;
  const command = {
    type: "ADD_PLACE",
    memberId: ownerMemberId,
    place: {
      id: "lusail-apartment-place",
      name: "Lusail apartment",
      kind: "Apartment",
      tenure: "owned",
      regionId: "lusail",
      regionName: "Lusail",
      city: "Lusail",
      regionCoordinates: { lat: 25.4209, lng: 51.4907 },
      coordinates: { lat: 25.423, lng: 51.493 },
      locationSource: "user_pin",
      locationPrecision: "user_placed",
      locationConfirmedAt: NOW,
    },
    createPropertyAsset: true,
    propertyAsset: {
      id: "lusail-apartment-passport",
      name: "Lusail apartment passport",
    },
    now: NOW,
  };
  const created = workspaceReducer(personal, command);
  const place = created.places.find(
    (item) => item.id === "lusail-apartment-place",
  );
  const linkedAssets = created.assets.filter(
    (item) => item.propertyPlaceId === place?.id,
  );
  const passport = linkedAssets[0];
  const assignment = created.locationAssignments.find(
    (item) => item.assetId === passport?.id && !item.validTo,
  );

  assert.equal(created.meta.revision, personal.meta.revision + 1);
  assert.equal(created.places.length, personal.places.length + 1);
  assert.equal(created.assets.length, personal.assets.length + 1);
  assert.equal(linkedAssets.length, 1);
  assert.equal(place.propertyAssetId, passport.id);
  assert.equal(passport.categoryId, "property.apartment");
  assert.equal(passport.kind, "real-estate");
  assert.equal(passport.locationStatus, "known");
  assert.equal(passport.placeId, place.id);
  assert.equal(assignment.createdByMemberId, ownerMemberId);
  assert.equal(assignment.confirmationState, "user-confirmed");
  assert.strictEqual(workspaceReducer(created, command), created);

  assert.strictEqual(
    workspaceReducer(personal, {
      ...command,
      memberId: "member-outside-workspace",
    }),
    personal,
  );
  assert.strictEqual(
    workspaceReducer(personal, {
      ...command,
      place: {
        ...command.place,
        id: "rented-property-place",
        tenure: "rented",
      },
      propertyAsset: {
        id: "rented-property-passport",
      },
    }),
    personal,
  );
});

test("an existing owned Place can atomically create one repair passport", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const ownerMemberId = personal.household.ownerMemberId;
  const withPlace = workspaceReducer(personal, {
    type: "ADD_PLACE",
    memberId: ownerMemberId,
    place: {
      id: "legacy-owned-villa",
      name: "Legacy owned villa",
      kind: "villa",
      tenure: "owned",
      regionId: "doha",
      regionName: "Doha",
      city: "Doha",
      coordinates: { lat: 25.33, lng: 51.52 },
      locationSource: "user_pin",
      locationPrecision: "user_placed",
      locationConfirmedAt: NOW,
    },
    now: NOW,
  });
  const command = {
    type: "CREATE_PROPERTY_PROJECTION",
    memberId: ownerMemberId,
    placeId: "legacy-owned-villa",
    propertyAsset: {
      id: "legacy-owned-villa-passport",
      name: "Legacy owned villa passport",
      locationAssignmentId:
        "location-legacy-owned-villa-passport",
    },
    now: "2026-07-24T12:10:00.000Z",
  };
  const repaired = workspaceReducer(withPlace, command);
  const place = repaired.places.find(
    (item) => item.id === "legacy-owned-villa",
  );
  const passport = repaired.assets.find(
    (item) => item.id === "legacy-owned-villa-passport",
  );
  const assignment = repaired.locationAssignments.find(
    (item) => item.assetId === passport.id && !item.validTo,
  );

  assert.equal(repaired.meta.revision, withPlace.meta.revision + 1);
  assert.equal(place.propertyAssetId, passport.id);
  assert.equal(passport.propertyPlaceId, place.id);
  assert.equal(passport.categoryId, "property.house");
  assert.equal(passport.locationStatus, "known");
  assert.equal(assignment.id, "location-legacy-owned-villa-passport");
  assert.equal(assignment.createdByMemberId, ownerMemberId);
  assert.strictEqual(workspaceReducer(repaired, command), repaired);

  const rented = workspaceReducer(personal, {
    type: "ADD_PLACE",
    memberId: ownerMemberId,
    place: {
      id: "rented-repair-place",
      name: "Rented repair place",
      kind: "apartment",
      tenure: "rented",
      regionId: "doha",
      regionName: "Doha",
      city: "Doha",
    },
    now: NOW,
  });
  assert.strictEqual(
    workspaceReducer(rented, {
      ...command,
      placeId: "rented-repair-place",
      propertyAsset: {
        ...command.propertyAsset,
        id: "rented-repair-passport",
      },
    }),
    rented,
  );
});

test("property projection commands are mutual and tenure or category changes unlink immediately", () => {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    now: NOW,
  });
  const ownerMemberId = personal.household.ownerMemberId;
  const linked = workspaceReducer(personal, {
    type: "ADD_PLACE",
    memberId: ownerMemberId,
    place: {
      id: "owned-office-place",
      name: "Owned office",
      kind: "Office",
      tenure: "owned",
      regionId: "west-bay",
      regionName: "West Bay",
      city: "Doha",
      regionCoordinates: { lat: 25.327, lng: 51.531 },
      coordinates: { lat: 25.327, lng: 51.531 },
    },
    createPropertyAsset: true,
    propertyAsset: {
      id: "owned-office-passport",
      name: "Owned office passport",
    },
    now: NOW,
  });
  const unlinked = workspaceReducer(linked, {
    type: "UNLINK_PROPERTY_PROJECTION",
    memberId: ownerMemberId,
    placeId: "owned-office-place",
    assetId: "owned-office-passport",
    now: "2026-07-24T12:01:00.000Z",
  });
  assert.equal(unlinked.meta.revision, linked.meta.revision + 1);
  assert.equal(
    unlinked.places.find((item) => item.id === "owned-office-place")
      .propertyAssetId,
    null,
  );
  assert.equal(
    unlinked.assets.find((item) => item.id === "owned-office-passport")
      .propertyPlaceId,
    null,
  );

  const relinked = workspaceReducer(unlinked, {
    type: "LINK_PROPERTY_PROJECTION",
    memberId: ownerMemberId,
    placeId: "owned-office-place",
    assetId: "owned-office-passport",
    now: "2026-07-24T12:02:00.000Z",
  });
  assert.equal(relinked.meta.revision, unlinked.meta.revision + 1);
  assert.equal(
    relinked.places.find((item) => item.id === "owned-office-place")
      .propertyAssetId,
    "owned-office-passport",
  );
  assert.equal(
    relinked.assets.find((item) => item.id === "owned-office-passport")
      .propertyPlaceId,
    "owned-office-place",
  );
  assert.strictEqual(
    workspaceReducer(unlinked, {
      type: "LINK_PROPERTY_PROJECTION",
      memberId: "member-outside-workspace",
      placeId: "owned-office-place",
      assetId: "owned-office-passport",
      now: "2026-07-24T12:02:00.000Z",
    }),
    unlinked,
  );

  const rented = workspaceReducer(relinked, {
    type: "UPDATE_PLACE",
    memberId: ownerMemberId,
    placeId: "owned-office-place",
    changes: { tenure: "managed" },
    now: "2026-07-24T12:03:00.000Z",
  });
  assert.equal(
    rented.places.find((item) => item.id === "owned-office-place")
      .propertyAssetId,
    null,
  );
  assert.equal(
    rented.assets.find((item) => item.id === "owned-office-passport")
      .propertyPlaceId,
    null,
  );
  assert.ok(
    rented.assets.some((item) => item.id === "owned-office-passport"),
  );
  assert.strictEqual(
    workspaceReducer(rented, {
      type: "LINK_PROPERTY_PROJECTION",
      memberId: ownerMemberId,
      placeId: "owned-office-place",
      assetId: "owned-office-passport",
      now: "2026-07-24T12:04:00.000Z",
    }),
    rented,
  );

  const relinkable = workspaceReducer(rented, {
    type: "UPDATE_PLACE",
    memberId: ownerMemberId,
    placeId: "owned-office-place",
    changes: { tenure: "owned" },
    now: "2026-07-24T12:05:00.000Z",
  });
  const relinkedAgain = workspaceReducer(relinkable, {
    type: "LINK_PROPERTY_PROJECTION",
    memberId: ownerMemberId,
    placeId: "owned-office-place",
    assetId: "owned-office-passport",
    now: "2026-07-24T12:06:00.000Z",
  });
  const recategorized = workspaceReducer(relinkedAgain, {
    type: "UPDATE_ASSET",
    assetId: "owned-office-passport",
    changes: {
      categoryId: "custom.other",
      category: "Other",
      kind: "physical",
    },
    now: "2026-07-24T12:07:00.000Z",
  });
  assert.equal(
    recategorized.places.find((item) => item.id === "owned-office-place")
      .propertyAssetId,
    null,
  );
  assert.equal(
    recategorized.assets.find((item) => item.id === "owned-office-passport")
      .propertyPlaceId,
    null,
  );
});
