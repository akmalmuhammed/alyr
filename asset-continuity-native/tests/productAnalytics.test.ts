import { createPrivacySafeEvent } from "@alyr/analytics";
import type {
  AnalyticsEvent,
  ContractError,
  Result
} from "@alyr/contracts";

import {
  DurableAnalyticsAdapter,
  accessGrantCreatedEvent,
  assetRetrievalCompletedEvent,
  continuitySnapshotExportedEvent,
  criticalRegisterCompletedEvent,
  firstAssetPassportCreatedEvent,
  householdCreatedEvent,
  type AnalyticsQueueStore,
  type ProductEventTransport,
  type QueuedAnalyticsEvent
} from "@/analytics";

class TestQueue implements AnalyticsQueueStore {
  readonly entries = new Map<string, QueuedAnalyticsEvent>();
  readonly milestones = new Set<string>();

  async enqueueAnalyticsEvent(
    entry: Omit<QueuedAnalyticsEvent, "attemptCount">
  ): Promise<"queued" | "duplicate"> {
    if (entry.dedupeKey && this.milestones.has(entry.dedupeKey)) {
      return "duplicate";
    }
    this.entries.set(entry.idempotencyKey, {
      ...entry,
      attemptCount: 0
    });
    if (entry.dedupeKey) this.milestones.add(entry.dedupeKey);
    return "queued";
  }

  async listPendingAnalyticsEvents(limit: number) {
    return [...this.entries.values()].slice(0, limit);
  }

  async recordAnalyticsAttempt(idempotencyKey: string) {
    const entry = this.entries.get(idempotencyKey);
    if (entry) {
      this.entries.set(idempotencyKey, {
        ...entry,
        attemptCount: entry.attemptCount + 1
      });
    }
  }

  async acknowledgeAnalyticsEvent(idempotencyKey: string) {
    this.entries.delete(idempotencyKey);
  }
}

class SwitchingTransport implements ProductEventTransport {
  online = false;
  readonly attempts: Array<
    Pick<QueuedAnalyticsEvent, "idempotencyKey" | "event">
  > = [];

  async record(
    entry: Pick<QueuedAnalyticsEvent, "idempotencyKey" | "event">
  ): Promise<Result<void, ContractError>> {
    this.attempts.push(entry);
    return this.online
      ? { ok: true, value: undefined }
      : {
          ok: false,
          error: {
            errorVersion: 1,
            code: "OFFLINE",
            message: "offline",
            retryable: true
          }
        };
  }
}

const common = {
  schemaVersion: 1 as const,
  platform: "ios" as const,
  appVersion: "0.1.0",
  locale: "ar" as const,
  occurredOffline: true
};

describe("durable privacy-safe pilot analytics", () => {
  it("keeps one client event key through an offline retry and deletes only after acknowledgement", async () => {
    const queue = new TestQueue();
    const transport = new SwitchingTransport();
    const eventId = "94000000-0000-4000-8000-000000000001";
    const adapter = new DurableAnalyticsAdapter(
      queue,
      transport,
      () => eventId,
      () => "2026-07-28T14:00:00.000Z"
    );
    const event = householdCreatedEvent(common);

    await adapter.track(event);
    await expect(adapter.flush()).resolves.toMatchObject({ ok: false });
    expect(queue.entries.get(eventId)).toMatchObject({
      idempotencyKey: eventId,
      event
    });

    transport.online = true;
    const afterRestart = new DurableAnalyticsAdapter(
      queue,
      transport,
      () => "94000000-0000-4000-8000-000000000099"
    );
    await expect(afterRestart.flush()).resolves.toEqual({
      ok: true,
      value: undefined
    });
    expect(queue.entries.size).toBe(0);
    expect(
      transport.attempts.map((attempt) => attempt.idempotencyKey)
    ).toEqual([eventId, eventId]);
  });

  it("rejects private fields before they enter the durable queue", async () => {
    const queue = new TestQueue();
    const adapter = new DurableAnalyticsAdapter(
      queue,
      new SwitchingTransport(),
      () => "94000000-0000-4000-8000-000000000002"
    );
    const unsafe = {
      name: "asset_retrieval_completed",
      payload: {
        ...common,
        resultEntityType: "asset",
        retrievalSource: "search",
        address: "Private address"
      }
    } as unknown as AnalyticsEvent;

    await expect(adapter.track(unsafe)).rejects.toMatchObject({
      code: "PROHIBITED_PROPERTY"
    });
    expect(queue.entries.size).toBe(0);
  });

  it("constructs all six pilot events from bounded vocabularies in Arabic or English", () => {
    const events = [
      householdCreatedEvent(common),
      firstAssetPassportCreatedEvent(
        common,
        {
          name: "not retained",
          categoryId: "other.other",
          categoryLabel: "not retained",
          photo: null,
          locationStatus: "unknown",
          placeId: null,
          roomId: null,
          locatorText: null,
          evidence: null,
          captureSource: "manual"
        },
        "2026-07-28T13:58:00.000Z",
        "2026-07-28T14:00:00.000Z"
      ),
      criticalRegisterCompletedEvent(
        { ...common, locale: "en" },
        "2026-07-27T14:00:00.000Z",
        "2026-07-28T14:00:00.000Z"
      ),
      assetRetrievalCompletedEvent(common, "search"),
      accessGrantCreatedEvent(common, "viewer", 72),
      continuitySnapshotExportedEvent(common, "pdf", 25, true)
    ];

    expect(events.map((event) => event.name)).toEqual([
      "household_created",
      "first_asset_passport_created",
      "critical_register_25_completed",
      "asset_retrieval_completed",
      "access_grant_created",
      "continuity_snapshot_exported"
    ]);
    const serialized = JSON.stringify(events);
    for (const prohibited of [
      "Private address",
      "not retained",
      "householdId",
      "assetId",
      "filename",
      "latitude",
      "longitude",
      "value"
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it("deduplicates one-time milestones after a server acknowledgement", async () => {
    const queue = new TestQueue();
    const transport = new SwitchingTransport();
    transport.online = true;
    let ordinal = 10;
    const adapter = new DurableAnalyticsAdapter(
      queue,
      transport,
      () =>
        `94000000-0000-4000-8000-${String(ordinal++).padStart(12, "0")}`
    );
    const event = createPrivacySafeEvent("household_created", {
      ...common,
      creationMode: "personal"
    });
    await adapter.track(event);
    await adapter.flush();
    await adapter.track(event);
    await adapter.flush();
    expect(transport.attempts).toHaveLength(1);
  });
});
