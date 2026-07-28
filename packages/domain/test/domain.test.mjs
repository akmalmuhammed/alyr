import assert from "node:assert/strict";
import test from "node:test";

import {
  appendLocationRevision,
  applyEvidenceVersion,
  calculateAssetReadiness,
  createHonestPlacePin,
  deriveLocationTruth,
  evidenceVersionIdForChecksum,
  getPortfolioValuePolicy,
  isConfirmedPrecisePlacePin,
  isEvidenceReviewable,
  reviewEvidence,
} from "../dist/index.js";

const NOW = "2026-07-25T10:00:00.000Z";
const LATER = "2026-07-25T11:00:00.000Z";
const CHECKSUM = "a".repeat(64);

test("portfolio value eligibility is explicit by category role", () => {
  assert.deepEqual(getPortfolioValuePolicy("lifestyle.watch"), {
    subject: "asset",
    contributesToFinancialPosition: true,
  });
  assert.deepEqual(getPortfolioValuePolicy("property.house"), {
    subject: "place",
    contributesToFinancialPosition: true,
  });
  assert.deepEqual(getPortfolioValuePolicy("document.important"), {
    subject: "none",
    contributesToFinancialPosition: false,
  });
  assert.deepEqual(getPortfolioValuePolicy("legacy.custom-item"), {
    subject: "asset",
    contributesToFinancialPosition: true,
  });
});

test("GPS precision is exact only at 15 metres or better", () => {
  const exact = createHonestPlacePin({
    latitude: 25.2854,
    longitude: 51.531,
    source: "device_gps",
    horizontalAccuracyMeters: 15,
    observedAt: NOW,
    confirmedAt: NOW,
  });
  const approximate = createHonestPlacePin({
    latitude: 25.2854,
    longitude: 51.531,
    source: "device_gps",
    horizontalAccuracyMeters: 15.1,
    observedAt: NOW,
    confirmedAt: NOW,
  });
  const placed = createHonestPlacePin({
    latitude: 25.2854,
    longitude: 51.531,
    source: "user_pin",
    horizontalAccuracyMeters: 1,
    observedAt: NOW,
    confirmedAt: NOW,
  });

  assert.equal(exact.precision, "exact");
  assert.equal(approximate.precision, "approximate");
  assert.equal(placed.precision, "user_placed");
  assert.equal(placed.horizontalAccuracyMeters, null);
  assert.equal(isConfirmedPrecisePlacePin(exact), true);
  assert.equal(isConfirmedPrecisePlacePin(approximate), false);
  assert.equal(isConfirmedPrecisePlacePin(placed), true);
  assert.equal(
    isConfirmedPrecisePlacePin({
      ...exact,
      horizontalAccuracyMeters: 18,
    }),
    false,
  );
  assert.equal(
    isConfirmedPrecisePlacePin({
      ...placed,
      source: "not_set",
    }),
    false,
  );
});

test("physical location truth requires both a confirmed Place pin and indoor detail", () => {
  const confirmedManualPin = createHonestPlacePin({
    latitude: 25.2854,
    longitude: 51.531,
    source: "manual_coordinates",
    observedAt: NOW,
    confirmedAt: NOW,
  });
  const unconfirmedDevicePin = createHonestPlacePin({
    latitude: 25.2854,
    longitude: 51.531,
    source: "device_gps",
    horizontalAccuracyMeters: 8,
    observedAt: NOW,
  });
  const base = {
    requiresPhysicalLocator: true,
    allowsVirtual: false,
    isRealEstate: false,
    requestedMode: "physical",
    requestedStatus: "known",
    hasPlace: true,
    hasIndoorLocator: true,
  };

  assert.equal(
    deriveLocationTruth({ ...base, placePin: null }).status,
    "needs-detail",
  );
  assert.equal(
    deriveLocationTruth({
      ...base,
      placePin: unconfirmedDevicePin,
    }).status,
    "needs-detail",
  );
  assert.equal(
    deriveLocationTruth({
      ...base,
      placePin: confirmedManualPin,
    }).status,
    "known",
  );
  assert.equal(
    deriveLocationTruth({
      ...base,
      hasIndoorLocator: false,
      placePin: confirmedManualPin,
    }).status,
    "needs-detail",
  );
});

test("moving an asset closes the prior revision without mutating it", () => {
  const pin = createHonestPlacePin({
    latitude: 25.2854,
    longitude: 51.531,
    source: "user_pin",
    observedAt: NOW,
    confirmedAt: NOW,
  });
  const first = appendLocationRevision([], {
    revisionId: "location-1",
    householdId: "household-1",
    assetId: "asset-1",
    mode: "physical",
    status: "known",
    placeSnapshot: {
      id: "place-1",
      name: "West Bay Home",
      addressSummary: "Doha",
      pin,
    },
    spacePathSnapshot: [],
    locatorText: "Study safe",
    confirmationState: "user-confirmed",
    source: "user_pin",
    observedAt: NOW,
    validFrom: NOW,
    createdByMemberId: "member-1",
    reason: "Asset created",
  });
  const moved = appendLocationRevision(first, {
    revisionId: "location-2",
    householdId: "household-1",
    assetId: "asset-1",
    mode: "physical",
    status: "known",
    placeSnapshot: {
      id: "place-2",
      name: "Pearl Apartment",
      addressSummary: "Doha",
      pin,
    },
    spacePathSnapshot: [],
    locatorText: "Bedroom cabinet",
    confirmationState: "user-confirmed",
    source: "imported",
    observedAt: LATER,
    validFrom: LATER,
    createdByMemberId: "member-1",
    reason: "Moved",
  });

  assert.equal(first[0].validTo, null);
  assert.equal(moved[0].validTo, LATER);
  assert.equal(moved[1].placeId, "place-2");
});

