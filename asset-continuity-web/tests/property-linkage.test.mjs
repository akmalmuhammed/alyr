import assert from "node:assert/strict";
import test from "node:test";

import {
  isOwnedPropertyTenure,
  isRealEstateAsset,
  linkPropertyProjection,
  normalizePropertyTenure,
  propertyAssetForPlace,
  propertyPlaceForAsset,
  reconcilePropertyLinks,
  unlinkPropertyProjection,
} from "../src/propertyLinkage.js";

function fixture(overrides = {}) {
  return {
    places: [
      {
        id: "place-home",
        name: "Pearl apartment",
        tenure: "owned",
        status: "active",
        propertyAssetId: null,
      },
      {
        id: "place-rental",
        name: "Rented flat",
        tenure: "rented",
        status: "active",
        propertyAssetId: null,
      },
    ],
    assets: [
      {
        id: "asset-home",
        name: "Pearl apartment passport",
        categoryId: "property.apartment",
        kind: "real-estate",
        lifecycleStatus: "active",
        propertyPlaceId: null,
      },
      {
        id: "asset-watch",
        name: "Watch",
        categoryId: "lifestyle.watch",
        kind: "physical",
        lifecycleStatus: "active",
        propertyPlaceId: null,
      },
    ],
    ...overrides,
  };
}

test("normalizes property tenure aliases without inventing ownership", () => {
  assert.equal(normalizePropertyTenure("co-own"), "co_owned");
  assert.equal(normalizePropertyTenure("tenant"), "rented");
  assert.equal(normalizePropertyTenure("unexpected"), "unknown");
  assert.equal(isOwnedPropertyTenure("own"), true);
  assert.equal(isOwnedPropertyTenure("managed"), false);
});

test("recognizes the real-estate taxonomy and legacy real-estate kind", () => {
  assert.equal(isRealEstateAsset({ categoryId: "property.land" }), true);
  assert.equal(isRealEstateAsset({ kind: "real-estate" }), true);
  assert.equal(isRealEstateAsset({ categoryId: "lifestyle.watch" }), false);
});

test("links one owned Place to one real-estate Asset Passport in both directions", () => {
  const result = linkPropertyProjection(fixture(), {
    placeId: "place-home",
    assetId: "asset-home",
  });
  assert.equal(result.ok, true);
  assert.equal(result.workspace.places[0].propertyAssetId, "asset-home");
  assert.equal(result.workspace.assets[0].propertyPlaceId, "place-home");
  assert.equal(
    propertyAssetForPlace(result.workspace, "place-home")?.id,
    "asset-home",
  );
  assert.equal(
    propertyPlaceForAsset(result.workspace, "asset-home")?.id,
    "place-home",
  );
});

test("rented or managed Places never link to an owned Asset Passport", () => {
  const result = linkPropertyProjection(fixture(), {
    placeId: "place-rental",
    assetId: "asset-home",
  });
  assert.deepEqual(result, { ok: false, reason: "place_not_owned" });
});

test("non-property assets cannot become a property projection", () => {
  const result = linkPropertyProjection(fixture(), {
    placeId: "place-home",
    assetId: "asset-watch",
  });
  assert.deepEqual(result, { ok: false, reason: "asset_not_real_estate" });
});

test("linking refuses to silently replace either side of an existing pair", () => {
  const workspace = fixture({
    places: [
      {
        id: "place-home",
        tenure: "owned",
        status: "active",
        propertyAssetId: "asset-other",
      },
    ],
    assets: [
      {
        id: "asset-home",
        categoryId: "property.house",
        lifecycleStatus: "active",
        propertyPlaceId: null,
      },
      {
        id: "asset-other",
        categoryId: "property.house",
        lifecycleStatus: "active",
        propertyPlaceId: "place-home",
      },
    ],
  });
  assert.deepEqual(
    linkPropertyProjection(workspace, {
      placeId: "place-home",
      assetId: "asset-home",
    }),
    { ok: false, reason: "place_already_linked" },
  );
});

test("reconciliation favors a mutual pair and reports conflicting claims", () => {
  const reconciled = reconcilePropertyLinks({
    places: [
      {
        id: "place-a",
        tenure: "owned",
        status: "active",
        propertyAssetId: "asset-a",
      },
      {
        id: "place-b",
        tenure: "co_owned",
        status: "active",
        propertyAssetId: "asset-a",
      },
    ],
    assets: [
      {
        id: "asset-a",
        categoryId: "property.house",
        lifecycleStatus: "active",
        propertyPlaceId: "place-a",
      },
    ],
  });
  assert.deepEqual(reconciled.links, [
    { placeId: "place-a", assetId: "asset-a" },
  ]);
  assert.equal(reconciled.places[0].propertyAssetId, "asset-a");
  assert.equal(reconciled.places[1].propertyAssetId, null);
  assert.equal(reconciled.assets[0].propertyPlaceId, "place-a");
  assert.equal(
    reconciled.issues.some((entry) => entry.type === "conflicting_link"),
    true,
  );
});

test("reconciliation removes ineligible, dangling, archived, and wrong-type links", () => {
  const reconciled = reconcilePropertyLinks({
    places: [
      {
        id: "rented",
        tenure: "rented",
        status: "active",
        propertyAssetId: "property",
      },
      {
        id: "owned",
        tenure: "owned",
        status: "active",
        propertyAssetId: "watch",
      },
      {
        id: "dangling",
        tenure: "owned",
        status: "active",
        propertyAssetId: "missing",
      },
    ],
    assets: [
      {
        id: "property",
        categoryId: "property.house",
        lifecycleStatus: "active",
        propertyPlaceId: "rented",
      },
      {
        id: "watch",
        categoryId: "lifestyle.watch",
        lifecycleStatus: "active",
        propertyPlaceId: "owned",
      },
    ],
  });
  assert.deepEqual(reconciled.links, []);
  assert.equal(
    reconciled.issues.some((entry) => entry.type === "ineligible_tenure"),
    true,
  );
  assert.equal(
    reconciled.issues.some((entry) => entry.type === "not_real_estate_asset"),
    true,
  );
  assert.equal(
    reconciled.issues.some((entry) => entry.type === "dangling_link"),
    true,
  );
});

test("unlink requires and clears the exact mutual pair", () => {
  const linked = linkPropertyProjection(fixture(), {
    placeId: "place-home",
    assetId: "asset-home",
  }).workspace;
  const result = unlinkPropertyProjection(linked, {
    placeId: "place-home",
    assetId: "asset-home",
  });
  assert.equal(result.ok, true);
  assert.equal(result.workspace.places[0].propertyAssetId, null);
  assert.equal(result.workspace.assets[0].propertyPlaceId, null);
  assert.deepEqual(
    unlinkPropertyProjection(result.workspace, {
      placeId: "place-home",
      assetId: "asset-home",
    }),
    { ok: false, reason: "link_not_found" },
  );
});

