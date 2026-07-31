jest.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-1111-1111-1111-111111111111"
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn()
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined)
}));

jest.mock("expo-file-system", () => {
  const files = new Map<
    string,
    { bytes: Uint8Array; createdAt: number; modifiedAt: number }
  >();
  const directories = new Set<string>(["file:///documents"]);
  let now = 1_722_157_200_000;

  const join = (base: string, child?: string): string => {
    const normalized = base.replace(/\/+$/u, "");
    return child ? `${normalized}/${child}` : normalized;
  };

  class MockDirectory {
    readonly uri: string;

    constructor(base: string | MockDirectory, child?: string) {
      this.uri = join(
        typeof base === "string" ? base : base.uri,
        child
      );
    }

    get exists(): boolean {
      return directories.has(this.uri);
    }

    create(): void {
      directories.add(this.uri);
    }

    list(): Array<MockDirectory | MockFile> {
      const prefix = `${this.uri}/`;
      return [...files.keys()]
        .filter((uri) => {
          const suffix = uri.slice(prefix.length);
          return uri.startsWith(prefix) && !suffix.includes("/");
        })
        .map((uri) => new MockFile(uri));
    }
  }

  class MockFile {
    uri: string;

    constructor(
      base: string | MockDirectory | MockFile,
      child?: string
    ) {
      this.uri = join(
        typeof base === "string" ? base : base.uri,
        child
      );
    }

    get exists(): boolean {
      return files.has(this.uri);
    }

    get size(): number {
      return files.get(this.uri)?.bytes.byteLength ?? 0;
    }

    get name(): string {
      return this.uri.split("/").at(-1) ?? "";
    }

    get lastModified(): number | null {
      return files.get(this.uri)?.modifiedAt ?? null;
    }

    get creationTime(): number | null {
      return files.get(this.uri)?.createdAt ?? null;
    }

    create(options?: { overwrite?: boolean }): void {
      if (this.exists && !options?.overwrite) {
        throw new Error("exists");
      }
      files.set(this.uri, {
        bytes: new Uint8Array(),
        createdAt: ++now,
        modifiedAt: now
      });
    }

    write(value: Uint8Array | string): void {
      const existing = files.get(this.uri);
      const bytes =
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : value.slice();
      files.set(this.uri, {
        bytes,
        createdAt: existing?.createdAt ?? ++now,
        modifiedAt: ++now
      });
    }

    async bytes(): Promise<Uint8Array> {
      const value = files.get(this.uri);
      if (!value) throw new Error("missing");
      return value.bytes.slice();
    }

    async text(): Promise<string> {
      const value = files.get(this.uri);
      if (!value) throw new Error("missing");
      return new TextDecoder().decode(value.bytes);
    }

    delete(): void {
      files.delete(this.uri);
    }

    async move(destination: MockFile): Promise<void> {
      const value = files.get(this.uri);
      if (!value) throw new Error("missing");
      files.set(destination.uri, {
        bytes: value.bytes.slice(),
        createdAt: ++now,
        modifiedAt: now
      });
      files.delete(this.uri);
      this.uri = destination.uri;
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      document: "file:///documents"
    },
    __mockReset() {
      files.clear();
      directories.clear();
      directories.add("file:///documents");
    }
  };
});

import {
  confirmRecoveryKitExternalBackup,
  ExpoRecoveryKitStorage,
  listRecentLocalRecoveryKits,
  RECOVERY_KIT_MIME_TYPE
} from "@/recovery";

describe("local Recovery Kit history", () => {
  beforeEach(() => {
    const fileSystem = jest.requireMock<{
      __mockReset(): void;
    }>("expo-file-system");
    fileSystem.__mockReset();
  });

  it("persists a minimal confirmation receipt and clears it when the kit is replaced", async () => {
    const storage = new ExpoRecoveryKitStorage();
    const first = await storage.writeEncryptedKitAtomically({
      bytes: Uint8Array.from([1, 2, 3]),
      fileName: "Heldat-Recovery-2026-07-28.alyrkit",
      mimeType: RECOVERY_KIT_MIME_TYPE
    });

    await expect(listRecentLocalRecoveryKits()).resolves.toMatchObject([
      {
        reference: first.reference,
        fileName: first.fileName,
        byteSize: 3,
        externalBackupConfirmedAt: null
      }
    ]);

    const confirmedAt = "2026-07-28T10:00:00.000Z";
    await expect(
      confirmRecoveryKitExternalBackup(first.reference, confirmedAt)
    ).resolves.toMatchObject({
      externalBackupConfirmedAt: confirmedAt
    });
    await expect(listRecentLocalRecoveryKits()).resolves.toMatchObject([
      {
        externalBackupConfirmedAt: confirmedAt
      }
    ]);

    await storage.writeEncryptedKitAtomically({
      bytes: Uint8Array.from([9, 8]),
      fileName: first.fileName,
      mimeType: RECOVERY_KIT_MIME_TYPE
    });
    await expect(listRecentLocalRecoveryKits()).resolves.toMatchObject([
      {
        byteSize: 2,
        externalBackupConfirmedAt: null
      }
    ]);
  });

  it("continues to accept legacy ALYR Recovery Kit file names", async () => {
    const storage = new ExpoRecoveryKitStorage();
    await expect(
      storage.writeEncryptedKitAtomically({
        bytes: Uint8Array.from([1, 2, 3]),
        fileName: "ALYR-Recovery-2026-07-28.alyrkit",
        mimeType: RECOVERY_KIT_MIME_TYPE
      })
    ).resolves.toMatchObject({
      fileName: "ALYR-Recovery-2026-07-28.alyrkit"
    });
  });

  it("does not confirm an arbitrary external reference", async () => {
    await expect(
      confirmRecoveryKitExternalBackup(
        "file:///outside/ALYR-Recovery-2026-07-28.alyrkit",
        "2026-07-28T10:00:00.000Z"
      )
    ).rejects.toMatchObject({ code: "STORAGE_FAILED" });
  });
});
