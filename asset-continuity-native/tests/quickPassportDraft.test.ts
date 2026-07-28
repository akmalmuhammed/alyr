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

  beforeEach(() => {
    values = new Map<string, string>();
    getItem.mockImplementation(async (key) => values.get(key) ?? null);
    setItem.mockImplementation(async (key, value) => {
      values.set(key, value);
    });
    deleteItem.mockImplementation(async (key) => {
      values.delete(key);
    });
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
