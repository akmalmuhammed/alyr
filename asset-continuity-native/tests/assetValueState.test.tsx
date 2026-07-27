import {
  act,
  renderHook,
  waitFor
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type { NativeWorkspace } from "@/domain/model";
import { getPortfolioValueRecords } from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import {
  useWorkspace,
  WorkspaceProvider
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
  const result = await repository.commit({
    expectedRevision: 0,
    nextRevision: 1,
    snapshot: workspace,
    operations: []
  });
  expect(result.ok).toBe(true);
  return repository;
}

describe("WorkspaceProvider recorded asset value state", () => {
  it("commits every assertion to the workspace repository and exposes history", async () => {
    const workspace: NativeWorkspace = {
      ...createWorkspace("sample"),
      portfolioValueRecords: []
    };
    const target = workspace.assets[0]!;
    const repository = await seededRepository(workspace);
    const wrapper = ({ children }: PropsWithChildren) => (
      <WorkspaceProvider repositoryOverride={repository}>
        {children}
      </WorkspaceProvider>
    );
    const hook = await renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => {
      expect(hook.result.current?.loading).toBe(false);
      expect(hook.result.current?.workspace?.household.id).toBe(
        workspace.household.id
      );
    });

    await act(async () => {
      await hook.result.current!.recordAssetValue({
        assetId: target.id,
        amountMinor: 10_000,
        currency: "QAR",
        asOf: "2020-07-20"
      });
      await hook.result.current!.recordAssetValue({
        assetId: target.id,
        amountMinor: 12_500,
        currency: "QAR",
        asOf: "2020-07-27"
      });
    });

    expect(hook.result.current?.recordedAssetValues).toHaveLength(2);
    expect(hook.result.current?.pendingOperationCount).toBe(0);

    const loaded = await repository.load();
    expect(loaded.revision).toBe(3);
    const saved = loaded.snapshot as NativeWorkspace;
    expect(
      getPortfolioValueRecords(saved).map((record) => record.amountMinor)
    ).toEqual([10_000, 12_500]);
    expect(hook.result.current?.exportReadableSnapshot()).toContain(
      '"portfolioValueRecords"'
    );

    await hook.unmount();
  });

  it("queues a personal value assertion with the reviewed create contract", async () => {
    const personal = createWorkspace("personal");
    const sampleAsset = createWorkspace("sample").assets[0]!;
    const workspace: NativeWorkspace = {
      ...personal,
      assets: [
        {
          ...sampleAsset,
          householdId: personal.household.id
        }
      ],
      portfolioValueRecords: []
    };
    const repository = await seededRepository(workspace);
    const wrapper = ({ children }: PropsWithChildren) => (
      <WorkspaceProvider repositoryOverride={repository}>
        {children}
      </WorkspaceProvider>
    );
    const hook = await renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => {
      expect(hook.result.current?.loading).toBe(false);
    });

    await act(async () => {
      await hook.result.current!.recordAssetValue({
        assetId: sampleAsset.id,
        amountMinor: 275_000,
        currency: "QAR",
        asOf: "2020-07-27"
      });
    });

    const [operation] = await repository.listPendingOperations(10);
    expect(operation).toMatchObject({
      householdId: workspace.household.id,
      status: "on-device",
      command: {
        type: "value.create",
        aggregateId: expect.any(String),
        observedVersion: 0,
        payload: {
          assetId: sampleAsset.id,
          amountMinor: 275_000,
          currency: "QAR",
          asOf: "2020-07-27",
          source: "user-entered"
        }
      }
    });
    expect(operation?.operationId).toEqual(expect.any(String));
    expect(operation?.command.aggregateId).toEqual(expect.any(String));
    expect(hook.result.current?.pendingOperationCount).toBe(1);
    expect(hook.result.current?.recordedAssetValues[0]).toMatchObject({
      id: operation?.command.aggregateId,
      syncStatus: "on-device"
    });

    await hook.unmount();
  });

  it("queues owned-property values with an exact Place subject", async () => {
    const personal = createWorkspace("personal");
    const samplePlace = createWorkspace("sample").places[0]!;
    const workspace: NativeWorkspace = {
      ...personal,
      places: [
        {
          ...samplePlace,
          householdId: personal.household.id
        }
      ],
      portfolioValueRecords: []
    };
    const repository = await seededRepository(workspace);
    const wrapper = ({ children }: PropsWithChildren) => (
      <WorkspaceProvider repositoryOverride={repository}>
        {children}
      </WorkspaceProvider>
    );
    const hook = await renderHook(() => useWorkspace(), { wrapper });

    await waitFor(() => {
      expect(hook.result.current?.loading).toBe(false);
    });

    await act(async () => {
      await hook.result.current!.recordPortfolioValue({
        placeId: samplePlace.id,
        amountMinor: 675_000_000,
        currency: "QAR",
        asOf: "2020-07-27"
      });
    });

    const operations = await repository.listPendingOperations(10);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      command: {
        type: "value.create",
        observedVersion: 0,
        payload: {
          placeId: samplePlace.id,
          amountMinor: 675_000_000,
          currency: "QAR",
          asOf: "2020-07-27",
          source: "user-entered"
        }
      }
    });
    expect(operations[0]?.command.payload).not.toHaveProperty("assetId");
    expect(hook.result.current?.pendingOperationCount).toBe(1);
    expect(hook.result.current?.recordedPortfolioValues[0]).toMatchObject({
      subject: { kind: "place", placeId: samplePlace.id },
      placeId: samplePlace.id,
      syncStatus: "on-device"
    });

    await hook.unmount();
  });
});
