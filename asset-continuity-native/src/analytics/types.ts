import type {
  AnalyticsEvent,
  ContractError,
  Result
} from "@alyr/contracts";

export const ANALYTICS_QUEUE_CAPACITY = 256;
export const ANALYTICS_FLUSH_BATCH_SIZE = 25;

export interface QueuedAnalyticsEvent {
  readonly idempotencyKey: string;
  readonly dedupeKey: string | null;
  readonly event: AnalyticsEvent;
  readonly createdAt: string;
  readonly attemptCount: number;
}

/**
 * Implementations must persist only events that passed the shared
 * `@alyr/analytics` allow-list. The signed native implementation stores this
 * queue inside the household's SQLCipher database.
 */
export interface AnalyticsQueueStore {
  enqueueAnalyticsEvent(
    entry: Omit<QueuedAnalyticsEvent, "attemptCount">
  ): Promise<"queued" | "duplicate">;
  listPendingAnalyticsEvents(
    limit: number
  ): Promise<readonly QueuedAnalyticsEvent[]>;
  recordAnalyticsAttempt(
    idempotencyKey: string,
    attemptedAt: string
  ): Promise<void>;
  acknowledgeAnalyticsEvent(idempotencyKey: string): Promise<void>;
}

export interface ProductEventTransport {
  record(
    entry: Pick<QueuedAnalyticsEvent, "idempotencyKey" | "event">
  ): Promise<Result<void, ContractError>>;
}

export function isAnalyticsQueueStore(
  value: unknown
): value is AnalyticsQueueStore {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AnalyticsQueueStore>;
  return (
    typeof candidate.enqueueAnalyticsEvent === "function" &&
    typeof candidate.listPendingAnalyticsEvents === "function" &&
    typeof candidate.recordAnalyticsAttempt === "function" &&
    typeof candidate.acknowledgeAnalyticsEvent === "function"
  );
}
