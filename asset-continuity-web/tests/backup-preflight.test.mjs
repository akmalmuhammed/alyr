import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  assessBrowserStorageCapacity,
  projectRecoveryKitCapacity,
  runBackupPreflight,
  runRestorePreflight,
} from "../src/backupPreflight.js";
import {
  MAX_RECOVERY_PLAINTEXT_BYTES,
  createEncryptedRecoveryKit,
  createOriginalVersionId,
} from "../src/recoveryKit.js";

const NOW = "2026-07-25T08:30:00.000Z";

function checksum(value) {
  return createHash("sha256").update(value).digest("hex");
}

function evidenceRecord(id, name, bytes) {
  return {
    id,
    type: "Current document copy",
    fileName: name,
    fileType: "text/plain",
    fileSize: bytes.byteLength,
    fileChecksum: checksum(bytes),
    fileState: "ready_local",
    storageScope: "local-device",
  };
}

function workspaceFixture() {
  const receipt = Buffer.from("receipt bytes");
  const deed = Buffer.from("deed bytes");
  return {
    version: 4,
    mode: "personal",
    household: { id: "household-private", name: "Private household" },
    evidence: [
      evidenceRecord("evidence-receipt", "receipt.txt", receipt),
      evidenceRecord("evidence-deed", "deed.txt", deed),
    ],
  };
}

async function storedRecord(evidence, bytes, overrides = {}) {
  const fileChecksum = checksum(bytes);
  return {
    id: evidence.id,
    blob: new Blob([bytes], { type: evidence.fileType }),
    fileName: evidence.fileName,
    fileType: evidence.fileType,
    fileSize: bytes.byteLength,
    fileChecksum,
    originalVersionId: await createOriginalVersionId(
      evidence.id,
      fileChecksum,
    ),
    ...overrides,
  };
}

const noDrafts = async () => [];
const noStorage = null;

test("backup preflight reports exact partial coverage, named missing originals, versions, and excluded drafts", async () => {
  const workspace = workspaceFixture();
  const receiptBytes = Buffer.from("receipt bytes");
  const receipt = await storedRecord(workspace.evidence[0], receiptBytes);
  const localStorage = {
    getItem(key) {
      return key.includes("capture-draft")
        ? JSON.stringify({ version: 2, hasFile: true })
        : null;
    },
  };

  const result = await runBackupPreflight({
    workspace,
    storageScopeId: "local-demo",
    storage: localStorage,
    loadEvidenceFile: async (evidenceId) =>
      evidenceId === "evidence-receipt" ? receipt : null,
    listRoomDrafts: async () => [
      {
        sessionId: "room-draft-1",
        status: "paused",
        itemCount: 2,
        totalBytes: 2048,
      },
      {
        sessionId: "room-finished",
        status: "committed",
        itemCount: 1,
        totalBytes: 500,
      },
    ],
    estimateStorage: async () => ({ quota: 1_000_000, usage: 0 }),
    now: NOW,
  });

  assert.equal(result.status, "partial");
  assert.deepEqual(
    {
      status: result.coverage.status,
      referenced: result.coverage.referencedOriginalCount,
      included: result.coverage.includedOriginalCount,
      missing: result.coverage.missingOriginalCount,
      integrity: result.coverage.integrityFailureCount,
      bytes: result.coverage.originalBytes,
    },
    {
      status: "partial",
      referenced: 2,
      included: 1,
      missing: 1,
      integrity: 0,
      bytes: receiptBytes.byteLength,
    },
  );
  assert.deepEqual(result.coverage.missing, [
    {
      evidenceId: "evidence-deed",
      fileName: "deed.txt",
      reason: "not_stored_on_this_device",
      message:
        "The workspace references this original, but its bytes are not stored in this browser.",
    },
  ]);
  assert.match(result.originals[0].originalVersionId, /^ov_[a-f0-9]{64}$/u);
  assert.equal(
    result.originals[0].originalVersionId,
    result.coverage.originalVersionIds[0],
  );
  assert.deepEqual(
    {
      status: result.drafts.status,
      total: result.drafts.totalDraftCount,
      capture: result.drafts.captureDraftCount,
      rooms: result.drafts.roomDraftCount,
      files: result.drafts.fileCount,
      knownBytes: result.drafts.knownBytes,
      unknownFileBytes: result.drafts.unknownFileBytes,
    },
    {
      status: "known",
      total: 2,
      capture: 1,
      rooms: 1,
      files: 3,
      knownBytes: 2048,
      unknownFileBytes: 1,
    },
  );
  assert.equal(result.capacity.status, "ready");
  assert.equal(result.browserStorage.status, "adequate");
});

