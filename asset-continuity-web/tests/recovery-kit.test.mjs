import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  RECOVERY_KIT_FORMAT,
  RECOVERY_KIT_PAYLOAD_VERSION,
  RecoveryKitError,
  createEncryptedRecoveryKit,
  decryptEncryptedRecoveryKit,
  parseEncryptedRecoveryKit,
} from "../src/recoveryKit.js";
import { SNAPSHOT_VERSION } from "../src/domain.js";
import {
  decryptVaultBytes,
  encryptVaultBytes,
} from "../src/securityVault.js";

const TEST_ITERATIONS = 100_000;
const PASSPHRASE = "a long private recovery phrase";
const NOW = "2026-07-25T08:30:00.000Z";
const RECEIPT_TEXT = "private receipt bytes";
const RECEIPT_BYTES = Buffer.from(RECEIPT_TEXT, "utf8");
const RECEIPT_CHECKSUM = createHash("sha256")
  .update(RECEIPT_BYTES)
  .digest("hex");

function workspaceFixture() {
  return {
    version: SNAPSHOT_VERSION,
    mode: "personal",
    household: {
      id: "household-private",
      name: "Akmal household",
    },
    assets: [
      {
        id: "asset-watch",
        householdId: "household-private",
        name: "Private watch name",
      },
    ],
    evidence: [
      {
        id: "evidence-receipt",
        householdId: "household-private",
        assetId: "asset-watch",
        type: "Purchase receipt",
        fileName: "private-receipt.txt",
        fileType: "text/plain",
        fileSize: RECEIPT_BYTES.byteLength,
        fileChecksum: RECEIPT_CHECKSUM,
        fileState: "ready_local",
        storageScope: "local-device",
      },
      {
        id: "evidence-missing",
        householdId: "household-private",
        assetId: "asset-watch",
        type: "Service record",
        fileName: "missing-service.pdf",
        fileType: "application/pdf",
        fileSize: 1_024,
        fileChecksum: "a".repeat(64),
        fileState: "ready_local",
        storageScope: "local-device",
      },
    ],
  };
}

function receiptOriginal(overrides = {}) {
  return {
    evidenceId: "evidence-receipt",
    fileName: "private-receipt.txt",
    fileType: "text/plain",
    blob: new Blob([RECEIPT_BYTES], { type: "text/plain" }),
    ...overrides,
  };
}

async function createFixtureKit({
  workspace = workspaceFixture(),
  originals = [receiptOriginal()],
} = {}) {
  return createEncryptedRecoveryKit({
    workspace,
    originals,
    passphrase: PASSPHRASE,
    iterations: TEST_ITERATIONS,
    now: NOW,
  });
}

