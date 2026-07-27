import {
  createChunkedSecureSessionStorage,
  type SecureSessionStoreDriver
} from "@/auth/secureSessionStorage";

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

function fixture() {
  const values = new Map<string, string>();
  let generation = 0;
  const driver: SecureSessionStoreDriver = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    }
  };
  const storage = createChunkedSecureSessionStorage({
    driver,
    digest: async (value) => digest64(value),
    createGeneration: () =>
      `00000000-0000-4000-8000-${String(++generation).padStart(12, "0")}`,
    chunkByteLimit: 256
  });
  return { driver, storage, values };
}

describe("chunked SecureStore Supabase session adapter", () => {
  it("round-trips a large Unicode session below the per-record limit", async () => {
    const { storage, values } = fixture();
    const session = JSON.stringify({
      access_token: "a".repeat(3_000),
      refresh_token: "r".repeat(900),
      user: { label: "بيت آمن 🔐".repeat(80) }
    });

    await storage.setItem("sb-project-auth-token", session);

    await expect(
      storage.getItem("sb-project-auth-token")
    ).resolves.toBe(session);
    const chunks = [...values.entries()].filter(
      ([key]) => !key.endsWith(".manifest")
    );
    expect(chunks.length).toBeGreaterThan(2);
    for (const [, value] of chunks) {
      expect(new TextEncoder().encode(value).byteLength).toBeLessThanOrEqual(
        256
      );
    }
  });

  it("rotates generations and deletes retired encrypted chunks", async () => {
    const { storage, values } = fixture();
    await storage.setItem("auth-key", "first-session".repeat(80));
    const firstChunkKeys = [...values.keys()].filter(
      (key) => !key.endsWith(".manifest")
    );

    await storage.setItem("auth-key", "second-session".repeat(80));

    await expect(storage.getItem("auth-key")).resolves.toBe(
      "second-session".repeat(80)
    );
    firstChunkKeys.forEach((key) => expect(values.has(key)).toBe(false));
    const manifest = [...values.entries()].find(([key]) =>
      key.endsWith(".manifest")
    )?.[1];
    expect(manifest).toBeDefined();
    expect(JSON.parse(manifest ?? "{}")).toMatchObject({ retired: [] });
  });

  it("fails closed when a current encrypted chunk is missing or changed", async () => {
    const { storage, values } = fixture();
    await storage.setItem("auth-key", "verified-session".repeat(50));
    const chunkKey = [...values.keys()].find(
      (key) => !key.endsWith(".manifest")
    );
    expect(chunkKey).toBeDefined();
    values.set(chunkKey ?? "", "tampered");

    await expect(storage.getItem("auth-key")).rejects.toThrow(
      "unavailable or corrupt"
    );
  });

  it("keeps the previous manifest current when rotation cannot commit", async () => {
    const { driver, storage, values } = fixture();
    await storage.setItem("auth-key", "previous");
    const setItem = driver.setItem.bind(driver);
    let rejectManifest = true;
    driver.setItem = async (key, value) => {
      if (rejectManifest && key.endsWith(".manifest")) {
        rejectManifest = false;
        throw new Error("keychain write failed");
      }
      await setItem(key, value);
    };

    await expect(storage.setItem("auth-key", "next")).rejects.toThrow(
      "keychain write failed"
    );
    await expect(storage.getItem("auth-key")).resolves.toBe("previous");
    expect(
      [...values.keys()].filter((key) => !key.endsWith(".manifest"))
    ).toHaveLength(1);
  });

  it("removes the manifest first and leaves no readable session", async () => {
    const { storage, values } = fixture();
    await storage.setItem("auth-key", "session".repeat(120));

    await storage.removeItem("auth-key");

    await expect(storage.getItem("auth-key")).resolves.toBeNull();
    expect(values.size).toBe(0);
  });
});
