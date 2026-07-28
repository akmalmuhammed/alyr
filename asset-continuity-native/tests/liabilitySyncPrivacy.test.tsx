import {
  act,
  renderHook,
  waitFor
} from "@testing-library/react-native";
import type {
  ContractError,
  HouseholdRole,
  JsonObject,
  SyncChange,
  SyncConflict,
  SyncOperation
} from "@alyr/contracts";
import type { PropsWithChildren } from "react";

import { MemoryPreviewAttachmentStore } from "@/data/attachmentStore";
import {
  captureConflictContexts,
  conflictFieldLabel,
  conflictProvenanceValues,
  conflictRecordLabel,
  syncConflictsVisibleToRole
} from "@/data/conflictInbox";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import { createLocalOperation } from "@/data/sync";
import type { NativeWorkspace } from "@/domain/model";
import {
  getPortfolioValueRecords,
  portfolioValueSubject
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import {
  syncRuntimeVisibleToRole,
  useWorkspace,
  vaultScopeForWorkspaceAccess,
  WorkspaceProvider,
  type WorkspaceSyncRuntimeState,
  type WorkspaceVaultAccess
} from "@/state/WorkspaceProvider";

jest.mock("expo-crypto", () => {
  let sequence = 0;
  function digest64(value: string): string {
    let state = 2_166_136_261;
    let result = "";
    for (let round = 0; round < 8; round += 1) {
      for (let index = 0; index < value.length; index += 1) {
        state ^= value.charCodeAt(index) + round;
        state = Math.imul(state, 16_777_619);
      }
      result += (state >>> 0).toString(16).padStart(8, "0");
      state ^= 0x9e3779b9 + round;
    }
    return result;
  }
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { HEX: "hex" },
    digestStringAsync: jest.fn(
      async (_algorithm: string, value: string) => digest64(value)
    ),
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    getRandomBytes: (length: number) => new Uint8Array(length)
  };
});

const TIME = "2026-07-28T10:00:00.000Z";

function localOperation(
  workspace: NativeWorkspace,
  input: {
    readonly operationId: string;
    readonly type:
      | "asset.update"
      | "liability.update"
      | "value.create"
      | "value.update";
    readonly aggregateId: string;
    readonly payload: JsonObject;
  }
): SyncOperation {
  return createLocalOperation(workspace, {
    type: input.type,
    aggregateId: input.aggregateId,
    payload: input.payload,
    operationId: input.operationId,
    idempotencyKey: input.operationId,
    observedVersion: 1,
    occurredAt: TIME
  });
}

function durableConflict(
  workspace: NativeWorkspace,
  operation: SyncOperation,
  input: {
    readonly entityType: string;
    readonly conflictKind: SyncConflict["conflictKind"];
    readonly cloudPayload: JsonObject;
  }
): SyncConflict {
  const conflict: SyncConflict = {
    operationId: operation.operationId,
    entityId: operation.command.aggregateId!,
    conflictKind: input.conflictKind,
    serverVersion: 2,
    message: "Changed on another device."
  };
  const change: SyncChange = {
    sequence: 2,
    entityType: input.entityType,
    entityId: conflict.entityId,
    householdId: workspace.household.id,
    version: 2,
    tombstoned: false,
    body: {
      operationId: `cloud-${operation.operationId}`,
      command: operation.command.type,
      payload: input.cloudPayload,
      result: {}
    },
    changedAt: TIME
  };
  return captureConflictContexts(
    [conflict],
    [operation],
    [change],
    workspace.household.id,
    TIME
  )[0]!;
}

