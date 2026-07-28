import {
  act,
  renderHook,
  waitFor
} from "@testing-library/react-native";
import type { HouseholdRole } from "@alyr/contracts";
import type { PropsWithChildren } from "react";

import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import { getLiabilityTombstones } from "@/domain/liabilities";
import type { NativeWorkspace } from "@/domain/model";
import {
  getPortfolioValueRecords,
  portfolioValueSubject
} from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import {
  useWorkspace,
  workspaceVisibleToRole,
  WorkspaceProvider,
  type WorkspaceVaultAccess
} from "@/state/WorkspaceProvider";

jest.mock("expo-crypto", () => {
  let sequence = 0;
  return {
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    getRandomBytes: (length: number) => new Uint8Array(length)
  };
});

async function seededRepository(workspace: NativeWorkspace) {
  const repository = new MemoryWorkspaceRepository();
  await repository.initialize();
  const committed = await repository.commit({
    expectedRevision: 0,
    nextRevision: 1,
    snapshot: workspace,
    operations: []
  });
  expect(committed.ok).toBe(true);
  return repository;
}

function wrapperFor(
  repository: MemoryWorkspaceRepository,
  vaultAccess?: WorkspaceVaultAccess
) {
  return ({ children }: PropsWithChildren) => (
    <WorkspaceProvider
      repositoryOverride={repository}
      {...(vaultAccess ? { vaultAccess } : {})}
    >
      {children}
    </WorkspaceProvider>
  );
}

