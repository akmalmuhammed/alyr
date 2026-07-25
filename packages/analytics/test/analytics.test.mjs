import assert from "node:assert/strict";
import test from "node:test";

import {
  AnalyticsPrivacyError,
  InMemoryAnalyticsAdapter,
  createPrivacySafeEvent,
  validateAnalyticsEvent,
} from "../dist/index.js";

const common = {
  schemaVersion: 1,
  platform: "android",
  appVersion: "0.1.0",
  locale: "en",
  occurredOffline: true,
};

test("accepts only event-specific allow-listed properties", () => {
  const event = createPrivacySafeEvent("asset_location_confirmed", {
    ...common,
    locationPrecision: "user_placed",
    hierarchyDepth: 3,
  });
  assert.equal(validateAnalyticsEvent(event).length, 0);
});

test("rejects private search, identity, and coordinate fields before queuing", () => {
  for (const payload of [
    { ...common, searchQuery: "watch" },
    { ...common, householdId: "household-1" },
    { ...common, latitude: 25.2854 },
  ]) {
    assert.throws(
      () => createPrivacySafeEvent("asset_retrieval_completed", payload),
      AnalyticsPrivacyError,
    );
  }
});

test("rejects arbitrary strings even when placed under an allowed key", () => {
  assert.throws(
    () =>
      createPrivacySafeEvent("first_asset_passport_created", {
        ...common,
        captureSource: "My private watch name",
        elapsedTimeBand: "under-5-minutes",
      }),
    AnalyticsPrivacyError,
  );
});

test("in-memory adapter retains only validated immutable copies", async () => {
  const adapter = new InMemoryAnalyticsAdapter();
  const payload = {
    ...common,
    captureSource: "camera",
    elapsedTimeBand: "under-5-minutes",
  };
  await adapter.track(
    createPrivacySafeEvent("first_asset_passport_created", payload),
  );
  payload.captureSource = "changed-after-track";

  assert.equal(adapter.events.length, 1);
  assert.equal(adapter.events[0].payload.captureSource, "camera");
});