function privacyFixture() {
  const workspace = createWorkspace("sample");
  const asset = workspace.assets[0]!;
  const liability = workspace.liabilities![0]!;
  const liabilityValue = getPortfolioValueRecords(workspace).find(
    (record) => {
      const subject = portfolioValueSubject(record);
      return (
        subject?.kind === "liability" &&
        subject.liabilityId === liability.id
      );
    }
  )!;

  const pendingAsset = localOperation(workspace, {
    operationId: "pending-asset",
    type: "asset.update",
    aggregateId: asset.id,
    payload: { name: "Visible asset edit" }
  });
  const pendingLiability = localOperation(workspace, {
    operationId: "pending-liability",
    type: "liability.update",
    aggregateId: liability.id,
    payload: { name: "Private pending mortgage", kind: "mortgage" }
  });
  const pendingBalance = localOperation(workspace, {
    operationId: "pending-liability-balance",
    type: "value.create",
    aggregateId: "pending-liability-value",
    payload: {
      liabilityId: liability.id,
      amountMinor: 88_765_432,
      currency: "QAR",
      asOf: "2026-07-28",
      source: "user-entered"
    }
  });

  const assetConflictOperation = localOperation(workspace, {
    operationId: "conflict-asset",
    type: "asset.update",
    aggregateId: asset.id,
    payload: { name: "Visible local asset" }
  });
  const liabilityConflictOperation = localOperation(workspace, {
    operationId: "conflict-liability",
    type: "liability.update",
    aggregateId: liability.id,
    payload: {
      name: "Private local mortgage",
      kind: "mortgage"
    }
  });
  const balanceConflictOperation = localOperation(workspace, {
    operationId: "conflict-liability-balance",
    type: "value.update",
    aggregateId: liabilityValue.id,
    payload: {
      liabilityId: liability.id,
      amountMinor: 98_765_432,
      currency: "QAR",
      asOf: "2026-07-28",
      source: "user-entered"
    }
  });

  const conflicts = [
    durableConflict(workspace, assetConflictOperation, {
      entityType: "asset",
      conflictKind: "lifecycle",
      cloudPayload: { name: "Visible cloud asset" }
    }),
    durableConflict(workspace, liabilityConflictOperation, {
      entityType: "liability",
      conflictKind: "lifecycle",
      cloudPayload: {
        name: "Private cloud mortgage",
        kind: "mortgage"
      }
    }),
    durableConflict(workspace, balanceConflictOperation, {
      entityType: "value",
      conflictKind: "value",
      cloudPayload: {
        liabilityId: liability.id,
        amountMinor: 123_456_789,
        currency: "QAR",
        asOf: "2026-07-27",
        source: "user-entered"
      }
    })
  ];
  return {
    workspace,
    pendingOperations: [
      pendingAsset,
      pendingLiability,
      pendingBalance
    ],
    conflictOperations: [
      assetConflictOperation,
      liabilityConflictOperation,
      balanceConflictOperation
    ],
    conflicts
  };
}

async function seededRuntime(role: HouseholdRole) {
  const fixture = privacyFixture();
  const access: WorkspaceVaultAccess = {
    kind: "authenticated",
    accountId: `00000000-0000-4000-8000-0000000000${role === "owner" ? "01" : role === "editor" ? "02" : "03"}`,
    householdId: fixture.workspace.household.id,
    role
  };
  const scope = await vaultScopeForWorkspaceAccess(access);
  const repository = new MemoryWorkspaceRepository(scope);
  const attachmentStore = new MemoryPreviewAttachmentStore(scope);
  await repository.initialize();
  const first = await repository.commit({
    expectedRevision: 0,
    nextRevision: 1,
    snapshot: fixture.workspace,
    operations: fixture.pendingOperations
  });
  expect(first.ok).toBe(true);
  const synced = await repository.commitSync({
    expectedRevision: 1,
    nextRevision: 2,
    snapshot: fixture.workspace,
    cursor: {
      cursorVersion: 1,
      value: "2",
      issuedAt: TIME
    },
    operations: fixture.conflictOperations,
    acknowledgedOperationIds: [],
    conflicts: fixture.conflicts
  });
  expect(synced.ok).toBe(true);
  const wrapper = ({ children }: PropsWithChildren) => (
    <WorkspaceProvider
      attachmentStoreOverride={attachmentStore}
      repositoryOverride={repository}
      vaultAccess={access}
    >
      {children}
    </WorkspaceProvider>
  );
  const hook = await renderHook(() => useWorkspace(), { wrapper });
  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.storageReady).toBe(true);
  });
  return { fixture, hook, repository };
}

