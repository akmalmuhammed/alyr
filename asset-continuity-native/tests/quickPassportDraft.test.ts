import * as SecureStore from "expo-secure-store";

import { MAX_ASSET_CAPTURE_FILE_BYTES } from "@alyr/domain";

import {
  clearPlaceCaptureDraft,
  clearQuickPassportDraft,
  readPlaceCaptureDraft,
  readQuickPassportDraft,
  writePlaceCaptureDraft,
  writeQuickPassportDraft
} from "@/capture/quickPassportDraft";
import type {
  DraftAttachmentStore,
  MaterializedAttachment
} from "@/data/attachmentStore";
import { vaultScopeFromOpaqueId } from "@/data/vaultScope";

const getItem = jest.mocked(SecureStore.getItemAsync);
const setItem = jest.mocked(SecureStore.setItemAsync);
const deleteItem = jest.mocked(SecureStore.deleteItemAsync);

const scopeA = vaultScopeFromOpaqueId(
  `auth-v1-${"a".repeat(64)}`
).scopeId;
const scopeB = vaultScopeFromOpaqueId(
  `auth-v1-${"b".repeat(64)}`
).scopeId;
const ITEM_KEY_A = `alyr.quick-passport-draft.${scopeA}.v2`;

function quickDraft(
  overrides: Partial<Parameters<typeof writeQuickPassportDraft>[0]> = {}
): Parameters<typeof writeQuickPassportDraft>[0] {
  return {
    scopeId: scopeA,
    householdId: "household-a",
    step: 0,
    name: "Travel watch",
    categoryId: "lifestyle.watch",
    captureSource: "manual",
    photo: null,
    evidence: null,
    locationStatus: null,
    placeId: null,
    roomId: null,
    locatorText: "",
    showPlaceForm: false,
    placeName: "",
    placeClassification: "unknown",
    address: "",
    region: "",
    roomName: "",
    pin: null,
    ...overrides
  };
}

function placeDraft(
  overrides: Partial<Parameters<typeof writePlaceCaptureDraft>[0]> = {}
): Parameters<typeof writePlaceCaptureDraft>[0] {
  return {
    scopeId: scopeA,
    householdId: "household-a",
    placeName: "West Bay Home",
    placeClassification: "owned_property",
    address: "Test address",
    region: "Doha",
    roomName: "Study",
    pin: null,
    ...overrides
  };
}