async function decryptPayload(kit) {
  const bytes = await decryptVaultBytes(kit.envelope, PASSPHRASE, {
    expectedContext: kit.envelope.context,
  });
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function sealPayload(kit, payload) {
  const envelope = await encryptVaultBytes(
    new TextEncoder().encode(JSON.stringify(payload)),
    PASSPHRASE,
    kit.envelope.context,
    {
      iterations: TEST_ITERATIONS,
      now: kit.createdAt,
    },
  );
  return {
    ...kit,
    envelope,
  };
}

async function mutateFixtureKit(mutator) {
  const kit = await createFixtureKit();
  const payload = await decryptPayload(kit);
  await mutator(payload);
  return sealPayload(kit, payload);
}

function rejectsWithCode(code) {
  return (error) =>
    error instanceof RecoveryKitError && error.code === code;
}

test("recovery kit exposes only opaque envelope metadata", async () => {
  const kit = await createFixtureKit();
  const serialized = JSON.stringify(kit);

  assert.equal(kit.format, RECOVERY_KIT_FORMAT);
  assert.equal(kit.createdAt, NOW);
  assert.doesNotMatch(serialized, /Private watch name/);
  assert.doesNotMatch(serialized, /private-receipt\.txt/);
  assert.doesNotMatch(serialized, /private receipt bytes/);
  assert.equal(kit.envelope.context.purpose, "portable-recovery-kit");
});

test("recovery kit restores exact workspace identity and original bytes", async () => {
  const kit = await createFixtureKit();
  const recovered = await decryptEncryptedRecoveryKit(kit, PASSPHRASE);
  const evidence = recovered.workspace.evidence[0];
  const original = recovered.originals[0];

  assert.equal(recovered.workspace.household.name, "Akmal household");
  assert.equal(recovered.originals.length, 1);
  assert.equal(original.evidenceId, "evidence-receipt");
  assert.match(original.originalVersionId, /^ov_[a-f0-9]{64}$/u);
  assert.equal(original.originalVersionId, evidence.originalVersionId);
  assert.equal(original.fileChecksum, RECEIPT_CHECKSUM);
  assert.equal(original.fileChecksum, evidence.fileChecksum);
  assert.equal(original.fileName, evidence.fileName);
  assert.equal(original.fileType, evidence.fileType);
  assert.equal(original.fileSize, evidence.fileSize);
  assert.equal(await original.blob.text(), RECEIPT_TEXT);
  assert.equal(evidence.fileState, "ready_local");
  assert.deepEqual(recovered.manifest, [
    {
      evidenceId: original.evidenceId,
      originalVersionId: original.originalVersionId,
      fileName: original.fileName,
      fileType: original.fileType,
      fileSize: original.fileSize,
      fileChecksum: original.fileChecksum,
    },
  ]);
  assert.deepEqual(recovered.coverage, {
    referencedOriginalCount: 2,
    includedOriginalCount: 1,
    missingOriginalCount: 1,
    originalBytes: RECEIPT_BYTES.byteLength,
    originalVersionIds: [original.originalVersionId],
  });
  assert.equal(
    recovered.workspace.evidence[1].fileState,
    "missing_original",
  );
  assert.equal(
    recovered.workspace.evidence[1].originalVersionId,
    null,
  );
});

test("creation recomputes SHA-256 from bytes and does not require caller checksum metadata", async () => {
  const kit = await createFixtureKit({
    originals: [
      {
        evidenceId: "evidence-receipt",
        blob: new Blob([RECEIPT_BYTES], { type: "text/plain" }),
      },
    ],
  });
  const payload = await decryptPayload(kit);

  assert.equal(payload.version, RECOVERY_KIT_PAYLOAD_VERSION);
  assert.equal(payload.originalManifest[0].fileChecksum, RECEIPT_CHECKSUM);
  assert.equal(
    payload.workspace.evidence[0].fileChecksum,
    RECEIPT_CHECKSUM,
  );
  assert.match(
    payload.originalManifest[0].originalVersionId,
    /^ov_[a-f0-9]{64}$/u,
  );
});

test("recovery kit can be parsed from a downloaded Blob before decrypting", async () => {
  const kit = await createFixtureKit();
  const file = new Blob([JSON.stringify(kit)], {
    type: "application/vnd.continuity.encrypted+json",
  });
  const parsed = await parseEncryptedRecoveryKit(file);

  assert.equal(parsed.createdAt, NOW);
  assert.equal(parsed.envelope.context.householdId, "household-private");
});

test("wrong passphrases and ciphertext changes fail closed", async () => {
  const kit = await createFixtureKit();

  await assert.rejects(
    decryptEncryptedRecoveryKit(kit, "this phrase is incorrect"),
    /could not be decrypted|integrity/i,
  );

  const tampered = structuredClone(kit);
  tampered.envelope.ciphertext = `${tampered.envelope.ciphertext.slice(
    0,
    -4,
  )}AAAA`;
  await assert.rejects(
    decryptEncryptedRecoveryKit(tampered, PASSPHRASE),
    /integrity|malformed|could not be decrypted/i,
  );

  const timestampTampered = structuredClone(kit);
  timestampTampered.createdAt = "2026-07-26T08:30:00.000Z";
  await assert.rejects(
    decryptEncryptedRecoveryKit(timestampTampered, PASSPHRASE),
    /creation date failed validation/i,
  );
});

test("weak passphrases and orphan originals are rejected before export", async () => {
  await assert.rejects(
    createEncryptedRecoveryKit({
      workspace: workspaceFixture(),
      passphrase: "too-short",
    }),
    rejectsWithCode("RECOVERY_KIT_WEAK_PASSPHRASE"),
  );

  await assert.rejects(
    createEncryptedRecoveryKit({
      workspace: workspaceFixture(),
      originals: [
        {
          evidenceId: "not-in-workspace",
          fileName: "orphan.txt",
          blob: new Blob(["orphan"], { type: "text/plain" }),
        },
      ],
      passphrase: PASSPHRASE,
      iterations: TEST_ITERATIONS,
    }),
    rejectsWithCode("RECOVERY_KIT_ORPHAN_ORIGINAL"),
  );
});

test("creation rejects every disagreement with canonical workspace file identity", async (t) => {
  const cases = [
    {
      name: "workspace checksum",
      code: "RECOVERY_KIT_ORIGINAL_CHECKSUM_MISMATCH",
      mutateWorkspace(workspace) {
        workspace.evidence[0].fileChecksum = "0".repeat(64);
      },
    },
    {
      name: "workspace byte size",
      code: "RECOVERY_KIT_ORIGINAL_SIZE_MISMATCH",
      mutateWorkspace(workspace) {
        workspace.evidence[0].fileSize += 1;
      },
    },
    {
      name: "blob MIME type",
      code: "RECOVERY_KIT_ORIGINAL_TYPE_MISMATCH",
      original: receiptOriginal({
        blob: new Blob([RECEIPT_BYTES], { type: "application/pdf" }),
      }),
    },
    {
      name: "caller filename",
      code: "RECOVERY_KIT_ORIGINAL_NAME_MISMATCH",
      original: receiptOriginal({ fileName: "renamed.txt" }),
    },
    {
      name: "caller MIME type",
      code: "RECOVERY_KIT_ORIGINAL_TYPE_MISMATCH",
      original: receiptOriginal({ fileType: "application/pdf" }),
    },
    {
      name: "caller byte size",
      code: "RECOVERY_KIT_ORIGINAL_SIZE_MISMATCH",
      original: receiptOriginal({ fileSize: RECEIPT_BYTES.byteLength + 1 }),
    },
    {
      name: "caller checksum",
      code: "RECOVERY_KIT_ORIGINAL_CHECKSUM_MISMATCH",
      original: receiptOriginal({ fileChecksum: "0".repeat(64) }),
    },
    {
      name: "caller immutable version",
      code: "RECOVERY_KIT_ORIGINAL_VERSION_MISMATCH",
      original: receiptOriginal({ originalVersionId: `ov_${"0".repeat(64)}` }),
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const workspace = workspaceFixture();
      item.mutateWorkspace?.(workspace);
      await assert.rejects(
        createFixtureKit({
          workspace,
          originals: [item.original || receiptOriginal()],
        }),
        rejectsWithCode(item.code),
      );
    });
  }
});

