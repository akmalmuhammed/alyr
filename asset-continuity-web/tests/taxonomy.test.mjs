import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSET_CATEGORY_GROUPS,
  ASSET_TAXONOMY_VERSION,
  CATEGORY_PROFILES,
  MATERIAL_KINDS,
  MATERIAL_RELATIONS,
  createCustomAssetCategory,
  getAssetCategory,
  getAssetCategoryPath,
  getCategoryProfile,
  getMaterialKind,
  getMaterialRelation,
  getRecentAssetCategories,
  listAssetCategories,
  resolveAssetCategory,
  searchAssetCategories,
} from "../src/taxonomy.js";

test("taxonomy exposes unique stable leaves with valid groups and profiles", () => {
  assert.equal(ASSET_TAXONOMY_VERSION, 1);
  assert.ok(ASSET_CATEGORY_GROUPS.length >= 8);

  const groupIds = ASSET_CATEGORY_GROUPS.map((group) => group.id);
  assert.equal(new Set(groupIds).size, groupIds.length);

  const profileIds = new Set(CATEGORY_PROFILES.map((profile) => profile.id));
  const categories = listAssetCategories();
  const categoryIds = categories.map((category) => category.id);

  assert.ok(categories.length >= 50);
  assert.equal(new Set(categoryIds).size, categoryIds.length);
  for (const category of categories) {
    assert.ok(groupIds.includes(category.groupId), category.id);
    assert.ok(profileIds.has(category.profileId), category.id);
    assert.match(category.pathLabel, / \/ /);
    assert.equal(typeof category.iconKey, "string");
    assert.ok(category.recommendedEvidenceTypes.length > 0);
  }

  assert.equal(Object.isFrozen(ASSET_CATEGORY_GROUPS), true);
  assert.equal(Object.isFrozen(ASSET_CATEGORY_GROUPS[0].categories), true);
});

test("legacy labels and everyday aliases resolve to canonical category IDs", () => {
  const legacyExpectations = {
    Watch: "lifestyle.watch",
    Property: "property.other",
    Document: "record.other-document",
    Collectible: "lifestyle.collectible",
    Camera: "lifestyle.camera",
    Personal: "lifestyle.personal-item",
    Digital: "digital.asset",
    Other: "custom.other",
  };

  for (const [legacyLabel, expectedId] of Object.entries(legacyExpectations)) {
    assert.equal(resolveAssetCategory(legacyLabel)?.id, expectedId);
  }

  assert.equal(resolveAssetCategory("motorbike")?.id, "vehicle.motorcycle");
  assert.equal(resolveAssetCategory("plot")?.id, "property.land");
  assert.equal(resolveAssetCategory({ categoryId: "vehicle.car" })?.label, "Car");
  assert.equal(resolveAssetCategory("not a real category"), null);
});

test("search ranks direct aliases and labels while retaining hierarchy context", () => {
  const motorbike = searchAssetCategories("motorbike");
  assert.equal(motorbike[0].id, "vehicle.motorcycle");
  assert.equal(motorbike[0].matchedOn, "alias");
  assert.equal(motorbike[0].groupLabel, "Vehicles & mobility");

  const watches = searchAssetCategories("watch", { limit: 3 });
  assert.equal(watches[0].id, "lifestyle.watch");
  assert.equal(watches.length <= 3, true);

  const allVehicles = searchAssetCategories("Vehicles & mobility");
  assert.ok(allVehicles.length >= 6);
  assert.ok(allVehicles.every((result) => result.groupId === "vehicles-mobility"));

  assert.deepEqual(searchAssetCategories("no category matches this phrase"), []);
  assert.equal(searchAssetCategories("", { limit: 5 }).length, 5);
});

test("category paths and profiles expose capture-ready field metadata", () => {
  assert.deepEqual(getAssetCategoryPath("vehicle.car"), {
    groupId: "vehicles-mobility",
    groupLabel: "Vehicles & mobility",
    categoryId: "vehicle.car",
    categoryLabel: "Car",
    ids: ["vehicles-mobility", "vehicle.car"],
    labels: ["Vehicles & mobility", "Car"],
    label: "Vehicles & mobility / Car",
  });

  const carProfile = getCategoryProfile("vehicle.car");
  assert.equal(carProfile.id, "vehicle");
  assert.ok(carProfile.fields.some((field) => field.id === "vin"));
  assert.ok(
    carProfile.fields.find((field) => field.id === "vin").privacy ===
      "sensitive",
  );

  assert.equal(getCategoryProfile("watch").id, "watch");
  assert.equal(getCategoryProfile("document-record").id, "document-record");
  assert.equal(getCategoryProfile("does-not-exist"), null);
  assert.equal(getAssetCategory("vehicle.car").pathLabel, "Vehicles & mobility / Car");
});

test("custom categories are deterministic, validated, searchable, and portable", () => {
  const input = {
    name: "Falconry equipment",
    groupId: "lifestyle-personal",
    aliases: ["falcon gear", "Falcon gear"],
    profileId: "general-physical",
    recommendedEvidenceTypes: ["Current photo", "Ownership record"],
  };
  const first = createCustomAssetCategory(input);
  const second = createCustomAssetCategory(input);

  assert.equal(first.id, "custom.falconry-equipment");
  assert.deepEqual(first, second);
  assert.equal(first.isCustom, true);
  assert.deepEqual(first.aliases, ["falcon gear"]);
  assert.equal(Object.isFrozen(first), true);

  const options = { customCategories: [first] };
  assert.equal(
    resolveAssetCategory("falcon gear", options)?.id,
    "custom.falconry-equipment",
  );
  assert.equal(
    searchAssetCategories("falcon", options)[0].pathLabel,
    "Lifestyle & collectibles / Falconry equipment",
  );
  assert.ok(
    listAssetCategories(options).some(
      (category) => category.id === "custom.falconry-equipment",
    ),
  );

  assert.throws(() => createCustomAssetCategory(), /object is required/i);
  assert.throws(() => createCustomAssetCategory({ name: "  " }), /needs a name/i);
});

test("recent categories preserve order, remove duplicates, and accept legacy labels", () => {
  const recent = getRecentAssetCategories(
    ["Watch", "lifestyle.watch", "motorbike", "missing", "property.land"],
    { limit: 3 },
  );

  assert.deepEqual(
    recent.map((category) => category.id),
    ["lifestyle.watch", "vehicle.motorcycle", "property.land"],
  );
  assert.deepEqual(getRecentAssetCategories(null), []);
});

test("papers, artifacts, media, notes, links, and records are universal materials", () => {
  assert.deepEqual(
    MATERIAL_KINDS.map((kind) => kind.id),
    ["paper", "artifact", "media", "note", "link", "record"],
  );
  assert.ok(MATERIAL_KINDS.every((kind) => kind.universal));
  assert.equal(getMaterialKind("paper")?.pluralLabel, "Papers & documents");
  assert.match(getMaterialKind("artifact")?.description, /physical object/i);
  assert.equal(getMaterialKind("missing"), null);

  assert.ok(MATERIAL_RELATIONS.length >= 8);
  assert.equal(getMaterialRelation("ownership")?.label, "Ownership");
  assert.equal(getMaterialRelation("context")?.label, "Context & story");
  assert.equal(getMaterialRelation("missing"), null);
});
