import {
  validateAnalyticsEvent
} from "@alyr/analytics";
import {
  API_ERROR_VERSION,
  type AnalyticsEvent,
  type AnalyticsPort,
  type ContractError,
  type Result
} from "@alyr/contracts";

import {
  ANALYTICS_FLUSH_BATCH_SIZE,
  type AnalyticsQueueStore,
  type ProductEventTransport
} from "./types";

const milestoneDedupeKeys: Partial<
  Readonly<Record<AnalyticsEvent["name"], string>>
> = {
  household_created: "milestone:household-created",
  first_asset_passport_created: "milestone:first-asset-passport",
  critical_register_25_completed: "milestone:critical-register-25"
};

function analyticsFailure(
  message: string,
  retryable: boolean
): Result<void, ContractError> {
  return {
    ok: false,
    error: {
      errorVersion: API_ERROR_VERSION,
      code: "STORAGE_UNAVAILABLE",
      message,
      retryable
    }
  };
}

/**
 * Persists validated events before attempting the network. Retry uses the same
 * client-generated UUID until the authenticated API acknowledges it.
 */
export class DurableAnalyticsAdapter implements AnalyticsPort {
  private flushInFlight: Promise<Result<void, ContractError>> | null = null;

  constructor(
    private readonly queue: AnalyticsQueueStore,
    private readonly transport: ProductEventTransport,
    private readonly createIdempotencyKey: () => string,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async track(event: AnalyticsEvent): Promise<void> {
    const errors = validateAnalyticsEvent(event);
    if (errors.length > 0) throw errors[0];

    await this.queue.enqueueAnalyticsEvent({
      idempotencyKey: this.createIdempotencyKey(),
      dedupeKey: milestoneDedupeKeys[event.name] ?? null,
      event: {
        name: event.name,
        payload: { ...event.payload }
      } as AnalyticsEvent,
      createdAt: this.now()
    });

    // Queue durability is the action boundary. Connectivity never blocks the
    // user's domain mutation, and this best-effort flush cannot lose the row.
    void this.flush().catch(() => undefined);
  }

  async flush(): Promise<Result<void, ContractError>> {
    if (this.flushInFlight) return this.flushInFlight;
    const task = this.flushPending().finally(() => {
      if (this.flushInFlight === task) {
        this.flushInFlight = null;
      }
    });
    this.flushInFlight = task;
    return task;
  }

  private async flushPending(): Promise<Result<void, ContractError>> {
    let entries;
    try {
      entries = await this.queue.listPendingAnalyticsEvents(
        ANALYTICS_FLUSH_BATCH_SIZE
      );
    } catch {
      return analyticsFailure(
        "The encrypted analytics queue could not be read.",
        true
      );
    }

    for (const entry of entries) {
      let result: Result<void, ContractError>;
      try {
        result = await this.transport.record(entry);
      } catch {
        result = analyticsFailure(
          "The product event service could not be reached.",
          true
        );
      }
      if (!result.ok) {
        await this.queue
          .recordAnalyticsAttempt(entry.idempotencyKey, this.now())
          .catch(() => undefined);
        return result;
      }
      try {
        await this.queue.acknowledgeAnalyticsEvent(
          entry.idempotencyKey
        );
      } catch {
        return analyticsFailure(
          "The product event acknowledgement could not be saved.",
          true
        );
      }
    }

    return { ok: true, value: undefined };
  }
}
