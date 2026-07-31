import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYTICS_EVENT_ALLOW_LIST,
  ANALYTICS_PROHIBITED_KEY_FRAGMENTS,
  apiErrorRetryabilityIsValid,
  DOMAIN_COMMAND_TYPES,
  LOCALE_DIRECTIONS,
  ROLE_CAPABILITIES,
  SUPPORTED_LOCALES,
} from "../dist/index.js";

test("quota capacity errors are always action-required", () => {
  assert.equal(
    apiErrorRetryabilityIsValid("QUOTA_EXCEEDED", false),
    true,
  );
  assert.equal(
    apiErrorRetryabilityIsValid("QUOTA_EXCEEDED", true),
    false,
  );
  assert.equal(
    apiErrorRetryabilityIsValid("STORAGE_UNAVAILABLE", true),
    true,
  );
});

test("Place documents have explicit sync commands without weakening Evidence commands", () => {
  assert.ok(DOMAIN_COMMAND_TYPES.includes("place-document.create"));
  assert.ok(DOMAIN_COMMAND_TYPES.includes("place-document.version.add"));
  assert.ok(DOMAIN_COMMAND_TYPES.includes("evidence.create"));
  assert.ok(DOMAIN_COMMAND_TYPES.includes("evidence.version.add"));
  assert.equal(new Set(DOMAIN_COMMAND_TYPES).size, DOMAIN_COMMAND_TYPES.length);
});

test("Asset category and primary-photo selections are explicit sync commands", () => {
  assert.ok(DOMAIN_COMMAND_TYPES.includes("asset.category.set"));
  assert.ok(DOMAIN_COMMAND_TYPES.includes("asset.primary-photo.set"));
});

test("role capability sets remain deny-by-default and ordered by authority", () => {
  const owner = new Set(ROLE_CAPABILITIES.owner);
  const editor = new Set(ROLE_CAPABILITIES.editor);
  const viewer = new Set(ROLE_CAPABILITIES.viewer);

  assert.ok([...viewer].every((capability) => editor.has(capability)));
  assert.ok([...editor].every((capability) => owner.has(capability)));
  assert.equal(viewer.has("asset.write"), false);
  assert.equal(editor.has("member.manage"), false);
  assert.equal(owner.has("member.manage"), true);
  assert.equal(owner.has("liability.read"), true);
  assert.equal(owner.has("liability.write"), true);
  assert.equal(editor.has("liability.read"), false);
  assert.equal(editor.has("liability.write"), false);
  assert.equal(viewer.has("liability.read"), false);
});

test("English and Arabic retain explicit reading directions", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["en", "ar"]);
  assert.equal(LOCALE_DIRECTIONS.en, "ltr");
  assert.equal(LOCALE_DIRECTIONS.ar, "rtl");
});

test("analytics allow-list contains no prohibited privacy key fragments", () => {
  for (const [eventName, keys] of Object.entries(ANALYTICS_EVENT_ALLOW_LIST)) {
    assert.ok(keys.includes("schemaVersion"), eventName);
    for (const key of keys) {
      const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
      assert.equal(
        ANALYTICS_PROHIBITED_KEY_FRAGMENTS.some((fragment) =>
          normalized.includes(fragment),
        ),
        false,
        `${eventName}.${key}`,
      );
    }
  }
});
