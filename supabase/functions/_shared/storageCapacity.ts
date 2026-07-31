export type StorageCapacityFailure = {
  readonly code: "QUOTA_EXCEEDED";
  readonly message: string;
  readonly status: 409;
  readonly retryable: false;
};

const databaseCapacityMarkers = [
  "HOUSEHOLD_STORAGE_LIMIT",
  "GLOBAL_STORAGE_LIMIT",
] as const;

const publicCapacityFailure: StorageCapacityFailure = {
  code: "QUOTA_EXCEEDED",
  message:
    "Cloud storage is at capacity. Your records stay on this device; review storage in Vault or contact Heldat support before trying again.",
  status: 409,
  retryable: false,
};

/**
 * Converts private database capacity sentinels into one stable public error.
 * No database marker, provider name, configured limit, or usage total crosses
 * the API boundary.
 */
export function classifyStorageCapacityFailure(
  error: { readonly message?: unknown } | null | undefined,
): StorageCapacityFailure | null {
  const message = typeof error?.message === "string" ? error.message : "";
  return databaseCapacityMarkers.some((marker) => message.includes(marker))
    ? publicCapacityFailure
    : null;
}
