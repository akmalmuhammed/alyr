declare const require: (identifier: string) => any;
const {
  createCipheriv,
  createDecipheriv,
  createHash
} = require("node:crypto");
const NodeBuffer = require("node:buffer").Buffer;

import {
  createAndStoreRecoveryKit,
  createRecoveryKit,
  disposeRecoveredKit,
  ExpoRecoveryCrypto,
  openRecoveryKit,
  readAndOpenRecoveryKit,
  RecoveryKitError,
  restoreRecoveryKitAtomically
} from "@/recovery";
import type {
  CreateRecoveryKitRequest,
  RecoveryCryptoPort,
  RecoveryKdfParameters,
  RecoveryKitStoragePort,
  RecoveryProtectedAttachmentReadPort,
  RecoveryRestoreTransaction
} from "@/recovery";

const PASSPHRASE = "correct horse battery staple";
const CREATED_AT = "2026-07-27T00:00:00.000Z";

/**
 * Deterministic test double only. Production is gated on an audited Argon2id
 * native port; this double uses Node SHA-256 solely to make test vectors stable.
 */
class DeterministicTestCrypto implements RecoveryCryptoPort {
  private randomCursor = 1;

  async randomBytes(length: number): Promise<Uint8Array> {
    const result = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      result[index] = this.randomCursor++ & 0xff;
    }
    return result;
  }

  async sha256(value: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(createHash("sha256").update(value).digest());
  }

  async deriveKey(
    passphraseUtf8: Uint8Array,
    parameters: RecoveryKdfParameters
  ): Promise<Uint8Array> {
    const encodedParameters = new Uint8Array([
      parameters.iterations,
      parameters.parallelism,
      parameters.memoryKiB >>> 16,
      parameters.memoryKiB >>> 8,
      parameters.memoryKiB
    ]);
    return new Uint8Array(
      createHash("sha256")
        .update(passphraseUtf8)
        .update(parameters.salt)
        .update(encodedParameters)
        .digest()
    );
  }

  async sealAes256Gcm(input: {
    readonly plaintext: Uint8Array;
    readonly key: Uint8Array;
    readonly nonce: Uint8Array;
    readonly additionalData: Uint8Array;
  }): Promise<Uint8Array> {
    const cipher = createCipheriv(
      "aes-256-gcm",
      input.key,
      input.nonce,
      { authTagLength: 16 }
    );
    cipher.setAAD(input.additionalData);
    const ciphertext = NodeBuffer.concat([
      cipher.update(input.plaintext),
      cipher.final()
    ]);
    return new Uint8Array(
      NodeBuffer.concat([ciphertext, cipher.getAuthTag()])
    );
  }

  async openAes256Gcm(input: {
    readonly ciphertextAndTag: Uint8Array;
    readonly key: Uint8Array;
    readonly nonce: Uint8Array;
    readonly additionalData: Uint8Array;
  }): Promise<Uint8Array> {
    const tagOffset = input.ciphertextAndTag.byteLength - 16;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      input.key,
      input.nonce,
      { authTagLength: 16 }
    );
    decipher.setAAD(input.additionalData);
    decipher.setAuthTag(input.ciphertextAndTag.slice(tagOffset));
    return new Uint8Array(
      NodeBuffer.concat([
        decipher.update(input.ciphertextAndTag.slice(0, tagOffset)),
        decipher.final()
      ])
    );
  }
}

const workspace = {
  schemaVersion: 2,
  mode: "personal",
  household: { id: "household-1", name: "West Bay home" },
  assets: [{ id: "asset-1", name: "GMT watch" }],
  liabilities: [
    {
      id: "liability-1",
      householdId: "household-1",
      version: 1,
      name: "Home finance",
      kind: "mortgage",
      lifecycleStatus: "active"
    }
  ],
  liabilityTombstones: [
    {
      id: "liability-deleted",
      householdId: "household-1",
      version: 3,
      deletedAt: "2026-07-26T10:00:00.000Z"
    }
  ],
  liabilityReview: {
    id: "liability-review-1",
    householdId: "household-1",
    version: 1,
    status: "none-confirmed",
    reviewedAt: "2026-07-27",
    expiresAt: "2026-10-25"
  },
  portfolioValueRecords: [
    {
      id: "liability-value-1",
      liabilityId: "liability-1",
      amountMinor: 215_000_000,
      currency: "QAR",
      asOf: "2026-07-27"
    }
  ]
};

const protectedA = Uint8Array.from({ length: 44 }, (_, index) => index + 1);
const protectedB = Uint8Array.from(
  { length: 52 },
  (_, index) => 255 - index
);
const vaultKey = Uint8Array.from({ length: 32 }, (_, index) => index + 10);

