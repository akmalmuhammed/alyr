import {
  ANALYTICS_EVENT_ALLOW_LIST,
  ANALYTICS_PROHIBITED_KEY_FRAGMENTS,
  ANALYTICS_SCHEMA_VERSION,
} from "@alyr/contracts";
import type {
  AnalyticsEvent,
  AnalyticsEventName,
  AnalyticsPayload,
  AnalyticsPort,
  ContractError,
  JsonPrimitive,
  Result,
} from "@alyr/contracts";

export const PRIVACY_SAFE_ANALYTICS_POLICY = {
  schemaVersion: ANALYTICS_SCHEMA_VERSION,
  neverCollect: [
    "asset names",
    "addresses",
    "coordinates",
    "values or identifiers",
    "search text",
    "document names or contents",
    "household/member/device identifiers",
    "email addresses, phone numbers, or invitation codes",
  ],
  localQueueRule:
    "Reject unsafe events before they enter durable local storage.",
} as const;

export class AnalyticsPrivacyError extends Error {
  readonly code:
    | "UNKNOWN_EVENT"
    | "UNKNOWN_PROPERTY"
    | "MISSING_PROPERTY"
    | "PROHIBITED_PROPERTY"
    | "INVALID_SCHEMA_VERSION"
    | "INVALID_VALUE";

