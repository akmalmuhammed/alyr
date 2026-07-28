import assert from "node:assert/strict";
import test from "node:test";

import {
  AssetMutationValidationError,
  MAX_ASSET_CAPTURE_FILE_BYTES,
  assertValidFinalAssetMutation,
} from "../dist/index.js";

const NOW = "2026-07-28T10:00:00.000Z";
const confirmedUserPin = {
  latitude: 25.2854,
  longitude: 51.531,
  source: "user_pin",
  precision: "user_placed",
  horizontalAccuracyMeters: null,
  observedAt: NOW,
  confirmedAt: NOW,
};
const unconfirmedDevicePin = {
  latitude: 25.2854,
  longitude: 51.531,
  source: "device_gps",
  precision: "exact",
  horizontalAccuracyMeters: 8,
  observedAt: NOW,
  confirmedAt: null,
};

const context = {
  householdId: "household-a",
  supportedCategoryIds: [
    "lifestyle.watch",
    "home.other",
    "digital.asset",
    "document.important",
  ],
  places: [
    {
      id: "place-a",
      householdId: "household-a",
      spaceIds: ["room-a", "container-a"],
      pin: confirmedUserPin,
    },
    {
      id: "place-no-pin",
      householdId: "household-a",
      spaceIds: ["room-no-pin"],
      pin: null,
    },
    {
      id: "place-device-unconfirmed",
      householdId: "household-a",
      spaceIds: ["container-unconfirmed"],
      pin: unconfirmedDevicePin,
    },
    {
      id: "place-foreign",
      householdId: "household-b",
      spaceIds: ["room-foreign"],
      pin: confirmedUserPin,
    },
  ],
};

const valid = {
  name: "  Travel\u00a0watch  ",
  categoryId: "lifestyle.watch",
  locationStatus: "known",
  placeId: "place-a",
  spaceId: "room-a",
  locationDetail: null,
  photo: {
    localUri: "file:///watch.jpg",
    fileName: "watch.jpg",
    mimeType: "image/jpeg",
    byteSize: 1_024,
  },
  evidence: {
    localUri: "file:///receipt.pdf",
    fileName: "receipt.pdf",
    mimeType: "application/pdf",
    byteSize: 2_048,
  },
};

function reasonFor(candidate) {
  try {
    assertValidFinalAssetMutation(candidate, context);
    return null;
  } catch (error) {
    assert.ok(error instanceof AssetMutationValidationError);
    assert.equal(error.recoverable, true);
    assert.equal(error.retryable, false);
    assert.equal(error.contract.code, "VALIDATION_FAILED");
    assert.equal(error.contract.details?.recoverable, true);
    return error.issue.code;
  }
}

test("the final asset boundary accepts supported physical and virtual records", () => {
  assert.doesNotThrow(() =>
    assertValidFinalAssetMutation(valid, context),
  );
  assert.doesNotThrow(() =>
    assertValidFinalAssetMutation(
      {
        ...valid,
        categoryId: "digital.asset",
        locationStatus: "known",
        placeId: null,
        spaceId: null,
        locationDetail: null,
      },
      context,
    ),
  );
});

test("normalized blank names and unsupported categories are rejected", () => {
  assert.equal(
    reasonFor({
      ...valid,
      name: "\u200b \ufeff",
    }),
    "ASSET_NAME_REQUIRED",
  );
  assert.equal(
    reasonFor({
      ...valid,
      categoryId: "property.house",
    }),
    "ASSET_CATEGORY_UNSUPPORTED",
  );
  assert.equal(
    reasonFor({
      ...valid,
      categoryId: "future.unreviewed",
    }),
    "ASSET_CATEGORY_UNSUPPORTED",
  );
});

