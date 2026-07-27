jest.mock("expo-crypto", () => {
  let randomSeed = 0;
  function digest64(value: string): string {
    let state = 2_166_136_261;
    let result = "";
    for (let round = 0; round < 8; round += 1) {
      for (let index = 0; index < value.length; index += 1) {
        state ^= value.charCodeAt(index) + round;
        state = Math.imul(state, 16_777_619);
      }
      result += (state >>> 0).toString(16).padStart(8, "0");
      state ^= 0x9e3779b9 + round;
    }
    return result;
  }

  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { HEX: "hex" },
    digestStringAsync: jest.fn(
      async (_algorithm: string, value: string) => digest64(value)
    ),
    getRandomBytes: jest.fn((length: number) => {
      randomSeed += 1;
      return new Uint8Array(length).fill(randomSeed);
    })
  };
});

import type { SecureKeyStore } from "@alyr/contracts";

import {
  getOrCreateAttachmentKey,
  getOrCreateDatabaseKey
} from "@/data/secureKeyStore";
import {
  assertValidVaultScope,
  deriveAuthenticatedVaultScope,
  DEVICE_PREVIEW_VAULT_SCOPE,
  vaultScopeFromOpaqueId,
  type VaultScope
} from "@/data/vaultScope";

function inMemoryKeyStore(): SecureKeyStore & {
  readonly values: Map<string, Uint8Array>;
} {
  const values = new Map<string, Uint8Array>();
  return {
    values,
    async get(key) {
      const value = values.get(key);
      return value ? new Uint8Array(value) : null;
    },
    async set(key, value) {
      values.set(key, new Uint8Array(value));
    },
    async remove(key) {
      values.delete(key);
    }
  };
}

describe("authenticated local vault scope", () => {
  it("derives a deterministic opaque layout without persisting raw identities", async () => {
    const accountId = "account:alice@example.test";
    const householdId = "household-west-bay";
    const first = await deriveAuthenticatedVaultScope(
      accountId,
      householdId
    );
    const second = await deriveAuthenticatedVaultScope(
      accountId,
      householdId
    );

    expect(first).toEqual(second);
    expect(first.kind).toBe("authenticated");
    expect(first.scopeId).toMatch(/^auth-v1-[a-f0-9]{64}$/u);
    Object.values(first).forEach((value) => {
      expect(String(value)).not.toContain(accountId);
      expect(String(value)).not.toContain(householdId);
    });
  });

  it("changes every storage namespace when either identity changes", async () => {
    const base = await deriveAuthenticatedVaultScope(
      "account-a",
      "household-a"
    );
    const otherAccount = await deriveAuthenticatedVaultScope(
      "account-b",
      "household-a"
    );
    const otherHousehold = await deriveAuthenticatedVaultScope(
      "account-a",
      "household-b"
    );
    const namespaceFields: readonly (keyof VaultScope)[] = [
      "scopeId",
      "databaseName",
      "databaseKeyName",
      "attachmentKeyName",
      "protectedAttachmentDirectoryName",
      "materializedAttachmentDirectoryName"
    ];

    namespaceFields.forEach((field) => {
      expect(base[field]).not.toBe(otherAccount[field]);
      expect(base[field]).not.toBe(otherHousehold[field]);
    });
  });

  it("retains the explicit legacy device-preview layout only for no-cloud use", () => {
    expect(DEVICE_PREVIEW_VAULT_SCOPE).toEqual({
      kind: "device-preview",
      scopeId: "device-preview-v1",
      databaseName: "alyr-continuity.db",
      databaseKeyName: "alyr.native.database-key.v1",
      attachmentKeyName: "alyr.native.attachment-key.v1",
      protectedAttachmentDirectoryName: "alyr-attachments",
      materializedAttachmentDirectoryName: "alyr-materialized"
    });
  });

  it("fails closed for invalid source identities and forged layouts", async () => {
    await expect(
      deriveAuthenticatedVaultScope("", "household-a")
    ).rejects.toThrow("accountId");
    await expect(
      deriveAuthenticatedVaultScope(" account-a", "household-a")
    ).rejects.toThrow("accountId");
    await expect(
      deriveAuthenticatedVaultScope("account-a", "household\u0000a")
    ).rejects.toThrow("householdId");
    expect(() => vaultScopeFromOpaqueId("../../other-vault")).toThrow(
      "scope identifier"
    );

    const valid = await deriveAuthenticatedVaultScope(
      "account-a",
      "household-a"
    );
    expect(() =>
      assertValidVaultScope({
        ...valid,
        attachmentKeyName: DEVICE_PREVIEW_VAULT_SCOPE.attachmentKeyName
      })
    ).toThrow("layout is inconsistent");
  });

  it("uses independent database and attachment keys for each scope", async () => {
    const store = inMemoryKeyStore();
    const scopeA = await deriveAuthenticatedVaultScope(
      "account-a",
      "household-a"
    );
    const scopeB = await deriveAuthenticatedVaultScope(
      "account-a",
      "household-b"
    );

    const [databaseA, attachmentA, databaseB, attachmentB] =
      await Promise.all([
        getOrCreateDatabaseKey(store, scopeA),
        getOrCreateAttachmentKey(store, scopeA),
        getOrCreateDatabaseKey(store, scopeB),
        getOrCreateAttachmentKey(store, scopeB)
      ]);

    expect(store.values.has(scopeA.databaseKeyName)).toBe(true);
    expect(store.values.has(scopeA.attachmentKeyName)).toBe(true);
    expect(store.values.has(scopeB.databaseKeyName)).toBe(true);
    expect(store.values.has(scopeB.attachmentKeyName)).toBe(true);
    expect(databaseA).not.toEqual(databaseB);
    expect(attachmentA).not.toEqual(attachmentB);
    expect(databaseA).not.toEqual(attachmentA);
    expect(
      store.values.has(DEVICE_PREVIEW_VAULT_SCOPE.databaseKeyName)
    ).toBe(false);
  });
});