test("checksum corruption blocks backup and is never counted as a missing original", async () => {
  const workspace = workspaceFixture();
  const corrupt = await storedRecord(
    workspace.evidence[0],
    Buffer.from("changed bytes"),
    {
      fileChecksum: workspace.evidence[0].fileChecksum,
    },
  );

  const result = await runBackupPreflight({
    workspace: {
      ...workspace,
      evidence: [workspace.evidence[0]],
    },
    storageScopeId: "local-demo",
    storage: noStorage,
    loadEvidenceFile: async () => corrupt,
    listRoomDrafts: noDrafts,
    estimateStorage: null,
    now: NOW,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.coverage.status, "blocked");
  assert.equal(result.coverage.missingOriginalCount, 0);
  assert.equal(result.coverage.integrityFailureCount, 1);
  assert.equal(
    result.coverage.integrityFailures[0].reason,
    "checksum_mismatch",
  );
});

test("immutable version corruption blocks backup and is never counted as missing", async () => {
  const workspace = workspaceFixture();
  const bytes = Buffer.from("receipt bytes");
  const record = await storedRecord(workspace.evidence[0], bytes, {
    originalVersionId: `ov_${"f".repeat(64)}`,
  });

  const result = await runBackupPreflight({
    workspace: {
      ...workspace,
      evidence: [workspace.evidence[0]],
    },
    storageScopeId: "local-demo",
    storage: noStorage,
    loadEvidenceFile: async () => record,
    listRoomDrafts: noDrafts,
    estimateStorage: null,
    now: NOW,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.coverage.missingOriginalCount, 0);
  assert.equal(
    result.coverage.integrityFailures[0].reason,
    "version_mismatch",
  );
});

test("capacity projection blocks oversized plaintext before encryption", () => {
  const twentyMiB = 20 * 1024 * 1024;
  const originals = Array.from({ length: 4 }, (_, index) => ({
    evidenceId: `evidence-${index}`,
    originalVersionId: `ov_${String(index + 1).repeat(64)}`,
    fileName: `file-${index}.bin`,
    fileType: "application/octet-stream",
    fileSize: twentyMiB,
    fileChecksum: String(index + 1).repeat(64),
  }));
  const workspace = {
    household: { id: "household-capacity" },
    evidence: originals.map((original) => ({
      id: original.evidenceId,
      fileName: original.fileName,
      fileType: original.fileType,
      fileSize: original.fileSize,
      fileChecksum: original.fileChecksum,
    })),
  };

  const capacity = projectRecoveryKitCapacity({
    workspace,
    originals,
    now: NOW,
  });

  assert.equal(capacity.status, "blocked");
  assert.ok(
    capacity.projectedPlaintextBytes > MAX_RECOVERY_PLAINTEXT_BYTES,
  );
  assert.ok(
    capacity.blockingReasons.some(
      (failure) => failure.reason === "plaintext_limit_exceeded",
    ),
  );
  assert.equal(
    capacity.originalDataBase64Bytes,
    4 * Math.ceil(twentyMiB / 3) * 4,
  );
});

test("capacity projection matches the recovery-kit v2 serialized package shape", async () => {
  const workspace = workspaceFixture();
  workspace.evidence = [workspace.evidence[0]];
  const original = await storedRecord(
    workspace.evidence[0],
    Buffer.from("receipt bytes"),
  );
  const originals = [
    {
      evidenceId: workspace.evidence[0].id,
      originalVersionId: original.originalVersionId,
      fileName: original.fileName,
      fileType: original.fileType,
      fileSize: original.fileSize,
      fileChecksum: original.fileChecksum,
      blob: original.blob,
    },
  ];
  const capacity = projectRecoveryKitCapacity({
    workspace,
    originals,
    now: NOW,
  });
  const kit = await createEncryptedRecoveryKit({
    workspace,
    originals,
    passphrase: "a private recovery passphrase",
    now: NOW,
  });

  assert.equal(
    capacity.projectedPlaintextBytes,
    kit.envelope.plaintextBytes,
  );
  assert.equal(
    capacity.projectedPackageBytes,
    Buffer.byteLength(JSON.stringify(kit)),
  );
});

test("browser storage estimate reports unknown, insufficient, and adequate capacity without claiming certainty", async () => {
  const unknown = await assessBrowserStorageCapacity({
    requiredBytes: 100,
    estimateStorage: null,
  });
  const insufficient = await assessBrowserStorageCapacity({
    requiredBytes: 100,
    estimateStorage: async () => ({ quota: 1000, usage: 950 }),
  });
  const adequate = await assessBrowserStorageCapacity({
    requiredBytes: 100,
    estimateStorage: async () => ({ quota: 1000, usage: 900 }),
  });

  assert.deepEqual(unknown, {
    status: "unknown",
    reason: "storage_estimate_unavailable",
    requiredBytes: 100,
    quotaBytes: null,
    usageBytes: null,
    availableBytes: null,
    advisory: true,
  });
  assert.deepEqual(insufficient, {
    status: "insufficient",
    reason: "estimated_capacity_shortfall",
    requiredBytes: 100,
    quotaBytes: 1000,
    usageBytes: 950,
    availableBytes: 50,
    advisory: true,
  });
  assert.deepEqual(adequate, {
    status: "adequate",
    reason: "estimated_capacity_available",
    requiredBytes: 100,
    quotaBytes: 1000,
    usageBytes: 900,
    availableBytes: 100,
    advisory: true,
  });
});

test("restore preflight preserves authenticated partial coverage and blocks declaration drift", async () => {
  const workspace = workspaceFixture();
  const receiptBytes = Buffer.from("receipt bytes");
  const receipt = await storedRecord(workspace.evidence[0], receiptBytes);
  const recovered = {
    workspace,
    originals: [
      {
        evidenceId: workspace.evidence[0].id,
        ...receipt,
      },
    ],
    manifest: [
      {
        evidenceId: workspace.evidence[0].id,
        originalVersionId: receipt.originalVersionId,
        fileName: receipt.fileName,
        fileType: receipt.fileType,
        fileSize: receipt.fileSize,
        fileChecksum: receipt.fileChecksum,
      },
    ],
    coverage: {
      referencedOriginalCount: 2,
      includedOriginalCount: 1,
      missingOriginalCount: 1,
      originalBytes: receipt.fileSize,
      originalVersionIds: [receipt.originalVersionId],
    },
  };

  const partial = await runRestorePreflight({
    recovered,
    estimateStorage: null,
  });
  assert.equal(partial.status, "partial");
  assert.equal(partial.coverage.missingOriginalCount, 1);
  assert.equal(partial.coverage.integrityFailureCount, 0);

  const drifted = await runRestorePreflight({
    recovered: {
      ...recovered,
      coverage: {
        ...recovered.coverage,
        includedOriginalCount: 2,
      },
    },
    estimateStorage: null,
  });
  assert.equal(drifted.status, "blocked");
  assert.ok(
    drifted.coverage.integrityFailures.some(
      (failure) => failure.reason === "restore_coverage_mismatch",
    ),
  );
});