test("creation rejects duplicate evidence originals", async () => {
  await assert.rejects(
    createFixtureKit({
      originals: [receiptOriginal(), receiptOriginal()],
    }),
    rejectsWithCode("RECOVERY_KIT_DUPLICATE_ORIGINAL"),
  );
});

test("decryption recomputes every original checksum from authenticated bytes", async () => {
  const kit = await mutateFixtureKit((payload) => {
    const bytes = Buffer.from(payload.originals[0].data, "base64");
    bytes[0] ^= 0xff;
    payload.originals[0].data = bytes.toString("base64");
  });

  await assert.rejects(
    decryptEncryptedRecoveryKit(kit, PASSPHRASE),
    rejectsWithCode("RECOVERY_KIT_ORIGINAL_CHECKSUM_MISMATCH"),
  );
});

test("decryption derives immutable version identity instead of trusting manifest metadata", async () => {
  const kit = await mutateFixtureKit((payload) => {
    const replacement = `ov_${"0".repeat(64)}`;
    payload.originalManifest[0].originalVersionId = replacement;
    payload.originals[0].originalVersionId = replacement;
    payload.workspace.evidence[0].originalVersionId = replacement;
  });

  await assert.rejects(
    decryptEncryptedRecoveryKit(kit, PASSPHRASE),
    rejectsWithCode("RECOVERY_KIT_ORIGINAL_VERSION_MISMATCH"),
  );
});

test("decryption validates manifest size and checksum against bytes even when workspace metadata agrees", async (t) => {
  await t.test("byte size", async () => {
    const kit = await mutateFixtureKit((payload) => {
      payload.originalManifest[0].fileSize += 1;
      payload.workspace.evidence[0].fileSize += 1;
    });
    await assert.rejects(
      decryptEncryptedRecoveryKit(kit, PASSPHRASE),
      rejectsWithCode("RECOVERY_KIT_ORIGINAL_SIZE_MISMATCH"),
    );
  });

  await t.test("SHA-256", async () => {
    const kit = await mutateFixtureKit((payload) => {
      payload.originalManifest[0].fileChecksum = "0".repeat(64);
      payload.workspace.evidence[0].fileChecksum = "0".repeat(64);
    });
    await assert.rejects(
      decryptEncryptedRecoveryKit(kit, PASSPHRASE),
      rejectsWithCode("RECOVERY_KIT_ORIGINAL_CHECKSUM_MISMATCH"),
    );
  });
});

