import {
  PILOT_CLOUD_STORAGE_ALLOWANCE_BYTES,
  cloudStorageUsageTruth
} from "@/domain/vaultStorage";

describe("Vault cloud storage truth", () => {
  it("keeps usage unknown when verified cloud access has no server report", () => {
    expect(
      cloudStorageUsageTruth({
        verifiedCloudAccess: true,
        authoritativeUsage: null
      })
    ).toEqual({
      kind: "unknown",
      allowanceBytes: PILOT_CLOUD_STORAGE_ALLOWANCE_BYTES,
      usedBytes: null,
      measuredAt: null,
      reason: "not-reported"
    });
  });

  it("ignores a usage report outside a verified cloud household", () => {
    expect(
      cloudStorageUsageTruth({
        verifiedCloudAccess: false,
        authoritativeUsage: {
          source: "server-confirmed",
          usedBytes: 2 * 1024 * 1024,
          measuredAt: "2026-07-28T08:00:00.000Z"
        }
      })
    ).toMatchObject({
      kind: "unknown",
      usedBytes: null,
      reason: "not-connected"
    });
  });

  it("accepts only a valid server-confirmed byte measurement", () => {
    expect(
      cloudStorageUsageTruth({
        verifiedCloudAccess: true,
        authoritativeUsage: {
          source: "server-confirmed",
          usedBytes: 2 * 1024 * 1024,
          measuredAt: "2026-07-28T08:00:00.000Z"
        }
      })
    ).toEqual({
      kind: "authoritative",
      allowanceBytes: PILOT_CLOUD_STORAGE_ALLOWANCE_BYTES,
      usedBytes: 2 * 1024 * 1024,
      measuredAt: "2026-07-28T08:00:00.000Z"
    });
  });
});