function request(
  overrides: Partial<CreateRecoveryKitRequest> = {}
): CreateRecoveryKitRequest {
  return {
    workspace,
    workspaceSchemaVersion: 2,
    createdAt: CREATED_AT,
    attachmentVaultKey: vaultKey,
    // Deliberately reversed: the container must sort stable identifiers.
    attachments: [
      {
        id: "blob-b",
        evidenceId: "evidence-b",
        protectedReference: "memory://b",
        protectedByteSize: protectedB.byteLength,
        fileName: "warranty.pdf",
        mimeType: "application/pdf",
        plaintextByteSize: 24,
        plaintextChecksumSha256: "b".repeat(64)
      },
      {
        id: "blob-a",
        evidenceId: "evidence-a",
        protectedReference: "memory://a",
        protectedByteSize: protectedA.byteLength,
        fileName: "watch.jpg",
        mimeType: "image/jpeg",
        plaintextByteSize: 16,
        plaintextChecksumSha256: "a".repeat(64)
      }
    ],
    ...overrides
  };
}

function reader(): RecoveryProtectedAttachmentReadPort {
  const files = new Map([
    ["memory://a", protectedA],
    ["memory://b", protectedB]
  ]);
  return {
    async readProtectedAttachment(reference, maxBytes) {
      const value = files.get(reference);
      if (!value || value.byteLength > maxBytes) {
        throw new Error("missing");
      }
      return value.slice();
    }
  };
}

function expectCode(
  action: Promise<unknown>,
  code: RecoveryKitError["code"]
): Promise<void> {
  return action.then(
    () => {
      throw new Error(`Expected ${code}.`);
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(RecoveryKitError);
      expect((error as RecoveryKitError).code).toBe(code);
    }
  );
}