test("location state, household Place, and nested space invariants fail closed", () => {
  assert.equal(
    reasonFor({
      ...valid,
      locationStatus: "unknown",
      placeId: "place-a",
      spaceId: null,
    }),
    "ASSET_LOCATION_STATE_INVALID",
  );
  assert.doesNotThrow(() =>
    assertValidFinalAssetMutation(
      {
        ...valid,
        locationStatus: "needs-detail",
        spaceId: "room-a",
      },
      context,
    ),
  );
  assert.equal(
    reasonFor({
      ...valid,
      placeId: "place-missing",
    }),
    "ASSET_PLACE_INVALID",
  );
  assert.equal(
    reasonFor({
      ...valid,
      placeId: "place-foreign",
      spaceId: "room-foreign",
    }),
    "ASSET_PLACE_INVALID",
  );
  assert.equal(
    reasonFor({
      ...valid,
      spaceId: "room-missing",
    }),
    "ASSET_SPACE_INVALID",
  );
});

test("known physical locations require a Place plus room, container, or clue", () => {
  assert.equal(
    reasonFor({
      ...valid,
      placeId: null,
      spaceId: null,
    }),
    "ASSET_EXACT_LOCATION_REQUIRED",
  );
  assert.equal(
    reasonFor({
      ...valid,
      spaceId: null,
      locationDetail: "  ",
    }),
    "ASSET_EXACT_LOCATION_REQUIRED",
  );
  assert.doesNotThrow(() =>
    assertValidFinalAssetMutation(
      {
        ...valid,
        spaceId: null,
        locationDetail: "Blue case, upper shelf",
      },
      context,
    ),
  );
});

test("only a confirmed precise Place pin can make an indoor location known", () => {
  assert.equal(
    reasonFor({
      ...valid,
      placeId: "place-no-pin",
      spaceId: "room-no-pin",
    }),
    "ASSET_EXACT_LOCATION_REQUIRED",
  );
  assert.equal(
    reasonFor({
      ...valid,
      placeId: "place-device-unconfirmed",
      spaceId: "container-unconfirmed",
    }),
    "ASSET_EXACT_LOCATION_REQUIRED",
  );
  assert.doesNotThrow(() =>
    assertValidFinalAssetMutation(
      {
        ...valid,
        placeId: "place-a",
        spaceId: "container-a",
      },
      context,
    ),
  );
});

test("needs-detail retains a truthful room, container, or locator clue", () => {
  assert.doesNotThrow(() =>
    assertValidFinalAssetMutation(
      {
        ...valid,
        locationStatus: "needs-detail",
        placeId: "place-no-pin",
        spaceId: "room-no-pin",
        locationDetail: "Blue case",
      },
      context,
    ),
  );
  assert.doesNotThrow(() =>
    assertValidFinalAssetMutation(
      {
        ...valid,
        locationStatus: "needs-detail",
        placeId: "place-device-unconfirmed",
        spaceId: "container-unconfirmed",
      },
      context,
    ),
  );
});

test("capture files require bounded size and role-appropriate metadata", () => {
  assert.equal(
    reasonFor({
      ...valid,
      photo: {
        ...valid.photo,
        fileName: "../watch.jpg",
      },
    }),
    "ASSET_FILE_METADATA_INVALID",
  );
  assert.equal(
    reasonFor({
      ...valid,
      photo: {
        ...valid.photo,
        mimeType: "application/pdf",
      },
    }),
    "ASSET_FILE_METADATA_INVALID",
  );
  assert.equal(
    reasonFor({
      ...valid,
      evidence: {
        ...valid.evidence,
        byteSize: 0,
      },
    }),
    "ASSET_FILE_SIZE_INVALID",
  );
  assert.equal(
    reasonFor({
      ...valid,
      evidence: {
        ...valid.evidence,
        byteSize: MAX_ASSET_CAPTURE_FILE_BYTES + 1,
      },
    }),
    "ASSET_FILE_SIZE_INVALID",
  );
  assert.equal(
    reasonFor({
      ...valid,
      photo: {
        ...valid.photo,
        encryptedAtRest: true,
        protectedUri: null,
        checksumSha256: null,
      },
    }),
    "ASSET_FILE_METADATA_INVALID",
  );
});
