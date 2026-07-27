import type { NativeWorkspaceRepository } from "@/data/repository";
import { createWorkspace } from "@/domain/sample";
import {
  createSignedRecoveryWorkspaceRestoreAdapter
} from "@/recovery/signedRuntime";
import { RecoveryKitError } from "@/recovery/types";

const createdAt = "2026-07-27T12:00:00.000Z";

function workspace(householdId = "household-recovery") {
  return createWorkspace("personal", createdAt, {
    householdId,
    ownerMemberId: "member-owner",
    deviceId: "device-old"
  });
}

function fixture(options?: {
  readonly pending?: boolean;
  readonly conflicts?: boolean;
}) {
  const active = workspace();
  let revision = 7;
  const load = jest.fn(async () => ({
    revision,
    snapshot: active
  }));
  const commitSync = jest.fn(async (commit) => ({
    ok: true as const,
    value: { revision: commit.nextRevision }
  }));
  const repository = {
    kind: "sqlite-sqlcipher",
    durable: true,
    encryptedAtRest: true,
    scopeId: "scope-recovery",
    load,
    commit: jest.fn(),
    listPendingOperations: jest.fn(async () =>
      options?.pending ? ([{}] as never[]) : []
    ),
    acknowledgeOperation: jest.fn(),
    loadSyncState: jest.fn(async () => ({
      cursor: {
        cursorVersion: 1 as const,
        value: "cursor-7",
        issuedAt: createdAt
      },
      conflicts: options?.conflicts ? ([{}] as never[]) : []
    })),
    commitSync,
    close: jest.fn(),
    lock: jest.fn(),
    purge: jest.fn()
  } as unknown as NativeWorkspaceRepository;
  const onRestored = jest.fn();
  const adapter = createSignedRecoveryWorkspaceRestoreAdapter({
    repository,
    currentWorkspace: () => active,
    currentHouseholdId: () => active.household.id,
    currentDeviceId: () => "device-current",
    onRestored
  });
  return {
    active,
    adapter,
    commitSync,
    load,
    onRestored,
    setRevision(value: number) {
      revision = value;
    }
  };
}

const metadata = {
  kitId: "0123456789abcdef0123456789abcdef",
  createdAt,
  workspaceSchemaVersion: workspace().schemaVersion,
  attachmentCount: 0
} as const;

describe("signed Recovery Kit atomic workspace replacement", () => {
  it.each([
    ["pending outbox", { pending: true }],
    ["unresolved conflict", { conflicts: true }]
  ] as const)("preserves the vault when it has a %s", async (_label, flags) => {
    const { adapter, commitSync } = fixture(flags);

    await expect(adapter.preflight(metadata)).rejects.toMatchObject<
      Partial<RecoveryKitError>
    >({ code: "RESTORE_REJECTED" });
    expect(commitSync).not.toHaveBeenCalled();
  });

  it("rejects a different household after authenticated preflight", async () => {
    const { adapter, commitSync } = fixture();
    await adapter.preflight(metadata);

    await expect(
      adapter.replaceWorkspaceAtomically(
        workspace("other-household"),
        metadata.workspaceSchemaVersion
      )
    ).rejects.toMatchObject<Partial<RecoveryKitError>>({
      code: "RESTORE_REJECTED"
    });
    expect(commitSync).not.toHaveBeenCalled();
  });

  it("rejects a revision race before replacement", async () => {
    const { adapter, commitSync, setRevision } = fixture();
    await adapter.preflight(metadata);
    setRevision(8);

    await expect(
      adapter.replaceWorkspaceAtomically(
        workspace(),
        metadata.workspaceSchemaVersion
      )
    ).rejects.toMatchObject<Partial<RecoveryKitError>>({
      code: "RESTORE_REJECTED"
    });
    expect(commitSync).not.toHaveBeenCalled();
  });

  it("atomically replaces only the verified household and rebinds this device", async () => {
    const { adapter, commitSync, onRestored } = fixture();
    const recovered = workspace();
    await adapter.preflight(metadata);
    await adapter.replaceWorkspaceAtomically(
      recovered,
      metadata.workspaceSchemaVersion
    );

    expect(commitSync).toHaveBeenCalledTimes(1);
    const commit = commitSync.mock.calls[0]![0];
    expect(commit).toMatchObject({
      expectedRevision: 7,
      nextRevision: 8,
      acknowledgedOperationIds: [],
      conflicts: [],
      cursor: {
        value: null,
        issuedAt: null
      },
      snapshot: {
        deviceId: "device-current",
        syncStatus: "local-only",
        lastSyncedAt: null,
        household: {
          id: "household-recovery"
        }
      }
    });
    expect(onRestored).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "device-current",
        syncStatus: "local-only"
      }),
      8
    );
  });
});