test("location revision retries are idempotent but ID reuse is rejected", () => {
  const pin = createHonestPlacePin({
    latitude: 25.2854,
    longitude: 51.531,
    source: "manual_coordinates",
    observedAt: NOW,
    confirmedAt: NOW,
  });
  const input = {
    revisionId: "location-retry",
    householdId: "household-1",
    assetId: "asset-1",
    mode: "physical",
    status: "known",
    placeSnapshot: {
      id: "place-1",
      name: "West Bay Home",
      addressSummary: "Doha",
      pin,
    },
    spacePathSnapshot: [],
    locatorText: "Study",
    confirmationState: "user-confirmed",
    source: "imported",
    observedAt: NOW,
    validFrom: NOW,
    createdByMemberId: "member-1",
    reason: "Asset created",
  };
  const first = appendLocationRevision([], input);
  assert.equal(appendLocationRevision(first, input), first);
  assert.throws(
    () =>
      appendLocationRevision(first, {
        ...input,
        locatorText: "Different location",
      }),
    /cannot be reused/u,
  );
});

test("a known location revision rejects missing or unconfirmed Place coordinates", () => {
  const base = {
    revisionId: "location-unresolved",
    householdId: "household-1",
    assetId: "asset-1",
    mode: "physical",
    status: "known",
    placeSnapshot: {
      id: "place-1",
      name: "West Bay Home",
      addressSummary: "Doha",
      pin: null,
    },
    spacePathSnapshot: [
      { id: "room-1", name: "Study", kind: "room" },
    ],
    locatorText: "Upper drawer",
    confirmationState: "user-confirmed",
    source: "user_pin",
    observedAt: NOW,
    validFrom: NOW,
    createdByMemberId: "member-1",
    reason: "Asset created",
  };

  assert.throws(
    () => appendLocationRevision([], base),
    /confirmed precise Place pin/u,
  );
  const unconfirmed = createHonestPlacePin({
    latitude: 25.2854,
    longitude: 51.531,
    source: "device_gps",
    horizontalAccuracyMeters: 6,
    observedAt: NOW,
  });
  assert.throws(
    () =>
      appendLocationRevision([], {
        ...base,
        placeSnapshot: { ...base.placeSnapshot, pin: unconfirmed },
      }),
    /confirmed precise Place pin/u,
  );
});

test("a new immutable original revokes prior evidence review", () => {
  const evidence = {
    id: "evidence-1",
    householdId: "household-1",
    assetId: "asset-1",
    type: "Current photo",
    kind: "media",
    relation: "condition",
    reviewStatus: "pending",
    currentVersionId: null,
    linkUrl: null,
    note: null,
    materialStorage: null,
    reviewedAt: null,
    reviewedByMemberId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const version = {
    id: evidenceVersionIdForChecksum(CHECKSUM),
    householdId: "household-1",
    evidenceId: "evidence-1",
    blobObjectId: "blob-1",
    fileName: "watch.jpg",
    mimeType: "image/jpeg",
    byteSize: 100,
    checksumSha256: CHECKSUM,
    storageState: "on-device",
    capturedAt: NOW,
    createdByMemberId: "member-1",
    createdAt: NOW,
  };
  const linked = applyEvidenceVersion(evidence, version, NOW);
  assert.equal(isEvidenceReviewable(linked, version), true);
  const reviewed = reviewEvidence(linked, version, "member-1", LATER);
  assert.equal(reviewed.reviewStatus, "reviewed");

  const nextVersion = {
    ...version,
    id: `ov_${"b".repeat(64)}`,
    checksumSha256: "b".repeat(64),
  };
  const replaced = applyEvidenceVersion(reviewed, nextVersion, LATER);
  assert.equal(replaced.reviewStatus, "pending");
  assert.equal(replaced.reviewedAt, null);
});

test("readiness is a visible seven-part checklist and never a stored score", () => {
  const pin = createHonestPlacePin({
    latitude: 25.2854,
    longitude: 51.531,
    source: "user_pin",
    observedAt: NOW,
    confirmedAt: NOW,
  });
  const asset = {
    id: "asset-1",
    householdId: "household-1",
    name: "GMT-Master II",
    categoryId: "lifestyle.watch",
    categoryLabel: "Watch",
    kind: "physical",
    ownerMemberId: "member-1",
    custodianMemberId: "member-1",
    locationMode: "physical",
    locationStatus: "known",
    placeId: "place-1",
    spaceId: "space-safe",
    locationDetail: "Watch roll",
    reference: "126710BLNR",
    value: { amountMinor: 4_600_000, currency: "QAR" },
    notes: null,
    requiredProofTypes: [],
    lifecycleStatus: "active",
    createdAt: NOW,
    updatedAt: NOW,
  };
  const place = {
    id: "place-1",
    householdId: "household-1",
    name: "West Bay Home",
    addressSummary: "Doha",
    pin,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  };
  const result = calculateAssetReadiness({
    asset,
    place,
    evidence: [],
    evidenceVersions: [],
  });

  assert.equal(result.items.length, 7);
  assert.equal(result.percent, 100);
  assert.deepEqual(result.missing, []);
});
