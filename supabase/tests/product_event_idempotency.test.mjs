import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../migrations/202607280009_product_event_idempotency.sql",
    import.meta.url,
  ),
  "utf8",
);
const api = readFileSync(
  new URL("../functions/api/index.ts", import.meta.url),
  "utf8",
);
const analyticsContract = readFileSync(
  new URL("../../packages/contracts/src/analytics.ts", import.meta.url),
  "utf8",
);
const openApi = readFileSync(
  new URL("../openapi.yaml", import.meta.url),
  "utf8",
);

const requiredPilotEvents = [
  "household_created",
  "first_asset_passport_created",
  "critical_register_25_completed",
  "asset_retrieval_completed",
  "access_grant_created",
  "continuity_snapshot_exported",
];

test("authenticated product-event route mirrors the shared event vocabulary", () => {
  for (const eventName of requiredPilotEvents) {
    assert.match(analyticsContract, new RegExp(`${eventName}:`));
    assert.match(api, new RegExp(`${eventName}:`));
    assert.match(openApi, new RegExp(`- ${eventName}`));
  }
  assert.match(
    api,
    /path === "\/product-events"[\s\S]*handleProductEvent\(request, context\)/,
  );
  assert.match(
    api,
    /validProductEventProperties\(eventName, body\.properties\)/,
  );
  assert.match(
    api,
    /p_client_event_id: idempotencyKey/,
  );
  assert.match(
    api,
    /apiVersion: 1,[\s\S]*accepted: true,[\s\S]*idempotencyKey/,
  );
});
test("database ingestion requires and replays one authenticated client event key", () => {
  assert.match(
    migration,
    /client_event_id uuid[\s\S]*set not null/,
  );
  assert.match(
    migration,
    /product_events_actor_client_event_id_unique/,
  );
  assert.match(
    migration,
    /drop function public\.record_product_event\(text, uuid, jsonb\)/,
  );
  assert.match(
    migration,
    /record_product_event\([\s\S]*p_client_event_id uuid/,
  );
  assert.match(
    migration,
    /on conflict \(actor_id, client_event_id\)[\s\S]*do nothing/,
  );
  assert.match(
    migration,
    /v_existing\.properties is distinct from v_properties[\s\S]*ANALYTICS_IDEMPOTENCY_CONFLICT/,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_product_event\([\s\S]*uuid[\s\S]*\) to authenticated/,
  );
});
