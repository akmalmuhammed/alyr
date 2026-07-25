import assert from "node:assert/strict";
import test from "node:test";

import { calculateAssetReadiness } from "@alyr/domain";

import {
  FOCUSED_FIXTURE_ASSET_TARGET,
  FOCUSED_HOUSEHOLD_FIXTURE,
  createFocusedHouseholdFixture,
} from "../dist/index.js";

test("focused fixture contains exactly 25 deterministic active assets", () => {
  const first = createFocusedHouseholdFixture();
  const second = createFocusedHouseholdFixture();

  assert.equal(first.assets.length, FOCUSED_FIXTURE_ASSET_TARGET);
  assert.equal(first.assets.every((asset) => asset.lifecycleStatus === "active"), true);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(FOCUSED_HOUSEHOLD_FIXTURE), true);
  assert.equal(Object.isFrozen(FOCUSED_HOUSEHOLD_FIXTURE.assets), true);
});

test("every asset has a stable category, owner, and one evidence requirement", () => {
  const fixture = createFocusedHouseholdFixture();
  const ids = new Set(fixture.assets.map((asset) => asset.id));

  assert.equal(ids.size, FOCUSED_FIXTURE_ASSET_TARGET);
  assert.equal(
    fixture.assets.every(
      (asset) =>
        asset.categoryId &&
        asset.ownerMemberId === "member-owner" &&
        asset.requiredProofTypes.length === 1,
    ),
    true,
  );
  assert.equal(fixture.evidence.length, FOCUSED_FIXTURE_ASSET_TARGET);
  assert.equal(fixture.evidenceVersions.length, FOCUSED_FIXTURE_ASSET_TARGET);
});

test("fixture expresses both complete proof and visible proof gaps", () => {
  const fixture = createFocusedHouseholdFixture();
  const readiness = fixture.assets.map((asset) =>
    calculateAssetReadiness({
      asset,
      place:
        fixture.places.find((place) => place.id === asset.placeId) ?? null,
      evidence: fixture.evidence,
      evidenceVersions: fixture.evidenceVersions,
    }),
  );

  assert.ok(readiness.some((item) => item.evidence.complete));
  assert.ok(readiness.some((item) => !item.evidence.complete));
});