describe("ALYR Recovery Kit v1", () => {
  test("round-trips a canonical workspace, vault key, and protected bytes", async () => {
    const artifact = await createRecoveryKit(
      request(),
      PASSPHRASE,
      new DeterministicTestCrypto(),
      reader()
    );

    expect(Array.from(artifact.bytes.slice(0, 8))).toEqual([
      65, 76, 89, 82, 75, 73, 84, 0
    ]);
    expect(artifact.fileName).toBe("ALYR-Recovery-2026-07-27.alyrkit");
    expect(artifact.byteSize).toBe(artifact.bytes.byteLength);
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(artifact.attachmentCount).toBe(2);
    // Cleartext header contains crypto parameters, not private manifest data.
    expect(NodeBuffer.from(artifact.bytes).toString("utf8")).not.toContain(
      "West Bay home"
    );

    const recovered = await openRecoveryKit(
      artifact.bytes,
      PASSPHRASE,
      new DeterministicTestCrypto()
    );
    expect(recovered.workspace).toEqual(workspace);
    expect(recovered.workspaceSchemaVersion).toBe(2);
    expect(recovered.attachmentVaultKey).toEqual(vaultKey);
    expect(recovered.attachments.map((item) => item.id)).toEqual([
      "blob-a",
      "blob-b"
    ]);
    expect(recovered.attachments[0]!.protectedBytes).toEqual(protectedA);
    expect(recovered.attachments[1]!.protectedBytes).toEqual(protectedB);
    expect(recovered.attachments[0]!.protectedFormat).toBe(
      "expo-aes-gcm-combined-v1"
    );
    expect(protectedA[0]).toBe(1);
    expect(vaultKey[0]).toBe(10);

    disposeRecoveredKit(recovered);
    expect(recovered.attachmentVaultKey).toEqual(new Uint8Array(32));
    expect(recovered.attachments[0]!.protectedBytes).toEqual(
      new Uint8Array(protectedA.byteLength)
    );
  });

  test("emits deterministic bytes with deterministic ports and inputs", async () => {
    const first = await createRecoveryKit(
      request(),
      PASSPHRASE,
      new DeterministicTestCrypto(),
      reader()
    );
    const second = await createRecoveryKit(
      request(),
      PASSPHRASE,
      new DeterministicTestCrypto(),
      reader()
    );
    expect(second.bytes).toEqual(first.bytes);
    expect(second.sha256).toBe(first.sha256);
  });

  test("fails closed for a wrong passphrase and modified ciphertext", async () => {
    const artifact = await createRecoveryKit(
      request(),
      PASSPHRASE,
      new DeterministicTestCrypto(),
      reader()
    );
    await expectCode(
      openRecoveryKit(
        artifact.bytes,
        "this is the wrong passphrase",
        new DeterministicTestCrypto()
      ),
      "AUTHENTICATION_FAILED"
    );

    const modified = artifact.bytes.slice();
    modified[modified.length - 1]! ^= 0x01;
    await expectCode(
      openRecoveryKit(
        modified,
        PASSPHRASE,
        new DeterministicTestCrypto()
      ),
      "AUTHENTICATION_FAILED"
    );
  });

  test("rejects trailing bytes, bad signatures, and unsupported versions", async () => {
    const artifact = await createRecoveryKit(
      request(),
      PASSPHRASE,
      new DeterministicTestCrypto(),
      reader()
    );
    const trailing = new Uint8Array(artifact.bytes.byteLength + 1);
    trailing.set(artifact.bytes);
    await expectCode(
      openRecoveryKit(
        trailing,
        PASSPHRASE,
        new DeterministicTestCrypto()
      ),
      "CORRUPT_CONTAINER"
    );

    const badMagic = artifact.bytes.slice();
    badMagic[0] = 0;
    await expectCode(
      openRecoveryKit(
        badMagic,
        PASSPHRASE,
        new DeterministicTestCrypto()
      ),
      "CORRUPT_CONTAINER"
    );

    const future = artifact.bytes.slice();
    future[8] = 0;
    future[9] = 2;
    await expectCode(
      openRecoveryKit(
        future,
        PASSPHRASE,
        new DeterministicTestCrypto()
      ),
      "UNSUPPORTED_VERSION"
    );
  });

  test("requires portable vault key material and exact protected size", async () => {
    await expectCode(
      createRecoveryKit(
        request({ attachmentVaultKey: null }),
        PASSPHRASE,
        new DeterministicTestCrypto(),
        reader()
      ),
      "INVALID_INPUT"
    );

    const mismatched = request({
      attachments: [
        {
          ...request().attachments[0]!,
          protectedByteSize: protectedB.byteLength + 1
        }
      ]
    });
    await expectCode(
      createRecoveryKit(
        mismatched,
        PASSPHRASE,
        new DeterministicTestCrypto(),
        reader()
      ),
      "CORRUPT_CONTAINER"
    );
  });

  test("enforces passphrase policy before KDF work", async () => {
    await expectCode(
      createRecoveryKit(
        request(),
        "short",
        new DeterministicTestCrypto(),
        reader()
      ),
      "INVALID_PASSPHRASE"
    );
  });

  test("Expo adapter is explicitly gated without Argon2id", async () => {
    await expectCode(
      new ExpoRecoveryCrypto().deriveKey(
        Uint8Array.of(1, 2, 3),
        {
          algorithm: "argon2id",
          salt: new Uint8Array(16),
          memoryKiB: 65_536,
          iterations: 3,
          parallelism: 1,
          keyBytes: 32
        }
      ),
      "CRYPTO_UNAVAILABLE"
    );
  });

  test("storage helpers write only encrypted bytes and clear transfer buffers", async () => {
    let storedBytes: Uint8Array | null = null;
    const storage: RecoveryKitStoragePort = {
      async writeEncryptedKitAtomically(input) {
        storedBytes = input.bytes.slice();
        return {
          reference: "memory://kit",
          fileName: input.fileName,
          byteSize: input.bytes.byteLength
        };
      },
      async readEncryptedKit(_reference, maxBytes) {
        if (!storedBytes || storedBytes.byteLength > maxBytes) {
          throw new Error("missing");
        }
        return storedBytes.slice();
      }
    };
    const saved = await createAndStoreRecoveryKit(
      request(),
      PASSPHRASE,
      {
        crypto: new DeterministicTestCrypto(),
        attachments: reader(),
        storage
      }
    );
    expect(saved.reference).toBe("memory://kit");
    expect(storedBytes).not.toBeNull();
    expect(storedBytes![0]).toBe(65);

    const recovered = await readAndOpenRecoveryKit(
      saved.reference,
      PASSPHRASE,
      {
        crypto: new DeterministicTestCrypto(),
        storage
      }
    );
    expect(recovered.workspace).toEqual(workspace);
    disposeRecoveredKit(recovered);
  });

  test("restore stages key, protected bytes, then workspace and rolls back on failure", async () => {
    const artifact = await createRecoveryKit(
      request(),
      PASSPHRASE,
      new DeterministicTestCrypto(),
      reader()
    );
    const recovered = await openRecoveryKit(
      artifact.bytes,
      PASSPHRASE,
      new DeterministicTestCrypto()
    );
    const calls: string[] = [];
    const transaction: RecoveryRestoreTransaction = {
      async stageAttachmentVaultKey() {
        calls.push("key");
      },
      async stageProtectedAttachment(value) {
        calls.push(`attachment:${value.id}`);
      },
      async stageWorkspace() {
        calls.push("workspace");
      },
      async commit() {
        calls.push("commit");
      },
      async rollback() {
        calls.push("rollback");
      }
    };
    await restoreRecoveryKitAtomically(recovered, {
      async begin() {
        calls.push("begin");
        return transaction;
      }
    });
    expect(calls).toEqual([
      "begin",
      "key",
      "attachment:blob-a",
      "attachment:blob-b",
      "workspace",
      "commit"
    ]);

    const failingCalls: string[] = [];
    await expectCode(
      restoreRecoveryKitAtomically(recovered, {
        async begin() {
          return {
            ...transaction,
            async stageAttachmentVaultKey() {
              failingCalls.push("key");
            },
            async stageProtectedAttachment() {
              failingCalls.push("attachment");
              throw new Error("disk full");
            },
            async rollback() {
              failingCalls.push("rollback");
            }
          };
        }
      }),
      "RESTORE_REJECTED"
    );
    expect(failingCalls).toEqual(["key", "attachment", "rollback"]);
    disposeRecoveredKit(recovered);
  });
});