describe("WorkspaceProvider Liability state", () => {
  it("projects owner-only Liability data out of editor and viewer surfaces", () => {
    const workspace = createWorkspace("sample");
    const ownerView = workspaceVisibleToRole(workspace, "owner");
    expect(ownerView).toBe(workspace);

    for (const role of ["editor", "viewer"] as const) {
      const visible = workspaceVisibleToRole(workspace, role);
      expect(visible.liabilities).toEqual([]);
      expect(visible.liabilityTombstones).toEqual([]);
      expect(visible.liabilityReview).toBeUndefined();
      expect(
        getPortfolioValueRecords(visible).some(
          (record) =>
            portfolioValueSubject(record)?.kind === "liability"
        )
      ).toBe(false);
      const serialized = JSON.stringify(visible);
      expect(serialized).not.toContain("West Bay Home mortgage");
      expect(serialized).not.toContain("Travel card balance");
      expect(serialized).not.toContain("liability-card");
    }
  });

  it("atomically queues a Liability before its first dated balance", async () => {
    const workspace = createWorkspace(
      "personal",
      "2026-07-28T08:00:00.000Z"
    );
    const repository = await seededRepository(workspace);
    const hook = await renderHook(() => useWorkspace(), {
      wrapper: wrapperFor(repository)
    });

    await waitFor(() => {
      expect(hook.result.current?.loading).toBe(false);
    });

    await act(async () => {
      await hook.result.current!.createLiability({
        name: "West Bay home finance",
        kind: "mortgage",
        amountMinor: 215_000_000,
        currency: "QAR",
        asOf: "2026-07-28"
      });
    });

    const operations = await repository.listPendingOperations(10);
    expect(operations).toHaveLength(2);
    expect(operations.map((operation) => operation.command.type)).toEqual([
      "liability.create",
      "value.create"
    ]);
    const liabilityId = operations[0]!.command.aggregateId;
    expect(operations[0]).toMatchObject({
      command: {
        observedVersion: 0,
        payload: {
          name: "West Bay home finance",
          kind: "mortgage"
        }
      }
    });
    expect(operations[1]).toMatchObject({
      command: {
        observedVersion: 0,
        payload: {
          liabilityId,
          amountMinor: 215_000_000,
          currency: "QAR",
          asOf: "2026-07-28",
          source: "user-entered"
        }
      }
    });

    const loaded = await repository.load();
    expect(loaded.revision).toBe(2);
    const saved = loaded.snapshot as NativeWorkspace;
    expect(saved.liabilities).toEqual([
      expect.objectContaining({
        id: liabilityId,
        version: 1,
        lifecycleStatus: "active"
      })
    ]);
    expect(getPortfolioValueRecords(saved)).toEqual([
      expect.objectContaining({
        amountMinor: 215_000_000,
        subject: { kind: "liability", liabilityId }
      })
    ]);
    expect(hook.result.current?.pendingOperationCount).toBe(2);

    await act(async () => {
      await hook.result.current!.deleteLiability(liabilityId!);
    });
    const afterDelete = await repository.listPendingOperations(10);
    expect(
      afterDelete.map((operation) => operation.command.type)
    ).toEqual([
      "liability.create",
      "value.create",
      "liability.delete"
    ]);
    expect(afterDelete[2]).toMatchObject({
      command: {
        aggregateId: liabilityId,
        observedVersion: 1
      }
    });
    const deletedSnapshot = (await repository.load())
      .snapshot as NativeWorkspace;
    expect(deletedSnapshot.liabilities).toEqual([]);
    expect(getLiabilityTombstones(deletedSnapshot)).toEqual([
      expect.objectContaining({
        id: liabilityId,
        version: 2,
        syncStatus: "queued"
      })
    ]);

    await hook.unmount();
  });

  it("keeps sample Liability mutations local and records deletion tombstones", async () => {
    const workspace: NativeWorkspace = {
      ...createWorkspace("sample"),
      liabilities: [],
      liabilityTombstones: [],
      portfolioValueRecords: []
    };
    const repository = await seededRepository(workspace);
    const hook = await renderHook(() => useWorkspace(), {
      wrapper: wrapperFor(repository)
    });

    await waitFor(() => {
      expect(hook.result.current?.loading).toBe(false);
    });

    let liabilityId = "";
    await act(async () => {
      const created = await hook.result.current!.createLiability({
        name: "Card balance",
        kind: "credit-card",
        amountMinor: 45_000,
        currency: "QAR",
        asOf: "2026-07-28"
      });
      liabilityId = created.id;
    });
    expect(await repository.listPendingOperations(10)).toEqual([]);

    await act(async () => {
      await hook.result.current!.deleteLiability(liabilityId);
    });

    const loaded = await repository.load();
    const saved = loaded.snapshot as NativeWorkspace;
    expect(saved.liabilities).toEqual([]);
    expect(
      getPortfolioValueRecords(saved).filter(
        (record) =>
          portfolioValueSubject(record)?.kind === "liability"
      )
    ).toEqual([]);
    expect(getLiabilityTombstones(saved)).toEqual([
      expect.objectContaining({
        id: liabilityId,
        version: 2,
        syncStatus: "on-device"
      })
    ]);
    expect(await repository.listPendingOperations(10)).toEqual([]);

    await hook.unmount();
  });

  it.each<HouseholdRole>(["editor", "viewer"])(
    "denies Liability writes to a %s before changing local state",
    async (role) => {
    const workspace = createWorkspace(
      "personal",
      "2026-07-28T08:00:00.000Z"
    );
    const repository = await seededRepository(workspace);
    const vaultAccess: WorkspaceVaultAccess = {
      kind: "authenticated",
      accountId: "00000000-0000-4000-8000-000000000901",
      householdId: workspace.household.id,
      role
    };
    const hook = await renderHook(() => useWorkspace(), {
      wrapper: wrapperFor(repository, vaultAccess)
    });

    await waitFor(() => {
      expect(hook.result.current?.loading).toBe(false);
    });

    await act(async () => {
      await expect(
        hook.result.current!.createLiability({
          name: "Private debt",
          kind: "other",
          amountMinor: 10_000,
          currency: "QAR",
          asOf: "2026-07-28"
        })
      ).rejects.toThrow();
    });

    const loaded = await repository.load();
    expect((loaded.snapshot as NativeWorkspace).liabilities).toEqual([]);
    expect(await repository.listPendingOperations(10)).toEqual([]);

    await hook.unmount();
    }
  );
});