test("decryption rejects workspace-to-manifest name, type, size, checksum, and version mismatches", async (t) => {
  const cases = [
    [
      "filename",
      "RECOVERY_KIT_ORIGINAL_NAME_MISMATCH",
      (payload) => {
        payload.workspace.evidence[0].fileName = "different.txt";
      },
    ],
    [
      "MIME type",
      "RECOVERY_KIT_ORIGINAL_TYPE_MISMATCH",
      (payload) => {
        payload.workspace.evidence[0].fileType = "application/pdf";
      },
    ],
    [
      "byte size",
      "RECOVERY_KIT_ORIGINAL_SIZE_MISMATCH",
      (payload) => {
        payload.workspace.evidence[0].fileSize += 1;
      },
    ],
    [
      "checksum",
      "RECOVERY_KIT_ORIGINAL_CHECKSUM_MISMATCH",
      (payload) => {
        payload.workspace.evidence[0].fileChecksum = "0".repeat(64);
      },
    ],
    [
      "immutable original version",
      "RECOVERY_KIT_ORIGINAL_VERSION_MISMATCH",
      (payload) => {
        payload.workspace.evidence[0].originalVersionId =
          `ov_${"0".repeat(64)}`;
      },
    ],
  ];

  for (const [name, code, mutate] of cases) {
    await t.test(name, async () => {
      const kit = await mutateFixtureKit(mutate);
      await assert.rejects(
        decryptEncryptedRecoveryKit(kit, PASSPHRASE),
        rejectsWithCode(code),
      );
    });
  }
});

test("decryption rejects missing, orphaned, and duplicate manifest linkage", async (t) => {
  const cases = [
    [
      "missing original bytes",
      "RECOVERY_KIT_MISSING_ORIGINAL",
      (payload) => {
        payload.originals = [];
      },
    ],
    [
      "orphan original bytes",
      "RECOVERY_KIT_ORPHAN_ORIGINAL",
      (payload) => {
        payload.originals.push({
          originalVersionId: `ov_${"0".repeat(64)}`,
          data: Buffer.from("orphan").toString("base64"),
        });
      },
    ],
    [
      "duplicate original bytes",
      "RECOVERY_KIT_DUPLICATE_ORIGINAL_VERSION",
      (payload) => {
        payload.originals.push(structuredClone(payload.originals[0]));
      },
    ],
    [
      "duplicate evidence manifest",
      "RECOVERY_KIT_DUPLICATE_ORIGINAL",
      (payload) => {
        payload.originalManifest.push(
          structuredClone(payload.originalManifest[0]),
        );
      },
    ],
    [
      "orphan manifest",
      "RECOVERY_KIT_ORPHAN_ORIGINAL",
      (payload) => {
        const originalVersionId = `ov_${"0".repeat(64)}`;
        payload.originalManifest.push({
          ...structuredClone(payload.originalManifest[0]),
          evidenceId: "evidence-orphan",
          originalVersionId,
        });
        payload.originals.push({
          originalVersionId,
          data: payload.originals[0].data,
        });
      },
    ],
    [
      "workspace missing manifest",
      "RECOVERY_KIT_MISSING_ORIGINAL",
      (payload) => {
        payload.originalManifest = [];
      },
    ],
    [
      "duplicate workspace evidence identity",
      "RECOVERY_KIT_DUPLICATE_EVIDENCE",
      (payload) => {
        payload.workspace.evidence.push(
          structuredClone(payload.workspace.evidence[0]),
        );
      },
    ],
  ];

  for (const [name, code, mutate] of cases) {
    await t.test(name, async () => {
      const kit = await mutateFixtureKit(mutate);
      await assert.rejects(
        decryptEncryptedRecoveryKit(kit, PASSPHRASE),
        rejectsWithCode(code),
      );
    });
  }
});

test("legacy plaintext payloads fail closed with a clear version error", async () => {
  const kit = await mutateFixtureKit((payload) => {
    payload.version = 1;
    delete payload.originalManifest;
  });

  await assert.rejects(
    decryptEncryptedRecoveryKit(kit, PASSPHRASE),
    (error) =>
      rejectsWithCode("RECOVERY_KIT_PAYLOAD_VERSION")(error) &&
      /legacy recovery-kit version|new recovery kit/i.test(error.message),
  );
});

test("future workspace versions fail closed instead of normalizing to sample data", async () => {
  const workspace = workspaceFixture();
  workspace.version = 999;
  const kit = await createFixtureKit({ workspace });

  await assert.rejects(
    decryptEncryptedRecoveryKit(kit, PASSPHRASE),
    rejectsWithCode("RECOVERY_KIT_WORKSPACE_VERSION"),
  );
});