describe("owner-only sync activity projection", () => {
  it.each<HouseholdRole>(["editor", "viewer"])(
    "hides Liability counts, conflicts, names and amounts from a %s while retaining the durable inbox",
    async (role) => {
      const { fixture, hook, repository } =
        await seededRuntime(role);

      expect(hook.result.current.pendingOperationCount).toBe(1);
      expect(hook.result.current.sync.conflicts).toHaveLength(1);
      expect(
        hook.result.current.sync.conflicts[0]?.operationId
      ).toBe("conflict-asset");

      const visible = JSON.stringify({
        pendingOperationCount:
          hook.result.current.pendingOperationCount,
        sync: hook.result.current.sync,
        workspace: hook.result.current.workspace
      });
      for (const privateValue of [
        "Private pending mortgage",
        "Private local mortgage",
        "Private cloud mortgage",
        "West Bay Home mortgage",
        "88765432",
        "98765432",
        "123456789"
      ]) {
        expect(visible).not.toContain(privateValue);
      }

      let rejection: unknown;
      await act(async () => {
        try {
          await hook.result.current.resolveSyncConflict(
            "conflict-liability",
            "keep-cloud"
          );
        } catch (caught) {
          rejection = caught;
        }
      });
      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toBe(
        "This conflict is not available for the current household role."
      );

      // Projection never deletes or rewrites private durable state.
      expect(await repository.listPendingOperations(100)).toHaveLength(
        fixture.pendingOperations.length
      );
      expect(
        (await repository.loadSyncState()).conflicts
      ).toHaveLength(fixture.conflicts.length);
      await hook.unmount();
    }
  );

  it("keeps every pending operation and conflict visible to the owner", async () => {
    const { fixture, hook, repository } =
      await seededRuntime("owner");

    expect(hook.result.current.pendingOperationCount).toBe(
      fixture.pendingOperations.length
    );
    expect(hook.result.current.sync.conflicts).toHaveLength(
      fixture.conflicts.length
    );
    expect(JSON.stringify(hook.result.current.sync.conflicts)).toContain(
      "Private local mortgage"
    );
    expect(JSON.stringify(hook.result.current.sync.conflicts)).toContain(
      "123456789"
    );
    expect(
      (await repository.loadSyncState()).conflicts
    ).toHaveLength(fixture.conflicts.length);
    await hook.unmount();
  });

  it("removes a liability-only attention status and error for non-owners", () => {
    const { workspace, conflicts } = privacyFixture();
    const liabilityOnly = conflicts.slice(1);
    const privateError: ContractError = {
      errorVersion: 1,
      code: "CONFLICT_REQUIRES_REVIEW",
      message: "Private local mortgage 123456789 requires review.",
      retryable: false
    };
    const raw: WorkspaceSyncRuntimeState = {
      status: "needs-attention",
      conflicts: liabilityOnly,
      lastError: privateError,
      lastAttemptAt: TIME,
      lastSyncedAt: null
    };

    for (const role of ["editor", "viewer"] as const) {
      const visible = syncRuntimeVisibleToRole(
        raw,
        workspace,
        role,
        "idle"
      );
      expect(visible.status).toBe("idle");
      expect(visible.conflicts).toEqual([]);
      expect(visible.lastError).toBeNull();
      expect(JSON.stringify(visible)).not.toContain(
        "Private local mortgage"
      );
      expect(JSON.stringify(visible)).not.toContain("123456789");
    }
    expect(
      syncRuntimeVisibleToRole(raw, workspace, "owner", "idle")
    ).toBe(raw);
  });

  it("removes an unscoped private error when a visible Asset conflict remains", () => {
    const { workspace, conflicts } = privacyFixture();
    const privateError: ContractError = {
      errorVersion: 1,
      code: "CONFLICT_REQUIRES_REVIEW",
      message: "Private local mortgage 123456789 requires review.",
      retryable: false
    };
    const raw: WorkspaceSyncRuntimeState = {
      status: "needs-attention",
      conflicts,
      lastError: privateError,
      lastAttemptAt: TIME,
      lastSyncedAt: null
    };

    const visible = syncRuntimeVisibleToRole(
      raw,
      workspace,
      "editor",
      "idle"
    );

    expect(visible.status).toBe("needs-attention");
    expect(visible.conflicts.map((conflict) => conflict.operationId)).toEqual([
      "conflict-asset"
    ]);
    expect(visible.lastError).toBeNull();
    expect(JSON.stringify(visible)).not.toContain("Private local mortgage");
    expect(JSON.stringify(visible)).not.toContain("123456789");
  });

  it("keeps direct route helpers fail-closed for a redacted Liability conflict", () => {
    const { workspace, conflicts } = privacyFixture();
    const liabilityConflict = conflicts[1]!;
    const balanceConflict = conflicts[2]!;
    const visible = syncConflictsVisibleToRole(
      conflicts,
      workspace,
      false
    );
    expect(visible.map((conflict) => conflict.operationId)).toEqual([
      "conflict-asset"
    ]);
    expect(
      conflictRecordLabel(liabilityConflict, workspace, {
        canReadLiabilities: false
      })
    ).toBe("Private owner record");
    expect(
      conflictFieldLabel(liabilityConflict, {
        canReadLiabilities: false,
        workspace
      })
    ).toBe("Private record");
    expect(
      conflictProvenanceValues(balanceConflict, {
        canReadLiabilities: false,
        language: "en",
        visibility: "visible",
        workspace
      })
    ).toEqual({
      local: "Private owner record",
      cloud: "Private owner record",
      cloudVerified: false
    });

  });
});
