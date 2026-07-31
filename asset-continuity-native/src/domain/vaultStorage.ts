import type { HouseholdStorageUsageResponse } from "@alyr/contracts";

export type AuthoritativeCloudStorageUsage = HouseholdStorageUsageResponse;

export const MAX_HOUSEHOLD_STORAGE_BYTE_COUNT = 1_099_511_627_776;
export const MAX_HOUSEHOLD_STORAGE_MEASUREMENT_CLOCK_SKEW_MS =
  5 * 60 * 1_000;
const rfc3339Pattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):(\d{2}))$/u;

export function isHouseholdStorageByteCount(
  value: unknown,
  options: { readonly positive: boolean }
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (options.positive ? (value as number) > 0 : (value as number) >= 0) &&
    (value as number) <= MAX_HOUSEHOLD_STORAGE_BYTE_COUNT
  );
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * OpenAPI `date-time` is RFC 3339. Date.parse alone normalizes invalid dates
 * such as February 30, so validate the calendar and offset before trusting it.
 */
export function isHouseholdStorageMeasurementTime(
  value: unknown,
  nowMs = Date.now()
): value is string {
  if (typeof value !== "string") return false;
  const match = rfc3339Pattern.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fractionalSecond = match[7] ?? "";
  const offsetSign = match[8];
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (daysInMonth[month - 1] ?? 0) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return false;
  }

  const millisecond = Number(
    fractionalSecond.padEnd(3, "0").slice(0, 3) || "0"
  );
  const measuredAt = new Date(0);
  measuredAt.setUTCFullYear(year, month - 1, day);
  measuredAt.setUTCHours(hour, minute, second, millisecond);
  const offsetMilliseconds =
    (offsetHour * 60 + offsetMinute) * 60 * 1_000;
  const milliseconds =
    measuredAt.getTime() +
    (offsetSign === "+"
      ? -offsetMilliseconds
      : offsetSign === "-"
        ? offsetMilliseconds
        : 0);
  return (
    Number.isFinite(milliseconds) &&
    milliseconds <=
      nowMs + MAX_HOUSEHOLD_STORAGE_MEASUREMENT_CLOCK_SKEW_MS
  );
}

export type CloudStorageUsageTruth =
  | {
      readonly kind: "authoritative";
      readonly allowanceBytes: number;
      readonly usedBytes: number;
      readonly measuredAt: string;
    }
  | {
      readonly kind: "unknown";
      readonly allowanceBytes: null;
      readonly usedBytes: null;
      readonly measuredAt: null;
      readonly reason: "not-connected" | "not-reported";
    };

function isAuthoritativeUsage(
  value: AuthoritativeCloudStorageUsage | null | undefined
): value is AuthoritativeCloudStorageUsage {
  return Boolean(
    value &&
      value.source === "server-confirmed" &&
      typeof value.householdId === "string" &&
      value.householdId.length > 0 &&
      isHouseholdStorageByteCount(value.usedBytes, { positive: false }) &&
      isHouseholdStorageByteCount(value.allowanceBytes, {
        positive: true
      }) &&
      isHouseholdStorageMeasurementTime(value.measuredAt)
  );
}

/**
 * Cloud quota truth must originate at the service boundary. Local attachment
 * bytes, sync acknowledgements, and cached metadata are deliberately excluded:
 * the pilot allowance can also contain retained upload intents and exports.
 */
export function cloudStorageUsageTruth(input: {
  readonly verifiedHouseholdId: string | null;
  readonly authoritativeUsage?:
    | AuthoritativeCloudStorageUsage
    | null;
}): CloudStorageUsageTruth {
  if (!input.verifiedHouseholdId) {
    return {
      kind: "unknown",
      allowanceBytes: null,
      usedBytes: null,
      measuredAt: null,
      reason: "not-connected"
    };
  }

  if (
    !isAuthoritativeUsage(input.authoritativeUsage) ||
    input.authoritativeUsage.householdId !== input.verifiedHouseholdId
  ) {
    return {
      kind: "unknown",
      allowanceBytes: null,
      usedBytes: null,
      measuredAt: null,
      reason: "not-reported"
    };
  }

  return {
    kind: "authoritative",
    allowanceBytes: input.authoritativeUsage.allowanceBytes,
    usedBytes: input.authoritativeUsage.usedBytes,
    measuredAt: input.authoritativeUsage.measuredAt
  };
}
