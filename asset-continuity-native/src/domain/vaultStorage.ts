export const PILOT_CLOUD_STORAGE_ALLOWANCE_BYTES =
  40 * 1024 * 1024;

export interface AuthoritativeCloudStorageUsage {
  readonly source: "server-confirmed";
  readonly usedBytes: number;
  readonly measuredAt: string;
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
      readonly allowanceBytes: number;
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
      Number.isSafeInteger(value.usedBytes) &&
      value.usedBytes >= 0 &&
      !Number.isNaN(Date.parse(value.measuredAt))
  );
}

/**
 * Cloud quota truth must originate at the service boundary. Local attachment
 * bytes, sync acknowledgements, and cached metadata are deliberately excluded:
 * the pilot allowance can also contain retained upload intents and exports.
 */
export function cloudStorageUsageTruth(input: {
  readonly verifiedCloudAccess: boolean;
  readonly authoritativeUsage?:
    | AuthoritativeCloudStorageUsage
    | null;
}): CloudStorageUsageTruth {
  if (!input.verifiedCloudAccess) {
    return {
      kind: "unknown",
      allowanceBytes: PILOT_CLOUD_STORAGE_ALLOWANCE_BYTES,
      usedBytes: null,
      measuredAt: null,
      reason: "not-connected"
    };
  }

  if (!isAuthoritativeUsage(input.authoritativeUsage)) {
    return {
      kind: "unknown",
      allowanceBytes: PILOT_CLOUD_STORAGE_ALLOWANCE_BYTES,
      usedBytes: null,
      measuredAt: null,
      reason: "not-reported"
    };
  }

  return {
    kind: "authoritative",
    allowanceBytes: PILOT_CLOUD_STORAGE_ALLOWANCE_BYTES,
    usedBytes: input.authoritativeUsage.usedBytes,
    measuredAt: input.authoritativeUsage.measuredAt
  };
}