describe("Quick Passport process-death draft", () => {
  let values: Map<string, string>;
  let availableDrafts: Set<string>;
  let discardDraftFile: jest.MockedFunction<
    DraftAttachmentStore["discardDraftFile"]
  >;
  let protectedDraftStore: DraftAttachmentStore;

  beforeEach(() => {
    values = new Map<string, string>();
    availableDrafts = new Set<string>();
    getItem.mockImplementation(async (key) => values.get(key) ?? null);
    setItem.mockImplementation(async (key, value) => {
      values.set(key, value);
    });
    deleteItem.mockImplementation(async (key) => {
      values.delete(key);
    });
    discardDraftFile = jest.fn(async (file) => {
      if (file.protectedUri) {
        availableDrafts.delete(file.protectedUri);
      }
    });
    protectedDraftStore = {
      kind: "encrypted-files",
      encryptedAtRest: true,
      async ingest(file) {
        return file;
      },
      async stageForDraft(file) {
        if (file.encryptedAtRest && file.protectedUri) {
          if (!availableDrafts.has(file.protectedUri)) {
            throw new Error("staged bytes missing");
          }
          return file;
        }
        const token = file.fileName.replaceAll(/[^a-z0-9]/giu, "-");
        const protectedUri = `file:///drafts/${token}.alyrdraft`;
        availableDrafts.add(protectedUri);
        return {
          ...file,
          localUri: protectedUri,
          protectedUri,
          checksumSha256: "a".repeat(64),
          encryptedAtRest: true
        };
      },
      async verifyDraftFile(file) {
        return Boolean(
          file.protectedUri &&
            availableDrafts.has(file.protectedUri)
        );
      },
      async materializeDraftForViewing(file) {
        if (
          !file.protectedUri ||
          !availableDrafts.has(file.protectedUri)
        ) {
          throw new Error("staged bytes missing");
        }
        return {
          uri: `file:///cache/${file.fileName}`,
          fileName: file.fileName,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          checksumSha256: file.checksumSha256 ?? null,
          integrity: "aes-gcm-and-sha256",
          temporary: true
        } satisfies MaterializedAttachment;
      },
      discardDraftFile,
      async materializeForViewing() {
        throw new Error("not used");
      },
      async cleanupMaterialized() {}
    };
  });

  it("restores the latest protected draft for the exact vault scope and household", async () => {
    await writeQuickPassportDraft(
      quickDraft({
        step: 2,
        locationStatus: "unknown"
      })
    );

    const restored = await readQuickPassportDraft(
      scopeA,
      "household-a"
    );

    expect(restored).toMatchObject({
      version: 2,
      scopeId: scopeA,
      householdId: "household-a",
      step: 2,
      name: "Travel watch",
      categoryId: "lifestyle.watch",
      locationStatus: "unknown"
    });
    expect(restored?.updatedAt).toEqual(expect.any(String));
  });

  it("preserves the bounded acquisition channel across process death without file metadata", async () => {
    await writeQuickPassportDraft(
      quickDraft({
        captureSource: "camera",
        photo: {
          localUri: "file:///private-cache/watch.jpg",
          fileName: "watch.jpg",
          mimeType: "image/jpeg",
          byteSize: 1_024
        }
      })
    );

    await expect(
      readQuickPassportDraft(scopeA, "household-a")
    ).resolves.toMatchObject({
      captureSource: "camera"
    });
  });

  it("restores protected bytes after process death without persisting the picker URI", async () => {
    await writeQuickPassportDraft(
      quickDraft({
        step: 2,
        captureSource: "camera",
        photo: {
          localUri: "file:///private-cache/watch.jpg",
          fileName: "watch.jpg",
          mimeType: "image/jpeg",
          byteSize: 1_024
        }
      }),
      protectedDraftStore
    );

    expect(values.get(ITEM_KEY_A)).not.toContain(
      "file:///private-cache/watch.jpg"
    );
    await expect(
      readQuickPassportDraft(
        scopeA,
        "household-a",
        protectedDraftStore
      )
    ).resolves.toMatchObject({
      photo: {
        localUri: "file:///cache/watch.jpg",
        protectedUri: "file:///drafts/watch-jpg.alyrdraft",
        encryptedAtRest: true,
        checksumSha256: "a".repeat(64)
      }
    });
  });

  it("drops and cleans a draft reference when protected bytes are missing or corrupt", async () => {
    await writeQuickPassportDraft(
      quickDraft({
        photo: {
          localUri: "file:///private-cache/watch.jpg",
          fileName: "watch.jpg",
          mimeType: "image/jpeg",
          byteSize: 1_024
        }
      }),
      protectedDraftStore
    );
    availableDrafts.clear();

    await expect(
      readQuickPassportDraft(
        scopeA,
        "household-a",
        protectedDraftStore
      )
    ).resolves.toMatchObject({ photo: null });
    expect(discardDraftFile).toHaveBeenCalledWith(
      expect.objectContaining({
        protectedUri: "file:///drafts/watch-jpg.alyrdraft"
      })
    );
  });

  it("cleans replaced and abandoned staged bytes without touching the current draft", async () => {
    await writeQuickPassportDraft(
      quickDraft({
        photo: {
          localUri: "file:///private-cache/watch.jpg",
          fileName: "watch.jpg",
          mimeType: "image/jpeg",
          byteSize: 1_024
        }
      }),
      protectedDraftStore
    );
    await writeQuickPassportDraft(
      quickDraft({
        photo: {
          localUri: "file:///private-cache/camera.jpg",
          fileName: "camera.jpg",
          mimeType: "image/jpeg",
          byteSize: 2_048
        }
      }),
      protectedDraftStore
    );

    expect(availableDrafts).toEqual(
      new Set(["file:///drafts/camera-jpg.alyrdraft"])
    );
    await clearQuickPassportDraft(scopeA, protectedDraftStore);
    expect(availableDrafts.size).toBe(0);
    expect(discardDraftFile).toHaveBeenCalledTimes(2);
  });

  it("does not expose a draft to another household", async () => {
    await writeQuickPassportDraft(
      quickDraft({ name: "Private item" })
    );

    await expect(
      readQuickPassportDraft(scopeA, "household-b")
    ).resolves.toBeNull();
  });

  it("does not expose or erase a draft for another account in the same household", async () => {
    await writeQuickPassportDraft(
      quickDraft({ name: "Account A private draft" })
    );

    await expect(
      readQuickPassportDraft(scopeB, "household-a")
    ).resolves.toBeNull();
    await clearQuickPassportDraft(scopeB);
    await expect(
      readQuickPassportDraft(scopeA, "household-a")
    ).resolves.toMatchObject({
      name: "Account A private draft",
      scopeId: scopeA
    });
  });

  it("clears only the current scoped draft after save or explicit discard", async () => {
    await writeQuickPassportDraft(quickDraft());
    await writeQuickPassportDraft(
      quickDraft({
        scopeId: scopeB,
        name: "Account B draft"
      })
    );

    await clearQuickPassportDraft(scopeA);

    await expect(
      readQuickPassportDraft(scopeA, "household-a")
    ).resolves.toBeNull();
    await expect(
      readQuickPassportDraft(scopeB, "household-a")
    ).resolves.toMatchObject({ name: "Account B draft" });
  });

  it("namespaces Place work separately from an Item draft", async () => {
    await writeQuickPassportDraft(quickDraft());
    await writePlaceCaptureDraft(placeDraft());

    await expect(
      readPlaceCaptureDraft(scopeA, "household-a")
    ).resolves.toMatchObject({
      placeName: "West Bay Home",
      placeClassification: "owned_property"
    });

    await clearPlaceCaptureDraft(scopeA);

    await expect(
      readPlaceCaptureDraft(scopeA, "household-a")
    ).resolves.toBeNull();
    await expect(
      readQuickPassportDraft(scopeA, "household-a")
    ).resolves.toMatchObject({ name: "Travel watch" });
  });

  it("restores identity while removing forged category and invalid files", async () => {
    values.set(
      ITEM_KEY_A,
      JSON.stringify({
        ...quickDraft({
          step: 3,
          name: "Recovered watch",
          categoryId: "property.house",
          photo: {
            localUri: "file:///watch.jpg",
            fileName: "watch.jpg",
            mimeType: "application/pdf",
            byteSize: 1_024
          },
          evidence: {
            localUri: "file:///receipt.pdf",
            fileName: "receipt.pdf",
            mimeType: "application/pdf",
            byteSize: MAX_ASSET_CAPTURE_FILE_BYTES + 1
          },
          locationStatus: "unknown",
          placeId: "place-stale",
          roomId: "room-stale",
          locatorText: "Stale clue"
        }),
        version: 2,
        updatedAt: "2026-07-28T10:00:00.000Z"
      })
    );

    await expect(
      readQuickPassportDraft(scopeA, "household-a")
    ).resolves.toMatchObject({
      name: "Recovered watch",
      categoryId: null,
      photo: null,
      evidence: null,
      locationStatus: "unknown",
      placeId: null,
      roomId: null,
      locatorText: ""
    });
  });

  it("drops a structurally malformed or legacy restored draft before render", async () => {
    values.set(
      ITEM_KEY_A,
      JSON.stringify({
        ...quickDraft(),
        version: 1,
        updatedAt: "2026-07-28T10:00:00.000Z",
        photo: "file:///not-an-object.jpg"
      })
    );

    await expect(
      readQuickPassportDraft(scopeA, "household-a")
    ).resolves.toBeNull();
  });

  it("reports storage failures and keeps the serialized write queue usable", async () => {
    setItem.mockRejectedValueOnce(new Error("keychain unavailable"));

    await expect(
      writeQuickPassportDraft(quickDraft())
    ).rejects.toThrow("keychain unavailable");
    await expect(
      writeQuickPassportDraft(
        quickDraft({ name: "Recovered queue write" })
      )
    ).resolves.toBeUndefined();
    await expect(
      readQuickPassportDraft(scopeA, "household-a")
    ).resolves.toMatchObject({ name: "Recovered queue write" });

    deleteItem.mockRejectedValueOnce(new Error("keychain locked"));
    await expect(
      clearQuickPassportDraft(scopeA)
    ).rejects.toThrow("keychain locked");
    await expect(
      readQuickPassportDraft(scopeA, "household-a")
    ).resolves.toMatchObject({ name: "Recovered queue write" });

    getItem.mockRejectedValueOnce(new Error("keychain read failed"));
    await expect(
      readQuickPassportDraft(scopeA, "household-a")
    ).rejects.toThrow("keychain read failed");
  });
});
