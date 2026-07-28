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

const getItem = jest.mocked(SecureStore.getItemAsync);
const setItem = jest.mocked(SecureStore.setItemAsync);
const deleteItem = jest.mocked(SecureStore.deleteItemAsync);

describe("Quick Passport process-death draft", () => {
  let stored: string | null;

  beforeEach(() => {
    stored = null;
    getItem.mockImplementation(async () => stored);
    setItem.mockImplementation(async (_key, value) => {
      stored = value;
    });
    deleteItem.mockImplementation(async () => {
      stored = null;
    });
  });

  it("restores the latest protected draft for the same household", async () => {
    await writeQuickPassportDraft({
      householdId: "household-a",
      step: 2,
      name: "Travel watch",
      categoryId: "lifestyle.watch",
      photo: null,
      evidence: null,
      locationStatus: "unknown",
      placeId: null,
      roomId: null,
      locatorText: "",
      showPlaceForm: false,
      placeName: "",
      address: "",
      region: "",
      roomName: "",
      pin: null
    });

    const restored = await readQuickPassportDraft("household-a");

    expect(restored).toMatchObject({
      version: 1,
      householdId: "household-a",
      step: 2,
      name: "Travel watch",
      categoryId: "lifestyle.watch",
      locationStatus: "unknown"
    });
    expect(restored?.updatedAt).toEqual(expect.any(String));
  });

  it("does not expose another household's draft", async () => {
    await writeQuickPassportDraft({
      householdId: "household-a",
      step: 0,
      name: "Private item",
      categoryId: null,
      photo: null,
      evidence: null,
      locationStatus: null,
      placeId: null,
      roomId: null,
      locatorText: "",
      showPlaceForm: false,
      placeName: "",
      address: "",
      region: "",
      roomName: "",
      pin: null
    });

    await expect(
      readQuickPassportDraft("household-b")
    ).resolves.toBeNull();
  });

  it("clears the protected draft after save or explicit discard", async () => {
    await writeQuickPassportDraft({
      householdId: "household-a",
      step: 0,
      name: "Travel watch",
      categoryId: null,
      photo: null,
      evidence: null,
      locationStatus: null,
      placeId: null,
      roomId: null,
      locatorText: "",
      showPlaceForm: false,
      placeName: "",
      address: "",
      region: "",
      roomName: "",
      pin: null
    });

    await clearQuickPassportDraft();

    await expect(
      readQuickPassportDraft("household-a")
    ).resolves.toBeNull();
  });

  it("namespaces Place work separately from an Item draft", async () => {
    const values = new Map<string, string>();
    getItem.mockImplementation(async (key) => values.get(key) ?? null);
    setItem.mockImplementation(async (key, value) => {
      values.set(key, value);
    });
    deleteItem.mockImplementation(async (key) => {
      values.delete(key);
    });

    await writeQuickPassportDraft({
      householdId: "household-a",
      step: 0,
      name: "Travel watch",
      categoryId: "lifestyle.watch",
      photo: null,
      evidence: null,
      locationStatus: null,
      placeId: null,
      roomId: null,
      locatorText: "",
      showPlaceForm: false,
      placeName: "",
      address: "",
      region: "",
      roomName: "",
      pin: null
    });
    await writePlaceCaptureDraft({
      householdId: "household-a",
      placeName: "West Bay Home",
      placeClassification: "owned_property",
      address: "Test address",
      region: "Doha",
      roomName: "Study",
      pin: null
    });

    await expect(
      readPlaceCaptureDraft("household-a")
    ).resolves.toMatchObject({
      placeName: "West Bay Home",
      placeClassification: "owned_property"
    });

    await clearPlaceCaptureDraft();

    await expect(
      readPlaceCaptureDraft("household-a")
    ).resolves.toBeNull();
    await expect(
      readQuickPassportDraft("household-a")
    ).resolves.toMatchObject({ name: "Travel watch" });
  });

  it("restores identity while removing forged category and invalid files", async () => {
    stored = JSON.stringify({
      version: 1,
      householdId: "household-a",
      updatedAt: "2026-07-28T10:00:00.000Z",
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
      locatorText: "Stale clue",
      showPlaceForm: false,
      placeName: "",
      placeClassification: "unknown",
      address: "",
      region: "",
      roomName: "",
      pin: null
    });

    await expect(
      readQuickPassportDraft("household-a")
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

  it("drops a structurally malformed restored draft before render", async () => {
    stored = JSON.stringify({
      version: 1,
      householdId: "household-a",
      updatedAt: "2026-07-28T10:00:00.000Z",
      step: 3,
      name: "Recovered watch",
      categoryId: "lifestyle.watch",
      photo: "file:///not-an-object.jpg",
      evidence: null,
      locationStatus: "unknown",
      placeId: null,
      roomId: null,
      locatorText: "",
      showPlaceForm: false,
      placeName: "",
      address: "",
      region: "",
      roomName: "",
      pin: null
    });

    await expect(
      readQuickPassportDraft("household-a")
    ).resolves.toBeNull();
  });
});