  constructor(
    code: AnalyticsPrivacyError["code"],
    message: string,
  ) {
    super(message);
    this.name = "AnalyticsPrivacyError";
    this.code = code;
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}

function isPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

const ENUM_VALUES = {
  platform: ["ios", "android", "web"],
  locale: ["en", "ar"],
  invitationChannel: ["manual-code", "deep-link"],
  creationMode: ["sample", "personal"],
  captureSource: ["camera", "image-library", "document-import", "manual"],
  elapsedTimeBand: [
    "under-2-minutes",
    "under-5-minutes",
    "5-10-minutes",
    "over-10-minutes",
  ],
  locationPrecision: [
    "exact",
    "user_placed",
    "approximate",
    "locality_only",
    "unknown",
  ],
  evidenceKind: ["paper", "artifact", "media", "record", "note", "link"],
  completionTimeBand: [
    "same-day",
    "2-7-days",
    "8-30-days",
    "over-30-days",
  ],
  resultEntityType: ["asset", "place", "space", "evidence", "member"],
  retrievalSource: ["search", "asset-list", "place-view", "deep-link"],
  role: ["owner", "editor", "viewer"],
  expiryBand: ["24-hours", "7-days", "30-days", "no-expiry"],
  format: ["pdf", "json-manifest"],
  assetCountBand: ["1-5", "6-24", "25-49", "50-plus"],
  returnDayBand: ["30-34", "35-39", "40-45"],
  planCode: ["pilot-household", "pilot-partner"],
  amountBand: ["under-100", "100-499", "500-4999", "5000-plus"],
  partnerType: [
    "broker",
    "insurer",
    "adviser",
    "family-office",
    "estate-professional",
    "residence-manager",
    "other",
  ],
  annualizedValueBand: [
    "under-5000",
    "5000-9999",
    "10000-24999",
    "25000-plus",
  ],
} as const satisfies Readonly<Record<string, readonly JsonPrimitive[]>>;

function valueMatchesPolicy(key: string, value: JsonPrimitive): boolean {
  if (key === "schemaVersion") return value === ANALYTICS_SCHEMA_VERSION;
  if (key === "appVersion") {
    return (
      typeof value === "string" &&
      /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/u.test(value)
    );
  }
  if (key === "currency") {
    return typeof value === "string" && /^[A-Z]{3}$/u.test(value);
  }
  if (key === "hierarchyDepth") {
    return (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 4
    );
  }
  if (
    key === "occurredOffline" ||
    key === "hasOriginal" ||
    key === "redacted"
  ) {
    return typeof value === "boolean";
  }
  const allowedValues =
    ENUM_VALUES[key as keyof typeof ENUM_VALUES] as
      | readonly JsonPrimitive[]
      | undefined;
  return allowedValues ? allowedValues.includes(value) : true;
}

export function validateAnalyticsEvent(
  event: AnalyticsEvent,
): readonly AnalyticsPrivacyError[] {
  const errors: AnalyticsPrivacyError[] = [];
  const allowed = ANALYTICS_EVENT_ALLOW_LIST[event.name] as
    | readonly string[]
    | undefined;
  if (!allowed) {
    errors.push(
      new AnalyticsPrivacyError(
        "UNKNOWN_EVENT",
        `Event "${String(event.name)}" is not in the analytics contract.`,
      ),
    );
    return errors;
  }

  for (const requiredKey of allowed) {
    if (!Object.hasOwn(event.payload, requiredKey)) {
      errors.push(
        new AnalyticsPrivacyError(
          "MISSING_PROPERTY",
          `Property "${requiredKey}" is required for "${event.name}".`,
        ),
      );
    }
  }

  if (event.payload.schemaVersion !== ANALYTICS_SCHEMA_VERSION) {
    errors.push(
      new AnalyticsPrivacyError(
        "INVALID_SCHEMA_VERSION",
        `Analytics schemaVersion must be ${ANALYTICS_SCHEMA_VERSION}.`,
      ),
    );
  }

  for (const [key, value] of Object.entries(event.payload)) {
    const normalized = normalizeKey(key);
    if (
      ANALYTICS_PROHIBITED_KEY_FRAGMENTS.some((fragment) =>
        normalized.includes(fragment),
      )
    ) {
      errors.push(
        new AnalyticsPrivacyError(
          "PROHIBITED_PROPERTY",
          `Analytics property "${key}" may contain private household data.`,
        ),
      );
      continue;
    }
    if (!allowed.includes(key)) {
      errors.push(
        new AnalyticsPrivacyError(
          "UNKNOWN_PROPERTY",
          `Property "${key}" is not allow-listed for "${event.name}".`,
        ),
      );
    }
    if (
      !isPrimitive(value) ||
      (typeof value === "number" && !Number.isFinite(value))
    ) {
      errors.push(
        new AnalyticsPrivacyError(
          "INVALID_VALUE",
          `Property "${key}" must be a finite JSON primitive.`,
        ),
      );
    } else if (!valueMatchesPolicy(key, value)) {
      errors.push(
        new AnalyticsPrivacyError(
          "INVALID_VALUE",
          `Property "${key}" is outside its privacy-safe value vocabulary.`,
        ),
      );
    }
  }
  return errors;
}

export function createPrivacySafeEvent<TName extends AnalyticsEventName>(
  name: TName,
  payload: AnalyticsPayload<TName>,
): AnalyticsEvent<TName> {
  const event = { name, payload } as AnalyticsEvent<TName>;
  const errors = validateAnalyticsEvent(event as AnalyticsEvent);
  if (errors.length > 0) {
    throw errors[0];
  }
  return event;
}

export class InMemoryAnalyticsAdapter implements AnalyticsPort {
  readonly events: AnalyticsEvent[] = [];

  async track(event: AnalyticsEvent): Promise<void> {
    const errors = validateAnalyticsEvent(event);
    if (errors.length > 0) throw errors[0];
    const immutableCopy = {
      name: event.name,
      payload: { ...event.payload },
    } as AnalyticsEvent;
    this.events.push(immutableCopy);
  }

  async flush(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  clear(): void {
    this.events.length = 0;
  }
}

export class NoopAnalyticsAdapter implements AnalyticsPort {
  async track(event: AnalyticsEvent): Promise<void> {
    const errors = validateAnalyticsEvent(event);
    if (errors.length > 0) throw errors[0];
  }

  async flush(): Promise<Result<void, ContractError>> {
    return { ok: true, value: undefined };
  }
}
