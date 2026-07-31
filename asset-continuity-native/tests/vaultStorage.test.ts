import {
  cloudStorageUsageTruth
} from "@/domain/vaultStorage";

describe("Vault cloud storage truth", () => {
  it("keeps usage unknown when verified cloud access has no server report", () => {
    expect(
      cloudStorageUsageTruth({
        verifiedHouseholdId: "household-a",
        authoritativeUsage: null
      })
    ).toEqual({
      kind: "unknown",
      allowanceBytes: null,
      usedBytes: null,
      measuredAt: null,
      reason: "not-reported"
    });
  });

  it("ignores a usage report outside a verified cloud household", () => {
    expect(
      cloudStorageUsageTruth({
        verifiedHouseholdId: null,
        authoritativeUsage: {
          householdId: "household-a",
          source: "server-confirmed",
          usedBytes: 2 * 1024 * 1024,
          allowanceBytes: 40 * 1024 * 1024,
          measuredAt: "2026-07-28T08:00:00.000Z"
        }
      })
    ).toMatchObject({
      kind: "unknown",
      usedBytes: null,
      reason: "not-connected"
    });
  });

  it("accepts a matching server-confirmed measurement and allowance", () => {
    expect(
      cloudStorageUsageTruth({
        verifiedHouseholdId: "household-a",
        authoritativeUsage: {
          householdId: "household-a",
          source: "server-confirmed",
          usedBytes: 48 * 1024 * 1024,
          allowanceBytes: 40 * 1024 * 1024,
          measuredAt: "2026-07-28T08:00:00.000Z"
        }
      })
    ).toEqual({
      kind: "authoritative",
      allowanceBytes: 40 * 1024 * 1024,
      usedBytes: 48 * 1024 * 1024,
      measuredAt: "2026-07-28T08:00:00.000Z"
    });
  });

  it("rejects a valid report for another household", () => {
    expect(
      cloudStorageUsageTruth({
        verifiedHouseholdId: "household-a",
        authoritativeUsage: {
          householdId: "household-b",
          source: "server-confirmed",
          usedBytes: 1,
          allowanceBytes: 2,
          measuredAt: "2026-07-28T08:00:00.000Z"
        }
      })
    ).toEqual({
      kind: "unknown",
      allowanceBytes: null,
      usedBytes: null,
      measuredAt: null,
      reason: "not-reported"
    });
  });

  it("keeps an invalid zero-byte allowance out of the authoritative state", () => {
    expect(
      cloudStorageUsageTruth({
        verifiedHouseholdId: "household-a",
        authoritativeUsage: {
          householdId: "household-a",
          source: "server-confirmed",
          usedBytes: 0,
          allowanceBytes: 0,
          measuredAt: "2026-07-28T08:00:00.000Z"
        }
      })
    ).toMatchObject({
      kind: "unknown",
      allowanceBytes: null,
      reason: "not-reported"
    });
  });

  it.each([
    [
      "usage above the contract maximum",
      {
        usedBytes: 1_099_511_627_777,
        allowanceBytes: 40 * 1024 * 1024,
        measuredAt: "2026-07-28T08:00:00.000Z"
      }
    ],
    [
      "an impossible calendar date",
      {
        usedBytes: 1,
        allowanceBytes: 2,
        measuredAt: "2026-02-30T08:00:00.000Z"
      }
    ],
    [
      "a measurement without an RFC 3339 timezone",
      {
        usedBytes: 1,
        allowanceBytes: 2,
        measuredAt: "2026-07-28T08:00:00"
      }
    ],
    [
      "a far-future measurement",
      {
        usedBytes: 1,
        allowanceBytes: 2,
        measuredAt: "2099-07-28T08:00:00.000Z"
      }
    ]
  ])("rejects %s", (_label, invalid) => {
    expect(
      cloudStorageUsageTruth({
        verifiedHouseholdId: "household-a",
        authoritativeUsage: {
          householdId: "household-a",
          source: "server-confirmed",
          ...invalid
        }
      })
    ).toMatchObject({
      kind: "unknown",
      allowanceBytes: null,
      reason: "not-reported"
    });
  });
});
